/**
 * Resume Watermark engine.
 *
 * Stamps the Hire Adda watermark onto resume PDFs at a configurable
 * position/opacity. The asset (`src/assets/watermark-logo.png`) is the brand
 * lockup — mascot + "HIRE ADDA" + tagline + the website URL
 * https://www.hireadda.in — as a brand-tinted, transparent-background PNG,
 * embedded via pdf-lib. DOC/DOCX sources are first normalised to PDF
 * (mammoth -> HTML -> Puppeteer -> PDF) so the output is always a PDF.
 *
 * Defaults live in the generic `SystemConfig` key/value store under
 * `watermark.defaults` and are editable from the super-admin toolkit UI.
 */
import path from 'path';
import fs from 'fs/promises';
import archiver from 'archiver';
import { PDFDocument, degrees } from 'pdf-lib';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error';
import { extractR2KeyFromUrl, downloadFileFromR2 } from './storage.service';

export type WatermarkPosition =
  | 'background' // large, centred, rotated, faint — the classic "behind the text" mark
  | 'tiled' // repeated grid across the whole page
  | 'diagonal' // single centred mark rotated -45°
  | 'center'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-center'
  | 'bottom-center';

export interface WatermarkConfig {
  /** Master switch — when false, downloads return the original file untouched. */
  enabled: boolean;
  position: WatermarkPosition;
  /** 0..1 — how strongly the mark shows through. */
  opacity: number;
  /** Logo width as a fraction of the page width (0.05..1). */
  scale: number;
  /** Rotation in degrees, used by background/tiled placements. */
  rotation: number;
}

export const WATERMARK_POSITIONS: WatermarkPosition[] = [
  'background',
  'tiled',
  'diagonal',
  'center',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'top-center',
  'bottom-center',
];

export const DEFAULT_WATERMARK_CONFIG: WatermarkConfig = {
  enabled: true,
  position: 'background',
  opacity: 0.12,
  scale: 0.5,
  rotation: -30,
};

const CONFIG_KEY = 'watermark.defaults';

const MIME_PDF = 'application/pdf';
const MIME_DOC = 'application/msword';
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ── Logo asset (cached in memory after first read) ────────────────────────────
let logoBytesCache: Buffer | null = null;
async function getLogoBytes(): Promise<Buffer> {
  if (logoBytesCache) return logoBytesCache;
  // dev: <root>/src/assets ; prod: <root>/dist/assets (copied by the build step)
  const assetPath = path.join(__dirname, '..', 'assets', 'watermark-logo.png');
  logoBytesCache = await fs.readFile(assetPath);
  return logoBytesCache;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

// ── Config ────────────────────────────────────────────────────────────────────
export async function getWatermarkConfig(): Promise<WatermarkConfig> {
  const row = await prisma.systemConfig.findUnique({ where: { key: CONFIG_KEY } });
  if (!row || typeof row.value !== 'object' || row.value === null) {
    return { ...DEFAULT_WATERMARK_CONFIG };
  }
  return { ...DEFAULT_WATERMARK_CONFIG, ...(row.value as Partial<WatermarkConfig>) };
}

export async function setWatermarkConfig(
  patch: Partial<WatermarkConfig>,
  adminId: string
): Promise<WatermarkConfig> {
  const current = await getWatermarkConfig();
  const merged: WatermarkConfig = {
    enabled: patch.enabled ?? current.enabled,
    position: patch.position ?? current.position,
    opacity: clamp(patch.opacity ?? current.opacity, 0.02, 1),
    scale: clamp(patch.scale ?? current.scale, 0.05, 1),
    rotation: clamp(patch.rotation ?? current.rotation, -90, 90),
  };
  await prisma.systemConfig.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: merged as unknown as object, updatedBy: adminId },
    update: { value: merged as unknown as object, updatedBy: adminId },
  });
  return merged;
}

// ── PDF stamping ──────────────────────────────────────────────────────────────
type EmbeddedLogo = Awaited<ReturnType<PDFDocument['embedPng']>>;
type PageLike = ReturnType<PDFDocument['getPages']>[number];

