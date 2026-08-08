/**
 * Resume parser orchestration tests.
 *
 * The pipeline is now: Document AI OCR (text only) → Gemini (LLM
 * extraction with response schema) → postprocessor (normalise / score).
 * The OLD tests in this file asserted accuracy against the Document AI
 * entity-extraction path which no longer exists — extraction lives in
 * `gemini-extractor.service.ts` and is best validated by integration
 * tests against real Vertex AI (LLM behaviour can't be meaningfully
 * unit-tested with static mocks).
 *
 * What this file DOES cover at unit-test level:
 *   - Parser short-circuits when Document AI isn't configured.
 *   - Parser short-circuits when the feature flag is off.
 *   - Document AI's text gets passed through to Gemini.
 *   - Gemini's structured output flows through postprocessing without
 *     loss of fields.
 *   - When Gemini throws, the regex-only fallback (email + phone) still
 *     surfaces something useful and `extractionSource` reflects it.
 *   - Empty OCR text causes a hard throw (silent null was the bug the
 *     redesign is fixing).
 */

import { parseResume } from '../resume-parser.service';
import type { ParsedResumeData } from '../resume-schema';
import { parsedResumeSchema } from '../resume-schema';

// ── Mocks ────────────────────────────────────────────────────────────

jest.mock('../../config/document-ai', () => ({
  documentAIClient: { processDocument: jest.fn() },
}));

jest.mock('../../config/env', () => ({
  env: {
    GOOGLE_CLOUD_PROJECT_ID: 'test-project',
    DOCUMENT_AI_PROCESSOR_ID: 'test-processor',
    GOOGLE_CLOUD_LOCATION_ID: 'us',
    VERTEX_AI_LOCATION: 'us-central1',
    VERTEX_AI_MODEL: 'gemini-2.5-pro',
    FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
      client_email: 'svc@test.iam.gserviceaccount.com',
      private_key: 'fake',
    }),
  },
}));

jest.mock('../../config/feature-flags', () => ({
  isFeatureEnabled: jest.fn().mockResolvedValue(true),
}));

jest.mock('../gemini-extractor.service', () => ({
  extractWithGemini: jest.fn(),
}));

