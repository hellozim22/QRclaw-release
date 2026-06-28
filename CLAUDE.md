# QRClaw — Project Instructions

## Project

- **Name**: QRClaw (qrclaw.ai)
- **Stage**: OpenClaw 插件化重构 M0-M4 完成 + Wave 2-3 本地 E2E 贯通（2026-04-21）
- **Stack**: TypeScript + Next.js 16 + React 19 + Tailwind CSS v4 + Supabase + Node.js Gateway + OpenClaw Plugin
- **Version**: 0.5.1（2026-04-21，未发布；详见 CHANGELOG.md）
- **Constraint**: All code/docs must NOT contain AI-generated/assisted markers
- **接手第一件事**：读 `.claude/progress/session-overview.md` 对齐 wave-level 进度，再按需下钻到 `dev-log/YYYY-MM-DD.md`

## Architecture

```
qrclaw/
├── CLAUDE.md                  ← 项目总入口（自动加载）
├── CHANGELOG.md               ← 版本变更日志（SemVer）
├── .claude/
│   ├── agents/               ← 17 个 ECC Agent
│   ├── commands/             ← 43 个斜杠命令
│   ├── rules/                ← 规则（含 tech-stack-gotchas, feature-inventory, commands）
│   ├── skills/               ← 25 个 Skill
│   ├── contexts/             ← 上下文定义
│   ├── hooks/                ← ECC 自动化钩子
│   └── settings.json         ← 模型: claude-opus-4-6
├── requirements/             ← 产品需求 + 技术方案 + 协议 + 测试 + 开发计划
├── design/                   ← 设计资源（Token + 组件规格 + 76 张截图 + 交互文档）
├── web/                      ← 前端（Next.js 16 App Router）
├── gateway/                  ← 后端 Gateway（Express 5 + WebSocket）
├── supabase/                 ← 数据库 + 8 个 Edge Functions（含 decrypted-messages 统一解密读路径）
├── plugins/openclaw/         ← OpenClaw Channel Plugin（M4 起，QRClaw 作为 OpenClaw 通道）
├── shared/contracts/         ← HTTP / WS 契约 SSoT（Phase 2 Wave 1/2）
├── tests/                    ← 测试工程（Vitest + Playwright）
├── dev-log/                  ← 每日开发日志（交接给下一个 agent）
└── docs/superpowers/plans/   ← Plan 文档（长周期战略设计，M0-M4 方案锚点）
```

---

## 四条铁律（技术约束，v1.3 生效于 2026-04-20）


| 铁律            | 定义                                                                  | 技术实现                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1 中立中继**   | QRClaw 不执行任何 AI 推理 / 不解读消息语义                                        | Gateway 仅接收、加密、持久化、转发；不调用 LLM；不对 content 做任何基于内容的路由或改写                                                                                                                                               |
| **C2 加密存储**   | 平台持久化的消息必须是密文；明文只存在于两处：(a) 端侧客户端；(b) 已授权的 Edge Function 内存态（`decrypted-messages`）——不落盘、不写日志、函数结束即释放缓存                                             | `content_encrypted`（AES-256-GCM，DEK 由 KEK 包装）；Gateway **写路径**持 KEK 加密新消息，**读路径**不再解密（M3 起）；Supabase Edge Function 是唯一被授权的服务端解密点，函数结束所有密钥/明文释放                                                                                                                       |
| **C4 移动端零注册** | 移动端 Visitor 无需注册                                                    | Session Token 标识                                                                                                                                                                                     |
| **C5 消息可回放**  | 任一身份（visitor / owner / agent-plugin）在断线、换机、重启后重新连接时，都能拿回断线期间及历史上的消息 | (1) Visitor: `POST /api/messages` → Edge Function `decrypted-messages`（M3）；(2) Owner: JWT → `functions/v1/decrypted-messages`（M3 合并自 `get-decrypted-messages`）；(3) Agent-Plugin: `POST /api/agent/history` → Edge Function `decrypted-messages`（M3 新增） |


> **历史说明**：v1.2 之前是"三条铁律（C1 纯转发 / C2 平台存储 / C4）"。C1 被重定义为"中立中继"（不再暗示"不持久化"），C2 措辞在 v1.3 再次收紧：显式穷举明文允许存在的 2 个边界（客户端 + Edge Function 内存态），堵住 M3 Edge Function 解密引起的语义歧义；C5 为新增。详见 `docs/superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md` §1.3。

