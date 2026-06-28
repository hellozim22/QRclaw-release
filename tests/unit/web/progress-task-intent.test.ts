import { describe, expect, it } from 'vitest';
import { isCompleteProgressTask } from '../../../web/src/lib/progress-task-intent';

describe('isCompleteProgressTask', () => {
  it('rejects greetings and short chitchat', () => {
    expect(isCompleteProgressTask('你好')).toBe(false);
    expect(isCompleteProgressTask('谢谢')).toBe(false);
    expect(isCompleteProgressTask('ok')).toBe(false);
    expect(isCompleteProgressTask('你是谁？')).toBe(false);
  });

  it('accepts actionable requests', () => {
    expect(isCompleteProgressTask('修复 Chat 页 banner 字距问题')).toBe(true);
    expect(isCompleteProgressTask('Implement user profile settings page')).toBe(true);
    expect(isCompleteProgressTask('帮我排查本地 agent 一直离线的原因')).toBe(true);
  });

  it('accepts numbered task lists', () => {
    expect(
      isCompleteProgressTask('1. 统一 banner 字体\n2. 修复 agent 离线'),
    ).toBe(true);
  });
});
