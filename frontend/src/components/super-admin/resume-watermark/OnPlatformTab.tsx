'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Download, Users, Archive } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import Pagination from '@/components/ui/Pagination';
import Tooltip from '@/components/ui/Tooltip';
import Spinner from '@/components/ui/Spinner';
import { showToast } from '@/components/ui/Toast';
import { useBulkSelect, downloadBlob } from '@/hooks/use-bulk-select';
import {
  BulkBar,
  BulkButton,
  HeaderCheckbox,
  RowCheckbox,
} from '@/components/super-admin/email/bulk-ui';
import { resumeWatermarkService as svc } from '@/services/super-admin-resume-watermark.service';
import type { OnPlatformCandidate, OnPlatformResumeType } from '@/types/resume-watermark';

const RESUME_TYPE_OPTIONS: { value: OnPlatformResumeType; label: string }[] = [
  { value: 'any', label: 'Any resume' },
  { value: 'uploaded', label: 'Uploaded' },
  { value: 'generated', label: 'Generated' },
];

/** Max candidates the backend accepts for a single bulk ZIP request. */
const BULK_LIMIT = 100;

/** Derive a human-readable format from an uploaded resume's MIME type. */
function formatOf(mime: string | null): string {
  if (!mime) return 'FILE';
  const m = mime.toLowerCase();
  if (m.includes('pdf')) return 'PDF';
  if (m.includes('wordprocessingml') || m.endsWith('docx')) return 'DOCX';
  if (m.includes('msword') || m.endsWith('doc')) return 'DOC';
  return 'FILE';
}

/** A filesystem-safe filename for a downloaded (watermarked) resume. */
function safeFileName(c: OnPlatformCandidate): string {
  const base = (c.name || c.email || c.userId).trim().replace(/[\\/:*?"<>|]+/g, '_');
  return `${base || 'resume'}.pdf`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

export default function OnPlatformTab() {
  const [q, setQ] = useState('');
  const [resumeType, setResumeType] = useState<OnPlatformResumeType>('any');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [downloading, setDownloading] = useState<string | null>(null); // `${userId}:${type}`
  const [bulkBusy, setBulkBusy] = useState(false);
  const sel = useBulkSelect();

  const { data, isLoading } = useQuery({
    queryKey: ['rw-on', q, resumeType, page, limit],
    queryFn: () => svc.listOnPlatform({ q: q || undefined, resumeType, page, limit }),
  });

  const items = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const totalPages = data?.data?.totalPages ?? Math.max(1, Math.ceil(total / limit));
  const pageIds = items.map((c) => c.userId);

  async function downloadOne(c: OnPlatformCandidate, type: OnPlatformResumeType) {
    const key = `${c.userId}:${type}`;
    setDownloading(key);
    try {
      const blob = await svc.downloadOnPlatform(c.userId, type);
      downloadBlob(blob, safeFileName(c));
    } catch {
      showToast.error('Download failed');
    } finally {
      setDownloading(null);
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
      const blob = await svc.bulkDownloadOnPlatform({ userIds: sel.ids, type: 'any' });
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
        On-platform candidates who have a resume. Downloads are watermarked automatically by the
        server. Select rows to grab several at once as a ZIP.
      </p>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-64">
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search name or email…"
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>
        <div className="w-44">
          <Select
            size="sm"
            options={RESUME_TYPE_OPTIONS}
            value={resumeType}
            onChange={(v) => {
              setResumeType(v as OnPlatformResumeType);
              setPage(1);
            }}
            clearable={false}
          />
        </div>
        <span className="ml-auto text-sm text-[var(--text-muted)]">
          {total.toLocaleString()} candidate{total === 1 ? '' : 's'}
        </span>
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
            <Users className="h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm font-medium text-[var(--text)]">No candidates found</p>
            <p className="text-sm text-[var(--text-muted)]">
              Try a different search or resume-type filter.
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
            const both = c.hasUploaded && c.hasGenerated;
            const meta: string[] = [];
            if (c.hasUploaded) {
              meta.push(formatOf(c.uploadedMime));
              const up = fmtDate(c.uploadedAt);
              if (up) meta.push(`Uploaded ${up}`);
            }
            if (c.hasGenerated) {
              const gen = fmtDate(c.generatedAt);
              if (gen) meta.push(`Generated ${gen}`);
            }

            return (
              <div
                key={c.userId}
                className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0 hover:bg-[var(--bg-secondary)]"
              >
                <RowCheckbox
                  checked={sel.isSelected(c.userId)}
                  onChange={() => sel.toggle(c.userId)}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-[var(--text)]">
                      {c.name || '—'}
                    </span>
                    {c.hasUploaded && (
                      <Tooltip
                        inline
                        content={`${c.uploadedName ?? 'Uploaded resume'} · ${formatOf(c.uploadedMime)}`}
                      >
                        <Badge variant="info" size="sm">
                          Uploaded
                        </Badge>
                      </Tooltip>
                    )}
                    {c.hasGenerated && (
                      <Badge variant="secondary" size="sm">
                        Generated
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    {c.email}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </p>
                  {meta.length > 0 && (
                    <p className="truncate text-[11px] text-[var(--text-muted)]">
                      {meta.join(' · ')}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {both && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        isLoading={downloading === `${c.userId}:uploaded`}
                        disabled={downloading !== null}
                        tooltip="Download the uploaded resume (watermarked)"
                        onClick={() => downloadOne(c, 'uploaded')}
                      >
                        Uploaded
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        isLoading={downloading === `${c.userId}:generated`}
                        disabled={downloading !== null}
                        tooltip="Download the generated resume (watermarked)"
                        onClick={() => downloadOne(c, 'generated')}
                      >
                        Generated
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    leftIcon={<Download className="h-4 w-4" />}
                    isLoading={downloading === `${c.userId}:any`}
                    disabled={downloading !== null}
                    onClick={() => downloadOne(c, 'any')}
                  >
                    Download
                  </Button>
                </div>
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
    </div>
  );
}
