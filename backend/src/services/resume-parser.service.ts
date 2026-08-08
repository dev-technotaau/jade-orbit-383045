/**
 * End-to-end resume parsing orchestration.
 *
 *   PDF/DOCX → preprocess → Document AI OCR → Gemini extraction → postprocess
 *
 * Why two cloud services:
 *   - Document AI is the best-in-class OCR engine for messy resumes
 *     (multi-column, scanned scans, embedded images). Its generic OCR
 *     processor doesn't understand resume entities, but it understands
 *     pages, tables, and reading order — far better than running pdf-js
 *     in-process.
 *   - Gemini (via Vertex AI) takes the OCR'd text and a strict response
 *     schema and returns a fully populated CandidateProfile-shaped
 *     object. See `gemini-extractor.service.ts` for the prompt + retry
 *     policy.
 *
 * Re-exported types/Zod-schema for downstream modules:
 *   - `ParsedResumeData` — the canonical shape (matches the
 *     frontend type of the same name).
 *   - `parsedResumeSchema` — Zod schema used by Gemini to validate.
 *
 * Returns null when Document AI isn't configured. Throws on any other
 * failure — the worker layer logs + lets BullMQ retry / DLQ as
 * appropriate.
 */
import { documentAIClient } from '../config/document-ai';
import { env } from '../config/env';
import logger from '../config/logger';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { preprocessResume } from './resume-preprocessing.service';
import { postprocessResume } from './resume-postprocessing.service';
import { isFeatureEnabled } from '../config/feature-flags';
import { extractWithGemini } from './gemini-extractor.service';
import { parsedResumeSchema, type ParsedResumeData } from './resume-schema';

export type { ParsedResumeData } from './resume-schema';
export { parsedResumeSchema } from './resume-schema';

const tracer = trace.getTracer('resume-parser-service');

export interface ParsedResumeResult {
  data: ParsedResumeData;
  confidence: {
    overall: number;
    fields: Record<string, number>;
  };
  warnings: string[];
  metadata: {
    originalSize: number;
    processedSize: number;
    mimeType: string;
    hasImages?: boolean;
    ocrTextLength: number;
    ocrSource: 'document-ai';
    extractionSource: 'gemini' | 'regex-fallback';
  };
}

// ── Regex fallbacks ──────────────────────────────────────────────────
// Used only when Gemini isn't configured. At least surface email +
// phone so the user gets *something* in their profile. Once Vertex AI
// is wired in production this path is dormant.

