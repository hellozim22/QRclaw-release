# Wave 10 UX 深度设计（R2 · 全面体验）

> 产出人：R2
> 日期：2026-04-28
> 输入：`docs/agent-chat-ui-research-report.md`、`docs/wave10/r1-onboarding-design.md`、`design/design-tokens.css` v1 SSoT、cowork / Multica 参考
> 性质：交互设计 spec（wireframe + state machine + token + A11y），不含代码。

---

## 0. 设计原则

### 0.1 不是 MVP：对话功能要"参考 cowork 的完整度"

这份 spec 按"全面产品"标准写：流式 / Markdown / 代码 / 表格 / LaTeX / Mermaid / 文件 / 图片 / 语音 / @mention / 工具调用 / session 管理 / 错误态 / A11y —— 22 个场景一个都不砍。

### 0.2 继承 QRClaw v1 Token SSoT

- **页面基底**：页面底 `--color-off-white`、正文 `--color-gray-800`；禁止硬编码页面底。
- **品牌 / 危险色**：主按钮、Focus 态、强调线使用 `--color-red`；错误 / 离线 / 删除使用 `--color-delete-red` 与 `--color-red-bg`。
- **Token-only**：禁止硬编码 hex，所有颜色走 `var(--color-red)` / `var(--color-gray-700)` / `var(--color-white)` 等 `design/design-tokens.css` 已有 token。

### 0.3 A11y 基线（WCAG 2.1 AA）

- 所有交互元素 `tabindex` 有序可达；Focus ring `2px solid var(--color-red)` outline-offset 2px。
- 所有图标按钮需 `aria-label`。
- 所有流式状态用 `aria-live="polite"` 向屏幕阅读器广播；错误用 `aria-live="assertive"`。
- 颜色对比度 ≥ 4.5:1（正文）/ 3:1（大字号）；Lighthouse a11y ≥ 95。

---

## 1. 设计 Token 使用清单（以 SSoT 为准）

```css
:root {
  /* ── 来自 design/design-tokens.css；实现时不要在组件内重定义 ── */
  --color-off-white: #F8F9FA;      /* 页面底 */
  --color-white: #FFFFFF;          /* 卡片 / agent 气泡 */
  --color-gray-100: #F5F5F5;       /* 输入框 / 代码外壳浅底 */
  --color-gray-800: #333333;       /* 主文字 */
  --color-gray-700: #666666;       /* 次级文字 */
  --color-gray-500: #999999;       /* placeholder / disabled */
  --color-gray-border: #E8E8E8;    /* 通用边框 */
  --color-red: #E24A3F;            /* 主 CTA / 选中态 / focus */
  --color-red-dark: #C03A32;       /* 深强调 / hover */
  --color-red-bg: #FEF5F4;         /* 弱强调 / 错误弱底 */
  --color-delete-red: #FF3B30;     /* 删除 / 破坏性动作 */
  --color-visitor-bubble: #FDECEA; /* 用户气泡 */

  /* ── 对话场景复用现有 token，不新增 code / bubble / tool-call 命名空间 ── */
  --color-black: #1A1A1A;          /* 代码块深底 */
  --color-gray-600: #868E96;       /* 代码注释 */
  --color-green: #34C759;          /* 在线态 / 代码关键字 */
  --color-warning: #F59E0B;        /* warning / 代码字符串 */
  --color-amber-bg: #fffbeb;       /* 连接中横幅底 */
  --color-amber-text: #D97706;     /* 连接中文案 */

  --font-primary: var(--font-inter, 'Inter'), 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: var(--font-jetbrains-mono, 'JetBrains Mono'), 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  --radius-lg: 12px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --web-sidebar-width: 80px;
  --web-middle-col-width: 320px;
}
```

**关键决策**：
- 代码块深底使用 `--color-black`，前景使用 `--color-off-white`，高亮只复用现有 `--color-gray-600` / `--color-green` / `--color-warning`。
- Focus ring 复用 `--color-red`；如果后续需要专用 focus token，必须单开 SSoT 升级任务。
- 用户气泡 ≠ agent 气泡：用户是 `--color-visitor-bubble`，agent 是 `--color-white` + `--color-gray-border`，避免 agent reply 被用户消息压住。

---

## 2. 整体布局（桌面端基线 1440×900）

**三层左栏**（从外到内）：
1. **Agent rail** (72px)：4 个 runtime 图标 + 在线状态小点；点击切换 agent。
2. **Session list** (260px)：当前 agent 下的话题列表、搜索、新建、归档。
3. **Chat column**（剩余宽度）：消息流 + 输入框。

