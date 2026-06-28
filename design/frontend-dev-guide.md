# QRClaw 前端开发上下文指引

> **用途**: Agent (Claude CLI / Claude Code) 在开发前端页面时的完整上下文参考
> **设计稿**: `design/pencil-new.pen`（Pencil 格式）
> **截图目录**: `design/layer/`（所有页面/组件的 PNG 截图）
> **Token 文件**: `design/design-tokens.css`（CSS 变量）
> **交互规格**: `design/qrclaw-interaction-design.md`

---

## 开发前必读

1. **读取截图**: `design/layer/<PageName>.png` — 像素级视觉基准
2. **读取本文件**: 获取组件规格、布局参数、样式映射
3. **读取交互设计**: `design/qrclaw-interaction-design.md` — 交互细节和页面流程
4. **导入 Token**: `design/design-tokens.css` — 所有颜色/字体/间距

---

## 一、技术栈建议

| 技术 | 推荐 |
|------|------|
| 框架 | Next.js 14+ (App Router) |
| 样式 | Tailwind CSS v4 + CSS Variables |
| 图标 | lucide-react |
| 字体 | Inter (Google Fonts) + JetBrains Mono |
| 状态管理 | React Context / Zustand |
| 实时通信 | WebSocket → SSE fallback → HTTP Poll |

---

## 二、可复用组件规格

### 2.1 Button Primary (`OjdTt`)
**截图**: `design/layer/Component-Button-Primary.png`

```
类型: frame (flex row, center/center)
宽度: 342px (可覆盖)
高度: 50px
背景: var(--color-red) #E24A3F
圆角: 12px
内距: 0 24px
子元素:
  - text "Button"
    字体: Inter 600 16px
    颜色: var(--color-white) #FFFFFF
```

**React 接口建议**:
```tsx
<ButtonPrimary width?: number, onClick?: () => void>
  {children}  // 按钮文字，设计稿中通过 descendants.w7fLT.content 覆盖
</ButtonPrimary>
```

### 2.2 Button Outline (`5jucT`)
**截图**: `design/layer/Component-Button-Outline.png`

```
类型: frame (flex row, center/center)
宽度: 342px (可覆盖)
高度: 44px
背景: var(--color-white) #FFFFFF
圆角: 12px
描边: 1px var(--color-gray-border) #E8E8E8
内距: 0 24px
子元素:
  - text "Button"
    字体: Inter 500 15px
    颜色: var(--color-gray-800) #333333
```

### 2.3 Avatar Agent (`HHdX9`)
**截图**: `design/layer/Component-Avatar-Agent.png`

```
类型: frame (flex, center/center)
宽度: 160px (可覆盖为 80/56/48/40 等尺寸)
高度: 160px
圆角: 16px
填充: image (./images/qrclaw-logo-icon.png)
```

**使用场景**: Agent 头像。设计稿中通过覆盖 width/height 来调整大小：
- 大尺寸 160×160: Mobile/Profile 页面
- 中尺寸 80×80: Mobile/Login 页面
- 小尺寸 56×56: Web/SignUp 表单
- 侧边栏 40×40: Web Dashboard 导航
- Claim 页 48×48: Web/Claim-*

### 2.4 Avatar Small (`TcSQ2`)
**截图**: `design/layer/Component-Avatar-Small.png`

```
类型: frame (flex, center/center)
宽度: 36px
高度: 36px
圆角: 6px
填充: image (./images/qrclaw-logo-icon.png)
```

### 2.5 Avatar User (`yYpU6`)
**截图**: `design/layer/Component-Avatar-User.png`

```
类型: frame (flex, center/center)
宽度: 36px
高度: 36px
圆角: 6px
背景: #CCCCCC
子元素:
  - icon: lucide "user" 18×18 白色
```

### 2.6 Input Field (`3X9H4`)
**截图**: `design/layer/Component-Input.png`

```
类型: frame (flex row, center-y)
宽度: 342px (可覆盖)
高度: 48px
背景: var(--color-white)
圆角: 8px
描边: 1px #E0E0E0
内距: 0 16px
子元素:
  - text "Placeholder"
    字体: Inter 400 14px
    颜色: var(--color-gray-500) #999999
```

