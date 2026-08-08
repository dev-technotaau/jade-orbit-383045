import SharedPagination from '@/components/ui/Pagination';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onChange: (next: number) => void;
  /** Enables the per-page selector — reset page to 1 in this handler. */
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}

/**
 * Thin adapter over the shared `ui/Pagination` component. Keeps this file's
 * legacy prop signature so its billing caller pages upgrade to
 * first/last + numbered pages + centering with zero changes.
 */
export default function Pagination({
  page,
  pageSize,
  total,
  onChange,
  onPageSizeChange,
  pageSizeOptions,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <SharedPagination
      currentPage={page}
      totalPages={totalPages}
      onPageChange={onChange}
      totalItems={total}
      pageSize={pageSize}
      onPageSizeChange={onPageSizeChange}
      pageSizeOptions={pageSizeOptions}
      className="border-t border-[var(--border)] pt-4"
    />
  );
}
