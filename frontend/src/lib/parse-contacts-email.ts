/**
 * Multi-format contact import parsing for the email super-admin contacts page —
 * the email counterpart of parse-contacts.ts. Supports paste + file uploads in
 * CSV, XLSX/XLS, JSON, and vCard (.vcf). Dependency-light: only `exceljs`
 * (dynamic import, xlsx branch only); CSV / JSON / vCard are hand-parsed.
 */

export type EmailImportRow = { email: string; name?: string; tags?: string[] };

const MAX_ROWS = 20000;

const HEADER_EMAIL = ['email', 'e-mail', 'mail', 'email address', 'emailaddress'];
const HEADER_NAME = ['name', 'fullname', 'full name'];
const HEADER_TAGS = ['tags', 'tag', 'labels'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmail = (v: string) => EMAIL_RE.test(v.trim().toLowerCase());

function splitTags(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const tags = raw
    .split(/[;|,]/)
    .map((t) => t.trim())
    .filter(Boolean);
  return tags.length ? tags : undefined;
}

/** Trim, drop rows without a valid email, dedupe by lowercased email, cap. */
function normalizeRows(rows: EmailImportRow[]): EmailImportRow[] {
  const seen = new Set<string>();
  const out: EmailImportRow[] = [];
  for (const row of rows) {
    const email = (row.email ?? '').trim().toLowerCase();
    if (!email || !isEmail(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({
      email,
      name: row.name?.trim() || undefined,
      tags: row.tags?.length ? row.tags : undefined,
    });
    if (out.length >= MAX_ROWS) break;
  }
  return out;
}

/** Paste format: one contact per line `email,name,tag1;tag2` (name & tags optional). */
export function parseEmailContactsText(text: string): EmailImportRow[] {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [email, name, tagStr] = line.split(',').map((s) => s.trim());
      return { email, name: name || undefined, tags: splitTags(tagStr) };
    });
  return normalizeRows(rows);
}

type HeaderMap = { email: number; name: number; tags: number };

function detectHeader(cells: string[]): HeaderMap | null {
  const lower = cells.map((c) => c.trim().toLowerCase());
  const email = lower.findIndex((c) => HEADER_EMAIL.includes(c));
  if (email === -1) return null;
  return {
    email,
    name: lower.findIndex((c) => HEADER_NAME.includes(c)),
    tags: lower.findIndex((c) => HEADER_TAGS.includes(c)),
  };
}

function rowFromHeader(cells: string[], map: HeaderMap): EmailImportRow {
  return {
    email: (cells[map.email] ?? '').trim(),
    name: map.name >= 0 ? cells[map.name]?.trim() || undefined : undefined,
    tags: map.tags >= 0 ? splitTags(cells[map.tags]) : undefined,
  };
}

function splitCsvLine(line: string): string[] {
  return line.split(',').map((c) => c.trim());
}

function parseCsv(text: string): EmailImportRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const map = detectHeader(splitCsvLine(lines[0]));
  if (map) {
    return normalizeRows(lines.slice(1).map((line) => rowFromHeader(splitCsvLine(line), map)));
  }
  return parseEmailContactsText(text);
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text.trim();
    if (typeof obj.result === 'string') return obj.result.trim();
    if (typeof obj.result === 'number') return String(obj.result).trim();
    if (obj.hyperlink && typeof obj.hyperlink === 'string')
      return obj.hyperlink.replace(/^mailto:/i, '').trim();
  }
  return String(value).trim();
}

async function parseXlsx(file: File): Promise<EmailImportRow[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const matrix: string[][] = [];
  ws.eachRow((row) => {
    const values = row.values as unknown[];
    const cells: string[] = [];
    for (let i = 1; i < values.length; i++) cells.push(cellToString(values[i]));
    matrix.push(cells);
  });
  if (matrix.length === 0) return [];
  const map = detectHeader(matrix[0]);
  const dataRows = map ? matrix.slice(1) : matrix;
  const rows = dataRows.map((cells) =>
    map
      ? rowFromHeader(cells, map)
      : {
          email: (cells[0] ?? '').trim(),
          name: cells[1]?.trim() || undefined,
          tags: splitTags(cells[2]),
        },
  );
  return normalizeRows(rows);
}

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
  if (typeof value === 'string') return splitTags(value);
  return undefined;
}

function parseJson(text: string): EmailImportRow[] {
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('JSON must be an array of contacts.');
  const rows = data.map<EmailImportRow>((entry) => {
    if (typeof entry === 'string') return { email: entry.trim() };
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const email = pick(obj, ['email', 'e-mail', 'mail', 'emailaddress']);
      const name = pick(obj, ['name', 'fullname']);
      return {
        email: email == null ? '' : String(email).trim(),
        name: name == null ? undefined : String(name).trim() || undefined,
        tags: tagsFromValue(pick(obj, ['tags', 'tag', 'labels'])),
      };
    }
    return { email: '' };
  });
  return normalizeRows(rows);
}

function parseVcard(text: string): EmailImportRow[] {
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  const rows: EmailImportRow[] = [];
  for (const card of cards) {
    let email = '';
    let name = '';
    for (const raw of card.split(/\r?\n/)) {
      const line = raw.trim();
      const colon = line.indexOf(':');
      if (colon === -1) continue;
      const key = line.slice(0, colon).toUpperCase();
      const val = line.slice(colon + 1).trim();
      if (!email && (key === 'EMAIL' || key.startsWith('EMAIL;') || key.startsWith('EMAIL.'))) {
        email = val;
      } else if (!name && (key === 'FN' || key.startsWith('FN;'))) {
        name = val;
      } else if (!name && (key === 'N' || key.startsWith('N;'))) {
        name = val
          .split(';')
          .map((p) => p.trim())
          .filter(Boolean)
          .join(' ');
      }
    }
    if (email) rows.push({ email, name: name || undefined });
  }
  return normalizeRows(rows);
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Parse an uploaded contacts file (CSV / XLSX / JSON / vCard). */
export async function parseEmailContactsFile(file: File): Promise<EmailImportRow[]> {
  const ext = extensionOf(file.name);
  const mime = file.type.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') return parseXlsx(file);
  if (ext === 'csv' || mime === 'text/csv') return parseCsv(await file.text());
  if (ext === 'json' || mime === 'application/json') return parseJson(await file.text());
  if (ext === 'vcf' || mime === 'text/vcard' || mime === 'text/x-vcard')
    return parseVcard(await file.text());
  throw new Error('Unsupported file type. Use CSV, XLSX, JSON, or vCard.');
}
