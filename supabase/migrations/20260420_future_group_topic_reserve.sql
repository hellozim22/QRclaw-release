-- =============================================================================
-- M1-DB-RESERVE — 群聊/话题 DB 字段预留（v1.3 plan §12.3.2，决议 D9）
-- =============================================================================
-- ⚠️  未来使用字段；MVP 零引用。
-- 本 migration 只加字段和新表，不改现有数据语义、不加索引（除 participants 主键）、
-- 不改 RLS 以外的行为；所有新字段 NULLABLE（messages / conversations 方向）或
-- 有安全默认值（conversations.kind），保证现有 11 行 conversations + 307 行
-- messages 零回归。
--
-- 触发：v1.3 D9 "群聊/话题 MVP 不做，DB + 协议 optional 字段一次性预留"
-- 使用时机（不在本里程碑做）：
--   * conversations.kind != 'direct' 的行出现 → 后续 group/topic 里程碑
--   * messages.thread_id / reply_to_message_id 被写入 → 同上
--   * conversation_participants 有行 → 同上
--
-- 本 migration 本身不写入任何数据，不改 Gateway 行为，不改 RLS 现有规则。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) conversations 扩展：kind + parent_conversation_id
-- ---------------------------------------------------------------------------
-- ⚠️  幂等性注释：`ADD COLUMN IF NOT EXISTS kind ... CHECK (...)` 在列已存在时
--     会静默跳过整条语句（含 CHECK）。Supabase migration runner 保证每个
--     migration 只执行一次，故安全；但若手动 `psql -f` 重跑此文件，二次执行
--     会跳过 CHECK 创建。代码审查 C-1 已评估并接受此风险。
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'direct'
    CHECK (kind IN ('direct', 'group', 'topic'));

COMMENT ON COLUMN conversations.kind IS
  'M1-DB-RESERVE (2026-04-20): conversation kind. MVP 仅产生 direct 值；group/topic 预留给未来群聊/话题功能（plan D9）。在那之前此列永远是 direct。';

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS parent_conversation_id UUID
    REFERENCES conversations(id) ON DELETE SET NULL;

COMMENT ON COLUMN conversations.parent_conversation_id IS
  'M1-DB-RESERVE (2026-04-20): 话题的父会话（topic → parent group）。MVP 永远为 NULL。';

-- 不加索引：MVP 没有按 kind / parent_conversation_id 查询的路径；
-- 未来需要时再新建带 partial index（where kind != ''direct''）的 migration。
--
-- FUTURE-INDEX（代码审查 I-6）：
--   `conversations.parent_conversation_id` 是自引用 FK 且 ON DELETE SET NULL。
--   parent 被删时需扫全表找子行。MVP conv 表 ~11 行无感知；生产规模下群聊功能
--   上线前需补 partial index：
--     CREATE INDEX CONCURRENTLY idx_conv_parent
--       ON conversations(parent_conversation_id)
--       WHERE parent_conversation_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) messages 扩展：thread_id + reply_to_message_id
-- ---------------------------------------------------------------------------
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS thread_id UUID;

COMMENT ON COLUMN messages.thread_id IS
  'M1-DB-RESERVE (2026-04-20): 消息所属话题 id（对应 conversations.id where kind=topic）。MVP 永远为 NULL。不加外键以避免 direct 场景的写入开销；未来转正时再加约束。';

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID
    REFERENCES messages(id) ON DELETE SET NULL;

COMMENT ON COLUMN messages.reply_to_message_id IS
  'M1-DB-RESERVE (2026-04-20): 回复引用的消息 id（对应 Telegram reply_to）。MVP 永远为 NULL；plan v1.3 §5.1 L1.6 在 WS 协议层同步预留 optional 字段。';

