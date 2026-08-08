/**
 * SpeakableAnswer — wraps a 40-60-word direct-answer paragraph with the
 * `data-speakable="true"` attribute that voice assistants + AI search
 * engines extract for Speakable / answer-engine results.
 *
 * Used on every public surface so a query like
 *   "What is Hire Adda?" / "How many jobs in Bangalore?"
 * resolves to a hand-tuned single sentence that voice/AI engines can
 * read back verbatim.
 *
 * The component renders as a plain `<p>` so it's part of the
 * accessible reading order. CSS classes hide it from sighted users
 * when needed (`className="sr-only"`); engines always see it because
 * speakable extraction reads the DOM, not the rendered visual.
 */
import { cn } from '@/lib/utils';

interface Props {
  /** 40–60-word answer paragraph. Keep it factual, single-sentence preferred. */
  children: React.ReactNode;
  /** When true, hide visually but keep in the DOM for crawlers / SR. */
  visuallyHidden?: boolean;
  className?: string;
  /** Optional H1/H2 selector — populates the `aria-describedby` link. */
  describes?: string;
  /** ARIA role override — defaults to `region`. */
  role?: 'region' | 'doc-abstract' | 'doc-introduction' | 'note';
}

export default function SpeakableAnswer({
  children,
  visuallyHidden = false,
  className,
  describes,
  role = 'doc-abstract',
}: Props) {
  return (
    <p
      data-speakable="true"
      role={role}
      {...(describes ? { 'aria-describedby': describes } : {})}
      className={cn(
        'text-sm leading-relaxed text-[var(--text-secondary)]',
        visuallyHidden && 'sr-only',
        className,
      )}
    >
      {children}
    </p>
  );
}
