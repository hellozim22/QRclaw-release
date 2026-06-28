/**
 * Setup Agent Script
 * Agent 创建脚本
 *
 * Interactive script that:
 *   1. Connects to Supabase with service role key
 *   2. Creates a new Agent record in the database
 *   3. Generates an API key
 *   4. Stores the hashed key in the database
 *   5. Prints the API key for the user to copy
 *   6. Creates a QR code record linked to the agent
 *
 * 交互式脚本，用于：
 *   1. 使用 service role key 连接 Supabase
 *   2. 在数据库中创建新的 Agent 记录
 *   3. 生成 API 密钥
 *   4. 将密钥的哈希值存入数据库
 *   5. 打印 API 密钥供用户复制
 *   6. 创建关联到该 Agent 的 QR Code 记录
 *
 * Usage / 用法:
 *   npm run setup-agent
 */
import 'dotenv/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import * as readline from 'readline';

// ─── Config / 配置 ──────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  console.error('');
  console.error('❌ 缺少必要的环境变量:');
  console.error('   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  console.error('');
  console.error('Please set them in your .env file. See .env.example for reference.');
  console.error('请在 .env 文件中设置。参考 .env.example。');
  process.exit(1);
}

// ─── Helpers / 辅助函数 ─────────────────────────────────────────

/**
 * Make a Supabase REST API request using fetch.
 * 使用 fetch 发起 Supabase REST API 请求。
 */
const supabaseRequest = async (
  path: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {}
): Promise<{ data: Record<string, unknown>[] | null; error: string | null }> => {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers: Record<string, string> = {
    apikey: SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY!}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...options.headers,
  };

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const body = await response.text();
    return { data: null, error: `HTTP ${response.status}: ${body}` };
  }

  const data = (await response.json()) as Record<string, unknown>[];
  return { data, error: null };
};

/**
 * Hash an API key using SHA-256 (matches the Edge Function implementation).
 * 使用 SHA-256 哈希 API 密钥（与 Edge Function 实现一致）。
 */
const hashApiKey = (apiKey: string): string => {
  return createHash('sha256').update(apiKey).digest('hex');
};

/**
 * Generate a secure random API key.
 * 生成安全的随机 API 密钥。
 */
const generateApiKey = (): string => {
  // Format: qrc_<40 hex chars> — easy to identify as a QRClaw key
  const random = randomBytes(20).toString('hex');
  return `qrc_${random}`;
};

/**
 * Prompt the user for input in the terminal.
 * 在终端中提示用户输入。
 */
const prompt = (question: string): Promise<string> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

// ─── Main Script / 主脚本 ───────────────────────────────────────

const main = async (): Promise<void> => {
  console.log('');
  console.log('========================================');
  console.log('  QRClaw Agent Setup / Agent 创建向导');
  console.log('========================================');
  console.log('');

  // Step 1: Get agent info from user
  // 第一步：获取 Agent 信息
  const agentName = await prompt('Agent name / Agent 名称 (e.g. "My AI Bot"): ');
  if (!agentName) {
    console.error('❌ Agent name is required / Agent 名称不能为空');
    process.exit(1);
  }

  const agentDescription = await prompt(
    'Agent description / Agent 描述 (optional, press Enter to skip): '
  );

  const ownerEmail = await prompt(
    'Owner email / 所有者邮箱 (for associating with a Supabase user, or press Enter to skip): '
  );

  // Step 2: Look up owner (if email provided)
  // 第二步：查找所有者（如果提供了邮箱）
  let ownerId: string | null = null;

  if (ownerEmail) {
    console.log(`\n🔍 Looking up user: ${ownerEmail}...`);
    const { data: users, error: userError } = await supabaseRequest(
      `profiles?email=eq.${encodeURIComponent(ownerEmail)}&select=id,email`
    );

    if (userError) {
      console.warn(`⚠️  Could not look up user: ${userError}`);
      console.warn('   Continuing without owner association...');
      console.warn('   无法查找用户，继续创建（不关联所有者）...');
    } else if (users && users.length > 0) {
      ownerId = users[0].id as string;
      console.log(`✅ Found user: ${ownerId}`);
    } else {
      console.warn('⚠️  User not found. Continuing without owner association...');
      console.warn('   未找到用户，继续创建（不关联所有者）...');
    }
  }

  // Step 3: Generate API key
  // 第三步：生成 API 密钥
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  console.log('\n📝 Creating agent...');

  // Step 4: Insert agent record
  // 第四步：插入 Agent 记录
  const agentId = randomUUID();
  const agentRecord: Record<string, unknown> = {
    id: agentId,
    name: agentName,
    description: agentDescription || null,
    status: 'active',
    api_key_hash: apiKeyHash,
    owner_id: ownerId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: agents, error: agentError } = await supabaseRequest('agents', {
    method: 'POST',
    body: agentRecord,
  });

  if (agentError) {
    console.error(`❌ Failed to create agent: ${agentError}`);
    console.error('❌ 创建 Agent 失败');
    process.exit(1);
  }

  const createdAgent = agents?.[0];
  console.log(`✅ Agent created: ${createdAgent?.id ?? agentId}`);

  // Step 5: Create a QR code linked to the agent
  // 第五步：创建关联到该 Agent 的 QR Code
  const createQr = await prompt(
    '\nCreate a QR code for this agent? / 为此 Agent 创建 QR Code? (Y/n): '
  );

  if (createQr.toLowerCase() !== 'n') {
    const qrLabel = await prompt('QR code label / QR Code 标签 (e.g. "Customer Service"): ');

    const qrId = randomUUID();
    const qrRecord: Record<string, unknown> = {
      id: qrId,
      agent_id: agentId,
      label: qrLabel || agentName,
      status: 'active',
      scan_count: 0,
      owner_id: ownerId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: qrError } = await supabaseRequest('qr_codes', {
      method: 'POST',
      body: qrRecord,
    });

    if (qrError) {
      console.warn(`⚠️  Failed to create QR code: ${qrError}`);
      console.warn('   You can create one later from the dashboard.');
      console.warn('   你可以稍后在控制台中创建。');
    } else {
      console.log(`✅ QR code created: ${qrId}`);
      console.log(`   Label: ${qrLabel || agentName}`);
    }
  }

  // Step 6: Print the API key
  // 第六步：打印 API 密钥
  console.log('\n========================================');
  console.log('  ✅ Setup Complete / 创建完成！');
  console.log('========================================');
  console.log('');
  console.log('Agent ID:');
  console.log(`  ${agentId}`);
  console.log('');
  console.log('API Key (SAVE THIS — it will NOT be shown again!):');
  console.log('API 密钥（请保存 — 不会再次显示！）:');
  console.log('');
  console.log(`  ${apiKey}`);
  console.log('');
  console.log('Next steps / 下一步:');
  console.log('  1. Copy the API key above / 复制上面的 API 密钥');
  console.log(
    '  2. Paste it into your .env file as AGENT_API_KEY / 粘贴到 .env 文件的 AGENT_API_KEY'
  );
  console.log('  3. Run: npm run echo-agent  (to test) / 运行测试');
  console.log('  4. Run: npm run openclaw-agent  (for production) / 运行生产');
  console.log('');
};

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
