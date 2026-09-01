'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { showToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api';
import { confirmDialog } from '@/components/ui/dialog-service';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaSegment, WaSegmentFilter, WaSegmentRule } from '@/types/whatsapp';
import SegmentModal from './SegmentModal';

const OPT_IN_LABEL: Record<string, string> = {
  OPTED_IN: 'Opted in',
  OPTED_OUT: 'Opted out',
  UNKNOWN: 'Unknown opt-in',
};

/** Human wording for each rule operator, keyed the way the builder writes them. */
const RULE_OP_LABEL: Record<string, string> = {
  any: 'any of',
  all: 'all of',
  none: 'none of',
  equals: 'is',
  not: 'is not',
  contains: 'contains',
  within: 'in the last',
  notWithin: 'not in the last',
  exists: 'is set',
  notExists: 'is not set',
  received: 'received',
  notReceived: 'did not receive',
  replied: 'replied to',
  notReplied: 'did not reply to',
  clicked: 'clicked in',
  notClicked: 'did not click in',
};

/** Human wording for each rule field. */
const RULE_FIELD_LABEL: Record<string, string> = {
  tags: 'Tags',
  optInStatus: 'Opt-in',
  optInSource: 'Opt-in source',
  lastInboundAt: 'Their last message',
  lastOutboundAt: 'Our last message',
  lastMarketingAt: 'Last marketing',
  campaign: 'Campaign',
};

/** One advanced rule as a chip, e.g. "Tags all of mumbai, premium". */
function ruleChip(rule: WaSegmentRule): string {
  const field = rule.field.startsWith('attr.')
    ? rule.field.slice(5)
    : (RULE_FIELD_LABEL[rule.field] ?? rule.field);
  const op = RULE_OP_LABEL[rule.operator] ?? rule.operator;
  if (rule.operator === 'exists' || rule.operator === 'notExists') return `${field} ${op}`;
  const value = Array.isArray(rule.value) ? rule.value.join(', ') : String(rule.value ?? '');
  // A recency rule's value is a day count, so it reads as a duration.
  const suffix = rule.operator === 'within' || rule.operator === 'notWithin' ? ' days' : '';
  return `${field} ${op} ${value}${suffix}`;
}

/** Turn a segment's stored filter into human-readable chips. */
function filterChips(filter: WaSegmentFilter): string[] {
  const chips: string[] = [];

  const tags = filter.tags;
  if (Array.isArray(tags) && tags.length > 0) {
    chips.push(`Tags: ${tags.join(', ')}`);
  }

  const attributes = filter.attributes;
  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    for (const [key, value] of Object.entries(attributes as Record<string, unknown>)) {
      chips.push(`${key} = ${String(value)}`);
    }
  }

  const optInStatus = filter.optInStatus;
  if (typeof optInStatus === 'string' && optInStatus) {
    chips.push(OPT_IN_LABEL[optInStatus] ?? optInStatus);
  }

  // Advanced rules were invisible here, so a segment carrying "did not reply to
  // the Diwali blast" summarised as "All contacts (no filter)" — the opposite of
  // what it targets.
  const rules = Array.isArray(filter.rules) ? filter.rules : [];
  for (const rule of rules) chips.push(ruleChip(rule));
  if (rules.length > 1 && filter.op === 'or') chips.push('any rule matches');

  return chips;
}

/**
 * Live member count for one segment.
 *
 * The row showed the filter and nothing else, so "how many people is this?" had
 * no answer anywhere in the product — an operator picked a segment for a
 * campaign without knowing whether it was six people or sixty thousand.
 * Resolved server-side with the campaign's own predicate, so it is the number
 * the send will actually reach.
 */
function SegmentCount({ segmentId }: { segmentId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-segment-count', segmentId],
    queryFn: () => svc.getSegmentCount(segmentId),
    staleTime: 60_000,
  });
  if (isLoading) {
    return <span className="text-xs text-[var(--text-muted)]">Counting…</span>;
  }
  if (isError) {
    return <span className="text-xs text-[var(--text-muted)]">Count unavailable</span>;
  }
  const count = data?.data?.count ?? 0;
  return (
    <span className="text-xs text-[var(--text-muted)]">
      {count.toLocaleString('en-IN')} contact{count === 1 ? '' : 's'}
    </span>
  );
}

/**
 * Saved segments — reusable audiences (stored contact filters) that campaigns
 * can target. Lists segments with a readable filter summary, a live member
 * count, a "New segment" modal and per-row edit and delete. Backed by
 * listSegments / getSegment / getSegmentCount / createSegment / updateSegment /
 * deleteSegment; invalidates `wa-segments`.
 */
export default function SavedSegmentsManager() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  // Correcting a segment used to mean deleting and rebuilding it — which
  // orphans every campaign that stored its id as their audience.
  const [editing, setEditing] = useState<WaSegment | null>(null);

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
    onError: (e) => showToast.error(errorMessage(e, 'Failed to delete segment')),
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
                    <p className="flex flex-wrap items-baseline gap-2 font-medium text-[var(--text)]">
                      {segment.name}
                      <SegmentCount segmentId={segment.id} />
                    </p>
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
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      tooltip="Edit"
                      onClick={() => setEditing(segment)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      tooltip="Delete"
                      isLoading={deleteMut.isPending && deleteMut.variables === segment.id}
                      onClick={() => handleDelete(segment)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {creating && <SegmentModal onClose={() => setCreating(false)} />}
      {editing && <SegmentModal segment={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
