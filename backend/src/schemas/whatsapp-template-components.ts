import { z } from 'zod';

/**
 * Structural validation for a template's Meta `components` array.
 *
 * This used to be `z.array(z.any()).min(1)`. Every structural mistake — a
 * missing BODY, two headers, a footer with a placeholder, eleven buttons, a body
 * variable with no example — was therefore found by META, one Graph round trip
 * later, and came back as a prose string ("Invalid parameter") that maps to no
 * field in the wizard. The browser builder was the only real validator, so any
 * other caller of POST /templates could submit anything at all, and a template
 * name is claimed permanently at Meta the moment a submission is accepted.
 *
 * The rules below mirror the ones the builder already enforces
 * (frontend/src/components/whatsapp/TemplateBuilder.tsx `buildStandardComponents`)
 * so the two agree. The difference is that a zod issue carries a PATH —
 * `components.3.buttons.1.url` — which the raw Meta string never could.
 *
 * Every object here is LOOSE on purpose. `validate` REASSIGNS req.body to the
 * parsed result, so a strict object would silently delete any Meta field this
 * file does not model yet and the submission would go out missing it.
 */

/** Meta's own limits, in the units Meta counts them. */
const HEADER_TEXT_MAX = 60;
const BODY_TEXT_MAX = 1024;
const FOOTER_TEXT_MAX = 60;
const BUTTON_TEXT_MAX = 25;
const MAX_BUTTONS = 10;
const MAX_URL_BUTTONS = 2;
/** Meta's app signing-key hash is always exactly 11 base64 characters. */
const SIGNATURE_HASH_LEN = 11;

/** Every `{{token}}` in a string, in order of appearance (duplicates kept). */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
}

/** Distinct placeholders, in first-appearance order. */
function distinctPlaceholders(text: string): string[] {
  return [...new Set(placeholders(text))];
}

const isPositional = (token: string): boolean => /^\d+$/.test(token);

const hasPositionalVar = (text: string): boolean => /\{\{\s*\d+\s*\}\}/.test(text);

// ── HEADER ───────────────────────────────────────────────────────────────────
const headerComponent = z
  .looseObject({
    type: z.literal('HEADER'),
    format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION']),
    text: z
      .string()
      .max(HEADER_TEXT_MAX, `A header is limited to ${HEADER_TEXT_MAX} characters`)
      .optional(),
    example: z
      .looseObject({
        header_text: z.array(z.string()).optional(),
        header_handle: z.array(z.string().min(1)).optional(),
      })
      .optional(),
  })
  .superRefine((c, ctx) => {
    if (c.format === 'TEXT') {
      if (!c.text?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['text'], message: 'A TEXT header needs its text' });
        return;
      }
      const vars = distinctPlaceholders(c.text);
      if (vars.length > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['text'],
          message: 'A header can carry at most one variable',
        });
      }
      // A header parameter is sent WITHOUT a `parameter_name`, so a named header
      // is approved by Meta and then refused on every single send with
      // (#131008) — approvable and unsendable.
      if (vars.some((v) => !isPositional(v))) {
        ctx.addIssue({
          code: 'custom',
          path: ['text'],
          message:
            'Header variables must be numbered ({{1}}) — named placeholders are supported in the body only',
        });
      }
      const samples = c.example?.header_text ?? [];
      if (vars.length && samples.length !== vars.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['example', 'header_text'],
          message: `Provide ${vars.length} example value(s) for the header variable(s)`,
        });
      }
    } else if (c.format === 'IMAGE' || c.format === 'VIDEO' || c.format === 'DOCUMENT') {
      // Meta reviews a media header against the uploaded sample; without a handle
      // the whole submission is rejected.
      if (!c.example?.header_handle?.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['example', 'header_handle'],
          message: `A ${c.format} header needs an uploaded sample (example.header_handle)`,
        });
      }
    }
    // LOCATION headers carry no authoring configuration at all — the pin is
    // supplied per send.
  });

