/**
 * Minimal, dependency-free CSV parse/format for contact import/export.
 * Handles quoted fields, embedded commas/quotes/newlines (RFC 4180-ish).
 */

/** Parse CSV text → array of row objects keyed by the (lowercased) header row. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const out: Array<Record<string, string>> = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    // Skip blank trailing lines
    if (cells.length === 1 && cells[0].trim() === '') continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? '').trim();
    });
    out.push(obj);
  }
  return out;
}

/** Tokenize CSV into a matrix of raw cell strings. */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

const escapeCell = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Format an array of row objects → CSV text using the given ordered columns. */
export function formatCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  const head = columns.map(escapeCell).join(',');
  const body = rows.map((r) => columns.map((c) => escapeCell(r[c])).join(',')).join('\n');
  return body ? `${head}\n${body}` : head;
}
