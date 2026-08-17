'use client';

import { useSyncExternalStore } from 'react';
import { useQueries } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';
import Link from 'next/link';
import { auditService, type AuditEntry } from '@/services/audit.service';

/** Actions Meta raises that an operator must not be able to scroll past. */
const ALERT_ACTIONS = ['WA_ACCOUNT_ALERT', 'WA_TEMPLATE_RECATEGORIZED'] as const;

/** Anything older than this is history, not a live warning. */
const ALERT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const DISMISS_KEY = 'wa-dismissed-account-alerts';

// ── Dismissed-alert store ───────────────────────────────────────────────────
//
// A tiny external store rather than useState + useEffect: localStorage is not
// readable during SSR, and seeding state from an effect both trips the
// set-state-in-effect rule and renders the banner once before hiding it again.
// Mirrors the pattern in wa-notify.ts.

const EMPTY: string[] = [];
let dismissedCache: string[] | null = null;
const listeners = new Set<() => void>();

function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Must return a STABLE reference or useSyncExternalStore re-renders forever. */
function getDismissed(): string[] {
  if (dismissedCache === null) dismissedCache = readDismissed();
  return dismissedCache;
}

function subscribeDismissed(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function dismissAlert(id: string): void {
  // Bounded so a long-lived browser cannot grow the key without limit.
  const next = [...getDismissed(), id].slice(-50);
  dismissedCache = next;
  try {
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota — the banner simply reappears on reload */
  }
  for (const l of listeners) l();
}

/** One-line summary of what Meta actually said, from the audit row's details. */
function describe(entry: AuditEntry): string {
  const details = (entry.details ?? {}) as Record<string, unknown>;
  if (entry.action === 'WA_TEMPLATE_RECATEGORIZED') {
    const affected = Array.isArray(details.affectedCampaigns) ? details.affectedCampaigns : [];
    const names = affected
      .map((c) => (c as { name?: string }).name)
      .filter((n): n is string => !!n);
    return (
      `Meta re-classified template ${String(details.template ?? '')} from ` +
      `${String(details.from ?? '?')} to ${String(details.to ?? '?')}. ` +
      (names.length
        ? `Re-check these unsent campaigns: ${names.join(', ')}.`
        : 'Pricing and the consent rule for it have changed.')
    );
  }
  const field = String(details.field ?? 'account_update');
  const event = details.event ? String(details.event) : null;
  const payload = typeof details.payload === 'string' ? details.payload : '';
  return `Meta sent a ${field}${event ? ` (${event})` : ''} notice: ${payload.slice(0, 240)}`;
}

/**
 * Policy warnings and restriction notices from Meta, on every console page.
 *
 * `account_alerts` / `account_update` / `security` carry the messages that
 * decide whether the number keeps working, and they used to produce one server
 * log line and nothing else — so a restriction notice was only ever found by
 * someone reading logs, and the raw event is pruned after 14 days. Rendered
 * here rather than on one page because there is no page an operator is
 * guaranteed to open.
 */
export default function AccountAlertBanner() {
  const dismissed = useSyncExternalStore(subscribeDismissed, getDismissed, () => EMPTY);

  // The age cut-off is applied server-side (`from`), so no impure clock read
  // happens during render and the response carries only live warnings.
  const results = useQueries({
    queries: ALERT_ACTIONS.map((action) => ({
      queryKey: ['wa-account-alerts', action],
      queryFn: () =>
        auditService.list(
          { action, from: new Date(Date.now() - ALERT_MAX_AGE_MS).toISOString() },
          1,
          5,
        ),
      refetchInterval: 5 * 60_000,
    })),
  });

  const alerts = results
    .flatMap((r) => r.data?.items ?? [])
    .filter((e) => !dismissed.includes(e.id))
    .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))
    // Three is enough to convey "something is wrong"; the rest are in the trail.
    .slice(0, 3);

  if (alerts.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1 text-xs text-amber-900">
            <p className="font-semibold">WhatsApp account notice</p>
            <p className="mt-0.5 break-words">{describe(a)}</p>
            <p className="mt-1 text-[11px] text-amber-800">
              {new Date(a.createdAt).toLocaleString()} ·{' '}
              <Link href="/whatsapp/audit" className="underline">
                View in audit trail
              </Link>
            </p>
          </div>
          <button
            type="button"
            onClick={() => dismissAlert(a.id)}
            aria-label="Dismiss notice"
            className="rounded p-1 text-amber-700 hover:bg-amber-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
