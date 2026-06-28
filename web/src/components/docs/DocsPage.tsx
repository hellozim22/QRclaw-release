'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Menu, X, QrCode, Bot } from 'lucide-react';

interface NavItem {
  label: string;
  slug: string;
  children?: NavItem[];
}

interface PageContent {
  title: string;
  subtitle: string;
  breadcrumb: string;
  toc: string[];
  render: () => React.ReactNode;
}

const NAV_TREE: NavItem[] = [
  {
    label: 'Getting Started',
    slug: 'getting-started',
    children: [
      { label: 'Introduction', slug: 'introduction' },
      { label: 'Quick Start', slug: 'quick-start' },
      { label: 'Installation', slug: 'installation' },
    ],
  },
  {
    label: 'Core Concepts',
    slug: 'core-concepts',
    children: [
      { label: 'Agents', slug: 'agents' },
      { label: 'QR Codes', slug: 'qr-codes' },
      { label: 'Conversations', slug: 'conversations' },
    ],
  },
  {
    label: 'Guides',
    slug: 'guides',
    children: [
      { label: 'Custom Branding', slug: 'custom-branding' },
      { label: 'Analytics', slug: 'analytics' },
      { label: 'Security', slug: 'security' },
    ],
  },
];

/* ─── Shared styles ─── */

const h2: React.CSSProperties = {
  fontSize: 'var(--text-xl)',
  fontWeight: 'var(--font-bold)',
  margin: '28px 0 10px',
  color: 'var(--color-gray-800)',
};

const para: React.CSSProperties = {
  fontSize: 'var(--text-md)',
  lineHeight: 1.7,
  margin: '0 0 14px',
  color: 'var(--color-gray-600)',
};

const codeBox: React.CSSProperties = {
  background: 'var(--color-charcoal)',
  borderRadius: 'var(--radius-md)',
  padding: '16px 20px',
  margin: '0 0 14px',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-gray-200)',
  lineHeight: 1.7,
  overflowX: 'auto',
};

/* ─── CSS Illustration: Phone Chat ─── */

function IllustChat({ messages }: { messages?: { agent: boolean; text: string }[] }) {
  const msgs = messages || [
    { agent: true, text: 'Hi! How can I help you?' },
    { agent: false, text: 'I have a question about your product.' },
    { agent: true, text: 'Sure! Let me look into that for you.' },
  ];
  return (
    <div style={{
      width: 240, borderRadius: 24, overflow: 'hidden',
      border: '2px solid var(--color-gray-200)', background: '#F7F7F8',
      boxShadow: '0 8px 24px rgba(0,0,0,0.06)', margin: '16px auto 20px',
    }}>
      <div style={{ height: 24, background: 'var(--color-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: 'var(--color-gray-400)' }}>9:41</div>
      <div style={{ padding: '8px 12px', background: 'var(--color-white)', borderBottom: '1px solid var(--color-gray-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--color-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 11, fontWeight: 700 }}>A</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-gray-800)' }}>My Agent</div>
          <div style={{ fontSize: 9, color: 'var(--color-success)' }}>Online</div>
        </div>
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{
            maxWidth: '80%', padding: '7px 10px',
            borderRadius: m.agent ? '10px 10px 10px 3px' : '10px 10px 3px 10px',
            background: m.agent ? 'var(--color-white)' : 'var(--color-red)',
            color: m.agent ? 'var(--color-gray-800)' : 'white',
            fontSize: 11, lineHeight: 1.5,
            alignSelf: m.agent ? 'flex-start' : 'flex-end',
            boxShadow: m.agent ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
          }}>{m.text}</div>
        ))}
      </div>
      <div style={{ padding: '6px 10px', background: 'var(--color-white)', borderTop: '1px solid var(--color-gray-border)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, height: 26, borderRadius: 13, background: 'var(--color-gray-100)', paddingLeft: 10, display: 'flex', alignItems: 'center', fontSize: 10, color: 'var(--color-gray-400)' }}>Type a message...</div>
        <div style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--color-red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 0, height: 0, borderTop: '4px solid transparent', borderBottom: '4px solid transparent', borderLeft: '6px solid white', marginLeft: 1 }} />
        </div>
      </div>
    </div>
  );
}

/* ─── CSS Illustration: Horizontal Step Flow ─── */