---

## Database (Supabase)

Credentials in `.env` (auto-loaded). Full access authorized.

- **Project**: `zyxqadubhwrnsoujiyir`
- **URL**: `https://zyxqadubhwrnsoujiyir.supabase.co`
- **Direct DB**: `${DATABASE_URL}` (PostgreSQL)
- **Auth**: Service Role Key — full admin access
- Migrations: `supabase/migrations/` with naming `YYYYMMDD_description.sql`
- Always enable RLS on new tables
- Generate types: `SUPABASE_ACCESS_TOKEN=... npx supabase gen types typescript --project-id zyxqadubhwrnsoujiyir > supabase/types/database.types.ts` 或通过 Supabase MCP 的 `generate_typescript_types` 工具（v1.3 起规范位置改为 `supabase/types/`，M1-DB-RESERVE 2026-04-20 落地）

---

## Verification Workflow（强制）

**每次实现功能后，必须完成以下验证再进入下一步。Build 通过 ≠ 功能完成。**

### Step 1: 编译验证

```bash
cd web && npm run build          # 前端 TypeScript + 页面编译
cd gateway && npm run typecheck  # Gateway 类型检查
```

### Step 2: 引用完整性

```
# 每个新建/修改的组件，验证它被正确导入和使用
Glob("web/src/**/<ComponentName>.*")    → 文件存在
Grep("import.*<ComponentName>")         → 被导入
Grep("<ComponentName>")                 → 被渲染/调用
```

### Step 3: 数据连通性

```
# 验证前端 → Gateway → Supabase 数据链路
Grep("fetch|axios|supabase", path="web/src/")      → 前端调用存在
Grep("router\.(get|post)|app\.(get|post)", path="gateway/src/")  → 后端路由存在
```

### Step 4: 用户流程验证（Playwright CLI）

```bash
# 用 Playwright 模拟真实用户操作，验证页面可访问且交互正常
playwright-cli                   # 查看可用命令
# 至少验证：页面加载、核心按钮可点击、表单可提交、导航跳转正确
```

### Step 5: 常见陷阱检查

```
Grep("HS256", path="gateway/")          → 必须为空（应为 ES256）
Grep("hardcoded|#[0-9a-fA-F]{6}", path="web/src/")  → CSS 颜色必须用变量
Grep("require\\(", path="web/src/")     → 必须为空（使用 ES6 import）
Grep("tailwind\\.config", path="web/")  → 必须为空（Tailwind v4 无 config）
Grep("bg-white|background: #fff", path="web/src/")  → 页面底色必须用 var(--surface-canvas)
Grep("font-medium|font-bold", path="web/src/")  → 仅迁移期允许；新代码用 --weight-regular/semibold
```

---

## Semantic Skill Router

**IMPORTANT**: Before starting any task, match the task intent to the relevant specs below and read them first.

### UI & Frontend Development


| Intent                  | Read                                                |
| ----------------------- | --------------------------------------------------- |
| **品牌哲学、视觉升级路线（路线 B，2026-04-21 起）** | `design/brand-principles.md` **（必读，先于任何 UI 改动）** |
| **Pencil 设计稿还原、前端页面开发** | `**.claude/skills/pencil-to-code/SKILL.md`** (强制遵循) |
| 组件规格、页面布局               | `design/frontend-dev-guide.md` (v2)                |
| 设计 Token（颜色/字体/间距）      | `design/design-tokens.css` (v2 语义 + 双轨 alias)       |
| Token 迁移对照表              | `design/migration-notes.md`                         |
| 视觉升级 Wave 计划            | `docs/superpowers/plans/2026-04-21-qrclaw-visual-upgrade.md` |
| 视觉基准截图                  | `design/layer/<Name>.png`（76 张）                     |
| 交互行为、页面流程               | `design/qrclaw-interaction-design.md`               |
| 视觉还原修复指引                | `requirements/visual-fix-prompt.md`                 |


### Product & Requirements


| Intent       | Read                                                          |
| ------------ | ------------------------------------------------------------- |
| 产品需求、用户旅程    | `requirements/product-requirements.md`                        |
| 技术方案（完整版）    | `requirements/technical-specification-v3.0.3-combined.md`     |
| WebSocket 协议 | `requirements/technical-specification-supplement-protocol.md` |
| 测试策略         | `requirements/technical-specification-supplement-testing.md`  |
| 开发计划（7 阶段）   | `requirements/project-plan.md`                                |


