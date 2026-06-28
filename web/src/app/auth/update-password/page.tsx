'use client';

import { useState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import { createClient } from '@/lib/supabase/browser';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled && session) setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) {
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    router.push('/login?password_updated=1');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        maxWidth: 400,
        margin: '0 auto',
        padding: '48px 24px',
        minHeight: '100vh',
        background: 'var(--color-white)',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-primary)',
          fontSize: 'var(--text-2xl)',
          fontWeight: 700,
          color: 'var(--color-gray-800)',
          margin: '0 0 8px',
        }}
      >
        Set new password
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-primary)',
          fontSize: 'var(--text-md)',
          color: 'var(--color-gray-500)',
          margin: '0 0 32px',
          textAlign: 'center',
        }}
      >
        Choose a new password for your account.
      </p>

      {!ready ? (
        <p style={{ fontFamily: 'var(--font-primary)', color: 'var(--color-gray-600)' }}>
          Checking your reset link…
        </p>
      ) : (
        <form
          onSubmit={handleSubmit}
          style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <Input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            required
            autoComplete="new-password"
          />
          <Input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(ev) => setConfirm(ev.target.value)}
            required
            autoComplete="new-password"
          />
          {error ? (
            <p
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-red)',
                margin: 0,
              }}
            >
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Update password'}
          </Button>
        </form>
      )}

      <div style={{ marginTop: 24 }}>
        <Link
          href="/login"
          style={{ color: 'var(--color-red)', fontFamily: 'var(--font-primary)' }}
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
