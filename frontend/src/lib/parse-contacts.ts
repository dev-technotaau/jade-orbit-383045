/**
 * Contact import parsing for the WhatsApp super-admin contacts page.
 *
 * Supports the legacy paste format plus file uploads in CSV, XLSX/XLS, JSON, and
 * vCard (.vcf). Dependency-light: only `exceljs` (dynamic import, xlsx branch
 * only); CSV / JSON / vCard are hand-parsed.
 */

export type ImportRow = { phone: string; name?: string; tags?: string[] };

/** Hard cap so a stray giant file can't lock the tab or hammer the API. */
const MAX_ROWS = 5000;

const HEADER_PHONE = ['phone', 'number', 'mobile', 'whatsapp'];
const HEADER_NAME = ['name', 'fullname'];
const HEADER_TAGS = ['tags', 'tag'];

/** Split a "tag1;tag2" / "tag1|tag2" string into a clean tag list (or undefined). */
function splitTags(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const tags = raw
    .split(/[;|]/)
    .map((t) => t.trim())
    .filter(Boolean);
  return tags.length ? tags : undefined;
}

/** Trim, drop rows without a phone, dedupe by phone (keep first), cap at MAX_ROWS. */
function normalizeRows(rows: ImportRow[]): ImportRow[] {
  const seen = new Set<string>();
  const out: ImportRow[] = [];
  for (const row of rows) {
    const phone = (row.phone ?? '').trim();
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    out.push({
      phone,
      name: row.name?.trim() || undefined,
      tags: row.tags && row.tags.length ? row.tags : undefined,
    });
    if (out.length >= MAX_ROWS) break;
  }
  return out;
}

/**
 * The legacy paste format: one contact per line `phone,name,tag1;tag2`
 * (name & tags optional). Trim, skip blanks, require phone.
 */
export function parseContactsText(text: string): ImportRow[] {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [phone, name, tagStr] = line.split(',').map((s) => s.trim());
      return { phone, name: name || undefined, tags: splitTags(tagStr) };
    });
  return normalizeRows(rows);
}

/** Index of the header columns we care about, or null if this isn't a header row. */
type HeaderMap = { phone: number; name: number; tags: number };

/**
 * Inspect a row of cell strings; if it looks like a header (contains a
 * phone-ish column name), return a column-index map, else null.
 */
function detectHeader(cells: string[]): HeaderMap | null {
  const lower = cells.map((c) => c.trim().toLowerCase());
  const phone = lower.findIndex((c) => HEADER_PHONE.includes(c));
  if (phone === -1) return null;
  return {
    phone,
    name: lower.findIndex((c) => HEADER_NAME.includes(c)),
    tags: lower.findIndex((c) => HEADER_TAGS.includes(c)),
  };
}

/** Build a row from a header-mapped record of cell strings. */
function rowFromHeader(cells: string[], map: HeaderMap): ImportRow {
  return {
    phone: (cells[map.phone] ?? '').trim(),
    name: map.name >= 0 ? cells[map.name]?.trim() || undefined : undefined,
    tags: map.tags >= 0 ? splitTags(cells[map.tags]) : undefined,
  };
}

/** Naive CSV cell split (commas; no embedded-comma quoting — matches paste format). */
function splitCsvLine(line: string): string[] {
  return line.split(',').map((c) => c.trim());
}

function parseCsv(text: string): ImportRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const map = detectHeader(splitCsvLine(lines[0]));
  if (map) {
    const rows = lines.slice(1).map((line) => rowFromHeader(splitCsvLine(line), map));
    return normalizeRows(rows);
  }
  // No header → positional phone,name,tags (legacy paste format).
  return parseContactsText(text);
}

async function parseXlsx(file: File): Promise<ImportRow[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];

  // ExcelJS `row.values` is 1-indexed with a leading empty slot; coerce every
  // cell to a trimmed string into a 0-indexed array we control.
  const matrix: string[][] = [];
  ws.eachRow((row) => {
    const values = row.values as unknown[];
    const cells: string[] = [];
    for (let i = 1; i < values.length; i++) {
      cells.push(cellToString(values[i]));
    }
    matrix.push(cells);
  });
  if (matrix.length === 0) return [];

  const map = detectHeader(matrix[0]);
  const dataRows = map ? matrix.slice(1) : matrix;
  const rows = dataRows.map((cells) =>
    map
      ? rowFromHeader(cells, map)
      : {
          phone: (cells[0] ?? '').trim(),
          name: cells[1]?.trim() || undefined,
          tags: splitTags(cells[2]),
        },
  );
  return normalizeRows(rows);
}

