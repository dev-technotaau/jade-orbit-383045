'use client';

import { useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import {
  Tag,
  BellOff,
  BellRing,
  Ban,
  ShieldOff,
  ShieldX,
  Download,
  Trash2,
  X,
  Loader2,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { ApiError } from '@/types/api';

type BulkContactAction =
  'tag' | 'untag' | 'optIn' | 'optOut' | 'block' | 'unblock' | 'addSuppression' | 'erase';

interface ContactBulkActionBarProps {
  /** Page-selected contact ids. */
  ids: string[];
  /** Total contacts matching the active filters (for "select all N"). */
  totalMatching: number;
  /** Whether the selection is "all matching the filter" rather than the id list. */
  allMatching: boolean;
  /** Active contacts filters, sent when allMatching (and for export-all). */
  filters: {
    q?: string;
    optInStatus?: string;
    /** OR across several tags, matching what the list itself resolved. */
    tags?: string[];
    /**
     * Applied saved set. Carried through so "select all N matching" acts on the
     * rows the page counted — a bulk opt-out or erase that ignored it would hit
     * every contact the set's rules had excluded.
     */
    segmentId?: string;
    /**
     * Block state the list was filtered to. Carried for the same reason as the
     * segment: the usual reason to filter to blocked rows is to bulk-unblock
     * them, and dropping it here would send that unblock to every contact the
     * filter had excluded.
     */
    blocked?: boolean;
    /**
     * Suppression state the list was filtered to. Carried for exactly the same
     * reason as `blocked`: the usual reason to filter to suppressed rows is to
     * act on them as a group.
     */
    suppressed?: boolean;
  };
  onSelectAllMatching: () => void;
  onClear: () => void;
  onDone: () => void;
}

/**
 * Bulk-action bar for the WhatsApp contacts table. Acts on the page selection
 * (ids) OR every contact matching the active filters ("select all N"). Each
 * action is one atomic backend call (svc.bulkContacts); erase is confirmed.
 */
export default function ContactBulkActionBar({
  ids,
  totalMatching,
  allMatching,
  filters,
  onSelectAllMatching,
  onClear,
  onDone,
}: ContactBulkActionBarProps) {
  const qc = useQueryClient();
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [eraseOpen, setEraseOpen] = useState(false);
  // Bulk opt-in asserts consent on behalf of other people. Every other
  // consent-affecting action here is either reversible or confirmed; this one
  // fired straight from the click.
  const [optInOpen, setOptInOpen] = useState(false);

  const count = allMatching ? totalMatching : ids.length;

  const mut = useMutation({
    mutationFn: (payload: { action: BulkContactAction; tag?: string }) =>
      svc.bulkContacts(
        allMatching ? { allMatching: true, filters, ...payload } : { ids, ...payload },
      ),
    onSuccess: (res) => {
      showToast.success(`Updated ${res.data?.count ?? 0} contact(s)`);
      // Contacts who had explicitly opted out are deliberately left untouched by
      // the server. Say so, otherwise the count silently disagrees with the
      // selection and it reads as a partial failure.
      const skipped = res.data?.skippedOptedOut ?? 0;
      if (skipped > 0) {
        showToast.warning(
          `${skipped} contact(s) who had opted out were left unchanged — re-opt them in individually.`,
        );
      }
      // Contacts already in the requested consent state are skipped rather than
      // re-stamped, so the count can legitimately be smaller than the selection.
      // Without this line that reads as a partial failure.
      const noChange = res.data?.skippedNoChange ?? 0;
      if (noChange > 0) {
        showToast.info(
          `${noChange} contact(s) were already in that state — their original consent record was kept.`,
        );
      }
      const failed = res.data?.failed?.length ?? 0;
      if (failed > 0) {
        showToast.error(`${failed} contact(s) could not be erased — try again for those.`);
      }
      qc.invalidateQueries({ queryKey: ['wa-contacts'] });
      setTagModalOpen(false);
      setTagInput('');
      setEraseOpen(false);
      setOptInOpen(false);
      onDone();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Bulk action failed'),
  });

  const exportMut = useMutation({
    mutationFn: () => svc.exportContacts(allMatching ? filters : { ids }),
    onSuccess: () => showToast.success('Export downloaded'),
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Export failed'),
  });

  if (count === 0) return null;
  const busy = mut.isPending || exportMut.isPending;
  const run = (action: BulkContactAction, tag?: string) => mut.mutate({ action, tag });

  const btn =
    'inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-60';

  return (
    <>
      <div
        role="region"
        aria-label="Bulk actions"
        className="sticky bottom-4 z-10 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 shadow-[var(--shadow-lg)]"
      >
        <span className="text-sm font-medium text-[var(--text)]">
          {allMatching ? `All ${count} selected` : `${count} selected`}
        </span>
        {!allMatching && totalMatching > ids.length && (
          <button
            type="button"
            onClick={onSelectAllMatching}
            className="text-primary text-xs font-medium underline underline-offset-2 hover:opacity-80"
          >
            Select all {totalMatching}
          </button>
        )}
        {busy && <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />}
        <span className="h-5 w-px bg-[var(--border)]" aria-hidden="true" />

        <button type="button" className={btn} disabled={busy} onClick={() => setTagModalOpen(true)}>
          <Tag className="h-4 w-4" /> Tags
        </button>
        <button type="button" className={btn} disabled={busy} onClick={() => setOptInOpen(true)}>
          <BellRing className="h-4 w-4" /> Opt in
        </button>
        <button type="button" className={btn} disabled={busy} onClick={() => run('optOut')}>
          <BellOff className="h-4 w-4" /> Opt out
        </button>
        <button type="button" className={btn} disabled={busy} onClick={() => run('block')}>
          <Ban className="h-4 w-4" /> Block
        </button>
        <button type="button" className={btn} disabled={busy} onClick={() => run('unblock')}>
          <ShieldOff className="h-4 w-4" /> Unblock
        </button>
        <button type="button" className={btn} disabled={busy} onClick={() => run('addSuppression')}>
          <ShieldX className="h-4 w-4" /> Suppress
        </button>
        <button type="button" className={btn} disabled={busy} onClick={() => exportMut.mutate()}>
          <Download className="h-4 w-4" /> Export
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setEraseOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          aria-label="Clear selection"
          className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)] disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tag add/remove */}
      <Modal
        isOpen={tagModalOpen}
        onClose={() => setTagModalOpen(false)}
        title={`Tag ${count} contact${count === 1 ? '' : 's'}`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTagModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={!tagInput.trim() || busy}
              onClick={() => run('untag', tagInput.trim())}
            >
              Remove tag
            </Button>
            <Button disabled={!tagInput.trim() || busy} onClick={() => run('tag', tagInput.trim())}>
              Add tag
            </Button>
          </div>
        }
      >
        <Input
          label="Tag"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="e.g. mumbai-leads"
          autoFocus
        />
      </Modal>

      {/* Bulk opt-in confirm — this records consent for other people */}
      <Modal
        isOpen={optInOpen}
        onClose={() => setOptInOpen(false)}
        title={`Opt in ${count} contact${count === 1 ? '' : 's'}?`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOptInOpen(false)}>
              Cancel
            </Button>
            <Button isLoading={mut.isPending} onClick={() => run('optIn')}>
              Record consent
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--text-secondary)]">
          This records marketing consent on behalf of {count} contact
          {count === 1 ? '' : 's'}, with you as the source. Only do this where you actually hold
          that consent.
        </p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Contacts who previously opted out are left untouched — re-opt them in individually.
        </p>
      </Modal>

      {/* Erase confirm (destructive, DPDP) */}
      <Modal
        isOpen={eraseOpen}
        onClose={() => setEraseOpen(false)}
        title={`Erase ${count} contact${count === 1 ? '' : 's'}?`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEraseOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" isLoading={mut.isPending} onClick={() => run('erase')}>
              Erase permanently
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--text-secondary)]">
          This runs a DPDP erasure on each selected contact: their messages, media and personal
          details are scrubbed and the number is tombstoned. This{' '}
          <strong className="text-[var(--text)]">cannot be undone</strong>.
          {allMatching && count > 1000 && (
            <span className="mt-2 block text-xs text-amber-700">
              Up to 1,000 contacts are erased per run — repeat to continue for larger selections.
            </span>
          )}
        </p>
      </Modal>
    </>
  );
}
