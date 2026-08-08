import {
  preprocessResume,
  normalizeTextEncoding,
  removeNoise,
} from '../resume-preprocessing.service';

describe('Resume Preprocessing Service', () => {
  describe('normalizeTextEncoding', () => {
    it('should fix smart quotes', () => {
      const input = '"Hello World"';
      const result = normalizeTextEncoding(input);
      expect(result).toBe('"Hello World"');
    });

    it('should fix em and en dashes', () => {
      const input = 'Experience — 2020–2023';
      const result = normalizeTextEncoding(input);
      expect(result).toBe('Experience - 2020-2023');
    });

    it('should remove zero-width spaces', () => {
      const input = 'Hello\u200BWorld';
      const result = normalizeTextEncoding(input);
      expect(result).toBe('HelloWorld');
    });

    it('should normalize multiple spaces', () => {
      const input = 'Hello    World   !';
      const result = normalizeTextEncoding(input);
      expect(result).toBe('Hello World !');
    });
  });

  describe('removeNoise', () => {
    it('should remove page numbers', () => {
      const input = 'Some text\nPage 1 of 3\nMore text';
      const result = removeNoise(input);
      expect(result).not.toContain('Page 1 of 3');
    });

    it('should remove watermarks', () => {
      const input = 'Resume\nCONFIDENTIAL\nJohn Doe';
      const result = removeNoise(input);
      expect(result).not.toContain('CONFIDENTIAL');
    });

    it('should remove excessive line breaks', () => {
      const input = 'Line 1\n\n\n\nLine 2';
      const result = removeNoise(input);
      expect(result).toBe('Line 1\n\nLine 2');
    });
  });

  describe('preprocessResume', () => {
    it('should validate PDF files', async () => {
      // Mock PDF magic number
      const pdfBuffer = Buffer.from('%PDF-1.4\nHello World', 'utf-8');
      const result = await preprocessResume(pdfBuffer, 'application/pdf');

      expect(result).toBeDefined();
      expect(result.mimeType).toBe('application/pdf');
      expect(result.metadata.originalSize).toBe(pdfBuffer.length);
    });

    it('should detect MIME type from magic numbers', async () => {
      // JPEG magic number (FF D8 FF)
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(100).fill(0)]);
      const result = await preprocessResume(jpegBuffer, 'application/pdf');

      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should reject files that are too large', async () => {
      const largeBuffer = Buffer.alloc(25 * 1024 * 1024); // 25MB
      const result = await preprocessResume(largeBuffer, 'application/pdf');

      // Should return original on validation failure
      expect(result.buffer).toBe(largeBuffer);
    });

    it('should reject empty files', async () => {
      const emptyBuffer = Buffer.alloc(0);
      const result = await preprocessResume(emptyBuffer, 'application/pdf');

      // Should return original on validation failure
      expect(result.buffer).toBe(emptyBuffer);
    });

    it('should handle PNG files', async () => {
      // PNG magic number (89 50 4E 47)
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, ...Array(100).fill(0)]);
      const result = await preprocessResume(pngBuffer, 'image/png');

      expect(result.mimeType).toBe('image/png');
    });

    it('should detect image-based PDFs', async () => {
      const imagePdfBuffer = Buffer.from('%PDF-1.4\n/Image /XObject\nNo text here', 'utf-8');
      const result = await preprocessResume(imagePdfBuffer, 'application/pdf');

      expect(result.metadata.hasImages).toBe(true);
    });

    it('should detect text-based PDFs', async () => {
      const textPdfBuffer = Buffer.from('%PDF-1.4\n/Text /Font\nSome text content', 'utf-8');
      const result = await preprocessResume(textPdfBuffer, 'application/pdf');

      expect(result.metadata.hasImages).toBe(false);
    });
  });
});
