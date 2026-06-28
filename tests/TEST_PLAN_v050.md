# QRClaw v0.5.0 — 完整测试手册（ECC 标准）

> 每个测试用例都从用户视角出发，包含：前置条件、操作步骤、预期结果、检查项。
> 覆盖正常路径 + 异常路径 + 边界情况。

---

## 环境信息

| 项目 | 地址 |
|------|------|
| 网站 | https://qrclaw-test.vercel.app |
| Gateway | https://gateway-test.qrclaw.ai |
| Gateway WS | wss://gateway-test.qrclaw.ai/ws |

**测试账号**: `454160100@qq.com` / `Qrclaw2026!`

**数据库现有数据**:

| 类型 | 名称 | ID | 状态 |
|------|------|-----|------|
| Agent | E2E Test Agent | `5619742f-130d-4f1c-a27e-77da5bba7439` | active |
| Agent | Echo Agent | `a26c6cf5-4eff-4d9f-aae7-45cf9a061712` | active |
| QR Code | echo-agent-test-qr → Echo Agent | `c11f9a48-...` | active |
| QR Code | e2etestqrcode01 → E2E Test Agent | `47472d0f-...` | active |
| Conversation | 1 条 (E2E Test Agent) | `be0be967-...` | message_count: 0 |

---

# 一、注册 & 登录流程

## 1.1 新用户注册（正常流程）

**前置**: 未登录，打开隐身窗口

1. 访问 https://qrclaw-test.vercel.app/signup
2. 看到注册页面：左侧品牌区（桌面端可见），右侧注册表单
3. 页面应包含三个输入框：Email、Password、Confirm Password
4. 输入一个新的测试邮箱（如 `test-new-xxx@qq.com`）
5. 在 Password 输入 `Test2026!`
6. 在 Confirm Password 输入 `Test2026!`
7. 点击注册按钮

**预期**:
- [ ] 跳转到 `/verify?email=test-new-xxx@qq.com`
- [ ] Verify 页面显示邮件图标和 "Check your email" 提示
- [ ] 提示内容包含你输入的邮箱地址

## 1.2 注册 — 密码太短

1. 在注册页面输入邮箱 `short@test.com`
2. Password 输入 `12345`（少于 6 位）
3. Confirm Password 输入 `12345`
4. 点击注册按钮

**预期**:
- [ ] 不跳转，停留在注册页
- [ ] 显示错误信息 "Password must be at least 6 characters"

## 1.3 注册 — 密码不匹配

1. 在注册页面输入邮箱 `mismatch@test.com`
2. Password 输入 `Test2026!`
3. Confirm Password 输入 `Different123`
4. 点击注册按钮

**预期**:
- [ ] 不跳转
- [ ] 显示错误信息 "Passwords do not match"

## 1.4 注册 — 已注册的邮箱

1. 在注册页面输入已有的 `454160100@qq.com`
2. Password / Confirm Password 都输入 `Test2026!`
3. 点击注册按钮

**预期**:
- [ ] 显示错误提示（如 "User already registered" 或跳转到 verify 但不会发新邮件）

## 1.5 Verify 页面 — 重新发送验证邮件

1. 在 `/verify?email=454160100@qq.com` 页面
2. 找到并点击 "Resend" 按钮

**预期**:
- [ ] 按钮显示 loading 状态
- [ ] 提示已重新发送验证邮件

## 1.6 Verify 页面 — 无邮箱参数直接访问

1. 直接访问 https://qrclaw-test.vercel.app/verify （不带 ?email 参数）

**预期**:
- [ ] 页面正常渲染，不崩溃
- [ ] 可能显示空的邮箱信息或默认提示

## 1.7 正常登录

1. 访问 https://qrclaw-test.vercel.app/login
2. 输入 `454160100@qq.com`
3. 输入 `Qrclaw2026!`
4. 点击 **Sign In**

**预期**:
- [ ] 按钮显示 loading 状态
- [ ] 1-3 秒后跳转到 `/messages`
- [ ] 左侧出现导航栏（Messages / My QRcode / Settings）
- [ ] 浏览器控制台无错误

## 1.8 登录 — 错误密码

1. 输入正确邮箱 `454160100@qq.com`
2. 输入错误密码 `wrongpassword`
3. 点击 **Sign In**

