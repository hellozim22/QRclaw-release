# W10-R1 对话 UI 开源组件调研

> 数据口径：2026-04-28 通过 `npm view`、公开 GitHub/文档检索核对。当前 Multica workspace 未提供 `docs/agent-chat-ui-research-report.md`，因此本报告未能继承该必读报告中的项目约束。

## 结论摘要

- 可直接复用的候选超过 10 个；其中 UI 主干优先看 `@assistant-ui/react`、`@lobehub/ui`、`shadcn-chat`、`@copilotkit/react-ui`。
- 数据/流式层优先看 `ai` + `@ai-sdk/react`，它不是完整 UI，但能省掉 streaming、message state、tool-call plumbing。
- Markdown/代码/图表/附件/图片预览/语音可拆成独立能力包，组合式接入的 LOC 收益更可控。
- `Cowork` 是参考产品，不是可复用库；未找到公开 UI 技术栈，不能计入可安装组件。

## 候选清单

| 候选 | 安装命令 | 主要可吃能力 | LOC 收益估算 | 集成复杂度 | License | Next 16 / React 19 兼容 |
|---|---|---|---:|---|---|---|
| assistant-ui | `npm install @assistant-ui/react @assistant-ui/react-ui @assistant-ui/react-markdown` | Chat thread、composer、markdown、运行时适配 | 1200-2500 | 中 | MIT | 高：peer `react ^18 || ^19`；Next 需 client component 包裹交互区 |
| `@ai-sdk/react` + `ai` | `npm install ai @ai-sdk/react` | 流式消息、tool call、transport、状态 hook | 500-1000 | 中 | Apache-2.0 | 高：`@ai-sdk/react` peer 覆盖 React 18/19；适合 Next App Router |
| LobeChat `@lobehub/ui` | `npm install @lobehub/ui antd @lobehub/icons @lobehub/fluent-emoji motion` | AI 风格组件、markdown、Mermaid、code、图片/编辑器周边 | 800-1800 | 高 | MIT | 高但重：peer `react ^19`、`antd ^6`；需接受 antd-style/主题体系 |
| shadcn-chat | `npx shadcn-chat-cli add --all` | 可复制 chat components、message list、input、actions | 500-1200 | 低-中 | MIT | 中：面向 React/Next + shadcn/ui；公开信息提示维护不活跃，Next 16 需 smoke test |
| `@fluentui/react-components` | `npm install @fluentui/react-components` | Button/Input/Dialog/Toast/Avatar 等通用 UI | 300-900 | 中 | MIT | 高：peer `react >=16.14 <20` |
| Markdown 渲染包 | `npm install react-markdown remark-gfm rehype-highlight remark-math rehype-katex katex` | GFM、代码块、数学公式、KaTeX | 400-900 | 低 | MIT | 高：`react-markdown` peer `react >=18` |
| `react-shiki` | `npm install react-shiki shiki` | 代码高亮、主题、AST 到 React | 200-500 | 低 | MIT | 高：peer `react >=16.8` |
| Mermaid | `npm install mermaid` | 流程图、时序图、架构图渲染 | 300-800 | 中 | MIT | 中：无 React peer；Next 需 dynamic import / client-only |
| `react-dropzone` | `npm install react-dropzone` | 轻量拖拽上传、文件选择、accept 校验 | 200-450 | 低 | MIT | 中：peer 未显式列 React 19，但 `>=16.8` hook 形态通常可用；需 peer warning 检查 |
| `@uppy/react` | `npm install @uppy/core @uppy/dashboard @uppy/react @uppy/status-bar` | Dashboard、断点/多源上传、进度、摄像头/屏幕扩展 | 600-1500 | 高 | MIT | 高：peer `react ^18 || ^19` |
| `react-photo-view` | `npm install react-photo-view` | 图片预览、缩放、轮播灯箱 | 150-350 | 低 | Apache-2.0 | 高：peer `react >=16.8` |
| `@livekit/components-react` | `npm install livekit-client @livekit/components-react` | 音视频房间、设备选择、通话控件、状态 | 1000-2500 | 高 | Apache-2.0 | 高：peer `react >=18`；Next 需 client-only |
| OpenAI realtime agents | `npm install @openai/agents @openai/agents-realtime zod` | RealtimeAgent/Session、语音 agent、handoff、tools | 800-2000 | 高 | MIT | 中：不是 React UI 包；浏览器/WebRTC 可接 React，Node 要求较新运行时 |
| CopilotKit | `npm install @copilotkit/react-core @copilotkit/react-ui @copilotkit/runtime zod` | Copilot sidebar/chat、agent state、tool/action rendering | 800-1800 | 中-高 | MIT | 高：React UI peer `^18 || ^19`；runtime 依赖后端适配 |
| Cowork | 无可安装命令 | 任务委派式交互参考、非库 | 不计 | 不适用 | 未公开 | 不适用：未发现公开前端栈或可复用组件 |

## 能力矩阵

符号：`●` 直接覆盖，`◐` 可覆盖但需 glue code，`-` 不覆盖。

