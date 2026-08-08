'use client';

import { Plus, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import DatePicker from '@/components/ui/DatePicker';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import type { ProfileSectionProps } from './types';
import type { AwardEntry } from '@/types/candidate';

export default function AwardsSection({ form, updateField }: ProfileSectionProps) {
  const addAward = () => updateField('awards', [...(form.awards || []), { title: '' }]);
  const updateAward = (index: number, updates: Partial<AwardEntry>) => {
    const updated = [...(form.awards || [])];
    updated[index] = { ...updated[index], ...updates };
    updateField('awards', updated);
  };
  const removeAward = (index: number) =>
    updateField(
      'awards',
      (form.awards || []).filter((_, i) => i !== index),
    );

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text)]">Awards & Achievements</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={addAward}
            tooltip="Add a new award or achievement"
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {(form.awards || []).length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-muted)]">No awards added yet.</p>
        ) : (
          (form.awards || []).map((award, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-[var(--text)]">Award {i + 1}</h4>
                <Tooltip content="Remove this award">
                  <button
                    onClick={() => removeAward(i)}
                    className="cursor-pointer text-[var(--error)] hover:text-[var(--error-dark)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Title"
                  value={award.title}
                  onChange={(e) => updateAward(i, { title: e.target.value })}
                  required
                />
                <ServerSuggestionInput
                  category="company"
                  label="Issuer"
                  value={award.issuer || ''}
                  onChange={(val) => updateAward(i, { issuer: val })}
                />
              </div>
              <DatePicker
                label="Date"
                mode="month"
                value={award.date || ''}
                onChange={(val) => updateAward(i, { date: val })}
              />
              <Textarea
                label="Description"
                value={award.description || ''}
                onChange={(e) => updateAward(i, { description: e.target.value })}
                rows={2}
              />
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
