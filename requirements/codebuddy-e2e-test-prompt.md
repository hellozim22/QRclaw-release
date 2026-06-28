# QRClaw 前端 E2E 测试指令

> **目标**: 使用 Playwright MCP Server 对 QRClaw 前端进行完整的 E2E 浏览器测试，对比设计稿规范，输出详细测试报告。
> **执行者**: CodeBuddy IDE Agent Team
> **项目路径**: `/Users/zeze/qrclaw`
> **前端路径**: `/Users/zeze/qrclaw/web`（Next.js 15 App Router）
> **本地地址**: `http://localhost:3000`

---

## 一、前置准备

### 1.1 确保服务运行

```bash
# 检查前端是否在运行
curl -s http://localhost:3000 > /dev/null && echo "Web OK" || echo "Web NOT running"

# 如未运行，启动前端
cd /Users/zeze/qrclaw/web && npm run dev
```

### 1.2 Playwright MCP Server 配置

确保你的 MCP 配置中已启用 Playwright Server，能力包括：
- `browser_navigate(url)` — 导航
- `browser_click(element, ref)` — 点击
- `browser_type(element, ref, text)` — 输入
- `browser_snapshot()` — 获取页面可访问性快照
- `browser_take_screenshot()` — 截图
- `browser_console_messages()` — 获取控制台消息
- `browser_resize(width, height)` — 调整视口
- `browser_evaluate(function)` — 执行 JS

### 1.3 核心参考文档（必读）

在开始测试前，**必须读取以下文件**获取设计规范：

```
Read("/Users/zeze/qrclaw/design/qrclaw-interaction-design.md")  # 39个页面的完整交互设计
Read("/Users/zeze/qrclaw/design/frontend-dev-guide.md")         # 组件规格和像素参数
Read("/Users/zeze/qrclaw/design/design-tokens.css")             # CSS 变量（颜色/字体/间距）
Read("/Users/zeze/qrclaw/design/pencil-new.pen")                # Pencil 设计稿源文件
```

---

## 二、Agent Team 分工

派出 **4 个 Agent** 并行测试，按功能模块划分：

### Agent 1: Landing & Marketing 测试员
负责测试：
- `/` (Landing Page)
- `/pricing` (定价页)
- `/docs` (文档页)
- Mobile viewport (375×812) 响应式测试

### Agent 2: Auth & Onboarding 测试员
负责测试：
- `/login` (登录页)
- `/signup` (注册页)
- `/verify` (邮箱验证页)
- `/claim/[token]` (Agent 认领页)
- Auth guard 重定向逻辑

### Agent 3: Dashboard & Management 测试员
负责测试：
- `/messages` (消息列表)
- `/qrcodes` (QR 码管理)
- `/qrcodes/create` (创建 QR)
- `/settings` (设置页)
- Dashboard 布局（三栏结构）

### Agent 4: Mobile & Chat 测试员
负责测试：
- `/m/messages` (Mobile 消息列表)
- `/m/me` (Mobile 个人中心)
- `/m/qrcodes` (Mobile QR 码列表)
- `/m/scan` (Mobile 扫码页)
- `/chat/[agentId]` (聊天页)
- `/agent/[agentId]` (Agent 资料页)
- 404 页面

---

## 三、测试维度（每个页面必须覆盖）

每个页面的测试必须包含以下 **6 个维度**：

### 维度 1: 页面可访问性 (Accessibility)
- 页面能否正常加载（HTTP 200）
- 标题是否正确
- 关键 heading/landmark 是否存在

### 维度 2: 控制台错误检查 (Console Errors)
- 调用 `browser_console_messages()` 检查是否有 JS 错误
- 重点关注：CSP 违规、Hydration 错误、InvariantError、未捕获异常
- 记录所有 ERROR 级别消息

### 维度 3: 交互功能测试 (Interactions)
- 所有按钮是否可点击且有响应
- 所有链接是否指向正确的 URL
- 表单输入是否可用
- 导航跳转是否正确
- 下拉菜单/模态框是否能打开

### 维度 4: 设计还原度对比 (Design Fidelity)
参照 `design/qrclaw-interaction-design.md` 和 `design/frontend-dev-guide.md` 中的规格，检查：

