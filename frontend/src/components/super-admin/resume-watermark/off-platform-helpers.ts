// Shared helpers for the off-platform Resume Watermark surfaces.

/** React Query key for every off-platform list/detail query. Invalidate after mutations. */
export const RW_OFF_KEY = 'rw-off';

/** Accepted resume file types for the FileUpload dropzones. */
export const RESUME_ACCEPT: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

/** Max resume upload size (10 MB). */
export const RESUME_MAX_SIZE = 10 * 1024 * 1024;

/** Split a comma-separated tag string into a clean array. */
export function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Human-readable format label from a resume's MIME type. */
export function formatOf(mime: string | null | undefined): string {
  if (!mime) return 'FILE';
  const m = mime.toLowerCase();
  if (m.includes('pdf')) return 'PDF';
  if (m.includes('wordprocessingml') || m.endsWith('docx')) return 'DOCX';
  if (m.includes('msword') || m.endsWith('doc')) return 'DOC';
  return 'FILE';
}

/** Locale date string, tolerant of null / bad input. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

/** Strip characters that are illegal in filenames. */
function safeBase(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, '_');
}

/**
 * Filename for a downloaded (watermarked) resume. Watermarked output is a PDF.
 * When a candidate has multiple resumes we suffix the original file's base name
 * so the downloads don't collide.
 */
export function resumeDownloadName(
  candidateName: string,
  originalName: string,
  total: number,
): string {
  const nameBase = safeBase(candidateName) || 'resume';
  if (total <= 1) return `${nameBase}.pdf`;
  const fileBase = safeBase(originalName.replace(/\.[^.]+$/, ''));
  return fileBase ? `${nameBase} - ${fileBase}.pdf` : `${nameBase}.pdf`;
}
