'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Lock, AlertTriangle, Search, X, Ban, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import Tooltip from '@/components/ui/Tooltip';
import type { PermissionEffect, PermissionNode } from '@/types/permissions';

/**
 * The nested permission grant editor.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ── The model this UI must express ─────────────────────────────────────
 * Grants are stored as a SPARSE set of keys, and a key implies everything
 * beneath it. Ticking "Email" stores ONE row (`email`) that covers all ~60
 * descendants — including ones shipped next quarter. Ticking three leaves
 * stores three rows.
 *
 * That is why this is not a plain checkbox list. A node here has four
 * distinct states, and conflating any two of them produces a UI that lies:
 *
 *   CHECKED       — explicitly granted (a row exists for this exact key)
 *   INHERITED     — covered by an ancestor grant. Shown ticked but muted,
 *                   and NOT independently removable: you clear it by
 *                   untucking the ancestor, which is the honest mapping to
 *                   what is actually stored.
 *   INDETERMINATE — some, but not all, descendants are granted
 *   DENIED        — an explicit DENY carve-out beneath a broad allow
 *
 * ── Why DENY exists in the UI at all ───────────────────────────────────
 * The common enterprise ask is "give them Email, but not Settings". Without
 * DENY that becomes ticking 58 individual leaves and re-auditing them
 * whenever a feature ships. With it: one ALLOW, one DENY, and new
 * sub-permissions inherit correctly forever.
 *
 * ── Locked nodes ───────────────────────────────────────────────────────
 * `superAdminOnly` subtrees (admin management, the permission system
 * itself, Kafka/queue replay) render disabled with a lock. The server
 * refuses them too — this is the visible half of that rule, not the
 * enforcement.
 */

export interface PermissionSelection {
  /** Explicitly granted keys (ALLOW). */
  allow: Set<string>;
  /** Explicit DENY carve-outs. */
  deny: Set<string>;
}

type NodeState = 'checked' | 'inherited' | 'indeterminate' | 'denied' | 'unchecked';

interface FlatNode {
  key: string;
  node: PermissionNode;
  depth: number;
  superAdminOnly: boolean;
  childKeys: string[];
  descendantKeys: string[];
}

function flatten(
  nodes: PermissionNode[],
  parent: string | null,
  depth: number,
  inheritedLock: boolean,
  out: FlatNode[],
): string[] {
  const keysHere: string[] = [];
  for (const node of nodes) {
    const key = parent ? `${parent}.${node.segment}` : node.segment;
    const superAdminOnly = inheritedLock || node.superAdminOnly === true;
    const entry: FlatNode = {
      key,
      node,
      depth,
      superAdminOnly,
      childKeys: (node.children ?? []).map((c) => `${key}.${c.segment}`),
      descendantKeys: [],
    };
    out.push(entry);
    if (node.children?.length) {
      entry.descendantKeys = flatten(node.children, key, depth + 1, superAdminOnly, out);
    }
    keysHere.push(key, ...entry.descendantKeys);
  }
  return keysHere;
}

/** Is `key` covered by an ancestor in `set`? (Not the key itself.) */
function coveredByAncestor(set: Set<string>, key: string): string | null {
  const parts = key.split('.');
  for (let i = parts.length - 1; i > 0; i--) {
    const ancestor = parts.slice(0, i).join('.');
    if (set.has(ancestor)) return ancestor;
  }
  return null;
}

