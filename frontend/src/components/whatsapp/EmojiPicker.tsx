'use client';

import { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  EMOJI_CATEGORIES,
  emojiLabel,
  loadEmojiRecents,
  pushEmojiRecent,
  searchEmoji,
} from '@/lib/wa-emoji';

/**
 * The composer's emoji panel: categories, keyword search, and a per-device
 * recents row.
 *
 * Replaces sixteen hard-coded literals in a 44px-wide grid. Anything outside
 * that set meant leaving the app, and the two most common picks — 🙏 and 👍 —
 * still had to be hunted for on every use because nothing was remembered.
 *
 * Presentational only: opening, closing, outside-click and Escape stay with the
 * caller, which already owns them for the popover this renders inside.
 */
export default function EmojiPicker({
  onPick,
  className,
}: {
  /** Called with the character. The caller decides whether to close. */
  onPick: (char: string) => void;
  className?: string;
}) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState(EMOJI_CATEGORIES[0].id);
  /**
   * Read once, on mount, then advanced locally by `pushEmojiRecent`'s return.
   *
   * Reading `localStorage` during render would make the component impure — and
   * re-reading it after every pick would be a synchronous storage hit on each
   * click for a value we already hold.
   */
  const [recents, setRecents] = useState<string[]>(() => loadEmojiRecents());
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchEmoji(q), [q]);
  const searching = q.trim().length > 0;
  const active = EMOJI_CATEGORIES.find((c) => c.id === tab) ?? EMOJI_CATEGORIES[0];

  const pick = (char: string) => {
    setRecents(pushEmojiRecent(char));
    onPick(char);
  };

  const grid = (chars: readonly string[], label: string) => (
    <div className="grid grid-cols-8 gap-0.5" role="group" aria-label={label}>
      {chars.map((char) => (
        <button
          key={char}
          type="button"
          role="menuitem"
          aria-label={`Insert ${emojiLabel(char)}`}
          title={emojiLabel(char)}
          // Keeps focus in the search box, so a picked emoji does not cost the
          // operator their place when they want a second one.
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => pick(char)}
          className="rounded p-1 text-lg leading-none hover:bg-[var(--bg-secondary)]"
        >
          {char}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className={cn(
        'absolute bottom-12 left-0 z-20 w-72 rounded-lg border border-[var(--border)] bg-white shadow-lg',
        className,
      )}
      role="menu"
      aria-label="Emoji"
    >
      <div className="border-b border-[var(--border)] p-2">
        <input
          ref={searchRef}
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          placeholder="Search emoji…"
          aria-label="Search emoji"
          className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)]"
        />
      </div>

      {!searching && recents.length > 0 && (
        <div className="border-b border-[var(--border)] px-2 py-1.5">
          <p className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
            Recent
          </p>
          {grid(recents, 'Recently used')}
        </div>
      )}

      <div className="max-h-52 overflow-y-auto p-2">
        {searching ? (
          results.length > 0 ? (
            grid(
              results.map((r) => r.char),
              `Results for ${q.trim()}`,
            )
          ) : (
            <p className="py-4 text-center text-xs text-[var(--text-muted)]">
              Nothing matches “{q.trim()}”.
            </p>
          )
        ) : (
          grid(
            active.emojis.map((r) => r.char),
            active.label,
          )
        )}
      </div>

      {!searching && (
        <div
          className="flex border-t border-[var(--border)]"
          role="tablist"
          aria-label="Emoji categories"
        >
          {EMOJI_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === tab}
              aria-label={c.label}
              title={c.label}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => setTab(c.id)}
              className={cn(
                'flex-1 py-1.5 text-base leading-none transition-colors',
                c.id === tab
                  ? 'bg-[var(--bg-secondary)] text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]',
              )}
            >
              {c.emojis[0].char}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
