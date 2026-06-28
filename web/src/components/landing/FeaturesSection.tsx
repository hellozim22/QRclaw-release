'use client';

import React from 'react';

const USE_CASES = [
  {
    title: 'Share your agent',
    image: '/usecase-share-agent.png',
    description:
      'You\'ve trained your AI agent to be amazing \u2014 now share it. Generate a QR code and let friends, colleagues, or anyone chat with your agent instantly. Online or printed, your "lobster" goes wherever you need it.',
    tags: ['Train', 'Share', 'Chat'],
    shadowColor: 'rgba(226, 74, 63, 0.03)',
  },
  {
    title: 'Serve your customers',
    image: '/usecase-serve-customers.png',
    description:
      'Put a QR code on your product, storefront, or website. Customers scan and instantly chat with your AI agent \u2014 ask about products, get support, place orders. Works both online and offline.',
    tags: ['Scan', 'Ask', 'Solved'],
    shadowColor: 'rgba(59, 130, 246, 0.03)',
  },
];

export default function FeaturesSection() {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '60px 80px',
        gap: 40,
        background:
          'linear-gradient(180deg, var(--color-off-white) 0%, var(--color-white) 50%, var(--color-red-bg) 100%)',
      }}
    >
      <h2
        style={{
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: -0.5,
          margin: 0,
          color: 'var(--color-black)',
        }}
      >
        See it in action
      </h2>
      <p style={{ fontSize: 15, color: 'var(--color-gray-500)', margin: 0, textAlign: 'center' }}>
        The ways QRClaw works for you.
      </p>

      <div
        className="usecase-cards"
        style={{
          display: 'flex',
          gap: 24,
          width: 900,
          maxWidth: '100%',
        }}
      >
        {USE_CASES.map((useCase) => (
          <UseCaseCard key={useCase.title} {...useCase} />
        ))}
      </div>
    </section>
  );
}

interface UseCaseCardProps {
  readonly title: string;
  readonly image: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly shadowColor: string;
}

function UseCaseCard({ title, image, description, tags, shadowColor }: UseCaseCardProps) {
  return (
    <div
      style={{
        flex: 1,
        borderRadius: 16,
        background: 'var(--color-white)',
        border: '1px solid rgba(240, 240, 240, 0.25)',
        boxShadow: `0 4px 20px ${shadowColor}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: 180,
          backgroundImage: `url(${image})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--color-gray-800)' }}>
          {title}
        </h3>
        <p
          style={{
            fontSize: 13,
            color: 'var(--color-gray-500)',
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {tags.map((tag, i) => (
            <React.Fragment key={tag}>
              {i > 0 && <span style={{ fontSize: 11, color: '#000' }}>→</span>}
              <span
                style={{
                  fontSize: 10,
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: 'var(--color-gray-200)',
                  color: 'var(--color-gray-600)',
                  fontWeight: 600,
                }}
              >
                {tag}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
