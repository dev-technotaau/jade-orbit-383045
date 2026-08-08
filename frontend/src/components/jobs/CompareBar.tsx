'use client';

import { X, GitCompareArrows } from 'lucide-react';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import type { Job } from '@/types/job';

interface CompareBarProps {
  jobs: Job[];
  onRemove: (jobId: string) => void;
  onClear: () => void;
  onCompare: () => void;
}

export default function CompareBar({ jobs, onRemove, onClear, onCompare }: CompareBarProps) {
  if (jobs.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-white/95 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <GitCompareArrows className="text-primary h-4 w-4 shrink-0" />
        <span className="shrink-0 text-xs font-medium text-[var(--text-secondary)]">
          Compare ({jobs.length}/3)
        </span>

        <div className="flex flex-1 items-center gap-2 overflow-x-auto">
          {jobs.map((job) => (
            <span
              key={job.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-xs whitespace-nowrap text-[var(--text)]"
            >
              {job.title}
              <Tooltip content={`Remove ${job.title}`}>
                <button
                  type="button"
                  onClick={() => onRemove(job.id)}
                  className="cursor-pointer rounded-full p-0.5 transition-colors hover:bg-[var(--bg-tertiary)]"
                  aria-label={`Remove ${job.title} from comparison`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Tooltip>
            </span>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-xs"
            tooltip="Clear all selected jobs"
          >
            Clear
          </Button>
          <Button
            size="sm"
            onClick={onCompare}
            disabled={jobs.length < 2}
            className="text-xs"
            tooltip="Compare selected jobs side by side"
          >
            Compare
          </Button>
        </div>
      </div>
    </div>
  );
}
