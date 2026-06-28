# Claude CLI 修复指引 — CRITICAL + HIGH 问题修复

> **生成时间**: 2026-03-13
> **数据来源**: CodeBuddy E2E 测试团队（4 Agent 并行测试 18 个页面）
> **测试报告**: `test-results/fix-list.md`（完整 24 issue）+ `test-results/README.md`（总览）
> **本轮目标**: 修复 CRITICAL 5 个 + HIGH 7 个 = 12 个阻塞性问题
> **验证方**: CodeBuddy（Playwright MCP 实时截图验证）

---

## 第零步：配置 Pencil MCP（可选但推荐）

在 `~/.claude/settings.json` 的 `mcpServers` 字段中添加：

```json
{
  "mcpServers": {
    "pencil": {
      "name": "pencil",
      "transport": "stdio",
      "command": "/Users/zeze/.codebuddycn/extensions/highagency.pencildev-0.6.32/out/mcp-server-darwin-arm64",
      "args": ["--app", "codebuddy_cn"],
      "env": {}
    }
  }
}
```

配置完成后重启 Claude CLI。验证：

```
# 在 Claude CLI 中执行：
mcp__pencil__batch_get(filePath: "design/pencil-new.pen")
```

如果返回设计节点数据，说明配置成功。

**Pencil MCP 的作用**：可以直接读取 `design/pencil-new.pen` 的精确节点数据（尺寸、颜色、间距、文字内容），比截图更精准。

---

## 第一步：组建 Agent Teams

请在 tmux 中启动 Claude CLI，然后粘贴以下 prompt：

```
我需要修复 QRClaw 前端的 12 个 CRITICAL + HIGH 级别问题，这些问题由 E2E 测试发现。

请阅读以下文件了解上下文：
1. `CLAUDE.md` — 项目总入口
2. `test-results/fix-list.md` — 完整修复清单（重点看 CRITICAL 和 HIGH 部分）
3. `test-results/README.md` — 测试总览
4. `design/frontend-dev-guide.md` — 前端开发指引（组件规格+页面布局）
5. `design/design-tokens.css` — CSS 变量定义

请创建一个 Agent Team 来修复这些问题：

### 团队结构：

**Teammate 1 — "csp-fixer"（CSP 修复专家）**
- 负责修复 [CR-001] CSP 阻塞 Next.js Hydration — 这是全站最严重的问题
- 修复 `web/next.config.ts` 中的 Content-Security-Policy 配置
- 推荐方案：使用 Next.js 内置的 nonce-based CSP（参考 Next.js 官方文档 Content Security Policy 章节）
- 修复后确保 18 个页面的 JS 交互全部恢复
- 自动解决 CR-002（onClick 失效）、CR-003（表单失效）、CR-004（Chat input disabled）、CR-005（异常重定向）
- 完成后运行：`cd web && npm run build` 确认无编译错误
- **Priority: P0，最先修复，其他 Teammate 等它完成**

**Teammate 2 — "frontend-links"（导航 + 链接修复）**
- 等 csp-fixer 完成后开始
- 修复 [HI-002] Landing Page 导航按钮用 `button+onClick` 而非 `<Link>`
  - 文件：`web/src/components/landing/LandingPage.tsx`
  - 将 `<button onClick={() => router.push('/login')}>` 改为 `<Link href="/login"><button>` 或直接用 Link 样式
  - 注意保留按钮样式，只是底层改用 `next/link`
  - 涉及按钮：Log In、Sign Up、Get Started、Learn More
- 修复 [HI-003] Claim 页 "Log In" 不是链接
  - 文件：`web/src/app/claim/[token]/page.tsx`
  - "Already have an account? Log In" → 改为 `<Link href="/login">Log In</Link>`
- 修复 [HI-004] Footer 占位链接 `href="#"`
  - 文件：`web/src/components/landing/LandingPage.tsx`
  - Terms → `/docs#terms` 或 `/terms`
  - Privacy → `/docs#privacy` 或 `/privacy`
  - Contact → `mailto:support@qrclaw.ai` 或 `/docs#contact`
- 完成后在文件里搜索 `router.push` 和 `onClick.*router`，确保没有遗漏

**Teammate 3 — "frontend-assets"（资源 + TabBar 修复）**
- 可与 Teammate 2 并行
- 修复 [HI-001] Logo 图片 `/qrclaw-logo-icon.png` 404
  - 方案 A（推荐）：检查 `web/public/` 是否有任何 logo 文件，如果有则创建正确的符号链接或复制
  - 方案 B：将所有引用 `qrclaw-logo-icon.png` 的组件改为 SVG inline（与 Signup 页面一致）
  - 搜索所有引用：`grep -r "qrclaw-logo-icon" web/src/`
  - 同时解决 [HI-007] Agent Profile 头像 broken
