# Wave 10 用户验收问题记录

**验收人**: zimzheng（普通用户视角）
**开始时间**: 2026-04-29 11:18
**环境**: localhost:3001（web）+ gateway + 本机 CLI（claude/cursor-agent/codex/openclaw 均已装）

---

## Issue 记录格式
- **页面/步骤**：在哪
- **现象**：看到了什么
- **期望**：应该是什么
- **严重**：🔴阻塞 / 🟡体验 / 🟢建议

---

## #1 🟡 登录态显示异常
- **页面**：`/login`
- **现象**：输对测试账号密码（`zeze-test@qrclaw.test` / `QRClaw-Test-Aa1!`），页面下方显示 "Invalid login credentials" 红字；但实际上会话已建立，`/chat` 可访问。
- **期望**：登录成功应直接跳转 `/chat`，不展示错误提示。
- **推测**：前端 error state 没在成功响应后清空，或登录成功后没跳转只是隐式设了 session。
- **复现**：11:16 截图（已发）。

## #2 🔴 "Set up local runtime" 引导让普通用户安装，无法直接用
- **页面**：`/chat`（登录后首页）
- **现象**：右栏显示 `RUNTIME 0/4 ONLINE` + "还没有检测到 QRClaw Host。安装后会自动发现本机 CLI"，并给两个按钮「下载 Mac App」「Homebrew 命令」。四个 runtime 全部显示「未安装」。
- **实际本机状态**：claude / cursor-agent / codex / openclaw 四个 CLI **均已安装可用**（E2E 昨天跑绿就是证据）。
- **期望**：对普通 owner 用户应**一键启动 host**（或有更平滑的 onboarding），不该把后台守护进程的存在暴露成"先去装个包"。
- **根因猜测**：`qrclaw-agent-host` Go daemon 未运行。需要 owner token mint → host CLI login → long-running `run` 订阅 WS 后，dashboard 才会上线。这个流程对 E2E harness 是全自动的，但对真人用户是**完全空白**的手动步骤。
- **产品决策相关**：这正是昨晚 Wave 10 pivot 反馈 UX-1（Host token 新手困惑）的核心痛点。

---

## #3 🔴 为什么没直接识别本机已装的 runtime？
- **页面**：`/chat` 首屏
- **现象**：本机 claude / cursor-agent / codex / openclaw 4 个 CLI 全部已装（`which claude` 等都能找到），但页面显示 0/4 ONLINE，还让去装 Mac App / brew。
- **用户质疑**："你之前 E2E 是怎么测的？"
- **真相**：E2E harness 里**自己 spawn 了 Go `qrclaw-agent-host run` 子进程 + 自己 mint host token + 自己插 `agent_hosts` 记录**（见 `tests/helpers/wave10-harness.ts` 483/526 行）。真人用户没这一步，UI 就永远是 0/4。
- **产品裂缝**：detect（CLI 扫描）被塞进了 Go daemon，daemon 没跑 = UI 永远看不见本机 CLI。正确应该是 **Web 端或一个一键按钮直接触发本机 detect**，甚至 runtime rail 本身可以脱离 daemon 先显示「本机已装 ✅」。
- **严重**：🔴 这是 E2E 绿 vs 真人用户体验完全脱节的证据，需要产品层面补 onboarding。

## #4 🔴 对话页面左侧两层结构违反既定设计
- **页面**：`/chat`
- **现象**：左侧有两列结构（外层 runtime rail CL/CU/CO/OP + 内层 sessions 列表），用户疑惑"怎么有 2 层"。
- **用户原话**："之前发过给你要求每个 agent 应该跟微信聊天框一样出现在左侧，点击头像之后进入对话"
- **期望**：**单列 agent 列表（微信风格）**——每个 agent 一行，头像 + 名称 + 最后一条消息预览 + 未读数。点击进入对话。**不应该**把 runtime type 作为独立一层暴露给用户。
- **严重**：🔴 违反了之前明确提出的微信式交互要求。Wave 10 pivot 反馈 UX-2/UX-3 本质也是在说这个——现在的"Messages + Chat + Runtime rail"多入口混乱，应合并为单一 agent 列表。