#### 颜色对比
使用 `browser_evaluate` 获取实际 CSS 计算值并与 `design-tokens.css` 对比：
```javascript
// 示例：检查按钮颜色
() => {
  const btn = document.querySelector('button');
  const style = getComputedStyle(btn);
  return {
    background: style.backgroundColor,
    color: style.color,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    height: style.height,
    borderRadius: style.borderRadius
  };
}
```

关键设计 Token 检查清单：
| Token | 期望值 | 用途 |
|-------|--------|------|
| `--color-red` | `#E24A3F` | 主按钮背景、品牌色 |
| `--color-gray-800` | `#333333` | 主文字色 |
| `--color-gray-500` | `#999999` | 次要文字色 |
| `--color-gray-border` | `#E8E8E8` | 边框色 |
| `--color-white` | `#FFFFFF` | 白色背景 |
| `--color-red-bg` | `#FEF5F4` | 浅红背景 |

#### 布局结构对比
- 组件尺寸是否与设计稿一致（按钮高度50px/44px、输入框48px等）
- 间距是否合理
- 字体大小、粗细是否与设计稿一致

#### 组件规格对比
以下组件需要精确检查（参照 `frontend-dev-guide.md` §二）：

| 组件 | 期望规格 |
|------|---------|
| Button Primary | 高50px, 圆角12px, 背景#E24A3F, 文字Inter 600 16px 白色 |
| Button Outline | 高44px, 圆角12px, 白色背景, 1px #E8E8E8 边框 |
| Input | 高48px, 圆角12px, 1px #E8E8E8 边框, placeholder #AAAAAA |
| TopBar | 高50px, 白色背景, 标题Inter 600 16px |
| TabBar | 高50px, 白色背景, 上边框1px |
| Avatar Agent | 圆角方形(radius 20px+), 图片填充 |

### 维度 5: 响应式测试 (Responsive)
每个公开页面在两种视口下测试：
- **Desktop**: 1440×900 (或 1024×768)
- **Mobile**: 375×812 (iPhone)

### 维度 6: 图片/资源加载 (Assets)
- 所有 `<img>` 标签是否正确加载（无 broken image）
- Logo/图标是否显示正确
- 使用 `browser_evaluate` 检查：
```javascript
() => {
  const images = document.querySelectorAll('img');
  return Array.from(images).map(img => ({
    src: img.src,
    alt: img.alt,
    naturalWidth: img.naturalWidth,
    broken: img.naturalWidth === 0
  }));
}
```

---

## 四、具体页面测试用例

### 4.1 Landing Page (`/`)

**设计参照**: `qrclaw-interaction-design.md` → Web-LandingPage (nodeId: tD9CD)

| 测试项 | 期望行为 | 检查方法 |
|--------|---------|---------|
| Nav 加载 | 显示 QRClaw Logo + Features/Pricing/Docs + Log In/Sign Up | snapshot |
| Logo 点击 | 返回首页 `/` | click → check URL |
| "Features" 链接 | 滚动到 `#features` 段落 | click → check scroll |
| "Pricing" 链接 | 导航到 `/pricing` | click → check URL |
| "Docs" 链接 | 导航到 `/docs` | click → check URL |
| "Log In" 按钮 | 导航到 `/login` | click → check URL |
| "Sign Up" 按钮 | 导航到 `/signup` | click → check URL |
| Hero 标题 | "Give your AI Agent a QR Code" | snapshot text |
| "Get Started Free" 按钮 | 导航到 `/signup` | click → check URL |
| "Learn More" 按钮 | 滚动到 features 区域 | click → check scroll |
| How It Works | 显示 01/02/03 三个步骤 | snapshot |
| Why QRClaw | 显示 4 张功能卡片 | snapshot |
| Subscribe 表单 | 输入框可输入，Subscribe 按钮可点击 | type + click |
| Footer 链接 | Terms/Privacy/Docs/Contact 指向正确 URL | snapshot hrefs |
| Mobile 汉堡菜单 | 375px 宽度下显示汉堡图标，点击展开菜单 | resize + click |
| CSP 错误 | 不应有 script-src 违规 | console_messages |
| JS Hydration | 不应有 InvariantError | console_messages |

