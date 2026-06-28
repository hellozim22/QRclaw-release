# QRClaw Visual Reference

> 本文件由 SKILL.md 按需加载。素材来源：`design/design-tokens.css` / `design/frontend-dev-guide.md` / `design/qrclaw-interaction-design.md` / `web/src/app/globals.css`（2026-04-23 对齐）。

---

## §1 设计 Token 速查

Token 源：`design/design-tokens.css`，运行时镜像：`web/src/app/globals.css`。两者必须一致。

### 1.1 颜色（Brand + Neutral + Semantic）

```css
/* Brand */
--color-red: #E24A3F;          /* 主品牌红，CTA、Tab 激活、发送按钮 */
--color-red-dark: #C03A32;     /* 按下态 */
--color-red-light: #F5706A;    /* 浅红 */
--color-red-bg: #FEF5F4;       /* 红底弱提示、Dashboard Tab 激活底色 */
--color-delete-red: #FF3B30;   /* 删除操作 */
--color-visitor-bubble: #FDECEA; /* 用户消息气泡底 */

/* Neutral */
--color-black: #1A1A1A;
--color-charcoal: #2D2D2D;
--color-gray-800: #333333;     /* 主文字 */
--color-gray-700: #666666;     /* 副文字 */
--color-gray-600: #868E96;
--color-gray-500: #999999;     /* placeholder、禁用 */
--color-gray-300: #DEE2E6;
--color-gray-200: #F0F0F0;
--color-gray-100: #F5F5F5;     /* Web 输入框底 */
--color-gray-border: #E8E8E8;  /* 通用边框 */
--color-dashboard-divider: #E5E5E5;  /* Web Dashboard 竖向分隔 */
--color-off-white: #F8F9FA;
--color-white: #FFFFFF;
--color-muted: #BBBBBB;
--color-placeholder: #aaaaaa;
--color-input-placeholder: var(--color-gray-500);
--color-input-border: #e0e0e0;

/* Semantic */
--color-green: #34C759;
--color-green-bg: #DCFCE7;
--color-green-text: #16A34A;
--color-green-dark: #2E7D32;
--color-green-light-bg: #E8F5E9;
--color-warning: #F59E0B;
--color-amber-bg: #FFFBEB;     /* 连接中横幅 */
--color-amber-text: #D97706;
--color-success: #22C55E;
--color-indigo: #6366F1;
--color-indigo-bg: #EEF2FF;
--color-disabled: #D1D5DB;
--color-user-avatar-bg: #CCCCCC;

/* Scan 页（深色底前景） */
--color-scan-hint: rgba(255,255,255,0.6);
--color-scan-caption: rgba(255,255,255,0.5);
--color-scan-control-bg: rgba(255,255,255,0.1);
--color-scan-control-border: rgba(255,255,255,0.2);
--color-scan-viewfinder-border: rgba(255,255,255,0.2);
--color-scan-background: #000000;
```

### 1.2 字体

```css
--font-primary: var(--font-inter, 'Inter'), 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: var(--font-jetbrains-mono, 'JetBrains Mono'), 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
```

`--font-inter` / `--font-jetbrains-mono` 由 `web/src/app/layout.tsx` 的 `next/font` 注入到 `<html>`。使用时**一律走语义 Token** `var(--font-primary)` / `var(--font-mono)`，不要直接写 `var(--font-inter)`。

> ⚠️ `--font-primary` 在两文件里的 fallback 写法字面不同：`design-tokens.css` 同时写了内置 `var(--font-inter, 'Inter')` 和外置 `'Inter'` 两重 fallback；`globals.css` 只写外置 `'Inter'` fallback。运行时等价，后续统一回写 SSOT。

### 1.3 字号 / 字重

```css
--text-xs: 10px;   --text-sm: 11px;   --text-base: 13px;   --text-md: 14px;
--text-lg: 15px;   --text-xl: 16px;   --text-2xl: 20px;    --text-3xl: 24px;
--text-4xl: 28px;  --text-5xl: 32px;  --text-6xl: 36px;

--font-normal: 400;    --font-medium: 500;
--font-semibold: 600;  --font-bold: 700;
```

### 1.4 间距（4 的倍数）

```css
--space-1: 4px;    --space-2: 8px;    --space-3: 12px;   --space-4: 16px;
--space-5: 20px;   --space-6: 24px;   --space-8: 32px;   --space-10: 40px;
--space-12: 48px;  --space-16: 64px;  --space-20: 80px;
```