**实例覆盖**: 设计稿通过 `descendants.A5lCo.content` 覆盖 placeholder 文本

### 2.7 TopBar (`XjPhS`)
**截图**: `design/layer/Component-TopBar.png`

```
类型: frame (flex row, center-y)
宽度: 390px (移动端全宽)
高度: 50px
背景: var(--color-white)
内距: 0 16px
底部描边: 1px var(--color-gray-border)
子元素 (3 列):
  - [左] icon: lucide "chevron-left" 24×24 var(--color-gray-800)
  - [中] text "Title" (flex-grow, center)
    字体: Inter 600 15px var(--color-gray-800)
  - [右] 空占位 24×24
```

**实例覆盖**: `descendants.TACyl.content` 覆盖标题文本

### 2.8 TabBar (`Rzvbh`)
**截图**: `design/layer/Component-TabBar.png`

```
类型: frame (flex row)
宽度: 390px (移动端全宽)
高度: 50px
背景: var(--color-white)
顶部描边: 1px var(--color-gray-border)
子元素 (2 个 tab):
  tab-messages (flex-grow, column, center):
    - icon: lucide "message-circle" 20×20
    - text "Messages" Inter 500 10px
    激活态: var(--color-red)
    非激活: var(--color-gray-500)
  tab-me (flex-grow, column, center):
    - icon: lucide "user" 20×20
    - text "Me" Inter 500 10px
    激活态: var(--color-red)
    非激活: var(--color-gray-500)
```

**激活态切换**: 通过 `descendants` 覆盖 icon fill 和 text fill 颜色

---

## 三、页面布局模式

### 3.1 Mobile 页面通用结构 (390×844)

```
┌─────────────── 390px ───────────────┐
│ TopBar (50px)                       │  ← Component/TopBar ref
│─────────────────────────────────────│
│                                     │
│ Content (flex-grow)                 │  ← layout: vertical
│                                     │
│─────────────────────────────────────│
│ TabBar (50px)  [可选]               │  ← Component/TabBar ref
└─────────────────────────────────────┘
```

**适用页面**: Chat、Messages、Me、MyQRCodes 等

### 3.2 Mobile Auth 页面 (居中布局)

```
┌─────────────── 390px ───────────────┐
│                                     │
│ padding-top: 80px                   │
│                                     │
│   [Logo 80×80]                      │  ← Avatar Agent ref (80×80)
│   "QRClaw" 700/24px                 │
│   subtitle 400/14px gray            │
│                                     │
│   [Email Input]                     │  ← Input ref
│   [Password Input]                  │  ← Input ref
│   [Primary Button]                  │  ← Button Primary ref
│                                     │
│   "Switch text" link                │
│                                     │
│   flex-grow spacer                  │
│   "Powered by QRClaw"              │
│                                     │
│ padding: 80 24 24 24               │
└─────────────────────────────────────┘
```

**适用页面**: Login(`9nzBk`)、SignUp(`rgesk`)、Verify(`1QsK7`)

### 3.3 Web Dashboard 三栏布局 (1440×900)

```
┌──80px──┬────320px────┬──────fill─────────┐
│Sidebar │ Middle Col  │ Right Content     │
│        │             │                   │
│ [Logo] │ "Messages"  │ Chat Header       │
│        │ ─────────── │ ─────────────     │
│ 📨 Msg │ Conv Row 1  │ Chat Messages     │
│ 📱 QR  │ Conv Row 2  │ (Agent/User       │
│ ⚙ Set  │ Conv Row 3  │  bubbles)         │
│        │             │                   │
│        │             │ ─────────────     │
│        │             │ Input Bar         │
│gap:8   │stroke-right │                   │
│pad:20,0│  1px #E5E5E5│                   │
└────────┴─────────────┴───────────────────┘
```

**适用页面**: Dashboard-Messages(`FCW4Y`)、Dashboard-Streaming(`mcCu7`)、Dashboard-Support(`18eSq`)、Dashboard-QRcode(`kVN50`)

### 3.4 Web Auth 页面 (居中卡片)