**预期**:
- [ ] 不跳转，停留在登录页
- [ ] 显示错误提示 "Invalid login credentials"

## 1.9 登录 — 空邮箱

1. 不输入邮箱，只输入密码
2. 点击 **Sign In**

**预期**:
- [ ] 不跳转
- [ ] 显示验证错误信息

## 1.10 登录 — 空密码

1. 只输入邮箱，不输入密码
2. 点击 **Sign In**

**预期**:
- [ ] 不跳转
- [ ] 显示验证错误信息

## 1.11 已登录用户访问登录页

1. 已登录状态下
2. 在地址栏输入 https://qrclaw-test.vercel.app/login

**预期**:
- [ ] 自动重定向到 `/messages`

## 1.12 已登录用户访问注册页

1. 已登录状态下
2. 在地址栏输入 https://qrclaw-test.vercel.app/signup

**预期**:
- [ ] 自动重定向到 `/messages`

## 1.13 退出登录

1. 进入 `/settings`
2. 点击 **Log Out**

**预期**:
- [ ] 跳转到 `/login`
- [ ] 再访问 `/messages` → 被重定向到 `/login`

---

# 二、受保护页面访问控制

**前置**: 未登录（隐身窗口或已退出）

## 2.1 未登录访问 /messages

1. 访问 https://qrclaw-test.vercel.app/messages

**预期**:
- [ ] 被重定向到 `/login`

## 2.2 未登录访问 /qrcodes

1. 访问 https://qrclaw-test.vercel.app/qrcodes

**预期**:
- [ ] 被重定向到 `/login`

## 2.3 未登录访问 /settings

1. 访问 https://qrclaw-test.vercel.app/settings

**预期**:
- [ ] 被重定向到 `/login`

## 2.4 未登录访问 /qrcodes/create

1. 访问 https://qrclaw-test.vercel.app/qrcodes/create

**预期**:
- [ ] 被重定向到 `/login`

---

# 三、Dashboard — 左侧导航栏

**前置**: 已登录

## 3.1 导航栏结构

1. 登录后进入任意 Dashboard 页面

**检查**:
- [ ] 最左侧是窄导航栏（约 80px 宽）
- [ ] 顶部有 QRClaw logo 图标
- [ ] 下方依次有 3 个导航项（图标 + 文字）：
  1. Messages（聊天气泡图标）
  2. My QRcode（二维码图标）
  3. Settings（用户图标）

## 3.2 导航栏激活状态

1. 点击 **Messages**

**预期**:
- [ ] Messages 图标+文字变为红色
- [ ] Messages 导航项有浅红色背景
- [ ] 其他两个导航项为灰色

2. 点击 **My QRcode**

**预期**:
- [ ] My QRcode 变为红色高亮
- [ ] Messages 恢复为灰色

3. 点击 **Settings**

**预期**:
- [ ] Settings 变为红色高亮
- [ ] 其他恢复为灰色

## 3.3 导航栏跳转

1. 依次点击每个导航项

**预期**:
- [ ] Messages → URL 变为 `/messages`，中间列标题 "Messages"
- [ ] My QRcode → URL 变为 `/qrcodes`，中间列标题 "My QRcode"
- [ ] Settings → URL 变为 `/settings`，页面标题 "Settings"

---

# 四、Messages 页面

**前置**: 已登录，在 `/messages`

## 4.1 页面加载

1. 进入 `/messages`

**检查**:
- [ ] 页面正常加载，不白屏
- [ ] F12 → Console → 无红色 HTTP 400 错误
- [ ] 中间列（约 320px）顶部标题 "Messages"
- [ ] 右侧区域显示 "Select a conversation to start chatting"

## 4.2 有对话 — 列表显示

1. 如果列表中有对话

**检查**（每一行）:
- [ ] 左侧有 Agent 头像（圆形）
- [ ] Agent 名称正常显示（如 "E2E Test Agent"），不是 `undefined` 或空
- [ ] 右侧有时间戳（如 "1d ago"、"2h ago"）
- [ ] 下方有最后一条消息预览（可能为空）

## 4.3 无对话 — 空状态

1. 如果列表为空

**预期**:
- [ ] 显示 "No conversations yet"

## 4.4 选择对话

1. 点击列表中的一条对话

**预期**:
- [ ] 该行背景变为浅红色
- [ ] 右侧面板切换为聊天视图：
  - 顶部：Agent 头像 + 名称
  - 中间：消息区域（显示 "Messages will appear here"）
  - 底部：输入框 + 红色发送按钮