### 1.5 圆角 / 阴影

```css
--radius-sm: 6px;   --radius-md: 8px;    --radius-lg: 12px;
--radius-xl: 16px;  --radius-2xl: 20px;  --radius-3xl: 24px;
--radius-full: 9999px;

--shadow-sm: 0 2px 8px rgba(0,0,0,0.03);
--shadow-md: 0 4px 12px rgba(0,0,0,0.03);
--shadow-lg: 0 8px 32px rgba(0,0,0,0.06);
--shadow-card: 0 4px 12px rgba(0,0,0,0.03);
--shadow-modal: 0 8px 32px rgba(0,0,0,0.06);
```

### 1.6 渐变

```css
--gradient-verify-page: linear-gradient(180deg, #FFFFFF 0%, #FEF2F2 40%, #FDF2F8 70%, #F0F9FF 100%);
--gradient-signup-brand: linear-gradient(135deg, #F87171 0%, #FB7185 50%, #FDA4AF 100%);
--gradient-primary: linear-gradient(180deg, #F56565 0%, #E24A3F 55%, #D63D32 100%);
--gradient-verify-mobile: linear-gradient(180deg, #F0EAFF 0%, #FFFFFF 40%);
```

### 1.7 布局

```css
--mobile-width: 390px;   --mobile-height: 844px;
--web-width: 1440px;     --web-height: 900px;
--web-sidebar-width: 80px;
--web-middle-col-width: 320px;

--btn-height-primary: 50px;   --btn-height-outline: 44px;
--input-height: 48px;         --input-height-auth-mobile: 52px;
--topbar-height: 50px;        --tabbar-height: 50px;
--avatar-lg: 160px;           --avatar-sm: 36px;
--phone-preview-radius: 28px;
--phone-preview-aspect: 9 / 19.5;
--shadow-phone-preview: 0 8px 32px rgba(0,0,0,0.12);
```

### 1.8 globals.css 运行时扩展 Token（SSOT 待回写，绿 5 条）

以下 token 当前**仅存于 `web/src/app/globals.css`**，尚未回写 `design/design-tokens.css`。消费时照常引用 CSS 变量名即可；新增相似类别 token 请同时满足 §0 铁律（先 design-tokens 再 globals）。

```css
--web-nav-height: 64px;               /* Web 顶栏高度（Landing / Docs 页） */

/* 代码块语法高亮（暗底） */
--code-comment:  #888888;
--code-keyword:  #c792ea;
--code-function: #82aaff;
--code-string:   #c3e88d;
```

> `--color-signup-brand-muted` 两边都有，不是差异项。

---

## §2 可复用组件详细规格

所有 `ref` 节点都应复用对应 React 组件，通过 props 覆盖内容。

### 2.1 Button Primary `OjdTt`

```
flex row, center/center
宽度: 342px（可覆盖）
高度: 50px (--btn-height-primary)
背景: var(--color-red)
圆角: 12px (--radius-lg)
内距: 0 24px (--space-6)
子: text, Inter 600 16px, var(--color-white)
```

### 2.2 Button Outline `5jucT`

```
flex row, center/center
宽度: 342px（可覆盖）
高度: 44px (--btn-height-outline)
背景: var(--color-white)
圆角: 12px
描边: 1px var(--color-gray-border)
内距: 0 24px
子: text, Inter 500 15px, var(--color-gray-800)
```

### 2.3 Avatar Agent `HHdX9`

```
flex, center/center
宽/高: 160px（可覆盖：80 / 56 / 48 / 40）
圆角: 16px (--radius-xl)
填充: image (./images/qrclaw-logo-icon.png)
```

使用尺寸：Mobile Profile 160、Mobile Login 80、Web SignUp 56、Dashboard 侧栏 40、Claim 页 48。

### 2.4 Avatar Small `TcSQ2`

```
36×36，圆角 6px，填充 logo 图
```

### 2.5 Avatar User `yYpU6`

```
36×36，圆角 6px
背景: var(--color-user-avatar-bg) #CCCCCC
内含 lucide "user" 18×18 白色
```

### 2.6 Input Field `3X9H4`

