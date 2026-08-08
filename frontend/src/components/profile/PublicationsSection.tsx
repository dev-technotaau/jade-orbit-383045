'use client';

import { Plus, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import Select, { type SelectOption } from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import { PATENT_STATUS_LABELS } from '@/constants/enums';
import type { ProfileSectionProps } from './types';
import type { PublicationEntry, PatentEntry } from '@/types/candidate';

function toSelectOptions(labels: Record<string, string>): SelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

export default function PublicationsSection({ form, updateField }: ProfileSectionProps) {
  // Publications
  const addPublication = () =>
    updateField('publications', [...(form.publications || []), { title: '' }]);
  const updatePublication = (index: number, updates: Partial<PublicationEntry>) => {
    const updated = [...(form.publications || [])];
    updated[index] = { ...updated[index], ...updates };
    updateField('publications', updated);
  };
  const removePublication = (index: number) =>
    updateField(
      'publications',
      (form.publications || []).filter((_, i) => i !== index),
    );

  // Patents
  const addPatent = () => updateField('patents', [...(form.patents || []), { title: '' }]);
  const updatePatent = (index: number, updates: Partial<PatentEntry>) => {
    const updated = [...(form.patents || [])];
    updated[index] = { ...updated[index], ...updates };
    updateField('patents', updated);
  };
  const removePatent = (index: number) =>
    updateField(
      'patents',
      (form.patents || []).filter((_, i) => i !== index),
    );

  return (
    <div className="space-y-6">
      {/* Publications */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text)]">Publications</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={addPublication}
              tooltip="Add a new publication"
            >
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {(form.publications || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              No publications added yet.
            </p>
          ) : (
            (form.publications || []).map((pub, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Publication {i + 1}</h4>
                  <Tooltip content="Remove this publication">
                    <button
                      onClick={() => removePublication(i)}
                      className="cursor-pointer text-[var(--error)] hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
                <Input
                  label="Title"
                  value={pub.title}
                  onChange={(e) => updatePublication(i, { title: e.target.value })}
                  required
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <ServerSuggestionInput
                    category="publisher"
                    label="Publisher"
                    value={pub.publisher || ''}
                    onChange={(val) => updatePublication(i, { publisher: val })}
                  />
                  <DatePicker
                    label="Publication Date"
                    mode="month"
                    value={pub.publicationDate || ''}
                    onChange={(val) => updatePublication(i, { publicationDate: val })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="URL"
                    placeholder="https://..."
                    value={pub.url || ''}
                    onChange={(e) => updatePublication(i, { url: e.target.value })}
                  />
                  <Input
                    label="Authors"
                    value={pub.authors || ''}
                    onChange={(e) => updatePublication(i, { authors: e.target.value })}
                    placeholder="Co-authors"
                  />
                </div>
                <Textarea
                  label="Description"
                  value={pub.description || ''}
                  onChange={(e) => updatePublication(i, { description: e.target.value })}
                  rows={2}
                />
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Patents */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text)]">Patents</h2>
            <Button size="sm" variant="outline" onClick={addPatent} tooltip="Add a new patent">
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {(form.patents || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              No patents added yet.
            </p>
          ) : (
            (form.patents || []).map((pat, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Patent {i + 1}</h4>
                  <Tooltip content="Remove this patent">
                    <button
                      onClick={() => removePatent(i)}
                      className="cursor-pointer text-[var(--error)] hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
                <Input
                  label="Title"
                  value={pat.title}
                  onChange={(e) => updatePatent(i, { title: e.target.value })}
                  required
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    label="Patent Office"
                    value={pat.patentOffice || ''}
                    onChange={(e) => updatePatent(i, { patentOffice: e.target.value })}
                  />
                  <Input
                    label="Patent Number"
                    value={pat.patentNumber || ''}
                    onChange={(e) => updatePatent(i, { patentNumber: e.target.value })}
                  />
                  <Select
                    label="Status"
                    options={toSelectOptions(PATENT_STATUS_LABELS)}
                    value={pat.status || ''}
                    onChange={(v) => updatePatent(i, { status: v as PatentEntry['status'] })}
                    placeholder="Select status"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DatePicker
                    label="Filing Date"
                    value={pat.filingDate || ''}
                    onChange={(val) => updatePatent(i, { filingDate: val })}
                  />
                  <DatePicker
                    label="Issue Date"
                    value={pat.issueDate || ''}
                    onChange={(val) => updatePatent(i, { issueDate: val })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="URL"
                    placeholder="https://..."
                    value={pat.url || ''}
                    onChange={(e) => updatePatent(i, { url: e.target.value })}
                  />
                  <Input
                    label="Inventors"
                    value={pat.inventors || ''}
                    onChange={(e) => updatePatent(i, { inventors: e.target.value })}
                    placeholder="Co-inventors"
                  />
                </div>
                <Textarea
                  label="Description"
                  value={pat.description || ''}
                  onChange={(e) => updatePatent(i, { description: e.target.value })}
                  rows={2}
                />
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