// ── BODY ─────────────────────────────────────────────────────────────────────
const bodyComponent = z
  .looseObject({
    type: z.literal('BODY'),
    text: z
      .string()
      .max(BODY_TEXT_MAX, `The body is limited to ${BODY_TEXT_MAX} characters`)
      .optional(),
    /**
     * AUTHENTICATION templates only: Meta writes the body itself, and the single
     * choice we get is whether it carries the "do not share this code" line — so
     * such a body legitimately has no `text` at all.
     */
    add_security_recommendation: z.boolean().optional(),
    example: z
      .looseObject({
        body_text: z.array(z.array(z.string())).optional(),
        body_text_named_params: z
          .array(z.looseObject({ param_name: z.string().min(1), example: z.string() }))
          .optional(),
      })
      .optional(),
  })
  .superRefine((c, ctx) => {
    const text = c.text?.trim() ?? '';
    if (!text) {
      if (c.add_security_recommendation === undefined) {
        ctx.addIssue({ code: 'custom', path: ['text'], message: 'The body text is required' });
      }
      return;
    }
    const vars = distinctPlaceholders(text);
    const positional = vars.filter(isPositional);
    const named = vars.filter((v) => !isPositional(v));
    if (positional.length && named.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['text'],
        message:
          'Use either numbered {{1}} or named {{customer_name}} placeholders in the body, not both',
      });
      return;
    }
    if (positional.length) {
      // Meta requires 1…n with no gaps. A body written with {{1}} and {{3}} is
      // rejected days later with a reason that names no field.
      const numbers = [...positional.map(Number)].sort((a, b) => a - b);
      if (!numbers.every((n, i) => n === i + 1)) {
        ctx.addIssue({
          code: 'custom',
          path: ['text'],
          message: `Body variables must run 1…${numbers.length} with no gaps (found ${numbers
            .map((n) => `{{${n}}}`)
            .join(', ')})`,
        });
      }
      const samples = c.example?.body_text?.[0];
      if (!samples || samples.length !== positional.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['example', 'body_text'],
          message: `Provide an example value for each of the ${positional.length} body variable(s)`,
        });
      }
    }
    if (named.length) {
      // Named templates carry one example PER NAME, not a positional array.
      const covered = new Set((c.example?.body_text_named_params ?? []).map((s) => s.param_name));
      const missing = named.filter((n) => !covered.has(n));
      if (missing.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['example', 'body_text_named_params'],
          message: `Provide an example value for ${missing.map((n) => `{{${n}}}`).join(', ')}`,
        });
      }
    }
  });

// ── FOOTER ───────────────────────────────────────────────────────────────────
const footerComponent = z
  .looseObject({
    type: z.literal('FOOTER'),
    text: z
      .string()
      .max(FOOTER_TEXT_MAX, `A footer is limited to ${FOOTER_TEXT_MAX} characters`)
      .optional(),
    /** AUTHENTICATION templates: Meta renders the expiry sentence itself. */
    code_expiration_minutes: z.number().int().min(1).max(90).optional(),
  })
  .superRefine((c, ctx) => {
    const text = c.text?.trim() ?? '';
    if (!text) {
      if (c.code_expiration_minutes === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['text'],
          message:
            'A footer needs text (or, on an authentication template, code_expiration_minutes)',
        });
      }
      return;
    }
    if (placeholders(text).length) {
      ctx.addIssue({
        code: 'custom',
        path: ['text'],
        message: 'A footer cannot contain variables',
      });
    }
  });

// ── BUTTONS ──────────────────────────────────────────────────────────────────
/**
 * The button types this console can author, plus the catalogue ones Meta accepts
 * on a MARKETING template.
 *
 * VOICE_CALL is deliberately absent, matching the builder: Meta's Calling API is
 * not implemented here, so a "Call on WhatsApp" button is approved and then drops
 * every customer who taps it into a call nothing in this console can pick up.
 */
const BUTTON_TYPES = [
  'QUICK_REPLY',
  'URL',
  'PHONE_NUMBER',
  'COPY_CODE',
  'FLOW',
  'OTP',
  'CATALOG',
  'MPM',
  'SPM',
] as const;

