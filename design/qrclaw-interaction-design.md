# QRClaw 产品交互设计文档

> **版本**: v2.3  
> **日期**: 2026-03-12  
> **状态**: 设计定稿  
> **设计稿**: `design/pencil-new.pen`  
> **总屏幕数**: 39 screens · 14 flows · 2 platforms

---

## 如何获取设计截图（Agent 必读）

所有视觉稿存储在 Pencil 文件 `design/pencil-new.pen` 中，对应的**静态截图**已导出到 `design/layer/` 目录。

### 方式一：直接读取静态截图（推荐）

所有页面、组件、交互注释的 PNG 截图已保存在 `design/layer/` 目录。Agent 开发时应**直接读取图片文件**作为像素级还原的视觉基准：

```
Read("design/layer/Mobile-Login.png")     # 读取 Mobile 登录页截图
Read("design/layer/Web-LandingPage.png")  # 读取 Web 着陆页截图
Read("design/layer/Component-Input.png")  # 读取输入框组件截图
```

> 完整的文件名 → nodeId 映射表见 `design/layer/INDEX.md`

### 方式二：Pencil MCP 实时截图

如需最新版本的设计稿截图（设计有更新时），通过 Pencil MCP 工具获取：

```
get_screenshot(filePath="design/pencil-new.pen", nodeId="<页面ID>")
```

每个页面的 **设计稿 ID** 即为 `nodeId` 参数值。下文每个页面表格中均标注了对应 ID。

### 截图文件速查表

**Mobile 页面截图**（`design/layer/Mobile-*.png`）：

| 截图文件 | nodeId | 页面 |
|---------|--------|------|
| `Mobile-Profile.png` | `e1DDM` | Agent 个人资料 |
| `Mobile-Profile-Paused.png` | `sJcOR` | Agent 暂停状态 |
| `Mobile-Chat.png` | `IgH0g` | 聊天页 |
| `Mobile-Chat-Streaming.png` | `K6mbw` | 流式对话 |
| `Mobile-AgentNoReply.png` | `9KYND` | Agent 无响应 |
| `Mobile-Offline-Agent.png` | `J6l3h` | Agent 离线 |
| `Mobile-LongPressCopy.png` | `nNVxR` | 长按复制 |
| `Mobile-SwipeDelete.png` | `sPwFf` | 滑动删除 |
| `Mobile-ScanQR.png` | `RXEpt` | QR 扫码页 |
| `Mobile-ScanQR-AgentGuide.png` | `DFoBo` | 扫码引导 |
| `Mobile-Login.png` | `9nzBk` | 登录页 |
| `Mobile-SignUp.png` | `rgesk` | 注册页 |
| `Mobile-Verify.png` | `1QsK7` | 邮箱验证 |
| `Mobile-Messages.png` | `Qxtxk` | 消息列表 |
| `Mobile-Messages-NewUser.png` | `j8P8r` | 新用户消息 |
| `Mobile-Me.png` | `5poPN` | 个人中心 |
| `Mobile-MyQRCodes.png` | `X2xHg` | QR 码列表 |
| `Mobile-MyQRCodes-Empty.png` | `7X6Kn` | QR 码空状态 |
| `Mobile-QRCodeDetail.png` | `eZDQG` | QR 码详情 |
| `Mobile-404.png` | `k0nbt` | 404 页面 |

**Web 页面截图**（`design/layer/Web-*.png`）：

| 截图文件 | nodeId | 页面 |
|---------|--------|------|
| `Web-LandingPage.png` | `tD9CD` | 产品首页 |
| `Web-SignUp.png` | `S3TMu` | 注册页 |
| `Web-EmailVerify.png` | `JMDpZ` | 邮箱验证 |
| `Web-Claim-LoggedIn.png` | `r2OZD` | 已登录 Claim |
| `Web-Claim-NotLoggedIn.png` | `c2cAy` | 未登录 Claim |
| `Web-Dashboard-Messages.png` | `FCW4Y` | Dashboard 消息 |
| `Web-Dashboard-Streaming.png` | `mcCu7` | Dashboard 流式聊天 |
| `Web-Dashboard-Support.png` | `18eSq` | Dashboard 支持 |
| `Web-Dashboard-QRcode.png` | `kVN50` | QR 码管理 |
| `Web-Dashboard-QRcode-Empty.png` | `s4lvD` | QR 码空状态 |
| `Web-CreateQR-Step0-SelectAgent.png` | `78jbg` | 创建 QR 步骤0 |
| `Web-CreateQR-Step1-Template.png` | `2HULu` | 创建 QR 步骤1 |
| `Web-CreateQR-Step2-Configure.png` | `CHIA7` | 创建 QR 步骤2 |
| `Web-CreateQR-Success.png` | `j4R85` | 创建 QR 成功 |
| `Web-EditQR.png` | `thA1i` | 编辑 QR 码 |
| `Web-Settings.png` | `ntmk5` | 设置页 |
| `Web-Pricing.png` | `UZFlP` | 定价页 |
| `Web-DocsPage.png` | `aiwB4` | 文档页 |

