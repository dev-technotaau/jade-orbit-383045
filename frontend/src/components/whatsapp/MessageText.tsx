'use client';

import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { highlightTerms } from '@/components/ui/HighlightText';

/**
 * Renders WhatsApp text formatting the way the WhatsApp apps do, so our inbox
 * bubbles match what the customer sees (markers hidden, text styled):
 *   *bold*  _italic_  ~strikethrough~  ```monospace```  `inline code`
 *   > quote   - / * bullet list   1. numbered list   + clickable links
 */

interface Fmt {
  marker: string;
  raw?: boolean; // monospace / inline-code: don't parse nested markers inside
  render: (children: ReactNode, key: string) => ReactNode;
}

const CODE_CLASS = 'rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em]';

const FORMATS: Fmt[] = [
  {
    marker: '```',
    raw: true,
    render: (c, k) => (
      <code key={k} className={CODE_CLASS}>
        {c}
      </code>
    ),
  },
  {
    marker: '`',
    raw: true,
    render: (c, k) => (
      <code key={k} className={CODE_CLASS}>
        {c}
      </code>
    ),
  },
  {
    marker: '*',
    render: (c, k) => (
      <strong key={k} className="font-semibold">
        {c}
      </strong>
    ),
  },
  {
    marker: '_',
    render: (c, k) => (
      <em key={k} className="italic">
        {c}
      </em>
    ),
  },
  {
    marker: '~',
    render: (c, k) => (
      <span key={k} className="line-through">
        {c}
      </span>
    ),
  },
];

const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);

/** Earliest valid marker pair: opener must be followed, and closer preceded, by
 *  a non-space char (mirrors WhatsApp's "no padding spaces" rule). */
function findPair(text: string, marker: string): { open: number; close: number } | null {
  const len = marker.length;
  let open = text.indexOf(marker);
  while (open !== -1) {
    if (!isSpace(text[open + len])) {
      let close = text.indexOf(marker, open + len);
      while (close !== -1) {
        if (close > open + len && !isSpace(text[close - 1])) return { open, close };
        close = text.indexOf(marker, close + len);
      }
    }
    open = text.indexOf(marker, open + len);
  }
  return null;
}

/**
 * Wrap every occurrence of a search term in a plain run of text.
 *
 * Applied at the leaves rather than over the whole body because the body is not
 * a string by the time it renders — bold/italic/code/link markers have already
 * become elements, and a match that straddles one of them is not a match the
 * reader would recognise anyway.
 */
function markText(text: string, terms: string[], key: string): ReactNode[] {
  if (!text) return [];
  if (terms.length === 0) return [text];
  const splitter = new RegExp(`(${terms.join('|')})`, 'gi');
  const isTerm = new RegExp(`^(${terms.join('|')})$`, 'i');
  return text.split(splitter).map((part, i) =>
    isTerm.test(part) ? (
      <mark key={`${key}-m${i}`} className="rounded-sm bg-yellow-300/70 px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function linkify(text: string, key: string, terms: string[]): ReactNode[] {
  if (!text) return [];
  const out: ReactNode[] = [];
  const re = /https?:\/\/[^\s]+/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    if (m.index > last) out.push(...markText(text.slice(last, m.index), terms, `${key}-t${i}`));
    const url = m[0];
    out.push(
      <a
        key={`${key}-u${i}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all underline underline-offset-2 hover:opacity-80"
      >
        {url}
      </a>,
    );
    last = m.index + url.length;
    i += 1;
    m = re.exec(text);
  }
  if (last < text.length) out.push(...markText(text.slice(last), terms, `${key}-t${i}`));
  return out;
}

function parseInline(text: string, key: string, terms: string[]): ReactNode[] {
  if (!text) return [];
  let best: { open: number; close: number; fmt: Fmt } | null = null;
  for (const fmt of FORMATS) {
    const pair = findPair(text, fmt.marker);
    if (pair && (best === null || pair.open < best.open)) best = { ...pair, fmt };
  }
  if (!best) return linkify(text, key, terms);
  const { open, close, fmt } = best;
  const len = fmt.marker.length;
  const before = text.slice(0, open);
  const inner = text.slice(open + len, close);
  const after = text.slice(close + len);
  const innerNodes = fmt.raw
    ? markText(inner, terms, `${key}r`)
    : parseInline(inner, `${key}i`, terms);
  return [
    ...linkify(before, `${key}b`, terms),
    fmt.render(<Fragment key={`${key}f`}>{innerNodes}</Fragment>, `${key}f`),
    ...parseInline(after, `${key}a`, terms),
  ];
}

const QUOTE_RE = /^>\s?(.*)$/;
const BULLET_RE = /^[*-]\s+(.+)$/;
const NUMBER_RE = /^(\d+)\.\s+(.+)$/;

export default function MessageText({
  text,
  className,
  /**
   * Search query whose terms are marked inside the body. Set when the thread was
   * opened from a message search: the operator was told this conversation
   * contains "invoice 4471" and then had to find the words themselves.
   */
  highlight,
}: {
  text: string;
  className?: string;
  highlight?: string;
}) {
  const terms = highlightTerms(highlight);
  const lines = text.split('\n');
  return (
    // `dir="auto"` because this renders text the CUSTOMER wrote.
    //
    // Arabic, Hebrew, Urdu and Farsi render left-to-right in a container that
    // declares nothing, which puts the punctuation on the wrong end and reverses
    // the reading order of mixed content — a phone number quoted inside an
    // Arabic sentence comes out backwards. `auto` resolves from the first strong
    // character, which is the only correct answer for content whose language we
    // cannot know. On the container, not the leaves, so a multi-line message
    // reads as one block rather than each line choosing its own direction.
    <div dir="auto" className={cn('break-words whitespace-pre-wrap', className)}>
      {lines.map((line, idx) => {
        const key = `l${idx}`;
        const nl = idx > 0 ? '\n' : '';
        const quote = QUOTE_RE.exec(line);
        if (quote) {
          return (
            <Fragment key={key}>
              {nl}
              <span className="inline border-l-2 border-current pl-2 opacity-75">
                {parseInline(quote[1], key, terms)}
              </span>
            </Fragment>
          );
        }
        const bullet = BULLET_RE.exec(line);
        if (bullet) {
          return (
            <Fragment key={key}>
              {nl}
              {'• '}
              {parseInline(bullet[1], key, terms)}
            </Fragment>
          );
        }
        const numbered = NUMBER_RE.exec(line);
        if (numbered) {
          return (
            <Fragment key={key}>
              {nl}
              {`${numbered[1]}. `}
              {parseInline(numbered[2], key, terms)}
            </Fragment>
          );
        }
        return (
          <Fragment key={key}>
            {nl}
            {parseInline(line, key, terms)}
          </Fragment>
        );
      })}
    </div>
  );
}
