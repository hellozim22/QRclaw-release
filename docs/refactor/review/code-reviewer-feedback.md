# 代码/方案评审报告（code-reviewer 视角）

> **评审日期**: 2026-04-19
> **评审者**: code-reviewer subagent
> **对象**: `docs/refactor/refactor-plan.md` + `docs/refactor/tasks/README.md` + `docs/refactor/tasks/T0-audit.md`
> **交叉对照**: `README.md`, `CLAUDE.md`, `web/src/**`, `gateway/src/**`, `supabase/**`, `.github/workflows/ci.yml`

---

## TL;DR

**方案方向正确但不够挑剔。**「不拆仓 + 契约驱动 + 按域聚合」对 22K LOC 的 qrclaw 而言是**合理**的，但主计划存在若干与现状不符的事实性错误（D5、数据库类型生成路径）、若干口号化的验收标准（Phase 2 "100% 准确率"、"Deno 通过相对路径 import"）、以及 **T0 任务卡在执行上几乎肯定会失败**（依赖 `/tmp` 临时文件 + 强依赖 `rg` + Step 编号错乱）。**不可直接进入 T0 执行**，需先修复本报告中的 🔴 CRITICAL 项。

---

## 🔴 CRITICAL 问题（必须修复才能执行）

### C1. 主计划 § 2.3 D5「CI/CD 缺失质量门禁」与事实不符

**证据**：`.github/workflows/ci.yml` 已存在，包含：
- `tests` job：Vitest 单元+集成测试（含 coverage）
- `web-lint` job：`npm run lint` + `npm run build`
- `gateway-lint` job：`npm run typecheck` + `npm run build`

主计划 `refactor-plan.md:100` 断言"未见 `.github/workflows/` 或仅部分"，但实际已存在。这直接导致：
- Phase 5 的任务定位错误：不是"建 CI"，而是**"补契约门禁 + 部署流水线"**
- Phase 5 "Week 2 末"的时间估计过于宽松（实际上大部分是增量补充）
- Phase 0 审计报告若不纠正此认知，会误导后续决策

**建议修改**：
- `refactor-plan.md § 2.3 D5` 改为："**CI 已有基础 lint/typecheck/build，但缺 Supabase Functions deno check、契约变更门禁（`contracts-approved` label）、自动部署流水线**"
- Phase 5 任务清单第一步改为："审计 `ci.yml` 现状，识别差距项"，而非从零建
- Phase 0 (T0) 必须新增章节 § HOW-IS-CI-NOW，扫描 `.github/workflows/`

---

### C2. T0 Step 1–6 依赖 `/tmp/audit-*.txt`，Trae 会话间不持久化 → 数据丢失

**证据**：`T0-audit.md:53-222` 中 Step 1 到 Step 6 全部把扫描结果写入 `/tmp/audit-loc.txt`、`/tmp/audit-endpoints.txt` 等文件。Trae Agent 会话结束后、或跨 shell call 时，`/tmp` 内容不保证存活。若 Step 7 生成报告的 session 与前面 session 不同，报告要么空，要么 Trae 被迫重跑扫描，证据可能不一致。

**更严重的问题**：T0 Step 7（`T0-audit.md:226`）写"引用前面各步的 `/tmp/audit-*.txt`"，但验收标准（`T0-audit.md:369-388`）只检查最终报告的存在性和章节名 — 不会发现 Trae 把 `/tmp` 文件内容静默复制进报告（可能是空的 `|| true` 结果）后，仍然通过"PASS: all sections present"检查。

**建议修改**：
1. 全部改写为 `scripts/audit/scan-*.sh`（移出"可选"，改为**必须**），产物落在 `docs/refactor/review/audit-artifacts/` 仓内路径
2. T0 验收标准新增：
   ```bash
   # 证据文件存在且非空
   test -s docs/refactor/review/audit-artifacts/loc.txt
   test -s docs/refactor/review/audit-artifacts/endpoints.txt
   test -s docs/refactor/review/audit-artifacts/types.txt
   ```
3. 报告 markdown 中的每条断言必须引用 `audit-artifacts/xxx.txt` 的具体行号

---

### C3. T0 重度依赖 `rg`（ripgrep），未声明依赖 + 回退策略

**证据**：`T0-audit.md:159, 172, 178, 193, 198, 203, 211, 216, 221` 多处使用 `rg -n ...`。Trae Agent 执行容器不保证安装 ripgrep。当前本评审环境 `which rg` 即返回 not found。

