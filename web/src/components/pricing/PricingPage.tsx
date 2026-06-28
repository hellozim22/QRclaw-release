'use client';

import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui';

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  name: string;
  price: string;
  period: string;
  tag?: string;
  tagColor?: string;
  features: PlanFeature[];
  buttonLabel: string;
  buttonVariant: 'primary' | 'secondary';
  highlighted: boolean;
  comingSoon: boolean;
}

const FREE_PLAN: Plan = {
  name: 'Starter Free',
  price: '$0',
  period: '/month',
  tag: 'Current Plan',
  tagColor: 'var(--color-red)',
  features: [
    { text: '1 AI Agent', included: true },
    { text: '3 QR Codes', included: true },
    { text: '100 scans/month', included: true },
    { text: 'Basic analytics', included: true },
    { text: 'Community support', included: true },
  ],
  buttonLabel: 'Get Started Free',
  buttonVariant: 'primary',
  highlighted: true,
  comingSoon: false,
};

const PlanCard = ({ plan }: { plan: Plan }) => {
  const router = useRouter();

  return (
    <div
      className="flex flex-col relative w-full"
      style={{
        background: 'var(--color-white)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-8)',
        border: plan.highlighted
          ? '2px solid var(--color-red)'
          : '1px solid var(--color-gray-border)',
      }}
    >
      {plan.tag && (
        <div
          style={{
            position: 'absolute',
            top: -12,
            right: 20,
            background: plan.tagColor,
            color: 'var(--color-white)',
            fontFamily: 'var(--font-primary)',
            fontSize: 'var(--text-xs)',
            fontWeight: 'var(--font-bold)',
            padding: '4px 12px',
            borderRadius: 12,
          }}
        >
          {plan.tag}
          {plan.highlighted && ' \u00B7 Recommended'}
          {!plan.highlighted && plan.comingSoon && ' \u00B7 Best Value'}
        </div>
      )}

      <h3
        style={{
          fontFamily: 'var(--font-primary)',
          fontSize: 'var(--text-xl)',
          fontWeight: 'var(--font-bold)',
          color: 'var(--color-gray-800)',
          margin: '0 0 8px',
        }}
      >
        {plan.name}
      </h3>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 24 }}>
        <span
          style={{
            fontSize: 40,
            fontWeight: 'var(--font-bold)',
            color: 'var(--color-gray-800)',
          }}
        >
          {plan.price}
        </span>
        <span
          style={{
            fontSize: 'var(--text-md)',
            color: 'var(--color-gray-500)',
          }}
        >
          {plan.period}
        </span>
      </div>

      <div style={{ flex: 1, marginBottom: 24 }}>
        {plan.features.map((feature) => (
          <div
            key={feature.text}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
            }}
          >
            <Check
              size={16}
              color={feature.included ? 'var(--color-red)' : 'var(--color-gray-400)'}
              style={{ opacity: feature.included ? 1 : 0.4, flexShrink: 0 }}
            />
            <span
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 'var(--text-md)',
                color: feature.included ? 'var(--color-gray-800)' : 'var(--color-gray-400)',
              }}
            >
              {feature.text}
            </span>
          </div>
        ))}
      </div>

      <Button
        variant={plan.buttonVariant}
        size="lg"
        disabled={plan.comingSoon}
        onClick={() => {
          if (!plan.comingSoon) {
            router.push('/signup');
          }
        }}
      >
        {plan.buttonLabel}
      </Button>
    </div>
  );
};

export default function PricingPage() {
  return (
    <div
      className="min-h-screen px-4 sm:px-6 pt-20 sm:pt-[120px] pb-16 sm:pb-20"
      style={{
        background:
          'linear-gradient(180deg, var(--color-white) 0%, var(--color-red-bg) 40%, var(--color-red-bg) 70%, var(--color-gray-100) 100%)',
        fontFamily: 'var(--font-primary)',
      }}
    >
      <div className="max-w-[1200px] mx-auto">
        <h1
          className="text-[28px] sm:text-[40px]"
          style={{
            fontWeight: 'var(--font-bold)',
            color: 'var(--color-gray-800)',
            textAlign: 'center',
            margin: '0 0 12px',
          }}
        >
          Simple, Transparent Pricing
        </h1>
        <p
          className="mb-10 sm:mb-14"
          style={{
            fontSize: 'var(--text-lg)',
            color: 'var(--color-gray-500)',
            textAlign: 'center',
            margin: '0 0 0',
          }}
        >
          Start free. Upgrade as you grow.
        </p>

        <div className="flex flex-col items-center gap-8 max-w-[400px] mx-auto">
          <PlanCard plan={FREE_PLAN} />

          <div
            className="w-full text-center"
            style={{
              background: 'var(--color-white)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-6) var(--space-8)',
              border: '1px solid var(--color-gray-border)',
            }}
          >
            <p
              style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 'var(--font-semibold)',
                color: 'var(--color-gray-800)',
                margin: '0 0 4px',
              }}
            >
              Pro &amp; Max plans coming soon
            </p>
            <p
              style={{
                fontSize: 'var(--text-md)',
                color: 'var(--color-gray-500)',
                margin: 0,
              }}
            >
              More agents, unlimited QR codes, advanced analytics, and API access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
