import { z } from 'zod';

/**
 * The digest / quiet-hours block inside `notificationPreferences`.
 *
 * Shared by the candidate and employer profile schemas because `validate()`
 * runs `.parse()`, which STRIPS undeclared keys — a preference the frontend
 * sends but the schema does not declare is silently dropped before the
 * controller ever sees it, and the setting appears to save while changing
 * nothing. Declaring it in exactly one place keeps the two roles from
 * drifting apart.
 *
 * Every key is optional: the policy layer falls back to the documented
 * default for anything absent, so a partial patch is always valid.
 */

const cadence = z.enum(['DAILY', 'WEEKLY', 'OFF']);

/**
 * All digest categories are accepted for both roles rather than split by
 * audience. The policy layer only ever reads the categories relevant to the
 * user's role, so an irrelevant key is inert — and accepting it avoids a
 * validation error if the UI ships a shared component.
 */
export const digestPrefsShape = {
  digests: z
    .object({
      job_recommendations: cadence.optional(),
      followed_company_jobs: cadence.optional(),
      profile_views: cadence.optional(),
      saved_jobs_closing: cadence.optional(),
      candidate_recommendations: cadence.optional(),
      applications_awaiting: cadence.optional(),
      cv_search_alerts: cadence.optional(),
    })
    .optional(),

  quietHours: z
    .object({
      enabled: z.boolean().optional(),
      /** Local hour 0–23 when the quiet window opens. */
      start: z.number().int().min(0).max(23).optional(),
      /** Local hour 0–23 when it closes. May be < start (crosses midnight). */
      end: z.number().int().min(0).max(23).optional(),
    })
    .optional(),

  /**
   * IANA zone (e.g. `Asia/Kolkata`) used to evaluate quiet hours in the
   * user's own local time. Validated against the runtime's zone database so
   * a typo cannot silently disable the quiet window.
   */
  timezone: z
    .string()
    .max(64)
    .refine(
      (tz) => {
        try {
          new Intl.DateTimeFormat('en-GB', { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Unknown timezone' }
    )
    .optional(),
};
