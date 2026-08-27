'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText, LayoutList, X, Trash2, Plus } from 'lucide-react';
import DialogShell from '@/components/ui/DialogShell';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import FormattedTextarea from '@/components/whatsapp/FormattedTextarea';
import { cn } from '@/lib/utils';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Tooltip from '@/components/ui/Tooltip';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/dialog-service';
import { useClickOutside } from '@/hooks/use-click-outside';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { ApiError } from '@/types/api';
import type { WaCannedReply, WaInteractiveHeader } from '@/types/whatsapp';

/** Per-send correlation id Meta echoes back on the flow submission. */
function makeFlowToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `flow_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function CannedPopover({
  containerRef,
  onClose,
  onInsert,
}: {
  /** Trigger + popover wrapper; anything outside it dismisses the popover. */
  containerRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onInsert: (t: string) => void;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['wa-canned'], queryFn: () => svc.listCannedReplies() });
  const allReplies = data?.data ?? [];
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  /**
   * Filter box.
   *
   * The list was rendered whole into a 240px scroll box, so a team with thirty
   * saved replies — which is the point of saving them — had to scroll and read
   * to find one. Matched against the body as well as the title: an agent
   * remembers the phrase far more reliably than the label someone else gave it.
   */
  const [q, setQ] = useState('');
  /** Highlighted row for ↑/↓ + Enter. -1 = nothing highlighted. */
  const [cursor, setCursor] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const needle = q.trim().toLowerCase();
  const replies = needle
    ? allReplies.filter(
        (r) => r.title.toLowerCase().includes(needle) || r.text.toLowerCase().includes(needle),
      )
    : allReplies;

  const createMut = useMutation({
    mutationFn: () => svc.createCannedReply({ title: title.trim(), text: text.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-canned'] });
      setAdding(false);
      setTitle('');
      setText('');
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to save'),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => svc.deleteCannedReply(id),
    onSuccess: () => {
      showToast.success('Canned reply deleted');
      qc.invalidateQueries({ queryKey: ['wa-canned'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to delete'),
  });

  // True while this popover's own confirm dialog is on screen. That dialog is
  // portalled to the app root, so the click (or Escape) that answers it reads as
  // "outside" here — without the suspension, answering the question would dismiss
  // the popover out from under the delete it just authorised.
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async (reply: WaCannedReply) => {
    setConfirming(true);
    const ok = await confirmDialog({
      title: 'Delete canned reply',
      message: `Delete the "${reply.title}" canned reply? It is removed for everyone on the team.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    setConfirming(false);
    if (ok) delMut.mutate(reply.id);
  };

  useClickOutside(containerRef, onClose, !confirming);

  // Escape closes the popover. It has to be a document listener because focus is
  // normally still in the composer textarea while the popover is open, so the key
  // event never reaches this subtree.
  //
  // ↑/↓/Enter are handled here for the same reason: focus is in the filter box
  // or still in the composer, and the popover has no focusable list to receive
  // them. Without it the only way to pick a reply was the mouse.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Inside the "New canned reply" sub-form, Escape backs out of the
        // sub-form rather than the whole popover — otherwise a stray key press
        // silently discards a half-typed reply.
        if (adding) setAdding(false);
        else onClose();
        return;
      }
      // The sub-form owns the keyboard while it is open: ↑/↓ move the caret in
      // the body field and Enter inserts a newline.
      if (adding || replies.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => (c + 1) % replies.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => (c - 1 + replies.length) % replies.length);
      } else if (e.key === 'Enter') {
        const pick = replies[cursor];
        if (!pick) return;
        e.preventDefault();
        // Enter would otherwise SEND the composer's draft — the popover is open
        // over a form whose Enter is bound to submit.
        e.stopPropagation();
        onInsert(pick.text);
        onClose();
      }
    };
  });
  useEffect(() => {
    if (confirming) return;
    function onKeyDown(e: KeyboardEvent) {
      keyRef.current(e);
    }
    // Capture phase, so Enter is claimed before the composer form's own keydown
    // turns it into a send.
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [confirming]);

  // Focus the filter the moment the popover opens — the whole point of a
  // keyboard path is not having to reach for the mouse first.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  return (
    <div className="absolute bottom-14 left-3 z-20 w-72 rounded-lg border border-[var(--border)] bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span className="text-xs font-semibold text-[var(--text)]">Canned replies</span>
        <button type="button" onClick={onClose} aria-label="Close canned replies">
          <X className="h-4 w-4" />
        </button>
      </div>
      {allReplies.length > 3 && (
        <div className="border-b border-[var(--border)] px-2 py-1.5">
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              // Typing re-filters, so the old index points at a different reply
              // — or at nothing. Reset rather than leave Enter aimed at whatever
              // happens to sit there now.
              setCursor(0);
            }}
            placeholder="Search replies…"
            aria-label="Search canned replies"
            className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)]"
          />
        </div>
      )}
      <div className="max-h-60 overflow-y-auto">
        {allReplies.length === 0 && (
          <p className="px-3 py-3 text-xs text-[var(--text-muted)]">No canned replies yet.</p>
        )}
        {allReplies.length > 0 && replies.length === 0 && (
          <p className="px-3 py-3 text-xs text-[var(--text-muted)]">
            Nothing matches “{q.trim()}”.
          </p>
        )}
        {replies.map((r, i) => (
          <div
            key={r.id}
            className={cn(
              'flex items-start gap-2 px-3 py-2 hover:bg-[var(--bg-secondary)]',
              i === cursor && 'bg-[var(--bg-secondary)]',
            )}
          >
            <button
              type="button"
              onClick={() => {
                onInsert(r.text);
                onClose();
              }}
              onMouseEnter={() => setCursor(i)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate text-xs font-medium text-[var(--text)]">{r.title}</p>
              <p className="truncate text-[11px] text-[var(--text-muted)]">{r.text}</p>
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(r)}
              aria-label={`Delete ${r.title}`}
              className="text-[var(--text-muted)] hover:text-[var(--error)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      {adding ? (
        <div className="space-y-2 border-t border-[var(--border)] p-3">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          {/* The saved text is sent verbatim, so it needs the same marker
              toolbar every other send field has — a canned reply was the one
              place formatting had to be typed from memory. */}
          <FormattedTextarea
            label="Text"
            value={text}
            onChange={setText}
            rows={3}
            maxLength={1024}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button onClick={() => createMut.mutate()} isLoading={createMut.isPending}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center gap-1.5 border-t border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--primary)] hover:bg-[var(--bg-secondary)]"
        >
          <Plus className="h-3.5 w-3.5" /> New canned reply
        </button>
      )}
    </div>
  );
}