### Backend & Gateway


| Intent             | Read                  |
| ------------------ | --------------------- |
| Gateway 架构、WS、消息路由 | 技术方案 §2-§7            |
| 前后端通信协议            | 技术方案 §8 + 补充协议 §P1-P7 |
| 安全与加密              | 技术方案 §10              |


### Database


| Intent         | Read     |
| -------------- | -------- |
| Schema 设计、RLS  | 技术方案 §11 |
| Edge Functions | 补充协议 §P7 |


### Quality & Testing


| Intent        | Read                                        |
| ------------- | ------------------------------------------- |
| 已知问题清单        | `test-results/fix-list.md`                  |
| E2E 测试 Prompt | `requirements/codebuddy-e2e-test-prompt.md` |
| 测试结果归档        | `test-results/README.md`                    |


### Security


| Intent       | Read                              |
| ------------ | --------------------------------- |
| 安全审查         | `.claude/skills/security-review/` |
| OWASP Top 10 | 技术方案 §10.2                        |


### Development Methodology


| Intent        | Read                                |
| ------------- | ----------------------------------- |
| 前端设计模式        | `.claude/skills/frontend-patterns/` |
| 后端设计模式        | `.claude/skills/backend-patterns/`  |
| API 设计        | `.claude/skills/api-design/`        |
| TDD 工作流       | `.claude/skills/tdd-workflow/`      |
| E2E 测试        | `.claude/skills/e2e-testing/`       |
| PostgreSQL 模式 | `.claude/skills/postgres-patterns/` |
| 编码标准          | `.claude/skills/coding-standards/`  |
| 验证循环          | `.claude/skills/verification-loop/` |


### Deep Dive References


| Intent                  | Read                                  |
| ----------------------- | ------------------------------------- |
| 技术栈行为注释 & 常见踩坑          | `.claude/rules/tech-stack-gotchas.md` |
| 路由结构 & 组件库 & Gateway 结构 | `.claude/rules/tech-stack-gotchas.md` |
| 已实现功能清单                 | `.claude/rules/feature-inventory.md`  |
| 常用命令                    | `.claude/rules/commands.md`           |
| 本地密钥 SSoT + 同步 / CI 同步 | `docs/local-dev-secrets.md`           |
| Edge Function secret 矩阵  | `supabase/EDGE_FUNCTIONS_ENV.md`      |


---

## Common Pitfalls（复盘教训）


| 陷阱                     | 症状                    | 预防                                             |
| ---------------------- | --------------------- | ---------------------------------------------- |
| **Phantom References** | 页面 import 不存在的组件      | Verification Step 2: Glob + Grep 验证            |
| **Wrong Defaults**     | Auth 用 HS256 而非 ES256 | Verification Step 5: `Grep("HS256")`           |
| **CSS 硬编码**            | hex 颜色代替 CSS 变量       | Verification Step 5: `Grep("#[0-9a-fA-F]{6}")` |
| **Build ≠ Work**       | TypeScript 编译通过但运行时崩溃 | Verification Step 4: Playwright 用户流程           |
| **Missing Wiring**     | 页面存在但没有链接到导航          | Verification Step 2: Grep 导入检查                 |
| **Tailwind v4 Config** | 创建 tailwind.config 文件 | Verification Step 5: Grep 检查                   |


---

## 前端设计铁律（v2，2026-04-21 升级至路线 B）

> 完整哲学与决策依据见 `design/brand-principles.md`。本节是给 agent 的强制检查清单。