## #5 🔴 产品 bug清单（Opus 4.7 onboarding 修复过程曝光）
- **B1**：`ensureDefaultAgents` 只建 `agents` 行不建 `agent_bindings` → 用户发消息返 404 "Owner agent not found"
- **B2**：注册/测试账号 pipeline 不自动建 `owners` 行（只有 auth.users 行）
- **B3**：host 上报 `status=online`但 gateway `syncAgentRuntimes` 只认 `available` → runtime 永远 offline（已在 `gateway/src/db/owner-runtimes.ts` 1 行修复，其它两个是 hack 补 DB 绕过）
- **需要**：B1/B2 要正式修，不能依赖 mint 脚本补数据

## #6 🔴 输入框中文输入法打不进字
- **页面**：`/chat` CL 会话内
- **现象**：中文输入法打不进字；英文直接敲可以（Playwright 模拟英文输入可通过）。
- **根因推测**：assistant-ui `<Thread>` composer parent re-render 打断 IME composition（useMemo adapter 依赖 messages 数组引用，每次 streaming 新 msg push 都新 object → runtime 重建 → textarea unmount/remount）
- **严重**：🔴 E2E 盲点 —— 中文 IME 场景从不在测试用例，应添加 IME regression

## #6-legacy 输入框无法输入文字（英文）
- **页面**：`/chat` CL 会话内
- **现象**：PONG 可以收到后，再次点输入框打不进字。placeholder显示“输入消息...”（canSend=true），但输入没反应。
- **怀疑**：http 能后 streaming status 没清迹，`isRunning` 锁住输入；或 assistant-ui `<Thread>` composer focus bug
- **期望**：上一条消息完成后输入框立即可用

## #7 🔴 保单同一条消息连发两次（轮突图片可见）
- 截图里同一条 "Reply with exactly the word PONG..." 出现两次，两条 PONG 回复。这是验收脚本一次发，UI 重发？还是 gateway 重放？待查

## #8 🔴 Assistant 消息视觉：去掉气泡框 + 头像
- **页面**：`/chat` 会话内
- **当前**：assistant 回复带左侧头像 + 气泡框包裹
- **期望**（参考 Claude.ai / ChatGPT 样式）：
  - User 消息：右侧浅灰气泡（保留）
  - Assistant 消息：**无头像、无气泡框**，文字直接铺在背景上，代码块用圆角浅框
- **用户参考图**：Claude.ai 风格（左伸展式排版 + 代码块带语言标签）

## #9 🟡 看不到 agent 思考过程
- **页面**：`/chat` 对话中
- **现象**：agent 回复直接出最终内容，没有"thinking" / "reasoning" 展开折叠区
- **期望**：参考 Claude.ai 客户端，显示思考过程（可折叠），让用户知道 agent 在做什么
- **涉及**：SSE 是否传了 thinking tokens / UI 是否有 thinking 渲染组件

## #10 🔴 代码块样式丑（黑色背景）
- **页面**：`/chat` assistant 消息中的代码块
- **现象**：代码块是纯黑背景 + 白字，跟 Claude.ai 客户端（浅灰背景 + 语法高亮 + 语言标签 + 复制按钮）差距大
- **期望**：参考 Claude.ai —— 浅色背景、语法高亮、语言标签、圆角、一键复制
- **涉及**：assistant-ui 的 Markdown 渲染 + rehype/prism 代码高亮配置

## #11 🔴 Cursor Assistant 对话消息重复（发1条变2条，回复也2条）
- **页面**：`/chat` 选 Cursor runtime 对话
- **现象**：输入一条消息后 UI 显示 2 条相同的 user 消息 + 2 条相同的 assistant 回复
- **关联**：跟 #7（Claude 重复）类似，可能是同一个 store/SSE bug 在不同 provider 下都复现
- **期望**：发 1 条 = 显示 1 条

