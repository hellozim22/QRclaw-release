# QRClaw Owner Agent Chat 设计方案

> **版本**: V0.1  
> **日期**: 2026-04-27  
> **状态**: 设计方案草案  
> **修订记录**: 2026-04-27 根据 `owner-agent-chat-architecture-review.md` + 二次评审，落地 B9/M2/M9，并同步 B12 的 pending 生命周期展示。  
> **配套产品文档**: `requirements/owner-agent-chat-product-requirements.md`  
> **配套技术文档**: `requirements/owner-agent-chat-technical-specification.md`  
> **目标读者**: Product / Design / Frontend / QA

---

## 一、设计目标

Owner Agent Chat 的设计目标是让 QRClaw 从“二维码管理工具”升级为“Owner 的智能体工作台”。

第一版强调三件事：

1. Owner 能清楚看到自己有哪些 Agent。
2. Owner 能像微信一样快速切换 Agent 私聊。
3. Owner 能理解本地 Agent 的 Full Access 风险，但不被底层 runtime 细节打扰。

---

## 二、视觉与组件约束

本设计遵守 `qrclaw-visual` 规范：

- 颜色使用 `var(--color-*)` / `var(--gradient-*)`。
- 字号、间距、圆角使用 `var(--text-*)` / `var(--space-*)` / `var(--radius-*)`。
- 图标统一 `lucide-react`。
- Web Dashboard 基准视口：`1440×900`。
- 复用现有组件：`Button`、`Avatar`、`Badge`、`Input`、`MessageBubble`、`MessageList`、`ChatInputBar`、`ConnectionStatusBanner`、`Dialog`。
- 不新增 Tailwind config。
- 不使用不存在的 v2 token，如 `--surface-canvas`、`--accent-brand`。

---

## 三、信息架构

Dashboard 左侧导航：

```text
Chat
智能体
公开入口 / 分享
Settings
```

导航语义：

| 入口 | 目的 |
|------|------|
| Chat | 日常和 Agent 对话 |
| 智能体 | 创建、管理、查看 Agent 绑定能力 |
| 公开入口 / 分享 | 承接现有 QRCode 能力，后续 Publish as QR |
| Settings | 账号、订阅、token、设备等设置 |

---

## 四、Chat 页面

### 4.1 页面布局

Web Dashboard 三栏：

```text
Left Nav 80px
Conversation List 320px
Chat Panel fill
```

结构：

```text
Chat
├─ Agent 会话列表
│  ├─ 搜索 / 筛选
│  ├─ Agent row
│  └─ 离线 / 待处理 badge
└─ Chat Panel
   ├─ Header
   ├─ MessageList
   ├─ Pending / Running 状态
   └─ ChatInputBar
```

### 4.2 Agent 会话列表

每个列表项显示：

```text
[Avatar] 产品助手                 [online badge]
Claude Code · 本地在线
最近一条消息摘要...
```

状态 badge：

| 状态 | 文案 |
|------|------|
| online | 在线 |
| offline | 离线 |
| pending | 待处理 |
| running | 回复中 |
| failed | 失败 |

### 4.3 Chat Header

Header 内容：

- Agent 头像
- Agent 名称
- 底层能力简短说明：`Claude Code · 本地在线`
- 操作按钮：
  - `重置上下文`
  - `查看智能体`
  - `更多`

不显示：

- raw runtime id
- binary path
- 版本过低/未安装噪音

### 4.4 消息流

第一版是简洁聊天模式：

- Owner 消息右侧。
- Agent 消息左侧。
- 流式回复显示为同一条 Agent 气泡逐步更新。
- 页面刷新后，如果 run 仍在执行，UI 通过历史 messages + active run text events 恢复正在流式输出的气泡。
- run timeline、tool_use、thinking 不展开。

状态展示：

```text
正在回复...
排队中...
Agent 离线，消息已保存为待处理
待处理消息已过期
已重新发送，旧消息已替代
发送失败，点击重试
```

### 4.5 输入栏

输入栏行为：

- Agent 在线：允许发送。
- Agent 离线：允许输入，但发送后进入待处理，不自动执行。
- 待处理消息：显示“重新发送”和“删除”。
- run 执行中：允许继续输入；执行层根据 provider 能力并发或排队。
- 空消息不可发送。

快捷提示：

- 使用 Agent 的 `suggested_prompts`。
- 没有历史消息时显示 3-5 个建议问题。

### 4.6 空态

无 Agent：

```text
还没有智能体
创建一个 Agent 后，就可以在这里开始对话。
[创建 Agent]
```

有 Agent 但无消息：

```text
开始和产品助手对话
选择一个建议问题，或直接输入你的任务。
```

---

## 五、智能体页面

### 5.1 页面目标

智能体页面是管理入口，只展示用户已经定义好的业务 Agent。

不展示：

- 未安装的 CLI
- 版本过低的 provider
- 未连接的底层能力噪音

### 5.2 列表布局

```text
智能体
[创建 Agent]

产品助手
底层：Claude Code · 本地在线
说明：帮我整理需求和产品方案
[进入 Chat] [编辑]

代码审查助手
底层：Cursor Agent · 本地在线
说明：检查代码质量和潜在风险
[进入 Chat] [编辑]
```