**设计还原检查**:
- Hero 背景: 线性渐变 `#FFFFFF → #FEF2F2`
- 主按钮: 背景 `#E24A3F`, 高度 50px, 圆角 12px
- 描边按钮: 白色背景, 1px `#E8E8E8` 边框, 高度 44px
- Nav 高度: 64px, 毛玻璃效果 (`backdrop-filter: blur(20px)`)
- 字体: 标题 48px 700, 副标题 15px, 按钮文字 16px

### 4.2 Login Page (`/login`)

**设计参照**: `qrclaw-interaction-design.md` → Mobile-Login (nodeId: 9nzBk)

| 测试项 | 期望行为 |
|--------|---------|
| 页面加载 | 显示 QRClaw Logo + "Sign in to your account" |
| Logo 图片 | 正确加载（不是 broken image） |
| Email 输入 | 可输入、有 placeholder "Email address" |
| Password 输入 | 可输入、有 placeholder "Password"、type=password |
| "Sign In" 按钮 | 点击后应提交表单（检查 network 或 console） |
| 空表单提交 | 应显示验证错误提示 |
| "Sign Up" 链接 | 导航到 `/signup` |
| CSP 错误 | 检查 console |

### 4.3 Signup Page (`/signup`)

**设计参照**: `qrclaw-interaction-design.md` → Mobile-SignUp / Web-SignUp

| 测试项 | 期望行为 |
|--------|---------|
| 双栏布局 | 左侧品牌宣传 + 右侧表单（Desktop） |
| "Back" 返回 | 点击返回上一页 |
| 三个输入框 | Email + Password + Confirm Password |
| Password 不匹配 | 应显示错误提示 |
| "Sign Up" 按钮 | 提交表单 |
| "Sign In" 链接 | 导航到 `/login` |

### 4.4 Verify Page (`/verify`)

| 测试项 | 期望行为 |
|--------|---------|
| 邮件图标 | 显示（使用 lucide Mail 图标） |
| 验证码输入 | 可输入 |
| "Verify Email" 按钮 | 点击提交 |
| "Sign In" 链接 | 导航到 `/login` |

### 4.5 Pricing Page (`/pricing`)

**设计参照**: `qrclaw-interaction-design.md` → Web-Pricing (nodeId: UZFlP)

| 测试项 | 期望行为 |
|--------|---------|
| 三个定价卡 | Starter Free / Pro / Max |
| Starter 按钮 | "On Starter Free"（可点击） |
| Pro 按钮 | "Coming Soon"（disabled） |
| Max 按钮 | "Coming Soon"（disabled） |
| Pro 标签 | "Coming Soon · Recommended" |
| 价格显示 | $0 / $9.9 / $29.9 |
| 功能列表 | 每个卡片 7 个功能项，✓ 表示可用 |

### 4.6 Docs Page (`/docs`)

**设计参照**: Web-DocsPage (nodeId: aiwB4)

| 测试项 | 期望行为 |
|--------|---------|
| 三栏布局 | 左侧导航 + 中间内容 + 右侧目录 |
| 左侧分类 | Getting Started / Core Concepts / API Reference / Guides |
| 侧边导航点击 | 各链接可点击（即使是 mock 内容） |
| "On This Page" 目录 | 右侧显示当前页面锚点 |
| 代码块 | 显示语法高亮 |

### 4.7 Dashboard 页面 (需要认证)

| 测试项 | 期望行为 |
|--------|---------|
| `/messages` 未登录 | 重定向到 `/login` |
| `/qrcodes` 未登录 | 重定向到 `/login` |
| `/settings` 未登录 | 重定向到 `/login` |
| Auth Guard | 所有 dashboard 路由正确保护 |

### 4.8 Mobile Pages

#### `/m/messages`
| 测试项 | 期望行为 |
|--------|---------|
| 消息列表 | 显示消息卡片（头像 + 名称 + 预览 + 时间） |
| 头像图片 | 不应显示 broken image |
| 未读计数 | 红色圆形 badge |
| TabBar | 底部显示 Messages + Me 两个 tab |
| Messages tab 点击 | 保持当前页面（已选中态） |
| Me tab 点击 | 导航到 `/m/me` |
| 消息卡片点击 | 应进入聊天页 `/m/chat/[id]` |

