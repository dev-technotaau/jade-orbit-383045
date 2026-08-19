import type { WaTemplate } from '@/types/whatsapp';

/**
 * Parse an APPROVED template's Meta `components` into the exact set of runtime
 * parameters a SEND requires. The send modal was previously body-only, so any
 * template with a header, a media header, a dynamic URL button, or named
 * ({{name}}) body variables sent an incomplete parameter set → Meta rejected
 * with "(#131008) Required parameter is missing". This resolves ALL of them.
 */

type Comp = {
  type?: string;
  format?: string;
  text?: string;
  buttons?: Array<{ type?: string; url?: string; text?: string; phone_number?: string }>;
  /**
   * LIMITED_TIME_OFFER only. `has_expiration` is what adds the live countdown,
   * and the countdown is the only thing `expiration_time_ms` feeds.
   */
  limited_time_offer?: { text?: string; has_expiration?: boolean };
  /** CAROUSEL only: each card is its own mini component list. */
  cards?: Array<{ components?: Comp[] }>;
  /** Meta's approved sample values, kept on the component itself. */
  example?: {
    header_text?: unknown;
    header_handle?: unknown;
    body_text?: unknown;
    body_text_named_params?: unknown;
  };
};

/** One button on a carousel card, as authored. */
export interface CarouselCardButtonSpec {
  /** Position within the CARD's own buttons array — Meta addresses it by index. */
  index: number;
  /** Meta button type, uppercase (QUICK_REPLY / URL / PHONE_NUMBER / …). */
  type: string;
  text: string;
  /** URL button with a dynamic {{n}} suffix — it takes a per-send value. */
  hasUrlVar: boolean;
}

/**
 * What ONE carousel card needs at send time. Mirrors the server's
 * `TemplateCarouselCardSpec` (whatsapp-template.service.ts), plus the card's own
 * body text, which the send forms show above that card's inputs so the operator
 * can see which card they are filling in.
 */
export interface CarouselCardSpec {
  /** Card header format — Meta allows IMAGE or VIDEO only. */
  headerFormat: 'IMAGE' | 'VIDEO' | 'NONE';
  /** Highest positional {{n}} in THIS card's body (0 when it has none). */
  bodyPositional: number;
  buttons: CarouselCardButtonSpec[];
  /** True when one of the card's URL buttons needs a per-send suffix. */
  buttonUrlVar: boolean;
  /** The card's authored body text, placeholders included. */
  bodyText: string;
  /**
   * The example values approved WITH this card, in slot order.
   *
   * Shown as placeholders under each card's inputs, never as values — the same
   * rule the bubble's examples follow: a sample quietly sent to a real customer
   * is worse than an empty field.
   */
  bodyExamples: string[];
}

export interface TemplateVarSpec {
  headerFormat: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION' | 'PRODUCT';
  /** TEXT header containing a {{1}} variable. */
  headerHasTextVar: boolean;
  /** IMAGE / VIDEO / DOCUMENT header — a media URL must be supplied at send. */
  headerNeedsMedia: boolean;
  /** Count of positional {{n}} body variables (0 when the body is named or has none). */
  bodyPositional: number;
  /** Named {{name}} body variables (empty when positional or none). */
  bodyNamed: string[];
  /** A URL button whose URL has a dynamic {{1}} suffix. */
  buttonUrlVar: boolean;
  /**
   * The AUTHORED index of every URL button carrying a {{n}} suffix, in order.
   *
   * Meta allows TWO URL buttons and either may be dynamic, each addressed by its
   * own index. One input filled only the first, so a template with two — which
   * this console refuses to author but imports APPROVED from Business Manager —
   * was refused by Meta with (#131008) on every send, for a field the operator
   * had no way to fill in.
   */
  buttonUrlVarIndexes: number[];
  /**
   * Authentication template with an OTP button. The Cloud API needs the code as
   * BOTH the body parameter and a button parameter, and rejects the send without
   * the button component - so these were authorable, approvable and unsendable.
   */
  needsOtpCode: boolean;
  /** LOCATION header — four inputs supplied per send. */
  headerNeedsLocation: boolean;
  /** COPY_CODE button — needs a coupon code at send. */
  needsCouponCode: boolean;
  /**
   * LIMITED_TIME_OFFER component WITH a countdown — needs an expiry at send.
   * Gated on `has_expiration`: the offer component alone only draws the banner.
   */
  needsLtoExpiration: boolean;
  /**
   * CATALOG button — the send MAY name the SKU whose image heads the card.
   * Optional: Meta falls back to the first item in the bound catalog.
   */
  needsCatalogThumbnail: boolean;
  /**
   * MPM button — the product sections ARE the message and are picked per send.
   * Mandatory: a multi-product template sent without them shows no products.
   */
  needsProductSections: boolean;
  /** PRODUCT header (single-product template) — the SKU is supplied per send. */
  needsProduct: boolean;
  /** FLOW button — the send mints a correlation token for it server-side. */
  hasFlowButton: boolean;
  /** The carousel's cards, in order — empty for every other template. */
  carouselCards: CarouselCardSpec[];
  /** True when the template needs no runtime parameters at all (e.g. hello_world). */
  none: boolean;
}

