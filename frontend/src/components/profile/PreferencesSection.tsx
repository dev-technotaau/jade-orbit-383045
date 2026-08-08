'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import Select, { type SelectOption } from '@/components/ui/Select';
import Tag from '@/components/ui/Tag';
import DatePicker from '@/components/ui/DatePicker';
import {
  JOB_TYPE_LABELS,
  WORK_MODE_LABELS,
  SHIFT_TYPE_LABELS,
  DISABILITY_TYPE_LABELS,
  DRIVING_LICENSE_TYPE_LABELS,
  VEHICLE_TYPE_LABELS,
} from '@/constants/enums';
import { VISA_STATUS_OPTIONS } from '@/constants/suggestions';
import type { ProfileSectionProps } from './types';
import type { UpdateCandidateRequest } from '@/types/candidate';

function toSelectOptions(labels: Record<string, string>): SelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

export default function PreferencesSection({ form, updateField }: ProfileSectionProps) {
  const [locationInput, setLocationInput] = useState('');
  const [industryInput, setIndustryInput] = useState('');
  const [roleCatInput, setRoleCatInput] = useState('');
  const [blockedCompanyInput, setBlockedCompanyInput] = useState('');

  const addTagItem = (
    field:
      | 'preferredLocations'
      | 'preferredIndustries'
      | 'preferredRoleCategories'
      | 'blockedCompanies',
    val: string,
  ) => {
    const current = (form[field] || []) as string[];
    if (val.trim() && !current.includes(val.trim())) {
      updateField(field, [...current, val.trim()]);
    }
  };
  const removeTagItem = (
    field:
      | 'preferredLocations'
      | 'preferredIndustries'
      | 'preferredRoleCategories'
      | 'blockedCompanies',
    val: string,
  ) => {
    updateField(
      field,
      ((form[field] || []) as string[]).filter((v) => v !== val),
    );
  };

  return (
    <div className="space-y-6">
      <Card header={<h2 className="text-lg font-semibold text-[var(--text)]">Job Preferences</h2>}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Preferred Job Types"
              options={toSelectOptions(JOB_TYPE_LABELS)}
              value={form.preferredJobType || []}
              onChange={(v) =>
                updateField('preferredJobType', v as UpdateCandidateRequest['preferredJobType'])
              }
              multiple
              placeholder="Select job types"
            />
            <Select
              label="Preferred Work Mode"
              options={toSelectOptions(WORK_MODE_LABELS)}
              value={form.preferredWorkMode || []}
              onChange={(v) =>
                updateField('preferredWorkMode', v as UpdateCandidateRequest['preferredWorkMode'])
              }
              multiple
              placeholder="Select work modes"
            />
            <Select
              label="Preferred Shift"
              options={toSelectOptions(SHIFT_TYPE_LABELS)}
              value={form.preferredShift || ''}
              onChange={(v) =>
                updateField('preferredShift', v as UpdateCandidateRequest['preferredShift'])
              }
              placeholder="Select shift"
            />
          </div>

          {/* Preferred Locations */}
          <div>
            <ServerSuggestionInput
              category="location"
              label="Preferred Locations"
              placeholder="Type a city to add..."
              value={locationInput}
              onChange={setLocationInput}
              onSelect={(val) => {
                addTagItem('preferredLocations', val);
                setLocationInput('');
              }}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(form.preferredLocations || []).map((loc) => (
                <Tag
                  key={loc}
                  label={loc}
                  variant="primary"
                  onRemove={() => removeTagItem('preferredLocations', loc)}
                />
              ))}
            </div>
          </div>

          {/* Preferred Industries */}
          <div>
            <ServerSuggestionInput
              category="industry"
              label="Preferred Industries"
              placeholder="Type an industry to add..."
              value={industryInput}
              onChange={setIndustryInput}
              onSelect={(val) => {
                addTagItem('preferredIndustries', val);
                setIndustryInput('');
              }}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(form.preferredIndustries || []).map((ind) => (
                <Tag
                  key={ind}
                  label={ind}
                  variant="primary"
                  onRemove={() => removeTagItem('preferredIndustries', ind)}
                />
              ))}
            </div>
          </div>

          {/* Preferred Role Categories */}
          <div>
            <ServerSuggestionInput
              category="role_category"
              label="Preferred Role Categories"
              placeholder="Type a role to add..."
              value={roleCatInput}
              onChange={setRoleCatInput}
              onSelect={(val) => {
                addTagItem('preferredRoleCategories', val);
                setRoleCatInput('');
              }}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(form.preferredRoleCategories || []).map((role) => (
                <Tag
                  key={role}
                  label={role}
                  variant="primary"
                  onRemove={() => removeTagItem('preferredRoleCategories', role)}
                />
              ))}
            </div>
          </div>

          <DatePicker
            label="Date of Availability"
            value={form.dateOfAvailability || ''}
            onChange={(val) => updateField('dateOfAvailability', val)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Travel Willingness (%)"
              type="number"
              placeholder="0-100"
              value={form.travelWillingnessPercent?.toString() || ''}
              onChange={(e) =>
                updateField('travelWillingnessPercent', parseInt(e.target.value) || undefined)
              }
            />
            <Select
              label="Visa Status"
              options={VISA_STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
              value={form.visaStatus || ''}
              onChange={(v) => updateField('visaStatus', v)}
              placeholder="Select visa status"
            />
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={form.willingToRelocate || false}
              onChange={(e) => updateField('willingToRelocate', e.target.checked)}
              className="text-primary h-4 w-4 rounded border-[var(--border)]"
            />
            <span className="text-sm text-[var(--text)]">Willing to Relocate</span>
          </label>
        </div>
      </Card>

      <Card
        header={<h2 className="text-lg font-semibold text-[var(--text)]">Documents & Status</h2>}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Passport Number"
              value={form.passportNumber || ''}
              onChange={(e) => updateField('passportNumber', e.target.value)}
            />
            <DatePicker
              label="Passport Expiry Date"
              value={form.passportExpiryDate || ''}
              onChange={(val) => updateField('passportExpiryDate', val)}
            />
          </div>
          <ServerSuggestionInput
            category="visa_status"
            label="Work Permit Status"
            value={form.workPermitStatus || ''}
            onChange={(v) => updateField('workPermitStatus', v)}
            onSelect={(v) => updateField('workPermitStatus', v)}
            placeholder="e.g. Indian Citizen, H-1B Visa"
          />
          <Input
            label="Video Resume URL"
            value={form.videoResumeUrl || ''}
            onChange={(e) => updateField('videoResumeUrl', e.target.value)}
            placeholder="https://youtube.com/..."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Driving License Type"
              options={toSelectOptions(DRIVING_LICENSE_TYPE_LABELS)}
              value={form.drivingLicenseType || ''}
              onChange={(v) =>
                updateField('drivingLicenseType', v as UpdateCandidateRequest['drivingLicenseType'])
              }
              placeholder="Select license type"
            />
            <div />
          </div>
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.ownVehicle || false}
                onChange={(e) => {
                  updateField('ownVehicle', e.target.checked);
                  if (!e.target.checked) updateField('vehicleTypes', []);
                }}
                className="text-primary h-4 w-4 rounded border-[var(--border)]"
              />
              <span className="text-sm text-[var(--text)]">Own Vehicle</span>
            </label>
            {form.ownVehicle && (
              <div className="ml-7">
                <Select
                  label="Vehicle Type(s)"
                  options={toSelectOptions(VEHICLE_TYPE_LABELS)}
                  value={form.vehicleTypes || []}
                  onChange={(v) =>
                    updateField('vehicleTypes', v as UpdateCandidateRequest['vehicleTypes'])
                  }
                  multiple
                  placeholder="Select vehicle types"
                />
              </div>
            )}
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.isVeteran || false}
                onChange={(e) => updateField('isVeteran', e.target.checked)}
                className="text-primary h-4 w-4 rounded border-[var(--border)]"
              />
              <span className="text-sm text-[var(--text)]">Veteran</span>
            </label>
            <div>
              <label className="mb-3 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.isPhysicallyChallenged || false}
                  onChange={(e) => updateField('isPhysicallyChallenged', e.target.checked)}
                  className="text-primary h-4 w-4 rounded border-[var(--border)]"
                />
                <span className="text-sm text-[var(--text)]">Person with Disability</span>
              </label>
              {form.isPhysicallyChallenged && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    label="Disability Type"
                    options={toSelectOptions(DISABILITY_TYPE_LABELS)}
                    value={form.disabilityType || ''}
                    onChange={(v) =>
                      updateField('disabilityType', v as UpdateCandidateRequest['disabilityType'])
                    }
                    placeholder="Select type"
                  />
                  <Input
                    label="Disability Percentage"
                    type="number"
                    placeholder="e.g. 40"
                    value={form.disabilityPercentage?.toString() || ''}
                    onChange={(e) =>
                      updateField('disabilityPercentage', parseInt(e.target.value) || undefined)
                    }
                  />
                </div>
              )}
            </div>
          </div>

          {/* Blocked Companies */}
          <div>
            <ServerSuggestionInput
              category="company"
              label="Blocked Companies"
              placeholder="Companies you don't want to see your profile..."
              value={blockedCompanyInput}
              onChange={setBlockedCompanyInput}
              onSelect={(val) => {
                addTagItem('blockedCompanies', val);
                setBlockedCompanyInput('');
              }}
              helperText="These companies won't see your profile in search"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(form.blockedCompanies || []).map((c) => (
                <Tag
                  key={c}
                  label={c}
                  variant="outline"
                  onRemove={() => removeTagItem('blockedCompanies', c)}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
