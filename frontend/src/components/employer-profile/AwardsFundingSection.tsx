import { useState } from 'react';
import { Plus, Trash2, Award, TrendingUp, DollarSign } from 'lucide-react';
import Input from '@/components/ui/Input';
import DatePicker from '@/components/ui/DatePicker';
import Select, { type SelectOption } from '@/components/ui/Select';
import CurrencyAmountInput from '@/components/ui/CurrencyAmountInput';
import { formatCompactCurrency } from '@/lib/currency';
import Button from '@/components/ui/Button';
import Tag from '@/components/ui/Tag';
import Tooltip from '@/components/ui/Tooltip';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import { FUNDING_STAGE_LABELS } from '@/constants/enums';
import type { UpdateCompanyRequest, FundingStage } from '@/types/employer';
import type { ArrayKey } from './types';

function toSelectOptions(labels: Record<string, string>): SelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

const FUNDING_STAGE_OPTIONS: SelectOption[] = toSelectOptions(FUNDING_STAGE_LABELS);

interface AwardsFundingSectionProps {
  form: UpdateCompanyRequest;
  updateField: <K extends keyof UpdateCompanyRequest>(
    key: K,
    value: UpdateCompanyRequest[K],
  ) => void;
  addToArray: (key: ArrayKey, value: string, clearFn: (v: string) => void) => void;
  removeFromArray: (key: ArrayKey, value: string) => void;
  isIndividual?: boolean;
}

export default function AwardsFundingSection({
  form,
  updateField,
  addToArray,
  removeFromArray,
  isIndividual,
}: AwardsFundingSectionProps) {
  const [investorInput, setInvestorInput] = useState('');

  // Award helpers
  const addAward = () => {
    updateField('awardsRecognitions', [
      ...(form.awardsRecognitions || []),
      { title: '', year: undefined, issuer: '' },
    ]);
  };
  const updateAward = (index: number, field: string, value: string | number | undefined) => {
    const updated = [...(form.awardsRecognitions || [])];
    updated[index] = { ...updated[index], [field]: value };
    updateField('awardsRecognitions', updated);
  };
  const removeAward = (index: number) => {
    updateField(
      'awardsRecognitions',
      (form.awardsRecognitions || []).filter((_, i) => i !== index),
    );
  };

  return (
    <div className="space-y-8">
      {/* Awards */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          Awards & Recognition
        </label>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Highlight any awards, certifications, or recognition your company has received
        </p>

        {(form.awardsRecognitions || []).length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-10 text-center">
            <Award className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No awards added yet</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Click the button below to add awards and recognitions
            </p>
          </div>
        )}

        {(form.awardsRecognitions || []).map((award, index) => (
          <div
            key={index}
            className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text)]">Award #{index + 1}</span>
              <Tooltip content="Remove award">
                <button
                  type="button"
                  onClick={() => removeAward(index)}
                  className="hover:text-error cursor-pointer rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-white"
                  aria-label="Remove award"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Title"
                placeholder="e.g. Best Place to Work"
                value={award.title}
                onChange={(e) => updateAward(index, 'title', e.target.value)}
                required
              />
              <DatePicker
                label="Year"
                mode="year"
                placeholder="e.g. 2024"
                value={award.year ? String(award.year) : ''}
                onChange={(v) => updateAward(index, 'year', v ? Number(v) : undefined)}
                maxDate={new Date()}
              />
              <Input
                label="Issuer"
                placeholder="e.g. Great Place to Work"
                value={award.issuer ?? ''}
                onChange={(e) => updateAward(index, 'issuer', e.target.value)}
              />
            </div>
          </div>
        ))}

        <Button variant="outline" onClick={addAward} tooltip="Add a new award or recognition">
          <Plus className="mr-1 h-4 w-4" /> Add Award
        </Button>
      </div>

      {/* Funding — Company only */}
      {!isIndividual && (
        <div className="border-t border-[var(--border)] pt-8">
          <div className="mb-4 flex items-center gap-3">
            <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-xl">
              <TrendingUp className="text-primary h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text)]">Funding Details</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Share your company&apos;s funding journey (optional)
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Funding Stage"
                options={FUNDING_STAGE_OPTIONS}
                value={form.fundingStage || ''}
                onChange={(v) => updateField('fundingStage', v as FundingStage)}
                placeholder="Select funding stage"
              />
              <CurrencyAmountInput
                label="Total Funding Raised"
                amount={form.totalFundingRaisedAmount}
                currency={form.fundingCurrency || 'INR'}
                onAmountChange={(amt) => updateField('totalFundingRaisedAmount', amt)}
                onCurrencyChange={(code) => updateField('fundingCurrency', code)}
                placeholder="e.g. 500000000"
                helperText={
                  form.totalFundingRaisedAmount != null
                    ? `Will display as ${formatCompactCurrency(form.totalFundingRaisedAmount, form.fundingCurrency || 'INR')}`
                    : form.totalFundingRaised
                      ? `Currently displayed as ${form.totalFundingRaised}`
                      : undefined
                }
              />
            </div>

            {/* Investors */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                Investors
              </label>
              <p className="mb-3 text-xs text-[var(--text-muted)]">
                Add your key investors and backers
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <ServerSuggestionInput
                    category="investor"
                    placeholder="e.g. Sequoia Capital India"
                    value={investorInput}
                    onChange={setInvestorInput}
                    onSelect={(v) => addToArray('investors', v, setInvestorInput)}
                  />
                </div>
                <Button
                  variant="outline"
                  className="shrink-0"
                  onClick={() => addToArray('investors', investorInput, setInvestorInput)}
                  disabled={!investorInput.trim()}
                  tooltip="Add investor"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {(form.investors || []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(form.investors || []).map((inv) => (
                    <Tag
                      key={inv}
                      label={inv}
                      variant="primary"
                      onRemove={() => removeFromArray('investors', inv)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
