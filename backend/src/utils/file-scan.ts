/**
 * Lightweight file security scanner for uploads.
 * Validates magic bytes, blocks dangerous file types, and checks for embedded threats.
 * Does NOT replace full antivirus but catches common attack vectors.
 */

import logger from '../config/logger';

// Magic bytes for allowed file types
const MAGIC_BYTES: Record<string, number[][]> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/gif': [
    [0x47, 0x49, 0x46, 0x38, 0x37],
    [0x47, 0x49, 0x46, 0x38, 0x39],
  ],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF header
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    [0x50, 0x4b, 0x03, 0x04],
  ], // ZIP (docx)
  'application/msword': [[0xd0, 0xcf, 0x11, 0xe0]], // OLE2
};

// Dangerous patterns to scan for in file content
const DANGEROUS_PATTERNS = [
  /<%.*%>/i, // ASP/JSP tags
  /<\?php/i, // PHP tags
  /<script[\s>]/i, // Script tags in non-HTML uploads
  /javascript:/i, // JS protocol
  /vbscript:/i, // VB protocol
  /on(error|load|click|mouseover)\s*=/i, // Event handlers
];

// Blocked file extensions
const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.scr',
  '.pif',
  '.vbs',
  '.vbe',
  '.js',
  '.jse',
  '.wsf',
  '.wsh',
  '.ps1',
  '.sh',
  '.bash',
  '.csh',
  '.ksh',
  '.php',
  '.php3',
  '.php4',
  '.php5',
  '.phtml',
  '.asp',
  '.aspx',
  '.jsp',
  '.cgi',
  '.pl',
  '.py',
  '.dll',
  '.sys',
  '.drv',
  '.bin',
  '.hta',
  '.inf',
  '.reg',
  '.rgs',
  '.svg', // SVG can contain embedded scripts
]);

interface ScanResult {
  safe: boolean;
  reason?: string;
}

/**
 * Scan a file buffer for security threats.
 * Call this before uploading to storage (R2/Cloudinary).
 */
export function scanFile(
  buffer: Buffer,
  filename: string,
  declaredMimetype: string,
  maxSizeBytes: number = 10 * 1024 * 1024 // 10MB default
): ScanResult {
  // 1. Check file size
  if (buffer.length > maxSizeBytes) {
    return {
      safe: false,
      reason: `File exceeds maximum size of ${Math.round(maxSizeBytes / 1024 / 1024)}MB`,
    };
  }

  if (buffer.length === 0) {
    return { safe: false, reason: 'Empty file' };
  }

  // 2. Check file extension
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  if (BLOCKED_EXTENSIONS.has(ext)) {
    logger.warn(`Blocked upload: dangerous extension ${ext} in file ${filename}`);
    return { safe: false, reason: `File type ${ext} is not allowed` };
  }

  // 3. Validate magic bytes match declared MIME type
  const expectedMagic = MAGIC_BYTES[declaredMimetype];
  if (expectedMagic) {
    const matches = expectedMagic.some((magic) => magic.every((byte, i) => buffer[i] === byte));
    if (!matches) {
      logger.warn(
        `Blocked upload: magic bytes mismatch for ${filename} (declared: ${declaredMimetype})`
      );
      return {
        safe: false,
        reason: 'File content does not match its declared type',
      };
    }
  }

  // 4. Scan text-based files for dangerous patterns
  const textMimes = ['text/', 'application/json', 'application/xml', 'application/svg'];
  const isTextBased = textMimes.some((m) => declaredMimetype.startsWith(m));

  if (isTextBased || buffer.length < 500_000) {
    // Only scan smaller files to avoid performance issues
    const content = buffer.toString('utf-8', 0, Math.min(buffer.length, 100_000));
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(content)) {
        logger.warn(`Blocked upload: dangerous pattern ${pattern} found in ${filename}`);
        return { safe: false, reason: 'File contains potentially dangerous content' };
      }
    }
  }

  // 5. Check for double extensions (e.g., resume.pdf.exe)
  const parts = filename.split('.');
  if (parts.length > 2) {
    const secondToLast = `.${parts[parts.length - 2]}`;
    if (BLOCKED_EXTENSIONS.has(secondToLast)) {
      logger.warn(`Blocked upload: double extension attack in ${filename}`);
      return { safe: false, reason: 'Suspicious filename with multiple extensions' };
    }
  }

  return { safe: true };
}
