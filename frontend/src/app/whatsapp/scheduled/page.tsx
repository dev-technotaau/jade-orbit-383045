'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  CalendarClock,
  FileText,
  MessageSquareText,
  Paperclip,
  Trash2,
  AlertTriangle,
  X,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Pagination from '@/components/ui/Pagination';
import Spinner from '@/components/ui/Spinner';
import { showToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api';
import { confirmDialog } from '@/components/ui/dialog-service';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaScheduledMessageStatus, WaScheduledMessageWithContact } from '@/types/whatsapp';

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'SENT', label: 'Sent' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const STATUS_STYLE: Record<WaScheduledMessageStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  SENT: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Contact label, falling back to the number when we have no profile name. */
function recipient(row: WaScheduledMessageWithContact): string {
  if (!row.contact) return 'Unknown contact';
  return row.contact.name || row.contact.phone;
}

/** The one-line preview of what will actually be sent. */
function preview(row: WaScheduledMessageWithContact): string {
  if (row.kind === 'template') return row.templateId ? 'Template message' : 'Template (unset)';
  // A file row carries no `text` — without this it read as an empty "Text
  // message" and the operator could not tell what was about to go out.
  if (row.kind === 'media') {
    return row.caption?.trim() || row.mediaFilename || 'File';
  }
  return row.text?.trim() || 'Text message';
}

/**
 * The global send-later queue.
 *
 * Scheduled messages were only ever visible inside the conversation that created
 * one, so an operator who queued twelve follow-ups across twelve threads on a
 * Friday had no screen that showed those twelve pending sends: nothing to audit
 * before a holiday, no way to cancel a batch, and a FAILED one was invisible
 * unless they happened to reopen that thread and expand its details panel.
 */
export default function WhatsappScheduledPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['wa-scheduled-all', status, from, to, page, limit],
    queryFn: () =>
      svc.listAllScheduled({
        status: (status as WaScheduledMessageStatus) || undefined,
        // Date inputs are day-precision; widen them to cover the whole day so a
        // message queued for 18:00 is not filtered out by a `to` of that date.
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        page,
        limit,
      }),
    // Pending rows leave the queue on their own as the dispatch cron fires.
    refetchInterval: 60_000,
  });

  const rows = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = data?.data?.totalPages ?? 1;
  const filtersActive = !!status || !!from || !!to;

  const cancelMut = useMutation({
    mutationFn: (row: WaScheduledMessageWithContact) =>
      svc.cancelScheduled(row.conversationId, row.id),
    onSuccess: () => {
      showToast.success('Scheduled message cancelled');
      qc.invalidateQueries({ queryKey: ['wa-scheduled-all'] });
      qc.invalidateQueries({ queryKey: ['wa-scheduled'] });
    },
    onError: (e) => showToast.error(errorMessage(e, 'Could not cancel')),
  });

  const confirmCancel = async (row: WaScheduledMessageWithContact) => {
    const ok = await confirmDialog({
      title: `Cancel the message to ${recipient(row)}?`,
      message: `It is due to send ${fmtDateTime(row.sendAt)}. Cancelling cannot be undone — the message would have to be scheduled again.`,
      confirmLabel: 'Cancel message',
      variant: 'danger',
    });
    if (ok) cancelMut.mutate(row);
  };

  const clearFilters = () => {
    setStatus('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']}>
      <div className="space-y-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
            <CalendarClock className="h-6 w-6 text-emerald-600" /> Scheduled messages
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Everything queued to send later, across every conversation. Pending rows leave this list
            as the dispatcher sends them; a failure stays here with its reason.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-white p-3">
          <div className="w-48">
            <Select
              label="Status"
              options={STATUS_OPTIONS}
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              clearable={false}
            />
          </div>
          <Input
            type="date"
            label="Sends from"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <Input
            type="date"
            label="Sends until"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-primary inline-flex h-10 items-center gap-1 text-xs hover:underline"
            >
              <X className="h-3 w-3" aria-hidden="true" /> Clear filters
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          {isLoading && (
            <div className="flex justify-center p-10">
              <Spinner />
            </div>
          )}

          {!isLoading && isError && (
            <div className="p-8 text-center">
              <p className="text-sm text-[var(--error)]">Could not load scheduled messages.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          )}

          {!isLoading && !isError && rows.length === 0 && (
            <p className="p-8 text-center text-sm text-[var(--text-muted)]">
              {filtersActive
                ? 'No scheduled messages match these filters.'
                : 'Nothing is scheduled. Use “Send later” in a conversation to queue one.'}
            </p>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Scheduled messages, soonest send time first</caption>
                <thead className="bg-[var(--bg-secondary)] text-left text-xs text-[var(--text-muted)]">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Sends
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Recipient
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Message
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {rows.map((row) => (
                    <tr key={row.id} className="align-top hover:bg-[var(--bg-secondary)]">
                      <td className="px-4 py-2 whitespace-nowrap text-[var(--text-secondary)]">
                        {fmtDateTime(row.sendAt)}
                      </td>
                      <td className="px-4 py-2">
                        {/* Straight into the thread it belongs to — auditing a
                            queue is only useful if the conversation behind a row
                            is one click away. */}
                        <Link
                          href={ROUTES.SUPER_ADMIN.WHATSAPP_CONVERSATION(row.conversationId)}
                          className="text-primary hover:underline"
                        >
                          {recipient(row)}
                        </Link>
                        {row.contact?.name && (
                          <p className="text-xs text-[var(--text-muted)]">{row.contact.phone}</p>
                        )}
                      </td>
                      <td className="max-w-md px-4 py-2 text-[var(--text)]">
                        <span className="flex items-start gap-1.5">
                          {row.kind === 'template' ? (
                            <FileText
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
                              aria-hidden="true"
                            />
                          ) : row.kind === 'media' ? (
                            <Paperclip
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
                              aria-hidden="true"
                            />
                          ) : (
                            <MessageSquareText
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
                              aria-hidden="true"
                            />
                          )}
                          <span className="line-clamp-2">{preview(row)}</span>
                        </span>
                        {row.error && (
                          <span className="mt-1 flex items-start gap-1 text-xs text-red-700">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                            {row.error}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            STATUS_STYLE[row.status],
                          )}
                        >
                          {row.status}
                        </span>
                        {row.status === 'SENT' && row.sentAt && (
                          <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                            {fmtDateTime(row.sentAt)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {/* Only a PENDING row can be cancelled — the API refuses
                            anything else, so offering the button would be a lie. */}
                        {row.status === 'PENDING' && (
                          <button
                            type="button"
                            onClick={() => void confirmCancel(row)}
                            disabled={cancelMut.isPending}
                            aria-label={`Cancel the message to ${recipient(row)}`}
                            title="Cancel scheduled message"
                            className="rounded-md p-2 text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--error)] disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 && (
            <div className="px-4 py-3">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={total}
                pageSize={limit}
                onPageSizeChange={(n) => {
                  setLimit(n);
                  setPage(1);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
