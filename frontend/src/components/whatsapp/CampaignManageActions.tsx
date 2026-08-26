'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Copy, Save, Send, CalendarClock, FileUp, Pencil } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import { showToast } from '@/components/ui/Toast';
import {
  describePhoneImport,
  mergePhoneLines,
  normalizeForDedupe,
  parseContactsFile,
} from '@/lib/parse-contacts';
import { WA_UPLOAD_PAYLOAD_MAX_BYTES } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { formatFileSize } from '@/lib/utils';
import { whatsappService as svc } from '@/services/whatsapp.service';
import TemplatePicker from '@/components/whatsapp/TemplatePicker';
import { analyzeTemplate, type TemplateVarSpec } from '@/lib/whatsapp-template-vars';
import type { WaCampaign, WaSegmentFilter, WaTemplate } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

/** ISO → value for an <input type="datetime-local"> (in the viewer's local tz). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** The stored audience filter: tags/opt-in for a segment, phones for an upload. */
interface AudienceFilter {
  tags?: unknown;
  optInStatus?: unknown;
  phones?: unknown;
  /** The personalised upload shape — `phones` plus the columns a file carried. */
  recipients?: unknown;
}

/** The columns one uploaded row carried, keyed by the number's dedupe identity. */
type UploadColumns = Record<string, { name?: string; vars?: Record<string, string> }>;

/**
 * Read an uploaded audience out of either stored shape.
 *
 * A campaign created since per-recipient columns existed stores
 * `recipients: [{ phone, name?, vars? }]` where an older one stores
 * `phones: string[]`, and this modal knew only the older one: the textarea opened
 * EMPTY for a personalised campaign, the save guard then refused it for having no
 * numbers, and so its name, schedule and throttle could not be changed at all.
 * Reading both — and writing the columns back untouched — is what keeps such a
 * campaign editable without flattening it into a bare number list.
 */
function uploadedAudience(filter: AudienceFilter): { lines: string[]; columns: UploadColumns } {
  if (Array.isArray(filter.recipients)) {
    const lines: string[] = [];
    const columns: UploadColumns = {};
    for (const raw of filter.recipients) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as { phone?: unknown; name?: unknown; vars?: unknown };
      const phone = typeof row.phone === 'string' ? row.phone.trim() : '';
      if (!phone) continue;
      lines.push(phone);
      const name = typeof row.name === 'string' && row.name ? row.name : undefined;
      const vars =
        row.vars && typeof row.vars === 'object' && !Array.isArray(row.vars)
          ? (row.vars as Record<string, string>)
          : undefined;
      if (!name && !(vars && Object.keys(vars).length)) continue;
      columns[normalizeForDedupe(phone)] = {
        ...(name ? { name } : {}),
        ...(vars && Object.keys(vars).length ? { vars } : {}),
      };
    }
    return { lines, columns };
  }
  return { lines: asStrings(filter.phones), columns: {} };
}

/** `audienceFilter` / `variableMapping` are Json columns typed `unknown` — narrow defensively. */
const asFilter = (v: unknown): AudienceFilter =>
  v && typeof v === 'object' ? (v as AudienceFilter) : {};
