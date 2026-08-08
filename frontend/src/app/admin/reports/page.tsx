'use client';

/**
 * Reports & Exports — SUPER_ADMIN only.
 *
 * Two halves:
 *   · Quick exports — the three original fixed exports (users / jobs /
 *     analytics), now scopeable by time range and by segment. They used to be
 *     unconditional whole-table dumps because the UI sent a `period` param the
 *     backend never read; `QuickExportCard` sends the params the API actually
 *     understands (`startDate`/`endDate`/`role`/`status`).
 *   · Custom report builder — arbitrary columns across every reportable dataset
 *     on the platform, with segment filters and a PII gate.
 *
 * The page was previously shared with ADMIN. It is not any more: it can export
 * platform-wide data including contact and payment fields, so the route, the
 * sidebar entry and the `/reports/*` endpoints are all SUPER_ADMIN now.
 */

import DashboardLayout from '@/components/layout/DashboardLayout';
import { Users, Briefcase, BarChart3 } from 'lucide-react';
import ReportBuilder from '@/components/admin/ReportBuilder';
import QuickExportCard from '@/components/admin/QuickExportCard';

/**
 * Segment options for the users export.
 *
 * Candidates and employers only — a users export is about the PLATFORM's users.
 * Staff were offered here and included in the "All" dump, which meant anyone
 * holding `reports.exports.users` could download the full admin roster (name,
 * email, mobile, last login) as a spreadsheet. The server now excludes them
 * unconditionally, so listing them would just be a filter that returns nothing.
 */
const ROLE_OPTIONS = [
  { value: 'CANDIDATE', label: 'Candidates' },
  { value: 'EMPLOYER', label: 'Employers' },
];

/** Segment options for the jobs export — mirrors the JobStatus enum. */
const JOB_STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'EXPIRED', label: 'Expired' },
];

export default function ReportsPage() {
  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="reports.view">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Reports &amp; Exports</h1>
          <p className="text-[var(--text-muted)]">Generate and download system reports.</p>
        </div>

        <div>
          <h2 className="text-sm font-semibold tracking-wide text-[var(--text-muted)] uppercase">
            Quick exports
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            One-click exports with a fixed column set. Scope by time range and segment, or leave
            both at their defaults for everything.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <QuickExportCard
            type="users"
            title="User Directory"
            description="Export a complete list of all registered users, including candidates and employers."
            tint="bg-blue-50 text-blue-600"
            icon={<Users className="h-6 w-6" />}
            extension="xlsx"
            buttonLabel="Export users (Excel)"
            segment={{ label: 'Role', options: ROLE_OPTIONS }}
          />
          <QuickExportCard
            type="jobs"
            title="Job Postings"
            description="Export job data including status, applications count, and categories."
            tint="bg-green-50 text-green-600"
            icon={<Briefcase className="h-6 w-6" />}
            extension="xlsx"
            buttonLabel="Export Jobs (Excel)"
            segment={{ label: 'Status', options: JOB_STATUS_OPTIONS }}
          />
          <QuickExportCard
            type="analytics"
            title="Platform Analytics"
            description="Download a PDF summary of platform growth, engagement, and key metrics."
            tint="bg-purple-50 text-purple-600"
            icon={<BarChart3 className="h-6 w-6" />}
            extension="pdf"
            buttonLabel="Export Analytics (PDF)"
          />
        </div>

        <div className="border-t border-[var(--border)] pt-6">
          <ReportBuilder />
        </div>
      </div>
    </DashboardLayout>
  );
}
