# 评审汇总与路线建议

> **日期**: 2026-04-19
> **输入**:
> - [code-reviewer-feedback.md](./code-reviewer-feedback.md) — 方案/代码审查视角
> - [architect-feedback.md](./architect-feedback.md) — 架构师+实施顾问视角
> **对象**: [../refactor-plan.md](../refactor-plan.md) v1.0-draft
> **目的**: 呈现两份评审的共识、分歧、并给出三条可选路线供决策

---

## 一、最终结论一句话

> 主计划**方向正确但普遍过度投入**。两位评审一致强调：**Deno↔Node 契约互通是被低估的地雷**、**WS 协议迁移计划是空话**、**"多 agent 并行"对 1–2 人团队是伪需求**。在决定采用何种路线前，**必须先做一个 0.5–1 天的"契约互通 spike"**。

---

## 二、两份评审共识（10 条高信号点）

这 10 条是两位评审**独立、强烈一致**的判断，可以视为事实共识，无需再辩：

| # | 共识点 | 依据 |
|---|---|---|
| 1 | **Deno ↔ Node 契约互通是最大风险，方案过于乐观**。"相对路径 import"一句话带过远远不够。 | CR C5 + AR ③ |
| 2 | **WebSocket 迁移"保持向后兼容、灰度发布"是空话**。qrclaw 只有单 gateway 实例，没有灰度机制；而 gateway 和 web 的 WS 帧定义已经漂移（AuthFrame / ConnectionAckFrame 等）。 | CR C7 + AR 隐性风险 |
| 3 | **"多 agent 并行"设计对 1–2 人团队过度超前**。`contracts-approved` 标签、三 agent 拓扑图是"为不会发生的派对准备座位卡"。 | CR C 过度设计 + AR ④ |
| 4 | **主计划 D5 事实错误** — `.github/workflows/ci.yml` 已存在并跑了 lint/typecheck/build/test。Phase 5 定位需要重写。 | CR C1 |
| 5 | **`database.types.ts` 根本不存在，web 层直接 `createClient` 完全无类型保护**。主计划写"迁移"其实是"从零生成"，工作量和风险等级不同。 | CR C4 + AR 架构设计 |
| 6 | **T0 任务卡无法被 Trae 独立跑通** — 依赖 `/tmp` 非持久、强依赖未声明的 `rg`、所有扫描命令用 `\|\| true` 吞错，组合起来结果大概率表面通过实际为空。 | CR C2 + C3 |
| 7 | **txbbs 方法论是"形似神不似"** — txbbs 的规范由规模/团队压迫逼出来；qrclaw 22K LOC + MVP 阶段复制整套是过度模仿。skill 四件套裁成两件套即可。 | CR C 过度设计 + AR ⑤ |
| 8 | **路径别名 `@contracts/*` vs `@qrclaw/contracts` 在主计划内混用**，会让 Trae 在 Phase 1 走岔路。 | CR C5 |
| 9 | **Phase 6 扫描器被列为 P2+持续=永远不做**。应合并进 Phase 3 ESLint boundaries + Phase 5 CI grep，不设独立 Phase。 | CR H7 |
| 10 | **RLS 策略也是契约的一部分**，但主计划只讲类型契约。RLS 变更需纳入 contracts 审批路径。 | AR 隐性风险 H3 |

---

## 三、两份评审的**关键分歧**

这是战略层级的分歧，**必须由用户决策**：

| 分歧维度 | code-reviewer 立场 | architect 立场 |
|---|---|---|
| **整体方向** | 方向正确，修复 CRITICAL/HIGH 问题后按原 6 Phase 推进 | **战略错了**：22K LOC + MVP + 1-2 人团队，花 6 周做重构 ROI 不划算；**建议砍到 1.5 周**只做"Spike + CI + WS 契约" |
| **features/ 按域重组** | 必须做，只是顺序和 ESLint 落地时机要调整 | **建议跳过**，换成"触发式"：只在某 feature 真实痛到受不了时才迁移 |
| **gateway domains/ 重组** | 必须做 | **建议跳过**：gateway 4.1K LOC 按技术层够用 |
| **完整 skill 体系**（SKILL + reference + examples + naming + coding） | 保留，但 Phase 2 验收标准调整 | **裁剪到两件套**：只写 `SKILL.md` + `qrclaw-map.md` 合计 < 500 行 |
| **回本周期预期** | 未明确量化 | 全量方案回本 ≥ 6 个月 → MVP 阶段视同"永远不会回本" |
| **触发式 roadmap** | 未提及 | **核心建议**：不预定 6 Phase，设"第二全职加入 / 单域 > 2K LOC / 月度漂移 bug ≥ 2"等触发条件 |

