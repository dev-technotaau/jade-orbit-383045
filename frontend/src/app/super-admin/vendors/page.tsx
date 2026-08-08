'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, Building2, ArrowRight, BadgeCheck, EyeOff, Star, Mail } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { superAdminVendorsService } from '@/services/super-admin-vendors.service';

type FilterTrio = 'any' | 'yes' | 'no';

export default function SuperAdminVendorsPage() {
  const [query, setQuery] = useState('');
  const [verified, setVerified] = useState<FilterTrio>('any');
  const [pub, setPub] = useState<FilterTrio>('any');
  const [activeSub, setActiveSub] = useState<FilterTrio>('any');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const trio = (v: FilterTrio): boolean | undefined =>
    v === 'yes' ? true : v === 'no' ? false : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['super-admin', 'vendors', { query, verified, pub, activeSub, page, pageSize }],
    queryFn: () =>
      superAdminVendorsService.list({
        query: query || undefined,
        isVerified: trio(verified),
        isPublic: trio(pub),
        hasActiveSub: trio(activeSub),
        page,
        limit: pageSize,
      }),
  });

  return (
    <DashboardLayout requiredRole={['ADMIN', 'SUPER_ADMIN']} requiredPermission="vendors.view">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Vendors</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            All vendor profiles. Filter by verification, public visibility and active VENDOR_CONNECT
            subscription.
          </p>
        </div>

        <Card padding="md">
          <div className="grid gap-3 md:grid-cols-[1fr_140px_140px_140px]">
            <Input
              placeholder="Search by name, email or slug…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              leftIcon={<Search className="h-4 w-4" />}
            />
            <FilterPills
              label="Verified"
              value={verified}
              onChange={(v) => {
                setVerified(v);
                setPage(1);
              }}
            />
            <FilterPills
              label="Public"
              value={pub}
              onChange={(v) => {
                setPub(v);
                setPage(1);
              }}
            />
            <FilterPills
              label="Active sub"
              value={activeSub}
              onChange={(v) => {
                setActiveSub(v);
                setPage(1);
              }}
            />
          </div>
        </Card>

        {isLoading && (
          <Card padding="lg" className="flex justify-center">
            <Spinner />
          </Card>
        )}
        {!isLoading && data && data.items.length === 0 && (
          <Card padding="lg">
            <EmptyState
              icon={Building2}
              title="No vendors match"
              description="Try a different filter combination."
            />
          </Card>
        )}
        {!isLoading && data && data.items.length > 0 && (
          <Card padding="md">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs tracking-wider text-[var(--text-muted)] uppercase">
                    <th className="pr-4 pb-2">Vendor</th>
                    <th className="pr-4 pb-2">Email</th>
                    <th className="pr-4 pb-2">Status</th>
                    <th className="pr-4 pb-2">Leads</th>
                    <th className="pr-4 pb-2">Rating</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((v) => (
                    <tr key={v.id} className="border-b border-[var(--border)]">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-md bg-[var(--bg-secondary)]">
                            {v.logo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={v.logo}
                                alt={v.businessName}
                                className="h-full w-full object-contain"
                              />
                            ) : (
                              <Building2 className="h-4 w-4 text-[var(--text-muted)]" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-[var(--text)]">
                              {v.businessName}
                              {v.isVerified && (
                                <BadgeCheck
                                  className="ml-1 inline h-4 w-4 text-blue-600"
                                  aria-label="Verified"
                                />
                              )}
                            </p>
                            <p className="font-mono text-xs text-[var(--text-muted)]">{v.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-xs text-[var(--text-secondary)]">
                        <p className="inline-flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {v.contactEmail}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {v.hasActiveSub ? (
                            <Badge variant="success" size="sm">
                              Active sub
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">
                              No sub
                            </Badge>
                          )}
                          {!v.isPublic && (
                            <Badge variant="warning" size="sm">
                              <EyeOff className="mr-1 h-3 w-3" /> Hidden
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-semibold text-[var(--text)]">{v.leadCount}</span>
                      </td>
                      <td className="py-3 pr-4">
                        {v.reviewCount > 0 && v.avgRating != null ? (
                          <span className="inline-flex items-center gap-1 text-amber-600">
                            <Star className="h-3.5 w-3.5 fill-current" />
                            <strong>{v.avgRating.toFixed(1)}</strong>
                            <span className="text-[var(--text-muted)]">({v.reviewCount})</span>
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href={`/super-admin/vendors/${v.id}`}
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

function FilterPills({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FilterTrio;
  onChange: (v: FilterTrio) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">{label}</p>
      <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
        {(['any', 'yes', 'no'] as FilterTrio[]).map((v) => (
          <Button
            key={v}
            type="button"
            size="sm"
            variant={value === v ? 'primary' : 'ghost'}
            onClick={() => onChange(v)}
          >
            {v === 'any' ? 'Any' : v === 'yes' ? 'Yes' : 'No'}
          </Button>
        ))}
      </div>
    </div>
  );
}
