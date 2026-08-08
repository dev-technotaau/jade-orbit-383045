import { toast } from 'sonner';
import type { QueryClient } from '@tanstack/react-query';
import { superAdminEmailService as svc } from '@/services/super-admin-email.service';
import type { BulkActionResult } from '@/types/email';

/**
 * Client-side handling of a bulk-action response. Three shapes, one entry point:
 *  - `{ async, jobId }`  → a background job: show a live progress toast (polled).
 *  - `{ undoToken }`     → a destructive op: show a success toast with an Undo action.
 *  - otherwise           → a plain synchronous count toast.
 *
 * Pages just call `handleBulkResult(res.data, { qc, label })` after any bulk
 * mutation and clear their own selection — progress + undo are automatic.
 */

/** Refresh every email list query (broad but correct after a cross-entity bulk op). */
export function invalidateEmailQueries(qc: QueryClient): void {
  qc.invalidateQueries({
    predicate: (q) =>
      typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('email'),
  });
}

function countOf(d: BulkActionResult): number {
  return d.affected ?? d.deleted ?? d.updated ?? d.removed ?? d.resubscribed ?? d.created ?? 0;
}

const POLL_MS = 1000;
const POLL_WINDOW_MS = 10 * 60 * 1000;

function pollJob(jobId: string, qc: QueryClient, label: string): void {
  const started = Date.now();
  const tick = async (): Promise<void> => {
    try {
      const job = (await svc.getBulkJob(jobId)).data;
      if (!job) return;
      if (job.status === 'COMPLETED') {
        toast.success(
          `${label} — ${job.succeeded.toLocaleString()} done${job.failed ? `, ${job.failed} failed` : ''}`,
          { id: jobId, duration: 5000 },
        );
        invalidateEmailQueries(qc);
        return;
      }
      if (job.status === 'FAILED') {
        toast.error(`${label} failed${job.error ? `: ${job.error}` : ''}`, {
          id: jobId,
          duration: 6000,
        });
        invalidateEmailQueries(qc);
        return;
      }
      const pct = job.total ? Math.round((job.processed / job.total) * 100) : 0;
      toast.loading(
        `${label}… ${job.processed.toLocaleString()}/${job.total.toLocaleString()} (${pct}%)`,
        { id: jobId },
      );
      if (Date.now() - started < POLL_WINDOW_MS) setTimeout(tick, POLL_MS);
    } catch {
      if (Date.now() - started < POLL_WINDOW_MS) setTimeout(tick, POLL_MS * 2);
    }
  };
  void tick();
}

export function handleBulkResult(
  data: BulkActionResult | undefined,
  opts: { qc: QueryClient; label: string },
): void {
  const d = data ?? {};
  const { qc, label } = opts;

  // Offloaded to a background job — track live progress.
  if (d.async && d.jobId) {
    toast.loading(`${label}… queued (${(d.total ?? 0).toLocaleString()})`, { id: d.jobId });
    pollJob(d.jobId, qc, label);
    return;
  }

  const n = countOf(d);

  // Destructive op with a restorable snapshot — offer Undo.
  if (d.undoToken) {
    const token = d.undoToken;
    toast.success(`${label} (${n.toLocaleString()})`, {
      duration: 12000,
      action: {
        label: 'Undo',
        onClick: async () => {
          try {
            const res = await svc.restoreUndo(token);
            toast.success(`Restored ${(res.data?.restored ?? 0).toLocaleString()}`);
            invalidateEmailQueries(qc);
          } catch {
            toast.error('Could not undo — the window may have expired');
          }
        },
      },
    });
    return;
  }

  // Plain synchronous result.
  const extra = d.errors?.length ? ` · ${d.errors.length} skipped` : '';
  toast.success(`${label}${n ? ` (${n.toLocaleString()})` : ''}${extra}`);
}
