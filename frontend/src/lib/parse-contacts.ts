/**
 * Contact import parsing for the WhatsApp super-admin contacts page.
 *
 * Supports the legacy paste format plus file uploads in CSV, XLSX/XLS, JSON, and
 * vCard (.vcf). Dependency-light: only `exceljs` (dynamic import, xlsx branch
 * only); CSV / JSON / vCard are hand-parsed.
 */

export type ImportRow = {
  phone: string;
  name?: string;
  tags?: string[];
  /**
   * Every column that is not phone/name/tags — city, order number, plan tier.
   *
   * These used to be dropped on the floor, so a list carrying them had nowhere
   * to put them and a template variable like `{{city}}` was sent to Meta as the
   * literal string "{{city}}". They land in WaContact.attributes and are
   * addressable in a campaign mapping as `{{attr.<key>}}`.
   */
  attributes?: Record<string, string>;
};

/** Per-row caps mirroring the server's import schema (whatsapp.schema.ts). */
const MAX_ATTRIBUTES = 30;
const MAX_ATTRIBUTE_VALUE = 500;

/**
 * Column header → attribute key: lower-cased, non-alphanumerics collapsed to
 * `_`. "Order Number" becomes `order_number`, so the campaign token is
 * `{{attr.order_number}}` — predictable from the file without guessing at the
 * original spacing or case.
 */
function attributeKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Drop empty values and enforce the per-row caps; undefined when nothing is left. */
function cleanAttributes(
  raw: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key || !value) continue;
    if (Object.keys(out).length >= MAX_ATTRIBUTES) break;
    out[key] = value.slice(0, MAX_ATTRIBUTE_VALUE);
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * What a parse actually did, not just what survived it.
 *
 * The parser used to return a bare row array, so the modal reported "3 rows
 * detected" for a 20,000-row file and the operator imported a silently truncated
 * fifth of their list believing it was complete. Everything the parse discarded
 * or merged is now reported alongside the rows.
 */
export interface ParseResult {
  rows: ImportRow[];
  /** Usable contacts found before the MAX_ROWS cap was applied. */
  totalSeen: number;
  /** True when `totalSeen` exceeded MAX_ROWS and rows were dropped. */
  truncated: boolean;
  /** Lines/records that carried no phone number at all. */
  droppedNoPhone: number;
  /** Duplicates folded into an earlier row (after E.164 normalisation). */
  merged: number;
}

/** Hard cap so a stray giant file can't lock the tab or hammer the API. */
const MAX_ROWS = 5000;

const EMPTY_PARSE: ParseResult = {
  rows: [],
  totalSeen: 0,
  truncated: false,
  droppedNoPhone: 0,
  merged: 0,
};

/**
 * Country code assumed for a bare national number, mirroring the server's
 * DEFAULT_COUNTRY_CODE. Only used for DEDUPE here — the server still does the
 * authoritative normalisation on import.
 */
const DEFAULT_COUNTRY_CODE = (process.env.NEXT_PUBLIC_DEFAULT_COUNTRY_CODE || '91').replace(
  /[^\d]/g,
  '',
);

/**
 * Collapse a phone number to the identity the SERVER will store it under.
 *
 * Deliberately mirrors `normalizeWaPhone` in whatsapp-contact.service.ts. The
 * client used to dedupe on the RAW string, so `9876543210`, `09876543210` and
 * `+91 98765 43210` counted as three contacts here and one contact on the
 * server — the row count was wrong, and whichever duplicate happened to be last
 * silently overwrote the others' name and tags.
 *
 * Exported because a caller that keeps anything ALONGSIDE a phone list has to key
 * it the same way: the campaign builder's per-recipient columns were keyed on the
 * raw line, so a number the file repeated in another format kept its line here
 * (this function deduped it) and silently lost its columns.
 */
export function normalizeForDedupe(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  let digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return trimmed;
  if (trimmed.startsWith('+')) return `+${digits}`;
  // `00` is the ITU international access prefix.
  if (digits.startsWith('00') && digits.length > 4) return `+${digits.slice(2)}`;
  if (DEFAULT_COUNTRY_CODE) {
    // A single leading 0 is a national trunk prefix, not part of the number.
    if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
    if (digits.length <= 10) return `+${DEFAULT_COUNTRY_CODE}${digits}`;
  }
  return `+${digits}`;
}

