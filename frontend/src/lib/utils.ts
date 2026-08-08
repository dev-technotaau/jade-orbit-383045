import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Resolve which nav href is "active" for the current pathname using
 * longest-prefix matching. A parent route (e.g. `/employer/vendor`) is NOT
 * highlighted when a more specific child (e.g. `/employer/vendor/requests`)
 * is open — the longest matching href wins. Returns that href, or null.
 *
 * Subsumes the old Dashboard exact-match special case: on `/employer` only
 * the dashboard href matches; on `/employer/jobs` the longer Jobs href wins.
 */
export function resolveActiveNavHref(hrefs: string[], pathname: string): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (pathname === href || pathname.startsWith(href + '/')) {
      if (best === null || href.length > best.length) best = href;
    }
  }
  return best;
}

export function formatDate(date: string | Date, pattern: string = 'MMM dd, yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, pattern);
}

export function formatRelativeDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

/** Check if a date is within the last N hours from now. */
export function isPostedWithin(createdAt: string | Date, hours: number): boolean {
  const t = typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt.getTime();
  return Date.now() - t < hours * 3_600_000;
}

export function formatCurrency(amount: number, currency: string = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatSalaryRange(
  min?: number | null,
  max?: number | null,
  currency: string = 'INR',
): string {
  if (!min && !max) return 'Not Disclosed';
  if (min && max) return `${formatCurrency(min, currency)} - ${formatCurrency(max, currency)}`;
  if (min) return `${formatCurrency(min, currency)}+`;
  if (max) return `Up to ${formatCurrency(max, currency)}`;
  return 'Not Disclosed';
}

export function formatNumber(num: number): string {
  if (num >= 10000000) return `${(num / 10000000).toFixed(1)}Cr`;
  if (num >= 100000) return `${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function getInitials(firstName?: string | null, lastName?: string | null): string {
  const first = firstName?.charAt(0)?.toUpperCase() || '';
  const last = lastName?.charAt(0)?.toUpperCase() || '';
  return first + last || '?';
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function getExperienceLabel(years: number): string {
  if (years === 0) return 'Fresher';
  if (years === 1) return '1 year';
  return `${years} years`;
}

export function buildQueryString(
  params: Record<string, string | number | boolean | string[] | undefined | null>,
): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if (Array.isArray(value)) {
        // For arrays, append multiple values with the same key
        value.forEach((v) => searchParams.append(key, String(v)));
      } else {
        searchParams.set(key, String(value));
      }
    }
  });
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Returns a time-aware greeting with the user's name.
 * - 5–11:59 → Good morning
 * - 12–16:59 → Good afternoon
 * - 17–20:59 → Good evening
 * - 21–4:59 → Good night
 */
export function getGreeting(firstName?: string | null): string {
  const hour = new Date().getHours();
  let salutation: string;
  if (hour >= 5 && hour < 12) salutation = 'Good morning';
  else if (hour >= 12 && hour < 17) salutation = 'Good afternoon';
  else if (hour >= 17 && hour < 21) salutation = 'Good evening';
  else salutation = 'Good night';

  return firstName ? `${salutation}, ${firstName}` : salutation;
}

/**
 * Returns a contextual subtitle for the dashboard based on role.
 */
export function getDashboardSubtitle(role?: string): string {
  switch (role) {
    case 'CANDIDATE':
      return 'Here\u2019s an overview of your job search activity.';
    case 'EMPLOYER':
      return 'Here\u2019s your hiring activity overview.';
    case 'ADMIN':
      return 'Overview of platform activity and quick actions.';
    case 'SUPER_ADMIN':
      return 'System-wide administration and configuration.';
    default:
      return 'Here\u2019s your dashboard overview.';
  }
}
