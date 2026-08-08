'use client';

/**
 * Help popover explaining the keyword-bar operator syntax. Triggered
 * by a `?` icon next to the keyword bar. Mirrors the Google-style
 * search-operator UX users already know.
 *
 *   +react       → must include "react"
 *   -php         → must NOT include "php"
 *   "remote work" → exact phrase match
 *   react OR vue → match either
 *   skill:react  → field-specific (advanced)
 */

import { useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { useClickOutside } from '@/hooks/use-click-outside';

const EXAMPLES: Array<{ syntax: string; description: string }> = [
  { syntax: '+react', description: 'must include "react"' },
  { syntax: '-php', description: 'must NOT include "php"' },
  { syntax: '"remote work"', description: 'exact phrase match' },
  { syntax: 'react OR vue', description: 'match either term' },
  { syntax: 'skill:react', description: 'restrict to a specific field' },
];

interface Props {
  /**
   * Hide the help icon entirely (returns null). Used by callers that
   * render this popover absolutely-positioned on top of the SearchBar
   * input — when the user has typed text, SearchBar shows its own
   * clear (×) button in the same slot, and both icons overlap.
   * Toggling `hidden` based on the keyword field's empty state makes
   * the help icon yield to the clear button without changing layout.
   */
  hidden?: boolean;
}

export default function KeywordSyntaxHelp({ hidden = false }: Props = {}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setOpen(false), open);

  if (hidden) return null;

  return (
    <div ref={menuRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Search syntax help"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Search syntax help"
          className="animate-scale-in absolute top-full right-0 z-50 mt-2 w-80 rounded-xl border border-[var(--border)] bg-white p-4 shadow-lg"
        >
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[var(--text)]">Search syntax</h4>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="space-y-2">
            {EXAMPLES.map((ex) => (
              <li key={ex.syntax} className="flex items-start gap-2">
                <code className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 font-mono text-xs text-[var(--text)]">
                  {ex.syntax}
                </code>
                <span className="text-xs text-[var(--text-muted)]">{ex.description}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-[var(--text-muted)]">
            You can also use the AND/OR toggle inside each filter group for multi-select fields.
          </p>
        </div>
      )}
    </div>
  );
}
