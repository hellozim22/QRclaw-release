import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OwnerAgentSummary } from '@shared/contracts/http/owner-agent-chat/types';
import { listProgressTasks } from '@/features/progress/task-store';
import type { ChatMessage } from '@/stores/owner-agent-chat-store';
import { maybeSummarizeConversationToProgress } from './local-progress-summary';

const agent: OwnerAgentSummary = {
  id: 'agent-summary-test',
  name: 'Summary Agent',
  avatar_url: null,
  description: null,
  backend_provider: 'pi',
  backend_source: 'local',
  execution_mode: 'standard',
  status: 'active',
  runtime_id: 'runtime-summary-test',
  runtime_status: 'online',
  runtime_version: 'test',
  runtime_models: ['deepseek-v4-flash'],
  is_default: false,
  source: 'user_created',
  last_active_at: null,
  created_at: '2026-06-28T00:00:00.000Z',
};

const message = (
  id: string,
  senderType: ChatMessage['sender_type'],
  content: string
): ChatMessage => ({
  id,
  sender_type: senderType,
  content,
  status: 'sent',
  created_at: '2026-06-28T00:00:00.000Z',
});

describe('local progress conversation summarizer', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubEnv('NEXT_PUBLIC_PROGRESS_SUMMARY_CONTEXT_LIMIT_CHARS', '200');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })))
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('does not create a task before the conversation reaches the 50% threshold', () => {
    maybeSummarizeConversationToProgress(agent, [
      message('owner-short', 'owner', '请记录一下这个想法。'),
      message('agent-short', 'agent', '好的，我先记住。'),
    ]);

    expect(listProgressTasks()).toHaveLength(0);
  });

  it('creates then updates a structured Progress task for long conversations', () => {
    const firstLongConversation = [
      message(
        'owner-1',
        'owner',
        '请帮我验证长对话自动压缩是否会创建 Progress 任务，并记录背景和下一步。'
      ),
      message('agent-1', 'agent', '我会持续跟进，并在上下文达到阈值后沉淀为任务。'.repeat(3)),
    ];

    maybeSummarizeConversationToProgress(agent, firstLongConversation);

    const createdTasks = listProgressTasks();
    expect(createdTasks).toHaveLength(1);
    expect(createdTasks[0]).toMatchObject({
      status: 'in_progress',
      priority: 'medium',
      agentId: agent.id,
      agentName: 'Summary Agent',
      sourceMessage: `conversation-summary:${agent.id}`,
    });
    expect(createdTasks[0].description).toContain('## 任务背景');
    expect(createdTasks[0].description).toContain('## 任务详情');
    expect(createdTasks[0].description).toContain('## 任务解决进度');
    expect(createdTasks[0].description).toContain('上下文摘录');

    maybeSummarizeConversationToProgress(agent, firstLongConversation);
    expect(listProgressTasks()).toHaveLength(1);

    const expandedConversation = [
      ...firstLongConversation,
      ...Array.from({ length: 8 }, (_, index) =>
        message(
          `owner-followup-${index}`,
          index % 2 === 0 ? 'owner' : 'agent',
          `第 ${index + 1} 轮追加上下文：需要确认自动压缩会更新已有任务，而不是创建重复任务。`
        )
      ),
    ];

    maybeSummarizeConversationToProgress(agent, expandedConversation);

    const updatedTasks = listProgressTasks();
    expect(updatedTasks).toHaveLength(1);
    expect(updatedTasks[0].id).toBe(createdTasks[0].id);
    expect(updatedTasks[0].activity.length).toBeGreaterThan(createdTasks[0].activity.length);
    expect(updatedTasks[0].description).toContain('第 7 轮追加上下文');
    expect(updatedTasks[0].description).toContain('- 已根据当前本地对话上下文生成任务草稿');
  });
});
