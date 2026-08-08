'use client';

import { Plus, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import Input from '@/components/ui/Input';
import PhoneInput from '@/components/ui/PhoneInput';
import Textarea from '@/components/ui/Textarea';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import DatePicker from '@/components/ui/DatePicker';
import type { ProfileSectionProps } from './types';
import type { VolunteerEntry, ReferenceEntry } from '@/types/candidate';

export default function VolunteeringSection({ form, updateField }: ProfileSectionProps) {
  // Volunteering
  const addVolunteer = () =>
    updateField('volunteerExperience', [
      ...(form.volunteerExperience || []),
      { organization: '', role: '' },
    ]);
  const updateVolunteer = (index: number, updates: Partial<VolunteerEntry>) => {
    const updated = [...(form.volunteerExperience || [])];
    updated[index] = { ...updated[index], ...updates };
    updateField('volunteerExperience', updated);
  };
  const removeVolunteer = (index: number) =>
    updateField(
      'volunteerExperience',
      (form.volunteerExperience || []).filter((_, i) => i !== index),
    );

  // References
  const addReference = () => updateField('references', [...(form.references || []), { name: '' }]);
  const updateReference = (index: number, updates: Partial<ReferenceEntry>) => {
    const updated = [...(form.references || [])];
    updated[index] = { ...updated[index], ...updates };
    updateField('references', updated);
  };
  const removeReference = (index: number) =>
    updateField(
      'references',
      (form.references || []).filter((_, i) => i !== index),
    );

  return (
    <div className="space-y-6">
      {/* Volunteer Experience */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text)]">Volunteer Experience</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={addVolunteer}
              tooltip="Add a new volunteer experience"
            >
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {(form.volunteerExperience || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              No volunteer experience added yet.
            </p>
          ) : (
            (form.volunteerExperience || []).map((vol, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Volunteer {i + 1}</h4>
                  <Tooltip content="Remove this volunteer experience">
                    <button
                      onClick={() => removeVolunteer(i)}
                      className="cursor-pointer text-[var(--error)] hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ServerSuggestionInput
                    category="company"
                    label="Organization"
                    value={vol.organization}
                    onChange={(val) => updateVolunteer(i, { organization: val })}
                    required
                  />
                  <ServerSuggestionInput
                    category="role_category"
                    label="Role"
                    value={vol.role}
                    onChange={(val) => updateVolunteer(i, { role: val })}
                    required
                  />
                </div>
                <ServerSuggestionInput
                  category="volunteer_cause"
                  label="Cause"
                  value={vol.cause || ''}
                  onChange={(val) => updateVolunteer(i, { cause: val })}
                  placeholder="e.g. Education, Environment"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <DatePicker
                    label="Start Date"
                    mode="month"
                    value={vol.startDate || ''}
                    onChange={(val) => updateVolunteer(i, { startDate: val })}
                  />
                  <DatePicker
                    label="End Date"
                    mode="month"
                    value={vol.endDate || ''}
                    onChange={(val) => updateVolunteer(i, { endDate: val })}
                    disabled={vol.isCurrent}
                    helperText={vol.isCurrent ? 'Present' : ''}
                  />
                </div>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={vol.isCurrent || false}
                    onChange={(e) =>
                      updateVolunteer(i, {
                        isCurrent: e.target.checked,
                        endDate: e.target.checked ? undefined : vol.endDate,
                      })
                    }
                    className="text-primary h-4 w-4 rounded border-[var(--border)]"
                  />
                  <span className="text-sm text-[var(--text)]">I currently volunteer here</span>
                </label>
                <Textarea
                  label="Description"
                  value={vol.description || ''}
                  onChange={(e) => updateVolunteer(i, { description: e.target.value })}
                  rows={2}
                />
              </div>
            ))
          )}
        </div>
      </Card>

      {/* References */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text)]">References</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={addReference}
              tooltip="Add a new reference"
            >
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {(form.references || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              No references added yet.
            </p>
          ) : (
            (form.references || []).map((ref, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Reference {i + 1}</h4>
                  <Tooltip content="Remove this reference">
                    <button
                      onClick={() => removeReference(i)}
                      className="cursor-pointer text-[var(--error)] hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Name"
                    value={ref.name}
                    onChange={(e) => updateReference(i, { name: e.target.value })}
                    required
                  />
                  <ServerSuggestionInput
                    category="role_category"
                    label="Designation"
                    value={ref.designation || ''}
                    onChange={(val) => updateReference(i, { designation: val })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ServerSuggestionInput
                    category="company"
                    label="Organization"
                    value={ref.organization || ''}
                    onChange={(val) => updateReference(i, { organization: val })}
                  />
                  <Input
                    label="Relationship"
                    value={ref.relationship || ''}
                    onChange={(e) => updateReference(i, { relationship: e.target.value })}
                    placeholder="e.g. Manager, Colleague"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Email"
                    type="email"
                    value={ref.email || ''}
                    onChange={(e) => updateReference(i, { email: e.target.value })}
                  />
                  <PhoneInput
                    label="Phone"
                    placeholder="9876xxxxxx"
                    value={ref.phone || ''}
                    onValueChange={(val) => updateReference(i, { phone: val })}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