const HEADER_PHONE = ['phone', 'number', 'mobile', 'whatsapp'];
const HEADER_NAME = ['name', 'fullname'];
const HEADER_TAGS = ['tags', 'tag'];
/** JSON keys already mapped to a first-class field; everything else is an attribute. */
const KNOWN_JSON_KEYS = [...HEADER_PHONE, ...HEADER_NAME, ...HEADER_TAGS];

/** Split a "tag1;tag2" / "tag1|tag2" string into a clean tag list (or undefined). */
function splitTags(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const tags = raw
    .split(/[;|]/)
    .map((t) => t.trim())
    .filter(Boolean);
  return tags.length ? tags : undefined;
}

/**
 * Trim, drop rows without a phone, MERGE duplicates by normalised phone, cap at
 * MAX_ROWS — and report everything that happened.
 *
 * Duplicates are merged rather than dropped: two lines for the same person, one
 * carrying a name and the other a tag, used to become whichever line came first
 * with the other's data thrown away.
 */
function normalizeRows(rows: ImportRow[]): ParseResult {
  const byPhone = new Map<string, ImportRow>();
  const out: ImportRow[] = [];
  let droppedNoPhone = 0;
  let merged = 0;
  let totalSeen = 0;

  for (const row of rows) {
    const phone = (row.phone ?? '').trim();
    if (!phone) {
      droppedNoPhone++;
      continue;
    }
    const key = normalizeForDedupe(phone);
    const existing = byPhone.get(key);
    if (existing) {
      merged++;
      if (!existing.name && row.name?.trim()) existing.name = row.name.trim();
      if (row.tags?.length) {
        existing.tags = [...new Set([...(existing.tags ?? []), ...row.tags])];
      }
      // Union per KEY, later value wins: two lines for the same person, one
      // carrying a city and the other an order number, keep both.
      if (row.attributes) {
        existing.attributes = cleanAttributes({ ...existing.attributes, ...row.attributes });
      }
      continue;
    }
    totalSeen++;
    // Count everything past the cap so the caller can say how much was left out,
    // instead of silently stopping at MAX_ROWS.
    if (out.length >= MAX_ROWS) continue;
    const entry: ImportRow = {
      phone,
      name: row.name?.trim() || undefined,
      tags: row.tags && row.tags.length ? [...new Set(row.tags)] : undefined,
      attributes: cleanAttributes(row.attributes),
    };
    byPhone.set(key, entry);
    out.push(entry);
  }

  return { rows: out, totalSeen, truncated: totalSeen > MAX_ROWS, droppedNoPhone, merged };
}

/**
 * The legacy paste format: one contact per line `phone,name,tag1;tag2`
 * (name & tags optional). Trim, skip blanks, require phone.
 */
