'use client';

/**
 * ShareReviewMenu — popover menu shown when hovering / tapping the Share
 * action on a review card.
 *
 * Renders icon links for X, LinkedIn, Facebook, WhatsApp, Email + a
 * Copy-Link button. On mobile, falls back to the Web Share API when
 * available.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Mail, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import BrandIcon, { type BrandIconName } from '@/components/common/BrandIcon';

interface Props {
  url: string;
  title: string;
  excerpt?: string;
  className?: string;
}

export default function ShareReviewMenu({ url, title, excerpt, className }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const text = excerpt ? `${title} — ${excerpt}` : title;
  // Each target carries a brand-icon slug (resolved via BrandIcon) or
  // a `kind: 'email'` discriminator that maps to a lucide Mail glyph —
  // single string-glyph fallbacks ("X", "in", "f", "W") were replaced
  // with real brand SVGs so the menu reads as a proper share strip.
  type ShareTarget =
    | { label: string; href: string; kind: 'brand'; brand: BrandIconName }
    | { label: string; href: string; kind: 'email' };
  const shareTargets: ShareTarget[] = [
    {
      label: 'X / Twitter',
      href: `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      kind: 'brand',
      brand: 'x',
    },
    {
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      kind: 'brand',
      brand: 'linkedin',
    },
    {
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      kind: 'brand',
      brand: 'facebook',
    },
    {
      label: 'WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
      kind: 'brand',
      brand: 'whatsapp',
    },
    {
      label: 'Email',
      href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
      kind: 'email',
    },
  ];

  async function handleClick() {
    // Web Share API on mobile.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (
          navigator as Navigator & {
            share: (data: ShareData) => Promise<void>;
          }
        ).share({
          title,
          text: excerpt,
          url,
        });
        return;
      } catch {
        // user cancelled — fall through to popover
      }
    }
    setOpen((v) => !v);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard may be denied in non-secure contexts
    }
  }

  return (
    <div ref={ref} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
        Share
      </button>
      {open && (
        <div
          className="absolute bottom-full left-0 z-20 mb-2 flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 shadow-lg"
          role="menu"
          onMouseLeave={() => setOpen(false)}
        >
          {shareTargets.map((t) => (
            <a
              key={t.label}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              aria-label={`Share via ${t.label}`}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--primary)] hover:text-white"
            >
              {t.kind === 'brand' ? (
                <BrandIcon name={t.brand} className="h-4 w-4" />
              ) : (
                <Mail className="h-4 w-4" aria-hidden="true" />
              )}
            </a>
          ))}
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy link"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--primary)] hover:text-white"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
