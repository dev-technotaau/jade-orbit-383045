'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  Send,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  FileUp,
  Loader2,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import Button from '@/components/ui/Button';
import Switch from '@/components/ui/Switch';
import { showToast } from '@/components/ui/Toast';
import { cn, formatFileSize } from '@/lib/utils';
import {
  HEADER_ACCEPT,
  HEADER_ACCEPT_HINT,
  HEADER_URL_PLACEHOLDER,
  headerLabel,
  headerNoun,
} from '@/lib/wa-header-media';
import {
  describePhoneImport,
  mergePhoneLines,
  normalizeForDedupe,
  parseContactsFile,
} from '@/lib/parse-contacts';
import { ROUTES } from '@/constants/routes';
import { whatsappService as svc } from '@/services/whatsapp.service';
import {
  analyzeTemplate,
  parseProductSkus,
  resolveSampleToken,
  templateExamples,
  templateParamsBeyondBody,
  tokensWithoutFallback,
  usesSampleContact,
  SAMPLE_CONTACT_NOTE,
  type TemplateVarSpec,
} from '@/lib/whatsapp-template-vars';
import CampaignVariantBuilder, {
  type VariantDraft,
} from '@/components/whatsapp/CampaignVariantBuilder';
import SegmentRulesBuilder, { usableRules } from '@/components/whatsapp/SegmentRulesBuilder';
import TemplatePreviewBubble from '@/components/whatsapp/TemplatePreviewBubble';
import TemplatePicker from '@/components/whatsapp/TemplatePicker';
import { WA_UPLOAD_PAYLOAD_MAX_BYTES, WA_UPLOAD_PHONE_MAX } from '@/constants/config';
import type {
  WaAbMetric,
  WaCampaign,
  WaCampaignTemplateParams,
  WaCarouselCardParams,
  WaSegmentFilter,
  WaSegmentRule,
  WaSequenceStep,
  WaTemplate,
} from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

type CampaignType = 'BROADCAST' | 'SEQUENCE';

// Editable shape for the sequence builder — `stepOrder` is derived from the
// array index on submit, so the local rows only need the user-set fields.
interface StepDraft {
  templateId: string;
  delayHours: string;
  condition: WaSequenceStep['condition'];
  /** Per-step {{n}} values; steps used to send no parameters at all. */
  variableMapping?: string[];
  /**
   * The picked template itself. Kept on the row (and never sent) because the
   * catalogue is searched server-side now — the step's parameter inputs and
   * preview can no longer look the id up in a locally fetched list.
   */
  template?: WaTemplate | null;
}

const CONDITION_OPTIONS = [
  { value: 'any', label: 'Always send' },
  { value: 'no_reply', label: 'Only if no reply yet' },
  { value: 'replied', label: 'Only if they replied' },
];

/**
 * The wizard used to read ONLY the body’s positional {{n}} variables, so a
 * template with a media header, a variable text header or a dynamic URL button
 * could be selected and launched with no warning — and Meta then rejected every
 * recipient with (#131008) Required parameter is missing. analyzeTemplate()
 * resolves the full parameter set the send actually needs.
 */
const EMPTY_SPEC: TemplateVarSpec = {
  headerFormat: 'NONE',
  headerHasTextVar: false,
  headerNeedsMedia: false,
  bodyPositional: 0,
  bodyNamed: [],
  buttonUrlVar: false,
  buttonUrlVarIndexes: [],
  needsOtpCode: false,
  headerNeedsLocation: false,
  needsCouponCode: false,
  needsLtoExpiration: false,
  needsCatalogThumbnail: false,
  needsProductSections: false,
  needsProduct: false,
  hasFlowButton: false,
  carouselCards: [],
  none: true,
};

/**
 * Daily unique-contact allowance implied by a Meta messaging tier ('TIER_1K' → 1000).
 *
 * null whenever there is no daily allowance to state: an unknown tier,
 * 'TIER_UNLIMITED', or the per-second throughput levels ('STANDARD'/'HIGH') Meta
 * reports for numbers on per-message pricing — those are a rate, not an allowance.
 */
function tierDailyLimit(tier: string | null | undefined): number | null {
  const t = String(tier ?? '')
    .toUpperCase()
    .replace(/^TIER[_-]?/, '')
    .trim();
  if (!t || t.includes('UNLIMITED')) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*([KMB]?)$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const mult = m[2] === 'K' ? 1_000 : m[2] === 'M' ? 1_000_000 : m[2] === 'B' ? 1_000_000_000 : 1;
  return Math.round(n * mult);
}

/**
 * An ISO instant as `<input type="datetime-local">` wants it: local wall-clock,
 * no zone, minute precision. Slicing the ISO string instead would show a UTC
 * time in a local-time field, so a campaign scheduled for 18:00 IST reopened as
 * 12:30 and saving it moved the send.
 */
