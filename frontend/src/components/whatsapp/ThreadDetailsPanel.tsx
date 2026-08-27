'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Tag,
  Plus,
  Clock,
  StickyNote,
  Trash2,
  UserCircle2,
  Images,
  BotOff,
  IdCard,
  Megaphone,
  Phone,
  Copy,
  Pencil,
  Check,
  Ban,
  ShieldX,
} from 'lucide-react';
import ContactDetailsDrawer from '@/components/whatsapp/ContactDetailsDrawer';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api';
import { confirmDialog, promptDialog } from '@/components/ui/dialog-service';
import { cn } from '@/lib/utils';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type {
  WaAgent,
  WaContact,
  WaContactLite,
  WaConversation,
  WaOptInStatus,
} from '@/types/whatsapp';
import type { ApiError } from '@/types/api';
import ScheduledMessagesPanel from './ScheduledMessagesPanel';

function agentLabel(a: WaAgent): string {
  const name = [a.firstName, a.lastName].filter(Boolean).join(' ').trim();
  return name || a.email;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Build the ISO target for the snooze presets. */
function snoozeTarget(preset: '1h' | '3h' | 'tomorrow'): string {
  const d = new Date();
  if (preset === '1h') d.setHours(d.getHours() + 1);
  else if (preset === '3h') d.setHours(d.getHours() + 3);
  else {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  }
  return d.toISOString();
}

/**
 * Contact fields the conversation-DETAIL endpoint returns (it includes the whole
 * WaContact row) but the conversation LIST does not select. The inbox falls back
 * to the list row until the detail query resolves, so these are optional rather
 * than a widening of `WaContactLite` — which would claim a list row carries data
 * it never has.
 */
type ThreadContact = WaContactLite &
  Partial<
    Pick<
      WaContact,
      'tags' | 'optInAt' | 'optInSource' | 'optOutAt' | 'lastOutboundAt' | 'createdAt'
    >
  >;

const OPT_IN_STYLE: Record<WaOptInStatus, string> = {
  OPTED_IN: 'bg-emerald-100 text-emerald-700',
  OPTED_OUT: 'bg-red-100 text-red-700',
  UNKNOWN: 'bg-gray-100 text-gray-600',
};

/** One "label — value" row of the contact card. */
function ContactMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{label}</span>
      <span className="truncate text-[11px] text-[var(--text-secondary)]">{value || '—'}</span>
    </div>
  );
}