/**
 * The only field the analyzer and the preview renderer ever read off a template.
 *
 * A SENT template message carries the approved components on the message row
 * itself (`WaMessage.payload`), not a `WaTemplate` — the template it came from
 * may since have been edited, re-approved or deleted at Meta. Both callers want
 * exactly the same parsing, so neither is made to fabricate a template object.
 */
export type TemplateSource = Pick<WaTemplate, 'components'>;

function comps(t: TemplateSource): Comp[] {
  const c = t.components;
  if (Array.isArray(c)) return c as Comp[];
  // Defensive: a stringified JSON column shouldn't happen, but never throw.
  if (typeof c === 'string') {
    try {
      const parsed = JSON.parse(c);
      return Array.isArray(parsed) ? (parsed as Comp[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

const varsIn = (text: string | undefined): string[] =>
  text ? [...text.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)].map((m) => m[1]) : [];

/**
 * The template's carousel cards, in authored order — [] for every other template.
 *
 * Each card carries its OWN media, body values and button values, so a carousel
 * cannot be described by the bubble's fields at all: `carouselCards.length` is
 * what tells a send form that it has cards to collect, and what stops it sending
 * a carousel with none of them.
 */
function carouselCardsOf(cs: Comp[]): CarouselCardSpec[] {
  const carousel = cs.find((c) => (c.type ?? '').toUpperCase() === 'CAROUSEL');
  const cards = Array.isArray(carousel?.cards) ? carousel.cards : [];
  return cards.map((raw) => {
    const comps = Array.isArray((raw as { components?: unknown })?.components)
      ? ((raw as { components: Comp[] }).components ?? [])
      : [];
    const find = (t: string) => comps.find((c) => (c.type ?? '').toUpperCase() === t);
    const format = (find('HEADER')?.format ?? 'NONE').toUpperCase();
    const cardBody = find('BODY');
    const bodyText = cardBody?.text ?? '';
    const positional = [...bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
    // Meta keeps a card's approved samples on the card's own BODY component, as
    // one row of values in slot order — exactly like the bubble's.
    const exampleRows = Array.isArray(cardBody?.example?.body_text)
      ? (cardBody.example.body_text as unknown[])
      : [];
    const bodyExamples = Array.isArray(exampleRows[0])
      ? (exampleRows[0] as unknown[]).map((v) => String(v ?? ''))
      : [];
    const buttons: CarouselCardButtonSpec[] = (find('BUTTONS')?.buttons ?? []).map((b, index) => {
      const type = (b.type ?? '').toUpperCase();
      return {
        index,
        type,
        text: b.text ?? '',
        hasUrlVar: type === 'URL' && /\{\{\s*\d+\s*\}\}/.test(b.url ?? ''),
      };
    });
    return {
      headerFormat: format === 'IMAGE' || format === 'VIDEO' ? format : 'NONE',
      bodyPositional: positional.length ? Math.max(...positional) : 0,
      buttons,
      buttonUrlVar: buttons.some((b) => b.hasUrlVar),
      bodyText,
      bodyExamples,
    };
  });
}

export function analyzeTemplate(t: TemplateSource): TemplateVarSpec {
  const cs = comps(t);
  const header = cs.find((c) => (c.type ?? '').toUpperCase() === 'HEADER');
  const body = cs.find((c) => (c.type ?? '').toUpperCase() === 'BODY');
  const buttonsComp = cs.find((c) => (c.type ?? '').toUpperCase() === 'BUTTONS');

  const headerFormat = (header?.format ?? 'NONE').toUpperCase() as TemplateVarSpec['headerFormat'];
  const headerHasTextVar = headerFormat === 'TEXT' && varsIn(header?.text).length > 0;
  const headerNeedsMedia =
    headerFormat === 'IMAGE' || headerFormat === 'VIDEO' || headerFormat === 'DOCUMENT';

  const bodyVars = varsIn(body?.text);
  const positional = bodyVars.filter((v) => /^\d+$/.test(v)).map(Number);
  const named = [...new Set(bodyVars.filter((v) => !/^\d+$/.test(v)))];
  const bodyPositional = positional.length ? Math.max(...positional) : 0;
  const bodyNamed = named;

  const headerNeedsLocation = headerFormat === 'LOCATION';
  const needsCouponCode = (buttonsComp?.buttons ?? []).some(
    (b) => (b.type ?? '').toUpperCase() === 'COPY_CODE',
  );
  // An offer component draws the banner; only `has_expiration` draws the
  // countdown, and only the countdown consumes the expiry parameter. Keying off
  // the component's mere presence made a `has_expiration: false` template
  // (authorable in Business Manager, synced in verbatim) demand an expiry here
  // and then send Meta a parameter the approved template never declared.
  const needsLtoExpiration = cs.some(
    (c) =>
      (c.type ?? '').toUpperCase() === 'LIMITED_TIME_OFFER' &&
      c.limited_time_offer?.has_expiration !== false,
  );

  const needsOtpCode = (buttonsComp?.buttons ?? []).some(
    (b) => (b.type ?? '').toUpperCase() === 'OTP',
  );

  // EVERY dynamic URL button, by authored index — mirrors the server's
  // `templateButtonIndexes`, so the form asks for exactly the values the send
  // will emit rather than one for however many buttons the template carries.
  const buttonUrlVarIndexes = (buttonsComp?.buttons ?? []).reduce<number[]>((acc, b, i) => {
    if ((b.type ?? '').toUpperCase() === 'URL' && /\{\{\s*\d+\s*\}\}/.test(b.url ?? '')) {
      acc.push(i);
    }
    return acc;
  }, []);
  const buttonUrlVar = buttonUrlVarIndexes.length > 0;

  const hasButton = (t: string) =>
    (buttonsComp?.buttons ?? []).some((b) => (b.type ?? '').toUpperCase() === t);
  const needsCatalogThumbnail = hasButton('CATALOG');
  const needsProductSections = hasButton('MPM');
  const needsProduct = headerFormat === 'PRODUCT' || hasButton('SPM');
  const hasFlowButton = hasButton('FLOW');

  const carouselCards = carouselCardsOf(cs);

  const none =
    carouselCards.length === 0 &&
    !needsOtpCode &&
    !headerNeedsLocation &&
    !needsCouponCode &&
    !needsLtoExpiration &&
    !headerHasTextVar &&
    !headerNeedsMedia &&
    bodyPositional === 0 &&
    bodyNamed.length === 0 &&
    // A catalogue template shows an input block too: the multi-product list and
    // the single-product SKU are mandatory, and the catalog thumbnail — while
    // optional — is the only control an operator has over what the card shows.
    // Reporting `none` for these is why such a template opened the compose modal
    // with no fields at all and was then sent with no products named.
    !needsCatalogThumbnail &&
    !needsProductSections &&
    !needsProduct &&
    !buttonUrlVar;

  return {
    headerFormat,
    headerHasTextVar,
    headerNeedsMedia,
    bodyPositional,
    bodyNamed,
    buttonUrlVar,
    buttonUrlVarIndexes,
    needsOtpCode,
    headerNeedsLocation,
    needsCouponCode,
    needsLtoExpiration,
    needsCatalogThumbnail,
    needsProductSections,
    needsProduct,
    hasFlowButton,
    carouselCards,
    none,
  };
}

/**
 * The sample values that were approved WITH the template, by placeholder token.
 *
 * These are typed once at authoring time, reviewed by Meta, and were then read
 * by nothing at all: every send surface started its parameter inputs blank, so
 * the operator retyped values they had already provided — and, with nothing on
 * screen saying what {{2}} is for, guessed at which slot was which.
 *
 * They are surfaced as PLACEHOLDERS, never as values. A sample silently sent to
 * a real customer ("Hi Priya Sharma" to someone else entirely) is far worse than
 * an empty field.
 */
export interface TemplateExamples {
  /** Body examples keyed by placeholder token — '1', '2', 'customer_name'. */
  body: Record<string, string>;
  /** The TEXT header's example, when it carries a variable. */
  headerText?: string;
}

/**
 * Pull the examples out of one component's `example` object.
 *
 * Never overwrites a value already collected: the components are read first and
 * are what Meta actually approved, so the legacy column can only fill gaps.
 */
function collectExamples(source: Comp['example'], into: TemplateExamples): void {
  if (!source) return;
  const headerText = Array.isArray(source.header_text) ? source.header_text[0] : undefined;
  if (!into.headerText && typeof headerText === 'string' && headerText.trim()) {
    into.headerText = headerText;
  }

  // Named templates carry one example per NAME; positional ones a single row of
  // values in first-to-last order.
  const named = source.body_text_named_params;
  if (Array.isArray(named)) {
    for (const entry of named as Array<{ param_name?: unknown; example?: unknown }>) {
      if (
        typeof entry?.param_name === 'string' &&
        typeof entry.example === 'string' &&
        !into.body[entry.param_name]
      ) {
        into.body[entry.param_name] = entry.example;
      }
    }
  }
  const positional = Array.isArray(source.body_text) ? source.body_text[0] : undefined;
  if (Array.isArray(positional)) {
    positional.forEach((value, i) => {
      if (typeof value === 'string' && value.trim() && !into.body[String(i + 1)]) {
        into.body[String(i + 1)] = value;
      }
    });
  }
}

/**
 * Every approved sample value a template carries.
 *
 * Read from the components first — that is what Meta actually approved and what
 * the sync stores for templates authored elsewhere — then from the legacy
 * `variableSample` column, which only locally-authored templates ever had.
 */
export function templateExamples(t: WaTemplate): TemplateExamples {
  const out: TemplateExamples = { body: {} };
  for (const c of comps(t)) {
    const type = (c.type ?? '').toUpperCase();
    if (type === 'HEADER' || type === 'BODY') collectExamples(c.example, out);
  }
  const legacy = t.variableSample;
  if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
    collectExamples(legacy as Comp['example'], out);
  }
  return out;
}

/** The runtime values ONE carousel card is sent with. */
export interface TemplateCarouselCardValues {
  /**
   * A media id already staged at Meta. Preferred over `headerMediaUrl` for the
   * same reason the bubble's header is: Meta re-fetches a link on every send, and
   * a ten-card carousel re-fetches ten of them per recipient.
   */
  headerMediaId?: string;
  headerMediaUrl?: string;
  /** image | video — the card's own header format. */
  headerMediaType?: 'image' | 'video';
  /** Positional values for this card's own {{n}} placeholders. */
  bodyParams?: string[];
  /** Value for this card's FIRST dynamic {{n}} URL-button suffix. */
  buttonUrlParam?: string;
  /** One value per dynamic URL button on this card, in authored order. */
  buttonUrlParams?: string[];
}

/**
 * Split a typed SKU list into product retailer ids.
 *
 * There is no API for browsing a Meta catalog's products from this console, so
 * the SKUs are typed — one per line or comma-separated, whichever the operator
 * finds natural. Blank entries are dropped: Meta refuses a product item with an
 * empty retailer id, which would fail the whole message.
 */
export function parseProductSkus(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Everything a template needs at send time OTHER than positional body values,
 * phrased for a human — empty when body values are all it takes.
 *
 * Mirrors the server's `templateParamsBeyondBody`. An A/B variant and a drip
 * step carry a body mapping and nothing else: there is exactly one campaign-wide
 * `templateParams` set, filled in against the MAIN template, and the wizard hides
 * those inputs entirely once A/B is on. So a variant with a media header, a
 * dynamic link or a copy-code button used to pass every check here, launch, and
 * then be refused by Meta with (#131008) for its whole slice of the audience.
 */
export function templateParamsBeyondBody(spec: TemplateVarSpec): string[] {
  const needs: string[] = [];
  if (spec.headerNeedsMedia) needs.push(`a ${spec.headerFormat.toLowerCase()} header`);
  if (spec.headerHasTextVar) needs.push('header text');
  if (spec.headerNeedsLocation) needs.push('a location pin');
  if (spec.buttonUrlVarIndexes.length > 0) {
    needs.push(
      spec.buttonUrlVarIndexes.length > 1
        ? `${spec.buttonUrlVarIndexes.length} URL-button values`
        : 'a URL-button value',
    );
  }
  if (spec.needsCouponCode) needs.push('a coupon code');
  if (spec.needsLtoExpiration) needs.push('an offer expiry');
  if (spec.needsOtpCode) needs.push('a one-time code');
  if (spec.needsProductSections) needs.push('a product list');
  if (spec.needsProduct) needs.push('a product SKU');
  if (spec.carouselCards.length > 0) needs.push('carousel card media and text');
  if (spec.bodyNamed.length > 0) {
    needs.push(`named body values (${spec.bodyNamed.map((n) => `{{${n}}}`).join(', ')})`);
  }
  return needs;
}

/** One section of a multi-product (MPM) template's product list. */
export interface TemplateProductSectionValues {
  /** Section heading. Meta caps it at 24 characters. */
  title: string;
  /** The SKUs in this section, as they appear in the bound catalog. */
  productRetailerIds: string[];
}

/** Payload shape shared by send-template + start-conversation. */
export interface TemplateSendPayload {
  templateId: string;
  bodyParams?: string[];
  bodyNamedParams?: Array<{ name: string; text: string }>;
  headerText?: string;
  /**
   * A media id already staged at Meta, for an IMAGE / VIDEO / DOCUMENT header.
   * Preferred over `headerMediaUrl` (the backend checks it first): Meta re-fetches
   * a URL on every single send, and nothing validates that the operator's host is
   * still serving it.
   */
  headerImageId?: string;
  headerMediaUrl?: string;
  headerMediaType?: 'image' | 'video' | 'document';
  /**
   * DOCUMENT header only: the filename the attachment shows on the handset.
   *
   * The modal has always held the uploaded file's name and used it purely for
   * the on-screen chip, so the customer received an invoice or a brochure named
   * after its media id while the identical file sent as a plain document message
   * in the same thread arrived correctly named.
   */
  headerMediaFilename?: string;
  /** Value for the FIRST dynamic URL button — the single-button shorthand. */
  buttonUrlParam?: string;
  /** One value per dynamic URL button, in authored order (Meta allows two). */
  buttonUrlParams?: string[];
  /** One-time code for an AUTHENTICATION template. */
  otpCode?: string;
  couponCode?: string;
  ltoExpirationMs?: number;
  headerLocation?: { latitude: number; longitude: number; name?: string; address?: string };
  /** CATALOG / MPM button: the SKU whose image heads the card. */
  catalogThumbnailProductId?: string;
  /** MPM button: the product list by section — chosen per send, never authored. */
  productSections?: TemplateProductSectionValues[];
  /** PRODUCT header (single-product template): the SKU to show. */
  productRetailerId?: string;
  /** CAROUSEL cards, in card order — one entry per card the template carries. */
  carouselCards?: TemplateCarouselCardValues[];
}

/** One button as it will appear beneath the message bubble. */
export interface TemplatePreviewButton {
  /** Meta button type — URL, QUICK_REPLY, PHONE_NUMBER, COPY_CODE, OTP. */
  type: string;
  text: string;
  /** Resolved link for a URL button, or the coupon on a COPY_CODE button. */
  detail?: string;
}

/** The values a send form has collected so far, in preview-substitution shape. */
export interface TemplatePreviewValues {
  /** Positional body values — index 0 is {{1}}. */
  bodyParams?: string[];
  /** Named body values, keyed by the {{name}} token. */
  bodyNamedParams?: Record<string, string>;
  headerText?: string;
  headerMediaUrl?: string;
  buttonUrlParam?: string;
  /** One value per dynamic URL button, in authored order. */
  buttonUrlParams?: string[];
  otpCode?: string;
  couponCode?: string;
  /**
   * LIMITED_TIME_OFFER expiry, epoch ms.
   *
   * The countdown is the whole point of an offer template and the preview drew
   * nothing for it, so neither the compose preview nor — once a send was
   * persisted — the sent bubble could answer "has this customer's offer
   * expired?", which is exactly what they write in to ask.
   */
  ltoExpirationMs?: number;
  headerLocation?: { name?: string; address?: string };
  /** Per-card values, in card order. */
  carouselCards?: TemplateCarouselCardValues[];
}

/** One carousel card as it will appear beside the bubble. */
export interface TemplatePreviewCard {
  headerFormat: 'IMAGE' | 'VIDEO' | 'NONE';
  /** The media entered for this card, when one was. */
  mediaUrl: string | null;
  body: string;
  buttons: TemplatePreviewButton[];
}

export interface TemplatePreview {
  headerFormat: TemplateVarSpec['headerFormat'];
  /** Rendered TEXT header — null when the header is media, a pin, or absent. */
  headerText: string | null;
  /** Media URL entered for an IMAGE / VIDEO / DOCUMENT header, when supplied. */
  headerMediaUrl: string | null;
  /** "Name — address" for a LOCATION header, when supplied. */
  headerLocation: string | null;
  body: string;
  footer: string | null;
  /** The LIMITED_TIME_OFFER banner's label, when the template carries one. */
  offerText: string | null;
  /** That offer's expiry (epoch ms) — null when it runs no countdown. */
  offerExpiresAt: number | null;
  buttons: TemplatePreviewButton[];
  /** The carousel's cards, in order — empty for every other template. */
  cards: TemplatePreviewCard[];
  /**
   * Placeholders still without a value, verbatim ('{{1}}', '{{name}}'). A card's
   * are prefixed with the card they belong to ('card 2 {{1}}'): every card
   * numbers its variables from {{1}}, so a bare token would not say which card is
   * still empty.
   */
  unfilled: string[];
}

/**
 * Substitute `{{token}}` occurrences, collecting every placeholder left empty.
 * An unfilled placeholder is kept verbatim rather than blanked out: a hole in
 * the middle of a sentence is easy to miss, `{{2}}` is not.
 */
function substitute(
  text: string,
  lookup: (token: string) => string | undefined,
  unfilled: string[],
): string {
  return text.replace(/\{\{\s*([\w]+)\s*\}\}/g, (raw, token: string) => {
    const value = lookup(token);
    if (!value) {
      if (!unfilled.includes(raw)) unfilled.push(raw);
      return raw;
    }
    return value;
  });
}

/**
 * One carousel card's button chips, each dynamic link resolved against its OWN
 * value — a card may carry two URL buttons and Meta lets both be dynamic.
 */
function cardButtonPreviews(
  buttons: CarouselCardButtonSpec[],
  supplied: TemplateCarouselCardValues | undefined,
): TemplatePreviewButton[] {
  const values = supplied?.buttonUrlParams?.length
    ? supplied.buttonUrlParams
    : supplied?.buttonUrlParam
      ? [supplied.buttonUrlParam]
      : [];
  let slot = 0;
  return buttons.map((b) => {
    const detail = b.hasUrlVar ? values[slot++]?.trim() || undefined : undefined;
    return { type: b.type, text: b.text, ...(detail ? { detail } : {}) };
  });
}

/**
 * Render the message a send will actually produce — header, body, footer and
 * buttons with the entered values substituted in.
 *
 * Both send surfaces used to show only a `name (language)` dropdown over a
 * stack of `{{1}}` / `{{2}}` inputs, so the operator filled slots without ever
 * seeing the sentence they land in. Transposing two of them reads perfectly
 * fine in the form and sends "Hi ₹500, your order Rahul is ready" to a real
 * customer — and a broadcast repeats that for the whole audience, with no way
 * to take it back once Meta has accepted it.
 *
 * Mirrors the backend's renderTemplateBody / buildTemplateSendComponents
 * (whatsapp-template.service.ts), including the authentication-template rule
 * that the one-time code fills body {{1}} when no body value was typed.
 */
export function renderTemplatePreview(
  t: TemplateSource,
  values: TemplatePreviewValues = {},
): TemplatePreview {
  const cs = comps(t);
  const spec = analyzeTemplate(t);
  const find = (type: string) => cs.find((c) => (c.type ?? '').toUpperCase() === type);
  const header = find('HEADER');
  const body = find('BODY');
  const footer = find('FOOTER');
  const buttonsComp = find('BUTTONS');
  const offer = find('LIMITED_TIME_OFFER');
  const unfilled: string[] = [];
  // Whitespace-only input is "not filled" — it would send as a blank slot.
  const val = (s: string | undefined) => s?.trim() || undefined;

  const headerText =
    spec.headerFormat === 'TEXT' && header?.text
      ? substitute(header.text, () => val(values.headerText), unfilled)
      : null;

  const renderedBody = body?.text
    ? substitute(
        body.text,
        (token) => {
          if (!/^\d+$/.test(token)) return val(values.bodyNamedParams?.[token]);
          // An AUTHENTICATION template's body {{1}} IS the one-time code — Meta
          // renders it in the body and the button copies it, and the two must be
          // the same string. The send layer therefore derives the body parameter
          // from `otpCode` outright, so the preview does too: showing a separately
          // typed body value here would preview a message no recipient can get.
          if (Number(token) === 1 && spec.needsOtpCode) return val(values.otpCode);
          return val(values.bodyParams?.[Number(token) - 1]);
        },
        unfilled,
      )
    : '';

  // Each DYNAMIC url button resolves against its own value. Reusing one value for
  // all of them previewed a link the second button would never actually carry.
  const urlValues = values.buttonUrlParams?.length
    ? values.buttonUrlParams
    : values.buttonUrlParam
      ? [values.buttonUrlParam]
      : [];
  let urlSlot = 0;
  const buttons: TemplatePreviewButton[] = (buttonsComp?.buttons ?? []).map((b) => {
    const type = (b.type ?? '').toUpperCase();
    let detail: string | undefined;
    if (type === 'COPY_CODE') {
      detail = val(values.couponCode);
    } else if (type === 'PHONE_NUMBER' || type === 'VOICE_CALL') {
      // The number is part of the APPROVED template and carries no send
      // parameter, so it appeared nowhere in the thread: an operator could see
      // that a "Call us" button had gone out and not which line it dialled.
      detail = val(b.phone_number);
    } else if (b.url) {
      const dynamic = /\{\{\s*\d+\s*\}\}/.test(b.url);
      const value = dynamic ? urlValues[urlSlot] : undefined;
      if (dynamic) urlSlot += 1;
      detail = substitute(b.url, () => val(value), unfilled);
    }
    return { type, text: b.text ?? '', ...(detail ? { detail } : {}) };
  });

  // The cards. Each is substituted with its OWN values — the same card body text
  // repeated across ten cards with one value each is precisely what an operator
  // cannot check from a form full of {{1}} inputs.
  const cards: TemplatePreviewCard[] = spec.carouselCards.map((card, i) => {
    const supplied = values.carouselCards?.[i];
    const cardUnfilled: string[] = [];
    const body = card.bodyText
      ? substitute(
          card.bodyText,
          (token) => val(supplied?.bodyParams?.[Number(token) - 1]),
          cardUnfilled,
        )
      : '';
    for (const raw of cardUnfilled) {
      const labelled = `card ${i + 1} ${raw}`;
      if (!unfilled.includes(labelled)) unfilled.push(labelled);
    }
    return {
      headerFormat: card.headerFormat,
      mediaUrl: val(supplied?.headerMediaUrl) ?? val(supplied?.headerMediaId) ?? null,
      body,
      buttons: cardButtonPreviews(card.buttons, supplied),
    };
  });

  const locationParts = [val(values.headerLocation?.name), val(values.headerLocation?.address)];

  return {
    headerFormat: spec.headerFormat,
    headerText,
    headerMediaUrl: spec.headerNeedsMedia ? (val(values.headerMediaUrl) ?? null) : null,
    headerLocation:
      spec.headerNeedsLocation && locationParts.some(Boolean)
        ? locationParts.filter(Boolean).join(' — ')
        : null,
    body: renderedBody,
    footer: val(footer?.text) ?? null,
    offerText: val(offer?.limited_time_offer?.text) ?? null,
    // Only a countdown offer has an expiry to show. `has_expiration: false`
    // draws the banner and nothing else, and `needsLtoExpiration` already
    // encodes that rule for the send.
    offerExpiresAt: spec.needsLtoExpiration ? (values.ltoExpirationMs ?? null) : null,
    buttons,
    cards,
    unfilled,
  };
}

/**
 * A TEMPLATE message row's `payload`, as the send path persists it.
 *
 * Mirrors the server's `WaTemplateMessagePayload` (whatsapp-send.service.ts).
 * The components are the ones the message was APPROVED and SENT with, copied
 * onto the row: re-reading the template now would redraw an old message with
 * today's wording, or draw nothing at all once it has been deleted at Meta.
 */
export interface StoredTemplateMessage {
  name: string;
  language: string;
  /** The approved Meta components as they stood when this message went out. */
  components: unknown;
  /** What this particular send filled the placeholders with. */
  values: StoredTemplateValues;
}

/** The per-send values half of that payload. */
export interface StoredTemplateValues {
  headerText?: string;
  /** Uploaded header media — the same id the row carries in `mediaId`. */
  headerMediaId?: string;
  /** Header media by public link; there is no media row behind one of these. */
  headerMediaUrl?: string;
  headerMediaType?: 'image' | 'video' | 'document';
  headerMediaFilename?: string;
  headerLocation?: { latitude?: number; longitude?: number; name?: string; address?: string };
  bodyParams?: string[];
  bodyNamedParams?: Array<{ name: string; text: string }>;
  buttonUrlParams?: string[];
  couponCode?: string;
  ltoExpirationMs?: number;
  carouselCards?: TemplateCarouselCardValues[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A non-empty string, or nothing — the same "blank is not a value" rule the preview uses. */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** A string array, with non-strings flattened to '' so a slot never goes missing. */
function readStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => (typeof entry === 'string' ? entry : ''));
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readNamedParams(value: unknown): Array<{ name: string; text: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const name = readString(entry.name);
    return name ? [{ name, text: typeof entry.text === 'string' ? entry.text : '' }] : [];
  });
}

function readCardValues(value: unknown): TemplateCarouselCardValues[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((raw) => {
    if (!isRecord(raw)) return {};
    const type = readString(raw.headerMediaType);
    return {
      ...(readString(raw.headerMediaId) ? { headerMediaId: readString(raw.headerMediaId) } : {}),
      ...(readString(raw.headerMediaUrl) ? { headerMediaUrl: readString(raw.headerMediaUrl) } : {}),
      ...(type === 'image' || type === 'video' ? { headerMediaType: type } : {}),
      ...(readStrings(raw.bodyParams) ? { bodyParams: readStrings(raw.bodyParams) } : {}),
      ...(readStrings(raw.buttonUrlParams)
        ? { buttonUrlParams: readStrings(raw.buttonUrlParams) }
        : {}),
    };
  });
}

/**
 * Read a sent template message's payload, or null when it is not one of ours.
 *
 * The `values` object is the discriminator, not the presence of `template`: the
 * Chatwoot bridge persists the raw Cloud API body on the rows it dispatches, and
 * that body ALSO has `template.components` — the send PARAMETERS, which say
 * nothing about the approved layout. Rendering those as if they were authored
 * components would draw a confidently wrong bubble, so a bridge-sent template
 * falls back to its body text exactly as it does today.
 */
export function parseStoredTemplate(payload: unknown): StoredTemplateMessage | null {
  if (!isRecord(payload)) return null;
  const template = payload.template;
  const values = payload.values;
  if (!isRecord(template) || !isRecord(values)) return null;
  if (!Array.isArray(template.components)) return null;

  const headerMediaType = readString(values.headerMediaType);
  const location = isRecord(values.headerLocation) ? values.headerLocation : null;

  return {
    name: readString(template.name) ?? '',
    language: readString(template.language) ?? '',
    components: template.components,
    values: {
      ...(readString(values.headerText) ? { headerText: readString(values.headerText) } : {}),
      ...(readString(values.headerMediaId)
        ? { headerMediaId: readString(values.headerMediaId) }
        : {}),
      ...(readString(values.headerMediaUrl)
        ? { headerMediaUrl: readString(values.headerMediaUrl) }
        : {}),
      ...(headerMediaType === 'image' ||
      headerMediaType === 'video' ||
      headerMediaType === 'document'
        ? { headerMediaType }
        : {}),
      ...(readString(values.headerMediaFilename)
        ? { headerMediaFilename: readString(values.headerMediaFilename) }
        : {}),
      ...(location
        ? {
            headerLocation: {
              ...(readNumber(location.latitude) !== undefined
                ? { latitude: readNumber(location.latitude) }
                : {}),
              ...(readNumber(location.longitude) !== undefined
                ? { longitude: readNumber(location.longitude) }
                : {}),
              ...(readString(location.name) ? { name: readString(location.name) } : {}),
              ...(readString(location.address) ? { address: readString(location.address) } : {}),
            },
          }
        : {}),
      ...(readStrings(values.bodyParams) ? { bodyParams: readStrings(values.bodyParams) } : {}),
      ...(readNamedParams(values.bodyNamedParams)
        ? { bodyNamedParams: readNamedParams(values.bodyNamedParams) }
        : {}),
      ...(readStrings(values.buttonUrlParams)
        ? { buttonUrlParams: readStrings(values.buttonUrlParams) }
        : {}),
      ...(readString(values.couponCode) ? { couponCode: readString(values.couponCode) } : {}),
      ...(readNumber(values.ltoExpirationMs) !== undefined
        ? { ltoExpirationMs: readNumber(values.ltoExpirationMs) }
        : {}),
      ...(readCardValues(values.carouselCards)
        ? { carouselCards: readCardValues(values.carouselCards) }
        : {}),
    },
  };
}

/**
 * Render a SENT template message the way the compose preview renders the message
 * it is about to send — same parser, same substitution, same markup.
 *
 * The operator used to see the full message in the compose modal, click Send and
 * watch a stripped-down bubble appear: header, footer, buttons and carousel cards
 * were all missing from the record of the very message they had just checked.
 */
export function storedTemplatePreview(stored: StoredTemplateMessage): TemplatePreview {
  const v = stored.values;
  return renderTemplatePreview(
    { components: stored.components },
    {
      bodyParams: v.bodyParams,
      // The renderer takes named values keyed by token; the send stores them as
      // the ordered array Meta's `parameter_name` parameters are built from.
      bodyNamedParams: Object.fromEntries((v.bodyNamedParams ?? []).map((e) => [e.name, e.text])),
      headerText: v.headerText,
      headerMediaUrl: v.headerMediaUrl,
      buttonUrlParams: v.buttonUrlParams,
      // An AUTHENTICATION send stores the one-time code exactly once, as the body
      // parameter it was sent as — the send derives one from the other precisely
      // so the body and the copy button cannot disagree. Feeding it back here
      // keeps the bubble's body from rendering a bare "{{1}}".
      otpCode: v.bodyParams?.[0],
      couponCode: v.couponCode,
      ltoExpirationMs: v.ltoExpirationMs,
      headerLocation: v.headerLocation,
      carouselCards: v.carouselCards,
    },
  );
}

/**
 * A campaign's variable mapping holds per-recipient tokens rather than literal
 * text, so a campaign preview stands a sample contact in for them: the question
 * a preview answers is WHERE each value lands in the sentence, not whose data
 * it is. Tokens are matched exactly as the backend's resolveVars matches them
 * (whatsapp-campaign.service.ts) — no trimming, so a stray space previews as
 * the literal it would actually send.
 */
const SAMPLE_CONTACT = new Map<string, string>([
  ['name', 'Priya Sharma'],
  ['phone', '+91 98765 43210'],
]);

export const SAMPLE_CONTACT_NOTE =
  '{{name}}, {{phone}} and {{attr.…}} are shown with sample data — every recipient gets their own.';

/** `{{token}}` or `{{token|fallback}}`; mirrors MAPPING_TOKEN on the server. */
const SAMPLE_TOKEN = /^\{\{([^}]+)\}\}$/;

/** Split a mapping entry into its token and its optional `|fallback`. */
function splitToken(entry: string): { token: string; fallback: string | null } | null {
  const match = SAMPLE_TOKEN.exec(entry);
  if (!match) return null;
  const pipe = match[1].indexOf('|');
  return {
    token: (pipe === -1 ? match[1] : match[1].slice(0, pipe)).trim(),
    fallback: pipe === -1 ? null : match[1].slice(pipe + 1),
  };
}

/** A token the backend resolves per recipient (as opposed to a typed literal). */
function isContactToken(token: string): boolean {
  return SAMPLE_CONTACT.has(token) || token.startsWith('attr.') || token.startsWith('attributes.');
}

/**
 * Resolve one campaign mapping token for preview; a literal passes through.
 *
 * Understands the same three forms the send path does: `{{name}}`, an attribute
 * (`{{attr.city}}`) and a fallback (`{{name|there}}`). An attribute has no
 * sample value to stand in for, so the key itself is shown — the preview's job
 * is to say WHERE a value lands in the sentence.
 */
export function resolveSampleToken(entry: string): string {
  const parsed = splitToken(entry);
  if (!parsed) return entry;
  const sample = SAMPLE_CONTACT.get(parsed.token);
  if (sample) return sample;
  if (parsed.token.startsWith('attr.')) return parsed.token.slice(5);
  if (parsed.token.startsWith('attributes.')) return parsed.token.slice(11);
  // Not a token we resolve — the operator typed a literal that looks like one.
  return entry;
}

/** True when a mapping carries a per-recipient token, i.e. the preview is sample data. */
export function usesSampleContact(mapping: string[]): boolean {
  return mapping.some((entry) => {
    const parsed = splitToken(entry);
    return parsed ? isContactToken(parsed.token) : false;
  });
}

/**
 * Mapping entries that will resolve to nothing for a contact missing that field.
 *
 * Meta rejects an empty template parameter and fails the WHOLE message, so a
 * bare `{{name}}` over a list of mostly nameless imported contacts hard-fails
 * most of the audience. A `|fallback` makes that impossible, which is why only
 * fallback-less contact tokens are reported. `{{phone}}` is excluded: every
 * contact is keyed by one, so it can never resolve blank.
 */
export function tokensWithoutFallback(mapping: string[]): string[] {
  return mapping.filter((entry) => {
    const parsed = splitToken(entry);
    if (!parsed || parsed.fallback !== null) return false;
    return parsed.token !== 'phone' && isContactToken(parsed.token);
  });
}
