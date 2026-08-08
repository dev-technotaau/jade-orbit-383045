import { cn } from '@/lib/utils';

/**
 * SectionBackdrop — decorative, non-interactive background graphics that add
 * depth to otherwise flat homepage sections. Pure CSS/SVG (no assets), token-
 * driven, and `aria-hidden`. Drop as the first child of a `relative` section.
 *
 *   dots  — faint dot-grid, edge-masked so it fades out
 *   grid  — faint square grid lines, edge-masked
 *   mesh  — soft blurred brand-color blobs (primary / accent / secondary)
 *   glow  — a single centered primary glow at the top of the section
 *
 * Light-mode only (matches the site).
 */

type BackdropVariant = 'dots' | 'grid' | 'mesh' | 'glow';

interface SectionBackdropProps {
  variant?: BackdropVariant;
  /** Extra classes for positioning/opacity tweaks. */
  className?: string;
}

export default function SectionBackdrop({ variant = 'dots', className }: SectionBackdropProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      {variant === 'dots' && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle at center, var(--border) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            opacity: 0.5,
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent 75%)',
          }}
        />
      )}

      {variant === 'grid' && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            opacity: 0.55,
            maskImage: 'radial-gradient(ellipse 85% 65% at 50% 30%, black, transparent 78%)',
            WebkitMaskImage: 'radial-gradient(ellipse 85% 65% at 50% 30%, black, transparent 78%)',
          }}
        />
      )}

      {variant === 'mesh' && (
        <>
          <div className="bg-primary/10 absolute -top-24 -left-24 h-96 w-96 rounded-full blur-3xl" />
          <div className="bg-accent/10 absolute top-1/4 -right-24 h-80 w-80 rounded-full blur-3xl" />
          <div className="bg-secondary/[0.08] absolute -bottom-24 left-1/3 h-72 w-72 rounded-full blur-3xl" />
        </>
      )}

      {variant === 'glow' && (
        <div className="bg-primary/15 absolute -top-16 left-1/2 h-72 w-[42rem] max-w-full -translate-x-1/2 rounded-full blur-3xl" />
      )}
    </div>
  );
}
