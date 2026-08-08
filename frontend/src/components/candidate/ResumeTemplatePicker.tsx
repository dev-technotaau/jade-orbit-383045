'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Check, Crown, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import Spinner from '@/components/ui/Spinner';
import { candidateService, type ResumeTemplate } from '@/services/candidate.service';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useUpgradeModal } from '@/components/billing/UpgradeModal';

interface Props {
  /** Currently selected template id (lifted state). */
  value: string;
  /** Called with the new template id when the user picks one. */
  onChange: (templateId: string) => void;
}

/**
 * Resume template gallery — shown above the "Generate Resume" button on the
 * candidate profile.
 *
 * Free users see the Classic template selectable, plus 4 locked premium
 * cards with a crown badge that route to `/pricing`. Premium users (the
 * `feature.candidate_ai_resume_premium` flag is true on their entitlement
 * snapshot) can pick any of the five.
 */
export default function ResumeTemplatePicker({ value, onChange }: Props) {
  const { hasFeature } = useEntitlements();
  const upgrade = useUpgradeModal();
  const isPremium = hasFeature('feature.candidate_ai_resume_premium');

  const { data, isLoading } = useQuery({
    queryKey: ['candidate', 'resume-templates'],
    queryFn: () => candidateService.listResumeTemplates(),
    staleTime: 60 * 60 * 1000, // 1h — config rarely changes
  });
  const templates = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg)] py-8">
        <Spinner size="md" />
      </div>
    );
  }

  if (templates.length === 0) return null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-[var(--text)]">Pick a template</h4>
          <p className="text-xs text-[var(--text-muted)]">
            {isPremium
              ? 'All 5 templates unlocked — choose any.'
              : 'The Classic template is free. Unlock 4 premium designs with Candidate Premium.'}
          </p>
        </div>
        {!isPremium && (
          <Link
            href="/pricing#candidate_premium"
            className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
          >
            <Crown className="h-3.5 w-3.5" /> Go Premium
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            selected={template.id === value}
            isPremiumUser={isPremium}
            onSelect={() => onChange(template.id)}
            onLockedClick={() => upgrade.open({ feature: 'feature.candidate_ai_resume_premium' })}
          />
        ))}
      </div>
      {upgrade.modal}
    </div>
  );
}

function TemplateCard({
  template,
  selected,
  isPremiumUser,
  onSelect,
  onLockedClick,
}: {
  template: ResumeTemplate;
  selected: boolean;
  isPremiumUser: boolean;
  onSelect: () => void;
  onLockedClick: () => void;
}) {
  const locked = template.requiresPremium && !isPremiumUser;

  return (
    <button
      type="button"
      onClick={() => {
        if (locked) {
          onLockedClick();
          return;
        }
        onSelect();
      }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border-2 bg-white text-left transition-all duration-200',
        selected
          ? 'border-primary ring-primary/20 shadow-md ring-2'
          : 'border-[var(--border)] hover:border-[var(--text-muted)]',
        locked
          ? 'cursor-pointer hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-md'
          : 'hover:-translate-y-0.5 hover:shadow-md',
      )}
      aria-pressed={selected}
      aria-label={`${template.name}${locked ? ' — Premium template, click to upgrade' : ''}`}
    >
      {/* Thumbnail — schematic preview using the template's accent colour. */}
      <ResumeThumbnail accentColor={template.accentColor} layout={template.id} />

      {/* Lock overlay for premium-only templates */}
      {locked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 backdrop-blur-[1px] transition-colors group-hover:bg-black/65">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg">
            <Lock className="h-4 w-4" />
          </div>
          <span className="mt-1.5 text-[10px] font-semibold tracking-wider text-white uppercase">
            Premium
          </span>
          <span className="mt-0.5 text-[9px] text-white/85 opacity-0 transition-opacity group-hover:opacity-100">
            Click to unlock
          </span>
        </div>
      )}

      {/* Selected badge */}
      {selected && (
        <div className="bg-primary absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full text-white shadow-md">
          <Check className="h-3.5 w-3.5" />
        </div>
      )}

      {/* Footer label */}
      <div className="border-t border-[var(--border)] bg-white p-2.5">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-[var(--text)]">{template.name}</p>
          {template.requiresPremium && <Crown className="h-3 w-3 flex-none text-amber-500" />}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-[var(--text-muted)]">
          {template.description}
        </p>
      </div>
    </button>
  );
}

/**
 * Schematic SVG-ish preview of the layout. We render simple geometric blocks
 * that hint at each template's signature without trying to be a true preview
 * (which would mean rendering the actual handlebars template — overkill for a
 * picker thumbnail).
 */