```
flex row, center-y
宽度: 342px（可覆盖）
高度: 48px (--input-height)
背景: var(--color-white)
圆角: 8px (--radius-md)
描边: 1px var(--color-input-border)
内距: 0 16px (--space-4)
子: text "Placeholder", Inter 400 14px, var(--color-input-placeholder)
```

Mobile Auth 专用高度 `--input-height-auth-mobile` = 52px。

### 2.7 TopBar `XjPhS`

```
flex row, center-y
宽度: 390px
高度: 50px (--topbar-height)
背景: var(--color-white)
内距: 0 16px
底部描边: 1px var(--color-gray-border)
三列:
  [左] chevron-left 24×24 var(--color-gray-800)
  [中] text Title, Inter 600 15px var(--color-gray-800), flex-grow 居中
  [右] 24×24 占位
```

### 2.8 TabBar `Rzvbh`

```
flex row
宽度: 390px
高度: 50px (--tabbar-height)
背景: var(--color-white)
顶部描边: 1px var(--color-gray-border)

tab-messages (flex-grow, column, center):
  icon: lucide "message-circle" 20×20
  text "Messages" Inter 500 10px
  激活: var(--color-red)
  非激活: var(--color-gray-500)
tab-me: 同上, icon "user"
```

---

## §3 页面布局模式

### 3.1 Mobile 通用 (390×844)

```
┌── TopBar 50px ──┐
│                 │
│ Content flex-grow
│                 │
└── TabBar 50px（可选）┘
```

适用：Chat、Messages、Me、MyQRCodes。

### 3.2 Mobile Auth 居中 (pad 80,24)

```
padding: 80 24 24 24
vertical, gap 变化:
  Avatar Agent 80×80
  title "QRClaw" 24/700
  subtitle 14/400 gray-500
  Input Email
  Input Password
  Button Primary
  link "switch"
  flex-grow
  "Powered by QRClaw"
```

适用：Login `9nzBk`、SignUp `rgesk`、Verify `1QsK7`。

### 3.3 Web Dashboard 三栏 (1440×900)

```
┌──80──┬──320──┬──fill──┐
│Side │ Middle │ Right   │
│bar  │ Col    │ Content │
│     │ (List) │         │
└──────┴────────┴─────────┘
```

- Sidebar: `var(--color-white)`，右描边 1px `var(--color-dashboard-divider)`，padding 20 0，gap 8，垂直布局
- Sidebar 子：Avatar Agent 40×40 → spacer 16 → Tab×3（64×56，圆角 12，激活底 `var(--color-red-bg)`、icon/text `var(--color-red)`）
- Middle Col: 描边右 1px `var(--color-dashboard-divider)`

适用：Dashboard-Messages / -Streaming / -Support / -QRcode。

### 3.4 Web Auth 居中卡片

```
背景: var(--gradient-verify-page)
卡片:
  width 480px
  圆角 24px (--radius-3xl)
  阴影 --shadow-lg
  padding 48
  内容: Logo 56 + Title + Subtitle + Form + Button + Link
```

适用：EmailVerify `JMDpZ`、Claim-LoggedIn `r2OZD`、Claim-NotLoggedIn `c2cAy`。

### 3.5 Web SignUp 双栏

```
左 fill: Brand Side
  背景 var(--gradient-signup-brand)
  padding 60 48
  内容: title "Give your Agent a QR Code" + Phone Mockup + QR Card Overlay
右 fill: Form Side
  背景 var(--color-white)
  padding 60 100
  内容: "← Back" + Logo 56 + Title + Form + Button + Link
```

适用：Web/SignUp `S3TMu`。

---

## §4 消息气泡

### 4.1 Agent 消息（左对齐）

```
flex row, gap 8
  Avatar Small 36×36
  气泡:
    背景 var(--color-white)
    圆角 16 或 12
    padding 12 16
    max-width 75%
    text Inter 400 14 var(--color-gray-800)
```

### 4.2 用户消息（右对齐）

```
flex row, justify-end, gap 8
  气泡 背景 var(--color-visitor-bubble)（其余同上）
  Avatar User 36×36
```

### 4.3 流式输出指示器

气泡内末尾追加：`●`（6×6 fill `var(--color-red)`）+ " typing..." Inter 400 12 `var(--color-gray-500)`。

---

## §5 输入栏

### 5.1 Mobile 聊天输入栏