/** Coerce an arbitrary ExcelJS cell value to a trimmed string. */
function cellToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  // Rich text / hyperlink / formula result objects.
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text.trim();
    if (typeof obj.result === 'string') return obj.result.trim();
    if (typeof obj.result === 'number') return String(obj.result).trim();
    if (obj.hyperlink && typeof obj.hyperlink === 'string') return obj.hyperlink.trim();
  }
  return String(value).trim();
}

/** Case-insensitive lookup of the first matching key in a record. */
function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of Object.keys(obj)) {
    if (keys.includes(key.toLowerCase())) return obj[key];
  }
  return undefined;
}

function tagsFromValue(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const tags = value.map((t) => String(t).trim()).filter(Boolean);
    return tags.length ? tags : undefined;
  }
  if (typeof value === 'string') {
    const tags = value
      .split(/[;,|]/)
      .map((t) => t.trim())
      .filter(Boolean);
    return tags.length ? tags : undefined;
  }
  return undefined;
}

function parseJson(text: string): ImportRow[] {
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error('JSON must be an array of contacts.');
  }
  const rows = data.map<ImportRow>((entry) => {
    // (b) array of strings → each is a phone.
    if (typeof entry === 'string') return { phone: entry.trim() };
    // (a) array of objects → map keys case-insensitively.
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const phone = pick(obj, ['phone', 'number', 'mobile', 'whatsapp']);
      const name = pick(obj, ['name', 'fullname']);
      return {
        phone: phone == null ? '' : String(phone).trim(),
        name: name == null ? undefined : String(name).trim() || undefined,
        tags: tagsFromValue(pick(obj, ['tags', 'tag'])),
      };
    }
    return { phone: '' };
  });
  return normalizeRows(rows);
}

function parseVcard(text: string): ImportRow[] {
  // One card per BEGIN:VCARD block.
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  const rows: ImportRow[] = [];
  for (const card of cards) {
    const lines = card.split(/\r?\n/);
    let phone = '';
    let name = '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const colon = line.indexOf(':');
      if (colon === -1) continue;
      const key = line.slice(0, colon).toUpperCase();
      const val = line.slice(colon + 1).trim();
      // First TEL line (key may carry params, e.g. TEL;TYPE=CELL).
      if (!phone && (key === 'TEL' || key.startsWith('TEL;') || key.startsWith('TEL.'))) {
        phone = val;
      } else if (!name && (key === 'FN' || key.startsWith('FN;'))) {
        name = val;
      } else if (!name && (key === 'N' || key.startsWith('N;'))) {
        // N is structured (Family;Given;...); join the non-empty parts.
        name = val
          .split(';')
          .map((p) => p.trim())
          .filter(Boolean)
          .join(' ');
      }
    }
    if (phone) rows.push({ phone, name: name || undefined });
  }
  return normalizeRows(rows);
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Parse an uploaded contacts file. Format is detected by extension (lowercase)
 * then MIME type. All rows are normalized (trim, drop phone-less, dedupe by
 * phone keeping first, cap at 5000).
 */
export async function parseContactsFile(file: File): Promise<ImportRow[]> {
  const ext = extensionOf(file.name);
  const mime = file.type.toLowerCase();

  if (ext === 'xlsx' || ext === 'xls') {
    return parseXlsx(file);
  }
  if (ext === 'csv' || mime === 'text/csv') {
    return parseCsv(await file.text());
  }
  if (ext === 'json' || mime === 'application/json') {
    return parseJson(await file.text());
  }
  if (ext === 'vcf' || mime === 'text/vcard' || mime === 'text/x-vcard') {
    return parseVcard(await file.text());
  }
  throw new Error('Unsupported file type. Use CSV, XLSX, JSON, or vCard.');
}
