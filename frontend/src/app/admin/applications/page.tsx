'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Search, Calendar } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import DatePicker from '@/components/ui/DatePicker';
import Select from '@/components/ui/Select';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { adminService } from '@/services/admin.service';
import { PAGINATION, QUERY_KEYS } from '@/constants/config';
import { formatDate } from '@/lib/utils';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'APPLIED', label: 'Applied' },
  { value: 'VIEWED', label: 'Viewed' },
  { value: 'SHORTLISTED', label: 'Shortlisted' },
  { value: 'OFFERED', label: 'Offered' },
  { value: 'HIRED', label: 'Hired' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'WITHDRAWN', label: 'Withdrawn' },
];

const STATUS_LABELS: Record<string, string> = {
  APPLIED: 'Applied',
  VIEWED: 'Viewed',
  SHORTLISTED: 'Shortlisted',
  OFFERED: 'Offered',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

const getStatusVariant = (status: string): BadgeVariant => {
  switch (status) {
    case 'HIRED':
      return 'success';
    case 'OFFERED':
      return 'info';
    case 'SHORTLISTED':
      return 'warning';
    case 'REJECTED':
      return 'error';
    case 'WITHDRAWN':
      return 'neutral';
    default:
      return 'info';
  }
};

const PIE_COLORS = [
  '#6366f1',
  '#22c55e',
  '#f59e0b',
  '#3b82f6',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
];

export default function ApplicationMonitoringPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION.DEFAULT_LIMIT);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filters: Record<string, string | number | undefined> = {
    keyword: keyword || undefined,
    status: statusFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit: pageSize,
  };

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.APPLICATIONS(filters as Record<string, unknown>),
    queryFn: () => adminService.getApplications(filters),
  });

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: QUERY_KEYS.ADMIN.APPLICATION_STATS,
    queryFn: () => adminService.getApplicationStats(),
  });

  const applications = data?.data?.items || [];
  const pagination = data?.data;
  const stats = statsData?.data;

  const pieData = stats?.byStatus
    ? Object.entries(stats.byStatus).map(([name, value]) => ({
        name: STATUS_LABELS[name] || name,
        value,
      }))
    : [];

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="jobs.applications.view"
    >
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Application Monitoring</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Monitor all job applications across the platform.
          </p>
        </div>

        {/* Stats Cards */}
        {statsLoading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <Skeleton className="h-20" />
              </Card>
            ))}
          </div>
        ) : (
          stats && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card>
                <div className="p-4 text-center">
                  <p className="text-2xl font-bold text-[var(--text)]">{stats.total}</p>
                  <p className="text-xs text-[var(--text-muted)]">Total Applications</p>
                </div>
              </Card>
              <Card>
                <div className="p-4 text-center">
                  <p className="text-2xl font-bold text-[var(--success)]">
                    {stats.byStatus['HIRED'] || 0}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Hired</p>
                </div>
              </Card>
              <Card>
                <div className="p-4 text-center">
                  <p className="text-2xl font-bold text-[var(--warning)]">
                    {stats.byStatus['SHORTLISTED'] || 0}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Shortlisted</p>
                </div>
              </Card>
              <Card>
                <div className="p-4 text-center">
                  <p className="text-primary text-2xl font-bold">
                    {stats.byStatus['APPLIED'] || 0}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">Pending Review</p>
                </div>
              </Card>
            </div>
          )
        )}

        {/* Charts */}
        {stats && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Daily Trend */}
            <Card>
              <div className="p-6">
                <h3 className="text-sm font-semibold text-[var(--text)]">
                  Applications (Last 30 Days)
                </h3>
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={
                        stats.dailyTrend?.map((d: Record<string, unknown>) => ({
                          ...d,
                          count: Number(d.count) || 0,
                        })) ?? []
                      }
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(d) => d.slice(5)}
                      />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="#6366f1"
                        fill="#6366f1"
                        fillOpacity={0.15}
                        name="Applications"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>

            {/* Status Distribution */}
            <Card>
              <div className="p-6">
                <h3 className="text-sm font-semibold text-[var(--text)]">Status Distribution</h3>
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                      >
                        {pieData.map((_, index) => (
                          <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                placeholder="Search by candidate, job title..."
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  setPage(1);
                }}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <div className="w-full sm:w-44">
              <Select
                label="Status"
                options={statusOptions}
                value={statusFilter}
                onChange={(val) => {
                  setStatusFilter(val);
                  setPage(1);
                }}
              />
            </div>
            <div className="w-full sm:w-40">
              <DatePicker
                label="From"
                value={dateFrom}
                onChange={(val) => {
                  setDateFrom(val);
                  setPage(1);
                }}
              />
            </div>
            <div className="w-full sm:w-40">
              <DatePicker
                label="To"
                value={dateTo}
                onChange={(val) => {
                  setDateTo(val);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </Card>

        {/* Table */}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Job Title</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Applied</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-[var(--border)]">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-4 w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : applications.length > 0 ? (
                  applications.map((app) => (
                    <tr
                      key={app.id}
                      className="border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-secondary)]"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-[var(--text)]">{app.candidateName}</p>
                          <p className="text-xs text-[var(--text-muted)]">{app.candidateEmail}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--text)]">{app.jobTitle}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{app.companyName}</td>
                      <td className="px-4 py-3">
                        <Badge variant={getStatusVariant(app.status)}>
                          {STATUS_LABELS[app.status] || app.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(app.appliedAt)}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center">
                      <EmptyState
                        icon={FileText}
                        title="No applications found"
                        description="There are no applications matching your filters."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Pagination */}
        {pagination && (
          <Pagination
            currentPage={page}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
            totalItems={pagination.total}
            pageSize={pageSize}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
