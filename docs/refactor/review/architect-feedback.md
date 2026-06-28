# 架构评审报告（架构师 + 实施顾问视角）

> **评审日期**: 2026-04-19
> **评审者**: generalPurpose subagent (architect mindset)
> **对象**: `docs/refactor/refactor-plan.md` v1.0-draft + `tasks/README.md` + `tasks/T0-audit.md`
> **参考**: qrclaw 实际目录、`~/txbbs/docs/txbbs-conventions/`、`~/txbbs/.cursor/skills/txbbs-conventions/`

---

## 一句话结论

**计划写得体面、结构工整、对齐良好，但它是一份"为 10 人团队 + 100K LOC 项目"设计的重构计划，套在"1–2 人 + 22K LOC + MVP 0.5.0 尚未过 PMF"的 QRClaw 身上会严重消耗产品 velocity；建议把它砍到 Phase 1 + Phase 5 lite 两个阶段，Phase 2/3/4 延后到"第二个全职开发加入" 或 "单模块 LOC 翻倍" 这两个触发条件其中之一满足时再做。**

---

## 整体评分（1–10）

| 维度 | 评分 | 理由 |
|---|---|---|
| **战略合理性** | 5/10 | "不拆仓"的判断正确，但"全量 6 Phase 重构"的必要性没有论证；是在"项目没有重构压力的时候，按最佳实践给自己设计重构"。 |
| **架构设计** | 6.5/10 | `contracts/` 思路正确；`features/` 方向主流但边界留白；分层红线纸面合理但 1–2 人团队约束成本>收益；Deno/Node 契约互通这个**最硬的技术难点**被一句"相对路径 import"带过了。 |
| **可执行性** | 7/10 | 任务卡粒度合适，T0 的审计可自动化；Phase 3/4 的"每域一 PR"是对的；但 `database.types.ts` 与 `domain/*.ts` 的同步、Deno 环境下的 Zod 4 import、tsconfig paths 跨三端 的落地细节几乎全部缺失。 |
| **风险控制** | 5/10 | 列出的风险偏静态；漏掉了几个关键的"活跃风险"：重构期 hotfix 分支策略、契约变更的 SemVer、RLS 不被视为契约、tsconfig/import_map 跨运行时维护成本。 |
| **ROI 匹配度** | 3/10 | 22K LOC + 1–2 人 + MVP 0.5.0 状态下花 6 周做架构重构，回本周期估算显示不划算。计划自己也说"当以下条件满足 2 条时再拆仓"——同样的"触发条件"逻辑应当被施加到 features/ 重组和 skill 体系上，但没有。 |

---

## 🎯 关键战略质询（按重要性排序）

### ① **产品阶段与投入不匹配——这是最大的问题**

QRClaw 当前状态：

- 版本 0.5.0（MVP 刚完成），验收 30/30 PASS；
- 核心产品假设（Owner + Visitor + QR → AI Agent 对话）**还没有经过市场检验**；
- `requirements/product-requirements.md` V3.0 是"V2 做什么/不做什么"——产品形态还在收敛；
- 1–2 人团队，按计划 Week 1–6 全部投入重构，等同于"产品停转 6 周"。

**反问**：
- 如果这 6 周用于"让 500 个 Visitor 真的扫过二维码并完成对话"，学到的东西是不是比"代码更整洁"值钱 10 倍？
- MVP 阶段还没触达的最可怕风险是**方向错了**，不是**代码乱了**。现在最应该防的是 over-engineering，不是 type drift。
- 计划自己在 §1.1 用"50K LOC"作为拆仓阈值——为什么对 features/ 重组和 skill 体系不用同样的阈值逻辑？

**如果你必须给我一个"现在就要动"的理由**，我能接受的只有一个：**WebSocket 协议在两端独立维护已经出过线上 bug**（审计一下最近 3 个月的 bug 清单，如果至少 2 个 bug 根因是 WS 协议漂移，Phase 1 就值得做）。

### ② **"不拆仓"判断是对的，但用了错的理由**

**正方 3 点**（计划提到的）：
- 22K LOC 远低于 50K，分仓管理成本 > 收益。✅
- 1–2 人团队，分仓会把少得可怜的开发时间切得更碎。✅
- 外部消费者为 0，不需要独立版本管理。✅