**组件截图**（`design/layer/Component-*.png`）：

| 截图文件 | nodeId | 组件 |
|---------|--------|------|
| `Component-Button-Primary.png` | `OjdTt` | 红色主按钮 |
| `Component-Button-Outline.png` | `5jucT` | 描边按钮 |
| `Component-Avatar-Agent.png` | `HHdX9` | Agent 头像 |
| `Component-Avatar-Small.png` | `TcSQ2` | 小头像 |
| `Component-Avatar-User.png` | `yYpU6` | 用户头像 |
| `Component-Input.png` | `3X9H4` | 输入框 |
| `Component-TopBar.png` | `XjPhS` | 顶部导航栏 |
| `Component-TabBar.png` | `Rzvbh` | 底部 Tab 栏 |
| `Components-Overlays.png` | `MHnIL` | 弹层合集 |

**交互注释截图**（`design/layer/_annotation-*.png`）：

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

**辅助资源截图**：

| 截图文件 | nodeId | 说明 |
|---------|--------|------|
| `QR-Styles-Showcase.png` | `FBcJn` | 3 种 QR 码样式展示 |
| `FlowDiagram-UserJourney.png` | `bEvZJ` | 用户旅程流程图 |
| `FlowDiagram-MobileSection.png` | `LYF8r` | Mobile 页面索引 |
| `FlowDiagram-WebSection.png` | `zg5zO` | Web 页面索引 |

---

## 一、产品概述

QRClaw 是一个面向 AI Agent 的二维码管理平台。用户（Owner）可以将自己的 AI Agent 生成专属二维码，任何人（Visitor）扫码即可与 Agent 对话——无需安装任何 App。

### 核心角色

| 角色 | 说明 |
|------|------|
| **Visitor（访客）** | 扫码用户，通过手机浏览器访问 Agent Profile 并发起对话 |
| **Owner（拥有者）** | 注册用户，通过 Web Dashboard 管理 Agent、创建/编辑 QR Code |
| **Agent（智能体）** | 第三方 AI Agent，通过 API/WebSocket 与平台连接 |

### 平台分布

| 平台 | 屏幕数 | 目标用户 | 设计尺寸 |
|------|--------|---------|---------|
| **Mobile 移动端** | 21 screens | Visitor + Owner（轻量管理） | 390 × 844 |
| **Web 网页端** | 18 screens | Owner（完整管理后台） | 1440 × 900 |

---

## 二、Mobile 移动端交互流程

### M1: 扫码入口 Scan Entry

**场景**: Visitor 扫描二维码后的首屏体验，是产品的第一印象。

**流程**: `Agent Profile` → `Profile Paused`（异常态） → `404 Page`（异常态）

| # | 页面名称 | 设计稿 ID | 交互说明 |
|---|---------|----------|---------|
| 1 | **Agent Profile** | `e1DDM` | 红色头部渐变背景，展示 Agent 头像（160×160 圆角方形）、名称「Café Assistant」、对话数统计「42 conversations served」、描述文字。底部红色主按钮「💬 Message」发起对话，下方红色链接「Sign in to save your conversations」引导注册。页面底部固定「Powered by QRClaw」+ Terms/Privacy 链接。 |
| 2 | **Profile Paused** | `sJcOR` | 基于 Agent Profile 的暂停态。头像半透明（opacity: 0.5）表示不可用，中部黄色/橙色横幅「⚠ Service Temporarily Paused — This QR Code has been paused by the owner. Please try again later」。Message 按钮变为灰色（`#D1D5DB`）不可点击。底部保留品牌标识。 |
| 3 | **404 Page** | `k0nbt` | 白色背景居中显示 QRClaw Logo（红色圆角方块 60×60）、「Page Not Found」标题（700/20px）、说明文字「The page you're looking for doesn't exist or has been moved.」，以及灰色描边「Go Home」按钮（200×40）。 |

**交互细节**:
- 扫码后 0.5s 内加载 Agent Profile，超时显示骨架屏
- Paused 状态：Owner 在 Dashboard 点击 Pause 后触发，Visitor 端实时生效
- 404 触发条件：QR Code 已删除 / URL 无效

---

### M2: 聊天核心 Chat Core

**场景**: Visitor 点击 Message 按钮后进入的实时对话界面。

**流程**: `Chat` → `Chat Streaming` → `Agent No Reply` → `Agent Offline`

