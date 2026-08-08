/**
 * Gemini (Vertex AI) resume-extraction step.
 *
 * Pipeline position:
 *   1. resume-parser.service.ts pulls a PDF/DOCX from R2.
 *   2. Document AI OCR (`processDocument`) extracts the raw text + an
 *      `entities` array — but Google's generic Document OCR processor
 *      can't classify resume-specific entities (skill, work_experience,
 *      etc.), so entities is almost always empty.
 *   3. **THIS MODULE** takes the raw OCR text + a comprehensive JSON
 *      schema (`geminiJsonSchema`) and asks Gemini (via Vertex AI) to
 *      return a strongly-typed, schema-validated object covering every
 *      field the CandidateProfile model supports.
 *   4. resume-postprocessing.service.ts normalises / dedupes / scores
 *      the output, then the BullMQ worker writes it to Postgres.
 *
 * Why Vertex AI rather than the public Gemini API:
 *   - Reuses the existing GCP service account (FIREBASE_SERVICE_ACCOUNT)
 *     so there's no second secret to rotate.
 *   - Stays inside the same project for billing + IAM auditability.
 *   - Lower latency from the same region as Document AI.
 *   - No risk of leaking resume content to consumer-tier endpoints.
 *
 * Robustness notes:
 *   - Single 60s timeout — Gemini structured output on a 5-10k token
 *     resume typically responds in 3-8s, so 60s is generous.
 *   - Two retries on 5xx / `RESOURCE_EXHAUSTED` / `DEADLINE_EXCEEDED`
 *     with exponential backoff (1s, 2s). Other gRPC error codes do
 *     NOT retry — `INVALID_ARGUMENT` / `PERMISSION_DENIED` won't get
 *     better on retry and we'd rather surface them fast.
 *   - The model response is parsed as JSON then validated by Zod
 *     (`parsedResumeSchema`). If validation fails the raw text is
 *     logged at debug level and the error is rethrown — this is much
 *     better than silently returning null which the previous Document
 *     AI path used to do.
 *   - Empty / very short input text (< 100 chars) is rejected early
 *     so we don't burn tokens on garbled OCR.
 */

import { GoogleGenAI } from '@google/genai';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import logger from '../config/logger';
import { env } from '../config/env';
import { geminiJsonSchema, parsedResumeSchema, type ParsedResumeData } from './resume-schema';

const tracer = trace.getTracer('gemini-extractor');

// Singleton — GoogleGenAI client is heavy to construct (parses JWT, opens
// an HTTPS channel). Lazily initialise on first use so module load doesn't
// fail when the service account / project envs are missing in dev.
//
// NOTE on SDK choice: we use `@google/genai` (the Google Gen AI SDK) with
// `vertexai: true` rather than the older `@google-cloud/vertexai` package,
// which Google deprecated 2025-06-24 (removal 2026-06-24). The new SDK
// covers the same Vertex AI surface plus the unified Gen AI surface, so
// we get a longer support runway and access to newer model families
// (gemini-2.5-* etc.) that the legacy SDK doesn't.
let cachedClient: GoogleGenAI | null = null;

function getVertexClient(): GoogleGenAI | null {
  if (cachedClient) return cachedClient;

  if (!env.GOOGLE_CLOUD_PROJECT_ID || !env.FIREBASE_SERVICE_ACCOUNT) {
    logger.warn(
      'Vertex AI not configured — missing GOOGLE_CLOUD_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT'
    );
    return null;
  }

  try {
    const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as {
      client_email: string;
      private_key: string;
    };

    cachedClient = new GoogleGenAI({
      vertexai: true,
      project: env.GOOGLE_CLOUD_PROJECT_ID,
      location: env.VERTEX_AI_LOCATION,
      googleAuthOptions: {
        credentials: {
          client_email: sa.client_email,
          private_key: sa.private_key,
        },
      },
    });

    logger.info(
      `✨ Vertex AI initialized via @google/genai (project=${env.GOOGLE_CLOUD_PROJECT_ID}, location=${env.VERTEX_AI_LOCATION}, model=${env.VERTEX_AI_MODEL})`
    );
    return cachedClient;
  } catch (error) {
    logger.error('Vertex AI initialization failed:', error);
    return null;
  }
}

