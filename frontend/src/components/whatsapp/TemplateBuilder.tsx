'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Plus,
  Trash2,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Braces,
  Image as ImageIcon,
  Video as VideoIcon,
  FileText,
  MapPin,
  Type as TypeIcon,
  Ban,
  Loader2,
  MessageSquareReply,
  ExternalLink,
  Phone,
  Ticket,
  Workflow,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import DialogShell from '@/components/ui/DialogShell';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import PhoneInput from '@/components/ui/PhoneInput';
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { useClickOutside } from '@/hooks/use-click-outside';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaTemplate } from '@/types/whatsapp';
import MarketingTemplateAddOns, {
  useMarketingAddOnState,
  buildMarketingAddOnComponents,
} from '@/components/whatsapp/MarketingTemplateAddOns';
import type { ApiError } from '@/types/api';

const CATEGORY_OPTIONS = [
  { value: 'UTILITY', label: 'Utility (transactional)' },
  { value: 'MARKETING', label: 'Marketing (promotional)' },
  { value: 'AUTHENTICATION', label: 'Authentication (OTP)' },
];

/** Shared with the library browser, which picks a language the same way. */
export const LANGUAGE_OPTIONS = [
  { value: 'en_US', label: 'English (US)' },
  { value: 'en_GB', label: 'English (UK)' },
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'bn', label: 'Bengali' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'pa', label: 'Punjabi' },
  { value: 'ur', label: 'Urdu' },
  { value: 'ar', label: 'Arabic' },
  { value: 'es', label: 'Spanish' },
  { value: 'es_ES', label: 'Spanish (Spain)' },
  { value: 'pt_BR', label: 'Portuguese (Brazil)' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'id', label: 'Indonesian' },
  { value: 'zh_CN', label: 'Chinese (Simplified)' },
];

const HEADER_FORMATS = ['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'] as const;
type HeaderFormat = (typeof HEADER_FORMATS)[number];

const HEADER_META: Record<
  Exclude<HeaderFormat, 'NONE'>,
  { label: string; icon: React.ReactNode; accept?: string }
> = {
  TEXT: { label: 'Text', icon: <TypeIcon className="h-4 w-4" /> },
  IMAGE: { label: 'Image', icon: <ImageIcon className="h-4 w-4" />, accept: 'image/*' },
  VIDEO: { label: 'Video', icon: <VideoIcon className="h-4 w-4" />, accept: 'video/mp4' },
  DOCUMENT: {
    label: 'Document',
    icon: <FileText className="h-4 w-4" />,
    accept: '.pdf,.doc,.docx,application/pdf,application/msword',
  },
  LOCATION: { label: 'Location', icon: <MapPin className="h-4 w-4" /> },
};

const HEADER_OPTIONS = HEADER_FORMATS.map((f) => ({
  value: f,
  label: f === 'NONE' ? 'None' : HEADER_META[f].label,
}));

/**
 * Meta's two placeholder styles. A template's body uses one or the other, never
 * both, and a NAMED body is only accepted when the submission says so — which is
 * why hand-typing {{customer_name}} used to be rejected.
 */
type ParamFormat = 'POSITIONAL' | 'NAMED';

const PARAM_FORMAT_OPTIONS: { value: ParamFormat; label: string }[] = [
  { value: 'POSITIONAL', label: 'Numbered {{1}}' },
  { value: 'NAMED', label: 'Named {{name}}' },
];

/**
 * OTP button variants for AUTHENTICATION templates.
 *
 * ONE_TAP and ZERO_TAP are the reason to send an OTP over WhatsApp at all — the
 * code is handed straight to the app instead of being copied by hand — and both
 * need the Android package name and signing-key hash to reach it.
 */
type OtpType = 'COPY_CODE' | 'ONE_TAP' | 'ZERO_TAP';

const OTP_TYPE_OPTIONS: { value: OtpType; label: string }[] = [
  { value: 'COPY_CODE', label: 'Copy code (manual)' },
  { value: 'ONE_TAP', label: 'One-tap autofill (Android)' },
  { value: 'ZERO_TAP', label: 'Zero-tap autofill (Android)' },
];

/** Meta's app signing-key hash is always exactly 11 base64 characters. */
const SIGNATURE_HASH_LEN = 11;

/**
 * Delivery deadline (`message_send_ttl_seconds`) bounds, by category.
 *
 * Without a TTL an OTP queued behind a rate limit is still delivered once the
 * queue drains — landing on the customer's phone minutes after the code it
 * carries has already expired.
 */
const TTL_BOUNDS: Record<string, { min: number; max: number; default: string }> = {
  AUTHENTICATION: { min: 60, max: 600, default: '600' },
  UTILITY: { min: 30, max: 900, default: '' },
};

// ── Button types ─────────────────────────────────────────────────────────────
// VOICE_CALL is deliberately absent. Meta's Calling API is not implemented here —
// no `calls` webhook field, no WaCall model, no way to answer or place one — so a
// template authored with a "Call on WhatsApp" button was approved by Meta and then
// dropped every customer who tapped it into a call nothing in this console could
// pick up.
type ButtonKind = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'FLOW';

interface ButtonDraft {
  /** Stable client key for list rendering. */
  key: string;
  kind: ButtonKind;
  text: string;
  url: string;
  urlExample: string;
  phoneNumber: string;
  copyExample: string;
  flowId: string;
  flowAction: 'navigate' | 'data_exchange';
  navigateScreen: string;
}

const BUTTON_KIND_META: Record<ButtonKind, { label: string; icon: React.ReactNode; hint: string }> =
  {
    QUICK_REPLY: {
      label: 'Quick reply',
      icon: <MessageSquareReply className="h-4 w-4 text-emerald-600" />,
      hint: 'Sends the button text back as a reply.',
    },
    URL: {
      label: 'Visit website',
      icon: <ExternalLink className="h-4 w-4 text-blue-600" />,
      hint: 'Opens a link. A {{1}} in the URL becomes a per-send variable.',
    },
    PHONE_NUMBER: {
      label: 'Call phone number',
      icon: <Phone className="h-4 w-4 text-indigo-600" />,
      hint: 'Dials the configured number.',
    },
    COPY_CODE: {
      label: 'Copy offer code',
      icon: <Ticket className="h-4 w-4 text-amber-600" />,
      hint: 'Recipients tap to copy a promo code.',
    },
    FLOW: {
      label: 'Complete flow',
      icon: <Workflow className="h-4 w-4 text-fuchsia-600" />,
      hint: 'Launches a WhatsApp Flow by id.',
    },
  };

// ── Carousel cards ───────────────────────────────────────────────────────────
/**
 * Meta's carousel rules, and how this editor keeps them.
 *
 * A carousel is one message bubble plus up to ten swipeable cards. Every card
 * must carry the same component shape: a media header of the SAME format, a body,
 * and the same buttons in the same TYPE and ORDER. A mismatch is rejected days
 * later with a reason that names neither card, so the editor is built so the
 * mismatch cannot be expressed: the media format and the button slots are chosen
 * once for the whole carousel, and each card only fills in its own media, text and
 * link.
 */
const MAX_CAROUSEL_CARDS = 10;
/** Two is the point at which a carousel is a carousel — there is nothing to swipe below it. */
const MIN_CAROUSEL_CARDS = 2;
const CARD_BODY_MAX = 160;
const MAX_CARD_BUTTONS = 2;

/**
 * The card button types this editor authors.
 *
 * A card synced from Meta may carry another type (a call button, say); the
 * submission is blocked rather than silently stripped of it — see
 * `unsupportedCardButtons` below.
 */
type CardButtonKind = 'QUICK_REPLY' | 'URL';

/** A card header is media — image or video — and the same on every card. */
type CardMediaFormat = 'IMAGE' | 'VIDEO';

const CARD_BUTTON_KIND_OPTIONS: { value: CardButtonKind; label: string }[] = [
  { value: 'QUICK_REPLY', label: 'Quick reply' },
  { value: 'URL', label: 'Visit website' },
];

/** One card's values for one of the carousel's shared button slots. */
interface CardButtonDraft {
  text: string;
  url: string;
  urlExample: string;
}

interface CarouselCardDraft {
  /** Stable client key for list rendering across add / remove / reorder. */
  key: string;
  /** Meta upload handle for this card's sample media (what the reviewer sees). */
  handle: string;
  fileName: string;
  previewUrl: string;
  uploading: boolean;
  body: string;
  /** Card body examples, keyed by the placeholder token ('1', '2', …). */
  examples: Record<string, string>;
  /** Index-aligned with the carousel's shared button slots. */
  buttons: CardButtonDraft[];
}

const newCardButton = (): CardButtonDraft => ({ text: '', url: '', urlExample: '' });

let cardKeySeq = 0;
function newCard(buttonCount: number): CarouselCardDraft {
  cardKeySeq += 1;
  return {
    key: `card_${cardKeySeq}`,
    handle: '',
    fileName: '',
    previewUrl: '',
    uploading: false,
    body: '',
    examples: {},
    buttons: Array.from({ length: buttonCount }, newCardButton),
  };
}

const MAX_BUTTONS = 10;

let buttonKeySeq = 0;
function newButton(kind: ButtonKind): ButtonDraft {
  buttonKeySeq += 1;
  return {
    key: `btn_${buttonKeySeq}`,
    kind,
    text: kind === 'COPY_CODE' ? '' : BUTTON_KIND_META[kind].label,
    url: '',
    urlExample: '',
    phoneNumber: '',
    copyExample: '',
    flowId: '',
    flowAction: 'navigate',
    navigateScreen: '',
  };
}

/** True for a Meta button type the builder itself can edit. */
const isButtonKind = (type: string): type is ButtonKind => type in BUTTON_KIND_META;

const isNumbered = (token: string) => /^\d+$/.test(token);

/**
 * Distinct {{token}} placeholders, numbered ones ascending then named ones in
 * first-appearance order — the order Meta expects the examples in.
 *
 * This used to match `\{\{(\d+)\}\}` only. A hand-typed {{customer_name}} was
 * therefore invisible to the example collector: the template went to Meta with no
 * example for it and without `parameter_format: NAMED`, and came back rejected
 * days later with nothing in the console explaining why.
 */
function extractVars(text: string): string[] {
  const distinct = Array.from(new Set([...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1])));
  return [
    ...distinct.filter(isNumbered).sort((a, b) => Number(a) - Number(b)),
    ...distinct.filter((t) => !isNumbered(t)),
  ];
}

/** Lowercase snake_case, the only shape Meta accepts for a named parameter. */
function toParamName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ── WhatsApp markdown → React preview ────────────────────────────────────────
/**
 * Render WhatsApp's lightweight markdown (*bold*, _italic_, ~strike~,
 * ```mono```) and {{n}} placeholders into React nodes for the live preview.
 * Intentionally simple — non-overlapping, single-pass — Meta itself renders the
 * canonical version on-device.
 */
