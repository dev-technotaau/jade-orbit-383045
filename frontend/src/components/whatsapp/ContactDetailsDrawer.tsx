'use client';

import { useQuery } from '@tanstack/react-query';
import { X, ShieldCheck, ShieldX, Loader2, Ban } from 'lucide-react';
import DialogShell from '@/components/ui/DialogShell';
import { cn } from '@/lib/utils';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaConsentEvidence, WaContact, WaOptInStatus } from '@/types/whatsapp';

const OPT_IN_STYLE: Record<WaOptInStatus, string> = {
  OPTED_IN: 'bg-emerald-100 text-emerald-700',
  OPTED_OUT: 'bg-red-100 text-red-700',
  UNKNOWN: 'bg-gray-100 text-gray-600',
};

/** How a consent source reads to someone who did not build the system. */
const SOURCE_LABEL: Record<string, string> = {
  ctwa: 'Click-to-WhatsApp ad',
  import: 'Contact import',
  reply: 'Replied to us on WhatsApp',
  manual: 'Set by an operator',
  bulk: 'Bulk action by an operator',
  api: 'API',
  form: 'Web form',
  meta_preference: "WhatsApp's own marketing setting",
};

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sourceLabel(source: string | null | undefined): string {
  if (!source) return '';
  return SOURCE_LABEL[source] ?? source;
}

/** One "label — value" row. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-xs text-[var(--text-muted)]">{label}</span>
      <span className="text-right text-xs text-[var(--text-secondary)]">{value || '—'}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--border)] px-5 py-3">
      <p className="mb-1 text-[11px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

/**
 * The consent evidence blob, rendered as rows rather than dumped as JSON.
 *
 * `source` and `at` are the two fields every writer sets and the two an audit
 * actually asks for; everything else (a CTWA referral payload, an IP) is shown
 * underneath as raw JSON, because it is evidence and paraphrasing it would
 * defeat the point.
 */