// Reset hook for tests — `cachedClient` would otherwise leak between
// test files that mock env differently.
export function _resetVertexClientCacheForTesting(): void {
  cachedClient = null;
}

// ── Schema-for-prompt ─────────────────────────────────────────────────
// Vertex AI's `responseSchema` (and the SDK's newer `responseJsonSchema`)
// both compile into a constrained-decoding state machine that rejects
// our 80-field schema with INVALID_ARGUMENT ("too many states for
// serving") — confirmed even after stripping every enum. The state
// budget is fixed by the engine, not by what we put in the schema.
//
// Instead of fighting the budget, we move the schema into the SYSTEM
// PROMPT as a serialized JSON document. The model sees every field
// name, type, required-status, nesting, AND enum vocabulary; the
// budget no longer applies. Generation still runs under JSON mode
// (`responseMimeType: 'application/json'`) so the model must emit
// valid JSON. Zod (`parsedResumeSchema`) is the ground-truth validator
// on the parsed output, feeding the 3-attempt retry loop on mismatch.
//
// To make the schema more model-readable, fold each `enum: [...]` into
// a "Must be EXACTLY one of ..." sentence on the same property's
// `description`. JSON.stringify of a property with `enum` is also
// valid information, but the prose form survives partial truncation
// and matches how the SYSTEM_INSTRUCTION restates allowed values.
function foldEnumsIntoDescription(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(foldEnumsIntoDescription);
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'enum') continue;
      out[k] = foldEnumsIntoDescription(v);
    }
    if (Array.isArray(obj.enum) && obj.enum.length > 0) {
      const valuesStr = obj.enum.map(String).join(', ');
      const enumDesc = `Must be EXACTLY one of (case-sensitive): ${valuesStr}`;
      const existing = typeof obj.description === 'string' ? obj.description.trim() : '';
      out.description = existing ? `${existing} — ${enumDesc}` : enumDesc;
    }
    return out;
  }
  return node;
}

const SCHEMA_DESCRIPTOR_JSON = JSON.stringify(foldEnumsIntoDescription(geminiJsonSchema), null, 2);

// ── Prompt ───────────────────────────────────────────────────────────
// The extraction prompt. Four goals:
//   1. Tell the model it MUST emit JSON matching the embedded schema.
//   2. Give it the exact set of Prisma enum values it can choose from
//      (also surfaced in the embedded schema's `description` fields,
//      but the prompt restatement helps Gemini self-correct when its
//      first sketch picks the wrong value).
//   3. Give it a small set of decision heuristics so semi-ambiguous
//      fields like experienceLevel / highestEducationLevel /
//      noticePeriod get classified consistently.
//   4. Embed the full schema as JSON (at the bottom) so the model has
//      a single canonical reference for property names + types.
//
// Note: we deliberately do NOT include few-shot examples. Few-shot
// examples bias the model toward specific resume layouts and make
// extraction worse on unusual ones. Gemini 2.5 with a detailed schema
// + heuristics generalises better.

