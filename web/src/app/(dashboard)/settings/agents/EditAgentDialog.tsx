'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Dialog from '@/components/ui/Dialog';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { updateAgent, friendlyAgentError, type UpdateAgentPatch } from '@/lib/api/agents';
import type { Agent } from '@/hooks/useAgents';

interface EditAgentDialogProps {
  open: boolean;
  agent: Agent | null;
  onClose: () => void;
  onUpdated: () => void;
}

const NAME_MAX = 255;
const DESCRIPTION_MAX = 2048;
const ACCOUNT_LABEL_MAX = 128;

const EditAgentDialog = ({ open, agent, onClose, onUpdated }: EditAgentDialogProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accountLabel, setAccountLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Prefill guard: we only want to seed local form state ONCE per open cycle.
  // If a parent-side refetch hands us a new `agent` reference while the dialog
  // is open, the user's in-flight edits would otherwise be clobbered.
  // Parent pairs this with `key={agent.id}` so switching between agents does
  // remount and re-prefill.
  const prefilledRef = useRef(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- prefill-once pattern: seed form from prop the first time the dialog opens; after that, user input wins. */
    if (!open) {
      prefilledRef.current = false;
      setError(null);
      setSubmitting(false);
      return;
    }
    if (!prefilledRef.current && agent) {
      setName(agent.name ?? '');
      setDescription(agent.description ?? '');
      setAccountLabel(agent.account_label ?? '');
      setError(null);
      setSubmitting(false);
      prefilledRef.current = true;
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, agent]);

  if (!agent) {
    return null;
  }

  const trimmedName = name.trim();
  const nameInvalid = trimmedName.length === 0 || trimmedName.length > NAME_MAX;
  const descriptionInvalid = description.length > DESCRIPTION_MAX;
  const accountLabelInvalid = accountLabel.length > ACCOUNT_LABEL_MAX;
  const disabled = nameInvalid || descriptionInvalid || accountLabelInvalid || submitting;

  const buildPatch = (): UpdateAgentPatch => {
    const patch: UpdateAgentPatch = {};
    if (trimmedName !== (agent.name ?? '')) {
      patch.name = trimmedName;
    }
    const newDescription = description;
    const currentDescription = agent.description ?? '';
    if (newDescription !== currentDescription) {
      patch.description = newDescription.length === 0 ? null : newDescription;
    }
    const newLabel = accountLabel.trim();
    const currentLabel = agent.account_label ?? '';
    if (newLabel !== currentLabel) {
      patch.account_label = newLabel.length === 0 ? null : newLabel;
    }
    return patch;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;

    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await updateAgent(agent.id, patch);
      onUpdated();
    } catch (err) {
      setError(friendlyAgentError(err));
      setSubmitting(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-md)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-gray-800)',
    marginBottom: 4,
  };

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 96,
    padding: '10px 12px',
    border: '1px solid var(--color-input-border)',
    borderRadius: 'var(--radius-md)',
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-md)',
    color: 'var(--color-gray-800)',
    resize: 'vertical',
    outline: 'none',
    background: 'var(--color-white)',
  };

  const counterStyle: React.CSSProperties = {
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-gray-500)',
    marginTop: 4,
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

  const fieldStyle: React.CSSProperties = {
    marginBottom: 14,
  };

  return (
    <Dialog open={open} onClose={submitting ? () => undefined : onClose} title="Edit Agent">
      <form onSubmit={handleSubmit}>
        {error && (
          <div style={errorStyle} role="alert">
            {error}
          </div>
        )}

        <div style={fieldStyle}>
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX}
            autoFocus
            disabled={submitting}
            aria-label="Agent name"
            error={
              trimmedName.length === 0
                ? 'Name cannot be empty'
                : trimmedName.length > NAME_MAX
                  ? `Name must be ${NAME_MAX} characters or fewer`
                  : undefined
            }
          />
        </div>

        <div style={fieldStyle}>
          <Input
            label="Account label"
            value={accountLabel}
            onChange={(e) => setAccountLabel(e.target.value)}
            maxLength={ACCOUNT_LABEL_MAX}
            placeholder="e.g. Production"
            disabled={submitting}
            aria-label="Account label"
            error={
              accountLabelInvalid ? `Must be ${ACCOUNT_LABEL_MAX} characters or fewer` : undefined
            }
          />
        </div>

        <div style={fieldStyle}>
          <label htmlFor="edit-agent-description" style={labelStyle}>
            Description
          </label>
          <textarea
            id="edit-agent-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX}
            disabled={submitting}
            placeholder="Optional — a short note about this agent"
            style={textareaStyle}
            aria-label="Agent description"
          />
          <div style={counterStyle}>
            {description.length} / {DESCRIPTION_MAX}
          </div>
        </div>

        <div style={buttonRowStyle}>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cancel edit"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={disabled}
            aria-label="Save agent changes"
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

export default EditAgentDialog;
