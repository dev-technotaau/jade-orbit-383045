'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/dialog-service';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaSegment } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';
import SegmentModal from './SegmentModal';

const OPT_IN_LABEL: Record<string, string> = {
  OPTED_IN: 'Opted in',
  OPTED_OUT: 'Opted out',
  UNKNOWN: 'Unknown opt-in',
};

/** Turn a segment's stored filter into human-readable chips. */
function filterChips(filter: Record<string, unknown>): string[] {
  const chips: string[] = [];

  const tags = filter.tags;
  if (Array.isArray(tags) && tags.length > 0) {
    chips.push(`Tags: ${tags.join(', ')}`);
  }

  const optInStatus = filter.optInStatus;
  if (typeof optInStatus === 'string' && optInStatus) {
    chips.push(OPT_IN_LABEL[optInStatus] ?? optInStatus);
  }

  return chips;
}

/**
 * Saved segments — reusable audiences (stored contact filters) that campaigns
 * can target. Lists segments with a readable filter summary, a "New segment"
 * modal and per-row delete. Backed by listSegments / createSegment /
 * deleteSegment; invalidates `wa-segments`.
 */
export default function SavedSegmentsManager() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-segments'],
    queryFn: () => svc.listSegments(),
  });
  const segments = data?.data ?? [];

  const deleteMut = useMutation({
    mutationFn: (id: string) => svc.deleteSegment(id),
    onSuccess: () => {
      showToast.success('Segment deleted');
      qc.invalidateQueries({ queryKey: ['wa-segments'] });
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to delete segment'),
  });

  const handleDelete = async (segment: WaSegment) => {
    const ok = await confirmDialog({
      title: 'Delete segment',
      message: `Delete the "${segment.name}" segment?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteMut.mutate(segment.id);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <Users className="h-4 w-4 text-indigo-600" /> Saved segments
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Reusable audiences built from contact filters. Pick a saved segment when launching a
            campaign instead of rebuilding the filter each time.
          </p>
        </div>
        <Button
          variant="secondary"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setCreating(true)}
        >
          New segment
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
        {isLoading && (
          <p className="flex items-center justify-center gap-2 p-8 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading segments…
          </p>
        )}
        {isError && (
          <p className="p-4 text-center text-sm text-red-600">Failed to load segments.</p>
        )}
        {!isLoading && !isError && segments.length === 0 && (
          <p className="p-8 text-center text-sm text-[var(--text-muted)]">No saved segments yet.</p>
        )}

        {!isLoading && !isError && segments.length > 0 && (
          <ul className="divide-y divide-[var(--border)]">
            {segments.map((segment) => {
              const chips = filterChips(segment.filter);
              return (
                <li
                  key={segment.id}
                  className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-[var(--bg-secondary)]"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text)]">{segment.name}</p>
                    {segment.description && (
                      <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                        {segment.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {chips.length > 0 ? (
                        chips.map((chip) => (
                          <Badge key={chip} variant="info" size="sm">
                            {chip}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">
                          All contacts (no filter)
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    tooltip="Delete"
                    isLoading={deleteMut.isPending && deleteMut.variables === segment.id}
                    onClick={() => handleDelete(segment)}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {creating && <SegmentModal onClose={() => setCreating(false)} />}
    </section>
  );
}
