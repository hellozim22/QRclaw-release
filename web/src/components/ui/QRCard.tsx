'use client';

import { QrCode } from 'lucide-react';

interface QRCardProps {
  qrImageSrc?: string;
  agentName: string;
  agentDescription?: string;
  size?: number;
}

const QRCard = ({ qrImageSrc, agentName, agentDescription, size = 200 }: QRCardProps) => {
  const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-4)',
    padding: 'var(--space-6)',
    background: 'var(--color-white)',
    borderRadius: 'var(--radius-xl)',
    boxShadow: 'var(--shadow-card)',
    border: '1px solid var(--color-gray-border)',
  };

  const qrContainerStyle: React.CSSProperties = {
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--color-white)',
    borderRadius: 'var(--radius-md)',
  };

  const nameStyle: React.CSSProperties = {
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--color-gray-800)',
    textAlign: 'center',
  };

  const descStyle: React.CSSProperties = {
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-md)',
    fontWeight: 'var(--font-normal)',
    color: 'var(--color-gray-500)',
    textAlign: 'center',
  };

  return (
    <div style={cardStyle}>
      <div style={qrContainerStyle}>
        {qrImageSrc ? (
          <img
            src={qrImageSrc}
            alt={`QR code for ${agentName}`}
            style={{ width: size, height: size, borderRadius: 'var(--radius-md)' }}
          />
        ) : (
          <QrCode size={size * 0.6} color="var(--color-gray-300)" />
        )}
      </div>
      <span style={nameStyle}>{agentName}</span>
      {agentDescription && <span style={descStyle}>{agentDescription}</span>}
    </div>
  );
};

export default QRCard;
