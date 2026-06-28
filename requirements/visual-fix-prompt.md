# QRClaw 前端视觉还原修复指引

> **目标**: 将当前前端页面修复到与 Pencil 设计稿像素级一致
> **约束**: 只修改样式和布局，不修改任何业务逻辑、API 调用、状态管理代码
> **⚠️ 唯一权威视觉基准**: `design/pencil-new.pen`（Pencil 设计稿文件）

---

## ⚠️ 视觉基准源声明（铁律）

### 唯一权威源：`design/pencil-new.pen`

本项目的视觉还原**必须且只能**以 Pencil 设计稿文件 `design/pencil-new.pen` 为准。

- **Pencil 文件**是"活的设计稿"，包含精确的数值（颜色 hex、间距 px、字号、圆角、渐变角度等）
- 包含 **8 个可复用组件定义**（Button Primary/Outline、Avatar Agent/Small/User、Input、TopBar、TabBar）
- 包含 **CSS 变量绑定**（$red, $white, $gray-border 等）
- 包含 **38+ 个页面设计**（20 Mobile + 18 Web），远多于以前列出的 17 个

### 辅助参考（不作为权威源）

以下文件作为**辅助参考**，但如果与 Pencil 设计稿有冲突，**一律以 Pencil 为准**：

| 文件 | 用途 | 优先级 |
|------|------|--------|
| `design/pencil-new.pen` | **唯一权威视觉基准** | 🔴 最高（铁律） |
| `design/frontend-dev-guide.md` | 组件规格、布局模式速查 | 🟡 辅助（从 Pencil 提取的文档） |
| `design/design-tokens.css` | CSS 变量定义 | 🟡 辅助（从 Pencil 提取的 Token） |
| `design/layer/*.png` | 76 张静态截图 | 🟠 参考（可能过时，不作为权威） |
| `design/qrclaw-interaction-design.md` | 交互行为 | 🟡 辅助 |

---

## ⚠️ 开始前必读（按顺序）

在做任何修改之前，**必须完整阅读**以下文件：

```
1. Read("CLAUDE.md")                                    — 项目总入口，了解架构和约束
2. Read("design/frontend-dev-guide.md")                 — 组件规格、布局模式、页面速查
3. Read("design/design-tokens.css")                     — 所有颜色/字体/间距/圆角 CSS 变量
4. Read("design/qrclaw-interaction-design.md")          — 交互规格和每个页面的详细说明
5. Read("test-results/fix-list.md")                     — 已知 MEDIUM + LOW 问题清单（12 个）
```

### 必须使用 Pencil MCP 工具

执行视觉还原的 Agent **必须具备 Pencil MCP 工具**（batch_get / get_screenshot / batch_design 等），工作流程中**必须**使用以下 MCP 调用：

```
# 获取页面设计截图（精确视觉基准）
get_screenshot(filePath: "design/pencil-new.pen", nodeId: "<nodeId>")

# 获取组件/节点精确数值（颜色、间距、字号、圆角等）
batch_get(filePath: "design/pencil-new.pen", nodeIds: ["<nodeId>"], readDepth: 3)

# 获取可复用组件列表
batch_get(filePath: "design/pencil-new.pen", patterns: [{ reusable: true }], readDepth: 2, searchDepth: 3)
```

---

## 设计还原工作流

对每个页面，严格按以下步骤操作：

### Step 1: 从 Pencil 获取设计基准

```
# 1a. 获取页面截图（视觉参考）
get_screenshot(filePath: "design/pencil-new.pen", nodeId: "<pageNodeId>")

# 1b. 获取页面节点数据（精确数值）
batch_get(filePath: "design/pencil-new.pen", nodeIds: ["<pageNodeId>"], readDepth: 5)

# 1c. 如需某个子节点的更详细数据
batch_get(filePath: "design/pencil-new.pen", nodeIds: ["<childNodeId>"], readDepth: 3)
```

这是**唯一的视觉基准**。从 Pencil 中提取的精确数值（颜色、间距、字号、圆角、渐变等）是修改的依据。

