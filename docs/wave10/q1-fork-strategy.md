# Wave 10 Q1: LobeChat fork 策略评估

> 日期：2026-04-28  
> 目标：在不实际 clone LobeChat、不改代码的前提下，评估整换 / 并存 / 组件抽取三种路线，并给出推荐。

## 0. 结论

**推荐 C：组件抽取。**

理由很简单：QRClaw 现在最值钱的资产不是一个聊天 UI 壳，而是已经打通的 Next 16 + Supabase auth + Gateway + `decrypted-messages` + OpenClaw plugin + Owner Agent Chat 协议链。LobeChat 的价值主要在对话体验组件：Markdown 流式渲染、输入框、文件管理、语音入口等。把整个应用 fork 进来，会把 QRClaw 已经稳定下来的认证、加密读写、C5 回放、M4 插件化边界全部重新暴露在迁移风险里。

建议采用 **C+ 路线**：不是粗暴复制几个 React 文件，而是按能力抽取：

1. 先抽 Markdown 流式渲染能力，接入现有 `ChatMessage.content`。
2. 再抽 ChatInput 的交互模型，保留现有 `sendMessage(agentId, content)` 与 Supabase JWT / Gateway API。
3. 最后抽 FileManager / upload preview，并在协议层明确 `content_type`、附件元数据、加密与回放边界。

## 1. 当前约束

### 1.1 QRClaw 现状

- `web/` 是 Next 16 + React 19 + App Router，已接 Supabase auth 与 Zustand。
- Owner Agent Chat 已有 `owner-agent-chat-store`，走 Gateway HTTP / WS，并能通过 `decrypted-messages` 回放历史。
- 项目已有 25 个页面路由、8 个 UI 组件、Gateway WS、消息加密、Edge Functions、OpenClaw plugin 和测试基线。
- M0-M4 已完成 OpenClaw channel plugin，核心原则是 QRClaw 后端对 OpenClaw 插件零感知。

### 1.2 四条铁律

| 铁律 | 对 fork 策略的影响 |
|---|---|
| C1 中立中继 | LobeChat 原生是 LLM 客户端 / provider hub，整换会天然带入 provider 语义，需要大量删改以保证 QRClaw 不执行推理、不解读消息。 |
| C2 加密存储 | LobeChat 的消息模型不是 QRClaw 的 `content_encrypted` + Edge Function 解密读路径，整换或并存都要重建加密边界。 |
| C4 移动端零注册 | 现有 visitor / owner / agent-plugin 身份边界不能被 LobeChat 的账号体系污染。 |
| C5 消息可回放 | QRClaw 已把回放做成产品铁律；新 UI 必须消费现有 history API，而不是建立第二套会话存储。 |

## 2. 三个策略对比

### A. 整换：fork LobeChat 成 `web/`

定义：用 LobeChat 替换当前 `web/`，废弃现有 Next 16 app，再重新接 Supabase、Gateway、QRClaw 设计系统和部署。

| 维度 | 评估 |
|---|---|
| 开发工作量 | **18-30 天**。包括 app 替换、依赖整理、路由迁移、Supabase auth 重接、Gateway service 替换、设计系统适配、测试重建、部署修复。 |
| Next 16 vs 14 风险 | **高**。LobeChat 当前按 Next 14 心智组织，QRClaw 是 Next 16 + React 19。整换要么降级 QRClaw，要么升级上游 fork，两边都容易出构建、RSC、middleware、ESLint 和依赖兼容问题。 |
| Supabase auth 兼容性 | **高风险**。QRClaw 当前 owner 身份、JWT、Gateway Bearer、RLS、Edge Function 读路径是一套闭环；LobeChat 的 auth/session/store 需要大面积替换。 |
| 长远维护成本 | **高**。表面上是 fork，理论可 upstream sync；但删 provider、改 service、改 auth、改 schema 后，未来每次 sync 都要解决冲突。 |
| Wave 5-9 成果保留度 | **低（约 20-35%）**。Gateway / Supabase 可保留，但 `web/` 的页面、store、dashboard、owner chat UI、测试和设计迁移会被大面积重做。 |
| M4 OpenClaw 插件化影响 | **负面**。容易把 LobeChat 的 provider 抽象反向压到 QRClaw 协议，破坏“插件只消费已发布协议”的边界。 |
| C1/C2/C4/C5 合规性 | **最难合规**。必须确认 LobeChat 侧没有任何 provider 调用、明文持久化、日志泄漏或第二套 history。 |

