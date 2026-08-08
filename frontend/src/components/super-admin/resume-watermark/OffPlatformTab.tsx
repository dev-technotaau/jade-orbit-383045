'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  UserPlus,
  Upload,
  Download,
  Trash2,
  Pencil,
  FilePlus,
  FileText,
  ChevronRight,
  ChevronDown,
  Archive,
  FolderOpen,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Pagination from '@/components/ui/Pagination';
import Tooltip from '@/components/ui/Tooltip';
import Spinner from '@/components/ui/Spinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { showToast } from '@/components/ui/Toast';
import { useBulkSelect, downloadBlob } from '@/hooks/use-bulk-select';
import {
  BulkBar,
  BulkButton,
  HeaderCheckbox,
  RowCheckbox,
} from '@/components/super-admin/email/bulk-ui';
import { resumeWatermarkService as svc } from '@/services/super-admin-resume-watermark.service';
import { formatFileSize } from '@/lib/utils';
import type { OffPlatformCandidate, OffPlatformResume } from '@/types/resume-watermark';
import AddOffPlatformModal from './AddOffPlatformModal';
import EditOffPlatformModal from './EditOffPlatformModal';
import AddResumesModal from './AddResumesModal';
import { RW_OFF_KEY, formatOf, fmtDate, resumeDownloadName } from './off-platform-helpers';

/** Max candidates the backend accepts for a single bulk ZIP request. */
const BULK_LIMIT = 100;