## 4.5 切换对话

1. 如果有多条对话，点击另一条

**预期**:
- [ ] 高亮切换到新选中的行
- [ ] 右侧面板的 Agent 名称更新

## 4.6 输入框交互

1. 在底部输入框中输入文字

**检查**:
- [ ] 输入框可以正常输入
- [ ] placeholder 显示 "Type a message..."
- [ ] 发送按钮是红色圆形（箭头图标）

---

# 五、QR Codes 页面

**前置**: 已登录，在 `/qrcodes`

## 5.1 页面加载 & 统计卡片

1. 进入 `/qrcodes`

**检查**:
- [ ] F12 Console 无 400 错误
- [ ] 中间列标题 "My QRcode" + 红色 **Create** 按钮
- [ ] 4 个统计卡片：
  - 🤖 Agents — 显示 `2`（红色图标，浅红背景）
  - 📱 QR Codes — 显示 `2`（紫色图标）
  - 📊 Scans — 显示 `0`（琥珀色图标）
  - 💬 Chats — 显示 `0`（绿色图标）

## 5.2 QR Code 列表

1. 向下看列表区域

**检查**（每行）:
- [ ] 左侧有 Agent 头像
- [ ] 名称显示正确（如 "Echo Agent"），不是 `undefined`
- [ ] 状态标签：绿色 "Active" 或灰色 "Paused"
- [ ] 版本号：如 "v1"
- [ ] 右侧有 `>` 箭头图标

## 5.3 默认选中 & 详情面板

1. 页面加载后（不点击任何项）

**预期**:
- [ ] 右侧面板自动显示第一个 QR Code 的详情

## 5.4 点击查看详情

1. 点击列表中的某个 QR Code

**右侧面板检查**:
- [ ] **顶部栏**: Agent 名称 + Active/Paused 状态标签
- [ ] **统计行**: 3 张小卡片
  - Total Scans: `0`
  - Conversations: `0`
  - Created: 相对时间（如 "1d"、"2w"）
- [ ] **QR 码卡片**:
  - 左上角：红色 Bot 图标 + Agent 名称 + slug
  - 中间：QR 码图标（占位图）
  - 底部："Scan the QR code to start a conversation."
- [ ] **URL 行**:
  - 显示一个 URL（格式：`https://qrclaw-test.vercel.app/agent/<agent-id>`）
  - 右侧有复制按钮
- [ ] **操作按钮行**: Download / Edit / Revoke 三个按钮
- [ ] **手机预览**（最右侧）:
  - 手机形状边框
  - 内含 Agent 头像、名称、"0 conversations"、slug、红色 Message 按钮
  - 底部 "Powered by QRClaw"

## 5.5 复制 URL

1. 点击 URL 行右侧的复制按钮

**预期**:
- [ ] URL 被复制到剪贴板
- [ ] 在新标签页粘贴并打开 → 显示 Agent Profile 页面

## 5.6 切换不同的 QR Code

1. 点击列表中的另一个 QR Code

**预期**:
- [ ] 右侧面板全部内容更新
- [ ] 名称、slug、URL 对应新选中的 QR Code

## 5.7 Download / Edit / Revoke 按钮

1. 分别点击这三个按钮

**检查**:
- [ ] Download — 是否触发下载？还是暂未实现？
- [ ] Edit — 是否跳转编辑页？还是暂未实现？
- [ ] Revoke — 是否弹出确认对话框？还是暂未实现？
- [ ] 记录实际行为

## 5.8 无 QR Code 时的空状态

（如果所有 QR Code 被删除/撤销后测试）

**预期**:
- [ ] 列表区域显示二维码图标 + "No QR codes yet. Create one to get started!"

---

# 六、创建 QR Code

**前置**: 已登录，在 `/qrcodes`

## 6.1 进入创建页面

1. 点击红色 **Create** 按钮

**预期**:
- [ ] 跳转到 `/qrcodes/create`
- [ ] 标题 "Create QR Code"
- [ ] 左上角有 ← 返回按钮
- [ ] 顶部 4 步进度条，第 1 步 "Select Agent" 高亮

## 6.2 Step 1 — 选择 Agent

