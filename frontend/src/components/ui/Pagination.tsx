'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import Tooltip from './Tooltip';
import Select from './Select';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  /**
   * Enables the "per page" selector. The host page owns the state —
   * reset its page to 1 inside this handler.
   */
  onPageSizeChange?: (size: number) => void;
  /** Choices for the per-page selector (default 10/20/50/100). */
  pageSizeOptions?: number[];
  className?: string;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [1];

  if (currentPage > 3) {
    pages.push('ellipsis');
  }

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (currentPage < totalPages - 2) {
    pages.push('ellipsis');
  }

  pages.push(totalPages);

  return pages;
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className,
}: PaginationProps) {
  const pages = useMemo(() => getPageNumbers(currentPage, totalPages), [currentPage, totalPages]);

  // Without a size selector a single page needs no chrome at all. WITH
  // one we must keep rendering it — otherwise picking a large size
  // (1 page) would make the selector vanish with no way back.
  if (totalPages <= 1 && !onPageSizeChange) return null;

  const showingFrom = totalItems && pageSize ? (currentPage - 1) * pageSize + 1 : null;
  const showingTo = totalItems && pageSize ? Math.min(currentPage * pageSize, totalItems) : null;

  // Ensure the current size is always present so the selector never
  // shows a value that isn't in its own option list.
  const sizeOptions =
    pageSize && !pageSizeOptions.includes(pageSize)
      ? [...pageSizeOptions, pageSize].sort((a, b) => a - b)
      : pageSizeOptions;

  return (
    <div
      className={cn(
        // Centered (not right-aligned) so the page controls never sit under the
        // fixed BackToTop button in the bottom-right corner.
        'flex flex-col flex-wrap items-center justify-center gap-x-4 gap-y-3 sm:flex-row',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {totalItems !== undefined && pageSize && (
          <p className="text-sm text-[var(--text-muted)]">
            Showing <span className="font-medium text-[var(--text)]">{showingFrom}</span>-
            <span className="font-medium text-[var(--text)]">{showingTo}</span> of{' '}
            <span className="font-medium text-[var(--text)]">{totalItems}</span>
          </p>
        )}
        {onPageSizeChange && pageSize && (
          <div className="flex items-center gap-1.5 text-sm whitespace-nowrap text-[var(--text-muted)]">
            Show
            <Select
              size="sm"
              clearable={false}
              className="w-18"
              value={String(pageSize)}
              onChange={(val) => onPageSizeChange(Number(val))}
              options={sizeOptions.map((size) => ({ value: String(size), label: String(size) }))}
            />
            per page
          </div>
        )}
      </div>
      {totalPages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <Tooltip content="First page">
            <button
              type="button"
              onClick={() => onPageChange(1)}
              disabled={currentPage === 1}
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm transition-colors duration-200',
                'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                'disabled:pointer-events-none disabled:opacity-50',
              )}
              aria-label="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          </Tooltip>
          <Tooltip content="Previous page">
            <button
              type="button"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm transition-colors duration-200',
                'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                'disabled:pointer-events-none disabled:opacity-50',
              )}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </Tooltip>

          {pages.map((page, index) => {
            if (page === 'ellipsis') {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="inline-flex h-9 w-9 items-center justify-center text-sm text-[var(--text-muted)]"
                >
                  ...
                </span>
              );
            }

            const isActive = page === currentPage;
            return (
              <Tooltip key={page} content={`Go to page ${page}`}>
                <button
                  type="button"
                  onClick={() => onPageChange(page)}
                  className={cn(
                    'inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-colors duration-200',
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {page}
                </button>
              </Tooltip>
            );
          })}

          <Tooltip content="Next page">
            <button
              type="button"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm transition-colors duration-200',
                'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                'disabled:pointer-events-none disabled:opacity-50',
              )}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </Tooltip>
          <Tooltip content="Last page">
            <button
              type="button"
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage === totalPages}
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm transition-colors duration-200',
                'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]',
                'disabled:pointer-events-none disabled:opacity-50',
              )}
              aria-label="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </Tooltip>
        </nav>
      )}
    </div>
  );
}

Pagination.displayName = 'Pagination';

export default Pagination;
