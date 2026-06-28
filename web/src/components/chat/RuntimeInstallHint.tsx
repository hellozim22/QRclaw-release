'use client';

/**
 * RuntimeInstallHint — Wave 10 S1
 *
 * Right-rail panel shown when a runtime is `not_installed`, `needs_login`,
 * or otherwise unhealthy. Provides a single-step copy-command + docs CTA.
 *
 * Per `r2-c5-onboarding-final.md` §9/§13, we NEVER execute shell commands
 * in-browser; the button only copies the command or opens docs.
 */

import { useState } from 'react';
import type { OwnerAgentProvider } from '@shared/contracts/http/owner-agent-chat/types';
import type { RuntimeStatus } from './AgentCard';

export interface RuntimeInstallHintProps {
  provider: OwnerAgentProvider;
  status: Exclude<RuntimeStatus, 'online'>;
  /** e.g. "Claude Code", "Codex" */
  displayName: string;
  /** The copy-pastable command. */
  command: string;
  docsUrl: string;
  onRescan?: () => void;
}

const TITLE: Record<Exclude<RuntimeStatus, 'online'>, string> = {
  offline: 'Offline',
  needs_login: '需要登录',
  not_installed: 'Not installed',
  updating: 'Updating',
  error: '检测失败',
};

export default function RuntimeInstallHint({
  provider,
  status,
  displayName,
  command,
  docsUrl,
  onRescan,
}: RuntimeInstallHintProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      aria-labelledby={`runtime-hint-${provider}`}
      style={{
        background: 'var(--color-white)',
        border: '1px solid var(--color-gray-border)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-6)',
        boxShadow: 'var(--shadow-card)',
        fontFamily: 'var(--font-primary)',
        color: 'var(--color-gray-800)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        maxWidth: 560,
      }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 'var(--font-medium)',
            color: 'var(--color-red)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {TITLE[status]}
        </div>
        <h3
          id={`runtime-hint-${provider}`}
          style={{
            fontSize: 'var(--text-xl)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-gray-800)',
            margin: 0,
          }}
        >
          {displayName}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--text-md)',
            color: 'var(--color-gray-700)',
            lineHeight: 1.5,
          }}
        >
          {status === 'not_installed' &&
            `After installation, QRClaw Host will auto-detect it. No need to recreate agents.`}
          {status === 'needs_login' &&
            `Host 找到了 ${displayName}，但 CLI 当前没有有效登录态。`}
          {status === 'offline' &&
            `Host 最近一次心跳超过 90 秒，请检查 Host 是否在运行。`}
          {status === 'updating' && `${displayName} is updating, please wait.`}
          {status === 'error' && `可能是版本过旧或命令超时。`}
        </p>
      </header>

      <pre
        style={{
          margin: 0,
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--color-black)',
          color: 'var(--color-off-white)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-md)',
          borderRadius: 'var(--radius-md)',
          overflowX: 'auto',
          whiteSpace: 'pre',
        }}
      >
        <code>{command}</code>
      </pre>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
        }}
      >
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? '已复制命令' : '复制命令'}
          style={{
            padding: '0 var(--space-5)',
            height: 'var(--btn-height-primary)',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: copied ? 'var(--color-green-text)' : 'var(--color-red)',
            color: 'var(--color-white)',
            fontFamily: 'var(--font-primary)',
            fontSize: 'var(--text-md)',
            fontWeight: 'var(--font-medium)',
            cursor: 'pointer',
            transition: 'background 120ms',
          }}
          onMouseEnter={(event) => {
            if (copied) return;
            event.currentTarget.style.background = 'var(--color-red-dark)';
          }}
          onMouseLeave={(event) => {
            if (copied) return;
            event.currentTarget.style.background = 'var(--color-red)';
          }}
        >
          {copied ? '已复制' : '复制命令'}
        </button>

        <a
          href={docsUrl}
          target="_blank"
          rel="noreferrer noopener"
          style={{
            padding: '0 var(--space-5)',
            height: 'var(--btn-height-outline)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-gray-border)',
            background: 'var(--color-white)',
            color: 'var(--color-gray-800)',
            fontFamily: 'var(--font-primary)',
            fontSize: 'var(--text-md)',
            fontWeight: 'var(--font-medium)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            lineHeight: 1,
          }}
        >
          查看文档
        </a>

        {onRescan && (
          <button
            type="button"
            onClick={onRescan}
            style={{
              padding: '0 var(--space-5)',
              height: 'var(--btn-height-outline)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-gray-border)',
              background: 'var(--color-white)',
              color: 'var(--color-gray-800)',
              fontFamily: 'var(--font-primary)',
              fontSize: 'var(--text-md)',
              fontWeight: 'var(--font-medium)',
              cursor: 'pointer',
            }}
          >
            重新扫描
          </button>
        )}
      </div>
    </section>
  );
}
