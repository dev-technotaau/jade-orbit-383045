/**
 * Public sanitisation pipeline.
 *
 * Every response from the public API namespace (`/api/v1/public/*`)
 * goes through these helpers to strip:
 *   - Direct contact fields (email, phone) on jobs.
 *   - Walk-in contact (person name + phone).
 *   - Internal moderation flags + audit fields.
 *   - Exact salary numbers when the job has `salaryDisclosed: false`.
 *
 * The shape is deliberately not the same as the auth-only endpoints —
 * we don't accept `?fields=` selectors here because the wrong field on
 * the wrong endpoint is a privacy bug. Sanitisation is hard-coded.
 */

interface SanitiseOptions {
  /**
   * Cap how many results a guest sees on the listing surface. Plans
   * the soft-wall after N=30 results.
   */
  guestResultCap?: number;
  /**
   * Whether the request was made by an authenticated user. Some fields
   * (like exact salary on opted-in jobs) become visible post-auth.
   */
  authenticated?: boolean;
}

/**
 * Sanitise a single job document for public consumption.
 * Always returns a new object; never mutates the input.
 */
export function sanitiseJobForPublic(job: any, opts: SanitiseOptions = {}): any {
  if (!job) return job;
  const {
    contactEmail: _contactEmail,
    contactPhone: _contactPhone,
    walkInContactPerson: _walkInContactPerson,
    walkInContactPhone: _walkInContactPhone,
    walkInContactEmail: _walkInContactEmail,
    contactPerson: _contactPerson,
    referenceCode: _referenceCode, // internal
    closedReason: _closedReason, // internal
    lastExpirationWarning: _lastExpirationWarning, // internal
    ...safe
  } = job;

  // Salary masking: when `salaryDisclosed === false`, replace exact
  // numbers with "Not disclosed". We still keep currency for sorting.
  if (job.salaryDisclosed === false) {
    safe.salaryMin = null;
    safe.salaryMax = null;
    safe.salaryNotDisclosed = true;
  }

  // Internal-only fields a curious caller might enumerate.
  delete safe.internalNotes;
  delete safe.moderationStatus;
  delete safe.moderationFlags;
  delete safe.applicationCount; // exposed via separate counter API if needed.

  // Authenticated users get the same sanitisation — privacy is privacy.
  // We expose only what's appropriate for any logged-in candidate.
  void opts;

  return safe;
}

/**
 * Sanitise a single company document for public consumption.
 * Strips employer-internal fields that aren't suitable for the public
 * directory. The auth-gated `/employer/profile` endpoint returns
 * everything; this trimmed view is what guests see on /companies/{slug}.
 */
export function sanitiseCompanyForPublic(company: any): any {
  if (!company) return company;
  const {
    contactEmail: _contactEmail,
    contactPhone: _contactPhone,
    contactPersonName: _contactPersonName,
    contactPersonDesignation: _contactPersonDesignation,
    gstNumber: _gst,
    cinNumber: _cin,
    panNumber: _pan,
    llpinNumber: _llpin,
    tanNumber: _tan,
    notificationPreferences: _notif,
    defaultBillingAddressId: _addr,
    ...safe
  } = company;
  return safe;
}

/**
 * Apply the guest result cap on a paginated response. When the user is
 * unauthenticated and the requested page or total exceeds the cap, we
 * trim the items + signal the soft-wall via `loginRequired: true`.
 */
export function applyGuestResultCap<T>(
  items: T[],
  pagination: { page: number; limit: number; total: number },
  opts: SanitiseOptions = {}
): { items: T[]; pagination: typeof pagination & { cap?: number; loginRequired?: boolean } } {
  if (opts.authenticated || !opts.guestResultCap) {
    return { items, pagination };
  }
  const cap = opts.guestResultCap;
  const cappedTotal = Math.min(pagination.total, cap);
  const itemsAtCap = items.slice(0, Math.max(0, cap - (pagination.page - 1) * pagination.limit));
  return {
    items: itemsAtCap,
    pagination: {
      ...pagination,
      total: cappedTotal,
      cap,
      loginRequired: pagination.total > cap,
    },
  };
}
