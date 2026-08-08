/**
 * Currency formatting helpers for the structured currency fields
 * (CurrencyAmountInput consumers).
 */

/**
 * Compact human display for large money values — "₹50 Cr" (en-IN
 * digit grouping/units for INR), "$50M", "€2.5M". Used as the
 * dual-written display string for Total Funding Raised so every legacy
 * read site (company page, profile preview, super-admin, review steps)
 * keeps rendering a friendly string without knowing about the
 * structured columns.
 */
export function formatCompactCurrency(amount: number, code: string): string {
  try {
    return new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en', {
      style: 'currency',
      currency: code,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    // Unknown/invalid code — degrade to "CODE 1,234,567".
    return `${code} ${amount.toLocaleString()}`;
  }
}
