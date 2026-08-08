import type { Request, Response, NextFunction } from 'express';
import { AppError } from './error';
import { getPermission, isKnownPermission } from '../config/permissions';
import { getEffectivePermissions, resolve } from '../services/permission.service';

/**
 * Permission enforcement for admin routes.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Layers on top of `restrictTo`, it does not replace it:
 *
 *     router.use(protect);
 *     router.use(restrictTo(Role.ADMIN, Role.SUPER_ADMIN));   // who you are
 *     router.get('/users', requirePermission('users.candidates.account.view'),
 *                controller.listUsers);                        // what you may do
 *
 * `restrictTo` still guards the surface (nobody outside the admin roles gets
 * near it); `requirePermission` decides which admins get which endpoints.
 *
 * SUPER_ADMIN short-circuits to allow — they are authorised by role and hold
 * no grant rows, so the platform owner can never be locked out by a bad
 * permission row.
 *
 * ── Fail-closed by construction ────────────────────────────────────────
 * An unknown key throws at request time rather than quietly allowing. That
 * turns a typo in a route definition into a loud 500 in dev instead of a
 * silently-open endpoint in production — the failure mode that matters.
 */

function assertKnown(keys: string[]): void {
  for (const key of keys) {
    if (!isKnownPermission(key)) {
      // Programmer error, not user error: the route names a permission the
      // registry does not define.
      throw new Error(
        `requirePermission() was given "${key}", which is not in the permission registry. ` +
          `Add it to backend/src/config/permissions.ts or fix the typo.`
      );
    }
  }
}

function denial(keys: string[]): AppError {
  const labels = keys.map((k) => getPermission(k)?.label ?? k);
  const what = labels.length === 1 ? labels[0] : labels.join(' or ');
  return new AppError(
    `You do not have permission to do this. Required: ${what}.`,
    403,
    'PERMISSION_DENIED'
  );
}

/**
 * Require EVERY listed permission.
 *
 * Most routes name exactly one. Use several when an endpoint genuinely
 * spans two domains — e.g. an export that both reads users and produces a
 * report file should require both, so neither grant alone leaks the other.
 */
export const requirePermission = (...keys: string[]) => {
  assertKnown(keys);

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new AppError('Not authorized. Please log in.', 401));
      }

      req.permissionKey = keys[0];

      if (req.user.role === 'SUPER_ADMIN') return next();
      if (req.user.role !== 'ADMIN') return next(denial(keys));

      const effective = await getEffectivePermissions(req.user.id, req.user.role);
      req.adminPermissions = effective;

      const ok = keys.every((k) => resolve(effective.grants, k));
      if (!ok) return next(denial(keys));

      next();
    } catch (error) {
      next(error);
    }
  };
};

/** Require AT LEAST ONE of the listed permissions. */
export const requireAnyPermission = (...keys: string[]) => {
  assertKnown(keys);

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new AppError('Not authorized. Please log in.', 401));
      }

      req.permissionKey = keys[0];

      if (req.user.role === 'SUPER_ADMIN') return next();
      if (req.user.role !== 'ADMIN') return next(denial(keys));

      const effective = await getEffectivePermissions(req.user.id, req.user.role);
      req.adminPermissions = effective;

      const ok = keys.some((k) => resolve(effective.grants, k));
      if (!ok) return next(denial(keys));

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * In-handler check for branches a route-level guard can't express — e.g. an
 * endpoint that returns extra fields only to admins holding a sensitive
 * permission, or a bulk action whose per-item scope varies.
 *
 * Reuses `req.adminPermissions` when `requirePermission` already ran, so
 * the common case costs nothing.
 */
export async function hasPermission(req: Request, key: string): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.role === 'SUPER_ADMIN') return true;
  if (req.user.role !== 'ADMIN') return false;

  const effective =
    req.adminPermissions ?? (await getEffectivePermissions(req.user.id, req.user.role));
  req.adminPermissions = effective;
  return resolve(effective.grants, key);
}

/** `hasPermission` that throws the standard 403 instead of returning false. */
export async function assertPermission(req: Request, key: string): Promise<void> {
  if (!(await hasPermission(req, key))) throw denial([key]);
}

// ═══════════════════════════════════════════════════════════════════════
// Declarative route → permission maps
// ═══════════════════════════════════════════════════════════════════════
//
// The WhatsApp, Email and Billing routers carry 100–150 routes each.
// Decorating every one with `requirePermission(...)` inline would work, but
// it buries the access model in noise: nobody can answer "what does the
// Email domain actually require?" by reading 150 scattered call sites.
//
// So those routers mount ONE `enforcePermissionMap()` middleware fed by an
// ordered rule table. The whole domain's access model is then a single
// reviewable block, and adding a route without adding a rule fails closed
// against the map's `fallback` rather than silently shipping open.