### Step 2: 读取当前前端代码

阅读对应的 `.tsx` 文件和相关组件。

### Step 3: 逐项对比差异

使用 Pencil 中的**精确数值**（而非目测截图）对比代码中的：
- 布局结构（flex direction, gap, padding, margin）
- 颜色（必须使用 CSS 变量，对应 Pencil 中的 $variable）
- 字体（family, size, weight, color — 精确到 px）
- 间距（padding, margin, gap — 精确到 px）
- 圆角（border-radius — 精确到 px）
- 阴影（box-shadow）
- 图标（lucide-react 图标名、尺寸、颜色）
- 组件尺寸（button height, input height, topbar/tabbar height）

### Step 4: 修改代码还原设计

修改对应的 `.tsx` 文件，使其与 Pencil 设计稿的精确数值一致。

### Step 5: 验证

每修改完一个页面：
1. 运行 `cd web && npm run build` 确保编译通过
2. 可选：启动 `npm run dev` 用 Playwright 截图对比

---

## 完整页面清单（从 Pencil 设计稿提取）

### 第一批：核心公共页面（优先级最高）

| # | 页面 | 路由 | Pencil nodeId | 代码文件 | 重点 |
|---|------|------|:---:|---------|------|
| 1 | Landing Page | `/` | `tD9CD` | `web/src/components/landing/LandingPage.tsx` | Hero 渐变背景、导航栏毛玻璃效果、CTA 按钮样式、Connect 区域代码块、Footer |
| 2 | Login | `/login` | `9nzBk` | `web/src/app/(auth)/login/page.tsx` | 居中布局 padding 80/24、Logo 80×80、输入框样式、按钮样式 |
| 3 | Web SignUp | `/signup` | `S3TMu` | `web/src/app/(auth)/signup/page.tsx` | 双栏布局（左渐变品牌区 + 右白色表单区）、渐变 F87171→FB7185→FDA4AF 135° |
| 4 | Email Verify (Web) | `/verify` | `JMDpZ` | `web/src/app/(auth)/verify/page.tsx` | 渐变背景、居中白色卡片 24px 圆角、6 位验证码输入框 |

### 第二批：Dashboard 三栏布局

| # | 页面 | 路由 | Pencil nodeId | 代码文件 | 重点 |
|---|------|------|:---:|---------|------|
| 5 | Dashboard Messages | `/messages` | `FCW4Y` | `layout.tsx` + `messages/page.tsx` | 三栏布局 80px+320px+fill、侧边栏、消息列表、聊天区 |
| 6 | Dashboard QR Codes | `/qrcodes` | `kVN50` | `qrcodes/page.tsx` | 中间列表区统计卡片、QR 列表行样式、右侧详情面板 |
| 7 | Dashboard Settings | `/settings` | `ntmk5` | `settings/page.tsx` | Profile 卡片、菜单列表样式 |
| 8 | Dashboard QR Empty | `/qrcodes` (empty) | `s4lvD` | `qrcodes/page.tsx` | 空状态设计 |
| 9 | CreateQR Step0 | `/qrcodes/create` | `78jbg` | `create/page.tsx` | Agent 选择 |
| 10 | CreateQR Step2 | `/qrcodes/create` | `CHIA7` | `create/page.tsx` | 配置表单+实时预览 |
| 11 | CreateQR Success | `/qrcodes/create` | `j4R85` | `create/page.tsx` | 成功状态 |
| 12 | EditQR | `/qrcodes/edit` | `thA1i` | (需确认) | 编辑表单+预览 |
| 13 | Dashboard Streaming | `/messages` | `mcCu7` | `messages/page.tsx` | 流式输出状态 |
| 14 | Dashboard Support | `/messages` | `18eSq` | `messages/page.tsx` | 支持会话状态 |

### 第三批：Mobile 页面

