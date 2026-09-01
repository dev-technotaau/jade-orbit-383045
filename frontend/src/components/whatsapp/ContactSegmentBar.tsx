'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus } from 'lucide-react';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { showToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api';
import { whatsappService as svc } from '@/services/whatsapp.service';

/** The contact category currently selected on the contacts page. */
export interface ContactCategory {
  optInStatus?: string;
  /**
   * Every tag of the filter, matched with OR — the same way a campaign resolves
   * the segment. This was a single `tag` and only ever carried `tags[0]`, so
   * applying a three-tag segment here showed the audience for tag #1 while a
   * campaign against the same segment reached a strictly larger, different set.
   */
  tags?: string[];
  /**
   * The saved segment applied as a filter, sent to the backend BY ID.
   *
   * Applying one used to mean copying its tags and opt-in state into the filter
   * boxes, which silently dropped every attribute, recency, engagement and OR
   * rule it carried — so the page showed a wider audience than the campaign
   * targeting the same segment would message. The id is resolved server-side
   * with the launch predicate instead, and the segment's own name is shown so it
   * is obvious the list is scoped to it.
   */
  segmentId?: string;
}

/**
 * Saved custom-set controls for the contacts page: apply a saved Segment as a
 * quick-filter, or save the current category (tag + opt-in) as a reusable
 * Segment — which is the same segment a campaign targets.
 */
export default function ContactSegmentBar({
  current,
  onApply,
}: {
  current: ContactCategory;
  onApply: (c: ContactCategory) => void;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['wa-segments'], queryFn: () => svc.listSegments() });
  const segments = data?.data ?? [];
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');

  // Saving is offered for the FILTER BOXES only. With a set applied, the boxes
  // are just a narrowing on top of rules that live in the saved set, so saving
  // them under a new name would produce a set that matches a strictly wider
  // audience than the one on screen — the exact silent widening this bar exists
  // to prevent.
  const hasFilter = !!(current.optInStatus || current.tags?.length) && !current.segmentId;

  // Applying a segment hands the backend its ID and clears the filter boxes: the
  // whole stored filter is resolved server-side, so nothing has to be (lossily)
  // flattened into tags here, and the boxes stay free for narrowing the segment
  // further.
  const applySegment = (id: string) => {
    if (!segments.some((s) => s.id === id)) return;
    onApply({ segmentId: id, optInStatus: '', tags: [] });
  };

  const saveMut = useMutation({
    mutationFn: () =>
      svc.createSegment({
        name: name.trim(),
        filter: {
          ...(current.optInStatus ? { optInStatus: current.optInStatus } : {}),
          ...(current.tags?.length ? { tags: current.tags } : {}),
        },
      }),
    onSuccess: () => {
      showToast.success('Saved as a reusable set');
      setSaveOpen(false);
      setName('');
      qc.invalidateQueries({ queryKey: ['wa-segments'] });
    },
    onError: (e) => showToast.error(errorMessage(e, 'Save failed')),
  });

  return (
    <>
      {segments.length > 0 && (
        <div className="min-w-[180px]">
          <Select
            // Bound to the applied segment rather than always blank, so the bar
            // states which set the list is scoped to — and picking the first
            // option removes it again.
            value={current.segmentId ?? ''}
            onChange={(v) => {
              if (typeof v !== 'string') return;
              if (v) applySegment(v);
              else onApply({ ...current, segmentId: undefined });
            }}
            options={[
              { value: '', label: 'No saved set' },
              ...segments.map((s) => ({ value: s.id, label: s.name })),
            ]}
            clearable={false}
          />
        </div>
      )}
      <Button
        variant="outline"
        leftIcon={<BookmarkPlus className="h-4 w-4" />}
        disabled={!hasFilter}
        tooltip={
          current.segmentId
            ? 'Clear the applied set first — a set is saved from the filter boxes, not from another set.'
            : undefined
        }
        onClick={() => setSaveOpen(true)}
      >
        Save set
      </Button>

      <Modal
        isOpen={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save current filter as a set"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim()}
              isLoading={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-muted)]">
            Saves the current category (tag, opt-in) as a reusable segment you can re-apply here or
            target in a campaign.
          </p>
          <Input
            label="Set name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mumbai employers"
            autoFocus
          />
        </div>
      </Modal>
    </>
  );
}
