'use client';

import { Plus, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import Input from '@/components/ui/Input';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import Select, { type SelectOption } from '@/components/ui/Select';
import DatePicker from '@/components/ui/DatePicker';
import {
  COURSE_TYPE_LABELS,
  GRADE_TYPE_LABELS,
  EDUCATION_LEVEL_LABELS,
  SPECIFIC_DEGREE_LABELS,
  EDUCATION_BOARD_LABELS,
  TWELFTH_STREAM_LABELS,
  getDegreesForLevel,
  getLevelsAtOrBelow,
} from '@/constants/enums';
import { INDIAN_STATES } from '@/constants/suggestions';
import { resetEducationEntryForLevel } from '@/utils/education';
import type { ProfileSectionProps } from './types';
import type { EducationEntry, UpdateCandidateRequest } from '@/types/candidate';

function toSelectOptions(labels: Record<string, string>): SelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

export default function EducationSection({ form, updateField }: ProfileSectionProps) {
  const addEducation = () => {
    const newEd: EducationEntry = {
      educationLevel: '',
      institution: '',
      degree: '',
      field: '',
      startDate: '',
    };
    updateField('education', [...(form.education || []), newEd]);
  };

  const updateEducation = (index: number, updates: Partial<EducationEntry>) => {
    const updated = [...(form.education || [])];
    updated[index] = { ...updated[index], ...updates };
    updateField('education', updated);
  };

  const removeEducation = (index: number) => {
    updateField(
      'education',
      (form.education || []).filter((_, i) => i !== index),
    );
  };

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text)]">Education</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={addEducation}
            tooltip="Add a new education entry"
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Education Summary */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Highest Education Level"
            options={toSelectOptions(EDUCATION_LEVEL_LABELS)}
            value={form.highestEducationLevel || ''}
            onChange={(v) => {
              const level = v as string;
              const degreeOptions = getDegreesForLevel(level);
              const currentDegreeValid = degreeOptions.some((d) => d.value === form.highestDegree);
              updateField(
                'highestEducationLevel',
                level as UpdateCandidateRequest['highestEducationLevel'],
              );
              if (!currentDegreeValid) {
                updateField('highestDegree', undefined);
              }
            }}
            placeholder="Select level"
          />
          <Select
            label="Highest Degree"
            options={getDegreesForLevel(form.highestEducationLevel || '')}
            value={form.highestDegree || ''}
            onChange={(v) =>
              updateField('highestDegree', v as UpdateCandidateRequest['highestDegree'])
            }
            placeholder={
              !form.highestEducationLevel
                ? 'Select education level first'
                : getDegreesForLevel(form.highestEducationLevel).length === 0
                  ? 'Not applicable for this level'
                  : 'Select degree'
            }
            disabled={
              !form.highestEducationLevel ||
              getDegreesForLevel(form.highestEducationLevel).length === 0
            }
          />
        </div>

        {(form.education || []).length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            No education entries. Click &quot;Add&quot; to add your education.
          </p>
        ) : (
          (form.education || []).map((edu, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-[var(--text)]">Education {i + 1}</h4>
                <Tooltip content="Remove this education entry">
                  <button
                    onClick={() => removeEducation(i)}
                    className="cursor-pointer text-[var(--error)] hover:text-[var(--error-dark)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>
              <Select
                label="Education Level"
                options={
                  form.highestEducationLevel
                    ? getLevelsAtOrBelow(form.highestEducationLevel).map((l) => ({
                        value: l,
                        label: EDUCATION_LEVEL_LABELS[l] || l,
                      }))
                    : toSelectOptions(EDUCATION_LEVEL_LABELS)
                }
                value={edu.educationLevel || ''}
                onChange={(v) => {
                  // Reset all entry fields on level change — previous values
                  // (college name, specialization, CGPA, etc.) no longer match
                  // the new context and would mix into the new level's form.
                  const level = v as string;
                  if (level === edu.educationLevel) return;
                  updateEducation(i, resetEducationEntryForLevel(level));
                }}
                placeholder="Select education level"
              />
              <ServerSuggestionInput
                category={
                  edu.educationLevel === 'TENTH' || edu.educationLevel === 'TWELFTH'
                    ? 'school'
                    : 'institution'
                }
                label="Institution"
                value={edu.institution}
                onChange={(val) => updateEducation(i, { institution: val })}
                required
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {edu.educationLevel === 'TENTH' || edu.educationLevel === 'TWELFTH' ? (
                  <Select
                    label="Board"
                    options={toSelectOptions(EDUCATION_BOARD_LABELS)}
                    value={edu.degree}
                    onChange={(val) =>
                      updateEducation(i, {
                        degree: val as string,
                        boardState: val === 'STATE_BOARD' ? edu.boardState : undefined,
                      })
                    }
                    placeholder="Select board"
                  />
                ) : (
                  <ServerSuggestionInput
                    category="degree"
                    label="Degree"
                    value={edu.degree}
                    onChange={(val) => updateEducation(i, { degree: val })}
                    required
                  />
                )}
                {edu.educationLevel === 'TENTH' ? (
                  <Select
                    label="Medium"
                    options={toSelectOptions(TWELFTH_STREAM_LABELS)}
                    value={edu.field}
                    onChange={(val) => updateEducation(i, { field: val as string })}
                    placeholder="Select medium (optional)"
                  />
                ) : edu.educationLevel === 'TWELFTH' ? (
                  <Select
                    label="Stream"
                    options={toSelectOptions(TWELFTH_STREAM_LABELS)}
                    value={edu.field}
                    onChange={(val) => updateEducation(i, { field: val as string })}
                    placeholder="Select stream"
                  />
                ) : (
                  <ServerSuggestionInput
                    category="field_of_study"
                    label="Field of Study"
                    value={edu.field}
                    onChange={(val) => updateEducation(i, { field: val })}
                    required
                  />
                )}
              </div>
              {edu.degree === 'STATE_BOARD' && (
                <Select
                  label="State"
                  options={INDIAN_STATES.map((s) => ({ value: s, label: s }))}
                  value={edu.boardState || ''}
                  onChange={(val) => updateEducation(i, { boardState: val as string })}
                  placeholder="Select state"
                />
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <DatePicker
                  label="Start Date"
                  mode="month"
                  value={edu.startDate}
                  onChange={(val) => updateEducation(i, { startDate: val })}
                  required
                />
                <DatePicker
                  label="End Date"
                  mode="month"
                  value={edu.endDate || ''}
                  onChange={(val) => updateEducation(i, { endDate: val })}
                />
              </div>
              {edu.educationLevel !== 'TENTH' && edu.educationLevel !== 'TWELFTH' && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Select
                    label="Course Type"
                    options={toSelectOptions(COURSE_TYPE_LABELS)}
                    value={edu.courseType || ''}
                    onChange={(v) =>
                      updateEducation(i, { courseType: v as EducationEntry['courseType'] })
                    }
                    placeholder="Select type"
                  />
                  <ServerSuggestionInput
                    category="field_of_study"
                    label="Specialization"
                    value={edu.specialization || ''}
                    onChange={(v) => updateEducation(i, { specialization: v })}
                    onSelect={(v) => updateEducation(i, { specialization: v })}
                    placeholder="e.g. Machine Learning"
                  />
                  <Select
                    label="Grade Type"
                    options={toSelectOptions(GRADE_TYPE_LABELS)}
                    value={edu.gradeType || ''}
                    onChange={(v) =>
                      updateEducation(i, { gradeType: v as EducationEntry['gradeType'] })
                    }
                    placeholder="Select type"
                  />
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Grade/GPA"
                  value={edu.grade || ''}
                  onChange={(e) => updateEducation(i, { grade: e.target.value })}
                />
                <Input
                  label="Activities"
                  value={edu.activities || ''}
                  onChange={(e) => updateEducation(i, { activities: e.target.value })}
                  placeholder="e.g. Student Council, Sports"
                />
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
