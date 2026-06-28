# Owner Agent Chat E2E 测试用例设计

> 范围：仅覆盖用户视角 E2E 流程，不包含 unit / integration 级测试。  
> 依据：`CLAUDE.md` 四条铁律、`requirements/owner-agent-chat-test-plan.md` §10、`requirements/QRClaw-Acceptance-Test-Plan-Local.md` 的关键用户旅程、安全与加密验收项。

## 覆盖矩阵

| 用例 | 章节覆盖 | 铁律覆盖 |
|---|---|---|
| OAC-E2E-01 | §10.1 Happy Path | C1, C2 |
| OAC-E2E-02 | §10.1 Happy Path | C1 |
| OAC-E2E-03 | §10.1 Happy Path | C1, C2 |
| OAC-E2E-04 | §10.1 Happy Path | C1, C2, C5 |
| OAC-E2E-05 | §10.1 Happy Path | C2, C5 |
| OAC-E2E-06 | §10.1 Happy Path | C1, C5 |
| OAC-E2E-07 | §10.1b Reload During Stream | C1, C5 |
| OAC-E2E-08 | §10.1b Reload During Stream | C2, C5 |
| OAC-E2E-09 | §10.1c Reset Context | C2, C5 |
| OAC-E2E-10 | §10.1c Reset Context | C1, C5 |
| OAC-E2E-11 | §10.2 Offline Path | C2, C5 |
| OAC-E2E-12 | §10.2 Offline Path | C1, C5 |
| OAC-E2E-13 | §10.2 Offline Path | C2, C5 |
| OAC-E2E-14 | §10.3 Security Path | C1, C2 |
| OAC-E2E-15 | §10.3 Security Path | C2 |
| OAC-E2E-16 | §10.3b Owner Deletion | C2, C5 |
| OAC-E2E-17 | §10.4 Regression Path | C4, C5 |
| OAC-E2E-18 | §10.4 Regression Path | C1, C2, C4, C5 |

---

## OAC-E2E-01 登录 Dashboard 并生成 Host Token

**覆盖**：§10.1 Happy Path；验收映射：Dashboard 全流程、Owner Auth、Host 接入  
**铁律**：C1 中立中继，C2 加密存储

### 背景

Owner 想把本机 Agent Host 接入 QRClaw，第一步是在 Dashboard 里登录并生成一次性 Host Token。

### 前置条件

- 已有可登录的 Owner 测试账号。
- Gateway、Web 与 Redis 已在本地测试环境运行。
- Owner 尚未把本次测试用的 Host Token 交给任何 Host 使用。

### 操作步骤

1. Owner 打开登录页并输入邮箱和密码。
2. Owner 进入 Dashboard。
3. Owner 打开 Host Token 创建入口。
4. Owner 点击生成新 Token，并复制页面展示的 Token。
5. Owner 关闭弹窗后再次回到 Token 列表。

### 预期结果

- 登录成功后进入 Dashboard，不出现权限错误。
- 页面只在创建完成时展示一次 Token 原文。
- 关闭弹窗后，Token 列表仍显示该 Token 的记录，但不再显示原文。
- 生成 Token 的过程不触发任何 AI 回复或内容解释。

### 验证点

- Host Token 原文只在创建瞬间可见，后续列表不泄露原文。
- 数据库只保留 Token hash，不保留明文 Token。
- Gateway 日志不包含 Token 原文、DEK、KEK 或 Owner 私聊明文。

---

## OAC-E2E-02 启动本地 Host 并看到 OpenClaw 能力在线

**覆盖**：§10.1 Happy Path；验收映射：Agent 注册、WebSocket 连接、Dashboard 全流程  
**铁律**：C1 中立中继

### 背景

Owner 已拿到 Host Token，现在要启动本机 Host，让 Dashboard 能看到本地 OpenClaw Provider 可用。

### 前置条件

- OAC-E2E-01 已完成并获得有效 Host Token。
- 本机已安装测试所需的 Host 程序。
- OpenClaw Provider 在测试环境可被 Host 探测。

### 操作步骤

1. Owner 按页面提示在本机启动 Host。
2. Owner 回到 Dashboard 的 Agent 或 Host 状态区域。
3. Owner 等待本机 Host 显示为在线。
4. Owner 展开可用能力列表，查看 OpenClaw 是否可选。