```
┌──────────────────────────────────────────────────────────────┐
│ Top bar 48px: ▌ QRClaw  [⌘K 搜索]      zimzheng   ⚙ ⓘ        │
├──────┬─────────────┬──────────────────────────────────────────┤
│ ▦●◀  │ 🔍 话题...  │ Chat header 56px: agent · 状态 · 📂项目⋯ │
│ ▤●   │ ▸ PRD 补完  ├──────────────────────────────────────────┤
│ ▣●   │ · SQL  ●3   │                                          │
│ ☎●   │ · 归档▸     │    消息流 (max-width 760)                 │
│ 📂   │ + 新话题 ⌘N │                                          │
│ 👤   │             │  ┌────────────────────────────────────┐  │
│      │             │  │ 输入... 📎 🎤 🚀                   │  │
│      │             │  └────────────────────────────────────┘  │
└──────┴─────────────┴──────────────────────────────────────────┘
```

**为什么三层**：cowork / Multica / Slack 都是这种套路——runtime 级（账号/工作区）+ session 级（话题）+ 内容级（消息）。中间不省，否则 4 runtime × N session 会糊成一锅。

---

## 3. 场景 wireframe（22 个）

### 3.1 首次打开 Dashboard · 空态

> `Host 未安装` 或 `Host 未 pair` 情况。

```
Top bar: ▌ QRClaw                                   zimzheng  ⚙ ⓘ
─────────────────────────────────────────────────────────────
[Agent rail]  [Session list]           [Chat / 空态]
  ▦ Claude     待检测
  ▤ Cursor     🔸 Claude
  ▣ Codex      🔸 Cursor             欢迎回来，zimzheng
  ☎ OpenClaw   🔸 Codex
  📂 Projects  🔸 OpenClaw           我们还没检测到你机器上的 CLI

                                     ┌─────────────────────────────┐
                                     │ 下一步：安装 QRClaw Host     │
                                     │                             │
                                     │  brew install qrclaw-agent.. │
                                     │  qrclaw-host pair            │
                                     │  qrclaw-host daemon install  │
                                     │                             │
                                     │ [📋 复制全部]  [文档 →]       │
                                     └─────────────────────────────┘

                                     ○ Claude Code    未检测到
                                     ○ Cursor Agent   未检测到
                                     ○ Codex          未检测到
                                     ○ OpenClaw       未检测到
```

**交互细节**：
- 不要空列表 + "创建第一个 agent" 按钮（r1-onboarding-design 红线）。
- 4 runtime 槽位**始终可见**，状态灰态（`--color-gray-500`）占位。
- 复制按钮 2s toast "已复制"。
- 代码块用 `--color-black` 暖黑，字体 `JetBrains Mono`。
- A11y：每行命令 `role="button"` 可单独复制；空态 `aria-live="polite"`。

### 3.2 4 Runtime 已在线

```
[Agent rail 状态点]      4 个 runtime 都已就绪
  ▦● Claude
  ▤● Cursor           ▦  Claude Code    在线    ~/.local/bin/claude
  ▣● Codex            ▤  Cursor Agent   在线    /usr/local/bin/cursor..
  ☎● OpenClaw         ▣  Codex          在线    ~/.bun/bin/codex
                      ☎  OpenClaw       在线    npm -g openclaw

                      左栏点任意一个立即开聊。
                      或：[▦ 试试 Claude]  [▤ 试试 Cursor]  [→ 新建话题]
```

- Agent rail 图标右上角小点：绿(`online`) / 黄(`needs_login`) / 灰(`not_installed`) / 红(`error`)。
- 每个状态点都有 `aria-label="Claude Code 在线"`。
- Hover agent rail 图标：浮出 tooltip "Claude Code · 在线 · 刚刚检测"。

### 3.3 点击 Runtime 默认 Agent 进 Chat

```
▦ Claude Code · 本地在线 · 📂 笔笔省                          ⋯
─────────────────────────────────────────────────────────────
           ┌──────────────────────────────┐
           │  Claude Code 就位              │
           │  Instructions 已从默认模板加载 │
           │                                │
           │  建议你先问：                   │
           │   · 帮我起草 PRD 验收段落      │
           │   · 解释这段代码               │
           │   · 读一下笔笔省 README        │
           └──────────────────────────────┘
─────────────────────────────────────────────────────────────
 ┌──────────────────────────────────────────────────────────┐
 │ 输入消息... (Shift+Enter 换行, Enter 发送)    📎  🎤  🚀 │
 └──────────────────────────────────────────────────────────┘
```