/** Draw the logo centred at (cx, cy), correctly offset so rotation pivots on the centre. */
function drawCentered(
  page: PageLike,
  logo: EmbeddedLogo,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rotationDeg: number,
  opacity: number
): void {
  const t = (rotationDeg * Math.PI) / 180;
  const dx = (w / 2) * Math.cos(t) - (h / 2) * Math.sin(t);
  const dy = (w / 2) * Math.sin(t) + (h / 2) * Math.cos(t);
  page.drawImage(logo, {
    x: cx - dx,
    y: cy - dy,
    width: w,
    height: h,
    rotate: degrees(rotationDeg),
    opacity,
  });
}

function drawWatermark(
  page: PageLike,
  logo: EmbeddedLogo,
  pw: number,
  ph: number,
  cfg: WatermarkConfig
): void {
  const opacity = clamp(cfg.opacity, 0.02, 1);
  // The watermark asset (logo + tagline + URL) is not square — derive the drawn
  // height from the embedded image's real aspect ratio so nothing is stretched.
  const w = clamp(cfg.scale, 0.05, 1) * pw;
  const h = w * (logo.height / logo.width);
  const rot = clamp(cfg.rotation, -90, 90);
  const margin = 24;

  switch (cfg.position) {
    case 'background':
      drawCentered(page, logo, pw / 2, ph / 2, w, h, rot, opacity);
      break;
    case 'diagonal':
      drawCentered(page, logo, pw / 2, ph / 2, w, h, -45, opacity);
      break;
    case 'center':
      drawCentered(page, logo, pw / 2, ph / 2, w, h, 0, opacity);
      break;
    case 'tiled': {
      const stepX = w * 1.7;
      const stepY = h * 1.7;
      const tileRot = rot || -30;
      for (let y = stepY / 2; y < ph + stepY; y += stepY) {
        for (let x = stepX / 2; x < pw + stepX; x += stepX) {
          drawCentered(page, logo, x, y, w, h, tileRot, opacity);
        }
      }
      break;
    }
    case 'top-left':
      page.drawImage(logo, { x: margin, y: ph - h - margin, width: w, height: h, opacity });
      break;
    case 'top-right':
      page.drawImage(logo, {
        x: pw - w - margin,
        y: ph - h - margin,
        width: w,
        height: h,
        opacity,
      });
      break;
    case 'bottom-left':
      page.drawImage(logo, { x: margin, y: margin, width: w, height: h, opacity });
      break;
    case 'bottom-right':
      page.drawImage(logo, { x: pw - w - margin, y: margin, width: w, height: h, opacity });
      break;
    case 'top-center':
      drawCentered(page, logo, pw / 2, ph - h / 2 - margin, w, h, 0, opacity);
      break;
    case 'bottom-center':
      drawCentered(page, logo, pw / 2, h / 2 + margin, w, h, 0, opacity);
      break;
    default:
      drawCentered(page, logo, pw / 2, ph / 2, w, h, rot, opacity);
  }
}

async function stampPdf(pdfBytes: Buffer | Uint8Array, cfg: WatermarkConfig): Promise<Buffer> {
  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  } catch {
    throw new AppError(
      'The resume PDF could not be read for watermarking (it may be corrupt or password-protected).',
      422,
      'WATERMARK_PDF_UNREADABLE'
    );
  }
  const logo = await pdfDoc.embedPng(await getLogoBytes());
  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize();
    drawWatermark(page, logo, width, height, cfg);
  }
  const out = await pdfDoc.save();
  return Buffer.from(out);
}