const buttonSchema = z
  .looseObject({
    type: z.enum(BUTTON_TYPES),
    text: z
      .string()
      .max(BUTTON_TEXT_MAX, `Button labels are limited to ${BUTTON_TEXT_MAX} characters`)
      .optional(),
    url: z.string().optional(),
    phone_number: z.string().optional(),
    /** Sample URL suffix / coupon code. Meta accepts a scalar or an array. */
    example: z.union([z.string(), z.array(z.string())]).optional(),
    flow_id: z.string().optional(),
    flow_action: z.enum(['navigate', 'data_exchange']).optional(),
    otp_type: z.enum(['COPY_CODE', 'ONE_TAP', 'ZERO_TAP']).optional(),
    package_name: z.string().optional(),
    signature_hash: z.string().optional(),
    zero_tap_terms_accepted: z.boolean().optional(),
  })
  .superRefine((b, ctx) => {
    const needsText = (): boolean => {
      if (b.text?.trim()) return true;
      ctx.addIssue({ code: 'custom', path: ['text'], message: `A ${b.type} button needs a label` });
      return false;
    };
    switch (b.type) {
      case 'QUICK_REPLY':
        needsText();
        break;
      case 'URL': {
        needsText();
        const url = b.url?.trim() ?? '';
        if (!url) {
          ctx.addIssue({ code: 'custom', path: ['url'], message: 'A URL button needs a URL' });
          break;
        }
        // A {{1}} suffix makes the link a per-send parameter, and Meta reviews it
        // against the example. Without one the submission is rejected.
        if (hasPositionalVar(url)) {
          const example = Array.isArray(b.example) ? b.example : b.example ? [b.example] : [];
          if (!example.some((e) => e.trim())) {
            ctx.addIssue({
              code: 'custom',
              path: ['example'],
              message: 'A dynamic URL button needs an example URL',
            });
          }
        }
        break;
      }
      case 'PHONE_NUMBER':
        needsText();
        if (!b.phone_number?.trim()) {
          ctx.addIssue({
            code: 'custom',
            path: ['phone_number'],
            message: 'A call button needs a phone number',
          });
        }
        break;
      case 'COPY_CODE': {
        const example = Array.isArray(b.example) ? b.example : b.example ? [b.example] : [];
        if (!example.some((e) => e.trim())) {
          ctx.addIssue({
            code: 'custom',
            path: ['example'],
            message: 'A copy-code button needs a sample code for Meta review',
          });
        }
        break;
      }
      case 'FLOW':
        needsText();
        if (!b.flow_id?.trim()) {
          ctx.addIssue({
            code: 'custom',
            path: ['flow_id'],
            message: 'A flow button needs a flow id',
          });
        }
        break;
      case 'OTP': {
        if (!b.otp_type) {
          ctx.addIssue({
            code: 'custom',
            path: ['otp_type'],
            message: 'An OTP button needs otp_type',
          });
          break;
        }
        // ONE_TAP / ZERO_TAP hand the code straight to the Android app, which
        // Meta only allows once it can verify the app receiving it.
        if (b.otp_type !== 'COPY_CODE') {
          if (!b.package_name?.trim()) {
            ctx.addIssue({
              code: 'custom',
              path: ['package_name'],
              message: 'Autofill needs the Android package name',
            });
          }
          if (b.signature_hash?.trim().length !== SIGNATURE_HASH_LEN) {
            ctx.addIssue({
              code: 'custom',
              path: ['signature_hash'],
              message: `Autofill needs the ${SIGNATURE_HASH_LEN}-character app signing-key hash`,
            });
          }
        }
        // Meta refuses a zero-tap submission that does not carry the terms
        // acknowledgement, and its error names no field.
        if (b.otp_type === 'ZERO_TAP' && b.zero_tap_terms_accepted !== true) {
          ctx.addIssue({
            code: 'custom',
            path: ['zero_tap_terms_accepted'],
            message: 'Zero-tap requires zero_tap_terms_accepted: true',
          });
        }
        break;
      }
      // CATALOG / MPM / SPM take their content from the connected Meta catalog.
      default:
        break;
    }
  });

