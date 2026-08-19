import { z } from 'zod';
import { WaConversationStatus, WaTemplateCategory, WaOptInStatus } from '@prisma/client';
import {
  WA_PROFILE_VERTICALS,
  WA_COMMAND_MAX,
  WA_COMMAND_NAME_MAX,
  WA_COMMAND_DESCRIPTION_MAX,
  WA_ICE_BREAKER_MAX,
  WA_ICE_BREAKER_TEXT_MAX,
} from '../services/whatsapp-channel.service';
import { templateComponentsSchema, refineParameterFormat } from './whatsapp-template-components';

export const waSendMessageSchema = z.object({
  body: z.object({
    text: z.string().min(1).max(4096),
    // The WAMID this message quotes. validate.ts REASSIGNS req.body to the parsed
    // result, so zod's default strip silently deleted this — the reply-to feature
    // was wired end to end in the UI and died at the wire, quoting nothing.
    contextWamid: z.string().max(200).optional(),
  }),
});

export const waAssignSchema = z.object({
  body: z.object({
    // A free-text operator label, not a User FK — `uuid()` here would reject the
    // module's own OPERATOR_LABEL (default: "operator").
    assignedTo: z.string().max(120).nullable().optional(),
  }),
});

export const waStatusSchema = z.object({
  body: z.object({
    status: z.nativeEnum(WaConversationStatus),
  }),
});

export const waCreateTemplateSchema = z.object({
  body: z
    .object({
      name: z
        .string()
        .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers and underscores only')
        .max(512),
      language: z.string().min(2).max(10),
      category: z.nativeEnum(WaTemplateCategory),

      // Structurally validated rather than waved through as `any`. Every
      // structural mistake used to cost a Graph round trip and come back as a
      // prose string that mapped to no field in the wizard — while the template
      // NAME was claimed at Meta forever the moment a submission was accepted.
      components: templateComponentsSchema,

      variableSample: z.any().optional(),

      // Meta requires `parameter_format: 'NAMED'` for a template whose body uses
      // {{word}} placeholders. Without it a hand-typed {{customer_name}} was
      // submitted as a positional template and rejected.
      parameterFormat: z.enum(['POSITIONAL', 'NAMED']).optional(),

      // Meta's delivery deadline for the message (seconds). Authentication
      // templates take 60-600; utility templates 30-900. An OTP queued behind a
      // rate limit used to be delivered after the code had already expired.
      messageSendTtlSeconds: z.number().int().min(30).max(900).optional(),
    })
    .superRefine(refineParameterFormat),
});

/**
 * Save a template WITHOUT submitting it to Meta (status LOCAL).
 *
 * Deliberately relaxed: a draft is by definition half-finished, so the
 * components are stored as-is and only checked when the operator submits. The
 * previous behaviour was that closing the builder threw the whole thing away —
 * including an uploaded header sample, which had to be re-uploaded from scratch.
 */
export const waDraftTemplateSchema = z.object({
  body: z.object({
    name: z
      .string()
      .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers and underscores only')
      .max(512),
    language: z.string().min(2).max(10),
    category: z.nativeEnum(WaTemplateCategory),
    components: z.array(z.any()).default([]),
    variableSample: z.any().optional(),
    parameterFormat: z.enum(['POSITIONAL', 'NAMED']).optional(),
    messageSendTtlSeconds: z.number().int().min(30).max(900).optional(),
  }),
});

/**
 * Create a template from Meta's pre-approved LIBRARY catalogue.
 *
 * No components at all: the library entry supplies them, which is exactly why
 * such a template is approved instantly. Only the button inputs (a URL, a phone
 * number) are ours to fill in.
 */
export const waLibraryTemplateSchema = z.object({
  body: z.object({
    name: z
      .string()
      .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers and underscores only')
      .max(512),
    language: z.string().min(2).max(10),
    category: z.nativeEnum(WaTemplateCategory),
    libraryTemplateName: z.string().min(1).max(512),
    /**
     * Meta's `library_template_button_inputs`, forwarded verbatim.
     *
     * Only the discriminating `type` is required: the payload shape differs per
     * button kind (a URL button nests base_url + url_suffix_example, a phone
     * button carries a bare string), and Meta is the authority on it. Modelling
     * it more tightly here would reject inputs Meta accepts.
     */
    buttonInputs: z
      .array(z.looseObject({ type: z.string().min(1) }))
      .max(10)
      .optional(),
  }),
});

/**
 * Per-card send values for a CAROUSEL template, in card order.
 *
 * A carousel's media, text and button values belong to the CARDS, and each card
 * numbers its own body variables from {{1}} — so this cannot be flattened into
 * the bubble's parameter list. Ten is Meta's card limit; `bodyParams` is capped
 * at the same 10 the bubble allows, because Meta counts card variables per card.
 */
const templateCarouselCards = z
  .array(
    z.object({
      /** A media id already staged at Meta (preferred — see headerImageId). */
      headerMediaId: z.string().max(200).optional(),
      headerMediaUrl: z.string().url().optional(),
      /** Only needed when the caller has no stored components to read it from. */
      headerMediaType: z.enum(['image', 'video']).optional(),
      bodyParams: z.array(z.string().max(1024)).max(10).optional(),
      buttonUrlParam: z.string().max(2000).optional(),
      /** One value per dynamic URL button on THIS card — Meta allows two. */
      buttonUrlParams: z.array(z.string().max(2000)).max(2).optional(),
    })
  )
  .max(10)
  .optional();

/**
 * The product list a multi-product (MPM) template is sent with.
 *
 * Chosen per send, never at authoring time — an MPM template is approved with an
 * empty button and Meta reads the products off the send payload — so without
 * this the message renders a product list with nothing in it. Meta's ceilings:
 * up to 10 sections, 30 products across all of them, 24-character titles.
 */
const templateProductSections = z
  .array(
    z.object({
      title: z.string().min(1).max(24),
      productRetailerIds: z.array(z.string().min(1).max(200)).min(1).max(30),
    })
  )
  .max(10)
  .refine((sections) => sections.reduce((n, s) => n + s.productRetailerIds.length, 0) <= 30, {
    message: 'A multi-product message carries at most 30 products across all sections',
  })
  .optional();

/**
 * A LOCATION header's pin, supplied per send.
 *
 * Shared by the inbox send body and the campaign's campaign-wide `templateParams`:
 * the campaign path had no field for it at all, so a LOCATION-header template
 * could be selected, validated, launched — and then refused by Meta with
 * (#131008) for every recipient in the audience.
 */
const headerLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().max(200).optional(),
  address: z.string().max(400).optional(),
});