T0 所有 `rg` 调用都以 `|| true` 结尾，失败会静默吞掉错误，导致扫描"成功完成"但实际结果全空。组合 C2 的 `/tmp` 问题，结果就是：**Trae 完成 T0 PR → 报告表面完整 → 实际全是空数据**。

**建议修改**：
1. T0 Step 0 新增：`which rg || brew install ripgrep || apt-get install -y ripgrep`（或要求 Trae 环境预装），失败即 `exit 1`，不得 `|| true`
2. 所有关键扫描去掉 `|| true`，让失败可见
3. 提供 `grep -rn` 作为回退（性能差但保证可用）

---

### C4. 主计划假设 `supabase gen types` 目标路径已存在；事实上文件缺失

**证据**：
- `CLAUDE.md:56` 指引生成到 `src/types/database.types.ts`（注意是 web 的 `src/types/`，**不是** supabase 的）
- 实际扫描：`find /Users/zeze/qrclaw -name "database.types.ts"` 返回空（除了 `.claude/` 内的 agents/skills 定义文件）
- 也即 **当前仓库中没有任何 Supabase 生成类型文件**。web/gateway 都没有用到数据库类型。

这让主计划 § 3.1 「1.3 迁移 Supabase 生成类型到 `contracts/src/database/database.types.ts`」变成**"从零生成"**而非"迁移"，工作量和风险等级都变了。另外会暴露一个更根本的架构问题：**web 层通过 `createClient` 直接访问表时完全没有类型保护**（参见 `web/src/hooks/useQRCodes.ts:46-50`，`supabase.from('qrcodes').select(...)` 返回 any）。

**建议修改**：
1. Phase 1 任务 1.3 改为："**首次生成** Supabase 类型到 `contracts/src/database/database.types.ts`"
2. 新增任务 1.3.a：让 web 的 `createClient` 带上 `Database` 泛型，至少在 `useQRCodes`、`useAgents`、`useConversations` 三处落地
3. Phase 0 审计报告必须新增一项硬证据："**当前三端都没有任何数据库类型保护**"，并在 § 7 P0 风险中体现

---

### C5. 路径别名 `@contracts/*` 与 package name `@qrclaw/contracts` 不一致

**证据**：
- `refactor-plan.md:112` 定义 `contracts/package.json` 名字是 `"@qrclaw/contracts"`
- `refactor-plan.md:253, 381, 382` 又用 `@contracts/*`、`import from '@contracts'`
- 现有 `web/tsconfig.json` paths 只有 `"@/*": ["./src/*"]`；`gateway/tsconfig.json` 同样只有 `"@/*": ["src/*"]`

两种不同的引用语法在一个主计划内混用，会让 Trae 在 Phase 1 step 1.9 配置 tsconfig paths 时走岔路。Supabase Edge Functions 用 Deno + `npm:` 前缀，根本不吃 tsconfig paths，需要第三种方案（相对路径或 `deno.json` 的 imports map）。

**建议修改**：
1. 统一选定一种（推荐 `@qrclaw/contracts` 对齐 npm 风格），在全计划 replace-all
2. 针对 supabase/functions 明确写："**Deno 使用相对路径 `../../_shared/contracts/` 或 `deno.json` imports map**"，并在 Phase 1 新增任务 1.9.b 处理
3. 主计划 § 6.1 的风险应对"Deno 通过相对路径 import"过于口号，需要指明是 symlink、relative path、deno imports map 还是 copy — 三种路径各有坑

---

### C6. Phase 3 "先迁移再加 ESLint boundaries" 顺序反了

**证据**：`refactor-plan.md:470-472`
```
- [ ] 3.F1 配置 eslint-plugin-boundaries 规则禁止跨域 import
- [ ] 3.F2 删除所有兼容层 re-export
- [ ] 3.F3 更新 domain-index.md
```
把 boundaries 放在"Phase 3 总收尾"。这意味着在迁移 6 个域的 1–2 周内，跨域 import 完全不受约束；而因为**主计划明确鼓励用 re-export 兼容层过渡**（`refactor-plan.md:296`），开发者/Trae 很容易在 `features/chat/` 里直接 `import { foo } from '@/features/qrcode/internal/bar'` 而非走公开 index.ts。等到收尾阶段开启 boundaries，会出现一大批违规修不完 → 要么关规则、要么拖慢收尾。