- Agent rail 选中态：左侧 3px `--color-red` 竖条。
- Chat header 显示 agent 名 + 状态 + project badge。
- 空态不显示"开始聊天"大 CTA，而是给 3 个建议 prompt（点击填入）。
- 输入框：左侧 📎 文件、右侧 🎤 语音、🚀 发送；快捷键提示始终在 placeholder 里。

### 3.4 发消息 · Thinking Indicator

```
           [ 用户气泡 · 右对齐 ]
           ┌──────────────────────────┐
           │ 帮我写一段 SQL：本周访问量 │
           │ Top 10 商户                │
           └──────────────────────────┘
                       已发送 · 09:42

▦ Claude Code
┌──────────────────────────────────────┐
│  ◐ 思考中...                          │  ← 三点脉冲动画
│  估计 2-5 秒                          │
└──────────────────────────────────────┘
     [⏸ 取消]  ← 小按钮
```

- Thinking indicator：三点 pulse 动画（`prefers-reduced-motion` 下切静态 `…`）。
- 300ms 内未见 first token 才出现"思考中"；≤ 300ms 直接进入流式态。
- A11y：`aria-live="polite"` "Claude Code 正在思考"。
- 2 秒后追加"估计 2-5 秒"，5 秒后"还在思考..."，10 秒后"连接似乎较慢"；避免用户干等。

### 3.5 流式输出 · Token by Token

```
▦ Claude Code
┌──────────────────────────────────────────────────┐
│  好的，这里是 HiveSQL 草稿：                      │
│                                                   │
│  ```sql                                           │
│  SELECT merchant_id, COUNT(*) AS visits▊         │  ← 闪烁光标
│  ```                                              │
└──────────────────────────────────────────────────┘
             [⏹ 停止]  [↻ 重新生成 (disabled)]
```

- 光标 `▊` 颜色 `--color-red`，blink 1s cadence；`prefers-reduced-motion` 下静态。
- 代码块在流式中：先渲染为"预代码"灰底；未闭合 ` ``` ` 自动补全避免整段变代码（LobeChat 的方案）。
- 每 30 token 做一次 `scrollIntoView` smoothly；用户手动上滚后**暂停自动 scroll**，右下出现"↓ 回到底部"浮动按钮（cowork 同款）。
- Stop 按钮在流式期间始终可见；Regenerate disabled 到 completed 后才启用。

### 3.6 Markdown 完成 · 代码块

```
▦ Claude Code                                  09:42  ⋯
┌─────────────────────────────────────────────────────┐
│  好的，这里是 HiveSQL 草稿：                         │
│                                                      │
│  ┌───────────────────────────────────────────┐      │
│  │ sql                          [▾ 折叠] [📋] │      │  ← 代码块 header
│  ├───────────────────────────────────────────┤      │
│  │ 1  SELECT merchant_id, COUNT(*) AS visits │      │
│  │ 2  FROM   user_visits                     │      │
│  │ 3  WHERE  dt BETWEEN '2026-04-22' AND ... │      │
│  │ 4  GROUP  BY merchant_id                  │      │
│  │ 5  ORDER  BY visits DESC                  │      │
│  │ 6  LIMIT  10;                             │      │
│  └───────────────────────────────────────────┘      │
│                                                      │
│  说明：这里用 5 表关联限制，已在字段指引里...         │
└─────────────────────────────────────────────────────┘
  [👍] [👎] [📋 复制] [↻ 重新生成] [🔀 转给...] [🗣 朗读]
```

- 代码块 header：语言标签 + 折叠 + 复制；折叠后只剩标题栏高度 32px。
- 语法高亮：Shiki 或 `rehype-highlight`；高亮色板遵循 `--color-black` / `--color-off-white` / `--color-gray-600` / `--color-green` / `--color-warning` token。
- 行号 `--color-gray-500`，不可选中（`user-select: none`）；代码本身可选中。
- 长代码块：> 20 行时默认折叠到 15 行 + "展开 (32 行)"。
- bubble 底部 action row：`👍 / 👎 / 复制 / 重新生成 / 转给 / 朗读`。
- A11y：代码块 `role="region" aria-label="sql 代码"`；复制后 `aria-live` 宣告 "已复制到剪贴板"。

### 3.7 表格 / LaTeX / Mermaid

**表格**：

```
┌──────────────────────────────────────┐
│ 商户ID    │ 访问量  │ 环比           │
├───────────┼─────────┼────────────────┤
│ M001      │ 12,345  │ ▲ 23%  ← 绿   │
│ M002      │  8,921  │ ▼ 5%   ← 红   │
│ M003      │  6,710  │ ▲ 2%          │
└──────────────────────────────────────┘
   [排序 ▾] [导出 CSV]