**检查**:
- [ ] 显示 Agent 卡片列表
- [ ] 每张卡片：Agent 头像 + 名称 + 状态
- [ ] 所有 Agent 名称正常（不是 `undefined`）
- [ ] 底部 **Next** 按钮不可点击（灰色）

1. 点击 "Echo Agent" 卡片

**预期**:
- [ ] 卡片边框变红（选中）
- [ ] **Next** 按钮变为可点击

2. 换选 "E2E Test Agent"

**预期**:
- [ ] 之前选的变回灰色边框
- [ ] 新选的变红

3. 点击 **Next**

**预期**: 进入 Step 2

## 6.3 Step 2 — Customize

**检查**:
- [ ] 标题 "Customize QR Code"
- [ ] **Label** 输入框 — placeholder "e.g., Office Reception"
- [ ] **Description** 文本域 — placeholder "What is this QR code for?"
- [ ] 底部同时有 **Back** 和 **Next** 按钮

1. Label 输入：`前台客服码`
2. Description 输入：`放在前台给客户扫码咨询用`

**检查**:
- [ ] 中文输入正常
- [ ] 不输入也可以点 Next（Label 和 Description 都是可选的）

3. 点击 **Next**

**预期**: 进入 Step 3

## 6.4 Step 3 — Preview & 创建

**检查**:
- [ ] 显示 QR 码预览图（占位图）
- [ ] 显示名称 "前台客服码"
- [ ] 底部按钮文字为 **Create**（非 Next）
- [ ] 有 **Back** 按钮

1. 点击 **Back**

**预期**:
- [ ] 回到 Step 2，之前填的内容还在

2. 再次点 **Next** 回到 Step 3

3. 点击 **Create**

**预期**:
- [ ] 按钮变为 loading（旋转图标 + "Creating..."）
- [ ] 成功 → 进入 Step 4 成功页面
- [ ] 或失败 → 页面下方红色错误提示

> ⚠️ 创建调用 Supabase Edge Function `create-qrcode`，如果未部署会失败。

## 6.5 Step 4 — 成功（如果创建成功）

**检查**:
- [ ] 显示成功信息
- [ ] 显示新 QR Code 的 URL / slug
- [ ] 有复制按钮
- [ ] 底部按钮文字为 **Done**

1. 点击 **Done**

**预期**:
- [ ] 跳转到 `/qrcodes`
- [ ] 列表中有新创建的 QR Code

## 6.6 返回按钮

1. 进入 `/qrcodes/create`，不做操作
2. 点击左上角 **←** 按钮

**预期**:
- [ ] 返回 `/qrcodes`

## 6.7 Step 1 不选 Agent 直接点 Next

1. 进入 Step 1，不点击任何 Agent
2. 尝试点击 **Next**

**预期**:
- [ ] 按钮不可点击（disabled 状态）

---

# 七、Settings 页面

**前置**: 已登录

## 7.1 页面加载

1. 进入 `/settings`

**检查**:
- [ ] 标题 "Settings"
- [ ] **用户卡片**:
  - 红色圆形头像（显示名字首字母）
  - 用户名称
  - 邮箱 `454160100@qq.com`
  - 红色 "FREE" 标签
  - "Upgrade" 红色链接
- [ ] **菜单列表** 5 项：
  1. Edit Profile（人物图标，`>`）
  2. Change Password（锁图标，`>`）
  3. Subscription & Billing（信用卡图标，`>`）
  4. My Agents（机器人图标，`>` + 绿色标签如 "2 bound"）
  5. Log Out（红色文字，无 `>`）

## 7.2 点击 Upgrade

1. 点击 "Upgrade" 文字

**预期**:
- [ ] 跳转到 `/pricing`

## 7.3 点击 Edit Profile

1. 点击 "Edit Profile"

**预期**:
- [ ] 跳转到 `/settings/profile`
- [ ] 记录：显示的是设置子页面还是 404

## 7.4 点击 Change Password

1. 点击 "Change Password"

**预期**:
- [ ] 跳转到 `/settings/password`
- [ ] 记录实际效果

## 7.5 点击 Subscription & Billing

1. 点击该项

**预期**:
- [ ] 跳转到 `/settings/subscription`
- [ ] 记录实际效果

## 7.6 点击 My Agents

1. 点击 "My Agents"

**检查**:
- [ ] 绿色标签显示的数字与实际 Agent 数量一致（应为 `2 bound`）