**反方 3 点**（计划没提但重要）：
- **分仓最大的动机是"让多人能并行但不互相破坏"**——在 1–2 人团队下这个需求根本不存在，"多 agent 并行"是伪需求（见质询 ④）。
- **qrclaw 已经有 `web/` `gateway/` `supabase/` 三个独立 package**——分仓能带来的"独立构建/部署/CI"**已经拿到了**；再"不拆"其实没有什么是能进一步"不拆"的。
- **Next.js 对 monorepo 的 path alias 跨 package 支持是有坑的**（特别是 Turbopack + Vercel 构建），引入 `contracts/` 作为第 4 个 package 反而增加了 Next 构建复杂度。

**折中替代（我推荐的）**：**"逻辑 contracts + 物理共享文件夹，不做 workspace package"**
- 建 `shared/contracts/` 而不是独立 npm package；
- 三端通过 **tsconfig paths + symlink** 或**文件复制 + codegen 脚本**引用；
- 避开 npm workspaces + Deno 跨包 import 的噩梦；
- 1 天可完成，而非计划的 3–5 天。

### ③ **Deno ↔ Node 契约互通是"被低估的地雷"**

计划 §6.1 风险表："Supabase Edge Functions 无法引用 contracts（Deno vs Node）" → **概率中 / 影响中 / 应对：契约全部用纯 TS + Zod，不依赖 Node-only 包；Deno 通过相对路径 import**。

这句话过度乐观。现实情况：

| 问题 | 真实成本 |
|---|---|
| Deno 的 `import` 必须写 `.ts` 后缀（Node 默认不写），同一文件不能两端都 OK | 需要 bundler 或 dual-package 发布 |
| Zod 4 是 ESM，Deno 通过 `npm:zod@4` 或 `https://esm.sh/zod@4` 都可以，但**版本漂移极容易**——gateway 升级 Zod 时 Deno 端不会自动跟 | 需要 CI 检查或统一锁版本 |
| Deno 对 `@contracts/*` 别名依赖 `deno.json` 的 `imports`，与 Node 的 `tsconfig paths` 是**两套机制**，两边都要维护 | 每次改 contracts 目录结构要改两个映射文件 |
| Supabase CLI 部署 Edge Function 时会打包——如果 contracts 在 repo 根而 function 在 `supabase/functions/foo/`，打包边界需要配置 | 不配置 `deno.json` 的 `importMap` 一定部署失败 |
| 生产 Edge Function 冷启动时间 ~100–300ms，引入 contracts 增加 import chain 会恶化 | 需要 benchmark 后决策 |

**真正应对方案**（计划缺失）：
1. **Phase 1 的第一个 PR 应当是一个"契约互通 spike"**：用 1 天时间验证一个最简单的 `contracts/src/domain/qrcode.ts` 能被 web / gateway / 一个 Supabase function 同时正确引用并通过各自的 typecheck + Edge Function 本地 `supabase functions serve` 能运行。
2. **如果这个 spike 失败**，立刻退回到"Supabase functions 复制 contracts 类型"的方案（用 pre-commit hook 同步）——这是**对 QRClaw 规模完全可接受**的退化方案。

**没做这个 spike 就进入全量 Phase 1 是高风险赌博。**

### ④ **"多 Agent 并行"在 1–2 人团队是伪需求**

计划 §3.3 画了前端 agent / gateway agent / backend agent 三路并行的拓扑。

**真实情况**：
- 1–2 个人 + 1 个主力 AI agent 的场景下，实际工作模式是**一个人串行地请 AI 做一件事，改完审完再做下一件**；
- "前端 agent 和 gateway agent 并行"几乎只在团队 ≥ 3 人并且 3 个人用 3 个独立 agent 会话时才成立；
- 现在投入建 ESLint boundaries + contracts-approved PR 标签 + domain-index keyword 层——**相当于为一场永远不会发生的派对准备了座位卡**。

**替代判断**：
- 多 agent 协作的 guardrail **在团队 ≥ 3 人时才有边际价值**；
- 目前阶段更应该建的是"**单 agent 不会做蠢事**"的 guardrail：即 CI 的 typecheck / lint / E2E，和一份 20 行的 CONTRIBUTING.md；
- 计划里的 Phase 5 CI 其实就是这个——**所以应该把 Phase 5 提到 Phase 1 之前单独做**（见建议部分）。