```
flex row, center-y, gap 10
高度 50
背景 var(--color-white)
顶部描边 1px var(--color-gray-border)
padding 0 12

输入框:
  flex-grow, 高度 36
  圆角 18（全圆）
  背景 var(--color-white)
  描边 1px var(--color-input-border)
  padding 0 14
  placeholder "Type a message..." Inter 400 14

发送按钮:
  36×36 圆形
  背景 var(--color-red)
  icon lucide "arrow-up" 18×18 白
```

### 5.2 Web 聊天输入栏

```
flex row, center-y, gap 12
高度 60
顶部描边 1px var(--color-gray-border)
padding 0 24

输入框:
  flex-grow
  圆角 20
  背景 var(--color-gray-100)
  padding 0 16

发送按钮: 同 Mobile，36×36 圆 var(--color-red)
```

---

## §6 特殊组件：Register Bar

出现在 Mobile/Chat 底部（未登录态）：

```
背景 #FEF2F2 顶描边 1px #FECACA（已入 --color-red-bg 系，可就地 Token 化）
高度 44, padding-left 14, padding-right 10, gap 8
flex row center-y

[icon] lucide "user-plus" 16×16 var(--color-red)
[文字] "Sign up to save chats & access history" Inter 500 12 var(--color-gray-700)
[链接] "Sign up →" Inter 600 12 var(--color-red)
[关闭] 20×20 圆 rgba(0,0,0,0.06)，内 "x" icon
```

---

## §7 渐变背景速查

| 使用场景 | Token |
|---|---|
| Landing Hero | `linear-gradient(180deg, #FFFFFF 0%, #FEF2F2 100%)`（可 Token 化） |
| Web Auth 页背景 | `var(--gradient-verify-page)` |
| Web SignUp Brand 侧 | `var(--gradient-signup-brand)` |
| Mobile 主 CTA | `var(--gradient-primary)` |
| Mobile Verify 页 | `var(--gradient-verify-mobile)` |

---

## §8 图标系统（Lucide 映射）

| 场景 | icon | 尺寸 |
|---|---|---|
| 返回 | `chevron-left` | 24 |
| 右箭头 | `chevron-right` | 16 |
| 用户头像 | `user` | 18 / 20 |
| 消息 Tab | `message-circle` | 20 |
| 扫码 | `scan` | 22 |
| 注册提示 | `user-plus` | 16 / 14 |
| 邮件验证 | `mail` | 60 / 48 |
| 编辑 | `pencil` | 13 |
| 关闭 | `x` | 14 |
| 外链 | `external-link` | 14 |
| 分享 | `share-2` | 20 |
| QR 码 | `qr-code` | 20 |
| 发送 | `arrow-up` | 18 |

颜色一律走 `var(--color-*)`，通过 `style={{ color: ... }}` 或父级 `color` 继承。

---

## §9 页面速查表

**Mobile（20 页）**，开发前 `Read("design/layer/<file>.png")`。按 interaction-design §七 分流程归类：M1 扫码入口 / M2 聊天核心 / M3 聊天交互 / M4 注册登录 / M5 注册后主页 / M6 QR 管理 / M7 扫码引导。

> interaction-design §七 文字写 "21 screens"但其列表和 `design/layer/` 实際都是 20 页（源文件数字错差）。

| 页面 | 文件 | nodeId | 布局 |
|---|---|---|---|
| Profile | `Mobile-Profile.png` | `e1DDM` | 居中 |
| Profile Paused | `Mobile-Profile-Paused.png` | `sJcOR` | 居中 |
| Chat | `Mobile-Chat.png` | `IgH0g` | TopBar+chat+输入栏 |
| Chat Streaming | `Mobile-Chat-Streaming.png` | `K6mbw` | 同上 |
| Agent NoReply | `Mobile-AgentNoReply.png` | `9KYND` | 同上 |
| Offline Agent | `Mobile-Offline-Agent.png` | `J6l3h` | 同上 |
| LongPress Copy | `Mobile-LongPressCopy.png` | `nNVxR` | 同上 |
| Swipe Delete | `Mobile-SwipeDelete.png` | `sPwFf` | 自定顶栏+列表+TabBar |
| Scan QR | `Mobile-ScanQR.png` | `RXEpt` | 全屏黑相机 |
| ScanQR Guide | `Mobile-ScanQR-AgentGuide.png` | `DFoBo` | TopBar+chat+输入栏 |
| Login | `Mobile-Login.png` | `9nzBk` | Auth 居中 |
| SignUp | `Mobile-SignUp.png` | `rgesk` | Auth 居中 |
| Verify | `Mobile-Verify.png` | `1QsK7` | Auth 居中 |
| Messages | `Mobile-Messages.png` | `Qxtxk` | 自定顶栏+列表+TabBar |
| Messages NewUser | `Mobile-Messages-NewUser.png` | `j8P8r` | 同上+引导 |
| Me | `Mobile-Me.png` | `5poPN` | Profile头+菜单+TabBar |
| MyQRCodes | `Mobile-MyQRCodes.png` | `X2xHg` | TopBar+列表 |
| MyQRCodes Empty | `Mobile-MyQRCodes-Empty.png` | `7X6Kn` | TopBar+空态+TabBar |
| QRCode Detail | `Mobile-QRCodeDetail.png` | `eZDQG` | TopBar+详情卡 |
| 404 | `Mobile-404.png` | `k0nbt` | 居中 |

