'use client';

import Link from 'next/link';
import { ShieldOff, ArrowLeft, LifeBuoy } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuthStore } from '@/store/auth.store';
import { ROUTES } from '@/constants/routes';

/**
 * Shown when an admin opens a page they lack the permission for.
 *
 * Deliberately an EXPLANATION, not a redirect. Bouncing to `/` leaves the
 * person thinking the link is broken and generates a support ticket;
 * naming the missing permission lets them ask their super-admin for exactly
 * the right thing.
 *
 * It reveals only that a permission exists and that they don't hold it —
 * which they can already infer from the 403 the API returns — so there is
 * no information leak in being specific.
 */
export default function PermissionDenied({ permissionKey }: { permissionKey?: string }) {
  const { user } = useAuthStore();
  const dashboard =
    user?.role === 'SUPER_ADMIN' ? ROUTES.SUPER_ADMIN.DASHBOARD : ROUTES.ADMIN.DASHBOARD;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 ring-1 ring-amber-200">
          <ShieldOff className="h-8 w-8 text-amber-600" />
        </div>

        <h1 className="mt-6 text-xl font-semibold text-[var(--text)]">
          You don&apos;t have access to this page
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Your admin account hasn&apos;t been granted the permission this page requires. A
          super-admin can add it from the Admin Control Centre.
        </p>

        {permissionKey && (
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
            <p className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
              Permission required
            </p>
            <code className="mt-1 block font-mono text-sm break-all text-[var(--text)]">
              {permissionKey}
            </code>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={dashboard}>
            <Button variant="outline" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              Back to dashboard
            </Button>
          </Link>
          <Link href={ROUTES.ADMIN.TICKETS}>
            <Button variant="ghost" leftIcon={<LifeBuoy className="h-4 w-4" />}>
              Request access
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