const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** No template picked (or the approved list hasn't loaded) → nothing to fill in. */
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

const OPT_IN_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'OPTED_IN', label: 'Opted in' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

/**
 * Everything the edit modal can change, held as the strings the inputs bind to —
 * plus `uploadColumns`, which no input binds to: it is the personalisation the
 * uploaded list arrived with, carried through the edit so that correcting a
 * schedule does not silently strip every recipient's order id.
 */
interface EditDraft {
  name: string;
  description: string;
  templateId: string;
  mapping: string[];
  audienceType: string;
  segmentId: string;
  tags: string;
  optInStatus: string;
  phones: string;
  uploadColumns: UploadColumns;
  scheduledAt: string;
  throttle: string;
  batch: string;
  recurrenceDays: string;
}

function draftFrom(c: WaCampaign): EditDraft {
  const filter = asFilter(c.audienceFilter);
  const uploaded = uploadedAudience(filter);
  return {
    name: c.name,
    description: c.description ?? '',
    templateId: c.templateId,
    mapping: asStrings(c.variableMapping),
    audienceType: c.audienceType,
    // A saved segment is never stored on the campaign — the API resolves it into
    // audienceFilter at write time — so the picker starts empty and only
    // re-applies a segment when the operator picks one.
    segmentId: '',
    tags: asStrings(filter.tags).join(', '),
    optInStatus: typeof filter.optInStatus === 'string' ? filter.optInStatus : '',
    phones: uploaded.lines.join('\n'),
    uploadColumns: uploaded.columns,
    scheduledAt: toLocalInput(c.scheduledAt),
    throttle: String(c.throttlePerSec ?? 15),
    batch: String(c.batchSize ?? 100),
    recurrenceDays: c.recurrenceDays ? String(c.recurrenceDays) : '',
  };
}

/**
 * Per-campaign management actions: Edit/Reschedule (DRAFT/SCHEDULED only),
 * Duplicate (→ editable draft), Save-as-template (reusable blueprint), and
 * Test-send (preview-to-self).
 */
export default function CampaignManageActions({
  campaign,
  onChanged,
}: {
  campaign: WaCampaign;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const editable = campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED';

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<EditDraft>(() => draftFrom(campaign));
  const set = <K extends keyof EditDraft>(key: K, value: EditDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Same file-upload path as the campaign wizard: the parsed numbers are merged
  // into the draft's phone text, so an audience can be corrected from a file
  // without pasting thousands of lines back into the box by hand.
  const phoneFileRef = useRef<HTMLInputElement>(null);
  const [parsingPhoneFile, setParsingPhoneFile] = useState(false);

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
      const merge = mergePhoneLines(draft.phones, parsed.rows);
      // The columns the file brought, keyed by the number's identity — the merge
      // dedupes on that same key, so a number already on the list under another
      // format keeps its line and still picks up the file's columns.
      setDraft((d) => {
        const next = { ...d.uploadColumns };
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
        return { ...d, phones: merge.text, uploadColumns: next };
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

  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState(campaign.name);

  const [testOpen, setTestOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  // Which A/B template to preview, and whose data to render it with. The test
  // send used to be the base template with NO parameters at all — the one message
  // no recipient of an A/B campaign ever receives, and a hard Meta rejection for
  // any template that has variables.
  const [testVariantId, setTestVariantId] = useState('');
  const [testContactId, setTestContactId] = useState('');

  // The campaign's variants, so the reviewer can pick which one to receive.
  // Fetched only while the test modal is open.
  const { data: variantData } = useQuery({
    queryKey: ['wa-campaign-variants', campaign.id],
    queryFn: () => svc.getCampaignVariants(campaign.id),
    enabled: testOpen && campaign.isAbTest === true,
  });
  const testVariants = variantData?.data ?? [];
  const variantOptions = testVariants.map((v, i) => ({
    value: v.id ?? '',
    label: v.label || `Variant ${String.fromCharCode(65 + i)}`,
  }));

  // Contacts to personalise against. Leaving it blank uses the test number's own
  // contact row, which is what a real recipient with that data would get.
  const { data: contactData } = useQuery({
    queryKey: ['wa-contacts', 'test-send'],
    queryFn: () => svc.listContacts({ limit: 100 }),
    enabled: testOpen,
  });
  const contactOptions = (contactData?.data?.items ?? []).map((ct) => ({
    value: ct.id,
    label: ct.name ? `${ct.name} · ${ct.phone}` : ct.phone,
  }));

  // Saved segments, fetched only once the modal is open. The template itself is
  // not fetched as a list at all any more: the picker below searches server-side,
  // so a WABA with more approved templates than one page could hold no longer
  // hides the rest of them from this form.
  const { data: segmentData } = useQuery({
    queryKey: ['wa-segments'],
    queryFn: () => svc.listSegments(),
    enabled: editOpen,
  });
  const segments = segmentData?.data ?? [];
  const segmentOptions = segments.map((s) => ({ value: s.id, label: s.name }));

  // Whatever the picker last handed back — either the operator's pick or the
  // draft's stored id resolved into a full template. Guarded on the id so a
  // stale object never describes the template currently in the draft.
  const [pickedTpl, setPickedTpl] = useState<WaTemplate | null>(null);
  const selectedTpl = pickedTpl && pickedTpl.id === draft.templateId ? pickedTpl : null;
  const spec = selectedTpl ? analyzeTemplate(selectedTpl) : EMPTY_SPEC;
  const varCount = spec.bodyPositional;
  // An A/B broadcast takes its templates from the weighted variants and a drip
  // campaign from its steps; both have their own editors on the detail page, so
  // editing the campaign's base template here would only desync them.
  const canEditTemplate = !campaign.isAbTest && campaign.type !== 'SEQUENCE';
  // Only write the message fields once the picker has resolved the draft's
  // template: until then `spec` is the empty spec and varCount is 0, so saving
  // would send variableMapping: [] and wipe a mapping nobody touched.
  const canWriteTemplate = canEditTemplate && !!selectedTpl;
  // A saved segment only applies to the "segment" audience source.
  const usingSavedSegment = draft.audienceType === 'segment' && !!draft.segmentId;
  // 'manual' is API-legal but the wizard never creates it — offer it only so an
  // existing manual campaign round-trips instead of being silently re-typed.
  const audienceOptions = [
    { value: 'segment', label: 'Segment (existing contacts)' },
    { value: 'upload', label: 'Upload phone numbers' },
    ...(campaign.audienceType === 'manual' ? [{ value: 'manual', label: 'Manual list' }] : []),
  ];

  // The detail page polls the campaign every 5s, so seeding the form only at
  // mount would edit whatever the record looked like when the page loaded and
  // write those stale values back. Re-seed each time the modal opens.
  const openEdit = () => {
    setDraft(draftFrom(campaign));
    setEditOpen(true);
  };

  const dupMut = useMutation({
    mutationFn: () => svc.duplicateCampaign(campaign.id),
    onSuccess: (res) => {
      showToast.success('Duplicated to a new draft');
      const newId = res.data?.id;
      if (newId) router.push(`/whatsapp/campaigns/${newId}`);
      onChanged?.();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Duplicate failed'),
  });

  /**
   * The uploaded audience as it will be stored.
   *
   * `recipients` only when a line actually has columns, so an audience that never
   * had any keeps travelling as the older `phones` array — and one that did keeps
   * its personalisation instead of being flattened by an unrelated edit.
   */
  const uploadAudienceFilter = (): WaSegmentFilter => {
    const lines = draft.phones
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const columnsFor = (line: string) => draft.uploadColumns[normalizeForDedupe(line)];
    if (!lines.some((line) => columnsFor(line))) return { phones: lines };
    return { recipients: lines.map((line) => ({ phone: line, ...(columnsFor(line) ?? {}) })) };
  };

  const editMut = useMutation({
    mutationFn: () => {
      const recurrence = Math.max(0, parseInt(draft.recurrenceDays, 10) || 0);
      // A saved segment drives the audience server-side (the API copies its
      // stored filter), so send segmentId instead of an inline filter.
      const audience = usingSavedSegment
        ? { segmentId: draft.segmentId }
        : {
            audienceType: draft.audienceType,
            audienceFilter:
              draft.audienceType === 'segment'
                ? {
                    // Carried through from what was stored. This dialog has
                    // inputs for tags and opt-in only, and rebuilding the filter
                    // from those two ERASED the rest of it: an audience defined
                    // with advanced rules ("tagged mumbai AND premium",
                    // "messaged us in the last 30 days") lost every rule the
                    // moment someone corrected the schedule here, silently
                    // widening the send to the whole tag.
                    ...asFilter(campaign.audienceFilter),
                    tags: draft.tags
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                    optInStatus: draft.optInStatus || undefined,
                    // Owned by the upload branch, never by a segment audience.
                    phones: undefined,
                    recipients: undefined,
                  }
                : uploadAudienceFilter(),
          };
      return svc.updateCampaign(campaign.id, {
        name: draft.name.trim() || undefined,
        description: draft.description.trim() || null,
        ...(canWriteTemplate
          ? {
              templateId: draft.templateId,
              // Always sent — as [] when the template has no {{n}} — so swapping
              // to a template with fewer variables drops the leftovers. A stale
              // longer mapping would go out as extra body parameters and Meta
              // rejects the whole send with a parameter-count mismatch.
              variableMapping: Array.from({ length: varCount }, (_, i) => draft.mapping[i] || ''),
            }
          : {}),
        ...audience,
        scheduledAt: draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : null,
        throttlePerSec: Number(draft.throttle) || undefined,
        batchSize: Number(draft.batch) || undefined,
        // null — not 0 — turns a recurrence off; the API only accepts 1-365.
        recurrenceDays: recurrence > 0 ? recurrence : null,
      });
    },
    onSuccess: () => {
      showToast.success('Campaign updated');
      setEditOpen(false);
      onChanged?.();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Update failed'),
  });

  const submitEdit = () => {
    if (!draft.name.trim()) return showToast.error('Campaign name is required');
    if (canEditTemplate) {
      if (!draft.templateId) return showToast.error('Pick an approved template');
      if (spec.bodyNamed.length > 0)
        return showToast.error(
          'This template uses named variables, which campaigns cannot personalise. Use a template with {{1}} style variables.',
        );
      // A carousel needs one image and one text value per card, and this form has
      // nowhere to put them — it edits the audience, the schedule and the body
      // mapping only. Saving the swap would produce a campaign that can never
      // launch, so point at the wizard, which does collect them.
      if (spec.carouselCards.length > 0 && draft.templateId !== campaign.templateId)
        return showToast.error(
          'Carousel templates need per-card media, which this form cannot set. Create the campaign in the wizard instead.',
        );
    }
    // 'upload' and 'manual' both resolve their audience from the phone list, so
    // saving an empty one would leave the campaign with zero recipients.
    if (draft.audienceType !== 'segment' && !draft.phones.trim())
      return showToast.error('Add phone numbers for the upload audience');
    // The columns are what make an audience body big, and an over-large one can
    // only come back as a 413 this modal would render as "Update failed".
    if (draft.audienceType !== 'segment') {
      const recipients = uploadAudienceFilter().recipients;
      const bytes = recipients ? new TextEncoder().encode(JSON.stringify(recipients)).length : 0;
      if (bytes > WA_UPLOAD_PAYLOAD_MAX_BYTES)
        return showToast.error(
          `The columns on this list come to ${formatFileSize(bytes)}, over the ${formatFileSize(WA_UPLOAD_PAYLOAD_MAX_BYTES)} the API accepts — upload a file with fewer columns, or split the list across campaigns`,
        );
    }
    editMut.mutate();
  };

  const tplMut = useMutation({
    mutationFn: () => svc.saveCampaignAsTemplate(campaign.id, tplName.trim() || undefined),
    onSuccess: () => {
      showToast.success('Saved as a reusable template');
      setTplOpen(false);
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Save failed'),
  });

  const testMut = useMutation({
    mutationFn: () =>
      svc.testSendCampaign(campaign.id, testPhone.trim(), {
        ...(testVariantId ? { variantId: testVariantId } : {}),
        ...(testContactId ? { contactId: testContactId } : {}),
      }),
    onSuccess: () => {
      showToast.success('Test message sent');
      setTestOpen(false);
      setTestPhone('');
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Test send failed'),
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* The full editor. This dialog can only reach name, audience, schedule
            and throughput; every TEMPLATE parameter — header media, coupon code,
            offer expiry, product SKUs, carousel cards — lives on the campaign
            form, so a campaign whose launch failed for a missing header could
            not be repaired from here at all. Rather than duplicate ~380 lines of
            inputs and let the two drift, the form itself does both jobs. */}
        {editable && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Pencil className="h-4 w-4" />}
            onClick={() =>
              router.push(`${ROUTES.SUPER_ADMIN.WHATSAPP_CAMPAIGN_NEW}?edit=${campaign.id}`)
            }
          >
            Edit campaign
          </Button>
        )}
        {editable && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<CalendarClock className="h-4 w-4" />}
            onClick={openEdit}
          >
            Quick reschedule
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Copy className="h-4 w-4" />}
          isLoading={dupMut.isPending}
          onClick={() => dupMut.mutate()}
        >
          Duplicate
        </Button>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Save className="h-4 w-4" />}
          onClick={() => setTplOpen(true)}
        >
          Save as template
        </Button>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Send className="h-4 w-4" />}
          onClick={() => setTestOpen(true)}
        >
          Test send
        </Button>
      </div>

      <Modal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit campaign"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button isLoading={editMut.isPending} onClick={submitEdit}>
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="space-y-3">
            <Input label="Name" value={draft.name} onChange={(e) => set('name', e.target.value)} />
            <Input
              label="Description (optional)"
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <p className="text-sm font-semibold text-[var(--text)]">Message</p>
            {canEditTemplate ? (
              <>
                <TemplatePicker
                  label="Template (approved only)"
                  value={draft.templateId}
                  onChange={(tpl) => {
                    setPickedTpl(tpl);
                    // A different template has a different placeholder count, so
                    // a carried-over mapping would fill the wrong slots.
                    setDraft((d) => ({ ...d, templateId: tpl?.id ?? '', mapping: [] }));
                  }}
                  // Resolving the id the draft arrived with must NOT clear the
                  // mapping — that is the campaign's stored one, not a new pick.
                  onResolve={setPickedTpl}
                />
                {!!selectedTpl && selectedTpl.status !== 'APPROVED' && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    This campaign&apos;s current template is {selectedTpl.status.toLowerCase()} at
                    Meta, not approved — it cannot be sent. Pick another one before launching.
                  </p>
                )}
                {(spec.headerNeedsMedia ||
                  spec.headerHasTextVar ||
                  spec.buttonUrlVar ||
                  spec.needsProductSections ||
                  spec.needsProduct) && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    This template also needs send-time parameters (header media, header text, a
                    dynamic URL-button value or the products it shows). Those are set when the
                    campaign is created — build a new campaign if this one&apos;s stored values no
                    longer match.
                  </p>
                )}
                {varCount > 0 && (
                  <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                    <p className="text-xs font-semibold text-[var(--text-muted)]">
                      Variable mapping — type a literal or {'{{name}}'} / {'{{phone}}'}
                    </p>
                    {Array.from({ length: varCount }, (_, i) => (
                      <Input
                        key={i}
                        label={`{{${i + 1}}}`}
                        value={draft.mapping[i] ?? ''}
                        onChange={(e) =>
                          setDraft((d) => {
                            const next = [...d.mapping];
                            next[i] = e.target.value;
                            return { ...d, mapping: next };
                          })
                        }
                        placeholder="{{name}}"
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                {campaign.type === 'SEQUENCE'
                  ? 'This is a drip sequence — edit its templates and per-step variables in the Sequence steps panel below.'
                  : 'This is an A/B test — edit its templates and per-variant variables in the A/B variants panel below.'}
              </p>
            )}
          </div>

          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <p className="text-sm font-semibold text-[var(--text)]">Audience</p>
            <Select
              label="Audience source"
              options={audienceOptions}
              value={draft.audienceType}
              onChange={(v) => set('audienceType', v)}
              clearable={false}
            />
            {draft.audienceType === 'segment' ? (
              <>
                <div>
                  <Select
                    label="Apply a saved segment (optional)"
                    options={segmentOptions}
                    value={draft.segmentId}
                    onChange={(v) => set('segmentId', v)}
                    searchable={segmentOptions.length > 6}
                    placeholder={
                      segments.length ? 'Keep the inline filters below' : 'No saved segments yet'
                    }
                  />
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Picking a segment copies its saved filter onto this campaign and replaces the
                    inline tag / opt-in filters.
                  </p>
                </div>
                {usingSavedSegment ? (
                  <div className="border-primary rounded-lg border bg-[var(--primary-light)] p-3">
                    <p className="text-sm font-semibold text-[var(--text)]">
                      Audience will be replaced by segment:{' '}
                      {segments.find((s) => s.id === draft.segmentId)?.name ?? draft.segmentId}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      Clear the segment to keep editing the inline tag and opt-in filters instead.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Tags (comma-separated, any match)"
                      value={draft.tags}
                      onChange={(e) => set('tags', e.target.value)}
                      placeholder="leads, mumbai"
                    />
                    <Select
                      label="Opt-in status"
                      options={OPT_IN_OPTIONS}
                      value={draft.optInStatus}
                      onChange={(v) => set('optInStatus', v)}
                    />
                  </div>
                )}
              </>
            ) : (
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-[var(--text-muted)]">
                    Upload a CSV, Excel (.xlsx), JSON or vCard file, or paste the numbers below.
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
                  value={draft.phones}
                  onChange={(e) => set('phones', e.target.value)}
                  rows={6}
                  placeholder={'+919876543210\n+14155550123'}
                />
                {/* The columns are invisible in a box of phone numbers, so say
                    they are there: otherwise deleting a line reads as removing one
                    recipient rather than also dropping the order id the template’s
                    {{attr.…}} token resolves from. */}
                {Object.keys(draft.uploadColumns).length > 0 && (
                  <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                    {Object.keys(draft.uploadColumns).length.toLocaleString('en-IN')} of these
                    numbers carry personalisation columns from the uploaded file — they are kept as
                    they are, and a line you delete takes its columns with it.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <p className="text-sm font-semibold text-[var(--text)]">Schedule</p>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text)]">
                Scheduled time (empty = draft / send now)
              </label>
              <DatePicker
                mode="datetime"
                value={draft.scheduledAt}
                onChange={(v) => set('scheduledAt', v)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Throttle (msg/sec)"
                type="number"
                value={draft.throttle}
                onChange={(e) => set('throttle', e.target.value)}
              />
              <Input
                label="Batch size"
                type="number"
                value={draft.batch}
                onChange={(e) => set('batch', e.target.value)}
              />
              <Input
                label="Re-run every N days"
                type="number"
                min={0}
                value={draft.recurrenceDays}
                onChange={(e) => set('recurrenceDays', e.target.value)}
                placeholder="0"
              />
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Clearing the schedule returns the campaign to a plain draft. Set{' '}
              <strong>re-run every N days</strong> to repeat it on a fixed cadence, or 0 to turn an
              existing recurrence off.
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={tplOpen}
        onClose={() => setTplOpen(false)}
        title="Save as reusable template"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTplOpen(false)}>
              Cancel
            </Button>
            <Button isLoading={tplMut.isPending} onClick={() => tplMut.mutate()}>
              Save template
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-muted)]">
            Saves this campaign&apos;s message template, audience and settings as a blueprint you
            can re-launch in one click.
          </p>
          <Input
            label="Template name"
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        isOpen={testOpen}
        onClose={() => setTestOpen(false)}
        title="Send a test message"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTestOpen(false)}>
              Cancel
            </Button>
            <Button
              isLoading={testMut.isPending}
              disabled={!testPhone.trim()}
              onClick={() => testMut.mutate()}
            >
              Send test
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            Sends the campaign&apos;s real message — variables resolved, header and button
            parameters included — to a phone of your choice (E.164, e.g. +9198…) so you can see
            exactly what recipients will get.
          </p>
          <Input
            label="Phone number"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="+91…"
          />
          {campaign.isAbTest && variantOptions.length > 0 && (
            <Select
              label="Variant"
              options={variantOptions}
              value={testVariantId}
              onChange={setTestVariantId}
              placeholder={variantOptions[0].label}
            />
          )}
          <Select
            label="Personalise as (optional)"
            options={contactOptions}
            value={testContactId}
            onChange={setTestContactId}
            searchable={contactOptions.length > 6}
            placeholder={"The test number's own contact record"}
          />
          <p className="text-xs text-[var(--text-muted)]">
            The test number is tagged <code>test</code> in Contacts so it can be told apart from a
            real recipient.
          </p>
        </div>
      </Modal>
    </>
  );
}