function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CampaignForm({
  editId,
  initial,
  initialTemplate,
}: {
  /** Present when editing an existing campaign; null when creating a new one. */
  editId: string | null;
  initial: WaCampaign | null;
  initialTemplate: WaTemplate | null;
}) {
  const router = useRouter();
  const isEditing = Boolean(editId);
  // Every field below SEEDS from `initial` rather than being written into state
  // by an effect. A prefill effect would fire setState on mount (which the
  // set-state-in-effect lint rule refuses, and which renders the form once empty
  // before filling it), and would re-fire on react-query's focus refetch,
  // discarding whatever had been typed since. The loader below holds the form
  // back until the data is here, so a seed is all that is needed.
  const initialParams: WaCampaignTemplateParams = initial?.templateParams ?? {};
  const initialAudience = (initial?.audienceFilter ?? {}) as {
    tags?: string[];
    optInStatus?: string;
    phones?: string[];
  };
  const [campaignType, setCampaignType] = useState<CampaignType>('BROADCAST');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  // The picked broadcast template itself — the picker searches server-side, so
  // the id alone can no longer be resolved against a locally fetched list.
  const [selected, setSelected] = useState<WaTemplate | null>(initialTemplate);
  const [audienceType, setAudienceType] = useState(initial?.audienceType ?? 'segment');
  const [segmentId, setSegmentId] = useState(initial?.segmentId ?? '');
  const [tags, setTags] = useState((initialAudience.tags ?? []).join(', '));
  const [optInStatus, setOptInStatus] = useState(initialAudience.optInStatus ?? '');
  // The advanced half of the inline filter — the same rule grammar a saved
  // segment stores. Without it the wizard could only express "any of these tags",
  // so "tagged mumbai AND premium", "messaged us in the last 30 days" or "did not
  // reply to the Diwali campaign" had to be assembled outside the product.
  const [rules, setRules] = useState<WaSegmentRule[]>([]);
  const [ruleOp, setRuleOp] = useState<'and' | 'or'>('and');
  const [phones, setPhones] = useState((initialAudience.phones ?? []).join('\n'));
  // "Upload phone numbers" was paste-only, so a 4,000-row CSV of targets had to
  // be imported as permanent contacts and tagged just to be sent to once. The
  // file is parsed in the browser and its numbers are merged into the SAME
  // textarea state, so the count, the cap check and the submitted audienceFilter
  // all stay on one source of truth.
  const phoneFileRef = useRef<HTMLInputElement>(null);
  const [parsingPhoneFile, setParsingPhoneFile] = useState(false);
  /**
   * The extra columns an uploaded file carried, keyed by `normalizeForDedupe` of
   * the number — the same identity the merge and the server dedupe on.
   *
   * The textarea stays the source of truth for WHICH numbers are in the
   * audience; this only says what else is known about them. Personalising a
   * one-off blast was impossible without it — an order id or an appointment slot
   * had nowhere to live, so `{{attr.order_id}}` went to Meta as a literal — and
   * keeping the columns beside the list rather than inside it means the operator
   * can still hand-edit the numbers.
   *
   * Keyed on that identity rather than on the raw string because the two do not
   * agree: `mergePhoneLines` treats `9876543210` and `+919876543210` as one
   * number and keeps whichever line was there already, so a raw key described a
   * line the file never wrote and that recipient silently lost every column it
   * came with — as did any line the operator reformatted by hand.
   */
  const [uploadColumns, setUploadColumns] = useState<
    Record<string, { name?: string; vars?: Record<string, string> }>
  >({});
  const [mapping, setMapping] = useState<string[]>(
    Array.isArray(initial?.variableMapping) ? (initial.variableMapping as string[]) : [],
  );
  const [throttle, setThrottle] = useState(String(initial?.throttlePerSec ?? 15));
  const [scheduledAt, setScheduledAt] = useState(
    initial?.scheduledAt ? toDateTimeLocal(initial.scheduledAt) : '',
  );
  // Hold sends outside the configured business hours. `scheduledAt` is one
  // absolute instant, so without this a campaign armed for 10:00 local reaches an
  // international list in the middle of the night — and night-time marketing is
  // what drives the blocks and reports that degrade a number's quality rating.
  const [respectBusinessHours, setRespectBusinessHours] = useState(
    initial?.respectBusinessHours ?? false,
  );
  const [steps, setSteps] = useState<StepDraft[]>([
    { templateId: '', delayHours: '0', condition: 'any' },
  ]);
  const [isAbTest, setIsAbTest] = useState(false);
  const [variants, setVariants] = useState<VariantDraft[]>([
    { label: 'Variant A', templateId: '', weight: '50' },
    { label: 'Variant B', templateId: '', weight: '50' },
  ]);
  // A/B TEST PHASE. Blank = send to everyone at once, the old behaviour. Set it
  // and the launch stops at that share of the audience, so a winner can be picked
  // on real numbers and the rest sent the template that actually won.
  const [abSamplePct, setAbSamplePct] = useState(
    initial?.abTestSamplePct != null ? String(initial.abTestSamplePct) : '',
  );
  const [abMetric, setAbMetric] = useState<WaAbMetric>(initial?.abTestMetric ?? 'replied');
  const [recurrenceDays, setRecurrenceDays] = useState(
    initial?.recurrenceDays ? String(initial.recurrenceDays) : '',
  );

  const onPhoneFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsingPhoneFile(true);
    try {
      const parsed = await parseContactsFile(file);
      if (parsed.rows.length === 0) {
        showToast.error('No phone numbers found in that file');
        return;
      }
      const merge = mergePhoneLines(phones, parsed.rows);
      setPhones(merge.text);
      setUploadColumns((prev) => {
        const next = { ...prev };
        for (const row of parsed.rows) {
          const phone = (row.phone ?? '').trim();
          if (!phone) continue;
          const vars = row.attributes;
          if (!row.name && !(vars && Object.keys(vars).length)) continue;
          next[normalizeForDedupe(phone)] = {
            ...(row.name ? { name: row.name } : {}),
            ...(vars && Object.keys(vars).length ? { vars } : {}),
          };
        }
        return next;
      });
      showToast.success(describePhoneImport(parsed, merge));
    } catch (err) {
      showToast.error((err as Error).message || 'Could not read that file');
    } finally {
      setParsingPhoneFile(false);
      // Clear the input so re-picking the same file (after fixing it) still fires.
      if (phoneFileRef.current) phoneFileRef.current.value = '';
    }
  };

  const isSequence = campaignType === 'SEQUENCE';
  // A/B testing only applies to broadcasts (a sequence has its own multi-step flow).
  const useAbTest = isAbTest && !isSequence;

  // Saved segments — when one is picked it drives the audience server-side
  // (backend applies the segment's stored filter), so the inline
  // tag/opt-in filters are hidden while a segment is selected.
  const { data: segmentData } = useQuery({
    queryKey: ['wa-segments'],
    queryFn: () => svc.listSegments(),
  });
  const segments = segmentData?.data ?? [];
  const segmentOptions = segments.map((s) => ({ value: s.id, label: s.name }));

  // Campaigns for the engagement rule ("did not reply to …"). Fetched only while
  // the inline filter is on screen — a saved segment carries its own rules.
  const { data: campaignListData } = useQuery({
    queryKey: ['wa-campaigns', 1, 100],
    queryFn: () => svc.listCampaigns({ page: 1, limit: 100 }),
    enabled: audienceType === 'segment',
  });
  const campaignOptions = (campaignListData?.data?.items ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }));

  // The number's Meta messaging tier caps how many DISTINCT contacts a campaign may
  // start a conversation with per 24h; past it Meta refuses the rest with 131056 and
  // the number's quality rating suffers. Stating the cap while the audience is being
  // chosen is the cheapest place to catch a 50,000-number paste on a 1K tier — the
  // exact headroom left today is shown on the campaign page, right before Launch.
  const { data: channelData } = useQuery({
    queryKey: ['wa-channels'],
    queryFn: () => svc.listChannels(),
  });
  const channels = channelData?.data ?? [];
  const defaultChannel = channels.find((ch) => ch.isDefault) ?? channels[0] ?? null;
  const dailyTierLimit = tierDailyLimit(defaultChannel?.messagingTier);
  const pastedPhoneCount = phones.split(/\r?\n/).filter((s) => s.trim()).length;
  const overTier =
    audienceType === 'upload' && !!dailyTierLimit && pastedPhoneCount > dailyTierLimit;
  // A saved segment only applies to the "segment" audience source.
  const usingSavedSegment = audienceType === 'segment' && !!segmentId;
  const overPhoneCap = audienceType === 'upload' && pastedPhoneCount > WA_UPLOAD_PHONE_MAX;

  /**
   * The inline audience predicate this campaign stores. A saved segment carries
   * its own filter server-side, so `segmentId` goes instead of this.
   *
   * One builder for both the sequence and the broadcast submit paths — they used
   * to hold byte-identical copies, and a key added to one would silently not
   * exist in the other.
   */
  const buildAudienceFilter = (): WaSegmentFilter | undefined => {
    if (usingSavedSegment) return undefined;
    if (audienceType !== 'segment') {
      const lines = phones
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      // `recipients` only when the file actually brought columns with it —
      // otherwise the older `phones` shape keeps travelling, which is what every
      // campaign created before per-recipient columns existed still carries.
      const columnsFor = (line: string) => uploadColumns[normalizeForDedupe(line)];
      const withColumns = lines.filter((line) => columnsFor(line));
      if (withColumns.length === 0) return { phones: lines };
      return {
        recipients: lines.map((line) => ({ phone: line, ...(columnsFor(line) ?? {}) })),
      };
    }
    const filter: WaSegmentFilter = {
      tags: tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      optInStatus: optInStatus || undefined,
    };
    // A half-filled rule row narrows nothing — the backend ignores it — so it is
    // dropped rather than stored as a condition that reads as active.
    const finished = usableRules(rules);
    if (finished.length > 0) {
      filter.rules = finished;
      if (finished.length > 1) filter.op = ruleOp;
    }
    return filter;
  };
  const templateId = selected?.id ?? '';
  const spec = selected ? analyzeTemplate(selected) : EMPTY_SPEC;
  const varCount = spec.bodyPositional;
  /**
   * Live audience size + cost, recomputed as the filters change.
   *
   * Debounced on a serialised copy of the audience so typing a tag does not
   * fire a COUNT over the contacts table per keystroke, and keyed on that same
   * string so React Query caches an audience the operator flips back to.
   * Stateless server-side: previewing an uploaded list writes no contact rows.
   */
  const previewTemplateId = useAbTest
    ? variants[0]?.templateId
    : isSequence
      ? steps[0]?.templateId
      : templateId;
  const previewFilter = buildAudienceFilter();
  const previewKey = JSON.stringify({
    templateId: previewTemplateId,
    audienceType,
    audienceFilter: previewFilter,
    segmentId: usingSavedSegment ? segmentId : undefined,
  });
  /**
   * Size of the personalised audience this will POST, in UTF-8 bytes.
   *
   * The row count does not bound it — 20,000 rows are ~310 KB as bare numbers, ~2 MB
   * with a name and two columns each, and several times that for a wide CSV — so a
   * list that passes the row cap can still be refused by the request parser, and a
   * 413 is something the wizard can only report as "Failed to create campaign".
   *
   * Counted in bytes rather than characters because these lists routinely carry
   * non-Latin names, which a code-unit count under-reads by up to 3×.
   */
  const uploadPayloadBytes = previewFilter?.recipients
    ? new TextEncoder().encode(JSON.stringify(previewFilter.recipients)).length
    : 0;
  const overPayloadCap = uploadPayloadBytes > WA_UPLOAD_PAYLOAD_MAX_BYTES;
  const [debouncedPreviewKey, setDebouncedPreviewKey] = useState(previewKey);
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedPreviewKey(previewKey), 400);
    return () => window.clearTimeout(id);
  }, [previewKey]);
  const canPreviewAudience =
    !!previewTemplateId &&
    (usingSavedSegment || audienceType === 'segment' || pastedPhoneCount > 0) &&
    !overPhoneCap &&
    !overPayloadCap;
  const previewQuery = useQuery({
    queryKey: ['wa-audience-preview', debouncedPreviewKey],
    queryFn: () =>
      svc.previewAudienceDraft({
        templateId: previewTemplateId,
        audienceType: audienceType as 'segment' | 'upload' | 'manual',
        audienceFilter: previewFilter,
        ...(usingSavedSegment ? { segmentId } : {}),
      }),
    // Gated on the live audience matching the debounced snapshot the key is made
    // of. Without that equality the request would answer for an audience the
    // cache key does not describe, and the wrong count would then be served to
    // everyone who flips back to that filter.
    enabled: canPreviewAudience && debouncedPreviewKey === previewKey,
    staleTime: 30_000,
  });
  /**
   * The sample values approved with the template, shown under each mapping row.
   *
   * A mapping slot is labelled {{1}} and nothing else, so which sentence
   * position it fills was only discoverable from the preview at the bottom. The
   * approved example says what the slot is FOR — and a transposed broadcast
   * mapping reaches the whole audience at once.
   */
  const examples = selected ? templateExamples(selected) : null;
  const [templateParams, setTemplateParams] = useState<WaCampaignTemplateParams>(initialParams);
  /** Every campaign-level parameter that is a plain string input. */
  type StringParam = Exclude<
    keyof WaCampaignTemplateParams,
    'ltoExpirationMs' | 'carouselCards' | 'headerLocation' | 'buttonUrlParams' | 'productSections'
  >;
  const setParam = (k: StringParam, v: string) =>
    setTemplateParams((p) => ({ ...p, [k]: v || undefined }));

  /**
   * Header media: upload a file, or point Meta at a public URL.
   *
   * The inbox composer has offered both for a while; a campaign could only ever
   * take a URL, so an operator with the file on their desk had to publish it
   * somewhere public first. The two are mutually exclusive — the send path
   * prefers the uploaded id — so switching mode clears the other one rather than
   * leaving a stale value behind to be sent.
   */
  const [headerMediaMode, setHeaderMediaMode] = useState<'upload' | 'url'>(
    initialParams.headerMediaId ? 'upload' : 'url',
  );
  const [headerUploading, setHeaderUploading] = useState(false);
  const [headerFileName, setHeaderFileName] = useState(
    initialParams.headerMediaId ? 'Previously uploaded file' : '',
  );

  const switchHeaderMode = (mode: 'upload' | 'url') => {
    setHeaderMediaMode(mode);
    setHeaderFileName('');
    setTemplateParams((p) => ({ ...p, headerMediaId: undefined, headerMediaUrl: undefined }));
  };

  const onHeaderFile = async (file: File | undefined) => {
    if (!file) return;
    if (!defaultChannel) return showToast.error('No WhatsApp number is connected to upload under');
    setHeaderUploading(true);
    try {
      // Staged under the campaign's OWN channel: a Meta media id belongs to the
      // number that uploaded it, so a file staged under any other number is
      // refused when the broadcast goes out.
      const mediaId = await svc.uploadMedia(file, { channelId: defaultChannel.id });
      if (!mediaId) throw new Error('Upload returned no media id');
      setHeaderFileName(file.name);
      setTemplateParams((p) => ({ ...p, headerMediaId: mediaId, headerMediaUrl: undefined }));
    } catch (err) {
      showToast.error(
        (err as { message?: string })?.message || 'Failed to upload the header media',
      );
    } finally {
      setHeaderUploading(false);
    }
  };
  /**
   * One value per DYNAMIC url button. Meta allows two URL buttons and either may
   * carry a {{n}} suffix, each addressed by its own index — a single field could
   * fill only the first, so a two-link template launched clean and was then
   * refused for the whole audience with (#131008).
   */
  const setUrlParam = (n: number, v: string) =>
    setTemplateParams((p) => ({
      ...p,
      buttonUrlParams: Object.assign([...(p.buttonUrlParams ?? [])], { [n]: v }),
    }));
  /** One carousel card's campaign-wide values, by card index. */
  const cardParam = (i: number): WaCarouselCardParams => templateParams.carouselCards?.[i] ?? {};
  const setCardParam = (i: number, patch: Partial<WaCarouselCardParams>) =>
    setTemplateParams((p) => {
      const next = [...(p.carouselCards ?? [])];
      while (next.length <= i) next.push({});
      next[i] = { ...next[i], ...patch };
      return { ...p, carouselCards: next };
    });
  /**
   * The first thing missing from the carousel cards, as a sentence to show.
   *
   * Meta refuses the WHOLE message for one empty card parameter, so a broadcast
   * with a half-filled carousel fails for every recipient. The launch gate
   * refuses it too, but by then the campaign has been drafted and possibly
   * scheduled — this is the same answer, given while the form is still open.
   */
  const carouselGap = (): string | null => {
    for (const [i, card] of spec.carouselCards.entries()) {
      const values = cardParam(i);
      if (!values.headerMediaUrl?.trim()) {
        return `Card ${i + 1} needs ${card.headerFormat === 'VIDEO' ? 'a video' : 'an image'} URL`;
      }
      for (let n = 0; n < card.bodyPositional; n += 1) {
        if (!(values.bodyParams?.[n] ?? '').trim()) {
          return `Card ${i + 1} has no value for {{${n + 1}}} — Meta refuses an empty parameter`;
        }
      }
      const cardUrls = values.buttonUrlParams ?? [];
      const dynamic = card.buttons.filter((b) => b.hasUrlVar);
      for (let n = 0; n < dynamic.length; n += 1) {
        if (!(cardUrls[n] ?? '').trim()) {
          return `Card ${i + 1} needs the value for its link button${
            dynamic.length > 1 ? ` ${n + 1}` : ''
          }`;
        }
      }
    }
    return null;
  };
  /**
   * The first dynamic URL button with no value, or null when they are all filled.
   *
   * Meta addresses each dynamic URL button by its own index and refuses the whole
   * message for one it was given no parameter for — so a template with two links
   * and one value filled in fails for every recipient in the audience.
   */
  const urlGap = ((): number | null => {
    const values = templateParams.buttonUrlParams ?? [];
    for (let n = 0; n < spec.buttonUrlVarIndexes.length; n += 1) {
      if (!(values[n] ?? '').trim()) return n;
    }
    return null;
  })();
  // Held as the datetime-local string the input produces and converted to epoch
  // ms only on submit, exactly as the inbox composer does it.
  const [ltoExpiresAt, setLtoExpiresAt] = useState(
    initialParams.ltoExpirationMs
      ? toDateTimeLocal(new Date(initialParams.ltoExpirationMs).toISOString())
      : '',
  );
  // The LOCATION header's pin, kept as the raw strings the inputs produce and
  // assembled on submit (same reason as the expiry above). A LOCATION template
  // could be picked here with no way to supply the pin at all, so the campaign
  // launched and Meta then refused the whole audience with (#131008).
  const [lat, setLat] = useState(
    initialParams.headerLocation ? String(initialParams.headerLocation.latitude ?? '') : '',
  );
  const [lng, setLng] = useState(
    initialParams.headerLocation ? String(initialParams.headerLocation.longitude ?? '') : '',
  );
  const [placeName, setPlaceName] = useState(initialParams.headerLocation?.name ?? '');
  const [placeAddress, setPlaceAddress] = useState(initialParams.headerLocation?.address ?? '');
  /**
   * A multi-product template's sections, as the form holds them.
   *
   * The products are chosen per SEND — they are not part of the approved
   * template, and there is no API here for browsing the bound catalog — so the
   * SKUs are typed. Assembled into `productSections` on submit, the same way the
   * location pin and the offer expiry are.
   */
  const [sectionDrafts, setSectionDrafts] = useState<Array<{ title: string; skus: string }>>(() =>
    initialParams.productSections?.length
      ? initialParams.productSections.map((s) => ({
          title: s.title ?? '',
          skus: (s.productRetailerIds ?? []).join(', '),
        }))
      : [{ title: '', skus: '' }],
  );
  const productSections = sectionDrafts
    .map((s) => ({ title: s.title.trim(), productRetailerIds: parseProductSkus(s.skus) }))
    .filter((s) => s.title && s.productRetailerIds.length > 0);
  /** The pin as the API takes it — null until both coordinates are usable. */
  const headerLocation: WaCampaignTemplateParams['headerLocation'] | null = (() => {
    if (!spec.headerNeedsLocation) return null;
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!lat.trim() || !lng.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return {
      latitude,
      longitude,
      ...(placeName.trim() ? { name: placeName.trim() } : {}),
      ...(placeAddress.trim() ? { address: placeAddress.trim() } : {}),
    };
  })();
  // Body values as they will be sent, one slot per {{n}} — blank slots included
  // so the preview can show which placeholder is still unfilled.
  const previewMapping = Array.from({ length: varCount }, (_, i) => mapping[i] ?? '');
  // Slots the operator has left empty, and slots whose token can resolve to
  // nothing. Both end as an empty parameter, which Meta refuses outright.
  const blankMapping = previewMapping
    .map((v, i) => (v.trim() ? null : i + 1))
    .filter((n): n is number => n !== null);
  const riskyMapping = tokensWithoutFallback(previewMapping);

  const updateStep = (index: number, patch: Partial<StepDraft>) =>
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const addStep = () =>
    setSteps((prev) => [...prev, { templateId: '', delayHours: '24', condition: 'any' }]);
  const removeStep = (index: number) => setSteps((prev) => prev.filter((_, i) => i !== index));
  const moveStep = (index: number, dir: -1 | 1) =>
    setSteps((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const updateVariant = (index: number, patch: Partial<VariantDraft>) =>
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  const addVariant = () =>
    setVariants((prev) => [
      ...prev,
      { label: `Variant ${String.fromCharCode(65 + prev.length)}`, templateId: '', weight: '50' },
    ]);
  const removeVariant = (index: number) =>
    setVariants((prev) => prev.filter((_, i) => i !== index));

  const mutation = useMutation({
    mutationFn: () => {
      const recurrence = Math.max(0, parseInt(recurrenceDays, 10) || 0);
      const recurrenceField = recurrence > 0 ? { recurrenceDays: recurrence } : {};
      if (isSequence) {
        const sequenceSteps: WaSequenceStep[] = steps.map((s, i) => ({
          stepOrder: i + 1,
          templateId: s.templateId,
          delayHours: Math.max(0, parseInt(s.delayHours, 10) || 0),
          condition: s.condition,
          // Per-step parameters. Steps used to send none, so a step whose template
          // had placeholders went out blank.
          ...(s.variableMapping?.length ? { variableMapping: s.variableMapping } : {}),
        }));
        // A saved segment drives the audience server-side, so we omit the
        // manual inline filter and pass segmentId instead.
        const audienceFilter = buildAudienceFilter();
        return svc.createCampaign({
          name: name.trim(),
          description: description.trim() || undefined,
          templateId: sequenceSteps[0].templateId,
          audienceType,
          audienceFilter,
          ...(usingSavedSegment ? { segmentId } : {}),
          throttlePerSec: parseInt(throttle, 10) || 15,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
          respectBusinessHours,
          type: 'SEQUENCE',
          steps: sequenceSteps,
          ...recurrenceField,
        });
      }
      const audienceFilter = buildAudienceFilter();
      const samplePct = Math.min(99, Math.max(0, parseInt(abSamplePct, 10) || 0));
      const abFields = useAbTest
        ? {
            isAbTest: true,
            variants: variants.map((v, i) => ({
              label: v.label.trim() || `Variant ${String.fromCharCode(65 + i)}`,
              templateId: v.templateId,
              weight: Math.max(1, parseInt(v.weight, 10) || 1),
              ...(v.variableMapping?.length ? { variableMapping: v.variableMapping } : {}),
            })),
            // Blank/0 means "send to everyone now"; a percentage holds the rest
            // back so the winner can be decided before they are messaged.
            abTestSamplePct: samplePct > 0 ? samplePct : null,
            abTestMetric: abMetric,
          }
        : {};
      // Built once and used by BOTH the create and the edit call below, so the
      // two can never disagree about what a campaign's parameters are.
      const campaignTemplateParams = useAbTest
        ? undefined
        : {
            ...templateParams,
            // Meta needs the media KIND alongside the URL; it comes from the
            // template's own header format, not from operator input.
            ...(spec.headerNeedsMedia
              ? {
                  headerMediaType: spec.headerFormat.toLowerCase() as
                    'image' | 'video' | 'document',
                }
              : {}),
            // The LOCATION header's pin. Campaign-wide like the media above —
            // one place for the whole audience — and required, so submit has
            // already refused a campaign that has no usable coordinates.
            ...(headerLocation ? { headerLocation } : {}),
            ...(spec.needsLtoExpiration && ltoExpiresAt
              ? { ltoExpirationMs: new Date(ltoExpiresAt).getTime() }
              : {}),
            // A multi-product template's product list. Chosen here because it
            // exists nowhere in the approved template — Meta reads the products
            // straight off the send payload.
            ...(spec.needsProductSections ? { productSections } : {}),
            // Carousel cards, normalised to the number of cards the template
            // was approved with — Meta matches them by card_index, so a stray
            // extra entry would fail the send for the whole audience.
            ...(spec.carouselCards.length
              ? {
                  carouselCards: spec.carouselCards.map((card, i) => ({
                    ...cardParam(i),
                    headerMediaType: (card.headerFormat === 'VIDEO' ? 'video' : 'image') as
                      'image' | 'video',
                  })),
                }
              : {}),
          };

      const variableMapping = useAbTest
        ? undefined
        : Array.from({ length: varCount }, (_, i) => mapping[i] || '');
      const scheduledAtIso = scheduledAt ? new Date(scheduledAt).toISOString() : undefined;
      const throttlePerSec = parseInt(throttle, 10) || 15;

      // EDIT takes a strict subset: `type`, `steps`, `variants` and `isAbTest`
      // are fixed at creation. Cleared values go as null rather than undefined —
      // on this PATCH, undefined means "leave it alone", so clearing a schedule
      // with undefined would silently keep the old one.
      if (isEditing) {
        return svc.updateCampaign(String(editId), {
          name: name.trim(),
          description: description.trim() || null,
          templateId: useAbTest ? variants[0].templateId : templateId,
          audienceType,
          audienceFilter,
          ...(usingSavedSegment ? { segmentId } : {}),
          templateParams: campaignTemplateParams,
          variableMapping,
          throttlePerSec,
          scheduledAt: scheduledAtIso ?? null,
          respectBusinessHours,
          recurrenceDays: recurrence > 0 ? recurrence : null,
          ...(useAbTest ? { abTestSamplePct: samplePct, abTestMetric: abMetric } : {}),
        });
      }

      return svc.createCampaign({
        name: name.trim(),
        description: description.trim() || undefined,
        // For an A/B broadcast the per-variant templates drive the send; use the
        // first variant's template as the campaign's base template reference.
        templateId: useAbTest ? variants[0].templateId : templateId,
        audienceType,
        audienceFilter,
        ...(usingSavedSegment ? { segmentId } : {}),
        templateParams: campaignTemplateParams,
        variableMapping,
        throttlePerSec,
        scheduledAt: scheduledAtIso,
        respectBusinessHours,
        type: 'BROADCAST',
        ...abFields,
        ...recurrenceField,
      });
    },
    onSuccess: (res) => {
      showToast.success(
        isEditing
          ? 'Campaign updated'
          : scheduledAt
            ? 'Campaign scheduled'
            : 'Campaign created as draft',
      );
      const id = editId ?? res.data?.id;
      router.push(
        id
          ? ROUTES.SUPER_ADMIN.WHATSAPP_CAMPAIGN_DETAIL(id)
          : ROUTES.SUPER_ADMIN.WHATSAPP_CAMPAIGNS,
      );
    },
    onError: (e) =>
      showToast.error(
        (e as unknown as ApiError).message ||
          (isEditing ? 'Failed to update campaign' : 'Failed to create campaign'),
      ),
  });

  const submit = () => {
    if (!name.trim()) return showToast.error('Campaign name is required');
    // A campaign carries ONE card set, filled in against its main template, so a
    // carousel cannot be a drip step or an A/B variant: those carry a body
    // mapping and nothing else, and the launch gate refuses them for that reason.
    const carouselStep = steps.findIndex(
      (s) => s.template && analyzeTemplate(s.template).carouselCards.length > 0,
    );
    if (isSequence && carouselStep >= 0) {
      return showToast.error(
        `Step ${carouselStep + 1} is a carousel template. A campaign can only supply cards for its main template — send the carousel as its own broadcast.`,
      );
    }
    // The SAME parameter gate the main template gets, applied to every template
    // this campaign can actually send.
    //
    // A drip step and an A/B variant carry a body mapping and nothing else — the
    // campaign's one `templateParams` set is filled in against the main template,
    // and every check below is skipped outright once A/B is on. So a step or a
    // variant needing a media header, a location pin, a dynamic link, a coupon or
    // an offer expiry passed this form, passed the launch, and was then refused by
    // Meta with (#131008) for its entire slice of the audience.
    const paramlessGap = (rows: Array<{ label: string; template?: WaTemplate | null }>) => {
      for (const row of rows) {
        if (!row.template) continue;
        const needs = templateParamsBeyondBody(analyzeTemplate(row.template));
        if (needs.length > 0) {
          return `${row.label} needs ${needs.join(', ')}, which a campaign supplies for its main template only. Pick a template that needs body values alone.`;
        }
      }
      return null;
    };
    const sendableGap = isSequence
      ? paramlessGap(steps.map((s, i) => ({ label: `Step ${i + 1}`, template: s.template })))
      : useAbTest
        ? paramlessGap(
            variants.map((v, i) => ({
              label: v.label.trim() || `Variant ${String.fromCharCode(65 + i)}`,
              template: v.template,
            })),
          )
        : null;
    if (sendableGap) return showToast.error(sendableGap);
    const cardGap = useAbTest || isSequence ? null : carouselGap();
    if (isSequence) {
      if (steps.length === 0) return showToast.error('Add at least one sequence step');
      if (steps.some((s) => !s.templateId))
        return showToast.error('Every sequence step needs an approved template');
      // Same empty-parameter trap as the broadcast mapping below: Meta refuses
      // the whole message, so a blank slot fails the step for every recipient.
      const badStep = steps.findIndex((s) => (s.variableMapping ?? []).some((v) => !v.trim()));
      if (badStep >= 0)
        return showToast.error(
          `Step ${badStep + 1} has a variable with no value — pick a token or type a literal`,
        );
    } else if (useAbTest) {
      if (variants.length < 2) return showToast.error('An A/B test needs at least two variants');
      if (variants.some((v) => !v.templateId))
        return showToast.error('Every variant needs an approved template');
      const badVariant = variants.find((v) => (v.variableMapping ?? []).some((m) => !m?.trim()));
      if (badVariant)
        return showToast.error(
          `${badVariant.label || 'A variant'} has a variable with no value — pick a token or type a literal`,
        );
    } else if (
      !useAbTest &&
      spec.headerNeedsMedia &&
      !templateParams.headerMediaUrl &&
      !templateParams.headerMediaId
    ) {
      return showToast.error('This template has a media header — upload a file or add a media URL');
    } else if (!useAbTest && spec.headerHasTextVar && !templateParams.headerText) {
      return showToast.error('This template has a variable header — fill in the header text');
    } else if (!useAbTest && spec.headerNeedsLocation && !headerLocation) {
      // The pin is supplied per send, never at authoring time. Without it Meta
      // refuses every recipient with (#131008) — the whole audience, after the
      // send is committed — which is exactly what this gate exists to prevent.
      return showToast.error(
        'This template has a location header — enter a valid latitude and longitude',
      );
    } else if (!useAbTest && urlGap !== null) {
      return showToast.error(
        spec.buttonUrlVarIndexes.length > 1
          ? `This template has two dynamic URL buttons — add the value for link button ${urlGap + 1}`
          : 'This template has a dynamic URL button — add its value',
      );
    } else if (
      !useAbTest &&
      spec.needsProductSections &&
      !templateParams.catalogThumbnailProductId
    ) {
      // Meta requires the thumbnail SKU alongside an MPM's sections. A CATALOG
      // button's thumbnail is optional and is deliberately not gated here.
      return showToast.error(
        'A multi-product template needs the SKU of the product whose image heads the message',
      );
    } else if (!useAbTest && spec.needsProductSections && productSections.length === 0) {
      return showToast.error(
        'A multi-product template needs at least one section with a title and product SKUs — ' +
          'the products are chosen here, not in the template',
      );
    } else if (!useAbTest && spec.needsProduct && !templateParams.productRetailerId) {
      return showToast.error('This template shows a product — add its SKU');
    } else if (!useAbTest && spec.needsCouponCode && !templateParams.couponCode) {
      return showToast.error('This template has a copy-code button — add the coupon code');
    } else if (!useAbTest && spec.needsLtoExpiration && !ltoExpiresAt) {
      return showToast.error('This is a limited-time offer — set when it expires');
    } else if (
      !useAbTest &&
      spec.needsLtoExpiration &&
      new Date(ltoExpiresAt).getTime() <= Date.now()
    ) {
      return showToast.error('The offer expiry is in the past — the countdown would show as over');
    } else if (cardGap) {
      return showToast.error(cardGap);
    } else if (!useAbTest && spec.bodyNamed.length > 0) {
      return showToast.error(
        'This template uses named variables, which campaigns cannot personalise. Use a template with {{1}} style variables.',
      );
    } else if (!templateId) {
      return showToast.error('Pick an approved template');
    } else if (blankMapping.length > 0) {
      // An empty parameter is not "unpersonalised", it is a hard Meta rejection
      // for every recipient — so a forgotten mapping row used to fail the entire
      // audience, and "Retry failed" re-failed it identically.
      return showToast.error(
        `Variable {{${blankMapping[0]}}} has no value — pick a token or type a literal`,
      );
    }
    if (audienceType === 'upload' && !phones.trim())
      return showToast.error('Add phone numbers for the upload audience');
    // Caught here rather than at the API, which can only answer with a 413 the
    // wizard used to surface as an unexplained "Failed to create campaign".
    if (overPhoneCap)
      return showToast.error(
        `${pastedPhoneCount.toLocaleString('en-IN')} numbers is over the ${WA_UPLOAD_PHONE_MAX.toLocaleString('en-IN')} limit — split the list across campaigns, or import them as contacts and target a segment`,
      );
    // The other bound on the same list. The columns are what make a body big, and
    // the API can only answer an over-large one with a 413.
    if (overPayloadCap)
      return showToast.error(
        `The columns on this list come to ${formatFileSize(uploadPayloadBytes)}, over the ${formatFileSize(WA_UPLOAD_PAYLOAD_MAX_BYTES)} the API accepts — upload a file with fewer columns, or split the list across campaigns`,
      );
    mutation.mutate();
  };

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="whatsapp.campaigns.create"
    >
      <div className="space-y-6">
        <Link
          href={ROUTES.SUPER_ADMIN.WHATSAPP_CAMPAIGNS}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to campaigns
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--text)]">
            {isEditing ? 'Edit campaign' : 'New campaign'}
          </h1>
          <Button
            leftIcon={<Send className="h-4 w-4" />}
            onClick={submit}
            isLoading={mutation.isPending}
          >
            {isEditing ? 'Save changes' : isSequence ? 'Create sequence draft' : 'Create draft'}
          </Button>
        </div>

        <Card>
          <div className="space-y-4">
            <Input label="Campaign name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              label="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div>
              <p className="mb-1.5 block text-sm font-medium text-[var(--text)]">Campaign type</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    value: 'BROADCAST' as const,
                    title: 'Broadcast',
                    desc: 'Send one template to the whole audience at once.',
                  },
                  {
                    value: 'SEQUENCE' as const,
                    title: 'Drip / Sequence',
                    desc: 'Send a series of templates over time with reply-based rules.',
                  },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCampaignType(opt.value)}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors',
                      campaignType === opt.value
                        ? 'border-primary bg-[var(--primary-light)]'
                        : 'border-[var(--border)] bg-white hover:bg-[var(--bg-secondary)]',
                    )}
                  >
                    <p className="text-sm font-semibold text-[var(--text)]">{opt.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            {!isSequence && (
              <>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                  <Switch
                    label="A/B test"
                    description="Send 2+ template variants split across the audience by weight, then compare performance."
                    checked={useAbTest}
                    onChange={(e) => setIsAbTest(e.target.checked)}
                  />
                </div>
                {!useAbTest && (
                  <TemplatePicker
                    label="Template (approved only)"
                    value={templateId}
                    onChange={(t) => {
                      setSelected(t);
                      // A different template has a different placeholder count,
                      // so a carried-over mapping would fill the wrong slots.
                      setMapping([]);
                      // Same reasoning for the carousel cards, which ride on
                      // templateParams: leaving them meant a template with no
                      // carousel shipped the previous template's cards, and Meta
                      // rejected every recipient.
                      //
                      // The link values and the catalogue products go the same
                      // way. They are per-template — a link suffix carried over
                      // from the last pick would be appended to a DIFFERENT
                      // template's button and sent to the whole audience.
                      setTemplateParams((p) => {
                        const next = { ...p };
                        delete next.carouselCards;
                        delete next.buttonUrlParams;
                        delete next.buttonUrlParam;
                        delete next.catalogThumbnailProductId;
                        delete next.productSections;
                        delete next.productRetailerId;
                        return next;
                      });
                      setSectionDrafts([{ title: '', skus: '' }]);
                    }}
                  />
                )}
                {useAbTest && (
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium text-[var(--text)]">Variants</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Each variant uses an approved template. Recipients are split by relative
                        weight.
                      </p>
                    </div>
                    <CampaignVariantBuilder
                      variants={variants}
                      onChange={updateVariant}
                      onAdd={addVariant}
                      onRemove={removeVariant}
                    />
                    {/* The test PHASE. Without it an A/B campaign splits the whole
                        audience and there is nobody left to send the winner to —
                        which is the thing an A/B test exists for. */}
                    <div className="grid gap-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 sm:grid-cols-2">
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        label="Test on % of the audience"
                        value={abSamplePct}
                        onChange={(e) => setAbSamplePct(e.target.value)}
                        placeholder="Leave blank to send to everyone"
                      />
                      <Select
                        label="Decide the winner on"
                        options={[
                          { value: 'replied', label: 'Reply rate' },
                          { value: 'read', label: 'Read rate' },
                          { value: 'delivered', label: 'Delivery rate' },
                        ]}
                        value={abMetric}
                        onChange={(v) => setAbMetric(v as WaAbMetric)}
                        clearable={false}
                      />
                      <p className="text-xs text-[var(--text-muted)] sm:col-span-2">
                        {abSamplePct.trim()
                          ? `Launch sends to ${abSamplePct.trim()}% of the audience. Pick the winner on the campaign page, then release the remaining ${Math.max(0, 100 - (parseInt(abSamplePct, 10) || 0))}% to it.`
                          : 'The whole audience is split across the variants at launch, so there is no remainder to send the winner to.'}
                      </p>
                    </div>
                  </div>
                )}
                {!useAbTest &&
                  (spec.headerNeedsMedia ||
                    spec.headerHasTextVar ||
                    spec.headerNeedsLocation ||
                    spec.buttonUrlVar ||
                    spec.needsCouponCode ||
                    spec.needsLtoExpiration ||
                    spec.needsCatalogThumbnail ||
                    spec.needsProductSections ||
                    spec.needsProduct) && (
                    <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                      <p className="text-xs font-semibold text-[var(--text-muted)]">
                        Template parameters — the same for every recipient
                      </p>
                      {spec.headerNeedsMedia && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-[var(--text)]">
                              Header {spec.headerFormat.toLowerCase()}
                            </span>
                            <div className="flex overflow-hidden rounded-md border border-[var(--border)] text-[11px]">
                              {(['upload', 'url'] as const).map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => switchHeaderMode(m)}
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
                            <Input
                              label={`${headerLabel(spec.headerFormat)} header URL`}
                              value={templateParams.headerMediaUrl ?? ''}
                              onChange={(e) => setParam('headerMediaUrl', e.target.value)}
                              placeholder={
                                HEADER_URL_PLACEHOLDER[spec.headerFormat] ?? 'https://example.com/…'
                              }
                              helperText={`Meta re-downloads this link on every send. ${
                                HEADER_ACCEPT_HINT[spec.headerFormat] ?? ''
                              }`}
                            />
                          ) : !templateParams.headerMediaId ? (
                            // Same control the composer uses: a label wrapping a
                            // hidden input, because the browser's native file
                            // input cannot be styled and rendered as a bare
                            // "Choose File / No file chosen" next to buttons that
                            // look nothing like it.
                            <label
                              className={cn(
                                'flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-white px-3 py-4 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]',
                                (headerUploading || !defaultChannel) &&
                                  'pointer-events-none opacity-70',
                              )}
                            >
                              {headerUploading ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading to
                                  WhatsApp…
                                </>
                              ) : !defaultChannel ? (
                                <>
                                  <FileUp className="h-4 w-4" /> Connect a WhatsApp number first
                                </>
                              ) : (
                                <>
                                  <FileUp className="h-4 w-4" /> Choose{' '}
                                  {headerNoun(spec.headerFormat)} file
                                </>
                              )}
                              <input
                                type="file"
                                className="hidden"
                                accept={HEADER_ACCEPT[spec.headerFormat]}
                                disabled={headerUploading || !defaultChannel}
                                onChange={(e) => void onHeaderFile(e.target.files?.[0])}
                              />
                            </label>
                          ) : (
                            <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-white p-2.5">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                                <FileUp className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-[var(--text)]">
                                  {headerFileName || 'Uploaded'}
                                </p>
                                <p className="text-[11px] text-emerald-600">
                                  Uploaded — WhatsApp keeps it about 30 days, so use a URL for a
                                  campaign scheduled further out.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => switchHeaderMode('upload')}
                                className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-red-600"
                                aria-label="Remove header media"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {/* DOCUMENT headers carry the name the attachment shows on
                          the handset. Without it every recipient's PDF is named
                          after the URL's last path segment. */}
                      {spec.headerFormat === 'DOCUMENT' && (
                        <Input
                          label="File name (optional)"
                          value={templateParams.headerMediaFilename ?? ''}
                          onChange={(e) => setParam('headerMediaFilename', e.target.value)}
                          placeholder="Invoice-October.pdf"
                          helperText="What the attachment is called on the recipient's phone."
                        />
                      )}
                      {spec.headerHasTextVar && (
                        <Input
                          label="Header text"
                          value={templateParams.headerText ?? ''}
                          onChange={(e) => setParam('headerText', e.target.value)}
                        />
                      )}
                      {/* LOCATION header. The pin is filled in per SEND — the
                          template carries no coordinates — so without these the
                          broadcast is unsendable and Meta refuses every recipient. */}
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
                            helperText="The same pin goes to everyone in the audience."
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
                      {/* One field per DYNAMIC url button — Meta allows two and
                          addresses each by its own index, so filling only the
                          first has the whole audience refused with (#131008). */}
                      {spec.buttonUrlVarIndexes.map((_index, n) => (
                        <Input
                          key={n}
                          label={
                            spec.buttonUrlVarIndexes.length > 1
                              ? `Link button ${n + 1} value`
                              : 'URL button value'
                          }
                          value={templateParams.buttonUrlParams?.[n] ?? ''}
                          onChange={(e) => setUrlParam(n, e.target.value)}
                          placeholder="order/12345"
                        />
                      ))}
                      {(spec.needsCatalogThumbnail || spec.needsProductSections) && (
                        <Input
                          label={
                            spec.needsProductSections
                              ? 'Thumbnail product SKU'
                              : 'Thumbnail product SKU (optional)'
                          }
                          value={templateParams.catalogThumbnailProductId ?? ''}
                          onChange={(e) => setParam('catalogThumbnailProductId', e.target.value)}
                          placeholder="2lc20305pt"
                          helperText={
                            spec.needsProductSections
                              ? 'The product whose image heads the message, as its SKU appears in your catalog.'
                              : 'Left blank, WhatsApp uses the first item in the catalog bound to this number.'
                          }
                        />
                      )}
                      {spec.needsProduct && (
                        <Input
                          label="Product SKU"
                          value={templateParams.productRetailerId ?? ''}
                          onChange={(e) => setParam('productRetailerId', e.target.value)}
                          placeholder="2lc20305pt"
                          helperText="The product this template shows. The whole audience sees the same one."
                        />
                      )}
                      {spec.needsProductSections && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-[var(--text-muted)]">
                            Products — up to 10 sections, 30 products in total
                          </p>
                          {sectionDrafts.map((section, n) => (
                            <div
                              key={n}
                              className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-[var(--text)]">
                                  Section {n + 1}
                                </span>
                                {sectionDrafts.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSectionDrafts((prev) => prev.filter((_s, i) => i !== n))
                                    }
                                    className="text-[11px] font-medium text-[var(--text-muted)] hover:text-red-600"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                              <Input
                                id={`mpm-section-${n}-title`}
                                label="Section title"
                                maxLength={24}
                                value={section.title}
                                onChange={(e) =>
                                  setSectionDrafts((prev) =>
                                    Object.assign([...prev], {
                                      [n]: { ...prev[n], title: e.target.value },
                                    }),
                                  )
                                }
                                placeholder="Popular bundles"
                              />
                              <Input
                                id={`mpm-section-${n}-skus`}
                                label="Product SKUs"
                                value={section.skus}
                                onChange={(e) =>
                                  setSectionDrafts((prev) =>
                                    Object.assign([...prev], {
                                      [n]: { ...prev[n], skus: e.target.value },
                                    }),
                                  )
                                }
                                placeholder="2lc20305pt, nseiw1x3ch"
                                helperText="Separate SKUs with commas or spaces."
                              />
                            </div>
                          ))}
                          {sectionDrafts.length < 10 && (
                            <button
                              type="button"
                              onClick={() =>
                                setSectionDrafts((prev) => [...prev, { title: '', skus: '' }])
                              }
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
                          value={templateParams.couponCode ?? ''}
                          onChange={(e) => setParam('couponCode', e.target.value)}
                          placeholder="SAVE20"
                          helperText="Shown on the copy-code button. The whole audience gets this one code."
                        />
                      )}
                      {spec.needsLtoExpiration && (
                        <Input
                          type="datetime-local"
                          label="Offer expires"
                          value={ltoExpiresAt}
                          onChange={(e) => setLtoExpiresAt(e.target.value)}
                          helperText="WhatsApp shows a live countdown to this time. Checked again at launch — a campaign scheduled for next week cannot carry yesterday's expiry."
                        />
                      )}
                    </div>
                  )}
                {/* CAROUSEL cards. Campaign-wide, like the header media above:
                    every recipient gets the same card images and card text, and
                    only the bubble's body is personalised per recipient. */}
                {!useAbTest && spec.carouselCards.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                    <p className="text-xs font-semibold text-[var(--text-muted)]">
                      Carousel cards — {spec.carouselCards.length} card
                      {spec.carouselCards.length === 1 ? '' : 's'}, the same for every recipient
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Every card needs its own media before this campaign can launch: Meta refuses
                      the whole message when a card parameter is missing, so one blank card fails
                      the entire audience.
                    </p>
                    {spec.carouselCards.map((card, i) => {
                      const values = cardParam(i);
                      const kind = card.headerFormat === 'VIDEO' ? 'video' : 'image';
                      return (
                        <div
                          key={i}
                          className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2.5"
                        >
                          <p className="text-xs font-semibold text-[var(--text)]">
                            Card {i + 1}
                            {card.bodyText && (
                              <span className="ml-1.5 font-normal text-[var(--text-muted)]">
                                {card.bodyText}
                              </span>
                            )}
                          </p>
                          <Input
                            label={`Card ${kind} URL`}
                            value={values.headerMediaUrl ?? ''}
                            onChange={(e) => setCardParam(i, { headerMediaUrl: e.target.value })}
                            placeholder={`https://example.com/card-${i + 1}.${
                              kind === 'video' ? 'mp4' : 'jpg'
                            }`}
                          />
                          {Array.from({ length: card.bodyPositional }, (_, n) => (
                            <Input
                              key={n}
                              label={`Card ${i + 1} {{${n + 1}}}`}
                              value={values.bodyParams?.[n] ?? ''}
                              helperText={
                                card.bodyExamples[n]
                                  ? `Approved example: ${card.bodyExamples[n]}`
                                  : undefined
                              }
                              onChange={(e) =>
                                setCardParam(i, {
                                  bodyParams: Object.assign([...(values.bodyParams ?? [])], {
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
                                  card.buttons.filter((b) => b.hasUrlVar).length > 1
                                    ? ` ${n + 1}`
                                    : ''
                                }`}
                                value={values.buttonUrlParams?.[n] ?? ''}
                                onChange={(e) =>
                                  setCardParam(i, {
                                    buttonUrlParams: Object.assign(
                                      [...(values.buttonUrlParams ?? [])],
                                      { [n]: e.target.value },
                                    ),
                                  })
                                }
                                placeholder="summer-sale"
                              />
                            ))}
                        </div>
                      );
                    })}
                  </div>
                )}
                {!useAbTest && varCount > 0 && (
                  <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                    <p className="text-xs font-semibold text-[var(--text-muted)]">
                      Variable mapping — type a literal or {'{{name}}'} / {'{{phone}}'} /{' '}
                      {'{{attr.city}}'}
                    </p>
                    {/* Meta rejects an empty parameter and fails the whole
                        message, and most imported contacts have no name — so the
                        fallback form is spelled out here rather than left to be
                        discovered from a wall of failed recipients. */}
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Add a fallback after a pipe — {'{{name|there}}'} — for anyone whose value is
                      missing. Imported columns are available as {'{{attr.<column>}}'}.
                    </p>
                    {Array.from({ length: varCount }, (_, i) => {
                      const sample = examples?.body[String(i + 1)];
                      return (
                        <Input
                          key={i}
                          label={`{{${i + 1}}}`}
                          value={mapping[i] ?? ''}
                          onChange={(e) =>
                            setMapping((p) => {
                              const next = [...p];
                              next[i] = e.target.value;
                              return next;
                            })
                          }
                          placeholder="{{name|there}}"
                          helperText={sample ? `Approved example: ${sample}` : undefined}
                        />
                      );
                    })}
                    {riskyMapping.length > 0 && (
                      <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                        {riskyMapping.join(', ')} has no fallback. Any recipient missing that value
                        gets an empty parameter, which Meta refuses — that message fails. Write it
                        as {'{{name|there}}'} to be safe.
                      </p>
                    )}
                  </div>
                )}
                {/* A broadcast reaches the whole audience at once, so a
                    transposed mapping is unrecoverable — show the finished
                    message before the draft is even created. */}
                {!useAbTest && (
                  <TemplatePreviewBubble
                    template={selected}
                    values={{
                      bodyParams: previewMapping.map(resolveSampleToken),
                      headerText: templateParams.headerText,
                      headerMediaUrl: templateParams.headerMediaUrl,
                      // The pin as typed, so a location template previews as the
                      // recipient will see it rather than as a bare bubble.
                      headerLocation: { name: placeName, address: placeAddress },
                      buttonUrlParams: templateParams.buttonUrlParams,
                      ltoExpirationMs: templateParams.ltoExpirationMs,
                      carouselCards: templateParams.carouselCards,
                    }}
                    note={usesSampleContact(previewMapping) ? SAMPLE_CONTACT_NOTE : undefined}
                  />
                )}
              </>
            )}
          </div>
        </Card>

        {isSequence && (
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[var(--text)]">Sequence steps</h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Steps run in order. Each step waits its delay, then sends only if its condition
                  holds. The delay on step 1 is counted from launch — leave it at 0 to send the
                  moment the campaign starts.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={addStep}
              >
                Add step
              </Button>
            </div>
            <div className="space-y-3">
              {steps.map((step, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--text-muted)]">
                      Step {i + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveStep(i, -1)}
                        disabled={i === 0}
                        className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"
                        aria-label="Move step up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(i, 1)}
                        disabled={i === steps.length - 1}
                        className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"
                        aria-label="Move step down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStep(i)}
                        disabled={steps.length === 1}
                        className="rounded p-1 text-[var(--error)] hover:opacity-80 disabled:opacity-30"
                        aria-label="Remove step"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="sm:col-span-2 lg:col-span-1">
                      <TemplatePicker
                        label="Template"
                        value={step.templateId}
                        onChange={(t) =>
                          updateStep(i, {
                            templateId: t?.id ?? '',
                            template: t,
                            // Placeholders differ per template — clear rather
                            // than send the old values in the new slots.
                            variableMapping: [],
                          })
                        }
                      />
                    </div>
                    <Input
                      label="Delay (hours)"
                      type="number"
                      min={0}
                      value={step.delayHours}
                      onChange={(e) => updateStep(i, { delayHours: e.target.value })}
                      helperText={i === 0 ? 'Counted from launch' : 'After the previous step'}
                    />
                    <Select
                      label="Condition"
                      options={CONDITION_OPTIONS}
                      value={step.condition}
                      onChange={(v) =>
                        updateStep(i, { condition: v as WaSequenceStep['condition'] })
                      }
                      clearable={false}
                    />
                  </div>
                  {(() => {
                    // Per-step template parameters. A drip step used to send NO
                    // parameters, so a step whose template had {{n}} placeholders went
                    // out blank — or was rejected by Meta when they were required.
                    const stepTpl = step.templateId ? (step.template ?? null) : null;
                    const stepSpec = stepTpl ? analyzeTemplate(stepTpl) : null;
                    const n = stepSpec?.bodyPositional ?? 0;
                    if (!stepTpl) return null;
                    const stepMapping = Array.from(
                      { length: n },
                      (_, vi) => step.variableMapping?.[vi] ?? '',
                    );
                    return (
                      <>
                        {n > 0 && (
                          <div className="mt-3 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
                            <p className="text-xs font-semibold text-[var(--text-muted)]">
                              Step {i + 1} variables — a literal, or {'{{name|there}}'} /{' '}
                              {'{{phone}}'} / {'{{attr.city}}'}
                            </p>
                            {Array.from({ length: n }, (_, vi) => (
                              <Input
                                key={vi}
                                label={`{{${vi + 1}}}`}
                                value={step.variableMapping?.[vi] ?? ''}
                                placeholder="{{name|there}}"
                                onChange={(e) => {
                                  const next = [...(step.variableMapping ?? [])];
                                  next[vi] = e.target.value;
                                  updateStep(i, { variableMapping: next });
                                }}
                              />
                            ))}
                          </div>
                        )}
                        <TemplatePreviewBubble
                          className="mt-3"
                          template={stepTpl}
                          values={{ bodyParams: stepMapping.map(resolveSampleToken) }}
                          note={usesSampleContact(stepMapping) ? SAMPLE_CONTACT_NOTE : undefined}
                        />
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <h2 className="mb-4 text-base font-semibold text-[var(--text)]">Audience</h2>
          <Select
            label="Audience source"
            options={[
              { value: 'segment', label: 'Segment (existing contacts)' },
              { value: 'upload', label: 'Upload phone numbers' },
            ]}
            value={audienceType}
            onChange={setAudienceType}
          />
          {audienceType === 'segment' ? (
            <div className="mt-4 space-y-4">
              <div>
                <Select
                  label="Use saved segment (optional)"
                  options={segmentOptions}
                  value={segmentId}
                  onChange={setSegmentId}
                  searchable={segmentOptions.length > 6}
                  placeholder={
                    segments.length
                      ? 'No saved segment — use inline filters below'
                      : 'No saved segments yet'
                  }
                />
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Pick a saved segment to drive the audience from its stored filter. Clear it to use
                  the inline tag / opt-in filters instead.
                </p>
              </div>
              {usingSavedSegment ? (
                <div className="border-primary rounded-lg border bg-[var(--primary-light)] p-3">
                  <p className="text-sm font-semibold text-[var(--text)]">
                    Audience driven by segment:{' '}
                    {segments.find((s) => s.id === segmentId)?.name ?? segmentId}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    The segment’s saved filter selects the recipients. The inline tag and opt-in
                    filters are ignored while a segment is active.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Tags (comma-separated, any match)"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="leads, mumbai"
                  />
                  <Select
                    label="Opt-in status"
                    options={[
                      { value: '', label: 'Any' },
                      { value: 'OPTED_IN', label: 'Opted in' },
                      { value: 'UNKNOWN', label: 'Unknown' },
                    ]}
                    value={optInStatus}
                    onChange={setOptInStatus}
                  />
                </div>
              )}
              {!usingSavedSegment && (
                <div className="border-t border-[var(--border)] pt-4">
                  <SegmentRulesBuilder
                    rules={rules}
                    op={ruleOp}
                    onChange={setRules}
                    onOpChange={setRuleOp}
                    campaignOptions={campaignOptions}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-[var(--text-muted)]">
                  Upload a CSV, Excel (.xlsx), JSON or vCard file, or paste the numbers below — both
                  fill the same list, and nothing is saved as a contact.
                </p>
                <input
                  ref={phoneFileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.json,.vcf,text/csv,application/json,text/vcard"
                  onChange={onPhoneFile}
                  className="hidden"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<FileUp className="h-4 w-4" />}
                  isLoading={parsingPhoneFile}
                  onClick={() => phoneFileRef.current?.click()}
                >
                  Upload a file
                </Button>
              </div>
              <Textarea
                label="Phone numbers (one per line, with country code)"
                value={phones}
                onChange={(e) => setPhones(e.target.value)}
                rows={6}
                placeholder={'+919876543210\n+14155550123'}
              />
              {/* The list rides inside the JSON body, so it is capped server-side.
                  An over-large paste used to come back as a bare 413 rendered as
                  "Failed to create campaign" — no number, nothing to act on. */}
              <p
                className={cn(
                  'mt-1.5 text-xs',
                  overPhoneCap || overPayloadCap
                    ? 'text-[var(--error)]'
                    : 'text-[var(--text-muted)]',
                )}
              >
                {pastedPhoneCount.toLocaleString('en-IN')}{' '}
                {pastedPhoneCount === 1 ? 'number' : 'numbers'}
                {/* Only an uploaded file brings columns, and they are what push a
                    body past the limit — so the size is on screen as soon as
                    there are any, rather than being discovered by a failed
                    submit. */}
                {uploadPayloadBytes > 0 && ` · ${formatFileSize(uploadPayloadBytes)} of columns`} ·{' '}
                {overPhoneCap
                  ? `over the ${WA_UPLOAD_PHONE_MAX.toLocaleString('en-IN')} limit — split the list across campaigns, or import the numbers as contacts and target them with a segment`
                  : overPayloadCap
                    ? `over the ${formatFileSize(WA_UPLOAD_PAYLOAD_MAX_BYTES)} the API accepts — upload a file with fewer columns, or split the list across campaigns`
                    : `max ${WA_UPLOAD_PHONE_MAX.toLocaleString('en-IN')}`}
              </p>
            </div>
          )}
          {/* LIVE AUDIENCE SIZE + COST.
              The count was only reachable after the draft existed, so the
              operator picked tags and an opt-in status blind, submitted, and only
              then learned whether this was three people or three hundred
              thousand — and the edit modal cannot change audience fields, so
              fixing it meant starting again. */}
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            {!canPreviewAudience ? (
              <p className="text-xs text-[var(--text-muted)]">
                Pick a template and an audience to see how many people this reaches and what it will
                cost.
              </p>
            ) : previewQuery.isPending ? (
              <p className="text-xs text-[var(--text-muted)]">Counting the audience…</p>
            ) : previewQuery.isError ? (
              <p className="text-xs text-[var(--error)]">
                Could not size this audience —{' '}
                {(previewQuery.error as unknown as ApiError)?.message ?? 'try again'}.
              </p>
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="text-sm font-semibold text-[var(--text)]">
                  {(previewQuery.data?.data?.count ?? 0).toLocaleString('en-IN')} eligible recipient
                  {previewQuery.data?.data?.count === 1 ? '' : 's'}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  estimated cost ₹
                  {((previewQuery.data?.data?.estimatedCostPaise ?? 0) / 100).toLocaleString(
                    'en-IN',
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                  )}
                </p>
                {previewQuery.data?.data?.exceedsTier && (
                  <p className="flex items-center gap-1 text-xs text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    larger than today’s remaining Meta allowance — it will spread over several days
                  </p>
                )}
                {(previewQuery.data?.data?.blankVariables ?? []).map((v) => (
                  <p key={v.index} className="text-xs text-amber-700">
                    {v.blankCount.toLocaleString('en-IN')} of them resolve {`{{${v.index}}}`} (
                    {v.token}) to nothing — Meta fails the whole message on an empty parameter
                  </p>
                ))}
              </div>
            )}
          </div>
          {dailyTierLimit !== null && (
            <p
              className={cn(
                'mt-4 flex items-start gap-1.5 text-xs',
                overTier ? 'text-amber-700' : 'text-[var(--text-muted)]',
              )}
            >
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                This number’s Meta messaging tier allows {dailyTierLimit.toLocaleString('en-IN')}{' '}
                new contacts every 24 hours
                {overTier
                  ? ` — the ${pastedPhoneCount.toLocaleString('en-IN')} numbers above will go out over about ${Math.ceil(pastedPhoneCount / dailyTierLimit)} days.`
                  : '; a bigger audience is sent over consecutive days rather than failing at Meta.'}
              </span>
            </p>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold text-[var(--text)]">Schedule</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Throttle (messages/sec)"
              type="number"
              value={throttle}
              onChange={(e) => setThrottle(e.target.value)}
            />
            <DatePicker
              label="Schedule for (optional)"
              mode="datetime"
              value={scheduledAt}
              onChange={setScheduledAt}
            />
            <Input
              label="Re-run every N days (0 = one-off)"
              type="number"
              min={0}
              value={recurrenceDays}
              onChange={(e) => setRecurrenceDays(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="mt-4">
            <Switch
              label="Only send during business hours"
              description="Holds this campaign (and its drip steps) outside the business hours set in WhatsApp settings, releasing it when the next window opens. Recipients stay queued — nobody is dropped."
              checked={respectBusinessHours}
              onChange={(e) => setRespectBusinessHours(e.target.checked)}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Leave the schedule empty to create a plain <strong>draft</strong> you launch manually. A
            future date/time auto-launches the campaign at that moment — no need to return to the
            detail page. Set <strong>re-run every N days</strong> to repeat the campaign on a fixed
            cadence (leave 0 for a one-off). Keep the throttle within your Meta tier. Blocked and
            (for marketing) opted-out contacts are automatically excluded.
          </p>
        </Card>
      </div>
    </DashboardLayout>
  );
}

/**
 * Resolves `?edit=<id>` into the campaign (and its template) before the form is
 * mounted at all.
 *
 * The form seeds every input from these on first render, so it must not mount
 * until they are here — hence the hold below rather than a prefill effect. The
 * `key` remounts the form when switching between creating and editing, so no
 * value can survive from one to the other.
 */
function CampaignFormLoader() {
  const editId = useSearchParams().get('edit');

  const { data: campaignData, isError: campaignFailed } = useQuery({
    queryKey: ['wa-campaign', editId],
    queryFn: () => svc.getCampaign(String(editId)),
    enabled: Boolean(editId),
  });
  const initial = campaignData?.data ?? null;

  // The campaign row carries the template's name and category but not its
  // components, and the components are what say which parameters to ask for.
  const { data: templateData, isError: templateFailed } = useQuery({
    queryKey: ['wa-template', initial?.templateId],
    queryFn: () => svc.getTemplate(String(initial?.templateId)),
    enabled: Boolean(initial?.templateId),
  });

  const waiting =
    Boolean(editId) &&
    !campaignFailed &&
    !templateFailed &&
    (!initial || (Boolean(initial.templateId) && !templateData?.data));

  if (waiting) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading campaign…
        </div>
      </DashboardLayout>
    );
  }

  return (
    <CampaignForm
      key={editId ?? 'new'}
      editId={editId}
      initial={initial}
      initialTemplate={templateData?.data ?? null}
    />
  );
}

/**
 * Suspense boundary for `useSearchParams`.
 *
 * The form reads `?edit=<id>` to decide whether it is creating or editing, and
 * Next refuses to prerender a page that reads search params outside a boundary.
 */
export default function NewCampaignPage() {
  return (
    <Suspense fallback={null}>
      <CampaignFormLoader />
    </Suspense>
  );
}
