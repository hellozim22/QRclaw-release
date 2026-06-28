/**
 * Example: OpenClaw Agent Integration
 * 示例：OpenClaw AI Agent 集成
 *
 * Receives visitor messages from QRClaw, forwards them to your
 * OpenClaw AI service (deployed on Tencent Cloud), and streams
 * the AI response back to the visitor.
 *
 * 接收 QRClaw 访客消息，转发给你的 OpenClaw AI 服务（部署在腾讯云），
 * 然后将 AI 的回复以流式方式返回给访客。
 *
 * Usage / 用法:
 *   cp .env.example .env     # fill in ALL values / 填入所有配置
 *   npm install
 *   npm run openclaw-agent
 */
import 'dotenv/config';
import { AgentConnector } from './agent-connector.js';
import type { IncomingMessage } from './agent-connector.js';

// ─── Read config / 读取配置 ────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const AGENT_API_KEY = process.env.AGENT_API_KEY;
const GATEWAY_WS_URL = process.env.GATEWAY_WS_URL;
const OPENCLAW_API_URL = process.env.OPENCLAW_API_URL;
const OPENCLAW_API_KEY = process.env.OPENCLAW_API_KEY;

if (!SUPABASE_URL || !AGENT_API_KEY || !GATEWAY_WS_URL) {
  console.error('Missing QRClaw config. Required: SUPABASE_URL, AGENT_API_KEY, GATEWAY_WS_URL');
  console.error('缺少 QRClaw 配置。必填: SUPABASE_URL, AGENT_API_KEY, GATEWAY_WS_URL');
  process.exit(1);
}

if (!OPENCLAW_API_URL) {
  console.error('Missing OPENCLAW_API_URL. Set it in your .env file.');
  console.error('缺少 OPENCLAW_API_URL，请在 .env 文件中设置。');
  process.exit(1);
}

// ─── OpenClaw API call (OpenAI-compatible) / 调用 OpenClaw API ──

const OPENCLAW_MODEL = process.env.OPENCLAW_MODEL || 'glmcode/glm-5-turbo';

/**
 * OpenAI-compatible chat completion response.
 * OpenAI 兼容的聊天补全响应格式。
 */
interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
}

/**
 * OpenAI-compatible streaming chunk (SSE format).
 * OpenAI 兼容的流式分块（SSE 格式）。
 */
interface ChatCompletionChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }>;
}

/**
 * Call the OpenClaw API (OpenAI-compatible) and return the full response.
 * 调用 OpenClaw API（OpenAI 兼容格式）并返回完整响应。
 */
const callOpenClaw = async (userMessage: string): Promise<string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (OPENCLAW_API_KEY) {
    headers['Authorization'] = `Bearer ${OPENCLAW_API_KEY}`;
  }

  const response = await fetch(`${OPENCLAW_API_URL}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: OPENCLAW_MODEL,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenClaw API error (HTTP ${response.status}): ${body}`);
  }

  const json = (await response.json()) as ChatCompletionResponse;

  const reply = json.choices?.[0]?.message?.content;
  if (!reply) {
    throw new Error(`OpenClaw API returned unexpected format: ${JSON.stringify(json)}`);
  }

  return reply;
};

/**
 * Call the OpenClaw API with streaming (SSE, OpenAI-compatible) and
 * forward chunks to QRClaw.
 * 调用 OpenClaw API 的流式接口（OpenAI 兼容格式），并将分块转发给 QRClaw。
 */
