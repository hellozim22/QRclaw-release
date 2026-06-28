# qrclaw 交接 Playbook（续期 agent + zeze 协作手册）

> **如果你是一位刚打开本文件的 agent — 请读这个框再往下**
>
> 你正在接手 qrclaw 项目。上一位 agent（Claude Opus 4.7，在 Cursor IDE 里工作）的上下文窗口快满了，所以把所有未完成的决策、计划、执行剧本全部汇总到这一份文件。**本文件就是你的全部记忆。**
>
> 你的职责范围是**三件事**（按本文件的 §2 顺序）：
> 1. **Task A**：把本地 30 个 commit 首次推到 GitHub（与 zeze 协作，见 §4）
> 2. **Task B**：按 `docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave1-http-contracts.md` 执行 Phase 2 Wave 1（§5）
> 3. **Task C**：按 `docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave2-outbound-ws.md` 执行 Phase 2 Wave 2（§6）
>
> **启动时的强制动作**：
> - ✅ 读完 §0 + §1 + §2 + §3 + §7 再执行任何写操作
> - ✅ 读你将要开始的那个 Task 对应的章节（§4 或 §5 或 §6）
> - ✅ 如果 §3 的"等用户决策的事"里有尚未解决的项阻塞你当前任务 → **不要自行决定，等 zeze 答复**
> - ✅ 任何一次 commit 前跑 §7 的六栏验证
> - ❌ 不要重读上一位 agent 的对话历史 — 所有有价值的决策都在本文件
> - ❌ 不要修改 plan 文件（`docs/superpowers/plans/*`）的 §0–§8 主体；如果 plan 错了，记到 `docs/refactor/execution-log.md` 的 deviation 栏
>
> **面向 zeze（用户）的部分**会用 ⚠️ 标记 —— 这些是只有人类能做的事，agent 不要替代执行。

---

## 目录

