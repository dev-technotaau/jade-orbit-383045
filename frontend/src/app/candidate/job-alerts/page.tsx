'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Plus, Pencil, Trash2, Eye, Clock, MapPin, Briefcase, Search, X } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import Switch from '@/components/ui/Switch';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import Pagination from '@/components/ui/Pagination';
import { confirmDialog } from '@/components/ui/dialog-service';
import { candidateService } from '@/services/candidate.service';
import { QUERY_KEYS } from '@/constants/config';
import type {
  JobAlert,
  CreateJobAlertRequest,
  UpdateJobAlertRequest,
  AlertFrequency,
} from '@/types/candidate';

const frequencyOptions = [
  { value: 'INSTANT', label: 'Instant (hourly)' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'OFF', label: 'Off' },
];

const frequencyLabels: Record<AlertFrequency, string> = {
  INSTANT: 'Hourly',
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  OFF: 'Off',
};

const frequencyColors: Record<AlertFrequency, 'success' | 'info' | 'warning' | 'neutral'> = {
  INSTANT: 'success',
  DAILY: 'info',
  WEEKLY: 'warning',
  OFF: 'neutral',
};

interface AlertFormState {
  name: string;
  keyword: string;
  location: string;
  type: string;
  workMode: string;
  experienceLevel: string;
  salaryMin: string;
  salaryMax: string;
  frequency: AlertFrequency;
}

const defaultForm: AlertFormState = {
  name: '',
  keyword: '',
  location: '',
  type: '',
  workMode: '',
  experienceLevel: '',
  salaryMin: '',
  salaryMax: '',
  frequency: 'DAILY',
};

const typeOptions = [
  { value: '', label: 'Any' },
  { value: 'FULL_TIME', label: 'Full Time' },
  { value: 'PART_TIME', label: 'Part Time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERNSHIP', label: 'Internship' },
  { value: 'FREELANCE', label: 'Freelance' },
];

const workModeOptions = [
  { value: '', label: 'Any' },
  { value: 'REMOTE', label: 'Remote' },
  { value: 'ONSITE', label: 'On-site' },
  { value: 'HYBRID', label: 'Hybrid' },
];

const experienceOptions = [
  { value: '', label: 'Any' },
  { value: 'ENTRY', label: 'Entry Level' },
  { value: 'MID', label: 'Mid Level' },
  { value: 'SENIOR', label: 'Senior' },
  { value: 'LEAD', label: 'Lead' },
  { value: 'EXECUTIVE', label: 'Executive' },
];

function filtersToForm(filters: Record<string, unknown>): Partial<AlertFormState> {
  return {
    keyword: (filters.keyword as string) || '',
    location: (filters.location as string) || '',
    type: (filters.type as string) || '',
    workMode: (filters.workMode as string) || '',
    experienceLevel: (filters.experienceLevel as string) || '',
    salaryMin: filters.salaryMin ? String(filters.salaryMin) : '',
    salaryMax: filters.salaryMax ? String(filters.salaryMax) : '',
  };
}

function formToFilters(form: AlertFormState): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  if (form.keyword) filters.keyword = form.keyword;
  if (form.location) filters.location = form.location;
  if (form.type) filters.type = form.type;
  if (form.workMode) filters.workMode = form.workMode;
  if (form.experienceLevel) filters.experienceLevel = form.experienceLevel;
  if (form.salaryMin) filters.salaryMin = Number(form.salaryMin);
  if (form.salaryMax) filters.salaryMax = Number(form.salaryMax);
  return filters;
}

function getFilterTags(filters: Record<string, unknown>): string[] {
  const tags: string[] = [];
  if (filters.keyword) tags.push(String(filters.keyword));
  if (filters.location) tags.push(String(filters.location));
  if (filters.type) tags.push(String(filters.type).replace('_', ' '));
  if (filters.workMode) tags.push(String(filters.workMode));
  if (filters.experienceLevel) tags.push(String(filters.experienceLevel));
  if (filters.salaryMin || filters.salaryMax) {
    const min = filters.salaryMin ? `${Number(filters.salaryMin) / 100000}L` : '0';
    const max = filters.salaryMax ? `${Number(filters.salaryMax) / 100000}L` : '+';
    tags.push(`${min} - ${max}`);
  }
  return tags;
}