### 预期结果

- Dashboard 能看到本机 Host 在线。
- OpenClaw Provider 显示为可用。
- 如果 Provider 暂不可用，页面给出清晰状态，不误导 Owner 创建不可运行的 Agent。
- 平台只展示连接和能力状态，不自行调用 Provider 生成内容。

### 验证点

- Host 连接绑定到当前 Owner，不被其他 Owner 看见。
- Host 能力上报后，Agent 创建流程中的 Provider 列表同步更新。
- Gateway 只记录连接、心跳和能力状态，不做 AI 推理。

---

## OAC-E2E-03 创建 OpenClaw Agent 并完成 Full Access 确认

**覆盖**：§10.1 Happy Path；验收映射：Dashboard 全流程、安全确认  
**铁律**：C1 中立中继，C2 加密存储

### 背景

Owner 想创建一个绑定本机 OpenClaw Provider 的私有 Agent，并确认本地高权限访问风险。

### 前置条件

- Owner 已登录 Dashboard。
- 本机 Host 在线，OpenClaw Provider 可用。
- 当前 Owner 尚未创建本用例使用的 Agent 名称。

### 操作步骤

1. Owner 点击创建 Agent。
2. Owner 填写 Agent 名称和基础说明。
3. Owner 选择 OpenClaw Provider。
4. Owner 阅读 Full Access 确认信息。
5. Owner 勾选确认并提交创建。
6. Owner 进入新 Agent 的 Chat 页面。

### 预期结果

- 未确认 Full Access 时，页面不能完成本地高权限 Agent 创建。
- 确认后，Agent 创建成功并出现在列表中。
- Chat 页面显示该 Agent 的名称、在线状态和输入框。
- 创建过程不产生任何自动 AI 消息。

### 验证点

- Agent 绑定关系只属于当前 Owner。
- Full Access 确认行为可被审计，但不记录敏感 Token 或明文私聊内容。
- 新 Agent 的私聊会话尚无历史消息时展示清晰空态。

---

## OAC-E2E-04 Owner 发送第一条消息并收到 Agent 回复

**覆盖**：§10.1 Happy Path；验收映射：E2E 关键用户旅程、消息路由与 Security Envelope、流式输出  
**铁律**：C1 中立中继，C2 加密存储，C5 消息可回放

### 背景

Owner 已创建可用 Agent，现在要在 Chat 中发送第一条私聊消息并收到真实 Agent 回复。

### 前置条件

- Owner 已在 Chat 页面打开目标 Agent。
- Host 在线，Provider 可执行一次简短回复。
- 本次测试消息内容是唯一文本，便于后续核对。

### 操作步骤

1. Owner 在输入框中输入一条简短消息。
2. Owner 点击发送。
3. Owner 观察自己的消息出现在聊天区。
4. Owner 等待 Agent 开始回复。
5. Owner 等到 Agent 回复完成。

### 预期结果

- Owner 消息立即显示为已发送或执行中。
- Agent 回复由 Host / Provider 返回，最终显示在同一个聊天窗口。
- 页面不会出现由 QRClaw 平台自行生成的“代答”内容。
- 刷新前的当前页面能看到完整的一问一答。

### 验证点

- Gateway 只负责加密、持久化、转发和回流，不调用 LLM。
- Owner 消息、Agent final message 和 run event 落库时均不保存明文字段。
- 日志不包含 Owner 输入原文或 Agent 回复原文。

---

## OAC-E2E-05 刷新页面后历史消息可回放

**覆盖**：§10.1 Happy Path；验收映射：跨设备历史同步、消息加密、E2E 关键用户旅程  
**铁律**：C2 加密存储，C5 消息可回放

### 背景

Owner 完成一次对话后刷新页面，希望刚才的消息和回复仍能按原顺序显示。

### 前置条件

- OAC-E2E-04 已完成。
- 当前 Chat 中至少有一条 Owner 消息和一条 Agent 回复。

### 操作步骤

1. Owner 在 Chat 页面点击浏览器刷新。
2. Owner 等待页面重新加载完成。
3. Owner 查看聊天区历史消息。
4. Owner 对比刷新前的一问一答内容。

### 预期结果

- 刷新后仍显示同一个 Agent 的历史消息。
- Owner 消息和 Agent 回复顺序正确。
- 页面不会出现重复消息、空白历史或“无消息”误提示。
- 历史消息只在当前 Owner 登录态下可见。

