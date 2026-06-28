/**
 * Example: Echo Agent
 * 示例：Echo Agent（回声机器人）
 *
 * A minimal agent that echoes back whatever the visitor sends.
 * Useful for testing your QRClaw setup end-to-end.
 *
 * 一个最简单的 Agent 示例：收到访客消息后原样回复。
 * 可以用来测试你的 QRClaw 连接是否正常。
 *
 * Usage / 用法:
 *   cp .env.example .env     # fill in your values / 填入你的配置
 *   npm install
 *   npm run echo-agent
 */
import 'dotenv/config';
import { AgentConnector } from './agent-connector.js';
import type { IncomingMessage } from './agent-connector.js';

// ─── Read config from environment / 从环境变量读取配置 ──────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const AGENT_API_KEY = process.env.AGENT_API_KEY;
const GATEWAY_WS_URL = process.env.GATEWAY_WS_URL;

if (!SUPABASE_URL || !AGENT_API_KEY || !GATEWAY_WS_URL) {
  console.error('Missing required environment variables. Please check your .env file.');
  console.error('缺少必要的环境变量，请检查 .env 文件。');
  console.error('Required: SUPABASE_URL, AGENT_API_KEY, GATEWAY_WS_URL');
  process.exit(1);
}

// ─── Create the connector / 创建连接器 ─────────────────────────

const connector = new AgentConnector({
  supabaseUrl: SUPABASE_URL,
  agentApiKey: AGENT_API_KEY,
  gatewayWsUrl: GATEWAY_WS_URL,
  // Use Gateway-hosted ticket endpoint for local dev (avoids Supabase Edge Function deployment)
  ticketUrl: (() => {
    const httpUrl = GATEWAY_WS_URL.replace('ws://', 'http://').replace('wss://', 'https://');
    const base = new URL(httpUrl);
    return `${base.protocol}//${base.host}/api/agent-ws-ticket`;
  })(),

  /**
   * Message handler: echo the visitor's message back.
   * 消息处理：将访客的消息原样回复。
   */
  onMessage: (message: IncomingMessage, agent: AgentConnector) => {
    console.log(`\n📨 Visitor says: "${message.content}"`);
    console.log(`   Conversation: ${message.conversationId}`);

    // Echo reply / 回声回复
    const reply = `Echo: ${message.content}`;
    agent.sendReply(message.conversationId, reply);
    console.log(`📤 Replied: "${reply}"\n`);
  },

  onStateChange: (state) => {
    console.log(`🔄 Connection state: ${state}`);
  },

  onError: (error) => {
    console.error(`❌ Error: ${error.message}`);
  },
});

// ─── Start the agent / 启动 Agent ──────────────────────────────

console.log('🤖 QRClaw Echo Agent starting...');
console.log('🤖 QRClaw Echo Agent 正在启动...\n');

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
