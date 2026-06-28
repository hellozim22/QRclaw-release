# Wave 10 R2 UX Review 补充

> 日期：2026-04-28  
> 审查对象：`docs/wave10/r2-ux-design-full.md`  
> 参考：`r2-c5-onboarding-final.md`、`r2-c3-final-tech-stack.md`、`design/design-tokens.css`、`qrclaw-visual`、Cowork / Multica 产品参考

## 0. 结论

`r2-ux-design-full.md` 的覆盖面足够宽：22 个场景把流式、Markdown、文件、图片、语音、session、tool call、错误态和 A11y 都纳入了。

但有 4 个落地风险必须在进入实现前收敛：

1. **Token 不可直接落地**：正文大量使用 `--surface-canvas` / `--accent-brand` / `--text-primary` 等 v2 token，但当前 SSOT `design/design-tokens.css` 和 `qrclaw-visual` 明确使用 `--color-*` 命名空间，且禁止引用这些已回滚 v2 token。
2. **主路径仍混入底层术语**：wireframe 里直接展示 Runtime / binary path / `qrclaw-host pair`，与“用户界面不突出 runtime / host token”的要求有冲突。
3. **缺少迁移 / 回退态**：没有明确 `/messages` → `/chat` 的兼容、QRcode 旧入口保留、旧会话迁移、恢复失败等场景。
4. **A11y 方向正确但还不够可执行**：有总清单，缺每个复杂组件的 focus trap、SR 文案、键盘顺序、禁用态语义。

建议：保留 22 场景主体，但补充本文的 6 个场景和 token 对齐表；实现前先做一次 token 决策，避免 UI 代码引用不存在的变量。

## 1. 覆盖审查

### 1.1 已覆盖得比较好的场景

| 能力 | 对应场景 | 评价 |
|---|---|---|
| 首屏 4 runtime 槽位 | 3.1 / 3.2 / 3.3 | 覆盖“不要空列表”，但文案需弱化 runtime 术语 |
| 核心 Chat | 3.4 / 3.5 / 3.6 / 3.7 | 流式、代码块、表格、LaTeX、Mermaid 比较完整 |
| 文件图片 | 3.8 / 3.9 / 3.10 | 覆盖拖拽、粘贴、lightbox，但缺上传失败后的消息级恢复 |
| Session 管理 | 3.14 - 3.17 | 新建、切换、搜索、归档删除都有 |
| 语音 | 3.19 / 3.20 | 输入和 TTS 都有，但云端隐私边界需补文案 |
| Tool call | 3.21 | 内联折叠卡片方向正确 |
| 错误态 | 3.22 | offline / SSE / auth 都有基本线框 |
| A11y | 0.3 / 7 | 有基线，但需落到组件验收 |

### 1.2 漏掉的场景（需补线框图）

#### 场景 A：`/messages` 与 `/chat` 合并 / 旧入口跳转

问题：用户反馈里明确有 `messages/chat` 合并，当前 UX 默认写 `/chat`，但没有说明旧 `/messages`、左侧旧入口、书签 URL 怎么处理。

```text
用户访问旧 URL: /messages 或 /dashboard/messages

┌──────────────────────────────────────────────────────────────┐
│ QRClaw                                                       │
├──────────────────────────────────────────────────────────────┤
│ 正在打开新版 Chat...                                         │
│                                                              │
│ 旧的 Messages 已合并到 Chat。                                │
│ 我们会自动带你进入最近一次 Agent 会话。                      │
│                                                              │
│ [立即进入 Chat]                                              │
└──────────────────────────────────────────────────────────────┘
```

落地建议：
- `/messages` 做 302 / client redirect 到 `/chat`，保留 query：`?session_id=...`。
- 旧导航文案统一为 `Chat`，不要同时出现 `Messages`。
- 旧 visitor 消息入口如果仍需保留，应放在 `公开入口 / 分享` 下，不与 Owner Agent Chat 混在一起。

#### 场景 B：Pairing 授权页，不展示 host token

问题：3.1 空态展示 `qrclaw-host pair` 命令可以接受，但不能回到“复制 host token”心智。需要补 `/pair` 授权页。

```text
/pair?code=ABC-123-XYZ

┌───────────────────────────────────────────────┐
│ 授权这台设备                                  │
├───────────────────────────────────────────────┤
│ MacBook-Pro-of-zimzheng                       │
│ 请求连接到你的 QRClaw 账号。                  │
│                                               │
│ 连接后它可以检测本机 Claude / Cursor / Codex。│
│ 它不会把 host token 显示给你，也不会写明文日志。│
│                                               │
│ [拒绝]                         [授权这台设备] │
└───────────────────────────────────────────────┘
```

落地建议：
- 主流程只显示 pairing code + 设备名 + 授权 / 拒绝。
- host token 仅放高级调试页，并默认隐藏。
- 授权成功后回 `/chat`，右上 toast：`这台设备已连接，正在扫描本机 CLI`。

