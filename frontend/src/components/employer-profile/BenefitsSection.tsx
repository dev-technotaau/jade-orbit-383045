import { useState } from 'react';
import { Plus, Trash2, Layers } from 'lucide-react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Tag from '@/components/ui/Tag';
import Tooltip from '@/components/ui/Tooltip';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import type { UpdateCompanyRequest } from '@/types/employer';
import type { EmployerProfileSectionProps } from './types';

const QUICK_BENEFITS = [
  'Health Insurance',
  'Work From Home',
  'Flexible Hours',
  'Stock Options (ESOPs)',
  'Free Meals',
  'Paid Vacation',
];

const SUGGESTED_CATEGORIES = [
  'Health & Wellness',
  'Financial',
  'Work-Life Balance',
  'Learning & Development',
  'Office & Facilities',
];

export default function BenefitsSection({
  form,
  updateField,
  addToArray,
  removeFromArray,
}: EmployerProfileSectionProps) {
  const [benefitInput, setBenefitInput] = useState('');
  const [perkInputs, setPerkInputs] = useState<Record<number, string>>({});

  // ---- Structured Perks helpers ----
  const perks = form.structuredPerks || [];

  const addCategory = () => {
    updateField('structuredPerks', [...perks, { category: '', perks: [] }]);
  };

  const updateCategoryName = (index: number, name: string) => {
    const updated = [...perks];
    updated[index] = { ...updated[index], category: name };
    updateField('structuredPerks', updated);
  };

  const removeCategory = (index: number) => {
    updateField(
      'structuredPerks',
      perks.filter((_, i) => i !== index),
    );
    setPerkInputs((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const addPerkToCategory = (catIndex: number) => {
    const value = (perkInputs[catIndex] || '').trim();
    if (!value) return;
    const cat = perks[catIndex];
    if (cat.perks.includes(value)) return;
    const updated = [...perks];
    updated[catIndex] = { ...cat, perks: [...cat.perks, value] };
    updateField('structuredPerks', updated);
    setPerkInputs((prev) => ({ ...prev, [catIndex]: '' }));
  };

  const removePerkFromCategory = (catIndex: number, perk: string) => {
    const updated = [...perks];
    updated[catIndex] = {
      ...updated[catIndex],
      perks: updated[catIndex].perks.filter((p) => p !== perk),
    };
    updateField('structuredPerks', updated);
  };

  const addSuggestedCategory = (name: string) => {
    if (perks.some((p) => p.category === name)) return;
    updateField('structuredPerks', [...perks, { category: name, perks: [] }]);
  };

  return (
    <div className="space-y-8">
      {/* ---- General Benefits ---- */}
      <div className="space-y-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
            Benefits & Perks
          </label>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Add the benefits you offer to employees. Type to search or click the popular ones below.
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <ServerSuggestionInput
                category="benefit"
                placeholder="e.g. Health Insurance"
                value={benefitInput}
                onChange={setBenefitInput}
                onSelect={(v) => addToArray('benefits', v, setBenefitInput)}
              />
            </div>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => addToArray('benefits', benefitInput, setBenefitInput)}
              disabled={!benefitInput.trim()}
              tooltip="Add benefit"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Quick-add chips */}
        <div>
          <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Popular benefits</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_BENEFITS.map((benefit) => {
              const isAdded = (form.benefits || []).includes(benefit);
              return (
                <Tooltip content={isAdded ? 'Already added' : `Add ${benefit}`} key={benefit}>
                  <button
                    type="button"
                    onClick={() => !isAdded && addToArray('benefits', benefit, () => {})}
                    disabled={isAdded}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      isAdded
                        ? 'border-primary/30 bg-primary-light text-primary cursor-default'
                        : 'hover:border-primary hover:text-primary cursor-pointer border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)]'
                    }`}
                  >
                    + {benefit}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Selected benefits */}
        {(form.benefits || []).length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
              Added benefits ({(form.benefits || []).length})
            </p>
            <div className="flex flex-wrap gap-2">
              {(form.benefits || []).map((b) => (
                <Tag
                  key={b}
                  label={b}
                  variant="primary"
                  onRemove={() => removeFromArray('benefits', b)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---- Structured Perks by Category ---- */}
      <div className="border-t border-[var(--border)] pt-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-xl">
            <Layers className="text-primary h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">Structured Perks</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Organize perks by category for a clearer presentation
            </p>
          </div>
        </div>

        {/* Suggested categories */}
        {perks.length === 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
              Quick-add categories
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_CATEGORIES.map((cat) => (
                <Tooltip content={`Add ${cat} category`} key={cat}>
                  <button
                    type="button"
                    onClick={() => addSuggestedCategory(cat)}
                    className="hover:border-primary hover:text-primary cursor-pointer rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors"
                  >
                    + {cat}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {perks.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-10 text-center">
            <Layers className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No perk categories added yet</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Click the quick-add buttons above or add a custom category below
            </p>
          </div>
        )}

        {/* Category cards */}
        {perks.map((cat, catIndex) => (
          <div
            key={catIndex}
            className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex-1">
                <Input
                  label="Category"
                  placeholder="e.g. Health & Wellness"
                  value={cat.category}
                  onChange={(e) => updateCategoryName(catIndex, e.target.value)}
                />
              </div>
              <Tooltip content="Remove category">
                <button
                  type="button"
                  onClick={() => removeCategory(catIndex)}
                  className="mt-5 cursor-pointer rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-white hover:text-[var(--error)]"
                  aria-label="Remove category"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>

            {/* Perks within category */}
            <div className="flex gap-2">
              <Input
                placeholder="Add a perk"
                value={perkInputs[catIndex] || ''}
                onChange={(e) => setPerkInputs((prev) => ({ ...prev, [catIndex]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPerkToCategory(catIndex);
                  }
                }}
                className="flex-1"
              />
              <Button
                variant="outline"
                className="shrink-0"
                onClick={() => addPerkToCategory(catIndex)}
                disabled={!(perkInputs[catIndex] || '').trim()}
                tooltip="Add perk"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {cat.perks.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {cat.perks.map((perk) => (
                  <Tag
                    key={perk}
                    label={perk}
                    variant="primary"
                    onRemove={() => removePerkFromCategory(catIndex, perk)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        <Button variant="outline" onClick={addCategory} tooltip="Add a new perk category">
          <Plus className="mr-1 h-4 w-4" /> Add Category
        </Button>
      </div>
    </div>
  );
}
