/**
 * `{{name}}`-style tokens in free text an operator writes.
 *
 * Canned replies and keyword auto-replies both send their body VERBATIM, so a
 * saved reply reading "Hi {{name}}, your order is on the way" arrived with the
 * braces intact — the operator's own personalisation shown to the customer as
 * markup. There was no free-text token engine to reuse: `interpolate` in the
 * bot-flow service substitutes flow slots, and `resolveTemplateVars` resolves
 * approved-template PARAMETERS by position. Neither answers "expand this
 * sentence for this contact".
 *
 * Deliberately shared by both callers rather than solved in the composer. Doing
 * it in the composer would expand a canned reply only when a human picked it,
 * and leave the identical text in a keyword rule unexpanded — the same token
 * behaving two different ways depending on who sent it.
 */

/** The fields a token can read. Everything else lives under `attr.`. */
export interface TokenContact {
  name?: string | null;
  profileName?: string | null;
  phone?: string | null;
  attributes?: unknown;
}

const TOKEN_RE = /\{\{\s*([A-Za-z0-9._-]{1,60})\s*\}\}/g;

/**
 * Expand `{{name}}`, `{{phone}}` and `{{attr.<key>}}`.
 *
 * An UNKNOWN token is left exactly as it was written, not blanked. A blank would
 * silently ship "Hi , your order is on the way" to a customer; the braces at
 * least tell the operator their token was wrong, and a mis-typed key is far more
 * likely than a deliberate empty one.
 *
 * `{{name}}` falls back through the operator's name, then the customer's own
 * WhatsApp profile name, then their number — the same precedence the inbox uses
 * everywhere else, so a personalised greeting never renders emptier than the
 * conversation header does.
 */
export function resolveContactTokens(text: string, contact: TokenContact | null): string {
  if (!text || !text.includes('{{')) return text;
  const attrs = (contact?.attributes ?? {}) as Record<string, unknown>;
  return text.replace(TOKEN_RE, (whole, rawKey: string) => {
    const key = rawKey.trim();
    if (key.toLowerCase().startsWith('attr.')) {
      const v = attrs?.[key.slice(5)];
      return typeof v === 'string' || typeof v === 'number' ? String(v) : whole;
    }
    switch (key.toLowerCase()) {
      case 'name':
        return (
          contact?.name?.trim() || contact?.profileName?.trim() || contact?.phone?.trim() || whole
        );
      case 'phone':
        return contact?.phone?.trim() || whole;
      default:
        return whole;
    }
  });
}

/** Whether this text carries anything worth resolving — cheap pre-check. */
export function hasContactTokens(text: string | null | undefined): boolean {
  return !!text && text.includes('{{');
}
