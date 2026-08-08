'use client';

/**
 * Permission stub.
 *
 * The host application had a full PBAC layer: a permission registry, per-admin
 * grants fetched from the API, longest-prefix resolution and DENY overrides.
 * None of that exists here — one shared password gates the module, and whoever
 * holds it can do everything.
 *
 * This keeps the original hook shape so its ~5 consumers compile unchanged, and
 * answers "yes" to every question. Enforcement is entirely server-side
 * (`requireAppPassword`); a client-side permission check was never security, and
 * with no roles there is nothing left to check.
 *
 * If per-operator restrictions are ever wanted, this is the seam to implement
 * them at — but they would need a real backend check behind them.
 */
export function usePermissions() {
  return {
    /** Always allowed. */
    can: (_key?: string) => true,
    /** Always allowed. */
    canAny: (..._keys: string[]) => true,
    /** Always allowed. */
    canAll: (..._keys: string[]) => true,
    /** Nothing enumerates permissions any more. */
    allowed: [] as string[],
    grants: [] as unknown[],
    roles: [] as string[],
    /** The single operator has full reach, so both read true. */
    isSuperAdmin: true,
    isAdmin: true,
    isLoading: false,
  };
}

export default usePermissions;