**建议修改**：
1. Phase 3 Step 0 先安装 `eslint-plugin-boundaries`，**只启用 `elements` 定义 + warning 级别**（不 error）
2. 每迁移完一个域，把对应域在 boundaries 配置里从 whitelist 改为"禁止被其他 feature 直接 deep import"
3. Phase 3.F1 只是把所有 warning 升级为 error

---

### C7. WebSocket 协议迁移"保持向后兼容；灰度发布"过于空话

**证据**：`refactor-plan.md:589` 风险应对。qrclaw 只有一个 gateway 实例（`gateway/src/server.ts`，无集群证据），**"灰度"没有部署机制支撑**。同时 `gateway/src/ws/schemas.ts:107-129` 的 `frameTypeSchema` 字段列表和 `web/src/types/ws.ts:114-124` 的 `ClientFrame`/`ServerFrame` 类型已经**不一致**：
- gateway schema 允许 `auth` 作为 client→gateway 帧（`schemas.ts:108`）
- web 的 `ClientFrame` 没有 `AuthFrame`（`web/src/types/ws.ts:114`）
- web 有 `ConnectionAckFrame`、`AgentTypingFrame`，gateway 的 Zod schema **只校验 client→gateway 方向**，没列这些

也就是说**契约漂移 D7 是真实存在的、且 D7 已经在线上生效**。提到"WebSocket 协议迁移导致线上掉线"风险时，计划必须说明：
- 现有线上客户端（已部署 web 版本）在 Phase 1 契约统一后发什么协议
- 如果新 gateway 要接受旧 web 的帧格式，契约必须做 "superset union"
- 不能仅靠 Zod schema 相加，还要考虑版本协商（握手时声明协议版本）

**建议修改**：
1. Phase 1 新增任务 1.5.a："**对齐 D7 漂移**"：列出 gateway 与 web 的 WS 帧定义差异表，决定取交集还是并集
2. `contracts/src/ws/protocol.ts` 必须包含 `PROTOCOL_VERSION` 常量和 `connection_ack` 时的版本协商字段
3. 风险表里 "灰度发布" 改为具体步骤：  
   a) 新协议字段只新增不删减  
   b) Phase 1 末发布 gateway 旧客户端仍能连  
   c) Phase 3 web 重构同步升级客户端  
   d) 兼容期 ≥ 2 周后才可移除旧字段

---

## 🟡 HIGH 问题（强烈建议修复）

### H1. Phase 2 验收标准"5 个预设业务问题答案准确率 100%"不可自动化、不可复现

**证据**：`refactor-plan.md:440`。"让 Claude/Trae 仅基于该 skill 回答 5 个预设业务问题，答案准确率 100%"是主观评估，无法被 Trae 自动跑过、也不能在 CI 里强制。

**建议**：改为"在 skill 目录下新增 `test-cases.md`，列 5 个 Q&A 样本 + **预期引用的文件:行号**，验收时由 Human checkpoint 人工对比"。删掉"100%"这种装逼数字。

### H2. Phase 3 迁移顺序判断依据不足

**证据**：`refactor-plan.md:452-459` 说 subscription "最简单" 但没有证据。实际：subscription 横跨 web pricing components + gateway `subscribe.ts` + supabase `20260326_subscribers.sql` migration + 独立 subscribers 表。相反，`auth` 域的 web 侧代码实际上极少（见 `app/(auth)/` 只有 `login/page.tsx` + `app/auth/callback` + `app/auth/update-password`，hooks 只有 1 个 `useAuth.ts`）。

**建议**：让 T0 审计报告先**量化每个域的 LOC + 文件数 + 被引用次数**，Phase 3 顺序由数据决定，而非"感觉"。

### H3. 计划没处理 `tests/` 目录

**证据**：`tests/unit/database/qrcode-crud.test.ts:22`、`tests/e2e/flows/qr-scan-chat.spec.ts:30`、`tests/integration/api/full-chain.test.ts:23, 35, 50, 59` 有**独立的**`QRCode` / `Agent` / `Conversation` / `Message` interface 定义。主计划目标结构（`refactor-plan.md:202`）只说 "tests/ 保持现状"，但：
- 这些测试类型也是 D1 类型漂移的一部分
- Phase 1 契约层落成后，tests 应不应当 import `@qrclaw/contracts`？
- 如果 tests 继续自定义，"类型漂移"就没被真正消灭

