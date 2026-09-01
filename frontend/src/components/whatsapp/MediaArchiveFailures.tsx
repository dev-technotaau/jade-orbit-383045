'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { showToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaFailedMediaArchive } from '@/types/whatsapp';

/**
 * Inbound files whose durable archive gave up.
 *
 * This is the operator's only sight of a failure that is otherwise silent and
 * permanent: the worker logged a line, nothing else recorded it, and the loss
 * surfaced weeks later as a customer's photo that simply would not load. A
 * retry still recovers the file while Meta's own ~30-day copy exists, which is
 * exactly the window this panel makes visible — after it, `recoverable` is false
 * and the row is there to be acknowledged rather than fixed.
 *
 * Renders nothing at all when there is nothing wrong: a permanently empty card
 * on the settings page is noise that trains people to ignore the section.
 */
export default function MediaArchiveFailures() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['wa-media-failed'],
    queryFn: () => svc.listFailedMedia(50),
    // Cheap, indexed and rarely non-empty — but it must not go stale while an
    // operator is working through the list.
    refetchInterval: 60_000,
  });
  const items: WaFailedMediaArchive[] = data?.data?.items ?? [];

  const retryMut = useMutation({
    mutationFn: (messageId: string) => svc.retryFailedMedia(messageId),
    onSuccess: () => {
      showToast.success('Re-queued — the file will be archived if Meta still has it');
      void qc.invalidateQueries({ queryKey: ['wa-media-failed'] });
    },
    onError: (e) => showToast.error(errorMessage(e, 'Retry failed')),
  });

  if (isLoading || items.length === 0) return null;

  return (
    <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">
            Media that could not be archived ({items.length})
          </h2>
          <p className="mt-0.5 text-xs text-amber-800">
            These inbound files were never copied to durable storage. WhatsApp keeps its own copy
            for about 30 days — after that they are gone. Retrying is only useful inside that
            window.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead className="text-[var(--text-muted)]">
            <tr>
              <th className="px-2 py-1 font-medium">Received</th>
              <th className="px-2 py-1 font-medium">From</th>
              <th className="px-2 py-1 font-medium">Type</th>
              <th className="px-2 py-1 font-medium" />
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-t border-amber-200/70">
                <td className="px-2 py-1.5 whitespace-nowrap text-[var(--text-secondary)]">
                  {new Date(row.createdAt).toLocaleString()}
                </td>
                <td className="px-2 py-1.5 text-[var(--text-secondary)]">
                  {row.contact?.name || row.contact?.phone || '—'}
                </td>
                <td className="px-2 py-1.5 text-[var(--text-secondary)]">
                  {row.type.toLowerCase()}
                  {row.mediaMime ? ` · ${row.mediaMime}` : ''}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {row.recoverable ? (
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={
                        retryMut.isPending && retryMut.variables === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )
                      }
                      disabled={retryMut.isPending}
                      onClick={() => retryMut.mutate(row.id)}
                    >
                      Retry
                    </Button>
                  ) : (
                    <span className="text-[var(--text-muted)]">Past Meta&apos;s 30-day window</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