function EvidenceBlock({ evidence }: { evidence: WaConsentEvidence }) {
  const { source, at, ...rest } = evidence as {
    source?: string;
    at?: string;
    [key: string]: unknown;
  };
  const extraKeys = Object.keys(rest);
  return (
    <div>
      <Row label="Captured via" value={sourceLabel(source)} />
      <Row label="Captured at" value={fmtDateTime(at)} />
      {extraKeys.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]">
            Full evidence ({extraKeys.length} more field{extraKeys.length === 1 ? '' : 's'})
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded bg-[var(--bg-secondary)] p-2 text-[10px] break-all whitespace-pre-wrap text-[var(--text-secondary)]">
            {JSON.stringify(rest, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

/**
 * Everything the module knows about one contact's consent, in one place.
 *
 * The backend has always recorded and decrypted this — when consent was given,
 * by what route (import / CTWA ad / reply / manual), when it was withdrawn, and
 * the evidence blob behind it — and no screen in the product ever showed a
 * single one of those fields. Faced with a Meta quality review or a DPDP
 * grievance about a specific number, the operator's only way to answer "when and
 * how did this person consent?" was a psql session.
 *
 * Seeded from the list row so it opens instantly, then refetched: a drawer
 * opened from a page loaded ten minutes ago must not show ten-minute-old consent.
 */
export default function ContactDetailsDrawer({
  contact,
  onClose,
}: {
  contact: WaContact;
  onClose: () => void;
}) {
  const query = useQuery({
    // Under the shared 'wa-contacts' prefix so the row-level mutations that
    // already call invalidateQueries({ queryKey: ['wa-contacts'] }) — opt-in
    // changes, blocks, erasure — also refresh a drawer that is open at the time.
    queryKey: ['wa-contacts', 'detail', contact.id],
    queryFn: () => svc.getContact(contact.id),
    // placeholderData, NOT initialData. initialData is written into the cache
    // stamped as freshly fetched, and the app-wide staleTime is five minutes, so
    // the refetch this drawer is built around never actually ran: it only ever
    // showed the list row captured at click time — the ten-minute-old consent the
    // comment above promises it will not show — and the spinner was dead UI.
    placeholderData: { status: 'success', message: '', data: contact } as const,
  });
  const c = query.data?.data ?? contact;

  // Suppression is a separate list keyed by phone, so membership has to be
  // looked up rather than read off the contact. Asked as a SEARCH for this one
  // number: the list used to be fetched wholesale and scanned in the browser,
  // which one "select all matching → Suppress" turns into six figures of rows
  // downloaded to answer a yes/no question about a single phone.
  const suppressions = useQuery({
    queryKey: ['wa-suppressions', { q: c.phone }],
    queryFn: () => svc.listSuppressions({ q: c.phone, limit: 5 }),
  });
  const suppression =
    (suppressions.data?.data?.items ?? []).find((s) => s.phone === c.phone) ?? null;

  const attributes =
    c.attributes && typeof c.attributes === 'object' ? Object.entries(c.attributes) : [];

  return (
    <DialogShell
      onClose={onClose}
      label={`Details for ${c.name || c.phone}`}
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
    >
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 truncate text-base font-bold text-[var(--text)]">
              {c.name || c.phone}
              {c.isBlocked && <Ban className="h-4 w-4 shrink-0 text-[var(--error)]" />}
            </h2>
            <p className="truncate text-xs text-[var(--text-muted)]">{c.phone}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {query.isFetching && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-muted)]" />
            )}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                OPT_IN_STYLE[c.optInStatus],
              )}
            >
              {c.optInStatus.replace('_', ' ')}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close contact details"
              className="rounded p-1 hover:bg-[var(--bg-secondary)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <Section title="Consent">
          <Row label="Opted in" value={fmtDateTime(c.optInAt)} />
          <Row label="Opt-in route" value={sourceLabel(c.optInSource)} />
          <Row label="Opted out" value={fmtDateTime(c.optOutAt)} />
          <Row label="Opt-out route" value={sourceLabel(c.optOutSource)} />
          {c.consentEvidence ? (
            <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Evidence on file
              </p>
              <EvidenceBlock evidence={c.consentEvidence} />
            </div>
          ) : (
            /* Not an error state: contacts created before evidence was recorded,
               and contacts that simply inherited the default opt-in, have none.
               Saying so is the point — it is exactly what an audit needs to know. */
            <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              <ShieldX className="mt-px h-3.5 w-3.5 shrink-0" />
              No consent evidence recorded for this contact.
            </p>
          )}
        </Section>

        <Section title="Do-not-contact list">
          {suppressions.isLoading ? (
            <p className="text-xs text-[var(--text-muted)]">Checking…</p>
          ) : suppression ? (
            <>
              <Row label="Suppressed" value={fmtDateTime(suppression.createdAt)} />
              <Row label="Reason" value={suppression.reason || '—'} />
            </>
          ) : (
            <p className="text-xs text-[var(--text-secondary)]">Not on the suppression list.</p>
          )}
        </Section>

        <Section title="Activity">
          <Row label="Last inbound" value={fmtDateTime(c.lastInboundAt)} />
          <Row label="Last outbound" value={fmtDateTime(c.lastOutboundAt)} />
          <Row label="Last marketing" value={fmtDateTime(c.lastMarketingAt)} />
          {c.marketingRefusedAt && (
            /* Meta refusing a marketing send is the single most useful thing to
               see next to consent: the contact can read OPTED_IN here and still
               have messages dropped. */
            <Row
              label="Meta refused marketing"
              value={`${fmtDateTime(c.marketingRefusedAt)}${
                c.marketingRefusedCode ? ` (${c.marketingRefusedCode})` : ''
              }`}
            />
          )}
          <Row label="First seen" value={fmtDateTime(c.createdAt)} />
          {c.isBlocked && (
            /* A block has two halves: our refusal to reply, and Meta's refusal to
               deliver their messages to us. Only the second one actually stops a
               harasser, so say which is in force rather than a bare "Blocked". */
            <Row
              label="Blocked at Meta"
              value={
                c.blockSyncError
                  ? `Not applied — ${c.blockSyncError}`
                  : c.blockSyncedAt
                    ? fmtDateTime(c.blockSyncedAt)
                    : 'Local only — their messages still arrive'
              }
            />
          )}
        </Section>

        <Section title="Tags">
          {c.tags.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">No tags.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {c.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </Section>

        {attributes.length > 0 && (
          <Section title="Attributes">
            {attributes.map(([key, value]) => (
              <Row
                key={key}
                label={key}
                value={typeof value === 'string' ? value : JSON.stringify(value)}
              />
            ))}
          </Section>
        )}
      </div>
    </DialogShell>
  );
}
