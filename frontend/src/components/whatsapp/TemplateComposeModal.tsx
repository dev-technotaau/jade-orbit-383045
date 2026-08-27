'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, AlertTriangle, Loader2, Trash2, Upload } from 'lucide-react';
import DialogShell from '@/components/ui/DialogShell';
import Input from '@/components/ui/Input';
import PhoneInput from '@/components/ui/PhoneInput';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { showToast } from '@/components/ui/Toast';
import TemplatePreviewBubble from '@/components/whatsapp/TemplatePreviewBubble';
import TemplatePicker from '@/components/whatsapp/TemplatePicker';
import { whatsappService as svc } from '@/services/whatsapp.service';
import { cn } from '@/lib/utils';
// Shared with the campaign form so the accept lists cannot drift from each
// other or from the backend's allowlist.
import { HEADER_ACCEPT, headerNoun } from '@/lib/wa-header-media';
import {
  analyzeTemplate,
  parseProductSkus,
  templateExamples,
  type TemplateSendPayload,
} from '@/lib/whatsapp-template-vars';
import type { ApiError } from '@/types/api';
import type { WaContactLite, WaTemplate } from '@/types/whatsapp';

/**
 * Is this enough of a number to stage media against?
 *
 * A Meta media id is scoped to the phone number that uploaded it, so an upload
 * has to know which of our numbers the send will resolve to — and that is
 * decided by the recipient. The same test gates submit, so the upload control is
 * never enabled for a number the send would then refuse.
 */
const plausiblePhone = (value: string): boolean => value.replace(/\D/g, '').length >= 8;

/**
 * The inputs one carousel card needs. `mode` mirrors the header's upload-or-URL
 * choice per card, because a carousel's media is per card and Meta re-fetches a
 * link on every send.
 */
interface CardDraft {
  mode: 'upload' | 'url';
  mediaId: string;
  mediaUrl: string;
  fileName: string;
  uploading: boolean;
  bodyParams: string[];
  /** One value per dynamic URL button on this card — Meta allows two. */
  buttonUrlParams: string[];
}

const EMPTY_CARD: CardDraft = {
  mode: 'upload',
  mediaId: '',
  mediaUrl: '',
  fileName: '',
  uploading: false,
  bodyParams: [],
  buttonUrlParams: [],
};

/**
 * One MPM section as the form holds it.
 *
 * A multi-product template's products are chosen at SEND time — they are not
 * part of the approved template — and there is no API here for browsing the
 * bound catalog, so the SKUs are typed (one per line or comma-separated).
 */
interface SectionDraft {
  title: string;
  skus: string;
}

const EMPTY_SECTION: SectionDraft = { title: '', skus: '' };

/**
 * Compose + send an approved template — either to start a NEW conversation
 * (with a phone field) or to re-engage an existing one outside the 24h window.
 */
