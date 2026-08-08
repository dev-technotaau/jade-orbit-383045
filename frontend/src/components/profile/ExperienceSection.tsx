'use client';

import { Plus, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import Select, { type SelectOption } from '@/components/ui/Select';
import CurrencySelect from '@/components/ui/CurrencySelect';
import DatePicker from '@/components/ui/DatePicker';
import {
  WORK_STATUS_LABELS,
  NOTICE_PERIOD_LABELS,
  CAREER_BREAK_TYPE_LABELS,
  OPEN_TO_WORK_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  JOB_TYPE_LABELS,
  SALARY_CURRENCY_LABELS,
} from '@/constants/enums';
import type { ProfileSectionProps } from './types';
import type { ExperienceEntry, UpdateCandidateRequest } from '@/types/candidate';

function toSelectOptions(labels: Record<string, string>): SelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

export default function ExperienceSection({ form, updateField }: ProfileSectionProps) {
  // Mirrors the onboarding wizard rule: current-employment fields apply only
  // when the candidate's Work Status is EMPLOYED. For Unemployed / Student /
  // Freelancer (and missing values), we hide currentCompany/currentRole/
  // currentIndustry/currentDepartment/functionalArea/currSalary/noticePeriod/
  // servingNoticePeriod — there's no current job to describe.
  //
  // Past employment (the Experience[] array), Work Status itself, Open to
  // Work, Career Break, Experience Level, Total Experience, expected
  // salaries, and currency remain editable for everyone — those are not
  // tied to a current job.
  //
  // Hidden values are NOT cleared from the form (the user may later flip
  // back to EMPLOYED, and we don't want to silently nuke their data).
  const showCurrentEmployment = form.workStatus === 'EMPLOYED';

  const addExperience = () => {
    const newExp: ExperienceEntry = { company: '', role: '', startDate: '' };
    updateField('experience', [...(form.experience || []), newExp]);
  };

  const updateExperience = (index: number, updates: Partial<ExperienceEntry>) => {
    const updated = [...(form.experience || [])];
    updated[index] = { ...updated[index], ...updates };
    updateField('experience', updated);
  };

  const removeExperience = (index: number) => {
    updateField(
      'experience',
      (form.experience || []).filter((_, i) => i !== index),
    );
  };

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text)]">Work Experience</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={addExperience}
            tooltip="Add a new work experience entry"
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div
          className={`grid gap-4 ${
            showCurrentEmployment ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2'
          }`}
        >
          <Input
            label="Total Experience (years)"
            type="number"
            value={form.experienceYears?.toString() || '0'}
            onChange={(e) => updateField('experienceYears', parseInt(e.target.value) || 0)}
          />
          <Select
            label="Experience Level"
            options={toSelectOptions(EXPERIENCE_LEVEL_LABELS).filter((o) => o.value !== 'FRESHER')}
            value={form.experienceLevel || ''}
            onChange={(v) =>
              updateField('experienceLevel', v as UpdateCandidateRequest['experienceLevel'])
            }
            placeholder="Select level"
          />
          {showCurrentEmployment && (
            <>
              <ServerSuggestionInput
                category="company"
                label="Current Company"
                value={form.currentCompany || ''}
                onChange={(val) => updateField('currentCompany', val)}
              />
              <ServerSuggestionInput
                category="role_category"
                label="Current Role"
                value={form.currentRole || ''}
                onChange={(val) => updateField('currentRole', val)}
              />
            </>
          )}
        </div>
        {showCurrentEmployment && (
          <div className="grid gap-4 sm:grid-cols-3">
            <ServerSuggestionInput
              category="industry"
              label="Current Industry"
              value={form.currentIndustry || ''}
              onChange={(val) => updateField('currentIndustry', val)}
            />
            <ServerSuggestionInput
              category="department"
              label="Current Department"
              value={form.currentDepartment || ''}
              onChange={(val) => updateField('currentDepartment', val)}
            />
            <ServerSuggestionInput
              category="department"
              label="Functional Area"
              value={form.functionalArea || ''}
              onChange={(val) => updateField('functionalArea', val)}
            />
          </div>
        )}
        <div
          className={`grid gap-4 ${showCurrentEmployment ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
        >
          <Select
            label="Work Status"
            options={toSelectOptions(WORK_STATUS_LABELS)}
            value={form.workStatus || ''}
            onChange={(v) => updateField('workStatus', v as UpdateCandidateRequest['workStatus'])}
            placeholder="Select status"
          />
          {showCurrentEmployment && (
            <Select
              label="Notice Period"
              options={toSelectOptions(NOTICE_PERIOD_LABELS)}
              value={form.noticePeriod || ''}
              onChange={(v) =>
                updateField('noticePeriod', v as UpdateCandidateRequest['noticePeriod'])
              }
              placeholder="Select period"
            />
          )}
          <Select
            label="Open to Work"
            options={toSelectOptions(OPEN_TO_WORK_LABELS)}
            value={form.openToWork || ''}
            onChange={(v) => updateField('openToWork', v as UpdateCandidateRequest['openToWork'])}
            placeholder="Select status"
          />
        </div>
        <div
          className={`grid gap-4 ${
            showCurrentEmployment ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'
          }`}
        >
          <CurrencySelect
            label="Currency"
            value={form.salaryCurrency || ''}
            onChange={(v) => updateField('salaryCurrency', v)}
            placeholder="Select currency"
          />
          {showCurrentEmployment && (
            <Input
              label="Current Salary (Annual)"
              type="number"
              placeholder="e.g. 1200000"
              value={form.currSalary?.toString() || ''}
              onChange={(e) => updateField('currSalary', parseInt(e.target.value) || undefined)}
            />
          )}
          <Input
            label="Expected Min Salary"
            type="number"
            placeholder="e.g. 1500000"
            value={form.expectedSalaryMin?.toString() || ''}
            onChange={(e) =>
              updateField('expectedSalaryMin', parseInt(e.target.value) || undefined)
            }
          />
          <Input
            label="Expected Max Salary"
            type="number"
            placeholder="e.g. 2500000"
            value={form.expectedSalaryMax?.toString() || ''}
            onChange={(e) =>
              updateField('expectedSalaryMax', parseInt(e.target.value) || undefined)
            }
          />
        </div>
        {showCurrentEmployment && (
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.servingNoticePeriod || false}
              onChange={(e) => updateField('servingNoticePeriod', e.target.checked)}
              className="text-primary h-4 w-4 rounded border-[var(--border)]"
            />
            <span className="text-sm text-[var(--text)]">Currently Serving Notice Period</span>
          </label>
        )}
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={form.hasCareerBreak || false}
            onChange={(e) => updateField('hasCareerBreak', e.target.checked)}
            className="text-primary h-4 w-4 rounded border-[var(--border)]"
          />
          <span className="text-sm text-[var(--text)]">Career Break</span>
        </label>
        {form.hasCareerBreak && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Career Break Type"
              options={toSelectOptions(CAREER_BREAK_TYPE_LABELS)}
              value={form.careerBreakType || ''}
              onChange={(v) =>
                updateField('careerBreakType', v as UpdateCandidateRequest['careerBreakType'])
              }
              placeholder="Select type"
            />
            <Input
              label="Reason"
              value={form.careerBreakReason || ''}
              onChange={(e) => updateField('careerBreakReason', e.target.value)}
              placeholder="Brief reason"
            />
          </div>
        )}

        {/* Experience Entries */}
        {(form.experience || []).map((exp, i) => (
          <div key={i} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-[var(--text)]">Experience {i + 1}</h4>
              <Tooltip content="Remove this experience entry">
                <button
                  onClick={() => removeExperience(i)}
                  className="cursor-pointer text-[var(--error)] hover:text-[var(--error-dark)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ServerSuggestionInput
                category="company"
                label="Company"
                value={exp.company}
                onChange={(val) => updateExperience(i, { company: val })}
                required
              />
              <ServerSuggestionInput
                category="role_category"
                label="Job Title"
                value={exp.role}
                onChange={(val) => updateExperience(i, { role: val })}
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <ServerSuggestionInput
                category="location"
                label="Location"
                value={exp.location || ''}
                onChange={(val) => updateExperience(i, { location: val })}
              />
              <ServerSuggestionInput
                category="industry"
                label="Industry"
                value={exp.industry || ''}
                onChange={(val) => updateExperience(i, { industry: val })}
              />
              <ServerSuggestionInput
                category="department"
                label="Department"
                value={exp.department || ''}
                onChange={(val) => updateExperience(i, { department: val })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label="Employment Type"
                options={toSelectOptions(JOB_TYPE_LABELS)}
                value={exp.employmentType || ''}
                onChange={(v) => updateExperience(i, { employmentType: v })}
                placeholder="Select type"
              />
              <DatePicker
                label="Start Date"
                mode="month"
                value={exp.startDate}
                onChange={(val) => updateExperience(i, { startDate: val })}
                required
              />
              <DatePicker
                label="End Date"
                mode="month"
                value={exp.endDate || ''}
                onChange={(val) => updateExperience(i, { endDate: val })}
                disabled={exp.isCurrent}
                helperText={exp.isCurrent ? 'Present' : ''}
              />
            </div>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={exp.isCurrent || false}
                onChange={(e) =>
                  updateExperience(i, {
                    isCurrent: e.target.checked,
                    endDate: e.target.checked ? undefined : exp.endDate,
                  })
                }
                className="text-primary h-4 w-4 rounded border-[var(--border)]"
              />
              <span className="text-sm text-[var(--text)]">I currently work here</span>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Team Size"
                type="number"
                value={exp.teamSize?.toString() || ''}
                onChange={(e) =>
                  updateExperience(i, { teamSize: parseInt(e.target.value) || undefined })
                }
              />
              <ServerSuggestionInput
                category="role_category"
                label="Reporting To"
                value={exp.reportingTo || ''}
                onChange={(val) => updateExperience(i, { reportingTo: val })}
              />
              <Input
                label="Annual CTC"
                type="number"
                placeholder="e.g. 1200000"
                value={exp.annualCtc?.toString() || ''}
                onChange={(e) =>
                  updateExperience(i, { annualCtc: parseInt(e.target.value) || undefined })
                }
              />
            </div>
            <Textarea
              label="Description"
              value={exp.description || ''}
              onChange={(e) => updateExperience(i, { description: e.target.value })}
              rows={2}
            />
            <Textarea
              label="Key Achievements"
              value={(exp.keyAchievements || []).join('\n')}
              onChange={(e) =>
                updateExperience(i, { keyAchievements: e.target.value.split('\n').filter(Boolean) })
              }
              rows={2}
              helperText="One achievement per line"
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