```
- 表头 `--color-gray-100` 底；斑马行 `rgba(0,0,0,0.02)`。
- `table-layout: fixed` 避免流式抖动。
- 超 6 列横向滚动；超 12 行虚拟滚动。

**LaTeX**：KaTeX 行内 `$...$` / 块级 `$$...$$`；未闭合时暂不渲染（避免半截报错）。

**Mermaid**：`\`\`\`mermaid` 代码块自动渲染为 SVG；右上角 `[源码 / 图表]` 切换；SVG 支持缩放 + 导出 PNG。

### 3.8 拖文件到 Chat · 预览卡片

拖拽到整个 chat 区域触发全屏 drop overlay（虚线 `--color-red` 边框）："📎 松开手即可添加 · 支持 PDF/Markdown/图片/代码 · 单文件 ≤ 20 MB"。

拖入后输入框上方出现预览卡片（可叠放 ≤ 5 个）：

```
┌─────────────────────────────────────────────────┐
│ ┌──┐  PRD_传图找品.md              12.3 KB   ✕ │
│ │📄│  Markdown · 上传中  ████░░░░ 62%            │
│ └──┘                                             │
└─────────────────────────────────────────────────┘
```

- 完成后进度条变"✓ 就绪"；失败变红 "上传失败 [重试]"。
- 删除按钮 `aria-label="移除 PRD_传图找品.md"`。

### 3.9 粘贴截图 · Inline 预览

```
用户在输入框里 ⌘V 粘贴:

输入框上方:
┌───────────────────────────────────────────────┐
│ ┌──────────┐                                  │
│ │   [缩    │  screenshot-2026-04-28.png       │
│ │    略    │  856 × 420  ·  128 KB     [✕]   │
│ │    图]   │                                   │
│ └──────────┘                                  │
└───────────────────────────────────────────────┘

输入框:
┌──────────────────────────────────────────────┐
│ 帮我看一下这个图里有什么问题|                📎│
└──────────────────────────────────────────────┘
```

- 粘贴立即显示 base64 inline preview（80×80 缩略），无需等上传。
- 右键点击预览 → "另存为 / 复制 / 移除"。
- 快捷键：`Esc` 移除最近添加的附件（focus 在输入框时）。

### 3.10 图片点开 · 全屏 Zoom + 左右切

```
全屏 lightbox (黑色半透明蒙层, 0.88 alpha):

 ✕                                                    1/3
          ┌────────────────────────────────┐
     ◀    │                                │    ▶
          │       [大图 原始分辨率]          │
          │                                │
          └────────────────────────────────┘
                      ⊖  100%  ⊕   ⬇

         screenshot-2026-04-28.png · 856 × 420
```

- 左右箭头切换同一条 message 里的附件；循环；键盘 `← / →`。
- 缩放：`⊖ / 100% / ⊕`；`+/-` 键或滚轮 zoom；`0` 重置。
- `Esc` 关闭；关闭时 focus 回到触发缩略图（WCAG focus management）。
- 下载按钮右下。
- A11y：`role="dialog" aria-modal="true" aria-label="图片查看器"`。

### 3.11 Agent Reply 里 @mention 另一个 Agent

```
▦ Claude Code
┌─────────────────────────────────────────────────┐
│  这个 SQL 可以进一步优化，建议让 @▣Codex 跑一下   │
│  dry-run 验证字段有效性。                         │
│                                                  │
│  参考字段指引：@file:docs/03_字段指引/merchant.md │
└─────────────────────────────────────────────────┘
  [👍] [👎] [📋] [↻] [🔀 转给 ▣ Codex] ← 智能出现
```

- `@▣Codex`：渲染成可点击的 chip（绿底 + runtime 图标）。
- 点击 chip：弹 popover "跳转到 Codex 新话题？/ 在当前话题 @mention？"
- 选"跳转"：在 Codex 下创建新 session，并把当前 bubble 作为引用注入第一条消息。
- 当消息中含 `@mention` 时，bubble action row 自动多出 `[🔀 转给 ▣ Codex]` 按钮。
- `@file:xxx` 也是 chip：点击在右侧 slide-in 打开文件预览（artifact 面板）。

### 3.12 Regenerate 按钮

