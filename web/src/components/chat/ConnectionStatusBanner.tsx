import type { ConnectionStatus } from '@/types/chat';

interface ConnectionStatusBannerProps {
  connectionStatus: ConnectionStatus;
}

const ConnectionStatusBanner = ({ connectionStatus }: ConnectionStatusBannerProps) => {
  const isConnecting = connectionStatus === 'connecting' || connectionStatus === 'reconnecting';
  const isDisconnected = connectionStatus === 'disconnected';

  if (!isConnecting && !isDisconnected) {
    return null;
  }

  return (
    <div
      style={{
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: 13,
        fontFamily: 'var(--font-primary)',
        color: isDisconnected ? 'var(--color-red-dark)' : 'var(--color-gray-800)',
        background: isDisconnected ? 'var(--color-red-bg)' : 'var(--color-amber-bg)',
        flexShrink: 0,
      }}
    >
      {connectionStatus === 'connecting' && 'Connecting...'}
      {connectionStatus === 'reconnecting' && 'Reconnecting...'}
      {connectionStatus === 'disconnected' && 'Disconnected. Please refresh to reconnect.'}
    </div>
  );
};

export default ConnectionStatusBanner;
