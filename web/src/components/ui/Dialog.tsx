'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Max width of the dialog card. Default 480px. */
  maxWidth?: number;
  /** Clicking the overlay backdrop closes by default; pass false to disable. */
  closeOnOverlay?: boolean;
  /** ESC closes by default; pass false to disable. */
  closeOnEsc?: boolean;
  /** Hide the default close ("×") button in the header. */
  hideCloseButton?: boolean;
  /** Optional aria-label override for the close button. */
  closeAriaLabel?: string;
}

/**
 * Minimal modal dialog.
 *
 * - Rendered via createPortal into document.body so ancestor transforms /
 *   overflow:hidden cannot clip it, and z-index stacks above the rest of the
 *   app. SSR-safe: the portal is only mounted after first client render.
 * - body.overflow locked to 'hidden' while open; restored on close/unmount.
 * - ESC and overlay click close by default; both can be disabled via props.
 * - On open, focus jumps to the first interactive element inside the dialog
 *   (simple focus-trap substitute — assistive-tech can still tab out, but the
 *   initial focus target is correct for keyboard users). On close, focus is
 *   restored to whatever element had focus when the dialog opened.
 * - Effect only depends on `open`: onClose / closeOnEsc are read via refs so
 *   that parent re-renders don't rebind the keydown listener, re-focus the
 *   dialog, or double-lock body overflow.
 */
const Dialog = ({
  open,
  onClose,
  title,
  children,
  maxWidth = 480,
  closeOnOverlay = true,
  closeOnEsc = true,
  hideCloseButton = false,
  closeAriaLabel = 'Close dialog',
}: DialogProps) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeOnEscRef = useRef(closeOnEsc);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();

  // Keep refs in sync with the latest prop values, without retriggering
  // the main open-effect.
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    closeOnEscRef.current = closeOnEsc;
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client-only gate for SSR safety; value flips exactly once.
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Capture the element that had focus before opening so we can restore it
    // on close (WAI-ARIA best practice for dialogs).
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handleKey = (event: KeyboardEvent) => {
      if (closeOnEscRef.current && event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKey);

    const focusFirst = () => {
      const card = cardRef.current;
      if (!card) return;
      const focusable = card.querySelector<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    };
    const raf = window.requestAnimationFrame(focusFirst);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
      window.cancelAnimationFrame(raf);
      // Best-effort focus restoration. If the previously focused element was
      // unmounted during the dialog's lifetime, focus silently stays put.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try {
          previouslyFocused.focus();
        } catch {
          /* ignore — focus target may be detached */
        }
      }
    };
  }, [open]);

  if (!open || !mounted) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(26, 26, 26, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-4)',
    zIndex: 1000,
  };

  const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth,
    maxHeight: 'calc(100vh - 48px)',
    overflowY: 'auto',
    background: 'var(--color-white)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 20px 48px rgba(0, 0, 0, 0.18)',
    display: 'flex',
    flexDirection: 'column',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-3)',
    padding: '20px 24px 12px',
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontFamily: 'var(--font-primary)',
    fontSize: 'var(--text-2xl)',
    fontWeight: 'var(--font-semibold)',
    color: 'var(--color-gray-800)',
    lineHeight: 1.3,
  };

  const closeBtnStyle: React.CSSProperties = {
    border: 'none',
    background: 'transparent',
    padding: 4,
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    color: 'var(--color-gray-600)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const bodyStyle: React.CSSProperties = {
    padding: '0 24px 24px',
  };

  const overlay = (
    <div style={overlayStyle} onClick={closeOnOverlay ? onClose : undefined}>
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
          <h2 id={titleId} style={titleStyle}>
            {title}
          </h2>
          {!hideCloseButton && (
            <button
              type="button"
              aria-label={closeAriaLabel}
              onClick={onClose}
              style={closeBtnStyle}
            >
              <X size={20} />
            </button>
          )}
        </div>
        <div style={bodyStyle}>{children}</div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};

export default Dialog;