const templateSendBody = {
  templateId: z.string().uuid(),
  bodyParams: z.array(z.string()).optional(),
  bodyNamedParams: z.array(z.object({ name: z.string(), text: z.string() })).optional(),
  headerText: z.string().optional(),
  headerImageId: z.string().optional(),
  headerMediaUrl: z.string().url().optional(),
  headerMediaType: z.enum(['image', 'video', 'document']).optional(),
  // DOCUMENT header only: the name the attachment shows on the handset. Without
  // it the customer receives an invoice or a brochure named after the media id
  // or the URL's last path segment, while the identical file sent as an ordinary
  // document message in the same thread arrives correctly named.
  headerMediaFilename: z.string().max(240).optional(),
  buttonUrlParam: z.string().optional(),
  // Meta allows TWO URL buttons and either may carry a {{n}} suffix. One scalar
  // could only ever fill the first, so a two-dynamic-URL template — imported
  // APPROVED from Business Manager — was refused with (#131008) on every send.
  buttonUrlParams: z.array(z.string().max(2000)).max(2).optional(),
  // These three were declared on the builder but no schema could carry them, so
  // coupon, limited-time-offer and location templates were authorable, approvable
  // and unsendable.
  otpCode: z.string().max(64).optional(),
  couponCode: z.string().max(64).optional(),
  ltoExpirationMs: z.number().int().positive().optional(),
  headerLocation: headerLocationSchema.optional(),
  // FLOW button. Both are optional to Meta — it defaults a token — but a default
  // token cannot be decoded, so the send path mints one when the caller does not.
  flowToken: z.string().max(256).optional(),
  flowActionData: z.record(z.string(), z.any()).optional(),
  // Catalogue templates pick their products at SEND time. The thumbnail is
  // optional (Meta falls back to the catalog's first item); an MPM's sections and
  // a single-product template's SKU are not, and nothing could carry either.
  catalogThumbnailProductId: z.string().max(200).optional(),
  productSections: templateProductSections,
  productRetailerId: z.string().max(200).optional(),
  // Carousel cards. Nothing could carry them, so a carousel template was
  // authorable (the wizard has a card editor now), approvable and unsendable —
  // Meta refuses the whole message with #131008 for the missing card parameters.
  carouselCards: templateCarouselCards,
};

export const waSendTemplateSchema = z.object({
  body: z.object(templateSendBody),
});

export const waStartConversationSchema = z.object({
  body: z.object({
    phone: z.string().min(8).max(20),
    ...templateSendBody,
  }),
});

/**
 * Free-form personalisation fields on a contact (`{{attr.city}}` in a campaign
 * mapping). Bounded on key length, value length AND key count: this is a JSON
 * column read on every send, so an unbounded blob here is paid for once per
 * message rather than once per import.
 */
const waContactAttributes = z
  .record(z.string().min(1).max(60), z.string().max(500))
  .refine((r) => Object.keys(r).length <= 30, {
    message: 'At most 30 attributes per contact',
  })
  .optional();

export const waUpdateContactSchema = z.object({
  body: z.object({
    name: z.string().max(120).nullable().optional(),
    tags: z.array(z.string().max(40)).max(50).optional(),
    isBlocked: z.boolean().optional(),
    optInStatus: z.nativeEnum(WaOptInStatus).optional(),
  }),
});

/**
 * Fold one contact into another. `:id` is the SURVIVOR; `mergeId` is the row
 * that becomes a tombstone.
 *
 * The merge repoints conversations, messages, recipients, clicks, conversions
 * and consent events, and it tightens consent — so it is not something a stray
 * body can be talked into: both ids have to be real uuids.
 */
export const waMergeContactSchema = z.object({
  body: z.object({
    mergeId: z.string().uuid(),
  }),
});

export const waImportContactsSchema = z.object({
  body: z.object({
    optIn: z.boolean().optional(),
    /** Replace existing tags rather than merging into them (default: merge). */
    replaceTags: z.boolean().optional(),
    contacts: z
      .array(
        z.object({
          phone: z.string().min(8).max(20),
          name: z.string().max(120).optional(),
          tags: z.array(z.string().max(40)).optional(),
          // Every column of the file that is not phone/name/tags, so a list
          // carrying city / order number / plan tier can be personalised on.
          // Bounded on all three axes because this lands in a JSON column that
          // is read on every campaign send.
          attributes: waContactAttributes,
        })
      )
      .min(1)
      .max(5000),
  }),
});

export const waCannedReplySchema = z.object({
  body: z.object({
    title: z.string().min(1).max(80),
    text: z.string().min(1).max(4096),
  }),
});

export const waInteractiveSchema = z.object({
  body: z.object({
    kind: z.enum([
      'button',
      'list',
      'cta_url',
      'flow',
      'product',
      'product_list',
      // Meta's two collection prompts, neither of which existed. Without the
      // first, asking a customer where they are means typing 'please share your
      // location' and hoping; without the second, an Indian delivery address is
      // free text an agent re-keys by hand.
      'location_request_message',
      'address_message',
    ]),
    bodyText: z.string().min(1).max(1024),
    /**
     * Header above the prompt — text, or an image / video / document.
     *
     * Every interactive message went out as a bare paragraph: there was no way
     * to put even a title above a set of buttons, let alone the product photo or
     * the PDF the question is about. Meta's own 60-character ceiling applies to
     * the text form; a media header carries either a public `link` or the `id` of
     * something already uploaded.
     */
    header: z
      .object({
        type: z.enum(['text', 'image', 'video', 'document']),
        text: z.string().min(1).max(60).optional(),
        link: z.string().url().max(2000).optional(),
        id: z.string().max(200).optional(),
        filename: z.string().max(240).optional(),
      })
      .refine((h) => (h.type === 'text' ? !!h.text : !!(h.link || h.id)), {
        message: 'A text header needs `text`; an image/video/document header needs `link` or `id`.',
      })
      .optional(),
    /** ISO country for an address_message. Meta supports IN and SG only. */
    addressCountry: z.enum(['IN', 'SG']).optional(),
    flowId: z.string().max(256).optional(),
    flowCta: z.string().max(64).optional(),
    flowToken: z.string().max(256).optional(),
    buttons: z
      .array(z.object({ id: z.string().max(256), title: z.string().min(1).max(20) }))
      .max(3)
      .optional(),
    listButton: z.string().max(20).optional(),
    // Meta's list ceilings, unenforced until now: a list carries at most 10
    // sections AND at most 10 rows across the WHOLE message, not 10 per section.
    // Ten sections of ten rows passed validation here and was then refused by
    // the Graph API with an opaque 400, which the agent saw as a FAILED message
    // with no explanation — the exact failure these per-field limits exist to
    // turn into a clear one. A section title is Meta-mandatory as soon as there
    // is more than one section.
    sections: z
      .array(
        z.object({
          title: z.string().max(24).optional(),
          rows: z
            .array(
              z.object({
                id: z.string().max(200),
                title: z.string().min(1).max(24),
                description: z.string().max(72).optional(),
              })
            )
            .min(1)
            .max(10),
        })
      )
      .max(10)
      .refine((secs) => secs.reduce((n, sec) => n + sec.rows.length, 0) <= 10, {
        message: 'A list carries at most 10 rows in total across all of its sections',
      })
      .refine((secs) => secs.length < 2 || secs.every((sec) => !!sec.title?.trim()), {
        message: 'Every section needs a title when a list has more than one section',
      })
      .optional(),
    ctaText: z.string().max(20).optional(),
    ctaUrl: z.string().url().optional(),
    // These three were absent, and validate.ts REASSIGNS req.body to the parsed
    // result — so zod stripped them before the service ever saw them. The send
    // path has always supported all three: without flowAction a data-exchange
    // (endpoint-backed) Flow could not be sent at all, and without flowScreen a
    // navigate Flow always opened on its default screen.
    flowAction: z.enum(['navigate', 'data_exchange']).optional(),
    flowScreen: z.string().max(200).optional(),
    flowActionPayload: z.record(z.string(), z.any()).optional(),
    // Commerce. Meta's own ceilings: a multi-product message carries at most 30
    // items across at most 10 sections, and the send is rejected outright past
    // either — so they are refused here with a message naming the limit.
    catalogId: z.string().max(64).optional(),
    productRetailerId: z.string().max(200).optional(),
    productSections: z
      .array(
        z.object({
          title: z.string().max(24).optional(),
          productRetailerIds: z.array(z.string().max(200)).min(1).max(30),
        })
      )
      .max(10)
      // Meta's 30-item ceiling is on the WHOLE message, not per section: ten
      // sections of thirty passed validation and were then refused by the Graph
      // API with an opaque 400 after the operator had already sent, which is the
      // exact failure these per-field limits exist to turn into a clear message.
      .refine((s) => s.reduce((n, sec) => n + sec.productRetailerIds.length, 0) <= 30, {
        message: 'A multi-product message carries at most 30 products in total',
      })
      .optional(),
    headerText: z.string().max(60).optional(),
    footerText: z.string().max(60).optional(),
  }),
});

