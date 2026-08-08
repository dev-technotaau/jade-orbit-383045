import { useState } from 'react';
import { Plus } from 'lucide-react';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import Tag from '@/components/ui/Tag';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import type { EmployerProfileSectionProps } from './types';

export default function CultureSection({
  form,
  updateField,
  addToArray,
  removeFromArray,
}: EmployerProfileSectionProps) {
  const [coreValueInput, setCoreValueInput] = useState('');
  const [ergInput, setErgInput] = useState('');

  return (
    <div className="space-y-4">
      <Textarea
        label="Mission Statement"
        placeholder="What is your company's mission?"
        rows={3}
        value={form.missionStatement || ''}
        onChange={(e) => updateField('missionStatement', e.target.value)}
      />
      <Textarea
        label="Vision Statement"
        placeholder="Where does your company want to be in the future?"
        rows={3}
        value={form.visionStatement || ''}
        onChange={(e) => updateField('visionStatement', e.target.value)}
      />
      <Textarea
        label="Company Culture"
        placeholder="Describe your work culture, team dynamics..."
        rows={4}
        value={form.companyCulture || ''}
        onChange={(e) => updateField('companyCulture', e.target.value)}
      />
      <Textarea
        label="Diversity & Inclusion Statement"
        placeholder="Share your commitment to diversity and inclusion"
        rows={3}
        value={form.diversityStatement || ''}
        onChange={(e) => updateField('diversityStatement', e.target.value)}
      />

      {/* Core Values */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Core Values</label>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Add the core values that define your company culture
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <ServerSuggestionInput
              category="core_value"
              placeholder="e.g. Innovation, Integrity"
              value={coreValueInput}
              onChange={setCoreValueInput}
              onSelect={(v) => addToArray('coreValues', v, setCoreValueInput)}
            />
          </div>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => addToArray('coreValues', coreValueInput, setCoreValueInput)}
            disabled={!coreValueInput.trim()}
            tooltip="Add core value"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {(form.coreValues || []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(form.coreValues || []).map((val) => (
              <Tag
                key={val}
                label={val}
                variant="primary"
                onRemove={() => removeFromArray('coreValues', val)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ERGs */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          Employee Resource Groups (ERGs)
        </label>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Employee-led groups that support diversity, equity, and inclusion
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <ServerSuggestionInput
              category="erg"
              placeholder="e.g. Women in Tech, LGBTQ+ Alliance"
              value={ergInput}
              onChange={setErgInput}
              onSelect={(v) => addToArray('employeeResourceGroups', v, setErgInput)}
            />
          </div>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => addToArray('employeeResourceGroups', ergInput, setErgInput)}
            disabled={!ergInput.trim()}
            tooltip="Add resource group"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {(form.employeeResourceGroups || []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(form.employeeResourceGroups || []).map((erg) => (
              <Tag
                key={erg}
                label={erg}
                variant="primary"
                onRemove={() => removeFromArray('employeeResourceGroups', erg)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
