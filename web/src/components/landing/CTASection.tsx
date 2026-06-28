'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ArrowRight, Loader2, Check } from 'lucide-react';
import { submitSubscription } from '@/lib/subscribe';

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

export default function CTASection() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const [feedback, setFeedback] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleSubscribe = async () => {
    if (state === 'loading') return;

    if (timerRef.current) clearTimeout(timerRef.current);

    setState('loading');
    setFeedback('');

    const result = await submitSubscription(email);

    if (result.success) {
      setState('success');
      setFeedback(result.message ?? 'Subscribed!');
      setEmail('');
      timerRef.current = setTimeout(() => {
        setState('idle');
        setFeedback('');
      }, 4000);
    } else {
      setState('error');
      setFeedback(result.error ?? 'Something went wrong.');
      timerRef.current = setTimeout(() => setState('idle'), 3000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubscribe();
    }
  };

  return (
    <section
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '48px 80px',
        background: 'linear-gradient(180deg, #FEF2F2 0%, #FDF2F8 50%, #F9FAFB 100%)',
      }}
    >
      <div
        style={{
          width: 800,
          maxWidth: '100%',
          borderRadius: 24,
          background:
            'linear-gradient(135deg, var(--color-white) 0%, #FEF2F2 40%, #EFF6FF 70%, var(--color-gray-100) 100%)',
          border: '1px solid var(--color-gray-300)',
          boxShadow: '0 8px 40px rgba(226, 74, 63, 0.03)',
          padding: '48px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-red)' }}>›</span>
        <h2
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: -0.5,
            margin: 0,
            color: 'var(--color-black)',
          }}
        >
          Stay in the Loop
        </h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--color-gray-500)',
            margin: 0,
            textAlign: 'center',
            lineHeight: 1.6,
          }}
        >
          Get updates on new features, integrations, and lobster wisdom.
          <br />
          No spam, unsubscribe anytime.
        </p>
        <div
          className="subscribe-row"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 8,
            width: '100%',
            maxWidth: 420,
            flexWrap: 'wrap' as const,
          }}
        >
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={state === 'loading'}
            style={{
              flex: 1,
              minWidth: 200,
              height: 48,
              borderRadius: 12,
              border: '1px solid var(--color-gray-border)',
              padding: '0 16px',
              fontSize: 14,
              fontFamily: 'var(--font-primary)',
              color: 'var(--color-gray-800)',
              background: state === 'loading' ? 'var(--color-gray-100)' : 'var(--color-white)',
              outline: 'none',
              opacity: state === 'loading' ? 0.7 : 1,
            }}
          />
          <button
            onClick={handleSubscribe}
            disabled={state === 'loading' || state === 'success'}
            style={{
              height: 48,
              padding: '0 28px',
              borderRadius: 12,
              background: state === 'success' ? 'var(--color-green-text)' : 'var(--color-red-dark)',
              color: 'var(--color-white)',
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              cursor: state === 'loading' || state === 'success' ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(139, 46, 43, 0.12)',
              opacity: state === 'loading' ? 0.7 : 1,
              transition: 'background 0.2s, opacity 0.2s',
            }}
          >
            {state === 'loading' && (
              <Loader2 size={16} color="white" style={{ animation: 'spin 1s linear infinite' }} />
            )}
            {state === 'success' && <Check size={16} color="white" />}
            {state === 'success' ? 'Subscribed!' : 'Subscribe'}
            {state !== 'loading' && state !== 'success' && <ArrowRight size={16} color="white" />}
          </button>
        </div>
        {feedback && (
          <p
            style={{
              fontSize: 13,
              color: state === 'success' ? 'var(--color-green-text)' : 'var(--color-red)',
              margin: 0,
              textAlign: 'center',
            }}
          >
            {feedback}
          </p>
        )}
      </div>
    </section>
  );
}