/** Meta's customer-facing profile for a connected number. */
export const waBusinessProfileSchema = z.object({
  body: z.object({
    // Meta's own field limits, enforced here so the operator gets a field-level
    // message instead of an opaque Graph 400 after the fact.
    about: z.string().max(139).optional(),
    address: z.string().max(256).optional(),
    description: z.string().max(512).optional(),
    email: z.string().email().max(128).optional(),
    websites: z.array(z.string().url().max(256)).max(2).optional(),
    vertical: z.enum(WA_PROFILE_VERTICALS).optional(),
    profilePictureHandle: z.string().max(2000).optional(),
  }),
});

/**
 * The six-digit two-step verification PIN, for registering a number or rotating
 * its PIN. Never stored — it goes straight to Meta.
 */
export const waPhoneRegisterSchema = z.object({
  body: z.object({
    pin: z.string().regex(/^\d{6}$/, 'The two-step PIN is exactly six digits'),
  }),
});

/** Cart / catalog visibility for a number, plus the catalog it is bound to. */
export const waCommerceSettingsSchema = z.object({
  body: z.object({
    isCartEnabled: z.boolean().optional(),
    isCatalogVisible: z.boolean().optional(),
    catalogId: z.string().max(64).nullable().optional(),
  }),
});

/**
 * Meta's native conversational components: the welcome-message webhook, the ice
 * breakers shown on an empty thread, and the composer's command list.
 *
 * Meta's own caps are enforced here (they come from the channel service so the
 * two cannot drift) — a fifth ice breaker or an over-long command name is a
 * flat Graph 400 with no indication of which field was wrong.
 */
export const waConversationalAutomationSchema = z.object({
  body: z.object({
    enableWelcomeMessage: z.boolean().optional(),
    prompts: z
      .array(z.string().min(1).max(WA_ICE_BREAKER_TEXT_MAX))
      .max(WA_ICE_BREAKER_MAX)
      .optional(),
    commands: z
      .array(
        z.object({
          // Meta shows this after a slash, so it has to be a single token —
          // a name with a space in it is accepted here and then unusable.
          name: z
            .string()
            .min(1)
            .max(WA_COMMAND_NAME_MAX)
            .regex(/^[^\s]+$/, 'A command name cannot contain spaces'),
          description: z.string().min(1).max(WA_COMMAND_DESCRIPTION_MAX),
        })
      )
      .max(WA_COMMAND_MAX)
      .optional(),
  }),
});

/**
 * One slot of a template's {{n}} mapping: a literal, or a token
 * (`{{name}}`, `{{phone}}`, `{{attr.city}}`) optionally carrying a fallback
 * after a pipe — `{{name|there}}`.
 *
 * `.min(1)` is the point. The wizard submits one entry per placeholder and used
 * to send '' for any row the operator left blank; Meta rejects a template
 * parameter that is the empty string and fails the ENTIRE message, so one
 * forgotten row hard-failed the whole audience and "Retry failed" re-failed it
 * identically.
 */
const variableMappingEntry = z
  .string()
  .min(1, 'Every template variable needs a value — a blank one fails the whole send')
  .max(1024);

const sequenceStep = z.object({
  stepOrder: z.number().int(),
  templateId: z.string().uuid(),
  delayHours: z.number().int().min(0),
  condition: z.enum(['any', 'no_reply', 'replied']).optional(),
  variableMapping: z.array(variableMappingEntry).optional(),
});

/**
 * Hard ceiling on a pasted/uploaded phone audience.
 *
 * The list travels inside the JSON body, so it is bounded twice: by the 2 MB
 * parser `/campaigns` is mounted on (app.ts) and by this. It exists to give a
 * clear, quotable number instead of the bare 413 an over-large paste used to
 * produce — which the UI surfaced as "Failed to create campaign" and which named
 * nothing an operator could act on. `resolveUploadedContacts` upserts this list
 * one row at a time on the launch path, so the cap is also what keeps a launch
 * from turning into an unbounded write loop.
 */
export const WA_UPLOAD_PHONE_MAX = 20_000;

/**
 * Byte budget for a PERSONALISED uploaded audience (`recipients`).
 *
 * The row cap above does not bound that shape. A bare phone entry is ~16 bytes,
 * so 20,000 of them are ~310 KB and fit anywhere; the same 20,000 rows carrying a
 * name and two columns are ~2 MB, and the in-spec maximum — 20,000 rows × 30
 * columns × 400 chars — is ~270 MB. So the row cap alone let a perfectly
 * in-spec personalised list sail past the request parser and come back as the
 * bare 413 the raised `/campaigns` body limit (app.ts) exists to remove, which
 * the wizard could only render as "Failed to create campaign".
 *
 * Sized to hold the whole 20,000 rows with a name and a handful of columns each,
 * and deliberately BELOW that parser limit, so an over-budget list is answered
 * by the message below rather than by the parser saying nothing.
 */
export const WA_UPLOAD_PAYLOAD_MAX_BYTES = 6 * 1024 * 1024;

/**
 * Every operator a segment rule may use. Which ones are legal depends on the
 * field (see `segmentContactWhere`, which compiles them); listing them here is
 * what stops a typo becoming a silently ignored condition on a live audience.
 *
 *  tags        any | all | none
 *  optInStatus equals | not          optInSource  equals | contains
 *  last*At     within | notWithin | exists | notExists   (value = days)
 *  attr.<key>  equals | contains | exists | notExists
 *  campaign    received | notReceived | replied | notReplied | clicked | notClicked
 */
const audienceRuleOperator = z.enum([
  'any',
  'all',
  'none',
  'equals',
  'not',
  'contains',
  'within',
  'notWithin',
  'exists',
  'notExists',
  'received',
  'notReceived',
  'replied',
  'notReplied',
  'clicked',
  'notClicked',
]);

const audienceRule = z.object({
  // `attr.<key>` for an imported column; otherwise a contact field name or the
  // literal 'campaign' for an engagement rule.
  field: z.string().min(1).max(80),
  operator: audienceRuleOperator,
  value: z
    .union([z.string().max(400), z.number(), z.array(z.string().min(1).max(60)).max(50)])
    .optional(),
});

