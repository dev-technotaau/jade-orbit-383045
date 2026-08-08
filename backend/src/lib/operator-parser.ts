/**
 * Operator parser — translates the URL/keyword-bar operator grammar
 * (+, -, "...", |, !) into structured `{ must, should, mustNot, phrases }`
 * clauses ready for ES bool-query construction.
 *
 * This module is intentionally stand-alone (no Prisma, no ES, no Express
 * deps) so the same code can run in tests + the BullMQ workers + the
 * frontend mirror.
 *
 * Grammar
 * ───────
 *
 *   Multi-value filters (URL):
 *     skills=react,node           → AND ['react', 'node']     (default)
 *     skills=react|node           → OR  ['react', 'node']
 *     skills=react,!php           → AND ['react'] · NOT ['php']
 *     skills=react|node,!senior   → OR  ['react','node'] · NOT ['senior']
 *
 *   Keyword bar (Google-style):
 *     +react        → must include  "react"
 *     -php          → must exclude  "php"
 *     "remote work" → match the exact phrase (ES `match_phrase`)
 *     OR (capitalised) between tokens → OR-group (less common)
 *     plain word    → SHOULD (helpful but not required)
 *
 * Example
 * ───────
 *
 *     parseMultiValue('react|node,!php')
 *     // → { must: [], should: ['react','node'], mustNot: ['php'], op: 'OR' }
 *
 *     parseKeywordExpression('+react -php "full stack" javascript')
 *     // → {
 *     //     must:    ['react'],
 *     //     mustNot: ['php'],
 *     //     phrases: ['full stack'],
 *     //     should:  ['javascript'],
 *     //   }
 *
 * Backwards compatibility
 * ───────────────────────
 *
 * A bare comma-separated list ("react,node,vue") parses to an AND group
 * — identical to the legacy interpretation. Existing callers can swap
 * to this parser without changing URL semantics.
 */

export interface MultiValueClauses {
  must: string[]; // tokens that MUST match (AND-group)
  should: string[]; // tokens that SHOULD match at least one (OR-group)
  mustNot: string[]; // tokens that MUST NOT match (NOT-group)
  /** The dominant operator detected in the input — preserved for UI hints. */
  op: 'AND' | 'OR';
}

export interface KeywordClauses {
  must: string[]; // +token
  should: string[]; // bare tokens (helpful but not required)
  mustNot: string[]; // -token
  phrases: string[]; // "quoted phrases" — ES match_phrase
}

/**
 * Parse a multi-value filter string with `,` (AND), `|` (OR), `!` (NOT)
 * operators. NOT can apply to individual tokens within either AND or OR.
 *
 * Empty strings yield empty clauses. Bracket/escape support is not in
 * scope — the URL grammar stays flat to keep canonicalisation cheap.
 */
export function parseMultiValue(input: string | null | undefined): MultiValueClauses {
  if (!input) return { must: [], should: [], mustNot: [], op: 'AND' };

  // Decide overall operator: if a top-level `|` appears, the input is
  // OR; otherwise AND. NOT-tokens (prefixed `!`) split off regardless.
  const hasOr = input.includes('|');
  const op: 'AND' | 'OR' = hasOr ? 'OR' : 'AND';

  // Tokens are separated by either `,` or `|` — both yield the same
  // flat list, the operator is conveyed by `op` above.
  const tokens = input
    .split(/[,|]/)
    .map((t) => t.trim())
    .filter(Boolean);

  const must: string[] = [];
  const should: string[] = [];
  const mustNot: string[] = [];

  for (const tok of tokens) {
    if (tok.startsWith('!')) {
      const stripped = tok.slice(1).trim();
      if (stripped) mustNot.push(stripped);
      continue;
    }
    if (op === 'OR') should.push(tok);
    else must.push(tok);
  }

  return { must, should, mustNot, op };
}

/**
 * Inverse of `parseMultiValue` — re-emits a URL-canonical string from
 * the structured clauses. Used by the URL serialiser to keep filter
 * URLs deterministic across reloads.
 */
export function serialiseMultiValue(c: MultiValueClauses): string {
  const sep = c.op === 'OR' ? '|' : ',';
  const positives = c.op === 'OR' ? c.should : c.must;
  const negatives = c.mustNot.map((t) => `!${t}`);
  return [...positives, ...negatives].join(sep);
}

/**
 * Parse a keyword bar expression with Google-style operators.
 *
 * Example: `+react -php "full stack" javascript` →
 *   must: ['react'], mustNot: ['php'], phrases: ['full stack'], should: ['javascript']
 */
export function parseKeywordExpression(input: string | null | undefined): KeywordClauses {
  if (!input) return { must: [], should: [], mustNot: [], phrases: [] };

  const must: string[] = [];
  const should: string[] = [];
  const mustNot: string[] = [];
  const phrases: string[] = [];

  // Split on whitespace BUT keep quoted phrases together. Regex:
  //   (?:"([^"]+)") matches quoted phrase; (\S+) catches a bare token.
  const TOKEN_RE = /(?:"([^"]+)"|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(input)) !== null) {
    const phrase = m[1];
    const token = m[2];
    if (phrase) {
      phrases.push(phrase.trim());
      continue;
    }
    if (!token) continue;
    if (token.startsWith('+') && token.length > 1) {
      must.push(token.slice(1));
    } else if (token.startsWith('-') && token.length > 1) {
      mustNot.push(token.slice(1));
    } else if (token === 'OR') {
      // OR keyword between tokens — ignored at this layer; the caller
      // can promote `should` clauses to OR semantics if needed.
    } else {
      should.push(token);
    }
  }

  return { must, should, mustNot, phrases };
}

/**
 * Quick predicate — is the URL value using any of the new operators?
 * Useful for backwards-compat shims that only opt into the new parser
 * when an operator character is present.
 */
export function hasOperatorChars(input: string | null | undefined): boolean {
  if (!input) return false;
  return /[|!]/.test(input) || /(^|\s)[+-]\S/.test(input) || /"/.test(input);
}
