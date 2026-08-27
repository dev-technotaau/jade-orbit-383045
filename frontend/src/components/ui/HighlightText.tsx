'use client';

interface HighlightTextProps {
  text: string;
  highlight?: string;
  className?: string;
  /**
   * Text direction. Pass `'auto'` for anything a CUSTOMER wrote.
   *
   * Arabic, Hebrew, Urdu and Farsi render left-to-right in a container that
   * declares nothing, which puts the punctuation on the wrong end and reverses
   * the reading order of mixed content — a phone number quoted inside an Arabic
   * sentence comes out backwards. `auto` resolves from the first strong
   * character in the string, which is the right answer for user content whose
   * language we cannot know.
   */
  dir?: 'auto' | 'ltr' | 'rtl';
}

/**
 * The searchable terms of a query, escaped for use inside a RegExp.
 *
 * Exported because the inbox thread renders message bodies through MessageText,
 * which parses WhatsApp formatting into nested nodes and so cannot be handed a
 * plain string — it marks the matched words itself, and must mark exactly the
 * same ones this component would.
 */
export function highlightTerms(highlight: string | undefined): string[] {
  if (!highlight || !highlight.trim()) return [];
  return highlight
    .split(/[\s,]+/)
    .filter((t) => t.length > 1)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

export default function HighlightText({
  text,
  highlight,
  className = '',
  dir,
}: HighlightTextProps) {
  const terms = highlightTerms(highlight);

  if (terms.length === 0) {
    return (
      <span className={className} dir={dir}>
        {text}
      </span>
    );
  }

  const regex = new RegExp(`(${terms.join('|')})`, 'gi');
  const testRegex = new RegExp(`^(${terms.join('|')})$`, 'i');
  const parts = text.split(regex);

  return (
    <span className={className} dir={dir}>
      {parts.map((part, i) =>
        testRegex.test(part) ? (
          <mark key={i} className="rounded-sm bg-yellow-200/80 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}