/**
 * The audience predicate a saved segment stores and a campaign resolves.
 *
 * The two legacy keys (`tags`, `optInStatus`) plus `attributes` are kept exactly
 * as they were — every segment and campaign written before the rule grammar
 * existed still carries them — and `rules`/`op` add everything they could not
 * express: tag AND/NOT, opt-in source, recency windows, and campaign engagement.
 */
const segmentFilterFields = {
  tags: z.array(z.string().min(1).max(60)).max(50).optional(),
  optInStatus: z.enum(['OPTED_IN', 'OPTED_OUT', 'UNKNOWN']).optional(),
  attributes: z.record(z.string().min(1).max(60), z.string().max(400)).optional(),
  op: z.enum(['and', 'or']).optional(),
  rules: z.array(audienceRule).max(25).optional(),
};

export const waSegmentFilterSchema = z.object(segmentFilterFields);

/**
 * A campaign's audienceFilter: the segment grammar, plus the uploaded phone list.
 *
 * This was `z.any()`, so nothing bounded the list at all — a 200,000-entry paste
 * validated cleanly and then hit the launch path, which upserts a contact per
 * number in a serial loop.
 */
const uploadAudienceLimitMessage = `An uploaded audience is limited to ${WA_UPLOAD_PHONE_MAX.toLocaleString('en-IN')} phone numbers — split a larger list across campaigns, or import the numbers as contacts and target them with a segment.`;
const uploadPayloadLimitMessage = `The personalisation columns on this list come to more than ${Math.round(WA_UPLOAD_PAYLOAD_MAX_BYTES / (1024 * 1024))} MB — send fewer columns per row, or split the list across campaigns.`;

const campaignAudienceFilter = z.object({
  ...segmentFilterFields,
  phones: z
    .array(z.string().min(8).max(20))
    .max(WA_UPLOAD_PHONE_MAX, uploadAudienceLimitMessage)
    .optional(),
  /**
   * The same uploaded audience, with the columns that came with it.
   *
   * `phones` could only ever carry numbers, so a one-off blast to a supplied
   * list could not be personalised at ALL — an order id or an appointment slot
   * had nowhere to live, and `{{attr.order_id}}` in the mapping went to Meta as
   * a literal. `vars` is merged over the contact's own attributes for the length
   * of the send, so the existing token grammar resolves it unchanged.
   *
   * `phones` is kept alongside rather than replaced: every campaign created
   * before this existed still carries it.
   */
  recipients: z
    .array(
      z.object({
        phone: z.string().min(8).max(20),
        name: z.string().max(120).optional(),
        // Bounded like the import's attribute bag, for the same reason: this is
        // stored as JSON on the campaign and read on every send.
        vars: z
          .record(z.string().min(1).max(60), z.string().max(400))
          .refine((v) => Object.keys(v).length <= 30, {
            message: 'At most 30 personalisation columns per recipient',
          })
          .optional(),
      })
    )
    .max(WA_UPLOAD_PHONE_MAX, uploadAudienceLimitMessage)
    // Bounded by bytes as well as by rows — see WA_UPLOAD_PAYLOAD_MAX_BYTES.
    // Measured on the parsed array rather than on Content-Length, which covers
    // the rest of the body too and is absent on a chunked request.
    .refine(
      (rows) => Buffer.byteLength(JSON.stringify(rows), 'utf8') <= WA_UPLOAD_PAYLOAD_MAX_BYTES,
      { message: uploadPayloadLimitMessage }
    )
    .optional(),
});

/** A/B-test campaign variant: a labelled template with an optional weight. */
const campaignVariant = z.object({
  label: z.string().min(1).max(80),
  templateId: z.string().uuid(),
  weight: z.number().int().min(1).max(100).optional(),
  variableMapping: z.array(variableMappingEntry).optional(),
});

export const waCreateCampaignSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    templateId: z.string().uuid(),
    audienceType: z.enum(['segment', 'upload', 'manual']),

    audienceFilter: campaignAudienceFilter.optional(),
    variableMapping: z.array(variableMappingEntry).optional(),
    // Campaign-level template send parameters. Validated here so an API caller
    // cannot store a shape the worker will not understand.
    templateParams: z
      .object({
        headerText: z.string().max(900).optional(),
        headerMediaUrl: z.string().url().optional(),
        headerMediaType: z.enum(['image', 'video', 'document']).optional(),
        // DOCUMENT header only: the filename the attachment shows on the handset.
        headerMediaFilename: z.string().max(240).optional(),
        // The LOCATION header's pin, campaign-wide like the media above. Nothing
        // could carry it, so a LOCATION template launched clean and Meta then
        // refused the entire audience with #131008 for the missing header.
        headerLocation: headerLocationSchema.optional(),
        buttonUrlParam: z.string().max(2000).optional(),
        // A second dynamic URL button. Meta allows two, and a template carrying
        // two was launchable with one value filled in — then refused for the
        // whole audience with #131008 for the button nothing addressed.
        buttonUrlParams: z.array(z.string().max(2000)).max(2).optional(),
        // The two marketing extras. `templateSendBody` (the inbox path) has
        // carried them for a while; a campaign could not, so a COPY_CODE or
        // LIMITED_TIME_OFFER template was authorable, approvable and
        // broadcast-unsendable — Meta rejects every recipient with #131008.
        couponCode: z.string().max(64).optional(),
        ltoExpirationMs: z.number().int().positive().optional(),
        // Catalogue products, campaign-wide like the header media: one thumbnail,
        // one product list, one SKU for the whole audience.
        catalogThumbnailProductId: z.string().max(200).optional(),
        productSections: templateProductSections,
        productRetailerId: z.string().max(200).optional(),
        // One card set for the whole audience: a carousel's media and card text
        // are campaign-wide, exactly like the header media above. Per-recipient
        // personalisation stays on the body mapping.
        carouselCards: templateCarouselCards,
      })
      .optional(),
    scheduledAt: z.string().datetime().optional(),
    // Hold sends outside the configured business hours instead of firing them.
    // `scheduledAt` is one absolute instant, so without this a campaign armed
    // for 10:00 local reaches an international list in the middle of the night.
    respectBusinessHours: z.boolean().optional(),
    batchSize: z.number().int().min(1).max(1000).optional(),
    throttlePerSec: z.number().int().min(1).max(80).optional(),
    type: z.enum(['BROADCAST', 'SEQUENCE']).optional(),
    steps: z.array(sequenceStep).optional(),
    isAbTest: z.boolean().optional(),
    variants: z.array(campaignVariant).optional(),
    // A/B TEST PHASE: send to this % of the audience, decide on this rate, then
    // release the rest to the winner. 100 would leave no remainder to send, so
    // the cap is 99.
    abTestSamplePct: z.number().int().min(1).max(99).nullable().optional(),
    abTestMetric: z.enum(['delivered', 'read', 'replied']).nullable().optional(),
    recurrenceDays: z.number().int().min(1).max(365).nullable().optional(),
    // When set, the campaign's audience is sourced from a saved segment's filter.
    segmentId: z.string().uuid().optional(),
  }),
});

