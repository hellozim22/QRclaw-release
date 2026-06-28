/**
 * data-retention Edge Function
 *
 * Scheduled cleanup of expired messages based on Owner plan tier.
 * Can be invoked by cron (pg_cron / Supabase scheduled function)
 * or manually by an admin with service_role key.
 *
 * Retention policy:
 *   free — 30 days
 *   pro  — 90 days
 *   max  — unlimited (no deletion)
 *
 * Flow:
 *   1. Authenticate via service_role key or internal cron header
 *   2. For each plan tier with a retention limit:
 *      a. Find conversations owned by owners on that plan
 *      b. Delete messages older than the retention window
 *      c. Delete orphaned encryption_keys (no remaining messages)
 *      d. Delete empty conversations (no remaining messages)
 *   3. Run existing cleanup utilities (expired sessions, unclaimed agents)
 *   4. Return summary of deleted counts
 */
import { getServiceClient } from '../_shared/supabase.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

/** Retention days per plan tier. null = unlimited (no cleanup). */
const RETENTION_DAYS: Record<string, number | null> = {
  free: 30,
  pro: 90,
  max: null,
};

/** Batch size for message deletion to avoid long-running transactions. */
const BATCH_SIZE = 1000;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  if (req.method !== 'POST') {
    return errorResponse('method_not_allowed', 'Only POST is allowed', 405);
  }

  try {
    // Authenticate: require service_role key or cron secret
    const authHeader = req.headers.get('Authorization');
    const cronSecret = Deno.env.get('CRON_SECRET');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const isCron = cronSecret && req.headers.get('X-Cron-Secret') === cronSecret;
    const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;

    if (!isCron && !isServiceRole) {
      return errorResponse(
        'unauthorized',
        'This endpoint requires service_role or cron authentication',
        401
      );
    }

    const supabase = getServiceClient();
    const summary: Record<string, unknown> = {
      started_at: new Date().toISOString(),
      messages_deleted: 0,
      encryption_keys_deleted: 0,
      conversations_deleted: 0,
      sessions_cleaned: 0,
      agents_cleaned: 0,
    };

    // Process each plan tier with a retention limit
    for (const [plan, retentionDays] of Object.entries(RETENTION_DAYS)) {
      if (retentionDays === null) continue;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffISO = cutoffDate.toISOString();

      // Find owners on this plan
      const { data: owners, error: ownersError } = await supabase
        .from('owners')
        .select('id')
        .eq('plan', plan);

      if (ownersError || !owners || owners.length === 0) continue;

      const ownerIds = owners.map((o: { id: string }) => o.id);

      // Find agents belonging to these owners
      const { data: agents, error: agentsError } = await supabase
        .from('agents')
        .select('id')
        .in('owner_id', ownerIds);

      if (agentsError || !agents || agents.length === 0) continue;

      const agentIds = agents.map((a: { id: string }) => a.id);

      // Find QR codes belonging to these agents
      const { data: qrcodes, error: qrError } = await supabase
        .from('qrcodes')
        .select('id')
        .in('agent_id', agentIds);

      if (qrError || !qrcodes || qrcodes.length === 0) continue;

      const qrcodeIds = qrcodes.map((q: { id: string }) => q.id);

      // Find conversations for these QR codes
      const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select('id')
        .in('qrcode_id', qrcodeIds);

      if (convError || !conversations || conversations.length === 0) continue;

      const conversationIds = conversations.map((c: { id: string }) => c.id);

      // Delete expired messages in batches
      let totalMessagesDeleted = 0;
      let batchDeleted = BATCH_SIZE;

      while (batchDeleted >= BATCH_SIZE) {
        // Find message IDs to delete (batch)
        const { data: expiredMessages, error: msgFetchError } = await supabase
          .from('messages')
          .select('id')
          .in('conversation_id', conversationIds)
          .lt('sent_at', cutoffISO)
          .limit(BATCH_SIZE);

        if (msgFetchError || !expiredMessages || expiredMessages.length === 0) break;

        const messageIds = expiredMessages.map((m: { id: string }) => m.id);

        // Delete message_deliveries first (FK constraint)
        await supabase.from('message_deliveries').delete().in('message_id', messageIds);

        // Delete messages
        const { error: deleteError } = await supabase
          .from('messages')
          .delete()
          .in('id', messageIds);

        if (deleteError) {
          console.error(`Failed to delete messages for plan ${plan}:`, deleteError);
          break;
        }

        batchDeleted = messageIds.length;
        totalMessagesDeleted += batchDeleted;
      }

      summary.messages_deleted = (summary.messages_deleted as number) + totalMessagesDeleted;

      // Cleanup orphaned encryption_keys (no remaining messages referencing them)
      const { data: orphanedKeys, error: orphanKeysError } = await supabase.rpc(
        'cleanup_orphaned_encryption_keys',
        {
          p_conversation_ids: conversationIds,
        }
      );

      if (!orphanKeysError && orphanedKeys) {
        summary.encryption_keys_deleted =
          (summary.encryption_keys_deleted as number) + (orphanedKeys as number);
      }

      // Cleanup empty conversations (no messages left + inactive > retention period)
      const { data: emptyConvs, error: emptyConvError } = await supabase
        .from('conversations')
        .select('id, message_count')
        .in('id', conversationIds)
        .eq('message_count', 0)
        .lt('last_active_at', cutoffISO);

      if (!emptyConvError && emptyConvs && emptyConvs.length > 0) {
        const emptyIds = emptyConvs.map((c: { id: string }) => c.id);

        // Delete encryption keys for empty conversations
        await supabase.from('encryption_keys').delete().in('conversation_id', emptyIds);

        const { error: convDeleteError } = await supabase
          .from('conversations')
          .delete()
          .in('id', emptyIds);

        if (!convDeleteError) {
          summary.conversations_deleted =
            (summary.conversations_deleted as number) + emptyIds.length;
        }
      }
    }

    // Run existing cleanup utilities
    const { data: sessionsCleanedResult } = await supabase.rpc('cleanup_expired_sessions');
    if (sessionsCleanedResult !== null) {
      summary.sessions_cleaned = sessionsCleanedResult;
    }

    const { data: agentsCleanedResult } = await supabase.rpc('cleanup_unclaimed_agents');
    if (agentsCleanedResult !== null) {
      summary.agents_cleaned = agentsCleanedResult;
    }

    summary.completed_at = new Date().toISOString();

    return jsonResponse({ data: summary });
  } catch (err) {
    console.error('data-retention error:', err);
    return errorResponse('internal_error', 'An unexpected error occurred', 500);
  }
});