### 验证点

- 历史读取走授权解密读路径，不由 Gateway 读路径直接解密。
- `decrypted-messages` 仅在授权内存态返回当前 Owner 的私聊历史。
- 数据库存储仍保持密文，回放能力符合 C5。

---

## OAC-E2E-06 连续追问保持同一会话上下文

**覆盖**：§10.1 Happy Path；验收映射：Conversation 生命周期、Dashboard 全流程  
**铁律**：C1 中立中继，C5 消息可回放

### 背景

Owner 在同一个 Agent Chat 里连续追问，希望第二条消息延续前一轮上下文。

### 前置条件

- Agent Chat 已有一轮成功对话。
- Host 在线，Provider 支持连续会话。

### 操作步骤

1. Owner 在同一个 Chat 中继续输入追问。
2. Owner 点击发送。
3. Owner 等待 Agent 回复完成。
4. Owner 刷新页面。
5. Owner 再次查看两轮对话。

### 预期结果

- 第二条消息不会开启一个陌生空会话。
- 两轮 Owner 消息和 Agent 回复都保留在同一个 Chat 中。
- 刷新后两轮历史仍按发送时间展示。
- 如果 Provider 无法延续上下文，页面应给出清晰失败或降级提示，而不是平台自行补写内容。

### 验证点

- 同一 Agent 的 active conversation 只对应当前 Owner。
- 每次执行都有独立 run，不串到其他 Agent 或其他 Owner。
- 平台不解释消息语义，也不根据内容改写路由。

---

## OAC-E2E-07 流式回复过程中刷新页面

**覆盖**：§10.1b Reload During Stream；验收映射：流式输出、跨设备同步  
**铁律**：C1 中立中继，C5 消息可回放

### 背景

Owner 发送一条会产生较长回复的消息，在 Agent 正在逐步回复时刷新页面。

### 前置条件

- Host 在线，Provider 能返回分段文本。
- 测试消息会触发可观察的流式回复。

### 操作步骤

1. Owner 发送一条需要较长回复的消息。
2. Owner 看到 Agent 开始逐步显示回复。
3. Owner 在回复尚未完成时刷新页面。
4. Owner 等待页面重新加载。
5. Owner 观察聊天区中正在进行的回复。

### 预期结果

- 刷新后，页面恢复已经完成的历史消息。
- 正在进行的回复文本能从已收到的片段继续显示。
- 页面不会把一个正在回复的 run 拆成多个无关回复。
- 平台仍只转发 Host / Provider 的文本事件，不生成额外内容。

### 验证点

- 刷新恢复包含 final messages 和 active run text events。
- active run 的事件按 run 归属，不串到其他消息。
- 刷新期间不丢失正在进行的回复进度。

---

## OAC-E2E-08 刷新后等待流式回复完成并固化为最终消息

**覆盖**：§10.1b Reload During Stream；验收映射：流式输出、消息加密、E2E 关键用户旅程  
**铁律**：C2 加密存储，C5 消息可回放

### 背景

Owner 已在流式回复过程中刷新页面，现在继续等待 Agent 完成回复，并确认最终消息不会重复或丢失。

### 前置条件

- OAC-E2E-07 已执行到刷新后恢复 active run。
- Host 与 Provider 仍能完成该 run。

### 操作步骤

1. Owner 保持刷新后的 Chat 页面打开。
2. Owner 等待正在进行的 Agent 回复结束。
3. Owner 查看最终 Agent 消息。
4. Owner 再次刷新页面。
5. Owner 对比最终回复是否稳定显示。

### 预期结果

- run 完成后，页面显示一条完整 Agent 最终消息。
- 最终消息不会与流式片段重复成多条回复。
- 再次刷新后，最终消息仍存在且内容一致。
- 若中途失败，页面显示明确失败状态，而不是静默消失。

### 验证点

- completed 事件写入最终 Agent message。
- run event 与 final message 均密文落库。
- 页面刷新后的回放以最终消息为准，并保留可审计的 run 状态。

---

## OAC-E2E-09 重置上下文后保留历史消息

**覆盖**：§10.1c Reset Context；验收映射：Conversation 生命周期、Dashboard 全流程  
**铁律**：C2 加密存储，C5 消息可回放

### 背景

