# QRClaw 重构 · Phase 1（active plan）

> **版本**: v2.0
> **日期**: 2026-04-19
> **作者**: zeze + AI（基于 code-reviewer + architect 两份评审汇总）
> **状态**: 🟢 **active** — 正在执行的计划
> **路线**: 路线 A（最小可行重构）
> **工期**: ~1.5 周（1 人）
> **长期蓝图**: 见 [`refactor-plan.md`](./refactor-plan.md)（v1.0 archived）

---

## 0. 本计划要解决什么

**两位评审共识下的 MVP 阶段三大真实痛点**：

| # | 真实痛点 | 证据 |
|---|---|---|
| P1 | **WS 协议漂移已在线上** — `gateway/src/ws/schemas.ts` 与 `web/src/types/ws.ts` 帧定义已不一致（AuthFrame、ConnectionAckFrame、AgentTypingFrame 等） | 代码事实 |
| P2 | **web 层无数据库类型保护** — `createClient` 直接 `.from('qrcodes')` 返回 `any`，没有 `database.types.ts` | 代码事实 |
| P3 | **Deno ↔ Node 契约互通是被低估的风险** — 两位评审独立指出，若直接推进全量方案大概率踩坑 | 评审共识 |

**本计划不做的事**（保留给未来）：
- ❌ `web/src/features/` 按域重组
- ❌ `gateway/src/domains/` 按域重组
- ❌ 完整 skill 四件套（reference + examples + naming-patterns + coding-patterns）
- ❌ 扫描器自动化
- ❌ `contracts-approved` PR 标签门禁、多 agent 协作拓扑
- ❌ Phase 0 全量业务域候选清单

**本计划要做的事**：
- ✅ 契约互通 Spike（验证技术路径）
- ✅ WS 协议 SSOT（消除线上真痛点）
- ✅ CI 增量补丁（Supabase Deno check + 契约漂移守护）
- ✅ 极简 skill（qrclaw 专属 map，与现有 28 个通用 skill 互补）

---

## 1. 现状事实（已核验）

| 事项 | 现状 |
|---|---|
| `.github/workflows/ci.yml` | ✅ **已存在**，含 tests/web-lint/gateway-lint 三个 job（评审 C1 抓到主计划 v1.0 说"CI 缺失"是错的） |
| `web/src/types/database.types.ts` | ❌ **不存在**，web 无数据库类型保护 |
| `gateway/src/ws/schemas.ts` | ✅ 存在，覆盖 7 种 client→server 帧（ping / visitor_message / agent_message / stream_chunk / stream_end / read_receipt / auth） |
| `web/src/types/ws.ts` | ✅ 存在，定义 ClientFrame/ServerFrame，但与 gateway schemas.ts 字段集合不完全一致 |
| `supabase/functions/` | 8 个 Edge Function（Deno 运行时），与 gateway/web 使用同一 Zod 生态但运行时不同 |
| `.claude/skills/` | 已有 28+ 个通用 skill（agentic-engineering、api-design、coding-standards、e2e-testing 等） |
| 代码规模 | web 14.7K + gateway 4.1K + supabase/functions 1.8K ≈ 20.6K LOC |
| 团队 | 1-2 人 + AI agent |

---

## 2. 目标架构（精简版）

```
qrclaw/
├── shared/                          ⭐ 新增 — 轻量共享层（非 npm workspace，避免 monorepo 复杂度）
│   └── contracts/
│       ├── ws/
│       │   └── protocol.ts          (从 gateway/src/ws/schemas.ts 迁入)
│       └── README.md                (SemVer + 变更规则)
│
├── web/
│   └── src/
│       ├── types/
│       │   └── database.types.ts    ⭐ 新增 — supabase gen types 输出
│       └── (其余结构不动)
│
├── gateway/                         (除 ws/schemas.ts 迁出外，结构不动)
├── supabase/                        (结构不动)
│
├── .github/workflows/
│   └── ci.yml                       ⭐ 增量补丁（不重写）
│
└── .claude/skills/
    └── qrclaw-map/                  ⭐ 新增 — qrclaw 专属导航 skill（与现有 28 个通用 skill 互补）
        ├── SKILL.md                 (~200 行)
        └── map.md                   (~300 行 业务域 + 关键入口)
```

