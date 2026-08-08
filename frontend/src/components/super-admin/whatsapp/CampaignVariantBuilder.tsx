'use client';

import { Plus, Trash2 } from 'lucide-react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';

export interface VariantDraft {
  label: string;
  templateId: string;
  weight: string;
}

interface CampaignVariantBuilderProps {
  variants: VariantDraft[];
  templateOptions: Array<{ value: string; label: string }>;
  hasTemplates: boolean;
  onChange: (index: number, patch: Partial<VariantDraft>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  /** Minimum variants kept (remove disabled at/below this). */
  minVariants?: number;
}

/**
 * Editable A/B variants builder. Each variant is { label, templateId, weight }.
 * Weight is a relative split — recipients are partitioned by weight share.
 * Shared by the new-campaign form and the draft-edit flow on the detail page.
 */
export default function CampaignVariantBuilder({
  variants,
  templateOptions,
  hasTemplates,
  onChange,
  onAdd,
  onRemove,
  minVariants = 2,
}: CampaignVariantBuilderProps) {
  const totalWeight = variants.reduce((sum, v) => sum + (parseInt(v.weight, 10) || 0), 0);

  return (
    <div className="space-y-3">
      {variants.map((v, i) => {
        const w = parseInt(v.weight, 10) || 0;
        const share = totalWeight > 0 ? Math.round((w / totalWeight) * 100) : 0;
        return (
          <div
            key={i}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-muted)]">
                Variant {String.fromCharCode(65 + i)} · ~{share}% of audience
              </span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                disabled={variants.length <= minVariants}
                className="rounded p-1 text-[var(--error)] hover:opacity-80 disabled:opacity-30"
                aria-label="Remove variant"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                label="Label"
                value={v.label}
                onChange={(e) => onChange(i, { label: e.target.value })}
                placeholder={`Variant ${String.fromCharCode(65 + i)}`}
              />
              <div className="sm:col-span-1 lg:col-span-2">
                <Select
                  label="Template"
                  options={templateOptions}
                  value={v.templateId}
                  onChange={(val) => onChange(i, { templateId: val })}
                  placeholder={hasTemplates ? 'Select a template' : 'No approved templates'}
                />
              </div>
              <Input
                label="Weight"
                type="number"
                min={1}
                value={v.weight}
                onChange={(e) => onChange(i, { weight: e.target.value })}
              />
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        leftIcon={<Plus className="h-4 w-4" />}
        onClick={onAdd}
      >
        Add variant
      </Button>
    </div>
  );
}
