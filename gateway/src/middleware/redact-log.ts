type LogLevel = 'info' | 'warn' | 'error';

const FORBIDDEN_KEYS = new Set([
  'authorization',
  'bearer',
  'content',
  'dek',
  'delta',
  'encrypted_dek',
  'file_url',
  'final_message',
  'image_url',
  'instructions',
  'jwt',
  'kek',
  'messages',
  'prompt',
  'raw_dek',
  'signed_url',
]);

const ALLOWED_METADATA = new Set([
  'agent_id',
  'bytes',
  'conversation_id',
  'duration_ms',
  'err_code',
  'err_message',
  'event_type',
  'host_id',
  'owner_id',
  'provider',
  'run_id',
  'seq',
  'status',
  'user_id',
]);

const sanitizeMeta = (meta: Record<string, unknown>): Record<string, unknown> => {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    const normalizedKey = key.toLowerCase();
    if (FORBIDDEN_KEYS.has(normalizedKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (ALLOWED_METADATA.has(normalizedKey)) {
      sanitized[key] = value;
    } else {
      sanitized[key] = typeof value === 'string' ? `[len=${value.length}]` : '[scalar]';
    }
  }
  return sanitized;
};

export const safeLog = (
  level: LogLevel,
  message: string,
  meta: Record<string, unknown> = {}
): void => {
  const payload = sanitizeMeta(meta);
  if (level === 'error') {
    console.error(message, payload);
  } else if (level === 'warn') {
    console.warn(message, payload);
  } else {
    console.log(message, payload);
  }
};