**建议**：Phase 1 任务清单新增 1.10.a：`tests/` 目录下所有复用类型也迁移到 import `@qrclaw/contracts`。

### H4. 计划忽略了 `web/src/stores/` 和 `web/src/middleware.ts`

**证据**：`ls web/src/` 有 `stores/chatStore.ts` 和 `middleware.ts`。主计划 § 3.1 目标结构（`refactor-plan.md:136-159`）没提 stores，也没说 middleware 归属。`stores/chatStore.ts` 明显属于 `chat` 域应该搬去 `features/chat/stores/`。Next.js middleware 是全局的不能放到 features 里。

**建议**：
- 目标结构新增 `web/src/middleware.ts` 的保留说明（全局，与路由同级）
- stores 必须按域拆分入 `features/{domain}/stores/`

### H5. `components/ui/` 的"红线"与现实存在抽象泄漏

**证据**：`web/src/components/ui/QRCard.tsx`、`web/src/components/ui/MessageBubble.tsx` 命名就是业务耦合的。虽然实际代码（见 `QRCard.tsx` 只接 props 的设计）没有 `import @/features/*`，但红线"UI 组件层禁止 import features/\*"在 QRCard 层面是**字面满足但语义不足** —— QRCard 的 props 类型若要复用 `contracts/domain/qrcode.ts` 的字段，规则会打架。

**建议**：
- 明确拆分 `components/ui/` 为 **pure-ui（Button、Avatar、Input 等）** 和 **domain-widget（QRCard、MessageBubble）**
- 后者搬入 `features/{domain}/components/`，主计划 § 3.1 目标结构要体现

### H6. `contracts-approved` PR 标签门禁的实现策略未落地

**证据**：`refactor-plan.md:239, 548, 554, 680` 反复提"contracts 变更需加 `contracts-approved` PR 标签"，但没写 **谁能加标签**。GitHub 默认任何有 write 权限的 collaborator 都能给自己的 PR 打标签 → 机制可被 PR 作者自己绕开。

**建议**：Phase 5 任务清单明确：
1. 通过 CODEOWNERS + Required reviewers 强制 contracts 目录改动必须 maintainer 审
2. 标签由 GitHub Actions 在 maintainer approve 后自动加，不是人工加
3. 或者直接用 "require review from CODEOWNERS" 替代标签机制（更可靠）

### H7. Phase 6 扫描器"持续" + "P2" 属于永远不做

**证据**：`refactor-plan.md:319` Phase 6 优先级 🟢 P2、工期"持续"。历史经验：标 P2 + 工期未定的任务在敏捷节奏里基本等于"不做"。而扫描器是主计划自己说的"防规范过时"的唯一机制（`refactor-plan.md:303, 591`），它不做 = Phase 2 的 skill 迟早腐烂。

**建议**：
- 合并 Phase 6.2 `check-boundaries.mjs` 进 Phase 3 的 ESLint boundaries（天然已经是扫描器）
- 合并 Phase 6.3 `check-contracts-usage.mjs` 进 Phase 5 的 CI quality-gate（一个 grep script 能搞定）
- 把 Phase 6 从"独立 Phase"降级为"散入前述各 Phase 的 CI 任务"

---

## 🟢 MEDIUM 建议（可选优化）

### M1. 主计划 § 2.1 LOC 数字有效位过多

`refactor-plan.md:65-71` 写 14,736 / 4,127 / 1,769 — 精确到行。实测 `wc -l` 结果一致，**这个倒是对的**。但总计 `~21,674` 是**四舍五入错了**（应为 21,674 精确值）。真实反而该是约数。纯洁癖建议，不影响执行。

### M2. Phase 3 域顺序（结合 H2 重写后）

基于实际代码量（web/src/app 目录），建议顺序改为：
1. **auth**（3 个路由，1 个 hook，最小）
2. **subscription**（独立横切，量少）
3. **agent**（dashboard 内纯管理）
4. **qrcode**（dashboard + 公开路由都有）
5. **claim**（Visitor 认领，单独 token 路径）
6. **chat**（跨 web/m + WS，最复杂）

### M3. T0 Step 2.1 的路由→业务域映射表硬编码太多

`T0-audit.md:88-96` 在任务卡里直接给了路由→域映射（"仅供参考"）。这会让 Trae 偷懒直接 copy paste，跳过实际扫描验证。

