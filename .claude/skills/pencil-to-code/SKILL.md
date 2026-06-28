---
name: pencil-to-code
description: "Pixel-perfect code generation from Pencil (.pen) design files with strict visual fidelity enforcement. Use when the user asks to implement, develop, or code UI from a .pen file, Pencil design, interaction mockup, or visual spec. Also use when the user mentions 'pencil', '.pen file', 'design to code', 'implement this design', 'follow the mockup', or asks for pixel-perfect/strict visual fidelity implementation. Works with or without Pencil MCP — all design data is available as static files."
---

# Pencil-to-Code: Pixel-Perfect Implementation

Enforce strict visual fidelity when generating production code from Pencil (.pen) design files. Every implementation MUST match the design at pixel level — colors, spacing, typography, border-radius, shadows, and layout.

## Prerequisites

- Target project with established framework (Next.js, React, Vue, etc.)
- `design/` 目录下的静态设计资源（截图、Token、开发指引）
- **可选**: Pencil MCP server（如在 Cursor 中使用可提供实时截图和节点数据）
- **可选**: Browser MCP（用于运行时截图对比）

## Design File Location

所有设计资源存储在项目的 `design/` 目录下：

```
design/                              # ← 项目设计资源根目录
├── pencil-new.pen                   # Pencil 设计稿（交互稿、视觉稿，需 MCP 读取）
├── design-tokens.css                # ★ CSS 变量（颜色/字体/间距/圆角/阴影/布局）
├── frontend-dev-guide.md            # ★ 前端开发完整上下文指引（组件规格+页面布局+样式映射）
├── qrclaw-interaction-design.md     # 交互设计文档（页面流程+交互细节）
└── layer/                           # ← 所有页面/组件的静态截图
    ├── INDEX.md                     # 截图文件 → nodeId 映射索引
    ├── Mobile-*.png                 # 移动端页面截图 (390×844)
    ├── Web-*.png                    # Web 端页面截图 (1440×900)
    ├── Component-*.png              # 可复用组件截图
    ├── _annotation-*.png            # 交互注释说明截图
    └── _label-*.png                 # 画布分区标签截图
```

### 核心文件说明

| 文件 | 内容 | 优先级 |
|------|------|--------|
| `design-tokens.css` | 所有设计 Token 的 CSS 变量定义（颜色、字体、间距、圆角、阴影、布局尺寸） | **必读** |
| `frontend-dev-guide.md` | 8 个组件的完整规格 + 5 种页面布局模式 + 消息气泡/输入栏/渐变背景等详细规格 | **必读** |
| `qrclaw-interaction-design.md` | 页面流程、交互行为、状态切换 | **必读** |
| `layer/INDEX.md` | 截图文件名 → Pencil nodeId 映射 | **按需** |
| `layer/*.png` | 38 个页面 + 8 个组件 + 8 个交互注释的像素级视觉基准 | **开发时必读** |

## Core Workflow

**Follow these phases in strict order. Do NOT skip any phase.**

### Phase 0: Context Gathering

**无论是否有 MCP，都从读取静态文件开始：**

1. **Read `design/frontend-dev-guide.md`**: 获取组件规格、页面布局模式、样式映射等完整开发上下文
2. **Read `design/design-tokens.css`**: 获取所有设计 Token（CSS 变量）
3. **Read `design/qrclaw-interaction-design.md`**: 获取交互设计规格和页面流程
4. **Read `design/layer/INDEX.md`**: 获取截图文件 → nodeId 映射表
5. Identify the target framework by exploring the workspace (`package.json`, file extensions, imports)
6. If no project exists, initialize one matching the user's chosen stack

**如果 Pencil MCP 可用（Cursor 环境）**:
- 可额外运行 `get_editor_state`、`batch_get`、`get_screenshot` 获取实时数据
- 但静态文件应始终作为主要参考源

### Phase 1: Design Token Synchronization

将 `design/design-tokens.css` 中的 Token 导入项目的样式系统。

1. **Read `design/design-tokens.css`** — 获取所有 CSS 变量定义
2. Create/update the project's token file:
   - **Tailwind**: 在 `tailwind.config` 中映射 CSS 变量为 Tailwind class
   - **CSS Modules / Vanilla CSS**: 直接 `@import` 或复制变量
   - **Styled Components / CSS-in-JS**: 映射为 theme tokens
3. **Verify**: `design-tokens.css` 中的每个变量在项目中都有对应

**Token 映射示例:**
```
design-tokens.css: --color-red: #E24A3F
→ Tailwind: colors.red.DEFAULT = 'var(--color-red)'
→ 或直接在 CSS 中使用 var(--color-red)
```

### Phase 2: Component Extraction & Implementation

按照 `frontend-dev-guide.md` 中的 **第二章：可复用组件规格** 实现所有 8 个组件。

For **each** reusable component:

1. **Read 规格**: 从 `frontend-dev-guide.md` 获取完整的组件结构、尺寸、颜色、字体
2. **Read 截图**: `Read("design/layer/Component-<Name>.png")` 作为视觉基准
3. **Implement**: Create the component in code matching EVERY property:
   - Dimensions (width, height, min/max)
   - Layout (flex direction, alignment, justification, gap)
   - Typography (font family, size, weight, line height, letter spacing, color)
   - Spacing (padding, margin — exact values)
   - Visual (fill/background, border/stroke, corner radius, shadow/effects)
   - Children structure and nesting
4. **Validate**: 对比截图验证视觉一致性