export default function OffPlatformTab() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const sel = useBulkSelect();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addMode, setAddMode] = useState<null | 'full' | 'quick'>(null);
  const [editing, setEditing] = useState<OffPlatformCandidate | null>(null);
  const [addResumesFor, setAddResumesFor] = useState<OffPlatformCandidate | null>(null);
  const [confirmCandidate, setConfirmCandidate] = useState<OffPlatformCandidate | null>(null);
  const [confirmResume, setConfirmResume] = useState<{
    candidate: OffPlatformCandidate;
    resume: OffPlatformResume;
  } | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [downloadingResumeId, setDownloadingResumeId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: [RW_OFF_KEY, q, page, limit],
    queryFn: () => svc.listOffPlatform({ q: q || undefined, page, limit }),
  });

  const items = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = data?.data?.totalPages ?? Math.max(1, Math.ceil(total / limit));
  const pageIds = items.map((c) => c.id);

  function invalidate() {
    qc.invalidateQueries({ queryKey: [RW_OFF_KEY] });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const deleteCandidate = useMutation({
    mutationFn: (id: string) => svc.deleteOffPlatform(id),
    onSuccess: () => {
      invalidate();
      showToast.success('Candidate deleted');
      setConfirmCandidate(null);
    },
    onError: () => showToast.error('Could not delete candidate'),
  });

  const deleteResume = useMutation({
    mutationFn: (vars: { id: string; resumeId: string }) =>
      svc.deleteResume(vars.id, vars.resumeId),
    onSuccess: () => {
      invalidate();
      showToast.success('Resume deleted');
      setConfirmResume(null);
    },
    onError: () => showToast.error('Could not delete resume'),
  });

  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) => svc.bulkDeleteOffPlatform(ids),
    onSuccess: (res) => {
      invalidate();
      showToast.success(`Deleted ${res.data?.count ?? sel.count} candidate(s)`);
      sel.clear();
      setConfirmBulk(false);
    },
    onError: () => showToast.error('Bulk delete failed'),
  });

  async function downloadResume(c: OffPlatformCandidate, r: OffPlatformResume) {
    setDownloadingResumeId(r.id);
    try {
      const blob = await svc.downloadOffPlatformResume(c.id, r.id);
      downloadBlob(blob, resumeDownloadName(c.name, r.originalName, c.resumes.length));
    } catch {
      showToast.error('Download failed');
    } finally {
      setDownloadingResumeId(null);
    }
  }

  async function bulkDownload() {
    if (sel.ids.length === 0) return;
    if (sel.ids.length > BULK_LIMIT) {
      showToast.error(`Select up to ${BULK_LIMIT} candidates for a ZIP download`);
      return;
    }
    setBulkBusy(true);
    try {
      const blob = await svc.bulkDownloadOffPlatform(sel.ids);
      downloadBlob(blob, 'watermarked-resumes.zip');
      sel.clear();
    } catch {
      showToast.error('Download failed');
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        Off-platform candidates are people whose CVs you manage here — they have no account or
        profile. Downloads are watermarked automatically by the server.
      </p>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-64">
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, email or tag…"
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>
        <span className="text-sm text-[var(--text-muted)]">
          {total.toLocaleString()} candidate{total === 1 ? '' : 's'}
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            variant="secondary"
            leftIcon={<Upload className="h-4 w-4" />}
            onClick={() => setAddMode('quick')}
          >
            Quick import CVs
          </Button>
          <Button leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setAddMode('full')}>
            Add candidate
          </Button>
        </div>
      </div>

      {/* Bulk bar */}
      {sel.active && (
        <BulkBar
          count={sel.count}
          allMatching={sel.allMatching}
          totalMatching={total}
          allOnPage={sel.allOnPage(pageIds)}
          entity="candidates"
          allowSelectAll={false}
          onSelectAllMatching={sel.selectAllMatching}
          onClear={sel.clear}
        >
          <BulkButton icon={Archive} disabled={bulkBusy} onClick={bulkDownload}>
            {bulkBusy ? 'Preparing ZIP…' : 'Download selected (ZIP)'}
          </BulkButton>
          <BulkButton icon={Trash2} danger onClick={() => setConfirmBulk(true)}>
            Delete selected
          </BulkButton>
        </BulkBar>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <FolderOpen className="h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm font-medium text-[var(--text)]">No candidates yet</p>
            <p className="text-sm text-[var(--text-muted)]">
              Add a candidate with their resumes, or quick-import a batch of CVs.
            </p>
          </div>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-xs font-medium text-[var(--text-muted)]">
            <HeaderCheckbox
              checked={sel.allOnPage(pageIds)}
              indeterminate={sel.someOnPage(pageIds)}
              onChange={(on) => sel.setPage(pageIds, on)}
              title="Select page"
            />
            <span>Candidate</span>
          </div>

          {items.map((c) => {
            const isOpen = expanded.has(c.id);
            const contact = [c.email, c.phone].filter(Boolean).join(' · ');
            return (
              <div key={c.id} className="border-b border-[var(--border)] last:border-b-0">
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-secondary)]">
                  <RowCheckbox checked={sel.isSelected(c.id)} onChange={() => sel.toggle(c.id)} />

                  <Tooltip content={isOpen ? 'Hide resumes' : 'Show resumes'}>
                    <button
                      type="button"
                      onClick={() => toggleExpand(c.id)}
                      aria-label={isOpen ? 'Hide resumes' : 'Show resumes'}
                      className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </Tooltip>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-[var(--text)]">
                        {c.name || '—'}
                      </span>
                      {c.headline && (
                        <span className="truncate text-xs text-[var(--text-secondary)]">
                          {c.headline}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-[var(--text-muted)]">{contact || '—'}</p>
                    {c.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.tags.slice(0, 4).map((t) => (
                          <Badge key={t} variant="neutral" size="sm">
                            {t}
                          </Badge>
                        ))}
                        {c.tags.length > 4 && (
                          <Badge variant="neutral" size="sm">
                            +{c.tags.length - 4}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  <Badge variant="info" size="sm">
                    {c.resumes.length} resume{c.resumes.length === 1 ? '' : 's'}
                  </Badge>

                  <span className="hidden w-24 shrink-0 text-right text-xs text-[var(--text-muted)] md:block">
                    {fmtDate(c.createdAt)}
                  </span>

                  <div className="flex shrink-0 items-center gap-1">
                    <Tooltip content="Add resumes">
                      <button
                        type="button"
                        onClick={() => setAddResumesFor(c)}
                        aria-label="Add resumes"
                        className="rounded p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
                      >
                        <FilePlus className="h-4 w-4" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Edit candidate">
                      <button
                        type="button"
                        onClick={() => setEditing(c)}
                        aria-label="Edit candidate"
                        className="rounded p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Delete candidate">
                      <button
                        type="button"
                        onClick={() => setConfirmCandidate(c)}
                        aria-label="Delete candidate"
                        className="rounded p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--error-light)] hover:text-[var(--error-dark)]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </div>
                </div>

                {isOpen && (
                  <div className="space-y-2 bg-[var(--bg-secondary)] px-4 py-3">
                    {c.resumes.length === 0 ? (
                      <p className="py-2 text-center text-xs text-[var(--text-muted)]">
                        No resumes yet.{' '}
                        <button
                          type="button"
                          onClick={() => setAddResumesFor(c)}
                          className="text-primary font-medium hover:underline"
                        >
                          Add one
                        </button>
                      </p>
                    ) : (
                      c.resumes.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[var(--text)]">
                              {r.originalName}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {formatFileSize(r.size)}
                              {r.isPrimary ? ' · Primary' : ''}
                            </p>
                          </div>
                          <Badge variant="neutral" size="sm">
                            {formatOf(r.mimeType)}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            leftIcon={<Download className="h-4 w-4" />}
                            isLoading={downloadingResumeId === r.id}
                            disabled={downloadingResumeId !== null}
                            onClick={() => downloadResume(c, r)}
                          >
                            Download
                          </Button>
                          <Tooltip content="Delete resume">
                            <button
                              type="button"
                              onClick={() => setConfirmResume({ candidate: c, resume: r })}
                              aria-label="Delete resume"
                              className="rounded p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--error-light)] hover:text-[var(--error-dark)]"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </Tooltip>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={total}
        pageSize={limit}
        onPageSizeChange={(s) => {
          setLimit(s);
          setPage(1);
        }}
      />

      {/* Modals */}
      {addMode && (
        <AddOffPlatformModal
          isOpen
          quickImport={addMode === 'quick'}
          onClose={() => setAddMode(null)}
        />
      )}
      {editing && (
        <EditOffPlatformModal isOpen candidate={editing} onClose={() => setEditing(null)} />
      )}
      {addResumesFor && (
        <AddResumesModal isOpen candidate={addResumesFor} onClose={() => setAddResumesFor(null)} />
      )}

      {/* Confirmations */}
      <ConfirmDialog
        isOpen={!!confirmCandidate}
        onClose={() => setConfirmCandidate(null)}
        onConfirm={() => confirmCandidate && deleteCandidate.mutate(confirmCandidate.id)}
        title="Delete candidate"
        message={
          confirmCandidate
            ? `Permanently delete ${confirmCandidate.name} and their ${confirmCandidate.resumes.length} resume(s)? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteCandidate.isPending}
      />
      <ConfirmDialog
        isOpen={!!confirmResume}
        onClose={() => setConfirmResume(null)}
        onConfirm={() =>
          confirmResume &&
          deleteResume.mutate({
            id: confirmResume.candidate.id,
            resumeId: confirmResume.resume.id,
          })
        }
        title="Delete resume"
        message={
          confirmResume
            ? `Permanently delete "${confirmResume.resume.originalName}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteResume.isPending}
      />
      <ConfirmDialog
        isOpen={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={() => bulkDelete.mutate(sel.ids)}
        title="Delete candidates"
        message={`Permanently delete ${sel.count} candidate${sel.count === 1 ? '' : 's'} and all their resumes? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={bulkDelete.isPending}
      />
    </div>
  );
}