**预期**:
- [ ] 跳转到 `/settings/agents`
- [ ] 记录实际效果

## 7.7 退出登录

1. 点击 **Log Out**

**预期**:
- [ ] 跳转到 `/login`
- [ ] 访问 `/messages` → 重定向回 `/login`

---

# 八、移动端页面

> 用手机浏览器，或电脑 F12 → 设备模拟器选 iPhone 14（390px）

## 8.1 /m/messages

1. 访问 https://qrclaw-test.vercel.app/m/messages

**检查**:
- [ ] 页面正常渲染
- [ ] 顶部标题栏
- [ ] 对话列表：每行有头像 + Agent 名称（不是 `undefined`）+ 时间
- [ ] 或空状态提示
- [ ] 底部有 TabBar（4 个标签图标）

## 8.2 /m/qrcodes

1. 访问 https://qrclaw-test.vercel.app/m/qrcodes

**检查**:
- [ ] QR Code 列表：每行有名称（不是 `undefined`）+ 状态点（绿/红）
- [ ] 或空状态

## 8.3 /m/scan

1. 访问 https://qrclaw-test.vercel.app/m/scan

**检查**:
- [ ] 页面正常渲染
- [ ] 显示扫码相关界面

## 8.4 /m/me

1. 访问 https://qrclaw-test.vercel.app/m/me

**检查**:
- [ ] 页面正常渲染
- [ ] 显示用户信息

## 8.5 TabBar 导航

1. 在任意移动端页面，逐个点击底部 TabBar 的 4 个标签

**检查**:
- [ ] 每个标签正确跳转到对应页面
- [ ] 当前页面对应的标签高亮

## 8.6 TabBar 在非 Dashboard 页面隐藏

1. 在手机上访问 `/chat/xxx` 或 `/agent/xxx`

**预期**:
- [ ] 底部不显示 TabBar

---

# 九、公开页面（无需登录）

## 9.1 Landing 首页

1. 隐身窗口访问 https://qrclaw-test.vercel.app

**检查**:
- [ ] 页面正常渲染
- [ ] 导航栏包含：Docs、Pricing、GitHub 链接
- [ ] 主视觉区域（Hero）有标题、描述、CTA 按钮
- [ ] CTA 按钮（Get Started / Sign Up）→ 点击跳转到 `/signup` 或 `/login`
- [ ] 页面底部 Footer：Terms、Privacy 链接可点

## 9.2 导航栏链接

1. 点击导航栏 **Docs**

**预期**: 跳转到 `/docs`

2. 点击 **Pricing**

**预期**: 跳转到 `/pricing`

3. 点击 **GitHub**

**预期**: 新窗口打开 GitHub 页面

## 9.3 Footer 链接

1. 滚到页面底部
2. 点击 **Terms**

**预期**: 跳转到 `/terms`

3. 点击 **Privacy**

**预期**: 跳转到 `/privacy`

## 9.4 Pricing 页面

1. 访问 `/pricing`

**检查**:
- [ ] 标题 "Pricing"
- [ ] 只有一张卡片：FREE 方案
- [ ] 列出免费方案的功能
- [ ] 有 "Pro & Max plans coming soon" 提示区域

## 9.5 Docs 页面

1. 访问 `/docs`

**检查**:
- [ ] 左侧有目录导航
- [ ] 右侧有文档内容
- [ ] 目录链接可点击，点击后页面滚动到对应章节

## 9.6 Terms 页面

1. 访问 `/terms`

**检查**:
- [ ] 显示 Terms of Service 内容
- [ ] 文字排版正常

## 9.7 Privacy 页面

1. 访问 `/privacy`

**检查**:
- [ ] 显示 Privacy Policy 内容
- [ ] 文字排版正常

## 9.8 404 页面

1. 访问一个不存在的 URL，如 https://qrclaw-test.vercel.app/asdfghjkl

**预期**:
- [ ] 显示 404 页面

---

# 十、Agent Profile & QR Code 跳转

## 10.1 Agent Profile 页面（直接访问）

1. 访问 https://qrclaw-test.vercel.app/agent/a26c6cf5-4eff-4d9f-aae7-45cf9a061712

**检查**:
- [ ] 显示 Echo Agent 的 Profile：
  - Agent 头像
  - Agent 名称 "Echo Agent"
  - 红色 **Message** 按钮
