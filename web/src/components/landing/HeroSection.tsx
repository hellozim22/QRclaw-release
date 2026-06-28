'use client';

import React from 'react';
import { ChevronLeft, ArrowUp, Bot, QrCode } from 'lucide-react';

export default function HeroSection() {
  return (
    <section
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 48,
        padding: '100px 80px',
        background: 'linear-gradient(180deg, var(--color-white) 0%, var(--color-red-bg) 100%)',
      }}
    >
      {/* Hero Left */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <h1
          style={{
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -2,
            margin: 0,
            color: 'var(--color-black)',
          }}
        >
          Give your Agent
          <br />a QR Code
        </h1>
        <p
          style={{
            fontSize: 22,
            fontWeight: 500,
            color: 'var(--color-red)',
            letterSpacing: 2,
            margin: 0,
          }}
        >
          Scan. Chat. Anywhere.
        </p>
        <p
          style={{
            fontSize: 17,
            color: 'var(--color-gray-500)',
            lineHeight: 1.7,
            margin: 0,
            maxWidth: 534,
          }}
        >
          Turn your AI agent into a QR code. Anyone scans, instantly chats — no app install needed.
          <br />
          Share your well-trained agent with the world.
        </p>
        <div style={{ display: 'flex', gap: 16 }}>
          <a
            href="#connect-agent"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('connect-agent')?.scrollIntoView({ behavior: 'smooth' });
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 48,
              padding: '0 24px',
              borderRadius: 12,
              background: 'var(--color-red)',
              color: 'white',
              fontSize: 16,
              fontWeight: 600,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            Get Started
          </a>
          <a
            href="/docs"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 48,
              padding: '0 24px',
              borderRadius: 12,
              border: '1px solid var(--color-gray-border)',
              background: 'transparent',
              color: 'var(--color-gray-800)',
              fontSize: 16,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            View Docs
          </a>
        </div>
      </div>

      {/* Hero Right — Phone Mock + QR Card */}
      <div
        className="hero-right"
        style={{
          width: 460,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          gap: 20,
          flexShrink: 0,
        }}
      >
        {/* QR Card */}
        <div
          style={{
            width: 190,
            borderRadius: 18,
            background: 'var(--color-white)',
            padding: '18px 18px 20px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            alignItems: 'center',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.06)',
            border: '1px solid var(--color-gray-200)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: 'var(--color-red)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Bot size={16} color="white" />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-gray-800)' }}>
                QRClaw Support
              </div>
              <div style={{ fontSize: 8, color: 'var(--color-black)' }}>Official support agent</div>
            </div>
          </div>
          <div
            style={{
              width: 140,
              height: 140,
              borderRadius: 10,
              background: 'var(--color-off-white)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <QrCode size={110} color="var(--color-red)" />
          </div>
          <span
            style={{
              fontSize: 9,
              color: 'var(--color-gray-500)',
              textAlign: 'center',
            }}
          >
            Scan to start chatting
          </span>
        </div>

        {/* Phone Mockup */}
        <PhoneMockup />
      </div>
    </section>
  );
}

function PhoneMockup() {
  return (
    <div
      style={{
        width: 210,
        height: 380,
        borderRadius: 24,
        background: 'var(--color-gray-100)',
        border: '4px solid var(--color-gray-300)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.06)',
      }}
    >
      {/* Phone top bar */}
      <div
        style={{
          height: 38,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 8,
          background: 'var(--color-white)',
          borderBottom: '1px solid var(--color-gray-border)',
        }}
      >
        <ChevronLeft size={16} color="var(--color-gray-700)" />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-gray-800)' }}>
          QRClaw Support
        </span>
      </div>
      {/* Chat area */}
      <div
        style={{
          flex: 1,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Timestamp */}
        <div style={{ textAlign: 'center', fontSize: 9, color: 'var(--color-placeholder)' }}>
          Today 10:43
        </div>
        {/* Agent message 1 */}
        <ChatBubbleAgent>
          Welcome! What can I help
          <br />
          you with today?
        </ChatBubbleAgent>
        {/* User message */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <div
            style={{
              background: 'var(--color-red)',
              borderRadius: '10px 0 10px 10px',
              padding: '7px 10px',
              fontSize: 10,
              color: 'white',
              lineHeight: 1.5,
            }}
          >
            How do I connect my agent?
          </div>
        </div>
        {/* Agent message 2 with typing */}
        <div style={{ display: 'flex', gap: 4, width: '100%' }}>
          <AgentAvatar />
          <div
            style={{
              background: 'var(--color-white)',
              borderRadius: '0 10px 10px 10px',
              padding: '7px 10px',
              fontSize: 10,
              color: 'var(--color-gray-800)',
              lineHeight: 1.5,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <span>
              Easy! Just run this command
              <br />
              to send skill.md to your agent...
            </span>
            <span style={{ fontSize: 9, fontWeight: 500, color: 'var(--color-red)' }}>
              ● typing...
            </span>
          </div>
        </div>
      </div>
      {/* Input bar */}
      <div
        style={{
          height: 38,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: 6,
          background: 'var(--color-white)',
          borderTop: '1px solid var(--color-gray-border)',
        }}
      >
        <div
          style={{
            flex: 1,
            height: 26,
            borderRadius: 13,
            background: 'var(--color-white)',
            border: '1px solid var(--color-gray-border)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 10px',
          }}
        >
          <span style={{ fontSize: 10, color: 'var(--color-placeholder)' }}>Type a message...</span>
        </div>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            background: 'var(--color-red)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowUp size={13} color="white" />
        </div>
      </div>
    </div>
  );
}

function AgentAvatar() {
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        background: 'var(--color-red)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Bot size={13} color="white" />
    </div>
  );
}

function ChatBubbleAgent({ children }: { readonly children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 4, width: '100%' }}>
      <AgentAvatar />
      <div
        style={{
          background: 'var(--color-white)',
          borderRadius: '0 10px 10px 10px',
          padding: '7px 10px',
          fontSize: 10,
          color: '#333333',
          lineHeight: 1.5,
          flex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
