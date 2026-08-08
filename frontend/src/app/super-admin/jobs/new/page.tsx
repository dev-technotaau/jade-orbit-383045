'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select, { type SelectOption } from '@/components/ui/Select';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import ServerAutoSuggest from '@/components/ui/ServerAutoSuggest';
import CurrencySelect from '@/components/ui/CurrencySelect';
import RichTextEditor from '@/components/ui/RichTextEditor';
import { showToast } from '@/components/ui/Toast';
import CompanySelector from '@/components/super-admin/CompanySelector';
import {
  superAdminJobService,
  type SuperAdminCompanyOption,
} from '@/services/super-admin-jobs.service';
import { ROUTES } from '@/constants/routes';
import { JOB_TYPE_LABELS, WORK_MODE_LABELS, EDUCATION_LEVEL_LABELS } from '@/constants/enums';
import type { CreateJobRequest } from '@/types/job';
import type { ApiError } from '@/types/api';

const toOptions = (labels: Record<string, string>): SelectOption[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));
const jobTypeOptions = toOptions(JOB_TYPE_LABELS);
const workModeOptions = toOptions(WORK_MODE_LABELS);
const educationOptions = toOptions(EDUCATION_LEVEL_LABELS);

/**
 * Super-admin QUICK job poster — a deliberately small ~10-field form for fast
 * posting on behalf of a company. After posting, the admin is taken to the
 * full edit page where every remaining field is available. Uses the exact
 * same custom UI components as the employer post/edit pages (no native
 * selects).
 */
export default function SuperAdminNewJobPage() {
  const router = useRouter();
  const [company, setCompany] = useState<SuperAdminCompanyOption | null>(null);
  const [companyError, setCompanyError] = useState('');
  const [form, setForm] = useState<CreateJobRequest>({
    title: '',
    description: '',
    location: '',
    type: 'FULL_TIME',
    currency: 'INR',
    experienceMin: 0,
    skillsRequired: [],
  } as CreateJobRequest);

  const set = <K extends keyof CreateJobRequest>(key: K, value: CreateJobRequest[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const mutation = useMutation({
    mutationFn: () => superAdminJobService.createJob(company!.id, form),
    onSuccess: (res) => {
      showToast.success('Job posted — opening it so you can fill in every detail.');
      const id = res.data?.id;
      router.push(id ? ROUTES.SUPER_ADMIN.JOB_EDIT(id) : ROUTES.SUPER_ADMIN.JOBS);
    },
    onError: (err) => {
      showToast.error((err as unknown as ApiError).message || 'Failed to post job');
    },
  });

  const submit = () => {
    if (!company) {
      setCompanyError('Please select a company to post for');
      return;
    }
    if (!form.title?.trim()) return showToast.error('Designation / job title is required');
    if (!form.description?.trim() || form.description.replace(/<[^>]*>/g, '').trim().length < 10)
      return showToast.error('A job description (min 10 characters) is required');
    if (!form.location?.trim()) return showToast.error('Location is required');
    if (!form.skillsRequired || form.skillsRequired.length === 0)
      return showToast.error('Add at least one required skill');
    mutation.mutate();
  };

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="jobs.authoring.create"
    >
      <div className="space-y-6">
        <Link
          href={ROUTES.SUPER_ADMIN.JOBS}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Jobs
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Post a Job</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Quick-post on behalf of a company. After posting you can open the listing to fill in
              every remaining field.
            </p>
          </div>
          <Button
            leftIcon={<Send className="h-4 w-4" />}
            onClick={submit}
            isLoading={mutation.isPending}
          >
            Post Job
          </Button>
        </div>

        {/* Company & Role */}
        <Card>
          <h2 className="mb-4 text-base font-semibold text-[var(--text)]">Company &amp; Role</h2>
          <div className="space-y-4">
            <CompanySelector
              value={company}
              onChange={(c) => {
                setCompany(c);
                setCompanyError('');
              }}
              error={companyError}
            />
            <ServerSuggestionInput
              category="job_title"
              label="Designation / Job Title"
              required
              value={form.title || ''}
              onChange={(v) => set('title', v)}
              placeholder="e.g. Senior Software Engineer"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Job Type"
                options={jobTypeOptions}
                value={form.type || ''}
                onChange={(v) => set('type', v as CreateJobRequest['type'])}
              />
              <Select
                label="Work Mode"
                options={workModeOptions}
                value={form.workMode || ''}
                onChange={(v) => set('workMode', v as CreateJobRequest['workMode'])}
                placeholder="Select work mode"
                clearable
              />
            </div>
            <ServerAutoSuggest
              label="Location"
              value={form.location || ''}
              onChange={(v) => set('location', v as string)}
              category="location"
              allowCreate
            />
          </div>
        </Card>

        {/* Experience, qualification & age */}
        <Card>
          <h2 className="mb-4 text-base font-semibold text-[var(--text)]">
            Experience, Qualification &amp; Age
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              label="Min Experience (years)"
              type="number"
              value={form.experienceMin ?? ''}
              onChange={(e) =>
                set('experienceMin', e.target.value ? Number(e.target.value) : undefined)
              }
            />
            <Input
              label="Max Experience (years)"
              type="number"
              value={form.experienceMax ?? ''}
              onChange={(e) =>
                set('experienceMax', e.target.value ? Number(e.target.value) : undefined)
              }
            />
            <Select
              label="Education Required"
              options={educationOptions}
              value={form.educationRequired || ''}
              onChange={(v) => set('educationRequired', v as CreateJobRequest['educationRequired'])}
              placeholder="Any"
              clearable
            />
            <Input
              label="Min Age"
              type="number"
              value={form.ageMin ?? ''}
              onChange={(e) => set('ageMin', e.target.value ? Number(e.target.value) : undefined)}
            />
            <Input
              label="Max Age"
              type="number"
              value={form.ageMax ?? ''}
              onChange={(e) => set('ageMax', e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
        </Card>

        {/* Compensation */}
        <Card>
          <h2 className="mb-4 text-base font-semibold text-[var(--text)]">Compensation</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Min Salary"
              type="number"
              value={form.salaryMin ?? ''}
              onChange={(e) =>
                set('salaryMin', e.target.value ? Number(e.target.value) : undefined)
              }
            />
            <Input
              label="Max Salary"
              type="number"
              value={form.salaryMax ?? ''}
              onChange={(e) =>
                set('salaryMax', e.target.value ? Number(e.target.value) : undefined)
              }
            />
            <CurrencySelect
              label="Currency"
              value={form.currency || 'INR'}
              onChange={(v) => set('currency', v)}
            />
          </div>
        </Card>

        {/* Skills & description */}
        <Card>
          <h2 className="mb-4 text-base font-semibold text-[var(--text)]">
            Skills &amp; Description
          </h2>
          <div className="space-y-4">
            <ServerAutoSuggest
              label="Required Skills"
              multiple
              allowCreate
              value={form.skillsRequired || []}
              onChange={(v) => set('skillsRequired', v as string[])}
              category="skill"
            />
            <RichTextEditor
              label="Job Description"
              required
              value={form.description || ''}
              onChange={(v) => set('description', v)}
              placeholder="Describe the role, responsibilities and what you're looking for…"
            />
          </div>
        </Card>

        <div className="flex justify-end">
          <Button
            leftIcon={<Send className="h-4 w-4" />}
            onClick={submit}
            isLoading={mutation.isPending}
          >
            Post Job
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
