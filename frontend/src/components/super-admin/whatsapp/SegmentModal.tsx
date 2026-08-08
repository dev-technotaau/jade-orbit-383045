'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { showToast } from '@/components/ui/Toast';
import { superAdminWhatsappService as svc } from '@/services/super-admin-whatsapp.service';
import type { ApiError } from '@/types/api';

type OptInStatus = 'any' | 'OPTED_IN' | 'OPTED_OUT' | 'UNKNOWN';
type OnPlatform = 'any' | 'on' | 'off';

const OPT_IN_OPTIONS: { value: OptInStatus; label: string }[] = [
  { value: 'any', label: 'Any opt-in status' },
  { value: 'OPTED_IN', label: 'Opted in' },
  { value: 'OPTED_OUT', label: 'Opted out' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const ON_PLATFORM_OPTIONS: { value: OnPlatform; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'on', label: 'On platform (HireAdda user)' },
  { value: 'off', label: 'Not on platform' },
];

const ROLE_OPTIONS = [
  { value: 'any', label: 'Any role' },
  { value: 'CANDIDATE', label: 'Candidate' },
  { value: 'EMPLOYER', label: 'Employer' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
];

/**
 * Create a saved segment — a reusable audience filter for campaigns. Captures
 * a name, optional description and a structured filter (tags, opt-in status,
 * on-platform). Backed by createSegment; invalidates `wa-segments`.
 */
export default function SegmentModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [optInStatus, setOptInStatus] = useState<OptInStatus>('any');
  const [onPlatform, setOnPlatform] = useState<OnPlatform>('any');
  const [role, setRole] = useState('any');

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
      const filter: {
        tags?: string[];
        optInStatus?: string;
        onPlatform?: boolean;
        role?: string;
      } = {};
      if (tags.length > 0) filter.tags = tags;
      if (optInStatus !== 'any') filter.optInStatus = optInStatus;
      if (onPlatform !== 'any') filter.onPlatform = onPlatform === 'on';
      if (role !== 'any') filter.role = role;
      return svc.createSegment({
        name: name.trim(),
        description: description.trim() || undefined,
        filter,
      });
    },
    onSuccess: () => {
      showToast.success('Segment created');
      qc.invalidateQueries({ queryKey: ['wa-segments'] });
      onClose();
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Failed to create segment'),
  });

  const submit = () => {
    if (!name.trim()) return showToast.error('Give the segment a name');
    mutation.mutate();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="New segment"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={mutation.isPending}>
            Create segment
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Opt-in status"
            options={OPT_IN_OPTIONS}
            value={optInStatus}
            onChange={(v) => setOptInStatus(v as OptInStatus)}
            clearable={false}
          />
          <Select
            label="On platform"
            options={ON_PLATFORM_OPTIONS}
            value={onPlatform}
            onChange={(v) => setOnPlatform(v as OnPlatform)}
            clearable={false}
          />
          <Select
            label="On-platform role"
            options={ROLE_OPTIONS}
            value={role}
            onChange={(v) => setRole(v as string)}
            clearable={false}
          />
        </div>
      </div>
    </Modal>
  );
}