function extractEmailFromText(text: string): string | null {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

function extractPhoneFromText(text: string): string | null {
  // International + national formats. Captures 7-15 digit groups with
  // optional country code, parens, dashes, spaces.
  const match = text.match(/[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{7,15}/);
  return match ? match[0].trim() : null;
}

function emptyParsedResumeData(): ParsedResumeData {
  // Zod's `.default([])` populates array fields; this gives us a
  // baseline of "every required key present, every field null/empty"
  // that the postprocessor can apply normalisation rules to.
  return parsedResumeSchema.parse({});
}

// ── Main entry ───────────────────────────────────────────────────────

/**
 * Parse a resume buffer through OCR + LLM extraction.
 * Returns null only when Document AI itself isn't configured.
 * Throws otherwise (worker handles retry / DLQ).
 */
export async function parseResume(
  fileBuffer: Buffer,
  mimeType: string
): Promise<ParsedResumeResult | null> {
  if (!(await isFeatureEnabled('enableDocumentAI'))) {
    logger.debug('Document AI disabled via feature flag — skipping resume parse');
    return null;
  }

  if (!documentAIClient || !env.GOOGLE_CLOUD_PROJECT_ID || !env.DOCUMENT_AI_PROCESSOR_ID) {
    logger.debug('Document AI not configured — skipping resume parse');
    return null;
  }

  return tracer.startActiveSpan('resume.parse', async (span) => {
    try {
      // ── Step 1: Preprocess ───────────────────────────────────────
      span.addEvent('preprocessing.start');
      const preprocessed = await preprocessResume(fileBuffer, mimeType);
      span.setAttribute('ai.mime_type', preprocessed.mimeType);
      span.setAttribute('ai.original_size', preprocessed.metadata.originalSize);
      span.setAttribute('ai.has_images', preprocessed.metadata.hasImages || false);
      span.addEvent('preprocessing.complete');

      // ── Step 2: Document AI OCR ──────────────────────────────────
      const processorName =
        `projects/${env.GOOGLE_CLOUD_PROJECT_ID}` +
        `/locations/${env.GOOGLE_CLOUD_LOCATION_ID}` +
        `/processors/${env.DOCUMENT_AI_PROCESSOR_ID}`;

      span.addEvent('documentai.request.start');
      // Non-null assertion safe — the early-return null check above
      // already verified documentAIClient. TS loses the narrowing
      // across the tracer.startActiveSpan async boundary.
      const [result] = await documentAIClient!.processDocument({
        name: processorName,
        rawDocument: {
          content: preprocessed.buffer.toString('base64'),
          mimeType: preprocessed.mimeType,
        },
      });
      span.addEvent('documentai.request.complete');

      const document = result.document;
      if (!document?.text || document.text.trim().length === 0) {
        // OCR returned literally nothing — almost always a corrupt
        // upload or an image-PDF Document AI couldn't read. We treat
        // this as a hard failure rather than silently dropping it.
        throw new Error('Document AI returned empty OCR text');
      }

      const text = document.text;
      span.setAttribute('ai.ocr.text_length', text.length);
      logger.info(`Document AI OCR complete: ${text.length} chars extracted`);

      // ── Step 3: Gemini structured extraction ─────────────────────
      let extracted: ParsedResumeData | null = null;
      let extractionSource: 'gemini' | 'regex-fallback' = 'regex-fallback';

      try {
        extracted = await extractWithGemini(text);
        if (extracted) extractionSource = 'gemini';
      } catch (geminiErr) {
        // Gemini's already retried internally — at this point we
        // could either re-raise (failing the whole parse) or fall
        // back to a regex-only extract. We choose fall-back because
        // a partial result (email + phone) is much better UX than a
        // total parse failure, and the warning makes the limitation
        // visible. Worker will see warnings and surface them.
        logger.error(
          `Gemini extraction failed after retries — falling back to regex-only extract: ${
            (geminiErr as Error).message
          }`
        );
        span.setAttribute('ai.gemini.failed', true);
      }

      if (!extracted) {
        // Either no client (dev) or Gemini threw and we fell through.
        // Build a minimal record from regex so the user gets *some*
        // pre-fill.
        const base = emptyParsedResumeData();
        base.email = extractEmailFromText(text);
        base.phone = extractPhoneFromText(text);
        extracted = base;
      } else {
        // Belt-and-braces: Gemini *should* always set email + phone
        // when the resume has them, but fall back to regex if it
        // missed (e.g. when a phone is rendered as superscript-style
        // OCR'd as "9 8 7 6 ..."). Only fill when Gemini left null.
        if (!extracted.email) extracted.email = extractEmailFromText(text);
        if (!extracted.phone) extracted.phone = extractPhoneFromText(text);
      }

      // ── Step 4: Postprocess (normalise / score / dedupe) ─────────
      span.addEvent('postprocessing.start');
      const postprocessed = await postprocessResume(extracted);
      span.addEvent('postprocessing.complete');

      // Telemetry
      span.setAttribute('ai.skills_found', postprocessed.data.skills.length);
      span.setAttribute('ai.experience_entries', postprocessed.data.experience.length);
      span.setAttribute('ai.education_entries', postprocessed.data.education.length);
      span.setAttribute('ai.confidence.overall', postprocessed.confidence.overall);
      span.setAttribute('ai.warnings', postprocessed.warnings.length);

      logger.info(
        `Resume parsed: skills=${postprocessed.data.skills.length}, ` +
          `exp=${postprocessed.data.experience.length}, ` +
          `edu=${postprocessed.data.education.length}, ` +
          `confidence=${(postprocessed.confidence.overall * 100).toFixed(1)}%, ` +
          `warnings=${postprocessed.warnings.length}, ` +
          `source=${extractionSource}`
      );

      span.setStatus({ code: SpanStatusCode.OK });

      const out: ParsedResumeResult = {
        data: postprocessed.data,
        confidence: postprocessed.confidence,
        warnings: postprocessed.warnings,
        metadata: {
          originalSize: preprocessed.metadata.originalSize,
          processedSize: preprocessed.metadata.processedSize,
          mimeType: preprocessed.mimeType,
          hasImages: preprocessed.metadata.hasImages,
          ocrTextLength: text.length,
          ocrSource: 'document-ai',
          extractionSource,
        },
      };
      return out;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message ?? 'unknown',
      });
      logger.error('Resume parsing failed:', error);
      // Re-throw so the worker logs it AND BullMQ marks the job failed
      // (which is what we want — silently returning null was the
      // long-standing UX bug this redesign fixes).
      throw error;
    } finally {
      span.end();
    }
  });
}