- [§0 项目是什么 / 为什么这么做](#0-项目是什么-为什么这么做)
- [§1 当前状态快照](#1-当前状态快照)
- [§2 三条后续任务的依赖关系](#2-三条后续任务的依赖关系)
- [§3 决策日志：已锁定 vs 等 zeze](#3-决策日志已锁定-vs-等-zeze)
- [§4 Task A — GitHub 首次发布](#4-task-a--github-首次发布)
- [§5 Task B — Phase 2 Wave 1 实现指引](#5-task-b--phase-2-wave-1-实现指引)
- [§6 Task C — Phase 2 Wave 2 实现指引](#6-task-c--phase-2-wave-2-实现指引)
- [§7 跨任务执行约定](#7-跨任务执行约定)
- [§8 Reading list / 所有相关文档的位置](#8-reading-list--所有相关文档的位置)
- [§9 常见问题与回滚](#9-常见问题与回滚)

---

## §0 项目是什么 / 为什么这么做

### 0.1 qrclaw 项目一句话

QRClaw 是一个"让 AI Agent 连接物理世界"的二维码对话平台：Owner 创建二维码 → Visitor 扫码 → 进入与 Agent 的实时会话。

仓库结构（简版）：

```
/Users/zeze/qrclaw/
├── web/              Next.js 16 (App Router) + React 19 + Tailwind v4 — 前端
├── gateway/          Express + ws — Node 网关（HTTP 端点 + WebSocket）
├── shared/           跨层真相源（types、Zod schemas、utilities）
│   ├── contracts/
│   │   ├── ws/       ✅ Phase 1 已完成：入站 WS 协议 SSoT
│   │   ├── http/     ⏳ Phase 2 Wave 1 要建的
│   │   └── ws/outbound.ts  ⏳ Phase 2 Wave 2 要建的
│   └── package.json  拥有 zod@4.3.6 依赖（Phase 1 FU2 提升）
├── supabase/         Postgres + RLS + Edge Functions（Deno）
│   └── functions/_shared/contracts/  ← 由 scripts/sync-contracts.mjs 同步
├── tests/            vitest (unit + integration) + playwright (e2e)
├── scripts/
│   ├── sync-contracts.mjs  Node ↔ Deno 桥：把 shared/contracts 复制到 supabase/functions/_shared
│   └── agent-sdk/          第三方 agent 接入 SDK（不是 web 也不是 gateway）
├── .github/workflows/      Wave 0 CI/CD（本 playbook §4 C1 验收的那一批）
├── .claude/skills/         agent 导航 skill（qrclaw-map 是最重要的入口）
└── docs/
    ├── superpowers/plans/  规划文档（本文件多次引用）
    ├── refactor/execution-log.md  执行日志（每波重构完成后追加）
    ├── release/            本文件所在
    └── ci-cd-optimization-plan.md  codex 给出的现网 CI/CD 审计（Wave 0 基线）
```

### 0.2 为什么分 Phase 1 / Wave 0 / Phase 2 三阶段

- **Phase 1（已完成）**：跨服务契约漂移修复 —— WebSocket **入站**帧从手写字符串 switch 升级成 Zod schema + shared TS types + parity tests + CI sync-check。发现并修复了 6 条真实 drift（含 `stream_chunk.sequence` 致使流式消息静默丢弃的 bug）。
- **Wave 0（已完成）**：CI/CD 管道硬化 —— 在 Phase 2 开始之前先加基础设施护栏（Dependabot、E2E CI、migration gate、自动 gateway 部署、手动 supabase db push、Prettier 全仓、CODEOWNERS），让后续大改动都在 gate 下进行，而不是纯本地验证。
- **Phase 2 Wave 1（本 playbook §5）**：HTTP 请求体契约 SSoT —— 把 `shared/contracts/ws/` 的 pattern 推到 HTTP 层。
- **Phase 2 Wave 2（本 playbook §6）**：出站 WS 帧 Zod —— 对称地补上 server → client 方向的运行时校验。

### 0.3 为什么"先 Wave 0 再 Phase 2"而不是"先 Phase 2 再补 CI"

zeze 在上一轮会话里问过这个问题，答案是：**qrclaw 不是绿地项目**。它在 Phase 2 开始前已有 17 个 commit、696 个测试、生产 VPS 在跑。Wave 0 的 7 项里有 6 项主要保护**存量**（格式化应用到已有 175 文件、E2E smoke 针对已有页面、migration gate 保护已有 schema、auto deploy 取代已有的手动 SSH……），只有 CODEOWNERS 是保护未来的。所以"先铺护栏再继续装修"比"装修完再装消防"更合理。

---

## §1 当前状态快照

### 1.1 本地仓库事实

截至本 playbook 更新时（2026-04-19）：

| 维度 | 值 |
|---|---|
| Working tree | clean |
| Branch | `main` |
| Total commits | **30** |
| Remote | **无**（`git remote -v` 空） |
| 最新 commit | `861730f docs(release): expand publish guide into full continuation playbook (v2)` |
| Wave 0 commit 范围 | `d5523c6` … `d99a555` + `2a9afa7`（11 个 commit） |
| Phase 2 plans commit | `953ab40`（两份 wave plan + index） + `861730f`（本文件 v2） |

> **Agent 启动时的自检**：在任何任务开始前，跑以下命令确认上面这个快照仍然成立。
>
> ```bash
> cd /Users/zeze/qrclaw
> git status            # 期望: working tree clean
> git log --oneline -3  # 期望: 顶部是 861730f 或更新
> git branch --show-current  # 期望: main
> git rev-list --count HEAD  # 期望: 30（或更多，如果在此之后又加了 commit）
> ```
>
> 如果某一条不匹配，**停下来**，把差异报给 zeze，不要猜。

### 1.2 六栏验证基线（Wave 0 落地时的通过水位线）

| # | Lane | 命令 | 期望 |
|---|---|---|---|
| 1 | Prettier | `npm run format:check` | `All matched files use Prettier code style!` |
| 2 | Contracts sync | `node scripts/sync-contracts.mjs --check` | exit 0，无 stdout |
| 3 | Gateway tsc | `npm --prefix gateway run typecheck` | 静默成功 |
| 4 | Web lint | `npm --prefix web run lint` | `0 errors`，13 个 pre-existing warning 是允许的 |
| 5 | Vitest | `npm --prefix tests run test` | `696 passed (696)` 或更多 |
| 6 | Workflows YAML | `for f in .github/workflows/*.yml; do python3 -c "import yaml; yaml.safe_load(open('$f'))"; done` | 4 个 OK |

**任何任务完成、要 commit 之前，都必须跑这 6 栏。** Web lint 的 13 个 warning 现在是"pre-existing debt"，不算回归（主要是 `<img>` vs `next/image`、`useEffect` ref capture 等），但数量**不能增加**。

### 1.3 plan 与 spec 文档清单

```
docs/superpowers/plans/
├── 2026-04-19-qrclaw-phase1-refactor.md           (Phase 1，已完成；执行参考)
├── 2026-04-19-qrclaw-cicd-wave0.md                (Wave 0，已完成；执行参考)
├── 2026-04-19-qrclaw-phase2-index.md              (Phase 2 总图；先读)
├── 2026-04-19-qrclaw-phase2-wave1-http-contracts.md  (本 playbook §5 的 source of truth)
└── 2026-04-19-qrclaw-phase2-wave2-outbound-ws.md     (本 playbook §6 的 source of truth)
```

`docs/refactor/execution-log.md` 是时间线日志。每完成一波，**在顶部追加**一条 entry。

### 1.4 非仓库侧的事实（你不能直接验证，但要相信）

这些是 zeze 提供的外部事实，**假设为真**：

- **Supabase 生产项目已存在**，名字和 project ID 需要 zeze 告诉你（见 §4 A2 的 `SUPABASE_PROJECT_ID`）
- **腾讯云 VPS 上 `/opt/qrclaw` 目录已克隆过一次旧版本**，Docker Compose 文件存在，gateway 容器正在跑
- **zeze 的 GitHub handle 是 `hellozim22`**（CODEOWNERS 已硬编码，见 `.github/CODEOWNERS`）
- **zeze 拥有 Supabase、GitHub、VPS 的管理权限**，可以创建 secret、environment、branch protection 等

---

## §2 三条后续任务的依赖关系

> **2026-04-20 更新**：在 Task A/B/C 之外，新增并行主线 **Task D — QRClaw × OpenClaw Plugin 改造（M0-M4）**，方案见 `docs/superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md`。Task D 的 M0（纯文档 + acceptance test）与 Task A/B/C 之间无代码冲突，可**并行启动**；M1+ 落地 DB/协议/Gateway 改动时需注意与 Wave 1/2 的 merge 顺序（见下表）。

```
           ┌──────────────────────────────────┐
           │ Task A: GitHub 首次发布 (§4)      │
           │ - Part A  zeze 在 UI 上配置       │
           │ - Part B  agent 执行 push         │
           │ - Part C  zeze 首轮 CI 验收       │
           └──────────────┬───────────────────┘
                          ▼ 完成 Part C 后
           ┌──────────────────────────────────┐
           │ Task B: Phase 2 Wave 1 实现 (§5)  │    ┌──────────────────────────────────────┐
           │ - HTTP 请求体 Zod 契约 SSoT       │    │ Task D: OpenClaw Plugin 改造          │
           │ - 9 个 task，7–8 个 commit        │ ∥  │ - M0 DOC + IRON-TEST（零代码）        │
           │ - 每个 commit 走 PR gate（由 A 建立）│    │ - M1 协议/DB 预留                     │
           └──────────────┬───────────────────┘    │ - M2 多 agent 管理                    │
                          ▼ Wave 1 完全 merge     │ - M3 持久化 + Edge Function 统一      │
           ┌──────────────────────────────────┐    │ - M4 plugins/openclaw/ 上线           │
           │ Task C: Phase 2 Wave 2 实现 (§6)  │    └──────────────────────────────────────┘
           │ - 出站 WS 帧 Zod 契约             │
           │ - 6 个 task + 1 checkpoint，       │
           │   9–12 个 commit                  │
           │ - γ HYBRID rollout（见 §6.3）    │
           └──────────────────────────────────┘
```

| Task D 里程碑 | 与 A/B/C 的关系 |
|---|---|
| **M0 DOC + IRON-TEST** | 零代码风险，可与 Task A 并行。仅修改文档 + 新增 `tests/acceptance/iron-rules.spec.ts`。 |
| **M1 协议/DB 预留** | 建议 **Wave 1 merge 后再开始**（否则 `shared/contracts/ws/types.ts` 容易冲突）。Migration 可独立先行。 |
| **M2 多 agent 管理** | 与 Task C 并行安全（Task C 改出站 WS，M2 改 Dashboard + Supabase）。 |
| **M3 持久化 + Edge Function** | 与 Task C γ HYBRID 观察期（7 天）并行安全（不同文件、不同关注点）。 |
| **M4 plugins/openclaw/** | 完全新目录（`plugins/openclaw/**`），**与 A/B/C 全部正交**。 |

### 为什么 A → B → C 串行

| 依赖 | 解释 |
|---|---|
| **A 必须在 B 之前** | 没有 GitHub remote，Wave 0 的 `ci.yml` / `deploy-*.yml` 不会触发。Wave 1 的每个 commit 需要 CI gate 保护。在本地推完所有 Wave 1 再一次性 push 到 GitHub，会把 6 个 job × N 个 commit 堆在 GitHub Actions 队列里，出问题时无法增量归因。 |
| **B 必须在 C 之前** | Wave 1 的 T1 / T2 可能会重构 `gateway/src/server.ts` 或引入新 middleware；Wave 2 的 T3 需要 grep 所有 `ws.send(...)` emit site。Wave 1 先落地后，Wave 2 的 emit-site inventory 才能 accurate —— 这一点 Wave 2 plan §0 已经预警。 |
| **B 和 C 能并行吗？** | **不建议**。理由：(1) 两波都修改 `gateway/src/` 会带来 merge conflict；(2) Wave 2 用 γ hybrid rollout，需要观测 7 天才从 log-only 切 strict — 和 Wave 1 并行会模糊"哪个 wave 引入的 warn 日志"。1–2 人团队串行更安全。 |

### 串行跑完大约多久

- Task A：zeze 手动配置 25 分钟 + agent push 5 分钟 + 首轮 CI 跑 ~15 分钟 + zeze 验收 10 分钟 ≈ **1 小时**
- Task B：7–8 个 commit × 平均 30 分钟/commit（含 TDD + review）≈ **4–5 小时**（agent 自主执行）
- Task C：9–12 个 commit × 30 分钟 ≈ **5–6 小时** + 7 天观测期（非 agent 工作时间）

---

## §3 决策日志：已锁定 vs 等 zeze

### 3.1 已锁定的决策（不要再讨论，直接按这个做）

zeze 在上一轮会话里已明确答复以下选择 —— **新 agent 不得重新评估**：

| 决策 | 值 | 出处 |
|---|---|---|
| Phase 2 范围 | **A + C**（HTTP 请求 + 出站 WS Zod） | zeze 2026-04-19 明确选择 |
| 端点深度 | **all web-reachable endpoints**（10 HTTP + 9 outbound WS） | zeze 2026-04-19 明确选择 |
| Wave 1 校验栈 | **只校验请求体**；响应体不做 Zod；web 永远不 import zod | zeze 2026-04-19 明确选择 |
| 工具选择 | **Zod only**；不做 OpenAPI / tRPC / codegen 超出 TS 的东西 | 上一 agent 推荐 + zeze 接受 |
| 交付模型 | 所有 commit 先本地 main → 一次 push 到 GitHub → 后续走 PR | zeze 2026-04-19 明确接受 |
| CI/CD 推进节奏 | **先 Wave 0 再 Phase 2**（不是反过来） | zeze 接受了上一 agent 的解释 |
| Wave 0 接受项 | Dependabot, E2E CI, DB migration gate, Gateway CD, Supabase db push (manual dispatch), Prettier, CODEOWNERS | zeze 全选 |
| Wave 0 拒绝项 | Turborepo / pnpm workspaces, per-PR ephemeral backends, semantic-release, visual-audit in CI | zeze 同意拒绝（MVR stance） |
| Wave 2 rollout 策略 | **γ HYBRID**（dev/test/CI strict，prod log-only 观察 7 天再切 strict） | 上一 agent 推荐 + zeze 接受 |
| zeze 的 GitHub handle | `hellozim22` | zeze 2026-04-19 明确提供（CODEOWNERS 已写入） |
| 仓库 visibility | **Private**（MVP 阶段，不开源） | 上一 agent 推荐 |
| 铁律演进 | **三条铁律 → 四条铁律（C1 中立中继 / C2 加密存储 / C4 / C5 消息可回放）**；C1 允许持久化（旧"纯转发"措辞作废），C5 为新增 | zeze 2026-04-20 明确决定（plan §1.3 + D-REV-01） |
| 插件代码位置 | **monorepo 子目录 `plugins/openclaw/`**（非独立仓库）；发布节奏同步 OpenClaw SDK | zeze 2026-04-20 D1/D6 决策 |

### 3.2 等 zeze 决策的事（执行到此处必须 halt）

**这些是 agent 不能替代的产品 / 行为决策**。遇到时**立即停下问 zeze**，不要猜：

#### 🔴 Wave 1 Drift F：`system_prompt` 超长处理

**位置**：Wave 1 plan §2.3 drift F + §6.3 HALT condition 第 6 条  
**文件**：`gateway/src/routes/create-qrcode.ts`  
**现状**：当 `system_prompt` 字符串超过 1000 字时，**静默截断**（没有告诉 web，web 也不知道自己的输入被改了）。  
**Wave 1 要做的事要求你替换掉手写校验 → 改用 Zod**。但 Zod 无法"静默截断"—— 只能要么接受、要么 reject。

**两个选项**：
- **选项 X**：Zod 上 `z.string().max(1000)`，超长直接 `400 invalid_request` → **这是用户可见的行为变化**，web 前端也要同步加提示
- **选项 Y**：在 gateway handler 里 Zod 前截断（`body.system_prompt = body.system_prompt.slice(0, 1000)` 再喂给 Zod）→ **保持静默截断**，零行为变化

**agent 执行 Wave 1 T2d 之前必须问 zeze 选 X 还是 Y**。问的时候用这段话：

> zeze，Wave 1 Drift F 需要你决定 `system_prompt` 超过 1000 字怎么处理：
> - X：改成直接返回 400 错误（需要 web 前端同步加提示，行为变化，但契约干净）
> - Y：保持现在的静默截断行为（Zod 前手动 slice，行为零变化，但契约有个 "hidden truncation" 的脏补丁）
> 
> 推荐 Y（MVP 阶段最小惊讶），但你拍板。

#### 🔴 Wave 1 Drift G：Supabase Edge Function `claim-agent` 契约

**位置**：Wave 1 plan §2.2 / §9 #4  
**现状**：web 调 `PATCH /functions/v1/claim-agent`；handler 在 Deno runtime 里，没跟 shared/contracts 共享类型。  
**Wave 1 明确 defer 这一条**（plan §9 item 4）——**不要在 Wave 1 内修复它**。如果你写 Wave 1 时看到这个路径觉得"顺手也改一下"，**不要**，这会扩大 scope。

#### 🟡 Wave 2 strict flip 时机（γ → strict）

**位置**：Wave 2 plan §3.4 / T5  
**现状**：Wave 2 T5 要你在观测 7 天 zero failure 后把 feature flag 从 `log-only` 切到 `strict`。这个 7 天是自动发生不了的 —— **需要 zeze 在 commit log 里看到"7 天观测期到了"后明确说"现在切 strict"**。  
**Agent 的默认行为**：Wave 2 T5 执行前向 zeze 确认"观测期是否已到 + prom counter 是否为 0 + 是否 go"，得到 yes 才执行。

#### 🟡 CI 出现你无法修复的红 job

Task A 的 Part C1 要你观察首轮 CI。如果看到红 job：
- **如果是 format / prettier** → 你可以本地跑 `npm run format` 自动修
- **如果是 contracts-sync-check** → 你可以跑 `node scripts/sync-contracts.mjs` 自动修
- **其它红 job（tests / e2e / gateway-build / web-lint）** → 停下，把日志截给 zeze，不要猜

### 3.3 上一 agent 的几个细节决定（有据可查，默认跟随）

这些不是硬规则但已经这么做了，除非 zeze 让你改否则**保持一致**：

- Commit 信息用 **Conventional Commits** 风格（`feat:` / `fix:` / `docs:` / `chore:` / `ci:` / `refactor:` …）
- Commit body 用中英混排（主语 + 动词英文，解释和 rationale 中文 OK）
- 每个 commit 自包含单一逻辑单元 —— "多合一"的巨型 commit 不受欢迎
- 每次 `docs/refactor/execution-log.md` 顶部追加新 entry 时**必须列出 deviation**（哪怕是"无偏离"也明说）
- 任何 skip 的 check、任何 `--no-verify`、任何 force push **都要在 commit body 里解释**
- `.claude/skills/qrclaw-map/map.md` 的 "Further reading" 随每波重构更新（新 plan 路径要加进去）

---

## §4 Task A — GitHub 首次发布

> **Task A 的目的**：把本地 30 个 commit 首次推到 GitHub，让 Wave 0 的 CI/CD 真正开始跑起来。
>
> **分三段**：
> - Part A1–A8：⚠️ zeze 在 GitHub 浏览器里操作（agent 不能做）
> - Part B1–B7：agent 在本地 CLI 执行（zeze 不需要做）
> - Part C1–C6：⚠️ zeze 在首次 push 后做验收

### Part A — ⚠️ zeze（你）必须手动做的事

> 这些事**只有人类能在 GitHub 浏览器里点**。agent 没有 GitHub UI 权限，也拿不到你的账号。
>
> 建议按顺序做，勾选复选框跟踪进度。

#### A1. 创建 GitHub 仓库（5 分钟）

- [ ] 登录 GitHub，点右上角 **+ → New repository**
- [ ] Repository name：**`qrclaw`**（建议和本地目录同名，方便对照）
- [ ] Owner：你自己（`hellozim22`），不要放到 org
- [ ] **Visibility：选 Private**（MVP 阶段，`.github/CODEOWNERS` 和 CI/CD 配置暴露了完整攻击面）
- [ ] **Initialize this repository with** — **全部不勾**（README / .gitignore / license 都已在本地，勾了会产生 merge 冲突）
- [ ] 点 **Create repository**
- [ ] 记下仓库地址：`https://github.com/hellozim22/qrclaw.git` 或 SSH：`git@github.com:hellozim22/qrclaw.git`

#### A2. 准备 6 个 Repository Secrets（10 分钟）

进入 **Settings → Secrets and variables → Actions → New repository secret**，逐个添加：

| Secret 名称 | 值的来源 | 用途 |
|---|---|---|
| `DEPLOY_SERVER_IP` | 腾讯云 VPS 的公网 IP 或域名 | `deploy-gateway.yml` SSH 目标 |
| `DEPLOY_SSH_USER` | 部署用户名（通常 `ubuntu` 或 `root`） | `deploy-gateway.yml` SSH 登录名 |
| `DEPLOY_SSH_KEY` | 部署用户的**完整 PEM 私钥**（含 `-----BEGIN...`/`-----END...` 行） | `deploy-gateway.yml` SSH 鉴权 |
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens → Generate new（格式 `sbp_...`） | `deploy-supabase.yml` CLI 认证 |
| `SUPABASE_PROJECT_ID` | Supabase 项目 URL 的 slug（`https://<slug>.supabase.co`） | `deploy-supabase.yml` 项目定位 |
| `SUPABASE_DB_PASSWORD` | Supabase → Project Settings → Database → Connection String 的密码 | `deploy-supabase.yml` db push 认证 |

- [ ] 6 个 secret 全部添加完毕
- [ ] 用本地密码管理器（1Password / Bitwarden / Keychain）备份一份 — GitHub 添加后无法回看

> **⚠️ 如果部署用密码不是 SSH key**：先在 VPS 上 `ssh-keygen -t ed25519 -C "qrclaw-deploy"`，把公钥 append 到 `~/.ssh/authorized_keys`，私钥进 `DEPLOY_SSH_KEY`。密码鉴权不支持自动化。

#### A3. 创建 production environment（5 分钟）

进入 **Settings → Environments → New environment**：

- [ ] Name：**`production`**（必须小写，workflow 已硬编码）
- [ ] 点 Configure environment
- [ ] 勾 **Required reviewers** → 添加 `hellozim22`
- [ ] 其他默认保留
- [ ] 点 Save protection rules

#### A4. 启用 branch protection（5 分钟）

进入 **Settings → Branches → Add branch ruleset**（或 Add rule），针对 `main` 分支：

- [ ] Branch name pattern：`main`
- [ ] 勾 **Require a pull request before merging**
  - Required approvals：至少 1
  - 勾 **Require review from Code Owners**
- [ ] 勾 **Require status checks to pass before merging**
  - 勾 **Require branches to be up to date**
  - "Status checks" 输入框**暂时留空** — 首次 push 前 GitHub 不知道有哪些 check
  - **完成 Part C 首轮 CI 跑绿后回来**勾 6 个：`Format (Prettier)`、`Contracts sync check`、`Tests (Vitest)`、`Web (Lint + Typecheck + Build)`、`Gateway (Typecheck + Build)`、`E2E Smoke (Playwright chromium)`
- [ ] 勾 **Do not allow bypassing the above settings**
- [ ] 点 Create / Save changes

#### A5. 启用 Dependabot security（2 分钟）

进入 **Settings → Code security**：

- [ ] Dependabot alerts → **Enable**
- [ ] Dependabot security updates → **Enable**
- [ ] （version updates 由 `.github/dependabot.yml` 接管，UI 不用额外勾）

#### A6. 确认 Actions 权限（1 分钟）

**Settings → Actions → General**：

- [ ] Actions permissions：**Allow all actions and reusable workflows**
- [ ] Workflow permissions：**Read repository contents and packages permissions**
- [ ] 取消勾 "Allow GitHub Actions to create and approve pull requests"
- [ ] 点 Save

#### A7.（可选）选一个 LICENSE

- [ ] Private + 无外部协作者 → 跳过
- [ ] 可能给第三方审计 → GitHub UI 里 Add file → LICENSE template（推荐 MIT）

#### A8. 给发布 agent 的握手信息

完成 A1–A7 后，**把下面这段原样贴给发布 agent**（新窗口）：

```
qrclaw 仓库已在 GitHub 创建完毕：
- Remote URL (SSH):   git@github.com:hellozim22/qrclaw.git
- Remote URL (HTTPS): https://github.com/hellozim22/qrclaw.git
- 默认分支: main
- Secrets: 已配置（DEPLOY_SERVER_IP / DEPLOY_SSH_USER / DEPLOY_SSH_KEY /
           SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_ID / SUPABASE_DB_PASSWORD）
- Environment: production 已配置 required reviewer = hellozim22
- Branch protection: main 已启用（required checks 待首轮 CI 绿后再勾）

请先读 /Users/zeze/qrclaw/docs/release/github-publish-guide.md 全文，
然后按 Part B 执行 push。Task A 完成后直接继续 Part C 等我验收。
Task A 完成且 Part C 验收通过后，直接启动 Task B（Phase 2 Wave 1），
按 §5 的指引执行。Task B 完成后继续 Task C（Phase 2 Wave 2），按 §6。
```

---

### Part B — 发布 agent 的执行剧本

> 对照本节执行。每一步做完打勾，遇到非预期结果立即停下报告 zeze，**不要猜**。

#### B0. 前置检查

```bash
cd /Users/zeze/qrclaw

git status                      # 必须 clean
git log --oneline -3            # 顶部应是 861730f 或更新
git branch --show-current       # 必须 main
git rev-list --count HEAD       # 必须 ≥ 30
git remote -v                   # 必须空；有输出见 §9 D1
```

- [ ] 五个检查全通过；任何一步异常立即停下。

#### B1. 敏感文件最后防线扫描

```bash
find . -maxdepth 4 -type f \
  \( -name ".env" -o -name ".env.local" -o -name ".env.production" \
     -o -name "*.pem" -o -name "id_rsa" -o -name "id_ed25519" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -name "*.example"

git log --all --full-history -p 2>/dev/null \
  | grep -E "(sbp_[A-Za-z0-9]{40,}|AKIA[0-9A-Z]{16}|-----BEGIN.*PRIVATE KEY|password[[:space:]]*=[[:space:]]*['\"][^'\"]{8,})" \
  | head -20
```

- [ ] 两个命令**零输出**（仅 `.example` 模板不算）

**如有 hit**：**不要 push**。报 hit 给 zeze，由他决定 `git-filter-repo` 清理还是 redact。**绝不 force-push 绕过**。

#### B2. 配置 git blame 忽略格式化 commit（可选但建议）

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

#### B3. 添加 remote

```bash
GITHUB_URL="git@github.com:hellozim22/qrclaw.git"   # 以 zeze 提供为准
git remote add origin "$GITHUB_URL"
git remote -v
git ls-remote origin 2>&1 | head -5
```

- [ ] `ls-remote` 不报错
- [ ] 远端**为空**（无 ref 返回），或只有默认分支占位
- [ ] 若远端已有 ref（如 README commit），停下看 §9 D1

#### B4. 首次推送

```bash
git push -u origin main 2>&1 | tee /tmp/qrclaw-first-push.log
```

- [ ] exit 0
- [ ] 末尾含 `* [new branch]      main -> main`
- [ ] 含 `Branch 'main' set up to track remote branch 'main'`

#### B5. 验证 push + workflow 登记

```bash
git log --oneline origin/main | wc -l          # 必须 ≥ 30
git log --oneline origin/main | head -5
ls .github/workflows/
```

- [ ] 远端 commit 数 ≥ 本地
- [ ] 4 个 workflow 文件都在

**关键观察**：push 成功**立刻**触发 `ci.yml` 的 `push` trigger — 6 个 job 开跑。

#### B6. 创建版本标签

```bash
git tag -a v0.1.0-initial-public-push \
  -m "First push to GitHub after Phase 1 contracts SSoT + CI/CD Wave 0 hardening.

Scope:
  - shared/contracts/ws/ SSoT with sync script + CI gate
  - .github/workflows/: ci, deploy-gateway, deploy-supabase, supabase-migration-check
  - Prettier formatting enforced, CODEOWNERS, dependabot
  - 696/696 vitest tests passing locally

Follow-ups tracked in docs/refactor/execution-log.md."

git push origin v0.1.0-initial-public-push
```

- [ ] tag push 成功（`git ls-remote --tags origin` 可见）

#### B7. 向 zeze 交付

向 zeze 发以下**一条**总结消息：

```
✅ qrclaw 首次发布到 GitHub 完成。

- Remote: <URL>
- Branch pushed: main (30+ commits)
- Tag pushed: v0.1.0-initial-public-push
- Workflows visible on Actions tab: 4 files
- First CI run: https://github.com/hellozim22/qrclaw/actions

下一步（zeze）：按 docs/release/github-publish-guide.md Part C 做首次 CI 绿灯验收，
然后回到 Settings → Branches → main，把 6 个 required status check 名字勾上。
我正在等你的"Task A 验收完成"指令，然后就直接进 Task B（Phase 2 Wave 1）。
```

- [ ] 已向 zeze 交付

> **⚠️ deploy-gateway workflow 的首次 push 风险**：首次 push 会让 GitHub 把全部文件判为 "changed"，`deploy-gateway.yml` 的 path filter `gateway/**` 会命中。**agent push 后请立刻监控 Actions tab**，如看到 `Deploy Gateway` 排队等 approve → **不要告诉 zeze approve**，先停下，让 zeze 先 SSH 到 VPS 确认 `/opt/qrclaw` 状态，再 approve。

---

### Part C — ⚠️ zeze 在首次 push 后做的验收

#### C1. 观察首轮 CI（Actions tab）

- [ ] 看到至少一次运行（"CI" workflow，`push` trigger）
- [ ] 6 个 job 逐个变绿：
  - Format (Prettier)
  - Contracts sync check
  - Tests (Vitest) — 696/696 pass
  - Web (Lint + Typecheck + Build)
  - Gateway (Typecheck + Build)
  - E2E Smoke (Playwright chromium)
- [ ] `Supabase Migration Check` **不运行**（正常，path filter）
- [ ] `Deploy Gateway` **排队等 approve**（见上方风险提示）
- [ ] `Deploy Supabase` **不运行**（只能 workflow_dispatch）

**红 job 处理**：见 §3.2 最后一条。

#### C2. 把 required check 名字勾进 branch protection

回到 **Settings → Branches → main**：

- [ ] 搜索 + 勾选 6 个 check 名字（和 C1 一致）
- [ ] Save

#### C3. （推荐）dry-run PR

- [ ] 本地 `git checkout -b chore/test-ci-gates`，改 README 加一行
- [ ] push，开 PR
- [ ] 验证 6 check 全绿 + CODEOWNERS approve 要求生效
- [ ] Approve → Merge，删分支

#### C4. 验证 Dependabot

- [ ] **Insights → Dependency graph → Dependabot**
- [ ] 看到 6 个扫描源（root / web / gateway / shared / tests / github-actions）

#### C5. （可选）dry-run Supabase dispatch

- [ ] **Actions → Deploy Supabase (db push) → Run workflow**
  - confirm: `I-UNDERSTAND-PROD`
  - dry_run: `true`
  - include_functions: `false`
- [ ] Approve 后查看 step summary 的 Schema diff
- [ ] 无 secret 值泄漏到 log

#### C6. 通知 agent 进入 Task B

完成 C1–C5 后，在 agent 会话里说：

```
Task A 全部验收完成。required status checks 已勾。
现在进入 Task B，按 docs/release/github-publish-guide.md §5 执行。
```

agent 会继续。

---

## §5 Task B — Phase 2 Wave 1 实现指引

> **真相源**：`docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave1-http-contracts.md`  
> **本节目的**：在不复述 plan 的前提下，给 agent 提供启动 5 分钟需要知道的事 + halt 条件 + done 标准。

### 5.1 启动前 5 分钟必读清单

**按以下顺序全部读完，再开始写第一行代码**：

1. `docs/superpowers/plans/2026-04-19-qrclaw-phase2-index.md` — 两 wave 总图（10 分钟）
2. `docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave1-http-contracts.md` — **全文 776 行**（40 分钟；你是执行者，不能跳读）
3. `docs/superpowers/plans/2026-04-19-qrclaw-phase1-refactor.md` — Phase 1 plan（30 分钟；pattern 来源）
4. `shared/contracts/ws/{types,protocol,index}.ts` + `shared/contracts/README.md` — 现有 SSoT 实现（20 分钟）
5. `tests/unit/shared/contracts-ws-protocol.test.ts` — parity test pattern（10 分钟）
6. `scripts/sync-contracts.mjs` — 同步脚本（10 分钟）
7. 本文件 §3.2 + §3.3 — 决策边界（再读一次）

**总计 ~2 小时阅读**。不要跳过，Phase 2 的每个 task 都假设你读过这些。

### 5.2 使用 superpowers:subagent-driven-development skill 执行

Wave 1 plan 顶部已经要求用 `superpowers:subagent-driven-development`。简述该 skill 要你做的事：

- **串行 implementer subagent**：一次只做一个 task（T1 → T2a → T2b → …）。
- **并行 reviewer subagent**：每个 task 完成后，同时派 `code-reviewer` + `spec-reviewer` 两个 subagent 做 cross review。
- **TDD 纪律**：每个 Zod / 类型改动先写**失败**的 parity test，跑 → 实现 → 跑 → commit。
- **每个 task 一次 commit**（或 2 个，分"测试先行"和"实现落地"）。

如果你自己不是 Cursor IDE 的 Opus 4.7 agent（这个 playbook 面向任何 agent），以下回退策略都接受：
- 你只有 CLI 没有 subagent → 用 **git branch-per-task** 策略：每个 task 开临时分支、测试绿、合并回 main
- 你有但不喜欢 subagent → 自己一人分饰三角，但每个 task 结尾必须做一次**显式** code-review 步骤（在 commit message 里写明你自查了哪几个问题）

### 5.3 Task 清单速览（完整细节见 plan §4）

| Task | 名称 | 文件数 | 预计时间 |
|---|---|---|---|
| T1 | Scaffold `shared/contracts/http/` + `validateRequest` middleware | 5–8 | 45 分 |
| T2a | `tickets` domain（2 endpoints） | 4 | 30 分 |
| T2b | `messages` domain（1 endpoint） | 3 | 25 分 |
| T2c | `subscribers` domain（1 endpoint） | 3 | 25 分 |
| T2d | `qrcodes` domain（1 endpoint，最大 payload） | 4 | 40 分（⚠️ 含 drift F 决策点）|
| T3 | Web callers consume shared types | 多 | 40 分 |
| T4 | Sync-check scope decision + README | 2 | 20 分 |
| T5 | 更新 `qrclaw-map` skill 的 "add-endpoint" recipe | 1 | 15 分 |
| T6 | （可选）pre-existing drift 回归测试 | 1–3 | 20 分 |
| C1 | 最终六栏验收 | 0 | 10 分 |

### 5.4 硬性 halt 条件（遇到立即停下）

| 条件 | 做什么 |
|---|---|
| 🔴 走到 T2d 要处理 drift F | 按 §3.2 的措辞问 zeze 选 X 还是 Y，等回复 |
| 🔴 发现 T2 某 domain 的 endpoint 在 plan §2 没列出（plan 漏了） | 停下，报给 zeze，让他确认是新增端点还是 plan 不准 |
| 🔴 spec-reviewer subagent 返回 DONE_WITH_CONCERNS > 1 个严重 concern | 停下，逐个解决或报 zeze |
| 🔴 需要新增 shared/ 或 web/ 的依赖（除了已有的 zod / react / next） | 停下问 zeze —— 依赖增加是长期负担 |
| 🔴 六栏验收有新增失败（不是 pre-existing warning） | 停下修，不是 "ignore for now" |
| 🟡 发现一个 drift 在 plan §2.3 没列出 | 不停，但记到 deviation 栏，commit body 里说明 |
| 🟡 实现中需要 refactor 一个 plan 没提到的 shared utility | 允许，但额外 commit 单列，commit subject 用 `refactor:` |

### 5.5 Done 标准（Wave 1 完全结束的 5 个硬指标）

- [ ] 5 个带 JSON body 的 endpoint 全部走 `validateRequest(schema)` middleware
- [ ] `shared/contracts/http/` 有 5 个 domain 目录（tickets / messages / subscribers / qrcodes / + barrel index）
- [ ] `tests/unit/shared/contracts-http-*.test.ts` 覆盖每个 endpoint 的 parity + accept + reject
- [ ] `grep -r "from 'zod'" web/src` 仍然 **零结果**（web bundle 无 zod）
- [ ] 六栏验收全绿，vitest 总数 ≥ 696 + 新增（预计 +15 ~ +25）
- [ ] `docs/refactor/execution-log.md` 顶部追加 Wave 1 entry（含 commit 表 + deviation）
- [ ] `.claude/skills/qrclaw-map/map.md` 的 "add a new endpoint" recipe 被更新

### 5.6 Wave 1 执行后的交付消息

Wave 1 做完，向 zeze 发：

```
✅ Phase 2 Wave 1 (HTTP 契约 SSoT) 全部完成。

- Commits: <list SHAs>（X 个）
- 新增测试: Y 个（总计 696+Y）
- 发现并处理的 drift: 5 条（§2.3 A-E 全部命中）
- Drift F 决策: <X 或 Y>（per zeze's call）
- 六栏验收: 全绿
- PR merge 情况: 全部通过 CI gate

下一步建议: 让我休息一天（或立即），然后进 Task C（Phase 2 Wave 2），
按 docs/release/github-publish-guide.md §6 执行。

Execution log 顶部已更新：docs/refactor/execution-log.md
```

---

## §6 Task C — Phase 2 Wave 2 实现指引

> **真相源**：`docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave2-outbound-ws.md`  
> **前置**：Wave 1 所有 commit 已在 main 上、六栏绿。

### 6.1 启动前必读清单

1. Wave 2 plan **全文 651 行**（40 分钟；不能跳读）
2. Phase 2 index 的 §"两波之间的跨引用一致性" —— 明确 Wave 1 把 sync-contracts 扩展了什么
3. 本文件 §3.2（Wave 2 strict flip 的 halt 条件）
4. `shared/contracts/ws/outbound.ts`（**应该不存在**，Wave 2 T1 创建）— 如已存在，有人提前动过，停下报 zeze
5. `gateway/src/ws/handler.ts` + `gateway/src/ws/router.ts` —— 找出全部 `ws.send(...)` 点。**Wave 2 plan §2.2 列了 15 个 emit site，你必须 re-grep 确认数量仍然是 15**（因为 Wave 1 可能变动 gateway）
6. `gateway/src/monitoring/perf.ts` —— prom-client 已接入，Wave 2 T4 复用它加 counter

### 6.2 前置检查 —— Wave 1 是否真的落地了

```bash
# A. shared/contracts/http/ 存在且非空
ls shared/contracts/http/ && test -s shared/contracts/http/index.ts
# B. gateway 的 routes 都用 validateRequest
grep -rn "validateRequest" gateway/src/routes/ | wc -l  # 期望 >= 4
# C. web 不 import zod
! grep -rn "from 'zod'" web/src
# D. 测试已经稳定在 696 + Wave 1 新增
npm --prefix tests run test -- --reporter=dot 2>&1 | tail -3
```

如果 A–D 有任一不满足，说明 Wave 1 还没真的完 —— **不要启动 Wave 2**，回到 §5。

### 6.3 γ HYBRID rollout 关键点

Wave 2 plan §3.4 选了 γ。简单讲：
- **Dev / Test / CI**：strict mode（outbound frame 校验失败 → drop frame + throw in test）
- **Prod**：log-only mode（outbound frame 校验失败 → pino warn + prom counter，但 frame 仍发出去）
- **观察 7 天 prom counter = 0** → 翻 feature flag 到 strict in prod

这个 rollout **跨越了多个 deploy 周期**，不是一个 session 就能完成：

```
T1–T3 本 session：在代码里加 schemas + sendFrame + 迁移所有 emit site
T4 本 session：加 observability（counter + log）
T5 非本 session：
  - 先在 CI / test flip strict（即刻）
  - 然后 commit 等 merge → auto deploy（log-only 默认生效在 prod）
  - 7 天后 zeze 拉 metrics / log 确认 zero failure
  - zeze 发消息："7 天观测期满，metrics 干净，flip 到 strict"
  - agent 再做 T5 的 flip commit
T6 本 session：更新 qrclaw-map recipe
```

**这意味着 Wave 2 本次 session 只做到 T4 为止，然后等 7 天，再回来做 T5 + T6**。

### 6.4 Task 清单速览（完整细节见 plan §4）

| Task | 名称 | 本 session | 预计 |
|---|---|---|---|
| T1 | 出站 schemas + parity tests | ✅ 本 session | 60 分 |
| T2 | `sendFrame()` helper + feature flag + counter | ✅ 本 session | 45 分 |
| T3a–T3e | 迁移 15 个 emit site（按 domain 分 5 个子 task） | ✅ 本 session | 90 分 |
| T4 | Observability wiring（counter + dashboard / log 格式） | ✅ 本 session | 30 分 |
| **T5** | **Flip flag from log-only → strict（prod）** | ❌ **等 7 天，zeze 触发** | 15 分 |
| T6 | 更新 qrclaw-map recipe | ✅ 本 session | 15 分 |
| C1 | 六栏验收 | 本 session 每个 task 完成时 | 10 分 |

### 6.5 硬性 halt 条件

| 条件 | 做什么 |
|---|---|
| 🔴 re-grep 发现 emit site 数量 ≠ 15 | 停下，更新 plan §2.2 并让 zeze 知道 drift 对象多了或少了 |
| 🔴 看到一个新的 outbound frame 类型没在 plan §2.1 列出 | 停下，加到 plan + 告诉 zeze |
| 🔴 测试里发现手写的 mock frame 和新 Zod schema 冲突 | 不是停下，改 mock 让它符合 schema；但如果 mock 来自 `tests/acceptance/mock-agent.ts` → 谨慎，那是真实 agent SDK 的样本，改动可能破坏集成测试 |
| 🔴 T5 的 flip 时机到了但 zeze 没说 go | **绝对不要** 自己 flip。默认值 `log-only` 持续运行是安全的 |
| 🟡 stream_chunk 的 Zod 验证使延迟测试变红 | 跑 benchmark（Wave 2 plan R1），如开销 < 0.5ms/帧 → 接受；≥ 1ms → 报 zeze 讨论放宽 |

### 6.6 Done 标准（session 结束时，不含 T5 flip）

- [ ] `shared/contracts/ws/outbound.ts` 含全部 outbound frame 的 Zod schema
- [ ] `gateway/src/ws/send.ts` 有 `sendFrame(ws, frame)` helper
- [ ] 所有 15 个 emit site 通过 `sendFrame` 发送，**没有裸 `ws.send(...)`** 残留（`grep -rn "ws.send" gateway/src/` 只剩 send.ts 自己）
- [ ] Feature flag：`gateway/.env.example` + `gateway/src/config/feature-flags.ts` 有 `QRCLAW_OUTBOUND_VALIDATION` 变量（值：`strict` / `log-only`），默认 `NODE_ENV !== 'production'` → `strict`，prod → `log-only`（和 Wave 2 plan §3.4 一致）
- [ ] Prom counter `outboundValidationFailures` 存在且在集成测试里能被 assert 增加
- [ ] 六栏全绿 + vitest 新增 ≥ 20 个 case
- [ ] execution-log 顶部追加 Wave 2 entry，状态标注为 **"T1–T4 + T6 landed; T5 pending 7-day observation window"**

### 6.7 session 交付消息

```
✅ Phase 2 Wave 2 (outbound WS) T1–T4 + T6 全部完成。
⏳ T5 flip 等待 7 天观测窗口（prod 默认 log-only 运行）。

- Commits: <list SHAs>
- 新增测试: X 个（总计 ≥ 716 + Y）
- 处理的 drift: 7 条（§2.3 D1-D7）
- Feature flag 当前状态:
   - test/ci/dev: strict
   - prod: log-only（等 7 天）
- 六栏验收: 全绿

下一步（zeze）:
1. 观察 prod 日志 7 天
2. 7 天后如果 `outboundValidationFailures` counter == 0 → 告诉 agent "flip to strict"
3. agent 会做 T5 commit（翻 flag + verify + 部署）
```

---

## §7 跨任务执行约定

### 7.1 Commit 格式（强制）

Conventional Commits：
```
<type>(<scope>): <short subject>

<body: Chinese OK>

<footer>
```

type 可选：`feat` / `fix` / `docs` / `chore` / `ci` / `refactor` / `test` / `perf` / `build`  
scope 通常是目录：`shared` / `gateway` / `web` / `tests` / `plan` / `cd` / `ci` / `gov` / `format`

**示例**（从现有 commit 摘）：
```
feat(shared): add http request contracts for tickets domain

为 /api/visitor-ws-ticket 和 /api/agent-ws-ticket 两个端点补 Zod schema
+ TS interface。web 端 ticket.ts 改为从 @shared/contracts/http 导入类型。
对齐 Phase 1 的 ws/types.ts + ws/protocol.ts 分离模式。

Closes Wave 1 T2a.
```

### 7.2 六栏验收（每个 commit 前跑）

```bash
# Lane 1: Prettier
npm run format:check || (echo "❌ format"; exit 1)

# Lane 2: Contracts sync
node scripts/sync-contracts.mjs --check || (echo "❌ sync"; exit 1)

# Lane 3: Gateway tsc
npm --prefix gateway run typecheck || (echo "❌ gateway tsc"; exit 1)

# Lane 4: Web lint
npm --prefix web run lint || (echo "❌ web lint"; exit 1)

# Lane 5: Vitest
npm --prefix tests run test || (echo "❌ vitest"; exit 1)

# Lane 6: Workflows YAML
for f in .github/workflows/*.yml; do
  python3 -c "import yaml; yaml.safe_load(open('$f'))" || (echo "❌ yaml $f"; exit 1)
done

echo "✅ 六栏全绿，可以 commit"
```

### 7.3 Execution log 追加模板

每波任务结束 commit 前，在 `docs/refactor/execution-log.md` **顶部**追加：

```markdown
## YYYY-MM-DD — <WAVE NAME>: <ONE-LINE SUMMARY>

**Plan:** [link to plan]

**Goal:** <1-2 句>

### Scope decision
- Accepted: <list>
- Rejected: <list>

### Commit sequence
| # | SHA | Subject |
|---|---|---|
| ... |

### Deviations from plan
1. ...（没有就写 "本轮无偏离"）

### Verification
- 六栏验证: <结果>
- 新增测试数: <N>

### Known follow-ups
- ...

### Files added/modified
- ...

---
```

### 7.4 回滚（如果某个 commit 破坏了 main）

- 小问题 → 下一个 commit 修
- 严重问题（CI 红 > 1 job） → `git revert <SHA>` 一个 commit 级回滚；**不要** `git reset --hard` 强推
- 如果 PR 还没 merge → 直接 close PR 重新开

### 7.5 Agent 遇到不确定时的默认动作

优先级：
1. **读 plan 里的对应章节** — 大概率答案在里面
2. **读 execution-log 的 deviation 栏** — 看历史是否遇到过类似情况
3. **grep codebase** — pattern 答案通常在已有代码里
4. **读 `.claude/skills/qrclaw-map/map.md`** — 高层导航
5. **都查了还不确定** → 停下问 zeze，不要瞎猜

---

## §8 Reading list / 所有相关文档的位置

按建议阅读顺序：

### 启动必读（全部 agent）

| # | 文件 | 规模 | 用途 |
|---|---|---|---|
| 1 | 本文件（`docs/release/github-publish-guide.md`） | 你在读 | 入口 |
| 2 | `.claude/skills/qrclaw-map/map.md` | 中 | 项目全貌导航 |
| 3 | `CLAUDE.md` / `AGENTS.md` | 短 | 项目根部指令 |
| 4 | `docs/refactor/execution-log.md` | 中 | 历次重构的偏离记录 |

### Phase 2 启动前（Task B / C agent）

| # | 文件 | 规模 | 用途 |
|---|---|---|---|
| 5 | `docs/superpowers/plans/2026-04-19-qrclaw-phase2-index.md` | 小 | 两波总图 |
| 6 | `docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave1-http-contracts.md` | **776 行** | Wave 1 真相源 |
| 7 | `docs/superpowers/plans/2026-04-19-qrclaw-phase2-wave2-outbound-ws.md` | **651 行** | Wave 2 真相源 |
| 8 | `docs/superpowers/plans/2026-04-19-qrclaw-phase1-refactor.md` | 长 | Phase 1 pattern 来源 |
| 9 | `shared/contracts/README.md` + `shared/contracts/ws/` 全量 | 中 | 现有 SSoT 实现 |
| 10 | `tests/unit/shared/contracts-ws-protocol.test.ts` | 小 | parity test 模板 |

### 按需查阅（遇到特定问题时）

| 场景 | 文件 |
|---|---|
| CI / 部署问题 | `.github/workflows/*.yml` + `docs/superpowers/plans/2026-04-19-qrclaw-cicd-wave0.md` + `docs/ci-cd-optimization-plan.md` |
| Supabase 相关 | `supabase/MIGRATION_GUIDE.md` / `supabase/PRODUCTION_CHECKLIST.md` / `supabase/EDGE_FUNCTIONS_ENV.md` |
| WebSocket 协议原始 spec | `requirements/technical-specification-supplement-protocol.md` |
| 如何加新 WS frame（Phase 1 流程） | `.claude/skills/qrclaw-map/map.md` §"How to add a new WS frame" |
| Cursor Cloud / dev 环境注意 | `AGENTS.md` |

---

## §9 常见问题与回滚

### D1. remote 已经有内容怎么办？

如果 zeze 在 A1 勾选了 "Initialize with README"，GitHub 会在远端创建一个带 commit 的 `main`，push 会冲突。

**D1a. 清空远端（更干净）**  
GitHub UI → Settings → Danger Zone → Delete → 重建（不勾 initialize） → 重跑 Part B。

**D1b. 合并远端（更保守）**
```bash
git fetch origin
git rebase origin/main        # 把本地 30+ commit 搬到远端 init commit 之上
git push -u origin main
```

### D2. push 被拒 "secret detected"

GitHub Push Protection 会拦截疑似 secret。
- 真 secret → `git-filter-repo` 清理历史，绝不 `--allow-secret` bypass
- false positive（如 `.env.example` placeholder）→ push 输出的 "mark as false positive" 链接

### D3. workflow 首次跑不出来

- Settings → Actions → General：是否被设为 "Disable Actions"
- workflow 文件 `on:` 是否匹配 push branch

### D4. 回滚整次 GitHub 发布

```bash
# 本地
git remote remove origin
git tag -d v0.1.0-initial-public-push

# 远端（GitHub UI → Settings → Danger Zone → Delete）
```

30 个本地 commit 完整保留。

### D5. Wave 1 / 2 实现时某 commit 挂了 CI

- `format-check` 挂 → 本地 `npm run format` 修，追加 commit
- `contracts-sync-check` 挂 → `node scripts/sync-contracts.mjs` 修，追加 commit
- `tests` / `e2e` / 其它 → 读 CI 日志，修具体问题，**不要 skip**；如无法修，`git revert` 那个 commit

### D6. zeze 改主意了，要反悔某个已锁决策

符合预期的流程：
1. agent 停下当前任务
2. 在 `docs/refactor/execution-log.md` 追加一条 "Decision reversal" entry
3. 在**本文件 §3.1** 把原决策标为 `~~废弃~~`，在 §3.2 新增"重新决策"条目
4. 等 zeze 给新决策，再继续

### D7. zeze 要暂停整个重构

- Agent 把当前未 commit 的改动 stash：`git stash push -m "pause: <reason>"`
- 报告 zeze 当前在哪个 task 的哪个 step
- 下次恢复时：`git stash pop` + 从 §5 / §6 对应 task 重新 "启动前必读清单"

### D8. agent 迷路了 / 陷入循环

三条自救：
1. 读 §3.2 —— 你是不是在一个 halt 条件上？
2. 读 §7.5 —— 走默认动作 1→5
3. 本文件顶部框的 "启动时强制动作" 里有没有漏做？

还不行 → 停，告诉 zeze "我陷入循环，当前 task = X，观察到 Y，不知道 Z，请给指示"。

---

## 文档修改历史

- **2026-04-19 v1.0**：初版（仅含 Task A 的 Part A/B/C/D）
- **2026-04-19 v2.0**（本版）：扩展为完整交接 playbook，加入 §0 项目背景、§1 状态快照、§2 任务依赖、§3 决策日志、§5 Task B Wave 1 指引、§6 Task C Wave 2 指引、§7 跨任务约定、§8 reading list；原 Part A/B/C/D 收敛到 §4。为解决上一 agent（Cursor Opus 4.7）上下文窗口即将满载、zeze 将在另一窗口启动继任 agent 的交接诉求。

---

**END — 这份文件就是你（接手 agent）的全部记忆。**  
**执行前最后一次自检**：
- 你读完了 §0、§1、§2、§3、§7 吗？
- 你知道当前应该从哪个 Task 开始吗？（§2 给了答案：从 Task A Part B 开始，如果 zeze 已完成 Part A）
- §3.2 里是否有 halt 条件现在就阻塞你？（如果有，**先问 zeze**）
- 你知道六栏验收命令在 §7.2 吗？

全部 yes → 开干。全部 yes 之前 → **再读一遍**。
