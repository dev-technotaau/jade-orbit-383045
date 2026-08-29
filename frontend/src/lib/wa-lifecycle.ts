/**
 * Lifecycle stage, as a RESERVED contact attribute rather than a new column.
 *
 * Deliberate: `WaContact.attributes` is already filterable by saved segments
 * (`attributes: { path: [key], equals }`) and already readable from a campaign
 * template as `{{attr.lifecycle}}`. A column would have needed its own filter
 * plumbing, its own segment rule type and its own template binding to reach
 * parity with what a reserved key gets for nothing.
 *
 * The trade is that a lifecycle written by a CSV import is just a string — there
 * is no database constraint keeping it inside this set. That is why the panel
 * offers a fixed picker instead of a free-text box, and why an unrecognised
 * value is displayed rather than discarded: an import that wrote "Customer" or
 * "vip-gold" is showing the operator something true about their own data.
 */

/** The attribute key. Named as a constant so nothing depends on the literal. */
export const LIFECYCLE_KEY = 'lifecycle';

export interface LifecycleStage {
  value: string;
  label: string;
  /** Tailwind classes for the chip, keyed to how far along the stage is. */
  className: string;
}

export const LIFECYCLE_STAGES: readonly LifecycleStage[] = [
  { value: 'lead', label: 'Lead', className: 'bg-slate-100 text-slate-700' },
  { value: 'prospect', label: 'Prospect', className: 'bg-sky-100 text-sky-800' },
  { value: 'customer', label: 'Customer', className: 'bg-emerald-100 text-emerald-800' },
  { value: 'repeat', label: 'Repeat customer', className: 'bg-emerald-200 text-emerald-900' },
  { value: 'vip', label: 'VIP', className: 'bg-amber-100 text-amber-900' },
  { value: 'churned', label: 'Churned', className: 'bg-red-100 text-red-800' },
];

/** Read the stage off a contact's attributes, whatever case it was written in. */
export function lifecycleOf(attributes: unknown): string | null {
  if (!attributes || typeof attributes !== 'object') return null;
  const v = (attributes as Record<string, unknown>)[LIFECYCLE_KEY];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * The stage definition for a stored value, matched case-insensitively.
 *
 * Null for anything outside the set — an import's own vocabulary. The caller
 * shows it as a plain chip rather than dropping it.
 */
export function lifecycleStage(value: string | null): LifecycleStage | null {
  if (!value) return null;
  return LIFECYCLE_STAGES.find((s) => s.value === value.toLowerCase()) ?? null;
}
