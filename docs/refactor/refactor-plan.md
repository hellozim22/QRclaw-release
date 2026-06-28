# QRClaw 架构重构计划

> **版本**: v1.0 (draft)
> **日期**: 2026-04-19
> **作者**: zeze + AI
> **状态**: ⚠️ **长期蓝图（archived）** — 经两位 subagent 评审（见 `review/`），本文档被判定"为 10 人团队 + 100K LOC 项目设计，不适合当前 22K LOC + 1-2 人 + MVP 0.5.0 阶段"。
> **当前 active 计划**: [`refactor-plan-phase1.md`](./refactor-plan-phase1.md)（路线 A：最小可行重构，~1.5 周）
> **本文档定位**: 保留作为未来参考蓝图。当出现下列触发条件（任 2 条）时重新启用：第二位全职开发加入 / 单模块 LOC > 40K / 月度 type drift bug ≥ 2 / 外部 API 消费者 / 产品方向稳定且过 PMF
> **对应仓库**: `~/qrclaw`
> **原始目标**: 在不拆分仓库的前提下，通过「契约驱动 + 业务域模块化 + AI-native 规范治理」让 qrclaw 支持多 agent 并行开发，并为后续规模化奠定架构基础。

---

## 0. 阅读指引

- 本文档是 **主计划**，包含战略决策、目标架构、6 阶段实施路线。
- 每个阶段有对应的 **Trae 可执行任务卡** 位于 `docs/refactor/tasks/T{N}-*.md`。
- 任务卡按顺序执行，Phase 内部可能有并行子任务。
- 契约层（Phase 1 产物 `contracts/`）是本次重构的核心资产，所有后续阶段都围绕它展开。

---

## 1. 战略决策

### 1.1 核心判断：**不拆分前后端仓库**

经过架构评估（2026-04-19），qrclaw 当前**不应拆分仓库**，理由如下：

| 维度 | 数据 | 结论 |
|---|---|---|
| 代码体量 | web 14.7K + gateway 4.1K + supabase 2.8K ≈ 22K 行 | 远低于 50K 的分仓临界点 |
| 团队规模 | 1-2 人 | 分仓管理成本 > 收益 |
| 产品阶段 | MVP 0.5.0，每周迭代 | 迭代速度 > 治理严谨 |
| 物理隔离现状 | 已有 `web/` `gateway/` `supabase/` 三独立 package + 独立构建/部署 | 分仓的核心收益已基本拿到 |
| 外部消费者 | 无（gateway 只服务自家 web） | 不需要独立版本管理 |

**当以下条件满足任意 2 条时，应重新评估是否拆仓：**
1. 单模块代码 > 50K 行
2. 前后端固定分工且各有 ≥ 2 人
3. 发布节奏明显脱节（前端日更、后端周更）
4. 出现外部 API 消费者
5. 前后端互相阻塞严重

### 1.2 替代方案：**契约驱动 + 单仓模块化**

不拆仓但要解决分仓能解决的核心问题——

| 分仓能解决的问题 | 本方案对应解法 |
|---|---|
| 类型漂移 | Phase 1：`contracts/` 作为单一真相源 |
| 前后端边界不清 | Phase 2：`domain-index` + 分层红线 `.mdc` 规则 |
| 多人/多 agent 冲突 | Phase 3+4：按业务域聚合 + ESLint boundaries 规则 |
| 独立发布 | Phase 5：按路径触发的 CI/CD 流水线 |
| 可独立审查的契约 | Phase 5：`contracts-approved` PR 标签门禁 |

**预期效果**：用 10% 的拆仓成本拿到 90% 的拆仓收益，且保留单仓迭代速度。

---

## 2. 现状诊断

> 本章结论待 **Phase 0 现状审计** 正式确认，以下为初步扫描结果。

### 2.1 项目体量

```
web/src/            14,736 LOC / 94 files  (TS + TSX, Next.js 16 App Router)
gateway/src/         4,127 LOC / 32 files  (TS, Express 5 + ws)
supabase/functions/  1,769 LOC / 12 files  (TS, Deno Edge Functions)
supabase/migrations/ 1,042 LOC / 10 files  (SQL)
─────────────────────────────────
合计                ~21,674 LOC
```

### 2.2 架构拓扑

