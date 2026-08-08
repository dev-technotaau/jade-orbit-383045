'use client';

import { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Tooltip from '@/components/ui/Tooltip';
import { superAdminEmailService as svc } from '@/services/super-admin-email.service';
import { showToast } from '@/components/ui/Toast';
import type { EmailTemplate, EmailCampaignVariant, EmailCampaignStep } from '@/types/email';

interface VariantRow {
  label: string;
  templateId: string;
  subjectOverride: string;
  weight: number;
}
interface StepRow {
  templateId: string;
  subject: string;
  delayHours: number;
  condition: string;
}

const CONDITIONS = ['any', 'no_open', 'opened', 'no_click', 'clicked'];

/** A/B variant builder — repeatable rows (label/template/subject/weight). */
export function VariantBuilder({
  campaignId,
  initial,
  templates,
  onSaved,
}: {
  campaignId: string;
  initial: EmailCampaignVariant[];
  templates: EmailTemplate[];
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<VariantRow[]>(
    initial.length
      ? initial.map((v) => ({
          label: v.label,
          templateId: v.templateId ?? '',
          subjectOverride: v.subjectOverride ?? '',
          weight: v.weight,
        }))
      : [
          { label: 'A', templateId: '', subjectOverride: '', weight: 1 },
          { label: 'B', templateId: '', subjectOverride: '', weight: 1 },
        ],
  );
  const [busy, setBusy] = useState(false);

  const set = (i: number, patch: Partial<VariantRow>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  async function save() {
    setBusy(true);
    try {
      await svc.setVariants(
        campaignId,
        rows.map((r) => ({
          label: r.label,
          templateId: r.templateId || null,
          subjectOverride: r.subjectOverride || null,
          weight: Number(r.weight) || 1,
        })),
      );
      showToast.success('Variants saved');
      onSaved();
    } catch {
      showToast.error('Could not save variants');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] p-2"
        >
          <input
            value={row.label}
            onChange={(e) => set(i, { label: e.target.value })}
            placeholder="Label"
            className="w-16 rounded border border-[var(--border)] px-2 py-1 text-sm"
          />
          <Select
            className="min-w-40 flex-1"
            size="sm"
            placeholder="Campaign default template"
            options={templates.map((t) => ({ value: t.id, label: t.name }))}
            value={row.templateId}
            onChange={(v) => set(i, { templateId: v })}
          />
          <input
            value={row.subjectOverride}
            onChange={(e) => set(i, { subjectOverride: e.target.value })}
            placeholder="Subject override (optional)"
            className="min-w-40 flex-1 rounded border border-[var(--border)] px-2 py-1 text-sm"
          />
          <input
            type="number"
            min={1}
            value={row.weight}
            onChange={(e) => set(i, { weight: Number(e.target.value) })}
            className="w-16 rounded border border-[var(--border)] px-2 py-1 text-sm"
            title="Weight"
          />
          <button
            onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
            className="rounded p-1 text-red-500 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Plus className="h-3.5 w-3.5" />}
          onClick={() =>
            setRows((r) => [
              ...r,
              {
                label: String.fromCharCode(65 + r.length),
                templateId: '',
                subjectOverride: '',
                weight: 1,
              },
            ])
          }
        >
          Add variant
        </Button>
        <Button
          size="sm"
          leftIcon={<Save className="h-3.5 w-3.5" />}
          isLoading={busy}
          onClick={save}
        >
          Save variants
        </Button>
      </div>
    </div>
  );
}

/** Drip sequence steps editor — ordered rows (template/delay/condition). */
export function StepsBuilder({
  campaignId,
  initial,
  templates,
  onSaved,
}: {
  campaignId: string;
  initial: EmailCampaignStep[];
  templates: EmailTemplate[];
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<StepRow[]>(
    initial.length
      ? initial.map((s) => ({
          templateId: s.templateId ?? '',
          subject: s.subject ?? '',
          delayHours: s.delayHours,
          condition: s.condition,
        }))
      : [{ templateId: '', subject: '', delayHours: 0, condition: 'any' }],
  );
  const [busy, setBusy] = useState(false);

  const set = (i: number, patch: Partial<StepRow>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  async function save() {
    setBusy(true);
    try {
      await svc.setSteps(
        campaignId,
        rows.map((r, i) => ({
          stepOrder: i,
          templateId: r.templateId || null,
          subject: r.subject || null,
          delayHours: Number(r.delayHours) || 0,
          condition: r.condition,
        })),
      );
      showToast.success('Sequence saved');
      onSaved();
    } catch {
      showToast.error('Could not save sequence');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] p-2"
        >
          <span className="text-xs font-semibold text-[var(--text-muted)]">#{i + 1}</span>
          <Select
            className="min-w-40 flex-1"
            size="sm"
            placeholder="Campaign default template"
            options={templates.map((t) => ({ value: t.id, label: t.name }))}
            value={row.templateId}
            onChange={(v) => set(i, { templateId: v })}
          />
          <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            wait
            <input
              type="number"
              min={0}
              value={row.delayHours}
              onChange={(e) => set(i, { delayHours: Number(e.target.value) })}
              className="w-16 rounded border border-[var(--border)] px-2 py-1 text-sm"
            />
            h
          </label>
          <Tooltip content="Send only if">
            <Select
              className="w-36"
              size="sm"
              clearable={false}
              options={CONDITIONS.map((c) => ({ value: c, label: c }))}
              value={row.condition}
              onChange={(v) => set(i, { condition: v })}
            />
          </Tooltip>
          <button
            onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
            className="rounded p-1 text-red-500 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Plus className="h-3.5 w-3.5" />}
          onClick={() =>
            setRows((r) => [
              ...r,
              { templateId: '', subject: '', delayHours: 24, condition: 'any' },
            ])
          }
        >
          Add step
        </Button>
        <Button
          size="sm"
          leftIcon={<Save className="h-3.5 w-3.5" />}
          isLoading={busy}
          onClick={save}
        >
          Save sequence
        </Button>
      </div>
    </div>
  );
}
