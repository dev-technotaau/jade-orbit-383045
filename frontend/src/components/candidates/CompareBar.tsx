'use client';

import { X, GitCompareArrows } from 'lucide-react';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import type { CandidateProfile } from '@/types/candidate';

interface CompareBarProps {
  candidates: CandidateProfile[];
  onRemove: (candidateId: string) => void;
  onClear: () => void;
  onCompare: () => void;
}

export default function CompareBar({ candidates, onRemove, onClear, onCompare }: CompareBarProps) {
  if (candidates.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-white/95 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <GitCompareArrows className="text-primary h-4 w-4 shrink-0" />
        <span className="shrink-0 text-xs font-medium text-[var(--text-secondary)]">
          Compare ({candidates.length}/3)
        </span>

        <div className="flex flex-1 items-center gap-2 overflow-x-auto">
          {candidates.map((candidate) => {
            const name = candidate.user
              ? `${candidate.user.firstName || ''} ${candidate.user.lastName || ''}`.trim()
              : 'Anonymous';
            return (
              <span
                key={candidate.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-xs whitespace-nowrap text-[var(--text)]"
              >
                {name}
                <Tooltip content={`Remove ${name}`}>
                  <button
                    type="button"
                    onClick={() => onRemove(candidate.id)}
                    className="cursor-pointer rounded-full p-0.5 transition-colors hover:bg-[var(--bg-tertiary)]"
                    aria-label={`Remove ${name} from comparison`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Tooltip>
              </span>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-xs"
            tooltip="Clear all selected candidates"
          >
            Clear
          </Button>
          <Button
            size="sm"
            onClick={onCompare}
            disabled={candidates.length < 2}
            className="text-xs"
            tooltip="Compare selected candidates side by side"
          >
            Compare
          </Button>
        </div>
      </div>
    </div>
  );
}