| # | 页面名称 | 设计稿 ID | 交互说明 |
|---|---------|----------|---------|
| 1 | **Chat** | `IgH0g` | 顶部导航栏（TopBar 组件）显示 Agent 名称「Café Assistant」+ 返回箭头。灰色背景（`$gray-100`）消息区域，Agent 消息白色气泡左对齐（带 Agent 小头像），用户消息红色（`$red`）气泡右对齐（带用户头像）。底部粉红色注册横幅「🔒 Sign up to save chats & access history · Sign up →」。最底部白色输入栏含「Type a message...」文本框 + 红色圆形发送按钮。 |
| 2 | **Chat Streaming** | `K6mbw` | Agent 回复进行中：气泡内显示已输出文本 + 「● typing...」红色打字指示器（红色圆点 + 灰色 typing 文字），文本逐字流式输出。消息带时间戳「✓ 10:44」。完成后指示器消失，显示完整时间戳。 |
| 3 | **Agent No Reply** | `9KYND` | 用户消息发送后 30s 未收到 Agent 响应，用户气泡下方显示灰色斜体文字「Agent is not responding. Please try again later.」。 |
| 4 | **Agent Offline** | `J6l3h` | Agent 断开连接时：(1) 发送失败消息下方显示红色「⊘ Failed to send [Retry]」链接；(2) 聊天区出现粉色警告卡片「⚠ Agent disconnected — The AI agent is currently offline. Your message will be delivered when it reconnects.」 |

**交互细节**:
- 消息协议：WebSocket → SSE fallback → HTTP Poll
- 流式输出格式：`reply_chunk` with `is_final` flag
- 消息状态：✓ Sent → ✓✓ Delivered → 完成
- 60s 超时显示 ⚠️ 「Send failed, tap to retry」

---

### M3: 聊天交互细节 Chat Interactions

**场景**: 聊天中的辅助交互操作。

**流程**: `Long Press Copy` → `Scan QR Code`

| # | 页面名称 | 设计稿 ID | 交互说明 |
|---|---------|----------|---------|
| 1 | **Long Press Copy** | `nNVxR` | 长按任意消息气泡 0.5s，气泡上方弹出黑色圆角 tooltip「Copy」（带底部小三角箭头），点击后复制文本内容到剪贴板，toast 提示「Copied to clipboard」。 |
| 2 | **Scan QR Code** | `RXEpt` | 黑色全屏（#000000）摄像头取景框。顶部白色文字「Scan QR Code」+ 返回按钮。中间提示「Point your camera at a QR code」。四角红色 L 形边框指示扫描区域，中间红色水平扫描线。底部两个圆形功能按钮：「Album」从相册选取、「Flash」开关闪光灯。 |

---

### M4: 注册 / 登录 Auth

**场景**: 用户从匿名 Visitor 转为注册用户的完整流程。

**流程**: `Login` → `Sign Up` → `Email Verify`

| # | 页面名称 | 设计稿 ID | 交互说明 |
|---|---------|----------|---------|
| 1 | **Login** | `9nzBk` | 白色背景，顶部 QRClaw Logo（80×80）+ 「QRClaw」品牌名（700/24px，letter-spacing 0.5）+ 副标题「Sign in to sync your conversations」。表单：Email（placeholder「Email address」）和 Password 输入框（使用 Input 组件），红色「Sign In」主按钮（Button Primary 组件）。底部「Don't have an account? **Sign Up**」跳转注册。最底部「Powered by QRClaw」。 |
| 2 | **Sign Up** | `rgesk` | 与 Login 布局一致，副标题「Create an account to save conversations」。表单增加第三个输入框「Confirm Password」。红色「Sign Up」按钮。底部「Already have an account? **Sign In**」跳转登录。 |
| 3 | **Email Verify** | `1QsK7` | 顶部「< Back to Sign Up」返回链接。灰色邮件图标（60×60）+ 「Check your email」标题（700/20px）+ 「We sent a code to user@example.com」副标题。6 个验证码输入框（当前激活框红色边框，已填框显示数字），红色「Verify」按钮，底部「Didn't get the code? **Resend**」重发链接。 |

**交互细节**:
- 验证码 6 位数字，每输入一位自动跳转下一个
- 验证码有效期 10 分钟
- 3 次错误后锁定 60s

---

### M5: 注册后主页 Home After Auth

**场景**: 用户注册/登录后的主页面导航。底部 Tab Bar 包含 Messages / Me 两个入口（红色激活态）。

**流程**: `Messages (New User)` → `Messages` → `Me`

| # | 页面名称 | 设计稿 ID | 交互说明 |
|---|---------|----------|---------|
| 1 | **Messages (New User)** | `j8P8r` | 顶部「Messages(1)」标题 + 刷新按钮。QRClaw Support 消息行（带红色未读角标 ①）。下方空白区域居中展示引导卡片：红色 + 图标、「Connect Your Own Agent」标题、说明文字、终端代码块「$ curl -s https://qrclaw.ai/skill.md · 📋 Copy」、3 步引导（① Agent reads the skill guide → ② Registers & connects automatically → ③ Create your first QR code!）。底部 TabBar（Messages 激活态红色）。 |
| 2 | **Messages** | `Qxtxk` | 正常使用态，「Messages(3)」标题。消息列表每行：Agent 头像（Small Avatar 组件）+ 名称 + 最后一条消息预览 + 时间戳（右对齐灰色文字）。示例：QRClaw Support / Café Assistant / Hotel Concierge。底部 TabBar。 |
| 3 | **Me** | `5poPN` | 「我的」页面：顶部灰色用户头像 + 「My Account」+ 邮箱 + 右箭头。灰色分隔线。菜单列表（每项带图标 + 右箭头）：🔗 Share QRClaw with Friends / 📱 My QR Codes（带红色数字角标 ②）/ ❓ Help & Support / 📄 Terms of Service。红色「Sign Out」文字按钮。底部 TabBar（Me 激活态红色）。 |