- [ ] 页面设计为移动端样式（居中窄版面）

## 10.2 Agent Profile — 点击 Message

1. 点击 **Message** 按钮

**预期**:
- [ ] 跳转到 `/chat/a26c6cf5-4eff-4d9f-aae7-45cf9a061712`
- [ ] 显示聊天页面

## 10.3 Agent Profile — 不存在的 Agent

1. 访问 https://qrclaw-test.vercel.app/agent/00000000-0000-0000-0000-000000000000

**预期**:
- [ ] 显示错误或 404 页面，不崩溃

## 10.4 /q/[slug] 跳转

> ⚠️ 已知问题：代码中 `SLUG_PATTERN = /^[a-zA-Z0-9]{12}$/`，要求 slug 必须是 12 位纯字母数字。但现有 slug（`echo-agent-test-qr` 和 `e2etestqrcode01`）不符合此格式。

1. 访问 https://qrclaw-test.vercel.app/q/e2etestqrcode01

**预期**（根据当前代码逻辑）:
- [ ] 返回 404（因为 slug 是 16 位，不匹配 12 位要求）
- [ ] 记录实际结果

2. 访问 https://qrclaw-test.vercel.app/q/echo-agent-test-qr

**预期**:
- [ ] 返回 404（因为包含 `-`，不匹配 `[a-zA-Z0-9]`）
- [ ] 记录实际结果

3. 如果上面都是 404，这是一个 **bug**，需要修复 slug 格式验证

---

# 十一、Claim 页面

## 11.1 Claim — 无效 Token

1. 访问 https://qrclaw-test.vercel.app/claim/invalid-token-xxx

**预期**:
- [ ] 页面显示 QRClaw logo
- [ ] 可能显示 loading → 然后显示错误信息
- [ ] 不崩溃

## 11.2 Claim — 非 UUID 格式

1. 访问 https://qrclaw-test.vercel.app/claim/hello

**预期**:
- [ ] 显示格式错误或 "Invalid claim token" 之类的提示

## 11.3 Claim — 正确格式但不存在

1. 访问 https://qrclaw-test.vercel.app/claim/12345678-1234-1234-1234-123456789012

**预期**:
- [ ] 显示 "Agent not found" 或类似错误

---

# 十二、Agent SDK 接入（终端操作）

> 需要在电脑终端操作。打开 3 个终端窗口。

## 12.1 启动 Gateway

**终端 1**:

```bash
cd ~/qrclaw/gateway
npm run dev
```

**预期输出**:
```
🚀 QRClaw Gateway listening on 0.0.0.0:3001
📡 WebSocket ready
✅ Redis connected
```

**检查**:
- [ ] 无红色错误
- [ ] Redis 连接成功

> 如果 Redis 报错：先运行 `brew services start redis` 或 `redis-server`

## 12.2 启动 Echo Agent

**终端 2**:

```bash
cd ~/qrclaw/scripts/agent-sdk
npm install     # 首次需要
npm run echo-agent
```

**预期输出**:
```
🤖 QRClaw Echo Agent starting...
🔄 Connection state: requesting_ticket
[...] Ticket obtained (expires in 30s)
🔄 Connection state: connecting
🔄 Connection state: connected
```

**检查**:
- [ ] 最终状态为 `connected`
- [ ] 无错误信息

## 12.3 Echo Agent 聊天测试

**前提**: 12.1 Gateway 运行中，12.2 Echo Agent connected

1. 浏览器访问 https://qrclaw-test.vercel.app/agent/a26c6cf5-4eff-4d9f-aae7-45cf9a061712
2. 点击 **Message**
3. 进入聊天页面
4. 输入 `你好` → 点击发送

**预期**:
- [ ] 消息 "你好" 显示在右侧（访客消息）
- [ ] 1-3 秒后收到 "Echo: 你好" 在左侧（Agent 消息）
- [ ] 终端 2 打印：`📨 Visitor says: "你好"` 和 `📤 Replied: "Echo: 你好"`

5. 发送 `Hello World`

**预期**:
- [ ] 收到 "Echo: Hello World"

6. 发送一条很长的消息（100+ 字符）

**预期**:
- [ ] 消息完整发送和接收，UI 不截断

## 12.4 OpenClaw AI Agent（可选）