/**
 * Size + cost an audience BEFORE any campaign exists.
 *
 * The same audience fields `waCreateCampaignSchema` takes, minus everything that
 * describes the send itself — the answer depends only on who is being targeted
 * and which template's category prices it.
 */
export const waPreviewAudienceSchema = z.object({
  body: z.object({
    templateId: z.string().uuid(),
    audienceType: z.enum(['segment', 'upload', 'manual']),
    audienceFilter: campaignAudienceFilter.optional(),
    segmentId: z.string().uuid().optional(),
    variableMapping: z.array(variableMappingEntry).optional(),
  }),
});

/** Edit a DRAFT/SCHEDULED campaign (all fields optional; scheduledAt=reschedule). */
export const waUpdateCampaignSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    templateId: z.string().uuid().optional(),
    audienceType: z.enum(['segment', 'upload', 'manual']).optional(),
    audienceFilter: campaignAudienceFilter.optional(),
    variableMapping: z.array(variableMappingEntry).optional(),
    // Campaign-level template send parameters. Validated here so an API caller
    // cannot store a shape the worker will not understand.
    templateParams: z
      .object({
        headerText: z.string().max(900).optional(),
        headerMediaUrl: z.string().url().optional(),
        headerMediaType: z.enum(['image', 'video', 'document']).optional(),
        headerMediaFilename: z.string().max(240).optional(),
        headerLocation: headerLocationSchema.optional(),
        buttonUrlParam: z.string().max(2000).optional(),
        buttonUrlParams: z.array(z.string().max(2000)).max(2).optional(),
        couponCode: z.string().max(64).optional(),
        ltoExpirationMs: z.number().int().positive().optional(),
        catalogThumbnailProductId: z.string().max(200).optional(),
        productSections: templateProductSections,
        productRetailerId: z.string().max(200).optional(),
        carouselCards: templateCarouselCards,
      })
      .optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
    respectBusinessHours: z.boolean().optional(),
    batchSize: z.number().int().min(1).max(1000).optional(),
    throttlePerSec: z.number().int().min(1).max(80).optional(),
    recurrenceDays: z.number().int().min(1).max(365).nullable().optional(),
    segmentId: z.string().uuid().optional(),
    abTestSamplePct: z.number().int().min(1).max(99).nullable().optional(),
    abTestMetric: z.enum(['delivered', 'read', 'replied']).nullable().optional(),
  }),
});

/**
 * Send one rendered template message to a reviewer's phone (test-send).
 *
 * `variantId` picks which A/B template to preview — the base template is the one
 * thing an A/B campaign never sends. `contactId` personalises against a real
 * contact; without it the test number's own contact row is used, falling back to
 * a labelled sample.
 */
export const waTestSendSchema = z.object({
  body: z.object({
    phone: z.string().min(8).max(20),
    variantId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
  }),
});

/** Declare the winning A/B variant (omit variantId to take the measured leader). */
export const waAbWinnerSchema = z.object({
  body: z.object({
    variantId: z.string().uuid().optional(),
    metric: z.enum(['delivered', 'read', 'replied']).optional(),
  }),
});

/** Save a campaign as a reusable blueprint. */
export const waSaveAsTemplateSchema = z.object({
  body: z.object({ name: z.string().min(1).max(120).optional() }),
});

/** Create a new campaign from a saved blueprint. */
export const waUseTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    scheduledAt: z.string().datetime().optional(),
  }),
});

/** Set/replace the A/B-test variants on a campaign. */
export const waCampaignVariantsSchema = z.object({
  body: z.object({
    variants: z.array(campaignVariant).min(1),
  }),
});

/**
 * Create a tracked short link (campaign click-through).
 *
 * The scheme is pinned here, not only in the browser: `z.string().url()` happily
 * parses `javascript:` and `data:`, and the stored target is later rendered as an
 * operator-clickable anchor in the campaign console and echoed into a Location
 * header. The only scheme check lived in CampaignLinksSection, so a direct API
 * call (or an imported campaign definition) could persist a `javascript:` target
 * that an operator would then click inside their own authenticated session.
 */
export const waShortLinkSchema = z.object({
  body: z.object({
    targetUrl: z
      .string()
      .url()
      .refine((u) => {
        try {
          return /^https?:$/.test(new URL(u).protocol);
        } catch {
          return false;
        }
      }, 'Target URL must start with http:// or https://'),
  }),
});

/**
 * Schedule a send-later message (text, template or media) on a conversation.
 *
 * The media form arrives as multipart (or with an `r2Key` naming a staged
 * upload), so every field here is a string: `sendAt` is the only one the JSON
 * form and the form-data form spell identically, and coercion is what lets one
 * schema validate both transports.
 */
export const waScheduledMessageSchema = z.object({
  body: z.object({
    kind: z.enum(['text', 'template', 'media']),
    text: z.string().min(1).max(4096).optional(),
    templateId: z.string().uuid().optional(),
    // multipart sends this as a JSON string; JSON clients send a real array.
    bodyParams: z
      .union([z.array(z.string()), z.string()])
      .optional()
      .transform((v) => {
        if (typeof v !== 'string') return v;
        try {
          const parsed: unknown = JSON.parse(v);
          return Array.isArray(parsed) ? parsed.map((p) => String(p)) : undefined;
        } catch {
          return undefined;
        }
      }),
    /** Key of a file the browser already PUT to R2 (see POST /uploads/sign). */
    r2Key: z.string().max(200).optional(),
    mime: z.string().max(150).optional(),
    filename: z.string().max(255).optional(),
    caption: z.string().max(1024).optional(),
    sendAt: z.string().datetime(),
  }),
});

/** React to a message with an emoji. */
export const waReactionSchema = z.object({
  body: z.object({
    wamid: z.string().min(1),
    emoji: z.string().min(1),
  }),
});

/** Archive / unarchive a conversation. */
export const waArchiveSchema = z.object({
  body: z.object({
    archived: z.boolean().optional(),
  }),
});

// Bulk selection: EITHER an explicit id list OR allMatching (acts on every row
// matching the accompanying filters — "select all N matching").
const bulkSelection = {
  ids: z.array(z.string().uuid()).max(20000).optional(),
  allMatching: z.boolean().optional(),
};

/** Bulk action over many conversations. */
export const waBulkConversationsSchema = z.object({
  body: z.object({
    action: z.enum([
      'archive',
      'unarchive',
      'resolve',
      'open',
      'pending',
      'markRead',
      'snooze',
      'unsnooze',
      'assign',
      'addLabel',
    ]),
    ...bulkSelection,
    // These have to mirror the inbox list's filters exactly. A filter the list
    // narrows by but this object drops is silently WIDENED here: "select all 12
    // matching" then acts on every conversation in the module, including ones on
    // another connected number or under another label.
    filters: z
      .object({
        channelId: z.string().uuid().optional(),
        status: z.nativeEnum(WaConversationStatus).optional(),
        assignedTo: z.string().max(120).optional(),
        q: z.string().optional(),
        labels: z.array(z.string().max(40)).max(20).optional(),
        unreadOnly: z.boolean().optional(),
        searchMessages: z.boolean().optional(),
        includeArchived: z.boolean().optional(),
        includeSnoozed: z.boolean().optional(),
        archivedOnly: z.boolean().optional(),
        snoozedOnly: z.boolean().optional(),
      })
      .optional(),
    assignedTo: z.string().max(120).nullable().optional(),
    snoozedUntil: z.string().datetime().nullable().optional(),
    label: z.string().max(40).optional(),
  }),
});

