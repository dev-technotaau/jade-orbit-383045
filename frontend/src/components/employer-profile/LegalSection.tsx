import PanInput from '@/components/ui/PanInput';
import GstinInput from '@/components/ui/GstinInput';
import CinInput from '@/components/ui/CinInput';
import LlpinInput from '@/components/ui/LlpinInput';
import TanInput from '@/components/ui/TanInput';
import { gstinEmbedsPan } from '@/lib/legal-ids';
import Select, { type SelectOption } from '@/components/ui/Select';
import { REVENUE_RANGE_OPTIONS } from '@/constants/suggestions';
import type { UpdateCompanyRequest } from '@/types/employer';

const revenueOptions: SelectOption[] = REVENUE_RANGE_OPTIONS.map((r) => ({ value: r, label: r }));

interface LegalSectionProps {
  form: UpdateCompanyRequest;
  updateField: <K extends keyof UpdateCompanyRequest>(
    key: K,
    value: UpdateCompanyRequest[K],
  ) => void;
  isIndividual?: boolean;
}

export default function LegalSection({ form, updateField, isIndividual }: LegalSectionProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        These details are optional and kept private. They help verify your{' '}
        {isIndividual ? 'identity' : 'company'} and are not shown publicly.
      </p>
      {!isIndividual && (
        <div className="grid gap-4 sm:grid-cols-2">
          <GstinInput
            value={form.gstNumber || ''}
            onChange={(v) => updateField('gstNumber', v)}
            // Live PAN-GSTIN cross-check - chars 3-12 of a GSTIN ARE the
            // entity's PAN by spec, so a mismatch is always an error.
            error={
              (form.gstNumber || '').length === 15 &&
              (form.panNumber || '').length === 10 &&
              !gstinEmbedsPan(form.gstNumber || '', form.panNumber || '')
                ? 'This GSTIN does not match your PAN (characters 3-12 of a GSTIN are the PAN)'
                : undefined
            }
          />
          <CinInput value={form.cinNumber || ''} onChange={(v) => updateField('cinNumber', v)} />
          <LlpinInput
            value={form.llpinNumber || ''}
            onChange={(v) => updateField('llpinNumber', v)}
          />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <PanInput
          value={form.panNumber || ''}
          onChange={(v) => updateField('panNumber', v)}
          required
        />
        <TanInput value={form.tanNumber || ''} onChange={(v) => updateField('tanNumber', v)} />
        <Select
          label="Annual Revenue Range"
          options={revenueOptions}
          value={form.annualRevenueRange || ''}
          onChange={(v) => updateField('annualRevenueRange', v)}
          placeholder="Select revenue range"
        />
      </div>
    </div>
  );
}
