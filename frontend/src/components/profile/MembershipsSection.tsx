'use client';

import { Plus, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import DatePicker from '@/components/ui/DatePicker';
import type { ProfileSectionProps } from './types';
import type { MembershipEntry } from '@/types/candidate';

export default function MembershipsSection({ form, updateField }: ProfileSectionProps) {
  const addMembership = () =>
    updateField('professionalMemberships', [
      ...(form.professionalMemberships || []),
      { organization: '' },
    ]);
  const updateMembership = (index: number, updates: Partial<MembershipEntry>) => {
    const updated = [...(form.professionalMemberships || [])];
    updated[index] = { ...updated[index], ...updates };
    updateField('professionalMemberships', updated);
  };
  const removeMembership = (index: number) =>
    updateField(
      'professionalMemberships',
      (form.professionalMemberships || []).filter((_, i) => i !== index),
    );

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text)]">Professional Memberships</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={addMembership}
            tooltip="Add a new professional membership"
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {(form.professionalMemberships || []).length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-muted)]">
            No memberships added yet.
          </p>
        ) : (
          (form.professionalMemberships || []).map((mem, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-[var(--text)]">Membership {i + 1}</h4>
                <Tooltip content="Remove this membership">
                  <button
                    onClick={() => removeMembership(i)}
                    className="cursor-pointer text-[var(--error)] hover:text-[var(--error-dark)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ServerSuggestionInput
                  category="professional_org"
                  label="Organization"
                  value={mem.organization}
                  onChange={(val) => updateMembership(i, { organization: val })}
                  required
                />
                <ServerSuggestionInput
                  category="role_category"
                  label="Role"
                  value={mem.role || ''}
                  onChange={(val) => updateMembership(i, { role: val })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <DatePicker
                  label="Start Date"
                  mode="month"
                  value={mem.startDate || ''}
                  onChange={(val) => updateMembership(i, { startDate: val })}
                />
                <DatePicker
                  label="End Date"
                  mode="month"
                  value={mem.endDate || ''}
                  onChange={(val) => updateMembership(i, { endDate: val })}
                />
                <Input
                  label="Membership ID"
                  value={mem.membershipId || ''}
                  onChange={(e) => updateMembership(i, { membershipId: e.target.value })}
                />
              </div>
              <Textarea
                label="Description"
                value={mem.description || ''}
                onChange={(e) => updateMembership(i, { description: e.target.value })}
                rows={2}
              />
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
