---
name: progress-task-intent
description: Internal gate — decide if a chat message is a complete actionable task before creating a Progress board item.
visibility: internal
user_visible: false
---

# Progress Task Intent (built-in)

Do **not** surface this skill in product UI. It backs `web/src/lib/progress-task-intent.ts`.

## Current product decision

Chat must **not** create Progress tasks from single user messages.

As of the latest product direction:

1. Do not auto-create a task when the owner sends a message.
2. Do not show inline "创建Task" buttons in Chat.
3. Task generation is driven by local conversation-level summarization:
   - when the active conversation approaches a context threshold (target: 50%),
   - the local app evaluates the whole conversation,
   - then it creates or updates a local Progress task with structured sections:
     - 任务背景
     - 任务详情
     - 任务解决进度
4. Local agents can manage Progress through the local `qrclaw-agent-host progress` tool. When an owner asks an agent to create, find, update, comment on, block, or complete a task, the agent should use that tool instead of only replying in chat.

Progress data remains local-only. Do not introduce Supabase tables or remote persistence for this workflow unless the product direction changes.

This avoids turning every actionable sentence into a board item.

## Legacy heuristic reference

If this module is reused later, only consider content that is a **complete, actionable task** — something that could be tracked on a board until done.

Examples that **should** create a task:

- 「修复 Chat 页重连 banner 字距不统一的问题」
- 「Implement dark mode toggle on settings page」
- 「1. 排查 agent 离线 2. 写 dev-log」

Examples that **should not** create a task:

- 「你好」「谢谢」「ok」
- 「你是谁？」
- Single-word reactions or empty follow-ups

## Implementation

Do not wire `isCompleteProgressTask(content)` directly to `ensureProgressTaskForMessage`.
The heuristic may be used as one weak signal inside local conversation summarization, but it should not create tasks by itself.

Heuristics (legacy, keep in sync with the module if reused):

1. Minimum length 8 chars (excluding whitespace-only).
2. Reject pure greetings / chitchat patterns.
3. Accept if action verbs (EN/ZH) present.
4. Accept numbered or bulleted multi-step lists.
5. Accept long multi-sentence requests (≥24 chars, ≥2 segments) or very long single blocks (≥48 chars).

Adjust thresholds only when user feedback shows systematic false positives/negatives.