**视觉三铁律**：
- **V1 暖中性基底** — body 背景 `var(--surface-canvas)` (#f7f6f2)；正文色 `var(--text-primary)` (#26251e)；禁止 `bg-white` / `#ffffff` 作页面底色
- **V2 红色克制化** — 品牌红 `--accent-brand` 只出现在 4 个定点（主 CTA、Tab 激活、Logo / 品牌符号、Visitor 气泡）；次级按钮/链接/hover 禁用红色
- **V3 三声部排印** — Sans（Inter，UI）/ Serif（Instrument Serif，营销 & 情绪文案）/ Mono（JetBrains Mono，代码）；同页最多 2 种

**执行细则**：
- **颜色**: 永远用**语义 token**（`var(--accent-brand)`、`var(--text-primary)`、`var(--surface-card)`），**绝不硬编码 hex**；旧 `--color-red` / `--color-gray-*` 只在迁移期兼容，新代码禁用
- **字体**: 三声部变量 `--font-sans` / `--font-serif` / `--font-mono`；字重**仅 400 / 600** 两档
- **字号**: 最小 12px（`--text-caption`）；正文默认 16px（`--text-body-lg`）
- **字距**: ≥24px 的标题强制用 `--tracking-title` 系列，≥72px 用 `--tracking-display-lg`
- **Hover 信号色**: 链接/次级按钮/导航 hover 文字切 `--accent-hover` (#cf2d56)，**这是 QRClaw 的交互识别**
- **图标**: 统一 lucide-react，`color: currentColor` 随父容器变化
- **布局**: Mobile 390px / Web 1440px / Dashboard 三栏 80+320+fill
- **圆角**: 按钮 8px（`--radius-md`）、卡片 8–12px、头像小 6px/大 16px、输入框 8px、Pill 9999px
- **阴影**: Modal 用 `--shadow-elevated`（大模糊 + oklab 环），卡片用 `--shadow-md`
- **边框**: 暖棕 rgba（`--border-subtle/default/strong`），禁止冷灰 hex
- **详细工作流**: `.claude/skills/pencil-to-code/SKILL.md`
- **迁移对照**: `design/migration-notes.md`

---

## 版本管理

**当前版本: 0.5.1（待发布）** | 里程碑: 0.1.0 MVP → 0.2.0 验收 → 0.3.0 持久化 → 0.4.0 安全加固+视觉还原 → **0.5.0 Schema 对齐** → **0.5.1 OpenClaw 插件化 M0-M4 + Wave 2-3 收尾**

### 记录体系（给后继 agent 的阅读顺序）

| 文档                                      | 作用                                      | 何时读            |
| --------------------------------------- | --------------------------------------- | -------------- |
| `.claude/progress/session-overview.md`  | Wave-level 进度索引（M0-M4、R1-R3、Wave 1/2/3、Known Bugs） | **接手第一件事** |
| `CHANGELOG.md`                          | 版本变更日志（SemVer）                          | 需要了解"哪一版加了什么"  |
| `dev-log/YYYY-MM-DD.md`                 | 每日开发日志（今日改动的意图/根因/测试基线）                  | 理解某一天具体做了什么    |
| `docs/superpowers/plans/2026-04-20-*.md`| OpenClaw 插件化方案（v1.3 锁定，含 §12 Task Cards） | 执行 M5+ 或理解整体战略 |
| `AGENTS.md`                             | Cursor Cloud / 本地环境启动说明                 | 在新机器上起服务       |
| `requirements/`                         | 产品需求 + 技术方案 + 协议 + 测试 + 开发计划             | 深入功能/协议细节      |
| `test-results/`                         | E2E / 视觉审计归档                            | 查询历史基线         |

### 更新约定

- 发版时**同步更新** CHANGELOG + dev-log + `.claude/progress/session-overview.md`
- dev-log 遵循 `dev-log/README.md` 模板；session-overview 在每个 wave 收尾时追加
- CHANGELOG 遵循 [Keep a Changelog](https://keepachangelog.com/)
- **入口文档（CLAUDE.md / AGENTS.md / CHANGELOG.md）的更新是"交接义务"**，不是可选项——未更新的 commit 等于把改动藏起来

---

## ECC 框架（v1.8.0）

本项目已集成 Everything Claude Code v1.8.0，全员使用 **Opus 4.6** (`claude-opus-4-6`)。


| 组件       | 数量  | 说明                                                                   |
| -------- | --- | -------------------------------------------------------------------- |
| Agents   | 17  | architect, planner, tdd-guide, code-reviewer, security-reviewer...   |
| Commands | 43  | /plan, /tdd, /code-review, /orchestrate, /e2e, /verify...            |
| Rules    | 24+ | ECC 通用 + TypeScript + 设计还原 + tech-stack-gotchas + feature-inventory  |
| Skills   | 25  | pencil-to-code, frontend-patterns, backend-patterns, tdd-workflow... |


### 核心命令


| 命令                          | 用途                                         |
| --------------------------- | ------------------------------------------ |
| `/orchestrate feature <描述>` | 完整特性工作流: planner → tdd → review → security |
| `/tdd`                      | 强制 TDD 流程                                  |
| `/code-review`              | 代码审查                                       |
| `/e2e`                      | E2E 测试                                     |
| `/verify`                   | 验证循环                                       |


