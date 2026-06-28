'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { QrCode, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { Button, Input, Avatar } from '@/components/ui';
import { createBrowserClient } from '@/lib/supabase';

interface AgentInfo {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

interface ClaimError {
  message: string;
  code?: string;
}

const EDGE_FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/claim-agent`;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ErrorBanner = ({ error }: { error: ClaimError }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
      padding: '10px 14px',
      borderRadius: 8,
      background: 'var(--color-red-50, #FEF2F2)',
      border: '1px solid var(--color-red-200, #FECACA)',
    }}
  >
    <AlertTriangle size={16} color="var(--color-red)" />
    <span
      style={{
        fontSize: 'var(--text-sm)',
        color: 'var(--color-red-700, #B91C1C)',
      }}
    >
      {error.message}
    </span>
  </div>
);

const LogoHeader = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 32,
    }}
  >
    <QrCode size={28} color="var(--color-red)" />
    <span
      style={{
        fontSize: 'var(--text-xl)',
        fontWeight: 'var(--font-bold)',
        color: 'var(--color-gray-800)',
      }}
    >
      QRClaw
    </span>
  </div>
);

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #FFFFFF 0%, #FEF2F2 40%, #FDF2F8 70%, #F0F9FF 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: 'var(--font-primary)',
    }}
  >
    <div
      style={{
        width: '100%',
        maxWidth: 480,
        background: 'var(--color-white)',
        borderRadius: 24,
        boxShadow: '0 4px 32px rgba(0,0,0,0.08)',
        padding: 48,
      }}
    >
      {children}
    </div>
  </div>
);

const AgentInfoRow = ({ agent }: { agent: AgentInfo }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: 16,
      borderRadius: 12,
      background: 'var(--color-gray-50)',
      border: '1px solid var(--color-gray-border)',
      marginBottom: 24,
    }}
  >
    <Avatar src="/qrclaw-logo-icon.png" alt="Agent" size={44} variant="agent" />
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontSize: 'var(--text-md)',
          fontWeight: 'var(--font-semibold)',
          color: 'var(--color-gray-800)',
        }}
      >
        {agent.name}
      </div>
      <div
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-gray-500)',
        }}
      >
        Status: {agent.status}
      </div>
    </div>
  </div>
);

const useCountdown = (createdAt: string) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const expiresAt = new Date(createdAt).getTime() + 24 * 60 * 60 * 1000;
    let interval: ReturnType<typeof setInterval> | null = null;

    const updateTimer = () => {
      const now = Date.now();
      const diff = expiresAt - now;

      if (diff <= 0) {
        setTimeLeft('Expired');
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(
        `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    };

    updateTimer();
    interval = setInterval(updateTimer, 1000);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [createdAt]);

  return timeLeft;
};

const ClaimLoggedIn = ({ agent }: { agent: AgentInfo }) => {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<ClaimError | null>(null);
  const timeLeft = useCountdown(agent.created_at);

  const handleConfirm = useCallback(async () => {
    setIsConfirming(true);
    setError(null);

    try {
      const supabase = createBrowserClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError({ message: 'Your session has expired. Please log in again.', code: 'no_session' });
        setIsConfirming(false);
        return;
      }

      // Get the current session for the access_token (already server-verified via getUser above)
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError({ message: 'Your session has expired. Please log in again.', code: 'no_session' });
        setIsConfirming(false);
        return;
      }

      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ agent_id: agent.id }),
      });

      const result = await response.json();

      if (!response.ok) {
        const message =
          result?.error?.message ?? result?.message ?? 'Failed to confirm agent. Please try again.';
        setError({ message, code: result?.error?.code });
        setIsConfirming(false);
        return;
      }

      router.push('/messages?claimed=1');
    } catch (err) {
      console.error('Claim confirm error:', err);
      setError({
        message: 'A network error occurred. Please check your connection and try again.',
      });
      setIsConfirming(false);
    }
  }, [agent.id, router]);

  return (
    <PageWrapper>
      <LogoHeader />

      <h1
        style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 'var(--font-bold)',
          color: 'var(--color-gray-800)',
          margin: '0 0 8px',
        }}
      >
        Claim Agent
      </h1>
      <p
        style={{
          fontSize: 'var(--text-md)',
          color: 'var(--color-gray-500)',
          margin: '0 0 24px',
        }}
      >
        An AI agent wants to connect with you.
      </p>

      <AgentInfoRow agent={agent} />

      {/* Countdown */}
      {timeLeft && timeLeft !== 'Expired' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 24,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'var(--color-yellow-50, #FEF3C7)',
            border: '1px solid var(--color-yellow-200, #FDE68A)',
          }}
        >
          <Clock size={16} color="var(--color-yellow-600, #D97706)" />
          <span
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-yellow-800, #92400E)',
            }}
          >
            This claim link expires in {timeLeft}
          </span>
        </div>
      )}

      {timeLeft === 'Expired' && (
        <ErrorBanner error={{ message: 'This claim link has expired.' }} />
      )}

      {error && <ErrorBanner error={error} />}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12 }}>
        <Button
          variant="secondary"
          size="lg"
          onClick={() => router.push('/messages')}
          disabled={isConfirming}
        >
          Decline
        </Button>
        <Button size="lg" onClick={handleConfirm} disabled={isConfirming || timeLeft === 'Expired'}>
          {isConfirming ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Confirming...
            </span>
          ) : (
            'Confirm'
          )}
        </Button>
      </div>
    </PageWrapper>
  );
};

