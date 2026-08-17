'use client';

import { useCallback, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Input from '@/components/ui/Input';
import TemplatePicker from '@/components/whatsapp/TemplatePicker';
import type { WaTemplate } from '@/types/whatsapp';
import { analyzeTemplate } from '@/lib/whatsapp-template-vars';
import Button from '@/components/ui/Button';

export interface VariantDraft {
  label: string;
  templateId: string;
  weight: string;
  /**
   * Per-variant {{n}} values. Variants can point at different templates with
   * different placeholder counts, so this cannot live on the campaign — and the
   * campaign mapping was being dropped entirely for A/B, which sent every
   * recipient a template with blank placeholders.
   */
  variableMapping?: string[];
}

interface CampaignVariantBuilderProps {
  variants: VariantDraft[];
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
  onChange,
  onAdd,
  onRemove,
  minVariants = 2,
}: CampaignVariantBuilderProps) {
  const totalWeight = variants.reduce((sum, v) => sum + (parseInt(v.weight, 10) || 0), 0);

  /**
   * Templates the pickers have handed back, by id.
   *
   * The builder needs the SELECTED template's components to know how many {{n}}
   * inputs to render. It used to read them out of a list the page pre-fetched,
   * which capped the choice at whatever that one request returned and left the
   * campaign detail page (which passed no list at all) unable to render the
   * parameter inputs for a variant at all. The picker searches server-side, so
   * the catalogue is never wholly in the browser — what it resolves is kept here
   * instead.
   */
  const [resolved, setResolved] = useState<Record<string, WaTemplate>>({});
  const remember = useCallback((tpl: WaTemplate) => {
    setResolved((m) => (m[tpl.id] ? m : { ...m, [tpl.id]: tpl }));
  }, []);

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
                <TemplatePicker
                  label="Template"
                  value={v.templateId}
                  placeholder="Select a template"
                  onChange={(tpl) => {
                    if (tpl) remember(tpl);
                    // A different template has a different placeholder count, so
                    // a carried-over mapping would fill the wrong slots.
                    onChange(i, { templateId: tpl?.id ?? '', variableMapping: [] });
                  }}
                  onResolve={remember}
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
            {(() => {
              // Per-variant parameters. The wizard used to send
              // `variableMapping: undefined` for A/B campaigns and nothing else
              // supplied one, so every recipient received a template with empty
              // placeholders.
              const tpl = v.templateId ? resolved[v.templateId] : undefined;
              const variantSpec = tpl ? analyzeTemplate(tpl) : null;
              // A campaign carries ONE carousel card set, filled in against its
              // main template, and a variant carries a body mapping and nothing
              // else — so a carousel variant would be sent with no card
              // parameters and Meta would refuse every one of its recipients.
              // The launch gate refuses it; this says so while it can still be
              // changed.
              if (variantSpec && variantSpec.carouselCards.length > 0) {
                return (
                  <p className="text-error mt-3 text-[11px]">
                    Carousel templates cannot be A/B variants — a campaign supplies cards for its
                    main template only. Send the carousel as its own broadcast.
                  </p>
                );
              }
              const n = variantSpec?.bodyPositional ?? 0;
              if (n === 0) return null;
              return (
                <div className="mt-3 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                  <p className="text-xs font-semibold text-[var(--text-muted)]">
                    Variables for this variant — a literal, or {'{{name|there}}'} / {'{{phone}}'} /{' '}
                    {'{{attr.city}}'}
                  </p>
                  {Array.from({ length: n }, (_, vi) => (
                    <Input
                      key={vi}
                      label={`{{${vi + 1}}}`}
                      value={v.variableMapping?.[vi] ?? ''}
                      placeholder="{{name|there}}"
                      onChange={(e) => {
                        const next = [...(v.variableMapping ?? [])];
                        next[vi] = e.target.value;
                        onChange(i, { variableMapping: next });
                      }}
                    />
                  ))}
                </div>
              );
            })()}
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