```
bubble 底部 action row:
  [👍] [👎] [📋 复制] [↻ 重新生成 ▾] [🔀 转给...] [🗣 朗读]
                           │
                           └─ 点击 ▾ 弹菜单:
                              ┌──────────────────┐
                              │ ↻ 重新生成       │
                              │ 🎯 更简洁         │
                              │ 📏 更详细         │
                              │ 🌐 换种说法       │
                              │ ───────────────  │
                              │ ✏ 编辑后重发     │
                              └──────────────────┘
```

- 默认 ↻ 行为：保留用户 prompt，清除当前 reply，重新发 run。
- 旧 reply 不丢失：折叠为 "上个版本 (v1) ▸"，可展开比较。
- 编辑后重发：把用户 prompt 注入输入框让用户改。

### 3.13 Stop Streaming 按钮

```
流式过程中, bubble 正下方居中:

         ┌─────────────────┐
         │ ⏹ 停止生成 (Esc) │
         └─────────────────┘

          ... 流式内容 ...
```

- 位置：bubble 下方居中 floating，不在 bubble 内。
- 快捷键：`Esc`（仅在流式期间）。
- 停止后 bubble 末尾追加斜体灰 "— 已中止" 标记。
- bubble action row 立即出现 ↻；停止后的内容保留不清除。

### 3.14 新建 Session · 话题命名 / 继承 Instructions

```
点击 "+ 新话题" 后, 模态:

┌───────────────────────────────────────────────┐
│  新建话题                                 ✕   │
├───────────────────────────────────────────────┤
│  Agent: ▦ Claude Code                         │
│                                               │
│  话题名                                        │
│  ┌─────────────────────────────────────────┐ │
│  │ (留空则用首条消息自动命名)                │ │
│  └─────────────────────────────────────────┘ │
│                                               │
│  Instructions 继承                             │
│  ◉ 继承 Agent 默认                             │
│  ○ 继承上一个话题                              │
│  ○ 从模板选择         [Tech Writer ▾]         │
│  ○ 不继承（干净起点）                          │
│                                               │
│  项目上下文                                    │
│  [📂 笔笔省 ▾]                                │
│                                               │
│                        [取消]  [创建话题]      │
└───────────────────────────────────────────────┘
```

- 默认选"继承 Agent 默认"；下次记忆用户上次选择。
- 话题名留空时，首条消息完成后 LLM 自己起名（≤ 20 字，不调用 agent，用小型 summarizer 或用户第一句截取）。
- 创建后 focus 自动落在输入框。

### 3.15 Session 切换 · 左栏 Session List + 未读

```
Session list (260px 宽):

┌────────────────────┐
│ 🔍 搜索话题...      │
├────────────────────┤
│ ▸ PRD 补完          │  ← 当前选中, 左 3px 绿条
│   2 分钟前 · 12 msg │
│                    │
│ · SQL 讨论      ● 3 │  ← 未读 3 条
│   昨天           │
│                    │
│ · 品牌 slogan       │
│   上周              │
│                    │
│ · 数据字段确认       │
│   2 周前             │
├────────────────────┤
│ 归档 (5) ▸          │
├────────────────────┤
│ + 新话题   ⌘N        │
└────────────────────┘
```

- 未读徽标：`--color-red-bg` 底 + `--color-delete-red` 字；仅数字 ≥ 1 时显示。
- 选中话题：左侧 3px 绿竖条 + 轻微 `--color-visitor-bubble` 底色。
- 每个话题项右键菜单：重命名 / 归档 / 删除 / 导出 MD / 固定到顶。
- 排序：固定话题在最上，其余按最近活动倒序。
- 归档区折叠展开。

### 3.16 Session 搜索

```
⌘K 触发 / 或点顶部搜索栏:

┌──────────────────────────────────────────────────┐
│ 🔍  传图找品                                  ✕   │
├──────────────────────────────────────────────────┤
│  话题 (3)                                         │
│   ▦ PRD 补完          · 2 分钟前              ⮕  │
│   ☎ 传图找品验收      · 昨天                  ⮕  │
│   ▤ 图片识别模型讨论   · 上周                  ⮕  │
│                                                   │
│  消息 (12)                                        │
│   ▦ "...传图找品的核心是图像识别..."              │
│     PRD 补完 · 1 小时前                      ⮕   │
│   ☎ "...传图找品上线前要 5 个测试 case..."        │
│     传图找品验收 · 昨天                      ⮕   │
│                                                   │
│  项目文件 (2)                                      │
│   📄 requirements/PRD_传图找品.md            ⮕   │
│                                                   │
│     ↑↓ 导航  ⏎ 打开  Esc 关闭                    │
└──────────────────────────────────────────────────┘
```