1. 终端 2 按 `Ctrl+C` 停止 Echo Agent
2. 运行 `npm run openclaw-agent`
3. 重复 12.3 的聊天步骤

**检查**:
- [ ] Agent 回复是 AI 生成内容（非 Echo）
- [ ] 如果回复包含 Markdown，渲染正确（**粗体**、`代码`、列表）

---

# 十三、从零创建 Agent

## 13.1 运行 setup-agent

```bash
cd ~/qrclaw/scripts/agent-sdk
npm run setup-agent
```

交互式输入：
```
Agent name: 我的测试 Bot
Agent description:（回车跳过）
Owner email: 454160100@qq.com
```

**检查**:
- [ ] 输出 "Found user: 716bb133-..."
- [ ] 输出 "Agent created: <新 UUID>"
- [ ] 询问 "Create a QR code? (Y/n)"

输入 `Y`：
```
QR code label: 测试码
```

**检查**:
- [ ] Agent 创建成功
- [ ] QR Code 创建可能失败（脚本用了旧表名 `qr_codes`）→ 记录结果
- [ ] API Key 正常输出（`qrc_` 开头）
- [ ] **立即复制保存 API Key**

## 13.2 用新 Agent 连接

1. 编辑 `.env`，替换 `AGENT_API_KEY` 为新的 key
2. 运行 `npm run echo-agent`

**预期**:
- [ ] 连接成功，显示 `connected`

## 13.3 Dashboard 确认

1. 浏览器登录 → `/qrcodes`

**预期**:
- [ ] Agents 统计卡片数字增加（变为 3）
- [ ] 如果 QR Code 创建成功，QR Codes 数字也增加

2. 进入 `/settings`

**预期**:
- [ ] My Agents 标签数字更新

---

# 十四、浏览器行为

## 14.1 页面刷新

1. 在 `/messages` 页面按 F5

**预期**:
- [ ] 页面重新加载，数据正常显示
- [ ] 仍然是登录状态，不会跳到 `/login`

2. 在 `/qrcodes/create` Step 2（已填内容）按 F5

**预期**:
- [ ] 页面重新加载
- [ ] 之前填的内容丢失（回到 Step 1）— 记录实际行为

## 14.2 浏览器前进/后退

1. 登录后进入 `/messages`
2. 点导航进入 `/qrcodes`
3. 点浏览器 ← 后退按钮

**预期**:
- [ ] 回到 `/messages`

4. 点浏览器 → 前进按钮

**预期**:
- [ ] 回到 `/qrcodes`

---

# 测试结果记录表

