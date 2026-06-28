# Wave 10 Sprint 1 · Runtime UI + Onboarding — Component API

> 2026-04-28 · `web/src/components/chat/*`
> Input: `docs/wave10/r2-c5-onboarding-final.md`, `docs/wave10/r3-token-mapping.md`
> Layout: `/chat` = `80px rail` + `320px sessions` + fill

## 0. 依赖与约束

- Tailwind v4 + React 19 (`'use client'` 组件).
- 所有颜色 / 字号 / 圆角 / 阴影 / 间距 **必须**来自 `design/design-tokens.css`
  v1 命名空间；禁止使用 `r2-ux-design-full.md` 草案中的 `--surface-*`、
  `--text-*`、`--accent-*`、`--bubble-*`、`--focus-ring` 等 token。
- Rail 宽度 `80px` 当前 SSoT 无专用 token，本轮写为字面值；如果后续需要，单开
  token 升级任务后再替换。
- 所有组件为 **controlled / 纯展示**，状态下沉到 `/chat/page.tsx` 的本地 state
  或 `owner-agent-chat-store`；组件内不直接访问 gateway、zustand 或 supabase。
- A11y：每个可点击元素都有 `aria-label` 或可读文字，focus outline 统一走
  `2px solid var(--color-red)` + `outline-offset: 2px`。

---

## 1. `AgentCard`

展示单个 agent / runtime 槽位。两种形态：

| 模式 | 用途 | 外观 |
|---|---|---|
| `compact` | 左栏 `AgentRuntimeRail` 的 48×48 方块 | 圆角方块 + 右下状态点 |
| 默认 | session list 中的一行 agent | 左边 3px 选中条 + 名称 + 状态 |

### Props

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | `string` | ✓ | agent_id，或 rail 模式下未预建时用 `provider` 作 fallback |
| `name` | `string` | ✓ | 展示名（如 `Claude Code`） |
| `provider` | `OwnerAgentProvider` | ✓ | `openclaw \| claude \| cursor \| codex`，驱动 avatar 缩写 |
| `avatarUrl` | `string \| null` | ✗ | 有则优先用图 |
| `runtimeStatus` | `RuntimeStatus` | ✓ | `online \| offline \| needs_login \| not_installed \| updating \| error` |
| `selected` | `boolean` | ✗ | 是否为当前选中 agent |
| `disabled` | `boolean` | ✗ | 置灰 + 不可点 |
| `hint` | `string` | ✗ | 替换默认状态描述（如 `claude 1.2.3`） |
| `onSelect` | `(id: string) => void` | ✗ | 点击回调 |
| `compact` | `boolean` | ✗ | 切换到 rail 缩略模式 |

### 导出

同文件还导出 `StatusDot`（独立状态圆点）与 `RuntimeStatus` 类型，供
`OnboardingEmptyState`、`AgentRuntimeRail` 复用。

### 状态颜色

`online → --color-green`、`offline/not_installed → --color-gray-500`、
`needs_login/updating → --color-warning`、`error → --color-delete-red`。

---

## 2. `AgentRuntimeRail`

左栏 80px 永久展示 4 个默认 runtime 槽位（`r2-c5 §3/§4/§5`）。

### Props

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `slots` | `RuntimeSlot[]` | ✓ | 长度通常为 4，顺序=展示顺序 |
| `selectedAgentId` | `string \| null` | ✓ | 用于高亮 |
| `onSelectAgent` | `(agentId: string) => void` | ✓ | 点击已预建 agent |
| `onSelectUnavailable` | `(provider: OwnerAgentProvider) => void` | ✓ | 点击未安装/未登录槽位 |

### `RuntimeSlot`

```ts
interface RuntimeSlot {
  provider: OwnerAgentProvider;
  displayName: string;
  status: RuntimeStatus;
  agentId: string | null;     // 默认 agent 未预建时为 null
  avatarUrl?: string | null;
}
```

### 路由规则

- `status === 'online' | 'offline'` + `agentId != null` → 调 `onSelectAgent`
- `status === 'needs_login' | 'not_installed' | 'error' | 'updating'`
  或 `agentId == null` → 同时调 `onSelectAgent`（如有）并 `onSelectUnavailable`
  以展开右侧 `RuntimeInstallHint`

---

## 3. `SessionList`

中栏 `var(--web-middle-col-width)` 的 session 列表（§11/§12）。

### Props

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `sessions` | `SessionItem[]` | ✓ | 所有 session；按 `agentName` 分组 |
| `activeSessionId` | `string \| null` | ✓ | 当前 session id |
| `filterAgentId` | `string \| null` | ✗ | 非空时只展示该 agent 下的 session，并隐藏分组标题 |
| `canCreate` | `boolean` | ✗ | 默认 `true`，`false` 时 `+ New Session` 置灰 |
| `onSelect` | `(sessionId: string) => void` | ✓ | 切换 session |
| `onCreate` | `() => void` | ✓ | 创建新 session |
| `onRename` | `(sessionId: string, nextTitle: string) => void` | ✓ | 内联重命名提交 |
| `onArchive` | `(sessionId: string) => void` | ✓ | 归档（Wave 10 = 删除交互，不物理删除） |

### `SessionItem`

```ts
interface SessionItem {
  id: string;
  title: string;
  updatedLabel?: string;   // "2m" / "昨天" / "周一"
  isStreaming?: boolean;   // 当前有 in-flight SSE run
  agentId: string;
  agentName: string;
}
```

### 交互

