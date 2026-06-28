# QRClaw 设计稿图层截图索引

本目录包含从 `pencil-new.pen` 文件导出的所有页面/组件截图。
Agent 在开发时应直接读取这些图片作为像素级还原的视觉基准。

## 命名规则

| 前缀 | 含义 |
|------|------|
| `Mobile-` | 移动端页面 (390×844) |
| `Web-` | Web 端页面 (1440×900) |
| `Component-` | 可复用组件 |
| `Components-` | 组件合集 |
| `FlowDiagram-` | 流程图 |
| `QR-Styles-` | QR Code 样式展示 |
| `_annotation-` | 交互说明注释（非页面，仅文字描述） |
| `_label-` | 画布分区标签（非页面） |
| `_text-` | 独立文字元素 |

## 页面截图 → Pencil nodeId 映射

Agent 可通过 `get_screenshot(filePath="design/pencil-new.pen", nodeId="<ID>")` 获取实时截图，
也可直接读取本目录下的 PNG 文件作为静态视觉基准。

### Mobile 页面

| 截图文件 | Pencil nodeId | 页面名称 | 描述 |
|---------|---------------|---------|------|
| `Mobile-Profile.png` | `e1DDM` | Mobile/Profile | Agent 个人资料页（访客视角） |
| `Mobile-Profile-Paused.png` | `sJcOR` | Mobile/Profile-Paused | Agent 暂停服务状态 |
| `Mobile-Chat.png` | `IgH0g` | Mobile/Chat | 聊天对话页 |
| `Mobile-Chat-Streaming.png` | `K6mbw` | Mobile/Chat-Streaming | 流式输出对话 |
| `Mobile-AgentNoReply.png` | `9KYND` | Mobile/AgentNoReply | Agent 无响应状态 |
| `Mobile-Offline-Agent.png` | `J6l3h` | Mobile/Offline-Agent | Agent 离线状态 |
| `Mobile-LongPressCopy.png` | `nNVxR` | Mobile/LongPressCopy | 长按复制消息 |
| `Mobile-SwipeDelete.png` | `sPwFf` | Mobile/SwipeDelete | 滑动删除会话 |
| `Mobile-ScanQR.png` | `RXEpt` | Mobile/ScanQR | QR 扫码页 |
| `Mobile-ScanQR-AgentGuide.png` | `DFoBo` | Mobile/ScanQR-AgentGuide | 扫码引导页 |
| `Mobile-Login.png` | `9nzBk` | Mobile/Login | 登录页 |
| `Mobile-SignUp.png` | `rgesk` | Mobile/SignUp | 注册页 |
| `Mobile-Verify.png` | `1QsK7` | Mobile/Verify | 邮箱验证页 |
| `Mobile-Messages.png` | `Qxtxk` | Mobile/Messages | 消息列表页 |
| `Mobile-Messages-NewUser.png` | `j8P8r` | Mobile/Messages-NewUser | 新用户消息页 |
| `Mobile-Me.png` | `5poPN` | Mobile/Me | 个人中心页 |
| `Mobile-MyQRCodes.png` | `X2xHg` | Mobile/MyQRCodes | 我的 QR 码列表 |
| `Mobile-MyQRCodes-Empty.png` | `7X6Kn` | Mobile/MyQRCodes-Empty | 无 QR 码空状态 |
| `Mobile-QRCodeDetail.png` | `eZDQG` | Mobile/QRCodeDetail | QR 码详情页 |
| `Mobile-404.png` | `k0nbt` | Mobile/404 | 404 页面 |

### Web 页面