export interface PermissionRule {
  /** HTTP method, or '*' for any. */
  method: string;
  /**
   * Path pattern relative to the router mount. Supports `:param` (matches
   * one segment) and a trailing `*` (matches the rest).
   */
  path: string;
  /** Registry key required. */
  permission: string;
}

interface CompiledRule {
  method: string;
  regex: RegExp;
  permission: string;
  source: string;
}

function compileRule(rule: PermissionRule): CompiledRule {
  const pattern = rule.path
    // Escape regex metacharacters EXCEPT the ones our mini-syntax uses.
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '[^/]+')
    .replace(/\*/g, '.*');

  return {
    method: rule.method.toUpperCase(),
    regex: new RegExp(`^${pattern}/?$`),
    permission: rule.permission,
    source: `${rule.method} ${rule.path}`,
  };
}

/**
 * Enforce an ordered rule table. FIRST MATCH WINS, so put specific paths
 * above general ones (`/contacts/export` before `/contacts/:id`).
 *
 * `fallback` is required and applies to any route the table misses. Make it
 * the domain's most restrictive sensible key — a new endpoint that nobody
 * remembered to map should be hard to reach, not easy.
 */
export function enforcePermissionMap(rules: PermissionRule[], fallback: string) {
  const compiled = rules.map(compileRule);
  assertKnown([...rules.map((r) => r.permission), fallback]);

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new AppError('Not authorized. Please log in.', 401));
      }

      // `req.path` inside a mounted router is already relative to the mount.
      const path = req.path;
      const method = req.method.toUpperCase();
      const hit = compiled.find(
        (r) => (r.method === '*' || r.method === method) && r.regex.test(path)
      );
      const required = hit?.permission ?? fallback;

      req.permissionKey = required;

      if (req.user.role === 'SUPER_ADMIN') return next();
      if (req.user.role !== 'ADMIN') return next(denial([required]));

      const effective = await getEffectivePermissions(req.user.id, req.user.role);
      req.adminPermissions = effective;

      if (!resolve(effective.grants, required)) return next(denial([required]));
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Refuse when the TARGET of a user-management route is itself an admin.
 *
 * This closes a privilege-escalation path that permission keys alone
 * cannot. The `/super-admin/users/:id/*` family operates on any user id —
 * including admin and super-admin accounts. An admin granted, say,
 * `users.candidates.credentials.password` (a perfectly reasonable help-desk
 * grant) could otherwise point it at a colleague's admin account, reset
 * their password and take over a higher-privileged session.
 *
 * So: permission keys decide WHAT you may do; this decides WHO you may do
 * it to. Only a super-admin may act on an ADMIN or SUPER_ADMIN account,
 * which is also why `users.admins.*` is superAdminOnly in the registry.
 *
 * Placed after `requirePermission` on every route whose `:id` is a User.
 */