```
┌───────────────────┐     HTTPS / WSS      ┌─────────────────┐
│  web (Next.js)    │ ───────────────────▶ │ gateway (Node)  │
│  Vercel           │                      │ Express + ws    │
└─────────┬─────────┘                      └────────┬────────┘
          │                                         │
          │  Supabase JS SDK                        │  Supabase JS SDK
          │  (直接读 RLS 保护的表)                  │  (server-side service role)
          ▼                                         ▼
     ┌────────────────────────────────────────────────────┐
     │           Supabase PostgreSQL + RLS                │
     │           + 8 个 Edge Functions (Deno)             │
     └────────────────────────────────────────────────────┘
```

**三段式物理隔离**已存在，但**逻辑耦合**通过散落的类型定义藕断丝连。

### 2.3 已识别的主要架构债

| 编号 | 架构债 | 影响 | 阶段 |
|---|---|---|---|
| D1 | **类型漂移** — `QRCode` / `Message` / `WebSocket 协议` 在 web / gateway / supabase 三端各自定义 | 改一个字段要改 3-5 处，漏改即运行时 bug | P0 / Phase 1 |
| D2 | **缺少业务域索引** — agent 无法根据需求描述快速定位代码 | 产品需求转工程任务耗时长 | P0 / Phase 2 |
| D3 | **目录按技术层切分** — `components/` `hooks/` `lib/` 跨业务域混杂 | 多 agent 并行必然冲突 | P1 / Phase 3+4 |
| D4 | **编码规范未文档化** — 规范散落在 `CLAUDE.md` 和各 skill 中 | 新 agent/新人上手成本高，易风格漂移 | P0 / Phase 2 |
| D5 | **CI/CD 缺失质量门禁** — 未见 `.github/workflows/` 或仅部分 | 重构期间无保护，容易改挂 | P1 / Phase 5 |
| D6 | **Next.js Server/Client Component 边界无强约束** | App Router 踩坑（"use client" 泄漏到服务端组件） | P1 / Phase 2 |
| D7 | **WebSocket 协议易漂移** — 两端 Zod schema 各自维护 | 弱网/重连场景易出"消息发出去对方不认"的疑难 bug | P0 / Phase 1 |

---

## 3. 目标架构

### 3.1 目标目录结构

```
qrclaw/
├── contracts/                        ⭐ 新增 — 契约层 SSOT
│   ├── package.json                  (name: "@qrclaw/contracts")
│   ├── tsconfig.json
│   └── src/
│       ├── database/
│       │   └── database.types.ts     (Supabase gen 生成)
│       ├── domain/
│       │   ├── qrcode.ts
│       │   ├── agent.ts
│       │   ├── conversation.ts
│       │   ├── message.ts
│       │   └── user.ts
│       ├── http/                     (HTTP API request/response 协议)
│       │   ├── create-qrcode.ts
│       │   ├── messages.ts
│       │   └── subscribe.ts
│       ├── ws/                       (WebSocket 消息协议 ⭐ 最关键)
│       │   ├── protocol.ts
│       │   └── message-types.ts
│       ├── constants/
│       │   ├── error-codes.ts
│       │   └── limits.ts
│       └── index.ts
│
├── web/
│   └── src/
│       ├── features/                 ⭐ 新增 — 按业务域聚合
│       │   ├── qrcode/
│       │   │   ├── api/              (调 gateway / supabase 的封装)
│       │   │   ├── components/
│       │   │   ├── hooks/
│       │   │   ├── adapters/         (数据转换)
│       │   │   └── index.ts          (公开 API，跨域唯一入口)
│       │   ├── agent/
│       │   ├── chat/
│       │   ├── claim/
│       │   ├── subscription/
│       │   └── auth/
│       ├── components/
│       │   ├── ui/                   (保留：通用组件)
│       │   ├── landing/              (保留：营销页)
│       │   ├── docs/                 (保留：文档页)
│       │   ├── legal/                (保留：法律页)
│       │   └── pricing/              (保留：定价页)
│       ├── lib/
│       │   └── utils/                (保留：通用工具)
│       └── app/                      (Next.js 路由，保留，仅做组装)
│
├── gateway/
│   └── src/
│       ├── domains/                  ⭐ 新增 — 按业务域分层
│       │   ├── qrcode/
│       │   ├── messaging/
│       │   └── subscription/
│       ├── shared/                   (中间件、Redis、crypto、env)
│       ├── ws/                       (WebSocket 框架层，业务抽到 domains)
│       └── server.ts
│
├── supabase/                         (保持结构，迁移类型定义)
│   ├── migrations/
│   └── functions/                    (引用 contracts 替代本地类型)
│
├── .cursor/                          ⭐ 新增 AI 规范资产
│   ├── skills/
│   │   └── qrclaw-conventions/
│   │       ├── SKILL.md
│   │       ├── reference.md
│   │       ├── examples.md
│   │       └── domain-index.md
│   └── rules/
│       ├── qrclaw-conventions.mdc    (alwaysApply: true)
│       ├── layer-boundaries.mdc      (分层调用红线)
│       └── nextjs-boundaries.mdc     (Server/Client Component 边界)
│
├── docs/
│   ├── refactor/                     (本重构文档)
│   └── conventions/
│       ├── naming-patterns.md
│       ├── coding-patterns.md
│       └── audit-report.md
│
├── .github/
│   └── workflows/
│       ├── quality-gate.yml          (PR 质量门禁)
│       ├── deploy-gateway.yml
│       └── deploy-supabase.yml
│
├── scripts/
│   └── conventions-scanner/          (可选 Phase 6)
│
└── tests/                            (保持现状)
```

