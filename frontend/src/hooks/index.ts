/**
 * Hook barrel.
 *
 * The host platform's version re-exported job, notification and search hook
 * families (`useJobSearch`, `useAppliedJobs`, `useAutocomplete`, …) from
 * `./use-jobs`, `./use-notifications` and `./use-search`. Those modules are gone
 * with the job board; every hook below is one that actually exists here.
 */
export { useAuth } from './use-auth';
export { useBulkSelect, downloadBlob } from './use-bulk-select';
export type { BulkSelect } from './use-bulk-select';
export { useClickOutside } from './use-click-outside';
export { usePopoverPlacement } from './use-popover-placement';
export { useSocket } from './use-socket';
