'use client';

import { useState } from 'react';
import { KeyRound, Grid3x3, Users, Activity, Lock } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import AccessMatrixTab from '@/components/admin/control/AccessMatrixTab';
import RolesTab from '@/components/admin/control/RolesTab';
import ActivityTab from '@/components/admin/control/ActivityTab';
import LocksTab from '@/components/admin/control/LocksTab';
import { cn } from '@/lib/utils';

type TabKey = 'matrix' | 'roles' | 'activity' | 'locks';

const TABS: { key: TabKey; label: string; icon: typeof KeyRound; hint: string }[] = [
  { key: 'matrix', label: 'Access Matrix', icon: Grid3x3, hint: 'Who can do what' },
  { key: 'roles', label: 'Roles', icon: Users, hint: 'Reusable permission bundles' },
  { key: 'activity', label: 'Activity', icon: Activity, hint: 'What admins are doing' },
  { key: 'locks', label: 'Session Locks', icon: Lock, hint: 'Records being edited now' },
];

/**
 * Admin Control Centre — the super-admin's single view of the permission
 * system.
 *
 * Four questions this page exists to answer, one per tab:
 *   1. Who can do what?              → Access Matrix
 *   2. How do I grant a job, not 40  → Roles
 *      individual checkboxes?
 *   3. What are my admins doing?     → Activity
 *   4. Who is editing what right now? → Session Locks
 *
 * SUPER_ADMIN-only, and unlike every other admin page it is NOT
 * permission-gated — it is role-gated. The keys under `admin_control.*` are
 * marked `superAdminOnly` in the registry precisely so they cannot be
 * granted, which means gating this page on one of them would be
 * meaningless: no admin can ever hold it.
 */
export default function AdminControlCentrePage() {
  const [tab, setTab] = useState<TabKey>('matrix');

  return (
    <DashboardLayout requiredRole={['SUPER_ADMIN']}>
      <div className="space-y-6">
        <header>
          <div className="flex items-center gap-3">
            <span className="bg-primary-light text-primary flex h-11 w-11 items-center justify-center rounded-xl">
              <KeyRound className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text)]">Admin Control Centre</h1>
              <p className="text-sm text-[var(--text-muted)]">
                Grant, audit and oversee everything your admins can reach.
              </p>
            </div>
          </div>
        </header>

        <div className="border-b border-[var(--border)]">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Control centre sections">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary text-primary'
                      : 'border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:text-[var(--text)]',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>

        {tab === 'matrix' && <AccessMatrixTab />}
        {tab === 'roles' && <RolesTab />}
        {tab === 'activity' && <ActivityTab />}
        {tab === 'locks' && <LocksTab />}
      </div>
    </DashboardLayout>
  );
}
