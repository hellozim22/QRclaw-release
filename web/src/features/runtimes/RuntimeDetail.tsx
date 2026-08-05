'use client';

import { ProviderLogo } from '@/components/agent/ProviderLogo';
import { getProviderDisplayName } from '@/lib/agent-display';
import type { RuntimeRow } from './map-local-host-status';

const INSTALL_HINTS: Record<string, string> = {
  openclaw: '安装 OpenClaw CLI 并保持本机服务运行，完成后重新检测。',
  claude: '安装 Claude Code CLI，并确保本机可启动 Claude Code。',
  cursor: '安装 Cursor CLI，并确保 Cursor 已登录可用。',
  codex: '安装 Codex CLI，并确保本机可执行 Codex。',
};

export function RuntimeDetail({
  runtime,
  loading,
  onRedetect,
}: {
  runtime: RuntimeRow | null;
  loading: boolean;
  onRedetect: () => void;
}) {
  if (!runtime) {
    return (
      <main style={{ flex: 1, padding: 'var(--space-8)', color: 'var(--color-gray-600)' }}>
        选择一个 Runtime 查看连接状态。
      </main>
    );
  }

  const online = runtime.status === 'online';

  return (
    <main style={{ flex: 1, minWidth: 0, padding: 'var(--space-8)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <ProviderLogo provider={runtime.provider} size={48} />
        <div>
          <h2 style={{ margin: 0, color: 'var(--color-gray-900)', fontSize: 'var(--text-3xl)' }}>
            {getProviderDisplayName(runtime.provider)}
          </h2>
          <p style={{ margin: '6px 0 0', color: 'var(--color-gray-600)' }}>
            本机执行能力 · {online ? '在线' : runtime.detected ? '已识别但离线' : '未识别'}
          </p>
        </div>
      </div>

      <section
        style={{
          marginTop: 28,
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-gray-border)',
          background: 'var(--color-white)',
          padding: 'var(--space-5)',
        }}
      >
        <h3 style={{ margin: 0, color: 'var(--color-gray-800)' }}>Connection</h3>
        <p style={{ color: 'var(--color-gray-600)', lineHeight: 1.6 }}>
          当前状态：
          <strong style={{ color: online ? 'var(--color-green-text)' : 'var(--color-gray-800)' }}>
            {online ? 'Online' : 'Offline'}
          </strong>
        </p>
        {!online && (
          <p style={{ color: 'var(--color-gray-600)', lineHeight: 1.6 }}>
            {INSTALL_HINTS[runtime.provider] ?? '安装对应 CLI 后重新检测。'}
          </p>
        )}
        <button
          type="button"
          data-testid="runtime-redetect"
          onClick={onRedetect}
          disabled={loading}
          style={{
            height: 38,
            padding: '0 var(--space-4)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-red)',
            color: 'var(--color-white)',
            cursor: loading ? 'wait' : 'pointer',
            fontFamily: 'var(--font-primary)',
            fontWeight: 'var(--font-semibold)',
          }}
        >
          {loading ? '检测中…' : '重新检测'}
        </button>
      </section>
    </main>
  );
}