- `+ New Session` 按钮：虚线边框 + 品牌红文字；hover 底色 `--color-red-bg`。
- 搜索：P0 仅按 `title` + `agentName` 做前端 filter。
- 重命名：铅笔图标进入 `<input>` 编辑模式；`Enter` 提交、`Esc` 取消、失焦提交。
- 归档：弹 `window.confirm`（Sprint 2 换设计系统 Modal），文案说明“历史保留”。

---

## 4. `OnboardingEmptyState`

右栏空状态 / 引导面板（§3/§4/§5）。

### Props

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `state` | `OnboardingState` | ✓ | `connected \| partial \| empty \| unauth` |
| `runtimes` | `OnboardingRuntimeRow[]` | ✓ | 显示的 runtime 状态列表 |
| `onlineCount` | `number` | ✓ | 顶部 `Runtime x/4` 角标 |
| `totalCount` | `number` | ✓ | 同上 |
| `onStartWithFirstOnline` | `() => void` | ✗ | 主 CTA：`开始使用 {provider}` |
| `onInstallHost` | `() => void` | ✗ | empty 态主 CTA：`下载 Mac App` |
| `onShowHomebrew` | `() => void` | ✗ | empty 态次 CTA：`Homebrew 命令` |
| `onSignIn` | `() => void` | ✗ | unauth 回落：`登录` |
| `children` | `ReactNode` | ✗ | 额外插槽（如 partial 态下挂 `RuntimeInstallHint`） |

### `OnboardingRuntimeRow`

```ts
interface OnboardingRuntimeRow {
  provider: OwnerAgentProvider;
  displayName: string;
  status: RuntimeStatus;
}
```

### 状态→视图映射

| `state` | 对应 Wireframe |
|---|---|
| `connected` | A：4/4 在线，主 CTA 开始对话 |
| `partial`   | C：混合状态，优先引导在线 agent |
| `empty`     | B：0/4，引导 Host 安装 |
| `unauth`    | 登录回落（防御性；正常流程由 middleware 处理） |

---

## 5. `RuntimeInstallHint`

单步安装 / 登录提示卡，一般渲染在右栏（§9/§13.2/§13.4）。

### Props

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `provider` | `OwnerAgentProvider` | ✓ | 驱动 `aria-labelledby` id |
| `status` | `Exclude<RuntimeStatus, 'online'>` | ✓ | 决定标题文案 |
| `displayName` | `string` | ✓ | 例如 `Codex` |
| `command` | `string` | ✓ | 单行命令（黑底代码块展示） |
| `docsUrl` | `string` | ✓ | `查看文档`  新 tab |
| `onRescan` | `() => void` | ✗ | 可选：触发 Host 重新扫描 |

### 安全约束

- **不在浏览器中执行任何本机命令**。主 CTA = 复制命令到剪贴板，次 CTA = 打开文档。
- 复制反馈：2 秒内按钮变成 `--color-green-text` 并显示“已复制”。

---

## 6. 三栏布局组装

`/chat/page.tsx` 负责：

1. 调 `useOwnerAgentChatStore.loadAgents()` 和
   `ensureOwnerWsSubscription()`（保持不变）。
2. 将 `agents[]` 按 `backend_provider` 合并到 4 个默认槽位；缺失槽位
   `status='not_installed' / agentId=null`，等 Host runtime inventory
   在 Sprint 2 回填。
3. 衍生 `onboardingState`（`empty/partial/connected`），决定右栏挂
   `OnboardingEmptyState`、`RuntimeInstallHint` 或 `ChatMessageBubble` +
   `ChatComposer`。
4. Session state **本地** `useState`（keyed by `agentId`），Sprint 2
   会替换为 gateway `/sessions` 持久化，现有组件接口不变。

---

## 7. 后续 TODO (Sprint 2+)

- `AgentRuntimeRail` 接受 host runtime inventory（Sprint 2 gateway 新端点），
  取代当前以 `statusByAgent` 近似 runtime status 的 hack。
- `SessionList` 接真实 `owner_agent_sessions` 端点 + 无限滚动。
- `OnboardingEmptyState` 的 `empty` 态按钮跳到 `/pair`（Host 配对页）。
- `RuntimeInstallHint` 支持 per-OS 命令切换（Mac/Linux/Brew/Tar）。
- 把 `window.confirm` 换成设计系统 Modal，文案改成“删除”但实际走 archive。
- 焦点管理：用专用 `FocusRing` component 消除重复的 `outline` inline style。

---

## 8. Token 使用清单（编译期可 grep 核对）

```
--color-red, --color-red-dark, --color-red-bg
--color-white, --color-off-white
--color-black
--color-gray-800, --color-gray-700, --color-gray-600, --color-gray-500
--color-gray-300, --color-gray-100, --color-gray-border
--color-dashboard-divider
--color-green, --color-green-text, --color-warning
--color-delete-red
--color-input-border
--font-primary, --font-mono
--text-xs, --text-sm, --text-md, --text-lg, --text-xl, --text-2xl
--font-normal, --font-medium, --font-semibold
--space-1, --space-2, --space-3, --space-4, --space-5, --space-6, --space-8, --space-10
--radius-sm, --radius-md, --radius-lg, --radius-xl, --radius-full
--shadow-sm, --shadow-card
--btn-height-primary, --btn-height-outline
--input-height
--web-middle-col-width
```

任何 PR 若在 `components/chat/AgentCard|AgentRuntimeRail|OnboardingEmptyState|RuntimeInstallHint|SessionList.tsx` 或
`app/(dashboard)/chat/page.tsx` 中引入不在上表的自定义颜色（hex / rgb），按
`r3-token-mapping.md §4` 视为违规。
