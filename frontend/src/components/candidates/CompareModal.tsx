'use client';

import { X, MapPin, Building2, Briefcase, GraduationCap, User as UserIcon } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import Tooltip from '@/components/ui/Tooltip';
import { formatRelativeDate } from '@/lib/utils';
import {
  WORK_STATUS_LABELS,
  WORK_MODE_LABELS,
  NOTICE_PERIOD_LABELS,
  JOB_TYPE_LABELS,
  SALARY_CURRENCY_LABELS,
} from '@/constants/enums';
import type { CandidateProfile } from '@/types/candidate';

interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidates: CandidateProfile[];
  onRemove: (candidateId: string) => void;
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

export default function CompareModal({ isOpen, onClose, candidates, onRemove }: CompareModalProps) {
  if (candidates.length === 0) return null;

  const salaryDisplay = (candidate: CandidateProfile) => {
    if (!candidate.expectedSalaryMin) return '—';
    const currency = candidate.salaryCurrency
      ? SALARY_CURRENCY_LABELS[candidate.salaryCurrency] || candidate.salaryCurrency
      : 'INR';
    const min = candidate.expectedSalaryMin.toLocaleString();
    const max = candidate.expectedSalaryMax ? candidate.expectedSalaryMax.toLocaleString() : '';
    return max ? `${min} - ${max} ${currency}/yr` : `${min}+ ${currency}/yr`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Compare Candidates" size="full">
      <div className="-mx-6 overflow-x-auto px-6">
        <table className="w-full min-w-[600px] border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="w-[140px]" />
              {candidates.map((candidate) => {
                const name = candidate.user
                  ? `${candidate.user.firstName || ''} ${candidate.user.lastName || ''}`.trim()
                  : 'Anonymous';
                return (
                  <th key={candidate.id} className="min-w-[200px] px-3 pb-4 text-left align-top">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="bg-primary-light flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                          {candidate.user?.avatar ? (
                            <img
                              src={candidate.user.avatar}
                              alt={name}
                              className="h-10 w-10 rounded-full object-cover"
                            />
                          ) : (
                            <UserIcon className="text-primary h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm leading-tight font-semibold text-[var(--text)]">
                            {name}
                          </p>
                          {candidate.headline && (
                            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                              {candidate.headline}
                            </p>
                          )}
                        </div>
                      </div>
                      <Tooltip content={`Remove ${name}`}>
                        <button
                          type="button"
                          onClick={() => onRemove(candidate.id)}
                          className="shrink-0 cursor-pointer rounded-md p-1 transition-colors hover:bg-[var(--bg-secondary)]"
                          aria-label={`Remove ${name}`}
                        >
                          <X className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                        </button>
                      </Tooltip>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* ── Overview ── */}
            <SectionHeader title="Overview" />
            <CompareRow label="Current Role" values={candidates.map((c) => c.currentRole || '—')} />
            <CompareRow label="Company" values={candidates.map((c) => c.currentCompany || '—')} />
            <CompareRow label="Location" values={candidates.map((c) => c.currentLocation || '—')} />
            <CompareRow
              label="Experience"
              values={candidates.map((c) =>
                c.experienceYears !== undefined ? `${c.experienceYears} years` : '—',
              )}
            />
            <CompareRow
              label="Profile Updated"
              values={candidates.map((c) => formatRelativeDate(c.updatedAt))}
            />

            {/* ── Work Preferences ── */}
            <SectionHeader title="Work Preferences" />
            <CompareRow
              label="Work Status"
              values={candidates.map((c) =>
                c.workStatus ? (WORK_STATUS_LABELS[c.workStatus] ?? '—') : '—',
              )}
            />
            <CompareRow
              label="Notice Period"
              values={candidates.map((c) =>
                c.noticePeriod ? NOTICE_PERIOD_LABELS[c.noticePeriod] : '—',
              )}
            />
            <CompareRow
              label="Work Mode"
              values={candidates.map((c) =>
                c.preferredWorkMode?.length
                  ? c.preferredWorkMode.map((m) => WORK_MODE_LABELS[m]).join(', ')
                  : '—',
              )}
            />
            <CompareRow
              label="Job Type"
              values={candidates.map((c) =>
                c.preferredJobType?.length
                  ? c.preferredJobType.map((t) => JOB_TYPE_LABELS[t]).join(', ')
                  : '—',
              )}
            />
            <CompareRow
              label="Willing to Relocate"
              values={candidates.map((c) =>
                c.willingToRelocate ? 'Yes' : c.willingToRelocate === false ? 'No' : '—',
              )}
            />

            {/* ── Compensation ── */}
            <SectionHeader title="Compensation" />
            <CompareRow label="Expected Salary" values={candidates.map(salaryDisplay)} />

            {/* ── Skills ── */}
            <SectionHeader title="Skills" />
            <CompareRow
              label="Skills"
              values={candidates.map((c) =>
                c.skills?.length ? (
                  <div key={c.id} className="flex flex-wrap gap-1">
                    {c.skills.slice(0, 10).map((s) => (
                      <span
                        key={s}
                        className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]"
                      >
                        {s}
                      </span>
                    ))}
                    {c.skills.length > 10 && (
                      <span className="px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                        +{c.skills.length - 10} more
                      </span>
                    )}
                  </div>
                ) : (
                  '—'
                ),
              )}
              highlight={false}
            />

            {/* ── Education ── */}
            <SectionHeader title="Education" />
            <CompareRow
              label="Highest Education"
              values={candidates.map((c) => c.highestEducationLevel || '—')}
            />
            <CompareRow
              label="Education Details"
              values={candidates.map((c) => {
                const eduArray = c.education as Array<{ degree?: string; field?: string }> | null;
                if (!eduArray || eduArray.length === 0) return '—';
                const latest = eduArray[0];
                return (
                  `${latest.degree || ''} ${latest.field ? `in ${latest.field}` : ''}`.trim() || '—'
                );
              })}
            />

            {/* ── Contact ── */}
            <SectionHeader title="Contact" />
            <CompareRow label="Email" values={candidates.map((c) => c.user?.email || '—')} />
            <CompareRow
              label="Phone"
              values={candidates.map((c) => c.phone || c.user?.mobileNumber || '—')}
            />

            {/* ── Verification ── */}
            <SectionHeader title="Verification" />
            <CompareRow
              label="Email Verified"
              values={candidates.map((c) => (c.user?.isEmailVerified ? '✓ Yes' : '✗ No'))}
            />
            <CompareRow
              label="Mobile Verified"
              values={candidates.map((c) => (c.user?.isMobileVerified ? '✓ Yes' : '✗ No'))}
            />
            <CompareRow
              label="Profile Completeness"
              values={candidates.map((c) =>
                c.profileCompleteness !== undefined ? `${c.profileCompleteness}%` : '—',
              )}
            />
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
