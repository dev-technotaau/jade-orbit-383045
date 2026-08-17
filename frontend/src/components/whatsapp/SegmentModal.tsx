'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import SegmentRulesBuilder, { usableRules } from '@/components/whatsapp/SegmentRulesBuilder';
import type { WaSegment, WaSegmentFilter, WaSegmentRule } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

type OptInStatus = 'any' | 'OPTED_IN' | 'OPTED_OUT' | 'UNKNOWN';

const OPT_IN_OPTIONS: { value: OptInStatus; label: string }[] = [
  { value: 'any', label: 'Any opt-in status' },
  { value: 'OPTED_IN', label: 'Opted in' },
  { value: 'OPTED_OUT', label: 'Opted out' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

/**
 * Create or edit a saved segment — a reusable audience filter for campaigns.
 *
 * The filter is tags + opt-in status + imported-attribute equality, plus the
 * advanced rule rows: tag AND/NOT, opt-in source, recency windows on the three
 * contact timestamps, and campaign engagement ("did not reply to X"). None of
 * those were reachable before, so any audience beyond "any of these tags" had to
 * be built outside the product and pasted in as a phone list.
 *
 * Every control seeds from the segment being edited, so a saved audience is a
 * thing that can be corrected. Before this, a segment with one wrong tag had to
 * be deleted and rebuilt — and deleting it orphans every campaign that stored
 * its id as their audience.
 *
 * Backed by createSegment / updateSegment; invalidates `wa-segments`.
 */
function SegmentForm({ segment, onClose }: { segment: WaSegment | null; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = segment !== null;
  const seed: WaSegmentFilter = segment?.filter ?? {};

  const [name, setName] = useState(segment?.name ?? '');
  const [description, setDescription] = useState(segment?.description ?? '');
  const [tags, setTags] = useState<string[]>(() => seed.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [optInStatus, setOptInStatus] = useState<OptInStatus>(
    (seed.optInStatus as OptInStatus) ?? 'any',
  );
  // Attribute equality rows (city = Mumbai). The model is documented as a
  // "tag/optIn/attribute filter" and the attribute half did not exist, so an
  // imported column could be personalised on but never targeted.
  const [attrRows, setAttrRows] = useState<Array<{ key: string; value: string }>>(() =>
    Object.entries(seed.attributes ?? {}).map(([key, value]) => ({ key, value: String(value) })),
  );
  const [rules, setRules] = useState<WaSegmentRule[]>(() => seed.rules ?? []);
  const [ruleOp, setRuleOp] = useState<'and' | 'or'>(() => seed.op ?? 'and');

  // Campaigns for the engagement rule ("did not reply to …"). Only the list is
  // needed, and it is the same query key the campaigns page uses.
  const { data: campaignData } = useQuery({
    queryKey: ['wa-campaigns', 1, 100],
    queryFn: () => svc.listCampaigns({ page: 1, limit: 100 }),
  });
  const campaignOptions = (campaignData?.data?.items ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const updateAttr = (index: number, patch: Partial<{ key: string; value: string }>) =>
    setAttrRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const addAttr = () => setAttrRows((prev) => [...prev, { key: '', value: '' }]);
  const removeAttr = (index: number) => setAttrRows((prev) => prev.filter((_, i) => i !== index));

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t) return;
    if (tags.includes(t)) {
      setTagDraft('');
      return;
    }
    setTags((prev) => [...prev, t]);
    setTagDraft('');
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  // Splitting on comma lets users paste "vip, lead, premium" in one go.
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  };

  const mutation = useMutation({
    mutationFn: () => {
      const filter: WaSegmentFilter = {};
      if (tags.length > 0) filter.tags = tags;
      if (optInStatus !== 'any') filter.optInStatus = optInStatus;
      const attributes = Object.fromEntries(
        attrRows
          .filter((r) => r.key.trim() && r.value.trim())
          .map((r) => [r.key.trim().toLowerCase(), r.value.trim()]),
      );
      if (Object.keys(attributes).length > 0) filter.attributes = attributes;
      // Half-filled rows are dropped rather than saved: the backend ignores them,
      // and keeping them would leave the segment showing a condition that reads
      // as active but narrows nothing.
      const finished = usableRules(rules);
      if (finished.length > 0) {
        filter.rules = finished;
        if (finished.length > 1) filter.op = ruleOp;
      }
      // On an edit the description is sent as null rather than omitted when the
      // box is emptied: a PATCH that leaves the key out means "leave it alone",
      // so clearing the text would otherwise appear to work and then come back.
      return segment
        ? svc.updateSegment(segment.id, {
            name: name.trim(),
            description: description.trim() || null,
            filter,
          })
        : svc.createSegment({
            name: name.trim(),
            description: description.trim() || undefined,
            filter,
          });
    },
    onSuccess: () => {
      showToast.success(editing ? 'Segment updated' : 'Segment created');
      qc.invalidateQueries({ queryKey: ['wa-segments'] });
      if (segment) {
        qc.invalidateQueries({ queryKey: ['wa-segment', segment.id] });
        // The member count is cached for a minute and is the whole point of
        // editing the filter — leaving it stale would show the old audience size
        // next to the new predicate.
        qc.invalidateQueries({ queryKey: ['wa-segment-count', segment.id] });
      }
      onClose();
    },
    onError: (e) =>
      showToast.error(
        (e as unknown as ApiError).message || `Failed to ${editing ? 'update' : 'create'} segment`,
      ),
  });

  const submit = () => {
    if (!name.trim()) return showToast.error('Give the segment a name');
    mutation.mutate();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editing ? 'Edit segment' : 'New segment'}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={mutation.isPending}>
            {editing ? 'Save changes' : 'Create segment'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Segment name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Opted-in premium users"
        />

        <Textarea
          label="Description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this audience represents…"
          maxLength={280}
          showCount
        />

        <div>
          <span className="mb-1.5 block text-sm font-medium text-[var(--text)]">Tags</span>
          <div className="mb-2 flex flex-wrap gap-2">
            {tags.length === 0 && (
              <span className="text-xs text-[var(--text-muted)]">No tags — matches any tag.</span>
            )}
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove ${tag}`}
                  className="rounded-full p-0.5 text-[var(--text-muted)] hover:bg-[var(--border)] hover:text-[var(--text)]"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Type a tag and press Enter or comma"
              />
            </div>
            <Button variant="outline" leftIcon={<Plus className="h-4 w-4" />} onClick={addTag}>
              Add
            </Button>
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-[var(--text)]">
            Contact attributes
          </span>
          <p className="mb-2 text-xs text-[var(--text-muted)]">
            Imported columns, matched exactly. A <code>City</code> column imported as{' '}
            <code>city</code> targets everyone whose city is Mumbai.
          </p>
          <div className="space-y-2">
            {attrRows.map((row, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    value={row.key}
                    onChange={(e) => updateAttr(i, { key: e.target.value })}
                    placeholder="city"
                  />
                </div>
                <span className="pb-2.5 text-sm text-[var(--text-muted)]">=</span>
                <div className="flex-1">
                  <Input
                    value={row.value}
                    onChange={(e) => updateAttr(i, { value: e.target.value })}
                    placeholder="Mumbai"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeAttr(i)}
                  aria-label={`Remove attribute ${i + 1}`}
                  className="rounded-md p-2 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={addAttr}
          >
            Add attribute
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Opt-in status"
            options={OPT_IN_OPTIONS}
            value={optInStatus}
            onChange={(v) => setOptInStatus(v as OptInStatus)}
            clearable={false}
          />
          {/* "On platform" and "On-platform role" were removed with the linked
              -account feature: they filtered on WaContact.userId and the User
              role, neither of which exists now. */}
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <SegmentRulesBuilder
            rules={rules}
            op={ruleOp}
            onChange={setRules}
            onOpChange={setRuleOp}
            campaignOptions={campaignOptions}
          />
        </div>
      </div>
    </Modal>
  );
}

/**
 * The segment editor, opened either blank (create) or on an existing segment.
 *
 * In edit mode the row is REFETCHED before the form is seeded rather than taken
 * from the cached `wa-segments` list: that query outlives a settings-page visit,
 * and saving a filter read from a stale copy would silently revert whatever the
 * previous edit changed. The form is mounted only once the fresh row is in hand,
 * so it seeds from that and nothing clobbers what is typed afterwards.
 */
export default function SegmentModal({
  segment,
  onClose,
}: {
  /** Omitted = create a new segment; a segment = edit that one. */
  segment?: WaSegment;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-segment', segment?.id],
    queryFn: () => svc.getSegment(segment!.id),
    enabled: !!segment,
  });

  if (!segment) return <SegmentForm segment={null} onClose={onClose} />;

  if (isLoading || isError) {
    return (
      <Modal isOpen onClose={onClose} title="Edit segment" size="lg">
        {isError ? (
          <p className="py-8 text-center text-sm text-red-600">Failed to load this segment.</p>
        ) : (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading segment…
          </p>
        )}
      </Modal>
    );
  }

  return <SegmentForm segment={data?.data ?? segment} onClose={onClose} />;
}