**Web（18 页）**

| 页面 | 文件 | nodeId | 布局 |
|---|---|---|---|
| Landing Page | `Web-LandingPage.png` | `tD9CD` | 多区块垂直滚动 |
| SignUp | `Web-SignUp.png` | `S3TMu` | 双栏（品牌+表单） |
| Email Verify | `Web-EmailVerify.png` | `JMDpZ` | 居中卡片 |
| Claim LoggedIn | `Web-Claim-LoggedIn.png` | `r2OZD` | 居中卡片 |
| Claim NotLoggedIn | `Web-Claim-NotLoggedIn.png` | `c2cAy` | 居中卡片 |
| Dashboard Messages | `Web-Dashboard-Messages.png` | `FCW4Y` | 三栏 |
| Dashboard Streaming | `Web-Dashboard-Streaming.png` | `mcCu7` | 三栏 |
| Dashboard Support | `Web-Dashboard-Support.png` | `18eSq` | 三栏 |
| Dashboard QRcode | `Web-Dashboard-QRcode.png` | `kVN50` | 三栏 |
| Dashboard QR Empty | `Web-Dashboard-QRcode-Empty.png` | `s4lvD` | 侧栏+空态 |
| CreateQR Step0 | `Web-CreateQR-Step0-SelectAgent.png` | `78jbg` | 侧栏+内容 |
| CreateQR Step1 | `Web-CreateQR-Step1-Template.png` | `2HULu` | 侧栏+内容 |
| CreateQR Step2 | `Web-CreateQR-Step2-Configure.png` | `CHIA7` | 侧栏+表单+预览 |
| CreateQR Success | `Web-CreateQR-Success.png` | `j4R85` | 侧栏+结果 |
| EditQR | `Web-EditQR.png` | `thA1i` | 侧栏+表单+预览 |
| Settings | `Web-Settings.png` | `ntmk5` | 侧栏+设置列表 |
| Pricing | `Web-Pricing.png` | `UZFlP` | 居中定价卡 |
| Docs Page | `Web-DocsPage.png` | `aiwB4` | 顶栏+三栏 |

**交互注释截图**（对应页面开发时必读）：`_annotation-ClaimAgent.png` / `_annotation-Dashboard-QRcode.png` / `_annotation-CreateQR-Step1.png` / `_annotation-CreateQR-Step2.png` / `_annotation-CreateQR-Success.png` / `_annotation-EditQR.png` / `_annotation-Streaming.png` / `_annotation-Messages-RequiresSignup.png`。

---

## §10 Overlay 组件规格（从 interaction-design §四提炼）

Overlay 组件在页面之上浮层渲染，Pencil 资源 nodeId `MHnIL`（`Components-Overlays.png`）。

### 10.1 Toast Notifications

3 种色盘：
- ✅ 成功（绿）：文案例 `✓ Copied to clipboard`，背 `var(--color-green-bg)` / 文字 `var(--color-green-text)`
- ⚡ 警告（黄 / 琥珀）：`⚡ Connection lost. Reconnecting...`，背 `var(--color-amber-bg)` / 文字 `var(--color-amber-text)`
- Ⓒ 错误（红）：`⊘ Connection lost. Tap to retry.`，背 `var(--color-red-bg)` / 文字 `var(--color-red)` / 报错字 `var(--color-delete-red)`
- 位置：移动端顶部 16px、宽度 342；Web 右上角 24px 偏移，宽 360
- 圆角：`var(--radius-lg)`，高度 48，padding `0 16`
- 生命周期：2-3s 自消失；扫码错误可点击重试

