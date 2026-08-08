import { useState } from 'react';
import { MapPin, Globe, Plus } from 'lucide-react';
import Input from '@/components/ui/Input';
import Select, { type SelectOption } from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import Tag from '@/components/ui/Tag';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import { INDIAN_STATES } from '@/constants/suggestions';
import type { EmployerProfileSectionProps } from './types';

const stateOptions: SelectOption[] = INDIAN_STATES.map((s) => ({ value: s, label: s }));

export default function AddressSection({
  form,
  updateField,
  addToArray,
  removeFromArray,
}: EmployerProfileSectionProps) {
  const [locationInput, setLocationInput] = useState('');

  return (
    <div className="space-y-4">
      <ServerSuggestionInput
        category="location"
        label="Headquarters"
        placeholder="e.g. Bangalore, Karnataka"
        value={form.headquarters || ''}
        onChange={(v) => updateField('headquarters', v)}
        onSelect={(v) => updateField('headquarters', v)}
        leftIcon={<MapPin className="h-4 w-4" />}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Address Line 1"
          placeholder="Street address, building name"
          value={form.addressLine1 || ''}
          onChange={(e) => updateField('addressLine1', e.target.value)}
        />
        <Input
          label="Address Line 2"
          placeholder="Floor, suite, area (optional)"
          value={form.addressLine2 || ''}
          onChange={(e) => updateField('addressLine2', e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <ServerSuggestionInput
          category="location"
          label="City"
          placeholder="e.g. Bangalore"
          value={form.city || ''}
          onChange={(v) => updateField('city', v)}
          onSelect={(v) => updateField('city', v)}
        />
        <Select
          label="State"
          options={stateOptions}
          value={form.state || ''}
          onChange={(v) => updateField('state', v)}
          placeholder="Select state"
          searchable
        />
        <Input
          label="Pincode"
          placeholder="e.g. 560001"
          value={form.pincode || ''}
          onChange={(e) => updateField('pincode', e.target.value)}
        />
      </div>
      <ServerSuggestionInput
        category="country"
        label="Country"
        value={form.country || 'India'}
        onChange={(v) => updateField('country', v)}
        onSelect={(v) => updateField('country', v)}
      />

      {/* Office Locations */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          Additional Office Locations
        </label>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Add other cities or locations where you have offices
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <ServerSuggestionInput
              category="location"
              placeholder="e.g. Mumbai, Maharashtra"
              value={locationInput}
              onChange={setLocationInput}
              onSelect={(v) => addToArray('locations', v, setLocationInput)}
            />
          </div>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => addToArray('locations', locationInput, setLocationInput)}
            disabled={!locationInput.trim()}
            tooltip="Add location"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {(form.locations || []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(form.locations || []).map((l) => (
              <Tag key={l} label={l} onRemove={() => removeFromArray('locations', l)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