| 截图文件 | Pencil nodeId | 页面名称 | 描述 |
|---------|---------------|---------|------|
| `Web-LandingPage.png` | `tD9CD` | Web/LandingPage | 产品首页 |
| `Web-SignUp.png` | `S3TMu` | Web/SignUp | Web 注册页 |
| `Web-EmailVerify.png` | `JMDpZ` | Web/EmailVerify | 邮箱验证页 |
| `Web-Claim-LoggedIn.png` | `r2OZD` | Web/Claim-LoggedIn | 已登录绑定 Agent |
| `Web-Claim-NotLoggedIn.png` | `c2cAy` | Web/Claim-NotLoggedIn | 未登录绑定 Agent |
| `Web-Dashboard-Messages.png` | `FCW4Y` | Web/Dashboard-Messages | Dashboard 消息页 |
| `Web-Dashboard-Streaming.png` | `mcCu7` | Web/Dashboard-Streaming | Dashboard 流式聊天 |
| `Web-Dashboard-Support.png` | `18eSq` | Web/Dashboard-Support | Dashboard 支持对话 |
| `Web-Dashboard-QRcode.png` | `kVN50` | Web/Dashboard-QRcode | Dashboard QR 码管理 |
| `Web-Dashboard-QRcode-Empty.png` | `s4lvD` | Web/Dashboard-QRcode-Empty | QR 码空状态 |
| `Web-CreateQR-Step0-SelectAgent.png` | `78jbg` | Web/CreateQR-Step0-HasAgent | 创建 QR 步骤0：选择 Agent |
| `Web-CreateQR-Step1-Template.png` | `2HULu` | Web/AddQRModal | 创建 QR 步骤1：选择模板 |
| `Web-CreateQR-Step2-Configure.png` | `CHIA7` | Web/CreateQR-Step2 | 创建 QR 步骤2：配置 Agent |
| `Web-CreateQR-Success.png` | `j4R85` | Web/CreateQR-Success | 创建 QR 成功页 |
| `Web-EditQR.png` | `thA1i` | Web/EditQR | 编辑 QR 码 |
| `Web-Settings.png` | `ntmk5` | Web/Settings | 设置页 |
| `Web-Pricing.png` | `UZFlP` | Web/Pricing | 定价页 |
| `Web-DocsPage.png` | `aiwB4` | Web/DocsPage | 文档页 |

### 可复用组件

| 截图文件 | Pencil nodeId | 组件名称 |
|---------|---------------|---------|
| `Component-Button-Primary.png` | `OjdTt` | 主要按钮（红色） |
| `Component-Button-Outline.png` | `5jucT` | 描边按钮 |
| `Component-Avatar-Agent.png` | `HHdX9` | Agent 头像（大） |
| `Component-Avatar-Small.png` | `TcSQ2` | 小头像 |
| `Component-Avatar-User.png` | `yYpU6` | 用户头像 |
| `Component-Input.png` | `3X9H4` | 输入框 |
| `Component-TopBar.png` | `XjPhS` | 顶部导航栏 |
| `Component-TabBar.png` | `Rzvbh` | 底部 Tab 栏 |
| `Components-Overlays.png` | `MHnIL` | 弹层组件合集（Toast/Dialog/Skeleton） |

### 辅助资源

| 截图文件 | Pencil nodeId | 描述 |
|---------|---------------|------|
| `QR-Styles-Showcase.png` | `FBcJn` | QR 码样式展示 |
| `FlowDiagram-UserJourney.png` | `bEvZJ` | 用户旅程流程图 |
| `FlowDiagram-MobileSection.png` | `LYF8r` | Mobile 页面索引 |
| `FlowDiagram-WebSection.png` | `zg5zO` | Web 页面索引 |

### 交互注释（`_annotation-*`）

这些文件是设计稿中的文字交互说明，Agent 应阅读以理解交互逻辑：

| 截图文件 | 描述 |
|---------|------|
| `_annotation-ClaimAgent.png` | Claim Agent 绑定流程说明 |
| `_annotation-Dashboard-QRcode.png` | Dashboard QR 码页交互说明 |
| `_annotation-CreateQR-Step1.png` | 创建 QR 步骤1 交互说明 |
| `_annotation-CreateQR-Step2.png` | 创建 QR 步骤2 交互说明 |
| `_annotation-CreateQR-Success.png` | 创建 QR 成功页交互说明 |
| `_annotation-EditQR.png` | 编辑 QR 码交互说明 |
| `_annotation-Streaming.png` | 流式输出交互说明 |
| `_annotation-Messages-RequiresSignup.png` | 消息页需登录提示 |