### ⑤ **txbbs 方法论是用错了的类比**

| 维度 | txbbs | qrclaw | 启示 |
|---|---|---|---|
| 规模 | 数十 K–百 K LOC 微信原生小程序 | 22K LOC Web + WS | txbbs 的"55KB 单索引文件分层"是**规模压迫下的解决方案**；qrclaw 现在还远够不到这个压迫点 |
| 契约形态 | 腾讯内部 pb → `pb2ts` 生成，**单向且强制** | REST + WS + Supabase SDK，三种契约形态 | "用 contracts/ 统一三端"**不等价于** txbbs 的 cgi/——qrclaw 的 contracts 是人手写的，同步责任落在人而非工具 |
| 契约权威源 | 后端 proto 文件 | ？（database.types.ts 来自 DB、WS schema 来自 gateway、HTTP schema 目前散落） | qrclaw 的"SSOT"实际上要分三个真相源，不如 txbbs 干净 |
| 关键词三层（专业/业务/用户） | 中文 + 微信生态术语模糊（"领券" vs "券领取" vs "优惠券"），三层很有用 | 英文 + 术语较少歧义（qrcode / agent / chat / claim） | qrclaw 做三层关键词的边际收益小；**两层就够** |
| 受众 | 产品 + 设计 + 开发（都写中文） | 同一支 1–2 人开发 + AI agent | qrclaw 的 skill 主要服务 AI，不需要"产品可读性"；文档可以更机器友好、更短 |
| 在 txbbs 的时机 | 项目已稳定、团队已中等规模、规范未沉淀之痛已显现 | MVP，规范还没有产生实际之痛 | **时机早了半年到一年** |

**结论**：可以借鉴 txbbs 的"skill-as-doc"形式（SKILL.md 渐进披露），但不应该**整套复制** business-index.md + naming-patterns.md + coding-patterns.md 三件套。**一份 150 行的 `qrclaw-map.md` + 一个 SKILL.md 足够**。

---

## 🔍 架构设计深度反馈

### Zod-first vs OpenAPI/tRPC

**Zod-first 是对的选择**（对 QRClaw 场景），理由：
- QRClaw 已经全员 Zod（gateway ws/schemas.ts 已用 Zod），没有迁移成本；
- OpenAPI 对 WebSocket 支持差，而 WS 是 QRClaw 契约中最关键的部分；
- tRPC 需要前后端用同一个 runtime（Node ↔ Node），gateway 是 Node 没问题，**但 Supabase Edge Functions 是 Deno**——tRPC 跨 runtime 支持还不成熟。

**但计划漏了**：
- `contracts` 要不要发布到内部 npm registry？不发布就没法通过 `npm:@qrclaw/contracts` 被 Deno import；
- **Zod 4 的 breaking changes**：Zod 4 与 Zod 3 API 有若干不兼容变化（如 `.default()` 行为），现在三端版本一致性如何？

### `database.types.ts` 与 `domain/*.ts` 同步

**这是隐藏的最大设计漏洞**。

- `database.types.ts` 由 `supabase gen types` 自动生成，是"DB 原始形态"；
- `domain/qrcode.ts` 是手写 Zod，是"业务语义形态"；
- **两者之间没有强制链路**——今天加了 `qrcodes.description` 列，`database.types.ts` 会自动更新，但 `domain/qrcode.ts` 不会动；代码 typecheck 不会挂，但业务逻辑漂移已发生。

**可选解决方案**：
1. **codegen**：用 `zod-from-postgres` 或 `supabase-to-zod` 自动生成 base schema，手写只做"衍生字段"；
2. **契约变更 checklist**：在 `contracts/README.md` 里写死"每次 `supabase gen types` 后必须人工 review 所有 domain/*.ts"——依赖人的纪律（不推荐，会忘）；
3. **测试门禁**：写一个测试用 `database.types.ts` 和 `domain.ts` 的类型比对（用 `expectTypeOf` 或 `Equals` 类型工具）强制两者结构对齐。

**计划目前选的是方案 2（最弱），没展开讨论。**

### features/ 与 `components/landing|pricing|docs|legal/` 并存的分裂

