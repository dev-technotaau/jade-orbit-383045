'use client';

/**
 * SocialLinksBento — bento-grid display of social / portfolio profile
 * links. Reusable for both candidate profiles (10 platforms via
 * dedicated columns: linkedinProfile, githubProfile, twitterProfile,
 * portfolioUrl, …) and employer profiles (single `socialLinks` JSON
 * field with linkedin / twitter / facebook / instagram / youtube /
 * glassdoor keys).
 *
 * The grid is an asymmetric bento (2 wide rows × 4 cols on lg, with
 * the primary platform spanning 2 cells). Each tile is colour-keyed
 * to the platform's brand. Tiles auto-hide when the URL is empty,
 * so the grid collapses gracefully on profiles with few links.
 *
 * Visual pattern:
 *   col-span-2 hero tile · two col-span-1 tiles · two col-span-1 tiles
 *   then a row of 4 col-span-1 tiles → varied, magazine-like layout.
 */

import { Globe, ExternalLink } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';
import {
  candidateSocialLinks as candidateSocialLinksHelper,
  companySocialLinks as companySocialLinksHelper,
  type SocialLink as SocialLinkType,
} from './social-links-helpers';

// Re-export for back-compat. New server-component code should import
// these directly from `./social-links-helpers` — re-exporting from
// this client module would still raise the Next.js 16
// "client function from server" error at SSR time.
export type SocialLink = SocialLinkType;
export const candidateSocialLinks = candidateSocialLinksHelper;
export const companySocialLinks = companySocialLinksHelper;

// `candidateSocialLinks` + `companySocialLinks` now live in
// `./social-links-helpers.ts` (server-safe). They are re-exported
// from this file at the top of the module for back-compat.

interface Props {
  links: SocialLink[];
  /** Optional heading rendered above the grid. */
  heading?: string;
  className?: string;
}

export default function SocialLinksBento({ links, heading, className }: Props) {
  if (!links || links.length === 0) return null;

  return (
    <section
      aria-label={heading ?? 'Social links'}
      className={`rounded-2xl border border-[var(--border)] bg-white p-5 ${className ?? ''}`}
    >
      {heading && (
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--text)]">
          <Globe className="text-primary h-4 w-4" />
          {heading}
        </h3>
      )}
      <ul
        role="list"
        className="grid auto-rows-[80px] grid-cols-2 gap-3 sm:grid-cols-4 lg:auto-rows-[88px]"
      >
        {links.map((link) => {
          const Icon = link.icon;
          // Bento sizing — `large` spans 2 cols on lg+, `small` is 1 col.
          // On mobile every tile is 1 col so the grid stays usable.
          const span = link.prominence === 'large' ? 'sm:col-span-2' : 'sm:col-span-1';
          return (
            <li key={link.key} role="listitem" className={`min-w-0 ${span}`}>
              <Tooltip content={`Visit ${link.label}`}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${link.label} profile in a new tab`}
                  className="group flex h-full w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                  style={{
                    // Brand-coloured left border on hover for subtle accent.
                    borderLeftColor: link.brand,
                    borderLeftWidth: '3px',
                  }}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${link.brand}15`, color: link.brand }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--text)]">
                      {link.label}
                    </p>
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      {(() => {
                        try {
                          return new URL(link.url).hostname.replace(/^www\./, '');
                        } catch {
                          return link.url;
                        }
                      })()}
                    </p>
                  </div>
                  <ExternalLink className="h-3 w-3 shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-[var(--text)]" />
                </a>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