---

## 四、三条可选路线

基于上述共识与分歧，我给出三条清晰的路线供你选择。**每条路线都已对齐两位评审的硬反馈**，区别只在战略雄心程度。

---

### 🅰️ 路线 A：**最小可行重构**（architect 推荐）

**核心主张**：MVP 阶段保 velocity，只治最疼的痛点。

**交付物**：
1. **Week 1 前半（2-3 天）**：
   - **契约互通 Spike**（0.5-1 天） — 验证 Deno + Node + Next.js 能共享一份 Zod schema 文件
   - **CI Quality Gate**（1-2 天） — 增补 `.github/workflows/ci.yml`（目前已有），添加 Supabase Deno check + 跨端 typecheck 汇总
2. **Week 1 后半 + Week 2 前半（3-4 天）**：
   - **WebSocket 契约 SSOT** — `shared/contracts/ws/protocol.ts` 作为唯一真相源（不搞 npm package 不搞 workspace）
   - 含 D7 漂移对齐（AuthFrame / ConnectionAckFrame / AgentTypingFrame 等缺漏字段）
3. **Week 2 后半（1-2 天）**：
   - **极简 skill** — `SKILL.md` + `qrclaw-map.md`，合计 < 500 行

**不做**：features/ 重组、gateway domains/ 重组、完整 skill 四件套、扫描器、多 agent 并行设计、contracts-approved 标签、domain-index 三层关键词

**工时**：~1.5 周（1 人）
**收益**：消除 WS 协议漂移这一个 MVP 阶段真实在疼的痛点；提供 CI 质量网作为未来所有改动的基础保护；拿到 **70–80% 的收益**
**风险**：放弃了长期治理红利（规模真上来时才补，可能晚一些）；对未来的第 2-3 位工程师没有"导航地图"

**适合你的判断条件**：
- 你接受"MVP 前不应过度投入架构"
- 你相信 qrclaw 下个季度可能会有产品方向调整
- 你希望尽快回到功能迭代上

---

### 🅱️ 路线 B：**修订后全量**（code-reviewer 思路）

**核心主张**：计划方向对，修完评审给出的 7 C + 7 H 问题后按原 6 Phase 推进，但在 Phase 1 之前插入 Spike。

**变更项（对 v1.0 的 Δ）**：
- Phase 0 之前：新增 **Week 0 准备**（branch protection、CODEOWNERS、装 rg、跑 E2E baseline，10 分钟-0.5 天）
- Phase 0 之前：新增 **契约互通 Spike**（0.5-1 天）
- Phase 0：重写 T0 任务卡，解决 /tmp + rg + `\|\| true` 三个硬阻塞
- Phase 1：任务 1.3 改为"首次生成 database.types.ts"；新增 1.3.a 给 web `createClient` 加泛型；新增 1.5.a 对齐 D7 WS 漂移；新增 1.10.a `tests/` 也迁移引用 contracts
- Phase 2：验收标准去掉"100% 准确率"口号，改为 test-cases.md 人工对照
- Phase 3：ESLint boundaries 前置（warning→error 两阶段），改用数据决定域迁移顺序
- Phase 5：定位从"建 CI"改为"补契约门禁 + 部署流水线"；`contracts-approved` 标签改用 CODEOWNERS + 自动化打标
- Phase 6：拆散合并入 Phase 3/5，取消独立 Phase

**工时**：~6 周（1 人）→ 修订后 ~5-6 周（节省 Phase 6 + Phase 5 部分工作）
**收益**：长期治理红利完整；2+ 人加入时立即有分工模型可用
**风险**：6 周 velocity 停摆的机会成本；MVP 阶段可能产品方向调整导致部分重构白做

