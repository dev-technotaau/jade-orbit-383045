'use client';

import { useState } from 'react';
import { Eye, Lock, Clock, AlertTriangle } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import type { UseResourceLock } from '@/hooks/use-resource-lock';
import type { LockHolder, RecentEditor } from '@/types/permissions';

function displayName(admin: LockHolder['admin']): string {
  return [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.email;
}

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * Collision context for a shared admin record: who else is here, who is
 * editing, and who changed it recently.
 *
 * Three distinct signals, deliberately styled differently because they
 * demand different reactions:
 *
 *   • Another admin EDITING (amber, blocking)   — your form is read-only
 *     until you take over. This is the one that prevents lost work.
 *   • Other admins VIEWING (neutral, ambient)   — informational only.
 *   • RECENT editors (subtle)                   — nobody is here now, but
 *     the record moved recently, so what you loaded may already be stale.
 *
 * Renders nothing when the record is uncontended, which is the common case.
 */
export default function LockBanner({
  lock,
  entityLabel = 'record',
  className,
}: {
  lock: UseResourceLock;
  entityLabel?: string;
  className?: string;
}) {
  const [takingOver, setTakingOver] = useState(false);
  const { otherEditor, otherViewers, recentEditors, isReadOnly, enabled } = lock;

  if (!enabled) return null;

  const hasSignal = otherEditor || otherViewers.length > 0 || recentEditors.length > 0;
  if (!hasSignal) return null;

  return (
    <div className={cn('space-y-2', className)}>
      {/* ── Blocking: someone else holds the edit lock ── */}
      {otherEditor && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Lock className="h-5 w-5 shrink-0 text-amber-600" />
          <Avatar
            src={otherEditor.admin.avatar}
            firstName={otherEditor.admin.firstName}
            lastName={otherEditor.admin.lastName}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">
              {displayName(otherEditor.admin)} is editing this {entityLabel}
            </p>
            <p className="text-xs text-amber-700">
              {isReadOnly
                ? 'Your form is read-only so you don’t overwrite their work.'
                : 'You took over the edit — they are now read-only.'}
            </p>
          </div>
          {isReadOnly && (
            <Button
              size="sm"
              variant="outline"
              isLoading={takingOver}
              onClick={async () => {
                setTakingOver(true);
                await lock.beginEdit(true);
                setTakingOver(false);
              }}
            >
              Take over
            </Button>
          )}
        </div>
      )}

      {/* ── Ambient: others are looking ── */}
      {otherViewers.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
          <Eye className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          <div className="flex -space-x-2">
            {otherViewers.slice(0, 5).map((v) => (
              <Tooltip key={v.adminId} content={displayName(v.admin)}>
                <span className="inline-block rounded-full ring-2 ring-white">
                  <Avatar
                    src={v.admin.avatar}
                    firstName={v.admin.firstName}
                    lastName={v.admin.lastName}
                    size="xs"
                  />
                </span>
              </Tooltip>
            ))}
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            {otherViewers.length === 1
              ? `${displayName(otherViewers[0].admin)} is also viewing this`
              : `${otherViewers.length} other admins are viewing this`}
          </span>
        </div>
      )}

      {/* ── Subtle: changed recently by someone not currently here ── */}
      {!otherEditor && recentEditors.length > 0 && (
        <RecentEditorsNote editors={recentEditors} entityLabel={entityLabel} />
      )}
    </div>
  );
}

function RecentEditorsNote({
  editors,
  entityLabel,
}: {
  editors: RecentEditor[];
  entityLabel: string;
}) {
  const first = editors[0];
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-[var(--text-muted)]">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span>
        {displayName(first.admin)} changed this {entityLabel} {timeAgo(first.at)}
        {editors.length > 1 && ` (+${editors.length - 1} other${editors.length > 2 ? 's' : ''})`}
      </span>
    </div>
  );
}

/**
 * The 409 counterpart to `LockBanner`. Shown when a save was refused
 * because the record moved underneath us — the lock is advisory, this is
 * the check that actually protects the data.
 */
export function StaleWriteNotice({
  onReload,
  onOverwrite,
  entityLabel = 'record',
}: {
  onReload: () => void;
  onOverwrite?: () => void;
  entityLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
      <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-red-900">
          This {entityLabel} changed while you were editing
        </p>
        <p className="text-xs text-red-700">
          Nothing was saved. Reload to see their version, or overwrite it with yours.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onReload}>
        Reload
      </Button>
      {onOverwrite && (
        <Button size="sm" variant="destructive" onClick={onOverwrite}>
          Overwrite
        </Button>
      )}
    </div>
  );
}