#### `/m/me`
| 测试项 | 期望行为 |
|--------|---------|
| 用户信息 | 显示头像(灰色圆形)+名称+邮箱 |
| 菜单列表 | Share / My QR Codes / Help / Terms & Privacy / Sign Out |
| My QR Codes | 右侧显示 badge 数字 |
| 各行点击 | 应有跳转（QR Codes → `/m/qrcodes`） |
| Sign Out | 红色文字 |
| TabBar | 底部 tab 栏正确 |

#### `/m/qrcodes`
| 测试项 | 期望行为 |
|--------|---------|
| 返回按钮 | 左上角 `<` 返回上一页 |
| QR 码列表 | 每张卡片: 头像 + 名称 + 状态 badge + Agent 名 + 扫描次数 |
| 状态 badge | Active=绿色, Revoked=灰色 |
| 头像图片 | 不应显示 broken image |

#### `/m/scan`
| 测试项 | 期望行为 |
|--------|---------|
| 扫码框 | 黑色背景 + 红色方框对准区 |
| 关闭按钮 | 右上角 X 按钮 |
| Album 按钮 | 底部"相册"按钮 |
| Flash 按钮 | 底部"闪光灯"按钮 |
| 提示文字 | "Align QR code within the frame" |

### 4.9 Chat Page (`/chat/[agentId]`)

**设计参照**: Mobile-Chat (nodeId: IgH0g)

| 测试项 | 期望行为 |
|--------|---------|
| TopBar | 返回箭头 + Agent 名称 |
| 消息区域 | 灰色背景区域 |
| 注册提示 | 粉色横幅 "Sign up to save chats & access history" |
| 输入框 | "Type a message..." placeholder |
| 发送按钮 | 红色圆形按钮 |
| 输入框状态 | 当前是否 disabled（连接未建立时应 disabled） |

### 4.10 Agent Profile (`/agent/[agentId]`)

**设计参照**: Mobile-Profile (nodeId: e1DDM)

| 测试项 | 期望行为 |
|--------|---------|
| 红色渐变头部 | 上方红色渐变背景区域 |
| Agent 头像 | 大图头像（应正确加载，不是 broken） |
| Agent 名称 | 粗体白色文字 |
| 对话统计 | "X conversations" 白色文字 |
| 描述文字 | 灰色描述段落 |
| "Message" 按钮 | 红色大按钮，应跳转到 `/chat/[agentId]` |
| 注册引导 | "Sign in to save your conversations" |
| 底部 | "Powered by QRClaw" + Privacy/Terms |

### 4.11 Claim Page (`/claim/[token]`)

| 测试项 | 期望行为 |
|--------|---------|
| 品牌标识 | QRClaw Logo |
| 标题 | "Sign Up & Claim Agent" |
| Token 展示 | 黄色 banner 显示 "Agent: [token]" |
| 表单 | Email + Password |
| 提交按钮 | "Sign Up & Claim Agent" |
| 登录链接 | "Already have an account? Log In" |

### 4.12 404 Page

**设计参照**: Mobile-404 (nodeId: k0nbt)

| 测试项 | 期望行为 |
|--------|---------|
| 访问不存在的路由 | 显示 404 页面 |
| Logo | QRClaw Logo（不应 broken） |
| 标题 | "Page Not Found" |
| 描述 | 说明文字 |
| "Go Home" 按钮 | 点击跳转到 `/` |

---

## 五、已知问题预警（从初步测试发现）

以下问题已在初步手工测试中发现，Agent Team 需要**确认并详细记录**：

### 5.1 致命问题 (CRITICAL)
1. **CSP 阻止 JS Hydration**: `next.config.ts` 中 `script-src 'self'` 阻止了所有 Next.js 内联脚本，导致：
   - 所有 `onClick` 事件处理器从未挂载
   - 所有按钮点击无响应（Log In、Sign Up、Get Started Free、Learn More 等）
   - Mobile 汉堡菜单无法展开
   - 表单无法提交
   - Console 报 9+ 个 CSP 违规错误 + InvariantError

### 5.2 严重问题 (HIGH)
2. **导航按钮使用 `button + onClick` 而非 `<Link>`**: Log In、Sign Up、Get Started Free 等导航类元素使用 `<Button onClick={() => router.push()}>` 而非 `next/link`，导致：
   - 无法右键"新标签页打开"
   - 无预取 (prefetch)
   - SEO 不友好