| 能力 × 库 | assistant-ui | AI SDK | Lobe UI | shadcn-chat | Fluent UI | MD bundle | Shiki | Mermaid | Dropzone | Uppy | PhotoView | LiveKit | OAI realtime | CopilotKit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Chat shell/message list | ● | ◐ | ● | ● | ◐ | - | - | - | - | - | - | - | - | ● |
| Composer/textarea/action bar | ● | ◐ | ● | ● | ◐ | - | - | - | - | - | - | - | - | ● |
| Streaming state/hooks | ◐ | ● | ◐ | - | - | - | - | - | - | - | - | - | ◐ | ● |
| Tool call / agent action UI | ◐ | ● | ◐ | ◐ | - | - | - | - | - | - | - | - | ● | ● |
| Markdown/GFM | ● | - | ● | ◐ | - | ● | - | - | - | - | - | - | - | ● |
| Code highlight | ◐ | - | ● | ◐ | - | ● | ● | - | - | - | - | - | - | ● |
| Math | ◐ | - | ● | - | - | ● | - | - | - | - | - | - | - | ● |
| Mermaid/chart | - | - | ● | - | - | - | - | ● | - | - | - | - | - | - |
| 文件上传 | ◐ | ◐ | ◐ | ◐ | - | - | - | - | ● | ● | - | - | - | ◐ |
| 图片预览 | ◐ | - | ◐ | - | - | - | - | - | - | - | ● | - | - | - |
| 语音/实时通话 | - | - | - | - | - | - | - | - | - | - | - | ● | ● | ◐ |
| 企业通用 UI | - | - | ◐ | ◐ | ● | - | - | - | - | - | - | - | - | - |

## 推荐组合数据

> 这里只给数据组合，不做最终方案决策。

| 组合 | 包含 | 为什么可复用 | 估算总 LOC 收益 | 主要代价 |
|---|---|---|---:|---|
| 轻量 chat 核心 | `@assistant-ui/react` + `@assistant-ui/react-ui` + `@ai-sdk/react` | UI shell 与流式 hook 都有现成抽象，React 19 peer 明确 | 1700-3500 | 需要把现有消息 schema 映射到 assistant-ui runtime |
| shadcn 复制型 | `shadcn-chat` + `ai` + markdown bundle | 代码进仓可控、样式贴近 Tailwind/shadcn 项目 | 1000-2200 | 上游维护不活跃，升级成本转移到本地 |
| Lobe 重型 AI UI | `@lobehub/ui` | 内置 AI 场景组件多，Markdown/Mermaid/Shiki 生态已打包 | 1500-3000 | 依赖 antd 6、主题体系重，和既有设计系统冲突风险高 |
| Copilot/agent UI | `@copilotkit/react-ui` + `@copilotkit/runtime` | agent action、tool rendering、copilot sidebar 直接可吃 | 1200-2600 | 需要 runtime/API 层配合；可能引入 GraphQL/AG-UI 生态 |
| 内容增强层 | markdown bundle + `react-shiki` + `mermaid` + `react-photo-view` | 可独立塞进任何 chat message renderer | 1050-2550 | Mermaid 需 client-only 和安全渲染策略 |
| 附件上传层 | `react-dropzone` 或 `@uppy/react` | 轻量上传选 dropzone；复杂多源/进度选 Uppy | 200-1500 | Uppy 重，dropzone 需自建上传状态机 |
| 语音层 | `@livekit/components-react` 或 `@openai/agents-realtime` | LiveKit 吃通话 UI；OpenAI 吃 realtime agent/session | 1000-2500 | 都不是纯 chat UI，需权限、token、音频状态处理 |

## 弃用/暂缓依据

- `Cowork`：只能作为交互参考；没有公开可安装 UI 库、License、peer deps 或组件 API。
- `openai-realtime-agents`：公开 repo 是 demo 名称，不是 npm 包；npm 可装的是 `@openai/agents-realtime`。它解决 realtime agent，不解决 chat UI。
- `shadcn-chat`：仍可直接吃，但公开仓库提示维护不活跃；适合作为一次性复制模板，不适合作为长期升级依赖。
- `@lobehub/ui`：能力强但依赖体系重；如果项目不用 antd/antd-style，集成复杂度明显高于 assistant-ui。
- `@uppy/react`：上传能力完整但重量级；只需要聊天附件拖拽时，`react-dropzone` 的 LOC 收益/复杂度比更高。

## 可直接落地优先级

1. **先验证**：`@assistant-ui/react`、`@ai-sdk/react`、markdown bundle、`react-dropzone`、`react-photo-view`。
2. **按需验证**：`react-shiki`、`mermaid`、`@copilotkit/react-ui`、`@livekit/components-react`。
3. **谨慎验证**：`@lobehub/ui`、`@uppy/react`、`@openai/agents-realtime`、`shadcn-chat`。

## 兼容性速记

- React 19 peer 明确支持：assistant-ui、AI SDK React、Lobe UI、Fluent UI、Uppy、CopilotKit。
- React 19 大概率可用但需 smoke test：react-markdown bundle、react-shiki、react-photo-view、LiveKit、Mermaid、react-dropzone。
- Next 16 重点风险不在 React peer，而在 SSR/RSC：Mermaid、LiveKit、OpenAI realtime、所有浏览器音视频/DOM 重组件都应隔离为 client component。
