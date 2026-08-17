'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Trash2, FileText, MessageSquareText, Paperclip } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaScheduledMessage } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Scheduled (send-later) messages for a conversation, with cancel buttons. */
export default function ScheduledMessagesPanel({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const scheduledQuery = useQuery({
    queryKey: ['wa-scheduled', conversationId],
    queryFn: () => svc.listScheduled(conversationId),
  });
  const all = scheduledQuery.data?.data ?? [];
  // Only the still-pending ones are actionable; show those.
  const pending: WaScheduledMessage[] = all.filter((m) => m.status === 'PENDING');

  const cancelMut = useMutation({
    mutationFn: (msgId: string) => svc.cancelScheduled(conversationId, msgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-scheduled', conversationId] }),
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to cancel'),
  });

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
        <CalendarClock className="h-3.5 w-3.5" /> Scheduled messages
      </p>
      <div className="space-y-2">
        {scheduledQuery.isLoading && (
          <p className="text-[11px] text-[var(--text-muted)]">Loading scheduled…</p>
        )}
        {!scheduledQuery.isLoading && pending.length === 0 && (
          <p className="text-[11px] text-[var(--text-muted)]">Nothing scheduled.</p>
        )}
        {pending.map((m) => (
          <div
            key={m.id}
            className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-[11px] font-medium text-[var(--text)]">
                {m.kind === 'template' ? (
                  <FileText className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
                ) : m.kind === 'media' ? (
                  <Paperclip className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
                ) : (
                  <MessageSquareText className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
                )}
                <span className="truncate">
                  {m.kind === 'template'
                    ? 'Template message'
                    : m.kind === 'media'
                      ? m.caption || m.mediaFilename || 'File'
                      : m.text || 'Text message'}
                </span>
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                Sends {fmtDateTime(m.sendAt)}
              </p>
            </div>
            <Tooltip content="Cancel scheduled message" className="shrink-0">
              <button
                type="button"
                onClick={() => cancelMut.mutate(m.id)}
                disabled={cancelMut.isPending}
                className="text-[var(--text-muted)] transition-colors hover:text-[var(--error)] disabled:opacity-50"
                aria-label="Cancel scheduled message"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>
        ))}
      </div>
    </div>
  );
}