const SYSTEM_INSTRUCTION = `You are an expert resume parser. You will be given the OCR-extracted plain text of a candidate's resume. Extract every field that's discoverable from the text into a structured JSON object exactly matching the EXPECTED JSON SHAPE described at the bottom of this prompt.

CORE RULES
- Output JSON ONLY — no prose, no markdown, no commentary, no code fences.
- Property names, types, and nesting MUST match the EXPECTED JSON SHAPE exactly. Do not invent extra fields. Do not omit fields — use null / [] for unknown values.
- For any field whose description says "Must be EXACTLY one of ...", pick exactly one of those values, case-sensitive (typically Prisma UPPER_SNAKE_CASE enum names). If none of the allowed values fits, use null.
- Use null for unknown scalar fields, [] for unknown array fields. NEVER invent data, NEVER guess at fields that aren't supported by clear evidence in the text.
- Preserve the candidate's wording in free-text fields (\`description\`, \`summary\`, \`keyAchievements\`, \`bio\`) — don't rewrite or summarise unless the field literally is a summary.
- Trim whitespace, strip OCR noise (page numbers, repeated headers, "Page 1 of 3"), and de-duplicate skills / certifications.

DATE HANDLING
- Always return dates as ISO-8601 (YYYY-MM-DD).
- PRESERVE THE DAY when the resume provides a full date (day + month + year). Common Indian / international formats you must convert to ISO without losing the day:
    "15 Oct 1996" / "15 October 1996"     → "1996-10-15"
    "Oct 15, 1996" / "October 15, 1996"   → "1996-10-15"
    "15/10/1996" (DD/MM/YYYY)             → "1996-10-15"
    "15-10-1996" / "15.10.1996"           → "1996-10-15"
    "1996-10-15" / "1996/10/15"           → "1996-10-15"
  When the day is genuinely absent from the source ("Oct 1996", "June 2020"), default the day to 01 — but ONLY then. Never default to day=01 if the resume clearly shows a day.
- Use Jan 1st when only a year is given ("2020" → "2020-01-01").
- Be especially careful with \`dob\` — date-of-birth is almost always given with a day in resumes; losing it makes the field useless. If the OCR text shows three numeric parts near "DOB", "Date of Birth", "Born", "D.O.B.", "DD/MM/YYYY", or similar, extract all three.
- DOB-SPECIFIC OVERRIDE: For the \`dob\` field, do NOT apply the "default day to 01" rule above. If the resume only has month+year for DOB ("Oct 1990") with no day, return null. "1990-10-01" is a bad fallback because a DOB on the 1st reads to humans as a placeholder. Either extract the real day or set dob to null.
- If an experience/education entry is current (says "Present", "Current", "Till date", "Ongoing"), set endDate to null AND isCurrent to true.

CLASSIFICATION HEURISTICS
- experienceLevel: derive from total years of professional experience:
    FRESHER if 0 years OR purely intern/student
    ENTRY    if 1-2 years
    MID      if 3-6 years
    SENIOR   if 7-11 years
    LEAD     if 12-15 years OR explicit "Tech Lead" / "Engineering Manager" titles
    EXECUTIVE if 15+ years OR explicit C-level / VP titles
- experienceYears: total professional experience in years (decimal allowed, e.g. 5.5).
- totalExperienceMonths: same total, expressed in whole months.
- highestEducationLevel + highestDegree: pick the most advanced education entry. Use TENTH/TWELFTH for 10th/12th class results, DIPLOMA for diplomas, BACHELORS / MASTERS / PHD / POST_DOCTORAL otherwise. highestDegree should be the closest Prisma SpecificDegree enum (e.g. "B.Tech in CSE" → BTECH_BE, "MBA Marketing" → MBA_PGDM); use ANY_GRADUATE / ANY_POSTGRADUATE when the resume mentions a degree level but no specific stream.
- workStatus + openToWork: derive from explicit cues ("actively looking", "open to offers", "currently employed at X"). Default to null if not stated.
- noticePeriod: convert "immediate", "15 days", "1 month", "2 months", "3 months", ">90 days" to the nearest enum.
- functionalArea: pick the closest Prisma FunctionalArea — IT_SOFTWARE / SALES / MARKETING / HR / FINANCE / ENGINEERING / etc.
- gender / maritalStatus / nationality / dob: only fill when explicitly stated in the resume. Don't infer from name.

CONTACT EXTRACTION
- email: capture the candidate's primary email exactly as it appears, lower-cased. Common OCR artefacts to strip: "mailto:" prefix, surrounding angle brackets, trailing punctuation. Accept all valid TLDs (.com, .co.in, .edu.in, .ai, .io, etc.) and local parts with dots / plus signs / underscores. If the resume shows multiple emails, the FIRST one (typically in the header) is the primary; any subsequent ones go into alternateEmail.
- phone: capture the primary phone with country code if present (Indian resumes often write "+91 98765 43210" or "9876543210" — keep digits + leading + only). If multiple phones, the FIRST is primary; others go into alternatePhone.

LIST HEURISTICS
- skills: top-level technical + soft skills. Don't include certifications or tool versions here (those go in itSkills / certifications).
- itSkills: tech stack with optional version/lastUsed/experienceYears/proficiency. Useful for resumes with a structured "Technical Skills" table.
- skillsWithProficiency: only populate when proficiency is explicitly stated (e.g. "Python — Advanced"). Otherwise leave empty.
- languages: spoken/written languages by name (e.g. "English", "Hindi", "Spanish").
- languageProficiency: when read/write/speak proficiency is annotated, capture it.
- interests vs hobbies: "interests" = professional/intellectual ("Open-source contribution", "Distributed systems"); "hobbies" = personal ("Cricket", "Painting"). When a resume has only one section, put everything in interests.
- references: only when the resume has a dedicated "References" section. "References available on request" should leave the array empty.
- blockedCompanies: only when the candidate explicitly lists companies to exclude — rare on resumes.

SOCIAL PROFILE PARSING
- linkedinProfile / githubProfile / portfolioUrl / etc.: capture full URLs when present. If the resume shows just a handle (e.g. "github.com/jane"), expand to the full https://... URL.
- LinkedIn URLs sometimes appear with "linkedin.com/in/jane" without scheme — prepend https:// before returning.

ADDRESS PARSING
- Indian resumes typically have one-line addresses ("123 MG Road, Bangalore, KA 560001"). Split: addressLine1=street, city, state (2-letter code or full name), pincode (6 digits), country.
- US/UK resumes: split similarly. country only when explicitly stated, otherwise leave null (don't infer from currency/phone code).

SALARY PARSING
- Indian resumes often quote LPA (Lakhs Per Annum) — "8 LPA" → currSalary 800000, salaryCurrency "INR". "12-15 LPA expected" → expectedSalaryMin 1200000, expectedSalaryMax 1500000.
- "$120k" → 120000, salaryCurrency "USD".
- Always convert to base units in the currency (rupees, not lakhs; dollars, not thousands).

OUTPUT
- Emit a single JSON object that matches the EXPECTED JSON SHAPE below. The system will validate against the same schema and reject extra fields, wrong types, or invalid enum values — your output will be retried on a validation failure, so getting it right the first time is preferred.

EXPECTED JSON SHAPE (authoritative — match this exactly)
${SCHEMA_DESCRIPTOR_JSON}`;