/** Bulk action over many contacts. */
export const waBulkContactsSchema = z.object({
  body: z.object({
    action: z.enum([
      'tag',
      'untag',
      'optIn',
      'optOut',
      'block',
      'unblock',
      'addSuppression',
      'erase',
    ]),
    ...bulkSelection,
    filters: z
      .object({
        optInStatus: z.nativeEnum(WaOptInStatus).optional(),
        tag: z.string().optional(),
        // Multi-tag (OR) selection, matching what a saved segment stores and what
        // the campaign audience resolver does with it. `tag` stays for the single
        // -tag callers.
        tags: z.array(z.string().max(40)).max(50).optional(),
        // A saved segment applied on the contacts page. Accepted here so "select
        // all N matching" acts on exactly the rows the page counted — the list
        // resolves the segment with the launch predicate, and a bulk action that
        // ignored it would opt out (or erase) a wider set than was on screen.
        segmentId: z.string().uuid().optional(),
        blocked: z.boolean().optional(),
        // On / off the do-not-contact list, so "select all N matching" over a
        // suppression-filtered page acts on exactly those rows.
        suppressed: z.boolean().optional(),
        q: z.string().optional(),
      })
      .optional(),
    tag: z.string().max(40).optional(),
  }),
});

export const waSettingsSchema = z.object({
  body: z.object({
    // Structured, not z.any().
    //
    // The timezone was free text with no validation, and an invalid IANA name makes
    // Intl silently fall back to SERVER local time — so business hours, away
    // messages and every time-bucketed analytic quietly ran in the wrong timezone
    // with nothing to indicate it.
    businessHours: z
      .object({
        tz: z
          .string()
          .refine(
            (t) => {
              try {
                new Intl.DateTimeFormat(undefined, { timeZone: t });
                return true;
              } catch {
                return false;
              }
            },
            { message: 'Not a valid IANA timezone name (e.g. Asia/Kolkata)' }
          )
          .optional(),
        // Present-but-empty is meaningful: `days: []` says "closed all week, send
        // the away message to everything", which is NOT the same as omitting the
        // key (not configured => always open). Both the engine and the editor
        // depend on that distinction, so there is deliberately no `.min(1)` here.
        //
        // Several windows may share a `day` — a split shift (09:00-13:00 and
        // 14:00-18:00 with a lunch closure) is two rows for the same weekday.
        days: z
          .array(
            z.object({
              day: z.number().int().min(0).max(6),
              open: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
              close: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
            })
          )
          .max(70)
          .optional(),
        // Calendar-date overrides — public holidays, one-off shutdowns, half
        // days. Checked before the weekly grid. `repeatsAnnually` matches on
        // MM-DD so a fixed-date holiday is entered once, not every year.
        exceptions: z
          .array(
            z.object({
              date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
              closed: z.boolean().optional(),
              open: z
                .string()
                .regex(/^\d{2}:\d{2}$/, 'Use HH:MM')
                .optional(),
              close: z
                .string()
                .regex(/^\d{2}:\d{2}$/, 'Use HH:MM')
                .optional(),
              repeatsAnnually: z.boolean().optional(),
              label: z.string().max(80).optional(),
            })
          )
          .max(200)
          .optional(),
      })
      .nullable()
      .optional(),
    awayMessage: z.string().nullable().optional(),
    welcomeMessage: z.string().nullable().optional(),
    autoReplyEnabled: z.boolean().optional(),
    awayMode: z.boolean().optional(),
    // Minutes, floored at 1: the away claim is also what stops an inbound burst
    // from producing a burst of identical away replies, so a zero interval is
    // not a setting anyone can usefully ask for. A day is the ceiling — beyond
    // that "debounced" and "sent once ever" stop being distinguishable.
    awayDebounceMinutes: z.number().int().min(1).max(1440).optional(),
    marketingCapPer24h: z.number().int().optional(),
    retentionDays: z.number().int().nullable().optional(),
    optOutKeywords: z.array(z.string()).optional(),
    optInKeywords: z.array(z.string()).optional(),
    optOutConfirmationMessage: z.string().max(1024).nullable().optional(),
    faqMenuEnabled: z.boolean().optional(),
    faqTriggerKeywords: z.array(z.string()).optional(),
    faqFallbackMessage: z.string().max(1024).nullable().optional(),
  }),
});

/**
 * The five matchers the engine actually implements (whatsapp-autoreply.service
 * `keywordMatches`). `substring` and `regex` were implemented and documented on
 * the model but missing from this enum, so the only way to get a rule using them
 * was to write the row by hand — and the engine now refuses any value outside
 * this list rather than silently treating it as `contains`.
 */
export const WA_MATCH_TYPES = ['exact', 'contains', 'starts', 'substring', 'regex'] as const;

export const waKeywordRuleSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    match: z.string().min(1).max(200),
    matchType: z.enum(WA_MATCH_TYPES).optional(),
    replyText: z.string().nullable().optional(),
    replyTemplateId: z.string().uuid().nullable().optional(),
    replyVariables: z.array(z.string()).optional().nullable(),
    // 'handoff' routes the thread to a human instead of answering it. A rule
    // could previously only say something, so "talk to a human" replied with a
    // canned sentence and escalated to nobody.
    action: z.enum(['reply', 'handoff']).optional(),
    handoffAssignee: z.string().max(120).nullable().optional(),
    handoffLabel: z.string().max(40).nullable().optional(),
    handoffStatus: z.enum(['OPEN', 'PENDING']).nullable().optional(),
    isActive: z.boolean().optional(),
    priority: z.number().int().optional(),
  }),
});

/**
 * Patch an existing rule. Every field optional — the manager's enable/disable
 * toggle sends `isActive` alone. The PATCH route carried no schema at all, so an
 * unvalidated body went straight into Prisma.
 */
export const waKeywordRuleUpdateSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    match: z.string().min(1).max(200).optional(),
    matchType: z.enum(WA_MATCH_TYPES).optional(),
    replyText: z.string().nullable().optional(),
    replyTemplateId: z.string().uuid().nullable().optional(),
    replyVariables: z.array(z.string()).optional().nullable(),
    action: z.enum(['reply', 'handoff']).optional(),
    handoffAssignee: z.string().max(120).nullable().optional(),
    handoffLabel: z.string().max(40).nullable().optional(),
    handoffStatus: z.enum(['OPEN', 'PENDING']).nullable().optional(),
    isActive: z.boolean().optional(),
    priority: z.number().int().optional(),
  }),
});

export const waNoteSchema = z.object({
  body: z.object({
    body: z.string().min(1).max(4096),
  }),
});

/** Same shape as create — an edit replaces the note body outright. */
export const waNoteUpdateSchema = waNoteSchema;

/**
 * FAQ menu rows. All five FAQ routes used to carry no schema at all.
 *
 * `question` is capped at 24 because that is WhatsApp's hard limit on an
 * interactive-list row title: anything longer is chopped in the menu the
 * customer actually sees, and the cap only existed as a `maxLength` on one text
 * input, so an API caller or an import could write a question that rendered
 * truncated. `answer` is capped at Meta's 4096-char text-body limit: a longer
 * answer is rejected at send time, which means the customer taps the FAQ row and
 * receives nothing at all.
 */