export default function JobAlertsPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingAlert, setEditingAlert] = useState<JobAlert | null>(null);
  const [form, setForm] = useState<AlertFormState>(defaultForm);
  const [matchesAlertId, setMatchesAlertId] = useState<string | null>(null);
  const [matchesPage, setMatchesPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.CANDIDATES.JOB_ALERTS,
    queryFn: () => candidateService.getJobAlerts(),
  });

  const alerts = data?.data || [];

  const { data: matchesData, isLoading: matchesLoading } = useQuery({
    queryKey: QUERY_KEYS.CANDIDATES.JOB_ALERT_MATCHES(matchesAlertId || ''),
    queryFn: () => candidateService.getJobAlertMatches(matchesAlertId!, matchesPage, 10),
    enabled: !!matchesAlertId,
  });

  const matches = matchesData?.data;

  const createMutation = useMutation({
    mutationFn: (data: CreateJobAlertRequest) => candidateService.createJobAlert(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.JOB_ALERTS });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateJobAlertRequest }) =>
      candidateService.updateJobAlert(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.JOB_ALERTS });
      closeModal();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => candidateService.deleteJobAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.JOB_ALERTS });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      candidateService.updateJobAlert(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.JOB_ALERTS });
    },
  });

  const openCreate = () => {
    setEditingAlert(null);
    setForm(defaultForm);
    setShowModal(true);
  };

  const openEdit = (alert: JobAlert) => {
    setEditingAlert(alert);
    const filterValues = filtersToForm(alert.filters);
    setForm({
      ...defaultForm,
      ...filterValues,
      name: alert.name,
      frequency: alert.frequency,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingAlert(null);
    setForm(defaultForm);
  };

  const handleSubmit = () => {
    const filters = formToFilters(form);
    if (Object.keys(filters).length === 0) return;

    if (editingAlert) {
      updateMutation.mutate({
        id: editingAlert.id,
        data: { name: form.name, filters, frequency: form.frequency },
      });
    } else {
      createMutation.mutate({ name: form.name, filters, frequency: form.frequency });
    }
  };

  const updateField = (field: keyof AlertFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <DashboardLayout requiredRole={['CANDIDATE']}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Job Alerts</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Get notified when new jobs match your criteria. Maximum 10 alerts.
            </p>
          </div>
          <Button
            onClick={openCreate}
            disabled={alerts.length >= 10}
            tooltip="Create a new job alert"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Create Alert
          </Button>
        </div>

        {/* Alert List */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <Skeleton variant="rect" height={100} />
              </Card>
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <Card>
            <EmptyState
              icon={Bell}
              title="No job alerts yet"
              description="Create an alert to get notified when new jobs match your criteria."
              action={
                <Button onClick={openCreate} tooltip="Create your first job alert">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Create Your First Alert
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {alerts.map((alert) => (
              <Card key={alert.id}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-semibold text-[var(--text)]">{alert.name}</h3>
                      <Badge variant={frequencyColors[alert.frequency]} size="sm">
                        {frequencyLabels[alert.frequency]}
                      </Badge>
                      {alert.newMatchCount > 0 && (
                        <Badge variant="success" size="sm">
                          {alert.newMatchCount} new
                        </Badge>
                      )}
                      {!alert.isActive && (
                        <Badge variant="neutral" size="sm">
                          Paused
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {getFilterTags(alert.filters).map((tag, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center rounded-md bg-[var(--bg-secondary)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    {alert.lastNotifiedAt && (
                      <p className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                        <Clock className="h-3 w-3" />
                        Last checked: {new Date(alert.lastNotifiedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={alert.isActive}
                      onChange={() =>
                        toggleMutation.mutate({ id: alert.id, isActive: !alert.isActive })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMatchesAlertId(alert.id);
                        setMatchesPage(1);
                      }}
                      tooltip="View matching jobs"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(alert)}
                      tooltip="Edit alert"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (
                          await confirmDialog({
                            title: 'Delete alert',
                            message: 'Delete this alert?',
                            confirmLabel: 'Delete',
                            variant: 'danger',
                          })
                        ) {
                          deleteMutation.mutate(alert.id);
                        }
                      }}
                      tooltip="Delete alert"
                    >
                      <Trash2 className="h-4 w-4 text-[var(--error)]" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Matches Modal */}
        <Modal
          isOpen={!!matchesAlertId}
          onClose={() => setMatchesAlertId(null)}
          title={`Matching Jobs${matches?.items ? ` (${matches.items.length})` : ''}`}
          size="lg"
        >
          {matchesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rect" height={60} />
              ))}
            </div>
          ) : matches?.items && matches.items.length > 0 ? (
            <div className="space-y-3">
              {matches.items.map((job) => (
                <div
                  key={job.id}
                  className="rounded-lg border border-[var(--border)] p-4 transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  <h4 className="font-medium text-[var(--text)]">{job.title}</h4>
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                    {job.company?.companyName || 'Company'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                    {job.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {job.location}
                      </span>
                    )}
                    {job.type && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3 w-3" /> {job.type}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <Pagination
                className="pt-2"
                currentPage={matchesPage}
                totalPages={matches.totalPages}
                onPageChange={setMatchesPage}
                totalItems={matches.total}
                pageSize={10}
              />
            </div>
          ) : (
            <EmptyState
              icon={Search}
              title="No matching jobs"
              description="No jobs currently match this alert's filters. New matches will be checked automatically."
            />
          )}
        </Modal>

        {/* Create/Edit Modal */}
        <Modal
          isOpen={showModal}
          onClose={closeModal}
          title={editingAlert ? 'Edit Job Alert' : 'Create Job Alert'}
          size="lg"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={closeModal} tooltip="Cancel and close">
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!form.name.trim() || Object.keys(formToFilters(form)).length === 0}
                isLoading={createMutation.isPending || updateMutation.isPending}
                tooltip={editingAlert ? 'Save alert changes' : 'Create job alert'}
              >
                {editingAlert ? 'Save Changes' : 'Create Alert'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <Input
              label="Alert Name"
              placeholder="e.g. Remote React jobs in Bangalore"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              required
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Keywords"
                placeholder="e.g. React, Node.js"
                value={form.keyword}
                onChange={(e) => updateField('keyword', e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
              <Input
                label="Location"
                placeholder="e.g. Bangalore, Mumbai"
                value={form.location}
                onChange={(e) => updateField('location', e.target.value)}
                leftIcon={<MapPin className="h-4 w-4" />}
              />
              <Select
                label="Job Type"
                options={typeOptions}
                value={form.type}
                onChange={(val) => updateField('type', val)}
              />
              <Select
                label="Work Mode"
                options={workModeOptions}
                value={form.workMode}
                onChange={(val) => updateField('workMode', val)}
              />
              <Select
                label="Experience Level"
                options={experienceOptions}
                value={form.experienceLevel}
                onChange={(val) => updateField('experienceLevel', val)}
              />
              <Select
                label="Frequency"
                options={frequencyOptions}
                value={form.frequency}
                onChange={(val) => updateField('frequency', val)}
              />
              <Input
                label="Min Salary"
                type="number"
                placeholder="e.g. 500000"
                value={form.salaryMin}
                onChange={(e) => updateField('salaryMin', e.target.value)}
              />
              <Input
                label="Max Salary"
                type="number"
                placeholder="e.g. 2000000"
                value={form.salaryMax}
                onChange={(e) => updateField('salaryMax', e.target.value)}
              />
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
