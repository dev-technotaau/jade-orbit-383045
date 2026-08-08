'use client';

import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, X, Plus } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PhoneInput from '@/components/ui/PhoneInput';
import ServerAutoSuggest from '@/components/ui/ServerAutoSuggest';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import DatePicker from '@/components/ui/DatePicker';
import Textarea from '@/components/ui/Textarea';
import Select, { type SelectOption } from '@/components/ui/Select';
import CurrencySelect from '@/components/ui/CurrencySelect';
import Switch from '@/components/ui/Switch';
import Tag from '@/components/ui/Tag';
import Skeleton from '@/components/ui/Skeleton';
import RichTextEditor from '@/components/ui/RichTextEditor';
import ScreeningQuestionBuilder from '@/components/ui/ScreeningQuestionBuilder';
import { showToast } from '@/components/ui/Toast';
import LockBanner, { StaleWriteNotice } from '@/components/admin/LockBanner';
import { useResourceLock } from '@/hooks/use-resource-lock';
import { superAdminJobService } from '@/services/super-admin-jobs.service';
import { ROUTES } from '@/constants/routes';
import {
  JOB_TYPE_LABELS,
  WORK_MODE_LABELS,
  SHIFT_TYPE_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  EDUCATION_LEVEL_LABELS,
  SALARY_TYPE_LABELS,
  URGENCY_LEVEL_LABELS,
  FUNCTIONAL_AREA_LABELS,
  NOTICE_PERIOD_PREFERENCE_LABELS,
  GENDER_PREFERENCE_LABELS,
  DRIVING_LICENSE_TYPE_LABELS,
  POSTING_VISIBILITY_LABELS,
  APPLY_METHOD_LABELS,
  SPECIFIC_DEGREE_LABELS,
  DIVERSITY_TAG_OPTIONS,
  SALARY_CURRENCY_LABELS,
  getDegreesForLevel,
} from '@/constants/enums';
import { formatSalaryAsLPA } from '@/utils/format';
import type { UpdateJobRequest, ScreeningQuestionInput } from '@/types/job';
import type { ApiError } from '@/types/api';

function toSelectOptions(labels: Record<string, string>): SelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

const jobTypeOptions = toSelectOptions(JOB_TYPE_LABELS);
const workModeOptions = toSelectOptions(WORK_MODE_LABELS);
const shiftTypeOptions = toSelectOptions(SHIFT_TYPE_LABELS);
const experienceLevelOptions = toSelectOptions(EXPERIENCE_LEVEL_LABELS);
const educationLevelOptions = toSelectOptions(EDUCATION_LEVEL_LABELS);
const salaryTypeOptions = toSelectOptions(SALARY_TYPE_LABELS);
const urgencyLevelOptions = toSelectOptions(URGENCY_LEVEL_LABELS);
const functionalAreaOptions = toSelectOptions(FUNCTIONAL_AREA_LABELS);
const genderPreferenceOptions = toSelectOptions(GENDER_PREFERENCE_LABELS);
const drivingLicenseOptions = toSelectOptions(DRIVING_LICENSE_TYPE_LABELS);
const postingVisibilityOptions = toSelectOptions(POSTING_VISIBILITY_LABELS);
const applyMethodOptions = toSelectOptions(APPLY_METHOD_LABELS);
const specificDegreeOptions = toSelectOptions(SPECIFIC_DEGREE_LABELS);

