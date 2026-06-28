# qrclaw-visual Skill · 维护文档

> 此文件供人类维护参考，Agent 运行时不加载。

## 基本信息

| 字段 | 值 |
|---|---|
| 技能名 | `qrclaw-visual` |
| 路径 | `/Users/zeze/qrclaw/.claude/skills/qrclaw-visual/` |
| 创建人 | @zeze |
| 版本 | v1.0.0 |
| 创建日期 | 2026-04-23 |

## 适用场景

QRClaw 前端项目下的视觉规范与开发指引。覆盖：

- 查 Token（颜色 / 字体 / 间距 / 圆角 / 阴影 / 布局）
- 查可复用组件规格（8 个）
- 查页面布局模式（Mobile 5 种 + Web 2 种）
- 开发前的必读清单与检查点
- 视觉还原工作流
- 常见错误场景示例

## 前置条件

- 项目根：`/Users/zeze/qrclaw`
- Next.js 16 App Router + React + Tailwind v4（无 config）+ CSS Variables 架构
- `design/design-tokens.css` 为 Token SSOT，`web/src/app/globals.css` 为运行时镜像
- `design/layer/*.png` 为页面像素级基准
- Agent 运行环境支持 Read/Grep/Write/Bash 工具链

## 使用示例

Agent 自动触发场景（从 SKILL.md frontmatter description 匹配）：

```
用户："帮我实现 Mobile/Chat 页"
→ Agent 读 SKILL.md → 查 reference.md §3.1 / §4 / §5.1 → 复用组件实现

用户："这颜色能直接写 #E24A3F 吗？"
→ Agent 读 SKILL.md §1 红线 → 指出必须用 --color-red → 给 examples.md 例 1

用户："加个响应式支持"
→ Agent 读 SKILL.md §1 红线 §4 → 按 examples.md 例 6 反问设计稿
```

## 注意事项

⚠️ **基准源铁律**：
- 任何 Token 新增/修改先改 `design/design-tokens.css`，再同步 `web/src/app/globals.css`
- 二者不一致视为 Bug，Agent 有 checkpoint shell 可验
- 被回滚的 v2 token（`--surface-canvas` / `--accent-brand` / `--text-primary` / `--font-sans` / `--font-serif`、`brand-principles.md`）**不存在于当前代码**，Agent 禁止引用

⚠️ **Pencil 文件不由 Agent 读**：`design/pencil-new.pen` 是设计师工作文件，MCP 读不到语义信息，本 skill 从提炼后的 `frontend-dev-guide.md` 和截图重建上下文。

⚠️ **Tailwind v4 无 config**：禁止创建 `tailwind.config.ts`，所有主题定制必须走 CSS Variables。

## 已知问题

- [ ] v1.0 发布，待生产环境灰度反馈。
- [ ] 渐变部分少量硬编码值（Landing Hero、Register Bar 的 `#FEF2F2 / #FECACA`）尚未 Token 化，遇到时建议补进 `design-tokens.css`。
- [ ] Lucide 图标映射表（reference.md §8）只枚举了常用的 13 个，新 icon 使用按需补充。

## 相关技能

- **`.claude/skills/pencil-to-code/`**：Pencil MCP → 代码转换 workflow；新页面首次从 Pencil 抽规格时用，日常开发走本 skill。
- **`docs/superpowers/`**（git submodule）：Anthropic Superpowers 插件的 skill-creator 指南；本 skill 的结构参考 `~/txbbs/.cursor/skills/txbbs-conventions/`。

## 归档

本 skill 上线后以下文件应归档或指向本 skill：

| 文件 | 归档动作 |
|---|---|
| `.claude/rules/pencil-design-fidelity.md` | 移到 `.claude/rules/_archive/`，加 header 说明已由 qrclaw-visual 替代 |
| `requirements/visual-fix-prompt.md` | 保留（作 PR 附件模板），在文件头加一行 "视觉规范以 `.claude/skills/qrclaw-visual/` 为准" |
| `design/frontend-dev-guide.md` / `qrclaw-interaction-design.md` | 保留为原始素材，不再要求 Agent 直读 |

## 变更日志

- **v1.0.0 · 2026-04-23** · zeze · 初版。整合 5 份视觉文档（frontend-dev-guide / qrclaw-interaction-design / design-tokens / visual-fix-prompt / pencil-design-fidelity）为 SKILL.md + reference.md + examples.md 三件套。
- **v1.0.1 · 2026-04-23** · zeze · 二审修订：(1) Next.js 版本修正 14 → 16；(2) 申明 design-tokens.css / globals.css 已知同步差异和 `--font-primary` fallback 写法差异；(3) 补全 reference.md Overlay 组件（Toast/Confirm Dialog/Suggested Questions/Skeleton）及 QR Styles 面板；(4) 标注 Mobile 页面数源文件字数不一致（20 页为准）。依据：`/tmp/qrclaw-skill-review-claude.md`。
- **v1.0.2 · 2026-04-23** · zeze · Cursor 三审修订：(1) 修正 examples.md 例 1 `ButtonPrimary` 虚构导出 → `<Button variant="primary">`；(2) 修正例 3 `AgentBubble/UserBubble/MobileChatInput` → `MessageBubble/MessageList/ChatInputBar`（均从 `@/components/ui` 导出）；(3) 删除 `--color-signup-brand-muted` 错误归为 globals.css 独有的声明（实为两边都有）；(4) Checkpoint shell 的 grep 正则 `[a-z-]` → `[a-z0-9-]` 换线；(5) diff 命令补上已知差异白名单过滤；(6) 移除 §1 红线的 hex 白名单省略，改为历史残留说明；(7) 去掉 README 虚构的目标使用者列表。依据：`/tmp/qrclaw-skill-review-cursor.md`。
