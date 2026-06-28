'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Copy, Check } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';

interface ApiKeyRevealDialogProps {
  open: boolean;
  agentName: string;
  apiKey: string;
  title?: string;
  onClose: () => void;
}

/**
 * One-time API key reveal dialog.
 *
 * - Displays the plaintext key in monospace.
 * - Requires the user to tick "I've copied it" before the Close button enables.
 * - Copy button writes via navigator.clipboard.writeText and shows a "Copied!"
 *   visual pulse. The key is never written to URL / localStorage / console.
 * - Overlay/ESC close is disabled so the user must actively acknowledge.
 */
const ApiKeyRevealDialog = ({
  open,
  agentName,
  apiKey,
  title = 'Save your API key',
  onClose,
}: ApiKeyRevealDialogProps) => {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  // Track the active "Copied!" timeout so (a) we clear it on unmount and
  // (b) rapid repeated clicks cancel the previous timer instead of racing.
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient UI state when dialog closes; hidden dialog renders null so no cascading render.
      setCopied(false);
      setAcknowledged(false);
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
        copiedTimeoutRef.current = null;
      }
    }
  }, [open]);

  useEffect(
    () => () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
        copiedTimeoutRef.current = null;
      }
    },
    []
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copiedTimeoutRef.current = null;
      }, 2000);
    } catch {
      setCopied(false);
    }
  };

  const bannerStyle: React.CSSProperties = {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-red-bg)',
    border: '1px solid var(--color-red)',
    color: 'var(--color-red)',
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-base)',
    lineHeight: 1.5,
    marginBottom: 16,
  };

  const subtitleStyle: React.CSSProperties = {
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-gray-700)',
    marginBottom: 12,
  };

  const keyBoxStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-input-border)',
    background: 'var(--color-off-white)',
    marginBottom: 12,
  };

  const keyValueStyle: React.CSSProperties = {
    flex: 1,
    fontFamily: 'var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 'var(--text-md)',
    fontWeight: 'var(--font-medium)',
    color: 'var(--color-gray-800)',
    wordBreak: 'break-all',
  };

  const copyBtnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-gray-border)',
    background: copied ? 'var(--color-green-bg)' : 'var(--color-white)',
    color: copied ? 'var(--color-green-text)' : 'var(--color-gray-800)',
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--font-medium)',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.15s ease, color 0.15s ease',
  };

  const checkboxRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '12px 0 16px',
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-gray-800)',
    cursor: 'pointer',
    userSelect: 'none',
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      closeOnOverlay={false}
      closeOnEsc={false}
      hideCloseButton
    >
      <div style={bannerStyle} role="alert">
        <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        <span>
          This API key will never be shown again. Save it in your OpenClaw plugin config before
          closing this dialog.
        </span>
      </div>

      <div style={subtitleStyle}>
        Paste this key into the OpenClaw plugin for <strong>{agentName}</strong>.
      </div>

      <div style={keyBoxStyle}>
        <code style={keyValueStyle} aria-label={`API key for ${agentName}`}>
          {apiKey}
        </code>
        <button
          type="button"
          style={copyBtnStyle}
          onClick={handleCopy}
          aria-label={copied ? 'API key copied' : 'Copy API key to clipboard'}
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          <span aria-live="polite">{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>

      <label style={checkboxRowStyle}>
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          style={{ marginTop: 3 }}
          aria-label="Confirm you have saved the API key"
        />
        <span>I have saved this API key. I understand it will not be shown again.</span>
      </label>

      <Button
        variant="primary"
        size="md"
        onClick={onClose}
        disabled={!acknowledged}
        aria-label="Close dialog"
      >
        I&apos;ve saved it, close
      </Button>
    </Dialog>
  );
};

export default ApiKeyRevealDialog;