### 5.3 Agent 卡片字段

| 字段 | 展示 |
|------|------|
| avatar | Agent 头像 |
| name | 主标题 |
| description | 一句话说明 |
| provider | OpenClaw / Claude Code / Cursor Agent / Codex |
| source | 本地 / 云端 |
| status | 在线 / 离线 |
| execution_mode | Full Access / Standard |

### 5.4 操作

- 进入 Chat
- 编辑
- 重置上下文
- 归档
- 后续：Publish as QR

归档后的 Agent 默认不显示，可从筛选中恢复。

---

## 六、创建 Agent 流程

### 6.1 Step 1：选择底层 Agent

先选 Agent 类型：

```text
OpenClaw
Claude Code
Cursor Agent
Codex
```

再选来源：

```text
本地
云端
```

UI 优先展示 provider，不突出设备名。

### 6.2 Step 2：基础信息

字段：

- 名称
- 头像
- 描述

### 6.3 Step 3：行为设定

字段：

- Instructions
- Suggested Prompts

Suggested Prompts 建议最多 5 条。

### 6.4 Step 4：Full Access 确认

当选择本地高权限 provider 时必须显示：

```text
Full Access
这个本地 Agent 可能读取/写入本机文件，并运行命令。
仅你自己可以在本轮私聊功能中触发它；访客无法触发。

[我理解并确认]
```

未确认不能创建。

### 6.5 Step 5：完成

完成页：

```text
产品助手已创建
现在可以开始私聊。
[进入 Chat]
[继续创建]
```

---

## 七、本地 Host 接入设计

### 7.1 入口

在智能体页提供：

```text
[连接本地 Agent]
```

### 7.2 Token 接入弹窗

流程：

```text
1. 点击连接本地 Agent
2. 生成一次性 token
3. 复制终端命令
4. Host 连接成功后自动刷新状态
```

命令展示：

```bash
qrclaw-agent-host login --token <token>
qrclaw-agent-host start
```

安全提示：

- token 只展示一次。
- 不要分享给他人。
- 可在设置中撤销。

### 7.3 已连接 Host 状态

在智能体详情或 Settings 中显示：

```text
本地连接
状态：在线
底层 Agent：OpenClaw、Claude Code、Cursor Agent、Codex
最近在线：刚刚
[断开连接]
```

主列表不以设备为主心智展示。

### 7.4 多 Host 选择

当同一 Owner 有多个本地 Host 在线时，创建 Agent 流程需要让用户选择默认执行位置：

```text
选择执行位置
● 这台 Mac · Claude Code · 在线
○ Linux 工作站 · Claude Code · 在线
```

选中的 Host 写入 Agent binding。之后智能体卡片仍优先展示 provider，不把设备名作为主标题。

---

## 八、公开入口 / 分享

现有 QRCode 功能改为低优先级入口：

```text
公开入口 / 分享
```

第一版只保留已有 QR 管理能力，不把新 Owner 私聊 Agent 默认发布给访客。

后续 `Publish as QR` 流程：

```text
Agent 详情
→ Publish as QR
→ 设置公开访问权限
→ 生成 QR / Share Link
```

---

## 九、错误与边界状态

| 场景 | UI 行为 |
|------|---------|
| 没有本地 Host | 创建流程提示先连接本地 Agent，或选择云端 |
| Host 离线 | Chat 可保存待处理，不自动执行 |
| token 过期 | 弹窗提示重新生成 token |
| provider 不可用 | 创建流程不显示该 provider，诊断页可查看 |
| run 失败 | 消息下方显示失败原因和重试按钮 |
| run 超时 | 标记失败，提示“执行超时，请重试” |
| pending 达到上限 | 禁用发送并提示先处理待处理消息 |
| pending 过期 | 展示为过期状态，不自动执行 |
| 上下文重置 | 弹确认框，说明历史消息保留 |
| Full Access 未确认 | 创建按钮禁用 |

---

## 十、文案规范

术语：

| 推荐 | 避免 |
|------|------|
| 智能体 / Agent | runtime |
| 底层 Agent | daemon |
| 本地 / 云端 | execution backend |
| 公开入口 / 分享 | My QRcode |
| Full Access | bypassPermissions |

术语冻结：

- 用户界面不出现 `runtime`、`daemon`、`provider adapter`。
- 错误提示面向用户说“本地 Agent / 云端 Agent / 执行位置”。
- 工程内部可以使用 runtime / provider，但 i18n 文案不得泄露内部术语。

关键文案：

```text
Agent 离线，消息已保存为待处理。上线后你可以手动重新发送。
```

```text
重置上下文会让下一条消息从新的 Agent 会话开始，但不会删除历史消息。
```

---

## 十一、验收标准

设计完成标准：

- Chat / 智能体 / 公开入口 三个入口语义清楚。
- Chat 空态、在线、离线、执行中、失败状态都有明确 UI。
- 创建 Agent 包含 Full Access 确认。
- 本地 Host 接入流程有 token 安全提示。
- 页面不出现 `runtime`、`daemon` 等低层术语。
- 视觉实现时不新增硬编码颜色/字号/间距/圆角。