Owner 想结束当前 Agent 的上下文记忆，但仍保留过去的聊天记录用于查看。

### 前置条件

- 当前 Agent Chat 至少已有两轮历史对话。
- 页面提供“重置上下文”入口。

### 操作步骤

1. Owner 点击“重置上下文”。
2. Owner 阅读确认提示。
3. Owner 确认重置。
4. Owner 查看聊天区历史消息。
5. Owner 刷新页面后再次查看历史消息。

### 预期结果

- 重置操作需要 Owner 明确确认。
- 确认后，历史消息仍展示在 Chat 中。
- 页面可见重置已发生的提示或系统记录。
- 刷新后历史消息仍可回放，不因重置而被删除。

### 验证点

- 重置写入加密 system message，不记录明文敏感信息。
- `provider_session_id` 与 `provider_work_dir` 被清空。
- 历史消息继续通过授权解密读路径回放。

---

## OAC-E2E-10 重置上下文后下一条消息开启新上下文

**覆盖**：§10.1c Reset Context；验收映射：Conversation 生命周期、消息路由  
**铁律**：C1 中立中继，C5 消息可回放

### 背景

Owner 完成上下文重置后，发送一条新消息，预期 Provider 不再复用重置前的会话上下文。

### 前置条件

- OAC-E2E-09 已完成。
- Host 在线并能接收 reset 通知。

### 操作步骤

1. Owner 在重置后的 Chat 中输入新消息。
2. Owner 点击发送。
3. Owner 等待 Agent 回复完成。
4. Owner 对比新回复与重置前上下文是否无不必要关联。
5. Owner 刷新页面查看历史和新回复。

### 预期结果

- 新消息成功发送并收到 Agent 回复。
- 新 run 使用新的 Provider 上下文。
- 旧历史仍可查看，但不会强制注入到新 Provider session。
- 页面不会删除旧历史或误显示为全新空会话。

### 验证点

- Host 收到 `owner_agent_session_reset` 后释放旧 provider session。
- 下一条 run 不复用旧 `provider_session_id` / `provider_work_dir`。
- 平台只传递 reset 指令与消息，不自行总结或改写旧上下文。

---

## OAC-E2E-11 Host 离线时发送消息进入待处理

**覆盖**：§10.2 Offline Path；验收映射：离线处理、Dashboard 全流程  
**铁律**：C2 加密存储，C5 消息可回放

### 背景

Owner 打开 Agent Chat 时，本地 Host 已断开。Owner 仍希望输入先被保存，稍后再处理。

### 前置条件

- Owner 已有一个绑定本地 Host 的 Agent。
- Host 已停止或断开连接。
- Owner 当前在该 Agent 的 Chat 页面。

### 操作步骤

1. Owner 观察页面上的 Agent 离线状态。
2. Owner 在输入框输入一条消息。
3. Owner 点击发送。
4. Owner 查看消息旁边的状态提示。
5. Owner 刷新页面。

### 预期结果

- Chat 明确显示 Agent 离线。
- Owner 的消息被保存为待处理。
- 页面不显示 Agent 正在执行或已回复。
- 刷新后待处理消息仍存在，状态清晰。

### 验证点

- 离线消息密文保存为 pending。
- 不创建已被 Host 接收的执行假象。
- pending 状态可回放，符合断线后可拿回历史的 C5 要求。

---

## OAC-E2E-12 Host 重新上线后不自动执行待处理消息，用户手动重发

**覆盖**：§10.2 Offline Path；验收映射：离线处理、消息路由  
**铁律**：C1 中立中继，C5 消息可回放

### 背景

Owner 曾在 Host 离线时发送消息。Host 稍后重新上线，但系统不应擅自执行离线期间的任务，Owner 需要主动重发。

### 前置条件

- OAC-E2E-11 已产生一条待处理消息。
- Host 已重新上线，页面能看到 Agent 在线。

### 操作步骤

1. Owner 等待 Host 重新上线。
2. Owner 查看原待处理消息状态。
3. Owner 确认页面没有自动出现 Agent 回复。
4. Owner 点击该消息的重新发送入口。
5. Owner 等待新的 Agent 回复完成。

### 预期结果

- Host 上线不会自动执行旧 pending 消息。
- 原 pending 消息保持可见，并提示需要 Owner 手动处理。
- Owner 点击重新发送后，系统创建新的执行并收到回复。
- 旧 pending 消息标记为已替代或不再待处理。

