/**
 * Widget data controller — feeds Windows 11 Widget Board adaptive
 * cards.
 *
 * The frontend `manifest.ts` declares a Hire Adda widget with:
 *   - template:   /widgets/recent-jobs.json (Adaptive Card 1.5)
 *   - data url:   /api/v1/widgets/recent-jobs (this controller)
 *
 * Every 30 minutes the Widgets Board re-fetches the data URL and re-
 * renders the card. We return the latest 5 public job listings in the
 * shape the Adaptive Card template expects (see `$data` and `$root`
 * bindings in the JSON template).
 *
 * @see https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps-chromium/how-to/widgets
 * @see https://adaptivecards.io/explorer/
 */
import type { Request, Response, NextFunction } from 'express';
import { searchPublicJobs } from '../services/public-jobs.service';
import logger from '../config/logger';

const APP_URL = process.env.PUBLIC_APP_URL || 'https://hireadda.in';
const WIDGET_LIMIT = 5;

interface AdaptiveCardJobItem {
  title: string;
  company: string;
  location: string;
  url: string;
  /** Optional salary range (e.g. "₹6–14 LPA"). */
  salary?: string;
}

interface AdaptiveCardData {
  /** Top-level (`$root`) bindings. */
  brandIcon: string;
  subtitle: string;
  allJobsUrl: string;
  homeUrl: string;
  /** Array binding (`$data`) for the iterating Container. */
  jobs: AdaptiveCardJobItem[];
  /** True when `jobs` is empty so the template hides the empty-state. */
  empty: boolean;
}

function formatSalaryShort(
  min: number | null | undefined,
  max: number | null | undefined
): string | undefined {
  if (!min && !max) return undefined;
  const fmt = (n: number) => {
    if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}Cr`;
    if (n >= 100_000) return `${(n / 100_000).toFixed(1)}L`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  };
  if (min && max) return `₹${fmt(min)}–${fmt(max)} per year`;
  return `₹${fmt(min ?? max ?? 0)}+ per year`;
}

export const recentJobs = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await searchPublicJobs({
      limit: WIDGET_LIMIT,
      page: 1,
      sortBy: 'date',
      authenticated: false,
    });

    const items: AdaptiveCardJobItem[] = (
      (result?.items ?? []) as Array<{
        slug?: string | null;
        title?: string;
        location?: string | null;
        salaryMin?: number | string | null;
        salaryMax?: number | string | null;
        salaryNotDisclosed?: boolean;
        company?: { companyName?: string | null } | null;
      }>
    )
      .filter((j) => j.slug && j.title)
      .map((j) => {
        const salary = j.salaryNotDisclosed
          ? undefined
          : formatSalaryShort(
              typeof j.salaryMin === 'string' ? Number(j.salaryMin) : (j.salaryMin ?? null),
              typeof j.salaryMax === 'string' ? Number(j.salaryMax) : (j.salaryMax ?? null)
            );
        return {
          title: j.title ?? 'Job opening',
          company: j.company?.companyName ?? 'Verified employer',
          location: j.location ?? 'India',
          url: `${APP_URL}/jobs/${j.slug}?utm_source=pwa&utm_medium=widget`,
          ...(salary ? { salary } : {}),
        };
      });

    const payload: AdaptiveCardData = {
      brandIcon: `${APP_URL}/icons/logo.png`,
      subtitle: items.length
        ? 'Hand-picked verified openings, refreshed every 30 min.'
        : 'Latest verified openings, refreshed every 30 min.',
      allJobsUrl: `${APP_URL}/jobs?utm_source=pwa&utm_medium=widget`,
      homeUrl: `${APP_URL}/?utm_source=pwa&utm_medium=widget`,
      jobs: items,
      empty: items.length === 0,
    };

    // 30-min server cache hint for the Edge Widget Board.
    res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Return the data shape directly (NOT wrapped in `{status, data}` —
    // Adaptive Cards bind `$root` to the raw JSON body).
    res.status(200).json(payload);
  } catch (err) {
    logger.warn('widget recent-jobs handler failed', err);
    next(err);
  }
};