- 全局快捷键 `⌘K` / `Ctrl+K`。
- 三段式：话题 / 消息 / 文件（项目上下文下才有）。
- 支持过滤前缀：`#话题名`、`@agent:Claude`、`from:zimzheng`、`has:image`。
- 消息命中高亮搜索词用 `--color-red-bg` 底。
- 键盘完全可达：↑↓ 选，⏎ 打开，Esc 关。

### 3.17 Session 归档 / 删除 / 重命名

```
右键 session 项:

┌─────────────────────────┐
│  ✏ 重命名                │
│  📌 固定到顶              │
│  📦 归档                  │
│  📤 导出 Markdown         │
│  ⎘ 复制分享链接 (本地)    │
│  ───────────────────    │
│  🗑 删除              ⌫  │
└─────────────────────────┘

删除确认:
┌───────────────────────────────────────┐
│  删除话题「SQL 讨论」？                │
│                                       │
│  将同时删除 12 条消息和 2 个附件。     │
│  此操作不可撤销。                       │
│                                       │
│  ☐ 我理解后果              [取消] [删除]│
└───────────────────────────────────────┘
```

- 删除需勾选 checkbox 才启用红色 Destructive 按钮（防误触）。
- 归档是软删除：从主列表隐藏，进入"归档"折叠组。
- 重命名：inline `contenteditable`，⏎ 保存，Esc 取消。

### 3.18 Instructions 编辑器（Agent 页面）

路径 `/agents/claude-code/edit`。顶部模板选择（通用 / PRD 编写 / 代码审查 / 数据分析 / 自定义...），中间 Monaco markdown 编辑器（显示字符数 `1,245 / 8,000`），下方"变量 `{{project_name}} {{date}} {{owner}}`"与"高级 ▾（Temperature / max_tokens / 工具权限 checkbox：文件读/写/shell）"。

```
 ▦ Claude Code / Instructions
 ─────────────────────────────
 从模板: [通用] [PRD] [审查] [数据] [+ 自定义]
 ┌───────────────────────────────────────────┐
 │ You are Claude Code for bibisheng...       │
 │ - Reply in Simplified Chinese.             │
 │ - Reference docs/03_字段指引/ ...          │
 │ ▊                                           │
 └───────────────────────────────────────────┘
 1,245 / 8,000 字符 · Markdown 支持
 变量: {{project_name}} {{date}} {{owner}}
 高级 ▾  Temperature [0.7]  max_tokens [4096]  工具: ☑读 ☑写 ☐shell
                      [取消]  [另存为模板]  [保存]
```

- 模板点击即加载，未保存显示黄色 banner。
- `{{` 触发变量 autocomplete。
- 超字符数变 `--color-delete-red`。工具权限每项有帮助 tooltip。

### 3.19 语音输入 · Hold-to-Talk

```
输入框右侧:

  [ 输入消息...                           📎   🎤   🚀 ]
                                           ↑
                                    Hold (长按):

   ┌──────────────────────────────────────────────────┐
   │                                                  │
   │        🔴 录音中 · 00:04                          │
   │        ≈≈≈≈≈≈≈≈▮▮▮▮▮▮▮▮▮▮≈≈≈              │  ← 音量波形
   │                                                  │
   │        松开发送    向上滑动取消                   │
   └──────────────────────────────────────────────────┘
```

- **长按 hold-to-talk**（类微信语音消息）：按下开始录音，松开结束。
- 上滑取消手势（移动端 / trackpad），桌面端用 `Esc` 取消。
- 录音时显示实时 waveform（WebAudio AnalyserNode）。
- STT 选项：本地 Web Speech API（默认） / Whisper 服务（设置里切换）。
- 录音结束：转文字填入输入框，用户可编辑后再 Enter 发送（不自动发送）。
- 超过 60s 自动截断提示"太长了，考虑分段"。
- A11y：键盘用户按住 `Space` 等价 hold（输入框 focus 时）。

### 3.20 语音回放 · Agent Reply

```
bubble 右上浮出小按钮:

▦ Claude Code                                  🗣 ▸  ⋯
┌──────────────────────────────────────────────────┐
│  好的，这里是 HiveSQL 草稿：...                   │
└──────────────────────────────────────────────────┘

点击 🗣 ▸:

▦ Claude Code                                  🗣 ⏸  ⋯
┌──────────────────────────────────────────────────┐
│  好的，这里是 HiveSQL ▮草稿：...                  │  ← 当前朗读位置高亮
│  ████████░░░░░░░░░░  00:12 / 00:38               │
└──────────────────────────────────────────────────┘
     [🐢 0.75x] [🐇 1.25x] [⏩ 跳过代码块]
```