---

### M6: QR Code 管理 QR Management

**场景**: Owner 在移动端管理自己创建的 QR Code。

**流程**: `Me (入口)` → `My QR Codes` → `QR Code Detail` → `Swipe Delete` → `My QR Codes (Empty)`

| # | 页面名称 | 设计稿 ID | 交互说明 |
|---|---------|----------|---------|
| 1 | **My QR Codes** | `X2xHg` | TopBar「My QR Codes」+ 返回箭头。灰色分组头。列表每行：名称 + 「Created Feb 15」灰色副文字 + 右侧状态标签（绿色「● Active」/ 红色「● Revoked」）+ 右箭头。底部分隔线。 |
| 2 | **QR Code Detail** | `eZDQG` | TopBar「Dine-in QR Code」。居中白色卡片（圆角 16px，阴影）：Agent 头像 + 名称「Café Assistant / Dine-in QR Code」+ 红色大 QR 码 + 「Scan to start a conversation」。信息卡片（圆角 8px 描边）：Status ● Active / Created Feb 15, 2026 / Scans 128 / Conversations 42。两个全宽按钮：灰色描边「Download QR Code」+ 红色文字描边「Deactivate QR Code」。底部提示「✏️ To edit this QR code, visit qrclaw.ai/dashboard」。 |
| 3 | **Swipe Delete** | `sPwFf` | 消息列表中左滑某条消息，该行向左偏移，右侧露出红色「Delete」按钮。点击后二次确认删除。 |
| 4 | **My QR Codes (Empty)** | `7X6Kn` | TopBar + 居中空状态：浅粉圆形背景中的 QR 码图标 + 「No QR Codes Yet」标题 + 说明文字「Visit the QRClaw web dashboard to create and manage your QR codes with full features.」+ 红色链接「🔗 qrclaw.ai」。底部 TabBar（Me 激活态）。 |

---

### M7: 扫码引导 Scan Guide

**场景**: 新用户通过 QRClaw Support 对话了解如何绑定 Agent。

| # | 页面名称 | 设计稿 ID | 交互说明 |
|---|---------|----------|---------|
| 1 | **Scan QR Agent Guide** | `DFoBo` | TopBar「< QRClaw Support」。对话界面：QRClaw Support 发送欢迎消息「Welcome! I'm QRClaw Support.」+ 绑定引导，包含终端代码块「$ curl -s https://qrclaw.ai/skill.md · 📋 Copy」+ 4 步说明（1. Read the skill guide → 2. Register itself automatically → 3. Send you a confirmation link → 4. You tap the link to bind it）+ 「Once bound, you can create QR codes!」。第二条消息「Need help? Just type your question...」。底部粉红色注册横幅 + 输入栏（带红色发送按钮）。 |

---

## 三、Web 网页端交互流程

### W1: Landing Page 着陆页

**场景**: 用户首次访问 qrclaw.ai 的着陆页。

**流程**: `Landing Page` → `Docs Page`

| # | 页面名称 | 设计稿 ID | 交互说明 |
|---|---------|----------|---------|
| 1 | **Landing Page** | `tD9CD` | 导航栏（半透明白色毛玻璃）：Logo「QRClaw」/ Features / Pricing / Docs / 红色「Sign In」按钮。Hero 区域（白→浅粉渐变）：左侧「Give your Agent a QR Code」标题 + 「Scan. Chat. Anywhere.」副标题 + 两个 CTA 按钮（红色「Get Started」+ 白色描边「Learn More」），右侧 QR 卡片 + 手机预览 Mockup。Connect 区域（浅粉→灰渐变）：「Connect Your Agent」标题 + 终端代码块 + 3 步流程。「See it in Action」区域：两个真实场景卡片（图片 + 标题 + 描述 + 标签）。Subscribe 区域：邮箱输入 + 「Subscribe」按钮。Footer：版权信息。 |
| 2 | **Docs Page** | `aiwB4` | 顶部导航（Logo + Docs 标签）+ 面包屑。三栏：左侧导航树（Getting Started / Agent API / Agent SDK / Registration & Claims / WebSocket Protocol）、中间 Markdown 内容（标题 + 提示框 + Prerequisites 列表 + Quick Start 4 步 + 代码块含语法高亮和复制按钮）、右侧 ON THIS PAGE 目录锚点。 |

---

### W2: 注册流程 Registration

