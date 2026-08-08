'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus } from 'lucide-react';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { showToast } from '@/components/ui/Toast';
import { superAdminWhatsappService as svc } from '@/services/super-admin-whatsapp.service';
import type { ApiError } from '@/types/api';

/** The contact category currently selected on the contacts page. */
export interface ContactCategory {
  optInStatus?: string;
  role?: string;
  onPlatform?: string; // '' | 'on' | 'off'
  tag?: string;
}

/**
 * Saved custom-set controls for the contacts page: apply a saved Segment as a
 * quick-filter, or save the current category (role + on/off-platform + tag +
 * opt-in) as a reusable Segment — which is the same segment a campaign targets.
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

  const hasFilter = !!(current.optInStatus || current.role || current.onPlatform || current.tag);

  const applySegment = (id: string) => {
    const seg = segments.find((s) => s.id === id);
    if (!seg) return;
    const f = ((seg.filter ?? {}) as Record<string, unknown>) || {};
    onApply({
      optInStatus: typeof f.optInStatus === 'string' ? f.optInStatus : '',
      role: typeof f.role === 'string' ? f.role : '',
      onPlatform: f.onPlatform === true ? 'on' : f.onPlatform === false ? 'off' : '',
      tag: Array.isArray(f.tags) && f.tags.length ? String(f.tags[0]) : '',
    });
  };

  const saveMut = useMutation({
    mutationFn: () =>
      svc.createSegment({
        name: name.trim(),
        filter: {
          ...(current.optInStatus ? { optInStatus: current.optInStatus } : {}),
          ...(current.role ? { role: current.role } : {}),
          ...(current.onPlatform === 'on' ? { onPlatform: true } : {}),
          ...(current.onPlatform === 'off' ? { onPlatform: false } : {}),
          ...(current.tag ? { tags: [current.tag] } : {}),
        },
      }),
    onSuccess: () => {
      showToast.success('Saved as a reusable set');
      setSaveOpen(false);
      setName('');
      qc.invalidateQueries({ queryKey: ['wa-segments'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Save failed'),
  });

  return (
    <>
      {segments.length > 0 && (
        <div className="min-w-[180px]">
          <Select
            value=""
            onChange={(v) => {
              if (typeof v === 'string' && v) applySegment(v);
            }}
            options={[
              { value: '', label: 'Apply saved set…' },
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
            Saves the current category (role, on/off-platform, tag, opt-in) as a reusable segment
            you can re-apply here or target in a campaign.
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