计划 §3.1 保留了：
```
components/
├── ui/          (通用)
├── landing/     (营销)
├── docs/        (文档)
├── legal/       (法律)
├── pricing/     (定价)
```

同时 features/ 里有 `subscription` 域。**`pricing` 和 `subscription` 的边界在哪里**？
- 如果 pricing 页面要显示"当前订阅状态"（几乎必然），它要不要 import `features/subscription/`？
- 如果要，`components/pricing/` 就不是纯 UI 了，违反了红线 "components/ui/ 不含业务依赖"（虽然规则说的是 ui/，但 pricing/ 走的也是这个语义）；
- 如果不要，两者完全独立又不现实。

**更干净的方案**：`landing/docs/legal/pricing/` 其实都是"marketing pages"，应该作为一个 feature，叫 `features/marketing/`（或 `web/src/app/(marketing)/` 路由组 + 专用 components 子目录）。**计划保留这个分裂，说明还没想清楚**。

### 分层红线 ESLint 自动化

5 条红线中：
- "契约层只读"：需要 CI 脚本检查 PR 的 files changed 是否在 `contracts/` 且未加 label；
- "禁止跨 feature 直接 import"：`eslint-plugin-boundaries` 能做；
- "app/ 不含业务逻辑"：ESLint 规则难精确表达，只能靠 review；
- "components/ui/ 禁 features 依赖"：`eslint-plugin-boundaries` 能做；
- "web 禁 import gateway，反之亦然"：path alias + ESLint `no-restricted-imports` 能做。

**落地性结论**：5 条里有 3 条可自动化，2 条靠 review。对 1–2 人团队，**自动化的值 > review 的值**——所以应当**只保留那 3 条，放弃另 2 条**，否则容易变成"红线摆设"。

### 新页面 = 新 feature？

计划未明确回答：当新增一个页面（例如"Agent usage dashboard"）时，是：
- 新建 `features/usage/` ——一级子功能都叫 feature？过粒？
- 放入 `features/agent/` ——usage 是 agent 的延伸？
- 放入 `app/(dashboard)/usage/` 并在多个 feature 中借用？

这个决策规则的模糊，就是 txbbs business-index 需要不断维护的根因。**Phase 0 审计结束时必须在 audit-report 里额外产出一份"新增功能放哪儿的决策树"**，否则 Phase 3+ 会持续出现归属争议。

---

## ⚠️ 隐性风险清单（计划未涉及的）

| # | 风险 | 概率 | 影响 | 建议应对 |
|---|---|---|---|---|
| H1 | **重构期线上 P0 bug hotfix 怎么做** | 高 | 中 | 每个 Phase 的分支都必须从 main 拉；main 始终保持可发布状态；任何时候 `git cherry-pick main HEAD` 到 refactor 分支都不冲突 |
| H2 | **契约包 SemVer** | 中 | 中 | contracts/package.json 要约定版本策略；WS 协议的向后兼容通过"新字段全部 optional"强制 |
| H3 | **RLS 策略未被视为契约的一部分** | 中 | 高 | Supabase RLS policy 是另一种"契约"（决定谁能读谁能写），contracts/ 只覆盖类型是不够的；至少要在 contracts/README 里点出"RLS 变更视同 contract 变更，走相同审批路径" |
| H4 | **tsconfig paths / deno.json imports / Next.js bundler 三端各自的 path alias** | 高 | 中 | 三端各有一份映射文件，任何 contracts/ 目录调整都要同步 3 处；建议加一个 `scripts/sync-paths.mjs` 从 `contracts/tsconfig.json` 派生其他 2 份 |
| H5 | **Supabase 费用配额变更** | 低 | 中 | Edge Function 调用量、存储是计费维度，重构引入的 import chain 可能增加冷启动时间 / CPU time；Phase 1 后 benchmark 一次 |
| H6 | **tests/ 工程未纳入重构规划** | 中 | 中 | 计划里只说"E2E 回归全通过"，但 tests/ 本身也有 fixture 和 types，是否也要用 contracts？不规划的话 tests 里会继续定义自己的类型 |
| H7 | **Trae/Cursor/Claude 等 agent 执行同一任务卡的输出会有差异** | 中 | 中 | 任务卡应禁止语义不明的步骤（"推断业务域"这种），强制命令式"执行这条 shell"+"粘贴输出"；审查方式是 diff 而非语义判断 |
| H8 | **`contracts-approved` PR 标签机制会失效** | 中 | 中 | 失效场景：PR 只改文档 + 契约小改 → 作者觉得不重要忘了 label；CI 脚本按"是否改 contracts/" 识别足够；但如果 contracts 重命名/移动文件，git diff 会触发假警报 |
| H9 | **Phase 3 迁移期的兼容 re-export 层会成为长期遗毒** | 中 | 中 | 计划说"过渡期 2 个 Phase"——现实中这种层 99% 会存活到下个季度末；建议设 hard deadline，到期 CI 报错 |
| H10 | **Next.js 16 + React 19 + Tailwind v4 版本升级** 与 contracts 引入时间重叠时 | 低 | 高 | 虽然技术栈已经在用，但如果 Next/React 年内再 major bump，契约 + 新版本兼容性排查同时发生会很痛；建议 contracts 落地前锁版本 3 个月 |