#### 场景 C：QRCode / 公开入口冷冻保留

问题：Wave 10 要 pivot 到 Agent Chat，但旧 QRCode 不能消失。当前 UX 只在 rail 里放了 `Projects`，没有交代 `My QRcode` 的降级位置。

```text
左侧导航:

Chat
Agents
公开入口 / 分享
Settings

公开入口 / 分享:
┌───────────────────────────────────────────────┐
│ 已发布的 QR / Share Link                       │
│                                               │
│ 这里保留旧 QRClaw 访客入口。                  │
│ 新的 Owner 私聊 Agent 不会自动发布给访客。    │
│                                               │
│ [查看旧 QR]  [将某个 Agent 发布为 QR]          │
└───────────────────────────────────────────────┘
```

落地建议：
- 不把旧 QRCode 放进 Chat session list。
- `Publish as QR` 是 Agent 详情页的后续动作，不是新建 Chat 的默认步骤。
- Visitor 旧链路应在 E2E 中作为回归，不参与 Owner Chat 主流程。

#### 场景 D：完整对话恢复 / 历史重建中

问题：3.22 有网络异常 toast，但没有“刷新后正在从 encrypted history 恢复完整对话”的可见状态。用户反馈强调完整对话，C5 也要求回放。

```text
用户刷新正在流式的 session:

┌──────────────────────────────────────────────────────┐
│ Claude Code / PRD 补完                               │
├──────────────────────────────────────────────────────┤
│ 正在恢复对话...                                      │
│ 已恢复 12 条历史消息，正在补齐刚才中断的回复片段。   │
│                                                      │
│ [刷新历史] [查看技术详情]                            │
├──────────────────────────────────────────────────────┤
│ User: ...                                            │
│ Assistant: ...（恢复中的最后一条显示 skeleton）       │
└──────────────────────────────────────────────────────┘
```

落地建议：
- 首屏先展示历史消息，再在最后一条 reply 位置显示恢复中 skeleton。
- 文案只说“恢复对话”，不要说“解密消息”。
- 失败时显示：`恢复失败，请重新登录或重试`，不能空白。

#### 场景 E：Full Access / 工具权限确认

问题：Cowork 类产品强调文件访问和操作确认；Multica 类产品强调本机 runtime。当前 UX 有 tool call 展示，但缺“这个本地 agent 可能读写文件”的明确确认。

```text
创建 / 编辑本地 Agent:

┌───────────────────────────────────────────────┐
│ Full Access 确认                              │
├───────────────────────────────────────────────┤
│ Claude Code 可能读取 / 写入这台设备上的文件， │
│ 并根据你的指令运行命令。                      │
│                                               │
│ 当前仅你本人在私聊中可以触发；访客 QR 不可用。│
│                                               │
│ ☐ 我理解并授权这个 Agent 使用本机能力          │
│                              [取消] [确认启用]│
└───────────────────────────────────────────────┘
```

落地建议：
- 默认 agent 若开启高权限，也要有一次性确认或清晰的设置入口。
- 危险 tool call（删除、覆盖、提交、推送）应支持审批卡片，而不是只展示完成结果。

#### 场景 F：附件上传失败 / C2 安全提示

问题：3.8 有“上传失败 [重试]”，但缺失败后对消息发送状态和安全边界的说明。

```text
输入框上方:

┌───────────────────────────────────────────────┐
│ report.pdf                       上传失败      │
│ 网络中断，文件尚未发送给 Agent。              │
│ [重试上传] [移除]                              │
└───────────────────────────────────────────────┘

发送按钮 disabled:
请先处理失败附件
```

落地建议：
- 附件未上传成功前禁止发送。
- 大图不走 base64 进入 chat body；只发送 `file_id` / 签名 URL 引用。
- 错误详情不得显示 signed URL、JWT、DEK/KEK。

## 2. Token 对齐建议

### 2.1 当前冲突

`r2-ux-design-full.md` 里的 token 方向：

```css
--surface-canvas
--surface-card
--text-primary
--accent-brand
--focus-ring
```

当前项目 SSOT：

```css
--color-red
--color-red-bg
--color-visitor-bubble
--color-gray-800
--color-gray-500
--color-gray-border
--color-green
--font-primary
--space-*
--radius-*
```

`qrclaw-visual` 明确要求：不要引用 `--surface-canvas` / `--accent-brand` / `--text-primary` / `--font-sans` / `--font-serif`。因此 UX spec 的 token 不能直接交给前端实现。

### 2.2 短期映射表（不改 SSOT）

