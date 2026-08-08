#!/usr/bin/env node
/**
 * validate-structured-data.mjs
 *
 * Two-pass SEO validator:
 *
 *   PASS 1 — Rendered-HTML validation (live pages)
 *   ───────────────────────────────────────────────
 *   Fetches each public page, extracts every `<script type="application/ld+json">`
 *   block, and validates against a set of rules:
 *     1. Parses as valid JSON                — catches syntax breakage
 *     2. Has `@context` set to schema.org    — catches context typos
 *     3. Has a recognised `@type`            — catches type typos
 *     4. Required fields present per @type   — catches schema skew
 *     5. No stub placeholders in output      — catches uncommitted placeholders
 *
 *   PASS 2 — Source-file scan
 *   ───────────────────────────────────────────────
 *   Greps the SEO source files for `REPLACE_WITH_REAL_ID` / `REPLACE_WITH_*`
 *   markers so devs have a running list of what remains to populate (FB
 *   App ID, verification tokens, mobile-app IDs).
 *
 * Exit codes:
 *   0 — no errors (warnings allowed)
 *   1 — hard errors OR (if STRICT_SEO=1 env var) any placeholders remain
 *
 * Usage:
 *   # validate against local dev server
 *   node scripts/validate-structured-data.mjs http://localhost:3000
 *
 *   # validate production
 *   node scripts/validate-structured-data.mjs https://hireadda.in
 *
 *   # strict mode — placeholders fail the build (use when ready to enforce)
 *   STRICT_SEO=1 node scripts/validate-structured-data.mjs http://localhost:3000
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const STRICT = process.env.STRICT_SEO === '1';

const PAGES_TO_VALIDATE = [
  '/',
  '/about',
  '/contact',
  '/help',
  '/site-map',
  '/privacy',
  '/terms',
  '/cookie-policy',
  '/refund-policy',
  '/accessibility',
  '/disclaimer',
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
];

const RECOGNISED_TYPES = new Set([
  'Organization',
  'WebSite',
  'WebPage',
  'AboutPage',
  'ContactPage',
  'CollectionPage',
  'SearchResultsPage',
  'BreadcrumbList',
  'FAQPage',
  'Article',
  'BlogPosting',
  'NewsArticle',
  'JobPosting',
  'Person',
  'WebApplication',
  'SoftwareApplication',
  'LocalBusiness',
  'Service',
  'Event',
  'VideoObject',
  'Review',
  'AggregateRating',
  'HowTo',
  'SpeakableSpecification',
  'ItemList',
  'SearchAction',
  'SiteNavigationElement',
]);

const REQUIRED_FIELDS_PER_TYPE = {
  Organization: ['name', 'url'],
  WebSite: ['name', 'url'],
  WebPage: ['name', 'url'],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['mainEntity'],
  JobPosting: ['title', 'description', 'datePosted', 'hiringOrganization'],
  Article: ['headline', 'author', 'datePublished'],
  Person: ['name'],
  WebApplication: ['name', 'applicationCategory'],
  SoftwareApplication: ['name', 'applicationCategory'],
};

const PLACEHOLDER_MARKERS = [
  'TEAMID',
  'TODO',
  'XXXXXXXX',
  'lorem ipsum',
  'REPLACE_WITH_REAL_ID',
  'REPLACE_WITH_',
];

/**
 * Source files that should be scanned for placeholder markers. Any file
 * listed here will be grep'd line-by-line; hits are reported with
 * file:line references. Strict mode elevates these to errors.
 */
const SOURCE_SCAN_FILES = [
  'src/constants/seo.ts',
  'public/.well-known/assetlinks.json',
  'public/.well-known/apple-app-site-association',
];

const errors = [];
const warnings = [];

function logError(page, msg) {
  errors.push(`❌ ${page}: ${msg}`);
}
function logWarn(page, msg) {
  warnings.push(`⚠️  ${page}: ${msg}`);
}

function extractJsonLd(html) {
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const matches = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    matches.push(m[1].trim());
  }
  return matches;
}

function validateEntity(page, entity) {
  const type = entity['@type'];
  if (!type) {
    logError(page, `entity missing @type: ${JSON.stringify(entity).slice(0, 100)}`);
    return;
  }

  // Normalise array of types — Schema.org allows ["Type1", "Type2"]
  const types = Array.isArray(type) ? type : [type];
  for (const t of types) {
    if (!RECOGNISED_TYPES.has(t)) {
      logWarn(page, `unrecognised @type "${t}" — typo or new schema?`);
    }
    const required = REQUIRED_FIELDS_PER_TYPE[t];
    if (required) {
      for (const field of required) {
        if (!(field in entity)) {
          logError(page, `${t} missing required field "${field}"`);
        }
      }
    }
  }

  // Context check (root entities only, not nested)
  if (entity['@context'] !== undefined && entity['@context'] !== 'https://schema.org') {
    logError(page, `@context should be "https://schema.org", got "${entity['@context']}"`);
  }

  // Placeholder-string check
  const s = JSON.stringify(entity);
  for (const marker of PLACEHOLDER_MARKERS) {
    if (s.includes(marker)) {
      logWarn(page, `contains placeholder marker "${marker}" — replace with real value before production`);
    }
  }
}

