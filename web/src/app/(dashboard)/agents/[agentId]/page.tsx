'use client';

/**
 * /agents/[agentId] — Wave 10 S1 UX-3
 *
 * Consolidates what used to live under /qrcodes and /agents/[agentId]/edit
 * into a single agent detail page with three tabs:
 *
 *   - Chat         · opens the owner→agent chat for this agent
 *   - QR Codes     · lists QR codes bound to this agent (was /qrcodes)
 *   - QR Codes     · lists QR codes bound to this agent
 *
 * The QR codes tab intentionally keeps a simple read-only list; the deep
 * per-qrcode profile view stays under /qrcodes/[slug] style pages in a
 * later sprint. Creating a new QR code still routes to /qrcodes/create
 * with this agent pre-selected via `?agent=<id>`.
 */

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Plus, QrCode, MessagesSquare } from 'lucide-react';
import { useQRCodes } from '@/hooks/useQRCodes';
import { useAgent } from '@/hooks/useAgent';
import {
  getQrProfileConversationCount,
  getQrProfileDisplayName,
  getQrProfileScanCount,
} from '@/lib/qrcode-profile-display';

type Tab = 'chat' | 'qrcodes';
const VALID_TABS: Tab[] = ['chat', 'qrcodes'];

export default function AgentDetailPage() {
  const params = useParams<{ agentId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentId = params?.agentId ?? '';

  const initialTab = (searchParams.get('tab') as Tab) ?? 'qrcodes';
  const [tab, setTab] = useState<Tab>(VALID_TABS.includes(initialTab) ? initialTab : 'qrcodes');

  useEffect(() => {
    const next = (searchParams.get('tab') as Tab) ?? 'qrcodes';
    if (VALID_TABS.includes(next) && next !== tab) setTab(next);
    // Only react to external URL changes; `tab` intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setTabAndSync = (next: Tab) => {
    setTab(next);
    const usp = new URLSearchParams(searchParams.toString());
    usp.set('tab', next);
    router.replace(`/agents/${agentId}?${usp.toString()}`);
  };

  const { agent, loading: agentLoading } = useAgent(agentId);
  const { qrcodes, loading: qrLoading } = useQRCodes();

  const agentQrcodes = useMemo(
    () => qrcodes.filter((q) => q.agent_id === agentId),
    [qrcodes, agentId]
  );

  const totalScans = useMemo(
    () => agentQrcodes.reduce((s, q) => s + getQrProfileScanCount(q), 0),
    [agentQrcodes]
  );
  const totalChats = useMemo(
    () => agentQrcodes.reduce((s, q) => s + getQrProfileConversationCount(q), 0),
    [agentQrcodes]
  );

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-off-white)',
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 24px',
          background: 'var(--color-white)',
          borderBottom: '1px solid var(--color-dashboard-divider)',
        }}
      >
        <Link
          href="/agents"
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 13,
            color: 'var(--color-gray-600)',
            textDecoration: 'none',
          }}
        >
          ← Agents
        </Link>
        <div
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--color-gray-800)',
          }}
        >
          {agent?.name ?? (agentLoading ? 'Loading…' : 'Agent')}
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: '0 24px',
          background: 'var(--color-white)',
          borderBottom: '1px solid var(--color-gray-border)',
        }}
        role="tablist"
        aria-label="Agent sections"
      >
        <TabButton
          active={tab === 'chat'}
          onClick={() => setTabAndSync('chat')}
          icon={<MessagesSquare size={14} />}
          label="Chat"
        />
        <TabButton
          active={tab === 'qrcodes'}
          onClick={() => setTabAndSync('qrcodes')}
          icon={<QrCode size={14} />}
          label={`QR Codes${agentQrcodes.length ? ` · ${agentQrcodes.length}` : ''}`}
        />
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 24,
        }}
        role="tabpanel"
      >
        {tab === 'chat' && (
          <div>
            <p
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 13,
                color: 'var(--color-gray-700)',
                marginBottom: 12,
              }}
            >
              Continue the owner-side conversation with this agent in the Chat workspace.
            </p>
            <Link href={`/chat?agent=${agentId}`} style={primaryLinkStyle}>
              Open chat →
            </Link>
          </div>
        )}

        {tab === 'qrcodes' && (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 24,
                  fontFamily: 'var(--font-primary)',
                  fontSize: 13,
                  color: 'var(--color-gray-700)',
                }}
              >
                <span>
                  <strong style={{ color: 'var(--color-gray-800)' }}>{agentQrcodes.length}</strong>{' '}
                  QR code{agentQrcodes.length === 1 ? '' : 's'}
                </span>
                <span>
                  <strong style={{ color: 'var(--color-gray-800)' }}>{totalScans}</strong> scans
                </span>
                <span>
                  <strong style={{ color: 'var(--color-gray-800)' }}>{totalChats}</strong> chats
                </span>
              </div>
              <Link href={`/qrcodes/create?agent=${agentId}`} style={primaryBtnLinkStyle}>
                <Plus size={14} />
                <span>New QR Code</span>
              </Link>
            </div>

            {qrLoading ? (
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--color-gray-500)',
                  fontFamily: 'var(--font-primary)',
                }}
              >
                Loading…
              </div>
            ) : agentQrcodes.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  border: '1px dashed var(--color-gray-border)',
                  borderRadius: 12,
                  background: 'var(--color-white)',
                  textAlign: 'center',
                  color: 'var(--color-gray-700)',
                  fontFamily: 'var(--font-primary)',
                  fontSize: 13,
                }}
              >
                No QR codes yet for this agent.{' '}
                <Link
                  href={`/qrcodes/create?agent=${agentId}`}
                  style={{ color: 'var(--color-red)', fontWeight: 600 }}
                >
                  Create the first one
                </Link>
                .
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: 12,
                }}
              >
                {agentQrcodes.map((qr) => {
                  const name = getQrProfileDisplayName(qr) || qr.slug;
                  const scans = getQrProfileScanCount(qr);
                  const chats = getQrProfileConversationCount(qr);
                  return (
                    <div key={qr.id} style={qrCardStyle}>
                      <div
                        style={{
                          fontFamily: 'var(--font-primary)',
                          fontSize: 14,
                          fontWeight: 600,
                          color: 'var(--color-gray-800)',
                          marginBottom: 4,
                        }}
                      >
                        {name}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--color-gray-600)',
                          marginBottom: 10,
                        }}
                      >
                        /{qr.slug}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: 12,
                          fontSize: 12,
                          color: 'var(--color-gray-700)',
                        }}
                      >
                        <span>{scans} scans</span>
                        <span>{chats} chats</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '12px 16px',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid var(--color-red)' : '2px solid transparent',
        color: active ? 'var(--color-red)' : 'var(--color-gray-700)',
        fontFamily: 'var(--font-primary)',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        marginBottom: -1,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

const primaryLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 16px',
  background: 'var(--color-red)',
  color: 'var(--color-white)',
  borderRadius: 8,
  fontFamily: 'var(--font-primary)',
  fontSize: 13,
  fontWeight: 600,
  textDecoration: 'none',
};

const primaryBtnLinkStyle: React.CSSProperties = {
  ...primaryLinkStyle,
  padding: '8px 14px',
  fontSize: 12,
};

const qrCardStyle: React.CSSProperties = {
  padding: 14,
  background: 'var(--color-white)',
  border: '1px solid var(--color-gray-border)',
  borderRadius: 10,
};
