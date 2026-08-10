/**
 * Sanitizer for WhatsApp template parameters.
 *
 * Meta rejects the ENTIRE send — not just the offending variable — when a
 * template parameter contains a newline, a tab, or four or more consecutive
 * spaces. The failure is a `(#132000)`-family error, so from the operator's side
 * the message simply never arrives.
 *
 * This matters because template variables are built from pasted content:
 * customer names, order references, addresses, anything typed into a campaign's
 * variable mapping or the inbox's send-template form. A name pasted out of a
 * spreadsheet routinely carries a trailing tab; a multi-line address carries
 * newlines. Both look fine in the UI and both kill the send.
 *
 * The host platform had this guard (`oneLine()` in templates/whatsapp/index.ts)
 * and applied it at every call site that built a template message. That file was
 * removed with the job-board message templates, and the live send path never had
 * an equivalent — so this restores the protection at the two places where
 * template components are actually assembled.
 *
 * Deliberately NOT applied to session (free-text) messages: those are ordinary
 * WhatsApp messages where newlines are legitimate and expected.
 */

/**
 * Collapse a value to a single line safe for use as a template parameter.
 *
 * Newlines and tabs become spaces, runs of whitespace collapse to one, and the
 * result is trimmed. Collapsing at 2+ spaces rather than Meta's 4+ threshold is
 * intentional: it is simpler to reason about, and no template renders
 * differently for it.
 *
 * Non-string input is coerced, so a number or `null` reaching here cannot throw.
 */
export function oneLineParam(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Apply {@link oneLineParam} across a positional parameter list. */
export function oneLineParams(values: readonly unknown[]): string[] {
  return values.map(oneLineParam);
}
