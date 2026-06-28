'use client';

/**
 * OnboardingEmptyState — Wave 10 S1
 *
 * Right-pane welcome/setup surface. Switches between three states
 * per `r2-c5-onboarding-final.md` §3–§5:
 *
 *   - `connected`  → Wireframe A: "4 个本机 agent 已可用"
 *   - `partial`    → Wireframe C: mix of online + needs_login/not_installed
 *   - `empty`      → Wireframe B: Host 未配对 / 未安装
 *   - `unauth`     → signed-out fallback (defensive only)
 */

import type { ReactNode } from 'react';
import type { OwnerAgentProvider } from '@shared/contracts/http/owner-agent-chat/types';
import { StatusDot, type RuntimeStatus } from './AgentCard';

export type OnboardingState = 'connected' | 'partial' | 'empty' | 'unauth';

export interface OnboardingRuntimeRow {
  provider: OwnerAgentProvider;
  displayName: string;
  status: RuntimeStatus;
}

export interface OnboardingEmptyStateProps {
  state: OnboardingState;
  runtimes: OnboardingRuntimeRow[];
  onlineCount: number;
  totalCount: number;
  onStartWithFirstOnline?: () => void;
  onInstallHost?: () => void;
  onShowHomebrew?: () => void;
  onSignIn?: () => void;
  children?: ReactNode;
}

function StateHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <h2
        style={{
          margin: 0,
          fontSize: 'var(--text-2xl)',
          fontWeight: 'var(--font-semibold)',
          color: 'var(--color-gray-800)',
          fontFamily: 'var(--font-primary)',
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--text-md)',
            color: 'var(--color-gray-700)',
            fontFamily: 'var(--font-primary)',
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      )}
    </header>
  );
}

function RuntimeListCompact({ runtimes }: { runtimes: OnboardingRuntimeRow[] }) {
  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      {runtimes.map((rt) => (
        <li
          key={rt.provider}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            fontFamily: 'var(--font-primary)',
            fontSize: 'var(--text-md)',
            color: 'var(--color-gray-800)',
          }}
        >
          <StatusDot status={rt.status} size={8} />
          <span style={{ flex: 1 }}>{rt.displayName}</span>
          <span style={{ color: 'var(--color-gray-600)', fontSize: 'var(--text-sm)' }}>
            {labelFor(rt.status)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function labelFor(status: RuntimeStatus): string {
  switch (status) {
    case 'online':
      return '在线';
    case 'needs_login':
      return '需登录';
    case 'not_installed':
      return '未安装';
    case 'offline':
      return '离线';
    case 'updating':
      return '连接中';
    case 'error':
      return '异常';
  }
}

function PrimaryButton({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '0 var(--space-6)',
        height: 'var(--btn-height-primary)',
        borderRadius: 'var(--radius-md)',
        border: 'none',
        background: 'var(--color-red)',
        color: 'var(--color-white)',
        fontFamily: 'var(--font-primary)',
        fontSize: 'var(--text-md)',
        fontWeight: 'var(--font-medium)',
        cursor: 'pointer',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--color-red-dark)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'var(--color-red)';
      }}
      onFocus={(event) => {
        event.currentTarget.style.outline = '2px solid var(--color-red)';
        event.currentTarget.style.outlineOffset = '2px';
      }}
      onBlur={(event) => {
        event.currentTarget.style.outline = 'none';
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
      {children}
    </button>
  );
}

export default function OnboardingEmptyState({
  state,
  runtimes,
  onlineCount,
  totalCount,
  onStartWithFirstOnline,
  onInstallHost,
  onShowHomebrew,
  onSignIn,
  children,
}: OnboardingEmptyStateProps) {
  return (
    <div
      role="region"
      aria-label="Onboarding"
      style={{
        flex: 1,
        minHeight: 0,
        padding: 'var(--space-8)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        background: 'var(--color-off-white)',
        overflowY: 'auto',
        // Vertically center short states (connected/unauth);
        // `empty`/`partial` have enough content to stay top-aligned.
        justifyContent:
          state === 'connected' || state === 'unauth' ? 'center' : 'flex-start',
        alignItems: 'stretch',
      }}
    >
      <div style={{ maxWidth: 560, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-gray-600)',
          fontFamily: 'var(--font-primary)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        Runtime {onlineCount}/{totalCount} 已就绪
      </div>

      {state === 'connected' && (
        <>
          <StateHeader
            title="一切就绪"
            subtitle="本机 AI 助手已连接，从左侧选择一位开始对话。"
          />
          <RuntimeListCompact runtimes={runtimes} />
          <div>
            <PrimaryButton onClick={onStartWithFirstOnline}>
              开始对话
            </PrimaryButton>
          </div>
        </>
      )}

      {state === 'partial' && (
        <>
          <StateHeader
            title="部分助手已就绪"
            subtitle="已连接的助手可以直接使用，其余助手可以稍后再设置。"
          />
          <RuntimeListCompact runtimes={runtimes} />
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <PrimaryButton onClick={onStartWithFirstOnline}>开始对话</PrimaryButton>
          </div>
          {children}
        </>
      )}

      {state === 'empty' && (
        <>
          <StateHeader
            title="正在准备 AI 助手"
            subtitle="正在检测本机已安装的 AI 工具并建立连接，通常只需几秒钟。请稍候…"
          />
          {process.env.NEXT_PUBLIC_LOCAL_DEV !== '1' && (
            <>
              <ol
                style={{
                  margin: 0,
                  paddingLeft: 'var(--space-5)',
                  color: 'var(--color-gray-800)',
                  fontSize: 'var(--text-md)',
                  fontFamily: 'var(--font-primary)',
                  lineHeight: 1.8,
                }}
              >
                <li>Install QRClaw Host</li>
                <li>授权这台机器</li>
                <li>回到这里自动刷新</li>
              </ol>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <PrimaryButton onClick={onInstallHost}>下载 Mac App</PrimaryButton>
                <SecondaryButton onClick={onShowHomebrew}>Homebrew 命令</SecondaryButton>
              </div>
            </>
          )}
          <RuntimeListCompact runtimes={runtimes} />
        </>
      )}

      {state === 'unauth' && (
        <>
          <StateHeader
            title="请先登录"
            subtitle="登录后即可使用本机 AI 助手。"
          />
          <div>
            <PrimaryButton onClick={onSignIn}>登录</PrimaryButton>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