export const denyAdminTargets = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) return next(new AppError('Not authorized. Please log in.', 401));
    if (req.user.role === 'SUPER_ADMIN') return next();

    // Express 5 widens params to `string | string[]`; a repeated `:id` would
    // arrive as an array, which is never a valid user id — treat it as "no
    // target" and let the handler 404.
    const targetId = req.params.id;
    if (typeof targetId !== 'string' || !targetId) return next();

    // Imported lazily: this middleware is referenced from route modules that
    // are themselves imported at app boot, and a top-level prisma import
    // here would widen that cycle.
    const { default: prisma } = await import('../config/prisma');
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { role: true },
    });

    // Unknown id → let the handler produce its own 404 rather than leaking
    // existence through a 403.
    if (!target) return next();

    if (target.role === 'ADMIN' || target.role === 'SUPER_ADMIN') {
      return next(
        new AppError('Only a super-admin can manage admin accounts.', 403, 'ADMIN_TARGET_FORBIDDEN')
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Resolve the required permission from the TARGET USER'S ROLE.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * The registry splits user administration by subject —
 * `users.candidates.*` vs `users.employers.*` — because "give them
 * candidates but not employers" is the single most-requested scoping in a
 * job platform, and it is the example the product rule names directly.
 *
 * `requireAnyPermission('users.candidates.account.suspend',
 *                       'users.employers.account.suspend')` CANNOT express
 * that: it is OR-of-keys, not per-target. An admin granted only the
 * candidate key passes it and then suspends an employer, silently
 * collapsing the two subjects back into one. That is the bug this exists
 * to close.
 *
 * So: load the target once, decide which key applies from ITS role, and
 * check that one. Also folds in `denyAdminTargets` — the target is already
 * loaded, and every caller needs both — so a route cannot accidentally
 * apply one without the other.
 *
 *     router.patch('/users/:id/suspend',
 *       requireSubjectPermission('account.suspend'), handler);
 *     // candidate target → users.candidates.account.suspend
 *     // employer  target → users.employers.account.suspend
 *     // admin     target → 403, always
 *
 * `overrides` handles the pairs whose two sides are not symmetric — a
 * candidate has a `profile`, an employer has a `company`.
 */
export const requireSubjectPermission = (
  suffix: string,
  overrides?: { candidates?: string; employers?: string }
) => {
  const candidateKey = overrides?.candidates ?? `users.candidates.${suffix}`;
  const employerKey = overrides?.employers ?? `users.employers.${suffix}`;
  // Fail at import time on a typo, exactly like requirePermission.
  assertKnown([candidateKey, employerKey]);

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) return next(new AppError('Not authorized. Please log in.', 401));
      if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ADMIN') {
        return next(denial([candidateKey, employerKey]));
      }

      const targetId = req.params.id;
      if (typeof targetId !== 'string' || !targetId) return next();

      const { default: prisma } = await import('../config/prisma');
      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { role: true },
      });

      // Unknown id → let the handler 404 rather than leaking existence.
      if (!target) return next();

      // Resolve the key BEFORE the super-admin short-circuit so the activity
      // feed labels their mutations correctly. Returning early left
      // `permissionKey` (and therefore `domain`) null on every super-admin
      // action through these ~25 routes, so the control centre's per-domain
      // filter silently dropped them.
      //
      // Resolving it rather than defaulting to `candidateKey` matters for
      // the asymmetric `overrides` routes: a super-admin removing an
      // EMPLOYER's logo would otherwise be logged as
      // `users.candidates.profile.avatar`.
      const key = target.role === 'EMPLOYER' ? employerKey : candidateKey;
      req.permissionKey = key;

      if (req.user.role === 'SUPER_ADMIN') return next();

      if (target.role === 'ADMIN' || target.role === 'SUPER_ADMIN') {
        return next(
          new AppError(
            'Only a super-admin can manage admin accounts.',
            403,
            'ADMIN_TARGET_FORBIDDEN'
          )
        );
      }

      const effective = await getEffectivePermissions(req.user.id, req.user.role);
      req.adminPermissions = effective;

      if (!resolve(effective.grants, key)) return next(denial([key]));
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Refuse a privileged `role` in the REQUEST BODY unless the caller is a
 * super-admin.
 *
 * `denyAdminTargets` guards routes that ACT ON an existing admin. This
 * guards the other direction: routes that would CREATE one. Without it,
 * `POST /super-admin/users` — gated only on `users.create`, a perfectly
 * ordinary help-desk grant whose registry description reads "Provision a
 * new candidate or employer account" — accepts `role: 'ADMIN'` and mints a
 * peer. That routes straight around the `superAdminOnly` lock on
 * `POST /admins` and around the role-promotion lock on
 * `PATCH /users/:id/role`, both of which were already closed.
 *
 * The minted account is not inert, which is what makes this severe: it is
 * created with `mfaEnabled: false`, so it signs in with just a password and
 * immediately reaches every role-gated (as opposed to permission-gated)
 * surface. It also survives revocation of the admin who created it.
 */
export const denyAdminRoleBody = (req: Request, _res: Response, next: NextFunction): void => {
  const role = (req.body as { role?: unknown } | undefined)?.role;
  if ((role === 'ADMIN' || role === 'SUPER_ADMIN') && req.user?.role !== 'SUPER_ADMIN') {
    return next(
      new AppError('Only a super-admin can create admin accounts.', 403, 'SUPER_ADMIN_REQUIRED')
    );
  }
  next();
};

/**
 * Guard reserved for the permission system itself and admin management.
 *
 * These surfaces are SUPER_ADMIN-only by product rule — an admin must never
 * be able to widen their own access or mint a peer — and the registry marks
 * the corresponding keys `superAdminOnly` so they cannot be granted either.
 * This is the second lock on the same door.
 */
export const superAdminOnly = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    return next(new AppError('Not authorized. Please log in.', 401));
  }
  if (req.user.role !== 'SUPER_ADMIN') {
    return next(
      new AppError('This area is restricted to super-admins.', 403, 'SUPER_ADMIN_REQUIRED')
    );
  }
  next();
};