async function validatePage(path) {
  const url = `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'HireAdda-SEO-Validator/1.0 (+https://hireadda.in)',
        Accept: 'text/html',
      },
    });
    if (!res.ok) {
      logError(path, `HTTP ${res.status} fetching page`);
      return;
    }
    const html = await res.text();
    const blocks = extractJsonLd(html);

    if (blocks.length === 0) {
      logWarn(path, 'no <script type="application/ld+json"> blocks found');
      return;
    }

    console.log(`✓ ${path} — ${blocks.length} JSON-LD block(s)`);

    for (const [i, raw] of blocks.entries()) {
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        logError(path, `block ${i + 1}: invalid JSON — ${e.message}`);
        continue;
      }

      // Handle @graph — iterate entities inside
      if (parsed['@graph']) {
        for (const entity of parsed['@graph']) {
          validateEntity(path, entity);
        }
      } else if (Array.isArray(parsed)) {
        for (const entity of parsed) {
          validateEntity(path, entity);
        }
      } else {
        validateEntity(path, parsed);
      }
    }
  } catch (err) {
    logError(path, `fetch failed: ${err.message}`);
  }
}

/**
 * Pass 2 — source-file placeholder scan.
 *
 * Greps each file in SOURCE_SCAN_FILES for markers that indicate a
 * placeholder still in place. Reports file:line references so devs can
 * jump straight to the value that needs populating.
 *
 * In STRICT_SEO=1 mode these elevate to build-failing errors.
 */
async function scanSources() {
  const placeholderHits = [];
  // Match the marker only when it appears as a string-literal value in a
  // property assignment or JSON field — not inside function bodies,
  // comparisons (`=== 'REPLACE_...'`), or the helper that CHECKS for
  // placeholders. This keeps the scan focused on "values that need to
  // be replaced" rather than "any mention of the marker string".
  const propAssignmentRe = /(?:[:=])\s*['"`](REPLACE_WITH_[A-Z_]+)['"`]/g;

  for (const relFile of SOURCE_SCAN_FILES) {
    const absFile = path.resolve(process.cwd(), relFile);
    let content;
    try {
      content = await readFile(absFile, 'utf8');
    } catch {
      // File missing — not fatal (e.g. assetlinks.json may not exist in dev).
      continue;
    }
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      // Skip commented-out lines (single-line comments + block-comment bodies
      // starting with *). Values inside JSDoc won't trip the check.
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;

      // Skip lines with `===` — these are comparisons in the
      // `isPlaceholder` helper, not assignments that need replacing.
      if (/===\s*['"`]REPLACE_WITH_/.test(line)) return;

      // Re-run the regex with `exec` so we can capture group 1 (the marker).
      let m;
      propAssignmentRe.lastIndex = 0;
      while ((m = propAssignmentRe.exec(line)) !== null) {
        placeholderHits.push({ file: relFile, line: idx + 1, marker: m[1] });
      }
    });
  }
  return placeholderHits;
}

async function main() {
  console.log(`\nValidating structured data against: ${BASE_URL}`);
  console.log(`Strict mode: ${STRICT ? 'ON (placeholders fail build)' : 'OFF (placeholders warn only)'}\n`);

  // Pass 1 — rendered HTML.
  console.log('─── Pass 1: rendered JSON-LD ───────────────────────────');
  for (const p of PAGES_TO_VALIDATE) {
    await validatePage(p);
  }

  // Pass 2 — source-file placeholder scan.
  console.log('\n─── Pass 2: source-file placeholder scan ───────────────');
  const placeholders = await scanSources();
  if (placeholders.length === 0) {
    console.log('✓ no placeholder tokens in SEO source files');
  } else {
    console.log(`Found ${placeholders.length} placeholder token(s):`);
    for (const hit of placeholders) {
      const msg = `  ${hit.file}:${hit.line}  ${hit.marker}`;
      if (STRICT) {
        errors.push(`❌ ${msg}`);
      } else {
        warnings.push(`⚠️  ${msg}`);
      }
      console.log(`  • ${hit.file}:${hit.line}  ${hit.marker}`);
    }
    console.log(
      STRICT
        ? '\n✗ STRICT_SEO=1 — placeholders fail the build. Populate them or unset STRICT_SEO.'
        : '\nℹ  These are warnings. Set STRICT_SEO=1 to block builds until populated.',
    );
  }

  // Summary.
  console.log('\n' + '═'.repeat(72));
  if (warnings.length > 0) {
    console.log('\nWarnings:');
    warnings.forEach((w) => console.log(w));
  }
  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach((e) => console.log(e));
    console.log(`\n${errors.length} error(s), ${warnings.length} warning(s).\n`);
    process.exit(1);
  }
  console.log(
    `\n✅ All validations passed. (${warnings.length} warning${warnings.length === 1 ? '' : 's'})\n`,
  );
}

main();