-- 不加索引：MVP 无路径按 thread_id / reply_to_message_id 查询；未来需要时再加。
--
-- FUTURE-INDEX（代码审查 I-6 + Supabase advisor unindexed_foreign_keys INFO）：
--   `messages.reply_to_message_id` 是自引用 FK 且 ON DELETE SET NULL。
--   parent 消息被删时需扫全表找引用行。MVP ~307 行无感知；messages 是增长最
--   快的表，回复 / 话题功能上线前应先补 partial index 以避免在大表上跑
--   `CREATE INDEX CONCURRENTLY`（那会很贵）：
--     CREATE INDEX CONCURRENTLY idx_msgs_reply_to
--       ON messages(reply_to_message_id)
--       WHERE reply_to_message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) conversation_participants —— 新表（多参与者场景预留）
-- ---------------------------------------------------------------------------
-- 设计要点：
--   * 复合主键 (conversation_id, participant_kind, participant_id) 支持
--     同一会话里多个参与者（未来 group / topic），也隐含 UNIQUE
--   * participant_kind 限定 ('visitor','agent','owner')：owner 是为未来
--     "多人 owner 协同" 预留，MVP 用不到
--   * 不引用 visitors / agents / owners 表的外键，因为：
--       - visitors 目前只有 session_token 没有表（C4 铁律），没有稳定外键
--       - 未来 visitor_sessions 表若转正，届时用 migration 加外键
--   * role 字段（owner / member / mentioned）同样为未来权限系统预留
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  participant_kind  TEXT NOT NULL CHECK (participant_kind IN ('visitor', 'agent', 'owner')),
  participant_id    TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'member'
                      CHECK (role IN ('owner', 'member', 'mentioned')),
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at      TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, participant_kind, participant_id)
);

COMMENT ON TABLE conversation_participants IS
  'M1-DB-RESERVE (2026-04-20): 会话参与者表。MVP 不使用（direct 会话的 visitor/agent 关系通过 conversations.qrcode_id → qrcodes.agent_id + conversations.session_token 隐式表达）。为未来群聊/话题的"一个会话 N 个参与者"语义预留。参见 plan D9 与 Gateway fanout 抽象（M2-GW-FANOUT §12.4.3）。';

-- 索引：只加一个"按 participant 反查 conversations"的索引（后续常见查询）
-- 不加"按 conversation_id 列出 participants"的索引，因为主键前缀已覆盖
CREATE INDEX IF NOT EXISTS idx_conversation_participants_by_participant
  ON conversation_participants (participant_kind, participant_id);

-- RLS —— 与 conversations 表同档：owner 通过 ownership chain SELECT，其他身份走 service_role
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants FORCE ROW LEVEL SECURITY;

CREATE POLICY "conversation_participants_select_own" ON conversation_participants
  FOR SELECT USING (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN qrcodes q ON c.qrcode_id = q.id
      JOIN agents a ON q.agent_id = a.id
      JOIN owners o ON a.owner_id = o.id
      WHERE o.user_id = auth.uid()
    )
  );

CREATE POLICY "conversation_participants_delete_own" ON conversation_participants
  FOR DELETE USING (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN qrcodes q ON c.qrcode_id = q.id
      JOIN agents a ON q.agent_id = a.id
      JOIN owners o ON a.owner_id = o.id
      WHERE o.user_id = auth.uid()
    )
  );

-- 无 INSERT/UPDATE policy —— Gateway 使用 service_role 写入，bypass RLS
-- （与 messages / conversations 一致的安全模型）

-- ---------------------------------------------------------------------------
-- 4) MVP invariant assertion —— 这份 migration 不应改任何行为
-- ---------------------------------------------------------------------------
-- 预期：运行完本 migration 后，现有 11 行 conversations 全部 kind='direct'，
-- 现有 307 行 messages 全部 thread_id/reply_to_message_id = NULL。
-- 若有任何非预期值，说明本 migration 被重复执行或者存在并发写入——此时应回滚。
-- （ALTER TABLE ADD COLUMN IF NOT EXISTS 是幂等的，重复执行安全。）

-- 结束。M1-DB-RESERVE 交付完成。
