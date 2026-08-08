import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import JsonLd from '@/components/seo/JsonLd';
import { breadcrumbSchema } from '@/lib/json-ld';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  name: string;
  /** Relative or absolute URL. Leave undefined on the current page (last crumb). */
  href?: string;
}

interface BreadcrumbsProps {
  /**
   * Items in order: root → current. `Home` is prepended automatically unless
   * you pass `includeHome={false}`. The last item should NOT have `href`
   * (it's the current page).
   */
  items: BreadcrumbItem[];
  includeHome?: boolean;
  className?: string;
  /** Emit BreadcrumbList JSON-LD schema alongside the visible UI. Default true. */
  withSchema?: boolean;
}

/**
 * Visible breadcrumb navigation + matching BreadcrumbList JSON-LD.
 *
 * Rendering the schema alongside visible breadcrumbs satisfies Google's
 * policy (structured data must reflect visible content) and triggers
 * breadcrumb rich results in SERP — replacing the raw URL under each
 * result with a crumb trail like "Home › Help › Applying for jobs".
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
 */
export default function Breadcrumbs({
  items,
  includeHome = true,
  className,
  withSchema = true,
}: BreadcrumbsProps) {
  const fullItems: BreadcrumbItem[] = includeHome ? [{ name: 'Home', href: '/' }, ...items] : items;

  // Schema requires every item to have an absolute URL. For the current
  // page (last item without href), fall back to its own path deriving
  // from the previous item's URL — but cleanest is to require the caller
  // to supply href for every item on the schema side.
  const schemaItems = fullItems.map((item, i) => ({
    name: item.name,
    url: item.href ?? (i === fullItems.length - 1 ? '' : '/'),
  }));

  return (
    <>
      {withSchema && schemaItems.every((i) => i.url) && (
        <JsonLd id="jsonld-breadcrumbs" data={breadcrumbSchema(schemaItems)} />
      )}
      <nav
        aria-label="Breadcrumb"
        className={cn('flex items-center gap-1 text-sm text-[var(--text-muted)]', className)}
      >
        <ol className="flex flex-wrap items-center gap-1">
          {fullItems.map((item, i) => {
            const isLast = i === fullItems.length - 1;
            const isHome = i === 0 && includeHome;
            return (
              <li key={`${item.name}-${i}`} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
                    aria-hidden="true"
                  />
                )}
                {isLast ? (
                  <span
                    aria-current="page"
                    className="inline-flex items-center gap-1 font-medium text-[var(--text)]"
                  >
                    {isHome && <Home className="h-3.5 w-3.5" aria-hidden="true" />}
                    {item.name}
                  </span>
                ) : item.href ? (
                  <Link
                    href={item.href}
                    className="hover:text-primary inline-flex items-center gap-1 transition-colors"
                  >
                    {isHome && <Home className="h-3.5 w-3.5" aria-hidden="true" />}
                    {item.name}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    {isHome && <Home className="h-3.5 w-3.5" aria-hidden="true" />}
                    {item.name}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