| # | 页面 | 路由 | Pencil nodeId | 代码文件 | 重点 |
|---|------|------|:---:|---------|------|
| 15 | Mobile Profile | `/agent/[agentId]` | `e1DDM` | `agent/[agentId]/page.tsx` | 红色渐变头部、大头像 160×160、Message 按钮 |
| 16 | Mobile Chat | `/chat/[agentId]` | `IgH0g` | `chat/[agentId]/page.tsx` + chat/ | TopBar + 消息气泡 + 输入栏 + 注册横幅 |
| 17 | Mobile Messages | `/m/messages` | `Qxtxk` | `m/messages/page.tsx` | TopBar、消息列表行、未读角标 |
| 18 | Mobile Me | `/m/me` | `5poPN` | `m/me/page.tsx` | 用户头像区域、菜单列表、Sign Out |
| 19 | Mobile MyQRCodes | `/m/qrcodes` | `X2xHg` | `m/qrcodes/page.tsx` | TopBar + 列表 |
| 20 | Mobile QRCode Detail | (detail) | `eZDQG` | (需确认) | TopBar + 详情卡片 |
| 21 | Mobile Chat Streaming | `/chat/[agentId]` | `K6mbw` | `chat/[agentId]/page.tsx` | 流式输出状态 |
| 22 | Mobile Login | `/login` | `9nzBk` | `login/page.tsx` | 移动端登录样式 |
| 23 | Mobile SignUp | `/signup` | `rgesk` | `signup/page.tsx` | 移动端注册样式 |
| 24 | Mobile Verify | `/verify` | `1QsK7` | `verify/page.tsx` | 移动端验证样式 |
| 25 | Mobile Messages NewUser | `/m/messages` | `j8P8r` | `m/messages/page.tsx` | 新用户空状态 |
| 26 | Mobile ScanQR | `/m/scan` | `RXEpt` | `m/scan/page.tsx` | 全屏相机扫码 |

### 第四批：其他页面

| # | 页面 | 路由 | Pencil nodeId | 代码文件 |
|---|------|------|:---:|---------|
| 27 | Claim LoggedIn | `/claim/[token]` | `r2OZD` | `claim/[token]/page.tsx` |
| 28 | Claim NotLoggedIn | `/claim/[token]` | `c2cAy` | `claim/[token]/page.tsx` |
| 29 | Pricing | `/pricing` | `UZFlP` | `pricing/PricingPage.tsx` |
| 30 | Docs | `/docs` | `aiwB4` | `docs/DocsPage.tsx` |
| 31 | 404 | 不存在路由 | `k0nbt` | `not-found.tsx` |
| 32 | Profile Paused | `/agent/[agentId]` | `sJcOR` | `agent/[agentId]/page.tsx` |
| 33 | Offline Agent | `/chat/[agentId]` | `J6l3h` | `chat/[agentId]/page.tsx` |

### 可复用组件（Pencil 中的 reusable 节点）

| 组件 | Pencil nodeId | 对应代码 |
|------|:---:|---------|
| Button Primary | `OjdTt` | `components/ui/Button.tsx` (variant="primary") |
| Button Outline | `5jucT` | `components/ui/Button.tsx` (variant="secondary") |
| Avatar Agent | `HHdX9` | `components/ui/Avatar.tsx` (variant="agent") |
| Avatar Small | `TcSQ2` | `components/ui/Avatar.tsx` (size=36) |
| Avatar User | `yYpU6` | `components/ui/Avatar.tsx` (variant="user") |
| Input Field | `3X9H4` | `components/ui/Input.tsx` |
| TopBar | `XjPhS` | `components/ui/TopBar.tsx` |
| TabBar | `Rzvbh` | `components/ui/TabBar.tsx` |

---

## 已知待修的 MEDIUM + LOW 问题（顺手修掉）

