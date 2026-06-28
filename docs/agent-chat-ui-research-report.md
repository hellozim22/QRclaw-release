# Agent 对话 UI 技术调研报告

> 编写日期：2026-04-27

---

## 一、需求

为自研 Agent 系统提供完整的前端对话能力：

- 支持 Markdown 流式渲染（代码高亮、表格、LaTeX、Mermaid）
- 图片/文件上传与预览
- 语音对话与实时通话

---

## 二、推荐方案：Fork LobeChat

**GitHub：** https://github.com/lobehub/lobe-chat （50k+ stars，MIT 协议，可商用）

### 2.1 选择理由

LobeChat 是目前唯一一个 React 项目同时具备 Markdown 渲染 + 文件上传 + 语音通话能力，且均已打磨成熟：

- **Markdown 渲染业界最强** — 基于 react-markdown + unified 生态，支持 GFM 表格、Shiki 代码高亮、KaTeX 数学公式、Mermaid 流程图，流式输出不闪烁不重排
- **文件/图片** — 完整的拖拽上传、进度条、图片预览、文件卡片、格式校验、重试
- **语音** — 内置 TTS + STT，支持 OpenAI Realtime API 实时语音通话
- **MIT 协议** — 商用无任何限制，改了不用开源

### 2.2 项目结构

```
lobehub/lobe-chat
├── src/
│   ├── components/             ← 通用 UI 组件
│   │   └── mdx/               ← Markdown 渲染核心
│   ├── features/
│   │   ├── Conversation/       ← 对话主体（消息列表、气泡）
│   │   ├── ChatInput/          ← 输入框（文本 + 文件 + 语音）
│   │   └── FileManager/        ← 文件/图片管理
│   ├── services/               ← API 调用层 ← 【替换为 Agent API】
│   │   ├── chat.ts             ← 对话请求（流式 SSE）
│   │   ├── file.ts             ← 文件上传/下载
│   │   └── tts.ts              ← 语音合成
│   ├── store/                  ← 状态管理（Zustand）
│   └── libs/
│       └── agent-runtime/      ← LLM Provider 抽象层 ← 【改为 Agent 后端】
```

### 2.3 改造方式

核心改动集中在 `src/services/` —— 把 API 层对接到 Agent 后端即可：

```typescript
// src/services/chat.ts — 对话接口改为 Agent
export const chatService = {
  createAssistantMessageStream: async (params: {
    messages: Message[];
    files?: FileItem[];
  }) => {
    const response = await fetch('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.body; // SSE ReadableStream
  },
};

// src/services/file.ts — 文件存储改为自有服务
export const fileService = {
  uploadFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/agent/upload', {
      method: 'POST',
      body: formData,
    });
    return res.json(); // { url, fileId, name, size, type }
  },
};
```

### 2.4 模块裁剪

Fork 后删除不需要的模块，降低复杂度：

| 保留 | 删除 |
|---|---|
| Conversation（对话主体） | Agent Market（Agent 市场/发现页） |
| ChatInput（输入框） | Plugin System（插件市场） |
| FileManager（文件/图片） | Multi-Provider（多 LLM 切换） |
| TTS / STT（语音） | i18n 多语言（保留中文或英文即可） |
| Session（会话管理） | Theme Store（主题商店） |
| Markdown 渲染 | Knowledge Base（知识库管理，按需保留） |

UI 风格通过 CSS 变量 + Ant Design Token 调整，或逐步替换为自己的设计系统。

### 2.5 开发优先级

| 优先级 | 能力 | 说明 |
|---|---|---|
| **P0** | Markdown 流式渲染 | 对话核心体验，Fork 后即具备 |
| **P0** | 图片/文件上传与预览 | 改 services/file.ts 对接自有存储 |
| **P0** | Agent API 对接 | 改 services/chat.ts，SSE 流式协议 |
| **P1** | 语音输入/回复（STT + TTS） | LobeChat 内置，按需启用 |
| **P2** | 实时语音通话 | 接入 LiveKit，独立迭代 |

---

## 三、底层关键技术栈

