/**
 * usage-stats Edge Function
 *
 * Owner-only endpoint to retrieve aggregated usage statistics.
 * Returns message counts, active conversations, and agent activity
 * for the authenticated Owner's resources.
 *
 * Flow:
 *   1. Authenticate Owner via Supabase JWT
 *   2. Look up owner record
 *   3. Query usage_logs aggregated by event_type for the requested period
 *   4. Query active conversations and agents counts
 *   5. Return summary statistics
 */
import { getServiceClient } from '../_shared/supabase.ts';
import { authenticateOwner } from '../_shared/auth.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';

/** Default period for usage stats: last 30 days. */
const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  if (req.method !== 'GET') {
    return errorResponse('method_not_allowed', 'Only GET is allowed', 405);
  }

  try {
    // Authenticate Owner
    let authResult;
    try {
      authResult = await authenticateOwner(req);
    } catch (authError) {
      if (authError === 'missing_auth' || authError === 'invalid_auth') {
        return errorResponse('unauthorized', 'Missing or invalid Authorization header', 401);
      }
      if (authError === 'unauthorized') {
        return errorResponse('unauthorized', 'Invalid or expired token', 401);
      }
      return errorResponse('internal_error', 'Server configuration error', 500);
    }

    const { user } = authResult;
    const supabase = getServiceClient();

    // Get owner record
    const { data: owner, error: ownerError } = await supabase
      .from('owners')
      .select('id, plan')
      .eq('user_id', user.id)
      .single();

    if (ownerError || !owner) {
      return errorResponse('forbidden', 'Owner profile not found', 403);
    }

    // Parse query parameters
    const url = new URL(req.url);
    const daysParam = url.searchParams.get('days');
    const days = daysParam
      ? Math.min(Math.max(parseInt(daysParam, 10) || DEFAULT_DAYS, 1), MAX_DAYS)
      : DEFAULT_DAYS;

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const sinceISO = sinceDate.toISOString();

    // Get owner's agents
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('id, status')
      .eq('owner_id', owner.id);

    if (agentsError) {
      console.error('Failed to fetch agents:', agentsError);
      return errorResponse('internal_error', 'Failed to fetch agent data', 500);
    }

    const agentIds = (agents || []).map((a: { id: string }) => a.id);
    const activeAgents = (agents || []).filter(
      (a: { status: string }) => a.status === 'active'
    ).length;
    const totalAgents = (agents || []).length;

    // If no agents, return empty stats
    if (agentIds.length === 0) {
      return jsonResponse({
        data: {
          period: { days, since: sinceISO },
          plan: owner.plan,
          agents: { total: 0, active: 0 },
          conversations: { total: 0, active: 0 },
          messages: { total: 0, in_period: 0 },
          usage_by_event: {},
          qrcodes: { total: 0, active: 0 },
        },
      });
    }

    // Aggregate usage_logs by event_type for this owner's agents
    const { data: usageLogs, error: usageError } = await supabase
      .from('usage_logs')
      .select('event_type, counted_at')
      .eq('owner_id', owner.id)
      .gte('counted_at', sinceISO);

    const usageByEvent: Record<string, number> = {};
    if (!usageError && usageLogs) {
      for (const log of usageLogs) {
        const eventType = log.event_type as string;
        usageByEvent[eventType] = (usageByEvent[eventType] || 0) + 1;
      }
    }

    // Count QR codes
    const { data: qrcodes, error: qrError } = await supabase
      .from('qrcodes')
      .select('id, status')
      .in('agent_id', agentIds);

    const totalQrcodes = (qrcodes || []).length;
    const activeQrcodes = (qrcodes || []).filter(
      (q: { status: string }) => q.status === 'active'
    ).length;

    // Count conversations
    const qrcodeIds = (qrcodes || []).map((q: { id: string }) => q.id);

    let totalConversations = 0;
    let activeConversations = 0;
    let totalMessages = 0;
    let messagesInPeriod = 0;

    if (qrcodeIds.length > 0) {
      // Total conversations
      const { data: convs, error: convsError } = await supabase
        .from('conversations')
        .select('id, message_count, last_active_at')
        .in('qrcode_id', qrcodeIds);

      if (!convsError && convs) {
        totalConversations = convs.length;

        // Active = last_active_at within the period
        activeConversations = convs.filter(
          (c: { last_active_at: string }) => c.last_active_at && c.last_active_at >= sinceISO
        ).length;

        // Total messages across all conversations
        totalMessages = convs.reduce(
          (sum: number, c: { message_count: number }) => sum + (c.message_count || 0),
          0
        );

        // Messages sent in period
        const conversationIds = convs.map((c: { id: string }) => c.id);
        if (conversationIds.length > 0) {
          const { count, error: msgCountError } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .in('conversation_id', conversationIds)
            .gte('sent_at', sinceISO);

          if (!msgCountError && count !== null) {
            messagesInPeriod = count;
          }
        }
      }
    }

    return jsonResponse({
      data: {
        period: { days, since: sinceISO },
        plan: owner.plan,
        agents: { total: totalAgents, active: activeAgents },
        conversations: { total: totalConversations, active: activeConversations },
        messages: { total: totalMessages, in_period: messagesInPeriod },
        usage_by_event: usageByEvent,
        qrcodes: { total: totalQrcodes, active: activeQrcodes },
      },
    });
  } catch (err) {
    console.error('usage-stats error:', err);
    return errorResponse('internal_error', 'An unexpected error occurred', 500);
  }
});
