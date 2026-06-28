'use client';

import { useState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, QrCode, Bot } from 'lucide-react';
import { Button, Input, Avatar } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';

export default function SignUpPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    const { error: authError } = await signUp(email, password);

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push(`/verify?email=${encodeURIComponent(email)}`);
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        fontFamily: 'var(--font-primary)',
      }}
    >
      {/* Left: Brand side — design: plpFL (desktop only) */}
      <div
        className="signup-brand-side"
        style={{
          flex: 1,
          background: 'var(--gradient-signup-brand)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 48px',
          gap: 28,
          color: 'var(--color-white)',
          overflow: 'hidden',
        }}
      >
        {/* Title */}
        <h1
          style={{
            fontSize: 36,
            fontWeight: 700,
            lineHeight: 1.15,
            margin: 0,
            letterSpacing: -0.5,
            textAlign: 'center',
            color: 'var(--color-white)',
          }}
        >
          Give your Agent
          <br />a QR Code
        </h1>
        {/* Tagline */}
        <p
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--color-signup-brand-muted)',
            lineHeight: 1.6,
            margin: 0,
            letterSpacing: 2.5,
            textAlign: 'center',
          }}
        >
          Scan. Chat. Anywhere.
        </p>

        {/* Showcase — design: xApq1, gap:24, horizontal */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
          }}
        >
          {/* signMock — design: kVeX7, 200x360, cornerRadius:28 */}
          <div
            style={{
              width: 200,
              height: 360,
              borderRadius: 28,
              background: 'var(--color-white)',
              border: '1px solid var(--color-gray-200)',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '32px 14px 14px 14px',
              overflow: 'hidden',
            }}
          >
            {/* Avatar */}
            <img
              src="/qrclaw-logo-icon.png"
              alt="Agent"
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
              }}
            />
            <div style={{ height: 10 }} />
            {/* Name */}
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-black)' }}>
              Your Agent
            </span>
            <div style={{ height: 4 }} />
            {/* Sub */}
            <span style={{ fontSize: 10, color: 'var(--color-gray-500)' }}>Ready to serve</span>
            <div style={{ height: 16 }} />
            {/* Divider */}
            <div style={{ width: '100%', height: 1, background: 'var(--color-gray-border)' }} />
            <div style={{ height: 12 }} />
            {/* Description */}
            <p
              style={{
                fontSize: 10,
                color: 'var(--color-gray-500)',
                textAlign: 'center',
                lineHeight: 1.5,
                margin: 0,
                width: '100%',
              }}
            >
              Your AI agent&apos;s profile page, visible to anyone who scans your QR code.
            </p>
            <div style={{ flex: 1 }} />
            {/* Button */}
            <div
              style={{
                width: '100%',
                height: 32,
                borderRadius: 8,
                background: 'var(--color-red)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-white)' }}>
                💬 Message
              </span>
            </div>
          </div>

          {/* qrCardShowcase — design: P8ZVj, 200x280, cornerRadius:20, gap:12 */}
          <div
            style={{
              width: 200,
              height: 280,
              borderRadius: 20,
              background: 'var(--color-white)',
              border: '1px solid var(--color-gray-200)',
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '24px 20px',
              gap: 12,
            }}
          >
            {/* Agent row — design: Rzik1, gap:8, width:fill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
              }}
            >
              {/* Avatar */}
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
                <Bot size={16} color="var(--color-white)" />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-gray-800)' }}>
                  QRClaw Support
                </div>
                <div style={{ fontSize: 8, color: 'var(--color-black)' }}>
                  Official support agent
                </div>
              </div>
            </div>

            {/* QR Code area — design: 8fPHA, 140x140, cornerRadius:12 */}
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: 12,
                background: 'var(--color-gray-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <QrCode size={110} color="var(--color-red)" />
            </div>

            {/* Hint */}
            <span style={{ fontSize: 10, color: 'var(--color-black)', textAlign: 'center' }}>
              Scan to start chatting
            </span>
          </div>
        </div>
      </div>

      {/* Right: Form side — desktop: design DqSru / mobile: design rgesk */}
      <div
        className="signup-form-side"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 100px',
          background: 'var(--color-white)',
        }}
      >
        {/* Desktop-only: Back to home link */}
        <Link
          href="/"
          className="signup-back-link"
          style={{
            width: '100%',
            maxWidth: 400,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 'var(--text-base)',
            fontWeight: 'var(--font-normal)',
            color: 'var(--color-gray-500)',
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={16} color="var(--color-gray-500)" />
          Back to home
        </Link>

        {/* formSpacer — design: iXE4d, height:40 */}
        <div style={{ height: 40 }} />

        {/* Logo — desktop: 56x56, mobile: 80x80 */}
        <div className="signup-logo-desktop">
          <img
            src="/qrclaw-logo-icon.png"
            alt="QRClaw"
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
            }}
          />
        </div>
        <div className="signup-logo-mobile">
          <Avatar src="/qrclaw-logo-icon.png" alt="QRClaw" size={48} variant="agent" />
        </div>

        {/* fSp1 — height:16 */}
        <div style={{ height: 16 }} />

        {/* Title — desktop: "Create an account" / mobile: "QRClaw" */}
        <h2
          className="signup-title-desktop"
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--color-black)',
            margin: 0,
            letterSpacing: -0.5,
          }}
        >
          Create an account
        </h2>
        <h2
          className="signup-title-mobile"
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: 'var(--color-gray-800)',
            margin: 0,
            letterSpacing: 0,
            lineHeight: 1.2,
          }}
        >
          Welcome
        </h2>

        {/* fSp2 — height:8 */}
        <div style={{ height: 8 }} />

        {/* Subtitle — desktop: "Sign up to manage..." / mobile: "Create an account to save conversations" */}
        <p
          className="signup-sub-desktop"
          style={{
            fontSize: 14,
            color: 'var(--color-gray-500)',
            margin: 0,
          }}
        >
          Sign up to manage your agents and QR codes
        </p>
        <p
          className="signup-sub-mobile"
          style={{
            fontSize: 'var(--text-md)',
            fontWeight: 'var(--font-normal)',
            color: 'var(--color-gray-500)',
            margin: 0,
            textAlign: 'center',
          }}
        >
          Create an account to get started
        </p>

        {/* fSp3 — height:32 (desktop) / height:40 (mobile) */}
        <div className="signup-spacer-before-form" style={{ height: 32 }} />

        {/* Form — desktop: max 400px / mobile: max 342px */}
        <form
          onSubmit={handleSubmit}
          className="signup-form"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: isNarrow ? 20 : 0,
            width: '100%',
            maxWidth: 400,
          }}
        >
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            variant={isNarrow ? 'authMobile' : 'default'}
          />
          {/* sp4 — height:12 */}
          {!isNarrow ? <div style={{ height: 12 }} /> : null}
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            variant={isNarrow ? 'authMobile' : 'default'}
          />
          {/* confPwSp — height:12 */}
          {!isNarrow ? <div style={{ height: 12 }} /> : null}
          {/* Confirm Password — always present in form */}
          <Input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            variant={isNarrow ? 'authMobile' : 'default'}
          />

          {error && (
            <p
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-base)',
                color: 'var(--color-red)',
                textAlign: 'center',
                margin: '8px 0 0',
              }}
            >
              {error}
            </p>
          )}

          {/* sp5/sp6 — height:20 (mobile) / height:16 (desktop) */}
          <div className="signup-spacer-before-btn" style={{ height: isNarrow ? 4 : 16 }} />
          <Button
            type="submit"
            disabled={loading}
            className="signup-submit-btn"
            style={{
              width: isNarrow ? 342 : '100%',
              maxWidth: '100%',
              height: 'var(--btn-height-primary)',
              borderRadius: isNarrow ? 12 : undefined,
              background: isNarrow ? 'var(--gradient-primary)' : undefined,
              boxShadow: '0 4px 12px rgba(226, 74, 63, 0.12)',
            }}
          >
            {loading ? (
              'Creating account...'
            ) : (
              <>
                <span className="signup-submit-label-desktop">Sign Up</span>
                <span className="signup-submit-label-mobile">Create Account</span>
              </>
            )}
          </Button>
        </form>

        {/* Switch link spacer — height:16 (mobile) / height:20 (desktop) */}
        <div className="signup-spacer-after-btn" style={{ height: 20 }} />

        {/* Switch link */}
        <div
          style={{
            display: 'flex',
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
            Already have an account?
          </span>
          <Link
            href="/login"
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 'var(--text-base)',
              fontWeight: 'var(--font-semibold)',
              color: 'var(--color-red)',
              textDecoration: 'none',
            }}
          >
            Sign In
          </Link>
        </div>

        {/* Legal notice */}
        <div className="signup-legal-note">
          <div style={{ height: 24 }} />
          <p
            className="signup-legal-text"
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 11,
              fontWeight: 'var(--font-normal)',
              color: 'var(--color-muted)',
              textAlign: 'center',
              margin: 0,
              width: 340,
              lineHeight: 1.5,
            }}
          >
            By signing up, you agree to our{' '}
            <Link href="/terms" style={{ color: 'var(--color-red)', textDecoration: 'underline' }}>
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link
              href="/privacy"
              style={{ color: 'var(--color-red)', textDecoration: 'underline' }}
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        <div className="signup-footer-mobile">
          <div style={{ flexGrow: 1 }} />
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
      </div>

      {/* Responsive styles */}
      <style>{`
        /* Desktop: show desktop elements, hide mobile elements */
        .signup-logo-mobile,
        .signup-title-mobile,
        .signup-sub-mobile,
        .signup-footer-mobile,
        .signup-submit-label-mobile { display: none !important; }

        @media (max-width: 768px) {
          /* Hide brand side on mobile */
          .signup-brand-side { display: none !important; }

          /* Hide desktop-only elements */
          .signup-back-link,
          .signup-logo-desktop,
          .signup-title-desktop,
          .signup-sub-desktop { display: none !important; }

          /* Show mobile elements */
          .signup-logo-mobile { display: block !important; }
          .signup-title-mobile { display: block !important; }
          .signup-sub-mobile { display: block !important; }
          .signup-footer-mobile {
            display: flex !important;
            flex-direction: column;
            align-items: center;
            flex-grow: 1;
            justify-content: flex-end;
          }

          /* Mobile form side: full width, different padding */
          .signup-form-side {
            padding: 48px 24px 24px 24px !important;
            justify-content: flex-start !important;
            min-height: 100vh;
          }

          /* Mobile form: narrower */
          .signup-form {
            max-width: 342px !important;
          }

          /* Mobile spacer adjustments */
          .signup-spacer-before-form {
            height: 40px !important;
          }

          .signup-spacer-before-btn {
            height: 20px !important;
          }

          .signup-spacer-after-btn {
            height: 16px !important;
          }

          .signup-legal-note p {
            width: 100% !important;
            max-width: 342px !important;
            font-size: 13px !important;
          }

          .signup-submit-btn {
            border-radius: var(--radius-lg) !important;
          }

          .signup-submit-label-desktop { display: none !important; }
          .signup-submit-label-mobile { display: inline !important; }
        }
      `}</style>
    </div>
  );
}