**场景**: 新用户从注册到首次进入 Dashboard 的完整流程。

**流程**: `Sign Up` → `Email Verify` → `Dashboard Support (Welcome)` → `Dashboard QR (Empty)`

| # | 页面名称 | 设计稿 ID | 交互说明 |
|---|---------|----------|---------|
| 1 | **Sign Up** | `S3TMu` | 双栏布局。左侧红色渐变品牌区（#F87171→#FB7185→#FDA4AF 135°）：「Give your Agent a QR Code」白色标题 + 「Scan. Chat. Anywhere.」+ 手机 Mockup + QR 卡片叠层视觉。右侧白色表单区：「< Quick Home」返回链接 + QRClaw Logo + 「Create an account」标题 + 「Sign up to manage your agents and QR codes」副标题 + Email / Password 输入框 + 红色「Sign Up」按钮 + 「Already have an account? **Sign In**」+ Terms 文字。 |
| 2 | **Email Verify** | `JMDpZ` | 渐变背景（白→浅粉→浅粉紫→浅蓝）。居中白色圆角卡片（24px 圆角，阴影 blur 32）：QRClaw Logo + 邮件图标 + 「Check your email」标题 + 「We sent a 6-digit verification code to user@example.com」。6 位验证码输入框（第 3 位红色边框表示当前输入位）+ 红色「Verify Email」主按钮 + 「Didn't receive the code? **Resend**」链接。 |
| 3 | **Dashboard Support (Welcome)** | `18eSq` | 三栏布局。左侧 80px 导航栏（QRClaw Logo + Messages 图标（红色激活）/ My QRCode / Settings）。中间 320px 消息列表：「Messages」标题 + QRClaw Support（红色未读角标 ①）+ 「No other conversations yet」灰色占位。右侧对话详情区：「QRClaw Support · Official AI Assistant」头部 + 对话内容（欢迎消息 + 终端代码块 + 3 步引导 + 时间戳「just now」）+ 底部输入栏。 |
| 4 | **Dashboard QR (Empty)** | `s4lvD` | 三栏布局（同上导航栏，My QRCode 激活态）。右侧居中空状态：红色手提箱图标 + 「No Agents Connected Yet」标题 + 说明文字 + 终端代码块 + 3 步引导（① Connect Your Agent → ② Confirm & Bind → ③ Create QR Codes）+ 「Need help? Chat with QRClaw Support in Messages」底部提示。 |

---

### W3: Claim Agent 绑定 Agent Claim

**场景**: 用户在终端向 Agent 发送 `curl -s https://qrclaw.ai/skill.md`，Agent 返回 `claim_url`，点击进入绑定确认页。

**流程**: `Claim (未登录)` → `Claim (已登录)`

| # | 页面名称 | 设计稿 ID | 交互说明 |
|---|---------|----------|---------|
| 1 | **Claim (未登录)** | `c2cAy` | 渐变背景（白→浅粉→浅粉紫→浅蓝）。居中白色卡片（24px 圆角，阴影）：Agent 头像 + 「Sign up to claim your Agent」标题 + 说明文字。黄色高亮行：🔑 Agent ID「agt_a3b2c5d4e6f5 · all-purp...ice-abc」。Email / Password 输入框 + 红色「Sign Up & Claim Agent」按钮。底部「Already have an account? **Log in**」。 |
| 2 | **Claim (已登录)** | `r2OZD` | 同样渐变背景卡片。Agent 头像 + 「Claim Your Agent」标题 + 说明文字。灰色圆角行：Agent 头像 + 「agt_a3b2c5d4f6 · $agent→Customer Service agent」。黄色提示行「⏱ Claim expires in **23h 45m**」倒计时。两个并排按钮：灰色描边「Decline」+ 红色「Confirm & Bind」。底部「Logged in as name@example.com」。 |

**交互细节**:
- Claim URL 有效期 24 小时
- 同一 Agent 不可重复绑定
- 绑定成功后自动跳转 Dashboard，Agent 出现在侧边栏

---

### W4: 正常使用 Dashboard

**场景**: Owner 日常使用的消息管理后台。

**流程**: `Dashboard Messages` → `Dashboard Streaming` → `Dashboard Support`

| # | 页面名称 | 设计稿 ID | 交互说明 |
|---|---------|----------|---------|
| 1 | **Dashboard Messages** | `FCW4Y` | 三栏布局。左侧 80px 固定导航栏（QRClaw Logo + 菜单图标列表，6px gap）。中间 320px 消息列表（白色背景，右侧 1px 描边分隔）：「Messages」标题 + 对话行（Agent 头像 + 名称 + 最后消息预览 + 时间，选中行高亮）。右侧聊天详情区：顶部 Agent 名称 + 状态标签，聊天区域 Agent 灰色气泡 + 用户红色气泡 + 时间戳，底部「Type a message...」输入栏 + 红色发送按钮。 |
| 2 | **Dashboard Streaming** | `mcCu7` | 聊天详情区展示 Agent 流式回复。支持 Markdown 渲染：标题（##）、列表项（前缀 emoji 🍜🥘🍚）、**粗体**文本、代码块。气泡内「🔴 typing...」红色打字指示器。流式文本实时追加。 |
| 3 | **Dashboard Support** | `18eSq` | （同 W2.3）QRClaw Support 内置对话，包含终端代码块和绑定引导。 |