export function parseContactsText(text: string): ParseResult {
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

/**
 * Index of the header columns we care about, or null if this isn't a header row.
 * `attributes` carries every OTHER column, by index and attribute key.
 */
type HeaderMap = {
  phone: number;
  name: number;
  tags: number;
  attributes: Array<{ index: number; key: string }>;
};

/**
 * Inspect a row of cell strings; if it looks like a header (contains a
 * phone-ish column name), return a column-index map, else null.
 *
 * Unrecognised columns are no longer discarded — they become contact
 * attributes, which is what makes a list carrying city / order number / plan
 * tier personalisable at all.
 */
function detectHeader(cells: string[]): HeaderMap | null {
  const lower = cells.map((c) => c.trim().toLowerCase());
  const phone = lower.findIndex((c) => HEADER_PHONE.includes(c));
  if (phone === -1) return null;
  const name = lower.findIndex((c) => HEADER_NAME.includes(c));
  const tags = lower.findIndex((c) => HEADER_TAGS.includes(c));
  const attributes: Array<{ index: number; key: string }> = [];
  cells.forEach((header, index) => {
    if (index === phone || index === name || index === tags) return;
    const key = attributeKey(header);
    if (key) attributes.push({ index, key });
  });
  return { phone, name, tags, attributes };
}

/** Build a row from a header-mapped record of cell strings. */
function rowFromHeader(cells: string[], map: HeaderMap): ImportRow {
  const attributes: Record<string, string> = {};
  for (const { index, key } of map.attributes) {
    const value = (cells[index] ?? '').trim();
    if (value) attributes[key] = value;
  }
  return {
    phone: (cells[map.phone] ?? '').trim(),
    name: map.name >= 0 ? cells[map.name]?.trim() || undefined : undefined,
    tags: map.tags >= 0 ? splitTags(cells[map.tags]) : undefined,
    attributes: cleanAttributes(attributes),
  };
}

/**
 * RFC 4180 cell split.
 *
 * This used to be `line.split(',')`, which meant the app could not re-import its
 * OWN export: the exporter quotes any cell containing a comma, so a contact named
 * `Verma, Asha` went out as `"Verma, Asha"` and came back as two columns, shifting
 * every field after it — names became phone numbers.
 *
 * Handles `"` wrapping and `""` escaping, and strips a single leading apostrophe,
 * which the exporter adds to neutralise spreadsheet formula injection (a cell
 * starting with = + - @ executes on open in Excel and Sheets).
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // A doubled quote inside a quoted cell is a literal quote.
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);

  return cells.map((c) => c.trim().replace(/^'/, ''));
}

function parseCsv(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return EMPTY_PARSE;

  const map = detectHeader(splitCsvLine(lines[0]));
  if (map) {
    const rows = lines.slice(1).map((line) => rowFromHeader(splitCsvLine(line), map));
    return normalizeRows(rows);
  }
  // No header → positional phone,name,tags (legacy paste format).
  return parseContactsText(text);
}

async function parseXlsx(file: File): Promise<ParseResult> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return EMPTY_PARSE;

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
  if (matrix.length === 0) return EMPTY_PARSE;

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

function parseJson(text: string): ParseResult {
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
      // Same rule as the CSV/XLSX header mapper: anything that is not a known
      // field becomes a personalisation attribute rather than being dropped.
      const attributes: Record<string, string> = {};
      for (const [rawKey, value] of Object.entries(obj)) {
        const lower = rawKey.toLowerCase();
        if (KNOWN_JSON_KEYS.includes(lower)) continue;
        if (value == null || typeof value === 'object') continue;
        const key = attributeKey(rawKey);
        if (key) attributes[key] = String(value).trim();
      }
      return {
        phone: phone == null ? '' : String(phone).trim(),
        name: name == null ? undefined : String(name).trim() || undefined,
        tags: tagsFromValue(pick(obj, ['tags', 'tag'])),
        attributes: cleanAttributes(attributes),
      };
    }
    return { phone: '' };
  });
  return normalizeRows(rows);
}

function parseVcard(text: string): ParseResult {
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

/** What folding a parsed file into an existing phone list actually did. */
export interface PhoneMergeResult {
  /** The merged list, one number per line — ready to go straight back into the textarea. */
  text: string;
  /** Numbers the file contributed that were not already on the list. */
  added: number;
  /** Numbers skipped because the list already had them (or the file repeated them). */
  duplicates: number;
}

/**
 * Fold parsed contact rows into an existing "one number per line" list.
 *
 * The campaign builder keeps its audience as the textarea's text, so an uploaded
 * file is merged into that same string rather than held beside it: the row
 * count, the WA_UPLOAD_PHONE_MAX check and the submitted audienceFilter all keep
 * reading one source, and the operator can still edit what the file brought in.
 * Dedupe is on the SERVER's identity for a number (`normalizeForDedupe`), so
 * `9876543210` in the file does not land next to `+919876543210` already typed
 * above it and quietly bill the campaign for the same person twice.
 */
export function mergePhoneLines(existing: string, rows: ImportRow[]): PhoneMergeResult {
  const lines = existing
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set(lines.map(normalizeForDedupe));
  let added = 0;
  let duplicates = 0;
  for (const row of rows) {
    const phone = (row.phone ?? '').trim();
    if (!phone) continue;
    const key = normalizeForDedupe(phone);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    lines.push(phone);
    added++;
  }
  return { text: lines.join('\n'), added, duplicates };
}

/**
 * One line describing what an uploaded file contributed, for the confirmation
 * toast. Reports what was left out as loudly as what came in — a file that is
 * half phone-less rows or past the 5,000 cap must not read as a clean import.
 */
export function describePhoneImport(parse: ParseResult, merge: PhoneMergeResult): string {
  const n = (v: number) => v.toLocaleString('en-IN');
  const parts = [`${n(merge.added)} number${merge.added === 1 ? '' : 's'} added`];
  const dupes = merge.duplicates + parse.merged;
  if (dupes) parts.push(`${n(dupes)} already on the list`);
  if (parse.droppedNoPhone) parts.push(`${n(parse.droppedNoPhone)} row(s) had no number`);
  if (parse.truncated) {
    parts.push(`only the first ${n(parse.rows.length)} of ${n(parse.totalSeen)} were read`);
  }
  return parts.join(' · ');
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
export async function parseContactsFile(file: File): Promise<ParseResult> {
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