const ClaimNotLoggedIn = ({ agent, token }: { agent: AgentInfo; token: string }) => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<ClaimError | null>(null);

  const handleSignUpAndClaim = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      setError({ message: 'Please enter both email and password.' });
      return;
    }

    if (password.length < 6) {
      setError({ message: 'Password must be at least 6 characters.' });
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = createBrowserClient();

      // Step 1: Sign up
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (signUpError) {
        setError({ message: signUpError.message || 'Sign up failed. Please try again.' });
        setIsSubmitting(false);
        return;
      }

      // Step 2: Try to claim agent if we got an immediate session
      const accessToken = signUpData.session?.access_token;
      if (accessToken) {
        try {
          const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ agent_id: agent.id }),
          });

          if (!response.ok) {
            const result = await response.json();
            console.error('Claim agent PATCH failed:', result);
            // Don't block signup flow — user can claim after verification
          }
        } catch (claimErr) {
          console.error('Claim agent PATCH error:', claimErr);
          // Don't block signup flow
        }
      }

      // Step 3: Redirect to verify page, preserving claim intent
      const verifyUrl = `/verify?email=${encodeURIComponent(email.trim())}&claim=${encodeURIComponent(agent.id)}`;
      router.push(verifyUrl);
    } catch (err) {
      console.error('Sign up error:', err);
      setError({
        message: 'A network error occurred. Please check your connection and try again.',
      });
      setIsSubmitting(false);
    }
  }, [email, password, agent.id, router]);

  return (
    <PageWrapper>
      <LogoHeader />

      <h1
        style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 'var(--font-bold)',
          color: 'var(--color-gray-800)',
          margin: '0 0 8px',
        }}
      >
        Sign Up & Claim Agent
      </h1>
      <p
        style={{
          fontSize: 'var(--text-md)',
          color: 'var(--color-gray-500)',
          margin: '0 0 24px',
        }}
      >
        Create an account to claim this AI agent.
      </p>

      {/* Agent info */}
      <AgentInfoRow agent={agent} />

      {error && <ErrorBanner error={error} />}

      {/* Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting}
        />
        <Input
          label="Password"
          type="password"
          placeholder="Create a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isSubmitting}
        />
      </div>

      <Button size="lg" onClick={handleSignUpAndClaim} disabled={isSubmitting}>
        {isSubmitting ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Creating account...
          </span>
        ) : (
          'Sign Up & Claim Agent'
        )}
      </Button>

      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-gray-500)',
          textAlign: 'center',
          marginTop: 16,
          marginBottom: 0,
        }}
      >
        Already have an account?{' '}
        <Link
          href={`/login?redirectTo=${encodeURIComponent(`/claim/${token}`)}`}
          style={{
            color: 'var(--color-red)',
            fontWeight: 'var(--font-medium)',
            textDecoration: 'none',
          }}
        >
          Log In
        </Link>
      </p>
    </PageWrapper>
  );
};

const LoadingState = () => (
  <PageWrapper>
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <Loader2
        size={32}
        color="var(--color-red)"
        style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}
      />
      <p style={{ fontSize: 'var(--text-md)', color: 'var(--color-gray-500)' }}>
        Loading claim details...
      </p>
    </div>
  </PageWrapper>
);

const ErrorState = ({ message }: { message: string }) => (
  <PageWrapper>
    <LogoHeader />
    <div style={{ textAlign: 'center' }}>
      <AlertTriangle size={48} color="var(--color-red)" style={{ margin: '0 auto 16px' }} />
      <h1
        style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 'var(--font-bold)',
          color: 'var(--color-gray-800)',
          margin: '0 0 8px',
        }}
      >
        Invalid Claim Link
      </h1>
      <p
        style={{
          fontSize: 'var(--text-md)',
          color: 'var(--color-gray-500)',
          margin: '0 0 24px',
        }}
      >
        {message}
      </p>
      <Link
        href="/"
        style={{
          color: 'var(--color-red)',
          fontWeight: 'var(--font-medium)',
          textDecoration: 'none',
          fontSize: 'var(--text-md)',
        }}
      >
        Go to Home
      </Link>
    </div>
  </PageWrapper>
);

export default function ClaimPage() {
  const params = useParams();
  const token = (params.token as string) ?? '';
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadClaimData = async () => {
      if (!token) {
        setLoadError('No claim token provided.');
        setIsLoading(false);
        return;
      }

      if (!UUID_PATTERN.test(token)) {
        setLoadError('Invalid claim link format.');
        setIsLoading(false);
        return;
      }

      try {
        const supabase = createBrowserClient();

        // Check auth state — use getUser() for server-verified identity
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setIsLoggedIn(!!user);

        // Look up agent by ID (token = agent UUID) — use public-safe view
        const { data: agentData, error: agentError } = await supabase
          .from('agents_public')
          .select('id, name, status, created_at')
          .eq('id', token)
          .single();

        if (agentError || !agentData) {
          setLoadError('This claim link is invalid or the agent no longer exists.');
          setIsLoading(false);
          return;
        }

        if (agentData.status === 'suspended') {
          setLoadError('This agent has been suspended and cannot be claimed.');
          setIsLoading(false);
          return;
        }

        setAgent({
          id: agentData.id,
          name: agentData.name,
          status: agentData.status,
          created_at: agentData.created_at,
        });
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load claim data:', err);
        setLoadError('Failed to load claim details. Please try again later.');
        setIsLoading(false);
      }
    };

    loadClaimData();
  }, [token]);

  if (isLoading) {
    return <LoadingState />;
  }

  if (loadError || !agent) {
    return <ErrorState message={loadError ?? 'Agent not found.'} />;
  }

  if (isLoggedIn) {
    return <ClaimLoggedIn agent={agent} />;
  }

  return <ClaimNotLoggedIn agent={agent} token={token} />;
}
