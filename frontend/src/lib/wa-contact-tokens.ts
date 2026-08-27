/**
 * `{{name}}`-style tokens in free text an operator writes.
 *
 * Mirrors `backend/src/utils/wa-contact-tokens.ts` exactly, because the same
 * saved reply can be sent two ways: picked by a human from the canned-reply
 * popover (expanded here, at insert time, so the operator can still edit the
 * result before sending) or fired by a keyword rule (expanded server-side).
 * A token that behaved differently depending on which door it came through
 * would be worse than one that did not work at all.
 *
 * Kept as a small duplicate rather than shared through a package: the two
 * halves of this repo have no common module, and a wrong-looking greeting is a
 * cheaper failure than a build-graph change.
 */

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
 * An unknown token is left exactly as written, never blanked: a blank silently
 * ships "Hi , your order is on the way", whereas the braces tell the operator
 * their token was wrong while the text is still in the composer and editable.
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