export default function TemplateComposeModal({
  mode,
  conversationId,
  initialPhone,
  contact,
  onClose,
  onSent,
}: {
  mode: 'new' | 'reply';
  conversationId?: string;
  /** Pre-fill the phone field (e.g. when messaging a platform user). */
  initialPhone?: string;
  /**
   * The recipient, when we already know them. Used only to warn that Meta is
   * likely to refuse a MARKETING template — absent for a brand-new 'new'
   * compose, where there is no contact row to judge yet.
   */
  contact?: WaContactLite;
  onClose: () => void;
  onSent: (conversationId?: string) => void;
}) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState(initialPhone ?? '');
  /**
   * Which connected number a NEW thread starts from. '' = the default.
   *
   * A WABA can carry several numbers, and this modal always used the default —
   * so on a multi-number install a conversation could not be opened from the
   * marketing number at all, which is the entire reason it was connected.
   */
  const [fromChannelId, setFromChannelId] = useState('');
  // Only to decide whether the picker is worth showing. A one-number install
  // should not be asked a question with one answer.
  const channelsQuery = useQuery({
    queryKey: ['wa-channels'],
    queryFn: () => svc.listChannels(),
    enabled: mode === 'new',
  });
  const channels = channelsQuery.data?.data ?? [];
  // The picked template itself, not just its id: the catalogue is searched
  // server-side now, so there is no local list to look the id up in.
  const [selected, setSelected] = useState<WaTemplate | null>(null);
  const templateId = selected?.id ?? '';
  // Positional body vars (by index) + all named-ish params keyed by field id.
  const [params, setParams] = useState<string[]>([]);
  const [named, setNamed] = useState<Record<string, string>>({});
  const [headerText, setHeaderText] = useState('');
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  // Media header: upload the file once and send Meta's media id, or point Meta at
  // a public URL. The id is the default — a URL is re-downloaded by Meta on every
  // send, and nothing checks the operator's host is still serving it.
  const [headerMediaMode, setHeaderMediaMode] = useState<'upload' | 'url'>('upload');
  const [headerMediaId, setHeaderMediaId] = useState('');
  const [headerFileName, setHeaderFileName] = useState('');
  // DOCUMENT headers only, and only in URL mode: the name the attachment shows
  // on the handset. In upload mode the picked file's own name is used, which is
  // the name the operator already sees on the chip.
  const [headerDocName, setHeaderDocName] = useState('');
  const [headerObjectUrl, setHeaderObjectUrl] = useState('');
  const [uploadingHeader, setUploadingHeader] = useState(false);
  // Object URLs are process-wide; the local image preview leaks without this.
  useEffect(() => {
    return () => {
      if (headerObjectUrl) URL.revokeObjectURL(headerObjectUrl);
    };
  }, [headerObjectUrl]);
  // One value per DYNAMIC URL button: Meta allows two URL buttons and either may
  // carry a {{n}} suffix. A single field could only fill the first, so a template
  // with two was refused by Meta with (#131008) for a value the modal never asked
  // for — an error the operator had no way to act on.
  const [buttonUrlParams, setButtonUrlParams] = useState<string[]>([]);
  const setUrlParam = (n: number, value: string) =>
    setButtonUrlParams((prev) => Object.assign([...prev], { [n]: value }));
  // Catalogue templates pick their products per send. The thumbnail is optional
  // (Meta uses the catalog's first item without it); the MPM sections and the
  // single-product SKU are the message itself.
  const [catalogThumbnail, setCatalogThumbnail] = useState('');
  const [productId, setProductId] = useState('');
  const [sections, setSections] = useState<SectionDraft[]>([EMPTY_SECTION]);
  // Authentication templates: the one-time code. Sent as both the body and the
  // button parameter by the API layer, so it is entered once here.
  const [otpCode, setOtpCode] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [ltoExpiresAt, setLtoExpiresAt] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [placeAddress, setPlaceAddress] = useState('');

  /**
   * May media be staged at Meta yet?
   *
   * In 'new' mode the upload has to go up under the number the send will resolve
   * to, which is decided by the recipient — so until a plausible number is typed
   * there is nothing to stage against and the backend would fall back to the
   * default channel. On a multi-number WABA that produced a media id belonging to
   * the wrong number, and Meta then rejected a send whose upload had visibly
   * succeeded.
   */
  const canStageMedia = mode === 'reply' || plausiblePhone(phone);

  const spec = selected ? analyzeTemplate(selected) : null;
  /**
   * The sample values Meta approved with this template, shown as placeholders.
   *
   * They were written at authoring time and read by nothing, so every send
   * started from blank inputs labelled {{1}} / {{2}} — the operator retyped
   * values they had already supplied, with nothing on screen saying which slot
   * was which. Placeholders, never prefilled values: a sample quietly sent to a
   * real customer is worse than an empty field.
   */
  const examples = selected ? templateExamples(selected) : null;

  // Will Meta actually DELIVER this? A separate question from whether we are
  // allowed to send it, and the one that produces error 131049. The predictor is
  // the recipient's engagement, not our own opt-in flag — which is why a contact
  // can be OPTED_IN here and still have the message dropped.
  const marketingRisk = (() => {
    if (selected?.category !== 'MARKETING' || !contact) return null;
    if (contact.marketingRefusedAt) {
      const when = new Date(contact.marketingRefusedAt).toLocaleString();
      return `Meta refused a marketing message to this contact on ${when} and will refuse a re-send until the 24h hold clears. Use a UTILITY template instead.`;
    }
    // Deliberately NOT warning on "has never messaged us".
    //
    // A first marketing template to an opted-in contact is the ordinary, fully
    // supported flow — Meta's per-user cap allows it. An earlier version warned
    // whenever lastInboundAt was null, which fired on every legitimate first
    // send; that reading came from a test number that had been sent eleven
    // marketing messages in six hours and was genuinely over the cap, not from
    // the absence of inbound history. A warning that is wrong on the common case
    // teaches operators to click through it, so it is worse than none.
    //
    // marketingRefusedAt above is the honest signal: Meta actually refused this
    // recipient, so a re-send really will fail.
    return null;
  })();

  const clearHeaderMedia = () => {
    setHeaderMediaId('');
    setHeaderFileName('');
    setHeaderDocName('');
    setHeaderObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  };

  const resetParams = () => {
    setParams([]);
    setNamed({});
    setHeaderText('');
    setHeaderMediaUrl('');
    clearHeaderMedia();
    setButtonUrlParams([]);
    setCatalogThumbnail('');
    setProductId('');
    setSections([EMPTY_SECTION]);
    setCards([]);
  };

  /**
   * Stage the picked file at Meta and keep the media id it hands back.
   *
   * Staged against this conversation when replying: Meta scopes a media id to
   * the number that uploaded it, and the reply is sent from the thread's own
   * number — so on a multi-number WABA an id staged under the default number was
   * rejected at send time.
   */
  const onHeaderFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadingHeader(true);
    try {
      // Stage against the number this will actually send from: the conversation
      // for a reply, the recipient's phone for a new thread. Passing nothing made
      // the backend fall back to the env default number, which is not necessarily
      // the one the send resolves on a multi-number WABA.
      const mediaId = await svc.uploadMedia(
        file,
        mode === 'reply' ? { conversationId } : { phone },
      );
      if (!mediaId) throw new Error('Upload returned no media id');
      setHeaderMediaId(mediaId);
      setHeaderFileName(file.name);
      setHeaderObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
      });
    } catch (err) {
      showToast.error((err as unknown as ApiError).message || 'Failed to upload the header media');
    } finally {
      setUploadingHeader(false);
    }
  };

  /**
   * One carousel card's inputs.
   *
   * A carousel's media and text belong to the CARDS, so a carousel template has
   * nothing to collect in the fields above — it needs one of these per card, and
   * Meta refuses the whole message (#131008) if a single one is left empty.
   */
  const [cards, setCards] = useState<CardDraft[]>([]);
  const cardAt = (i: number): CardDraft => cards[i] ?? EMPTY_CARD;
  const setCard = (i: number, patch: Partial<CardDraft>) =>
    setCards((prev) => {
      const next = [...prev];
      while (next.length <= i) next.push({ ...EMPTY_CARD });
      next[i] = { ...next[i], ...patch };
      return next;
    });

  /**
   * Stage one card's media at Meta.
   *
   * Same rule as the header upload: staged against the number this will actually
   * send from, because a media id is scoped to the phone number that uploaded it.
   */
  const onCardFile = async (i: number, file: File | undefined) => {
    if (!file) return;
    setCard(i, { uploading: true });
    try {
      const mediaId = await svc.uploadMedia(
        file,
        mode === 'reply' ? { conversationId } : { phone },
      );
      if (!mediaId) throw new Error('Upload returned no media id');
      setCard(i, { mediaId, fileName: file.name, uploading: false });
    } catch (err) {
      setCard(i, { uploading: false });
      showToast.error((err as unknown as ApiError).message || 'Failed to upload the card media');
    }
  };

  /**
   * Drop staged media when the recipient changes.
   *
   * The media id was uploaded against whichever number `phone` resolved to at
   * the time. Typing a different number can resolve the send to a SECOND number
   * on a multi-number WABA, and Meta then rejects a media id that belongs to the
   * first — an opaque send failure on an upload that visibly succeeded. Clearing
   * it makes the operator re-stage against the number that will actually send.
   *
   * Done in the field's own change handler rather than an effect keyed on
   * `phone`: the reset is a consequence of the operator editing the recipient,
   * not a synchronisation with anything outside React, and an effect would
   * cascade a second render on every keystroke. The card list is returned
   * unchanged when nothing is staged so React can bail out of that render.
   */
  const onPhoneChange = (next: string) => {
    setPhone(next);
    if (mode !== 'new') return;
    setHeaderMediaId('');
    setHeaderFileName('');
    setHeaderObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setCards((prev) =>
      prev.some((c) => c.mediaId || c.fileName)
        ? prev.map((c) => ({ ...c, mediaId: '', fileName: '' }))
        : prev,
    );
  };

  /** Build the full send payload from the template's variable spec. */
  const buildPayload = (): TemplateSendPayload => {
    const payload: TemplateSendPayload = { templateId };
    if (!spec) return payload;
    if (spec.bodyNamed.length) {
      payload.bodyNamedParams = spec.bodyNamed.map((name) => ({
        name,
        text: (named[name] ?? '').trim(),
      }));
    } else if (spec.bodyPositional > 0 && !spec.needsOtpCode) {
      // An AUTHENTICATION template's body {{1}} IS the one-time code — Meta
      // renders the code in the body and the copy button copies it, and the two
      // must be the same string or the customer pastes a code the message never
      // showed. The server derives the body parameter from `otpCode`, so nothing
      // is sent from here that could disagree with it.
      payload.bodyParams = Array.from(
        { length: spec.bodyPositional },
        (_, i) => params[i]?.trim() || '',
      );
    }
    if (spec.headerHasTextVar) payload.headerText = headerText.trim();
    if (spec.headerNeedsMedia) {
      // The backend prefers headerImageId over headerMediaUrl, so only ever send
      // the one the operator actually chose.
      if (headerMediaMode === 'upload') {
        payload.headerImageId = headerMediaId;
      } else {
        payload.headerMediaUrl = headerMediaUrl.trim();
      }
      payload.headerMediaType = spec.headerFormat.toLowerCase() as 'image' | 'video' | 'document';
      // The name the attachment carries on the handset. Upload mode already has
      // it (the picked file's own name, which the chip shows); URL mode asks for
      // it, because a link's last path segment is rarely a name a customer wants
      // to see on an invoice.
      if (spec.headerFormat === 'DOCUMENT') {
        const filename = (headerMediaMode === 'upload' ? headerFileName : headerDocName).trim();
        if (filename) payload.headerMediaFilename = filename;
      }
    }
    // One value per dynamic URL button, in the order the template authored them —
    // the send addresses each by its own index.
    if (spec.buttonUrlVarIndexes.length) {
      payload.buttonUrlParams = spec.buttonUrlVarIndexes.map((_index, n) =>
        (buttonUrlParams[n] ?? '').trim(),
      );
    }
    if (spec.needsCatalogThumbnail || spec.needsProductSections) {
      const thumbnail = catalogThumbnail.trim();
      if (thumbnail) payload.catalogThumbnailProductId = thumbnail;
    }
    if (spec.needsProductSections) {
      // Empty sections are dropped rather than sent: Meta refuses a section with
      // no products, which would fail the whole message.
      payload.productSections = sections
        .map((s) => ({ title: s.title.trim(), productRetailerIds: parseProductSkus(s.skus) }))
        .filter((s) => s.title && s.productRetailerIds.length > 0);
    }
    if (spec.needsProduct) payload.productRetailerId = productId.trim();
    if (spec.needsOtpCode) payload.otpCode = otpCode.trim();
    if (spec.needsCouponCode) payload.couponCode = couponCode.trim();
    if (spec.needsLtoExpiration && ltoExpiresAt) {
      payload.ltoExpirationMs = new Date(ltoExpiresAt).getTime();
    }
    if (spec.carouselCards.length) {
      // One entry per authored card, in card order: Meta matches them by
      // card_index against the approved template.
      payload.carouselCards = spec.carouselCards.map((card, i) => {
        const draft = cardAt(i);
        return {
          ...(draft.mode === 'upload'
            ? { headerMediaId: draft.mediaId }
            : { headerMediaUrl: draft.mediaUrl.trim() }),
          headerMediaType: card.headerFormat === 'VIDEO' ? 'video' : 'image',
          ...(card.bodyPositional
            ? {
                bodyParams: Array.from(
                  { length: card.bodyPositional },
                  (_, n) => draft.bodyParams[n]?.trim() || '',
                ),
              }
            : {}),
          ...(card.buttonUrlVar
            ? {
                buttonUrlParams: card.buttons
                  .filter((b) => b.hasUrlVar)
                  .map((_b, n) => (draft.buttonUrlParams[n] ?? '').trim()),
              }
            : {}),
        };
      });
    }
    if (spec.headerNeedsLocation) {
      payload.headerLocation = {
        latitude: Number(lat),
        longitude: Number(lng),
        ...(placeName.trim() ? { name: placeName.trim() } : {}),
        ...(placeAddress.trim() ? { address: placeAddress.trim() } : {}),
      };
    }
    return payload;
  };

  /**
   * Every required field must be filled before Meta will accept the send.
   *
   * Accumulates rather than early-returning. The body checks used to `return`
   * outright, so a template WITH body parameters never reached the header, media,
   * button, OTP, coupon or location checks — submit stayed enabled with a required
   * media header empty and the operator got an opaque 400 back from Meta instead of
   * the offending field being marked.
   */
  const missingRequired = (): boolean => {
    if (!spec) return false;
    let missing = false;

    if (spec.bodyNamed.length) {
      missing = missing || spec.bodyNamed.some((n) => !(named[n] ?? '').trim());
    }
    // Not for an AUTHENTICATION template: its body {{1}} is the one-time code,
    // collected once by the field at the bottom of the form.
    if (spec.bodyPositional > 0 && !spec.needsOtpCode) {
      missing =
        missing ||
        Array.from({ length: spec.bodyPositional }).some((_, i) => !(params[i] ?? '').trim());
    }

    if (spec.headerHasTextVar && !headerText.trim()) missing = true;
    if (spec.headerNeedsMedia) {
      if (headerMediaMode === 'upload' ? !headerMediaId : !headerMediaUrl.trim()) missing = true;
    }
    spec.buttonUrlVarIndexes.forEach((_index, n) => {
      if (!(buttonUrlParams[n] ?? '').trim()) missing = true;
    });
    // A multi-product template's sections ARE the message, and Meta requires the
    // thumbnail SKU alongside them. A catalog button's thumbnail is optional —
    // Meta falls back to the first item in the bound catalog — so it is not
    // checked here.
    if (spec.needsProductSections) {
      if (!catalogThumbnail.trim()) missing = true;
      const filled = sections.filter((s) => s.title.trim() && parseProductSkus(s.skus).length > 0);
      if (filled.length === 0) missing = true;
    }
    if (spec.needsProduct && !productId.trim()) missing = true;
    if (spec.needsOtpCode && !otpCode.trim()) missing = true;
    if (spec.needsCouponCode && !couponCode.trim()) missing = true;
    if (spec.needsLtoExpiration && !ltoExpiresAt) missing = true;
    if (spec.headerNeedsLocation && (!lat.trim() || !lng.trim())) missing = true;
    if (spec.headerNeedsLocation && (Number.isNaN(Number(lat)) || Number.isNaN(Number(lng)))) {
      missing = true;
    }
    // Every card, every field. A carousel fails as a whole: one card with no
    // image and Meta refuses the entire message with (#131008).
    spec.carouselCards.forEach((card, i) => {
      const draft = cardAt(i);
      if (draft.mode === 'upload' ? !draft.mediaId : !draft.mediaUrl.trim()) missing = true;
      for (let n = 0; n < card.bodyPositional; n += 1) {
        if (!(draft.bodyParams[n] ?? '').trim()) missing = true;
      }
      card.buttons
        .filter((b) => b.hasUrlVar)
        .forEach((_b, n) => {
          if (!(draft.buttonUrlParams[n] ?? '').trim()) missing = true;
        });
    });

    return missing;
  };

  const mutation = useMutation({
    mutationFn: async (): Promise<{ conversationId?: string }> => {
      const payload = buildPayload();
      if (mode === 'new') {
        const res = await svc.startConversation({
          phone,
          ...(fromChannelId ? { channelId: fromChannelId } : {}),
          ...payload,
        });
        return { conversationId: res.data?.conversationId };
      }
      await svc.sendTemplate(conversationId as string, payload);
      return { conversationId };
    },
    onSuccess: (result) => {
      showToast.success('Template sent');
      qc.invalidateQueries({ queryKey: ['wa-conversations'] });
      const convId = result.conversationId;
      if (convId) qc.invalidateQueries({ queryKey: ['wa-messages', convId] });
      onSent(convId);
      onClose();
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to send template'),
  });

  const submit = () => {
    if (mode === 'new' && !plausiblePhone(phone)) {
      return showToast.error('Enter a valid phone number with country code');
    }
    if (!templateId) return showToast.error('Pick an approved template');
    if (missingRequired()) {
      return showToast.error(
        spec?.carouselCards.length
          ? 'Fill every card — each one needs its own media, text and button value'
          : 'Fill every template parameter (header, body, and button)',
      );
    }
    mutation.mutate();
  };

  return (
    <DialogShell onClose={onClose} label="Send a template">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">
            {mode === 'new' ? 'New WhatsApp conversation' : 'Send a template'}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {mode === 'new' && (
            <PhoneInput
              label="Phone number"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
            />
          )}
          {/* Only when there is a choice to make. A single-number install should
              not be asked a question with one answer. */}
          {mode === 'new' && channels.length > 1 && (
            <Select
              id="wa-from-channel"
              label="Send from"
              value={fromChannelId}
              onChange={(v) => setFromChannelId(v ?? '')}
              options={[
                { value: '', label: 'Default number' },
                ...channels.map((c) => ({
                  value: c.id,
                  label: c.displayName ? `${c.displayName} · ${c.displayPhone}` : c.displayPhone,
                })),
              ]}
            />
          )}
          {mode === 'new' && channels.length > 1 && (
            <p className="-mt-2 text-[11px] text-[var(--text-muted)]">
              Only applies to a brand-new thread. A contact who already has one keeps it, on
              whichever number it started on — Meta cannot move history between numbers.
            </p>
          )}
          <TemplatePicker
            label="Template"
            value={templateId}
            onChange={(t) => {
              setSelected(t);
              resetParams();
            }}
          />
          {spec && !spec.none && (
            <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <p className="text-xs font-semibold text-[var(--text-muted)]">
                Fill template parameters
              </p>

              {spec.headerNeedsMedia && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-[var(--text)]">
                      Header {spec.headerFormat.toLowerCase()}
                    </span>
                    <div className="flex overflow-hidden rounded-md border border-[var(--border)] text-[11px]">
                      {(['upload', 'url'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setHeaderMediaMode(m)}
                          className={cn(
                            'px-2 py-1 font-medium transition-colors',
                            headerMediaMode === m
                              ? 'bg-primary text-white'
                              : 'bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                          )}
                        >
                          {m === 'upload' ? 'Upload file' : 'Public URL'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {headerMediaMode === 'url' ? (
                    <>
                      <Input
                        label={`Header ${spec.headerFormat.toLowerCase()} URL`}
                        placeholder={`https://… (public ${spec.headerFormat.toLowerCase()} link)`}
                        value={headerMediaUrl}
                        onChange={(e) => setHeaderMediaUrl(e.target.value)}
                        helperText="Meta re-downloads this link on every send."
                      />
                      {spec.headerFormat === 'DOCUMENT' && (
                        <Input
                          label="File name (optional)"
                          placeholder="Invoice-October.pdf"
                          value={headerDocName}
                          onChange={(e) => setHeaderDocName(e.target.value)}
                          helperText="What the attachment is called on the recipient's phone. Left blank, WhatsApp names it after the link."
                        />
                      )}
                    </>
                  ) : !headerMediaId ? (
                    <label
                      className={cn(
                        'flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-white px-3 py-4 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]',
                        (uploadingHeader || !canStageMedia) && 'pointer-events-none opacity-70',
                      )}
                    >
                      {uploadingHeader ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Uploading to WhatsApp…
                        </>
                      ) : !canStageMedia ? (
                        <>
                          <Upload className="h-4 w-4" /> Enter the phone number first
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" /> Choose {headerNoun(spec.headerFormat)} file
                        </>
                      )}
                      <input
                        type="file"
                        className="hidden"
                        accept={HEADER_ACCEPT[spec.headerFormat]}
                        disabled={uploadingHeader || !canStageMedia}
                        onChange={(e) => onHeaderFile(e.target.files?.[0])}
                      />
                    </label>
                  ) : (
                    <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-white p-2.5">
                      {headerObjectUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={headerObjectUrl}
                          alt="Header media"
                          className="h-12 w-12 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                          <Upload className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--text)]">
                          {headerFileName}
                        </p>
                        <p className="text-[11px] text-emerald-600">
                          Uploaded — sent by media id, no public hosting needed
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={clearHeaderMedia}
                        className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-red-600"
                        aria-label="Remove header media"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
              {spec.headerHasTextVar && (
                <Input
                  label="Header variable {{1}}"
                  value={headerText}
                  placeholder={examples?.headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                />
              )}

              {/* An AUTHENTICATION template's body {{1}} is the one-time code
                  itself. Rendering it here as well as in the "One-time code"
                  field below asked for the same value twice with nothing saying
                  so — and two different entries sent one code in the message and
                  a different one on the copy button, so the customer's login
                  failed while the send looked perfectly successful. */}
              {spec.bodyNamed.length > 0
                ? spec.bodyNamed.map((name) => (
                    <Input
                      key={name}
                      label={`Body {{${name}}}`}
                      value={named[name] ?? ''}
                      placeholder={examples?.body[name]}
                      onChange={(e) => setNamed((n) => ({ ...n, [name]: e.target.value }))}
                    />
                  ))
                : Array.from({ length: spec.needsOtpCode ? 0 : spec.bodyPositional }, (_, i) => (
                    <Input
                      key={i}
                      label={`Body {{${i + 1}}}`}
                      value={params[i] ?? ''}
                      placeholder={examples?.body[String(i + 1)]}
                      onChange={(e) =>
                        setParams((p) => {
                          const next = [...p];
                          next[i] = e.target.value;
                          return next;
                        })
                      }
                    />
                  ))}

              {/* One field per DYNAMIC url button. A template may carry two, and
                  Meta addresses each by its own index — filling only the first
                  had the whole message refused with (#131008). */}
              {spec.buttonUrlVarIndexes.map((_index, n) => (
                <Input
                  key={n}
                  label={
                    spec.buttonUrlVarIndexes.length > 1
                      ? `Link button ${n + 1} value`
                      : 'URL button variable {{1}}'
                  }
                  placeholder="e.g. the dynamic part of the button link"
                  value={buttonUrlParams[n] ?? ''}
                  onChange={(e) => setUrlParam(n, e.target.value)}
                />
              ))}
              {(spec.needsCatalogThumbnail || spec.needsProductSections) && (
                <Input
                  label={
                    spec.needsProductSections
                      ? 'Thumbnail product SKU'
                      : 'Thumbnail product SKU (optional)'
                  }
                  placeholder="e.g. 2lc20305pt"
                  value={catalogThumbnail}
                  onChange={(e) => setCatalogThumbnail(e.target.value)}
                  helperText={
                    spec.needsProductSections
                      ? 'The product whose image heads the message. Its SKU as it appears in your catalog.'
                      : 'The product whose image heads the card. Left blank, WhatsApp uses the first item in your catalog.'
                  }
                />
              )}
              {spec.needsProduct && (
                <Input
                  label="Product SKU"
                  placeholder="e.g. 2lc20305pt"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  helperText="The product this template shows, as it appears in the catalog bound to this number."
                />
              )}
              {spec.needsProductSections && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[var(--text-muted)]">
                    Products (up to 10 sections, 30 products in total)
                  </p>
                  {sections.map((section, n) => (
                    <div
                      key={n}
                      className="space-y-2 rounded-lg border border-[var(--border)] bg-white p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--text)]">
                          Section {n + 1}
                        </span>
                        {sections.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setSections((prev) => prev.filter((_s, i) => i !== n))}
                            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-red-600"
                            aria-label={`Remove section ${n + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <Input
                        id={`mpm-section-${n}-title`}
                        label="Section title"
                        inputSize="sm"
                        maxLength={24}
                        placeholder="e.g. Popular bundles"
                        value={section.title}
                        onChange={(e) =>
                          setSections((prev) =>
                            Object.assign([...prev], {
                              [n]: { ...prev[n], title: e.target.value },
                            }),
                          )
                        }
                      />
                      <Input
                        id={`mpm-section-${n}-skus`}
                        label="Product SKUs"
                        inputSize="sm"
                        placeholder="2lc20305pt, nseiw1x3ch"
                        value={section.skus}
                        onChange={(e) =>
                          setSections((prev) =>
                            Object.assign([...prev], { [n]: { ...prev[n], skus: e.target.value } }),
                          )
                        }
                        helperText="Separate SKUs with commas or spaces."
                      />
                    </div>
                  ))}
                  {sections.length < 10 && (
                    <button
                      type="button"
                      onClick={() => setSections((prev) => [...prev, EMPTY_SECTION])}
                      className="text-primary text-xs font-medium hover:underline"
                    >
                      + Add a section
                    </button>
                  )}
                </div>
              )}
              {spec.needsCouponCode && (
                <Input
                  label="Coupon code"
                  placeholder="e.g. SAVE20"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  helperText="Shown on the copy-code button."
                />
              )}
              {spec.needsLtoExpiration && (
                <Input
                  type="datetime-local"
                  label="Offer expires"
                  value={ltoExpiresAt}
                  onChange={(e) => setLtoExpiresAt(e.target.value)}
                  helperText="WhatsApp shows a live countdown to this time."
                />
              )}
              {spec.headerNeedsLocation && (
                <>
                  <Input
                    label="Latitude"
                    placeholder="19.0760"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                  />
                  <Input
                    label="Longitude"
                    placeholder="72.8777"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                  />
                  <Input
                    label="Place name (optional)"
                    value={placeName}
                    onChange={(e) => setPlaceName(e.target.value)}
                  />
                  <Input
                    label="Address (optional)"
                    value={placeAddress}
                    onChange={(e) => setPlaceAddress(e.target.value)}
                  />
                </>
              )}
              {spec.carouselCards.map((card, i) => {
                const draft = cardAt(i);
                const kind = card.headerFormat === 'VIDEO' ? 'video' : 'image';
                return (
                  <div
                    key={i}
                    className="space-y-2 rounded-lg border border-[var(--border)] bg-white p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[var(--text)]">
                        Card {i + 1} of {spec.carouselCards.length}
                      </span>
                      <div className="flex overflow-hidden rounded-md border border-[var(--border)] text-[11px]">
                        {(['upload', 'url'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setCard(i, { mode: m })}
                            className={cn(
                              'px-2 py-1 font-medium transition-colors',
                              draft.mode === m
                                ? 'bg-primary text-white'
                                : 'bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                            )}
                          >
                            {m === 'upload' ? 'Upload' : 'URL'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* The card's own text, so the operator can see which card
                        they are filling in rather than a stack of {{1}} inputs. */}
                    {card.bodyText && (
                      <p className="rounded bg-[var(--bg-secondary)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">
                        {card.bodyText}
                      </p>
                    )}

                    {draft.mode === 'url' ? (
                      <Input
                        label={`Card ${kind} URL`}
                        inputSize="sm"
                        placeholder={`https://… (public ${kind} link)`}
                        value={draft.mediaUrl}
                        onChange={(e) => setCard(i, { mediaUrl: e.target.value })}
                      />
                    ) : !draft.mediaId ? (
                      <label
                        className={cn(
                          'flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-2.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]',
                          (draft.uploading || !canStageMedia) && 'pointer-events-none opacity-70',
                        )}
                      >
                        {draft.uploading ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
                          </>
                        ) : !canStageMedia ? (
                          <>
                            <Upload className="h-3.5 w-3.5" /> Enter the phone number first
                          </>
                        ) : (
                          <>
                            <Upload className="h-3.5 w-3.5" /> Choose the card {kind}
                          </>
                        )}
                        <input
                          type="file"
                          className="hidden"
                          accept={HEADER_ACCEPT[card.headerFormat]}
                          disabled={draft.uploading || !canStageMedia}
                          onChange={(e) => onCardFile(i, e.target.files?.[0])}
                        />
                      </label>
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2">
                        <p className="min-w-0 flex-1 truncate text-xs text-[var(--text)]">
                          {draft.fileName}
                        </p>
                        <button
                          type="button"
                          onClick={() => setCard(i, { mediaId: '', fileName: '' })}
                          className="rounded p-1 text-[var(--text-muted)] hover:bg-white hover:text-red-600"
                          aria-label={`Remove card ${i + 1} media`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {Array.from({ length: card.bodyPositional }, (_, n) => (
                      <Input
                        key={n}
                        label={`Card ${i + 1} {{${n + 1}}}`}
                        inputSize="sm"
                        placeholder={card.bodyExamples[n]}
                        value={draft.bodyParams[n] ?? ''}
                        onChange={(e) =>
                          setCard(i, {
                            bodyParams: Object.assign([...draft.bodyParams], {
                              [n]: e.target.value,
                            }),
                          })
                        }
                      />
                    ))}

                    {card.buttons
                      .filter((b) => b.hasUrlVar)
                      .map((_b, n) => (
                        <Input
                          key={n}
                          label={`Card ${i + 1} button link value${
                            card.buttons.filter((b) => b.hasUrlVar).length > 1 ? ` ${n + 1}` : ''
                          }`}
                          inputSize="sm"
                          placeholder="the dynamic part of the card's link"
                          value={draft.buttonUrlParams[n] ?? ''}
                          onChange={(e) =>
                            setCard(i, {
                              buttonUrlParams: Object.assign([...draft.buttonUrlParams], {
                                [n]: e.target.value,
                              }),
                            })
                          }
                        />
                      ))}
                  </div>
                );
              })}
              {spec.needsOtpCode && (
                <Input
                  label="One-time code"
                  placeholder="e.g. 472913"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  helperText="Sent in the message body and on the copy button. Generate a fresh code per recipient."
                />
              )}
            </div>
          )}

          {/* What the recipient will actually see. Filling {{1}} and {{2}} blind
              made a transposed pair impossible to catch until the message had
              already landed on someone's phone. */}
          <TemplatePreviewBubble
            template={selected}
            values={{
              bodyParams: params,
              bodyNamedParams: named,
              headerText,
              // An uploaded file has no public URL to preview — the local object
              // URL stands in for it so the bubble isn't blank.
              headerMediaUrl: headerMediaMode === 'upload' ? headerObjectUrl : headerMediaUrl,
              buttonUrlParams,
              otpCode,
              couponCode,
              // The countdown, so the preview shows the offer the customer will
              // see running out rather than an offer bubble with no expiry.
              ltoExpirationMs: ltoExpiresAt ? new Date(ltoExpiresAt).getTime() : undefined,
              headerLocation: { name: placeName, address: placeAddress },
              carouselCards: spec
                ? spec.carouselCards.map((card, i) => {
                    const draft = cardAt(i);
                    return {
                      headerMediaUrl:
                        draft.mode === 'upload' ? draft.fileName : draft.mediaUrl.trim(),
                      bodyParams: draft.bodyParams,
                      buttonUrlParams: draft.buttonUrlParams,
                      headerMediaType: card.headerFormat === 'VIDEO' ? 'video' : 'image',
                    };
                  })
                : undefined,
            }}
          />
        </div>

        {marketingRisk && (
          <div className="mt-4 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-xs text-amber-900">
              <p className="font-semibold">Meta may not deliver this</p>
              <p className="mt-0.5">{marketingRisk}</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={mutation.isPending}>
            Send template
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