function renderWaMarkdown(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  // Order matters: monospace fences first (greedy ```), then single-char marks,
  // then variable chips. Each regex captures its inner content.
  // The chip branch matches \w+ rather than \d+ so a named ({{customer_name}})
  // placeholder previews as a variable chip instead of as literal braces.
  const pattern = /```([\s\S]+?)```|\*([^*\n]+?)\*|_([^_\n]+?)_|~([^~\n]+?)~|\{\{\s*(\w+)\s*\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) tokens.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      tokens.push(
        <code key={i++} className="rounded bg-black/5 px-1 font-mono text-[0.92em]">
          {m[1]}
        </code>,
      );
    } else if (m[2] !== undefined) {
      tokens.push(<strong key={i++}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      tokens.push(<em key={i++}>{m[3]}</em>);
    } else if (m[4] !== undefined) {
      tokens.push(<s key={i++}>{m[4]}</s>);
    } else if (m[5] !== undefined) {
      tokens.push(
        <span
          key={i++}
          className="mx-0.5 rounded bg-emerald-100 px-1 text-[0.85em] font-medium text-emerald-700"
        >
          {`{{${m[5]}}}`}
        </span>,
      );
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) tokens.push(text.slice(last));
  return tokens;
}

// ── Body formatting toolbar ──────────────────────────────────────────────────
function FormatBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded-md border border-[var(--border)] bg-white p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
    >
      {icon}
    </button>
  );
}

interface TemplateBuilderProps {
  onClose: () => void;
  /**
   * When provided, the builder opens on this template instead of creating one.
   *
   * A template that has reached Meta is EDITED: name and language are immutable
   * there, so those inputs are locked, and the resubmission returns it to
   * PENDING. Without an edit path a REJECTED template was a permanent dead end,
   * because its name stays reserved forever and it could not even be recreated.
   *
   * A template that has NOT reached Meta (metaId null) is a local draft being
   * continued, which routes to the create path — see `isEdit` below.
   */
  template?: WaTemplate | null;
  /**
   * Seed a NEW template from an existing one — the "add another language" flow.
   *
   * Every component is copied, INCLUDING a media header's uploaded sample handle,
   * which Meta accepts verbatim on the new submission. Rolling one template out
   * to five Indian languages used to mean five full manual re-authorings, header
   * upload included, with nothing keeping the five structures in sync.
   */
  cloneFrom?: WaTemplate | null;
}