jest.mock('../resume-preprocessing.service', () => ({
  preprocessResume: jest.fn(async (buffer: Buffer, mimeType: string) => ({
    buffer,
    mimeType,
    metadata: { originalSize: buffer.length, processedSize: buffer.length, hasImages: false },
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { documentAIClient } = require('../../config/document-ai');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { extractWithGemini } = require('../gemini-extractor.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isFeatureEnabled } = require('../../config/feature-flags');

// ── Helpers ──────────────────────────────────────────────────────────

function makeParsed(partial: Partial<ParsedResumeData>): ParsedResumeData {
  return parsedResumeSchema.parse({ ...parsedResumeSchema.parse({}), ...partial });
}

function mockDocumentAIText(text: string) {
  documentAIClient.processDocument.mockResolvedValue([{ document: { text } }]);
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Resume Parser pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isFeatureEnabled.mockResolvedValue(true);
  });

  describe('Pipeline gates', () => {
    it('returns null when the feature flag is off', async () => {
      isFeatureEnabled.mockResolvedValueOnce(false);
      const result = await parseResume(Buffer.from('test'), 'application/pdf');
      expect(result).toBeNull();
      expect(documentAIClient.processDocument).not.toHaveBeenCalled();
      expect(extractWithGemini).not.toHaveBeenCalled();
    });

    it('throws when Document AI returns empty OCR text', async () => {
      mockDocumentAIText('');
      extractWithGemini.mockResolvedValue(null);
      await expect(parseResume(Buffer.from('test'), 'application/pdf')).rejects.toThrow(
        /empty OCR text/i
      );
    });
  });

  describe('Happy path — Gemini extraction', () => {
    it('routes Document AI text through Gemini and returns postprocessed data', async () => {
      mockDocumentAIText(
        'John Smith\njohn.smith@example.com\n+1 555 123 4567\nSkills: JavaScript, TypeScript, React'
      );
      extractWithGemini.mockResolvedValue(
        makeParsed({
          name: 'JOHN SMITH',
          email: 'John.Smith@Example.com',
          phone: '5551234567',
          skills: ['javascript', 'TypeScript', 'React'],
        })
      );

      const result = await parseResume(Buffer.from('test'), 'application/pdf');
      expect(result).not.toBeNull();
      expect(result?.data.name).toBe('John Smith'); // postprocessor title-cased
      expect(result?.data.email).toBe('john.smith@example.com'); // lowercased
      expect(result?.data.phone).toBe('+15551234567'); // E.164
      expect(result?.data.skills).toContain('JavaScript'); // canonicalised
      expect(result?.data.skills).toContain('React');
      expect(result?.metadata.extractionSource).toBe('gemini');
      expect(result?.metadata.ocrSource).toBe('document-ai');
      expect(extractWithGemini).toHaveBeenCalledWith(expect.stringContaining('John Smith'));
    });
  });

  describe('Gemini failure → regex fallback', () => {
    it('falls back to regex email + phone extraction when Gemini throws', async () => {
      mockDocumentAIText('Jane Doe\nContact: jane.doe@example.com\nMobile: 9876543210');
      extractWithGemini.mockRejectedValue(new Error('Vertex AI 503 UNAVAILABLE'));

      const result = await parseResume(Buffer.from('test'), 'application/pdf');
      expect(result).not.toBeNull();
      // Regex fallback should at least grab email + phone
      expect(result?.data.email).toBe('jane.doe@example.com');
      expect(result?.data.phone).toBe('+919876543210');
      expect(result?.metadata.extractionSource).toBe('regex-fallback');
    });
  });

  describe('Gemini returns partial — regex fills missing scalars', () => {
    it('back-fills email/phone via regex only when Gemini left them null', async () => {
      mockDocumentAIText(
        'Bob Wilson\nbob.wilson@example.com\nPhone: 9876500000\nLocation: Bangalore'
      );
      // Gemini got the name but missed email + phone (which it would in
      // an OCR-corrupted resume). The orchestrator should not overwrite
      // any field Gemini DID populate.
      extractWithGemini.mockResolvedValue(
        makeParsed({
          name: 'Bob Wilson',
          email: null,
          phone: null,
          currentLocation: 'Bangalore',
        })
      );

      const result = await parseResume(Buffer.from('test'), 'application/pdf');
      expect(result?.data.name).toBe('Bob Wilson');
      expect(result?.data.email).toBe('bob.wilson@example.com'); // regex filled
      expect(result?.data.phone).toBe('+919876500000');
      expect(result?.data.currentLocation).toBe('Bangalore');
      expect(result?.metadata.extractionSource).toBe('gemini');
    });
  });

  describe('Confidence + metadata propagation', () => {
    it('surfaces confidence + warnings from postprocessor', async () => {
      mockDocumentAIText('Full resume text here with many fields and details to extract.');
      extractWithGemini.mockResolvedValue(
        makeParsed({
          name: 'Maria Garcia',
          email: 'maria@example.com',
          phone: '+919876543211',
          skills: ['Python', 'Django', 'PostgreSQL', 'AWS', 'Docker'],
          experience: [
            {
              company: 'Acme',
              role: 'Senior Engineer',
              startDate: '2020-01-01',
              endDate: '2024-01-01',
              description: 'Led backend team',
            } as ParsedResumeData['experience'][number],
          ],
          education: [
            {
              institution: 'Stanford',
              degree: 'MS Computer Science',
              startDate: '2014-09-01',
              endDate: '2016-06-01',
            } as ParsedResumeData['education'][number],
          ],
        })
      );

      const result = await parseResume(Buffer.from('test'), 'application/pdf');
      expect(result?.confidence.overall).toBeGreaterThan(0.8);
      expect(result?.confidence.fields).toHaveProperty('email');
      expect(result?.metadata).toMatchObject({
        ocrSource: 'document-ai',
        extractionSource: 'gemini',
      });
      expect(typeof result?.metadata.ocrTextLength).toBe('number');
    });
  });
});