**交互细节**:
- 消息列表实时更新（WebSocket 推送）
- 未读消息红色数字角标
- 右侧对话区域可上滑加载历史消息

---

### W5: 创建 QR Code 完整流程 Create QR Code

**场景**: Owner 为已绑定的 Agent 创建新的 QR Code，共 4 步（Step 0 → 3）。

**流程**: `Step 0: Select Agent` → `Step 1: Template` → `Step 2: Configure` → `Step 3: Success` → `Dashboard QR Code`

| # | 页面名称 | 设计稿 ID | 交互说明 |
|---|---------|----------|---------|
| 1 | **Step 0: Select Agent** | `78jbg` | 左侧 80px 导航栏。右侧内容区：「Create QR Code · ✕」标题 + 4 步进度指示器（● Agent → Template → Configure → Done，当前红色高亮 Agent）。「Select an Agent」标题 + 说明文字。Agent 卡片网格（选中卡片红色边框 + ✓ 角标），每张显示 Agent 头像 + ID + 名称 + ● Online 状态。底部红色「Next →」按钮。 |
| 2 | **Step 1: Template** | `2HULu` | 进度指示器 Step 1「Template」高亮。「Start from a template or create from scratch」说明。4 个模板卡片网格：Customer Service（红色邮件图标）/ Data Analyst（蓝色图表图标）/ Email Assistant（黄色邮件图标）/ Custom（+ 号，「Start with a blank template」）。选中模板红色边框。底部提示「Click a template to auto-fill agent details...」+ 「Back / Next →」按钮。 |
| 3 | **Step 2: Configure** | `CHIA7` | 进度指示器 Step 2「Configure」高亮。左侧表单区（带 gap 40 与右侧手机预览）：Upload avatar 圆形区域（点击上传 JPG/PNG）+ Name *（40 字符限制）+ Description *（200 字符限制，textarea）+ System Prompt *（1000 字符限制，红色左边框强调 textarea + 字数统计「174/1,000」）。右侧：实时手机预览 Mockup 展示 Agent Profile，随表单输入同步更新。底部「Back / 红色 Create」。 |
| 4 | **Step 3: Success** | `j4R85` | 进度指示器全部完成，Step 3「Done」绿色。居中：绿色圆形对勾图标 + 「QR Code Created!」标题 + 说明文字。QR 码卡片（Agent 头像 + 名称 + 红色二维码 + 「Scan to start a conversation」）。样式切换行：Style: / Standard（选中态蓝色按钮）/ Dark。URL 行 + 📋 Copy 按钮。两个并排 CTA：红色「📥 Download QR」+ 灰色描边「Go to Dashboard」。底部红色链接「+ Create another QR Code」。 |
| 5 | **Dashboard QR Code** | `kVN50` | 三栏布局。左侧导航栏（My QRCode 激活态）。中间列表区：「My QRcode · ➕ Create」标题 + 统计卡片（2 Agents / 347 Scans / 59 Chats）+ QR 列表（Agent 头像 + 名称 + ● Active/Draft 状态 + 右箭头，选中行高亮）。右侧详情面板：Agent 名称 + 「✕ Set」标签 + 3 个统计卡片（124 Total Scans / 47 Conversations / 3d Created）+ QR 卡片（放大预览）+ URL + 📋 Copy + 3 个操作按钮（📥 Download / ✏️ Edit / 红色 Revoke）+ 手机 Mockup 预览。 |

**交互细节**:
- 步骤间支持 Back 回退（Step 0 无 Cancel）
- Step 2 表单实时校验，必填字段为空时按钮禁用
- System Prompt 输入框带 helper text 引导
- 手机预览使用真实的 Agent Profile 组件渲染

---

### W6: 编辑 / 设置 / 定价 Edit / Settings / Pricing

**场景**: Owner 管理个人设置和 QR Code 编辑。

**流程**: `Edit QR` → `Settings` → `Pricing`