3. **多处图片损坏 (Broken Images)**: Login 页 Logo、Mobile 页面头像、Agent Profile 头像、404 页面 Logo 均显示为 broken image
4. **Footer 占位链接**: Terms/Privacy/Contact 的 `href="#"` 不做任何事

### 5.3 中等问题 (MEDIUM)
5. **Mobile TabBar 点击无响应**: Me tab、Messages tab 点击不跳转（CSP 连锁问题）
6. **Chat 页面输入框永久 disabled**: 无法输入消息
7. **"Learn More" 按钮使用 JS scrollIntoView 而非 `<a href="#features">`**

---

## 六、测试输出要求

### 6.1 输出目录结构

所有测试结果必须输出到 `/Users/zeze/qrclaw/test-results/` 目录：

```
test-results/
├── README.md                           # 测试总览报告
├── summary.json                        # 机器可读的结构化测试结果
├── screenshots/                        # 每个页面的实际截图
│   ├── desktop/
│   │   ├── landing-page.png
│   │   ├── login.png
│   │   ├── signup.png
│   │   ├── verify.png
│   │   ├── pricing.png
│   │   ├── docs.png
│   │   ├── claim.png
│   │   ├── agent-profile.png
│   │   ├── chat.png
│   │   └── 404.png
│   └── mobile/
│       ├── landing-page-mobile.png
│       ├── messages.png
│       ├── me.png
│       ├── qrcodes.png
│       ├── scan.png
│       └── chat-mobile.png
├── console-errors/                     # 每个页面的控制台错误
│   ├── landing-page-errors.txt
│   ├── login-errors.txt
│   └── ...
├── design-comparison/                  # 设计对比报告
│   ├── color-audit.md                  # 颜色对比（实际 vs Token）
│   ├── typography-audit.md             # 字体对比
│   ├── layout-audit.md                 # 布局尺寸对比
│   └── component-audit.md             # 组件规格对比
└── fix-list.md                         # 完整修复清单（供 Claude 使用）
```

### 6.2 `summary.json` 格式

```json
{
  "testDate": "2026-03-13",
  "totalPages": 18,
  "results": [
    {
      "page": "/",
      "name": "Landing Page",
      "status": "FAIL",
      "critical": 2,
      "high": 3,
      "medium": 1,
      "low": 0,
      "issues": [
        {
          "id": "LP-001",
          "severity": "CRITICAL",
          "category": "interaction",
          "title": "所有按钮不可点击",
          "description": "CSP script-src 'self' 阻止 JS hydration，onClick 事件未挂载",
          "expected": "点击 Sign Up 导航到 /signup",
          "actual": "点击无响应，URL 不变",
          "file": "web/next.config.ts",
          "fix": "添加 nonce 支持或在开发环境移除 CSP"
        }
      ]
    }
  ]
}
```

### 6.3 `fix-list.md` 格式

这是最重要的输出文件，Claude 将根据它进行修复。格式要求：

```markdown
# QRClaw 前端修复清单

## 统计
- CRITICAL: X 个
- HIGH: X 个
- MEDIUM: X 个
- LOW: X 个
- 总计: X 个

---

## CRITICAL 致命问题

### [CR-001] CSP 阻止 Next.js Hydration
- **影响范围**: 所有页面
- **文件**: `web/next.config.ts`
- **现象**: console 报 9+ CSP script-src 违规 + InvariantError
- **根因**: `script-src 'self'` 不允许内联脚本
- **修复建议**: 为 Next.js 配置 nonce-based CSP 或在 dev 环境使用 'unsafe-inline'
- **关联问题**: CR-002, HI-001, HI-002

### [CR-002] 所有 onClick 事件失效
- **影响范围**: 首页所有按钮、表单提交、Tab 切换
- **现象**: 点击按钮无任何响应
- **根因**: CSP 阻止导致 React hydration 失败，事件处理器未绑定
- **修复建议**: 修复 CR-001 后自动解决

---

## HIGH 严重问题

### [HI-001] 导航按钮应使用 <Link> 而非 <Button onClick>
- **影响范围**: 首页 Log In / Sign Up / Get Started Free
- **文件**: `web/src/components/landing/LandingPage.tsx` L152-L164, L280-L287
- **现象**: 按钮无法右键新标签页打开
- **修复建议**: 使用 next/link 的 Link 组件替代 onClick + router.push

（...更多条目...）
```