LobeChat 的 Markdown 渲染底层是 `react-markdown` + unified 生态插件链，这也是 LibreChat 等主流项目共同使用的方案：

| 能力 | 插件 |
|---|---|
| GFM 表格/任务列表/删除线 | `remark-gfm` |
| 代码语法高亮 | `rehype-highlight` 或 Shiki |
| 数学公式 | `remark-math` + `rehype-katex` |
| Mermaid 图表 | 自定义 code 组件判断语言渲染 |
| 自定义元素映射 | `components` 属性覆盖为自己的 UI 组件 |

`react-markdown`（MIT 协议）是纯渲染库，unified 生态有 200+ 现成插件，扩展性极强。后续如需新增 Markdown 能力（如 @mention、自定义卡片），只需写一个 remark 插件。

---

## 四、语音能力

| 层级 | 推荐方案 | 说明 | 优先级 |
|---|---|---|---|
| 语音输入（STT） | LobeChat 内置 | Web Speech API 或接 Whisper | P1 |
| 语音回复（TTS） | LobeChat 内置 | 支持 OpenAI TTS / Edge TTS | P1 |
| 实时语音通话 | **LiveKit** | WebRTC 低延迟双向通话 | P2 |

LiveKit 接入方式：

```bash
npm install @livekit/components-react livekit-client
```

- LiveKit Agents（后端框架）：https://github.com/livekit/agents （18k+ stars，Apache-2.0）
- LiveKit React 组件：https://github.com/livekit/components-js （Apache-2.0）
- Pipecat（备选）：https://github.com/pipecat-ai/pipecat （8k+ stars，BSD-2）

---

## 五、流式渲染注意事项

LobeChat 已处理以下所有 edge case，Fork 后无需额外处理：

| 问题 | 解决方案 |
|---|---|
| 代码块未闭合导致整段变成代码 | 检测未闭合的 ``` 并临时补全 |
| 表格渲染抖动 | CSS `table-layout: fixed` + 最小宽度 |
| LaTeX 公式半截渲染报错 | 检测未闭合的 `$`/`$$`，未闭合时暂不渲染 |
| 流式追加导致整组件 re-render | `useMemo` + `React.memo` 优化 |
| 链接/图片 URL 截断 | 检测未闭合的 `[]()` 语法，等完整再渲染 |

---

## 六、Agent 后端 SSE 协议建议

建议采用 OpenAI 兼容的 SSE 格式，LobeChat 原生支持无需额外适配：

```
data: {"choices":[{"delta":{"content":"你"},"index":0}]}

data: {"choices":[{"delta":{"content":"好"},"index":0}]}

data: [DONE]
```

这是业界事实标准，方便后续切换不同 LLM 后端。

---

## 七、验收标准

| 能力 | 标准 |
|---|---|
| 流式输出 | 首 token 显示延迟 < 200ms，输出过程无闪烁/重排 |
| Markdown | 代码块语法高亮 + 一键复制，表格自适应宽度，LaTeX 正确渲染 |
| 图片上传 | 支持拖拽/粘贴上传，上传中有进度提示，上传后可预览/放大 |
| 文件上传 | 支持常见格式（PDF/文档/表格），展示文件卡片（名称+大小+类型） |
| 语音输入（P1） | 点击麦克风按钮开始录音，松开后转文字发送 |
| 语音回复（P1） | Agent 回复支持点击播放语音 |
| 实时通话（P2） | 双向语音延迟 < 500ms |

---

## 附录：关键链接汇总

| 项目 | 链接 | License |
|---|---|---|
| LobeChat | https://github.com/lobehub/lobe-chat | MIT |
| @lobehub/ui | https://github.com/lobehub/lobe-ui | MIT |
| react-markdown | https://github.com/remarkjs/react-markdown | MIT |
| unified 生态 | https://github.com/unifiedjs/unified | MIT |
| LiveKit Agents | https://github.com/livekit/agents | Apache-2.0 |
| LiveKit Components | https://github.com/livekit/components-js | Apache-2.0 |
| Pipecat | https://github.com/pipecat-ai/pipecat | BSD-2 |
