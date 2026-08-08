'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Send, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import Button from '@/components/ui/Button';
import Switch from '@/components/ui/Switch';
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';
import { superAdminWhatsappService as svc } from '@/services/super-admin-whatsapp.service';
import CampaignVariantBuilder, {
  type VariantDraft,
} from '@/components/super-admin/whatsapp/CampaignVariantBuilder';
import type { WaTemplate, WaSequenceStep } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

type CampaignType = 'BROADCAST' | 'SEQUENCE';

// Editable shape for the sequence builder — `stepOrder` is derived from the
// array index on submit, so the local rows only need the user-set fields.
interface StepDraft {
  templateId: string;
  delayHours: string;
  condition: WaSequenceStep['condition'];
}

const CONDITION_OPTIONS = [
  { value: 'any', label: 'Always send' },
  { value: 'no_reply', label: 'Only if no reply yet' },
  { value: 'replied', label: 'Only if they replied' },
];

function bodyVarCount(t?: WaTemplate | null): number {
  if (!t) return 0;
  const comps = Array.isArray(t.components)
    ? (t.components as Array<{ type?: string; text?: string }>)
    : [];
  const body = comps.find((c) => (c.type ?? '').toUpperCase() === 'BODY');
  if (!body?.text) return 0;
  const nums = [...body.text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

export default function NewCampaignPage() {
  const router = useRouter();
  const [campaignType, setCampaignType] = useState<CampaignType>('BROADCAST');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [audienceType, setAudienceType] = useState('segment');
  const [segmentId, setSegmentId] = useState('');
  const [tags, setTags] = useState('');
  const [optInStatus, setOptInStatus] = useState('');
  const [phones, setPhones] = useState('');
  const [mapping, setMapping] = useState<string[]>([]);
  const [throttle, setThrottle] = useState('15');
  const [scheduledAt, setScheduledAt] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>([
    { templateId: '', delayHours: '0', condition: 'any' },
  ]);
  const [isAbTest, setIsAbTest] = useState(false);
  const [variants, setVariants] = useState<VariantDraft[]>([
    { label: 'Variant A', templateId: '', weight: '50' },
    { label: 'Variant B', templateId: '', weight: '50' },
  ]);
  const [recurrenceDays, setRecurrenceDays] = useState('');

  const isSequence = campaignType === 'SEQUENCE';
  // A/B testing only applies to broadcasts (a sequence has its own multi-step flow).
  const useAbTest = isAbTest && !isSequence;

  const { data: tplData } = useQuery({
    queryKey: ['wa-templates', 'approved'],
    queryFn: () => svc.listTemplates({ status: 'APPROVED', limit: 100 }),
  });
  const templates = tplData?.data?.items ?? [];

  // Saved segments — when one is picked it drives the audience server-side
  // (backend applies the segment's stored filter), so the inline
  // tag/opt-in filters are hidden while a segment is selected.
  const { data: segmentData } = useQuery({
    queryKey: ['wa-segments'],
    queryFn: () => svc.listSegments(),
  });
  const segments = segmentData?.data ?? [];
  const segmentOptions = segments.map((s) => ({ value: s.id, label: s.name }));
  // A saved segment only applies to the "segment" audience source.
  const usingSavedSegment = audienceType === 'segment' && !!segmentId;
  const selected = templates.find((t) => t.id === templateId) ?? null;
  const varCount = bodyVarCount(selected);
  const tplOptions = templates.map((t) => ({ value: t.id, label: `${t.name} (${t.category})` }));

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
        }));
        // A saved segment drives the audience server-side, so we omit the
        // manual inline filter and pass segmentId instead.
        const audienceFilter = usingSavedSegment
          ? undefined
          : audienceType === 'segment'
            ? {
                tags: tags
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
                optInStatus: optInStatus || undefined,
              }
            : {
                phones: phones
                  .split(/\r?\n/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              };
        return svc.createCampaign({
          name: name.trim(),
          description: description.trim() || undefined,
          templateId: sequenceSteps[0].templateId,
          audienceType,
          audienceFilter,
          ...(usingSavedSegment ? { segmentId } : {}),
          throttlePerSec: parseInt(throttle, 10) || 15,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
          type: 'SEQUENCE',
          steps: sequenceSteps,
          ...recurrenceField,
        });
      }
      const audienceFilter = usingSavedSegment
        ? undefined
        : audienceType === 'segment'
          ? {
              tags: tags
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
              optInStatus: optInStatus || undefined,
            }
          : {
              phones: phones
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean),
            };
      const abFields = useAbTest
        ? {
            isAbTest: true,
            variants: variants.map((v, i) => ({
              label: v.label.trim() || `Variant ${String.fromCharCode(65 + i)}`,
              templateId: v.templateId,
              weight: Math.max(1, parseInt(v.weight, 10) || 1),
            })),
          }
        : {};
      return svc.createCampaign({
        name: name.trim(),
        description: description.trim() || undefined,
        // For an A/B broadcast the per-variant templates drive the send; use the
        // first variant's template as the campaign's base template reference.
        templateId: useAbTest ? variants[0].templateId : templateId,
        audienceType,
        audienceFilter,
        ...(usingSavedSegment ? { segmentId } : {}),
        variableMapping: useAbTest
          ? undefined
          : Array.from({ length: varCount }, (_, i) => mapping[i] || ''),
        throttlePerSec: parseInt(throttle, 10) || 15,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        type: 'BROADCAST',
        ...abFields,
        ...recurrenceField,
      });
    },
    onSuccess: (res) => {
      showToast.success(scheduledAt ? 'Campaign scheduled' : 'Campaign created as draft');
      const id = res.data?.id;
      router.push(
        id
          ? ROUTES.SUPER_ADMIN.WHATSAPP_CAMPAIGN_DETAIL(id)
          : ROUTES.SUPER_ADMIN.WHATSAPP_CAMPAIGNS,
      );
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to create campaign'),
  });

  const submit = () => {
    if (!name.trim()) return showToast.error('Campaign name is required');
    if (isSequence) {
      if (steps.length === 0) return showToast.error('Add at least one sequence step');
      if (steps.some((s) => !s.templateId))
        return showToast.error('Every sequence step needs an approved template');
    } else if (useAbTest) {
      if (variants.length < 2) return showToast.error('An A/B test needs at least two variants');
      if (variants.some((v) => !v.templateId))
        return showToast.error('Every variant needs an approved template');
    } else if (!templateId) {
      return showToast.error('Pick an approved template');
    }
    if (audienceType === 'upload' && !phones.trim())
      return showToast.error('Add phone numbers for the upload audience');
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
          <h1 className="text-2xl font-bold text-[var(--text)]">New campaign</h1>
          <Button
            leftIcon={<Send className="h-4 w-4" />}
            onClick={submit}
            isLoading={mutation.isPending}
          >
            {isSequence ? 'Create sequence draft' : 'Create draft'}
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
                  <Select
                    label="Template (approved only)"
                    options={tplOptions}
                    value={templateId}
                    onChange={(v) => {
                      setTemplateId(v);
                      setMapping([]);
                    }}
                    placeholder={
                      templates.length ? 'Select a template' : 'No approved templates — sync first'
                    }
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
                      templateOptions={tplOptions}
                      hasTemplates={templates.length > 0}
                      onChange={updateVariant}
                      onAdd={addVariant}
                      onRemove={removeVariant}
                    />
                  </div>
                )}
                {!useAbTest && varCount > 0 && (
                  <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                    <p className="text-xs font-semibold text-[var(--text-muted)]">
                      Variable mapping — type a literal or {'{{name}}'} / {'{{phone}}'}
                    </p>
                    {Array.from({ length: varCount }, (_, i) => (
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
                        placeholder="{{name}}"
                      />
                    ))}
                  </div>
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
                  Steps run in order. Step 1 sends on launch (delay 0); each later step waits its
                  delay and only sends if its condition holds.
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
                      <Select
                        label="Template"
                        options={tplOptions}
                        value={step.templateId}
                        onChange={(v) => updateStep(i, { templateId: v })}
                        placeholder={
                          templates.length ? 'Select a template' : 'No approved templates'
                        }
                      />
                    </div>
                    <Input
                      label="Delay (hours)"
                      type="number"
                      min={0}
                      value={step.delayHours}
                      onChange={(e) => updateStep(i, { delayHours: e.target.value })}
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
            </div>
          ) : (
            <div className="mt-4">
              <Textarea
                label="Phone numbers (one per line, with country code)"
                value={phones}
                onChange={(e) => setPhones(e.target.value)}
                rows={6}
                placeholder={'+919876543210\n+14155550123'}
              />
            </div>
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