export default function PermissionTree({
  tree,
  selection,
  onChange,
  readOnly = false,
  isSuperAdminTarget = false,
}: {
  tree: PermissionNode[];
  selection: PermissionSelection;
  onChange: (next: PermissionSelection) => void;
  readOnly?: boolean;
  /**
   * When the target IS a super-admin the editor is inert — they hold every
   * permission by role and store no grants, so offering checkboxes would
   * imply an effect that cannot exist.
   */
  isSuperAdminTarget?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState('');

  const flat = useMemo(() => {
    const out: FlatNode[] = [];
    flatten(tree, null, 1, false, out);
    return out;
  }, [tree]);

  const stateOf = (entry: FlatNode): NodeState => {
    const { key, descendantKeys } = entry;

    if (selection.deny.has(key)) return 'denied';
    if (selection.allow.has(key)) return 'checked';

    const denyAncestor = coveredByAncestor(selection.deny, key);
    const allowAncestor = coveredByAncestor(selection.allow, key);
    // Longest-prefix-wins: whichever ancestor is more specific decides.
    if (denyAncestor && (!allowAncestor || denyAncestor.length >= allowAncestor.length)) {
      return 'denied';
    }
    if (allowAncestor) return 'inherited';

    if (descendantKeys.some((d) => selection.allow.has(d))) return 'indeterminate';
    return 'unchecked';
  };

  const toggle = (entry: FlatNode) => {
    if (readOnly || entry.superAdminOnly || isSuperAdminTarget) return;
    const allow = new Set(selection.allow);
    const deny = new Set(selection.deny);
    const state = stateOf(entry);

    if (state === 'checked' || state === 'indeterminate') {
      // Clear this key and everything it implied. Descendants are removed
      // too, otherwise unticking a parent would leave orphaned child grants
      // that silently keep access alive.
      allow.delete(entry.key);
      entry.descendantKeys.forEach((d) => {
        allow.delete(d);
        deny.delete(d);
      });
    } else if (state === 'inherited') {
      // Can't untick an inherited node directly — that would need a DENY,
      // which is a separate, explicit action. Nudge toward it instead.
      deny.add(entry.key);
    } else if (state === 'denied') {
      deny.delete(entry.key);
    } else {
      allow.add(entry.key);
      // Ticking a branch supersedes any narrower grants beneath it, so drop
      // the now-redundant rows and keep the stored set minimal.
      entry.descendantKeys.forEach((d) => allow.delete(d));
    }

    onChange({ allow, deny });
  };

  const toggleDeny = (entry: FlatNode) => {
    if (readOnly || entry.superAdminOnly || isSuperAdminTarget) return;
    const allow = new Set(selection.allow);
    const deny = new Set(selection.deny);
    if (deny.has(entry.key)) {
      deny.delete(entry.key);
    } else {
      deny.add(entry.key);
      allow.delete(entry.key);
    }
    onChange({ allow, deny });
  };

  const q = filter.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    const hit = new Set<string>();
    for (const f of flat) {
      if (
        f.key.toLowerCase().includes(q) ||
        f.node.label.toLowerCase().includes(q) ||
        f.node.description?.toLowerCase().includes(q)
      ) {
        hit.add(f.key);
        // Keep ancestors so the match stays reachable in the tree.
        f.key.split('.').forEach((_, i, parts) => hit.add(parts.slice(0, i + 1).join('.')));
      }
    }
    return hit;
  }, [q, flat]);

  const visible = flat.filter((f) => {
    if (matches && !matches.has(f.key)) return false;
    if (matches) return true;
    if (f.depth === 1) return true;
    // Show a node only when every ancestor is expanded.
    const parts = f.key.split('.');
    for (let i = 1; i < parts.length; i++) {
      if (!expanded.has(parts.slice(0, i).join('.'))) return false;
    }
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search permissions…"
          aria-label="Search permissions"
          className="focus:border-primary focus:ring-primary/20 w-full rounded-lg border border-[var(--border)] bg-white py-2 pr-8 pl-9 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:outline-none"
        />
        {filter && (
          <button
            type="button"
            onClick={() => setFilter('')}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isSuperAdminTarget && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p className="text-xs text-blue-800">
            Super-admins hold every permission by role and store no individual grants, so there is
            nothing to edit here. Removing their access would require changing their role.
          </p>
        </div>
      )}

      {/* `data-lenis-prevent` is load-bearing, not decoration. SmoothScroll
          (app/layout.tsx:565) mounts Lenis over the whole app, and Lenis
          swallows the wheel event to animate the window scroll itself — so a
          nested overflow container receives nothing and only responds to the
          scrollbar being dragged. Lenis skips any wheel whose target sits inside
          a marked subtree, restoring native scrolling here while the page keeps
          its smooth scroll. Same reason /super-admin/email/layout.tsx marks its
          entire subtree. */}
      <div
        data-lenis-prevent
        className="max-h-[560px] overflow-y-auto rounded-xl border border-[var(--border)] bg-white"
      >
        {visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--text-muted)]">
            No permissions match &ldquo;{filter}&rdquo;.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {visible.map((entry) => {
              const state = stateOf(entry);
              const hasChildren = entry.childKeys.length > 0;
              const isOpen = expanded.has(entry.key) || Boolean(matches);
              const disabled = readOnly || entry.superAdminOnly || isSuperAdminTarget;

              return (
                <li
                  key={entry.key}
                  className={cn(
                    'group flex items-start gap-2 py-2 pr-3 transition-colors hover:bg-[var(--bg-secondary)]',
                    state === 'denied' && 'bg-red-50/50',
                  )}
                  style={{ paddingLeft: `${(entry.depth - 1) * 20 + 12}px` }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(entry.key)) next.delete(entry.key);
                        else next.add(entry.key);
                        return next;
                      })
                    }
                    aria-label={
                      isOpen ? `Collapse ${entry.node.label}` : `Expand ${entry.node.label}`
                    }
                    aria-expanded={hasChildren ? isOpen : undefined}
                    className={cn(
                      'mt-0.5 rounded p-0.5 text-[var(--text-muted)] transition-transform hover:text-[var(--text)]',
                      !hasChildren && 'invisible',
                      isOpen && 'rotate-90',
                    )}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>

                  <TriStateBox
                    state={state}
                    disabled={disabled}
                    label={entry.node.label}
                    onClick={() => toggle(entry)}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          state === 'denied'
                            ? 'text-red-700 line-through'
                            : state === 'inherited'
                              ? 'text-[var(--text-muted)]'
                              : 'text-[var(--text)]',
                        )}
                      >
                        {entry.node.label}
                      </span>

                      {entry.superAdminOnly && (
                        <Tooltip content="Reserved for super-admins — cannot be granted">
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                            <Lock className="h-2.5 w-2.5" />
                            Super-admin
                          </span>
                        </Tooltip>
                      )}

                      {entry.node.sensitive && !entry.superAdminOnly && (
                        <Tooltip content="High blast radius — grant deliberately">
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Sensitive
                          </span>
                        </Tooltip>
                      )}

                      {state === 'inherited' && (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                          via parent
                        </span>
                      )}
                      {state === 'denied' && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          Denied
                        </span>
                      )}
                    </div>

                    {entry.node.description && (
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {entry.node.description}
                      </p>
                    )}
                    <code className="mt-0.5 block font-mono text-[10px] text-[var(--text-muted)]">
                      {entry.key}
                    </code>
                  </div>

                  {!disabled && (
                    <Tooltip
                      content={
                        state === 'denied'
                          ? 'Remove this deny carve-out'
                          : 'Deny — overrides any broader grant above it'
                      }
                    >
                      <button
                        type="button"
                        onClick={() => toggleDeny(entry)}
                        aria-label={
                          state === 'denied'
                            ? `Un-deny ${entry.node.label}`
                            : `Deny ${entry.node.label}`
                        }
                        aria-pressed={state === 'denied'}
                        className={cn(
                          'mt-0.5 rounded p-1 transition-opacity',
                          state === 'denied'
                            ? 'bg-red-100 text-red-600 opacity-100'
                            : 'text-[var(--text-muted)] opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600',
                        )}
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
        <LegendSwatch className="border-primary bg-primary" label="Granted" />
        <LegendSwatch className="border-blue-300 bg-blue-200" label="Inherited from parent" />
        <LegendSwatch className="border-[var(--border)] bg-[var(--bg-tertiary)]" label="Partial" />
        <LegendSwatch className="border-red-300 bg-red-200" label="Explicitly denied" />
      </div>
    </div>
  );
}