```
┌────────────────── 1440px ──────────────────┐
│                                             │
│ 渐变背景 (白→浅粉→浅粉紫→浅蓝)              │
│                                             │
│    ┌─────────── 480px ────────────┐        │
│    │ 白色卡片                      │        │
│    │ 圆角 24px, 阴影 blur 32       │        │
│    │ padding: 48px                 │        │
│    │                              │        │
│    │ [Logo] + Title + Subtitle    │        │
│    │ [Form Fields]               │        │
│    │ [Primary Button]            │        │
│    │ [Link Text]                 │        │
│    └──────────────────────────────┘        │
│                                             │
└─────────────────────────────────────────────┘
```

**适用页面**: EmailVerify(`JMDpZ`)、Claim-LoggedIn(`r2OZD`)、Claim-NotLoggedIn(`c2cAy`)

### 3.5 Web SignUp 双栏布局

```
┌────────── fill ──────────┬────── fill ──────────┐
│ Brand Side (渐变背景)      │ Form Side (白色)       │
│                           │                       │
│ "Give your Agent         │ "← Back to home"      │
│  a QR Code"              │ [Logo 56×56]          │
│                           │ "Create an account"   │
│ [Phone Mockup]           │ [Email Input]         │
│ [QR Card Overlay]        │ [Password Input]      │
│                           │ [Sign Up Button]      │
│ 渐变: F87171→FB7185      │ "Already have..."     │
│       →FDA4AF 135°       │                       │
│ padding: 60 48           │ padding: 60 100       │
└───────────────────────────┴───────────────────────┘
```

**适用页面**: Web/SignUp(`S3TMu`)

---

## 四、Web Dashboard 侧边栏规格

```
宽度: 80px
背景: var(--color-white)
右描边: 1px #E5E5E5
padding: 20px 0
gap: 8px
layout: vertical

子元素:
1. Logo (Avatar Agent 40×40)
2. spacer 16px
3. Messages Tab (64×56, 圆角 12px)
   - icon: lucide "message-circle" 20×20
   - text: Inter 500 10px
   - 激活: fill var(--color-red-bg), icon/text var(--color-red)
   - 非激活: fill transparent, icon/text var(--color-gray-500)
4. QR Tab (同上, icon "qr-code")
5. Settings Tab (同上, icon "user")
```

---

## 五、消息气泡规格

### Agent 消息 (左对齐)
```
flex row, gap 8px
[Avatar Small 36×36] + [气泡]

气泡:
  背景: var(--color-white)
  圆角: 16px (或 12px)
  padding: 12px 16px
  最大宽度: 75% 容器宽
  字体: Inter 400 14px var(--color-gray-800)
```

### 用户消息 (右对齐)
```
flex row, justify-end, gap 8px
[气泡] + [Avatar User 36×36]

气泡:
  背景: var(--color-visitor-bubble) #FDECEA
  圆角: 16px
  padding: 12px 16px
  最大宽度: 75% 容器宽
  字体: Inter 400 14px var(--color-gray-800)
```

### 流式输出指示器
```
气泡内末尾追加:
  红色圆点 (6×6, fill var(--color-red))
  + " typing..." (Inter 400 12px var(--color-gray-500))
```

---

## 六、输入栏规格

### Mobile 聊天输入栏
```
flex row, center-y, gap 10px
高度: 50px
背景: var(--color-white)
顶部描边: 1px var(--color-gray-border)
padding: 0 12px

[输入框]:
  flex-grow
  高度: 36px
  圆角: 18px (全圆角)
  背景: var(--color-white)
  描边: 1px #E0E0E0
  padding: 0 14px
  placeholder: "Type a message..." Inter 400 14px

[发送按钮]:
  36×36 圆形
  背景: var(--color-red)
  icon: lucide "arrow-up" 18×18 白色
```

### Web 聊天输入栏
```
flex row, center-y, gap 12px
高度: 60px
顶部描边: 1px var(--color-gray-border)
padding: 0 24px

[输入框]:
  flex-grow
  圆角: 20px
  背景: var(--color-gray-100)
  padding: 0 16px

[发送按钮]:
  36×36 圆形
  背景: var(--color-red)
```

---

## 七、注册横幅 (Register Bar)
```
出现位置: Mobile/Chat 底部 (未登录用户)
背景: #FEF2F2
顶部描边: 1px #FECACA
高度: 44px
padding: 0 14px (左), 0 10px (右)
gap: 8px
flex row, center-y

子元素:
  [icon] lucide "user-plus" 16×16 var(--color-red)
  [文字] "Sign up to save chats & access history" Inter 500 12px var(--color-gray-700)
  [链接] "Sign up →" Inter 600 12px var(--color-red)
  [关闭] 20×20 圆形 rgba(0,0,0,0.06), 内含 "x" icon
```