const buttonsComponent = z
  .looseObject({
    type: z.literal('BUTTONS'),
    buttons: z
      .array(buttonSchema)
      .min(1, 'A BUTTONS component needs at least one button')
      .max(MAX_BUTTONS, `A template can have at most ${MAX_BUTTONS} buttons`),
  })
  .superRefine((c, ctx) => {
    const count = (type: string): number => c.buttons.filter((b) => b.type === type).length;
    if (count('URL') > MAX_URL_BUTTONS) {
      ctx.addIssue({
        code: 'custom',
        path: ['buttons'],
        message: `A template can have at most ${MAX_URL_BUTTONS} website buttons`,
      });
    }
    if (count('PHONE_NUMBER') > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['buttons'],
        message: 'A template can have at most one call button',
      });
    }
    if (count('COPY_CODE') > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['buttons'],
        message: 'A template can have at most one copy-code button',
      });
    }
    if (count('OTP') > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['buttons'],
        message: 'A template can have at most one OTP button',
      });
    }
    // Only ONE URL button may carry a variable: the send layer addresses it by
    // index and can only fill one of them.
    const dynamicUrls = c.buttons.filter(
      (b) => b.type === 'URL' && hasPositionalVar(b.url ?? '')
    ).length;
    if (dynamicUrls > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['buttons'],
        message: 'Only one website button can carry a {{1}} variable',
      });
    }
    if (count('CATALOG') && c.buttons.length > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['buttons'],
        message: 'A catalog button must be the only button in the template',
      });
    }
  });

// ── LIMITED_TIME_OFFER (marketing add-on) ────────────────────────────────────
const ltoComponent = z.looseObject({
  type: z.literal('LIMITED_TIME_OFFER'),
  limited_time_offer: z.looseObject({
    text: z.string().min(1, 'The offer text is required').max(16),
    has_expiration: z.boolean().optional(),
  }),
});

// ── CAROUSEL ─────────────────────────────────────────────────────────────────
/**
 * A carousel template: one message bubble followed by up to ten swipeable cards.
 *
 * This branch used to be `cards: z.array(z.unknown())` because carousels could
 * only arrive from a Meta sync and there was no card editor to validate against.
 * The wizard authors them now (TemplateBuilder `buildCarouselComponent`), so
 * leaving it permissive would make the cards the ONE part of a submission that
 * nothing checks — and a carousel's rules are cross-card, exactly the kind of
 * mistake Meta answers with a prose string that names no field.
 *
 * Meta's card rules, all enforced below:
 *  - at most ten cards;
 *  - every card carries the same component shape (a media header, a body, and
 *    the same buttons);
 *  - a card header is IMAGE or VIDEO — never text — and the same format on every
 *    card;
 *  - each card's buttons match every other card's in type AND order, because the
 *    handset renders one shared button row for the whole carousel.
 */
const MAX_CAROUSEL_CARDS = 10;
const CARD_BODY_TEXT_MAX = 160;
const MAX_CARD_BUTTONS = 2;

/** A card's header. Media only — a carousel card cannot carry a text header. */
const cardHeaderComponent = z
  .looseObject({
    type: z.literal('HEADER'),
    format: z.enum(['IMAGE', 'VIDEO']),
    example: z.looseObject({ header_handle: z.array(z.string().min(1)).optional() }).optional(),
  })
  .superRefine((c, ctx) => {
    // Same rule as a media header on the bubble: Meta reviews the card against
    // the uploaded sample and rejects the whole submission without one.
    if (!c.example?.header_handle?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['example', 'header_handle'],
        message: `A ${c.format} card header needs an uploaded sample (example.header_handle)`,
      });
    }
  });

/**
 * A card's body. Positional placeholders only, and a far shorter limit than the
 * bubble's: a card parameter is sent WITHOUT a `parameter_name`, so a named card
 * placeholder is approved by Meta and then refused on every send with (#131008).
 */
const cardBodyComponent = z
  .looseObject({
    type: z.literal('BODY'),
    text: z
      .string()
      .max(CARD_BODY_TEXT_MAX, `A card body is limited to ${CARD_BODY_TEXT_MAX} characters`)
      .optional(),
    example: z.looseObject({ body_text: z.array(z.array(z.string())).optional() }).optional(),
  })
  .superRefine((c, ctx) => {
    const text = c.text?.trim() ?? '';
    if (!text) {
      ctx.addIssue({ code: 'custom', path: ['text'], message: 'A carousel card needs body text' });
      return;
    }
    const vars = distinctPlaceholders(text);
    if (vars.some((v) => !isPositional(v))) {
      ctx.addIssue({
        code: 'custom',
        path: ['text'],
        message:
          'Card variables must be numbered ({{1}}) — named placeholders are supported in the message bubble only',
      });
      return;
    }
    if (!vars.length) return;
    // Each card is numbered from {{1}} independently of the bubble and of every
    // other card, and Meta requires 1…n with no gaps.
    const numbers = vars.map(Number).sort((a, b) => a - b);
    if (!numbers.every((n, i) => n === i + 1)) {
      ctx.addIssue({
        code: 'custom',
        path: ['text'],
        message: `Card variables must run 1…${numbers.length} with no gaps (found ${numbers
          .map((n) => `{{${n}}}`)
          .join(', ')})`,
      });
    }
    const samples = c.example?.body_text?.[0];
    if (!samples || samples.length !== vars.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['example', 'body_text'],
        message: `Provide an example value for each of the ${vars.length} card variable(s)`,
      });
    }
  });