function TriStateBox({
  state,
  disabled,
  label,
  onClick,
}: {
  state: NodeState;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const checked = state === 'checked' || state === 'inherited';

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'indeterminate' ? 'mixed' : checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'focus-visible:ring-primary mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none',
        disabled && 'cursor-not-allowed opacity-50',
        state === 'checked' && 'border-primary bg-primary text-white',
        state === 'inherited' && 'border-blue-300 bg-blue-200 text-blue-700',
        state === 'denied' && 'border-red-300 bg-red-200 text-red-700',
        state === 'indeterminate' && 'border-[var(--border)] bg-[var(--bg-tertiary)]',
        state === 'unchecked' &&
          'border-[var(--border)] bg-white hover:border-[var(--border-hover)]',
      )}
    >
      {(state === 'checked' || state === 'inherited') && <Check className="h-3 w-3" />}
      {state === 'denied' && <Ban className="h-2.5 w-2.5" />}
      {state === 'indeterminate' && <span className="h-0.5 w-2 rounded bg-[var(--text-muted)]" />}
    </button>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('inline-block h-3 w-3 rounded border', className)} />
      {label}
    </span>
  );
}

/** Convert a stored grant list into the editor's selection shape. */
export function toSelection(
  grants: { permissionKey: string; effect: PermissionEffect }[],
): PermissionSelection {
  return {
    allow: new Set(grants.filter((g) => g.effect === 'ALLOW').map((g) => g.permissionKey)),
    deny: new Set(grants.filter((g) => g.effect === 'DENY').map((g) => g.permissionKey)),
  };
}

/** Convert the editor's selection back into the wire format. */
export function fromSelection(
  selection: PermissionSelection,
): { permissionKey: string; effect: PermissionEffect }[] {
  return [
    ...[...selection.allow].map((permissionKey) => ({
      permissionKey,
      effect: 'ALLOW' as PermissionEffect,
    })),
    ...[...selection.deny].map((permissionKey) => ({
      permissionKey,
      effect: 'DENY' as PermissionEffect,
    })),
  ];
}
