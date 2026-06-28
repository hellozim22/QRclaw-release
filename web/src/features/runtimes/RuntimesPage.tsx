// Adapted from multica/packages/views/runtimes/components/runtimes-page.tsx

'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { mapLocalHostStatusToRuntimeRows, type LocalHostStatus } from './map-local-host-status';
import { RuntimeDetail } from './RuntimeDetail';
import { RuntimeList } from './RuntimeList';

const DEFAULT_GATEWAY_URL = 'https://gateway-test.qrclaw.ai';

const getGatewayBaseUrl = (): string =>
  (process.env.NEXT_PUBLIC_GATEWAY_URL ?? DEFAULT_GATEWAY_URL).replace(/\/+$/, '');

async function fetchRuntimeStatus(): Promise<LocalHostStatus> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return mapLocalHostStatusToRuntimeRows({ data: { providers: [] } });
  }
  const response = await fetch(`${getGatewayBaseUrl()}/api/owner/local-host/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    return mapLocalHostStatusToRuntimeRows({});
  }
  const json = await response.json().catch(() => ({}));
  return mapLocalHostStatusToRuntimeRows(json);
}

export function RuntimesPage() {
  const [status, setStatus] = useState<LocalHostStatus | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const next = await fetchRuntimeStatus();
      setStatus(next);
      setSelectedProvider((current) => current ?? next.providers[0]?.provider ?? null);
    } catch {
      const fallback = mapLocalHostStatusToRuntimeRows({});
      setStatus(fallback);
      setSelectedProvider((current) => current ?? fallback.providers[0]?.provider ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runtimes = status?.providers ?? [];
  const selectedRuntime = useMemo(
    () => runtimes.find((runtime) => runtime.provider === selectedProvider) ?? runtimes[0] ?? null,
    [runtimes, selectedProvider],
  );

  return (
    <section
      data-testid="runtimes-page"
      style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        background: 'var(--color-white)',
        fontFamily: 'var(--font-primary)',
      }}
    >
      <RuntimeList
        runtimes={runtimes}
        selectedProvider={selectedRuntime?.provider ?? null}
        onSelect={setSelectedProvider}
      />
      <RuntimeDetail runtime={selectedRuntime} loading={loading} onRedetect={load} />
    </section>
  );
}