| # | 页面名称 | 设计稿 ID | 交互说明 |
|---|---------|----------|---------|
| 1 | **Edit QR** | `thA1i` | 左侧导航栏。右侧双栏（gap 40）：左栏「Edit QR Code」标题 + Agent 信息行（头像 + 名称 + 「Editing QR Code: cafe/dine-in」+ 「Change avatar · Click to upload JPG/PNG」链接）+ 预填表单（Name / Description / System Prompt，与 Step 2 配置表单一致）+ 「Back / 红色 Save Changes」按钮。右栏实时手机预览 Mockup + 「Live Preview」标签。 |
| 2 | **Settings** | `ntmk5` | 左侧导航栏（Settings 激活态）。右侧内容区「Settings」标题。Profile 卡片（蓝色头像圆形 + 名称 + 邮箱 + 红色 Pro / Upgrade 标签）。菜单列表（每项前缀图标 + 右箭头）：⚙️ Edit Profile / 🔒 Change Password / 💳 Subscription & Billing / 🤖 My Agents（绿色 3 Active 标签）/ 红色 🚪 Log Out。 |
| 3 | **Pricing** | `UZFlP` | 渐变背景（白→浅粉→粉→灰）。QRClaw Logo + 「Choose Your Plan」标题 + 说明文字。3 个方案卡片横向排列（白色圆角，阴影）：**Free**（$0/month，黑色「On Starter Free」按钮，功能列表 ✓）/ **Pro**（$9.9/month，黄色「Coming Soon · Recommended」标签 + 灰色按钮，扩展功能列表）/ **Max**（$29.9/month，黄色「Coming Soon · Best Value」标签 + 灰色按钮，全功能列表）。 |

---

### W7: 文档 / QR 样式 Docs & QR Styles

**场景**: 开发者文档和 QR Code 视觉规范。

| # | 页面名称 | 设计稿 ID | 交互说明 |
|---|---------|----------|---------|
| 1 | **Docs** | `aiwB4` | （同 W1.2）三栏 API 文档页面。 |
| 2 | **QR Styles** | `FBcJn` | 灰色背景（#F5F5F5 圆角 16px）。标题「QR Code Styles」+ 说明「3 official styles. Users can switch between them on the success page.」。两个样式卡片并排：**Standard**（白色背景 + 红色 QR 码 + Agent 名称 + 「Scan to chat」）/ **Dark**（黑色背景 + 白色 QR 码 + 白色文字）。 |

---

## 四、Overlay 组件规范

**设计稿 ID**: `MHnIL`

| 组件 | 说明 |
|------|------|
| **Toast Notifications** | 3 种：绿色成功「✓ Copied to clipboard」/ 黄色警告「⚡ Connection lost. Reconnecting...」/ 红色错误「⊘ Connection lost. Tap to retry.」 |
| **Confirm Dialog** | 白色圆角卡片居中，标题「Sign Out?」+ 说明文字 + 两个按钮「Cancel / 红色 Sign Out」 |
| **Suggested Questions** | Profile 页推荐问题列表：灰色描边胶囊标签「"What are today's specials?" / "Do you have vegetarian options?" / "How do I place an order?"」 |
| **Skeleton Loading** | 灰色矩形占位（头像圆 + 两行文字条），用于消息列表和 Profile 加载中状态 |

---

## 五、设计规范 Design Specs

### 颜色系统

| 色值 | Token | 用途 |
|------|-------|------|
| `#E24A3F` | `$red` / Brand Red | 主色调，按钮、链接、品牌标识 |
| `#FEF2F2` | Red Light | 浅红背景、注册横幅、警告卡片 |
| `#F5F5F5` | `$gray-100` | 聊天背景、卡片背景 |
| `#E5E7EB` | `$gray-border` | 边框、分隔线 |
| `#1F2937` | `$gray-800` | 标题、正文文字 |
| `#6B7280` | `$gray-500` | 描述文字、占位符、时间戳 |
| `#D1D5DB` | Disabled | 禁用按钮背景 |
| `#F59E0B` | Warning/Amber | 暂停状态、Claim 倒计时、Coming Soon 标签 |
| `#22C55E` | Success/Green | Active 状态标签、成功图标 |
| `#CCCCCC` | User Avatar BG | 默认用户头像背景 |

### 字体规范

| 属性 | 值 |
|------|-----|
| 主字体 | Inter |
| 等宽字体 | JetBrains Mono（代码块） |
| 标题 | 700 / 20-24px |
| 正文 | 400 / 14-15px |
| 说明文字 | 400 / 11-12px |
| 按钮文字 | 600 / 15-16px |
| 品牌名 | 700 / 24px, letter-spacing 0.5px |

### 间距与圆角

| 属性 | 值 |
|------|-----|
| 按钮圆角 | 12px |
| 卡片圆角 | 12-16px |
| 头像圆角 | 6px（小）/ 16px（大） |
| 输入框圆角 | 8px |
| Web 卡片阴影 | `0 4px 12px #00000008`（微妙）/ `0 8px 32px #00000010`（强调） |
| 卡片内距 | 16-24px |
| 区块间距 | 24-48px |
| 按钮高度 | 44-50px |
| 移动端宽度 | 390px |
| Web 端宽度 | 1440px |
| Web 导航栏宽 | 80px |
| Web 中间列宽 | 320-340px |

### 可复用组件