function ResumeThumbnail({ accentColor, layout }: { accentColor: string; layout: string }) {
  // Each template gets a distinct schematic to make the choice scannable.
  if (layout === 'modern') {
    // Two-column with coloured sidebar
    return (
      <div className="flex h-32 w-full bg-[var(--bg-secondary)]">
        <div className="w-[35%] flex-none p-2" style={{ backgroundColor: accentColor }}>
          <div className="h-2 w-3/4 rounded bg-white/90" />
          <div className="mt-1 h-1 w-1/2 rounded bg-white/60" />
          <div className="mt-3 space-y-1">
            <div className="h-1 w-full rounded bg-white/40" />
            <div className="h-1 w-5/6 rounded bg-white/40" />
            <div className="h-1 w-4/6 rounded bg-white/40" />
          </div>
        </div>
        <div className="flex-1 p-2">
          <div className="h-1.5 w-1/3 rounded" style={{ backgroundColor: accentColor }} />
          <div className="mt-1 space-y-1">
            <div className="h-1 w-full rounded bg-gray-300" />
            <div className="h-1 w-5/6 rounded bg-gray-300" />
          </div>
          <div className="mt-2 h-1.5 w-1/3 rounded" style={{ backgroundColor: accentColor }} />
          <div className="mt-1 space-y-1">
            <div className="h-1 w-full rounded bg-gray-300" />
            <div className="h-1 w-3/4 rounded bg-gray-300" />
          </div>
        </div>
      </div>
    );
  }

  if (layout === 'executive') {
    // Centered serif-style with double-rule headers
    return (
      <div className="flex h-32 w-full flex-col items-center bg-[var(--bg-secondary)] p-3">
        <div className="h-2 w-1/2 rounded bg-gray-700" />
        <div className="mt-1 h-1 w-1/3 rounded bg-gray-400" />
        <div className="mt-2 h-px w-full" style={{ backgroundColor: accentColor, height: '2px' }} />
        <div
          className="mt-3 h-1.5 w-1/3 rounded text-center"
          style={{ backgroundColor: accentColor }}
        />
        <div className="mt-1.5 w-full space-y-1">
          <div className="h-1 w-full rounded bg-gray-300" />
          <div className="h-1 w-4/5 rounded bg-gray-300" />
          <div className="h-1 w-5/6 rounded bg-gray-300" />
        </div>
        <div className="mt-2 h-1.5 w-1/3 rounded" style={{ backgroundColor: accentColor }} />
      </div>
    );
  }

  if (layout === 'minimal') {
    // Lots of whitespace, thin lines
    return (
      <div className="flex h-32 w-full flex-col bg-white p-3">
        <div className="h-2.5 w-1/2 rounded bg-gray-800" />
        <div className="mt-1 h-1 w-1/3 rounded bg-gray-300" />
        <div className="mt-5 grid grid-cols-[18px_1fr] gap-2">
          <div className="h-1 w-full rounded bg-gray-200" />
          <div className="space-y-1">
            <div className="h-1 w-3/4 rounded bg-gray-400" />
            <div className="h-1 w-1/2 rounded bg-gray-300" />
          </div>
          <div className="h-1 w-full rounded bg-gray-200" />
          <div className="space-y-1">
            <div className="h-1 w-2/3 rounded bg-gray-400" />
            <div className="h-1 w-1/2 rounded bg-gray-300" />
          </div>
        </div>
      </div>
    );
  }

  if (layout === 'tech') {
    // Mono-font feel, project chips
    return (
      <div className="h-32 w-full bg-[var(--bg-secondary)] p-2.5">
        <div className="border-l-[3px] pl-2" style={{ borderColor: accentColor }}>
          <div className="h-2 w-3/4 rounded bg-gray-800" />
          <div
            className="mt-1 h-1 w-1/2 rounded"
            style={{ backgroundColor: accentColor, opacity: 0.7 }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-2 rounded-sm"
              style={{
                width: `${10 + (i % 3) * 5}px`,
                backgroundColor: `${accentColor}33`,
                border: `1px solid ${accentColor}66`,
              }}
            />
          ))}
        </div>
        <div
          className="mt-2 rounded-sm border-l-[3px] py-1 pr-1 pl-1.5"
          style={{ borderColor: `${accentColor}66`, backgroundColor: '#fafafa' }}
        >
          <div className="h-1.5 w-2/3 rounded bg-gray-700" />
          <div className="mt-1 flex gap-1">
            <div className="h-1.5 w-6 rounded-sm" style={{ backgroundColor: `${accentColor}33` }} />
            <div className="h-1.5 w-8 rounded-sm" style={{ backgroundColor: `${accentColor}33` }} />
          </div>
        </div>
      </div>
    );
  }

  // Default = classic — single-column with accented title bar
  return (
    <div className="flex h-32 w-full flex-col bg-white p-2.5">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="h-2 w-20 rounded bg-gray-800" />
          <div className="mt-0.5 h-1 w-12 rounded bg-gray-400" />
        </div>
        <div className="space-y-0.5 text-right">
          <div className="ml-auto h-1 w-12 rounded bg-gray-300" />
          <div className="ml-auto h-1 w-10 rounded bg-gray-300" />
        </div>
      </div>
      <div className="mt-1.5 h-px w-full" style={{ backgroundColor: accentColor, height: '2px' }} />
      <div className="mt-2 space-y-2">
        <div>
          <div className="h-1.5 w-1/4 rounded" style={{ backgroundColor: accentColor }} />
          <div className="mt-1 h-1 w-full rounded bg-gray-300" />
          <div className="mt-0.5 h-1 w-5/6 rounded bg-gray-300" />
        </div>
        <div>
          <div className="h-1.5 w-1/4 rounded" style={{ backgroundColor: accentColor }} />
          <div className="mt-1 h-1 w-full rounded bg-gray-300" />
        </div>
      </div>
    </div>
  );
}
