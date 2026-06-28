'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Check, Copy } from 'lucide-react';

const STEPS = [
  { num: '1', label: 'Read the skill guide' },
  { num: '2', label: 'Register your agent' },
  { num: '3', label: 'Create your first QRcode' },
];

export default function ConnectSection() {
  const [copied, setCopied] = useState<number | null>(null);

  const handleCopy = (index: number, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(index);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <section
      id="connect-agent"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 80,
        background:
          'linear-gradient(180deg, var(--color-red-bg) 0%, var(--color-red-bg) 50%, var(--color-off-white) 100%)',
        gap: 24,
      }}
    >
      <div
        style={{
          width: 700,
          maxWidth: '100%',
          borderRadius: 20,
          background: 'linear-gradient(180deg, #FFFFFF 0%, #FEFEFE 50%, #FAFAFA 100%)',
          border: '1px solid #E8E8E8',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.03)',
          padding: 40,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <h2
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: -0.5,
            margin: 0,
            color: 'var(--color-black)',
          }}
        >
          Connect Your Agent
        </h2>
        <p style={{ fontSize: 15, color: 'var(--color-gray-600)', margin: 0 }}>
          Get your agent a QR code in 3 steps.
        </p>

        {/* Code Block */}
        <div
          style={{
            borderRadius: 14,
            background: 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 50%, #EFF6FF 100%)',
            border: '1px solid #CBD5E1',
            overflow: 'hidden',
          }}
        >
          {/* Terminal top bar */}
          <div
            style={{
              height: 38,
              display: 'flex',
              alignItems: 'center',
              padding: '0 16px',
              gap: 12,
              borderBottom: '1px solid rgba(203, 213, 225, 0.25)',
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22C55E' }} />
            </div>
          </div>
          {/* Terminal body */}
          <div
            style={{
              padding: '20px 24px',
              fontFamily: 'var(--font-primary)',
              fontSize: 13,
              lineHeight: 1.6,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ color: '#94A3B8' }}>
              # Connect your Agent to QRClaw. You&apos;re welcome. 🦞
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ color: '#64748B', fontWeight: 700, fontSize: 14 }}>$</span>
              <span style={{ width: 8 }} />
              <span style={{ color: '#334155', fontWeight: 500, fontSize: 14 }}>
                curl -s https://qrclaw.ai/skill.md
              </span>
              <button
                onClick={() => handleCopy(0, 'curl -s https://qrclaw.ai/skill.md')}
                style={{
                  background: '#E2E8F0',
                  border: '1px solid #CBD5E1',
                  borderRadius: 6,
                  cursor: 'pointer',
                  padding: '6px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {copied === 0 ? (
                  <Check size={14} color="var(--color-green)" />
                ) : (
                  <Copy size={14} color="#64748B" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {STEPS.map((step) => (
            <div
              key={step.num}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  background: 'var(--color-red)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>{step.num}</span>
              </div>
              <span style={{ fontSize: 14, color: 'var(--color-gray-800)' }}>{step.label}</span>
            </div>
          ))}
        </div>

        <Link
          href="/docs"
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--color-red)',
            textDecoration: 'none',
          }}
        >
          Read full documentation →
        </Link>
      </div>
    </section>
  );
}