export default function EditJobPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<UpdateJobRequest>({});
  const [tagInput, setTagInput] = useState('');
  const [screeningQuestions, setScreeningQuestions] = useState<ScreeningQuestionInput[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Super-admin posts on behalf of any company (incl. consultancies), so the
  // "client company" field is always available.
  const isConsultancy = true;

  const { data: jobData, isLoading } = useQuery({
    queryKey: ['super-admin-job', id],
    queryFn: () => superAdminJobService.getJob(id),
    enabled: !!id,
  });

  /**
   * Concurrency for a record several admins can reach at once.
   *
   * Two independent mechanisms, doing different jobs:
   *   • The soft lock (below) makes the collision VISIBLE — presence
   *     badges, and read-only mode while someone else is editing.
   *   • `expectedUpdatedAt` on the save makes it SAFE — the server refuses
   *     a write whose base version has moved, even if the lock had expired
   *     or was never taken.
   *
   * The lock alone would not be enough (a closed laptop releases it, a
   * second tab bypasses it); the version check alone would work but would
   * only tell you after ten minutes of wasted typing.
   */
  const lock = useResourceLock('JobPost', id);
  const [staleConflict, setStaleConflict] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: UpdateJobRequest & { expectedUpdatedAt?: string }) =>
      superAdminJobService.updateJob(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-job', id] });
      showToast.success('Job updated successfully');
      // Release the exclusive hold so a colleague can edit immediately
      // rather than waiting out the TTL.
      editHeld.current = false;
      void lock.endEdit();
      router.push(ROUTES.SUPER_ADMIN.JOB_DETAIL(id));
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      if (error.code === 'STALE_WRITE') {
        // Someone saved while this form was open. Nothing was written —
        // show the reload/overwrite choice rather than a generic toast.
        setStaleConflict(true);
        return;
      }
      showToast.error(error.message || 'Failed to update job');
    },
  });

  const job = jobData?.data;

  // Populate form when job data loads
  useEffect(() => {
    if (job && !initialized) {
      setForm({
        title: job.title || '',
        description: job.description || '',
        keyResponsibilities: job.keyResponsibilities || '',
        requirements: job.requirements || '',
        benefits: job.benefits || '',
        interviewProcess: job.interviewProcess || '',
        location: job.location || '',
        type: job.type || undefined,
        workMode: job.workMode || undefined,
        shiftType: job.shiftType || undefined,
        industry: job.industry || '',
        department: job.department || '',
        experienceMin: job.experienceMin ?? 0,
        experienceMax: job.experienceMax ?? undefined,
        experienceLevel: job.experienceLevel || undefined,
        educationRequired: job.educationRequired || undefined,
        preferredEducationField: job.preferredEducationField || '',
        roleCategory: job.roleCategory || '',
        numberOfOpenings: job.numberOfOpenings ?? undefined,
        salaryMin: job.salaryMin != null ? Number(job.salaryMin) : undefined,
        salaryMax: job.salaryMax != null ? Number(job.salaryMax) : undefined,
        salaryType: job.salaryType || undefined,
        currency: job.currency || '',
        salaryDisclosed: job.salaryDisclosed ?? true,
        isRemote: job.isRemote ?? false,
        relocationAssistance: job.relocationAssistance ?? false,
        travelRequired: job.travelRequired ?? false,
        isWalkIn: job.isWalkIn ?? false,
        contactPerson: job.contactPerson || '',
        contactEmail: job.contactEmail || '',
        contactPhone: job.contactPhone || '',
        skillsRequired: job.skillsRequired || [],
        niceToHaveSkills: job.niceToHaveSkills || [],
        certificationsRequired: job.certificationsRequired || [],
        languagesRequired: job.languagesRequired || [],
        tags: job.tags || [],
        jobPerks: job.jobPerks || [],
        urgencyLevel: job.urgencyLevel || undefined,
        applicationDeadline: job.applicationDeadline ? job.applicationDeadline.slice(0, 16) : '',
        isFeatured: job.isFeatured ?? false,
        isPremium: job.isPremium ?? false,
        expiresAt: job.expiresAt || '',
        // Enterprise fields
        functionalArea: job.functionalArea || undefined,
        referenceCode: job.referenceCode || '',
        ugRequired: job.ugRequired || undefined,
        pgRequired: job.pgRequired || undefined,
        specificDegrees: job.specificDegrees || [],
        degreeSpecializations: job.degreeSpecializations || [],
        salaryNegotiable: job.salaryNegotiable ?? false,
        noticePeriodPreference: job.noticePeriodPreference || [],
        isConfidential: job.isConfidential ?? false,
        additionalLocations: job.additionalLocations || [],
        accommodationProvided: job.accommodationProvided ?? false,
        walkInStartDate: job.walkInStartDate ? job.walkInStartDate.slice(0, 16) : '',
        walkInEndDate: job.walkInEndDate ? job.walkInEndDate.slice(0, 16) : '',
        walkInTime: job.walkInTime || '',
        walkInVenue: job.walkInVenue || '',
        walkInContactPerson: job.walkInContactPerson || '',
        walkInContactPhone: job.walkInContactPhone || '',
        walkInInstructions: job.walkInInstructions || '',
        diversityTags: job.diversityTags || [],
        visaSponsorshipAvailable: job.visaSponsorshipAvailable ?? false,
        backgroundCheckRequired: job.backgroundCheckRequired ?? false,
        isPwdFriendly: job.isPwdFriendly ?? false,
        passportRequired: job.passportRequired ?? false,
        bondDetails: job.bondDetails || '',
        drivingLicenseRequired: job.drivingLicenseRequired || undefined,
        ageMin: job.ageMin ?? undefined,
        ageMax: job.ageMax ?? undefined,
        genderPreference: job.genderPreference || undefined,
        postingVisibility: job.postingVisibility || 'PUBLIC',
        applyMethod: job.applyMethod || 'IN_PLATFORM',
        externalApplyUrl: job.externalApplyUrl || '',
        scheduledPublishAt: job.scheduledPublishAt ? job.scheduledPublishAt.split('T')[0] : '',
      });
      setScreeningQuestions(
        (job.screeningQuestions || []).map((q) => ({
          question: q.question,
          questionType: q.questionType,
          isRequired: q.isRequired,
          isDealBreaker: q.isDealBreaker,
          options: q.options || undefined,
          idealAnswer: q.idealAnswer || undefined,
          displayOrder: q.displayOrder,
        })),
      );
      setInitialized(true);
    }
  }, [job, initialized]);

  /**
   * Claim the exclusive EDITING hold lazily, on the first real change.
   *
   * Not on mount: opening a job to LOOK at it should not lock out a
   * colleague. Not only on Save either — by then the other admin has
   * already typed their edit, which is precisely the wasted work the lock
   * exists to prevent. First keystroke is the moment intent becomes real.
   *
   * A ref, not state: `beginEdit` is async and this fires from every field,
   * so a state flag would let a burst of changes each launch a request.
   * The populate effect calls `setForm` directly rather than going through
   * here, so loading the job never trips it.
   */
  const editHeld = useRef(false);

  /**
   * Claim the exclusive hold, shared by every mutating control.
   *
   * Factored out because `handleChange` is not the only entry point: the
   * screening-question builder writes its own state, so an admin who edited
   * only questions never took the lock and a colleague saw no "X is editing
   * this job" badge at all.
   *
   * Un-latches on refusal. If the claim 409s (someone grabbed it a moment
   * earlier) leaving the ref latched meant we never retried — so even after
   * they released, this tab stayed passive and silently editable.
   */
  const claimEdit = (): boolean => {
    if (lock.isReadOnly) return false;
    if (!editHeld.current) {
      editHeld.current = true;
      void lock.beginEdit().then((won) => {
        if (!won) editHeld.current = false;
      });
    }
    return true;
  };

  const handleChange = (field: keyof UpdateJobRequest, value: unknown) => {
    if (!claimEdit()) return;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  type ArrayFieldKey =
    | 'skillsRequired'
    | 'niceToHaveSkills'
    | 'certificationsRequired'
    | 'tags'
    | 'jobPerks'
    | 'languagesRequired'
    | 'additionalLocations'
    | 'degreeSpecializations'
    | 'diversityTags'
    | 'specificDegrees'
    | 'noticePeriodPreference';

  const addToArray = (key: ArrayFieldKey, value: string, clearFn: (v: string) => void) => {
    const trimmed = value.trim();
    const arr = (form[key] || []) as string[];
    if (trimmed && !arr.includes(trimmed)) {
      handleChange(key, [...arr, trimmed]);
      clearFn('');
    }
  };

  const removeFromArray = (key: ArrayFieldKey, value: string) => {
    handleChange(
      key,
      ((form[key] || []) as string[]).filter((v) => v !== value),
    );
  };

  const handleAddTag = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addToArray('tags', tagInput, setTagInput);
    }
  };

  const handleRemoveTag = (tag: string) => {
    removeFromArray('tags', tag);
  };

  const handleSubmit = (forceOverwrite = false) => {
    if (!form.title?.trim()) {
      showToast.error('Job title is required');
      return;
    }
    if (!form.description?.trim()) {
      showToast.error('Job description is required');
      return;
    }
    if (!form.location?.trim()) {
      showToast.error('Location is required');
      return;
    }
    if (!form.skillsRequired || form.skillsRequired.length === 0) {
      showToast.error('At least one required skill is needed');
      return;
    }
    // Validate expiresAt is after applicationDeadline
    if (form.expiresAt && form.applicationDeadline) {
      if (new Date(form.expiresAt) < new Date(form.applicationDeadline)) {
        showToast.error('Job expiration date must be after application deadline');
        return;
      }
    }
    const payload = {
      ...form,
      applicationDeadline: form.applicationDeadline
        ? new Date(form.applicationDeadline).toISOString()
        : undefined,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
      walkInStartDate: form.walkInStartDate
        ? new Date(form.walkInStartDate).toISOString()
        : undefined,
      walkInEndDate: form.walkInEndDate ? new Date(form.walkInEndDate).toISOString() : undefined,
      scheduledPublishAt: form.scheduledPublishAt
        ? new Date(form.scheduledPublishAt).toISOString()
        : undefined,
      screeningQuestions: screeningQuestions.length > 0 ? screeningQuestions : undefined,
      // The version this form was loaded from. Omitted on an explicit
      // overwrite (see the conflict banner), which is the one case where
      // clobbering the other edit is the user's deliberate choice.
      expectedUpdatedAt: forceOverwrite ? undefined : job?.updatedAt,
    };
    updateMutation.mutate(payload);
  };

  if (isLoading) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="jobs.authoring.edit"
      >
        <div className="space-y-6">
          <Skeleton variant="line" width="200px" height="32px" />
          <Skeleton variant="rect" height="400px" />
        </div>
      </DashboardLayout>
    );
  }

  if (!job) {
    return (
      <DashboardLayout
        requiredRole={['ADMIN', 'SUPER_ADMIN']}
        requiredPermission="jobs.authoring.edit"
      >
        <div className="flex flex-col items-center justify-center py-20">
          <h2 className="text-lg font-semibold text-[var(--text)]">Job not found</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            The job you are trying to edit does not exist.
          </p>
          <Tooltip content="Return to your job listings">
            <Link href={ROUTES.SUPER_ADMIN.JOBS} className="mt-4">
              <Button variant="outline" size="sm">
                Back to My Jobs
              </Button>
            </Link>
          </Tooltip>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="jobs.authoring.edit"
    >
      <div className="space-y-6">
        {/* Back Button */}
        <Tooltip content="Return to job details">
          <Link
            href={ROUTES.SUPER_ADMIN.JOB_DETAIL(id)}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Job Details
          </Link>
        </Tooltip>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Edit Job (Admin)</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Update your job listing details</p>
          </div>
          <Button
            leftIcon={<Save className="h-4 w-4" />}
            onClick={() => handleSubmit()}
            isLoading={updateMutation.isPending}
            disabled={lock.isReadOnly}
            tooltip={
              lock.isReadOnly
                ? 'Another admin is editing this job — take over to make changes'
                : 'Save all changes to this job'
            }
          >
            Save Changes
          </Button>
        </div>

        {/* Who else is here, and who changed this recently. */}
        <LockBanner lock={lock} entityLabel="job" />

        {/* Shown only after a save was refused for being out of date. */}
        {staleConflict && (
          <StaleWriteNotice
            entityLabel="job"
            onReload={() => {
              setStaleConflict(false);
              void queryClient.invalidateQueries({ queryKey: ['super-admin-job', id] });
              window.location.reload();
            }}
            onOverwrite={() => {
              setStaleConflict(false);
              handleSubmit(true);
            }}
          />
        )}

        {/*
          Read-only mode while another admin holds the edit lock.

          A native <fieldset disabled> is what the requirement asks for —
          the whole FORM goes inert, not just the Save button. Disabling
          only Save lets someone type a full edit and discover it is
          unsavable at the very end, which is the wasted work the lock is
          meant to prevent.

          `fieldset[disabled]` does not reach TipTap (it is contentEditable,
          not a form control), so RichTextEditor takes its own `disabled`
          prop; and the chip/tag <button> toggles are covered by the
          `lock.isReadOnly` early-return in `handleChange`.
        */}
        <fieldset
          disabled={lock.isReadOnly}
          className="space-y-6 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {/* Basic Info */}
          <Card>
            <h2 className="mb-4 text-base font-semibold text-[var(--text)]">Basic Information</h2>
            <div className="space-y-4">
              <ServerSuggestionInput
                category="job_title"
                label="Job Title"
                required
                value={form.title || ''}
                onChange={(val) => handleChange('title', val)}
                placeholder="e.g. Senior Software Engineer"
              />
              {isConsultancy && (
                <Input
                  label="Client Company"
                  placeholder="Company this role is for (visible to candidates)"
                  value={form.clientCompanyName || ''}
                  onChange={(e) => handleChange('clientCompanyName', e.target.value)}
                  helperText="The actual company the candidate will work for"
                />
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Experience Level"
                  options={experienceLevelOptions}
                  value={form.experienceLevel || ''}
                  onChange={(val) => handleChange('experienceLevel', val || undefined)}
                  placeholder="Select level"
                />
                <Select
                  label="Education Required"
                  options={educationLevelOptions}
                  value={form.educationRequired || ''}
                  onChange={(val) => {
                    handleChange('educationRequired', val || undefined);
                    const allowed = getDegreesForLevel(val as string).map((d) => d.value);
                    if (allowed.length === 0) {
                      handleChange('specificDegrees', []);
                    } else {
                      handleChange(
                        'specificDegrees',
                        (form.specificDegrees || []).filter((d) => allowed.includes(d as string)),
                      );
                    }
                  }}
                  placeholder="Select level"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ServerAutoSuggest
                  label="Preferred Education Field"
                  placeholder="e.g. Computer Science, MBA"
                  value={form.preferredEducationField || ''}
                  onChange={(v) => handleChange('preferredEducationField', v as string)}
                  category="field_of_study"
                  allowCreate
                />
                <ServerAutoSuggest
                  label="Role Category"
                  placeholder="e.g. Engineering, Marketing"
                  value={form.roleCategory || ''}
                  onChange={(v) => handleChange('roleCategory', v as string)}
                  category="role_category"
                  allowCreate
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ServerAutoSuggest
                  label="Industry"
                  placeholder="e.g. Information Technology"
                  value={form.industry || ''}
                  onChange={(v) => handleChange('industry', v as string)}
                  category="industry"
                  allowCreate
                />
                <ServerAutoSuggest
                  label="Department"
                  placeholder="e.g. Engineering"
                  value={form.department || ''}
                  onChange={(v) => handleChange('department', v as string)}
                  category="department"
                  allowCreate
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Number of Openings"
                  type="number"
                  placeholder="1"
                  value={form.numberOfOpenings?.toString() || ''}
                  onChange={(e) =>
                    handleChange(
                      'numberOfOpenings',
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  min={1}
                />
                <Input
                  label="Reference Code"
                  placeholder="e.g. JOB-2026-001"
                  value={form.referenceCode || ''}
                  onChange={(e) => handleChange('referenceCode', e.target.value)}
                />
              </div>
              <Select
                label="Functional Area"
                options={functionalAreaOptions}
                value={form.functionalArea || ''}
                onChange={(val) => handleChange('functionalArea', val || undefined)}
                placeholder="Select functional area"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="UG Required"
                  options={educationLevelOptions}
                  value={form.ugRequired || ''}
                  onChange={(val) => handleChange('ugRequired', val || undefined)}
                  placeholder="Select UG level"
                />
                <Select
                  label="PG Required"
                  options={educationLevelOptions}
                  value={form.pgRequired || ''}
                  onChange={(val) => handleChange('pgRequired', val || undefined)}
                  placeholder="Select PG level"
                />
              </div>
              {/* Specific Degrees */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                  Specific Degrees
                  {(!form.educationRequired ||
                    getDegreesForLevel(form.educationRequired).length === 0) && (
                    <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">
                      {!form.educationRequired
                        ? '(select education level first)'
                        : '(not applicable for this level)'}
                    </span>
                  )}
                </label>
                <div className="mb-2 flex flex-wrap gap-2">
                  {(form.educationRequired && getDegreesForLevel(form.educationRequired).length > 0
                    ? getDegreesForLevel(form.educationRequired)
                    : specificDegreeOptions
                  ).map((opt) => (
                    <Tooltip key={opt.value} content={`Toggle ${opt.label}`}>
                      <button
                        type="button"
                        onClick={() => {
                          const arr = form.specificDegrees || [];
                          if (arr.includes(opt.value as never)) {
                            handleChange(
                              'specificDegrees',
                              arr.filter((d) => d !== opt.value),
                            );
                          } else {
                            handleChange('specificDegrees', [...arr, opt.value]);
                          }
                        }}
                        className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${(form.specificDegrees || []).includes(opt.value as never) ? 'bg-primary border-primary text-white' : 'hover:border-primary border-[var(--border)] text-[var(--text-muted)]'}`}
                      >
                        {opt.label}
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </div>
              <ServerAutoSuggest
                label="Degree Specializations"
                placeholder="e.g. Computer Science, Electronics"
                multiple
                allowCreate
                value={form.degreeSpecializations || []}
                onChange={(v) => handleChange('degreeSpecializations', v as string[])}
                category="field_of_study"
              />
            </div>
          </Card>

          {/* Description & Details */}
          <Card>
            <h2 className="mb-4 text-base font-semibold text-[var(--text)]">
              Description & Details
            </h2>
            <div className="space-y-4">
              <RichTextEditor
                disabled={lock.isReadOnly}
                label="Description"
                required
                value={form.description || ''}
                onChange={(v) => handleChange('description', v)}
                placeholder="Describe the role and what the candidate will be doing..."
              />
              <RichTextEditor
                disabled={lock.isReadOnly}
                label="Key Responsibilities"
                value={form.keyResponsibilities || ''}
                onChange={(v) => handleChange('keyResponsibilities', v)}
                placeholder="List the key responsibilities for this role..."
              />
              <RichTextEditor
                disabled={lock.isReadOnly}
                label="Requirements"
                value={form.requirements || ''}
                onChange={(v) => handleChange('requirements', v)}
                placeholder="List the qualifications and requirements..."
              />
              <RichTextEditor
                disabled={lock.isReadOnly}
                label="Benefits"
                value={form.benefits || ''}
                onChange={(v) => handleChange('benefits', v)}
                placeholder="List the benefits and perks..."
              />
              <Textarea
                label="Interview Process"
                value={form.interviewProcess || ''}
                onChange={(e) => handleChange('interviewProcess', e.target.value)}
                placeholder="Describe the interview process (e.g. Phone screen -> Technical -> Onsite)"
                rows={3}
              />
            </div>
          </Card>

          {/* Location & Type */}
          <Card>
            <h2 className="mb-4 text-base font-semibold text-[var(--text)]">
              Location & Work Mode
            </h2>
            <div className="space-y-4">
              <ServerAutoSuggest
                label="Location"
                required
                value={form.location || ''}
                onChange={(v) => handleChange('location', v as string)}
                category="location"
                allowCreate
                placeholder="e.g. Mumbai, India"
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <Select
                  label="Job Type"
                  options={jobTypeOptions}
                  value={form.type || ''}
                  onChange={(val) => handleChange('type', val || undefined)}
                  placeholder="Select job type"
                />
                <Select
                  label="Work Mode"
                  options={workModeOptions}
                  value={form.workMode || ''}
                  onChange={(val) => handleChange('workMode', val || undefined)}
                  placeholder="Select work mode"
                />
                <Select
                  label="Shift Type"
                  options={shiftTypeOptions}
                  value={form.shiftType || ''}
                  onChange={(val) => handleChange('shiftType', val || undefined)}
                  placeholder="Select shift"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Switch
                  label="Remote position"
                  checked={form.isRemote || false}
                  onChange={() => handleChange('isRemote', !form.isRemote)}
                />
                <Switch
                  label="Relocation assistance offered"
                  checked={form.relocationAssistance || false}
                  onChange={() => handleChange('relocationAssistance', !form.relocationAssistance)}
                />
                <Switch
                  label="Travel required"
                  checked={form.travelRequired || false}
                  onChange={() => handleChange('travelRequired', !form.travelRequired)}
                />
              </div>
              <ServerAutoSuggest
                label="Additional Locations"
                placeholder="e.g. Pune, India"
                multiple
                allowCreate
                value={form.additionalLocations || []}
                onChange={(v) => handleChange('additionalLocations', v as string[])}
                category="location"
              />
              <Switch
                label="Accommodation provided"
                checked={form.accommodationProvided || false}
                onChange={() => handleChange('accommodationProvided', !form.accommodationProvided)}
              />
              <Switch
                label="Walk-in interview"
                checked={form.isWalkIn || false}
                onChange={() => handleChange('isWalkIn', !form.isWalkIn)}
              />
              {form.isWalkIn && (
                <div className="space-y-4 rounded-lg border border-[var(--border)] p-4">
                  <p className="text-sm font-medium text-[var(--text)]">Walk-in Details</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DatePicker
                      disabled={lock.isReadOnly}
                      label="Start Date & Time"
                      value={form.walkInStartDate || ''}
                      onChange={(v) => handleChange('walkInStartDate', v)}
                      mode="datetime"
                    />
                    <DatePicker
                      disabled={lock.isReadOnly}
                      label="End Date & Time"
                      value={form.walkInEndDate || ''}
                      onChange={(v) => handleChange('walkInEndDate', v)}
                      mode="datetime"
                    />
                  </div>
                  <Input
                    label="Time"
                    placeholder="e.g. 10:00 AM - 4:00 PM"
                    value={form.walkInTime || ''}
                    onChange={(e) => handleChange('walkInTime', e.target.value)}
                  />
                  <Input
                    label="Venue"
                    placeholder="Full address of walk-in venue"
                    value={form.walkInVenue || ''}
                    onChange={(e) => handleChange('walkInVenue', e.target.value)}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="Contact Person"
                      placeholder="HR Manager Name"
                      value={form.walkInContactPerson || ''}
                      onChange={(e) => handleChange('walkInContactPerson', e.target.value)}
                    />
                    <PhoneInput
                      label="Contact Phone"
                      placeholder="9876xxxxxx"
                      value={form.walkInContactPhone || ''}
                      onValueChange={(val) => handleChange('walkInContactPhone', val)}
                    />
                  </div>
                  <Textarea
                    label="Walk-in Instructions"
                    placeholder="Any special instructions for candidates..."
                    value={form.walkInInstructions || ''}
                    onChange={(e) => handleChange('walkInInstructions', e.target.value)}
                    rows={3}
                  />
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Contact Person"
                  placeholder="HR Manager Name"
                  value={form.contactPerson || ''}
                  onChange={(e) => handleChange('contactPerson', e.target.value)}
                />
                <Input
                  label="Contact Email"
                  type="email"
                  placeholder="hr@company.com"
                  value={form.contactEmail || ''}
                  onChange={(e) => handleChange('contactEmail', e.target.value)}
                />
                <PhoneInput
                  label="Contact Mobile Number"
                  placeholder="9876xxxxxx"
                  value={form.contactPhone || ''}
                  onValueChange={(val) => handleChange('contactPhone', val)}
                />
              </div>
            </div>
          </Card>

          {/* Experience & Salary */}
          <Card>
            <h2 className="mb-4 text-base font-semibold text-[var(--text)]">
              Experience & Compensation
            </h2>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Min Experience (years)"
                  type="number"
                  value={form.experienceMin ?? ''}
                  onChange={(e) =>
                    handleChange(
                      'experienceMin',
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  placeholder="0"
                  min={0}
                />
                <Input
                  label="Max Experience (years)"
                  type="number"
                  value={form.experienceMax ?? ''}
                  onChange={(e) =>
                    handleChange(
                      'experienceMax',
                      e.target.value ? Number(e.target.value) : undefined,
                    )
                  }
                  placeholder="10"
                  min={0}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  label="Min Salary"
                  type="number"
                  value={form.salaryMin ?? ''}
                  onChange={(e) =>
                    handleChange('salaryMin', e.target.value ? Number(e.target.value) : undefined)
                  }
                  placeholder="e.g. 500000"
                  min={0}
                />
                <Input
                  label="Max Salary"
                  type="number"
                  value={form.salaryMax ?? ''}
                  onChange={(e) =>
                    handleChange('salaryMax', e.target.value ? Number(e.target.value) : undefined)
                  }
                  placeholder="e.g. 1500000"
                  min={0}
                />
                <Select
                  label="Salary Type"
                  options={salaryTypeOptions}
                  value={form.salaryType || ''}
                  onChange={(val) => handleChange('salaryType', val || undefined)}
                  placeholder="Select type"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <CurrencySelect
                  label="Currency"
                  value={form.currency || ''}
                  onChange={(v) => handleChange('currency', v)}
                  placeholder="Select currency"
                />
                <div className="flex items-end pb-1">
                  <Switch
                    label="Disclose salary on listing"
                    checked={form.salaryDisclosed !== false}
                    onChange={() => handleChange('salaryDisclosed', form.salaryDisclosed === false)}
                  />
                </div>
              </div>
              <Switch
                label="Salary is negotiable"
                checked={form.salaryNegotiable || false}
                onChange={() => handleChange('salaryNegotiable', !form.salaryNegotiable)}
              />
              {(form.currency || 'INR').toUpperCase() === 'INR' &&
                form.salaryType === 'ANNUAL' &&
                (form.salaryMin || form.salaryMax) && (
                  <p className="text-xs text-[var(--text-muted)]">
                    CTC: {formatSalaryAsLPA(form.salaryMin, form.salaryMax)}
                  </p>
                )}
            </div>
          </Card>

          {/* Skills & Certifications */}
          <Card>
            <h2 className="mb-4 text-base font-semibold text-[var(--text)]">
              Skills & Certifications
            </h2>
            <div className="space-y-4">
              <ServerAutoSuggest
                label="Required Skills"
                placeholder="e.g. React, TypeScript"
                multiple
                allowCreate
                required
                value={form.skillsRequired || []}
                onChange={(v) => handleChange('skillsRequired', v as string[])}
                category="skill"
              />

              <ServerAutoSuggest
                label="Nice-to-Have Skills"
                placeholder="e.g. GraphQL, Docker"
                multiple
                allowCreate
                value={form.niceToHaveSkills || []}
                onChange={(v) => handleChange('niceToHaveSkills', v as string[])}
                category="skill"
              />

              <ServerAutoSuggest
                label="Certifications Required"
                placeholder="e.g. AWS Solutions Architect"
                multiple
                allowCreate
                value={form.certificationsRequired || []}
                onChange={(v) => handleChange('certificationsRequired', v as string[])}
                category="certification"
              />

              <ServerAutoSuggest
                label="Languages Required"
                placeholder="e.g. English, Hindi"
                multiple
                allowCreate
                value={form.languagesRequired || []}
                onChange={(v) => handleChange('languagesRequired', v as string[])}
                category="language"
              />
            </div>
          </Card>

          {/* Tags, Perks & More */}
          <Card>
            <h2 className="mb-4 text-base font-semibold text-[var(--text)]">Tags, Perks & More</h2>
            <div className="space-y-4">
              {/* Tags */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                  Keywords
                </label>
                <div className="mb-2 flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    placeholder="e.g. startup, fintech"
                  />
                  <Button
                    variant="outline"
                    className="shrink-0"
                    onClick={() => addToArray('tags', tagInput, setTagInput)}
                    tooltip="Add tag"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {(form.tags || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(form.tags || []).map((tag) => (
                      <Tag key={tag} label={tag} size="md" onRemove={() => handleRemoveTag(tag)} />
                    ))}
                  </div>
                )}
              </div>

              <ServerAutoSuggest
                label="Job Perks"
                placeholder="e.g. Free meals, Gym membership"
                multiple
                allowCreate
                value={form.jobPerks || []}
                onChange={(v) => handleChange('jobPerks', v as string[])}
                category="benefit"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Urgency Level"
                  options={urgencyLevelOptions}
                  value={form.urgencyLevel || ''}
                  onChange={(val) => handleChange('urgencyLevel', val || undefined)}
                  placeholder="Select urgency"
                />
                <DatePicker
                  disabled={lock.isReadOnly}
                  label="Application Deadline (Date & Time)"
                  value={form.applicationDeadline || ''}
                  onChange={(val) => handleChange('applicationDeadline', val)}
                  mode="datetime"
                />
                <DatePicker
                  disabled={lock.isReadOnly}
                  label="Job Expiration Date & Time"
                  helperText="Date and time when this job will automatically expire and close"
                  value={form.expiresAt || ''}
                  onChange={(val) => handleChange('expiresAt', val)}
                  mode="datetime"
                  minDate={new Date()}
                />
              </div>

              <Switch
                label="Feature this job (premium)"
                checked={form.isFeatured || false}
                onChange={() => handleChange('isFeatured', !form.isFeatured)}
              />
              <Switch
                label="Premium Job Posting"
                description="Highlight this job with premium badge and priority placement"
                checked={form.isPremium || false}
                onChange={() => handleChange('isPremium', !form.isPremium)}
              />
              {/* Notice Period Preference */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                  Notice Period Preference
                </label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(NOTICE_PERIOD_PREFERENCE_LABELS).map(([val, lbl]) => (
                    <Tooltip key={val} content={`Toggle ${lbl} preference`}>
                      <button
                        type="button"
                        onClick={() => {
                          const arr = (form.noticePeriodPreference || []) as string[];
                          if (arr.includes(val)) {
                            handleChange(
                              'noticePeriodPreference',
                              arr.filter((v) => v !== val),
                            );
                          } else {
                            handleChange('noticePeriodPreference', [...arr, val]);
                          }
                        }}
                        className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${((form.noticePeriodPreference || []) as string[]).includes(val) ? 'bg-primary border-primary text-white' : 'hover:border-primary border-[var(--border)] text-[var(--text-muted)]'}`}
                      >
                        {lbl}
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Requirements & Inclusion */}
          <Card>
            <h2 className="mb-4 text-base font-semibold text-[var(--text)]">
              Requirements & Inclusion
            </h2>
            <div className="space-y-4">
              {/* Diversity Tags */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                  Diversity & Inclusion Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {DIVERSITY_TAG_OPTIONS.map((tag) => (
                    <Tooltip key={tag} content={`Toggle ${tag}`}>
                      <button
                        type="button"
                        onClick={() => {
                          const arr = form.diversityTags || [];
                          if (arr.includes(tag)) {
                            handleChange(
                              'diversityTags',
                              arr.filter((t) => t !== tag),
                            );
                          } else {
                            handleChange('diversityTags', [...arr, tag]);
                          }
                        }}
                        className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${(form.diversityTags || []).includes(tag) ? 'bg-primary border-primary text-white' : 'hover:border-primary border-[var(--border)] text-[var(--text-muted)]'}`}
                      >
                        {tag}
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Switch
                  label="PwD Friendly"
                  checked={form.isPwdFriendly || false}
                  onChange={() => handleChange('isPwdFriendly', !form.isPwdFriendly)}
                />
                <Switch
                  label="Visa Sponsorship Available"
                  checked={form.visaSponsorshipAvailable || false}
                  onChange={() =>
                    handleChange('visaSponsorshipAvailable', !form.visaSponsorshipAvailable)
                  }
                />
                <Switch
                  label="Background Check Required"
                  checked={form.backgroundCheckRequired || false}
                  onChange={() =>
                    handleChange('backgroundCheckRequired', !form.backgroundCheckRequired)
                  }
                />
                <Switch
                  label="Passport Required"
                  checked={form.passportRequired || false}
                  onChange={() => handleChange('passportRequired', !form.passportRequired)}
                />
                <Switch
                  label="Confidential Posting"
                  checked={form.isConfidential || false}
                  onChange={() => handleChange('isConfidential', !form.isConfidential)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Gender Preference"
                  options={genderPreferenceOptions}
                  value={form.genderPreference || ''}
                  onChange={(val) => handleChange('genderPreference', val || undefined)}
                  placeholder="Any"
                />
                <Select
                  label="Driving License Required"
                  options={drivingLicenseOptions}
                  value={form.drivingLicenseRequired || ''}
                  onChange={(val) => handleChange('drivingLicenseRequired', val || undefined)}
                  placeholder="None"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Minimum Age"
                  type="number"
                  placeholder="18"
                  value={form.ageMin?.toString() || ''}
                  onChange={(e) =>
                    handleChange('ageMin', e.target.value ? Number(e.target.value) : undefined)
                  }
                  min={14}
                  max={70}
                />
                <Input
                  label="Maximum Age"
                  type="number"
                  placeholder="60"
                  value={form.ageMax?.toString() || ''}
                  onChange={(e) =>
                    handleChange('ageMax', e.target.value ? Number(e.target.value) : undefined)
                  }
                  min={14}
                  max={70}
                />
              </div>
              <Textarea
                label="Bond / Service Agreement Details"
                placeholder="e.g. 2-year service bond required..."
                value={form.bondDetails || ''}
                onChange={(e) => handleChange('bondDetails', e.target.value)}
                rows={2}
              />
            </div>
          </Card>

          {/* Screening & Posting */}
          <Card>
            <h2 className="mb-4 text-base font-semibold text-[var(--text)]">Screening & Posting</h2>
            <div className="space-y-4">
              <ScreeningQuestionBuilder
                questions={screeningQuestions}
                onChange={(next) => {
                  // Goes through claimEdit for the same reason every other
                  // field does — this builder owns its own state, so editing
                  // only questions used to skip the lock entirely.
                  if (!claimEdit()) return;
                  setScreeningQuestions(next);
                }}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Posting Visibility"
                  options={postingVisibilityOptions}
                  value={form.postingVisibility || 'PUBLIC'}
                  onChange={(val) => handleChange('postingVisibility', val || 'PUBLIC')}
                />
                <Select
                  label="Apply Method"
                  options={applyMethodOptions}
                  value={form.applyMethod || 'IN_PLATFORM'}
                  onChange={(val) => handleChange('applyMethod', val || 'IN_PLATFORM')}
                />
              </div>
              {form.applyMethod === 'EXTERNAL_URL' && (
                <Input
                  label="External Apply URL"
                  type="url"
                  placeholder="https://careers.company.com/apply"
                  value={form.externalApplyUrl || ''}
                  onChange={(e) => handleChange('externalApplyUrl', e.target.value)}
                />
              )}
              <DatePicker
                disabled={lock.isReadOnly}
                label="Scheduled Publish Date"
                value={form.scheduledPublishAt || ''}
                onChange={(v) => handleChange('scheduledPublishAt', v)}
              />
            </div>
          </Card>
        </fieldset>

        {/* Bottom Save */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Tooltip content="Cancel editing and return to job details">
            <Link href={ROUTES.SUPER_ADMIN.JOB_DETAIL(id)}>
              <Button variant="outline">Cancel</Button>
            </Link>
          </Tooltip>
          <Button
            leftIcon={<Save className="h-4 w-4" />}
            onClick={() => handleSubmit()}
            isLoading={updateMutation.isPending}
            disabled={lock.isReadOnly}
            tooltip={
              lock.isReadOnly
                ? 'Another admin is editing this job — take over to make changes'
                : 'Save all changes to this job'
            }
          >
            Save Changes
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
