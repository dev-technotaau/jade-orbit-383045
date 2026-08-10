'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Accessible backdrop for a hand-rolled dialog.
 *
 * Seven dialogs in this app render their own `<div className="fixed inset-0 z-50
 * … bg-black/40">` overlay: the two contacts-page modals, the templates-page
 * modal, TemplateComposeModal, ContactComposeModal, InboxComposerTools'
 * interactive-message modal and TemplateBuilder. None of them had `role`,
 * `aria-modal`, an Escape handler, a focus trap, focus restore, a scroll lock,
 * or a click-away — so a keyboard user tabbed straight out of the dialog into
 * the page behind it, Escape did nothing, and the background scrolled.
 *
 * `components/ui/Modal.tsx` implements all of that correctly, but it also owns
 * the header and footer chrome, so adopting it means restructuring each
 * dialog's JSX. This provides the same behaviour around markup that is left
 * exactly as it is — the surrounding element is the only thing that changes.
 *
 * For NEW dialogs, prefer `<Modal>`.
 */
export default function DialogShell({
  onClose,
  children,
  labelledBy,
  label,
  className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4',
}: {
  /** Escape, backdrop click, and the dialog's own close control all use this. */
  onClose: () => void;
  children: ReactNode;
  /** id of the element naming this dialog (usually its <h2>). */
  labelledBy?: string;
  /** Fallback accessible name when there is no visible heading to point at. */
  label?: string;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => dialogRef.current?.focus());

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, []);

  return (
    <div
      className={className}
      // Click-away, but only on the backdrop itself — a click that started
      // inside the panel and drifted out (selecting text) must not close it.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        className="contents"
      >
        {children}
      </div>
    </div>
  );
}