/** Small square icon button used by the contact card's inline editors. */
function IconButton({
  onClick,
  label,
  children,
  className,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'shrink-0 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Who the agent is talking to, and the contact-level actions for them.
 *
 * Everything WaContact records about the person — consent and where it came
 * from, tags, when they first and last wrote — was reachable only from
 * /whatsapp/contacts. An agent handling abuse or a wrong number had to abandon
 * the open thread, search the number on another page and act there, and while
 * replying they had no customer context at all.
 */
function ContactCard({
  contact,
  conversationId,
}: {
  contact: ThreadContact;
  conversationId: string;
}) {
  const qc = useQueryClient();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');

  const updateMut = useMutation({
    mutationFn: (body: {
      name?: string | null;
      tags?: string[];
      isBlocked?: boolean;
      optInStatus?: string;
    }) => svc.updateContact(contact.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-conversation', conversationId] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      // The contacts page lists the very row we just changed.
      qc.invalidateQueries({ queryKey: ['wa-contacts'] });
      // A newly-created tag has to appear in the vocabulary, or the NEXT agent
      // typing it gets no suggestion and splits it all over again.
      qc.invalidateQueries({ queryKey: ['wa-contact-tags'] });
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to update contact'),
  });

  const suppressMut = useMutation({
    mutationFn: (reason: string | undefined) => svc.addSuppression(contact.phone, reason),
    onSuccess: () => {
      showToast.success('Added to the do-not-contact list');
      qc.invalidateQueries({ queryKey: ['wa-suppressions'] });
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to add to do-not-contact'),
  });

  const busy = updateMut.isPending || suppressMut.isPending;

  const startNameEdit = () => {
    setNameDraft(contact.name ?? '');
    setEditingName(true);
  };
  const saveName = () => {
    const next = nameDraft.trim();
    setEditingName(false);
    if (next === (contact.name ?? '')) return;
    updateMut.mutate({ name: next || null });
  };

  // Undefined — not empty — until the detail query resolves. Building the next
  // array off `tags ?? []` from the list row would post a one-element array and
  // silently erase every tag the contact already carried, so the editor waits.
  const tags = contact.tags;
  /**
   * The tags already in use across the contact book.
   *
   * Tags are free text and the filter matches EXACTLY, so "VIP" and "vip" are
   * two different tags: a segment built on one silently excludes everyone
   * carrying the other, which surfaces as a campaign that reached fewer people
   * than expected and no error anywhere.
   */
  const tagVocabQuery = useQuery({
    queryKey: ['wa-contact-tags'],
    queryFn: () => svc.listContactTags(),
    staleTime: 5 * 60_000,
  });
  const tagVocab = useMemo(() => tagVocabQuery.data?.data ?? [], [tagVocabQuery.data]);
  const tagSuggestions = tagDraft.trim()
    ? tagVocab
        .filter(
          (t) =>
            t.tag.toLowerCase().includes(tagDraft.trim().toLowerCase()) &&
            !(tags ?? []).includes(t.tag),
        )
        .slice(0, 6)
    : [];

  const addTag = () => {
    const typed = tagDraft.trim();
    setTagDraft('');
    setAddingTag(false);
    if (!typed || !tags) return;
    // Snap to an existing tag that differs only in case. Without this, typing
    // "vip" beside an established "VIP" quietly creates a second tag that every
    // existing segment and filter will miss — and nothing in the UI would ever
    // show the two side by side to make the split visible.
    const existing = tagVocab.find((t) => t.tag.toLowerCase() === typed.toLowerCase());
    const next = existing?.tag ?? typed;
    if (existing && existing.tag !== typed) {
      showToast.info(`Using the existing tag "${existing.tag}"`);
    }
    if (tags.includes(next)) return;
    updateMut.mutate({ tags: [...tags, next] });
  };
  const removeTag = (tag: string) => {
    if (!tags) return;
    updateMut.mutate({ tags: tags.filter((t) => t !== tag) });
  };

  /** The full contact record, opened by id — the panel knows one either way. */
  const [recordOpen, setRecordOpen] = useState(false);

  const copyPhone = () => {
    navigator.clipboard?.writeText(contact.phone).then(
      () => showToast.success('Copied to clipboard'),
      () => showToast.error('Could not copy'),
    );
  };

  const toggleBlock = async () => {
    if (!contact.isBlocked) {
      const ok = await confirmDialog({
        title: 'Block contact',
        message: `Block ${contact.name || contact.phone}? Nothing can be sent to them — replies, templates or campaigns — until they are unblocked.`,
        confirmLabel: 'Block',
        variant: 'danger',
      });
      if (!ok) return;
    }
    updateMut.mutate({ isBlocked: !contact.isBlocked });
  };

  const toggleOptIn = async () => {
    const optingIn = contact.optInStatus !== 'OPTED_IN';
    const ok = await confirmDialog(
      optingIn
        ? {
            title: 'Mark as opted in',
            message: `Record consent for ${contact.phone}? Do this only when the customer has actually agreed to receive messages — it is stored as manual consent in their record.`,
            confirmLabel: 'Mark opted in',
            variant: 'warning',
          }
        : {
            title: 'Mark as opted out',
            message: `Mark ${contact.phone} as opted out? Campaigns and marketing templates will skip them from now on.`,
            confirmLabel: 'Mark opted out',
            variant: 'danger',
          },
    );
    if (!ok) return;
    updateMut.mutate({ optInStatus: optingIn ? 'OPTED_IN' : 'OPTED_OUT' });
  };

  const suppress = async () => {
    const reason = await promptDialog({
      title: 'Add to do-not-contact list',
      message: `${contact.phone} will be excluded from every campaign send, whatever their opt-in status says.`,
      label: 'Reason (optional)',
      placeholder: 'Complained about marketing',
      confirmLabel: 'Add',
    });
    if (reason === null) return;
    suppressMut.mutate(reason.trim() || undefined);
  };

  const consentDetail =
    contact.optInStatus === 'OPTED_IN' && contact.optInAt
      ? `Opted in ${fmtDateTime(contact.optInAt)}${contact.optInSource ? ` · ${contact.optInSource}` : ''}`
      : contact.optInStatus === 'OPTED_OUT' && contact.optOutAt
        ? `Opted out ${fmtDateTime(contact.optOutAt)}`
        : '';

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
        <IdCard className="h-3.5 w-3.5" /> Contact
      </p>
      <div className="space-y-2.5 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-2.5">
        {editingName ? (
          <div className="flex items-center gap-1">
            <Input
              value={nameDraft}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveName();
                } else if (e.key === 'Escape') {
                  setEditingName(false);
                }
              }}
              placeholder="Name…"
              className="h-7 min-w-0 flex-1 text-xs"
            />
            <IconButton onClick={saveName} label="Save name" className="hover:text-emerald-700">
              <Check className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton onClick={() => setEditingName(false)} label="Cancel renaming">
              <X className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm font-semibold',
                contact.name || contact.profileName
                  ? 'text-[var(--text)]'
                  : 'text-[var(--text-muted)] italic',
              )}
            >
              {contact.name || contact.profileName || 'No name'}
            </span>
            <IconButton onClick={startNameEdit} label="Edit contact name">
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        )}
        {/* The customer's OWN WhatsApp name, shown only when it differs from the
            label above. These were one column until now, and an inbound silently
            overwrote whatever an operator had typed — so seeing both is what
            tells an agent that "DO NOT CALL - legal" is our label and the person
            calls themselves something else. */}
        {contact.profileName && contact.name && contact.profileName !== contact.name && (
          <p className="truncate text-[11px] text-[var(--text-muted)]">
            WhatsApp name: {contact.profileName}
          </p>
        )}

        <div className="flex items-center gap-1">
          <Phone className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-secondary)]">
            {contact.phone}
          </span>
          <IconButton onClick={copyPhone} label="Copy phone number">
            <Copy className="h-3.5 w-3.5" />
          </IconButton>
        </div>

        {/* The rich record — attributes, consent history and provenance,
            suppression membership — used to be reachable only from the contacts
            LIST, i.e. not from the screen where an agent is actually talking to
            the person. Answering "how did this person consent?" meant leaving
            the conversation, finding them in another page and opening a drawer
            there. */}
        <button
          type="button"
          onClick={() => setRecordOpen(true)}
          className="flex items-center gap-1 text-[11px] font-medium text-[var(--primary)] hover:underline"
        >
          <IdCard className="h-3 w-3" aria-hidden="true" /> View full contact record
        </button>

        <div>
          <div className="flex flex-wrap items-center gap-1">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                OPT_IN_STYLE[contact.optInStatus],
              )}
            >
              {contact.optInStatus.replace('_', ' ')}
            </span>
            {contact.isBlocked && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                <Ban className="h-2.5 w-2.5" /> Blocked
              </span>
            )}
          </div>
          {consentDetail && (
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">{consentDetail}</p>
          )}
          {contact.marketingRefusedAt && (
            <p className="mt-1 text-[10px] text-amber-700">
              Meta refused marketing to this number on {fmtDateTime(contact.marketingRefusedAt)} —
              marketing templates may keep failing.
            </p>
          )}
        </div>

        <div>
          <p className="mb-1 text-[10px] text-[var(--text-muted)]">Tags</p>
          {!tags ? (
            <p className="text-[11px] text-[var(--text-muted)]">Loading…</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="text-[var(--text-muted)] hover:text-[var(--error)]"
                    aria-label={`Remove tag ${tag}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {addingTag ? (
                <span className="relative flex items-center gap-1">
                  {/* The vocabulary, so an existing tag is picked rather than
                      re-typed into a near-duplicate nothing will match. */}
                  {tagSuggestions.length > 0 && (
                    <div
                      role="listbox"
                      aria-label="Existing tags"
                      className="absolute bottom-full left-0 z-20 mb-1 w-40 overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-lg"
                    >
                      {tagSuggestions.map((t) => (
                        <button
                          key={t.tag}
                          type="button"
                          role="option"
                          aria-selected={false}
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => {
                            setTagDraft('');
                            setAddingTag(false);
                            if (tags && !tags.includes(t.tag)) {
                              updateMut.mutate({ tags: [...tags, t.tag] });
                            }
                          }}
                          className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--bg-secondary)]"
                        >
                          <span className="truncate">{t.tag}</span>
                          <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                            {t.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <Input
                    value={tagDraft}
                    autoFocus
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag();
                      } else if (e.key === 'Escape') {
                        setAddingTag(false);
                        setTagDraft('');
                      }
                    }}
                    placeholder="Tag…"
                    className="h-7 w-24 text-xs"
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-700"
                  >
                    Add
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingTag(true)}
                  className="hover:text-primary inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:border-[var(--primary)]"
                >
                  <Plus className="h-3 w-3" /> Add tag
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-0.5 border-t border-[var(--border)] pt-2">
          {contact.createdAt && (
            <ContactMeta label="First seen" value={fmtDateTime(contact.createdAt)} />
          )}
          <ContactMeta label="Last inbound" value={fmtDateTime(contact.lastInboundAt ?? null)} />
          {contact.lastOutboundAt !== undefined && (
            <ContactMeta label="Last outbound" value={fmtDateTime(contact.lastOutboundAt)} />
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-2">
          <button
            type="button"
            onClick={toggleBlock}
            disabled={busy}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-60',
              contact.isBlocked
                ? 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg)]'
                : 'border-red-300 text-red-700 hover:bg-red-50',
            )}
          >
            <Ban className="h-3 w-3" /> {contact.isBlocked ? 'Unblock' : 'Block'}
          </button>
          <button
            type="button"
            onClick={toggleOptIn}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg)] disabled:opacity-60"
          >
            {contact.optInStatus === 'OPTED_IN' ? 'Mark opted out' : 'Mark opted in'}
          </button>
          <button
            type="button"
            onClick={suppress}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            <ShieldX className="h-3 w-3" /> Do not contact
          </button>
        </div>
      </div>
      {/* Opened by id — the panel knows one, and the drawer no longer needs the
          whole list row it never had here. */}
      {recordOpen && (
        <ContactDetailsDrawer contactId={contact.id} onClose={() => setRecordOpen(false)} />
      )}
    </div>
  );
}

/** Money formatting for a paise integer, matching the campaign pages. */
function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/**
 * What has already been sent to this contact, and what came back.
 *
 * The panel could say who someone is and what the thread says, and nothing
 * about the campaigns they had received — so before writing "just following up
 * on our offer" an agent had no way to know whether three campaigns had already
 * said exactly that this month, or whether the last one bounced. And there was
 * no way to record a sale from the thread at all: the postback API was the only
 * door, so a conversion an agent closed by hand never reached campaign ROI.
 */
function ContactHistory({ contactId }: { contactId: string }) {
  const qc = useQueryClient();
  const campaignsQuery = useQuery({
    queryKey: ['wa-contact-campaigns', contactId],
    queryFn: () => svc.listContactCampaigns(contactId, { limit: 10 }),
  });
  const conversionsQuery = useQuery({
    queryKey: ['wa-contact-conversions', contactId],
    queryFn: () => svc.listContactConversions(contactId, { limit: 10 }),
  });
  const campaigns = campaignsQuery.data?.data?.items ?? [];
  const conversions = conversionsQuery.data?.data;

  const [recording, setRecording] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const recordMut = useMutation({
    mutationFn: () => {
      const rupeeValue = Number(amount.replace(/[^\d.]/g, ''));
      return svc.recordConversion({
        contactId,
        // Paise, like every other money value in the module. The field asks for
        // rupees because that is what the agent is looking at on the invoice.
        valuePaise:
          Number.isFinite(rupeeValue) && rupeeValue > 0 ? Math.round(rupeeValue * 100) : undefined,
        note: note.trim() || undefined,
      });
    },
    onSuccess: () => {
      setRecording(false);
      setAmount('');
      setNote('');
      showToast.success('Conversion recorded');
      qc.invalidateQueries({ queryKey: ['wa-contact-conversions', contactId] });
    },
    onError: (e) => showToast.error(errorMessage(e, 'Could not record that conversion')),
  });

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
        <Megaphone className="h-3.5 w-3.5" /> Campaigns &amp; conversions
      </p>
      <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-2.5">
        {campaigns.length === 0 && !campaignsQuery.isLoading && (
          <p className="text-[11px] text-[var(--text-muted)]">
            No campaigns have been sent to this contact.
          </p>
        )}
        {campaigns.map((r) => (
          <div key={r.id} className="flex items-start gap-2 text-[11px]">
            <span className="min-w-0 flex-1 truncate text-[var(--text)]">
              {r.campaign?.name ?? 'Campaign'}
            </span>
            <span
              className={cn(
                'shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold',
                r.status === 'FAILED'
                  ? 'bg-red-100 text-red-700'
                  : r.repliedAt
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-[var(--bg)] text-[var(--text-muted)]',
              )}
              // The error code, not just "FAILED" — the two most common reasons
              // (a closed window, a marketing cap) call for different actions.
              title={r.errorCode ?? undefined}
            >
              {r.repliedAt ? 'replied' : r.status.toLowerCase()}
            </span>
          </div>
        ))}

        <div className="border-t border-[var(--border)] pt-2">
          {conversions && conversions.total > 0 ? (
            <p className="text-[11px] text-[var(--text)]">
              <span className="font-semibold">{conversions.total}</span> conversion
              {conversions.total === 1 ? '' : 's'}
              {conversions.totalValuePaise > 0 && (
                <span className="text-[var(--text-muted)]">
                  {' · '}
                  {rupees(conversions.totalValuePaise)}
                </span>
              )}
            </p>
          ) : (
            <p className="text-[11px] text-[var(--text-muted)]">No conversions recorded.</p>
          )}

          {recording ? (
            <div className="mt-1.5 space-y-1.5">
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Value in ₹ (optional)"
                inputMode="decimal"
                className="h-7 text-xs"
              />
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                className="h-7 text-xs"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setRecording(false)}
                  className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => recordMut.mutate()}
                  disabled={recordMut.isPending}
                  className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  Record
                </button>
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">
                Credited to the campaign this contact was last sent, the same way the postback API
                attributes one.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRecording(true)}
              className="mt-1 text-[11px] font-medium text-[var(--primary)] hover:underline"
            >
              Record a conversion
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Assign-to-agent dropdown (agents + Unassign). */
function AssignControl({ conversation }: { conversation: WaConversation }) {
  const qc = useQueryClient();
  const agentsQuery = useQuery({ queryKey: ['wa-agents'], queryFn: () => svc.listAgents() });
  // Memoized so the `?? []` fallback isn't a fresh array on every render, which
  // would invalidate the options useMemo below every time.
  const agents = useMemo(() => agentsQuery.data?.data ?? [], [agentsQuery.data]);

  const assignMut = useMutation({
    mutationFn: (agentId: string | null) => svc.assign(conversation.id, agentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-conversation', conversation.id] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to assign'),
  });

  const options = useMemo(
    () => [
      { value: '', label: 'Unassigned' },
      ...agents.map((a) => ({ value: a.id, label: agentLabel(a) })),
    ],
    [agents],
  );

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
        <UserCircle2 className="h-3.5 w-3.5" /> Assigned agent
      </p>
      <Select
        size="sm"
        clearable={false}
        searchable={agents.length > 6}
        value={conversation.assignedTo ?? ''}
        onChange={(v) => assignMut.mutate(v ? v : null)}
        options={options}
        placeholder={agentsQuery.isLoading ? 'Loading agents…' : 'Unassigned'}
      />
    </div>
  );
}

/** Labels chips with inline add/remove. */
function LabelsEditor({ conversation }: { conversation: WaConversation }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');

  const setMut = useMutation({
    mutationFn: (labels: string[]) => svc.setLabels(conversation.id, labels),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-conversation', conversation.id] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to update labels'),
  });

  const labels = conversation.labels ?? [];

  const addLabel = () => {
    const next = value.trim();
    if (!next) return;
    if (labels.includes(next)) {
      setValue('');
      setAdding(false);
      return;
    }
    setMut.mutate([...labels, next]);
    setValue('');
    setAdding(false);
  };

  const removeLabel = (label: string) => setMut.mutate(labels.filter((l) => l !== label));

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
        <Tag className="h-3.5 w-3.5" /> Labels
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {labels.map((label) => (
          <span
            key={label}
            className="text-primary inline-flex items-center gap-1 rounded-full bg-[var(--primary-light)] px-2 py-0.5 text-[11px] font-medium"
          >
            {label}
            <button
              type="button"
              onClick={() => removeLabel(label)}
              className="text-primary/70 hover:text-primary"
              aria-label={`Remove ${label}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {adding ? (
          <span className="flex items-center gap-1">
            <Input
              value={value}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addLabel();
                } else if (e.key === 'Escape') {
                  setAdding(false);
                  setValue('');
                }
              }}
              placeholder="Label…"
              className="h-7 w-28 text-xs"
            />
            <button
              type="button"
              onClick={addLabel}
              className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-700"
            >
              Add
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="hover:text-primary inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:border-[var(--primary)]"
          >
            <Plus className="h-3 w-3" /> Add label
          </button>
        )}
      </div>
    </div>
  );
}