## #12 🟡 没有上传图片/文件/语音入口
- **页面**：`/chat` 输入框
- **现象**：只有纯文本输入 + 发送按钮，没有 📎（附件）、🎤（语音）、📷（图片）等入口
- **期望**：至少有 📎 上传文件/图片入口（语音可后续），参考 Claude.ai / ChatGPT
- **涉及**：ChatComposer leadingSlot/trailingSlot 预留了位置但没填

## #13 🟡 Agent 在线绿点有白色背景框，太丑
- **页面**：`/chat` 左侧 agents 列
- **现象**：绿色在线指示器有一圈白色背景边框，视觉累赘
- **期望**：简洁小绿点即可表达在线状态，不需要白色背景框，参考微信/Discord 的在线指示
- **改动**：纯 CSS，去掉 border/box-shadow/bg 即可

## #14 🔴 OpenClaw runtime 对话失败
- **页面**：`/chat` 选 OpenClaw agent 对话
- **现象**：回复内容是内部日志 `[openclaw-wecom-bot] Loaded bot state from file: {"status":"running","lastChatId":"","webhookUrl":""}`
- **根因**：`qrclaw-agent-host` 调的 `openclaw agent --local --json --session-id ... --message` 共享了全局 session（之前 4/28 日志已定位），openclaw CLI 返回的是自己 wecom-bot 初始化日志而不是 AI reply
- **关联**：4/28 memory 记录的 "本机 openclaw CLI 架构发现" —— 需要 per-agent 独立 session-id
- **修复方向**：`qrclaw-agent-host/internal/provider/openclaw/openclaw.go` 给每个 agent 分配独立 session-id，不共享全局 session

## #15 🟡 Agents 页面冗余元素
- **页面**：`/agents`
- **现象**：
  - 左上角“智能体”三个字没用，去掉
  - “显示全部”“隐藏离线/归档”筛选按钮看不懂，去掉
  - 每个 agent 缺少在线/离线状态指示
- **期望**：简洁列表 + 每个 agent 显示在线状态

## #16 🟡 对话页 "Runtime 4/4 online" 多余
- **页面**：`/chat` 顶部
- **现象**：显示 "Runtime 4/4 online" 文字，对用户无意义
- **期望**：去掉，用绿点已经表达在线状态

## #17 🟡 Session 布局调整 + Agent 默认头像
- **页面**：`/chat`
- **现象**：
  - "new session" 按钮位置奇怪，应放到对话框头部
  - session 列表 + 历史应收到每个 agent 对话的二级入口里，让主界面更简洁
  - claude / codex / openclaw / cursor 4个 agent 没有头像，需要默认头像
- **用户说**：先放默认头像，会另外提供

## #18 🔴 没有流式输出（打字机效果）
- **页面**：`/chat` assistant 回复
- **现象**：agent 回复是一次性全部出现，没有打字机/流式效果
- **期望**：参考 Claude.ai —— 逐字/逐词流式渲染，让用户看到 agent 正在回复的过程
- **涉及**：SSE stream 已有 delta 事件（E2E 测试截图 05-reply-streaming.png 已证明），但前端 store 可能把 delta 放进 buffer 了最后一次性 flush，而不是逐 chunk 渲染
- **用户原话**："视觉上要下功夫，目前做得不够精细"

---

## 待验收项

- [ ] 左栏 AGENTS 4 slot 上线指示（CL/CU/CO/OP 绿点）
- [ ] 点 CL 进入 assistant-ui Thread
- [ ] 发 "只输出数字 42..." → 真 claude CLI 回 42（流式）
- [ ] 刷新 → 历史回放
- [ ] 切换 runtime → session list 独立
- [ ] Markdown / 代码块渲染（E2E-05/06，spec 还 skip）
- [ ] 语音 / 文件 / 图片（UX-4 反馈项）
- [ ] Messages / Chat 入口合并（UX-2）
- [ ] My QRcode 并入 Agents（UX-3）
- [ ] 离线 agent 清理（遗留 offline agent 视觉累赘）
- [ ] /chat 页面下方大片空白布局 bug
