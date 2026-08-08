'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, Ticket, Clock, ThumbsUp, CalendarPlus, MessageSquare } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { PERM } from '@/constants/permissions';
import { usePermissions } from '@/hooks/use-permissions';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import { ticketService } from '@/services/ticket.service';
import { QUERY_KEYS, PAGINATION } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { formatDate, debounce } from '@/lib/utils';
import type { SupportTicket, TicketStatus, TicketPriority, TicketCategory } from '@/types/ticket';
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
  TICKET_CATEGORY_LABELS,
} from '@/types/ticket';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const statusOptions = [
  { value: '', label: 'All Statuses' },
  ...Object.entries(TICKET_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

const priorityOptions = [
  { value: '', label: 'All Priorities' },
  ...Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => ({ value, label })),
];

const categoryOptions = [
  { value: '', label: 'All Categories' },
  ...Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
];

function getRoleBadgeVariant(role: string): BadgeVariant {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'error';
    case 'ADMIN':
      return 'warning';
    case 'EMPLOYER':
      return 'info';
    case 'CANDIDATE':
      return 'success';
    default:
      return 'neutral';
  }
}

export default function AdminTicketsPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGINATION.DEFAULT_LIMIT);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSetSearch = useCallback(
    debounce((value: string) => {
      setSearch(value);
      setPage(1);
    }, 400),
    [],
  );

  // ── Stats ──
  // `/tickets/stats` is gated on `support.analytics`, which a plain ticket
  // handler does not hold. Firing it unconditionally spent a 403 on every
  // page load and left four permanently-empty stat cards on screen — so ask
  // only when the permission is there, and drop the row entirely when it is
  // not.
  const canViewStats = can(PERM.SUPPORT_ANALYTICS);
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: QUERY_KEYS.TICKETS.STATS,
    queryFn: () => ticketService.getStats(),
    enabled: canViewStats,
  });
  const stats = statsData?.data;

  // ── Ticket list ──
  const filters: Record<string, string | number | undefined> = {
    page,
    limit: pageSize,
    ...(search && { search }),
    ...(statusFilter && { status: statusFilter }),
    ...(priorityFilter && { priority: priorityFilter }),
    ...(categoryFilter && { category: categoryFilter }),
  };

  const { data, isLoading } = useQuery({
    queryKey: [...QUERY_KEYS.TICKETS.ALL_LIST, filters],
    queryFn: () =>
      ticketService.getAllTickets(
        filters as {
          page?: number;
          limit?: number;
          status?: TicketStatus;
          priority?: TicketPriority;
          category?: TicketCategory;
          search?: string;
        },
      ),
  });

  const tickets = data?.data?.items || [];
  const pagination = data?.data;

  const getSubmitterDisplay = (ticket: SupportTicket) => {
    if (ticket.user) {
      const name = [ticket.user.firstName, ticket.user.lastName].filter(Boolean).join(' ') || 'N/A';
      return { name, role: ticket.user.role, isGuest: false };
    }
    return { name: ticket.guestName || 'Unknown', role: null, isGuest: true };
  };

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredAnyPermission={[PERM.SUPPORT_TICKETS_VIEW, PERM.SUPPORT_TICKETS_VIEW_ALL]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Ticket Management</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            View and manage all support tickets across the platform.
          </p>
        </div>

        {/* Stat Cards */}
        {canViewStats && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {statsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <Skeleton variant="rect" height={80} />
                </Card>
              ))
            ) : (
              <>
                <Card>
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--info-light)]">
                      <Ticket className="h-6 w-6 text-[var(--info)]" />
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Open Tickets</p>
                      <p className="text-2xl font-bold text-[var(--text)]">{stats?.open ?? 0}</p>
                    </div>
                  </div>
                </Card>
                <Card>
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--warning-light)]">
                      <Clock className="h-6 w-6 text-[var(--warning)]" />
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Avg Response Time</p>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {stats?.avgResponseTimeHours != null
                          ? `${stats.avgResponseTimeHours.toFixed(1)}h`
                          : '--'}
                      </p>
                    </div>
                  </div>
                </Card>
                <Card>
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--success-light)]">
                      <ThumbsUp className="h-6 w-6 text-[var(--success)]" />
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Satisfaction Rate</p>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {stats?.satisfactionRate != null
                          ? `${stats.satisfactionRate.toFixed(0)}%`
                          : '--'}
                      </p>
                    </div>
                  </div>
                </Card>
                <Card>
                  <div className="flex items-center gap-4">
                    <div className="bg-primary-light flex h-12 w-12 shrink-0 items-center justify-center rounded-lg">
                      <CalendarPlus className="text-primary h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Today&apos;s New</p>
                      <p className="text-2xl font-bold text-[var(--text)]">
                        {stats?.todayNew ?? 0}
                      </p>
                    </div>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {/* Filter Bar */}
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                placeholder="Search by ticket #, subject, or submitter..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  debouncedSetSearch(e.target.value);
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
            <div className="w-full sm:w-44">
              <Select
                label="Priority"
                options={priorityOptions}
                value={priorityFilter}
                onChange={(val) => {
                  setPriorityFilter(val);
                  setPage(1);
                }}
              />
            </div>
            <div className="w-full sm:w-44">
              <Select
                label="Category"
                options={categoryOptions}
                value={categoryFilter}
                onChange={(val) => {
                  setCategoryFilter(val);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </Card>

        {/* Ticket Table */}
        <Card padding="sm">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} variant="rect" height={48} />
              ))}
            </div>
          ) : tickets.length > 0 ? (
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
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Priority
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Assigned To
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-[var(--text-secondary)]">
                      Created
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-[var(--text-secondary)]">
                      <MessageSquare className="mx-auto h-4 w-4" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {tickets.map((ticket: SupportTicket) => {
                    const submitter = getSubmitterDisplay(ticket);
                    return (
                      <tr
                        key={ticket.id}
                        onClick={() => router.push(ROUTES.ADMIN.TICKET_DETAIL(ticket.id))}
                        className="cursor-pointer transition-colors hover:bg-[var(--bg-secondary)]"
                      >
                        <td className="text-primary px-4 py-3 font-mono text-xs font-medium">
                          {ticket.ticketNumber}
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3 font-medium text-[var(--text)]">
                          {ticket.subject}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[var(--text)]">
                              {submitter.isGuest ? `Guest: ${submitter.name}` : submitter.name}
                            </span>
                            {submitter.role && (
                              <Badge variant={getRoleBadgeVariant(submitter.role)} size="sm">
                                {submitter.role}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TICKET_STATUS_COLORS[ticket.status]}`}
                          >
                            {TICKET_STATUS_LABELS[ticket.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TICKET_PRIORITY_COLORS[ticket.priority]}`}
                          >
                            {TICKET_PRIORITY_LABELS[ticket.priority]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {TICKET_CATEGORY_LABELS[ticket.category]}
                        </td>
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
                        <td className="px-4 py-3 text-center text-[var(--text-muted)]">
                          {ticket._count?.messages ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Ticket}
              title="No tickets found"
              description="Try adjusting your search or filters."
            />
          )}
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
