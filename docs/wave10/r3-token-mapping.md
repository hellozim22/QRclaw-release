# Wave 10 R3 Token Mapping

> 日期：2026-04-28  
> SSoT：`design/design-tokens.css`  
> 范围：只把 `r2-ux-design-full.md` 中的 v2 / 对话专用 token 映射到现有 v1 token；不新增 token。

## 0. 结论

当前唯一可落地的设计 token SSoT 是 `design/design-tokens.css`。Wave 10 UI 实现必须使用其中已有的 `--color-*`、`--font-*`、`--space-*`、`--radius-*`、`--shadow-*`、布局尺寸 token，不能引用 `--surface-*`、`--text-*`、`--accent-*`、`--bubble-*`、`--code-*`、`--tool-call-*`、`--focus-ring` 等 R2 草案 token。

`r2-ux-review-补充.md` 的短期建议采用“当前红色品牌体系”，本轮按此执行：主 CTA / 激活态使用 `--color-red`，错误和破坏性动作使用 `--color-delete-red`，弱强调底色使用 `--color-red-bg`。

## 1. 当前 SSoT

`design/design-tokens.css` 当前定义的是 v1 命名空间：

| 类别 | Wave 10 实现可用 token |
|---|---|
| 品牌色 | `--color-red`、`--color-red-dark`、`--color-red-light`、`--color-red-bg`、`--color-delete-red`、`--color-visitor-bubble` |
| 中性色 | `--color-black`、`--color-charcoal`、`--color-gray-800`、`--color-gray-700`、`--color-gray-600`、`--color-gray-500`、`--color-gray-300`、`--color-gray-200`、`--color-gray-100`、`--color-gray-border`、`--color-dashboard-divider`、`--color-off-white`、`--color-white`、`--color-muted`、`--color-placeholder`、`--color-input-placeholder`、`--color-input-border` |
| 语义色 | `--color-green`、`--color-green-bg`、`--color-green-text`、`--color-green-dark`、`--color-green-light-bg`、`--color-warning`、`--color-amber-bg`、`--color-amber-text`、`--color-success`、`--color-indigo`、`--color-indigo-bg`、`--color-disabled`、`--color-user-avatar-bg` |
| 字体 | `--font-primary`、`--font-mono` |
| 字号 | `--text-xs`、`--text-sm`、`--text-base`、`--text-md`、`--text-lg`、`--text-xl`、`--text-2xl`、`--text-3xl`、`--text-4xl`、`--text-5xl`、`--text-6xl` |
| 字重 | `--font-normal`、`--font-medium`、`--font-semibold`、`--font-bold` |
| 间距 | `--space-1`、`--space-2`、`--space-3`、`--space-4`、`--space-5`、`--space-6`、`--space-8`、`--space-10`、`--space-12`、`--space-16`、`--space-20` |
| 圆角 | `--radius-sm`、`--radius-md`、`--radius-lg`、`--radius-xl`、`--radius-2xl`、`--radius-3xl`、`--radius-full` |
| 阴影 | `--shadow-sm`、`--shadow-md`、`--shadow-lg`、`--shadow-card`、`--shadow-modal` |
| 布局尺寸 | `--mobile-width`、`--mobile-height`、`--web-width`、`--web-height`、`--web-sidebar-width`、`--web-middle-col-width` |
| 组件尺寸 | `--btn-height-primary`、`--btn-height-outline`、`--input-height`、`--input-height-auth-mobile`、`--topbar-height`、`--tabbar-height`、`--avatar-lg`、`--avatar-sm` |

## 2. v2 → v1 映射表