### 验证点

- Host 重连不触发 pending 自动补跑。
- 手动重发创建新的 run，旧 pending 标记为 replaced。
- Gateway 不根据离线期间的内容自行决定是否执行。

---

## OAC-E2E-13 离线待处理消息达到上限时给出清晰提示

**覆盖**：§10.2 Offline Path；验收映射：离线处理、配额限制  
**铁律**：C2 加密存储，C5 消息可回放

### 背景

Owner 在 Agent 长时间离线时连续发送多条消息，系统需要防止待处理队列无限增长。

### 前置条件

- Host 保持离线。
- 当前 conversation 的 pending 消息数量可被测试数据准备到接近上限。

### 操作步骤

1. Owner 打开离线 Agent 的 Chat。
2. Owner 连续发送消息，直到接近待处理上限。
3. Owner 再发送一条新消息。
4. Owner 查看页面提示。
5. Owner 刷新页面查看已有待处理消息。

### 预期结果

- 上限内的消息可保存为待处理。
- 超过上限时，页面明确提示 Owner 需要先处理待处理消息。
- 超出上限的消息不会被误标为已执行。
- 刷新后已保存的 pending 消息仍可见。

### 验证点

- 单会话 pending 上限按规则生效。
- 被拒绝的消息不产生明文落库或幽灵 run。
- 已保存 pending 消息仍为密文存储并可回放。

---

## OAC-E2E-14 Owner B 看不到 Owner A 的 Agent、Host 和 Chat

**覆盖**：§10.3 Security Path；验收映射：RLS 行级安全、Dashboard 全流程  
**铁律**：C1 中立中继，C2 加密存储

### 背景

Owner A 已创建 Agent 并产生私聊消息。Owner B 登录后不应看到任何属于 Owner A 的私聊资产。

### 前置条件

- Owner A 已完成至少一个 Agent 和一轮私聊。
- Owner B 是独立测试账号。
- 两个账号不共享任何 Agent、Host 或 QRCode。

### 操作步骤

1. Owner A 登录并确认自己的 Agent 和历史消息存在。
2. Owner A 退出登录。
3. Owner B 登录 Dashboard。
4. Owner B 打开 Agent 列表。
5. Owner B 尝试进入 Chat 页面查看可见内容。

### 预期结果

- Owner B 的 Agent 列表不显示 Owner A 的 Agent。
- Owner B 看不到 Owner A 的 Host 状态。
- Owner B 看不到 Owner A 的任何私聊消息或历史。
- Owner B 的页面不因隐藏数据而报错。

### 验证点

- Owner 私聊数据按 owner_id 或可追溯关系隔离。
- Owner B 的授权读路径无法解密 Owner A 的 conversation。
- Gateway 不把 Owner A 的 run 或 Host 事件 fanout 给 Owner B。

---

## OAC-E2E-15 Owner B 直接访问 Owner A 私聊入口被拒绝

**覆盖**：§10.3 Security Path；验收映射：RLS 行级安全、安全与加密  
**铁律**：C2 加密存储

### 背景

Owner B 通过浏览器地址或旧页面状态拿到了 Owner A 的 Agent / Chat 标识，也不能绕过页面列表访问私聊内容。

### 前置条件

- Owner A 已有 Agent Chat。
- 测试环境已记录 Owner A 的 Chat 入口或 Agent 标识。
- Owner B 已登录。

### 操作步骤

1. Owner B 在浏览器中打开 Owner A 的 Chat 入口。
2. Owner B 等待页面加载。
3. Owner B 查看页面提示。
4. Owner B 返回自己的 Dashboard。

### 预期结果

- Owner B 不能看到 Owner A 的消息。
- 页面显示无权限、未找到或返回自己的安全默认页面。
- 页面不展示任何 Owner A 的 Agent 名称、Host 状态或消息片段。
- Owner B 返回自己的 Dashboard 后仍能正常使用自己的数据。

### 验证点

- 直接访问绕不过 Owner 授权校验。
- 拒绝响应不携带 Owner A 的明文、密文摘要或敏感元数据。
- RLS / API / Edge Function 授权链结果一致。

---

## OAC-E2E-16 Owner 删除账号后私聊数据与 Host Token 被清理

