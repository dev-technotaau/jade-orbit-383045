'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import AuditEntryDetail from '@/components/whatsapp/AuditEntryDetail';
import { auditService } from '@/services/audit.service';
import type { ApiError } from '@/types/api';

/**
 * One audit entry, addressable by id.
 *
 * The trail could only ever be read as a list: an entry opened in a modal from
 * a row the current filter happened to return, and closed again with nothing to
 * link to. That left an entry id — the one thing an incident write-up quotes,
 * and the only thing the integrity sweep reports when it finds a row that no
 * longer matches its checksum — impossible to look up, because the list filters
 * cover action, entity, actor and IP but not the entry’s own id.
 *
 * So this page exists to be linked to: from the tampered-trail alert, from the
 * detail modal, and from anywhere outside the console that needs to point at
 * exactly one recorded action.
 */
export default function AuditEntryPage() {
  const params = useParams();
  const id = String(params?.id ?? '');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['audit-entry', id],
    queryFn: () => auditService.getEntry(id),
    enabled: Boolean(id),
    // A 404 is an answer, not a failure worth retrying: the entry either never
    // existed or the retention sweep has already removed it.
    retry: (count, err) => (err as unknown as ApiError)?.statusCode !== 404 && count < 1,
  });

  const notFound = (error as unknown as ApiError)?.statusCode === 404;

  return (
    <DashboardLayout requiredRole={['ADMIN']}>
      <div className="space-y-5 p-4 sm:p-6">
        <Link
          href="/whatsapp/audit"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to the audit trail
        </Link>

        <section className="rounded-xl border border-[var(--border)] bg-white p-4 sm:p-6">
          {isLoading && (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          )}

          {!isLoading && notFound && (
            <div className="p-6 text-center">
              <p className="text-sm text-[var(--text)]">No entry with this id.</p>
              <p className="mx-auto mt-2 max-w-prose text-sm text-[var(--text-muted)]">
                Entries are never edited or deleted through the console, so a missing one has either
                aged past the 180-day retention sweep or the id is wrong.
              </p>
              <p className="mt-3 font-mono text-xs break-all text-[var(--text-muted)]">{id}</p>
            </div>
          )}

          {!isLoading && isError && !notFound && (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <p className="text-sm text-[var(--error)]">Could not load this audit entry.</p>
              <Button
                variant="outline"
                size="sm"
                isLoading={isFetching}
                leftIcon={<RefreshCw className="h-4 w-4" />}
                onClick={() => void refetch()}
              >
                Retry
              </Button>
            </div>
          )}

          {data && <AuditEntryDetail entry={data} />}
        </section>
      </div>
    </DashboardLayout>
  );
}
