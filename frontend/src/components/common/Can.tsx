'use client';

import type { ReactNode } from 'react';
import { usePermissions } from '@/hooks/use-permissions';

interface CanProps {
  /** Permission key required. Use `any`/`all` for multi-key checks. */
  permission?: string;
  /** Render when the caller holds AT LEAST ONE of these. */
  any?: string[];
  /** Render when the caller holds ALL of these. */
  all?: string[];
  children: ReactNode;
  /** Rendered instead of `children` when the check fails. */
  fallback?: ReactNode;
}

/**
 * Conditionally render UI behind a permission check.
 *
 *     <Can permission="billing.refunds.approve">
 *       <Button onClick={approve}>Approve refund</Button>
 *     </Can>
 *
 * ── This is presentation, not security ─────────────────────────────────
 * Hiding a button prevents an accidental click, not a determined one. Every
 * endpoint independently re-checks via `requirePermission`, so a user who
 * edits their client state gains a button that 403s. Never rely on this
 * component to protect an action — rely on it to keep the UI honest about
 * what the person in front of it can actually do.
 */
export default function Can({ permission, any, all, children, fallback = null }: CanProps) {
  const { can, canAny, canAll } = usePermissions();

  let allowed = true;
  if (permission) allowed = allowed && can(permission);
  if (any?.length) allowed = allowed && canAny(...any);
  if (all?.length) allowed = allowed && canAll(...all);

  return <>{allowed ? children : fallback}</>;
}

/**
 * Inverse of `Can` — render only when the caller LACKS the permission.
 * Useful for upsell/explainer copy in place of a hidden control.
 */
export function Cannot({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = usePermissions();
  return <>{can(permission) ? null : children}</>;
}