- 点 🗣 播放 TTS，再点变 ⏸。
- 当前朗读位置高亮（`--color-red-bg` 底）同步滚动。
- 速度 0.75/1/1.25/1.5x；默认 1x。
- 代码块默认跳过（可设置"念代码"）。
- 多条 reply 自动接续；切换话题停止。

### 3.21 工具调用展示 · 展开 / 折叠

```
▦ Claude Code
┌─────────────────────────────────────────────────┐
│  我先读一下字段字典...                            │
│                                                  │
│  ┌─────────────────────────────────────┐        │
│  │ 🔧 read_file    ✓ 完成 · 0.3s   ▾   │        │  ← 默认折叠
│  ├─────────────────────────────────────┤        │
│  │ 参数:                                │        │
│  │   path: "docs/03_字段指引/merchant" │        │
│  │                                     │        │
│  │ 结果: (展开查看 2.1 KB)              │        │
│  └─────────────────────────────────────┘        │
│                                                  │
│  好的，根据字段定义，我写出 SQL：                  │
└─────────────────────────────────────────────────┘
```

- Tool call 渲染为**内联卡片**（`--color-gray-100` 底 + `--color-gray-border` 边框）。
- Header：工具图标 + 工具名 + 状态 + 耗时 + 展开按钮。
- 默认折叠到 header only（32px 高）。
- 展开后显示：参数 JSON pretty + 结果（≤ 2KB 全显，> 2KB 折叠 + 复制按钮）。
- 状态：`⟳ 执行中 (带 spinner)` / `✓ 完成` / `✗ 失败 (--color-delete-red)` / `⚠ 被拒绝`。
- 失败时 result 自动展开显示错误。
- 连续多个 tool calls 可合并为"工具链"组，group header 显示"调用了 3 个工具 (共 1.2s) ▾"。

### 3.22 错误态

**Runtime Offline**：

```
▦ Claude Code
┌──────────────────────────────────────────────┐
│  ⚠ Claude Code 已离线                         │
│                                              │
│  本机 Host 已经 12 秒没有心跳。                 │
│  你的消息将保存为待处理，恢复后手动重试。       │
│                                              │
│  [🔄 重新连接]     [查看 Host 日志 →]          │
└──────────────────────────────────────────────┘
(整个 bubble --color-red-bg 底, --color-delete-red 边框)

Agent rail 图标:
  ▦ ← 灰态 + 红色小点
```

**网络异常（SSE 断开）**：

```
顶部 toast-bar (--color-red-bg 底, 48px 高):
┌──────────────────────────────────────────────────────┐
│  ⚠ 网络连接中断  已重试 2 次，3 秒后再试  [重试 →]   │
└──────────────────────────────────────────────────────┘
```

**Auth 失败 (401 / JWT 过期)**：

```
┌─────────────────────────────────────────┐
│  🔐 登录已过期                           │
│                                         │
│  请重新登录以继续查看历史消息。           │
│                                         │
│              [重新登录]                  │
└─────────────────────────────────────────┘
```

- 这是全屏遮罩，不允许继续读数据（C2 授权边界）。

**通用原则**：
- 错误文案"说人话"：说明发生了什么 + 下一步动作。
- 不出现 `undefined` / `[object Object]` / 技术 stack trace（折叠进 "技术详情 ▸"）。
- 所有错误 `role="alert"` + `aria-live="assertive"`。

---

## 4. 关键 State Machine

### 4.1 Message Bubble

```
drafting → sending → queued → thinking → streaming → completed
                        │                    │      ↓
                     (host offline)       (stop)  cancelled
                        ↓                         failed
                     pending ──retry──▶ queued
```

### 4.2 Runtime Status

```
not_installed ─安装→ updating ─detect→ needs_login ─login→ online
                        │                                     ↑↓ heartbeat
                        ├──probe ok──────────────────────────▶│
                                                          offline
任一状态 probe error → error (红点, 提示查日志)
```

### 4.3 Session

```
active ⇄ archived
   └── delete (with confirm) → deleted (tombstone 7d, 然后 purge)
```

---

## 5. 响应式与密度

- **XL (≥1440)**：三层左栏 + artifact 面板可并排
- **L (1024-1440)**：三层左栏，artifact slide-in overlay
- **M (768-1024)**：Session list 折叠成顶部下拉
- **S (<768)**：只留 chat，汉堡打开

**密度**（设置可切）：Compact / Normal（默认）/ Loose —— 调 bubble padding、行高、间距。