---

## 八、渐变背景参考

### Landing Page Hero
```css
background: linear-gradient(180deg, #FFFFFF 0%, #FEF2F2 100%);
```

### Web Auth 页面背景
```css
background: linear-gradient(180deg, #FFFFFF 0%, #FEF2F2 40%, #FDF2F8 70%, #F0F9FF 100%);
```

### Web SignUp Brand Side
```css
background: linear-gradient(135deg, #F87171 0%, #FB7185 50%, #FDA4AF 100%);
```

### Pricing 页面
```css
background: linear-gradient(180deg, #FFFFFF 0%, #FEF2F2 40%, #FFF1F2 70%, #FAFAFA 100%);
```

---

## 九、图标系统

所有图标使用 **Lucide Icons** (`lucide-react`)。

| 使用场景 | 图标名 | 尺寸 |
|---------|--------|------|
| 返回按钮 | `chevron-left` | 24×24 |
| 右箭头 | `chevron-right` | 16×16 |
| 用户头像 | `user` | 18×18 (头像内), 20×20 (Tab) |
| 消息 Tab | `message-circle` | 20×20 |
| 扫码 | `scan` | 22×22 |
| 注册提示 | `user-plus` | 16×16 / 14×14 |
| 邮件验证 | `mail` | 60×60 (Mobile), 48×48 (Web) |
| 编辑 | `pencil` | 13×13 |
| 关闭 | `x` | 14×14 |
| 外链 | `external-link` | 14×14 |
| 分享 | `share-2` | 20×20 |
| QR 码 | `qr-code` | 20×20 |

---

## 十、页面与截图速查

开发任意页面前，先 `Read("design/layer/<文件名>.png")` 获取视觉基准。

### Mobile 页面 (20 screens)

| 页面 | 截图文件 | nodeId | 布局模式 |
|------|---------|--------|---------|
| Profile | `Mobile-Profile.png` | `e1DDM` | 居中内容 |
| Profile Paused | `Mobile-Profile-Paused.png` | `sJcOR` | 居中内容 |
| Chat | `Mobile-Chat.png` | `IgH0g` | TopBar + 聊天 + 输入栏 |
| Chat Streaming | `Mobile-Chat-Streaming.png` | `K6mbw` | TopBar + 聊天 + 输入栏 |
| Agent NoReply | `Mobile-AgentNoReply.png` | `9KYND` | TopBar + 聊天 + 输入栏 |
| Offline Agent | `Mobile-Offline-Agent.png` | `J6l3h` | TopBar + 聊天 + 输入栏 |
| LongPress Copy | `Mobile-LongPressCopy.png` | `nNVxR` | TopBar + 聊天 + 输入栏 |
| Swipe Delete | `Mobile-SwipeDelete.png` | `sPwFf` | 自定义顶栏 + 列表 + TabBar |
| Scan QR | `Mobile-ScanQR.png` | `RXEpt` | 全屏黑色相机 |
| ScanQR Guide | `Mobile-ScanQR-AgentGuide.png` | `DFoBo` | TopBar + 聊天 + 输入栏 |
| Login | `Mobile-Login.png` | `9nzBk` | Auth 居中 (pad 80,24) |
| SignUp | `Mobile-SignUp.png` | `rgesk` | Auth 居中 (pad 80,24) |
| Verify | `Mobile-Verify.png` | `1QsK7` | Auth 居中 (pad 80,24) |
| Messages | `Mobile-Messages.png` | `Qxtxk` | 自定义顶栏 + 列表 + TabBar |
| Messages NewUser | `Mobile-Messages-NewUser.png` | `j8P8r` | 自定义顶栏 + 引导 + TabBar |
| Me | `Mobile-Me.png` | `5poPN` | Profile头 + 菜单列表 + TabBar |
| MyQRCodes | `Mobile-MyQRCodes.png` | `X2xHg` | TopBar + 列表 |
| MyQRCodes Empty | `Mobile-MyQRCodes-Empty.png` | `7X6Kn` | TopBar + 空状态 + TabBar |
| QRCode Detail | `Mobile-QRCodeDetail.png` | `eZDQG` | TopBar + 详情卡片 |
| 404 | `Mobile-404.png` | `k0nbt` | 居中 (center/center) |

