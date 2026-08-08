'use client';

import { Plus, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import DatePicker from '@/components/ui/DatePicker';
import ServerAutoSuggest from '@/components/ui/ServerAutoSuggest';
import type { ProfileSectionProps } from './types';
import type { ProjectEntry } from '@/types/candidate';

export default function ProjectsSection({ form, updateField }: ProfileSectionProps) {
  const addProject = () => {
    const newProj: ProjectEntry = { name: '' };
    updateField('projects', [...(form.projects || []), newProj]);
  };

  const updateProject = (index: number, field: keyof ProjectEntry, value: string | string[]) => {
    const updated = [...(form.projects || [])];
    updated[index] = { ...updated[index], [field]: value };
    updateField('projects', updated);
  };

  const removeProject = (index: number) => {
    updateField(
      'projects',
      (form.projects || []).filter((_, i) => i !== index),
    );
  };

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text)]">Projects</h2>
          <Button size="sm" variant="outline" onClick={addProject} tooltip="Add a new project">
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {(form.projects || []).length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            No projects added. Click &quot;Add&quot; to showcase your work.
          </p>
        ) : (
          (form.projects || []).map((proj, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-[var(--text)]">Project {i + 1}</h4>
                <Tooltip content="Remove this project">
                  <button
                    onClick={() => removeProject(i)}
                    className="cursor-pointer text-[var(--error)] hover:text-[var(--error-dark)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Project Name"
                  value={proj.name}
                  onChange={(e) => updateProject(i, 'name', e.target.value)}
                  required
                />
                <Input
                  label="Project URL"
                  placeholder="https://..."
                  value={proj.url || ''}
                  onChange={(e) => updateProject(i, 'url', e.target.value)}
                />
              </div>
              <Textarea
                label="Description"
                value={proj.description || ''}
                onChange={(e) => updateProject(i, 'description', e.target.value)}
                rows={2}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <DatePicker
                  label="Start Date"
                  mode="month"
                  value={proj.startDate || ''}
                  onChange={(val) => updateProject(i, 'startDate', val)}
                />
                <DatePicker
                  label="End Date"
                  mode="month"
                  value={proj.endDate || ''}
                  onChange={(val) => updateProject(i, 'endDate', val)}
                />
              </div>
              <ServerAutoSuggest
                category="skill"
                label="Technologies"
                placeholder="Add technology..."
                multiple
                allowCreate
                value={proj.technologies || []}
                onChange={(v) => updateProject(i, 'technologies', v as string[])}
              />
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
