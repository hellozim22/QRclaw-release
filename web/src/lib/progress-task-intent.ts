/**
 * Built-in gate: only substantive user requests become Progress tasks.
 * See .claude/skills/progress-task-intent/SKILL.md (internal, not shown in UI).
 */

const GREETING_ONLY =
  /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|嗯|好|好的|谢谢|你好|在吗|在么|？|\?|。)+$/iu;

const CHITCHAT =
  /^(你(是谁|好|在吗)|what\s+can\s+you\s+do|who\s+are\s+you)/iu;

const ACTION_SIGNAL =
  /(?:fix|add|implement|create|update|remove|delete|refactor|build|write|deploy|investigate|debug|排查|修复|实现|添加|创建|更新|删除|重构|编写|部署|优化|调查|完成|帮我|请帮|做一个|写一|改一)/iu;

const LIST_OR_MULTISTEP = /(?:^\s*\d+[.)]\s|(?:\n\s*[-*•]\s))/m;

/** Returns true when the message looks like a complete actionable task. */
export function isCompleteProgressTask(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 8) {
    return false;
  }
  if (GREETING_ONLY.test(trimmed) || CHITCHAT.test(trimmed)) {
    return false;
  }
  if (LIST_OR_MULTISTEP.test(trimmed) && trimmed.length >= 12) {
    return true;
  }
  if (ACTION_SIGNAL.test(trimmed)) {
    return true;
  }
  const segments = trimmed.split(/[。！？.!?\n]+/).filter((part) => part.trim().length > 0);
  if (segments.length >= 2 && trimmed.length >= 24) {
    return true;
  }
  if (trimmed.length >= 48) {
    return true;
  }
  return false;
}
