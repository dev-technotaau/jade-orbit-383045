import logger from '../config/logger';

/**
 * Pre-processing utilities for resume parsing
 * Cleans and normalizes input before sending to Document AI
 */

interface PreprocessResult {
  buffer: Buffer;
  mimeType: string;
  metadata: {
    originalSize: number;
    processedSize: number;
    encoding?: string;
    hasImages?: boolean;
  };
}

/**
 * Detect and fix common encoding issues in text
 */
function normalizeTextEncoding(text: string): string {
  // Fix common UTF-8 encoding issues
  const normalized = text
    // Fix smart quotes
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    // Fix em/en dashes
    .replace(/[\u2013\u2014]/g, '-')
    // Fix ellipsis
    .replace(/\u2026/g, '...')
    // Fix non-breaking spaces
    .replace(/\u00A0/g, ' ')
    // Fix zero-width spaces
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

/**
 * Validate MIME type and file size
 */
function validateFile(buffer: Buffer, mimeType: string): { valid: boolean; error?: string } {
  const MAX_SIZE = 20 * 1024 * 1024; // 20MB
  const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'image/webp'];

  if (buffer.length === 0) {
    return { valid: false, error: 'Empty file' };
  }

  if (buffer.length > MAX_SIZE) {
    return { valid: false, error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB)` };
  }

  if (!ALLOWED_TYPES.includes(mimeType)) {
    return { valid: false, error: `Unsupported file type: ${mimeType}` };
  }

  return { valid: true };
}

/**
 * Detect if buffer is actually a text file (docx/txt uploaded as PDF)
 */
function detectActualMimeType(buffer: Buffer): string {
  // Check magic numbers
  const magic = buffer.slice(0, 4).toString('hex');

  // PDF: %PDF (25 50 44 46)
  if (magic.startsWith('25504446')) return 'application/pdf';

  // JPEG: FF D8 FF
  if (magic.startsWith('ffd8ff')) return 'image/jpeg';

  // PNG: 89 50 4E 47
  if (magic.startsWith('89504e47')) return 'image/png';

  // DOCX/XLSX (ZIP): 50 4B 03 04
  if (magic.startsWith('504b0304')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  // TIFF: 49 49 2A 00 or 4D 4D 00 2A
  if (magic.startsWith('49492a00') || magic.startsWith('4d4d002a')) return 'image/tiff';

  return 'application/octet-stream';
}

/**
 * Check if PDF is image-based (scanned) vs text-based
 */
function isPdfImageBased(buffer: Buffer): boolean {
  const pdfText = buffer.toString('latin1');

  // Look for text content markers
  const hasText = /\/Text/.test(pdfText);
  const hasFont = /\/Font/.test(pdfText);

  // Look for image markers
  const hasImage = /\/Image/.test(pdfText);
  const hasXObject = /\/XObject/.test(pdfText);

  // If has images but no text/fonts, likely scanned
  return (hasImage || hasXObject) && !hasText && !hasFont;
}

/**
 * Remove common resume noise patterns
 */
function removeNoise(text: string): string {
  return (
    text
      // Remove page numbers
      .replace(/Page\s+\d+\s+of\s+\d+/gi, '')
      .replace(/\b\d+\s*\/\s*\d+\b/g, '')
      // Remove common watermarks
      .replace(/CONFIDENTIAL|DRAFT|COPY/gi, '')
      // Remove excessive line breaks
      .replace(/\n{3,}/g, '\n\n')
      // Remove header/footer separators
      .replace(/^[-=_]{3,}$/gm, '')
      .trim()
  );
}

/**
 * Pre-process resume file before sending to Document AI
 */
export async function preprocessResume(
  fileBuffer: Buffer,
  mimeType: string
): Promise<PreprocessResult> {
  const originalSize = fileBuffer.length;

  try {
    // Step 1: Validate file
    const validation = validateFile(fileBuffer, mimeType);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Step 2: Detect actual MIME type (in case of mislabeled files)
    const detectedType = detectActualMimeType(fileBuffer);
    const actualMimeType = detectedType !== 'application/octet-stream' ? detectedType : mimeType;

    if (actualMimeType !== mimeType) {
      logger.warn(`MIME type mismatch: declared=${mimeType}, detected=${actualMimeType}`);
    }

    // Step 3: Check if PDF is image-based
    const metadata: PreprocessResult['metadata'] = {
      originalSize,
      processedSize: fileBuffer.length,
    };

    if (actualMimeType === 'application/pdf') {
      metadata.hasImages = isPdfImageBased(fileBuffer);
    }

    // Step 4: For text-based content, normalize encoding
    // (Document AI handles binary formats like PDF/images directly)
    const processedBuffer = fileBuffer;

    // If we detect encoding issues in metadata, we could attempt text extraction
    // and re-encoding, but Document AI handles this well natively

    logger.debug(
      `Resume preprocessed: ${originalSize} bytes, type=${actualMimeType}, hasImages=${metadata.hasImages || false}`
    );

    return {
      buffer: processedBuffer,
      mimeType: actualMimeType,
      metadata: {
        ...metadata,
        processedSize: processedBuffer.length,
      },
    };
  } catch (error) {
    logger.error('Resume preprocessing failed:', error);
    // Return original on failure
    return {
      buffer: fileBuffer,
      mimeType,
      metadata: {
        originalSize,
        processedSize: fileBuffer.length,
      },
    };
  }
}

export { normalizeTextEncoding, removeNoise };
