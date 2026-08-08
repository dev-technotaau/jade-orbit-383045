'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, Users, ArrowRight, Building2, CheckCircle, AlertCircle } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Badge from '@/components/ui/Badge';
import { superAdminTeamsService } from '@/services/super-admin-teams.service';

export default function SuperAdminTeamsPage() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data, isLoading } = useQuery({
    queryKey: ['super-admin', 'teams', { query, page, pageSize }],
    queryFn: () =>
      superAdminTeamsService.list({ query: query || undefined, page, limit: pageSize }),
  });

  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="teams.view">
      <div className="space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Teams</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Every employer team across the platform — owners, seats, invites and quota usage.
            </p>
          </div>
          <Input
            placeholder="Search by company name…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            leftIcon={<Search className="h-4 w-4" />}
            className="w-full md:w-72"
          />
        </div>

        {isLoading && (
          <Card padding="lg" className="flex justify-center">
            <Spinner />
          </Card>
        )}
        {!isLoading && data && data.items.length === 0 && (
          <Card padding="lg">
            <EmptyState
              icon={Users}
              title="No teams match"
              description="Try a different company name or clear the search."
            />
          </Card>
        )}
        {!isLoading && data && data.items.length > 0 && (
          <Card padding="md">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs tracking-wider text-[var(--text-muted)] uppercase">
                    <th className="pr-4 pb-2">Company</th>
                    <th className="pr-4 pb-2">Owner</th>
                    <th className="pr-4 pb-2">Seats</th>
                    <th className="pr-4 pb-2">Invites pending</th>
                    <th className="pr-4 pb-2">Plan</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.companyId} className="border-b border-[var(--border)]">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-md bg-[var(--bg-secondary)]">
                            {row.logo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={row.logo}
                                alt={row.companyName}
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <Building2 className="h-4 w-4 text-[var(--text-muted)]" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-[var(--text)]">
                              {row.companyName}
                              {row.isVerifiedCompany && (
                                <CheckCircle
                                  className="ml-1 inline h-3 w-3 text-blue-600"
                                  aria-label="Verified company"
                                />
                              )}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              Created {new Date(row.createdAt).toLocaleDateString('en-IN')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-[var(--text)]">{row.ownerName}</p>
                        <p className="text-xs text-[var(--text-muted)]">{row.ownerEmail}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-semibold text-[var(--text)]">{row.totalSeats}</span>
                        <span className="ml-1 text-xs text-[var(--text-muted)]">
                          ({row.activeMembers} seats + 1 owner)
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {row.pendingInvites > 0 ? (
                          <Badge variant="warning" size="sm">
                            {row.pendingInvites}
                          </Badge>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">none</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {row.ownerHasActivePlan ? (
                          <Badge variant="success" size="sm">
                            <CheckCircle className="mr-1 h-3 w-3" /> Active
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            <AlertCircle className="mr-1 h-3 w-3" /> No plan
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href={`/super-admin/teams/${row.companyId}`}
                          className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
                        >
                          Open <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.pagination.pages > 0 && (
              <div className="mt-4">
                <Pagination
                  currentPage={page}
                  totalPages={data.pagination.pages}
                  onPageChange={setPage}
                  totalItems={data.pagination.total}
                  pageSize={pageSize}
                  onPageSizeChange={(s) => {
                    setPageSize(s);
                    setPage(1);
                  }}
                />
              </div>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
