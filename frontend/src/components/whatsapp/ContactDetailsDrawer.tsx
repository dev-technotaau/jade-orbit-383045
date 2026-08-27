'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, ShieldCheck, ShieldX, Loader2, Ban, Plus, Trash2, Check } from 'lucide-react';
import DialogShell from '@/components/ui/DialogShell';
import { showToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaConsentEvidence, WaContact, WaOptInStatus } from '@/types/whatsapp';

/** How a consent EVENT type reads to someone who did not build the system. */
const CONSENT_TYPE_LABEL: Record<string, string> = {
  OPT_IN: 'Opted in',
  OPT_OUT: 'Opted out',
  RESUBSCRIBE: 'Re-subscribed',
  STOP_KEYWORD: 'Sent STOP',
  START_KEYWORD: 'Sent START',
};

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
  contactId,
  seed,
  onClose,
}: {
  /**
   * Addressed by ID, not by a row.
   *
   * The drawer used to require the whole `WaContact` object, which only the
   * contacts LIST has — so the inbox, which knows a conversation's contact id
   * and nothing else, could not open it at all. The rich record (attributes,
   * consent provenance, suppression) was unreachable from the one screen where
   * an agent is actually talking to the person.
   */
  contactId: string;
  /** The list row, when the caller has one, so the drawer paints instantly. */
  seed?: WaContact;
  onClose: () => void;
}) {
  const query = useQuery({
    // Under the shared 'wa-contacts' prefix so the row-level mutations that
    // already call invalidateQueries({ queryKey: ['wa-contacts'] }) — opt-in
    // changes, blocks, erasure — also refresh a drawer that is open at the time.
    queryKey: ['wa-contacts', 'detail', contactId],
    queryFn: () => svc.getContact(contactId),
    // placeholderData, NOT initialData. initialData is written into the cache
    // stamped as freshly fetched, and the app-wide staleTime is five minutes, so
    // the refetch this drawer is built around never actually ran: it only ever
    // showed the list row captured at click time — the ten-minute-old consent the
    // comment above promises it will not show — and the spinner was dead UI.
    placeholderData: seed ? ({ status: 'success', message: '', data: seed } as const) : undefined,
  });
  const c = query.data?.data ?? seed;

  // Suppression is a separate list keyed by phone, so membership has to be
  // looked up rather than read off the contact. Asked as a SEARCH for this one
  // number: the list used to be fetched wholesale and scanned in the browser,
  // which one "select all matching → Suppress" turns into six figures of rows
  // downloaded to answer a yes/no question about a single phone.
  // Empty until the record lands. Opened from the inbox there is no seed row,
  // so the phone is not known for the first frame — and a suppression lookup
  // for '' would return the whole list.
  const phone = c?.phone ?? '';
  const suppressions = useQuery({
    queryKey: ['wa-suppressions', { q: phone }],
    queryFn: () => svc.listSuppressions({ q: phone, limit: 5 }),
    enabled: !!phone,
  });
  const suppression = (suppressions.data?.data?.items ?? []).find((s) => s.phone === phone) ?? null;

  const attributes =
    c?.attributes && typeof c.attributes === 'object' ? Object.entries(c.attributes) : [];

  // ── Attributes: editable at last ────────────────────────────────────────
  //
  // The column has existed since the campaign personalisation work, written
  // only by the importer and the inbound worker, so an agent who learned a
  // customer's city from the conversation had nowhere to put it — and a wrong
  // value imported from a CSV could not be corrected from the product at all.
  const qc = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const attrMut = useMutation({
    // A SPARSE patch — `null` deletes one key. Never the whole map: that would
    // erase the `ctwa*` keys the inbound worker writes, which are not shown here
    // and which the operator therefore could not know to preserve.
    // `contactId`, not `c.id`: the prop is known from the first frame, the
    // fetched record is not.
    mutationFn: (patch: Record<string, string | null>) =>
      svc.updateContact(contactId, { attributes: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-contacts'] });
      setEditingKey(null);
      setNewKey('');
      setNewValue('');
    },
    onError: (e) => showToast.error(errorMessage(e, 'Could not save that attribute')),
  });

  // ── Consent history ─────────────────────────────────────────────────────
  const consentQuery = useQuery({
    queryKey: ['wa-contacts', 'consent', contactId],
    queryFn: () => svc.listConsentEvents(contactId, { limit: 20 }),
  });
  const consentEvents = consentQuery.data?.data?.items ?? [];

  // Every hook above runs unconditionally — this is the first point at which the
  // record may legitimately not be here yet, which happens only when the drawer
  // was opened by id with no seed row (i.e. from the inbox).
  if (!c) {
    return (
      <DialogShell onClose={onClose} label="Contact details">
        <div className="flex h-full w-full max-w-md items-center justify-center bg-white p-6">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
        </div>
      </DialogShell>
    );
  }

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

        {/* Consent history.
            The consent COLUMNS above are a mutable projection — a re-opt-in
            nulls the opt-out date — so they say what the status is now and
            nothing about how it got there. "Have they asked us to stop before?"
            was answerable only by downloading the whole DSAR bundle. */}
        <Section title="Consent history">
          {consentQuery.isLoading && <p className="text-xs text-[var(--text-muted)]">Loading…</p>}
          {!consentQuery.isLoading && consentEvents.length === 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              No recorded consent events. The status above came from the contact record itself.
            </p>
          )}
          {consentEvents.length > 0 && (
            <ol className="space-y-1.5">
              {consentEvents.map((e) => (
                <li key={e.id} className="flex items-start gap-2 text-xs">
                  <span
                    className={cn(
                      'mt-1 h-2 w-2 shrink-0 rounded-full',
                      e.type.includes('OUT') || e.type === 'STOP_KEYWORD'
                        ? 'bg-red-500'
                        : 'bg-emerald-500',
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-[var(--text)]">
                      {CONSENT_TYPE_LABEL[e.type] ?? e.type}
                    </span>
                    {e.source && (
                      <span className="text-[var(--text-muted)]">
                        {' · '}
                        {SOURCE_LABEL[e.source] ?? e.source}
                      </span>
                    )}
                    <span className="block text-[11px] text-[var(--text-muted)]">
                      {fmtDateTime(e.createdAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Section>

        {/* Attributes — editable.
            Written only by the importer and the inbound worker until now, so an
            agent who learned a customer's city from the conversation had nowhere
            to put it, and a wrong imported value could not be corrected at all. */}
        <Section title="Attributes">
          {attributes.length === 0 && !newKey && (
            <p className="text-xs text-[var(--text-muted)]">
              None yet. Attributes fill <code>{'{{attr.key}}'}</code> in campaign templates.
            </p>
          )}
          {attributes.map(([key, value]) => (
            <div key={key} className="flex items-center gap-2 py-0.5">
              <span className="w-28 shrink-0 truncate text-xs text-[var(--text-muted)]">{key}</span>
              {editingKey === key ? (
                <>
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(ev) => setEditValue(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter') attrMut.mutate({ [key]: editValue });
                      if (ev.key === 'Escape') setEditingKey(null);
                    }}
                    maxLength={500}
                    aria-label={`Value for ${key}`}
                    className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => attrMut.mutate({ [key]: editValue })}
                    disabled={attrMut.isPending}
                    aria-label="Save"
                    className="shrink-0 rounded p-1 text-emerald-600 hover:bg-[var(--bg-secondary)]"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingKey(key);
                      setEditValue(typeof value === 'string' ? value : JSON.stringify(value));
                    }}
                    className="min-w-0 flex-1 truncate rounded px-1 text-left text-xs text-[var(--text)] hover:bg-[var(--bg-secondary)]"
                  >
                    {typeof value === 'string' ? value : JSON.stringify(value)}
                  </button>
                  <button
                    type="button"
                    // `null` deletes exactly this key — the patch is sparse, so
                    // nothing else on the contact is touched.
                    onClick={() => attrMut.mutate({ [key]: null })}
                    disabled={attrMut.isPending}
                    aria-label={`Delete ${key}`}
                    className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
          <div className="mt-2 flex items-center gap-2">
            <input
              value={newKey}
              onChange={(ev) => setNewKey(ev.target.value)}
              placeholder="key"
              maxLength={60}
              aria-label="New attribute key"
              className="w-28 shrink-0 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)]"
            />
            <input
              value={newValue}
              onChange={(ev) => setNewValue(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' && newKey.trim()) {
                  attrMut.mutate({ [newKey.trim()]: newValue });
                }
              }}
              placeholder="value"
              maxLength={500}
              aria-label="New attribute value"
              className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)]"
            />
            <button
              type="button"
              onClick={() => newKey.trim() && attrMut.mutate({ [newKey.trim()]: newValue })}
              disabled={!newKey.trim() || attrMut.isPending}
              aria-label="Add attribute"
              className="shrink-0 rounded p-1 text-[var(--primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </Section>
      </div>
    </DialogShell>
  );
}
