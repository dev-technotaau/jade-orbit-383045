'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ShieldCheck, Ban } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Skeleton from '@/components/ui/Skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { roleColorClass } from '@/constants/permissions';
import { cn } from '@/lib/utils';

/**
 * "What am I allowed to do?" — the admin's own access, self-service.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * An admin could previously only discover the shape of their access by
 * walking into walls: a nav item that isn't there, a button that 403s. The
 * grant data was already on the client (`usePermissions` fetches the
 * effective set for the socket-driven live update), it just had no surface.
 *
 * Read-only by construction — an admin must never be able to widen their own
 * access, so this renders what the server resolved and offers no controls.
 * Changes are the super-admin's job, which is why the empty state points at
 * them rather than at a request flow that does not exist.
 *
 * Grouped by domain because a flat list of 300+ keys answers nothing; the
 * question people actually ask is "do I have Billing?".
 */
export default function MyAccessCard() {
  const { allowed, grants, roles, isSuperAdmin, isLoading } = usePermissions();
  const [openDomain, setOpenDomain] = useState<string | null>(null);

  const denies = useMemo(() => grants.filter((g) => g.effect === 'DENY'), [grants]);

  const byDomain = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const key of allowed) {
      const domain = key.split('.')[0] ?? key;
      const list = map.get(domain);
      if (list) list.push(key);
      else map.set(domain, [key]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [allowed]);

  if (isSuperAdmin) {
    return (
      <Card>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
          <ShieldCheck className="text-primary h-5 w-5" /> My access
        </h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          You are a super-admin — every permission is yours by role, and none of it is granted or
          revocable.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
        <ShieldCheck className="text-primary h-5 w-5" /> My access
      </h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        What you can do on this console. Only a super-admin can change it.
      </p>

      {isLoading ? (
        <div className="mt-4">
          <Skeleton />
        </div>
      ) : (
        <>
          {roles.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-[var(--text-muted)]">Roles</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {roles.map((r) => (
                  <span
                    key={r.id}
                    className={cn(
                      'rounded px-2 py-0.5 text-xs font-medium ring-1',
                      roleColorClass(r.color),
                    )}
                  >
                    {r.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {denies.length > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <Ban className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-red-900">
                  {denies.length} explicit block{denies.length === 1 ? '' : 's'}
                </p>
                <p className="font-mono text-[11px] break-words text-red-700">
                  {denies.map((d) => d.permissionKey).join(', ')}
                </p>
              </div>
            </div>
          )}

          {byDomain.length === 0 ? (
            <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-4 text-center">
              <p className="text-sm font-medium text-[var(--text)]">No permissions yet</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Your account exists but nothing has been granted. Ask a super-admin to assign you a
                role from the Admin Control Centre.
              </p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
              {byDomain.map(([domain, keys]) => {
                const open = openDomain === domain;
                return (
                  <div key={domain}>
                    <button
                      type="button"
                      onClick={() => setOpenDomain(open ? null : domain)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-secondary)]"
                    >
                      {open ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                      )}
                      <span className="flex-1 font-mono text-sm text-[var(--text)]">{domain}</span>
                      <Badge variant="info" size="sm">
                        {keys.length}
                      </Badge>
                    </button>
                    {open && (
                      <ul className="bg-[var(--bg-secondary)] px-3 pb-2.5 pl-9">
                        {keys.sort().map((k) => (
                          <li
                            key={k}
                            className="font-mono text-[11px] break-all text-[var(--text-muted)]"
                          >
                            {k}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