**覆盖**：§10.3b Owner Deletion；验收映射：删除与密钥销毁、安全与加密  
**铁律**：C2 加密存储，C5 消息可回放

### 背景

Owner 触发账号删除或 GDPR 删除后，平台不应留下可恢复的私聊密文、会话密钥或 Host Token hash。

### 前置条件

- 测试 Owner 已创建 Agent、Host Token，并产生私聊消息和 run event。
- 测试环境提供账号删除或 GDPR 删除触发入口。

### 操作步骤

1. Owner 登录 Dashboard。
2. Owner 打开账号删除或数据删除入口。
3. Owner 按页面提示确认删除。
4. Owner 等待删除流程完成。
5. Owner 尝试重新登录或打开旧 Chat 地址。

### 预期结果

- 删除流程需要明确确认。
- 删除完成后，Owner 无法继续访问旧 Agent Chat。
- 旧 Host Token 不能再用于 Host 连接。
- 旧 Chat 地址不再显示历史消息。

### 验证点

- `owner_agent_*`、`owner_agent_conversation_keys` 与 Host Token hash 按级联规则清理。
- 删除后不存在孤儿密文、孤儿 run event 或可用 token hash。
- 如果历史不可回放，是因为 Owner 已完成删除，而不是普通断线场景的数据丢失。

---

## OAC-E2E-17 现有 Visitor 扫码聊天仍然零注册可用

**覆盖**：§10.4 Regression Path；验收映射：移动端扫码全链路、移动端匿名即聊、跨设备历史同步  
**铁律**：C4 移动端零注册，C5 消息可回放

### 背景

Owner Agent Chat 是新增私聊能力，不能破坏现有 Visitor 扫码聊天链路。

### 前置条件

- 已有一个可访问的公开 QRCode 或移动端扫码入口。
- 对应 Agent 在线或测试环境有可控回复。
- 浏览器以移动端视口打开。

### 操作步骤

1. Visitor 用移动端视口打开扫码入口。
2. Visitor 查看 Profile 页面。
3. Visitor 点击开始聊天。
4. Visitor 不注册账号，直接发送一条消息。
5. Visitor 等待 Agent 回复。
6. Visitor 刷新页面查看历史。

### 预期结果

- Visitor 不需要注册或登录即可进入聊天。
- Visitor 消息能发送并收到 Agent 回复。
- 刷新后 Visitor 历史仍可回放。
- 新增 Owner 私聊入口不改变旧扫码入口的主要体验。

### 验证点

- Visitor 链路仍使用 Session Token 标识，而不是强制 Owner 登录。
- Visitor 历史通过既有 `decrypted-messages` actor 回放。
- Owner 私聊数据不会出现在 Visitor 聊天中。

---

## OAC-E2E-18 Agent Plugin 历史回放仍可用且不能读取 Owner 私聊

**覆盖**：§10.4 Regression Path；验收映射：Agent plugin history replay、Security Envelope、安全与加密  
**铁律**：C1 中立中继，C2 加密存储，C4 移动端零注册，C5 消息可回放

### 背景

新增 Owner 私聊后，原有 Agent Plugin 读取 Visitor 历史的能力仍要可用，但不能越权读取 Owner 私聊。

### 前置条件

- 已有一段 Visitor 扫码聊天历史。
- 已有一段 Owner Agent Chat 私聊历史。
- 测试环境具备 Agent Plugin 历史回放能力。

### 操作步骤

1. Visitor 完成一轮扫码聊天。
2. Agent Plugin 读取该 Visitor 对话历史。
3. Owner 完成一轮 Owner Agent Chat 私聊。
4. Agent Plugin 尝试读取 Owner 私聊历史。
5. Owner 回到 Dashboard 确认自己的私聊仍可正常查看。

### 预期结果

- Agent Plugin 能读取被授权的 Visitor 历史。
- Agent Plugin 不能读取 Owner 私聊历史。
- Visitor 与 Owner 两条历史回放链路互不污染。
- Owner Dashboard 不受 Agent Plugin 拒绝访问结果影响。

### 验证点

- `decrypted-messages` 三 actor 旧路径保持可用。
- plugin agent token 调 owner-private actor 被拒绝。
- Gateway / Edge Function 不把 Owner 私聊明文暴露给 Agent Plugin。
- Visitor 零注册体验保持不变。