| ID | 问题 | 影响范围 | 修复方式 |
|----|------|---------|---------|
| ME-001 | 代码块背景色 #333 → #2D2D2D | `/docs` | 使用 `var(--color-charcoal)` |
| ME-002 | TopBar 高度不一致（56/65 vs 50px） | `/docs`, `/` | 统一 `var(--topbar-height)` 50px |
| ME-003 | Docs 侧边栏非 sticky | `/docs` | 加 `position: sticky; top: 50px` |
| ME-004 | Input 框缺少自定义样式 | `/login`, `/signup`, `/claim` | 按 design-tokens 添加 border/radius |
| ME-005 | Verify 页 email 为空 | `/verify` | 从 URL query param 获取 |
| ME-006 | Pricing 移动端响应式 | `/pricing` | 添加 mobile 断点单列 |
| ME-007 | Chat 注册链接字号 11→12px | `/chat/[agentId]` | 改 fontSize |
| ME-008 | Dashboard CSS 变量硬编码 | Dashboard 布局 | 替换硬编码为 CSS 变量 |
| LO-001 | Nav 高度 65→64px | Landing Page | 微调 |
| LO-002 | Docs 侧边栏字号偏小 | `/docs` | 11→13px |
| LO-003 | Docs TOC 非 sticky | `/docs` | 加 sticky |
| LO-004 | 边框颜色 #E5E5E5 vs #E8E8E8 | Dashboard Sidebar | 统一 `var(--color-gray-border)` |

---

## 关键设计规则（铁律）

### 1. 颜色系统
永远使用 `design-tokens.css` 中的 CSS 变量，**绝不硬编码 hex**：
```css
/* ✅ 正确 */
color: var(--color-red);
background: var(--color-gray-100);
border-color: var(--color-gray-border);

/* ❌ 错误 */
color: #E24A3F;
background: #F5F5F5;
border-color: #E5E5E5;
```

### 2. 字体
- 主字体: Inter (`var(--font-primary)`)
- 代码块: JetBrains Mono (`var(--font-mono)`)

### 3. 图标
统一 lucide-react，尺寸和颜色严格按 Pencil 设计稿中的精确数值。

### 4. 间距
严格按 Pencil 设计稿的 padding/gap/margin 精确数值，使用 CSS 变量。

### 5. 圆角
```
按钮:   12px (--radius-lg)
卡片:   12-16px (--radius-lg ~ --radius-xl)
头像小: 6px (--radius-sm)
头像大: 16px (--radius-xl)
输入框: 8px (--radius-md)
```

### 6. 布局尺寸
```
Mobile: 固定 390px 宽、TopBar 50px、TabBar 50px
Web Dashboard: 三栏 80px + 320px + fill
Web Auth: 居中卡片 480px，渐变背景
按钮高度: Primary 50px, Outline 44px
输入框高度: 48px
```

### 7. 渐变背景（从 Pencil 提取的精确值）
```css
/* Landing Hero */
background: linear-gradient(180deg, #FFFFFF 0%, #FEF2F2 100%);

/* Web Auth 页面 */
background: linear-gradient(180deg, #FFFFFF 0%, #FEF2F2 40%, #FDF2F8 70%, #F0F9FF 100%);

/* Signup Brand Side */
background: linear-gradient(135deg, #F87171 0%, #FB7185 50%, #FDA4AF 100%);

/* Pricing */
background: linear-gradient(180deg, #FFFFFF 0%, #FEF2F2 40%, #FFF1F2 70%, #FAFAFA 100%);
```

---

## 注意事项

1. **不要修改任何业务逻辑**、API 调用、状态管理代码，只修改样式和布局
2. **不要删除现有功能**，只调整外观
3. 遇到不确定的地方，**从 Pencil 读取精确数值**（用 batch_get），不要猜测
4. 全程**不要问我确认**，直接按 Pencil 设计稿执行
5. 每个页面修改前，**先从 Pencil 获取截图和节点数据**再动手
6. CSS 变量已在 `web/src/app/globals.css` 中全局定义，可直接使用
7. Pencil 设计稿中的 `$red`、`$white` 等变量名对应 `design-tokens.css` 中的 `--color-red`、`--color-white` 等

---

## 提交规则

每修完一批页面（3-4 个），做一次 git commit：
```bash
cd web && npm run build              # 确认编译通过
git add -A
git commit -m "fix(ui): 精确还原 [页面名] 视觉设计"
```

全部修完后做最终提交：
```bash
git add -A
git commit -m "fix(ui): complete visual design restoration across all pages"
```
