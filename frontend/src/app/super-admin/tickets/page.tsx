'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Ticket,
  MessageSquareWarning,
  CheckCircle2,
  Clock,
  ThumbsUp,
  AlertTriangle,
  BarChart3,
  Calendar,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { PieLabelRenderProps } from 'recharts';
import Tooltip from '@/components/ui/Tooltip';
import DatePicker from '@/components/ui/DatePicker';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import Skeleton from '@/components/ui/Skeleton';
import { ticketService } from '@/services/ticket.service';
import { QUERY_KEYS } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { formatDate } from '@/lib/utils';
import type { SupportTicket } from '@/types/ticket';
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
} from '@/types/ticket';

const CHART_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#84cc16',
];

const SATISFACTION_LABELS: Record<string, string> = {
  SATISFIED: 'Satisfied',
  NEUTRAL: 'Neutral',
  NOT_SATISFIED: 'Not Satisfied',
};

const SATISFACTION_COLORS: Record<string, string> = {
  SATISFIED: '#10b981',
  NEUTRAL: '#f59e0b',
  NOT_SATISFIED: '#ef4444',
};

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

export default function SuperAdminTicketsPage() {
  const defaultRange = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);

  // ── Stats ──
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: QUERY_KEYS.TICKETS.STATS,
    queryFn: () => ticketService.getStats(),
  });
  const stats = statsData?.data;

  // ── Analytics ──
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: [...QUERY_KEYS.TICKETS.ANALYTICS, startDate, endDate],
    queryFn: () => ticketService.getAnalytics(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
  const analytics = analyticsData?.data;

  // Prepare chart data
  const categoryData = (analytics?.byCategory || []).map((item) => ({
    name: TICKET_CATEGORY_LABELS[item.category] || item.category,
    value: item.count,
  }));

  const dailyVolumeData = (analytics?.dailyVolume || []).map((item) => ({
    date: formatDate(item.date, 'MMM dd'),
    created: item.created,
    resolved: item.resolved,
  }));

  const satisfactionData = (analytics?.bySatisfaction || [])
    .filter((item) => item.satisfaction !== null)
    .map((item) => ({
      name: SATISFACTION_LABELS[item.satisfaction!] || item.satisfaction,
      count: item.count,
      fill: SATISFACTION_COLORS[item.satisfaction!] || CHART_COLORS[0],
    }));

  const statusBreakdownData = (analytics?.byStatus || []).map((item) => ({
    name: TICKET_STATUS_LABELS[item.status] || item.status,
    count: item.count,
  }));

  const escalatedTickets = analytics?.escalatedTickets || [];

  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="support.analytics">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Ticket Analytics</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Comprehensive overview of support ticket metrics and trends.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {statsLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <Skeleton variant="rect" height={72} />
              </Card>
            ))
          ) : (
            <>
              <Card>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-secondary)]">
                    <Ticket className="h-5 w-5 text-[var(--text-muted)]" />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Total</p>
                    <p className="text-xl font-bold text-[var(--text)]">{stats?.total ?? 0}</p>
                  </div>
                </div>
              </Card>
              <Card>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--info-light)]">
                    <MessageSquareWarning className="h-5 w-5 text-[var(--info)]" />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Open</p>
                    <p className="text-xl font-bold text-[var(--text)]">{stats?.open ?? 0}</p>
                  </div>
                </div>
              </Card>
              <Card>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--success-light)]">
                    <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Resolved</p>
                    <p className="text-xl font-bold text-[var(--text)]">{stats?.resolved ?? 0}</p>
                  </div>
                </div>
              </Card>
              <Card>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--warning-light)]">
                    <Clock className="h-5 w-5 text-[var(--warning)]" />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Avg Response</p>
                    <p className="text-xl font-bold text-[var(--text)]">
                      {stats?.avgResponseTimeHours != null
                        ? `${stats.avgResponseTimeHours.toFixed(1)}h`
                        : '--'}
                    </p>
                  </div>
                </div>
              </Card>
              <Card>
                <div className="flex items-center gap-3">
                  <div className="bg-primary-light flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                    <ThumbsUp className="text-primary h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Satisfaction</p>
                    <p className="text-xl font-bold text-[var(--text)]">
                      {stats?.satisfactionRate != null
                        ? `${stats.satisfactionRate.toFixed(0)}%`
                        : '--'}
                    </p>
                  </div>
                </div>
              </Card>
              <Card>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--error-light)]">
                    <AlertTriangle className="h-5 w-5 text-[var(--error)]" />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Escalated</p>
                    <p className="text-xl font-bold text-[var(--text)]">
                      {escalatedTickets.length}
                    </p>
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>

        {/* Date Range Picker */}
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[var(--text-muted)]" />
              <span className="text-sm font-medium text-[var(--text)]">Date Range</span>
            </div>
            <div className="flex flex-1 gap-3">
              <div className="w-full sm:w-48">
                <DatePicker
                  label="Start Date"
                  value={startDate}
                  onChange={(val) => setStartDate(val)}
                />
              </div>
              <div className="w-full sm:w-48">
                <DatePicker label="End Date" value={endDate} onChange={(val) => setEndDate(val)} />
              </div>
            </div>
          </div>
        </Card>

        {/* Charts Grid */}
        {analyticsLoading ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <Skeleton variant="rect" height={300} />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Tickets by Category — PieChart */}
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-[var(--text)]">
                <BarChart3 className="h-4 w-4 text-[var(--text-muted)]" />
                Tickets by Category
              </h3>
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={(props: PieLabelRenderProps) =>
                        `${String(props.name ?? '')} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`
                      }
                    >
                      {categoryData.map((_, index) => (
                        <Cell
                          key={`cat-${index}`}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-sm text-[var(--text-muted)]">
                  No data available
                </div>
              )}
            </Card>

            {/* Daily Volume — AreaChart */}
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-[var(--text)]">
                <BarChart3 className="h-4 w-4 text-[var(--text-muted)]" />
                Daily Volume
              </h3>
              {dailyVolumeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart
                    data={dailyVolumeData.map((d) => ({
                      ...d,
                      created: Number(d.created) || 0,
                      resolved: Number(d.resolved) || 0,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                    <YAxis
                      tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                      allowDecimals={false}
                    />
                    <RechartsTooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="created"
                      name="Created"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="resolved"
                      name="Resolved"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-sm text-[var(--text-muted)]">
                  No data available
                </div>
              )}
            </Card>

            {/* Satisfaction Distribution — BarChart */}
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-[var(--text)]">
                <BarChart3 className="h-4 w-4 text-[var(--text-muted)]" />
                Satisfaction Distribution
              </h3>
              {satisfactionData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={satisfactionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                    <YAxis
                      tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                      allowDecimals={false}
                    />
                    <RechartsTooltip />
                    <Bar dataKey="count" name="Responses" radius={[4, 4, 0, 0]}>
                      {satisfactionData.map((entry, index) => (
                        <Cell key={`sat-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-sm text-[var(--text-muted)]">
                  No data available
                </div>
              )}
            </Card>

            {/* Status Breakdown — Horizontal BarChart */}
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-[var(--text)]">
                <BarChart3 className="h-4 w-4 text-[var(--text-muted)]" />
                Status Breakdown
              </h3>
              {statusBreakdownData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={statusBreakdownData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={100}
                      tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
                    />
                    <RechartsTooltip />
                    <Bar dataKey="count" name="Tickets" radius={[0, 4, 4, 0]}>
                      {statusBreakdownData.map((_, index) => (
                        <Cell
                          key={`status-${index}`}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[300px] items-center justify-center text-sm text-[var(--text-muted)]">
                  No data available
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Recent Escalations Table */}
        <Card>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-[var(--text)]">
            <AlertTriangle className="h-4 w-4 text-[var(--error)]" />
            Recent Escalations (Not Satisfied)
          </h3>
          {escalatedTickets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Ticket #
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Subject
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Submitter
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Assigned To
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {escalatedTickets.map((ticket: SupportTicket) => {
                    const submitterName = ticket.user
                      ? [ticket.user.firstName, ticket.user.lastName].filter(Boolean).join(' ') ||
                        'N/A'
                      : ticket.guestName || 'Unknown';
                    return (
                      <tr
                        key={ticket.id}
                        className="transition-colors hover:bg-[var(--bg-secondary)]"
                      >
                        <td className="px-4 py-3">
                          <Tooltip content="View ticket details">
                            <Link
                              href={ROUTES.ADMIN.TICKET_DETAIL(ticket.id)}
                              className="text-primary cursor-pointer font-mono text-xs font-medium hover:underline"
                            >
                              {ticket.ticketNumber}
                            </Link>
                          </Tooltip>
                        </td>
                        <td className="max-w-[250px] truncate px-4 py-3 text-[var(--text)]">
                          {ticket.subject}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{submitterName}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {ticket.assignedTo ? (
                            `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`
                          ) : (
                            <span className="text-[var(--text-muted)]">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-[var(--text-muted)]">
                          {formatDate(ticket.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">
              No escalated tickets in this period.
            </div>
          )}
        </Card>

        {/* Link to manage tickets */}
        <div className="text-center">
          <Tooltip content="Go to ticket management page">
            <Link
              href={ROUTES.ADMIN.TICKETS}
              className="text-primary inline-flex cursor-pointer items-center gap-2 text-sm font-medium hover:underline"
            >
              Manage All Tickets
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </Tooltip>
        </div>
      </div>
    </DashboardLayout>
  );
}
