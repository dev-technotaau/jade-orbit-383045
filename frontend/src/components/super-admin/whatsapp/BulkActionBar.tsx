'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  CheckCheck,
  Clock,
  Tag,
  UserPlus,
  ChevronDown,
  X,
  Loader2,
} from 'lucide-react';
import { showToast } from '@/components/ui/Toast';
import { promptDialog } from '@/components/ui/dialog-service';
import { superAdminWhatsappService as svc } from '@/services/super-admin-whatsapp.service';
import type { ApiError } from '@/types/api';

type BulkConvAction =
  | 'archive'
  | 'unarchive'
  | 'resolve'
  | 'open'
  | 'pending'
  | 'markRead'
  | 'snooze'
  | 'unsnooze'
  | 'assign'
  | 'addLabel';

interface BulkActionBarProps {
  /** Page-selected conversation ids. */
  ids: string[];
  /** Total conversations matching the active filters (for "select all N"). */
  totalMatching: number;
  /** Whether the selection is "all matching the filter" rather than the id list. */
  allMatching: boolean;
  /** The active inbox filters, sent when allMatching. */
  filters: Record<string, unknown>;
  /** Whether "select all matching" is offered (off for the client-only Unassigned view). */
  canSelectAllMatching: boolean;
  onSelectAllMatching: () => void;
  onClear: () => void;
  /** Invalidate queries after a successful bulk action. */
  onDone: () => void;
}

/** Lightweight dropdown: a trigger button + a menu closed by an outside click. */
function Menu({
  label,
  icon,
  busy,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  busy: boolean;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60"
      >
        {icon} {label} <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-44 overflow-y-auto rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg">
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--bg-secondary)]"
    >
      {children}
    </button>
  );
}

/** Snooze N ms from now → ISO. Module-level so Date.now() isn't called in render. */
function snoozeIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}
/** Tomorrow at 09:00 local → ISO. */
function tomorrow9(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/**
 * Sticky bulk-action bar for the conversation list. Acts on the page selection
 * (ids) OR every conversation matching the active filters ("select all N").
 * Each action is one atomic backend call (svc.bulkConversations).
 */
export default function BulkActionBar({
  ids,
  totalMatching,
  allMatching,
  filters,
  canSelectAllMatching,
  onSelectAllMatching,
  onClear,
  onDone,
}: BulkActionBarProps) {
  const { data: agentsData } = useQuery({
    queryKey: ['wa-agents'],
    queryFn: () => svc.listAgents(),
  });
  const agents = agentsData?.data ?? [];

  const mut = useMutation({
    mutationFn: (payload: {
      action: BulkConvAction;
      assignedTo?: string | null;
      snoozedUntil?: string | null;
      label?: string;
    }) =>
      svc.bulkConversations(
        allMatching ? { allMatching: true, filters, ...payload } : { ids, ...payload },
      ),
    onSuccess: (res) => {
      showToast.success(`Updated ${res.data?.count ?? 0} conversation(s)`);
      onDone();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Bulk action failed'),
  });

  const count = allMatching ? totalMatching : ids.length;
  if (count === 0) return null;
  const busy = mut.isPending;
  const run = (
    action: BulkConvAction,
    extra?: { assignedTo?: string | null; snoozedUntil?: string | null; label?: string },
  ) => mut.mutate({ action, ...extra });

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-[var(--border)] bg-[var(--primary-light)] px-3 py-2">
      <span className="text-primary text-xs font-semibold">
        {allMatching ? `All ${count} selected` : `${count} selected`}
      </span>
      {!allMatching && canSelectAllMatching && totalMatching > ids.length && (
        <button
          type="button"
          onClick={onSelectAllMatching}
          className="text-primary text-[11px] font-medium underline underline-offset-2 hover:opacity-80"
        >
          Select all {totalMatching}
        </button>
      )}
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-muted)]" />}

      <div className="ml-auto flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => run('resolve')}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
        </button>
        <button
          type="button"
          onClick={() => run('markRead')}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60"
        >
          <CheckCheck className="h-3.5 w-3.5" /> Mark read
        </button>

        <Menu label="Status" icon={<CheckCircle2 className="h-3.5 w-3.5" />} busy={busy}>
          {(close) => (
            <>
              <MenuItem
                onClick={() => {
                  run('open');
                  close();
                }}
              >
                Mark Open
              </MenuItem>
              <MenuItem
                onClick={() => {
                  run('pending');
                  close();
                }}
              >
                Mark Pending
              </MenuItem>
              <MenuItem
                onClick={() => {
                  run('resolve');
                  close();
                }}
              >
                Mark Resolved
              </MenuItem>
            </>
          )}
        </Menu>

        <Menu label="Snooze" icon={<Clock className="h-3.5 w-3.5" />} busy={busy}>
          {(close) => (
            <>
              <MenuItem
                onClick={() => {
                  run('snooze', { snoozedUntil: snoozeIn(3600_000) });
                  close();
                }}
              >
                Snooze 1 hour
              </MenuItem>
              <MenuItem
                onClick={() => {
                  run('snooze', { snoozedUntil: snoozeIn(8 * 3600_000) });
                  close();
                }}
              >
                Snooze 8 hours
              </MenuItem>
              <MenuItem
                onClick={() => {
                  run('snooze', { snoozedUntil: tomorrow9() });
                  close();
                }}
              >
                Until tomorrow 9am
              </MenuItem>
              <MenuItem
                onClick={() => {
                  run('unsnooze');
                  close();
                }}
              >
                Un-snooze
              </MenuItem>
            </>
          )}
        </Menu>

        <Menu label="Assign" icon={<UserPlus className="h-3.5 w-3.5" />} busy={busy}>
          {(close) => (
            <>
              <MenuItem
                onClick={() => {
                  run('assign', { assignedTo: null });
                  close();
                }}
              >
                Unassign
              </MenuItem>
              {agents.map((a) => (
                <MenuItem
                  key={a.id}
                  onClick={() => {
                    run('assign', { assignedTo: a.id });
                    close();
                  }}
                >
                  {a.firstName || a.lastName
                    ? `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim()
                    : a.email}
                </MenuItem>
              ))}
            </>
          )}
        </Menu>

        <button
          type="button"
          onClick={async () => {
            const label = (
              await promptDialog({
                title: 'Add label',
                label: 'Label to add to the selected conversations',
              })
            )?.trim();
            if (label) run('addLabel', { label });
          }}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60"
        >
          <Tag className="h-3.5 w-3.5" /> Label
        </button>
        <button
          type="button"
          onClick={() => run('archive')}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60"
        >
          <Archive className="h-3.5 w-3.5" /> Archive
        </button>
        <button
          type="button"
          onClick={() => run('unarchive')}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60"
        >
          <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
