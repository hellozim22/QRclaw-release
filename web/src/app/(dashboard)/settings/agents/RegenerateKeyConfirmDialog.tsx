'use client';

import { useEffect, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import { regenerateAgentKey, friendlyAgentError, type RegeneratedKey } from '@/lib/api/agents';

interface RegenerateKeyConfirmDialogProps {
  open: boolean;
  agentId: string | null;
  agentName: string;
  onClose: () => void;
  onRegenerated: (regenerated: RegeneratedKey) => void;
}

const RegenerateKeyConfirmDialog = ({
  open,
  agentId,
  agentName,
  onClose,
  onRegenerated,
}: RegenerateKeyConfirmDialogProps) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient state on close.
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  if (!agentId) {
    return null;
  }

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await regenerateAgentKey(agentId);
      onRegenerated(result);
    } catch (err) {
      setError(friendlyAgentError(err));
      setSubmitting(false);
    }
  };

  const bodyStyle: React.CSSProperties = {
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-md)',
    color: 'var(--color-gray-700)',
    lineHeight: 1.55,
    marginBottom: 16,
  };

  const errorStyle: React.CSSProperties = {
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-red-bg)',
    color: 'var(--color-red)',
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-base)',
    marginBottom: 12,
  };

  const buttonRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
  };

  return (
    <Dialog
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title={`Regenerate API key for "${agentName}"?`}
    >
      <p style={bodyStyle}>
        The current API key will stop working immediately. The new key will be shown exactly once —
        you&apos;ll need to update your OpenClaw plugin with the new value.
      </p>

      {error && (
        <div style={errorStyle} role="alert">
          {error}
        </div>
      )}

      <div style={buttonRowStyle}>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={onClose}
          disabled={submitting}
          aria-label="Cancel key regeneration"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={handleConfirm}
          disabled={submitting}
          aria-label={`Regenerate API key for ${agentName}`}
        >
          {submitting ? 'Regenerating…' : 'Regenerate key'}
        </Button>
      </div>
    </Dialog>
  );
};

export default RegenerateKeyConfirmDialog;