// ── Public API ───────────────────────────────────────────────────────

/**
 * Run Gemini (Vertex AI) extraction over OCR'd resume text.
 *
 * Returns:
 *   - the parsed object on success
 *   - null when the Vertex AI client isn't configured (caller falls
 *     back to whatever Document AI extracted via regex)
 *
 * Throws:
 *   - on Vertex AI API failure (after retries)
 *   - on schema validation failure (Zod)
 *   - on empty / unparseable response
 *
 * Callers MUST handle the throw — silently returning null is what made
 * the prior Document AI bug invisible for weeks.
 */
export async function extractWithGemini(text: string): Promise<ParsedResumeData | null> {
  return tracer.startActiveSpan('gemini.extractResume', async (span) => {
    try {
      // Trim + reject obviously broken input
      const trimmed = text.trim();
      span.setAttribute('ai.input.length', trimmed.length);
      if (trimmed.length < 100) {
        logger.warn(
          `Gemini extraction skipped — OCR text too short (${trimmed.length} chars). ` +
            'Likely a corrupt PDF, image-only resume that OCR failed on, or empty input.'
        );
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'OCR text too short',
        });
        throw new Error(`OCR text too short for Gemini extraction (${trimmed.length} chars)`);
      }

      const client = getVertexClient();
      if (!client) {
        // Soft-null only when the client itself isn't wired up. This
        // happens in dev environments without GCP creds. In production
        // service-init would have logged the warning at boot.
        span.setStatus({ code: SpanStatusCode.OK });
        return null;
      }

      // NOTE: we DELIBERATELY do not pass `responseSchema` /
      // `responseJsonSchema`. Both compile into a constrained-decoding
      // state machine that 400s on schemas of our size ("too many
      // states for serving"). Instead, the schema is embedded in
      // SYSTEM_INSTRUCTION and we rely on JSON-mode + Zod-validate +
      // retry. See the SCHEMA_DESCRIPTOR_JSON block at the top of this
      // file for the full reasoning.
      const userPrompt = `Resume text:\n\n${trimmed}`;

      // ── Retry loop ───────────────────────────────────────────────
      // Vertex AI's transient-error space is narrow (5xx / quota /
      // deadline). Stable errors (INVALID_ARGUMENT, PERMISSION_DENIED,
      // FAILED_PRECONDITION) won't get better on retry — fail fast.
      const MAX_ATTEMPTS = 3;
      const BACKOFF_MS = [1000, 2000];
      let lastError: unknown;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const t0 = Date.now();
          const result = await client.models.generateContent({
            model: env.VERTEX_AI_MODEL,
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              temperature: 0.1, // deterministic-ish; we want repeatable extraction
              topP: 0.95,
              topK: 40,
              // 16k tokens is roomy for a 4-5 page resume's worth of
              // structured output (the schema has ~80 fields including
              // arrays of objects).
              maxOutputTokens: 16384,
              responseMimeType: 'application/json',
              // Resume content can mention sensitive-but-not-harmful
              // topics (defence sector employment, medical careers,
              // criminal-justice adjacency). Block thresholds are kept
              // at the SDK default — anything stricter starts dropping
              // legitimate military / police / pharma resumes.
            },
          });
          const elapsed = Date.now() - t0;
          span.setAttribute('ai.attempt', attempt);
          span.setAttribute('ai.elapsed_ms', elapsed);

          const candidate = result.candidates?.[0];
          if (!candidate || candidate.finishReason === 'SAFETY') {
            throw new Error(
              `Gemini blocked or empty response: finishReason=${candidate?.finishReason ?? 'NONE'}`
            );
          }

          // `result.text` is the convenience getter on the Gen AI SDK
          // response; fall back to concatenating parts in case it's
          // unavailable for any reason (e.g. multi-part responses).
          const rawText = (
            result.text ??
            candidate.content?.parts?.map((p) => p.text ?? '').join('') ??
            ''
          ).trim();
          if (!rawText) {
            throw new Error('Gemini returned empty content');
          }

          // Parse + validate
          let parsed: unknown;
          try {
            parsed = JSON.parse(rawText);
          } catch (jsonErr) {
            // Sometimes structured-output mode wraps in a code fence
            // when the model misinterprets — strip and retry parse.
            const stripped = rawText
              .replace(/^```(?:json)?\s*/, '')
              .replace(/\s*```$/, '')
              .trim();
            try {
              parsed = JSON.parse(stripped);
            } catch {
              logger.debug(`Gemini raw output (first 500 chars): ${rawText.slice(0, 500)}`);
              throw new Error(
                `Gemini returned unparseable JSON: ${(jsonErr as Error).message.slice(0, 100)}`
              );
            }
          }

          const validation = parsedResumeSchema.safeParse(parsed);
          if (!validation.success) {
            const issueSummary = validation.error.issues
              .slice(0, 5)
              .map((i) => `${i.path.join('.')}=${i.message}`)
              .join('; ');
            logger.warn(`Gemini output failed schema validation: ${issueSummary}`);
            // Fall through to retry — the model can sometimes self-correct
            throw new Error(`Schema validation failed: ${issueSummary}`);
          }

          logger.info(
            `Gemini extraction complete: elapsed=${elapsed}ms, skills=${validation.data.skills.length}, ` +
              `experience=${validation.data.experience.length}, education=${validation.data.education.length}, ` +
              `attempt=${attempt}`
          );
          span.setStatus({ code: SpanStatusCode.OK });
          return validation.data;
        } catch (error) {
          lastError = error;
          const message = (error as Error).message || String(error);
          const retryable =
            /DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED|UNAVAILABLE|INTERNAL|503|504|429|Schema validation/i.test(
              message
            );

          if (attempt === MAX_ATTEMPTS || !retryable) {
            logger.error(
              `Gemini extraction failed on attempt ${attempt}/${MAX_ATTEMPTS} (terminal): ${message}`
            );
            break;
          }

          const delay = BACKOFF_MS[attempt - 1] ?? 2000;
          logger.warn(
            `Gemini extraction failed on attempt ${attempt}/${MAX_ATTEMPTS} (retryable, sleeping ${delay}ms): ${message}`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (lastError as Error)?.message ?? 'Unknown',
      });
      throw (
        lastError ?? new Error('Gemini extraction failed after all retries (no error captured)')
      );
    } finally {
      span.end();
    }
  });
}
