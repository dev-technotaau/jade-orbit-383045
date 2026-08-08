'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { superAdminWhatsappService as svc } from '@/services/super-admin-whatsapp.service';
import type { ApiError } from '@/types/api';
import type { WaReaction } from '@/types/whatsapp';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '✅'];

/**
 * Reaction chips shown under a message bubble. Renders both sides' reactions
 * (ours = `side: 'out'`, the customer's = `side: 'in'`) and, on click, opens a
 * popover that shows who reacted with what and — for our reaction — lets us
 * change it (pick a different emoji) or remove it. Reacting/removing calls
 * `svc.sendReaction` (empty emoji removes); the thread refetches on success and
 * also via the live `wa:reaction` socket event.
 */
export default function MessageReactions({
  conversationId,
  wamid,
  reactions,
  contactName,
  align = 'start',
}: {
  conversationId: string;
  wamid: string;
  reactions: WaReaction[];
  contactName: string;
  align?: 'start' | 'end';
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ours = reactions.find((r) => r.side === 'out');

  const reactMut = useMutation({
    mutationFn: (emoji: string) => svc.sendReaction(conversationId, wamid, emoji),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-messages', conversationId] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to react'),
  });

  if (reactions.length === 0) return null;

  const reactorLabel = (r: WaReaction) =>
    r.side === 'out' ? r.byName || 'You' : contactName || 'Customer';

  return (
    <div className={cn('relative -mt-1', align === 'end' ? 'self-end' : 'self-start')}>
      <Tooltip content="Reactions">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="View reactions"
          aria-expanded={open}
          className="inline-flex items-center gap-0.5 rounded-full bg-white px-1.5 py-0.5 text-xs shadow-sm ring-1 ring-[var(--border)] transition hover:ring-[var(--primary)]"
        >
          {reactions.map((r, i) => (
            <span key={`${r.side}-${i}`}>{r.emoji}</span>
          ))}
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
              'absolute bottom-7 z-30 w-56 rounded-xl border border-[var(--border)] bg-white p-2 shadow-lg',
              align === 'end' ? 'right-0' : 'left-0',
            )}
            role="dialog"
            aria-label="Reactions"
          >
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">Reactions</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {/* Who reacted with what */}
            <ul className="mb-2 space-y-1">
              {reactions.map((r, i) => (
                <li
                  key={`row-${r.side}-${i}`}
                  className="flex items-center gap-2 rounded-md px-1 py-0.5 text-xs"
                >
                  <span className="text-base leading-none">{r.emoji}</span>
                  <span className="truncate text-[var(--text)]">{reactorLabel(r)}</span>
                  {r.side === 'out' && (
                    <span className="ml-auto text-[10px] text-[var(--text-muted)]">you</span>
                  )}
                </li>
              ))}
            </ul>

            {/* Add / change / remove our reaction */}
            <div className="border-t border-[var(--border)] pt-2">
              <p className="mb-1 px-1 text-[10px] font-medium text-[var(--text-muted)]">
                {ours ? 'Change your reaction' : 'Add your reaction'}
              </p>
              <div className="flex flex-wrap items-center gap-0.5 px-1">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => reactMut.mutate(emoji)}
                    disabled={reactMut.isPending}
                    aria-label={`React ${emoji}`}
                    className={cn(
                      'rounded-full px-1 text-base leading-none transition-transform hover:scale-125 disabled:opacity-50',
                      ours?.emoji === emoji && 'bg-[var(--primary-light)]',
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              {ours && (
                <button
                  type="button"
                  onClick={() => reactMut.mutate('')}
                  disabled={reactMut.isPending}
                  className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--error)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                >
                  {reactMut.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <X className="h-3 w-3" />
                  )}
                  Remove your reaction
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
