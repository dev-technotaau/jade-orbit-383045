'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Loader2, Forward, X } from 'lucide-react';
import DialogShell from '@/components/ui/DialogShell';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import { showToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaConversation } from '@/types/whatsapp';

/** What to call this contact — same precedence the inbox list uses. */
function label(c: WaConversation): string {
  return c.contact.name?.trim() || c.contact.profileName?.trim() || c.contact.phone;
}

/**
 * Pick conversations to forward the selected messages into.
 *
 * Passing a customer's photo or address to a colleague's thread previously meant
 * downloading it and re-attaching it by hand — for a file the customer had
 * already sent us.
 *
 * The modal is honest about the one thing that will stop a forward: each target
 * needs its own open 24-hour window. It does NOT offer to send a template
 * instead, because that would turn a free forward into a billed marketing
 * message to someone who did not ask for one. A closed window comes back as a
 * per-target failure and is reported by name.
 */
export default function ForwardModal({
  conversationId,
  messageIds,
  onClose,
  onDone,
}: {
  /** The thread the messages are being forwarded FROM. */
  conversationId: string;
  messageIds: string[];
  onClose: () => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(id);
  }, [q]);

  const listQuery = useQuery({
    queryKey: ['wa-forward-targets', debouncedQ],
    // Active threads only. Forwarding into an archived one is possible but is
    // never what a search for a colleague's thread meant, and it would put the
    // archive back in the queue as a side effect.
    queryFn: () => svc.listConversations({ q: debouncedQ, limit: 30 }),
  });
  // The source thread is filtered out here as well as server-side: offering it
  // and then silently dropping it reads as the forward having failed.
  const targets = (listQuery.data?.data?.items ?? []).filter((c) => c.id !== conversationId);

  const mutation = useMutation({
    mutationFn: () =>
      svc.forwardMessages(conversationId, {
        messageIds,
        toConversationIds: [...picked],
      }),
    onSuccess: (res) => {
      const results = res.data?.results ?? [];
      const ok = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);
      // Every target that accepted gets its thread refreshed, so switching to
      // one shows the forwarded message rather than a stale page.
      for (const r of ok) qc.invalidateQueries({ queryKey: ['wa-messages', r.conversationId] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });

      if (failed.length === 0) {
        showToast.success(
          `Forwarded to ${picked.size} conversation${picked.size === 1 ? '' : 's'}`,
        );
      } else if (ok.length === 0) {
        // One distinct reason is worth more than a count — usually every failure
        // in a batch shares it (a closed window, a blocked contact).
        showToast.error(failed[0].error || 'Could not forward');
      } else {
        showToast.info(
          `Forwarded ${ok.length}, ${failed.length} failed — ${failed[0].error ?? 'see the thread'}`,
        );
      }
      onDone?.();
      onClose();
    },
    onError: (e) => showToast.error(errorMessage(e, 'Could not forward')),
  });

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <DialogShell onClose={onClose} label="Forward messages">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col gap-3 rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">
            Forward {messageIds.length} message{messageIds.length === 1 ? '' : 's'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 hover:bg-[var(--bg-secondary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations…"
            aria-label="Search conversations to forward to"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] py-2 pr-3 pl-9 text-sm text-[var(--text)] outline-none focus:border-[var(--primary)]"
          />
        </div>

        <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--border)]">
          {listQuery.isLoading && (
            <p className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">Loading…</p>
          )}
          {!listQuery.isLoading && targets.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">
              No other conversations match.
            </p>
          )}
          {targets.map((c) => (
            <label
              key={c.id}
              className={cn(
                'flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-[var(--bg-secondary)]',
                picked.has(c.id) && 'bg-[var(--bg-secondary)]',
              )}
            >
              <input
                type="checkbox"
                checked={picked.has(c.id)}
                onChange={() => toggle(c.id)}
                aria-label={`Forward to ${label(c)}`}
              />
              <Avatar firstName={label(c)} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-[var(--text)]">
                  {label(c)}
                </span>
                <span className="block truncate text-[11px] text-[var(--text-muted)]">
                  {c.contact.phone}
                </span>
              </span>
            </label>
          ))}
        </div>

        <p className="text-[11px] text-[var(--text-muted)]">
          Each conversation needs its own open 24-hour reply window. Any that are closed are
          reported back — a forward is never converted into a paid template send.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={picked.size === 0 || mutation.isPending}
            leftIcon={
              mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Forward className="h-4 w-4" />
              )
            }
          >
            Forward{picked.size > 0 ? ` (${picked.size})` : ''}
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