**适合你的判断条件**：
- 你接受当前阶段用 6 周换"完整的架构治理"
- 你对 qrclaw 近期加人 / 做外部集成有明确预期
- 你接受 Deno↔Node spike 失败时回退到复制方案

---

### 🅲️ 路线 C：**两段式（我推荐）**

**核心主张**：**先做 A 拿到关键收益并获得真实信号，半年后按触发条件决定是否走 B**。

**阶段 1（立即启动，~1.5 周）** = 路线 A 的完整内容

**阶段 2（暂不排期，触发式）** = 当以下任意 2 条满足时启动 B 剩余部分：
- 第 2 位全职开发加入
- 单模块（web 或 gateway）LOC > 40K
- 月度 type drift / WS 漂移 bug ≥ 2
- 出现外部 API 消费者（SDK / 第三方集成）
- 连续 2 周产品迭代因代码结构问题受阻

**主计划处理**：把当前 `refactor-plan.md` v1.0 标记为 **长期蓝图**（给未来用），当前 active tasks 只保留 A 的内容。

**工时**：阶段 1 ~1.5 周 + 阶段 2 按需触发
**收益**：短期兑现 70-80% 收益，长期保持"随时可做全量重构"的选项权
**风险**：最小；唯一劣势是"长期蓝图"如果触发条件从未达成，那些思考就只是思考
**适合你的判断条件**：
- 你不确定 qrclaw 下半年形态是否稳定
- 你认同"过早架构治理 > 过晚架构治理"的风险权重
- 你仍然希望保留完整蓝图作为未来地图

---

## 五、共同必做项（无论选哪条路线）

以下 6 项在任何路线下都必须处理，优先级从高到低：

1. **写一个 契约互通 Spike**（0.5-1 天） — Deno / Node / Next.js 能否共享一份 Zod schema
2. **修正 D5** — `.github/workflows/ci.yml` 已存在
3. **路径别名统一**为 `@qrclaw/contracts`（或 `shared/contracts` 相对路径）
4. **审计 WS 帧定义漂移** — 列出 gateway schema vs web types/ws.ts 的字段差集（这是 Phase 0 必做，或 Spike 内顺手做）
5. **T0 任务卡重写** — 如果选路线 A，这一项被精简；如果选 B/C，必须重写
6. **Week 0 准备** — branch protection、CODEOWNERS、装 rg（或改用 grep）、跑一次 Playwright 存 baseline

---

## 六、我的建议

> 选路线 **C**（两段式）。
>
> 理由：
> 1. 两位评审的共识都指向"Deno 互通风险 + WS 协议真实在疼 + multi-agent 是伪需求"——这三个点是唯一**不选就会出 bug 的事情**，路线 A 全部覆盖。
> 2. 主计划 v1.0 的**思考是有价值的**（比如 features/ 的设计讨论、业务域索引的方法论），不应该丢；标为"长期蓝图"保留，不浪费已投入的时间。
> 3. 触发式 roadmap 让你在未来**用真实信号而非预设假设决策**——这对 MVP 阶段项目至关重要，因为你此刻还不知道哪些预设会被证伪。
> 4. 路线 C 阶段 1 仅 1.5 周，最多损失 5 人天；即使 Spike 失败也只损失半天。

---

## 七、下一步（等你拍板后）

根据你选的路线，我会：

- **选路线 A** → 把主计划缩写为 v2-lite；重写 `T0-spike.md`（spike 任务卡）+ `T1-ws-contract.md`（WS 契约 SSOT 任务卡）+ `T2-skill-lite.md`
- **选路线 B** → 把主计划改为 v2，逐条吸收两份评审的 C/H 反馈；重写 T0-audit.md；撰写 T1 契约层任务卡
- **选路线 C** → 把主计划标记为"长期蓝图 v1.0"，不动内容；另起 `refactor-plan-phase1.md` 作为当前 active 计划（路线 A 的内容）；撰写 Spike 任务卡

无论哪条路线，产出后可立即派 Trae 执行 Spike（0.5-1 天，低风险任务）。