---

## 💡 替代方案建议

### 方案 A：**最小可行重构**（我的首选，工期 1 周）

只做两件事：

**A1. WebSocket 协议 SSOT**（2–3 天）
- 把 `gateway/src/ws/schemas.ts` 复制到 `shared/contracts/ws/protocol.ts`；
- gateway 直接 import；web 通过 tsconfig paths import；Supabase functions 暂不用（它们不收发 WS 消息）；
- **不搞 npm package，不搞 workspace，不搞 domain/http 分层**；
- 这个动作能消除 WS 协议漂移这一个最疼的问题。

**A2. CI 质量门禁**（2 天）
- 仅建 `.github/workflows/quality-gate.yml`，在 PR 上跑 web typecheck + gateway typecheck + Supabase deno check + tests vitest；
- 不搞 Branch Protection required checks（太早）；
- 不搞 contracts-approved label（还没有 contracts 可保护）；
- 不搞自动部署（现在怎么部署就怎么部署）。

**成本**：1 人 × 1 周 = 5 天。
**收益**：治住 80% 的类型漂移+ 给未来提供保护网。
**放弃了什么**：features/ 重组、skill 体系、domain-index、ESLint boundaries、Phase 3/4。

### 方案 B：**触发式 roadmap**（推荐作为方案 A 之后的长期策略）

不做预定 6 Phase，而是设触发条件：

| 触发条件 | 触发什么 |
|---|---|
| 第二位全职开发加入 | 启动 Phase 2（skill + domain-index） |
| WS 协议或核心 domain 类型月度变更 ≥ 2 次 | 启动 Phase 1 剩余部分（HTTP + domain） |
| 单 feature 目录 > 2K LOC 或跨 3 个目录 | 对该 feature 启动 Phase 3 子任务（只这一个域，不做 6 域全量） |
| 出现外部 API 消费者（SDK 用户、第三方集成） | 启动 contracts 外发（独立 package） |
| CI 出现 ≥ 3 次"因未知依赖导致合入后挂" | 启动 Phase 5 完整版（Branch Protection、required checks） |

**核心思想**：**不主动重构，让重构被"真实痛点"触发**。

### 方案 C：**如果老板真的一定要现在做全量**

那至少做两处修改：
1. **Phase 0 之前插入一个"契约互通 spike"**（0.5 天），验证 Deno / Node / Next.js 能共用一个 Zod schema 文件；失败就 fall back 到方案 A。
2. **Phase 2 (skill) 裁剪到 50%**：只写 `SKILL.md` 一份 + `qrclaw-map.md` 一份 domain 索引，不做 reference / examples / naming-patterns / coding-patterns 四件套——这些 txbbs 里是因为**真实的代码规模压力**才写的，qrclaw 没有。

---

## 📐 关于与 txbbs 方法论映射的专门评估