判断：不推荐。除非产品决定 QRClaw 彻底转成 LobeChat 分叉产品，否则整换收益小于迁移风险。

### B. 并存：新建 `web-lobe/`

定义：保留当前 `web/`，另开一个 LobeChat 独立 app，用路由或部署入口切换。

| 维度 | 评估 |
|---|---|
| 开发工作量 | **12-20 天**。比整换少一点，但仍要做 monorepo 配置、认证共享、部署分流、跨 app 导航、环境变量、CI、测试和设计同步。 |
| Next 16 vs 14 风险 | **中高**。可以让 `web-lobe/` 暂停在 Next 14，避免直接升级；代价是仓库同时维护 Next 16 与 Next 14 两套前端。 |
| Supabase auth 兼容性 | **中高风险**。两个 app 共享 cookie/session/middleware 很容易出现登录态、刷新、SSR client、callback URL 不一致。 |
| 长远维护成本 | **最高**。短期隔离风险，长期会形成两个产品前端、两套设计系统、两套测试、两套部署问题。 |
| Wave 5-9 成果保留度 | **中（约 60-75%）**。现有 `web/` 不被替换，但新聊天入口若进入 `web-lobe/`，Owner Agent Chat 的 store、页面和测试仍会旁路。 |
| M4 OpenClaw 插件化影响 | **中性偏负**。后端可保留，但需要防止 `web-lobe/` 直接实现自己的 agent/session 语义。 |
| C1/C2/C4/C5 合规性 | **可控但重复**。必须给 `web-lobe/` 再做一套 C1/C2/C5 审计，且容易和主 app 漂移。 |

判断：只适合作为短期 spike 或体验样机，不适合作为主线。并存会把“迁移风险”换成“永久双前端成本”。

### C. 组件抽取：移植 Conversation / ChatInput / FileManager / Markdown 到现有 `web/`

定义：保留 QRClaw 当前 app、auth、store、Gateway API 和消息回放，只把 LobeChat 的对话体验能力拆成 QRClaw 组件。

| 维度 | 评估 |
|---|---|
| 开发工作量 | **8-14 天（P0/P1）**。Markdown 流式渲染 2-4 天；ChatInput 2-3 天；Conversation 气泡 / 状态 2-3 天；FileManager 3-5 天。语音与实时通话另算。 |
| Next 16 vs 14 风险 | **低**。组件层适配比 app 层升级简单。QRClaw 继续使用 Next 16 / React 19，只引入必要渲染库。 |
| Supabase auth 兼容性 | **低风险**。不碰登录态、middleware、owner JWT、Gateway token 获取方式。 |
| 长远维护成本 | **中低**。失去完整 upstream sync，但换来可控的本地组件边界。后续按能力 cherry-pick 上游实现即可。 |
| Wave 5-9 成果保留度 | **高（约 85-95%）**。现有 Owner Agent Chat store、Gateway、Edge Function、E2E 与页面结构都继续复用。 |
| M4 OpenClaw 插件化影响 | **正面**。UI 只消费 QRClaw 已有协议，不反向驱动 Gateway 或 plugin 改成 LobeChat provider 模型。 |
| C1/C2/C4/C5 合规性 | **最好合规**。消息仍走 QRClaw 的中立中继、加密写、Edge Function 解密读、C5 回放；组件只负责展示和输入。 |

判断：推荐主线。它把 LobeChat 当“成熟交互组件参考源”，而不是把 QRClaw 变成 LobeChat 的一个发行版。

## 3. 关键取舍

### 3.1 为什么不整换

整换的最大问题不是 UI 工作量，而是会重置 QRClaw 已经完成的系统边界：

- C1/C2/C5 已经从文档、Gateway、Edge Function、测试里形成闭环。
- Owner Agent Chat 已经有私聊消息、run event、host token、WS 推送、历史回放。
- OpenClaw plugin 的核心不变量是后端零感知，而 LobeChat 的核心抽象是 provider / model / session。

这两套抽象目标不同。把 LobeChat 放在应用层会迫使 QRClaw 重新证明“没有 provider 调用、没有明文落盘、没有第二套 history”，成本很高。

### 3.2 为什么不长期并存

并存看起来保守，但会制造新复杂度：

- 两套 Next 版本和依赖树。
- 两套 auth callback / cookie / middleware。
- 两套视觉系统和路由入口。
- 两套测试与部署。
- 两套 chat state，最终还是要统一消息、附件、回放和权限模型。

