'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BookOpen, Globe, Menu, X, Github, CreditCard } from 'lucide-react';
import HeroSection from './HeroSection';
import ConnectSection from './ConnectSection';
import FeaturesSection from './FeaturesSection';
import CTASection from './CTASection';
import Footer from './Footer';

const NAV_LINKS = [
  { label: 'Docs', href: '/docs', icon: BookOpen },
  { label: 'Pricing', href: '/pricing', icon: CreditCard },
  { label: 'GitHub', href: 'https://github.com/qrclaw', icon: Github },
];

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div
      style={{
        height: '100dvh',
        width: '100%',
        fontFamily: 'var(--font-primary)',
        color: 'var(--color-gray-800)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ===== Navbar ===== */}
      <nav
        style={{
          flexShrink: 0,
          zIndex: 100,
          background: '#ffffff',
          borderBottom: '1px solid var(--color-gray-border)',
          height: 'var(--web-nav-height)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 80px',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            textDecoration: 'none',
          }}
        >
          <img
            src="/qrclaw-logo-icon.png"
            alt="QRClaw"
            style={{ width: 32, height: 32, borderRadius: 8 }}
          />
          <span
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 700,
              color: 'var(--color-black)',
              letterSpacing: 0.6,
            }}
          >
            QRClaw
          </span>
        </Link>

        <div style={{ flex: 1 }} />

        {/* Desktop nav links */}
        <div
          className="desktop-nav"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
          }}
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 'var(--text-md)',
                color: 'var(--color-gray-700)',
                textDecoration: 'none',
              }}
            >
              {link.icon && <link.icon size={16} />}
              {link.label}
            </a>
          ))}

          {/* Language switcher */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              borderRadius: 8,
            }}
          >
            <Globe size={16} color="var(--color-gray-600)" />
            <span
              style={{
                fontSize: 'var(--text-base)',
                fontWeight: 500,
                color: 'var(--color-gray-700)',
              }}
            >
              EN
            </span>
          </div>

          {/* Separator */}
          <div
            style={{
              width: 1,
              height: 20,
              background: 'var(--color-gray-300)',
            }}
          />

          {/* Sign In text */}
          <Link
            href="/login"
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--color-gray-800)',
              textDecoration: 'none',
            }}
          >
            Sign In
          </Link>

          {/* Sign Up button */}
          <Link
            href="/signup"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 40,
              padding: '0 20px',
              borderRadius: 10,
              background: 'var(--color-red)',
              color: 'var(--color-white)',
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(226, 74, 63, 0.12)',
            }}
          >
            Sign Up
          </Link>
        </div>

        {/* Mobile menu toggle */}
        <button
          className="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            display: 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          {mobileMenuOpen ? (
            <X size={24} color="var(--color-gray-800)" />
          ) : (
            <Menu size={24} color="var(--color-gray-800)" />
          )}
        </button>
      </nav>
      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <div
          style={{
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            background: '#ffffff',
            borderBottom: '1px solid var(--color-gray-border)',
            flexShrink: 0,
            zIndex: 99,
          }}
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              style={{
                fontSize: 14,
                color: 'var(--color-gray-800)',
                textDecoration: 'none',
              }}
            >
              {link.label}
            </a>
          ))}
          <div style={{ display: 'flex', gap: 12 }}>
            <Link
              href="/login"
              style={{
                fontSize: 14,
                color: 'var(--color-gray-800)',
                textDecoration: 'none',
              }}
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 36,
                padding: '0 16px',
                borderRadius: 10,
                background: 'var(--color-red)',
                color: 'white',
                fontSize: 14,
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Sign Up
            </Link>
          </div>
        </div>
      )}

      {/* Scrollable content area */}
      <div className="landing-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        <HeroSection />
        <ConnectSection />
        <FeaturesSection />
        <CTASection />
        <Footer />
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-toggle { display: block !important; }
        }
        @media (min-width: 769px) {
          .mobile-menu-toggle { display: none !important; }
        }
        @media (max-width: 768px) {
          nav { padding: 0 16px !important; }
          section { padding: 40px 16px !important; }
          footer { padding: 0 16px !important; }
          .hero-right { display: none !important; }
          .usecase-cards { flex-direction: column !important; }
          h1 { font-size: 36px !important; letter-spacing: -1px !important; }
          input[type="email"] { width: 100% !important; min-width: 0 !important; }
        }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