| R2 token | Wave 10 实现使用 | 说明 |
|---|---|---|
| `--surface-canvas` | `--color-off-white` | 页面浅底 |
| `--surface-card` | `--color-white` | 卡片 / agent bubble |
| `--surface-sunken` | `--color-gray-100` | 输入框、代码外壳、skeleton 浅底 |
| `--text-primary` | `--color-gray-800` | 主文字 |
| `--text-muted` | `--color-gray-700` | 次级文字 |
| `--text-subtle` | `--color-gray-500` | placeholder、disabled、弱提示 |
| `--border-subtle` | `--color-gray-border` | 通用边框 |
| `--accent-brand` | `--color-red` | 主 CTA、选中态、强调线 |
| `--accent-brand-ink` | `--color-red-dark` | 深色强调文字或 hover |
| `--accent-brand-soft` | `--color-red-bg` | 弱强调底、命中高亮底 |
| `--danger` | `--color-delete-red` | 删除、错误、破坏性动作 |
| `--danger-soft` | `--color-red-bg` | 错误弱底 |
| `--focus-ring` | `--color-red` | 当前 SSoT 无专用 focus token；本轮不新增 |
| `--bubble-user` | `--color-visitor-bubble` | 用户气泡 |
| `--bubble-agent` | `--color-white` | agent 气泡 |
| `--bubble-system` | `--color-gray-100` | 系统消息底 |
| `--bubble-radius` | `--radius-lg` | 气泡圆角 |
| `--bubble-pad-y` | `--space-3` | 气泡纵向 padding |
| `--bubble-pad-x` | `--space-4` | 气泡横向 padding |
| `--stream-cursor` | `--color-red` | 流式光标走品牌色 |
| `--code-bg` | `--color-black` | 代码块深底 |
| `--code-fg` | `--color-off-white` | 代码块前景 |
| `--code-comment` | `--color-gray-600` | 代码注释 |
| `--code-keyword` | `--color-green` | 代码关键字 |
| `--code-string` | `--color-warning` | 代码字符串 |
| `--tool-call-bg` | `--color-gray-100` | tool call 卡片底 |
| `--tool-call-border` | `--color-gray-border` | tool call 卡片边框 |
| `--chat-sidebar-w` | `--web-middle-col-width` | session list 使用现有中栏宽度 token |
| `--chat-agent-rail-w` | `--web-sidebar-width` | agent rail 使用现有侧栏宽度 token |
| `--chat-max-w` | `760px` 局部尺寸 | SSoT 无正文 max-width token；不新增 token |
| `--density-compact` | `--space-1` | Compact 密度基准 |
| `--density-normal` | `--space-2` | Normal 密度基准 |
| `--density-loose` | `--space-4` | Loose 密度基准 |

## 3. Wave 10 UI 实现必须使用的 token 名

| UI 部位 | 必须使用 |
|---|---|
| 页面背景 | `var(--color-off-white)` |
| 卡片 / agent 消息 | `var(--color-white)` + `var(--color-gray-border)` |
| 用户消息 | `var(--color-visitor-bubble)` |
| 主文字 | `var(--color-gray-800)` |
| 次级文字 | `var(--color-gray-700)` |
| 弱提示 / placeholder | `var(--color-gray-500)` |
| 主 CTA / 选中态 | `var(--color-red)` |
| Hover / 深强调 | `var(--color-red-dark)` |
| 弱强调底 | `var(--color-red-bg)` |
| 错误 / 删除 | `var(--color-delete-red)` |
| 在线状态 | `var(--color-green)` |
| warning / 连接中 | `var(--color-warning)` 或 `var(--color-amber-bg)` + `var(--color-amber-text)` |
| 输入框 | `var(--color-white)`、`var(--color-input-border)`、`var(--color-input-placeholder)` |
| 代码块 | `var(--color-black)`、`var(--color-off-white)`、`var(--color-gray-600)`、`var(--color-green)`、`var(--color-warning)` |
| tool call 卡片 | `var(--color-gray-100)`、`var(--color-gray-border)` |
| focus ring | `2px solid var(--color-red)`，`outline-offset: 2px` |
| 字体 | `var(--font-primary)`；代码使用 `var(--font-mono)` |
| 间距 | `var(--space-*)` |
| 圆角 | `var(--radius-*)` |
| 阴影 | `var(--shadow-*)` |

## 4. 禁止引用

实现和后续文档不得再引用以下 token 前缀或名称：

- `--surface-*`
- `--accent-*`
- `--bubble-*`
- `--stream-cursor`
- `--code-*`
- `--tool-call-*`
- `--chat-*`
- `--density-*`
- `--focus-ring`
- `--danger` / `--danger-soft`
- `--text-primary` / `--text-muted` / `--text-subtle`
- `--border-subtle`

如确实需要新的语义 token，必须单开 token 升级任务，先更新 `design/design-tokens.css`，再同步实现；不得在 Wave 10 UI 实现中顺手扩展。
