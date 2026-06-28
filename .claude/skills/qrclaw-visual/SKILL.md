---
name: qrclaw-visual
description: QRClaw 视觉规范与前端开发指引。当你在 /Users/zeze/qrclaw 项目里写 tsx/jsx/css/scss，修改 web/src 下的 UI，调颜色/字体/间距/圆角，新建页面或组件，做视觉还原/视觉修复，或提交前做视觉 review 时使用。统一了原先 design/frontend-dev-guide.md / design/qrclaw-interaction-design.md / design/design-tokens.css / requirements/visual-fix-prompt.md / .claude/rules/pencil-design-fidelity.md 五份文档。
updated: 2026-04-23
---

QRClaw 前端项目（Next.js 16 App Router + React + Tailwind v4 + CSS Variables）的视觉规范。无论产品、设计还是开发，Agent 都按本 skill 路由视觉类问题。

## 0. 基准源声明（铁律）

| 优先级 | 文件 | 作用 |
|---|---|---|
| 🔴 SSOT（源） | `design/design-tokens.css` | 所有 Token 的单一真相 |
| 🔴 运行时镜像 | `web/src/app/globals.css` | 必须跟 `design-tokens.css` 同步 |
| 🟡 组件/布局文档 | 本 skill `reference.md` | 从原 `design/frontend-dev-guide.md` 提炼 |
| 🟡 截图参考 | `design/layer/*.png` | 像素级视觉基准 |
| 🟠 Pencil 工作文件 | `design/pencil-new.pen` | 设计师内部使用，**Agent 不读** |

**铁律**：
- Token 新增/修改：**先改** `design-tokens.css`，**再同步** `globals.css`，两者不一致视为 Bug。
- 禁止引用被回滚的 v2 token（`--surface-canvas` / `--accent-brand` / `--text-primary` / `--font-sans` / `--font-serif`），它们**不存在于当前代码**。
- 当前 Token 命名空间仅有：`--color-*` / `--font-primary` / `--font-mono` / `--text-*` / `--space-*` / `--radius-*` / `--shadow-*` / `--gradient-*`。

**⚠️ 已知同步差异**（2026-04-23 快照，后续 token 审计统一回写 design-tokens.css）：
- `web/src/app/globals.css` 额外含 5 条运行时 Token：`--web-nav-height: 64px`、`--code-comment` / `--code-keyword` / `--code-function` / `--code-string`（代码块语法色）
- `--font-primary` 定义字面上不完全一致：design-tokens.css 同时写了内置 `var(--font-inter, 'Inter')` 和外置 `'Inter'` 两重 fallback；globals.css 只写外置 `'Inter'` fallback。运行时等价。引用时一律用语义 Token `var(--font-primary)`，不直接用 `--font-inter`。

## 1. 视觉红线（违反即驳回）

1. **禁硬编码颜色** 🔴 — 所有 CSS 颜色必须走 `var(--color-*)` / `var(--gradient-*)`。注意：代码中仍存的历史硬编码 `#fdecea` / `#000000` 已有对应 Token（`--color-visitor-bubble` / `--color-scan-background`），遇到即改走 var，**不得作为白名单做新增**。
2. **禁硬编码字号/间距/圆角** 🔴 — 统一用 `var(--text-*)` / `var(--space-*)` / `var(--radius-*)`。
3. **组件复用优先** — 8 个可复用组件（见 §4）已存在，新需求先查复用，再考虑新建。
4. **固定视口** — Mobile 390×844，Web 1440×900。MVP 阶段不做响应式，不要自作主张加 `@media`。
5. **字体** — 统一 Inter（`var(--font-primary)`），代码块 JetBrains Mono（`var(--font-mono)`）。
6. **图标** — 统一 `lucide-react`，尺寸与颜色按 reference.md §8 的映射。
7. **Next.js 16 App Router 括号路径** — Shell 命令里涉及 `web/src/app/(auth)/...` 或 `(dashboard)` 必须单引号包裹，zsh 否则 glob 报错。
8. **Tailwind v4 无 config** — 无 `tailwind.config.ts`，想改主题必须改 CSS Token，不要凭空新建配置文件。

## 2. 开发前必读

对任何 UI 改动，**至少先读**：

1. `design/design-tokens.css`（Token 源）
2. 本 skill `reference.md` 对应章节（按下方"§5 导航"）
3. 目标页面的 `design/layer/<PageName>.png` 截图
4. 涉及交互：`reference.md` §10（交互要点）

