import { useState } from 'react';
import {
  Building2,
  Globe,
  Briefcase,
  Calendar,
  Users as UsersIcon,
  Plus,
  TrendingUp,
  MapPin,
} from 'lucide-react';
import Input from '@/components/ui/Input';
import DatePicker from '@/components/ui/DatePicker';
import Select, { type SelectOption } from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import Tag from '@/components/ui/Tag';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import { COMPANY_TYPE_LABELS, getSubIndustriesForIndustry } from '@/constants/enums';
import type { UpdateCompanyRequest } from '@/types/employer';
import type { EmployerProfileSectionProps } from './types';

function toSelectOptions(labels: Record<string, string>): SelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

const companySizeOptions: SelectOption[] = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1000 employees' },
  { value: '1001-5000', label: '1001-5000 employees' },
  { value: '5001-10000', label: '5001-10000 employees' },
  { value: '10000+', label: '10000+ employees' },
];

export default function CompanyInfoSection({
  form,
  updateField,
  addToArray,
  removeFromArray,
  isIndividual,
}: EmployerProfileSectionProps) {
  const [specialtyInput, setSpecialtyInput] = useState('');

  return (
    <div className="space-y-4">
      <Input
        label={isIndividual ? 'Business Name' : 'Company Name'}
        value={form.companyName || ''}
        onChange={(e) => updateField('companyName', e.target.value)}
        leftIcon={<Building2 className="h-4 w-4" />}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {!isIndividual && (
          <Select
            label="Company Type"
            options={toSelectOptions(COMPANY_TYPE_LABELS)}
            value={form.companyType || ''}
            onChange={(v) => updateField('companyType', v as UpdateCompanyRequest['companyType'])}
            placeholder="Select type"
          />
        )}
        <ServerSuggestionInput
          category="industry"
          label="Industry"
          placeholder="e.g. Information Technology"
          value={form.industry || ''}
          onChange={(v) => updateField('industry', v)}
          onSelect={(v) => {
            updateField('industry', v);
            updateField('subIndustry', '');
          }}
          leftIcon={<Briefcase className="h-4 w-4" />}
          required
        />
      </div>
      {getSubIndustriesForIndustry(form.industry || '').length > 0 ? (
        <Select
          label="Sub-Industry"
          options={getSubIndustriesForIndustry(form.industry || '').map((s) => ({
            value: s,
            label: s,
          }))}
          value={form.subIndustry || ''}
          onChange={(v) => updateField('subIndustry', v as UpdateCompanyRequest['subIndustry'])}
          placeholder={form.industry ? 'Select sub-industry' : 'Select industry first'}
          disabled={!form.industry}
        />
      ) : (
        <ServerSuggestionInput
          category="sub_industry"
          label="Sub-Industry"
          placeholder={form.industry ? 'e.g. SaaS, AI/ML, Payments' : 'Select industry first'}
          value={form.subIndustry || ''}
          onChange={(v) => updateField('subIndustry', v)}
          onSelect={(v) => updateField('subIndustry', v)}
          disabled={!form.industry}
        />
      )}

      {/* Specialties */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Specialties</label>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          {isIndividual ? 'Areas you specialize in' : 'Areas your company specializes in'}
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <ServerSuggestionInput
              category="skill"
              placeholder="e.g. Cloud Computing, DevOps"
              value={specialtyInput}
              onChange={setSpecialtyInput}
              onSelect={(v) => addToArray('specialties', v, setSpecialtyInput)}
            />
          </div>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => addToArray('specialties', specialtyInput, setSpecialtyInput)}
            disabled={!specialtyInput.trim()}
            tooltip="Add specialty"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {(form.specialties || []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(form.specialties || []).map((s) => (
              <Tag
                key={s}
                label={s}
                variant="primary"
                onRemove={() => removeFromArray('specialties', s)}
              />
            ))}
          </div>
        )}
      </div>

      {!isIndividual && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Company Size"
            options={companySizeOptions}
            value={form.companySize || ''}
            onChange={(v) => updateField('companySize', v)}
            placeholder="Select size"
          />
          <Input
            label="Employee Count"
            type="number"
            placeholder="e.g. 250"
            value={form.employeeCount?.toString() || ''}
            onChange={(e) =>
              updateField('employeeCount', e.target.value ? Number(e.target.value) : undefined)
            }
            leftIcon={<UsersIcon className="h-4 w-4" />}
          />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {!isIndividual && (
          <Input
            label="Number of Offices"
            type="number"
            placeholder="e.g. 5"
            value={form.numberOfOffices?.toString() || ''}
            onChange={(e) =>
              updateField('numberOfOffices', e.target.value ? Number(e.target.value) : undefined)
            }
            leftIcon={<MapPin className="h-4 w-4" />}
          />
        )}
        <DatePicker
          label={isIndividual ? 'Year Started' : 'Founded Year'}
          mode="year"
          placeholder="e.g. 2015"
          value={form.foundedYear ? String(form.foundedYear) : ''}
          onChange={(v) => updateField('foundedYear', v ? Number(v) : undefined)}
          leftIcon={<Calendar className="h-4 w-4" />}
          maxDate={new Date()}
        />
      </div>
      <Input
        label="Website"
        type="url"
        placeholder={isIndividual ? 'https://your-website.com' : 'https://www.company.com'}
        leftIcon={<Globe className="h-4 w-4" />}
        value={form.website || ''}
        onChange={(e) => updateField('website', e.target.value)}
      />
      {!isIndividual && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Parent Company"
            placeholder="e.g. Alphabet Inc."
            value={form.parentCompany || ''}
            onChange={(e) => updateField('parentCompany', e.target.value)}
            leftIcon={<Building2 className="h-4 w-4" />}
            helperText="Leave blank if not a subsidiary"
          />
          <Input
            label="Stock Ticker"
            placeholder="e.g. GOOG, TCS"
            value={form.stockTicker || ''}
            onChange={(e) => updateField('stockTicker', e.target.value)}
            leftIcon={<TrendingUp className="h-4 w-4" />}
            helperText="Only if publicly listed"
          />
        </div>
      )}
    </div>
  );
}
