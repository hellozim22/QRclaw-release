'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Dialog from '@/components/ui/Dialog';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { createAgent, friendlyAgentError, type CreatedAgent } from '@/lib/api/agents';

interface CreateAgentDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (created: CreatedAgent) => void;
}

const NAME_MAX = 255;

const CreateAgentDialog = ({ open, onClose, onCreated }: CreateAgentDialogProps) => {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient form state when dialog closes; hidden dialog renders null so no cascading render.
      setName('');
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const trimmed = name.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= NAME_MAX;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createAgent(trimmed);
      onCreated(created);
    } catch (err) {
      setError(friendlyAgentError(err));
      setSubmitting(false);
    }
  };

  const hintStyle: React.CSSProperties = {
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-gray-600)',
    marginBottom: 16,
    lineHeight: 1.5,
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
    marginTop: 16,
  };

  return (
    <Dialog open={open} onClose={submitting ? () => undefined : onClose} title="New Agent">
      <form onSubmit={handleSubmit}>
        <p style={hintStyle}>
          Give your agent a name. After creation you&apos;ll see a one-time API key to wire up in
          your OpenClaw plugin.
        </p>

        {error && (
          <div style={errorStyle} role="alert">
            {error}
          </div>
        )}

        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          placeholder="e.g. Support Bot"
          autoFocus
          disabled={submitting}
          aria-label="Agent name"
          error={
            trimmed.length > NAME_MAX ? `Name must be ${NAME_MAX} characters or fewer` : undefined
          }
        />

        <div style={buttonRowStyle}>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cancel"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!isValid || submitting}
            aria-label="Create agent"
          >
            {submitting ? 'Creating…' : 'Create agent'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

export default CreateAgentDialog;