---

## 6. 不可用 / Loading / Error 视觉

- **Disabled**：opacity 0.4 + `cursor: not-allowed` + 去除 hover 反馈
- **Loading (按钮)**：Spinner 12px + 文字替换"处理中..." + disabled
- **Loading (区域)**：Skeleton `--color-gray-100` + shimmer（`prefers-reduced-motion` 下静态）
- **Empty**：灰色单线条插画 + 一行说明 + 一个主 CTA
- **Error (inline)**：`--color-red-bg` 底 + `--color-delete-red` 4px 左竖条 + 重试按钮
- **Error (block)**：全屏 / 模态（如 Auth 失败）
- **Success (toast)**：`--color-red-bg` 底 + 绿左竖条，3s 自动消失

---

## 7. A11y 清单（WCAG 2.1 AA）

### 7.1 键盘

| 快捷键 | 作用 |
|---|---|
| `⌘K` / `Ctrl+K` | 全局搜索 |
| `⌘N` / `Ctrl+N` | 新话题 |
| `⌘\` | 切换 session list 折叠 |
| `⌘1..4` | 切 4 个 runtime |
| `Enter` | 发送消息 |
| `Shift+Enter` | 换行 |
| `Esc` | 停止流式 / 关闭模态 / 移除最近附件 |
| `↑` (输入框空) | 编辑上一条用户消息 |
| `Space` (press) | 语音 hold-to-talk |
| `← / →` | lightbox 切图 |
| `+ / - / 0` | lightbox 缩放 |
| `Tab` / `Shift+Tab` | 有序 focus |

### 7.2 屏幕阅读器

- Agent rail 图标 → `role="tab" aria-label="Claude Code, 在线"`。
- 消息气泡 → `role="article" aria-label="Claude Code 于 09:42 回复"`。
- 流式中 → `aria-live="polite" aria-atomic="false"` 实时广播（每 2s 节流）。
- 错误 → `role="alert" aria-live="assertive"`。
- 代码块 → `role="region" aria-label="sql 代码"`。
- 工具调用 → `role="group" aria-label="工具调用: read_file"`。

### 7.3 视觉

- 所有文字颜色对比度 ≥ 4.5:1；图标按钮 ≥ 3:1。
- Focus ring 2px solid `--color-red` offset 2px，不依赖颜色单一载体（叠 outline + box-shadow）。
- `prefers-reduced-motion: reduce` → 关闭流式光标、skeleton shimmer、smooth scroll、spinner rotation 改为 pulse。
- `prefers-color-scheme: dark` → 暖黑模式（`--color-off-white: #1a1816`，`--color-gray-800: #e9e6d9`），保持三色铁律。
- 支持浏览器缩放到 200%，布局不破。

---

## 8. 与 cowork / Multica 差异化 · 待确认 · 交付

**差异化要点**：QRClaw 是"本机多 agent 控制台"，runtime/host/project 是一等概念（三层左栏显式呈现）；cowork / Multica 是 cloud agents，session 级抽象。runtime 状态从"在线/离线"扩展为六态；视觉走浅色中性底 + QRClaw 红色品牌体系，禁新增蓝紫 token；tool call 与 artifact 回流联动。

**待确认**：
1. 语音 STT 默认走 Web Speech API，设置里可切 Whisper 服务端。
2. TTS 默认系统 TTS（macOS `say` / Edge TTS），避免云端暴露面。
3. 代码块暖黑底（需要时可做深浅两套 token）。
4. @mention 跨 runtime → "新 session + 引用"（依赖 M2 转交能力）。
5. 工具调用权限：agent 级持久 + session 级临时覆盖。
6. 搜索第三段"项目文件"在 Sprint 3 project context 落地前隐藏。

**交付清单（UI 组件 · P0 必做）**：
- AgentRail（72px, 4 runtime + 六态） · SessionList（搜索 + 未读 + 归档） · ChatHeader · ChatComposer（LobeChat 抽取）· MessageBubble（user/agent/system）· MarkdownRenderer（LobeChat）· ToolCallCard · FilePreviewCard · ErrorBanner / Toast · SessionCreateModal。
- **P1**：ImageLightbox · InstructionsEditor（Monaco）· VoiceRecorder（hold-to-talk + waveform）· TTSPlayer（高亮跟读）· GlobalSearch（`cmdk`）。

---

> **签字**：本 spec 覆盖 22 个场景全部 wireframe + state machine + token + A11y；继承 QRClaw v1 token SSoT；为 Wave 10 Sprint 2/3 UI 实现提供设计基准。