/** A card's buttons — the same per-button rules as the bubble's, capped at two. */
const cardButtonsComponent = z.looseObject({
  type: z.literal('BUTTONS'),
  buttons: z
    .array(buttonSchema)
    .min(1, 'A BUTTONS component needs at least one button')
    .max(MAX_CARD_BUTTONS, `A carousel card can have at most ${MAX_CARD_BUTTONS} buttons`),
});

const cardComponentSchema = z.discriminatedUnion('type', [
  cardHeaderComponent,
  cardBodyComponent,
  cardButtonsComponent,
]);

/** The shape a card presents to the cross-card consistency checks below. */
function cardShape(card: unknown): { header: string; buttons: string[] } {
  const comps = ((card as { components?: unknown })?.components ?? []) as Array<{
    type?: unknown;
    format?: unknown;
    buttons?: Array<{ type?: unknown }>;
  }>;
  const find = (t: string) => comps.find((c) => String(c?.type ?? '').toUpperCase() === t);
  return {
    header: String(find('HEADER')?.format ?? 'NONE').toUpperCase(),
    buttons: (find('BUTTONS')?.buttons ?? []).map((b) => String(b?.type ?? '').toUpperCase()),
  };
}

const carouselCardSchema = z
  .looseObject({
    components: z
      .array(z.preprocess(normalizeComponent, cardComponentSchema))
      .min(1, 'A carousel card needs a header and a body'),
  })
  .superRefine((card, ctx) => {
    const countOf = (type: string): number =>
      card.components.filter((c) => (c as { type?: string }).type === type).length;
    if (countOf('HEADER') !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['components'],
        message: 'Every carousel card needs exactly one IMAGE or VIDEO header',
      });
    }
    if (countOf('BODY') !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['components'],
        message: 'Every carousel card needs exactly one BODY component',
      });
    }
    if (countOf('BUTTONS') > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['components'],
        message: 'A carousel card can have at most one BUTTONS component',
      });
    }
  });

const carouselComponent = z
  .looseObject({
    type: z.literal('CAROUSEL'),
    cards: z
      .array(carouselCardSchema)
      // min 1 rather than 2: the lower bound is Meta's to police, and rejecting a
      // single-card carousel here would make one synced from the Graph API
      // unmanageable in the edit path. The builder asks for two, which is the
      // point at which a carousel is a carousel.
      .min(1, 'A carousel needs at least one card')
      .max(MAX_CAROUSEL_CARDS, `A carousel is limited to ${MAX_CAROUSEL_CARDS} cards`),
  })
  .superRefine((c, ctx) => {
    // Cross-card consistency. WhatsApp renders ONE media frame and ONE button row
    // for the whole carousel, so Meta requires every card to agree; a mismatch
    // comes back days later as a rejection that names neither card.
    const first = cardShape(c.cards[0]);
    const describe = (b: string[]): string => (b.length ? b.join(' + ') : 'no buttons');
    c.cards.forEach((card, i) => {
      if (i === 0) return;
      const shape = cardShape(card);
      if (shape.header !== first.header) {
        ctx.addIssue({
          code: 'custom',
          path: ['cards', i],
          message: `Every card must use the same header format — card ${i + 1} is ${
            shape.header
          } but card 1 is ${first.header}`,
        });
      }
      if (shape.buttons.join(',') !== first.buttons.join(',')) {
        ctx.addIssue({
          code: 'custom',
          path: ['cards', i],
          message: `Every card needs the same buttons in the same order — card ${
            i + 1
          } has ${describe(shape.buttons)} but card 1 has ${describe(first.buttons)}`,
        });
      }
    });
  });