| txbbs 设计 | qrclaw 引用 | 合理性评分 | 问题 |
|---|---|---|---|
| `src/cgi/`（pb2ts 生成） | `contracts/` | 7/10 | qrclaw 的 contracts 不是自动生成，"SSOT"责任在人；映射概念不完全对应（详见 ①） |
| `src/entity/{domain}/` | `features/{domain}/` | 6/10 | qrclaw 把前后端都做成域——front `features/` + back `gateway/domains/`；两边的域名称一致吗？计划里没对齐，有分裂风险 |
| `src/data-adapter/` | `features/{domain}/adapters/` | 8/10 | 这个映射成立，且 qrclaw 场景下 adapter 需求不如 txbbs 强（Web UI 更直接消费原始数据） |
| `src/common/` | `web/lib/` + `gateway/shared/` | 5/10 | txbbs 的 common 是跨实体业务逻辑，qrclaw 的 lib/ 和 shared/ 更偏"工具" + "基础设施"，概念错位；不如合并成 `utils/` |
| SKILL.md 渐进披露 | 同 | 9/10 | 这是最值得学的一点 |
| business-index.md 三层关键词 | domain-index.md 三层关键词 | 5/10 | 中文模糊性消失，三层冗余；两层（专业词 / 业务词）足够 |
| symlink 多 IDE 同步脚本 | 同 | 10/10 | 直接复用 `setup-symlinks.mjs`，无成本 |
| 55KB 单索引文件 | 未规避 | 3/10 | 计划要把 10+ 个业务域的三层关键词写进一份 domain-index.md，一年后会继续长大；应改为"按域拆分 + 索引文件只做目录" |

**总体映射判断**：**形似而神不似**。txbbs 的规范是"被规模逼出来的"，qrclaw 是"预先模仿 txbbs 的样子"。真该学的是**"规范由痛点驱动"这个原则本身**，而不是 txbbs 最终沉淀出的具体产物。

---

## 🚦 分阶段执行建议