如果只为研究 LobeChat 体验，可以做一次离线 spike；但不要把 `web-lobe/` 作为产品主线。

### 3.3 组件抽取的真实风险

C 也不是零风险，主要风险有三类：

1. LobeChat 组件可能深度依赖自己的 store、主题、i18n、service、文件模型和 provider runtime。
2. Markdown 流式渲染依赖 unified / Shiki / KaTeX / Mermaid 后，bundle 与安全渲染策略要重新评估。
3. 文件上传不是 UI 问题，而是协议、存储、加密、权限、回放问题；不能只把 FileManager 搬进来。

缓解方式：按能力抽取，先写 QRClaw 本地接口，再把 LobeChat 实现压到接口背后。不要让 LobeChat 类型进入 `shared/contracts/`。

## 4. 推荐实施路径

### Phase 0：边界确认（1 天）

- 冻结一个本地接口：`ChatMessage`、`AttachmentDraft`、`SendMessageInput`、`StreamingRenderState`。
- 明确 UI 只消费现有 Owner Agent Chat store / Gateway API。
- 明确所有新增富媒体字段必须先进入 QRClaw 自己的 contract 评审，不从 LobeChat 类型反推。

出口标准：文档列出组件边界和禁止跨越的 service/auth/store 边界。

### Phase 1：Markdown 流式渲染（2-4 天）

- 基于现有 `react-markdown` 依赖补齐 GFM、代码高亮、复制按钮、未闭合代码块处理。
- 先服务 agent 回复文本，不引入 LobeChat provider/service。
- 对 C2 做护栏：渲染层不得记录明文日志，不持久化解析后的 AST。

出口标准：Owner chat 中 agent 回复支持代码块、表格、链接、列表，流式更新无明显抖动。

### Phase 2：Conversation + ChatInput（3-5 天）

- 将当前 `chat/page.tsx` 的内联气泡与输入框拆成组件。
- 参考 LobeChat 的交互：多行输入、Enter/Shift+Enter、发送中状态、失败重试、复制、滚动到底部。
- 保留 `useOwnerAgentChatStore.sendMessage(agentId, content)` 作为唯一发送入口。

出口标准：不改变 Gateway API、不改变 Supabase auth、不破坏现有历史回放。

### Phase 3：FileManager / 图片上传（4-7 天）

- 先设计 QRClaw 附件协议：`content_type`、文件元数据、存储位置、加密策略、回放响应。
- UI 再接拖拽、粘贴、预览、进度、失败重试。
- 文件明文边界必须单独过 C2 审计：服务端是否可见、是否落盘、是否需要对象存储加密与签名 URL。

出口标准：附件可发送、可预览、可回放，并有权限 / 加密测试。

### Phase 4：语音能力（后置，5-10 天起）

- STT/TTS 可参考 LobeChat，但实时语音通话建议独立成 LiveKit 方案。
- 语音不进入本次 fork 策略第一阶段，避免把实时媒体、权限和加密问题混入 P0 文本体验。

出口标准：另起 Wave 任务，不阻塞 Markdown / 文件体验上线。

## 5. 决策矩阵

| 策略 | 工作量 | 升级风险 | Auth 风险 | 维护成本 | 成果保留 | M4 影响 | 铁律合规 | 总评 |
|---|---:|---|---|---|---|---|---|---|
| A 整换 | 18-30 天 | 高 | 高 | 高 | 低 | 负面 | 难 | 不推荐 |
| B 并存 | 12-20 天 | 中高 | 中高 | 最高 | 中 | 中性偏负 | 可控但重复 | 仅适合 spike |
| C 组件抽取 | 8-14 天 | 低 | 低 | 中低 | 高 | 正面 | 最好 | 推荐 |

## 6. 最终建议

选择 **C：组件抽取**，并把上游 LobeChat 定位为“体验与实现参考”，不是“应用基座”。

短期目标不是复刻完整 LobeChat，而是补齐 QRClaw 当前 Owner Agent Chat 的体验短板：Markdown、输入框、消息气泡、附件。等这些能力稳定后，再评估语音和实时通话。

这个路线最符合 QRClaw 当前阶段：保护已完成的 M4 OpenClaw 插件化和 Wave 5-9 Owner Agent Chat 成果，同时以最小架构扰动获得 LobeChat 已验证的对话体验。
