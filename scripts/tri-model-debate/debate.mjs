#!/usr/bin/env node
/**
 * 三大模型辩论审查工具
 *
 * 召唤 Claude Opus 4.6、GPT 5.2、Gemini 3.1 Pro 对文档进行多轮辩论审查
 *
 * 用法：
 *   node scripts/tri-model-debate/debate.mjs <文档路径> [选项]
 *
 * 选项：
 *   --min-rounds <n>      最少辩论轮次 (默认: 5)
 *   --max-rounds <n>      最大辩论轮次 (默认: 10)
 *   --output-dir <path>   输出目录 (默认: 文档所在目录)
 *   --webhook <url>       企业微信 Webhook (可选)
 *   --no-notify           禁用企业微信通知
 *   --type <type>         文档类型: product / tech / design (默认: product)
 *
 * 示例：
 *   node scripts/tri-model-debate/debate.mjs requirements/需求.md
 *   node scripts/tri-model-debate/debate.mjs docs/技术方案.md --type tech --min-rounds 3
 *   node scripts/tri-model-debate/debate.mjs prd.md --output-dir ./output --no-notify
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ==================== .env 文件加载 ====================

function loadEnvFile() {
  const envPaths = [
    path.join(PROJECT_ROOT, '.env'),
    path.join(PROJECT_ROOT, 'venus-mcp-server', '.env'),
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

loadEnvFile();

// ==================== 命令行参数解析 ====================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    docPath: null,
    minRounds: 5,
    maxRounds: 10,
    outputDir: null,
    webhook:
      process.env.WECOM_WEBHOOK ||
      'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=4c65d20e-a8d2-4196-aa5f-2fdc77610dfb',
    notify: true,
    type: 'product',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--min-rounds' && args[i + 1]) {
      options.minRounds = parseInt(args[++i], 10);
    } else if (arg === '--max-rounds' && args[i + 1]) {
      options.maxRounds = parseInt(args[++i], 10);
    } else if (arg === '--output-dir' && args[i + 1]) {
      options.outputDir = args[++i];
    } else if (arg === '--webhook' && args[i + 1]) {
      options.webhook = args[++i];
    } else if (arg === '--no-notify') {
      options.notify = false;
    } else if (arg === '--type' && args[i + 1]) {
      options.type = args[++i];
    } else if (!arg.startsWith('-') && !options.docPath) {
      options.docPath = arg;
    }
  }

  return options;
}

// ==================== Venus API 配置 ====================

const VENUS_API_BASE = process.env.VENUS_BASE_URL || 'http://v2.open.venus.oa.com/llmproxy/v1';
const API_KEYS = (process.env.VENUS_API_KEYS || process.env.VENUS_API_KEY || '')
  .split(',')
  .map((k) => k.trim())
  .filter((k) => k.length > 0);

// 模型降级链（按优先级排序）
const MODEL_FALLBACKS = {
  claude: [
    { model: 'claude-opus-4-6', maxTokens: 16000 },
    { model: 'claude-4-5-sonnet-20250929', maxTokens: 8192 },
    { model: 'claude-4-sonnet-20250514', maxTokens: 8192 },
    { model: 'claude-3-7-sonnet-20250219', maxTokens: 8192 },
  ],
  gpt: [
    { model: 'gpt-5.2', maxTokens: 16000 },
    { model: 'gpt-4.1', maxTokens: 32768 },
    { model: 'gpt-4o', maxTokens: 4096 },
    { model: 'gpt-4o-mini', maxTokens: 4096 },
  ],
  gemini: [
    { model: 'gemini-3.1-pro', maxTokens: 16000, thinking: 'medium' },
    { model: 'gemini-3-pro', maxTokens: 16000 },
    { model: 'gemini-2.5-pro', maxTokens: 8192 },
  ],
};

// 当前使用的模型索引
let currentModelIndex = { claude: 0, gpt: 0, gemini: 0 };

function resetModelIndex() {
  currentModelIndex = { claude: 0, gpt: 0, gemini: 0 };
}

function getCurrentModelConfig(modelType) {
  return MODEL_FALLBACKS[modelType][currentModelIndex[modelType]];
}

function getCurrentModel(modelType) {
  return getCurrentModelConfig(modelType).model;
}

function fallbackModel(modelType) {
  const models = MODEL_FALLBACKS[modelType];
  const oldIndex = currentModelIndex[modelType];
  const oldModel = models[oldIndex].model;

  if (oldIndex < models.length - 1) {
    currentModelIndex[modelType] = oldIndex + 1;
    const newModel = models[currentModelIndex[modelType]].model;
    log(`⬇️ ${modelType} 模型降级: ${oldModel} → ${newModel}`);
    return true;
  }
  log(`⚠️ ${modelType} 已无可用备用模型`);
  return false;
}

function getModelConfig(modelType) {
  const config = getCurrentModelConfig(modelType);
  return {
    model: config.model,
    maxTokens: config.maxTokens,
    description: {
      claude: 'Claude Opus 4.6 - 深度推理与系统设计专家',
      gpt: 'GPT 5.2 - 产品逻辑与业务规则专家',
      gemini: 'Gemini 3.1 Pro - 创新思维与多模态分析专家',
    }[modelType],
  };
}

// 文档类型配置
const DOC_TYPE_CONFIG = {
  product: {
    name: '产品需求',
    focusAreas: ['产品逻辑', '业务流程', '用户体验', '交互设计'],
  },
  tech: {
    name: '技术方案',
    focusAreas: ['架构设计', '技术选型', '性能考量', '安全性', '可维护性'],
  },
  design: {
    name: '设计稿',
    focusAreas: ['视觉设计', '交互体验', '信息层级', '一致性', '可用性'],
  },
};

// Key 负载均衡
let modelKeyIndex = { claude: 0, gpt: 1, gemini: 2 };
let logFile = null;

function getKeyForModel(modelType) {
  if (API_KEYS.length === 0) return '';
  return API_KEYS[modelKeyIndex[modelType] % API_KEYS.length];
}

function switchKeyForModel(modelType) {
  if (API_KEYS.length <= 1) return getKeyForModel(modelType);
  const oldIndex = modelKeyIndex[modelType] % API_KEYS.length;
  modelKeyIndex[modelType] = (modelKeyIndex[modelType] + 1) % API_KEYS.length;
  const newIndex = modelKeyIndex[modelType];
  log(`🔑 ${modelType} Key 轮换: ${oldIndex + 1} → ${newIndex + 1}`);
  return API_KEYS[newIndex];
}

// ==================== 日志 ====================

function log(msg) {
  const timestamp = new Date().toISOString().slice(11, 19);
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  if (logFile) {
    fs.appendFileSync(logFile, line + '\n');
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ==================== Venus API 调用（模型降级 + Key 轮换）====================

async function callModel(modelType, message, maxRetries = 3) {
  const maxFallbacks = MODEL_FALLBACKS[modelType].length;
  let totalAttempts = 0;

  for (let fallbackCount = 0; fallbackCount < maxFallbacks; fallbackCount++) {
    const config = getModelConfig(modelType);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      totalAttempts++;
      const currentKey = getKeyForModel(modelType);
      const keyIndex = (modelKeyIndex[modelType] % API_KEYS.length) + 1;

      try {
        log(
          `🤖 调用 ${modelType}: ${config.model} [Key${keyIndex}] (尝试 ${attempt + 1}/${maxRetries})`
        );

        const requestBody = {
          model: config.model,
          messages: [{ role: 'user', content: message }],
          temperature: 0.7,
        };

        // Gemini thinking mode support
        if (config.thinking && config.model.startsWith('gemini')) {
          requestBody.thinking = {
            type: 'enabled',
            budget_token:
              config.thinking === 'medium' ? 8192 : config.thinking === 'high' ? 16384 : 4096,
          };
        }

        // GPT 系列使用 max_completion_tokens，其他使用 max_tokens
        if (
          config.model.startsWith('gpt') ||
          config.model.startsWith('o1') ||
          config.model.startsWith('o3') ||
          config.model.startsWith('o4')
        ) {
          requestBody.max_completion_tokens = config.maxTokens;
        } else {
          requestBody.max_tokens = config.maxTokens;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 600000);

        const response = await fetch(`${VENUS_API_BASE}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const rawText = await response.text();

        if (!response.ok) {
          let errorMsg = response.statusText;
          try {
            const error = JSON.parse(rawText);
            errorMsg = error.error?.message || JSON.stringify(error);
          } catch (_e) {
            errorMsg = rawText.slice(0, 200) || response.statusText;
          }

          if (response.status === 429 || response.status >= 500) {
            log(`⚠️ 错误 ${response.status}: ${errorMsg.slice(0, 100)}`);
            switchKeyForModel(modelType);
            await sleep(3000);
            continue;
          }

          if (response.status === 400) {
            log(`⚠️ 模型错误 400: ${errorMsg.slice(0, 100)}`);
            break;
          }

          throw new Error(`API 错误 ${response.status}: ${errorMsg}`);
        }

        let data;
        try {
          data = JSON.parse(rawText);
        } catch (parseErr) {
          log(`⚠️ JSON 解析失败，原始响应长度: ${rawText.length}`);
          throw new Error(`JSON 解析失败: ${parseErr.message}`);
        }

        const content = data.choices?.[0]?.message?.content || '';
        if (!content) {
          throw new Error('响应内容为空');
        }

        log(`✅ ${modelType} (${config.model}) [Key${keyIndex}] 响应: ${content.length} 字符`);
        return content;
      } catch (err) {
        if (err.name === 'AbortError') {
          log(`⏰ ${modelType} (${config.model}) [Key${keyIndex}] 超时`);
          if (attempt < maxRetries - 1) {
            switchKeyForModel(modelType);
            await sleep(3000);
            continue;
          }
          break;
        }
        log(`❌ ${modelType} [Key${keyIndex}] 错误: ${err.message}`);
        if (attempt < maxRetries - 1) {
          switchKeyForModel(modelType);
          await sleep(3000);
        }
      }
    }

    if (!fallbackModel(modelType)) break;
    log(`🔄 使用备用模型重试...`);
    await sleep(2000);
  }

  log(`💀 ${modelType} 所有模型都失败，共尝试 ${totalAttempts} 次`);
  return `[${modelType} 调用失败]`;
}

// ==================== 企业微信通知 ====================

async function sendWecomNotification(webhook, content) {
  if (!webhook) return;
  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { content } }),
    });
    if (response.ok) {
      log('📤 企业微信通知发送成功');
    } else {
      log(`⚠️ 企业微信通知发送失败: ${response.status}`);
    }
  } catch (err) {
    log(`❌ 企业微信通知错误: ${err.message}`);
  }
}

// ==================== Prompt 构建 ====================

function buildRound1Prompt(docContent, docType) {
  const typeConfig = DOC_TYPE_CONFIG[docType];
  const focusStr = typeConfig.focusAreas.map((f, i) => `${i + 1}. ${f}`).join('\n');

  return `你是一位资深${typeConfig.name}专家，请仔细阅读以下文档，并从专业角度进行深度分析。

【文档内容】
${docContent}

【审查重点】
${focusStr}

【分析任务】
请从以下维度进行详细分析：

1. **整体评估**
   - 文档的完整性如何？
   - 核心逻辑是否清晰？
   - 有无明显的漏洞或缺陷？

2. **优点分析**
   - 列出文档做得好的地方
   - 说明为什么这些是优点

3. **问题分析**
   - 列出存在的问题或不足
   - 分析问题产生的原因

4. **改进建议**
   - 列出具体的改进建议
   - 说明改进的原因和预期效果

请详细输出你的分析结论。`;
}

function buildRound2Prompt(topic, claudeR1, gptR1, geminiR1, modelName) {
  return `【辩论第2轮：相互质疑】

你是 ${modelName}，请阅读其他两位专家的分析观点，进行相互质疑。

【文档核心要点】
${topic}

【Claude 的分析】
${claudeR1}

【GPT 的分析】
${gptR1}

【Gemini 的分析】
${geminiR1}

---

请针对其他两位专家的观点：
1. 指出你**不同意**的地方，并说明理由
2. 指出你认为**有遗漏**的地方
3. 对他们提出**尖锐的质疑**
4. 补充你认为更好的改进方案

保持批判性思维，不要轻易妥协。`;
}

function buildRound3Prompt(modelName, myR1, challenges) {
  return `【辩论第3轮：回应质疑】

你是 ${modelName}，请回应其他专家对你观点的质疑。

【你在第1轮的观点】
${myR1}

【其他专家对你的质疑】
${challenges}

---

请逐条回应质疑：
1. 对于**合理的质疑**，请修正你的观点
2. 对于**不合理的质疑**，请坚持并给出更充分的理由
3. 提出**新的论据**来支持你的核心观点
4. 尝试寻找共识点`;
}

function buildConsensusPrompt(topic, allResponses, round) {
  return `【辩论第${round}轮：寻求共识】

当前已完成 ${round - 1} 轮辩论，请针对剩余分歧点进行深入讨论。

【文档核心要点】
${topic}

【各专家最新观点】
${allResponses}

---

请针对剩余分歧点：
1. 你是否愿意在某些点上**让步**？
2. 你是否有**新的建议**来化解分歧？
3. 如果必须做出选择，你推荐哪个方案？

目标：达成可执行的共识方案。`;
}

function buildSummaryPrompt(docContent, docName, docType, debateHistory) {
  const typeConfig = DOC_TYPE_CONFIG[docType];
  const dateStr = new Date().toISOString().slice(0, 10);

  return `你是一位资深${typeConfig.name}专家，请根据以下多轮辩论结果，整合三位专家的共识观点，生成最终的审查报告。

【原始文档】
${docContent}

【辩论轮次】${debateHistory.length} 轮

【各轮辩论要点】
${debateHistory
  .map(
    (r) => `
--- 第 ${r.round} 轮 ---
Claude: ${r.claude.slice(0, 1500)}...
GPT: ${r.gpt.slice(0, 1500)}...
Gemini: ${r.gemini.slice(0, 1500)}...
`
  )
  .join('\n')}

---

请整合所有观点，生成以下格式的审查文档：

# ${docName}（审查版本）

> **版本**：v审查版
> **审查时间**：${dateStr}
> **审查方式**：三模型共识辩论（Claude Opus 4.6 + GPT 5.2 + Gemini 3.1 Pro）
> **辩论轮次**：${debateHistory.length} 轮
> **文档类型**：${typeConfig.name}

---

## 一、审查概述

### 1.1 整体评价
[对文档的整体评价]

### 1.2 核心优点
[列出3-5个核心优点]

### 1.3 主要问题
[列出需要改进的问题]

---

## 二、详细分析

### 2.1 ${typeConfig.focusAreas[0] || '重点一'}
[具体分析和建议]

### 2.2 ${typeConfig.focusAreas[1] || '重点二'}
[具体分析和建议]

### 2.3 ${typeConfig.focusAreas[2] || '重点三'}
[具体分析和建议]

---

## 三、改进建议

### 3.1 高优先级
[立即需要改进的内容]

### 3.2 中优先级
[可以后续改进的内容]

### 3.3 低优先级
[可选改进项]

---

## 四、三模型共识要点

### 4.1 完全共识
[三个模型都同意的观点]

### 4.2 部分共识
[多数模型同意的观点]

### 4.3 保留分歧
[仍存在分歧的观点，供决策参考]

---

## 附录：辩论过程摘要

[每轮辩论的核心要点概述]`;
}

// ==================== 共识检测 ====================

function analyzeConsensus(history, round, minRounds) {
  if (history.length < 3) return { reached: false, confidence: 0 };

  const latest = history[history.length - 1];
  const claudeLen = latest.claude.length;
  const gptLen = latest.gpt.length;
  const geminiLen = latest.gemini.length;

  const avgLen = (claudeLen + gptLen + geminiLen) / 3;
  const variance =
    Math.abs(claudeLen - avgLen) + Math.abs(gptLen - avgLen) + Math.abs(geminiLen - avgLen);
  const normalizedVariance = variance / avgLen;

  const confidence = Math.max(0, 1 - normalizedVariance);
  const threshold = round < 10 ? 0.95 : 0.9;

  return {
    reached: confidence >= threshold && round >= minRounds,
    confidence,
  };
}

// ==================== 主辩论流程 ====================

async function runDebate(options) {
  const { docPath, minRounds, maxRounds, outputDir, webhook, notify, type } = options;

  const absoluteDocPath = path.isAbsolute(docPath) ? docPath : path.resolve(process.cwd(), docPath);
  const docDir = outputDir
    ? path.isAbsolute(outputDir)
      ? outputDir
      : path.resolve(process.cwd(), outputDir)
    : path.dirname(absoluteDocPath);
  const docName = path.basename(absoluteDocPath, path.extname(absoluteDocPath));
  const dateStr = new Date().toISOString().slice(0, 10);

  // 设置日志文件
  const logsDir = path.join(PROJECT_ROOT, 'logs/venus-debate');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  logFile = path.join(logsDir, `debate-${docName}-${dateStr}.log`);

  log('\n🚀 启动三大模型辩论审查');
  log(`📄 文档路径: ${absoluteDocPath}`);
  log(`📁 输出目录: ${docDir}`);
  log(`📋 文档类型: ${DOC_TYPE_CONFIG[type].name}`);
  log(`🔄 辩论轮次: ${minRounds} - ${maxRounds}`);
  log(`🤖 参与模型: Claude Opus 4.6 / GPT 5.2 / Gemini 3.1 Pro (thinking: medium)`);
  log(`🔑 已加载 ${API_KEYS.length} 个 API Key`);

  if (!fs.existsSync(absoluteDocPath)) {
    log(`❌ 文档不存在: ${absoluteDocPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(docDir)) {
    fs.mkdirSync(docDir, { recursive: true });
  }

  const docContent = fs.readFileSync(absoluteDocPath, 'utf-8');
  log(`📖 文档内容: ${docContent.length} 字符`);

  const topicSummary = docContent.slice(0, 5000);
  const debateHistory = [];
  let currentRound = 1;
  let consensusReached = false;

  // ========== 第1轮：初始分析 ==========
  log(`\n${'='.repeat(60)}`);
  log(`📢 第 ${currentRound} 轮：独立分析`);
  log(`${'='.repeat(60)}`);

  resetModelIndex();
  const round1Prompt = buildRound1Prompt(docContent, type);

  const claudeR1 = await callModel('claude', round1Prompt);
  resetModelIndex();
  await sleep(2000);

  const gptR1 = await callModel('gpt', round1Prompt);
  resetModelIndex();
  await sleep(2000);

  const geminiR1 = await callModel('gemini', round1Prompt);
  resetModelIndex();

  debateHistory.push({ round: currentRound, claude: claudeR1, gpt: gptR1, gemini: geminiR1 });
  currentRound++;

  // ========== 第2轮：相互质疑 ==========
  log(`\n${'='.repeat(60)}`);
  log(`📢 第 ${currentRound} 轮：相互质疑`);
  log(`${'='.repeat(60)}`);

  const claudeR2 = await callModel(
    'claude',
    buildRound2Prompt(topicSummary, claudeR1, gptR1, geminiR1, 'Claude')
  );
  resetModelIndex();
  await sleep(2000);

  const gptR2 = await callModel(
    'gpt',
    buildRound2Prompt(topicSummary, claudeR1, gptR1, geminiR1, 'GPT')
  );
  resetModelIndex();
  await sleep(2000);

  const geminiR2 = await callModel(
    'gemini',
    buildRound2Prompt(topicSummary, claudeR1, gptR1, geminiR1, 'Gemini')
  );
  resetModelIndex();

  debateHistory.push({ round: currentRound, claude: claudeR2, gpt: gptR2, gemini: geminiR2 });
  currentRound++;

  // ========== 第3轮：回应质疑 ==========
  log(`\n${'='.repeat(60)}`);
  log(`📢 第 ${currentRound} 轮：回应质疑`);
  log(`${'='.repeat(60)}`);

  const claudeR3 = await callModel(
    'claude',
    buildRound3Prompt('Claude', claudeR1, `GPT: ${gptR2}\n\nGemini: ${geminiR2}`)
  );
  resetModelIndex();
  await sleep(2000);

  const gptR3 = await callModel(
    'gpt',
    buildRound3Prompt('GPT', gptR1, `Claude: ${claudeR2}\n\nGemini: ${geminiR2}`)
  );
  resetModelIndex();
  await sleep(2000);

  const geminiR3 = await callModel(
    'gemini',
    buildRound3Prompt('Gemini', geminiR1, `Claude: ${claudeR2}\n\nGPT: ${gptR2}`)
  );
  resetModelIndex();

  debateHistory.push({ round: currentRound, claude: claudeR3, gpt: gptR3, gemini: geminiR3 });
  currentRound++;

  // ========== 第4+轮：寻求共识 ==========
  while (currentRound <= maxRounds && !consensusReached) {
    log(`\n${'='.repeat(60)}`);
    log(`📢 第 ${currentRound} 轮：寻求共识`);
    log(`${'='.repeat(60)}`);

    if (currentRound >= minRounds) {
      const consensusCheck = analyzeConsensus(debateHistory, currentRound, minRounds);
      log(`🔍 共识检测: 置信度 ${(consensusCheck.confidence * 100).toFixed(1)}%`);

      const encourageRounds = 8;
      if (
        consensusCheck.reached ||
        (currentRound >= encourageRounds && consensusCheck.confidence >= 0.8)
      ) {
        log(`✅ 达成共识，结束辩论（轮次: ${currentRound}）`);
        consensusReached = true;
        break;
      }
    }

    const lastRound = debateHistory[debateHistory.length - 1];
    const allResponses = `Claude:\n${lastRound.claude.slice(0, 2000)}\n\nGPT:\n${lastRound.gpt.slice(0, 2000)}\n\nGemini:\n${lastRound.gemini.slice(0, 2000)}`;

    const consensusPrompt = buildConsensusPrompt(topicSummary, allResponses, currentRound);

    const claudeRN = await callModel('claude', consensusPrompt);
    resetModelIndex();
    await sleep(2000);

    const gptRN = await callModel('gpt', consensusPrompt);
    resetModelIndex();
    await sleep(2000);

    const geminiRN = await callModel('gemini', consensusPrompt);
    resetModelIndex();

    debateHistory.push({ round: currentRound, claude: claudeRN, gpt: gptRN, gemini: geminiRN });
    currentRound++;

    // Save intermediate debate data after each round
    try {
      const tmpPath = path.join(docDir, '_debate_progress.json');
      fs.writeFileSync(tmpPath, JSON.stringify(debateHistory, null, 2));
      log(`💾 中间数据已保存 (${debateHistory.length} 轮)`);
    } catch (_e) {}

    await sleep(3000);
  }

  // ========== 生成审查版本文档 ==========
  log(`\n${'='.repeat(60)}`);
  log(`📝 生成审查版本文档`);
  log(`${'='.repeat(60)}`);

  resetModelIndex();
  const summaryPrompt = buildSummaryPrompt(docContent, docName, type, debateHistory);
  const reviewDoc = await callModel('claude', summaryPrompt);

  const outputPath = path.join(docDir, `${docName}（审查版本）.md`);
  fs.writeFileSync(outputPath, reviewDoc);
  log(`📁 审查文档已保存: ${outputPath}`);

  // 保存辩论记录
  const debateLogPath = path.join(docDir, `${docName}-辩论记录-${dateStr}.md`);
  const debateLogContent = `# ${docName} - 三模型辩论记录

> **辩论时间**：${new Date().toISOString()}
> **参与模型**：Claude (${getCurrentModel('claude')}) + GPT (${getCurrentModel('gpt')}) + Gemini (${getCurrentModel('gemini')})
> **辩论轮次**：${debateHistory.length} 轮
> **文档类型**：${DOC_TYPE_CONFIG[type].name}

---

${debateHistory
  .map(
    (r) => `
## 第 ${r.round} 轮

### Claude 观点
${r.claude}

---

### GPT 观点
${r.gpt}

---

### Gemini 观点
${r.gemini}

---
`
  )
  .join('\n')}
`;
  fs.writeFileSync(debateLogPath, debateLogContent);
  log(`📁 辩论记录已保存: ${debateLogPath}`);

  // ========== 发送企业微信通知 ==========
  if (notify && webhook) {
    const notificationContent = `## 📊 三模型辩论审查完成

**文档**：${docName}
**类型**：${DOC_TYPE_CONFIG[type].name}
**时间**：${new Date().toLocaleString('zh-CN')}
**模型**：Claude Opus 4.6 / GPT 5.2 / Gemini 3.1 Pro
**辩论轮次**：${debateHistory.length} 轮
**共识状态**：${consensusReached ? '✅ 已达成共识' : '⚠️ 达到最大轮次'}

### 📁 生成文件
- 审查版本：\`${docName}（审查版本）.md\`
- 辩论记录：\`${docName}-辩论记录-${dateStr}.md\`

### 📍 文件位置
\`${docDir}/\``;

    await sendWecomNotification(webhook, notificationContent);
  }

  log('\n🎉 辩论审查完成！');

  return { outputPath, debateLogPath, rounds: debateHistory.length, consensusReached };
}

// ==================== 帮助信息 ====================

function showHelp() {
  console.log(`
三大模型辩论审查工具 (Claude Opus 4.6 + GPT 5.2 + Gemini 3.1 Pro)

使用方法:
  node scripts/tri-model-debate/debate.mjs <文档路径> [选项]

选项:
  --min-rounds <n>      最少辩论轮次 (默认: 5)
  --max-rounds <n>      最大辩论轮次 (默认: 10)
  --output-dir <path>   输出目录 (默认: 文档所在目录)
  --webhook <url>       企业微信 Webhook
  --no-notify           禁用企业微信通知
  --type <type>         文档类型: product / tech / design (默认: product)
  --help, -h            显示帮助信息

示例:
  node scripts/tri-model-debate/debate.mjs requirements/需求文档.md
  node scripts/tri-model-debate/debate.mjs docs/技术方案.md --type tech --min-rounds 3
  node scripts/tri-model-debate/debate.mjs prd.md --output-dir ./output --no-notify
`);
}

// ==================== 启动 ====================

const options = parseArgs();

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

if (!options.docPath) {
  console.error('❌ 请提供文档路径');
  showHelp();
  process.exit(1);
}

if (API_KEYS.length === 0) {
  console.error('❌ 未配置 API Key，请设置 VENUS_API_KEYS 或 VENUS_API_KEY 环境变量');
  process.exit(1);
}

runDebate(options)
  .then((result) => {
    if (result) {
      log(`\n📊 最终结果:`);
      log(`   - 审查文档: ${result.outputPath}`);
      log(`   - 辩论记录: ${result.debateLogPath}`);
      log(`   - 辩论轮次: ${result.rounds}`);
      log(`   - 共识状态: ${result.consensusReached ? '已达成' : '超时结束'}`);
    }
  })
  .catch((err) => {
    log(`💥 致命错误: ${err.message}`);
    console.error(err);
    process.exit(1);
  });
