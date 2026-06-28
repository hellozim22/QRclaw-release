# Code Review: ece5e7a — Legal Pages + Visual Restoration + Docs Optimization

**Commit**: `ece5e7a`
**日期**: 2026-03-26
**类型**: feat (新功能 + 视觉优化)
**影响范围**: Frontend — 法律页面、Landing Page、Docs、Auth 页面
**版本**: 0.4.5

---

## 背景

### 问题
1. Terms of Service 和 Privacy Policy 页面缺失，Footer 链接 `/terms` 返回 404
2. 首页导航栏滚动时跟随页面移动，未固定在顶部
3. Docs 页面 "What is QRClaw" 流程图使用抽象图标，用户难以理解
4. Sign In 页面缺少返回首页的入口
5. 注册页的 Terms/Privacy 法律提示不可点击，移动端被隐藏
6. 全站公开邮箱不统一（`support@`, `legal@`, `privacy@` 混用）
7. Discord 社区链接尚未准备好，不应公开展示

### 解决方案
- 新建 Terms / Privacy 页面，采用 Stripe/Notion 风格的共享法律页布局
- 重构首页为 `100dvh` + 可滚动内容区，彻底解决导航栏滚动问题
- 重做 Docs 流程图为场景化三步插图
- 补齐所有页面的返回首页入口和法律声明
- 统一全站公开邮箱为 `hello@qrclaw.ai`

---

## 变更文件清单

| # | 文件路径 | 类型 | 说明 |
|---|---------|------|------|
| 1 | `web/src/app/terms/page.tsx` | **新建** | Terms of Service 页面（19 条款，Notion 风格） |
| 2 | `web/src/app/privacy/page.tsx` | **新建** | Privacy Policy 页面（13 条款，Notion 风格） |
| 3 | `web/src/components/legal/LegalPageLayout.tsx` | **新建** | 共享法律页布局（sticky header、Terms/Privacy 切换、Legal 标签、正文卡片） |
| 4 | `web/src/components/landing/LandingPage.tsx` | 修改 | 100dvh 布局 + 可滚动内容区 + 移除 Discord + 移除语言下拉箭头 + 纯白导航栏 |
| 5 | `web/src/components/landing/Footer.tsx` | 修改 | 邮箱 `support@` → `hello@qrclaw.ai` |
| 6 | `web/src/components/docs/DocsPage.tsx` | 修改 | IllustQRFlow 重做为场景化插图 + 添加 Back to home 入口 |
| 7 | `web/src/app/(auth)/login/page.tsx` | 修改 | 新增 Back to home 链接 + Terms/Privacy 法律声明 |
| 8 | `web/src/app/(auth)/signup/page.tsx` | 修改 | Terms/Privacy 改为可点击链接，移动端可见 |
| 9 | `web/src/app/globals.css` | 修改 | 添加 `html, body { margin: 0; padding: 0; }` |

---

## 核心变更详解

### 1. Terms of Service (`/terms`)

19 条完整服务条款，Notion 风格语气：

| 条款 | 内容要点 |
|------|---------|
| §1 About these terms | 服务定义，主体为 "the team operating QRClaw" |
| §3 What QRClaw is | 平台定位：relay layer，不提供 AI 模型 |
| §5 Agent Owner responsibilities | Agent Owner 对内容、合规、隐私告知负全责 |
| §8 Third-party AI | 第三方 AI 免责切割 |
| §9 Data and privacy | 默认 relay + 授权后可分析消息内容 |
| §10 Ownership and licenses | 用户保留内容所有权，授予运营许可 |
| §12 Free today, paid features later | 当前免费，预留未来收费空间 |
| §14-15 Disclaimers + Liability | As-is 免责 + 责任上限 USD 100 |
| §16 Indemnity | 用户赔偿条款 |

### 2. Privacy Policy (`/privacy`)

13 条隐私政策，明确三方数据角色：

| 条款 | 内容要点 |
|------|---------|
| §1 Scope | QRClaw 为 controller（账户数据）或 processor（Agent 聊天数据） |
| §2.4 Messages | 默认不分析；用户启用分析功能后，仅在授权范围内处理 |
| §4 Legal bases | GDPR 兼容的处理依据 |
| §5 Things we do not do | 不卖数据、不训练 AI、不跟踪 Visitor |
| §6 When we share | 有限共享场景（服务商、法律、并购） |
| §8 Retention | 分层保留策略，支持删除请求 |

### 3. 共享法律页布局 (`LegalPageLayout.tsx`)

| 特性 | 实现 |
|------|------|
| Sticky header | 毛玻璃效果 + blur(16px) |
| 页面切换 | Pill 导航：Back to home / Terms / Privacy |
| Hero 区域 | Legal 标签 + 大标题 + 摘要 + 更新时间胶囊 |
| 正文卡片 | 白色圆角卡片 + 阴影，居中 760px |
| 移动端适配 | Header 换行 + nav 横向滚动 + 内容区缩窄 |
| 可访问性 | `aria-current="page"` 标注当前页 |