| UX spec token | 当前可用 token | 备注 |
|---|---|---|
| `--surface-canvas` | `--color-off-white` | 当前不是暖白，但可作为页面浅底临时映射 |
| `--surface-card` | `--color-white` | 卡片 / agent bubble |
| `--surface-sunken` | `--color-gray-100` | 输入框 / 代码外壳浅底 |
| `--text-primary` | `--color-gray-800` | 主文字 |
| `--text-muted` | `--color-gray-700` | 次级文字 |
| `--text-subtle` | `--color-gray-500` | placeholder / disabled |
| `--border-subtle` | `--color-gray-border` | 通用边框 |
| `--accent-brand` | `--color-red` | 当前品牌主色仍是红，不是微信绿 |
| `--accent-brand-soft` | `--color-red-bg` | 激活底 / 弱强调 |
| `--bubble-user` | `--color-visitor-bubble` | 用户气泡 |
| `--danger` | `--color-delete-red` | 破坏性动作 |
| `--danger-soft` | `--color-red-bg` | 错误弱底，不够语义化但可复用 |
| `--focus-ring` | 建议新增 `--color-focus-ring` | 当前没有专用 focus token |
| `--code-bg` | 建议复用 / 新增代码块 token | `globals.css` 已有运行时代码色差异，需回写 SSOT |

### 2.3 两个可选决策

**推荐 A：保持当前红色品牌体系。**

- UX spec 把 `accent-brand` 改成 `color-red` 语义。
- 在线状态继续用 `--color-green`，但主 CTA / 激活态仍用红。
- 最小改动，和 `design/design-tokens.css`、截图、现有 UI 一致。

**备选 B：正式升级到 v2 暖中性 + 绿色主色。**

- 先更新 `design/design-tokens.css`，再同步 `web/src/app/globals.css`。
- 同步更新 `qrclaw-visual`，移除“v2 token 禁用”红线。
- 需要重新审查现有截图和组件，工作量不应混进 Wave 10 Chat 实现。

建议本轮选 A；如果产品坚持绿色主色，单开视觉升级任务。

## 3. A11y 补强建议

现有 A11y 章节方向正确，但实现验收还要补这些具体项：

| 组件 | 必补验收 |
|---|---|
| Agent rail | `role="tablist"`；每个 agent `role="tab"`；`aria-selected` 与视觉选中同步 |
| Session list | 可用上下箭头移动；右键菜单也要支持 `Shift+F10` / Menu key |
| Chat message | 每条 `role="article"`；复制 / 重生成为同一气泡内可聚焦按钮 |
| Streaming | SR 广播 2s 节流；不要每个 token 都读屏 |
| Composer | 附件失败时 `aria-describedby` 指向错误文案；空输入 send disabled 有原因 |
| Modal / lightbox | focus trap；Esc 关闭；关闭后 focus 回触发元素 |
| Tool call card | 折叠按钮 `aria-expanded`；失败状态 `role="alert"` |
| Full Access confirm | checkbox 未勾选时确认按钮 disabled，并说明原因 |

## 4. 用户反馈 8 条映射

| 用户反馈 / 要求 | 当前覆盖 | 缺口 / 建议 |
|---|---|---|
| `messages/chat` 合并，默认进入 Chat | 3.2 / 3.3 写了 Chat 首屏 | 补场景 A：旧 `/messages` redirect、导航去重 |
| 不要 host token 贴板主流程 | 3.1 有 pair 命令，C5 明确不展示 token | 补场景 B：`/pair` 授权页；host token 只进高级调试 |
| 不要空白 / 空列表 | 3.1、3.2 覆盖 4 runtime 槽位 | 错误恢复失败也要防空白，补场景 D |
| QRCode 不再是主线但不能破坏 | 未明确 | 补场景 C：`公开入口 / 分享` 冷冻保留 |
| 完整对话体验 | 3.4 - 3.17 覆盖主体 | 补恢复中、旧会话迁移、附件失败后的状态 |
| 流式 + Markdown + 代码表格 | 3.5 - 3.7 覆盖 | 与 C3 assistant-ui 技术选型一致，P0 可落地 |
| 文件 / 图片 / 语音 | 3.8 - 3.10、3.19 - 3.20 覆盖 | 补附件失败、隐私边界、云 TTS opt-in 文案 |
| 真 runtime / 语义验收 | UX 有 runtime 状态，C6 有 E2E | UX 需要把 E2E 可观测状态显式化：online、run_id、恢复、失败原因 |

## 5. 最终改动建议

1. 在 `r2-ux-design-full.md` 的 token 章节前加警告：当前 token 名为设计提案，落地前必须按 `design/design-tokens.css` 映射。
2. 追加本文 6 个补充场景，尤其是 `/messages` 兼容、`/pair` 授权、QRCode 冷冻入口、完整对话恢复。
3. 把“Runtime”在用户文案中降级为“本机 Agent / 底层能力”，只在技术详情里出现 runtime。
4. A11y 从总则升级为组件级验收表，纳入 Sprint 验收。
5. Token 决策优先选“当前红色体系”，不要在 Chat 实现里顺手引入绿色主色。