/** Snooze presets + active-snooze indicator. */
/**
 * Stop every automated reply on this thread for a while.
 *
 * There was no handoff concept at all: an agent taking over an escalating
 * conversation could still be cut across by a keyword rule firing a canned answer
 * at their customer, and nothing in the console could stop it. A human reply also
 * suppresses the bot for 30 minutes automatically; this is the explicit,
 * longer-lived version for a conversation an agent is holding.
 */
function BotPauseControl({ conversation }: { conversation: WaConversation }) {
  const qc = useQueryClient();
  const pauseMut = useMutation({
    mutationFn: (iso: string | null) => svc.setBotPause(conversation.id, iso),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-conversation', conversation.id] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to update automation'),
  });

  // Ticked, like SnoozeControl: the pause expires by wall-clock, so the panel has
  // to notice on its own rather than only on the next refetch.
  const [nowTs, setNowTs] = useState(0);
  useEffect(() => {
    const tick = () => setNowTs(Date.now());
    const id = window.setTimeout(tick, 0);
    const iv = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(id);
      window.clearInterval(iv);
    };
  }, []);
  const paused =
    !!conversation.botPausedUntil && new Date(conversation.botPausedUntil).getTime() > nowTs;

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
        <BotOff className="h-3.5 w-3.5" /> Automation
      </p>
      {paused ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-violet-300 bg-violet-50 px-2 py-1.5 text-[11px] text-violet-800">
          <span>Bot paused until {fmtDateTime(conversation.botPausedUntil ?? null)}</span>
          <button
            type="button"
            onClick={() => pauseMut.mutate(null)}
            className="shrink-0 font-medium text-violet-900 underline hover:no-underline"
            disabled={pauseMut.isPending}
          >
            Resume
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: '1h', ms: 60 * 60 * 1000 },
            { label: '4h', ms: 4 * 60 * 60 * 1000 },
            { label: '24h', ms: 24 * 60 * 60 * 1000 },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              disabled={pauseMut.isPending}
              onClick={() => pauseMut.mutate(new Date(Date.now() + o.ms).toISOString())}
              className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60"
            >
              Pause bot {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SnoozeControl({ conversation }: { conversation: WaConversation }) {
  const qc = useQueryClient();
  const snoozeMut = useMutation({
    mutationFn: (iso: string | null) => svc.setSnooze(conversation.id, iso),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-conversation', conversation.id] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to snooze'),
  });

  const [nowTs, setNowTs] = useState(0);
  useEffect(() => {
    const tick = () => setNowTs(Date.now());
    const id = window.setTimeout(tick, 0);
    const iv = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(id);
      window.clearInterval(iv);
    };
  }, []);
  const snoozedActive =
    !!conversation.snoozedUntil && new Date(conversation.snoozedUntil).getTime() > nowTs;

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
        <Clock className="h-3.5 w-3.5" /> Snooze
      </p>
      {snoozedActive ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
          <span>Snoozed until {fmtDateTime(conversation.snoozedUntil)}</span>
          <button
            type="button"
            onClick={() => snoozeMut.mutate(null)}
            className="shrink-0 font-medium text-amber-900 underline hover:no-underline"
          >
            Unsnooze
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {(['1h', '3h', 'tomorrow'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={snoozeMut.isPending}
              onClick={() => snoozeMut.mutate(snoozeTarget(preset))}
              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60"
            >
              {preset === 'tomorrow' ? 'Tomorrow 9am' : `+${preset}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Internal notes list + add/delete. */
function NotesPanel({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const notesQuery = useQuery({
    queryKey: ['wa-notes', conversationId],
    queryFn: () => svc.listNotes(conversationId),
  });
  const notes = notesQuery.data?.data ?? [];
  const [body, setBody] = useState('');
  /**
   * @-mention autocomplete.
   *
   * The roster is the same one the assign dropdown uses. Suggesting only real
   * operators is the point: the server stores a mention ONLY for a label it
   * recognises, so a free-typed `@dave` that matches nobody notifies nobody —
   * and the author would have no way to tell.
   */
  const mentionAgentsQuery = useQuery({
    queryKey: ['wa-agents'],
    queryFn: () => svc.listAgents(),
  });
  const mentionAgents = useMemo(
    () => mentionAgentsQuery.data?.data ?? [],
    [mentionAgentsQuery.data],
  );
  const noteRef = useRef<HTMLTextAreaElement>(null);
  /** The partial handle being typed, or null when the caret is not in one. */
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const mentionMatches =
    mentionQuery === null
      ? []
      : mentionAgents
          .filter((a) => agentLabel(a).toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 6);

  /** Track whether the caret sits inside an `@handle` being typed. */
  const syncMentionQuery = (value: string, caret: number) => {
    const upto = value.slice(0, caret);
    const m = /(?:^|\s)@([A-Za-z0-9._-]*)$/.exec(upto);
    setMentionQuery(m ? m[1] : null);
  };

  /** Replace the partial handle at the caret with a real operator label. */
  const insertMention = (agentName: string) => {
    const el = noteRef.current;
    const caret = el ? el.selectionStart : body.length;
    const upto = body.slice(0, caret);
    const replaced = upto.replace(/@([A-Za-z0-9._-]*)$/, `@${agentName} `);
    const next = replaced + body.slice(caret);
    setBody(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const at = replaced.length;
      el?.setSelectionRange(at, at);
    });
  };

  // Which note is open for editing, and its working copy.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  const createMut = useMutation({
    mutationFn: (text: string) => svc.createNote(conversationId, text),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['wa-notes', conversationId] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to add note'),
  });
  // Editing used to mean delete-and-retype, which threw away the note's
  // timestamp and author along with the typo.
  const updateMut = useMutation({
    mutationFn: (vars: { noteId: string; text: string }) =>
      svc.updateNote(conversationId, vars.noteId, vars.text),
    onSuccess: () => {
      setEditingId(null);
      setEditBody('');
      qc.invalidateQueries({ queryKey: ['wa-notes', conversationId] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to save note'),
  });
  const deleteMut = useMutation({
    mutationFn: (noteId: string) => svc.deleteNote(conversationId, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-notes', conversationId] }),
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to delete note'),
  });

  const submit = () => {
    const text = body.trim();
    if (text) createMut.mutate(text);
  };
  const submitEdit = () => {
    const text = editBody.trim();
    if (text && editingId) updateMut.mutate({ noteId: editingId, text });
  };

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
        <StickyNote className="h-3.5 w-3.5" /> Internal notes
      </p>
      <div className="space-y-2">
        {notesQuery.isLoading && (
          <p className="text-[11px] text-[var(--text-muted)]">Loading notes…</p>
        )}
        {!notesQuery.isLoading && notes.length === 0 && (
          <p className="text-[11px] text-[var(--text-muted)]">No notes yet.</p>
        )}
        {notes.map((note) =>
          editingId === note.id ? (
            <div
              key={note.id}
              className="space-y-1.5 rounded-md border border-[var(--primary)] bg-[var(--bg)] px-2.5 py-1.5"
            >
              <Textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submitEdit();
                  }
                  if (e.key === 'Escape') setEditingId(null);
                }}
                rows={3}
                maxLength={4096}
                autoFocus
              />
              <div className="flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={submitEdit}
                  isLoading={updateMut.isPending}
                  disabled={!editBody.trim() || editBody.trim() === note.body}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div
              key={note.id}
              className="group flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] break-words whitespace-pre-wrap text-[var(--text)]">
                  {note.body}
                </p>
                {/* Attribution: the author was recorded on every note since the
                    feature shipped and shown nowhere, so a shared inbox had no
                    way to tell who had written what. */}
                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                  {note.authorId ? `${note.authorId} · ` : ''}
                  {fmtDateTime(note.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(note.id);
                    setEditBody(note.body);
                  }}
                  className="text-[var(--text-muted)] hover:text-[var(--primary)] lg:focus-visible:opacity-100"
                  aria-label="Edit note"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(note.id)}
                  className="text-[var(--text-muted)] hover:text-[var(--error)] lg:focus-visible:opacity-100"
                  aria-label="Delete note"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ),
        )}
      </div>
      <div className="relative mt-2 space-y-1.5">
        <Textarea
          ref={noteRef}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            syncMentionQuery(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={(e) => {
            // Escape dismisses the suggestion list before it dismisses anything
            // else, so a stray keypress does not discard a half-typed note.
            if (e.key === 'Escape' && mentionQuery !== null) {
              e.preventDefault();
              setMentionQuery(null);
              return;
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder="Add an internal note… use @ to notify a colleague"
        />
        {mentionMatches.length > 0 && (
          <div
            role="listbox"
            aria-label="Mention a colleague"
            className="absolute bottom-full left-0 z-20 mb-1 w-56 overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-lg"
          >
            {mentionMatches.map((a) => (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={false}
                // Keeps the caret in the textarea; a plain click would blur it
                // first and the handle to replace would be gone.
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => insertMention(agentLabel(a))}
                className="block w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--bg-secondary)]"
              >
                {agentLabel(a)}
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={submit}
            isLoading={createMut.isPending}
            disabled={!body.trim()}
          >
            Add note
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Right-side collapsible panel for a conversation: assign-to-agent, labels,
 * snooze, on-platform reference (Platform 360) and internal notes.
 */
/** "Clear chat history" — soft-delete every message in the conversation (our
 *  side only; the customer keeps their copy). Two-step inline confirm. */
function ClearChatSection({
  conversationId,
  onCleared,
}: {
  conversationId: string;
  onCleared?: () => void;
}) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const clearMut = useMutation({
    mutationFn: () => svc.clearConversation(conversationId),
    onSuccess: () => {
      showToast.success('Chat history cleared');
      setConfirming(false);
      qc.invalidateQueries({ queryKey: ['wa-messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      onCleared?.();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to clear chat'),
  });
  return (
    <div className="border-t border-[var(--border)] pt-4">
      <p className="mb-2 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
        Danger zone
      </p>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" /> Clear chat history
        </button>
      ) : (
        <div className="space-y-2 rounded-md border border-red-300 bg-red-50 p-3">
          <p className="text-xs text-red-800">
            Clear all messages from this chat on your side? The customer keeps their copy. This
            can’t be undone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={clearMut.isPending}
              className="flex-1 rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => clearMut.mutate()}
              disabled={clearMut.isPending}
              className="flex-1 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {clearMut.isPending ? 'Clearing…' : 'Clear'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Which connected number this thread arrived on.
 *
 * A WABA can carry several numbers and each one keeps its own thread with a
 * contact, but nothing on screen said which — so an operator reading a thread
 * could not tell whether the customer had written to the support number or the
 * marketing one, and replies go out from whichever number the thread belongs to.
 * Hidden on the single-number installs where the answer is never in doubt.
 */
function ChannelBadge({ channelId }: { channelId: string }) {
  const { data } = useQuery({
    queryKey: ['wa-channels'],
    queryFn: () => svc.listChannels(),
    staleTime: 5 * 60_000,
  });
  const channels = data?.data ?? [];
  if (channels.length < 2) return null;
  const channel = channels.find((c) => c.id === channelId);
  return (
    <div className="flex items-center gap-2 rounded-md bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-secondary)]">
      <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
      <span className="truncate">
        On{' '}
        <span className="font-medium text-[var(--text)]">
          {channel?.displayName || channel?.displayPhone || 'an unknown number'}
        </span>
      </span>
    </div>
  );
}

export default function ThreadDetailsPanel({
  conversation,
  open,
  onClose,
  onOpenMedia,
  onCleared,
  className,
}: {
  conversation: WaConversation;
  open: boolean;
  onClose: () => void;
  /** Open the media-gallery modal (the page owns the loaded messages). */
  onOpenMedia?: () => void;
  /** Called after the chat history is cleared, so the page can drop its local
   *  message buffers (older/optimistic) that the query refetch wouldn't clear. */
  onCleared?: () => void;
  /** Extra classes for responsive layout (e.g. full-width on mobile). */
  className?: string;
}) {
  if (!open) return null;
  return (
    <aside
      className={cn(
        'flex w-72 shrink-0 flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--bg)]',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-bold text-[var(--text)]">Conversation details</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
          aria-label="Close details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-5 p-4">
        {/* Keyed on the contact so switching threads discards any half-typed
            name or tag draft rather than saving it onto the next customer. */}
        <ContactCard
          key={conversation.contact.id}
          contact={conversation.contact}
          conversationId={conversation.id}
        />
        <ChannelBadge channelId={conversation.channelId} />
        <AssignControl conversation={conversation} />
        <LabelsEditor conversation={conversation} />
        <SnoozeControl conversation={conversation} />
        <BotPauseControl conversation={conversation} />
        <ScheduledMessagesPanel conversationId={conversation.id} />
        {onOpenMedia && (
          <button
            type="button"
            onClick={onOpenMedia}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
          >
            <Images className="h-4 w-4" /> View shared media
          </button>
        )}
        <ContactHistory contactId={conversation.contactId} />
        <NotesPanel conversationId={conversation.id} />
        <ClearChatSection conversationId={conversation.id} onCleared={onCleared} />
      </div>
    </aside>
  );
}
