'use client';

import type { OwnerAgentSummary } from '@shared/contracts/http/owner-agent-chat/types';
import { createProgressTask, getProgressTask, updateProgressTask } from '@/features/progress/task-store';
import type { ChatMessage } from '@/stores/owner-agent-chat-store';
import { getAgentDisplayName } from './agent-display';

interface SummaryMeta {
  taskId: string | null;
  lastCharCount: number;
  lastMessageCount: number;
}

const DEFAULT_CONTEXT_LIMIT_CHARS = 12000;
const TRIGGER_RATIO = 0.5;
const HYSTERESIS_RATIO = 0.15;

const metaKey = (agentId: string) => `bibisheng.progress.summary.v1.${agentId}`;

const readMeta = (agentId: string): SummaryMeta => {
  if (typeof window === 'undefined') return { taskId: null, lastCharCount: 0, lastMessageCount: 0 };
  try {
    const raw = window.localStorage.getItem(metaKey(agentId));
    if (!raw) return { taskId: null, lastCharCount: 0, lastMessageCount: 0 };
    const parsed = JSON.parse(raw) as Partial<SummaryMeta>;
    return {
      taskId: typeof parsed.taskId === 'string' ? parsed.taskId : null,
      lastCharCount: typeof parsed.lastCharCount === 'number' ? parsed.lastCharCount : 0,
      lastMessageCount: typeof parsed.lastMessageCount === 'number' ? parsed.lastMessageCount : 0,
    };
  } catch {
    return { taskId: null, lastCharCount: 0, lastMessageCount: 0 };
  }
};

const writeMeta = (agentId: string, meta: SummaryMeta) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(metaKey(agentId), JSON.stringify(meta));
};

const contextLimitChars = (): number => {
  const raw = process.env.NEXT_PUBLIC_PROGRESS_SUMMARY_CONTEXT_LIMIT_CHARS;
  const parsed = raw ? Number(raw) : DEFAULT_CONTEXT_LIMIT_CHARS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONTEXT_LIMIT_CHARS;
};

const messageText = (messages: ChatMessage[]): string =>
  messages
    .filter((message) => message.sender_type !== 'system' && message.content.trim())
    .map((message) => `${message.sender_type === 'owner' ? 'Owner' : 'Agent'}: ${message.content.trim()}`)
    .join('\n\n');

const latestOwnerMessage = (messages: ChatMessage[]): string =>
  [...messages].reverse().find((message) => message.sender_type === 'owner')?.content.trim() ?? '';

const deriveTitle = (messages: ChatMessage[]): string => {
  const latest = latestOwnerMessage(messages).replace(/\s+/g, ' ').trim();
  if (!latest) return '对话上下文整理';
  return latest.length > 42 ? `${latest.slice(0, 42)}…` : latest;
};

const buildDescription = (agentName: string, messages: ChatMessage[]): string => {
  const transcript = messageText(messages);
  const latest = latestOwnerMessage(messages);
  return [
    '## 任务背景',
    `系统检测到与 ${agentName} 的对话上下文已接近容量阈值，因此将当前上下文整理为可跟进任务。`,
    '',
    '## 任务详情',
    latest || '请根据当前对话继续推进相关工作。',
    '',
    '## 任务解决进度',
    '- 已根据当前本地对话上下文生成任务草稿',
    '- 后续 agent 可以通过 Progress 工具继续更新状态、补充评论或标记完成',
    '',
    '<details>',
    '<summary>上下文摘录</summary>',
    '',
    transcript.slice(-6000),
    '',
    '</details>',
  ].join('\n');
};

export function maybeSummarizeConversationToProgress(
  agent: OwnerAgentSummary | null | undefined,
  messages: ChatMessage[],
): void {
  if (!agent || messages.length < 2) return;
  const relevantMessages = messages.filter(
    (message) =>
      message.sender_type !== 'system' &&
      message.status !== 'failed' &&
      message.content.trim().length > 0,
  );
  const charCount = messageText(relevantMessages).length;
  const limit = contextLimitChars();
  if (charCount < limit * TRIGGER_RATIO) return;

  const meta = readMeta(agent.id);
  const shouldUpdate =
    !meta.taskId ||
    !getProgressTask(meta.taskId) ||
    charCount >= meta.lastCharCount + limit * HYSTERESIS_RATIO ||
    relevantMessages.length >= meta.lastMessageCount + 8;
  if (!shouldUpdate) return;

  const agentName = getAgentDisplayName(agent);
  const description = buildDescription(agentName, relevantMessages);
  const existing = meta.taskId ? getProgressTask(meta.taskId) : null;
  const task = existing
    ? updateProgressTask(
        existing.id,
        {
          title: deriveTitle(relevantMessages),
          description,
          status: existing.status === 'done' ? 'done' : 'in_progress',
          agentId: agent.id,
          agentName,
        },
        { recordActivity: true },
      )
    : createProgressTask({
        title: deriveTitle(relevantMessages),
        description,
        status: 'in_progress',
        priority: 'medium',
        agentId: agent.id,
        agentName,
        sourceMessage: `conversation-summary:${agent.id}`,
      });

  if (task) {
    writeMeta(agent.id, {
      taskId: task.id,
      lastCharCount: charCount,
      lastMessageCount: relevantMessages.length,
    });
  }
}