export const waFaqSchema = z.object({
  body: z.object({
    question: z.string().min(1).max(24),
    answer: z.string().min(1).max(4096),
    order: z.number().int().min(0).max(10000).optional(),
    isActive: z.boolean().optional(),
  }),
});

/** Patch an existing FAQ — the manager's active toggle sends `isActive` alone. */
export const waFaqUpdateSchema = z.object({
  body: z.object({
    question: z.string().min(1).max(24).optional(),
    answer: z.string().min(1).max(4096).optional(),
    order: z.number().int().min(0).max(10000).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const waFaqReorderSchema = z.object({
  body: z.object({
    ids: z.array(z.string().uuid()).max(200),
  }),
});

export const waLabelsSchema = z.object({
  body: z.object({
    labels: z.array(z.string().max(40)).max(20),
  }),
});

export const waSnoozeSchema = z.object({
  body: z.object({
    snoozedUntil: z.string().datetime().nullable().optional(),
  }),
});

export const waBotPauseSchema = z.object({
  body: z.object({
    botPausedUntil: z.string().datetime().nullable().optional(),
  }),
});

export const waSequenceStepsSchema = z.object({
  body: z.object({
    steps: z.array(sequenceStep),
  }),
});

/** Add a phone to the campaign suppression (do-not-contact) list. */
export const waSuppressionSchema = z.object({
  body: z.object({
    phone: z.string().min(8).max(20),
    reason: z.string().max(500).optional(),
  }),
});

/**
 * Bulk do-not-contact upload. Capped at the same 5000 rows as the contact
 * import — both are "an operator pasted a file into the browser", and the same
 * request budget applies.
 */
export const waSuppressionImportSchema = z.object({
  body: z.object({
    phones: z.array(z.string().min(8).max(20)).min(1).max(5000),
    reason: z.string().max(500).optional(),
  }),
});

/** Create a saved audience segment (named, reusable audience filter). */
export const waSegmentSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    // The audience grammar — validated here rather than stored free-form, so a
    // mistyped operator is refused instead of quietly widening a saved audience.
    filter: waSegmentFilterSchema,
  }),
});

/**
 * PATCH body for a saved segment. Separate from the create schema because every
 * field is optional here — and because the update route had NO validation at all,
 * so `req.body` went straight into a Prisma update and any column on WaSegment
 * (id, createdAt, createdBy) was writable by the caller.
 */
export const waUpdateSegmentSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    filter: waSegmentFilterSchema.optional(),
  }),
});

/** Record a conversion attributed to a campaign / contact. */
export const waConversionSchema = z.object({
  body: z.object({
    campaignId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    // `.min(0)`: a negative conversion is not a refund, it is a typo. Unbounded,
    // a stray minus sign silently subtracted from campaign revenue.
    valuePaise: z.number().int().min(0).max(1_000_000_000_00).optional(),
    note: z.string().max(1000).optional(),
    occurredAt: z.string().datetime().optional(),
  }),
});

/**
 * Server-to-server conversion postback (POST /whatsapp/ingest/conversions).
 *
 * Identifies the contact by phone (what a website or CRM actually has) rather
 * than by our internal id, and REQUIRES an `externalId` so a retried postback is
 * deduplicated instead of double-counted.
 */
export const waConversionIngestSchema = z.object({
  body: z.object({
    externalId: z.string().min(1).max(200),
    phone: z.string().min(8).max(20).optional(),
    contactId: z.string().uuid().optional(),
    campaignId: z.string().uuid().optional(),
    valuePaise: z.number().int().min(0).max(1_000_000_000_00).optional(),
    note: z.string().max(1000).optional(),
    occurredAt: z.string().datetime().optional(),
  }),
});

/* ── Conversational bot flows ─────────────────────────────────────────────── */

/** Step kinds the flow engine implements (mirrors WA_BOT_STEP_KINDS). */
const WA_BOT_STEP_KIND_ENUM = [
  'message',
  'ask',
  'choice',
  'set_attribute',
  'send_template',
  'handoff',
  'end',
] as const;

export const waBotFlowSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
    triggerType: z.enum(['keyword', 'manual']).optional(),
    triggerKeywords: z.array(z.string().min(1).max(200)).max(50).optional(),
    triggerMatchType: z.enum(WA_MATCH_TYPES).optional(),
    entryStepKey: z.string().max(60).nullable().optional(),
    // A minute is the floor and a week the ceiling: a session that can never
    // expire is a customer whose next message, weeks later, is read as the
    // answer to a question they have forgotten being asked.
    timeoutMinutes: z.number().int().min(1).max(10080).optional(),
    escapeKeywords: z.array(z.string().min(1).max(60)).max(20).optional(),
    cancelMessage: z.string().max(1024).nullable().optional(),
  }),
});

export const waBotFlowUpdateSchema = z.object({
  body: waBotFlowSchema.shape.body.partial(),
});

export const waBotStepSchema = z.object({
  body: z.object({
    /** Referenced by nextStepKey, choices[].next and every live session. */
    key: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens or underscores'),
    kind: z.enum(WA_BOT_STEP_KIND_ENUM).optional(),
    prompt: z.string().max(1024).nullable().optional(),
    saveAs: z
      .string()
      .max(60)
      .regex(/^[A-Za-z0-9_.-]*$/, 'Use letters, numbers, dots, hyphens or underscores')
      .nullable()
      .optional(),
    validation: z.enum(['text', 'number', 'email', 'phone']).optional(),
    // WhatsApp renders at most three quick replies on one message.
    choices: z
      .array(
        z.object({
          label: z.string().min(1).max(20),
          value: z.string().max(120).optional(),
          next: z.string().max(60).optional(),
        })
      )
      .max(3)
      .nullable()
      .optional(),
    retryMessage: z.string().max(1024).nullable().optional(),
    value: z.string().max(1024).nullable().optional(),
    templateId: z.string().uuid().nullable().optional(),
    templateVariables: z.array(z.string()).nullable().optional(),
    handoffAssignee: z.string().max(120).nullable().optional(),
    handoffLabel: z.string().max(40).nullable().optional(),
    handoffStatus: z.enum(['OPEN', 'PENDING']).nullable().optional(),
    nextStepKey: z.string().max(60).nullable().optional(),
    order: z.number().int().min(0).max(999).optional(),
  }),
});

export const waBotStepUpdateSchema = z.object({
  body: waBotStepSchema.shape.body.partial(),
});

/**
 * Events an outbound webhook can subscribe to. Kept as a closed enum so a typo
 * in a subscription is rejected at the API rather than silently never firing.
 * Mirrors every emitWaEvent() call site.
 */