## 3. Checkpoints（Agent 必须停下汇报的节点）

1. **改动前**：列出要改的文件 + 涉及的 Token / 组件。不清楚就问，不要默默决定。
2. **实装后**：跑 `cd web && npm run build`，失败就停。
3. **提交前**（视觉类，需 bash/zsh）：
   - 新增硬编码 hex：`git diff HEAD web/src/ | grep -E '^\+.*#[0-9A-Fa-f]{6}'` → **必须为空**
   - v2 token 回归：`grep -rE "surface-canvas|accent-brand|text-primary|font-sans|font-serif" web/src/` → **必须为空**（这些 Token 不存在）
   - Token 同步满足已知差异清单（见 §0）：
     ```bash
     diff <(grep -oE '^\s*--[a-z0-9-]+' design/design-tokens.css | sort -u) \
          <(grep -oE '^\s*--[a-z0-9-]+' web/src/app/globals.css | sort -u) \
       | grep -E '^[<>]' \
       | grep -vE -- '--web-nav-height|--code-comment|--code-keyword|--code-function|--code-string' \
       && echo "✗ unknown drift" || echo "✓ only known diffs"
     ```
4. **视觉还原任务**：对比 `design/layer/*.png` 截图，指出差异点。

## 4. 8 个可复用组件（速查）

所有组件均通过 `@/components/ui` 统一 barrel 导出（见 `web/src/components/ui/index.ts`）。

| 组件 | Pencil nodeId | React 源 + 用法 | 尺寸 |
|---|---|---|---|
| Button Primary | `OjdTt` | `<Button variant="primary">` | 50px 高，品牌红 |
| Button Outline | `5jucT` | `<Button variant="secondary">` | 44px 高，灰边 |
| Avatar Agent | `HHdX9` | `<Avatar variant="agent" size={N} />` | 160/80/56/48/40 |
| Avatar Small | `TcSQ2` | `<Avatar variant="agent" size={36} />` | 36×36 |
| Avatar User | `yYpU6` | `<Avatar variant="user" size={36} />` | 36×36 |
| Input | `3X9H4` | `<Input />` | 342×48，8px 圆角 |
| TopBar | `XjPhS` | `<TopBar title=... />` | 390×50 |
| TabBar | `Rzvbh` | `<TabBar active=... />` | 390×50 |

其他已有组件（从 `@/components/ui` 导出）：`MessageBubble`（用 `variant: 'sent' | 'received'`）、`MessageList`、`ChatInputBar`、`RegisterBanner`、`ConnectionStatusBanner`、`Dialog`、`QRCard`、`ChatMenu`、`Badge`。

详细规格（宽/高/圆角/内距/子元素/字体）见 `reference.md` §2。

## 5. 导航指引（按需加载）

| 你的问题 | 去读 |
|---|---|
| 有哪些 Token，值是多少 | `reference.md` §1 |
| 组件规格（尺寸/颜色/内部结构） | `reference.md` §2 |
| 页面布局（Mobile/Web/Dashboard/Auth/SignUp） | `reference.md` §3 |
| 消息气泡 / 流式指示器 | `reference.md` §4 |
| 输入栏（Mobile/Web Chat） | `reference.md` §5 |
| 注册横幅 / 特殊组件 | `reference.md` §6 |
| 渐变背景参考 | `reference.md` §7 |
| 图标系统（Lucide 映射表） | `reference.md` §8 |
| 页面速查表（Mobile 20 页 + Web 18 页） | `reference.md` §9 |
| Overlay 组件（Toast / Confirm Dialog / Suggested Questions / Skeleton） | `reference.md` §10 |
| QR 样式面板 | `reference.md` §11 |
| 关键交互要点 | `reference.md` §12 |
| 具体场景示例（正 vs 反） | `examples.md` |

## 6. 与其他 skill 的关系

- **`.claude/skills/pencil-to-code/`**：Pencil → 代码转换 workflow，被本 skill 替代大部分场景；仅当需要从 `pencil-new.pen` 读取新增页面的精确数值时走它。
- **`.claude/rules/pencil-design-fidelity.md`**：已由本 skill 取代，归档到 `.claude/rules/_archive/`（执行归档步骤时）。
- **`requirements/visual-fix-prompt.md`**：视觉修复工作流文档，内容已融入本 skill §2 §3，原文件保留作 PR 附件模板。
- **`design/frontend-dev-guide.md` / `design/qrclaw-interaction-design.md`**：原始素材，本 skill `reference.md` 从中提炼，日常开发不再直读原文件。