const callOpenClawStream = async (
  userMessage: string,
  conversationId: string,
  agent: AgentConnector
): Promise<void> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (OPENCLAW_API_KEY) {
    headers['Authorization'] = `Bearer ${OPENCLAW_API_KEY}`;
  }

  const response = await fetch(`${OPENCLAW_API_URL}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: OPENCLAW_MODEL,
      messages: [{ role: 'user', content: userMessage }],
      stream: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenClaw API error (HTTP ${response.status}): ${body}`);
  }

  if (!response.body) {
    throw new Error('OpenClaw API returned no response body for streaming');
  }

  // Read the SSE stream (OpenAI-compatible format)
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let messageId: string | undefined;
  let sequence = 0;
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE lines: "data: {...}\n\n"
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) {
          continue;
        }

        const jsonStr = trimmed.slice(5).trim(); // Remove "data:" prefix
        if (jsonStr === '[DONE]') {
          break;
        }

        try {
          const chunk = JSON.parse(jsonStr) as ChatCompletionChunk;
          const delta = chunk.choices?.[0]?.delta?.content;

          if (delta) {
            sequence++;
            messageId = agent.sendStreamChunk(conversationId, delta, sequence, messageId);
          }
        } catch {
          console.warn(`Skipping malformed SSE chunk: ${jsonStr}`);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Finalize the stream
  if (messageId && sequence > 0) {
    agent.sendStreamEnd(conversationId, messageId, sequence);
  }
};

// ─── Choose streaming or non-streaming mode ────────────────────

/**
 * Set to true if your OpenClaw API supports SSE streaming.
 * 如果你的 OpenClaw API 支持 SSE 流式输出，设为 true。
 */
const USE_STREAMING = process.env.OPENCLAW_STREAM === 'true';

// ─── Message handler / 消息处理器 ──────────────────────────────

const handleMessage = async (message: IncomingMessage, agent: AgentConnector): Promise<void> => {
  console.log(`\n📨 Visitor says: "${message.content}"`);
  console.log(`   Conversation: ${message.conversationId}`);

  try {
    if (USE_STREAMING) {
      // Streaming mode: forward chunks in real time
      // 流式模式：实时转发分块
      console.log('🔄 Forwarding to OpenClaw (streaming)...');
      await callOpenClawStream(message.content, message.conversationId, agent);
      console.log('✅ Stream complete');
    } else {
      // Non-streaming mode: get full reply, then send
      // 非流式模式：获取完整回复后发送
      console.log('🔄 Forwarding to OpenClaw...');
      const reply = await callOpenClaw(message.content);
      console.log(`📤 AI reply: "${reply.slice(0, 80)}${reply.length > 80 ? '...' : ''}"`);
      agent.sendReply(message.conversationId, reply);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`❌ OpenClaw error: ${errorMsg}`);

    // Send a friendly error message to the visitor
    // 向访客发送友好的错误提示
    agent.sendReply(
      message.conversationId,
      'Sorry, I encountered an error. Please try again later.\n抱歉，我遇到了一个错误，请稍后再试。'
    );
  }
};

// ─── Create connector and start / 创建连接器并启动 ─────────────

const connector = new AgentConnector({
  supabaseUrl: SUPABASE_URL,
  agentApiKey: AGENT_API_KEY,
  gatewayWsUrl: GATEWAY_WS_URL,
  ticketUrl: (() => {
    const httpUrl = GATEWAY_WS_URL.replace('ws://', 'http://').replace('wss://', 'https://');
    const base = new URL(httpUrl);
    return `${base.protocol}//${base.host}/api/agent-ws-ticket`;
  })(),
  onMessage: handleMessage,

  onStateChange: (state) => {
    console.log(`🔄 Connection state: ${state}`);
  },

  onError: (error) => {
    console.error(`❌ Error: ${error.message}`);
  },
});

console.log('🤖 QRClaw OpenClaw Agent starting...');
console.log('🤖 QRClaw OpenClaw Agent 正在启动...');
console.log(`   OpenClaw API: ${OPENCLAW_API_URL}`);
console.log(`   Streaming: ${USE_STREAMING ? 'enabled' : 'disabled'}\n`);

connector.connect().catch((err) => {
  console.error('Failed to connect / 连接失败:', err);
  process.exit(1);
});

// ─── Graceful shutdown / 优雅退出 ──────────────────────────────

const shutdown = () => {
  console.log('\n👋 Shutting down... / 正在关闭...');
  connector.disconnect();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
