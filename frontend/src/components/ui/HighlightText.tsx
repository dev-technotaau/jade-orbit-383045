'use client';

interface HighlightTextProps {
  text: string;
  highlight?: string;
  className?: string;
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

export default function HighlightText({ text, highlight, className = '' }: HighlightTextProps) {
  const terms = highlightTerms(highlight);

  if (terms.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const regex = new RegExp(`(${terms.join('|')})`, 'gi');
  const testRegex = new RegExp(`^(${terms.join('|')})$`, 'i');
  const parts = text.split(regex);

  return (
    <span className={className}>
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