// ── DOC/DOCX → PDF (mammoth -> HTML -> Puppeteer) ─────────────────────────────
async function convertDocxToPdf(buffer: Buffer): Promise<Buffer> {
  const mammoth = await import('mammoth');
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const fullHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111827;padding:36px;line-height:1.5;}
    h1,h2,h3,h4{color:#111827;margin:0.6em 0 0.3em;}
    p{margin:0.4em 0;} ul,ol{margin:0.4em 0 0.4em 1.4em;}
    table{border-collapse:collapse;width:100%;} td,th{border:1px solid #d1d5db;padding:4px 6px;text-align:left;}
    img{max-width:100%;height:auto;} a{color:#1e5caf;}
  </style></head><body>${html}</body></html>`;

  const puppeteer = (await import('puppeteer')).default;
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function isPdf(mimeType: string, name?: string): boolean {
  return mimeType === MIME_PDF || (!!name && name.toLowerCase().endsWith('.pdf'));
}
function isDocx(mimeType: string, name?: string): boolean {
  return mimeType === MIME_DOCX || (!!name && name.toLowerCase().endsWith('.docx'));
}

/**
 * Watermark a resume. Always returns a PDF when a watermark is applied.
 * When the global config is disabled, the original bytes/mime are returned as-is.
 */
export async function watermarkResume(
  source: Buffer,
  mimeType: string,
  originalName?: string,
  override?: Partial<WatermarkConfig>
): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
  const cfg: WatermarkConfig = { ...(await getWatermarkConfig()), ...(override ?? {}) };

  if (!cfg.enabled) {
    const ext = originalName ? path.extname(originalName).replace('.', '') || 'pdf' : 'pdf';
    return { buffer: source, mimeType: mimeType || MIME_PDF, extension: ext };
  }

  let pdfBytes: Buffer;
  if (isPdf(mimeType, originalName)) {
    pdfBytes = source;
  } else if (isDocx(mimeType, originalName)) {
    pdfBytes = await convertDocxToPdf(source);
  } else if (mimeType === MIME_DOC) {
    // Legacy binary .doc — mammoth only supports .docx; attempt, else fail clearly.
    try {
      pdfBytes = await convertDocxToPdf(source);
    } catch {
      throw new AppError(
        'Legacy .doc resumes cannot be watermarked. Please re-upload the CV as PDF or DOCX.',
        422,
        'WATERMARK_UNSUPPORTED_FORMAT'
      );
    }
  } else {
    throw new AppError(
      `Unsupported resume format for watermarking: ${mimeType || 'unknown'}.`,
      422,
      'WATERMARK_UNSUPPORTED_FORMAT'
    );
  }

  const stamped = await stampPdf(pdfBytes, cfg);
  return { buffer: stamped, mimeType: MIME_PDF, extension: 'pdf' };
}

// ── Fetch source bytes for a stored resume URL (R2 key or legacy public URL) ──
export async function fetchResumeBuffer(url: string): Promise<Buffer> {
  const key = extractR2KeyFromUrl(url);
  if (key) return downloadFileFromR2(key);
  // Legacy / non-R2 (e.g. Cloudinary) public URL — fetch over HTTP.
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const res = await fetch(url);
  if (!res.ok) {
    throw new AppError('Could not fetch the resume file from storage.', 502, 'RESUME_FETCH_FAILED');
  }
  return Buffer.from(await res.arrayBuffer());
}

// ── Bulk ZIP of watermarked resumes ───────────────────────────────────────────
export interface ZipEntry {
  name: string;
  buffer: Buffer;
}

export function buildZip(entries: ZipEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 6 } });
    const chunks: Buffer[] = [];
    archive.on('data', (c: Buffer) => chunks.push(c));
    archive.on('warning', (err: Error) => {
      // ENOENT-style warnings are non-fatal; surface real errors.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') reject(err);
    });
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));

    const used = new Set<string>();
    for (const entry of entries) {
      // de-duplicate names inside the archive
      let name = entry.name;
      let i = 1;
      while (used.has(name.toLowerCase())) {
        const ext = path.extname(entry.name);
        const base = entry.name.slice(0, entry.name.length - ext.length);
        name = `${base} (${i})${ext}`;
        i += 1;
      }
      used.add(name.toLowerCase());
      archive.append(entry.buffer, { name });
    }
    archive.finalize();
  });
}

/** Turn a resume's stored file into a watermarked download entry (buffer + filename). */
export async function makeWatermarkedEntry(
  url: string,
  mimeType: string,
  originalName: string,
  baseFilename: string,
  override?: Partial<WatermarkConfig>
): Promise<ZipEntry> {
  const source = await fetchResumeBuffer(url);
  const { buffer, extension } = await watermarkResume(source, mimeType, originalName, override);
  const safeBase = baseFilename.replace(/[^\w.\-() ]+/g, '_').trim() || 'resume';
  return { name: `${safeBase}.${extension}`, buffer };
}