**8 个可复用组件**:
| 组件 | 截图 | 关键规格 |
|------|------|---------|
| Button Primary | `Component-Button-Primary.png` | 342×50, 红底白字, 圆角12 |
| Button Outline | `Component-Button-Outline.png` | 342×44, 白底灰框, 圆角12 |
| Avatar Agent | `Component-Avatar-Agent.png` | 160×160 (可覆盖), 圆角16, 图片填充 |
| Avatar Small | `Component-Avatar-Small.png` | 36×36, 圆角6, 图片填充 |
| Avatar User | `Component-Avatar-User.png` | 36×36, 圆角6, 灰底+用户图标 |
| Input | `Component-Input.png` | 342×48, 圆角8, 边框1px #E0E0E0 |
| TopBar | `Component-TopBar.png` | 390×50, 返回/标题/右侧占位 |
| TabBar | `Component-TabBar.png` | 390×50, Messages/Me 两个 tab |

**CRITICAL**: Process components ONE AT A TIME.

### Phase 3: Page Implementation

按照 `frontend-dev-guide.md` 中的 **第三章：页面布局模式** + **第十章：页面截图速查** 实现页面。

For **each** page:

1. **Read 截图**: `Read("design/layer/Mobile-<Name>.png")` 或 `Read("design/layer/Web-<Name>.png")`
2. **Read 注释**: 检查是否有 `design/layer/_annotation-<related>.png`，有则必读
3. **参考布局**: 在 `frontend-dev-guide.md` 中查找该页面的布局模式（居中/三栏/双栏等）
4. **参考交互**: 在 `qrclaw-interaction-design.md` 中查找该页面的交互规格
5. **Build**: Assemble the page using implemented components with correct props
6. **Validate**: 对比截图验证视觉一致性

### Phase 4: Interaction & Annotation Implementation

交互行为定义在两个地方：

1. **`design/layer/_annotation-*.png`**: 8 个交互注释截图，包含流式输出、Claim 流程等行为说明
2. **`design/qrclaw-interaction-design.md`**: 完整的交互规格文档

实现以下交互行为：
- Navigation flows and routing
- State transitions and conditional rendering
- Loading/streaming states（参考 `_annotation-Streaming.png`）
- Error handling and retry logic
- Animations and transitions

### Phase 5: Full Validation Loop

After all pages are implemented:

1. 对比每个页面的浏览器截图与 `design/layer/` 中的设计截图
2. Compare checking: layout, colors, typography, spacing, icons
3. Fix any discrepancies found
4. Re-validate until all pages match

## Mandatory Rules

These rules are NON-NEGOTIABLE. Violating any of them is a failure.

### Design Reading Rules
- **NEVER** write UI code without先读取 `frontend-dev-guide.md` 和对应页面截图
- **NEVER** guess colors, sizes, or spacing — always extract from `design-tokens.css` or `frontend-dev-guide.md`
- **ALWAYS** Read 对应的 `design/layer/*.png` 截图 before implementing each component/page

### Token Rules
- **NEVER** hardcode hex colors — use `design-tokens.css` 中定义的 CSS 变量
- **NEVER** use arbitrary font families — only Inter (primary) and JetBrains Mono (code)
- **ALWAYS** match exact spacing values from `frontend-dev-guide.md`（padding, gap, margin）

### Component Rules
- **ALWAYS** 先实现 8 个可复用组件，再实现页面
- **ALWAYS** 组件 props 参考 `frontend-dev-guide.md` 中的 "React 接口建议"
- **NEVER** duplicate component code — reuse the component with different props

### Validation Rules
- **ALWAYS** 实现后截图对比 `design/layer/*.png` 中的视觉基准
- **NEVER** mark a component/page as complete without visual verification

### Icon Rules
- 统一使用 **lucide-react** 图标库
- 图标名称和尺寸参考 `frontend-dev-guide.md` 第九章：图标系统
- Match icon width, height, and fill color exactly

## Strategy Selection

| Situation | Strategy |
|-----------|----------|
| New project, no code | Phase 0 → 1 → 2 → 3 → 4 → 5 (full sequence) |
| Has project, no UI | Phase 1 → 2 → 3 → 4 → 5 (skip project init) |
| Specific page request | Phase 2 (needed components only) → Phase 3 (that page) → validate |
| Fix visual fidelity | Phase 5 only (compare and fix) |

## Quick Reference: 设计资源速查

| 需要什么 | 读取哪个文件 |
|---------|-------------|
| 所有颜色/字体/间距变量 | `design/design-tokens.css` |
| 组件结构和精确尺寸 | `design/frontend-dev-guide.md` 第二章 |
| 页面布局模式 | `design/frontend-dev-guide.md` 第三章 |
| 消息气泡/输入栏规格 | `design/frontend-dev-guide.md` 第五~六章 |
| 渐变背景 | `design/frontend-dev-guide.md` 第八章 |
| 图标名称和尺寸 | `design/frontend-dev-guide.md` 第九章 |
| 页面截图速查 | `design/frontend-dev-guide.md` 第十章 |
| 交互行为和页面流程 | `design/qrclaw-interaction-design.md` |
| 某页面的视觉基准 | `design/layer/Mobile-<Name>.png` 或 `Web-<Name>.png` |
| 交互注释（必读） | `design/layer/_annotation-<Name>.png` |
| 截图文件→nodeId映射 | `design/layer/INDEX.md` |

### 有 Pencil MCP 时的额外能力

如果在 Cursor 等支持 MCP 的环境中，可以额外使用：

| Tool | When to Use |
|------|-------------|
| `get_editor_state` | 识别当前打开的 .pen 文件 |
| `get_variables(filePath)` | 获取实时 design token（与 design-tokens.css 对比验证） |
| `batch_get(filePath, nodeIds, readDepth)` | 获取组件/页面的精确节点数据 |
| `get_screenshot(filePath, nodeId)` | 获取最新版本的设计截图 |
| `snapshot_layout(filePath, parentId)` | Debug 布局问题 |