- 修复 [HI-005] TabBar 激活态颜色
  - 文件：`web/src/components/mobile/TabBar.tsx`
  - 当前两个 tab 都显示 `#333333`
  - 激活 tab 应为 `#E24A3F`（`var(--color-red)` 来自 `design/design-tokens.css`）
  - 检查 TabBar 的 active state 判断逻辑（路由匹配）
  - 参考设计截图：`design/layer/Component-TabBar.png`
- 修复 [HI-006] TabBar 在不应出现的页面出现
  - 文件：`web/src/app/m/layout.tsx`
  - `/m/qrcodes` 和 `/m/scan` 不应显示 TabBar
  - 对比设计截图 `design/layer/Mobile-MyQRCodes.png` 和 `design/layer/Mobile-ScanQR.png`
  - 添加路由条件判断，在这两个路由下隐藏 TabBar

### 工作约束：
- 所有 Teammate 先读 `CLAUDE.md` 了解项目三条铁律
- 所有前端修改必须使用 `design/design-tokens.css` 中的 CSS 变量，不允许硬编码颜色
- 使用 `next/link` 的 `<Link>` 组件而非 `router.push` 进行页面导航
- 每个 Teammate 修改前先读对应的设计截图 `design/layer/`
- 如有 Pencil MCP，可用 `mcp__pencil__get_screenshot` 获取最新设计截图对比
- 每个 Teammate 完成后简要报告修改的文件和行数
- **使用 tmux 分屏模式**
```

---

## 第二步：验证分工

修复完成后，通知我（CodeBuddy）做以下验证：

| 问题 | 验证方式 | 预期结果 |
|------|---------|---------|
| CR-001 CSP | 打开任意页面看 console | 0 CSP 错误 |
| CR-002~005 | 点击 Sign In/Sign Up 按钮 | 正常导航 |
| HI-001 Logo | 访问 /login，检查 logo | 图片正常显示 |
| HI-002 Links | 右键 "Log In" 按钮 | 出现"在新标签中打开" |
| HI-003 Claim | 访问 /claim/test | "Log In" 可点击跳转 |
| HI-004 Footer | Landing 页底部链接 | 不再是 `#` |
| HI-005 TabBar | 访问 /m/messages | 激活 tab 为红色 |
| HI-006 TabBar | 访问 /m/qrcodes | 不显示 TabBar |
| HI-007 Avatar | 访问 /agent/test | 头像正常 |

---

## 第三步：Pencil MCP 辅助（如已配置）

配置了 Pencil MCP 后，可以在修复过程中用以下命令获取精准设计数据：

```
# 获取 TabBar 组件的精确节点数据
mcp__pencil__batch_get(filePath: "design/pencil-new.pen", patterns: [{"name": "TabBar"}], readDepth: 3)

# 获取某个页面的截图对比
mcp__pencil__get_screenshot(filePath: "design/pencil-new.pen", nodeId: "<从 design/layer/INDEX.md 查找>")

# 获取设计变量
mcp__pencil__get_variables(filePath: "design/pencil-new.pen")
```

---

## 修复完成后

1. `git add -A && git commit -m "fix: resolve CRITICAL+HIGH issues from E2E test"`
2. 通知 CodeBuddy 做 Playwright 回归验证
3. 验证通过后进入 MEDIUM + LOW 级别修复

---

## 附录：12 个待修复 Issue 速查

| ID | 级别 | 摘要 | 关键文件 | 修复难度 |
|----|------|------|---------|---------|
| CR-001 | CRITICAL | CSP 阻塞 Next.js Hydration | `web/next.config.ts` | ⭐⭐⭐ |
| CR-002 | CRITICAL | onClick 全部失效 | 自动解决 | — |
| CR-003 | CRITICAL | 表单无法提交 | 自动解决 | — |
| CR-004 | CRITICAL | Chat input disabled | 自动解决 | — |
| CR-005 | CRITICAL | 异常重定向到 /pricing | 自动解决 | — |
| HI-001 | HIGH | Logo 404 | `web/public/` | ⭐ |
| HI-002 | HIGH | button+onClick 替代 Link | `LandingPage.tsx` | ⭐⭐ |
| HI-003 | HIGH | Claim "Log In" 非链接 | `claim/[token]/page.tsx` | ⭐ |
| HI-004 | HIGH | Footer href="#" | `LandingPage.tsx` | ⭐ |
| HI-005 | HIGH | TabBar 激活色 | `TabBar.tsx` | ⭐⭐ |
| HI-006 | HIGH | TabBar 条件隐藏 | `m/layout.tsx` | ⭐⭐ |
| HI-007 | HIGH | Agent 头像 broken | 同 HI-001 | — |

> ⭐ = 简单（< 30 分钟），⭐⭐ = 中等（30-60 分钟），⭐⭐⭐ = 需谨慎（CSP 配置影响全站）