export default function TemplateBuilder({ onClose, template, cloneFrom }: TemplateBuilderProps) {
  const qc = useQueryClient();
  /**
   * Only a template that actually reached Meta can be EDITED.
   *
   * `editTemplate` POSTs to the template's metaId and throws
   * WA_TEMPLATE_NOT_SUBMITTED without one, so a re-opened local draft has to
   * route to the create path instead — whose upsert on (name, language) updates
   * the very draft row being continued rather than leaving an orphan behind.
   */
  const isEdit = !!template?.metaId;
  const isDraft = !!template && !template.metaId;
  /** Where the form's content comes from: the row being opened, or the clone source. */
  const source = template ?? cloneFrom ?? null;

  // Hydrate from the stored components — the exact inverse of the assembly below.
  const seed = useMemo(() => {
    const cs = Array.isArray(source?.components)
      ? (source.components as Array<Record<string, unknown>>)
      : [];
    const find = (t: string) => cs.find((c) => String(c.type ?? '').toUpperCase() === t);
    const h = find('HEADER');
    const b = find('BODY');
    const f = find('FOOTER');
    const btns = find('BUTTONS');
    const bodyText = typeof b?.text === 'string' ? b.text : '';
    // Meta stores the approved examples on the component itself, and the sync
    // persists them verbatim. Re-reading them means an edit doesn't force the
    // operator to retype every example just to change one word of the body.
    const bodyExample = (b?.example ?? {}) as {
      body_text?: unknown;
      body_text_named_params?: unknown;
    };
    const examples: Record<string, string> = {};
    const namedSamples = bodyExample.body_text_named_params;
    if (Array.isArray(namedSamples)) {
      for (const s of namedSamples as Array<Record<string, unknown>>) {
        if (typeof s?.param_name === 'string') examples[s.param_name] = String(s.example ?? '');
      }
    } else if (Array.isArray(bodyExample.body_text) && Array.isArray(bodyExample.body_text[0])) {
      (bodyExample.body_text[0] as unknown[]).forEach((v, i) => {
        examples[String(i + 1)] = String(v ?? '');
      });
    }
    // The OTP button carries the whole authentication configuration. Without
    // reading it back, editing a ONE_TAP template silently resubmitted it as a
    // plain COPY_CODE one and Android autofill stopped working.
    const otp = Array.isArray(btns?.buttons)
      ? (btns.buttons as Array<Record<string, unknown>>).find(
          (x) => String(x.type ?? '').toUpperCase() === 'OTP',
        )
      : undefined;
    // The header's approved sample. Meta keeps both on the component itself, and
    // neither was read back: reopening a media-header template showed no sample,
    // so the submission was blocked until the operator re-uploaded the original
    // file — which, for a template authored months earlier, they may not have.
    const headerExample = (h?.example ?? {}) as { header_text?: unknown; header_handle?: unknown };
    const headerTextSample =
      Array.isArray(headerExample.header_text) && typeof headerExample.header_text[0] === 'string'
        ? headerExample.header_text[0]
        : '';
    const headerHandleSample =
      Array.isArray(headerExample.header_handle) &&
      typeof headerExample.header_handle[0] === 'string'
        ? headerExample.header_handle[0]
        : '';

    // The marketing add-ons emit real components, so they have to be read back
    // too — otherwise resubmitting an edited template silently dropped the offer
    // countdown and the catalog button.
    const lto = cs.find((c) => String(c.type ?? '').toUpperCase() === 'LIMITED_TIME_OFFER');
    const ltoOffer = (lto?.limited_time_offer ?? {}) as { text?: unknown };
    const storedButtons = Array.isArray(btns?.buttons)
      ? (btns.buttons as Array<Record<string, unknown>>)
      : [];

    // The carousel, when the template has one. Read back for the same reason the
    // buttons are: an edit that did not seed them would resubmit the template with
    // its whole carousel stripped, and every recipient would get the bubble alone.
    const carousel = cs.find((c) => String(c.type ?? '').toUpperCase() === 'CAROUSEL');
    const rawCards = Array.isArray(carousel?.cards)
      ? (carousel.cards as Array<Record<string, unknown>>)
      : [];
    const cardFind = (card: Record<string, unknown>, t: string) => {
      const comps = Array.isArray(card.components)
        ? (card.components as Array<Record<string, unknown>>)
        : [];
      return comps.find((c) => String(c.type ?? '').toUpperCase() === t);
    };
    const cardButtonsOf = (card: Record<string, unknown>): Array<Record<string, unknown>> => {
      const btns = cardFind(card, 'BUTTONS')?.buttons;
      return Array.isArray(btns) ? (btns as Array<Record<string, unknown>>) : [];
    };
    // The button slots are the carousel's, not the card's: Meta requires the same
    // types in the same order on every card, so the first card defines them.
    const firstCardButtons = rawCards.length ? cardButtonsOf(rawCards[0]) : [];
    const cardButtonKinds = firstCardButtons
      .map((b) => String(b.type ?? '').toUpperCase())
      .filter((t): t is CardButtonKind => t === 'QUICK_REPLY' || t === 'URL');
    const seededCards: CarouselCardDraft[] = rawCards.map((card) => {
      const header = cardFind(card, 'HEADER');
      const body = cardFind(card, 'BODY');
      const headerHandle = (header?.example ?? {}) as { header_handle?: unknown };
      const handle =
        Array.isArray(headerHandle.header_handle) &&
        typeof headerHandle.header_handle[0] === 'string'
          ? headerHandle.header_handle[0]
          : '';
      const cardExample = (body?.example ?? {}) as { body_text?: unknown };
      const row =
        Array.isArray(cardExample.body_text) && Array.isArray(cardExample.body_text[0])
          ? (cardExample.body_text[0] as unknown[])
          : [];
      const examples: Record<string, string> = {};
      row.forEach((v, i) => {
        examples[String(i + 1)] = String(v ?? '');
      });
      const buttons = cardButtonsOf(card);
      return {
        ...newCard(0),
        handle,
        fileName: handle ? 'Sample already uploaded' : '',
        body: typeof body?.text === 'string' ? body.text : '',
        examples,
        buttons: cardButtonKinds.map((_, i) => {
          const b = buttons[i] ?? {};
          const example = Array.isArray(b.example) ? b.example[0] : b.example;
          return {
            text: typeof b.text === 'string' ? b.text : '',
            url: typeof b.url === 'string' ? b.url : '',
            urlExample: typeof example === 'string' ? example : '',
          };
        }),
      };
    });

    return {
      carouselEnabled: rawCards.length > 0,
      carouselMediaFormat: (String(
        cardFind(rawCards[0] ?? {}, 'HEADER')?.format ?? 'IMAGE',
      ).toUpperCase() === 'VIDEO'
        ? 'VIDEO'
        : 'IMAGE') as CardMediaFormat,
      cardButtonKinds,
      /**
       * A card button type this editor cannot author (a call button, say).
       * Resubmitting would silently drop it — as stripping the bubble's buttons
       * once did — so `buildCarouselComponent` refuses and says where to edit it.
       */
      unsupportedCardButtons: firstCardButtons.length !== cardButtonKinds.length,
      cards: seededCards,
      headerFormat: String(h?.format ?? 'NONE').toUpperCase() as HeaderFormat,
      headerText: typeof h?.text === 'string' ? h.text : '',
      headerTextExample: headerTextSample,
      headerHandle: headerHandleSample,
      ltoEnabled: !!lto,
      ltoText: typeof ltoOffer.text === 'string' ? ltoOffer.text : '',
      catalogEnabled: storedButtons.some((x) => String(x.type ?? '').toUpperCase() === 'CATALOG'),
      body: bodyText,
      bodyExamples: examples,
      // A body with {{word}} placeholders IS a named template — Meta rejects it
      // unless the submission says so.
      paramFormat: extractVars(bodyText).some((v) => !isNumbered(v))
        ? ('NAMED' as ParamFormat)
        : ('POSITIONAL' as ParamFormat),
      footer: typeof f?.text === 'string' ? f.text : '',
      addSecurityNote: (b?.add_security_recommendation as boolean | undefined) !== false,
      codeExpiryMinutes:
        typeof f?.code_expiration_minutes === 'number' ? String(f.code_expiration_minutes) : '10',
      otpType: String(otp?.otp_type ?? 'COPY_CODE').toUpperCase() as OtpType,
      otpButtonText: typeof otp?.text === 'string' ? otp.text : 'Copy code',
      autofillText: typeof otp?.autofill_text === 'string' ? otp.autofill_text : 'Autofill',
      packageName: typeof otp?.package_name === 'string' ? otp.package_name : '',
      signatureHash: typeof otp?.signature_hash === 'string' ? otp.signature_hash : '',
      zeroTapTermsAccepted: otp?.zero_tap_terms_accepted === true,
      /**
       * The buttons as editable drafts.
       *
       * This used to be computed and then never consumed — the buttons state was
       * initialised to `[]` regardless — so opening any template with buttons
       * showed an empty button list, and saving that edit resubmitted the
       * template to META WITH ITS BUTTONS STRIPPED. Every customer who would
       * have tapped "Track order" got a bare message instead.
       *
       * OTP is skipped (the authentication panel owns it) and so is CATALOG (the
       * marketing add-on owns it); both are seeded from their own branches.
       */
      buttons: storedButtons
        .map((x) => {
          const kind = String(x.type ?? '').toUpperCase();
          if (!isButtonKind(kind)) return null;
          const example = Array.isArray(x.example) ? x.example[0] : x.example;
          const sample = typeof example === 'string' ? example : '';
          return {
            ...newButton(kind),
            text: typeof x.text === 'string' ? x.text : '',
            url: typeof x.url === 'string' ? x.url : '',
            urlExample: kind === 'URL' ? sample : '',
            phoneNumber: typeof x.phone_number === 'string' ? x.phone_number : '',
            copyExample: kind === 'COPY_CODE' ? sample : '',
            flowId: x.flow_id != null ? String(x.flow_id) : '',
            flowAction: x.flow_action === 'data_exchange' ? 'data_exchange' : 'navigate',
            navigateScreen: typeof x.navigate_screen === 'string' ? x.navigate_screen : '',
          } satisfies ButtonDraft;
        })
        .filter((b): b is ButtonDraft => b !== null),
    };
  }, [source]);

  // ── Shared fields ──
  const [name, setName] = useState(source?.name ?? '');
  // A clone is "the same template in another language", so the language is the
  // one thing that must be chosen: prefilling it would submit a duplicate of the
  // source under a name Meta has already claimed.
  const [language, setLanguage] = useState(cloneFrom ? '' : (template?.language ?? 'en_US'));
  const [category, setCategory] = useState<string>(source?.category ?? 'UTILITY');

  // ── Header ──
  const [headerFormat, setHeaderFormat] = useState<HeaderFormat>(seed.headerFormat);
  const [headerText, setHeaderText] = useState(seed.headerText);
  const [headerTextExample, setHeaderTextExample] = useState(seed.headerTextExample);
  const [headerHandle, setHeaderHandle] = useState(seed.headerHandle);
  const [headerFileName, setHeaderFileName] = useState(
    seed.headerHandle ? 'Sample already uploaded' : '',
  );
  const [headerPreviewUrl, setHeaderPreviewUrl] = useState('');
  const [uploadingHeader, setUploadingHeader] = useState(false);

  // ── Body ──
  const [body, setBody] = useState(seed.body);
  // Keyed by the placeholder TOKEN ('1' or 'customer_name'), not by index — the
  // collector only understood numbers, so a named placeholder got no example.
  const [bodyExamples, setBodyExamples] = useState<Record<string, string>>(seed.bodyExamples);
  const [paramFormat, setParamFormat] = useState<ParamFormat>(seed.paramFormat);
  // Name for the next named placeholder the toolbar inserts.
  const [newVarName, setNewVarName] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // ── Footer ──
  const [footer, setFooter] = useState(seed.footer);

  // ── Buttons ──
  const [buttons, setButtons] = useState<ButtonDraft[]>(seed.buttons);
  const [buttonMenuOpen, setButtonMenuOpen] = useState(false);
  const buttonMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(buttonMenuRef, () => setButtonMenuOpen(false), buttonMenuOpen);

  // ── Authentication-only options ──
  const [addSecurityNote, setAddSecurityNote] = useState(seed.addSecurityNote);
  const [codeExpiryMinutes, setCodeExpiryMinutes] = useState(seed.codeExpiryMinutes);
  const [otpButtonText, setOtpButtonText] = useState(seed.otpButtonText);
  const [otpType, setOtpType] = useState<OtpType>(seed.otpType);
  const [autofillText, setAutofillText] = useState(seed.autofillText);
  const [packageName, setPackageName] = useState(seed.packageName);
  const [signatureHash, setSignatureHash] = useState(seed.signatureHash);
  // Meta refuses a ZERO_TAP template outright unless the submission carries the
  // terms acknowledgement, and the rejection names no field — so picking
  // "Zero-tap autofill" used to fail at Meta with nothing to act on.
  const [zeroTapTermsAccepted, setZeroTapTermsAccepted] = useState(seed.zeroTapTermsAccepted);

  // ── Delivery deadline (message_send_ttl_seconds) ──
  // Blank on an edit: Meta does not return the current value with the template,
  // so pre-filling a default would quietly rewrite whatever is set there. Blank
  // omits the field, which leaves Meta's value alone.
  const [sendTtlSeconds, setSendTtlSeconds] = useState(
    isEdit ? '' : (TTL_BOUNDS[category]?.default ?? ''),
  );

  // ── Marketing add-ons (ported verbatim) ──
  const marketingAddOns = useMarketingAddOnState({
    ltoEnabled: seed.ltoEnabled,
    ltoText: seed.ltoText,
    catalogEnabled: seed.catalogEnabled,
  });

  const isAuth = category === 'AUTHENTICATION';
  const isMarketing = category === 'MARKETING';
  const bodyVars = extractVars(body);
  const numberedBodyVars = bodyVars.filter(isNumbered);
  const namedBodyVars = bodyVars.filter((v) => !isNumbered(v));
  const headerHasVar = /\{\{\s*\w+\s*\}\}/.test(headerText);
  const ttlBounds = TTL_BOUNDS[category];

  // ── Body toolbar: wrap the current selection with WhatsApp markers ──
  const wrapSelection = (marker: string, endMarker = marker) => {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const selected = body.slice(start, end) || 'text';
    const next = body.slice(0, start) + marker + selected + endMarker + body.slice(end);
    setBody(next);
    // Restore selection around the wrapped text on the next frame.
    requestAnimationFrame(() => {
      ta.focus();
      const selStart = start + marker.length;
      ta.setSelectionRange(selStart, selStart + selected.length);
    });
  };

  /** The token the toolbar will insert next, given the chosen placeholder style. */
  const nextVarToken = (): string | null => {
    if (paramFormat === 'POSITIONAL') {
      const nums = numberedBodyVars.map(Number);
      return String(nums.length ? Math.max(...nums) + 1 : 1);
    }
    const name = toParamName(newVarName);
    if (!name) return null;
    if (bodyVars.includes(name)) return null;
    return name;
  };

  const addBodyVariable = () => {
    const next = nextVarToken();
    if (!next) {
      showToast.error(
        bodyVars.includes(toParamName(newVarName))
          ? 'That variable name is already used in the body'
          : 'Enter a name for the variable (letters, numbers and underscores)',
      );
      return;
    }
    if (paramFormat === 'NAMED') setNewVarName('');
    const ta = bodyRef.current;
    if (!ta) {
      setBody((b) => `${b}{{${next}}}`);
      return;
    }
    const pos = ta.selectionStart ?? body.length;
    const placeholder = `{{${next}}}`;
    const updated = body.slice(0, pos) + placeholder + body.slice(pos);
    setBody(updated);
    requestAnimationFrame(() => {
      ta.focus();
      const caret = pos + placeholder.length;
      ta.setSelectionRange(caret, caret);
    });
  };

  // ── Header media upload ──
  const onHeaderFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadingHeader(true);
    try {
      const handle = await svc.uploadHeaderSample(file);
      setHeaderHandle(handle);
      setHeaderFileName(file.name);
      // Local object URL preview for images only; revoke prior one if present.
      setHeaderPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
      });
    } catch (err) {
      showToast.error((err as unknown as ApiError).message || 'Failed to upload sample');
    } finally {
      setUploadingHeader(false);
    }
  };

  const clearHeaderMedia = () => {
    setHeaderHandle('');
    setHeaderFileName('');
    setHeaderPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  };

  // ── Buttons mutation helpers ──
  const addButton = (kind: ButtonKind) => {
    setButtons((b) => [...b, newButton(kind)]);
    setButtonMenuOpen(false);
  };
  const updateButton = (key: string, patch: Partial<ButtonDraft>) =>
    setButtons((b) => b.map((btn) => (btn.key === key ? { ...btn, ...patch } : btn)));
  const removeButton = (key: string) => setButtons((b) => b.filter((btn) => btn.key !== key));
  const moveButton = (key: string, dir: -1 | 1) =>
    setButtons((b) => {
      const idx = b.findIndex((btn) => btn.key === key);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= b.length) return b;
      const next = [...b];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });

  // ── Carousel cards ──
  // The media format and the button slots belong to the CAROUSEL, not to a card:
  // Meta requires every card to carry the same header format and the same buttons
  // in the same order, so holding them once makes a mismatch unexpressible.
  const [carouselEnabled, setCarouselEnabled] = useState(seed.carouselEnabled);
  const [carouselMediaFormat, setCarouselMediaFormat] = useState<CardMediaFormat>(
    seed.carouselMediaFormat,
  );
  const [cardButtonKinds, setCardButtonKinds] = useState<CardButtonKind[]>(seed.cardButtonKinds);
  const [cards, setCards] = useState<CarouselCardDraft[]>(seed.cards);

  const updateCard = (key: string, patch: Partial<CarouselCardDraft>) =>
    setCards((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const removeCard = (key: string) =>
    setCards((cs) => {
      const gone = cs.find((c) => c.key === key);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return cs.filter((c) => c.key !== key);
    });
  const moveCard = (key: string, dir: -1 | 1) =>
    setCards((cs) => {
      const idx = cs.findIndex((c) => c.key === key);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= cs.length) return cs;
      const next = [...cs];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  const addCard = () =>
    setCards((cs) =>
      cs.length >= MAX_CAROUSEL_CARDS ? cs : [...cs, newCard(cardButtonKinds.length)],
    );
  const updateCardButton = (key: string, index: number, patch: Partial<CardButtonDraft>) =>
    setCards((cs) =>
      cs.map((c) =>
        c.key === key
          ? { ...c, buttons: c.buttons.map((b, i) => (i === index ? { ...b, ...patch } : b)) }
          : c,
      ),
    );
  /** Add the same button slot to every card at once — that is Meta's rule, kept structurally. */
  const addCardButtonSlot = (kind: CardButtonKind) => {
    if (cardButtonKinds.length >= MAX_CARD_BUTTONS) return;
    setCardButtonKinds((k) => [...k, kind]);
    setCards((cs) => cs.map((c) => ({ ...c, buttons: [...c.buttons, newCardButton()] })));
  };
  const removeCardButtonSlot = (index: number) => {
    setCardButtonKinds((k) => k.filter((_, i) => i !== index));
    setCards((cs) => cs.map((c) => ({ ...c, buttons: c.buttons.filter((_, i) => i !== index) })));
  };

  /**
   * Turning the carousel on starts it with two cards — one card has nothing to
   * swipe to, which is what Meta's minimum is about.
   *
   * The bubble's header, footer and buttons stay in state but stop being emitted:
   * Meta rejects all three on a carousel (the media and the buttons belong to the
   * cards), and keeping the values means turning the carousel back off restores
   * the template the operator had.
   */
  const toggleCarousel = (on: boolean) => {
    setCarouselEnabled(on);
    if (on && cards.length === 0) {
      setCards([newCard(cardButtonKinds.length), newCard(cardButtonKinds.length)]);
    }
  };

  /** Upload one card's sample media and keep the handle Meta hands back. */
  const onCardFile = async (key: string, file: File | undefined) => {
    if (!file) return;
    updateCard(key, { uploading: true });
    try {
      const handle = await svc.uploadHeaderSample(file);
      setCards((cs) =>
        cs.map((c) => {
          if (c.key !== key) return c;
          if (c.previewUrl) URL.revokeObjectURL(c.previewUrl);
          return {
            ...c,
            handle,
            fileName: file.name,
            uploading: false,
            previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
          };
        }),
      );
    } catch (err) {
      updateCard(key, { uploading: false });
      showToast.error((err as unknown as ApiError).message || 'Failed to upload the card sample');
    }
  };

  /**
   * The CAROUSEL component, or the first thing stopping it from being submitted.
   *
   * Returns an error string rather than throwing, exactly as the button builder
   * does, so the wizard can name the card the operator has to go back to.
   */
  const buildCarouselComponent = (): { component?: unknown; error?: string } => {
    if (seed.unsupportedCardButtons) {
      return {
        error:
          'This carousel has a card button type this editor cannot change. Edit it in Meta Business Manager, or the resubmission would drop it.',
      };
    }
    if (cards.length < MIN_CAROUSEL_CARDS) {
      return { error: `A carousel needs at least ${MIN_CAROUSEL_CARDS} cards` };
    }
    if (cards.length > MAX_CAROUSEL_CARDS) {
      return { error: `A carousel can have at most ${MAX_CAROUSEL_CARDS} cards` };
    }
    const out: unknown[] = [];
    for (const [i, card] of cards.entries()) {
      const label = `Card ${i + 1}`;
      if (!card.handle) {
        return {
          error: `${label} needs a sample ${carouselMediaFormat.toLowerCase()} — Meta reviews every card against one`,
        };
      }
      const body = card.body.trim();
      if (!body) return { error: `${label} needs body text` };
      if (body.length > CARD_BODY_MAX) {
        return { error: `${label}'s text is limited to ${CARD_BODY_MAX} characters` };
      }
      const vars = extractVars(body);
      if (vars.some((v) => !isNumbered(v))) {
        // A card parameter is sent with no `parameter_name`, so a named card
        // placeholder is approved and then refused on every send with (#131008).
        return {
          error: `${label} must use numbered {{1}} placeholders — named ones are supported in the message bubble only`,
        };
      }
      const missing = vars.filter((v) => !card.examples[v]?.trim());
      if (missing.length) {
        return {
          error: `${label} needs an example value for ${missing.map((v) => `{{${v}}}`).join(', ')}`,
        };
      }
      const cardComponents: unknown[] = [
        {
          type: 'HEADER',
          format: carouselMediaFormat,
          example: { header_handle: [card.handle] },
        },
        {
          type: 'BODY',
          text: body,
          ...(vars.length
            ? { example: { body_text: [vars.map((v) => card.examples[v]!.trim())] } }
            : {}),
        },
      ];
      const cardButtons: unknown[] = [];
      for (const [bi, kind] of cardButtonKinds.entries()) {
        const draft = card.buttons[bi] ?? newCardButton();
        const text = draft.text.trim();
        if (!text) return { error: `${label}'s button ${bi + 1} needs a label` };
        if (kind === 'QUICK_REPLY') {
          cardButtons.push({ type: 'QUICK_REPLY', text });
          continue;
        }
        const url = draft.url.trim();
        if (!url) return { error: `${label}'s button ${bi + 1} needs a URL` };
        const urlBtn: Record<string, unknown> = { type: 'URL', text, url };
        if (/\{\{1\}\}/.test(url)) {
          const ex = draft.urlExample.trim();
          if (!ex) return { error: `${label}'s button ${bi + 1} needs an example URL` };
          urlBtn.example = [ex];
        }
        cardButtons.push(urlBtn);
      }
      if (cardButtons.length) cardComponents.push({ type: 'BUTTONS', buttons: cardButtons });
      out.push({ components: cardComponents });
    }
    return { component: { type: 'CAROUSEL', cards: out } };
  };

  /**
   * Convert a button draft into the Meta button component shape. Returns a
   * validation error string instead of throwing so the wizard can surface it.
   */
  const buildButtonComponents = (): { buttons: unknown[]; error?: string } => {
    const out: unknown[] = [];
    for (const b of buttons) {
      const text = b.text.trim();
      switch (b.kind) {
        case 'QUICK_REPLY':
          if (!text) return { buttons: [], error: 'Quick-reply buttons need text' };
          out.push({ type: 'QUICK_REPLY', text });
          break;
        case 'URL': {
          if (!text) return { buttons: [], error: 'Website buttons need a label' };
          const url = b.url.trim();
          if (!url) return { buttons: [], error: 'Website buttons need a URL' };
          const urlBtn: Record<string, unknown> = { type: 'URL', text, url };
          if (/\{\{1\}\}/.test(url)) {
            const ex = b.urlExample.trim();
            if (!ex)
              return {
                buttons: [],
                error: 'Provide an example URL for the dynamic website button',
              };
            urlBtn.example = [ex];
          }
          out.push(urlBtn);
          break;
        }
        case 'PHONE_NUMBER': {
          if (!text) return { buttons: [], error: 'Call buttons need a label' };
          const phone = b.phoneNumber.trim();
          if (!phone) return { buttons: [], error: 'Call buttons need a phone number' };
          out.push({ type: 'PHONE_NUMBER', text, phone_number: phone });
          break;
        }
        case 'COPY_CODE': {
          const code = b.copyExample.trim();
          if (!code) return { buttons: [], error: 'Copy-code buttons need a sample code' };
          out.push({ type: 'COPY_CODE', example: code });
          break;
        }
        case 'FLOW': {
          if (!text) return { buttons: [], error: 'Flow buttons need a label' };
          const flowId = b.flowId.trim();
          if (!flowId) return { buttons: [], error: 'Flow buttons need a flow id' };
          const flowBtn: Record<string, unknown> = {
            type: 'FLOW',
            text,
            flow_id: flowId,
            flow_action: b.flowAction,
          };
          if (b.flowAction === 'navigate' && b.navigateScreen.trim()) {
            flowBtn.navigate_screen = b.navigateScreen.trim();
          }
          out.push(flowBtn);
          break;
        }
      }
    }
    return { buttons: out };
  };

  // ── Assemble the components array in Meta's order ──
  const buildStandardComponents = (): {
    components: unknown[];
    variableSample?: unknown;
    error?: string;
  } => {
    const components: unknown[] = [];
    const collectedExamples: Record<string, unknown> = {};

    // HEADER (optional) — but never on a carousel: Meta rejects a bubble header
    // there, because the media belongs to the cards.
    if (carouselEnabled) {
      // Nothing to emit for the bubble; the cards are appended below.
    } else if (headerFormat === 'TEXT') {
      const text = headerText.trim();
      if (!text) return { components: [], error: 'Header text is required when Header = Text' };
      const header: Record<string, unknown> = { type: 'HEADER', format: 'TEXT', text };
      if (/\{\{\s*\w+\s*\}\}/.test(text)) {
        // A header text parameter goes out with no `parameter_name`, so a named
        // header would be approved by Meta and then rejected on every send with
        // (#131008). Block it here rather than ship an unsendable template.
        if (paramFormat === 'NAMED' || !/\{\{\s*\d+\s*\}\}/.test(text)) {
          return {
            components: [],
            error:
              'The header variable must be numbered ({{1}}) — named placeholders are supported in the body only',
          };
        }
        const sample = headerTextExample.trim();
        if (!sample) return { components: [], error: 'Provide an example for the header variable' };
        header.example = { header_text: [sample] };
        collectedExamples.header_text = [sample];
      }
      components.push(header);
    } else if (
      headerFormat === 'IMAGE' ||
      headerFormat === 'VIDEO' ||
      headerFormat === 'DOCUMENT'
    ) {
      if (!headerHandle)
        return {
          components: [],
          error: `Upload a sample ${headerFormat.toLowerCase()} for the header`,
        };
      components.push({
        type: 'HEADER',
        format: headerFormat,
        example: { header_handle: [headerHandle] },
      });
      collectedExamples.header_handle = [headerHandle];
    } else if (headerFormat === 'LOCATION') {
      components.push({ type: 'HEADER', format: 'LOCATION' });
    }

    // BODY (required)
    const bodyText = body.trim();
    if (!bodyText) return { components: [], error: 'Body text is required' };
    const bodyComp: Record<string, unknown> = { type: 'BODY', text: bodyText };
    // Meta accepts one placeholder style per template. Mixing them is rejected,
    // and so is a {{word}} body submitted as positional — which is exactly what
    // hand-typing a name used to produce.
    if (numberedBodyVars.length && namedBodyVars.length) {
      return {
        components: [],
        error:
          'Use either numbered {{1}} or named {{customer_name}} placeholders in the body, not both',
      };
    }
    if (paramFormat === 'NAMED' && numberedBodyVars.length) {
      return {
        components: [],
        error: 'This template is set to named placeholders — replace {{1}} with a name',
      };
    }
    if (paramFormat === 'POSITIONAL' && namedBodyVars.length) {
      return {
        components: [],
        error: `Switch the body to named placeholders, or replace {{${namedBodyVars[0]}}} with a number`,
      };
    }
    if (bodyVars.length) {
      // Never invent example values.
      //
      // Blank examples used to be filled with a literal "Sample 1". Meta requires
      // examples for body variables and its reviewers judge the template by them, so
      // that substitution bought a rejection days later — and the operator was never
      // told it happened, having simply left the field empty. The header path already
      // blocks on a missing example; the body now matches it.
      const missing = bodyVars.filter((n) => !bodyExamples[n]?.trim());
      if (missing.length)
        return {
          components: [],
          error:
            `Provide an example value for ${missing.length === 1 ? 'variable' : 'variables'} ` +
            missing.map((n) => `{{${n}}}`).join(', '),
        };
      if (paramFormat === 'NAMED') {
        // Named templates carry one example PER NAME, not a positional array.
        const namedSamples = bodyVars.map((n) => ({
          param_name: n,
          example: bodyExamples[n]!.trim(),
        }));
        bodyComp.example = { body_text_named_params: namedSamples };
        collectedExamples.body_text_named_params = namedSamples;
      } else {
        const samples = bodyVars.map((n) => bodyExamples[n]!.trim());
        bodyComp.example = { body_text: [samples] };
        collectedExamples.body_text = [samples];
      }
    }
    components.push(bodyComp);

    // FOOTER (optional). Skipped on a carousel for the same reason as the header.
    if (!carouselEnabled && footer.trim()) {
      components.push({ type: 'FOOTER', text: footer.trim() });
    }

    // CAROUSEL. It replaces the bubble's buttons rather than joining them: a
    // carousel's buttons live on the cards, and Meta rejects a bubble button row
    // beside one — which is also why the marketing add-ons (they append a bubble
    // button) are skipped here and hidden in the form.
    if (carouselEnabled) {
      const carousel = buildCarouselComponent();
      if (carousel.error) return { components: [], error: carousel.error };
      components.push(carousel.component);
      const sample = Object.keys(collectedExamples).length ? collectedExamples : undefined;
      return { components, variableSample: sample };
    }

    // BUTTONS (optional) — our own builder, then the marketing add-ons append
    // onto the same single BUTTONS component (Meta caps it at 10).
    const built = buildButtonComponents();
    if (built.error) return { components: [], error: built.error };
    const buttonEntries = [...built.buttons];

    if (isMarketing) {
      // Coupon copy-code button / catalog button live in the same BUTTONS list,
      // while LIMITED_TIME_OFFER is its own component. buildMarketingAddOnComponents
      // validates the catalog-sole-button and 10-button rules against our count.
      const addOns = buildMarketingAddOnComponents(marketingAddOns, buttonEntries.length);
      if (addOns.error) return { components: [], error: addOns.error };
      for (const comp of addOns.components) {
        if (comp && typeof comp === 'object' && (comp as { type?: string }).type === 'BUTTONS') {
          buttonEntries.push(...((comp as { buttons: unknown[] }).buttons ?? []));
        } else {
          components.push(comp);
        }
      }
    }

    if (buttonEntries.length > MAX_BUTTONS) {
      return { components: [], error: `A template can have at most ${MAX_BUTTONS} buttons` };
    }
    if (buttonEntries.length) {
      components.push({ type: 'BUTTONS', buttons: buttonEntries });
    }

    const variableSample = Object.keys(collectedExamples).length ? collectedExamples : undefined;
    return { components, variableSample };
  };

  /**
   * `message_send_ttl_seconds`, when the category supports one and a value was
   * entered. Undefined leaves the field off the payload entirely, which is what
   * Meta expects for "no deadline".
   */
  const sendTtlValue = (): number | undefined => {
    if (!ttlBounds || !sendTtlSeconds.trim()) return undefined;
    const n = Number(sendTtlSeconds);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  };

  /**
   * The components of an AUTHENTICATION template. Meta writes the body itself;
   * everything configurable lives on the OTP button and the expiry footer.
   */
  const buildAuthComponents = (): unknown[] => {
    const expiry = Number(codeExpiryMinutes);
    const authComponents: unknown[] = [
      { type: 'BODY', add_security_recommendation: addSecurityNote },
    ];
    if (Number.isFinite(expiry) && expiry > 0) {
      authComponents.push({ type: 'FOOTER', code_expiration_minutes: expiry });
    }
    // ONE_TAP / ZERO_TAP hand the code straight to the Android app, which is
    // only possible when Meta can verify the app it is handing it to — hence
    // the package name and signing-key hash. COPY_CODE takes neither.
    const otpButton: Record<string, unknown> = {
      type: 'OTP',
      otp_type: otpType,
      text: otpButtonText.trim() || 'Copy code',
    };
    if (otpType !== 'COPY_CODE') {
      otpButton.autofill_text = autofillText.trim() || 'Autofill';
      otpButton.package_name = packageName.trim();
      otpButton.signature_hash = signatureHash.trim();
    }
    // ZERO_TAP additionally requires the business to accept Meta's zero-tap
    // terms in the submission itself; submit() has already made the operator
    // tick the box.
    if (otpType === 'ZERO_TAP') otpButton.zero_tap_terms_accepted = true;
    authComponents.push({ type: 'BUTTONS', buttons: [otpButton] });
    return authComponents;
  };

  /**
   * The components exactly as they stand, with none of the submission gates.
   *
   * A draft is half-finished by definition — that is the whole point of saving
   * one — so refusing to store it until every example is filled in would defeat
   * the purpose. Nothing here goes to Meta: the backend applies the full
   * structural rules when the draft is actually submitted, which is the call
   * that spends the template name.
   */
  const draftComponents = (): unknown[] => {
    const components: unknown[] = [];

    if (headerFormat === 'TEXT' && headerText.trim()) {
      const header: Record<string, unknown> = {
        type: 'HEADER',
        format: 'TEXT',
        text: headerText.trim(),
      };
      if (headerTextExample.trim()) header.example = { header_text: [headerTextExample.trim()] };
      components.push(header);
    } else if (
      headerFormat === 'IMAGE' ||
      headerFormat === 'VIDEO' ||
      headerFormat === 'DOCUMENT'
    ) {
      // Keeping the handle is the main reason to save a draft at all: it comes
      // from an upload session that cannot be replayed without the original file.
      components.push({
        type: 'HEADER',
        format: headerFormat,
        ...(headerHandle ? { example: { header_handle: [headerHandle] } } : {}),
      });
    } else if (headerFormat === 'LOCATION') {
      components.push({ type: 'HEADER', format: 'LOCATION' });
    }

    const bodyComp: Record<string, unknown> = { type: 'BODY', text: body.trim() };
    // Examples are stored only once they are complete — a half-filled example
    // array is not a shape Meta or our own validator can make sense of.
    if (bodyVars.length && bodyVars.every((n) => bodyExamples[n]?.trim())) {
      bodyComp.example =
        paramFormat === 'NAMED'
          ? {
              body_text_named_params: bodyVars.map((n) => ({
                param_name: n,
                example: bodyExamples[n]!.trim(),
              })),
            }
          : { body_text: [bodyVars.map((n) => bodyExamples[n]!.trim())] };
    }
    components.push(bodyComp);

    if (footer.trim()) components.push({ type: 'FOOTER', text: footer.trim() });

    // Partial buttons are kept as-is rather than dropped, so an unfinished
    // button survives the round trip to be finished later.
    const buttonEntries: unknown[] = buttons.map((b) => {
      switch (b.kind) {
        case 'URL': {
          const btn: Record<string, unknown> = {
            type: 'URL',
            text: b.text.trim(),
            url: b.url.trim(),
          };
          if (b.urlExample.trim()) btn.example = [b.urlExample.trim()];
          return btn;
        }
        case 'PHONE_NUMBER':
          return { type: 'PHONE_NUMBER', text: b.text.trim(), phone_number: b.phoneNumber.trim() };
        case 'COPY_CODE':
          return { type: 'COPY_CODE', example: b.copyExample.trim() };
        case 'FLOW':
          return {
            type: 'FLOW',
            text: b.text.trim(),
            flow_id: b.flowId.trim(),
            flow_action: b.flowAction,
            ...(b.navigateScreen.trim() ? { navigate_screen: b.navigateScreen.trim() } : {}),
          };
        default:
          return { type: 'QUICK_REPLY', text: b.text.trim() };
      }
    });

    if (isMarketing) {
      const addOns = buildMarketingAddOnComponents(marketingAddOns, buttonEntries.length);
      // An add-on that does not validate yet is simply not stored; the operator
      // is mid-edit, and the save must not fail on it.
      if (!addOns.error) {
        for (const comp of addOns.components) {
          if (comp && typeof comp === 'object' && (comp as { type?: string }).type === 'BUTTONS') {
            buttonEntries.push(...((comp as { buttons: unknown[] }).buttons ?? []));
          } else {
            components.push(comp);
          }
        }
      }
    }

    if (buttonEntries.length) components.push({ type: 'BUTTONS', buttons: buttonEntries });

    if (carouselEnabled && cards.length) {
      components.push({
        type: 'CAROUSEL',
        cards: cards.map((card) => {
          const cardComponents: unknown[] = [
            {
              type: 'HEADER',
              format: carouselMediaFormat,
              ...(card.handle ? { example: { header_handle: [card.handle] } } : {}),
            },
            { type: 'BODY', text: card.body.trim() },
          ];
          const cardButtons = cardButtonKinds.map((kind, bi) => {
            const draft = card.buttons[bi] ?? newCardButton();
            return kind === 'QUICK_REPLY'
              ? { type: 'QUICK_REPLY', text: draft.text.trim() }
              : {
                  type: 'URL',
                  text: draft.text.trim(),
                  url: draft.url.trim(),
                  ...(draft.urlExample.trim() ? { example: [draft.urlExample.trim()] } : {}),
                };
          });
          if (cardButtons.length) cardComponents.push({ type: 'BUTTONS', buttons: cardButtons });
          return { components: cardComponents };
        }),
      });
    }
    return components;
  };

  const mutation = useMutation({
    mutationFn: () => {
      const messageSendTtlSeconds = sendTtlValue();
      // ── Authentication (OTP) templates ──────────────────────────────────
      if (isAuth) {
        const authComponents = buildAuthComponents();
        // Name and language are immutable at Meta, so an edit resubmits only the
        // category and components.
        return isEdit
          ? svc.editTemplate(template!.id, {
              category,
              components: authComponents,
              messageSendTtlSeconds,
            })
          : svc.createTemplate({
              name: name.trim(),
              language: language.trim(),
              category,
              components: authComponents,
              messageSendTtlSeconds,
            });
      }

      // ── Marketing / Utility templates ───────────────────────────────────
      const built = buildStandardComponents();
      // submit() validated already; defensively re-check.
      if (built.error) return Promise.reject(new Error(built.error));
      // Only declared when the body actually has placeholders — the field is
      // meaningless otherwise, and POSITIONAL is Meta's default anyway.
      const parameterFormat = bodyVars.length ? paramFormat : undefined;
      return isEdit
        ? svc.editTemplate(template!.id, {
            category,
            components: built.components,
            variableSample: built.variableSample,
            parameterFormat,
            messageSendTtlSeconds,
          })
        : svc.createTemplate({
            name: name.trim(),
            language: language.trim(),
            category,
            components: built.components,
            variableSample: built.variableSample,
            parameterFormat,
            messageSendTtlSeconds,
          });
    },
    onSuccess: () => {
      showToast.success(
        isEdit
          ? 'Template updated and resubmitted — Meta re-reviews every edit'
          : 'Template submitted to Meta for review',
      );
      qc.invalidateQueries({ queryKey: ['wa-templates'] });
      onClose();
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to create template'),
  });

  /**
   * Save without submitting (status LOCAL).
   *
   * The builder had exactly two actions — Cancel and Submit — so a half-finished
   * template could not be kept at all: closing the dialog discarded everything,
   * including an uploaded header sample whose handle cannot be recovered without
   * the original file.
   */
  const draftMutation = useMutation({
    mutationFn: () =>
      svc.saveTemplateDraft({
        name: name.trim(),
        language: language.trim(),
        category,
        components: isAuth ? buildAuthComponents() : draftComponents(),
      }),
    onSuccess: () => {
      showToast.success('Draft saved — it is not submitted to Meta until you say so');
      qc.invalidateQueries({ queryKey: ['wa-templates'] });
      onClose();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to save draft'),
  });

  /**
   * (name, language) is the template's identity at Meta and our own unique key,
   * so a clone that keeps BOTH would write over the very template it copied.
   */
  const clonesOntoItself = (): boolean =>
    !!cloneFrom && name.trim() === cloneFrom.name && language.trim() === cloneFrom.language;

  /** Name and language identify the draft row, so both are required to save one. */
  const saveDraft = () => {
    if (!/^[a-z0-9_]+$/.test(name)) {
      showToast.error('Name must be lowercase letters, numbers and underscores');
      return;
    }
    if (!language.trim()) {
      showToast.error('Choose a language before saving the draft');
      return;
    }
    if (clonesOntoItself()) {
      showToast.error('Pick a different language (or a different name) for the copy');
      return;
    }
    draftMutation.mutate();
  };

  const submit = () => {
    if (!/^[a-z0-9_]+$/.test(name)) {
      showToast.error('Name must be lowercase letters, numbers and underscores');
      return;
    }
    // Blank only in the clone flow, where the point is to pick a NEW language.
    if (!language.trim()) {
      showToast.error('Choose the language for this template');
      return;
    }
    if (clonesOntoItself()) {
      showToast.error('Pick a different language (or a different name) for the copy');
      return;
    }
    // The delivery deadline is rejected by Meta outside the per-category window,
    // and the whole submission fails with it — so catch it here.
    if (ttlBounds && sendTtlSeconds.trim()) {
      const ttl = Number(sendTtlSeconds);
      if (!Number.isFinite(ttl) || ttl < ttlBounds.min || ttl > ttlBounds.max) {
        return showToast.error(
          `Delivery deadline must be between ${ttlBounds.min} and ${ttlBounds.max} seconds`,
        );
      }
    }
    if (isAuth) {
      if (!otpButtonText.trim()) return showToast.error('OTP button text is required');
      if (otpType !== 'COPY_CODE') {
        if (!packageName.trim()) {
          return showToast.error('Autofill needs the Android package name (e.g. com.example.app)');
        }
        if (signatureHash.trim().length !== SIGNATURE_HASH_LEN) {
          return showToast.error(
            `Autofill needs the ${SIGNATURE_HASH_LEN}-character app signing-key hash`,
          );
        }
      }
      // Meta rejects a zero-tap submission that does not carry the terms
      // acknowledgement, and its error names no field — better to stop here with
      // a sentence the operator can act on than to burn a review round trip.
      if (otpType === 'ZERO_TAP' && !zeroTapTermsAccepted) {
        return showToast.error('Zero-tap requires accepting Meta’s zero-tap terms');
      }
      return mutation.mutate();
    }
    const built = buildStandardComponents();
    if (built.error) return showToast.error(built.error);
    mutation.mutate();
  };

  // ── Live preview button rows ──
  const previewButtons = useMemo(() => {
    const rows: { label: string; icon: React.ReactNode }[] = [];
    // A carousel's buttons belong to the cards, and the bubble's are not emitted.
    if (carouselEnabled) return rows;
    for (const b of buttons) {
      const label =
        b.kind === 'COPY_CODE' ? 'Copy code' : b.text.trim() || BUTTON_KIND_META[b.kind].label;
      rows.push({ label, icon: BUTTON_KIND_META[b.kind].icon });
    }
    if (isMarketing) {
      if (marketingAddOns.couponEnabled) {
        rows.push({
          label: marketingAddOns.couponButtonText.trim() || 'Copy offer code',
          icon: BUTTON_KIND_META.COPY_CODE.icon,
        });
      }
      if (marketingAddOns.catalogEnabled) {
        rows.push({ label: 'View catalog', icon: <Ticket className="h-4 w-4 text-blue-600" /> });
      }
    }
    return rows;
  }, [buttons, isMarketing, marketingAddOns, carouselEnabled]);

  return (
    <DialogShell onClose={onClose} label="Template builder">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 className="text-lg font-bold text-[var(--text)]">
            {isEdit
              ? 'Edit template'
              : isDraft
                ? 'Continue draft'
                : cloneFrom
                  ? `Add a language — ${cloneFrom.name}`
                  : 'New Template'}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_320px]">
          {/* ── Form column (scrolls independently) ── */}
          <div className="min-h-0 space-y-4 overflow-y-auto p-6">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="order_update"
                // Meta treats name + language as the template's identity; an edit
                // cannot change either. They rendered as editable fields whose
                // value was silently discarded on save, which reads as a bug.
                disabled={isEdit || isDraft}
                helperText={
                  isEdit
                    ? 'Name cannot be changed after submission'
                    : isDraft
                      ? 'Name identifies the saved draft'
                      : undefined
                }
              />
              <Select
                label="Language"
                options={LANGUAGE_OPTIONS}
                value={language}
                onChange={setLanguage}
                searchable
                clearable={false}
                // Immutable once Meta holds the template; a draft still owns its
                // (name, language) row, so changing it there would orphan the row.
                disabled={isEdit || isDraft}
                placeholder={cloneFrom ? 'Pick the new language' : undefined}
              />
            </div>
            {cloneFrom && (
              <p className="-mt-2 text-[11px] text-[var(--text-muted)]">
                Copied from <strong>{cloneFrom.name}</strong> ({cloneFrom.language}) — translate the
                text below and pick the new language. The uploaded header sample carries over.
              </p>
            )}
            <Select
              label="Category"
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={(v) => {
                setCategory(v);
                // Each category has its own delivery-deadline window (and
                // marketing has none), so a value carried across categories would
                // be rejected by Meta on submit.
                setSendTtlSeconds(TTL_BOUNDS[v]?.default ?? '');
              }}
              clearable={false}
            />

            {isAuth ? (
              // ── Authentication (OTP) builder — preserved verbatim ──
              <>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                  <p className="text-xs font-semibold text-[var(--text-muted)]">
                    Verification code body
                  </p>
                  <p className="mt-1 rounded-md border border-dashed border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]">
                    {'{{1}}'} is your verification code.
                    {addSecurityNote && ' For your security, do not share this code.'}
                  </p>
                  <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                    Meta supplies the body and auto-fills the one-time code. You only choose the
                    security note, code expiry and the OTP button below.
                  </p>
                </div>

                <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={addSecurityNote}
                    onChange={(e) => setAddSecurityNote(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--border)]"
                  />
                  <span>
                    Add security recommendation
                    <span className="block text-[11px] text-[var(--text-muted)]">
                      Appends “For your security, do not share this code.”
                    </span>
                  </span>
                </label>

                <Input
                  label="Code expiry (minutes, optional)"
                  type="number"
                  min={1}
                  max={90}
                  value={codeExpiryMinutes}
                  onChange={(e) => setCodeExpiryMinutes(e.target.value)}
                  placeholder="10"
                />
                <Select
                  label="OTP button type"
                  options={OTP_TYPE_OPTIONS}
                  value={otpType}
                  onChange={(v) => setOtpType(v as OtpType)}
                  clearable={false}
                />
                <p className="-mt-2 text-[11px] text-[var(--text-muted)]">
                  {otpType === 'COPY_CODE'
                    ? 'The customer copies the code and pastes it into your app.'
                    : otpType === 'ONE_TAP'
                      ? 'The customer taps once and WhatsApp hands the code to your Android app.'
                      : 'Your Android app receives the code with no tap at all (falls back to one-tap when it cannot).'}
                </p>
                <Input
                  label="OTP button text"
                  value={otpButtonText}
                  onChange={(e) => setOtpButtonText(e.target.value)}
                  placeholder="Copy code"
                />

                {otpType !== 'COPY_CODE' && (
                  <>
                    <Input
                      label="Autofill button text"
                      value={autofillText}
                      onChange={(e) => setAutofillText(e.target.value)}
                      placeholder="Autofill"
                      maxLength={25}
                    />
                    <Input
                      label="Android package name"
                      value={packageName}
                      onChange={(e) => setPackageName(e.target.value)}
                      placeholder="com.example.app"
                      helperText="The app that receives the code."
                    />
                    <Input
                      label="App signing-key hash"
                      value={signatureHash}
                      onChange={(e) => setSignatureHash(e.target.value)}
                      placeholder="K8a/AINcGX7"
                      maxLength={SIGNATURE_HASH_LEN}
                      helperText={`Exactly ${SIGNATURE_HASH_LEN} characters, from your app's signing certificate.`}
                    />
                  </>
                )}

                {otpType === 'ZERO_TAP' && (
                  <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={zeroTapTermsAccepted}
                      onChange={(e) => setZeroTapTermsAccepted(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-[var(--border)]"
                    />
                    <span>
                      Accept Meta’s zero-tap terms
                      <span className="block text-[11px] text-[var(--text-muted)]">
                        Required on every zero-tap submission — Meta rejects the template without
                        it. You confirm the code is delivered to your app without the customer
                        acting, and that your app handles it securely.
                      </span>
                    </span>
                  </label>
                )}

                <Input
                  label="Delivery deadline (seconds)"
                  type="number"
                  min={ttlBounds?.min}
                  max={ttlBounds?.max}
                  value={sendTtlSeconds}
                  onChange={(e) => setSendTtlSeconds(e.target.value)}
                  placeholder="600"
                  helperText={
                    isEdit
                      ? 'Meta drops the message rather than delivering an expired code late. Leave blank to keep the current deadline.'
                      : 'Meta drops the message rather than delivering it late — so a code that has already expired never lands.'
                  }
                />
              </>
            ) : (
              // ── Marketing / Utility rich builder ──
              <>
                {/* HEADER — hidden on a carousel: the media is on the cards. */}
                {!carouselEnabled && (
                  <div className="rounded-lg border border-[var(--border)] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-[var(--text-muted)]">
                        Header (optional)
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {HEADER_OPTIONS.map((opt) => {
                        const active = headerFormat === opt.value;
                        const icon =
                          opt.value === 'NONE' ? (
                            <Ban className="h-4 w-4" />
                          ) : (
                            HEADER_META[opt.value as Exclude<HeaderFormat, 'NONE'>].icon
                          );
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setHeaderFormat(opt.value);
                              if (opt.value !== 'TEXT') {
                                setHeaderText('');
                                setHeaderTextExample('');
                              }
                              if (
                                opt.value !== 'IMAGE' &&
                                opt.value !== 'VIDEO' &&
                                opt.value !== 'DOCUMENT'
                              ) {
                                clearHeaderMedia();
                              }
                            }}
                            className={cn(
                              'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                              active
                                ? 'border-primary text-primary bg-[var(--primary-light)]'
                                : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                            )}
                          >
                            {icon}
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    {headerFormat === 'TEXT' && (
                      <div className="mt-3 space-y-2">
                        <Input
                          label="Header text"
                          value={headerText}
                          onChange={(e) => setHeaderText(e.target.value)}
                          maxLength={60}
                          placeholder="Order {{1}} update"
                          helperText="Up to 60 characters. One {{1}} variable allowed."
                        />
                        {headerHasVar && (
                          <Input
                            label="Header variable example {{1}}"
                            value={headerTextExample}
                            onChange={(e) => setHeaderTextExample(e.target.value)}
                            placeholder="#A1234"
                          />
                        )}
                      </div>
                    )}

                    {(headerFormat === 'IMAGE' ||
                      headerFormat === 'VIDEO' ||
                      headerFormat === 'DOCUMENT') && (
                      <div className="mt-3">
                        {!headerHandle ? (
                          <label
                            className={cn(
                              'flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-4 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]',
                              uploadingHeader && 'pointer-events-none opacity-70',
                            )}
                          >
                            {uploadingHeader ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" /> Uploading sample…
                              </>
                            ) : (
                              <>
                                {HEADER_META[headerFormat].icon}
                                Upload a sample {HEADER_META[headerFormat].label.toLowerCase()}
                              </>
                            )}
                            <input
                              type="file"
                              className="hidden"
                              accept={HEADER_META[headerFormat].accept}
                              disabled={uploadingHeader}
                              onChange={(e) => onHeaderFile(e.target.files?.[0])}
                            />
                          </label>
                        ) : (
                          <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2.5">
                            {headerPreviewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={headerPreviewUrl}
                                alt="Header sample"
                                className="h-12 w-12 shrink-0 rounded-md object-cover"
                              />
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white text-[var(--text-muted)]">
                                {HEADER_META[headerFormat].icon}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-[var(--text)]">
                                {headerFileName}
                              </p>
                              <p className="text-[11px] text-emerald-600">
                                Sample uploaded to Meta
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={clearHeaderMedia}
                              className="rounded p-1 text-[var(--text-muted)] hover:bg-white hover:text-red-600"
                              aria-label="Remove header media"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {headerFormat === 'LOCATION' && (
                      <p className="mt-3 flex items-center gap-1.5 rounded-md bg-[var(--bg-secondary)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
                        <MapPin className="h-3.5 w-3.5" /> The location pin is filled in per send —
                        no configuration needed here.
                      </p>
                    )}
                  </div>
                )}

                {/* BODY */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--text)]">
                      Body<span className="text-error ml-0.5">*</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <FormatBtn
                        icon={<Bold className="h-4 w-4" />}
                        label="Bold"
                        onClick={() => wrapSelection('*')}
                      />
                      <FormatBtn
                        icon={<Italic className="h-4 w-4" />}
                        label="Italic"
                        onClick={() => wrapSelection('_')}
                      />
                      <FormatBtn
                        icon={<Strikethrough className="h-4 w-4" />}
                        label="Strikethrough"
                        onClick={() => wrapSelection('~')}
                      />
                      <FormatBtn
                        icon={<Code className="h-4 w-4" />}
                        label="Monospace"
                        onClick={() => wrapSelection('```')}
                      />
                      {paramFormat === 'NAMED' && (
                        <input
                          value={newVarName}
                          onChange={(e) => setNewVarName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addBodyVariable();
                            }
                          }}
                          placeholder="variable_name"
                          aria-label="Name for the next variable"
                          className="h-8 w-36 rounded-md border border-[var(--border)] px-2 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)]"
                        />
                      )}
                      <FormatBtn
                        icon={<Braces className="h-4 w-4" />}
                        label="Add variable"
                        onClick={addBodyVariable}
                      />
                    </div>
                  </div>

                  {/* Placeholder style. Meta needs `parameter_format: NAMED` for a
                      {{word}} body; without it a hand-typed {{customer_name}} was
                      submitted as a positional template and rejected. */}
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-[11px] text-[var(--text-muted)]">Placeholders</span>
                    <div className="flex overflow-hidden rounded-md border border-[var(--border)] text-[11px]">
                      {PARAM_FORMAT_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setParamFormat(opt.value)}
                          className={cn(
                            'px-2 py-1 font-medium transition-colors',
                            paramFormat === opt.value
                              ? 'bg-primary text-white'
                              : 'bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Textarea
                    ref={bodyRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={
                      paramFormat === 'NAMED'
                        ? 'Hi {{customer_name}}, your order {{order_id}} has shipped.'
                        : 'Hi {{1}}, your order {{2}} has shipped.'
                    }
                    rows={5}
                    maxLength={1024}
                    showCount
                  />
                  {numberedBodyVars.length > 0 && namedBodyVars.length > 0 && (
                    <p className="text-error mt-1 text-[11px]">
                      Mixing {'{{1}}'} and {'{{name}}'} placeholders is rejected by Meta — pick one
                      style.
                    </p>
                  )}
                  {bodyVars.length > 0 && (
                    <div className="mt-2 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                      <p className="text-xs font-semibold text-[var(--text-muted)]">
                        Example values
                      </p>
                      {bodyVars.map((n) => (
                        <Input
                          key={n}
                          label={`{{${n}}}`}
                          value={bodyExamples[n] ?? ''}
                          onChange={(e) => setBodyExamples((p) => ({ ...p, [n]: e.target.value }))}
                          placeholder={
                            isNumbered(n) ? `Sample ${n}` : `Sample ${n.replace(/_/g, ' ')}`
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* FOOTER — a carousel's bubble carries body text only. */}
                {!carouselEnabled && (
                  <Input
                    label="Footer (optional)"
                    value={footer}
                    onChange={(e) => setFooter(e.target.value)}
                    maxLength={60}
                    placeholder="Reply STOP to opt out"
                    helperText="Up to 60 characters. No variables or formatting."
                  />
                )}

                {/* Marketing templates have no useful deadline, so the field is
                    only offered where Meta actually honours one. */}
                {ttlBounds && (
                  <Input
                    label="Delivery deadline (seconds, optional)"
                    type="number"
                    min={ttlBounds.min}
                    max={ttlBounds.max}
                    value={sendTtlSeconds}
                    onChange={(e) => setSendTtlSeconds(e.target.value)}
                    placeholder={`${ttlBounds.min}–${ttlBounds.max}`}
                    helperText="Meta drops the message rather than delivering it long after it stopped being useful."
                  />
                )}

                {/* CAROUSEL CARDS */}
                <div className="rounded-lg border border-[var(--border)] p-3">
                  <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={carouselEnabled}
                      onChange={(e) => toggleCarousel(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-[var(--border)]"
                    />
                    <span>
                      Add carousel cards
                      <span className="block text-[11px] text-[var(--text-muted)]">
                        Up to {MAX_CAROUSEL_CARDS} swipeable cards under the message — Meta&rsquo;s
                        format for a set of offers. The bubble then carries body text only: the
                        media and the buttons move onto the cards.
                      </span>
                    </span>
                  </label>

                  {carouselEnabled && (
                    <div className="mt-3 space-y-3">
                      {/* One media format for the whole carousel — Meta requires
                          every card to use the same one. */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-[var(--text-muted)]">Card media</span>
                        {(['IMAGE', 'VIDEO'] as CardMediaFormat[]).map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setCarouselMediaFormat(f)}
                            className={cn(
                              'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                              carouselMediaFormat === f
                                ? 'border-primary text-primary bg-[var(--primary-light)]'
                                : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                            )}
                          >
                            {HEADER_META[f].icon}
                            {HEADER_META[f].label}
                          </button>
                        ))}
                      </div>

                      {/* The button slots, chosen once. Every card fills in the
                          same slots in the same order, which is exactly the rule
                          Meta enforces — and rejects a template for, days later,
                          naming neither card. */}
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2.5">
                        <p className="text-[11px] font-semibold text-[var(--text-muted)]">
                          Card buttons — the same on every card
                        </p>
                        {cardButtonKinds.length === 0 ? (
                          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                            Optional. Up to {MAX_CARD_BUTTONS} per card.
                          </p>
                        ) : (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {cardButtonKinds.map((kind, bi) => (
                              <span
                                key={bi}
                                className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--text)]"
                              >
                                {kind === 'QUICK_REPLY'
                                  ? BUTTON_KIND_META.QUICK_REPLY.icon
                                  : BUTTON_KIND_META.URL.icon}
                                {kind === 'QUICK_REPLY' ? 'Quick reply' : 'Visit website'}
                                <button
                                  type="button"
                                  onClick={() => removeCardButtonSlot(bi)}
                                  className="text-[var(--text-muted)] hover:text-red-600"
                                  aria-label={`Remove card button ${bi + 1}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        {cardButtonKinds.length < MAX_CARD_BUTTONS && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {CARD_BUTTON_KIND_OPTIONS.map((opt) => (
                              <Button
                                key={opt.value}
                                size="sm"
                                variant="outline"
                                leftIcon={<Plus className="h-3.5 w-3.5" />}
                                onClick={() => addCardButtonSlot(opt.value)}
                              >
                                {opt.label}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>

                      {cards.map((card, i) => (
                        <div
                          key={card.key}
                          className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2.5"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-[var(--text)]">
                              Card {i + 1}
                            </span>
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => moveCard(card.key, -1)}
                                disabled={i === 0}
                                className="rounded p-1 text-[var(--text-muted)] hover:bg-white disabled:opacity-30"
                                aria-label="Move card up"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveCard(card.key, 1)}
                                disabled={i === cards.length - 1}
                                className="rounded p-1 text-[var(--text-muted)] hover:bg-white disabled:opacity-30"
                                aria-label="Move card down"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeCard(card.key)}
                                className="rounded p-1 text-[var(--text-muted)] hover:bg-white hover:text-red-600"
                                aria-label="Remove card"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {!card.handle ? (
                            <label
                              className={cn(
                                'flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-white px-3 py-3 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]',
                                card.uploading && 'pointer-events-none opacity-70',
                              )}
                            >
                              {card.uploading ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading sample…
                                </>
                              ) : (
                                <>
                                  {HEADER_META[carouselMediaFormat].icon}
                                  Upload this card&rsquo;s sample{' '}
                                  {HEADER_META[carouselMediaFormat].label.toLowerCase()}
                                </>
                              )}
                              <input
                                type="file"
                                className="hidden"
                                accept={HEADER_META[carouselMediaFormat].accept}
                                disabled={card.uploading}
                                onChange={(e) => onCardFile(card.key, e.target.files?.[0])}
                              />
                            </label>
                          ) : (
                            <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-white p-2">
                              {card.previewUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={card.previewUrl}
                                  alt={`Card ${i + 1} sample`}
                                  className="h-10 w-10 shrink-0 rounded-md object-cover"
                                />
                              ) : (
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                                  {HEADER_META[carouselMediaFormat].icon}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-[var(--text)]">
                                  {card.fileName}
                                </p>
                                <p className="text-[10px] text-emerald-600">
                                  Sample uploaded to Meta
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  updateCard(card.key, { handle: '', fileName: '', previewUrl: '' })
                                }
                                className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-red-600"
                                aria-label={`Remove card ${i + 1} sample`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}

                          <div className="mt-2">
                            <Textarea
                              value={card.body}
                              onChange={(e) => updateCard(card.key, { body: e.target.value })}
                              placeholder={`Card ${i + 1} text — {{1}} for a per-send value`}
                              rows={2}
                              maxLength={CARD_BODY_MAX}
                              showCount
                            />
                          </div>

                          {extractVars(card.body).map((v) => (
                            <div key={v} className="mt-2">
                              <Input
                                label={`Card ${i + 1} example {{${v}}}`}
                                inputSize="sm"
                                value={card.examples[v] ?? ''}
                                onChange={(e) =>
                                  updateCard(card.key, {
                                    examples: { ...card.examples, [v]: e.target.value },
                                  })
                                }
                                placeholder={isNumbered(v) ? `Sample ${v}` : undefined}
                              />
                            </div>
                          ))}

                          {cardButtonKinds.map((kind, bi) => (
                            <div
                              key={bi}
                              className="mt-2 space-y-2 border-t border-[var(--border)] pt-2"
                            >
                              <Input
                                label={`Button ${bi + 1} label (${kind === 'QUICK_REPLY' ? 'quick reply' : 'website'})`}
                                inputSize="sm"
                                value={card.buttons[bi]?.text ?? ''}
                                onChange={(e) =>
                                  updateCardButton(card.key, bi, { text: e.target.value })
                                }
                                maxLength={25}
                              />
                              {kind === 'URL' && (
                                <>
                                  <Input
                                    label={`Button ${bi + 1} URL`}
                                    inputSize="sm"
                                    value={card.buttons[bi]?.url ?? ''}
                                    onChange={(e) =>
                                      updateCardButton(card.key, bi, { url: e.target.value })
                                    }
                                    placeholder="https://example.com/offer/{{1}}"
                                  />
                                  {/\{\{1\}\}/.test(card.buttons[bi]?.url ?? '') && (
                                    <Input
                                      label={`Button ${bi + 1} example full URL`}
                                      inputSize="sm"
                                      value={card.buttons[bi]?.urlExample ?? ''}
                                      onChange={(e) =>
                                        updateCardButton(card.key, bi, {
                                          urlExample: e.target.value,
                                        })
                                      }
                                      placeholder="https://example.com/offer/summer"
                                    />
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {cards.length} of {MAX_CAROUSEL_CARDS} cards · at least{' '}
                          {MIN_CAROUSEL_CARDS} needed
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<Plus className="h-3.5 w-3.5" />}
                          onClick={addCard}
                          disabled={cards.length >= MAX_CAROUSEL_CARDS}
                        >
                          Add card
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* BUTTONS — replaced by the cards' own buttons on a carousel. */}
                {!carouselEnabled && (
                  <div className="rounded-lg border border-[var(--border)] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-[var(--text-muted)]">
                        Buttons (optional)
                      </p>
                      <div ref={buttonMenuRef} className="relative">
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<Plus className="h-3.5 w-3.5" />}
                          onClick={() => setButtonMenuOpen((o) => !o)}
                        >
                          Add button
                        </Button>
                        {buttonMenuOpen && (
                          <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg">
                            {(Object.keys(BUTTON_KIND_META) as ButtonKind[]).map((kind) => (
                              <button
                                key={kind}
                                type="button"
                                onClick={() => addButton(kind)}
                                className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--bg-secondary)]"
                              >
                                <span className="mt-0.5 shrink-0">
                                  {BUTTON_KIND_META[kind].icon}
                                </span>
                                <span className="min-w-0">
                                  <span className="block text-sm font-medium text-[var(--text)]">
                                    {BUTTON_KIND_META[kind].label}
                                  </span>
                                  <span className="block text-[11px] text-[var(--text-muted)]">
                                    {BUTTON_KIND_META[kind].hint}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {buttons.length === 0 ? (
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Add up to {MAX_BUTTONS} buttons. Some types have limits (e.g. one call & one
                        copy-code) — Meta enforces the exact rules on submit.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {buttons.map((b, idx) => (
                          <div
                            key={b.key}
                            className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2.5"
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text)]">
                                {BUTTON_KIND_META[b.kind].icon}
                                {BUTTON_KIND_META[b.kind].label}
                              </span>
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => moveButton(b.key, -1)}
                                  disabled={idx === 0}
                                  className="rounded p-1 text-[var(--text-muted)] hover:bg-white disabled:opacity-30"
                                  aria-label="Move up"
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveButton(b.key, 1)}
                                  disabled={idx === buttons.length - 1}
                                  className="rounded p-1 text-[var(--text-muted)] hover:bg-white disabled:opacity-30"
                                  aria-label="Move down"
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeButton(b.key)}
                                  className="rounded p-1 text-[var(--text-muted)] hover:bg-white hover:text-red-600"
                                  aria-label="Remove button"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {b.kind !== 'COPY_CODE' && (
                                <Input
                                  label="Button text"
                                  inputSize="sm"
                                  value={b.text}
                                  onChange={(e) => updateButton(b.key, { text: e.target.value })}
                                  maxLength={25}
                                  placeholder={BUTTON_KIND_META[b.kind].label}
                                />
                              )}

                              {b.kind === 'URL' && (
                                <>
                                  <Input
                                    label="URL"
                                    inputSize="sm"
                                    value={b.url}
                                    onChange={(e) => updateButton(b.key, { url: e.target.value })}
                                    placeholder="https://example.com/order/{{1}}"
                                  />
                                  {/\{\{1\}\}/.test(b.url) && (
                                    <Input
                                      label="Example full URL"
                                      inputSize="sm"
                                      value={b.urlExample}
                                      onChange={(e) =>
                                        updateButton(b.key, { urlExample: e.target.value })
                                      }
                                      placeholder="https://example.com/order/A1234"
                                    />
                                  )}
                                </>
                              )}

                              {b.kind === 'PHONE_NUMBER' && (
                                <PhoneInput
                                  label="Phone number"
                                  inputSize="sm"
                                  value={b.phoneNumber}
                                  onValueChange={(v) => updateButton(b.key, { phoneNumber: v })}
                                />
                              )}

                              {b.kind === 'COPY_CODE' && (
                                <Input
                                  label="Sample code (for Meta review)"
                                  inputSize="sm"
                                  value={b.copyExample}
                                  onChange={(e) =>
                                    updateButton(b.key, { copyExample: e.target.value })
                                  }
                                  maxLength={15}
                                  placeholder="SAVE20"
                                />
                              )}

                              {b.kind === 'FLOW' && (
                                <>
                                  <Input
                                    label="Flow id"
                                    inputSize="sm"
                                    value={b.flowId}
                                    onChange={(e) =>
                                      updateButton(b.key, { flowId: e.target.value })
                                    }
                                    placeholder="1234567890"
                                  />
                                  <Select
                                    label="Flow action"
                                    size="sm"
                                    clearable={false}
                                    value={b.flowAction}
                                    onChange={(v) =>
                                      updateButton(b.key, {
                                        flowAction: v as ButtonDraft['flowAction'],
                                      })
                                    }
                                    options={[
                                      { value: 'navigate', label: 'Navigate' },
                                      { value: 'data_exchange', label: 'Data exchange' },
                                    ]}
                                  />
                                  {b.flowAction === 'navigate' && (
                                    <Input
                                      label="Navigate screen (optional)"
                                      inputSize="sm"
                                      value={b.navigateScreen}
                                      onChange={(e) =>
                                        updateButton(b.key, { navigateScreen: e.target.value })
                                      }
                                      placeholder="WELCOME"
                                    />
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {isMarketing && !carouselEnabled && (
                  <MarketingTemplateAddOns state={marketingAddOns} />
                )}
                {isMarketing && carouselEnabled && (
                  <p className="text-[11px] text-[var(--text-muted)]">
                    The offer countdown and the catalog button both add a button to the message
                    bubble, which Meta does not allow beside a carousel — put a link button on the
                    cards instead.
                  </p>
                )}
              </>
            )}
          </div>

          {/* ── Live preview column ── */}
          <div className="hidden min-h-0 flex-col border-l border-[var(--border)] bg-[var(--bg-secondary)] lg:flex">
            <p className="border-b border-[var(--border)] px-4 py-3 text-xs font-semibold text-[var(--text-muted)]">
              Preview
            </p>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="rounded-xl bg-[#e5ddd5] p-3">
                <div className="ml-auto max-w-[260px] rounded-lg rounded-tr-none bg-white p-2.5 shadow-sm">
                  {isAuth ? (
                    <p className="text-sm whitespace-pre-wrap text-[var(--text)]">
                      <span className="rounded bg-emerald-100 px-1 text-emerald-700">
                        {'{{1}}'}
                      </span>{' '}
                      is your verification code.
                      {addSecurityNote && ' For your security, do not share this code.'}
                    </p>
                  ) : (
                    <>
                      {/* Header preview */}
                      {headerFormat === 'TEXT' && headerText.trim() && (
                        <p className="mb-1 text-sm font-semibold text-[var(--text)]">
                          {renderWaMarkdown(headerText)}
                        </p>
                      )}
                      {(headerFormat === 'IMAGE' ||
                        headerFormat === 'VIDEO' ||
                        headerFormat === 'DOCUMENT') && (
                        <div className="mb-1.5 flex h-28 items-center justify-center rounded-md bg-black/5 text-[var(--text-muted)]">
                          {headerPreviewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={headerPreviewUrl}
                              alt="Header preview"
                              className="h-full w-full rounded-md object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-xs">
                              {HEADER_META[headerFormat].icon}
                              {HEADER_META[headerFormat].label}
                            </div>
                          )}
                        </div>
                      )}
                      {headerFormat === 'LOCATION' && (
                        <div className="mb-1.5 flex h-24 items-center justify-center rounded-md bg-black/5 text-xs text-[var(--text-muted)]">
                          <MapPin className="mr-1 h-4 w-4" /> Location
                        </div>
                      )}

                      {/* Body preview */}
                      <p className="text-sm whitespace-pre-wrap text-[var(--text)]">
                        {body.trim() ? (
                          renderWaMarkdown(body)
                        ) : (
                          <span className="text-[var(--text-muted)]">Your message body…</span>
                        )}
                      </p>

                      {/* Footer preview */}
                      {footer.trim() && (
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">{footer}</p>
                      )}

                      <p className="mt-1 text-right text-[10px] text-[var(--text-muted)]">
                        12:00 PM
                      </p>
                    </>
                  )}
                </div>

                {/* Carousel cards, as the handset stacks them under the bubble */}
                {!isAuth && carouselEnabled && cards.length > 0 && (
                  <div className="mt-1 ml-auto max-w-[260px] overflow-x-auto pb-1">
                    <div className="flex gap-2">
                      {cards.map((card, i) => (
                        <div
                          key={card.key}
                          className="w-32 shrink-0 rounded-lg bg-white p-1.5 shadow-sm"
                        >
                          {card.previewUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={card.previewUrl}
                              alt={`Card ${i + 1}`}
                              className="mb-1 h-16 w-full rounded-md object-cover"
                            />
                          ) : (
                            <div className="mb-1 flex h-16 items-center justify-center gap-1 rounded-md bg-black/5 text-[10px] text-[var(--text-muted)]">
                              {HEADER_META[carouselMediaFormat].icon}
                              Card {i + 1}
                            </div>
                          )}
                          <p className="text-[10px] whitespace-pre-wrap text-[var(--text)]">
                            {card.body.trim() ? (
                              renderWaMarkdown(card.body)
                            ) : (
                              <span className="text-[var(--text-muted)]">Card text…</span>
                            )}
                          </p>
                          {cardButtonKinds.map((kind, bi) => (
                            <div
                              key={bi}
                              className="mt-1 truncate rounded-md bg-black/5 py-1 text-center text-[10px] font-medium text-[#00a5f4]"
                            >
                              {card.buttons[bi]?.text.trim() ||
                                (kind === 'QUICK_REPLY' ? 'Quick reply' : 'Visit website')}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Button rows */}
                {!isAuth && previewButtons.length > 0 && (
                  <div className="mt-1 ml-auto max-w-[260px] space-y-0.5">
                    {previewButtons.map((row, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-sm font-medium text-[#00a5f4] shadow-sm"
                      >
                        {row.icon}
                        <span className="truncate">{row.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {isAuth && (
                  <div className="mt-1 ml-auto max-w-[260px]">
                    <div className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-sm font-medium text-[#00a5f4] shadow-sm">
                      <Ticket className="h-4 w-4" />
                      {/* An autofill template shows the autofill button, not the
                          copy-code one — the copy label is only the fallback. */}
                      <span className="truncate">
                        {otpType === 'COPY_CODE'
                          ? otpButtonText.trim() || 'Copy code'
                          : autofillText.trim() || 'Autofill'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {/* An edit is already at Meta, so there is nothing to keep locally —
              saving a draft over it would only make the console disagree with
              the content Meta actually approved. */}
          {!isEdit && (
            <Button variant="secondary" onClick={saveDraft} isLoading={draftMutation.isPending}>
              Save draft
            </Button>
          )}
          <Button onClick={submit} isLoading={mutation.isPending}>
            Submit for review
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
