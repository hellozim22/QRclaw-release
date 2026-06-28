-- =============================================================================
-- M1-RLS-OPT — conversation_participants RLS auth initplan 优化
-- =============================================================================
-- 触发：M1 代码审查反馈 C-4 + Supabase advisor auth_rls_initplan (WARN, 2 条)
-- 参考：https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- 问题：前一个 migration (20260420_future_group_topic_reserve.sql) 里 RLS policy
-- 的 WHERE 子句写的是 `WHERE o.user_id = auth.uid()`。PostgreSQL planner 对每一
-- 行 participant 都会重新执行 auth.uid()，在生产规模下（虽然 MVP 此表 0 行）
-- 是已知的 Supabase 反模式。
--
-- 修复：DROP + CREATE policy，用 `(SELECT auth.uid())` 包装，让 initplan 只执行
-- 一次。语义完全等价，行为不变。
--
-- MVP invariant：此 migration 应用时 conversation_participants = 0 行，
-- DROP/CREATE 之间没有数据处于"无 policy 保护"的风险窗口（表空 + FORCE RLS
-- 意味着任何访问在无 policy 时默认拒绝，而不是默认放行）。
-- =============================================================================

DROP POLICY IF EXISTS "conversation_participants_select_own" ON conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_delete_own" ON conversation_participants;

CREATE POLICY "conversation_participants_select_own" ON conversation_participants
  FOR SELECT USING (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN qrcodes q ON c.qrcode_id = q.id
      JOIN agents a ON q.agent_id = a.id
      JOIN owners o ON a.owner_id = o.id
      WHERE o.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "conversation_participants_delete_own" ON conversation_participants
  FOR DELETE USING (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN qrcodes q ON c.qrcode_id = q.id
      JOIN agents a ON q.agent_id = a.id
      JOIN owners o ON a.owner_id = o.id
      WHERE o.user_id = (SELECT auth.uid())
    )
  );