| # | 测试项 | 结果 | 备注 |
|---|--------|------|------|
| **一、注册登录** | | | |
| 1.1 | 新用户注册 | ⬜ | |
| 1.2 | 密码太短 | ⬜ | |
| 1.3 | 密码不匹配 | ⬜ | |
| 1.4 | 已注册邮箱 | ⬜ | |
| 1.5 | 重发验证邮件 | ⬜ | |
| 1.6 | Verify 无参数 | ⬜ | |
| 1.7 | 正常登录 | ⬜ | |
| 1.8 | 错误密码 | ⬜ | |
| 1.9 | 空邮箱 | ⬜ | |
| 1.10 | 空密码 | ⬜ | |
| 1.11 | 已登录访问登录页 | ⬜ | |
| 1.12 | 已登录访问注册页 | ⬜ | |
| 1.13 | 退出登录 | ⬜ | |
| **二、访问控制** | | | |
| 2.1 | 未登录→messages | ⬜ | |
| 2.2 | 未登录→qrcodes | ⬜ | |
| 2.3 | 未登录→settings | ⬜ | |
| 2.4 | 未登录→create | ⬜ | |
| **三、导航栏** | | | |
| 3.1 | 结构完整 | ⬜ | |
| 3.2 | 激活状态 | ⬜ | |
| 3.3 | 跳转正确 | ⬜ | |
| **四、Messages** | | | |
| 4.1 | 页面加载 | ⬜ | |
| 4.2 | 列表显示 | ⬜ | |
| 4.3 | 空状态 | ⬜ | |
| 4.4 | 选择对话 | ⬜ | |
| 4.5 | 切换对话 | ⬜ | |
| 4.6 | 输入框 | ⬜ | |
| **五、QR Codes** | | | |
| 5.1 | 统计卡片 | ⬜ | |
| 5.2 | 列表显示 | ⬜ | |
| 5.3 | 默认选中 | ⬜ | |
| 5.4 | 详情面板 | ⬜ | |
| 5.5 | 复制 URL | ⬜ | |
| 5.6 | 切换 QR Code | ⬜ | |
| 5.7 | 操作按钮 | ⬜ | |
| 5.8 | 空状态 | ⬜ | |
| **六、创建 QR Code** | | | |
| 6.1 | 进入创建 | ⬜ | |
| 6.2 | Step 1 选 Agent | ⬜ | |
| 6.3 | Step 2 填信息 | ⬜ | |
| 6.4 | Step 3 预览创建 | ⬜ | |
| 6.5 | Step 4 成功 | ⬜ | Edge Function 可能未部署 |
| 6.6 | 返回按钮 | ⬜ | |
| 6.7 | 不选 Agent 点 Next | ⬜ | |
| **七、Settings** | | | |
| 7.1 | 页面加载 | ⬜ | |
| 7.2 | Upgrade 跳转 | ⬜ | |
| 7.3 | Edit Profile | ⬜ | |
| 7.4 | Change Password | ⬜ | |
| 7.5 | Subscription | ⬜ | |
| 7.6 | My Agents | ⬜ | |
| 7.7 | Log Out | ⬜ | |
| **八、移动端** | | | |
| 8.1 | /m/messages | ⬜ | |
| 8.2 | /m/qrcodes | ⬜ | |
| 8.3 | /m/scan | ⬜ | |
| 8.4 | /m/me | ⬜ | |
| 8.5 | TabBar 导航 | ⬜ | |
| 8.6 | TabBar 隐藏 | ⬜ | |
| **九、公开页面** | | | |
| 9.1 | Landing 首页 | ⬜ | |
| 9.2 | 导航栏链接 | ⬜ | |
| 9.3 | Footer 链接 | ⬜ | |
| 9.4 | Pricing | ⬜ | |
| 9.5 | Docs | ⬜ | |
| 9.6 | Terms | ⬜ | |
| 9.7 | Privacy | ⬜ | |
| 9.8 | 404 页面 | ⬜ | |
| **十、Agent Profile** | | | |
| 10.1 | Profile 页面 | ⬜ | |
| 10.2 | 点击 Message | ⬜ | |
| 10.3 | 不存在的 Agent | ⬜ | |
| 10.4 | /q/slug 跳转 | ⬜ | 已知 slug 格式 bug |
| **十一、Claim** | | | |
| 11.1 | 无效 token | ⬜ | |
| 11.2 | 非 UUID 格式 | ⬜ | |
| 11.3 | 正确格式不存在 | ⬜ | |
| **十二、Agent SDK** | | | |
| 12.1 | 启动 Gateway | ⬜ | |
| 12.2 | Echo Agent 连接 | ⬜ | |
| 12.3 | Echo 聊天 E2E | ⬜ | |
| 12.4 | OpenClaw AI | ⬜ | 可选 |
| **十三、创建 Agent** | | | |
| 13.1 | setup-agent | ⬜ | |
| 13.2 | 新 Agent 连接 | ⬜ | |
| 13.3 | Dashboard 确认 | ⬜ | |
| **十四、浏览器行为** | | | |
| 14.1 | 页面刷新 | ⬜ | |
| 14.2 | 前进/后退 | ⬜ | |

---

## 已知问题

| 编号 | 问题 | 影响 |
|------|------|------|
| BUG-1 | `/q/[slug]` 路由的 slug 格式验证 (`/^[a-zA-Z0-9]{12}$/`) 与现有 slug 不匹配 | 所有 `/q/xxx` 跳转返回 404 |
| BUG-2 | `setup-agent.ts` 创建 QR Code 使用旧表名 `qr_codes` + 旧字段 `label`/`scan_count`/`owner_id` | 脚本创建 QR Code 会 400 |
| LIMIT-1 | `create-qrcode` Edge Function 可能未部署 | Dashboard 创建 QR Code 会失败 |
| LIMIT-2 | Settings 子页面（profile/password/subscription/agents）可能未实现 | 点击后可能 404 |
| LIMIT-3 | `scan_count` 字段不存在，页面固定显示 0 | 视觉上不影响 |
| LIMIT-4 | `avatar_url` 字段不存在，使用默认生成头像 | 视觉上不影响 |