function IllustFlow({ steps }: { steps: { label: string; desc: string }[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', margin: '16px 0 20px', overflowX: 'auto' }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', minWidth: 110 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 18,
              background: 'var(--color-red)', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 700, marginBottom: 6,
            }}>{i + 1}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-gray-800)' }}>{s.label}</div>
            <div style={{ fontSize: 11, color: 'var(--color-gray-500)', marginTop: 3, lineHeight: 1.4, maxWidth: 110, paddingInline: 4 }}>{s.desc}</div>
          </div>
          {i < steps.length - 1 && (
            <div style={{ width: 28, height: 2, background: 'var(--color-gray-200)', marginTop: 17, flexShrink: 0 }} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── CSS Illustration: QR Scan Flow ─── */

function IllustQRFlow() {
  const arrow = (
    <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0 4px' }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M5 12h14m0 0l-4-4m4 4l-4 4" stroke="var(--color-gray-300)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      padding: '24px 20px', margin: '14px 0 20px',
      borderRadius: 16, background: 'var(--color-off-white)', border: '1px solid var(--color-gray-border)',
    }}>
      {/* Step 1: QR Card — matches landing page official style */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 110, height: 130, borderRadius: 14, background: 'var(--color-white)',
          border: '1.5px solid var(--color-gray-200)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 10px 8px',
        }}>
          {/* Agent row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', marginBottom: 6 }}>
            <div style={{
              width: 18, height: 18, borderRadius: 5, background: 'var(--color-red)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={11} color="white" />
            </div>
            <div>
              <div style={{ fontSize: 7.5, fontWeight: 600, color: 'var(--color-gray-800)', lineHeight: 1.2 }}>QRClaw Support</div>
              <div style={{ fontSize: 6, color: 'var(--color-gray-500)', lineHeight: 1.2 }}>Official agent</div>
            </div>
          </div>
          {/* QR icon area */}
          <div style={{
            width: 72, height: 72, borderRadius: 8, background: 'var(--color-off-white)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <QrCode size={52} color="var(--color-red)" />
          </div>
          <div style={{ fontSize: 7, color: 'var(--color-gray-500)', marginTop: 4 }}>Scan to start chatting</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-gray-700)', marginTop: 8 }}>QR Code</div>
        <div style={{ fontSize: 10, color: 'var(--color-gray-500)', marginTop: 2 }}>Generate &amp; share</div>
      </div>

      {arrow}

      {/* Step 2: Scan — phone pointing at QR, no hand (clean product style) */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 110, height: 130, borderRadius: 14, background: 'var(--color-white)',
          border: '1.5px solid var(--color-gray-200)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* QR target in the back-left, slightly tilted */}
          <div style={{
            position: 'absolute', left: 8, top: 22, width: 40, height: 52,
            borderRadius: 6, background: 'white',
            border: '1.5px solid var(--color-gray-200)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
            transform: 'rotate(-5deg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 3, zIndex: 1,
          }}>
            <div style={{
              width: 12, height: 12, borderRadius: 4, background: 'var(--color-red)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={8} color="white" />
            </div>
            <div style={{
              width: 22, height: 22, borderRadius: 3, background: 'var(--color-off-white)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <QrCode size={16} color="var(--color-red)" />
            </div>
          </div>

          {/* Scan rays connecting QR to phone */}
          <svg width="110" height="130" viewBox="0 0 110 130" fill="none" style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
            <line x1="38" y1="52" x2="60" y2="42" stroke="var(--color-red)" strokeWidth="0.8" opacity="0.18" />
            <line x1="38" y1="58" x2="60" y2="56" stroke="var(--color-red)" strokeWidth="0.8" opacity="0.18" />
            <line x1="38" y1="64" x2="60" y2="70" stroke="var(--color-red)" strokeWidth="0.8" opacity="0.18" />
          </svg>

          {/* Phone, tilted, in the right-front */}
          <div style={{
            position: 'absolute', right: 10, top: 14,
            width: 48, height: 88, borderRadius: 10,
            border: '2px solid #B0B8C4', background: 'white',
            boxShadow: '0 4px 16px rgba(26,26,26,0.10)',
            transform: 'rotate(8deg)',
            zIndex: 3,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            {/* Notch */}
            <div style={{ width: 18, height: 3, borderRadius: 2, background: '#DDE2E7', marginTop: 5 }} />
            {/* Screen */}
            <div style={{
              flex: 1, width: 40, margin: '4px 0', borderRadius: 3, background: '#F6F7F9',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {/* Viewfinder */}
              <div style={{ width: 28, height: 28, position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: 9, height: 9, borderTop: '2.5px solid var(--color-red)', borderLeft: '2.5px solid var(--color-red)', borderRadius: '2px 0 0 0' }} />
                <div style={{ position: 'absolute', top: 0, right: 0, width: 9, height: 9, borderTop: '2.5px solid var(--color-red)', borderRight: '2.5px solid var(--color-red)', borderRadius: '0 2px 0 0' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, width: 9, height: 9, borderBottom: '2.5px solid var(--color-red)', borderLeft: '2.5px solid var(--color-red)', borderRadius: '0 0 0 2px' }} />
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderBottom: '2.5px solid var(--color-red)', borderRight: '2.5px solid var(--color-red)', borderRadius: '0 0 2px 0' }} />
                {/* Scan line */}
                <div style={{ position: 'absolute', top: '42%', left: 3, right: 3, height: 1.5, background: 'var(--color-red)', opacity: 0.5, borderRadius: 1 }} />
                {/* Mini QR ghost in viewfinder */}
                <div style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  width: 12, height: 12, opacity: 0.12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <QrCode size={12} color="var(--color-red)" />
                </div>
              </div>
            </div>
            {/* Home indicator */}
            <div style={{ width: 16, height: 2.5, borderRadius: 2, background: '#DDE2E7', marginBottom: 4 }} />
          </div>

          {/* Bottom label stripe */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 18,
            background: 'linear-gradient(0deg, rgba(226, 74, 63, 0.06) 0%, transparent 100%)',
          }} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-gray-700)', marginTop: 8 }}>Scan</div>
        <div style={{ fontSize: 10, color: 'var(--color-gray-500)', marginTop: 2 }}>Point &amp; scan</div>
      </div>

      {arrow}

      {/* Step 3: Chat interface */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 110, height: 130, borderRadius: 14, background: 'var(--color-white)',
          border: '1.5px solid var(--color-gray-200)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          display: 'flex', flexDirection: 'column', padding: '10px 8px 8px', overflow: 'hidden',
        }}>
          {/* Chat header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
            <div style={{
              width: 14, height: 14, borderRadius: 5,
              background: 'linear-gradient(135deg, var(--color-red) 0%, var(--color-red-light) 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 7, fontWeight: 700, color: 'white',
            }}>A</div>
            <div style={{ fontSize: 8, fontWeight: 600, color: 'var(--color-gray-800)' }}>Your Agent</div>
            <div style={{ width: 4, height: 4, borderRadius: 2, background: 'var(--color-green)', marginLeft: 'auto' }} />
          </div>
          {/* Messages */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
            <div style={{
              alignSelf: 'flex-start', background: 'var(--color-gray-100)', borderRadius: '6px 6px 6px 2px',
              padding: '3px 6px', fontSize: 7, color: 'var(--color-gray-700)', maxWidth: '80%', lineHeight: 1.3,
            }}>Hi! How can I help?</div>
            <div style={{
              alignSelf: 'flex-end', background: 'var(--color-visitor-bubble)', borderRadius: '6px 6px 2px 6px',
              padding: '3px 6px', fontSize: 7, color: 'var(--color-gray-700)', maxWidth: '75%', lineHeight: 1.3,
            }}>Tell me more</div>
            <div style={{
              alignSelf: 'flex-start', background: 'var(--color-gray-100)', borderRadius: '6px 6px 6px 2px',
              padding: '3px 6px', fontSize: 7, color: 'var(--color-gray-700)', maxWidth: '85%', lineHeight: 1.3,
            }}>Sure! Here&apos;s what...</div>
          </div>
          {/* Input bar */}
          <div style={{
            marginTop: 4, height: 14, borderRadius: 7, border: '1px solid var(--color-gray-200)',
            display: 'flex', alignItems: 'center', padding: '0 5px',
          }}>
            <div style={{ fontSize: 6, color: 'var(--color-gray-400)' }}>Type a message...</div>
            <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: 4, background: 'var(--color-red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 0, height: 0, borderLeft: '3px solid white', borderTop: '2px solid transparent', borderBottom: '2px solid transparent', marginLeft: 1 }} />
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-gray-700)', marginTop: 8 }}>Chat</div>
        <div style={{ fontSize: 10, color: 'var(--color-gray-500)', marginTop: 2 }}>Instant conversation</div>
      </div>
    </div>
  );
}

/* ─── Feature / Info Card Grid ─── */

function CardGrid({ items }: { items: { accent: string; title: string; desc: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, margin: '14px 0 20px' }}>
      {items.map((item, i) => (
        <div key={i} style={{
          padding: '14px 16px', borderRadius: 10,
          border: '1px solid var(--color-gray-border)', borderLeft: `3px solid ${item.accent}`,
          background: 'var(--color-white)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-gray-800)', marginBottom: 3 }}>{item.title}</div>
          <div style={{ fontSize: 12, color: 'var(--color-gray-500)', lineHeight: 1.5 }}>{item.desc}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── CSS Illustration: Agent Profile Page (matches real product) ─── */

function IllustProfile() {
  return (
    <div style={{
      width: 260, borderRadius: 24, overflow: 'hidden',
      border: '2px solid var(--color-gray-200)', background: 'var(--color-white)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.06)', margin: '16px auto 20px',
    }}>
      {/* Status bar */}
      <div style={{ height: 24, background: 'var(--color-white)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: 'var(--color-gray-400)' }}>9:41</div>

      {/* Profile content */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 20px 12px' }}>
        {/* Avatar */}
        <div style={{
          width: 80, height: 80, borderRadius: 20,
          background: 'linear-gradient(135deg, var(--color-red), var(--color-red-light))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: 32, fontWeight: 700,
          boxShadow: '0 4px 12px rgba(226,74,63,0.3)',
        }}>C</div>

        {/* Name & stats */}
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-gray-800)', marginTop: 12 }}>Caf&#233; Assistant</div>
        <div style={{ fontSize: 11, color: 'var(--color-gray-500)', marginTop: 3 }}>42 conversations served</div>
      </div>

      {/* Divider + Description */}
      <div style={{ margin: '0 20px', borderTop: '1px solid var(--color-gray-border)', padding: '12px 0' }}>
        <div style={{ fontSize: 12, color: 'var(--color-gray-600)', lineHeight: 1.6, textAlign: 'center' }}>
          I&apos;m your friendly caf&#233; assistant. Ask me about our menu, daily specials, or place an order!
        </div>
      </div>

      {/* Message button */}
      <div style={{ padding: '4px 20px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: '100%', padding: '10px 0', borderRadius: 24,
          background: 'var(--color-red)', color: 'white',
          fontSize: 14, fontWeight: 600, textAlign: 'center',
        }}>Message</div>
        <div style={{ fontSize: 10, color: 'var(--color-gray-500)' }}>
          <span style={{ color: 'var(--color-red)', fontWeight: 600 }}>Sign in</span> to save your conversations
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '16px 0 12px', textAlign: 'center' }}>
        <div style={{ fontSize: 9, color: 'var(--color-gray-400)' }}>Powered by QRClaw</div>
        <div style={{ fontSize: 9, color: 'var(--color-gray-400)', marginTop: 2 }}>Terms of Service &middot; Privacy Policy</div>
      </div>
    </div>
  );
}

/* ─── CSS Illustration: Dashboard Metrics ─── */

function IllustMetrics() {
  const data = [
    { value: '1,234', label: 'Total Scans', highlight: true },
    { value: '89', label: 'Conversations', highlight: false },
    { value: '2.3s', label: 'Avg Response', highlight: false },
  ];
  return (
    <div style={{ display: 'flex', gap: 10, margin: '14px 0 20px' }}>
      {data.map((m, i) => (
        <div key={i} style={{
          flex: 1, padding: 14, borderRadius: 10, textAlign: 'center',
          background: m.highlight ? 'var(--color-red)' : 'var(--color-white)',
          border: m.highlight ? 'none' : '1px solid var(--color-gray-border)',
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: m.highlight ? 'white' : 'var(--color-gray-800)' }}>{m.value}</div>
          <div style={{ fontSize: 11, color: m.highlight ? 'rgba(255,255,255,0.8)' : 'var(--color-gray-500)', marginTop: 3 }}>{m.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── CSS Illustration: Lifecycle pills ─── */

function IllustLifecycle({ stages }: { stages: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '14px 0 20px' }}>
      {stages.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            padding: '6px 14px', borderRadius: 16, fontSize: 12, fontWeight: 600,
            background: i === 3 ? 'var(--color-red)' : 'var(--color-gray-100)',
            color: i === 3 ? 'white' : 'var(--color-gray-700)',
          }}>{s}</div>
          {i < stages.length - 1 && <div style={{ color: 'var(--color-gray-300)', fontSize: 14 }}>&#8594;</div>}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════ PAGE CONTENT ═══════════════ */

const PAGES: Record<string, PageContent> = {
  'introduction': {
    title: 'Introduction',
    subtitle: 'Learn what QRClaw does and how it works.',
    breadcrumb: 'Introduction',
    toc: ['What is QRClaw', 'How It Works', 'Key Features', 'Use Cases'],
    render: () => (
      <>
        <h2 id="what-is-qrclaw" style={h2}>What is QRClaw</h2>
        <p style={para}>
          QRClaw turns your AI agent into a <strong>scannable QR code</strong>. Anyone can scan it with their phone and instantly start chatting with your agent — no app download, no sign-up.
        </p>
        <IllustQRFlow />

        <h2 id="how-it-works" style={h2}>How It Works</h2>
        <p style={para}>Only 3 steps. The whole process takes under 60 seconds:</p>
        <IllustFlow steps={[
          { label: 'Send a command', desc: 'Paste one curl to your AI agent' },
          { label: 'Click a link', desc: 'Bind the agent to your account' },
          { label: 'Share QR code', desc: 'Anyone scans and chats instantly' },
        ]} />

        <h2 id="key-features" style={h2}>Key Features</h2>
        <CardGrid items={[
          { accent: 'var(--color-red)', title: 'Zero install', desc: 'Visitors chat without downloading an app or creating an account.' },
          { accent: 'var(--color-success)', title: 'Real-time streaming', desc: 'Word-by-word replies for a natural conversation feel.' },
          { accent: '#6366F1', title: 'Encrypted storage', desc: 'Bank-level AES-256-GCM encryption on all messages.' },
          { accent: 'var(--color-warning)', title: 'Pure relay', desc: 'QRClaw never hosts AI or modifies your agent\'s replies.' },
        ]} />

        <h2 id="use-cases" style={h2}>Use Cases</h2>
        <CardGrid items={[
          { accent: 'var(--color-red)', title: 'Product support', desc: 'Print a QR code on packaging — customers get instant help.' },
          { accent: 'var(--color-success)', title: 'Event booth', desc: 'Visitors scan a badge to chat with your demo agent.' },
          { accent: '#6366F1', title: 'Share your AI', desc: 'Let friends or colleagues chat with your personal assistant.' },
          { accent: 'var(--color-warning)', title: 'Retail', desc: 'In-store QR codes for product Q&A and recommendations.' },
        ]} />
      </>
    ),
  },

  'quick-start': {
    title: 'Quick Start',
    subtitle: 'Get your AI agent a QR code in under 3 minutes.',
    breadcrumb: 'Quick Start',
    toc: ['Overview', 'Step 1: Send Command', 'Step 2: Claim Agent', 'Step 3: Create QR Code'],
    render: () => (
      <>
        <h2 id="overview" style={h2}>Overview</h2>
        <p style={para}>
          QRClaw uses a <strong>Skill.md</strong> approach — you don&apos;t write any code. Just send one command to your AI agent, it handles the rest.
        </p>
        <IllustFlow steps={[
          { label: 'Send command', desc: 'Agent connects automatically' },
          { label: 'Claim agent', desc: 'One-click account + binding' },
          { label: 'Create QR', desc: 'Download, print, share' },
        ]} />

        <h2 id="step-1" style={h2}>Step 1: Send Command</h2>
        <p style={para}>Copy this and send it to your AI agent (in any chat window you use):</p>
        <div style={codeBox}>
          <div style={{ color: 'var(--code-comment)' }}># One command. That&apos;s all.</div>
          <div><span style={{ color: 'var(--code-keyword)' }}>$</span> curl -s https://qrclaw.ai/skill.md</div>
        </div>
        <p style={para}>Your agent reads the document, understands the protocol, and connects to QRClaw automatically.</p>

        <h2 id="step-2" style={h2}>Step 2: Claim Your Agent</h2>
        <p style={para}>
          After connecting, your agent gives you a <strong>Claim URL</strong>. Click it in your browser:
        </p>
        <div style={codeBox}>
          <div>https://qrclaw.ai/claim/<span style={{ color: 'var(--code-string)' }}>your-unique-token</span></div>
        </div>
        <p style={para}>New user? Enter your email and verify — account creation and agent binding happen in one step. Already registered? Just confirm with one click.</p>

        <h2 id="step-3" style={h2}>Step 3: Create Your QR Code</h2>
        <p style={para}>
          In the dashboard, go to <strong>QR Codes</strong> and create one for your agent. Download the image, print it, or embed it on your website.
        </p>
        <p style={{ ...para, fontWeight: 600, color: 'var(--color-gray-800)' }}>
          Done! Anyone who scans the QR code can now chat with your AI agent instantly.
        </p>
        <IllustChat messages={[
          { agent: true, text: 'Welcome! How can I help you today?' },
          { agent: false, text: 'Hi, I just scanned your QR code!' },
          { agent: true, text: 'Great to meet you! Ask me anything.' },
        ]} />
      </>
    ),
  },

  'installation': {
    title: 'How Skill.md Works',
    subtitle: 'The technology behind the one-command setup.',
    breadcrumb: 'Installation',
    toc: ['What is Skill.md', 'What Your Agent Does', 'WebSocket Connection', 'Verify'],
    render: () => (
      <>
        <h2 id="what-is-skill-md" style={h2}>What is Skill.md</h2>
        <p style={para}>
          Skill.md is a document that teaches your AI agent how to connect to QRClaw. It contains API endpoints, authentication steps, and messaging protocol — all in a format AI agents can understand.
        </p>
        <p style={para}>No SDK to install, no environment to configure. Your agent reads it and knows what to do.</p>

        <h2 id="what-your-agent-does" style={h2}>What Your Agent Does</h2>
        <p style={para}>After reading Skill.md, your agent automatically:</p>
        <IllustLifecycle stages={['Register', 'Get credentials', 'Show Claim URL', 'Connect WebSocket']} />
        <CardGrid items={[
          { accent: 'var(--color-red)', title: 'Self-register', desc: 'Calls the API with its name and capabilities.' },
          { accent: 'var(--color-success)', title: 'Get credentials', desc: 'Receives agent_id, api_key, and claim_url.' },
          { accent: '#6366F1', title: 'Show Claim URL', desc: 'Presents the link so you can bind it to your account.' },
          { accent: 'var(--color-warning)', title: 'Connect', desc: 'Opens a persistent WebSocket to the QRClaw gateway.' },
        ]} />

        <h2 id="websocket-connection" style={h2}>WebSocket Connection</h2>
        <p style={para}>Your agent connects using a single-use ticket that expires in 30 seconds:</p>
        <div style={codeBox}>
          <div style={{ color: 'var(--code-comment)' }}>{'// 1. Request a ticket'}</div>
          <div><span style={{ color: 'var(--code-keyword)' }}>POST</span> /functions/v1/agent-ws-ticket</div>
          <div style={{ height: 6 }} />
          <div style={{ color: 'var(--code-comment)' }}>{'// 2. Connect with the ticket'}</div>
          <div><span style={{ color: 'var(--code-keyword)' }}>WSS</span> gateway.qrclaw.ai/ws?ticket=abc123</div>
        </div>

        <h2 id="verify" style={h2}>Verify</h2>
        <p style={para}>Check the dashboard — your agent&apos;s status should show <strong>Online</strong>. Try scanning its QR code to test a live conversation.</p>
      </>
    ),
  },

  'agents': {
    title: 'Agents',
    subtitle: 'How AI agents work in QRClaw.',
    breadcrumb: 'Agents',
    toc: ['What is an Agent', 'Agent Lifecycle', 'Connection', 'Streaming'],
    render: () => (
      <>
        <h2 id="what-is-an-agent" style={h2}>What is an Agent</h2>
        <p style={para}>
          An <strong>Agent</strong> is any AI service that can receive and reply to messages — a customer support bot, a coding assistant, a personal AI, etc.
        </p>
        <p style={para}>QRClaw doesn&apos;t host your AI model. It only provides the real-time communication layer between your agent and the people who scan its QR code.</p>

        <h2 id="agent-lifecycle" style={h2}>Agent Lifecycle</h2>
        <IllustLifecycle stages={['Register', 'Claim', 'Connect', 'Active', 'Offline']} />
        <p style={para}>
          If your agent goes offline, incoming messages are queued and delivered when it reconnects. No messages are lost.
        </p>

        <h2 id="connection" style={h2}>Connection</h2>
        <p style={para}>Agents use a two-step authentication:</p>
        <div style={codeBox}>
          <div style={{ color: 'var(--code-comment)' }}>{'// 1. Get a single-use ticket (expires in 30s)'}</div>
          <div><span style={{ color: 'var(--code-keyword)' }}>const</span> {'{ ticket }'} = <span style={{ color: 'var(--code-keyword)' }}>await</span> <span style={{ color: 'var(--code-function)' }}>getTicket</span>()</div>
          <div style={{ height: 6 }} />
          <div style={{ color: 'var(--code-comment)' }}>{'// 2. Connect with the ticket'}</div>
          <div><span style={{ color: 'var(--code-keyword)' }}>const</span> ws = <span style={{ color: 'var(--code-keyword)' }}>new</span> <span style={{ color: 'var(--code-function)' }}>WebSocket</span>(<span style={{ color: 'var(--code-string)' }}>{`\`wss://gateway/ws?ticket=\${ticket}\``}</span>)</div>
        </div>

        <h2 id="streaming" style={h2}>Streaming</h2>
        <p style={para}>
          Your agent can send replies word-by-word for a natural typing experience. Use <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', background: 'var(--color-gray-100)', padding: '1px 5px', borderRadius: 3 }}>stream_start</code>, <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', background: 'var(--color-gray-100)', padding: '1px 5px', borderRadius: 3 }}>stream_chunk</code>, and <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', background: 'var(--color-gray-100)', padding: '1px 5px', borderRadius: 3 }}>stream_end</code>.
        </p>
        <IllustChat messages={[
          { agent: false, text: 'Explain how QRClaw works.' },
          { agent: true, text: 'QRClaw is a platform that turns AI agents into scannable QR codes...' },
        ]} />
      </>
    ),
  },

  'qr-codes': {
    title: 'QR Codes',
    subtitle: 'The bridge between the physical world and your AI.',
    breadcrumb: 'QR Codes',
    toc: ['How It Works', 'Create a QR Code', 'Scan-to-Chat', 'Manage'],
    render: () => (
      <>
        <h2 id="how-it-works" style={h2}>How It Works</h2>
        <p style={para}>Each QR code encodes a unique URL that opens a mobile-friendly chat page. Visitors scan with any phone camera — no app needed.</p>
        <IllustQRFlow />

        <h2 id="create" style={h2}>Create a QR Code</h2>
        <p style={para}>
          In the dashboard, go to <strong>QR Codes &#8594; Create</strong>. Follow the steps:
        </p>
        <CardGrid items={[
          { accent: 'var(--color-red)', title: 'Pick your agent', desc: 'Choose which agent this QR code connects to.' },
          { accent: 'var(--color-success)', title: 'Add a label', desc: 'Name it for easy identification (e.g. "Office Reception").' },
          { accent: '#6366F1', title: 'Choose style', desc: 'Standard or dark theme QR code.' },
          { accent: 'var(--color-warning)', title: 'Download', desc: 'Get a high-res image to print or embed.' },
        ]} />

        <h2 id="scan-to-chat" style={h2}>Scan-to-Chat</h2>
        <p style={para}>When someone scans your QR code:</p>
        <IllustFlow steps={[
          { label: 'Scan', desc: 'Phone camera opens the URL' },
          { label: 'Auto-connect', desc: 'Session created instantly' },
          { label: 'Chat', desc: 'Start messaging right away' },
        ]} />
        <p style={para}>The entire flow takes under 2 seconds. No sign-up, no app download.</p>

        <h2 id="manage" style={h2}>Manage</h2>
        <p style={para}>From the dashboard you can view scan statistics, download printable versions, and deactivate codes that are no longer needed.</p>
      </>
    ),
  },

  'conversations': {
    title: 'Conversations',
    subtitle: 'Real-time, encrypted, always available.',
    breadcrumb: 'Conversations',
    toc: ['Real-Time Chat', 'Encryption', 'Offline Queue', 'Persistence'],
    render: () => (
      <>
        <h2 id="real-time-chat" style={h2}>Real-Time Chat</h2>
        <p style={para}>
          Messages are relayed through QRClaw&apos;s gateway within milliseconds. The gateway is a <strong>pure relay</strong> — it never reads, analyzes, or modifies message content.
        </p>
        <IllustChat />

        <h2 id="encryption" style={h2}>Encryption</h2>
        <p style={para}>
          All messages are encrypted with <strong>AES-256-GCM</strong> before storage. Each message has a unique IV. Even the database only sees encrypted content — QRClaw cannot read your conversations.
        </p>

        <h2 id="offline-queue" style={h2}>Offline Queue</h2>
        <p style={para}>
          If your agent goes offline, incoming messages are queued in Redis and delivered in order when it reconnects. Default queue TTL is 24 hours.
        </p>

        <h2 id="persistence" style={h2}>Persistence</h2>
        <p style={para}>
          Messages are persisted for history and cross-session continuity. A configurable data retention policy automatically cleans up old messages.
        </p>
      </>
    ),
  },

  'custom-branding': {
    title: 'Custom Branding',
    subtitle: 'Make your agent look professional.',
    breadcrumb: 'Custom Branding',
    toc: ['Agent Profile', 'What You Can Customize', 'Chat Experience'],
    render: () => (
      <>
        <h2 id="agent-profile" style={h2}>Agent Profile</h2>
        <p style={para}>When visitors scan your QR code, they first see your agent&apos;s profile page with a &quot;Start Chat&quot; button. This builds trust before the conversation begins.</p>
        <IllustProfile />

        <h2 id="customize" style={h2}>What You Can Customize</h2>
        <CardGrid items={[
          { accent: 'var(--color-red)', title: 'Display name', desc: 'The name shown in chat and on the QR scan page.' },
          { accent: 'var(--color-success)', title: 'Avatar', desc: 'Upload a custom image or use the default logo.' },
          { accent: '#6366F1', title: 'Description', desc: 'A tagline like "Official support agent".' },
          { accent: 'var(--color-warning)', title: 'System prompt', desc: 'Configure personality and behavior.' },
        ]} />

        <h2 id="chat-experience" style={h2}>Chat Experience</h2>
        <p style={para}>
          The chat interface automatically uses your agent&apos;s avatar and name. Replies appear with your branding, creating a consistent experience.
        </p>
      </>
    ),
  },

  'analytics': {
    title: 'Analytics',
    subtitle: 'Know how your agent performs.',
    breadcrumb: 'Analytics',
    toc: ['Dashboard', 'Scan Metrics', 'Conversation Metrics'],
    render: () => (
      <>
        <h2 id="dashboard" style={h2}>Dashboard</h2>
        <p style={para}>Get a real-time overview of your agent&apos;s performance at a glance.</p>
        <IllustMetrics />

        <h2 id="scan-metrics" style={h2}>Scan Metrics</h2>
        <CardGrid items={[
          { accent: 'var(--color-red)', title: 'Total scans', desc: 'Lifetime scan count per QR code.' },
          { accent: 'var(--color-success)', title: 'Unique visitors', desc: 'Distinct sessions per QR code.' },
          { accent: '#6366F1', title: 'Conversion rate', desc: 'Percentage of scans that started a chat.' },
        ]} />

        <h2 id="conversation-metrics" style={h2}>Conversation Metrics</h2>
        <p style={para}>
          View message counts and average response times. Filter by date range, agent, or QR code to analyze specific areas.
        </p>
      </>
    ),
  },

  'security': {
    title: 'Security',
    subtitle: 'Built secure from the ground up.',
    breadcrumb: 'Security',
    toc: ['Core Principles', 'Encryption', 'Authentication', 'Data Privacy'],
    render: () => (
      <>
        <h2 id="core-principles" style={h2}>Core Principles</h2>
        <CardGrid items={[
          { accent: 'var(--color-red)', title: 'Pure relay', desc: 'The gateway never hosts AI inference or reads message content.' },
          { accent: 'var(--color-success)', title: 'Encrypted storage', desc: 'Messages are encrypted before database writes. Even we can\'t read them.' },
          { accent: '#6366F1', title: 'Minimal data', desc: 'Visitors are anonymous. Data auto-deletes after the retention period.' },
        ]} />

        <h2 id="encryption" style={h2}>Encryption</h2>
        <p style={para}>
          All message content is encrypted with <strong>AES-256-GCM</strong>. Each message has a unique initialization vector. Encryption keys are stored separately from the database.
        </p>

        <h2 id="authentication" style={h2}>Authentication</h2>
        <p style={para}>
          Agent owners use email authentication. Agents connect via single-use WebSocket tickets (30s expiry). Visitors receive temporary session tokens — no personal info required.
        </p>

        <h2 id="data-privacy" style={h2}>Data Privacy</h2>
        <p style={para}>
          Visitor sessions are anonymous. A configurable retention policy auto-deletes old messages. You can delete all conversation data for any agent at any time from the dashboard.
        </p>
      </>
    ),
  },
};

/* ═══════════════ NAVIGATION ═══════════════ */

const NavTreeItem = ({
  item,
  activeSlug,
  onSelect,
  depth = 0,
}: {
  item: NavItem;
  activeSlug: string;
  onSelect: (slug: string) => void;
  depth?: number;
}) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = item.children && item.children.length > 0;
  const isActive = item.slug === activeSlug;

  return (
    <div>
      <div
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
          onSelect(item.slug);
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 12px', paddingLeft: 12 + depth * 16,
          cursor: 'pointer', borderRadius: 6,
          background: isActive ? 'var(--color-red-bg)' : 'transparent',
          fontFamily: 'var(--font-primary)',
          fontSize: 'var(--text-base)',
          fontWeight: isActive ? 'var(--font-semibold)' : depth === 0 ? 'var(--font-semibold)' : 'var(--font-normal)',
          color: isActive ? 'var(--color-red)' : 'var(--color-gray-800)',
        }}
      >
        {hasChildren && (
          <ChevronRight size={14} style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }} />
        )}
        {item.label}
      </div>
      {hasChildren && expanded && (
        <div>
          {item.children!.map((child) => (
            <NavTreeItem key={child.slug} item={child} activeSlug={activeSlug} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

function findParentLabel(slug: string): string {
  for (const section of NAV_TREE) {
    if (section.slug === slug) return section.label;
    if (section.children?.some((c) => c.slug === slug)) return section.label;
  }
  return 'Docs';
}

/* ═══════════════ MAIN ═══════════════ */

export default function DocsPage() {
  const router = useRouter();
  const [activeSlug, setActiveSlug] = useState('introduction');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const page = PAGES[activeSlug] ?? PAGES['introduction'];
  const parentLabel = findParentLabel(activeSlug);

  return (
    <div style={{
      height: '100vh', overflow: 'hidden',
      fontFamily: 'var(--font-primary)', color: 'var(--color-gray-800)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top nav */}
      <header style={{
        height: 'var(--topbar-height)',
        borderBottom: '1px solid var(--color-gray-border)',
        display: 'flex', alignItems: 'center', padding: '0 24px',
        flexShrink: 0, background: 'var(--color-white)', zIndex: 50,
      }}>
        <Link
          href="/"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, fontWeight: 500, color: 'var(--color-gray-500)',
            textDecoration: 'none', marginRight: 14,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5m0 0l5-5m-5 5l5 5"/></svg>
          Home
        </Link>
        <div style={{ width: 1, height: 16, background: 'var(--color-gray-200)', marginRight: 14 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => router.push('/')}>
          <img src="/qrclaw-logo-icon.png" alt="QRClaw" style={{ width: 28, height: 28, borderRadius: 6 }} />
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>QRClaw</span>
        </div>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-500)', marginLeft: 12 }}>Docs</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer' }} className="docs-mobile-toggle">
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Breadcrumb */}
      <div style={{
        padding: '12px 24px', fontSize: 'var(--text-xs)', color: 'var(--color-gray-500)',
        borderBottom: '1px solid var(--color-gray-border)', background: 'var(--color-gray-50)', flexShrink: 0,
      }}>
        <span style={{ cursor: 'pointer' }} onClick={() => router.push('/')}>Home</span>
        <span style={{ margin: '0 6px' }}>/</span>
        <span style={{ cursor: 'pointer' }} onClick={() => setActiveSlug('introduction')}>Docs</span>
        <span style={{ margin: '0 6px' }}>/</span>
        <span style={{ cursor: 'pointer', color: 'var(--color-gray-500)' }} onClick={() => {
          const parent = NAV_TREE.find((s) => s.children?.some((c) => c.slug === activeSlug));
          if (parent?.children?.[0]) setActiveSlug(parent.children[0].slug);
        }}>{parentLabel}</span>
        <span style={{ margin: '0 6px' }}>/</span>
        <span style={{ color: 'var(--color-gray-800)' }}>{page.breadcrumb}</span>
      </div>

      {/* Three-column layout */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Left nav sidebar */}
        <aside className="docs-sidebar" style={{
          width: 260, borderRight: '1px solid var(--color-gray-border)',
          overflowY: 'auto', padding: '16px 8px', flexShrink: 0, background: 'var(--color-white)',
        }}>
          {NAV_TREE.map((item) => (
            <NavTreeItem key={item.slug} item={item} activeSlug={activeSlug} onSelect={setActiveSlug} />
          ))}
        </aside>

        {/* Center content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', maxWidth: 760 }}>
          <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 'var(--font-bold)', margin: '0 0 6px' }}>{page.title}</h1>
          <p style={{ fontSize: 'var(--text-md)', color: 'var(--color-gray-500)', margin: '0 0 24px' }}>{page.subtitle}</p>
          {page.render()}
        </main>

        {/* Right TOC sidebar */}
        <aside className="docs-toc" style={{
          width: 200, borderLeft: '1px solid var(--color-gray-border)',
          padding: '32px 16px', flexShrink: 0, overflowY: 'auto',
        }}>
          <div style={{
            fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)',
            color: 'var(--color-gray-500)', textTransform: 'uppercase',
            letterSpacing: '0.05em', marginBottom: 12,
          }}>On This Page</div>
          {page.toc.map((item) => (
            <div key={item} style={{ fontSize: 'var(--text-base)', color: 'var(--color-gray-500)', padding: '5px 0', cursor: 'pointer' }}>{item}</div>
          ))}
        </aside>
      </div>

      <style>{`
        @media (max-width: 1024px) { .docs-toc { display: none !important; } }
        @media (max-width: 768px) { .docs-sidebar { display: none !important; } .docs-mobile-toggle { display: block !important; } }
      `}</style>
    </div>
  );
}