**建议**：把这个映射表搬到主计划的"推测"章节，T0 里只写"基于 `web/src/app/` 实际目录生成域候选，若出现歧义（如 `m/*` 混合路由），单独用 `§ Ambiguity` 章节列出"。

### M4. T0 Step 5.1 的 `rg --type ts --type tsx` 冗余

ripgrep 的 `ts` 类型默认就包含 tsx（自 ripgrep 12+）。`--type tsx` 虽不报错但多余。对熟悉 rg 的人是小问题；但 T0 给 Trae 执行，写法模糊反而会引起不确定性。

**建议**：统一用 `--type-add 'ts:*.ts' --type-add 'tsx:*.tsx'` 或更直接用 `-g '*.ts' -g '*.tsx'`，可复现性更强。

### M5. 任务卡验收"报告体积 ≥ 4000 字节"不精确

`T0-audit.md:374` `wc -c docs/conventions/audit-report.md # 应 ≥ 4000`。空 markdown 加标题能凑 4KB。

**建议**：换成更硬的"必需章节 + 每章节 ≥ 500 字节 + 至少 20 个 `file:line` 引用"组合。

### M6. Phase 0–6 之间缺少 **回归测试基线快照**

重构承诺"不改变行为"，但方案里没要求"Phase 0 结束时跑一次 Playwright 全量，存结果到 `tests/baseline/`，后续每 Phase 对照"。

**建议**：Phase 0 加任务 0.7："**跑 Playwright 录所有 E2E 通过数，存 `docs/refactor/review/baseline-e2e.json`**"，后续每 Phase 结束跑一次对比。

---

## ⚪ LOW / 质疑点

### L1. "不拆仓"决策的反例没被认真讨论

`refactor-plan.md § 1.1` 给的阈值"单模块 > 50K、固定分工 ≥ 2 人、发布节奏脱节、外部消费者、前后端互相阻塞"只有"满足 2 条才重新评估"。问题：
- **Supabase 是一个特殊的"模块"**（DB + Edge Functions），它的变更节奏天然与 web/gateway 脱节（schema migration 有独立风险）。
- **Edge Functions 是 Deno，本质上和 Node gateway 是两个运行时**，用同一个 contracts 包要做双份构建。

这两点没在"不拆仓反面论据"里讨论过，方案显得过于胜利宣言。建议补一段"**我们接受的妥协**"坦诚写：contracts 要同时适配 Node + Deno，这增加 Phase 1 约 1 天工期；若未来 Supabase 迁往其他 BaaS，拆仓重估优先级会上升。

### L2. "AI-native 规范治理"（§ 4.4）很漂亮，但没定义"规范过时"的度量

**建议**：给一个硬指标，例如"每月一次 `scripts/conventions-scanner/extract-patterns.mjs` 输出 diff，若规则命中数连续两月下降 > 20%，视为规范腐化，触发 review"。否则"持续治理"会变成口号。

### L3. 任务卡 Commit 规范与现有仓不一致

`tasks/README.md:59-63` 要求 `<type>(T{N}): <description>`，但 README 根目录分支命名规范是 `feat/<name>` / `fix/<name>`（`README.md:110-112`），不含 Tx。混用会让 git history 查 feature branch 困难。

**建议**：要么把 README 的分支命名也升级，要么在任务卡 README 显式标注"refactor 期间特殊约定，回归正常迭代后恢复"。

### L4. Phase 1 任务 1.10 "逐个替换三端原有类型定义" 缺规模估计

没写 "大约多少处"。根据现扫描 `^(export )?(interface|type) (QRCode|Message|Agent|Conversation)`：7 处 hit（不含 tests）。加上 tests 约 14 处。要不要 replace-all，每处都审？工期应从此量估。

---

## 亮点（简述）

- 主计划**战略逻辑自洽**：每个分仓收益都有对应非拆仓解法，对比表格诚实。
- 任务卡**格式模板**（`tasks/README.md` §格式模板）规范化程度高于一般重构计划。
- T0 **只读任务设置**正确（`T0-audit.md:17-25` 明确禁止修代码），符合"先量化后动手"的工程纪律。
- 附录 A 与 txbbs 的方法论映射表**清晰**，说明架构师做过真实对比而非凭空臆想。

---

## 具体条目：按审查维度 A-F 分节的详细反馈

### A. 方案合理性

