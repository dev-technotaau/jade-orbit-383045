/**
 * Operator parser — frontend mirror of `backend/src/lib/operator-parser.ts`.
 *
 * Keeps the parser logic identical on both sides so URL filter strings
 * round-trip cleanly. See the backend file for the grammar reference.
 */

export interface MultiValueClauses {
  must: string[];
  should: string[];
  mustNot: string[];
  op: 'AND' | 'OR';
}

export interface KeywordClauses {
  must: string[];
  should: string[];
  mustNot: string[];
  phrases: string[];
}

export function parseMultiValue(input: string | null | undefined): MultiValueClauses {
  if (!input) return { must: [], should: [], mustNot: [], op: 'AND' };

  const hasOr = input.includes('|');
  const op: 'AND' | 'OR' = hasOr ? 'OR' : 'AND';

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

export function serialiseMultiValue(c: MultiValueClauses): string {
  const sep = c.op === 'OR' ? '|' : ',';
  const positives = c.op === 'OR' ? c.should : c.must;
  const negatives = c.mustNot.map((t) => `!${t}`);
  return [...positives, ...negatives].join(sep);
}

export function parseKeywordExpression(input: string | null | undefined): KeywordClauses {
  if (!input) return { must: [], should: [], mustNot: [], phrases: [] };

  const must: string[] = [];
  const should: string[] = [];
  const mustNot: string[] = [];
  const phrases: string[] = [];

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
      // OR keyword — handled by callers that want explicit OR groups.
    } else {
      should.push(token);
    }
  }

  return { must, should, mustNot, phrases };
}

export function hasOperatorChars(input: string | null | undefined): boolean {
  if (!input) return false;
  return /[|!]/.test(input) || /(^|\s)[+-]\S/.test(input) || /"/.test(input);
}
