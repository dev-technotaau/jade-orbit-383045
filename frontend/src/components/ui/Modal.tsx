'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Tooltip from './Tooltip';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  className?: string;
}

const sizeStyles: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]',
};

function Modal({ isOpen, onClose, title, children, footer, size = 'md', className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = title ? 'modal-title' : undefined;

  // Store latest callbacks in refs so the keydown listener always calls the
  // current version without needing to re-attach (which would re-focus the
  // dialog container and steal focus from inputs inside the modal).
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    const onKeyDown = (e: KeyboardEvent) => {
      // Escape
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      // Focus trap
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
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    // Focus the dialog only on initial open
    requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      // Restore focus on close
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    };
  }, [isOpen]);

  if (typeof window === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            // `overflow-hidden` is required so child content
            // (gradient heros, bleed strips with negative margins, the
            // built-in absolute-positioned close button) respects the
            // rounded-xl corner clip. Without it, inner blocks that
            // overshoot via `-mx-*` / `-mb-*` paint past the rounded
            // boundary and produce visible square corners.
            // The inner scroll container still has its own
            // `overflow-y-auto`, so scrolling inside the modal works
            // independently of this clip.
            className={cn(
              'relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-xl bg-white shadow-[var(--shadow-xl)] outline-none',
              sizeStyles[size],
              className,
            )}
          >
            {title && (
              <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
                <h2 id={titleId} className="text-lg font-semibold text-[var(--text)]">
                  {title}
                </h2>
                <Tooltip content="Close dialog">
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </Tooltip>
              </div>
            )}
            {!title && (
              <Tooltip content="Close dialog">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="absolute top-4 right-4 z-10 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </Tooltip>
            )}
            <div data-lenis-prevent className="flex-1 overflow-y-auto overscroll-contain px-6 py-4">
              {children}
            </div>
            {footer && <div className="border-t border-[var(--border)] px-6 py-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

Modal.displayName = 'Modal';

export default Modal;