### Web 页面 (18 screens)

| 页面 | 截图文件 | nodeId | 布局模式 |
|------|---------|--------|---------|
| Landing Page | `Web-LandingPage.png` | `tD9CD` | 多区块垂直滚动 |
| SignUp | `Web-SignUp.png` | `S3TMu` | 双栏 (品牌+表单) |
| Email Verify | `Web-EmailVerify.png` | `JMDpZ` | 居中卡片 |
| Claim LoggedIn | `Web-Claim-LoggedIn.png` | `r2OZD` | 居中卡片 |
| Claim NotLoggedIn | `Web-Claim-NotLoggedIn.png` | `c2cAy` | 居中卡片 |
| Dashboard Messages | `Web-Dashboard-Messages.png` | `FCW4Y` | 三栏 (80+320+fill) |
| Dashboard Streaming | `Web-Dashboard-Streaming.png` | `mcCu7` | 三栏 (80+320+fill) |
| Dashboard Support | `Web-Dashboard-Support.png` | `18eSq` | 三栏 (80+320+fill) |
| Dashboard QRcode | `Web-Dashboard-QRcode.png` | `kVN50` | 三栏 (80+340+fill) |
| Dashboard QR Empty | `Web-Dashboard-QRcode-Empty.png` | `s4lvD` | 侧栏+居中空状态 |
| CreateQR Step0 | `Web-CreateQR-Step0-SelectAgent.png` | `78jbg` | 侧栏+内容区 |
| CreateQR Step1 | `Web-CreateQR-Step1-Template.png` | `2HULu` | 侧栏+内容区 |
| CreateQR Step2 | `Web-CreateQR-Step2-Configure.png` | `CHIA7` | 侧栏+表单+预览 |
| CreateQR Success | `Web-CreateQR-Success.png` | `j4R85` | 侧栏+居中结果 |
| EditQR | `Web-EditQR.png` | `thA1i` | 侧栏+表单+预览 |
| Settings | `Web-Settings.png` | `ntmk5` | 侧栏+设置列表 |
| Pricing | `Web-Pricing.png` | `UZFlP` | 居中定价卡片 |
| Docs Page | `Web-DocsPage.png` | `aiwB4` | 顶栏+三栏文档 |

### 交互注释截图

开发对应页面时，**必须阅读**对应的注释截图以了解交互逻辑：

| 注释 | 截图文件 | 关联页面 |
|------|---------|---------|
| Claim 流程 | `_annotation-ClaimAgent.png` | Claim-* |
| Dashboard QR | `_annotation-Dashboard-QRcode.png` | Dashboard-QRcode |
| CreateQR Step1 | `_annotation-CreateQR-Step1.png` | CreateQR-Step1 |
| CreateQR Step2 | `_annotation-CreateQR-Step2.png` | CreateQR-Step2 |
| CreateQR 成功 | `_annotation-CreateQR-Success.png` | CreateQR-Success |
| 编辑 QR | `_annotation-EditQR.png` | EditQR |
| 流式输出 | `_annotation-Streaming.png` | Chat-Streaming, Dashboard-Streaming |
| 消息需登录 | `_annotation-Messages-RequiresSignup.png` | Messages |

---

## 十一、关键开发规则

1. **颜色**: 永远使用 `design-tokens.css` 中的 CSS 变量，不要硬编码 hex 值
2. **字体**: 统一使用 Inter，代码块使用 JetBrains Mono
3. **图标**: 统一使用 lucide-react，尺寸和颜色严格按设计稿
4. **间距**: 严格按设计稿的 padding/gap/margin 值，不要使用"差不多"的值
5. **圆角**: 按钮 12px，卡片 12-16px，头像小 6px/大 16px，输入框 8px
6. **组件复用**: 所有 `ref` 节点都应使用对应的 React 组件，通过 props 覆盖内容
7. **响应式**: Mobile 固定 390px 宽，Web 固定 1440px 宽（MVP 阶段不需要响应式）
