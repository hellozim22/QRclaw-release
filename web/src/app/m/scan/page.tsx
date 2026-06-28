'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, Image, Flashlight } from 'lucide-react';

export default function ScanQRPage() {
  const router = useRouter();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--color-scan-background)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        maxWidth: 390,
        margin: '0 auto',
      }}
    >
      {/* TopBar — design: height 50, padding [0,16], back chevron + title + spacer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 50,
          padding: '0 16px',
          flexShrink: 0,
        }}
      >
        <div
          onClick={() => router.back()}
          style={{
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <ChevronLeft size={24} color="var(--color-white)" />
        </div>
        <span
          style={{
            flex: 1,
            textAlign: 'center',
            fontFamily: 'var(--font-primary)',
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--color-white)',
          }}
        >
          Scan QR Code
        </span>
        <div style={{ width: 24, height: 24, flexShrink: 0 }} />
      </div>

      {/* Body — design: justifyContent center, gap 32, layout vertical, fill_container height */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 32,
        }}
      >
        {/* Hint text */}
        <span
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 14,
            fontWeight: 400,
            color: 'var(--color-scan-hint)',
          }}
        >
          Point your camera at a QR code
        </span>

        {/* Scan viewfinder — 260x260, cornerRadius 20, stroke #FFFFFF33 2px */}
        <div
          style={{
            width: 260,
            height: 260,
            position: 'relative',
            borderRadius: 20,
            border: '2px solid var(--color-scan-viewfinder-border)',
          }}
        >
          {/* Corner TL — cornerRadius [20,0,0,0] */}
          <div
            style={{
              position: 'absolute',
              top: -2,
              left: -2,
              width: 40,
              height: 40,
              borderTop: '3px solid var(--color-red)',
              borderLeft: '3px solid var(--color-red)',
              borderRadius: '20px 0 0 0',
            }}
          />
          {/* Corner TR */}
          <div
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 40,
              height: 40,
              borderTop: '3px solid var(--color-red)',
              borderRight: '3px solid var(--color-red)',
              borderRadius: '0 20px 0 0',
            }}
          />
          {/* Corner BL */}
          <div
            style={{
              position: 'absolute',
              bottom: -2,
              left: -2,
              width: 40,
              height: 40,
              borderBottom: '3px solid var(--color-red)',
              borderLeft: '3px solid var(--color-red)',
              borderRadius: '0 0 0 20px',
            }}
          />
          {/* Corner BR */}
          <div
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 40,
              height: 40,
              borderBottom: '3px solid var(--color-red)',
              borderRight: '3px solid var(--color-red)',
              borderRadius: '0 0 20px 0',
            }}
          />

          {/* Scan line — centered, red, 240px wide */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: 10,
              right: 10,
              height: 2,
              borderRadius: 1,
              background: 'var(--color-red)',
              transform: 'translateY(-50%)',
            }}
          />
        </div>

        {/* Bottom action buttons — gap 32, centered */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 32,
          }}
        >
          {/* Album button — 56x56, cornerRadius 28 */}
          <button
            type="button"
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              background: 'var(--color-scan-control-bg)',
              border: '1px solid var(--color-scan-control-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <Image size={24} color="var(--color-white)" />
          </button>

          {/* Flash button — 56x56, cornerRadius 28 */}
          <button
            type="button"
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              background: 'var(--color-scan-control-bg)',
              border: '1px solid var(--color-scan-control-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <Flashlight size={24} color="var(--color-white)" />
          </button>
        </div>

        {/* Labels row — gap 56, centered */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 56,
            marginTop: -16,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 11,
              fontWeight: 400,
              color: 'var(--color-scan-caption)',
            }}
          >
            Album
          </span>
          <span
            style={{
              fontFamily: 'var(--font-primary)',
              fontSize: 11,
              fontWeight: 400,
              color: 'var(--color-scan-caption)',
            }}
          >
            Flash
          </span>
        </div>
      </div>
    </div>
  );
}