**关键设计决策**：
1. **用 `shared/contracts/` 而非 `contracts/` npm package** — 避免 Deno/Node 跨 workspace import 的地狱，用 **tsconfig paths + Deno imports map + 相对路径** 三种引用方式共存。
2. **database.types.ts 落在 web/src/types/** 而非 contracts/ — 因为只有 web 直接查 RLS 表；gateway 走 service role 有自己的类型；Edge Functions 不引用。
3. **qrclaw-map skill 作为补充** — 不替代现有 28 个通用 skill，只补充 qrclaw 业务知识。

---

## 3. 执行顺序（4 个任务）

| # | 任务 | 工期 | 可执行者 | 前置 |
|---|---|---|---|---|
| T-Spike | 契约互通 Spike | 0.5-1 天 | Trae 或 Human | 无 |
| T-WS | WebSocket 契约 SSOT + 漂移对齐 | 2-3 天 | Trae | T-Spike 通过 |
| T-CI | CI 增量补丁（Supabase check + 契约门禁） | 1-2 天 | Trae 或 Human | 无（可与 T-WS 并行） |
| T-Map | qrclaw-map skill（补充型） | 1-2 天 | Trae | T-WS 完成 |

**总工期**：~1.5 周（串行），~1 周（T-CI 与 T-WS 并行）。

---

### T-Spike：契约互通 Spike

**目标**：用最小示例验证"一份 Zod schema 能否被 web（Next.js 16 + Node 20）、gateway（Node 20）、supabase function（Deno）同时消费"。

**Spike 方案**：
- 在 `shared/contracts/ws/protocol.ts` 创建一个极简 schema（例如 `pingFrameSchema`）
- 让 **web、gateway、一个 throwaway Supabase function** 三端都能 import 并使用
- 跑通三端 typecheck + Supabase function 本地 `supabase functions serve` 能启动

**输出**：
- 一份 spike report：`docs/refactor/spike-report.md`，记录三种 import 方式（tsconfig paths / deno.json imports map / 相对路径）哪种可行
- 如果 Supabase Deno 互通失败 → spike report 记录降级方案：**contracts 文件复制到 supabase/functions/_shared/contracts/（pre-commit hook 同步）**

**验收**：
- `cd web && npm run build` 通过
- `cd gateway && npm run typecheck` 通过
- `supabase functions serve` 启动成功（或 fallback 方案已文档化）

**对应任务卡**：[`tasks/T-spike-contract-interop.md`](./tasks/T-spike-contract-interop.md) ← **本轮交付**

---

### T-WS：WebSocket 契约 SSOT + 漂移对齐

> 基于 T-Spike 的结论再写具体步骤，当前先列主方向。

**目标**：消除 `gateway/src/ws/schemas.ts` 与 `web/src/types/ws.ts` 的帧定义漂移。

**主要工作**：
1. **漂移审计**：列出 gateway Zod schemas vs web ClientFrame/ServerFrame 的字段差集
2. **统一协议定义**：在 `shared/contracts/ws/protocol.ts` 建立完整双向协议（client→server + server→client）
3. **引入版本字段**：新增 `PROTOCOL_VERSION` 常量 + connection_ack 协议版本协商
4. **双端替换**：gateway 引用 `@shared/contracts/ws` 做校验；web 引用同一 schema 做类型 + 客户端侧校验（可选）
5. **向后兼容**：所有新字段标 `.optional()`，避免老客户端发帧被拒

**验收**：
- `rg "(ClientFrame|ServerFrame|frameTypeSchema)" web/ gateway/ --type ts` 除 `shared/contracts/` 外均为 import
- `tests/e2e/` WebSocket 相关 spec 全通过
- 旧版 web 客户端连接新 gateway 不被拒

**对应任务卡**：T-Spike 完成后撰写 `tasks/T-ws-contract.md`

---

### T-CI：CI 增量补丁

**目标**：在现有 `ci.yml` 基础上补 3 个小门禁，**不重写**。

**增量**：
1. **Supabase Deno check 的 job** — `supabase functions serve --no-verify-jwt` dry-run 或 `deno check supabase/functions/**/*.ts`
2. **契约变更守护** — 当 PR 改动 `shared/contracts/**` 时，自动标 `contracts-changed` label（不做 required review，只做可见性）
3. **database.types.ts 漂移检查**（可选）— `npx supabase gen types typescript > /tmp/gen.ts && diff /tmp/gen.ts web/src/types/database.types.ts`（需 Supabase 项目引用，先做 nice-to-have）

**验收**：
- PR 上 4 个 job 可见：tests, web-lint, gateway-lint, supabase-check（新增）
- 改 `shared/contracts/**` 的 PR 自动打 `contracts-changed` label

**对应任务卡**：T-Spike 完成后撰写 `tasks/T-ci-patch.md`

---

### T-Map：qrclaw-map skill（补充型）

**目标**：写一个 qrclaw 专属的业务导航 skill，让 agent 能秒级定位代码落点。**与现有 28 个通用 skill 互补，不重复**。

**交付物**：
```
.claude/skills/qrclaw-map/
├── SKILL.md            (~200 行：何时用、场景、渐进披露入口)
└── map.md              (~300 行：业务域 + 关键入口文件路径)
```

**`map.md` 结构**（简化 txbbs domain-index 而非完整复制）：

```markdown
# QRClaw 业务域地图

## 业务域速查

### 1. qrcode（二维码）
- **入口**: web/src/app/(dashboard)/qrcodes/, web/src/hooks/useQRCodes.ts
- **API**: gateway/src/routes/create-qrcode.ts, supabase/functions/create-qrcode/
- **DB**: qrcodes 表, ...
- **关键词**: qrcode / 二维码 / QR code

### 2. agent（AI Agent 管理）
- **入口**: ...
- **API**: ...
- **关键词**: agent / AI / 助手

...（共 6 域，每域 5-10 行）
```

**不做的事**：
- ❌ 不写 naming-patterns.md（规范太早）
- ❌ 不写 coding-patterns.md（规范太早）
- ❌ 不写 reference.md / examples.md（map.md 已含关键信息，按需扩展）

**验收**：
- 全部交付物总字符数 < 500 行
- 派 fresh agent 读完 skill 后能回答"如何新增一种 QRCode 类型"等 3 个典型问题

**对应任务卡**：T-WS 完成后撰写 `tasks/T-qrclaw-map.md`

---

## 4. Phase 1 完成后的去向

**完成后项目状态**：
- 消除 WS 协议漂移真痛点
- 建立契约层基础（仅 WS，HTTP 暂不做）
- web 有 database 类型保护
- CI 有 Supabase check
- agent 有 qrclaw 专属导航

**后续决策点（由"触发式 roadmap"驱动）**：

| 触发条件 | 启动计划 |
|---|---|
| 第二位全职开发加入 | 启动 v1.0 的 Phase 2 + Phase 3 部分（skill 扩展 + 域边界） |
| 月度 type drift bug ≥ 2 | 扩展 contracts 到 HTTP API |
| 单 feature 目录 > 2K LOC 或跨 5+ 目录 | 对该 feature 启动单域迁移（不做 6 域全量） |
| 出现外部 API 消费者 | 把 contracts 发布为独立 npm package |
| 连续 2 周迭代被代码结构阻塞 | 启动 v1.0 Phase 5 完整版（Branch Protection / required checks / 自动部署） |

**"触发"意味着**：不主动排期，只在真实信号出现时重新评估，由 Human 决策。

---

## 5. 风险与回退

| 风险 | 应对 |
|---|---|
| Spike 失败（Deno 无法 import shared/contracts） | Fallback：契约文件复制到 `supabase/functions/_shared/` + pre-commit 同步脚本（仍可实现 SSOT 目标，仅实现方式不同） |
| WS 迁移破坏线上客户端 | 新字段全 optional；PROTOCOL_VERSION 协商；分两步 PR（先引入 shared/contracts，后替换 schemas 引用） |
| CI 新 job 失败挂住整个 PR | 初期 `continue-on-error: true`，稳定 1 周后转 required |

**整体回退**：所有改动走独立 PR，可分别 revert，不会让项目处于坏状态。

---

## 6. 与 v1.0 主计划的关系

v1.0 `refactor-plan.md` 保留为**长期蓝图**，当前不 active 但内容不删。价值：
- 未来触发条件满足时，v1.0 的 Phase 2/3/4/6 仍是有效的实施参考
- `附录 A 与 txbbs 方法论映射` 提供了长期治理思路
- 避免浪费 v1.0 起草的思考

**本计划视 v1.0 为"未来选项"，不视为"已废弃"。**

---

## 7. 参考

- **评审汇总**: [`review/summary-and-recommendation.md`](./review/summary-and-recommendation.md)
- **代码评审详报**: [`review/code-reviewer-feedback.md`](./review/code-reviewer-feedback.md)
- **架构评审详报**: [`review/architect-feedback.md`](./review/architect-feedback.md)
- **长期蓝图**: [`refactor-plan.md`](./refactor-plan.md) v1.0
- **任务卡索引**: [`tasks/README.md`](./tasks/README.md)
