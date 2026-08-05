'use client';

import { useState, useEffect, useRef, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Button, Input, Avatar } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { createClient as createBrowserSupabase } from '@/lib/supabase/browser';

const RESET_EMAIL_COOLDOWN_MS = 60_000;

export default function LoginPage() {
  const router = useRouter();
  const { signIn, resetPassword } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mounted gate for SSR/hydration safety; flips exactly once after mount.
    setMounted(true);
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const lastPasswordResetAtRef = useRef(0);
  const [passwordUpdatedNotice, setPasswordUpdatedNotice] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('password_updated') === '1') {
      queueMicrotask(() => {
        setPasswordUpdatedNotice(true);
        window.history.replaceState({}, '', '/login');
      });
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Guard: prevent double-submission while a previous signIn is still in flight.
    // Without this, a rapid second click fires a second signInWithPassword that
    // frequently resolves with an "Invalid refresh token" / network-ish authError
    // AFTER the first call has already written the session cookie — which is
    // the login "flash error" users saw.
    if (loading) return;
    setError('');
    setLoading(true);

    const { error: authError } = await signIn(email, password);

    if (authError) {
      // Re-check session before surfacing the error. Supabase GoTrue occasionally
      // returns a transient error (network hiccup, in-flight refresh, CORS
      // preflight race) even when the credentials were accepted and a session
      // cookie actually landed. If the session exists, treat the login as
      // successful and navigate instead of flashing a misleading error banner.
      try {
        const supabase = createBrowserSupabase();
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          router.push('/chat');
          return;
        }
      } catch {
        // Fall through to normal error display if the recovery check itself fails.
      }
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push('/chat');
  };

  const handleForgotPassword = async () => {
    setResetMessage(null);
    if (!email.trim()) {
      setResetMessage('Enter your email address first.');
      return;
    }
    const now = Date.now();
    const elapsed = now - lastPasswordResetAtRef.current;
    if (lastPasswordResetAtRef.current > 0 && elapsed < RESET_EMAIL_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESET_EMAIL_COOLDOWN_MS - elapsed) / 1000);
      setResetMessage(`Please wait ${waitSec}s before requesting another reset email.`);
      return;
    }
    setResetLoading(true);
    const { error: resetErr } = await resetPassword(email.trim());
    setResetLoading(false);
    if (resetErr) {
      setResetMessage(resetErr.message);
      return;
    }
    lastPasswordResetAtRef.current = Date.now();
    setResetMessage('If an account exists for this email, we sent a password reset link.');
  };

  const narrow = mounted && isNarrow;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        maxWidth: 'var(--mobile-width)',
        margin: '0 auto',
        padding: narrow ? '48px 24px 24px' : '80px 24px 24px',
        minHeight: '100vh',
        background: 'var(--color-white)',
      }}
    >
      {/* Back to home */}
      <Link
        href="/"
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 'var(--text-base)',
          fontWeight: 'var(--font-normal)',
          color: 'var(--color-gray-500)',
          textDecoration: 'none',
          marginBottom: 32,
        }}
      >
        <ArrowLeft size={16} color="var(--color-gray-500)" />
        Back to home
      </Link>

      {passwordUpdatedNotice ? (
        <p
          role="status"
          style={{
            width: '100%',
            maxWidth: 342,
            margin: '0 0 16px',
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--color-green-bg)',
            border: '1px solid var(--color-green-text)',
            fontFamily: 'var(--font-primary)',
            fontSize: 'var(--text-md)',
            fontWeight: 'var(--font-medium)',
            color: 'var(--color-green-text)',
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          Your password was updated. Sign in with your new password.
        </p>
      ) : null}

      {/* Logo */}
      <Link href="/" style={{ textDecoration: 'none' }}>
        {/* Mobile-Login.png (9nzBk): logo 80×80 */}
        <Avatar src="/qrclaw-logo-icon.png" alt="QRClaw" size={80} variant="agent" />
      </Link>

      {/* sp01: height 16 */}
      <div style={{ height: 16 }} />

      {/* Title — design 9nzBk: brand wordmark «QRClaw» 700/24px, letter-spacing 0.5 */}
      <h1
        style={{
          fontFamily: 'var(--font-primary)',
          fontSize: 'var(--text-3xl)',
          fontWeight: 700,
          color: 'var(--color-gray-800)',
          margin: 0,
          letterSpacing: 0.5,
        }}
      >
        QRClaw
      </h1>

      {/* sp02: height 8 */}
      <div style={{ height: 8 }} />

      {/* Subtitle — design 9nzBk */}
      <p
        style={{
          fontFamily: 'var(--font-primary)',
          fontSize: 'var(--text-md)',
          fontWeight: 'var(--font-normal)',
          color: 'var(--color-gray-500)',
          margin: 0,
          textAlign: 'center',
        }}
      >
        Sign in to sync your conversations
      </p>

      {/* sp03: height 40 */}
      <div style={{ height: 40 }} />

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: narrow ? 20 : 0,
          width: '100%',
          maxWidth: 342,
        }}
      >
        <Input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          variant={narrow ? 'authMobile' : 'default'}
        />
        {/* sp04: height 12 — collapsed when gap used */}
        {!narrow ? <div style={{ height: 12 }} /> : null}
        <Input
          type={showPassword ? 'text' : 'password'}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          variant={narrow ? 'authMobile' : 'default'}
          iconRight={
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--color-gray-500)',
              }}
            >
              {showPassword ? (
                <EyeOff size={18} strokeWidth={2} />
              ) : (
                <Eye size={18} strokeWidth={2} />
              )}
            </button>
          }
        />

        <div
          style={{
            width: '100%',
            maxWidth: 342,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 6,
            marginTop: 4,
          }}
        >
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={resetLoading}
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-semibold)',
              color: 'var(--color-red)',
              textDecoration: 'none',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: resetLoading ? 'wait' : 'pointer',
            }}
          >
            {resetLoading ? 'Sending…' : 'Forgot password?'}
          </button>
          {resetMessage ? (
            <p
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-normal)',
                color: 'var(--color-gray-600)',
                textAlign: 'right',
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              {resetMessage}
            </p>
          ) : null}
        </div>

        {error && (
          <p
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-red)',
              textAlign: 'center',
              marginTop: 8,
            }}
          >
            {error}
          </p>
        )}

        {/* sp05: height 16 */}
        {!narrow ? <div style={{ height: 16 }} /> : <div style={{ height: 4 }} />}
        <Button
          type="submit"
          disabled={loading}
          style={{
            width: narrow ? 342 : '100%',
            maxWidth: '100%',
            height: 'var(--btn-height-primary)',
            borderRadius: 12,
            background: narrow ? 'var(--gradient-primary)' : undefined,
          }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>

      {/* sp06: height 20 */}
      <div style={{ height: 20 }} />

      {/* Switch link */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 'var(--text-base)',
            fontWeight: 'var(--font-normal)',
            color: 'var(--color-gray-500)',
          }}
        >
          Don&apos;t have an account?
        </span>
        <Link
          href="/signup"
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 'var(--text-base)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-red)',
            textDecoration: 'none',
          }}
        >
          Sign Up
        </Link>
      </div>

      {/* Legal notice */}
      <div style={{ height: 24 }} />
      <p
        style={{
          fontFamily: 'var(--font-primary)',
          fontSize: narrow ? 13 : 11,
          fontWeight: 'var(--font-normal)',
          color: 'var(--color-muted)',
          textAlign: 'center',
          margin: 0,
          maxWidth: 342,
          lineHeight: 1.5,
        }}
      >
        By signing in, you agree to our{' '}
        <Link href="/terms" style={{ color: 'var(--color-red)', textDecoration: 'underline' }}>
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/privacy" style={{ color: 'var(--color-red)', textDecoration: 'underline' }}>
          Privacy Policy
        </Link>
        .
      </p>

      {/* Flex spacer */}
      <div style={{ flexGrow: 1 }} />

      {/* Footer */}
      <p
        style={{
          fontFamily: 'var(--font-primary)',
          fontSize: 11,
          fontWeight: 'var(--font-normal)',
          color: 'var(--color-muted)',
          margin: 0,
        }}
      >
        Powered by QRClaw
      </p>
    </div>
  );
}