export const WA_WEBHOOK_EVENTS = [
  'whatsapp.message.inbound',
  // The delivery lifecycle of a message WE sent — the single most requested
  // integration signal, and the one a CRM previously had to poll the API for:
  // it could learn that a customer had written in, but not whether the message
  // it had just triggered was delivered, read or permanently rejected.
  'whatsapp.message.outbound',
  'whatsapp.message.status',
  'whatsapp.contact.created',
  'whatsapp.contact.opted_out',
  'whatsapp.contact.opted_in',
  'whatsapp.channel.quality_degraded',
  // Template review is asynchronous and can take hours; nothing outside the
  // console was told when Meta approved, rejected or paused one.
  'whatsapp.template.status_changed',
  'whatsapp.campaign.started',
  'whatsapp.campaign.completed',
  // Weekly performance digest (see handleWaWeeklyReport). Nothing is built or
  // dispatched unless at least one endpoint subscribes to it.
  'whatsapp.report.weekly',
] as const;

/**
 * Outside production the guard is relaxed to `http://localhost:4000/hook` and
 * friends, because that is the only way to point a subscription at the thing you
 * are developing. It is never relaxed on a deployed server.
 */
const ENFORCE_WEBHOOK_URL_SAFETY = process.env.NODE_ENV === 'production';

/**
 * Why a webhook HOST is not allowed to be talked to, or null when it is fine.
 *
 * Structure mirrors `isSafePublicMediaUrl` in whatsapp-send.service.ts — same
 * ranges, same IPv4-mapped-IPv6 handling — but returns a reason instead of a
 * boolean, because both callers have to tell somebody what went wrong: the API
 * tells the operator why their URL was rejected, and the delivery worker writes
 * it into the delivery log.
 *
 * Takes a host rather than a URL so the worker can re-run it over the addresses
 * DNS actually resolved to, which is the only check that means anything: a
 * hostname that looks public here can resolve to 127.0.0.1 by the time the
 * delivery fires.
 */
export function webhookHostIssue(hostname: string): string | null {
  if (!ENFORCE_WEBHOOK_URL_SAFETY) return null;

  // Strip IPv6 brackets for matching.
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return 'URL has no host';

  // Internal hostnames.
  if (host === 'localhost' || host.endsWith('.localhost')) return 'Host is loopback';
  if (host.endsWith('.internal') || host.endsWith('.local')) return 'Host is an internal name';

  // IPv6 loopback / unspecified.
  if (host === '::1' || host === '::') return 'Host is loopback';
  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) — pull out the trailing dotted quad.
  const mapped = host.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  const ipv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ? host : (mapped?.[1] ?? null);
  if (ipv4) {
    const o = ipv4.split('.').map(Number);
    if (o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return 'Host is not a valid address';
    }
    if (o[0] === 0) return 'Host is an unroutable address'; // 0.0.0.0/8
    if (o[0] === 127) return 'Host is loopback'; // 127.0.0.0/8
    if (o[0] === 10) return 'Host is a private address'; // 10.0.0.0/8
    if (o[0] === 192 && o[1] === 168) return 'Host is a private address'; // 192.168.0.0/16
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return 'Host is a private address'; // 172.16.0.0/12
    if (o[0] === 169 && o[1] === 254) return 'Host is link-local (cloud metadata)'; // 169.254.0.0/16
  }
  return null;
}

/**
 * Why a webhook URL cannot be subscribed to, or null when it is fine.
 *
 * `z.string().url()` accepted `http://169.254.169.254/latest/meta-data/` and
 * `http://redis:6379/`. The delivery worker is a server-side POST from inside
 * the cluster whose response body is written to the delivery log, so a URL is a
 * request-forgery primitive with a read-back channel: the operator console is
 * behind one shared password, and anyone who gets past it should still not be
 * able to turn a subscription into a port scan of the private network.
 *
 * `https:` is required on top of that. The signed body is only as private as the
 * transport it travels over, and a plaintext delivery leaks message contents and
 * phone numbers to every hop between here and the subscriber.
 */
export function webhookUrlIssue(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return 'Not a valid URL';
  }
  // Plain http is tolerated only by the same relaxation that allows localhost,
  // i.e. never on a deployed server. Anything else (file:, gopher:, ftp:) is out
  // in every environment.
  if (url.protocol !== 'https:' && (ENFORCE_WEBHOOK_URL_SAFETY || url.protocol !== 'http:')) {
    return 'URL must use https';
  }
  return webhookHostIssue(url.hostname);
}

/** Zod adapter: same reason string, surfaced as the field's validation message. */
const webhookUrlSchema = z
  .string()
  .url()
  .superRefine((value, ctx) => {
    const issue = webhookUrlIssue(value);
    if (issue) ctx.addIssue({ code: 'custom', message: issue });
  });

export const waWebhookCreateSchema = z.object({
  body: z.object({
    url: webhookUrlSchema,
    events: z.array(z.enum(WA_WEBHOOK_EVENTS)).min(1),
    description: z.string().max(200).optional(),
  }),
});

export const waWebhookUpdateSchema = z.object({
  body: z.object({
    url: webhookUrlSchema.optional(),
    events: z.array(z.enum(WA_WEBHOOK_EVENTS)).min(1).optional(),
    description: z.string().max(200).optional(),
    isActive: z.boolean().optional(),
  }),
});

/** Edit an existing template. Name and language are immutable at Meta. */
export const waEditTemplateSchema = z.object({
  body: z
    .object({
      category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).optional(),
      // Same structural rules as the create path: an edit is re-reviewed by Meta
      // from scratch, so a malformed edit costs the same round trip and, unlike a
      // create, also takes an already-APPROVED template out of service.
      components: templateComponentsSchema,
      variableSample: z.any().optional(),
      parameterFormat: z.enum(['POSITIONAL', 'NAMED']).optional(),
      messageSendTtlSeconds: z.number().int().min(30).max(900).optional(),
    })
    .superRefine(refineParameterFormat),
});

/** Create a Flow on Meta (starts as DRAFT). */
export const waFlowCreateSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    categories: z
      .array(
        z.enum([
          'SIGN_UP',
          'SIGN_IN',
          'APPOINTMENT_BOOKING',
          'LEAD_GENERATION',
          'CONTACT_US',
          'CUSTOMER_SUPPORT',
          'SURVEY',
          'OTHER',
        ])
      )
      .min(1),
    endpointUri: z.string().url().optional(),
  }),
});

/** Replace a Flow’s JSON definition. */
export const waFlowJsonSchema = z.object({
  body: z.object({ flowJson: z.any() }),
});

/**
 * Connect another WhatsApp business number.
 *
 * The token is optional: leaving it out means this number sends with
 * META_WHATSAPP_TOKEN, which is what a second number on the SAME WABA needs.
 * A number on another WABA needs its own.
 */
export const waChannelCreateSchema = z.object({
  body: z.object({
    phoneNumberId: z.string().min(5).max(64).regex(/^\d+$/, 'Meta phone number IDs are numeric'),
    wabaId: z.string().min(5).max(64).optional(),
    displayPhone: z.string().max(24).optional(),
    displayName: z.string().max(120).optional(),
    accessToken: z.string().min(20).max(2000).optional(),
    isDefault: z.boolean().optional(),
  }),
});

/** Edit a channel, or rotate its token (null clears it back to the env token). */
export const waChannelUpdateSchema = z.object({
  body: z.object({
    wabaId: z.string().min(5).max(64).optional(),
    displayPhone: z.string().max(24).optional(),
    displayName: z.string().max(120).nullable().optional(),
    accessToken: z.string().min(20).max(2000).nullable().optional(),
    isActive: z.boolean().optional(),
  }),
});