| 组件 | ID | 说明 |
|------|-----|------|
| Button Primary | `OjdTt` | 红色实心按钮（`$red`），白色文字 600/16px，圆角 12px，高度 50px，padding [0,24] |
| Button Outline | `5jucT` | 白色背景 + `$gray-border` 描边，灰色文字 500/15px，圆角 12px，高度 44px |
| Avatar Agent | `HHdX9` | Agent 头像，圆角 16px，默认 160×160，可缩放 |
| Avatar Small | `TcSQ2` | 小头像 36×36，圆角 6px |
| Avatar User | `yYpU6` | 用户默认头像 36×36，灰色背景 #CCCCCC，白色 user 图标 |
| Input Field | `3X9H4` | 输入框 48×342，白色背景 + #E0E0E0 描边，圆角 8px，灰色 placeholder 14px |
| Top Bar | `XjPhS` | 移动端导航栏 390×50，白色背景 + 底部描边，左箭头 + 居中标题 + 右侧占位 |
| Tab Bar | `Rzvbh` | 移动端底部 390×50，白色背景 + 顶部描边，Messages / Me 两个 tab（图标+文字） |

---

## 六、关键交互规则

### 消息传输

| 规则 | 说明 |
|------|------|
| 协议 | WebSocket 首选 → SSE 降级 → HTTP 轮询兜底 |
| 流式输出 | `reply_chunk` 事件，含 `is_final` 标志 |
| 超时策略 | 30s 无 chunk → 「Reply interrupted」+ Retry；60s → ⚠️ 发送失败 |
| 消息状态 | ✓ Sent → ✓✓ Delivered → 完成（显示时间戳） |

### 数据存储策略

| 规则 | 说明 |
|------|------|
| 消息内容 | **零存储**——QRClaw 为纯管道，不存储任何消息内容 |
| 元数据 | 仅存储 scan_count / conversation_count / timestamps |
| Agent 配置 | 存储 name / description / system_prompt / avatar_url |

### 状态管理

| 状态 | 触发条件 | 视觉表现 |
|------|---------|---------|
| Active | QR Code 正常运行 | 绿色「● Active」标签 |
| Paused | Owner 点击 Pause | 橙色提示横幅，灰色按钮 |
| Revoked | Owner 点击 Revoke | 红色「● Revoked」标签，不可恢复 |
| Draft | 创建中未完成 | 灰色 Draft 标签 |

### Agent Claim 绑定规则

| 规则 | 说明 |
|------|------|
| 触发方式 | Agent 读取 skill.md 后自动注册，返回 claim_url |
| 有效期 | 24 小时 |
| 重复绑定 | 同一 Agent 不可绑定到多个 Owner |
| 未登录 | 展示注册 + Claim 一体化表单 |
| 已登录 | 展示确认绑定页面，Confirm & Bind / Decline |

---

## 七、屏幕清单汇总

### Mobile（21 screens）

| 流程 | 屏幕 | IDs |
|------|------|-----|
| M1 扫码入口 | Agent Profile, Profile Paused, 404 Page | `e1DDM`, `sJcOR`, `k0nbt` |
| M2 聊天核心 | Chat, Streaming, No Reply, Offline | `IgH0g`, `K6mbw`, `9KYND`, `J6l3h` |
| M3 聊天交互 | Long Press Copy, Scan QR | `nNVxR`, `RXEpt` |
| M4 注册登录 | Login, Sign Up, Email Verify | `9nzBk`, `rgesk`, `1QsK7` |
| M5 注册后主页 | Messages (New), Messages, Me | `j8P8r`, `Qxtxk`, `5poPN` |
| M6 QR 管理 | My QR Codes, Detail, Swipe Delete, Empty | `X2xHg`, `eZDQG`, `sPwFf`, `7X6Kn` |
| M7 扫码引导 | Agent Guide | `DFoBo` |

### Web（18 screens）

| 流程 | 屏幕 | IDs |
|------|------|-----|
| W1 Landing | Landing Page, Docs Page | `tD9CD`, `aiwB4` |
| W2 注册 | Sign Up, Email Verify, Dashboard Welcome, QR Empty | `S3TMu`, `JMDpZ`, `18eSq`, `s4lvD` |
| W3 Claim | Claim (未登录), Claim (已登录) | `c2cAy`, `r2OZD` |
| W4 Dashboard | Messages, Streaming, Support | `FCW4Y`, `mcCu7`, `18eSq` |
| W5 创建 QR | Step 0-3, Dashboard QR | `78jbg`, `2HULu`, `CHIA7`, `j4R85`, `kVN50` |
| W6 编辑设置 | Edit QR, Settings, Pricing | `thA1i`, `ntmk5`, `UZFlP` |
| W7 文档样式 | Docs, QR Styles | `aiwB4`, `FBcJn` |

### 辅助资源

| 资源 | ID |
|------|-----|
| Overlay 组件 | `MHnIL` |
| User Journey 流程图 | `bEvZJ` |
| Screen Index 索引 | `zOopO` |

---

> **设计稿文件**: `design/pencil-new.pen`  
> **获取截图**: `get_screenshot(filePath="design/pencil-new.pen", nodeId="<ID>")`