function InteractiveModal({
  conversationId,
  contextWamid,
  onClose,
  onSent,
}: {
  conversationId: string;
  /** WAMID this prompt quotes, when the reply banner was up. */
  contextWamid?: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [kind, setKind] = useState<
    | 'button'
    | 'list'
    | 'cta_url'
    | 'flow'
    | 'product'
    | 'product_list'
    | 'location_request_message'
    | 'address_message'
  >('button');
  const [bodyText, setBodyText] = useState('');
  // Header and footer, absent until now: every button/list/CTA went out as a bare
  // paragraph with no way to put a title, a photo or a document above it, and no
  // way to put the small print underneath.
  const [headerType, setHeaderType] = useState<'none' | 'text' | 'image' | 'video' | 'document'>(
    'none',
  );
  const [headerText, setHeaderText] = useState('');
  const [headerLink, setHeaderLink] = useState('');
  const [footerText, setFooterText] = useState('');
  const [addressCountry, setAddressCountry] = useState<'IN' | 'SG'>('IN');
  const [buttons, setButtons] = useState<string[]>(['']);
  const [listButton, setListButton] = useState('Menu');
  // A list is a set of SECTIONS, each with its own heading — the way a real
  // WhatsApp menu groups "Support" apart from "Billing". The composer could only
  // ever build one unnamed section, so grouped menus were unreachable from the UI
  // even though the API and Meta both take them.
  const [sections, setSections] = useState<
    Array<{ title: string; rows: Array<{ title: string; description: string }> }>
  >([{ title: '', rows: [{ title: '', description: '' }] }]);
  const [ctaText, setCtaText] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [flowMetaId, setFlowMetaId] = useState('');
  const [flowCta, setFlowCta] = useState('Open form');
  const [flowAction, setFlowAction] = useState<'navigate' | 'data_exchange'>('navigate');
  const [flowScreen, setFlowScreen] = useState('');
  // Commerce. Product ids are the retailer ids from the bound catalog; the
  // catalog itself is configured once under Settings → Catalog and cart, so an
  // agent never has to know its id.
  const [productIds, setProductIds] = useState<string[]>(['']);
  const [productHeader, setProductHeader] = useState('');

  /** Total rows across every section — Meta's cap of 10 is on the whole list. */
  const totalRows = sections.reduce((n, s) => n + s.rows.length, 0);

  /**
   * The sections as the API takes them: blank rows and empty sections dropped,
   * a section title only when one was typed.
   *
   * Row ids are numbered across the WHOLE list rather than within each section —
   * Meta requires them to be unique per message, and per-section numbering would
   * send two rows called `row_1` the moment a second section existed.
   */
  const buildSections = () => {
    let rowId = 0;
    return sections
      .map((sec) => ({ title: sec.title.trim(), rows: sec.rows.filter((r) => r.title.trim()) }))
      .filter((sec) => sec.rows.length > 0)
      .map((sec) => ({
        ...(sec.title ? { title: sec.title } : {}),
        rows: sec.rows.map((row) => ({
          id: `row_${++rowId}`,
          title: row.title.trim(),
          description: row.description.trim() || undefined,
        })),
      }));
  };

  // Only a PUBLISHED flow can be sent — Meta rejects a draft outright, so the
  // picker would otherwise offer choices that always fail.
  const { data: flowsData } = useQuery({
    queryKey: ['wa-flows'],
    queryFn: () => svc.listFlows(),
    enabled: kind === 'flow',
  });
  const publishedFlows = (flowsData?.data ?? []).filter((f) => f.status === 'PUBLISHED');

  // Meta refuses a header on the collection prompts and on a single-product
  // message, and only accepts a text header on a list — so the fields are hidden
  // rather than sent and rejected.
  const headerAllowed =
    kind === 'button' || kind === 'cta_url' || kind === 'flow' || kind === 'list';
  const headerTextOnly = kind === 'list';
  const footerAllowed = kind !== 'location_request_message' && kind !== 'address_message';

  const extras = (): { header?: WaInteractiveHeader; footerText?: string } => {
    const header: WaInteractiveHeader | undefined =
      !headerAllowed || headerType === 'none'
        ? undefined
        : headerType === 'text'
          ? headerText.trim()
            ? { type: 'text', text: headerText.trim() }
            : undefined
          : headerLink.trim()
            ? { type: headerType, link: headerLink.trim() }
            : undefined;
    const footer = footerAllowed && footerText.trim() ? footerText.trim() : undefined;
    return { ...(header ? { header } : {}), ...(footer ? { footerText: footer } : {}) };
  };

  const mutation = useMutation({
    mutationFn: () => {
      if (kind === 'location_request_message') {
        return svc.sendInteractive(conversationId, {
          contextWamid,
          kind: 'location_request_message',
          bodyText: bodyText.trim(),
        });
      }
      if (kind === 'address_message') {
        return svc.sendInteractive(conversationId, {
          contextWamid,
          kind: 'address_message',
          bodyText: bodyText.trim(),
          addressCountry,
        });
      }
      if (kind === 'button') {
        const b = buttons
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 3)
          .map((title, i) => ({ id: `btn_${i + 1}`, title }));
        return svc.sendInteractive(conversationId, {
          contextWamid,
          kind: 'button',
          bodyText: bodyText.trim(),
          buttons: b,
          ...extras(),
        });
      }
      if (kind === 'cta_url') {
        return svc.sendInteractive(conversationId, {
          contextWamid,
          kind: 'cta_url',
          bodyText: bodyText.trim(),
          ctaText: ctaText.trim(),
          ctaUrl: ctaUrl.trim(),
          ...extras(),
        });
      }
      if (kind === 'product' || kind === 'product_list') {
        const ids = productIds.map((p) => p.trim()).filter(Boolean);
        return svc.sendInteractive(conversationId, {
          contextWamid,
          kind,
          bodyText: bodyText.trim(),
          ...(kind === 'product'
            ? { productRetailerId: ids[0] }
            : {
                productSections: [{ productRetailerIds: ids }],
                ...(productHeader.trim() ? { headerText: productHeader.trim() } : {}),
              }),
          // Both product kinds take a footer at Meta and on our send path, and
          // the Footer field renders for them — this branch was the one that
          // dropped `extras()`, so an agent who typed small print under a product
          // got a cheerful 'Interactive message sent' and a message without it.
          // (`extras()` contributes only the footer here: headerAllowed is false
          // for both kinds, and product_list carries its own `headerText`.)
          ...extras(),
        });
      }
      if (kind === 'flow') {
        return svc.sendInteractive(conversationId, {
          contextWamid,
          kind: 'flow',
          bodyText: bodyText.trim(),
          flowId: flowMetaId,
          flowCta: flowCta.trim() || 'Open',
          flowAction,
          // Meta echoes the token back on the nfm_reply, so a submission can be
          // tied to the exact send that produced it rather than guessed at from
          // timestamps. `randomUUID` only exists in a secure context, and the
          // console is routinely opened over plain http on a LAN — the fallback
          // keeps the send working there rather than throwing.
          flowToken: makeFlowToken(),
          ...(flowAction === 'navigate' && flowScreen.trim()
            ? { flowScreen: flowScreen.trim() }
            : {}),
          ...extras(),
        });
      }
      return svc.sendInteractive(conversationId, {
        contextWamid,
        kind: 'list',
        bodyText: bodyText.trim(),
        listButton,
        sections: buildSections(),
        ...extras(),
      });
    },
    onSuccess: () => {
      showToast.success('Interactive message sent');
      onSent();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to send'),
  });

  const submit = () => {
    if (!bodyText.trim()) return showToast.error('Body text is required');
    if (headerAllowed && headerType !== 'none' && headerType !== 'text') {
      if (!/^https?:\/\//i.test(headerLink.trim()))
        return showToast.error('Enter a valid header media URL starting with https://');
    }
    if (kind === 'button' && !buttons.some((b) => b.trim()))
      return showToast.error('Add at least one button');
    if (kind === 'list') {
      const built = buildSections();
      if (built.length === 0) return showToast.error('Add at least one list item');
      // Meta rejects an untitled section as soon as a list has more than one, so
      // catch it here rather than let the send come back as a FAILED message.
      if (built.length > 1 && built.some((s) => !s.title))
        return showToast.error('Name every section — a list with more than one needs titles');
    }
    if (kind === 'cta_url') {
      if (!ctaText.trim()) return showToast.error('Button label is required');
      if (!/^https?:\/\//i.test(ctaUrl.trim()))
        return showToast.error('Enter a valid URL starting with https://');
    }
    if (kind === 'flow') {
      if (!flowMetaId) return showToast.error('Pick a published flow');
      if (!flowCta.trim()) return showToast.error('Button label is required');
    }
    if (kind === 'product' || kind === 'product_list') {
      if (!productIds.some((p) => p.trim()))
        return showToast.error('Add at least one product id from your catalog');
    }
    mutation.mutate();
  };

  return (
    <DialogShell onClose={onClose} label="Interactive message">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">Interactive message</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-[var(--bg-secondary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <Select
            label="Type"
            options={[
              { value: 'button', label: 'Reply buttons (max 3)' },
              { value: 'list', label: 'List menu' },
              { value: 'cta_url', label: 'Call-to-action (URL button)' },
              { value: 'flow', label: 'Flow (native form)' },
              { value: 'product', label: 'Single product (from catalog)' },
              { value: 'product_list', label: 'Multiple products (from catalog)' },
              { value: 'location_request_message', label: 'Ask for location (one tap)' },
              { value: 'address_message', label: 'Collect delivery address (IN / SG)' },
            ]}
            value={kind}
            onChange={(v) => setKind(v as typeof kind)}
            clearable={false}
          />
          <Textarea
            label="Body text"
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={3}
          />

          {headerAllowed && (
            <div className="space-y-2">
              <Select
                label="Header (optional)"
                options={[
                  { value: 'none', label: 'No header' },
                  { value: 'text', label: 'Text' },
                  ...(headerTextOnly
                    ? []
                    : [
                        { value: 'image', label: 'Image' },
                        { value: 'video', label: 'Video' },
                        { value: 'document', label: 'Document' },
                      ]),
                ]}
                value={headerType}
                onChange={(v) => setHeaderType(v as typeof headerType)}
                clearable={false}
              />
              {headerType === 'text' && (
                <Input
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder="Title (≤60 chars)"
                />
              )}
              {headerType !== 'none' && headerType !== 'text' && (
                <Input
                  type="url"
                  value={headerLink}
                  onChange={(e) => setHeaderLink(e.target.value)}
                  placeholder="https://example.com/file"
                />
              )}
            </div>
          )}

          {footerAllowed && (
            <Input
              label="Footer (optional)"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Small print under the message (≤60 chars)"
            />
          )}

          {kind === 'location_request_message' ? (
            <p className="text-[11px] text-[var(--text-muted)]">
              WhatsApp shows a Send location button. The customer&apos;s pin comes back as a normal
              location message in this thread.
            </p>
          ) : kind === 'address_message' ? (
            <div className="space-y-2">
              <Select
                label="Country"
                options={[
                  { value: 'IN', label: 'India' },
                  { value: 'SG', label: 'Singapore' },
                ]}
                value={addressCountry}
                onChange={(v) => setAddressCountry(v as 'IN' | 'SG')}
                clearable={false}
              />
              <p className="text-[11px] text-[var(--text-muted)]">
                WhatsApp shows its own address form. Meta supports this in India and Singapore only;
                the submitted address arrives as a form response on this thread.
              </p>
            </div>
          ) : kind === 'product' || kind === 'product_list' ? (
            <div className="space-y-2">
              {kind === 'product_list' && (
                <Input
                  label="Header"
                  value={productHeader}
                  onChange={(e) => setProductHeader(e.target.value)}
                  placeholder="Our products"
                />
              )}
              <p className="text-xs font-semibold text-[var(--text-muted)]">
                {kind === 'product' ? 'Product' : 'Products'}
              </p>
              {(kind === 'product' ? productIds.slice(0, 1) : productIds).map((id, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={id}
                    onChange={(e) =>
                      setProductIds((p) => {
                        const n = [...p];
                        n[i] = e.target.value;
                        return n;
                      })
                    }
                    placeholder="Retailer ID, e.g. SKU-1234"
                  />
                  {kind === 'product_list' && productIds.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setProductIds((p) => p.filter((_, j) => j !== i))}
                      className="text-[var(--text-muted)] hover:text-[var(--error)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {kind === 'product_list' && productIds.length < 30 && (
                <button
                  type="button"
                  onClick={() => setProductIds((p) => [...p, ''])}
                  className="text-xs font-medium text-[var(--primary)]"
                >
                  + Add product
                </button>
              )}
              <p className="text-[11px] text-[var(--text-muted)]">
                Sent from the catalog bound to this number under Settings → Catalog and cart.
              </p>
            </div>
          ) : kind === 'flow' ? (
            <div className="space-y-2">
              <Select
                label="Flow"
                options={publishedFlows.map((f) => ({ value: f.metaId, label: f.name }))}
                value={flowMetaId}
                onChange={(v) => setFlowMetaId(v)}
                placeholder={publishedFlows.length ? 'Select a flow' : 'No published flows'}
                disabled={publishedFlows.length === 0}
              />
              <Input
                label="Button label"
                value={flowCta}
                onChange={(e) => setFlowCta(e.target.value)}
                placeholder="e.g. Book a slot"
              />
              <Select
                label="Action"
                options={[
                  { value: 'navigate', label: 'Navigate (static flow)' },
                  { value: 'data_exchange', label: 'Data exchange (endpoint-backed)' },
                ]}
                value={flowAction}
                onChange={(v) => setFlowAction(v as 'navigate' | 'data_exchange')}
                clearable={false}
              />
              {flowAction === 'navigate' && (
                <Input
                  label="First screen (optional)"
                  value={flowScreen}
                  onChange={(e) => setFlowScreen(e.target.value)}
                  placeholder="Screen id from the flow JSON, e.g. WELCOME"
                />
              )}
              <p className="text-[11px] text-[var(--text-muted)]">
                Only PUBLISHED flows can be sent. Manage them under Flows.
              </p>
            </div>
          ) : kind === 'cta_url' ? (
            <div className="space-y-2">
              <Input
                label="Button label"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                placeholder="e.g. Visit website"
              />
              <Input
                label="URL"
                type="url"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
          ) : kind === 'button' ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[var(--text-muted)]">Buttons</p>
              {buttons.map((b, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={b}
                    onChange={(e) =>
                      setButtons((p) => {
                        const n = [...p];
                        n[i] = e.target.value;
                        return n;
                      })
                    }
                    placeholder={`Button ${i + 1} (≤20 chars)`}
                  />
                  {buttons.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setButtons((p) => p.filter((_, j) => j !== i))}
                      className="text-[var(--text-muted)] hover:text-[var(--error)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {buttons.length < 3 && (
                <button
                  type="button"
                  onClick={() => setButtons((p) => [...p, ''])}
                  className="text-xs font-medium text-[var(--primary)]"
                >
                  + Add button
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                label="Menu button label"
                value={listButton}
                onChange={(e) => setListButton(e.target.value)}
              />
              <p className="text-xs font-semibold text-[var(--text-muted)]">
                Sections <span className="font-normal">({totalRows}/10 items)</span>
              </p>
              {sections.map((section, si) => (
                <div key={si} className="space-y-2 rounded-lg border border-[var(--border)] p-2">
                  <div className="flex gap-2">
                    <Input
                      value={section.title}
                      onChange={(e) =>
                        setSections((p) => {
                          const n = [...p];
                          n[si] = { ...n[si], title: e.target.value };
                          return n;
                        })
                      }
                      maxLength={24}
                      placeholder={
                        sections.length > 1
                          ? `Section ${si + 1} title (required)`
                          : 'Section title (optional)'
                      }
                    />
                    {sections.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setSections((p) => p.filter((_, j) => j !== si))}
                        aria-label={`Remove section ${si + 1}`}
                        className="text-[var(--text-muted)] hover:text-[var(--error)]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {section.rows.map((row, i) => (
                    <div key={i} className="flex gap-2 pl-3">
                      <Input
                        value={row.title}
                        onChange={(e) =>
                          setSections((p) => {
                            const n = [...p];
                            const r = [...n[si].rows];
                            r[i] = { ...r[i], title: e.target.value };
                            n[si] = { ...n[si], rows: r };
                            return n;
                          })
                        }
                        maxLength={24}
                        placeholder={`Item ${i + 1} title`}
                      />
                      {totalRows > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setSections((p) => {
                              const n = [...p];
                              const r = n[si].rows.filter((_, j) => j !== i);
                              // Meta refuses a section with no rows, so the last
                              // row leaving takes its section with it.
                              if (r.length === 0) return n.filter((_, j) => j !== si);
                              n[si] = { ...n[si], rows: r };
                              return n;
                            })
                          }
                          aria-label={`Remove item ${i + 1}`}
                          className="text-[var(--text-muted)] hover:text-[var(--error)]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {/* Meta's cap of 10 rows is on the whole list, not per section. */}
                  {totalRows < 10 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSections((p) => {
                          const n = [...p];
                          n[si] = {
                            ...n[si],
                            rows: [...n[si].rows, { title: '', description: '' }],
                          };
                          return n;
                        })
                      }
                      className="pl-3 text-xs font-medium text-[var(--primary)]"
                    >
                      + Add item
                    </button>
                  )}
                </div>
              ))}
              {sections.length < 10 && totalRows < 10 && (
                <button
                  type="button"
                  onClick={() =>
                    setSections((p) => [
                      ...p,
                      { title: '', rows: [{ title: '', description: '' }] },
                    ])
                  }
                  className="text-xs font-medium text-[var(--primary)]"
                >
                  + Add section
                </button>
              )}
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={mutation.isPending}>
            Send
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}

/** Composer toolbar: canned-replies popover + interactive-message builder. */
export default function InboxComposerTools({
  conversationId,
  contextWamid,
  onInsert,
  onSent,
}: {
  conversationId: string;
  /** WAMID the open reply banner points at, forwarded to the interactive send. */
  contextWamid?: string;
  onInsert: (text: string) => void;
  onSent: () => void;
}) {
  const [cannedOpen, setCannedOpen] = useState(false);
  const [interactiveOpen, setInteractiveOpen] = useState(false);
  // Wraps the trigger as well as the popover, so re-clicking the trigger to close
  // does not read as an outside click (which would close and immediately reopen).
  const cannedRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={cannedRef} className="flex items-end">
        <Tooltip content="Canned replies">
          <button
            type="button"
            onClick={() => setCannedOpen((v) => !v)}
            aria-label="Canned replies"
            aria-expanded={cannedOpen}
            className="flex h-10 items-center rounded-lg px-2 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
          >
            <MessageSquareText className="h-5 w-5" />
          </button>
        </Tooltip>
        {cannedOpen && (
          <CannedPopover
            containerRef={cannedRef}
            onClose={() => setCannedOpen(false)}
            onInsert={(t) => {
              onInsert(t);
              setCannedOpen(false);
            }}
          />
        )}
      </div>
      <Tooltip content="Interactive message (buttons / list / flow)">
        <button
          type="button"
          onClick={() => setInteractiveOpen(true)}
          aria-label="Interactive message (buttons / list / flow)"
          className="flex h-10 items-center rounded-lg px-2 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
        >
          <LayoutList className="h-5 w-5" />
        </button>
      </Tooltip>

      {interactiveOpen && (
        <InteractiveModal
          conversationId={conversationId}
          contextWamid={contextWamid}
          onClose={() => setInteractiveOpen(false)}
          onSent={() => {
            onSent();
            setInteractiveOpen(false);
          }}
        />
      )}
    </>
  );
}
