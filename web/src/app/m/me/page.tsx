'use client';

import { useRouter } from 'next/navigation';
import { Share2, QrCode, HelpCircle, ClipboardList, ChevronRight, User } from 'lucide-react';

export default function MePage() {
  const router = useRouter();

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-gray-100)',
      }}
    >
      {/* Profile section — design: fill white, padding [48,24,20,24], layout vertical */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-white)',
          padding: '48px 24px 20px 24px',
        }}
      >
        {/* Avatar row: avatar + text col + chevron-right */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            width: '100%',
          }}
        >
          {/* Avatar — design audit: 80px circle */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              background: 'var(--color-gray-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <User size={36} color="var(--color-white)" />
          </div>
          {/* Text col */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--color-gray-800)',
              }}
            >
              My Account
            </span>
            <span
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 13,
                fontWeight: 400,
                color: 'var(--color-gray-500)',
              }}
            >
              user@example.com
            </span>
          </div>
          {/* Chevron right */}
          <ChevronRight size={20} color="var(--color-black)" style={{ flexShrink: 0 }} />
        </div>
      </div>

      {/* Divider — design: fill gray-200, height 1 */}
      <div style={{ width: '100%', height: 0.5, background: 'var(--color-gray-200)' }} />

      {/* Menu list — design: fill white, layout vertical */}
      <div style={{ background: 'var(--color-white)', display: 'flex', flexDirection: 'column' }}>
        {/* Share row — icon red, 20x20 */}
        <div
          onClick={() => {
            /* share action */
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minHeight: 48,
            padding: '14px 16px',
            cursor: 'pointer',
            borderBottom: '0.5px solid var(--color-gray-200)',
          }}
        >
          <Share2 size={22} color="var(--color-red)" />
          <span
            style={{
              flex: 1,
              fontFamily: 'var(--font-primary)',
              fontSize: 15,
              fontWeight: 400,
              color: 'var(--color-gray-800)',
            }}
          >
            Share QRClaw with Friends
          </span>
          <ChevronRight size={16} color="var(--color-black)" />
        </div>

        {/* My QR Codes row — icon gray-600, 22x22 */}
        <div
          onClick={() => router.push('/m/qrcodes')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minHeight: 48,
            padding: '14px 16px',
            cursor: 'pointer',
            borderBottom: '0.5px solid var(--color-gray-200)',
          }}
        >
          <QrCode size={22} color="var(--color-gray-600)" />
          <span
            style={{
              flex: 1,
              fontFamily: 'var(--font-primary)',
              fontSize: 15,
              fontWeight: 400,
              color: 'var(--color-gray-800)',
            }}
          >
            My QR Codes
          </span>
          {/* Badge */}
          <div
            style={{
              minWidth: 20,
              height: 20,
              borderRadius: 10,
              background: 'var(--color-gray-500)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-primary)',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--color-white)',
              }}
            >
              2
            </span>
          </div>
          <ChevronRight size={16} color="var(--color-gray-500)" />
        </div>

        {/* Help & Support row */}
        <div
          onClick={() => {
            /* help action */
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minHeight: 48,
            padding: '14px 16px',
            cursor: 'pointer',
            borderBottom: '0.5px solid var(--color-gray-200)',
          }}
        >
          <HelpCircle size={22} color="var(--color-gray-600)" />
          <span
            style={{
              flex: 1,
              fontFamily: 'var(--font-primary)',
              fontSize: 15,
              fontWeight: 400,
              color: 'var(--color-gray-800)',
            }}
          >
            Help &amp; Support
          </span>
          <ChevronRight size={16} color="var(--color-gray-500)" />
        </div>

        {/* Terms of Service row — no bottom border (last item) */}
        <div
          onClick={() => {
            /* terms action */
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minHeight: 48,
            padding: '14px 16px',
            cursor: 'pointer',
          }}
        >
          <ClipboardList size={22} color="var(--color-gray-600)" />
          <span
            style={{
              flex: 1,
              fontFamily: 'var(--font-primary)',
              fontSize: 15,
              fontWeight: 400,
              color: 'var(--color-gray-800)',
            }}
          >
            Terms of Service
          </span>
          <ChevronRight size={16} color="var(--color-gray-500)" />
        </div>
      </div>

      {/* Space — design: height 24 */}
      <div style={{ height: 24 }} />

      {/* Sign Out — design: fill white, height 52, centered, stroke top+bottom 1px gray-200 */}
      <div
        onClick={() => {
          /* sign out logic */
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 48,
          padding: '14px 16px',
          background: 'var(--color-white)',
          borderTop: '0.5px solid var(--color-gray-200)',
          borderBottom: '0.5px solid var(--color-gray-200)',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-primary)',
            fontSize: 15,
            fontWeight: 400,
            color: 'var(--color-red)',
          }}
        >
          Sign Out
        </span>
      </div>

      {/* Flex spacer to push tabbar down */}
      <div style={{ flex: 1 }} />
    </div>
  );
}