const componentSchema = z.discriminatedUnion('type', [
  headerComponent,
  bodyComponent,
  footerComponent,
  buttonsComponent,
  ltoComponent,
  carouselComponent,
]);

/**
 * Meta accepts only uppercase `type` / `format` on a create, and lowercase is
 * the easiest thing in the world to send from a script. Normalising here means
 * such a call gets validated rather than bounced with "Invalid discriminator",
 * and — because `validate` reassigns req.body — Meta receives the uppercase form
 * it requires.
 */
function normalizeComponent(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const c = value as Record<string, unknown>;
  const out: Record<string, unknown> = { ...c };
  if (typeof c.type === 'string') out.type = c.type.toUpperCase();
  if (typeof c.format === 'string') out.format = c.format.toUpperCase();
  if (Array.isArray(c.buttons)) {
    out.buttons = c.buttons.map((b) =>
      b && typeof b === 'object' && typeof (b as { type?: unknown }).type === 'string'
        ? {
            ...(b as Record<string, unknown>),
            type: String((b as { type: string }).type).toUpperCase(),
          }
        : b
    );
  }
  return out;
}

/** The `components` array of a template submission, structurally validated. */
export const templateComponentsSchema = z
  .array(z.preprocess(normalizeComponent, componentSchema))
  .min(1, 'A template needs at least a body component')
  .superRefine((components, ctx) => {
    const countOf = (type: string): number =>
      components.filter((c) => (c as { type?: string }).type === type).length;
    const bodies = countOf('BODY');
    if (bodies === 0) {
      ctx.addIssue({ code: 'custom', message: 'A template must have exactly one BODY component' });
    } else if (bodies > 1) {
      ctx.addIssue({
        code: 'custom',
        message: `A template must have exactly one BODY component (found ${bodies})`,
      });
    }
    for (const type of ['HEADER', 'FOOTER', 'BUTTONS', 'LIMITED_TIME_OFFER', 'CAROUSEL'] as const) {
      if (countOf(type) > 1) {
        ctx.addIssue({
          code: 'custom',
          message: `A template can have at most one ${type} component (found ${countOf(type)})`,
        });
      }
    }
    // A carousel template's own bubble carries body text and nothing else — the
    // media and the buttons belong to the cards. Meta rejects a bubble header or
    // a bubble button row on a carousel, and the builder hides both once cards
    // exist, so this states the same rule for every other caller.
    if (countOf('CAROUSEL') === 1) {
      for (const type of ['HEADER', 'BUTTONS'] as const) {
        if (countOf(type) > 0) {
          ctx.addIssue({
            code: 'custom',
            message: `A carousel template's message bubble carries body text only — put the ${type} on the cards`,
          });
        }
      }
    }
  });

/**
 * Cross-check `parameter_format` against the placeholders actually written in
 * the body.
 *
 * Meta rejects a {{word}} body submitted as POSITIONAL, and a {{1}} body
 * submitted as NAMED, and neither rejection names the mismatch — the template
 * simply comes back rejected days later with its name permanently claimed.
 *
 * Written as a standalone refinement because the two fields live side by side on
 * the request body, not inside `components`.
 */
export function refineParameterFormat(
  value: { components?: unknown; parameterFormat?: 'POSITIONAL' | 'NAMED' },
  ctx: z.RefinementCtx
): void {
  if (!value.parameterFormat || !Array.isArray(value.components)) return;
  const body = value.components.find(
    (c) => String((c as { type?: unknown })?.type ?? '').toUpperCase() === 'BODY'
  ) as { text?: unknown } | undefined;
  const text = typeof body?.text === 'string' ? body.text : '';
  const vars = distinctPlaceholders(text);
  if (!vars.length) return;
  const named = vars.filter((v) => !isPositional(v));
  if (value.parameterFormat === 'NAMED' && named.length !== vars.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['components'],
      message: 'parameterFormat NAMED needs {{word}} placeholders in the body, not {{1}}',
    });
  }
  if (value.parameterFormat === 'POSITIONAL' && named.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['components'],
      message: `parameterFormat POSITIONAL needs numbered placeholders — the body uses {{${named[0]}}}`,
    });
  }
}