- **不拆仓成立**，22K LOC 远低于任何合理拆仓阈值（见 L1 补充）。
- **契约层可行**，但 Deno vs Node 双运行时的契约消费策略必须在 Phase 1 明确（C5）。
- **Phase 顺序有前置依赖错位**：CI 质量门禁（Phase 5）被安排在 Phase 3/4 之前（Week 2），但**现有 CI 已 lint/typecheck**，真正需要 Phase 5 补上的是**部署流水线 + contracts 门禁**，而 contracts 门禁需要 Phase 1 产物先存在。实际依赖链应是：Phase 0 → Phase 1 → Phase 5（仅契约门禁 + 部署）→ Phase 2/3/4 并行。主计划推荐节奏（`refactor-plan.md:321-330`）表面是串行，但没明确说 Phase 5 必须在 Phase 3 启动前完成。

### B. 可执行性

- **T0 任务卡不能让一个不熟悉项目的 Trae agent 独立跑通**（C2 + C3 + M3 + M5 四个问题叠加）。建议大改后再派。
- **验收标准部分可自动**（存在性、grep 匹配），但**关键结论靠 Human 抽查**（`T0-audit.md:392-396`），这很诚实，但 Human Checkpoint 的产出物未定义（要不要签名？要不要留"已确认"字段在报告里？）。
- **未见"只说不做"的空话章节**，但 Phase 6"持续"章节接近空话（H7）。

### C. 过度设计 / 过度简化

- **过度设计嫌疑**：
  - Phase 6 扫描器在 22K LOC 的小项目里，**可能 1 个 lint plugin + 2 个 CI grep 就够**，不需要独立扫描器系统（H7）。
  - 目录结构 `contracts/src/database/`、`domain/`、`http/`、`ws/`、`constants/` 5 个子目录，对 1–2 人的项目过度分层。建议合并为 `database/` + `domain/`（合并 http+ws+constants 或按需拆）。
  - 主计划 § 3.3 "多 Agent 并行模型" 画了 3 个 Agent 的分工图，**但项目团队只有 1–2 人**（`refactor-plan.md:29`），这个图反映的是理想态而非今天的实际。放在"愿景"章节更合适，不要让人以为 Day 1 就 3 agent 并行。

- **过度简化嫌疑**：
  - Zod schema + `z.infer` 作为契约（§ 4.1）漂亮，但 **Supabase 生成的 `Database` 类型不是 Zod**。契约层需要**两种契约**：一种 compile-time 类型（数据库），一种 runtime schema（HTTP/WS），主计划没明说这点。
  - WS 迁移兼容策略空话（C7）。

### D. 风险识别

计划中**未识别**的风险：
1. **D1 类型漂移在 tests/ 内也存在**（H3）。
2. **Edge Functions 的 Deno 运行时可能不支持所有 Zod 版本或 import 语法**（C5）。实际上 Deno 支持 Zod 3.x via `npm:zod@3`，但首次跑会遇到远程下载失败等环境问题，需任务卡有预研步骤。
3. **Supabase Edge Function 部署**（`supabase functions deploy`）需要 service role 以外的凭据（`SUPABASE_ACCESS_TOKEN`、项目 ref），Phase 5 任务 5.3 只列了 secret 名字，没写获取步骤。
4. **Vercel 项目如果已连接到 `web/` root**（见根 `package.json` 是 "qrclaw-repo-root" shim），改结构可能导致 Vercel build 路径失效 — 主计划没提。
5. **`middleware.ts` 是 Next.js 全局中间件**，按域拆分时若 middleware 引用了各域的能力，会成为隐式跨域 import（H4）。

Phase 3 渐进迁移的兼容层：`refactor-plan.md:464` "原位置保留 re-export 兼容层（过渡期 2 个 Phase）" — "2 个 Phase"是**多长**？按推荐节奏（`refactor-plan.md:327`）Phase 3 是 2 周，"过渡期 2 个 Phase"可以解读为"Phase 3 + Phase 4"共 3 周。**建议显式给出天数**（例如 "兼容层存活 ≤ 21 天，到期不删禁止 merge"），否则会长期存活成为"半成品"。

WebSocket 协议迁移策略见 C7。

contracts PR 标签门禁被绕开风险见 H6。

### E. 与实际代码的一致性