| Phase | 原计划 | 建议 | 理由 |
|---|---|---|---|
| **Phase 0 审计** | 1–2 天 全量扫描 | **✅ 采纳但收口**：1 天，只做 §1 LOC / §4 类型漂移 / §3 端点清单；**砍掉**§2 业务域候选清单（放到真正开始 Phase 3 时再做） | 审计的 ROI 随范围指数下降；业务域候选做早了会影响 domain/ 命名决策 |
| **"契约互通 spike"** | ❌ 计划未包含 | **⚠️ 新增前置**：0.5–1 天，验证 Deno + Node + Next.js 能共享一份 Zod schema | 不验证就全量推进 = 赌博 |
| **Phase 1 契约层** | 3–5 天 全量三端 | **⚠️ 裁剪**：只做 WS protocol + WS 相关的 domain 类型（qrcode / message / conversation）；HTTP 和 Supabase 的契约延后 | WS 是最大痛点；HTTP 契约的类型漂移损失远小于 WS |
| **Phase 5 CI/CD** | Week 2 后 2–3 天 | **✅ 提前到第一周**：Phase 1 之前做，且只做 quality-gate.yml；Branch Protection、自动部署延后 | 有 CI 才敢改 contracts |
| **Phase 2 Skill** | 3–5 天 全量四件套 | **⚠️ 延后 + 裁剪**：仅在 Phase 1 完成后 1–2 天产出 `SKILL.md` + `qrclaw-map.md`（2 份文件，合计 < 500 行）；reference / examples / naming-patterns / coding-patterns 全部砍掉 | 规范应由痛点驱动；当前没那么多痛点可写 |
| **Phase 3 web features/** | 1–2 周 6 个域 | **❌ 建议跳过**：换成"触发式"——只在某 feature 疼到受不了时才单独迁移它 | 6 域全量迁移是最大的 velocity 杀手，且 rollback 痛苦 |
| **Phase 4 gateway domains/** | 3–5 天 | **❌ 建议跳过**：gateway 当前 4.1K LOC + 8 个 route 文件，按技术层组织完全够用，按域分反而更散 | 4K LOC 不够分域的阈值 |
| **Phase 6 扫描器** | 持续 | **❌ 建议跳过**：规范都没大规模产出，自动化检查没东西可扫 | — |

**推荐的新版时间表**：

| 周 | 任务 | 工时 |
|---|---|---|
| Week 1 前半 | Spike + Phase 5 quality-gate.yml | 2–3 天 |
| Week 1 后半 + Week 2 前半 | Phase 1 裁剪版（仅 WS） | 3–4 天 |
| Week 2 后半 | Phase 2 极简版（SKILL.md + qrclaw-map.md） | 1–2 天 |
| Week 3+ | **回归产品迭代**，后续用触发式 roadmap | — |

**总成本从 6 周降到 ~1.5 周**，拿到 70–80% 的收益。

---

## 商业价值评估

### 完成全量 6 Phase 后，qrclaw 能获得什么可量化收益？

| 类别 | 估算 | 说明 |
|---|---|---|
| **直接 bug 减少** | 每月 1–2 个 WS/类型相关 bug → 0 | 按每个 bug 修复 4 小时算，每月省 4–8 人时 |
| **新功能开发提速** | 不显著（≤ 10%） | 22K LOC 项目目录结构的摩擦很小 |
| **onboarding 提速** | 对 1–2 人团队 = 0 | 新人加入时才兑现 |
| **agent 产出质量** | 20–30% 提升（假设） | 有 skill 约束后 AI 代码更一致；但 AI 工具本身也在快速进步，部分收益可能被外部进步吞没 |

### 全量成本

- 6 周 × 1 人 × 50% 工时 = **~3 人周**；
- 重构期新功能停摆的**机会成本**：MVP 阶段 3 人周 ≈ 潜在 1–2 个有效验证迭代；
- 在 PMF 未达成前，**这是很贵的成本**。

### 收益回本周期

按"每月省 4–8 人时 bug + 10% 开发提速"估算，回本 ≥ 6 个月。**对 MVP 阶段项目这就是"永远不会回本"**——因为 6 个月后项目形态可能已完全不同。

### 最先兑现的"可量化收益"

方案 A 下，**第一个可量化收益是"未来 WS 协议变更不会导致 web/gateway 类型漂移线上 bug"**——这是唯一 MVP 阶段就能感受到的收益。其他全部是长期投资。

---

## 最终建议

- **是否推荐执行**：**❌ 建议重新设计**（按当前计划执行会过度投入）

### 如调整，Top 3 必须调整项

1. **把 6 Phase 砍到 2 Phase + 1 Spike**（我的方案 A）：`spike → quality-gate CI → WS 契约 SSOT`，其余全部延后；拿到最疼痛点的解决，保住产品 velocity。
2. **放弃"多 agent 并行"的设计预设**：去掉 contracts-approved 标签、跨 feature import 禁令、三个 agent 拓扑图这些部分；让 skill 与 CI 去服务"单 agent 不做蠢事"。
3. **把"触发式"原则贯彻到 features/ 和 skill**：计划自己对"拆仓"用了触发条件（§1.1），对 features/ 重组和 skill 体系也应该用同样的触发条件（单域 > 2K LOC / 第二位全职开发加入 / 连续 2 月 ≥ 2 次类型漂移 bug）。

### 如需做全量，至少加上

- 在 Phase 0 之前插入**"Deno ↔ Node 契约互通 spike"**（0.5–1 天），spike 结果决定 Phase 1 的落地方式；
- 在 Phase 1 加入**`database.types.ts` ↔ `domain/*.ts` 同步测试**（类型等价断言）；
- 在 Phase 3 每个域迁移 PR 之前要求**"当前迭代没有 hotfix 需求"**的 sign-off（避免重构阻塞修复）；
- 把 skill 四件套裁成两件套（`SKILL.md` + 单一 `qrclaw-map.md`）。

### 信号监测（完成之后如何判断"做得对"）

**"重构做得不错"的信号**：
- ✅ 重构后 3 个月内，WS 协议相关 bug 数 = 0；
- ✅ 新功能从需求到上线的 lead time 没有显著恶化（±10% 内）；
- ✅ 新增 agent 会话里，AI 第一次产出的代码就遵守分层（不需要重新提示）。

**"重构反而拖慢产品"的信号**：
- ❌ 连续 2 周产品迭代停滞；
- ❌ PR review 时大半时间在讨论"这个文件该放 features/x 还是 y"；
- ❌ ESLint boundaries 每周被关闭或加 eslint-disable 超过 3 次；
- ❌ 重构完成后仍然出现原本想预防的 WS 类型漂移 bug。

出现任意 1 个退出信号就**立刻停止 Phase 3/4/6，回退到方案 A 的成果边界**。

---

*评审完毕。核心观点一句话重复：**正确的问题是"现在应不应该做重构"，不是"重构计划写得够不够周到"。**
