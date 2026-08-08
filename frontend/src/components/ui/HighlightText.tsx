'use client';

interface HighlightTextProps {
  text: string;
  highlight?: string;
  className?: string;
}

export default function HighlightText({ text, highlight, className = '' }: HighlightTextProps) {
  if (!highlight || !highlight.trim()) {
    return <span className={className}>{text}</span>;
  }

  const terms = highlight
    .split(/[\s,]+/)
    .filter((t) => t.length > 1)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

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
