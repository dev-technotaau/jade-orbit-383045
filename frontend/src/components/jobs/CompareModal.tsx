'use client';

import { X, MapPin, Building2, Clock, Briefcase, GraduationCap, IndianRupee } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import Tooltip from '@/components/ui/Tooltip';
import { formatSalaryRange, formatRelativeDate } from '@/lib/utils';
import { formatSalaryAsLPA } from '@/utils/format';
import {
  JOB_TYPE_LABELS,
  WORK_MODE_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  SHIFT_TYPE_LABELS,
  URGENCY_LEVEL_LABELS,
} from '@/constants/enums';
import type { Job } from '@/types/job';

interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobs: Job[];
  onRemove: (jobId: string) => void;
}

/* ─── Row helper ─── */

function CompareRow({
  label,
  values,
  highlight,
}: {
  label: string;
  values: (string | React.ReactNode)[];
  highlight?: boolean;
}) {
  // Auto-highlight: if not all values are the same string
  const shouldHighlight =
    highlight ??
    (values.length > 1 &&
      values.some((v, _, arr) => {
        const str = typeof v === 'string' ? v : '';
        const first = typeof arr[0] === 'string' ? arr[0] : '';
        return str !== first;
      }));

  return (
    <tr className={shouldHighlight ? 'bg-amber-50/50' : ''}>
      <td className="py-2.5 pr-4 align-top text-xs font-medium whitespace-nowrap text-[var(--text-secondary)]">
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i} className="px-3 py-2.5 align-top text-sm text-[var(--text)]">
          {v || <span className="text-[var(--text-muted)]">—</span>}
        </td>
      ))}
    </tr>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <tr>
      <td colSpan={4} className="pt-5 pb-2">
        <span className="text-xs font-semibold tracking-wider text-[var(--text-muted)] uppercase">
          {title}
        </span>
      </td>
    </tr>
  );
}

export default function CompareModal({ isOpen, onClose, jobs, onRemove }: CompareModalProps) {
  if (jobs.length === 0) return null;

  const salaryDisplay = (job: Job) => {
    const showLPA = (job.currency || 'INR').toUpperCase() === 'INR' && job.salaryType === 'ANNUAL';
    return showLPA
      ? formatSalaryAsLPA(job.salaryMin, job.salaryMax)
      : formatSalaryRange(job.salaryMin, job.salaryMax, job.currency);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Compare Jobs" size="full">
      <div className="-mx-6 overflow-x-auto px-6">
        <table className="w-full min-w-[600px] border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="w-[140px]" />
              {jobs.map((job) => (
                <th key={job.id} className="min-w-[200px] px-3 pb-4 text-left align-top">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm leading-tight font-semibold text-[var(--text)]">
                        {job.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {job.isConfidential ? 'Confidential' : job.company?.companyName}
                      </p>
                    </div>
                    <Tooltip content={`Remove ${job.title}`}>
                      <button
                        type="button"
                        onClick={() => onRemove(job.id)}
                        className="shrink-0 cursor-pointer rounded-md p-1 transition-colors hover:bg-[var(--bg-secondary)]"
                        aria-label={`Remove ${job.title}`}
                      >
                        <X className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                      </button>
                    </Tooltip>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* ── Overview ── */}
            <SectionHeader title="Overview" />
            <CompareRow
              label="Company"
              values={jobs.map((j) =>
                j.isConfidential ? 'Confidential' : j.company?.companyName || '—',
              )}
            />
            <CompareRow label="Location" values={jobs.map((j) => j.location || '—')} />
            <CompareRow
              label="Work Mode"
              values={jobs.map((j) => (j.workMode ? WORK_MODE_LABELS[j.workMode] : '—'))}
            />
            <CompareRow
              label="Job Type"
              values={jobs.map((j) => (j.type ? JOB_TYPE_LABELS[j.type] : '—'))}
            />
            <CompareRow label="Posted" values={jobs.map((j) => formatRelativeDate(j.createdAt))} />
            <CompareRow
              label="Urgency"
              values={jobs.map((j) =>
                j.urgencyLevel ? URGENCY_LEVEL_LABELS[j.urgencyLevel] : 'Normal',
              )}
            />

            {/* ── Compensation ── */}
            <SectionHeader title="Compensation" />
            <CompareRow label="Salary" values={jobs.map(salaryDisplay)} />
            <CompareRow
              label="Benefits"
              values={jobs.map((j) => {
                const perks: string[] = [];
                if (j.isPwdFriendly) perks.push('PwD Friendly');
                if (j.visaSponsorshipAvailable) perks.push('Visa Sponsorship');
                return perks.length > 0 ? perks.join(', ') : '—';
              })}
            />

            {/* ── Requirements ── */}
            <SectionHeader title="Requirements" />
            <CompareRow
              label="Experience"
              values={jobs.map((j) =>
                j.experienceLevel ? EXPERIENCE_LEVEL_LABELS[j.experienceLevel] : '—',
              )}
            />
            <CompareRow label="Education" values={jobs.map((j) => j.educationRequired || '—')} />
            <CompareRow
              label="Skills"
              values={jobs.map((j) =>
                j.skillsRequired?.length ? (
                  <div key={j.id} className="flex flex-wrap gap-1">
                    {j.skillsRequired.map((s, idx) => (
                      <span
                        key={`${s}-${idx}`}
                        className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  '—'
                ),
              )}
              highlight={false}
            />

            {/* ── Details ── */}
            <SectionHeader title="Details" />
            <CompareRow
              label="Shift"
              values={jobs.map((j) => (j.shiftType ? SHIFT_TYPE_LABELS[j.shiftType] : '—'))}
            />
            <CompareRow
              label="Openings"
              values={jobs.map((j) => (j.numberOfOpenings ? String(j.numberOfOpenings) : '—'))}
            />
            <CompareRow
              label="Applicants"
              values={jobs.map((j) =>
                j._applicationCount != null ? String(j._applicationCount) : '—',
              )}
            />
            <CompareRow
              label="Apply Method"
              values={jobs.map((j) =>
                j.applyMethod === 'IN_PLATFORM'
                  ? 'In-platform'
                  : j.applyMethod === 'EXTERNAL_URL'
                    ? 'External link'
                    : j.applyMethod === 'EMAIL'
                      ? 'Email'
                      : j.applyMethod === 'WALK_IN'
                        ? 'Walk-in'
                        : '—',
              )}
            />
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