### 10.2 Confirm Dialog

- 位置：居中，背景遮罩 `rgba(0,0,0,0.5)`
- 卡片：`var(--color-white)`，圆角 `var(--radius-xl)` (16)，宽 320（Mobile）/ 400（Web），padding 24，阴影 `var(--shadow-modal)`
- 内部：
  - 标题：Inter 600 17px，`var(--color-gray-800)`，如 `"Sign Out?"`
  - 说明：Inter 400 14px，`var(--color-gray-700)`，行高 1.4
  - 按钮串：flex row, gap 12，顶部 margin 20
    - 左 Cancel → Button Outline
    - 右 确认 → Button Primary 背色换 `var(--color-delete-red)`（破坏性操作）或保留 `var(--color-red)`（通用）

### 10.3 Suggested Questions

- 触发：Profile 页黄色卡片下方、空状态 Chat 页（W5 / M5 聊天页面相关）
- 形式：灰色描边胶囊标签
  - 圆角：`var(--radius-full)`（完全圆）
  - 背景：`var(--color-white)`，描边 1px `var(--color-gray-border)`
  - 文字：Inter 400 13px `var(--color-gray-700)`
  - 内边距：`8 14`，间距 gap `8`
- 示例文案：`"What are today’s specials?"` / `"Do you have vegetarian options?"` / `"How do I place an order?"`

### 10.4 Skeleton Loading

- 灰色矩形占位，颜色 `var(--color-gray-200)` → `var(--color-gray-100)` 微动渐变动画（1.4s infinite）
- 头像圈：直径 36，圆角 `var(--radius-full)`
- 文字条：两行，行高 12，gap 8
- 适用：消息列表、Profile 加载、QR 列表

---

## §11 QR 样式面板（W7 / `FBcJn`）

Web/Docs 页面下的 QR Styles 子页，用于预览与选择不同样式。

- **预设样式：5 种**，每种有独立的前景色 / 图案形状 / 中心 logo 设置：Default 红 / Classic Black / Gradient 渐变 / Dotted 圆点 / Rounded 圆角
- **卡片对比：**上半部 QR 预览（正方形 200×200，圆角 `var(--radius-lg)`），下半部标题 + 说明
- **颜色自定义：**提供主色圆形色板 + hex 输入框；支持 `var(--color-red)` / `var(--color-gray-800)` 预设快混
- **预览交互：**鼠标悬停卡片圆角加深 `var(--shadow-lg)`，点击选中加红色 2px 外描

更多规格待补充（本节 v1 版仅触及框架）。

---

## §12 关键交互要点（从 qrclaw-interaction-design.md 提炼）

1. **扫码链路**：Mobile/ScanQR（全屏黑相机）→ 成功 → ScanQR-AgentGuide 进入聊天。扫码失败无弹窗，保留取景框。
2. **流式输出**：Agent 消息气泡末尾 typing 红点 + "typing..."；流结束后移除。见 `_annotation-Streaming.png`。
3. **长按复制**：Mobile/Chat 中气泡长按 500ms 触发，`LongPressCopy.png` 为选中态（高亮 + tooltip "Copy"）。
4. **左滑删除**：Messages 列表行左滑 80px 露出红色删除按钮（宽 64，`var(--color-delete-red)`），点按确认。
5. **消息需登录**：未登录用户在 Mobile/Chat 点击"Messages" Tab 触发 Messages-RequiresSignup（底部 Register Bar 已渲染则不重复）。
6. **Claim 流程**：Web/Claim-NotLoggedIn → 跳 SignUp → Claim-LoggedIn 成功页。`_annotation-ClaimAgent.png` 有完整态流转。
7. **CreateQR 三步**：Step0 选 Agent → Step1 选模板 → Step2 配置（表单+预览同屏） → Success（带下载/分享）。
8. **EditQR**：对已有 QR 复用 Step2 布局，标题改为 "Edit QR"。
9. **Dashboard 侧栏激活态**：选中 Tab 底色 `var(--color-red-bg)`，icon/text `var(--color-red)`；非激活 `var(--color-gray-500)`。
10. **Web Auth 背景**：居中卡片之上的页面底用 `var(--gradient-verify-page)`，卡片浮于渐变之上（`--shadow-lg`）。
