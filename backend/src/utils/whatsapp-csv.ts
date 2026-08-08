/**
 * CSV-safe cell encoder for WhatsApp exports.
 *
 * Defends against TWO classes of issue:
 *  1. CSV structure breakage — quote+escape any cell containing a delimiter,
 *     quote, or newline (RFC 4180).
 *  2. CSV / formula injection — a spreadsheet (Excel, Sheets, LibreOffice)
 *     interprets a cell whose first char is one of  = + - @ TAB CR  as a
 *     formula, enabling data exfiltration / command execution on open. We
 *     neutralize it by prefixing a single quote (') so the value is treated as
 *     literal text. This must run for EVERY exported cell.
 *
 * Shared by the contacts export (whatsapp-inbox.controller) and the campaign
 * recipients export (whatsapp-campaign.controller) so the two stay identical.
 */
export function safeCsvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  // Formula-injection guard: prefix a single quote when the cell *starts* with
  // a character a spreadsheet would treat as the start of a formula.
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  // RFC 4180 quoting: wrap + double-up embedded quotes when the value contains
  // a quote, comma, or newline. (A leading-quote prefix from above also needs
  // this when followed by such chars; the test below still catches it.)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