- **LOC 准确**（`refactor-plan.md:65-68` vs `wc -l`）。
- **gateway `src/ws/schemas.ts` 确实有 Zod**（`refactor-plan.md:377` 正确），本评审没发现计划里描述 Zod 路径错误。
- **D5 CI 缺失 = 错**（C1）。
- **`supabase gen types` 路径 = 错**（C4）。
- **6 个业务域**（`refactor-plan.md:454`）**未验证**，需要 T0 产出才能确认。但粗查 `app/` 结构看：auth、qrcode、agent、claim、chat、subscription 大致对应，**缺一个 `messages` 域**（`app/(dashboard)/messages` 和 `app/m/messages` 独立存在），计划把它合并进 chat 是否合理？**chat** 和 **消息列表**是两个 UX 场景，按领域建模通常分开。建议 T0 专门写一节 §"候选域：chat vs messages"。
- **`app/m/*` mobile 路由**横跨多域（m/chat、m/qrcodes、m/scan、m/me、m/messages），主计划没说 mobile 路由怎么归属。T0 已提出但只写为"Human Checkpoint"，没给决策支持数据。

### F. Trae Agent 派发机制

- **启动 Prompt 清晰**（`refactor-plan.md:692-711`），但缺一条关键："**禁止访问 `.env`、`.env.local` 等敏感文件**"。虽然 Trae 有 sandbox 但不应假定。
- **安全边界表格**（`refactor-plan.md:678-686`）合理，但"直接 push 到 main ❌"依赖 GitHub branch protection，Phase 5 之前没有此保护（C1 显示 ci.yml 已有但 branch protection 未配置）→ Phase 0–4 的前 4–5 周都存在"Trae 理论上不能 push，实际上能 push"的漏洞。**建议 Phase 0 开头先加 Week 0：Human 手动打开 branch protection**（5 分钟 GitHub UI 操作）。
- **任务卡 Human Checkpoint 设置**（T0 一处、Phase 1 一处、Phase 3 每域一次）**合理**，但每个 checkpoint 缺"Human 签名落地"的结构 — 建议在 PR 描述里强制要求 `- [x] Approved by @{human}` 才能合入。

---

## 结论与放行建议

**是否可直接进入 T0 执行？** ❌ **否，有条件**。

条件（按优先级，必须全部完成才可启动 T0）：
1. 🔴 **修复 C1**：更正主计划 § 2.3 D5 描述，或 Phase 5 任务说明为"补契约门禁 + 部署"。
2. 🔴 **修复 C2 + C3**：T0 任务卡全部重写，`/tmp` 改为仓内路径，`rg` 依赖显式声明，失败非 silent。
3. 🔴 **修复 C4**：Phase 1 任务 1.3 语义改正为"首次生成"，Phase 0 报告强制新增"数据库类型保护缺失"事实。
4. 🔴 **修复 C5**：统一路径别名为 `@qrclaw/contracts`，明确 supabase functions 的 import 策略（3 选 1）。
5. 🟡 **修复 C6、C7**：Phase 3 的 boundaries 规则顺序、WS 协议迁移具体步骤。

可以**不在 T0 启动前修**但 Phase 1 启动前必须修：
- H1–H7 的 7 项
- L3（commit 规范冲突）

**额外建议**：
- **先做 Week 0**：Human 10 分钟完成（1）GitHub branch protection、（2）CODEOWNERS、（3）Trae 环境装 rg、（4）跑一次 E2E 录 baseline。这比 Phase 0 更先序。
- **本报告的 11 条 C/H 问题**，每条都可以 1–2 小时改完主计划，**加起来约 1 天**。改完再派 T0，预期 Trae 成功率从当前 ~40%（T0 硬错会失败）提到 ~90%。

---

## 附：被质疑的决策（非必改，仅供重新评估）

1. **「不拆仓 + contracts 包」对比「单仓 + 共享 `types/` 目录」**：后者成本更低，不需要 workspace 配置、不需要解决 Deno 兼容。但牺牲的是 "contracts 作为 npm package 独立版本" 的能力 — 当前 qrclaw 也**用不到**这个能力。建议主计划 § 1.2 增加一段"为什么是 contracts/ package 而非 shared/ 目录"的论证。
2. **Phase 3 "渐进式每域独立 PR"**的代价是 2 周内 6 次上下文切换。**全域一次性迁移 + 一周冻结需求**对 1–2 人小团队可能更高效。建议 T0 后出一份两种策略的成本对比。
3. **ESLint boundaries** vs **TypeScript Project References**：对于想强制"模块不能 deep import"的场景，TS project refs 也能做且成本低（只改 tsconfig）。计划默认 ESLint boundaries，但没比较两种方案。

---

**END OF REPORT**
