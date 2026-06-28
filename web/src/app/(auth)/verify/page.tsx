'use client';

import {
  Suspense,
  useState,
  useRef,
  useCallback,
  useSyncExternalStore,
  type KeyboardEvent,
  type ClipboardEvent,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserClient } from '@/lib/supabase';

/** Supabase email OTP length; keep copy and inputs in sync (see PR / Supabase email template `{{ .Token }}`). */
const OTP_LENGTH = 6;
const emptyOtpDigits = (): string[] => Array.from({ length: OTP_LENGTH }, () => '');

function useIsMobileVerify(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined') return () => {};
      const mq = window.matchMedia('(max-width: 768px)');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => (typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false),
    () => false
  );
}

const backToSignupStyle: React.CSSProperties = {
  fontFamily: 'var(--font-primary)',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--font-medium)',
  color: 'var(--color-red)',
  textDecoration: 'none',
  marginBottom: 8,
};

const VerifyForm = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email') ?? '';
  const claimAgentId = searchParams.get('claim') ?? '';
  const isMobile = useIsMobileVerify();

  const { verifyOtp } = useAuth();

  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(emptyOtpDigits);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const otpValue = otpDigits.join('');

  const focusOtp = (i: number) => {
    otpRefs.current[i]?.focus();
  };

  const handleOtpChange = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, '').slice(-1);
    setOtpError(null);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[i] = d;
      return next;
    });
    if (d && i < OTP_LENGTH - 1) {
      queueMicrotask(() => focusOtp(i + 1));
    }
  };

  const handleOtpKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[i] && i > 0) {
      focusOtp(i - 1);
    }
  };

  const handleOtpPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!text) return;
    const next = [...otpDigits];
    for (let j = 0; j < OTP_LENGTH; j += 1) {
      next[j] = text[j] ?? '';
    }
    setOtpDigits(next);
    setOtpError(null);
    const last = Math.min(text.length, OTP_LENGTH - 1);
    queueMicrotask(() => focusOtp(last));
  };

  const handleVerifyOtp = useCallback(async () => {
    if (!emailParam || otpValue.length !== OTP_LENGTH) return;
    setVerifying(true);
    setOtpError(null);
    const { error } = await verifyOtp(emailParam, otpValue);
    setVerifying(false);
    if (error) {
      setOtpError(error.message);
      return;
    }
    router.push(claimAgentId ? `/claim/${claimAgentId}` : '/messages');
  }, [emailParam, otpValue, verifyOtp, router, claimAgentId]);

  const handleResend = async () => {
    if (!emailParam || resending) return;
    setResending(true);
    const supabase = createBrowserClient();
    await supabase.auth.resend({
      type: 'signup',
      email: emailParam,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback${claimAgentId ? `?next=/claim/${claimAgentId}` : ''}`,
      },
    });
    setResent(true);
    setResending(false);
  };

  const btnWidth = isMobile ? 342 : 384;

  const otpRow = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        justifyContent: 'center',
        margin: isMobile ? '16px 0 12px' : '8px 0 16px',
      }}
      onPaste={handleOtpPaste}
    >
      {otpDigits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            otpRefs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          onChange={(e) => handleOtpChange(i, e.target.value)}
          onKeyDown={(e) => handleOtpKeyDown(i, e)}
          aria-label={`Verification code digit ${i + 1}`}
          style={{
            width: 48,
            height: 56,
            textAlign: 'center',
            fontSize: 24,
            fontFamily: 'var(--font-primary)',
            fontWeight: 700,
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-input-border)',
            color: 'var(--color-gray-800)',
            boxSizing: 'border-box',
            background: 'var(--color-white)',
          }}
        />
      ))}
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100%',
        boxSizing: 'border-box',
        background: isMobile ? 'var(--gradient-verify-mobile)' : 'var(--gradient-verify-page)',
        fontFamily: 'var(--font-primary)',
        padding: isMobile ? '32px 24px 24px' : 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: isMobile ? '100%' : 480,
          maxWidth: '100%',
          background: isMobile ? 'transparent' : 'var(--color-white)',
          borderRadius: isMobile ? 0 : 24,
          padding: isMobile ? 0 : 48,
          boxShadow: isMobile ? 'none' : 'var(--shadow-modal)',
          boxSizing: 'border-box',
        }}
      >
        {isMobile ? (
          <div style={{ width: '100%', maxWidth: 342, alignSelf: 'flex-start' }}>
            <a
              href="/signup"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontFamily: 'var(--font-primary)',
                fontSize: 13,
                fontWeight: 'var(--font-normal)',
                color: 'var(--color-gray-500)',
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              <ChevronLeft size={16} color="var(--color-gray-500)" />
              Back to Sign Up
            </a>
          </div>
        ) : null}
        {isMobile ? <div style={{ height: 24 }} /> : null}

        <Mail
          size={isMobile ? 60 : 48}
          color={isMobile ? 'var(--color-gray-600)' : 'var(--color-gray-500)'}
          style={{ marginBottom: isMobile ? 20 : 20 }}
        />

        <h1
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: isMobile ? 'var(--text-2xl)' : 'var(--text-3xl)',
            fontWeight: 'var(--font-bold)',
            color: 'var(--color-gray-800)',
            margin: isMobile ? 0 : '0 0 12px',
            lineHeight: 1.2,
            textAlign: 'center',
          }}
        >
          Check your email
        </h1>

        {isMobile ? <div style={{ height: 8 }} /> : null}

        <p
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: isMobile ? 'var(--text-md)' : 14,
            fontWeight: isMobile ? 'var(--font-normal)' : 400,
            color: 'var(--color-gray-500)',
            textAlign: 'center',
            margin: isMobile ? 0 : '0 0 8px',
            lineHeight: 1.5,
          }}
        >
          We sent a code to
          <br />
          <strong style={{ color: 'var(--color-gray-800)' }}>
            {emailParam || 'your email address'}
          </strong>
        </p>

        {isMobile ? <div style={{ height: 8 }} /> : null}

        <p
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: isMobile ? 'var(--text-base)' : 13,
            color: 'var(--color-gray-500)',
            textAlign: 'center',
            margin: isMobile ? 0 : '0 0 24px',
            lineHeight: 1.5,
          }}
        >
          Enter the {OTP_LENGTH}-digit code from your email to verify your account.
          <br />
          Check your spam folder if you don&apos;t see it.
        </p>

        {!emailParam ? (
          <a href="/signup" style={backToSignupStyle}>
            Go back to sign up
          </a>
        ) : null}

        {otpRow}

        {otpError ? (
          <p
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 13,
              color: 'var(--color-red)',
              margin: '0 0 12px',
              textAlign: 'center',
            }}
          >
            {otpError}
          </p>
        ) : null}

        {emailParam ? (
          <Button
            onClick={() => void handleVerifyOtp()}
            disabled={verifying || otpValue.length !== OTP_LENGTH}
            style={{
              width: btnWidth,
              maxWidth: '100%',
              height: 'var(--btn-height-primary)',
              marginBottom: 12,
              borderRadius: isMobile ? 12 : undefined,
              background: isMobile ? 'var(--gradient-primary)' : undefined,
            }}
          >
            {verifying ? 'Verifying...' : 'Verify'}
          </Button>
        ) : null}

        <Button
          variant="secondary"
          onClick={() => router.push('/login')}
          style={{ width: btnWidth, maxWidth: '100%', height: 'var(--btn-height-primary)' }}
        >
          Go to Sign In
        </Button>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 4,
            marginTop: 20,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 13,
              fontWeight: 400,
              color: 'var(--color-gray-800)',
            }}
          >
            Didn&apos;t get the code?
          </span>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handleResend();
            }}
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-red)',
              textDecoration: 'none',
            }}
          >
            {resending ? 'Sending...' : resent ? 'Sent!' : 'Resend'}
          </a>
        </div>
      </div>
    </div>
  );
};

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <p
          style={{
            color: 'var(--color-gray-500)',
            fontSize: 14,
            textAlign: 'center',
            marginTop: 200,
          }}
        >
          Loading...
        </p>
      }
    >
      <VerifyForm />
    </Suspense>
  );
}
