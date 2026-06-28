export const getQrCodeIdFromSearchParams = (searchParams: URLSearchParams): string | null => {
  const qrCodeId = searchParams.get('qr')?.trim();
  return qrCodeId ? qrCodeId : null;
};

const appendQrCodeId = (pathname: string, qrCodeId?: string | null): string => {
  if (!qrCodeId) {
    return pathname;
  }

  const params = new URLSearchParams({ qr: qrCodeId });
  return `${pathname}?${params.toString()}`;
};

export const buildAgentProfilePath = (agentId: string, qrCodeId?: string | null): string =>
  appendQrCodeId(`/agent/${agentId}`, qrCodeId);

export const buildChatPath = (agentId: string, qrCodeId?: string | null): string =>
  appendQrCodeId(`/chat/${agentId}`, qrCodeId);
