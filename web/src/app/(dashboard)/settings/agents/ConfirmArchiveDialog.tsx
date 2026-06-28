'use client';

import { useEffect, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import { archiveAgent, friendlyAgentError } from '@/lib/api/agents';

interface ConfirmArchiveDialogProps {
  open: boolean;
  agentId: string | null;
  agentName: string;
  onClose: () => void;
  onArchived: () => void;
}

const ConfirmArchiveDialog = ({
  open,
  agentId,
  agentName,
  onClose,
  onArchived,
}: ConfirmArchiveDialogProps) => {
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
      await archiveAgent(agentId);
      onArchived();
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
      title={`Archive "${agentName}"?`}
    >
      <p style={bodyStyle}>
        The agent will be hidden, existing QR codes will stop working, and the API key will be
        revoked immediately. This cannot be undone from the dashboard.
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
          aria-label="Cancel archive"
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={handleConfirm}
          disabled={submitting}
          aria-label={`Archive ${agentName}`}
        >
          {submitting ? 'Archiving…' : 'Archive'}
        </Button>
      </div>
    </Dialog>
  );
};

export default ConfirmArchiveDialog;
