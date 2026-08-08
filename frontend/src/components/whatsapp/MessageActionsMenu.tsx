'use client';

import { useState } from 'react';
import { MoreVertical, Copy, Trash2, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import Tooltip from '@/components/ui/Tooltip';

/**
 * Per-message hover menu: Copy (text → clipboard), Select (enter multi-select),
 * and Delete for me (soft-delete from the inbox view). Shown on message bubbles
 * when not already in selection mode.
 */
export default function MessageActionsMenu({
  canCopy,
  onCopy,
  onDelete,
  onSelect,
  align = 'start',
}: {
  canCopy: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onSelect: () => void;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Tooltip content="More">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Message actions"
          aria-expanded={open}
          className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
      {open && (
        <>
          {/* Click-away backdrop */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div
            className={cn(
              'absolute bottom-7 z-30 w-40 overflow-hidden rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg',
              align === 'end' ? 'right-0' : 'left-0',
            )}
            role="menu"
          >
            {canCopy && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onCopy();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--bg-secondary)]"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--bg-secondary)]"
            >
              <CheckSquare className="h-3.5 w-3.5" /> Select
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--error)] hover:bg-[var(--bg-secondary)]"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete for me
            </button>
          </div>
        </>
      )}
    </div>
  );
}