### 4. Landing Page 布局重构

| 问题 | 修复 |
|------|------|
| 导航栏随页面滚动 | 根容器 `100dvh` + `overflow: hidden`，内容在 `.landing-scroll` 里独立滚动 |
| 右侧 / 底部白条 | `html, body { margin: 0; padding: 0 }` + `width: 100%` |
| Discord 链接 | 从 NAV_LINKS 移除，清理未使用的 `MessageCircle` import |
| 语言下拉箭头 | 移除 `ChevronDown`，EN 改为静态标签 |
| 导航栏透底 | 背景从 `rgba(255,255,255,0.93)` 改为纯白 `#ffffff` |

### 5. Docs 页面优化

| 改动 | 说明 |
|------|------|
| IllustQRFlow 重做 | 三步场景化插图：QR 卡片 → 手机扫码 → 聊天界面 |
| QR 卡片 | 对齐首页官方风格（Bot 图标 + QrCode 图标） |
| 扫码场景 | 左侧 QR 立牌 + 右侧倾斜手机 + 扫描光线连接 |
| 聊天界面 | 迷你聊天 UI（Agent 头像 + 气泡 + 输入框） |
| Back to home | 左上角添加 `← Home` 入口，竖线分隔 Logo |

### 6. Auth 页面增强

| 页面 | 改动 |
|------|------|
| Login | 新增 `← Back to home` 链接 + Terms/Privacy 法律声明（可点击链接） |
| Signup | Terms/Privacy 文案改为 `<Link>`，移动端不再隐藏 |

### 7. 全站邮箱统一

所有公开邮箱统一为 `hello@qrclaw.ai`：
- `web/src/app/terms/page.tsx` — Contact 条款
- `web/src/app/privacy/page.tsx` — Contact 条款
- `web/src/components/landing/Footer.tsx` — Contact 链接

---

## 法律条款审查要点

| 审查项 | 状态 | 说明 |
|--------|------|------|
| 运营主体 | ✅ | "the team operating QRClaw"，不公开公司名称 |
| 消息分析边界 | ✅ | 默认不分析；用户授权后可处理消息内容 |
| 数据角色 | ✅ | Controller（账户）/ Processor（Agent 聊天数据） |
| 第三方 AI 免责 | ✅ | 平台不对第三方 AI 输出担保 |
| Agent Owner 责任 | ✅ | 包含隐私告知、合规、内容合法性 |
| 用户内容许可 | ✅ | 明确授权范围（host, store, transmit, reproduce, format） |
| Cookie 表述 | ✅ | 当前仅必要 Cookie；未来引入非必要时按法律处理 |
| 免费/收费 | ✅ | 当前免费，预留未来调整权 |
| Governing law | N/A | 按产品决策暂不写具体法域 |

---

## 部署指引

### 后端（腾讯云）
**不需要修改**。变更全在前端。

### 前端（Vercel）

```bash
git push origin main
```

**需更新的前端文件**:
- `web/src/app/terms/page.tsx` — 新页面
- `web/src/app/privacy/page.tsx` — 新页面
- `web/src/components/legal/LegalPageLayout.tsx` — 新组件
- `web/src/components/landing/LandingPage.tsx` — 布局重构
- `web/src/components/landing/Footer.tsx` — 邮箱更新
- `web/src/components/docs/DocsPage.tsx` — 插图 + 导航
- `web/src/app/(auth)/login/page.tsx` — Back to home + 法律声明
- `web/src/app/(auth)/signup/page.tsx` — 法律声明链接化
- `web/src/app/globals.css` — 全局 margin reset

### 验证步骤

1. 访问 `/terms` — 确认 19 条 Terms 正常渲染，头部有 Back to home / Terms / Privacy 切换
2. 访问 `/privacy` — 确认 13 条 Privacy 正常渲染，Privacy 按钮高亮
3. 首页滚动 — 确认导航栏固定不动，无右侧/底部白条
4. 首页导航 — 确认无 Discord 链接，EN 无下拉箭头
5. `/docs` — 确认 QR Flow 三步插图场景化，左上角有 ← Home
6. `/login` — 确认有 Back to home + Terms/Privacy 法律声明
7. `/signup` — 确认 Terms/Privacy 为可点击链接
8. Footer — 确认 Contact 链接为 `hello@qrclaw.ai`

---

## 测试结果

| 测试 | 结果 |
|------|------|
| TypeScript Lint | ✅ 零错误 |
| 桌面端验证 (1280px) | ✅ 所有页面正常 |
| 移动端验证 (390px) | ✅ 无横向溢出 |
| 法律条款审查 (2 轮) | ✅ 通过，无高优先级问题 |
| 代码审查 | ✅ APPROVED |