---

## 七、测试执行流程

### Step 1: 准备（5 min）
1. 读取 3 个设计规范文件
2. 创建 `test-results/` 目录结构
3. 确认前端服务可访问

### Step 2: 并行测试（每 Agent 各自执行）

**每个页面的标准测试流程**:
```
1. browser_navigate(url)
2. browser_take_screenshot() → 保存到 screenshots/
3. browser_console_messages() → 保存到 console-errors/
4. browser_snapshot() → 检查页面结构和元素
5. 逐个测试交互（click, type, navigate）
6. browser_resize(375, 812) → 测试 mobile viewport
7. browser_take_screenshot() → 保存 mobile 截图
8. browser_evaluate() → 获取实际 CSS 值与 Token 对比
9. 记录所有发现的问题
```

### Step 3: 汇总（10 min）
1. 4 个 Agent 的测试结果合并
2. 生成 `summary.json`
3. 生成 `fix-list.md`（按严重程度排序、附修复建议）
4. 生成 `README.md` 测试总览
5. 生成 `design-comparison/` 下的各审计报告

### Step 4: 验证
1. 检查所有截图是否已保存
2. 检查 fix-list.md 是否完整覆盖所有问题
3. 确认每个 issue 都有可操作的修复建议

---

## 八、注意事项

1. **不要修复任何代码** — 只测试和记录，修复由 Claude 完成
2. **截图必须完整** — 每个页面至少 desktop + mobile 各一张
3. **Console 错误全量记录** — 不要遗漏任何 ERROR 级别消息
4. **设计对比要精确** — 使用 `browser_evaluate(getComputedStyle)` 获取实际值
5. **Issue ID 唯一** — 使用 `CR-001`, `HI-001`, `ME-001`, `LO-001` 格式
6. **关联问题标注** — 如果问题有因果关系，标注关联 ID
7. **每个 issue 必须有修复建议** — 指出具体文件和修改方向

---

## 九、快速启动指令（复制粘贴到 CodeBuddy）

```
你是 QRClaw 项目的 E2E 测试 Lead。请使用 Playwright MCP Server 对 http://localhost:3000 进行完整的前端功能测试和设计还原度审计。

必须先读取以下 3 个设计规范文件：
1. /Users/zeze/qrclaw/design/qrclaw-interaction-design.md（39 个页面的完整交互规格）
2. /Users/zeze/qrclaw/design/frontend-dev-guide.md（组件像素规格）
3. /Users/zeze/qrclaw/design/design-tokens.css（CSS 变量基准）

测试范围：所有 18 个前端路由页面（/、/login、/signup、/verify、/pricing、/docs、/claim/test-token、/agent/test-id、/chat/test-id、/messages、/qrcodes、/settings、/m/messages、/m/me、/m/qrcodes、/m/scan、不存在路由的 404）

每个页面必须测试 6 个维度：
① 页面加载和可访问性
② 控制台错误（CSP、Hydration、JS 异常）
③ 交互功能（按钮点击、表单提交、链接跳转、Tab 切换）
④ 设计还原度（颜色、字体、尺寸、间距 vs design-tokens.css）
⑤ 响应式（Desktop 1024×768 + Mobile 375×812）
⑥ 图片/资源加载（检查所有 img 的 naturalWidth 是否为 0）

要求：
- 每个页面截图保存到 /Users/zeze/qrclaw/test-results/screenshots/
- 每个页面的 console 错误保存到 /Users/zeze/qrclaw/test-results/console-errors/
- 使用 browser_evaluate + getComputedStyle 获取实际 CSS 值并与 Token 对比
- 所有 issue 按 CRITICAL/HIGH/MEDIUM/LOW 分级
- 输出完整修复清单到 /Users/zeze/qrclaw/test-results/fix-list.md
- 输出结构化 JSON 到 /Users/zeze/qrclaw/test-results/summary.json
- 不修改任何代码，只测试和记录

完整测试规范详见: /Users/zeze/qrclaw/requirements/codebuddy-e2e-test-prompt.md
```