### 3.2 分层红线（不可违反）

```
  ┌─────────────────────────────────────────────────────┐
  │                Next.js app/ (路由)                  │
  │                  ↓ 只消费 features 公开 API         │
  │           features/{domain}/index.ts                │
  │      ┌──────┴──────┴──────┴──────┐                  │
  │      │    api / hooks / components / adapters       │
  │      └──────┬──────┬──────┬──────┘                  │
  │             ↓             ↓                         │
  │         contracts/   web/lib/utils                  │
  └─────────────────────────────────────────────────────┘
                    ↓ HTTP / WS
  ┌─────────────────────────────────────────────────────┐
  │              gateway server.ts                      │
  │                    ↓                                │
  │            domains/{domain}/routes                  │
  │                    ↓                                │
  │            domains/{domain}/service                 │
  │                    ↓                                │
  │            domains/{domain}/db                      │
  │                    ↓                                │
  │            contracts/ + shared/                     │
  └─────────────────────────────────────────────────────┘
                    ↓ SQL / RLS
  ┌─────────────────────────────────────────────────────┐
  │    supabase/migrations + functions                  │
  │       functions 引用 contracts 类型                 │
  └─────────────────────────────────────────────────────┘
```

**红线规则：**

1. **契约层只读** — `contracts/` 不允许任何业务方手改，变更需加 `contracts-approved` PR 标签（CI 强制检查）。
2. **禁止跨 feature/domain 直接 import** — `features/chat/` 要用 `features/qrcode/` 的能力，必须走 `features/qrcode/index.ts` 公开 API（ESLint boundaries 强制）。
3. **Next.js app/ 不含业务逻辑** — app/ 只做路由组装和 metadata，业务逻辑全在 features/。
4. **components/ui/ 不含业务依赖** — UI 组件层禁止 import features/*。
5. **web 禁止直接 import gateway，反之亦然** — 唯一通讯通道是 HTTP/WS + contracts。

### 3.3 多 Agent 并行模型

```
┌──────────────────────────────────────────────────────┐
│                  Human Lead / Architect              │
│                         ↕                            │
│                  contracts/ (可写)                   │
│      其他 agent 只能以 @contracts/* 方式 import      │
└──────────────────────────────────────────────────────┘
         ↓              ↓              ↓
    ┌─────────┐   ┌─────────┐   ┌─────────────┐
    │Frontend │   │Gateway  │   │ Backend     │
    │ Agent   │   │ Agent   │   │ (Supabase)  │
    │ (web/)  │   │(gateway)│   │ Agent       │
    │         │   │         │   │ (supabase/) │
    └─────────┘   └─────────┘   └─────────────┘

共享只读：contracts/, design/, requirements/, docs/
```

**并行规则：**
- 同一 Phase 内，三个 agent 可按目录并行工作。
- Phase 切换时由 Human 审批（合并/验收）。
- 任何对 `contracts/` 的修改必须由 Human 显式审批（PR 标签机制）。
- 通过 ESLint boundaries + CI 质量门禁保证并行不越界。

---

## 4. 核心设计原则

### 4.1 契约为王（Contracts First）

- 任何跨越 web ↔ gateway ↔ supabase 边界的数据结构，都必须定义在 `contracts/`。
- 契约使用 **Zod schema + `z.infer` 推导类型**，做到"类型和运行时校验同源"。
- 禁止在业务代码里重新定义跨边界类型（例外：纯本地派生类型可以）。

### 4.2 单向依赖

```
app/ → features/ → contracts/ ← gateway/domains/ ← supabase/functions/
              ↓                    ↓
           web/lib/utils       gateway/shared
```

- 同级业务域之间不互相 import 实现（只能 import 另一个域的公开 index.ts）。
- Utils/Shared 层禁止反向依赖业务层。

### 4.3 渐进式迁移（Incremental Migration）

- 每个 Phase 独立可交付，**中断在任何 Phase 之间都不会使项目处于坏状态**。
- 重构与新需求可并行（Phase 3 按域迁移，每次只改一个域）。
- 保留兼容层/重导出别名过渡（例如 `web/src/hooks/useQRCodes.ts` 可以暂时 re-export `features/qrcode/hooks`）。

### 4.4 AI-native 规范治理

- 规范不是文档，是 **agent 可执行的 skill + 可验证的 rule**。
- `.cursor/skills/qrclaw-conventions/` 提供渐进披露（SKILL.md → reference → source）。
- `.cursor/rules/*.mdc` 常驻注入 agent 上下文，alwaysApply 级别的红线。
- 扫描器脚本（Phase 6）持续校验代码实际与规范一致。

---

## 5. 分阶段实施计划

### 阶段总览

| Phase | 标题 | 工期 | 优先级 | 能否被 Trae 独立执行 | 风险 |
|---|---|---|---|---|---|
| 0 | 现状审计 | 1-2 天 | 🔴 必做 | ✅ 全自动（只读扫描） | 极低 |
| 1 | 契约层 | 3-5 天 | 🔴 P0 | ✅ 大部分可自动，契约定义需人工决策 | 低 |
| 2 | 规范 skill | 3-5 天 | 🔴 P0 | ✅ 全自动（基于 Phase 0 + 1 产出） | 极低 |
| 3 | web 按域重组 | 1-2 周（渐进） | 🟡 P1 | ⚠️ 每域一个任务，需人工验收 | 中 |
| 4 | gateway 按域重组 | 3-5 天 | 🟡 P1 | ✅ 模式清晰可自动 | 低 |
| 5 | CI/CD 建设 | 2-3 天 | 🟡 P1 | ⚠️ 需人类配置 Secrets | 极低 |
| 6 | 扫描器自动化 | 持续 | 🟢 P2 | ✅ 可自动 | — |

### 推荐执行节奏（单人 + AI Agent）

| 周 | 任务 |
|---|---|
| Week 1 | Phase 0 + Phase 1（契约层是一切基础） |
| Week 2 | Phase 2 + Phase 5（规范 + CI，让后续重构有保护） |
| Week 3–4 | Phase 3（web 按域重组，每次一个域，边做边验收） |
| Week 5 | Phase 4（gateway 重组，套用 Phase 3 经验） |
| Week 6+ | Phase 6 + 回归正常迭代 |

> 💡 **Phase 5 提前到 Week 2 的原因**：有 CI 质量门禁保护后再做 Phase 3/4 的大重构才安全。

---

### 📦 Phase 0 — 现状审计

**目标**：在动手前对项目现状有量化认知，识别所有架构债。

**任务清单**：
- [ ] 0.1 扫描 `web/src/` 推断业务域（从 `app/` 路由 + `components/` 分组 + `hooks/` 命名）
- [ ] 0.2 扫描 `gateway/src/routes/` 和 `ws/` 列出所有 HTTP/WS 端点
- [ ] 0.3 扫描 `supabase/migrations/` + `functions/` 列出所有实体和 Edge Function
- [ ] 0.4 grep 所有类型定义（`type `、`interface `、`enum `），识别散落处
- [ ] 0.5 grep 硬编码字符串（状态枚举、事件名、错误码）
- [ ] 0.6 生成 `docs/conventions/audit-report.md`

**交付物**：
```
docs/conventions/audit-report.md
  ├─ § 项目体量（精确 LOC）
  ├─ § 业务域清单（候选列表 + 依据）
  ├─ § HTTP / WebSocket 端点清单
  ├─ § 数据库实体清单
  ├─ § 类型漂移风险点（带文件:行号证据）
  ├─ § 硬编码字符串清单
  └─ § 优先治理项（带优先级）
```

**验收标准**：
- ✅ 报告存在且内容完整
- ✅ 所有断言都带文件:行号证据
- ✅ 业务域清单经人工确认（Human Checkpoint）

**对应任务卡**：`docs/refactor/tasks/T0-audit.md`

---

### 📦 Phase 1 — 契约层

**目标**：建立 `contracts/` 作为三端类型的唯一真相源，消除类型漂移。

**任务清单**：
- [ ] 1.1 创建 `contracts/` 目录结构（package.json、tsconfig.json、子目录）
- [ ] 1.2 配置 `contracts` workspace（可选 npm workspaces 或 path 引用）
- [ ] 1.3 迁移 Supabase 生成类型到 `contracts/src/database/database.types.ts`
- [ ] 1.4 修改 `npx supabase gen types` 输出路径（写入 package.json script）
- [ ] 1.5 提取 `gateway/src/ws/schemas.ts` 到 `contracts/src/ws/protocol.ts`
- [ ] 1.6 从 `gateway/src/routes/*` 提取 HTTP API 协议到 `contracts/src/http/*`
- [ ] 1.7 建立 `contracts/src/domain/*` 业务实体（基于 database + UI 衍生字段）
- [ ] 1.8 迁移错误码、枚举、常量到 `contracts/src/constants/*`
- [ ] 1.9 调整 web/gateway/supabase-functions 的 tsconfig paths，支持 `@contracts/*`
- [ ] 1.10 逐个替换三端原有类型定义为 `import from '@contracts'`
- [ ] 1.11 三端 typecheck 全通过

**交付物**：
- `contracts/` 目录（完整）
- 三端原有类型定义数量（Phase 0 基线 vs Phase 1 终态）对比报告

**验收标准**：
- ✅ `cd contracts && npm run typecheck` 通过
- ✅ `cd web && npm run build` 通过
- ✅ `cd gateway && npm run typecheck` 通过
- ✅ Supabase Edge Functions deno check 通过
- ✅ `rg "(type|interface) (QRCode|Message|Conversation|Agent)" web/ gateway/ supabase/functions/ --type ts` 结果**仅出现在 contracts/ 外部的 re-export**
- ✅ 现有 E2E 测试（Playwright）全通过（契约层不改变行为）

**对应任务卡**：`docs/refactor/tasks/T1-contracts.md`（Phase 0 完成后撰写）

**Human Checkpoint**：契约字段的最终形态（特别是 WebSocket protocol）需你审批。

---

### 📦 Phase 2 — 规范 skill + 业务域索引

**目标**：让 AI agent 能秒级定位代码 + 生成风格统一的代码。

**交付物结构**：
```
.cursor/skills/qrclaw-conventions/
├── SKILL.md                ← 800-1000 字渐进入口
├── reference.md            ← 3-5K 字详细规范
├── examples.md             ← 多角色使用示例
└── domain-index.md         ← 业务域索引（三层关键词）

.cursor/rules/
├── qrclaw-conventions.mdc  ← alwaysApply，轻量常驻
├── layer-boundaries.mdc    ← 分层红线
└── nextjs-boundaries.mdc   ← Server/Client Component 边界

docs/conventions/
├── naming-patterns.md      ← 命名规范
└── coding-patterns.md      ← 编码模式（✅/❌对比）
```

**任务清单**：
- [ ] 2.1 扫描提取命名规范（目录 / 文件 / 函数 / hooks / 组件）
- [ ] 2.2 扫描提取编码模式（错误处理 / Supabase 查询 / Next.js SC vs CC / WS 消息处理 / React hook 模式）
- [ ] 2.3 写 `domain-index.md`，覆盖所有业务域，每个含三层关键词：
  - **专业词**（开发侧）：实体名、API 名、函数名
  - **业务词**（产品侧）：业务场景描述
  - **用户词**（C 端视角）：用户可感知的功能
- [ ] 2.4 写 `SKILL.md`（800-1000 字）+ `reference.md`（3-5K 字）+ `examples.md`
- [ ] 2.5 写 3 个 `.mdc` rule 文件
- [ ] 2.6 验证：让 fresh agent 读完 skill 后能否正确回答"如何新增 QRCode 状态"等典型场景问题

**验收标准**：
- ✅ 所有文档产出齐全
- ✅ `SKILL.md` 字符数在 800-1000 之间（渐进披露原则）
- ✅ `domain-index.md` 每个域关键词 ≥ 10
- ✅ 让 Claude/Trae 仅基于该 skill 回答 5 个预设业务问题，答案准确率 100%

**对应任务卡**：`docs/refactor/tasks/T2-skill.md`

---

### 📦 Phase 3 — web 按业务域重组

**目标**：从"按技术层切分"转为"按业务域聚合"，为多 agent 并行打物理边界。

**策略**：**每个域一个独立 PR，由简到难**

**域迁移顺序（推荐）**：
1. **subscription**（最简单，试跑流程）
2. **auth**
3. **qrcode**
4. **agent**
5. **claim**
6. **chat**（最复杂，最后做）

**每个域的迁移模板**：
- [ ] 3.N.1 在 `web/src/features/{domain}/` 创建目录骨架
- [ ] 3.N.2 识别该域相关的 `components/`、`hooks/`、`lib/` 文件
- [ ] 3.N.3 迁移文件到 `features/{domain}/`
- [ ] 3.N.4 在原位置保留 re-export 兼容层（过渡期 2 个 Phase）
- [ ] 3.N.5 更新 `app/` 下的 import 到新路径
- [ ] 3.N.6 编写/调整 `features/{domain}/index.ts` 公开 API
- [ ] 3.N.7 跑 `npm run build` + E2E 回归
- [ ] 3.N.8 提 PR，Human 审核

**Phase 3 总收尾**：
- [ ] 3.F1 配置 `eslint-plugin-boundaries` 规则禁止跨域 import
- [ ] 3.F2 删除所有兼容层 re-export
- [ ] 3.F3 更新 `domain-index.md`

**验收标准**：
- ✅ 所有 6 个域完成迁移
- ✅ `npm run build` + E2E 全通过
- ✅ ESLint 无跨域 import 违规
- ✅ `components/ui/` 内不含 `@/features/*` import

**对应任务卡**：`docs/refactor/tasks/T3-web-features.md`（含 6 个子任务 T3.1 ~ T3.6）

**Human Checkpoint**：每个域迁移 PR 都需 Human 审批。

---

### 📦 Phase 4 — gateway 按业务域重组

**目标**：gateway 按业务域分层，与 web/features 对称，为并行打边界。

**目标结构**：
```
gateway/src/
├── domains/
│   ├── qrcode/
│   │   ├── routes.ts
│   │   ├── service.ts
│   │   ├── db.ts
│   │   └── index.ts
│   ├── messaging/           (WS 业务逻辑)
│   │   ├── ws-handler.ts
│   │   ├── router.ts
│   │   ├── persist.ts
│   │   └── index.ts
│   └── subscription/
├── shared/
│   ├── middleware/
│   ├── redis/
│   ├── crypto/
│   ├── supabase/
│   └── env.ts
├── ws/                       (框架层)
│   ├── auth.ts
│   ├── registry.ts
│   └── handler-factory.ts
└── server.ts                 (仅路由组装 + 启动)
```

**任务清单**：
- [ ] 4.1 建 `gateway/src/domains/` 和 `shared/` 目录
- [ ] 4.2 按域迁移 `routes/*`
- [ ] 4.3 把 WS 业务逻辑抽到 `domains/messaging/`
- [ ] 4.4 保持 `ws/` 为框架层（auth、registry、handler factory）
- [ ] 4.5 `server.ts` 简化为路由组装
- [ ] 4.6 typecheck + E2E 回归

**验收标准**：
- ✅ `gateway && npm run build` 通过
- ✅ WebSocket 集成测试通过
- ✅ HTTP API 烟囱测试通过

**对应任务卡**：`docs/refactor/tasks/T4-gateway-domains.md`

---

### 📦 Phase 5 — CI/CD 建设

**目标**：GitHub Actions 质量门禁 + 自动部署 + 契约变更保护。

**任务清单**：
- [ ] 5.1 建 `.github/workflows/quality-gate.yml`（PR 时跑 typecheck/lint/build/test）
- [ ] 5.2 建 `.github/workflows/deploy-gateway.yml`（SSH + PM2 或 Docker push）
- [ ] 5.3 建 `.github/workflows/deploy-supabase.yml`（supabase db push + functions deploy）
- [ ] 5.4 Vercel Dashboard 关联 `web/` 目录自动部署
- [ ] 5.5 GitHub Settings 配置：
  - Branch Protection on `main`
  - Required status checks: `contracts`, `web`, `gateway`, `supabase-functions`, `unit-tests`, `contracts-change-guard`
  - Secrets: `GATEWAY_HOST`, `GATEWAY_USER`, `GATEWAY_SSH_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`
  - 创建标签：`contracts-approved`
- [ ] 5.6 写 `docs/ci-cd-guide.md`

**验收标准**：
- ✅ 一个 PR 提上来自动跑 CI 全绿
- ✅ 改动 `contracts/` 不加标签时 CI 失败
- ✅ push main 自动触发 gateway 和 supabase 部署
- ✅ Vercel PR 预览链接正常

**对应任务卡**：`docs/refactor/tasks/T5-ci-cd.md`

**Human 手动步骤**：Secrets 配置、Vercel 连接、Branch Protection 规则需 Human 在 GitHub UI 完成（不能完全自动化）。

---

### 📦 Phase 6 — 扫描器自动化（持续）

**目标**：防止规范过时。

**任务清单**：
- [ ] 6.1 `scripts/conventions-scanner/scan-domains.mjs` — 输出最新业务域清单
- [ ] 6.2 `scripts/conventions-scanner/check-boundaries.mjs` — 检查跨域 import 违规
- [ ] 6.3 `scripts/conventions-scanner/check-contracts-usage.mjs` — 检查契约外是否有类型散落
- [ ] 6.4 `scripts/conventions-scanner/extract-patterns.mjs` — 从代码自动更新 coding-patterns.md
- [ ] 6.5 pre-commit hook + CI 集成

**对应任务卡**：`docs/refactor/tasks/T6-scanner.md`

---

## 6. 风险与应对

### 6.1 主要风险

| 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|
| **契约设计不当导致大范围重写** | 中 | 高 | Phase 1 前由 Human 审批契约字段；分步提交 PR 每步可回滚 |
| **Phase 3 迁移破坏现有功能** | 中 | 中 | 每域独立 PR + E2E 回归；保留兼容层直到全量迁移 |
| **Trae Agent 理解偏差导致破坏性修改** | 低 | 高 | 每个任务卡含验收标准；人类审批 PR；Phase 5 之前避免让 Trae 改 main |
| **Next.js SC/CC 边界在重构中被破坏** | 中 | 中 | Phase 2 的 `nextjs-boundaries.mdc` 规则 + 每 PR 验证 build |
| **WebSocket 协议迁移导致线上掉线** | 低 | 高 | Phase 1 的 WS protocol 变更保持向后兼容；灰度发布 |
| **Supabase Edge Functions 无法引用 contracts（Deno vs Node）** | 中 | 中 | 契约全部用纯 TS + Zod，不依赖 Node-only 包；Deno 通过相对路径 import |
| **规范成为文档摆设** | 中 | 中 | Phase 6 扫描器 + CI 规则持续校验 |

### 6.2 回退策略

每个 Phase 的变更都走独立 PR，可以：
- **Phase 1 回退**：revert 契约层引入的 PR，三端回到独立定义
- **Phase 3 回退**：通过兼容层保留旧路径，可临时 revert 某个域的迁移
- **Phase 5 回退**：关闭 Branch Protection，GitHub Actions 可独立禁用

---

## 7. Trae Agent 任务派发规则

### 7.1 Trae Agent 角色定位

Trae Agent 是连接了 GitHub 仓库的线上 Agent，可以：
- ✅ 读取仓库所有文件
- ✅ 创建分支、提交代码、发起 PR
- ✅ 执行任务卡描述的具体步骤
- ❌ 不应自主审批 PR 合入
- ❌ 不应自主修改 `contracts/`（除非任务卡明确指派）

### 7.2 任务卡格式

所有任务卡位于 `docs/refactor/tasks/T{N}-*.md`，格式统一如下：

```markdown
# T{N}: {任务标题}

> **Phase**: N
> **前置**: T{N-1} 已完成
> **预计工期**: X 天
> **执行者**: Trae Agent / Human
> **Human Checkpoint**: 是/否（及位置）

## 目标
简短描述本任务要达成的状态

## 上下文（Context）
- 需要读取的文件列表
- 需要参考的规范文档

## 详细步骤
1. Step 1: ...
2. Step 2: ...
3. ...

## 交付物
- 文件清单
- 变更概述

## 验收标准（Acceptance Criteria）
- [ ] 可自动验证项（命令 + 期望输出）
- [ ] 需 Human 确认项

## PR 规范
- 分支名: `refactor/T{N}-{slug}`
- PR 标题格式: `refactor(T{N}): {短描述}`
- PR 描述模板: 见 docs/refactor/tasks/README.md

## 风险与回退
...
```

### 7.3 执行流程

```
Human 审核任务卡
        ↓
Trae Agent 创建分支
        ↓
Trae Agent 按步骤执行
        ↓
Trae Agent 跑本地验收命令
        ↓
Trae Agent 发起 PR
        ↓
GitHub CI 质量门禁
        ↓
Human 审查 + 合并
        ↓
下一个任务
```

### 7.4 安全边界（Guardrails）

| 红线 | Trae 可否执行 | 理由 |
|---|---|---|
| 修改 `contracts/` | ❌（除非任务卡指派） | 契约变更需全局思考 |
| 修改 `supabase/migrations/*` | ❌ | 数据库 schema 变更影响线上 |
| 修改 `.github/workflows/*` | ⚠️ 仅 Phase 5 | CI 变更影响所有人 |
| 删除测试文件 | ❌ | 测试资产不可丢失 |
| 修改 `package.json` 核心依赖版本 | ⚠️ 需 Human 审核 | 升级可能引入 breaking |
| 直接 push 到 main | ❌ | 强制走 PR |
| 自动 merge PR | ❌ | 必须 Human 审批 |

### 7.5 Trae Agent 启动 Prompt 模板

当你要让 Trae 执行某个任务时，把 **以下整段** 发给它：

```
你是 QRClaw 重构项目的执行 Agent。请执行以下任务：

1. 阅读主计划：docs/refactor/refactor-plan.md
2. 阅读规则文档：docs/refactor/tasks/README.md
3. 阅读本次任务：docs/refactor/tasks/T{N}-{slug}.md
4. 严格按照任务卡的"详细步骤"执行
5. 每完成一步，在分支 commit 一次，commit message 遵循 Conventional Commits
6. 执行完后在本地跑"验收标准"中的所有命令，全部通过后再发 PR
7. PR 标题和描述按任务卡规范撰写
8. 如遇任何不确定的决策（例如文件命名、架构选型），**停止执行，在 PR 描述中列出疑问**，由 Human 回复后再继续

禁区（任何情况下都不可做）：
- 不修改 contracts/（除非任务卡明确允许）
- 不修改 supabase/migrations/（除非任务卡明确允许）
- 不直接 push 到 main
- 不自动 merge PR
- 遇到 test 失败时，不修改测试让它通过，只修代码

开始执行 T{N}。
```

---

## 8. 交付里程碑

| 里程碑 | 对应 Phase | 预期时间 | 人工确认点 |
|---|---|---|---|
| M1: 有审计报告 | Phase 0 完成 | Week 1 上半 | ✅ 业务域清单确认 |
| M2: 契约层就绪 | Phase 1 完成 | Week 1 末 | ✅ 契约字段审批 |
| M3: AI 规范上线 | Phase 2 完成 | Week 2 上半 | ✅ skill 可用性验证 |
| M4: CI 保护生效 | Phase 5 完成 | Week 2 末 | ✅ Secrets 配置 |
| M5: web 按域重组完成 | Phase 3 完成 | Week 4 | ✅ 所有域 PR 合入 |
| M6: gateway 按域重组完成 | Phase 4 完成 | Week 5 | ✅ E2E 通过 |
| M7: 扫描器上线 | Phase 6 | Week 6+ | — |

---

## 9. 变更记录

| 日期 | 版本 | 变更 | 作者 |
|---|---|---|---|
| 2026-04-19 | v1.0-draft | 初稿 | zeze + AI |

---

## 附录 A：与 txbbs 项目的方法论映射

本计划大量借鉴了 `~/txbbs` 项目的「规范即 skill」体系，核心映射如下：

| txbbs 概念 | qrclaw 对应 | 差异 |
|---|---|---|
| `src/cgi/` (pb2ts 生成) | `contracts/` | qrclaw 额外覆盖 WebSocket 协议 |
| `src/entity/` | `features/{domain}/` + `gateway/domains/{domain}/` | 前后端同构分域 |
| `src/data-adapter/` | `features/{domain}/adapters/` | 概念相同 |
| `src/common/` | `web/lib/` + `gateway/shared/` | 按前后端分别放置 |
| `.cursor/skills/txbbs-conventions/` | `.cursor/skills/qrclaw-conventions/` | 完全对齐 |
| `business-index.md` 三层关键词 | `domain-index.md` | 完全对齐 |
| SSOT + 符号链接多 IDE | 同 | 可复用 `setup-symlinks.mjs` 思路 |

## 附录 B：参考资料

- txbbs 规范：`~/txbbs/docs/txbbs-conventions/`
- Next.js App Router: https://nextjs.org/docs/app
- Supabase TypeScript 生成: https://supabase.com/docs/guides/api/rest/generating-types
- eslint-plugin-boundaries: https://github.com/javierbrea/eslint-plugin-boundaries
- Zod: https://zod.dev
