'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Upload,
  Download,
  X,
  Search,
  Ban,
  Pencil,
  FileUp,
  MessageCircle,
  Loader2,
  Info,
  Copy,
  ShieldX,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import DialogShell from '@/components/ui/DialogShell';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Checkbox from '@/components/ui/Checkbox';
import { showToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';
import { confirmDialog } from '@/components/ui/dialog-service';
import { whatsappService as svc } from '@/services/whatsapp.service';
import { parseContactsText, parseContactsFile, type ParseResult } from '@/lib/parse-contacts';
import ContactDpdpActions from '@/components/whatsapp/ContactDpdpActions';
import ContactDetailsDrawer from '@/components/whatsapp/ContactDetailsDrawer';
import ContactBulkActionBar from '@/components/whatsapp/ContactBulkActionBar';
import ContactSegmentBar from '@/components/whatsapp/ContactSegmentBar';
import Pagination from '@/components/ui/Pagination';
import type { WaContact, WaDuplicateGroup, WaImportJob } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

const OPT_IN_OPTIONS = [
  { value: '', label: 'All opt-in states' },
  { value: 'OPTED_IN', label: 'Opted in' },
  { value: 'OPTED_OUT', label: 'Opted out' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

/**
 * Tri-state on purpose: '' has to mean "do not filter on this at all", which a
 * two-way toggle cannot express — the default view is neither blocked-only nor
 * unblocked-only.
 */
const BLOCKED_OPTIONS = [
  { value: '', label: 'Any block state' },
  { value: 'true', label: 'Blocked' },
  { value: 'false', label: 'Not blocked' },
];

/**
 * Suppression is invisible in every other column on this page — a suppressed
 * contact still shows a green OPTED IN badge while every send to them comes
 * back FAILED with 131050 — so it needs a filter of its own. Tri-state for the
 * same reason as the block filter above.
 */
const SUPPRESSED_OPTIONS = [
  { value: '', label: 'Any suppression state' },
  { value: 'true', label: 'Suppressed' },
  { value: 'false', label: 'Not suppressed' },
];

/**
 * Every state the consent field can hold, so the row control can reach all of
 * them. A two-way toggle could not express UNKNOWN, which is where every new
 * contact starts.
 */
/** Dot colours for the consent Select — the trigger itself is a plain control. */
const OPT_IN_DOT: Record<string, string> = {
  OPTED_IN: 'bg-emerald-500',
  OPTED_OUT: 'bg-red-500',
  UNKNOWN: 'bg-gray-400',
};

const OPT_IN_CHOICES = [
  { value: 'UNKNOWN', label: 'UNKNOWN' },
  { value: 'OPTED_IN', label: 'OPTED IN' },
  { value: 'OPTED_OUT', label: 'OPTED OUT' },
] as const;

/**
 * Split the tag box into a tag list.
 *
 * The box holds one OR MORE tags because a saved segment routinely carries
 * several, and applying one here used to keep only `tags[0]` — so the count an
 * operator sanity-checked before launching was for a different, smaller set
 * than the campaign would actually reach.
 */
function splitTagFilter(raw: string): string[] | undefined {
  const tags = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  return tags.length ? tags : undefined;
}

/** Short "when + how" line for a contact row's consent state. */
function consentLine(c: WaContact): string {
  const when = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
      : '';
  if (c.optInStatus === 'OPTED_OUT') {
    const at = when(c.optOutAt);
    return at ? `Opted out ${at}${c.optOutSource ? ` · ${c.optOutSource}` : ''}` : 'Opted out';
  }
  if (c.optInStatus === 'OPTED_IN') {
    const at = when(c.optInAt);
    // No date and no source is the DEFAULT opt-in every new contact inherits,
    // not consent anyone collected. Say which one this is.
    if (!at && !c.optInSource) return 'Opted in by default — no consent recorded';
    return `Opted in${at ? ` ${at}` : ''}${c.optInSource ? ` · ${c.optInSource}` : ''}`;
  }
  return 'Consent unknown';
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState('');
  const [optIn, setOptIn] = useState(true);
  const [replaceTags, setReplaceTags] = useState(false);
  const [fileParse, setFileParse] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Id of the queued import this modal is watching. The work no longer happens
  // inside the submit request — a 5000-row file cannot finish inside the server's
  // request budget, and trying used to time the operator out while rows kept
  // being written behind the failure.
  const [jobId, setJobId] = useState<string | null>(null);

  // A parsed file takes precedence over the paste box; otherwise parse the
  // textarea live so the count stays in sync as you type.
  const parseResult = fileParse ?? parseContactsText(csv);
  const rows = parseResult.rows;

  /** Report the outcome once, whichever way the import finished. */
  const announce = (job: WaImportJob) => {
    showToast.success(
      `Imported: ${job.created} new, ${job.updated} updated, ${job.skipped} skipped`,
    );
    // Surfaced separately, and as a warning, because it is a consent outcome
    // rather than a parse outcome: these rows matched real customers who had
    // replied STOP. The import deliberately did NOT re-subscribe them, and the
    // operator needs to know that happened rather than assume the whole file
    // was applied.
    if (job.skippedOptedOut) {
      showToast.warning(
        `${job.skippedOptedOut} contact${job.skippedOptedOut === 1 ? '' : 's'} had opted out — ` +
          'left opted out. Re-subscribe individually only with fresh consent.',
      );
    }
    qc.invalidateQueries({ queryKey: ['wa-contacts'] });
    onClose();
  };

  const mutation = useMutation({
    mutationFn: () => svc.importContacts({ optIn, replaceTags, contacts: rows }),
    onSuccess: (res) => {
      const job = res.data;
      if (!job) return;
      // A deployment without Redis runs the import inline and answers with the
      // finished job, so there is nothing to poll.
      if (job.status === 'COMPLETED') announce(job);
      else setJobId(job.id);
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Import failed'),
  });

  const jobQuery = useQuery({
    queryKey: ['wa-import-job', jobId],
    queryFn: () => svc.getImportJob(jobId as string),
    enabled: !!jobId,
    // Stop polling the moment the worker is done with it.
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status === 'COMPLETED' || status === 'FAILED' ? false : 1000;
    },
  });
  const job = jobQuery.data?.data ?? null;

  // Announce exactly once, on the transition into a terminal state — the poll
  // keeps returning the same row until it is disabled.
  const announced = useRef(false);
  useEffect(() => {
    if (!job || announced.current) return;
    if (job.status === 'COMPLETED') {
      announced.current = true;
      announce(job);
    } else if (job.status === 'FAILED') {
      announced.current = true;
      showToast.error(job.error || 'Import failed');
    }
    // `announce` closes over the current query client and onClose, both stable
    // for the life of the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  const running = mutation.isPending || (!!jobId && job?.status !== 'FAILED');
  const percent =
    job && job.total > 0 ? Math.min(100, Math.round((job.processed / job.total) * 100)) : 0;

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const parsed = await parseContactsFile(file);
      if (parsed.rows.length === 0) {
        showToast.error('No contacts found in that file');
        clearFile();
        return;
      }
      setFileParse(parsed);
      setFileName(file.name);
    } catch (err) {
      showToast.error((err as Error).message || 'Could not parse that file');
      clearFile();
    } finally {
      setParsing(false);
    }
  };

  const clearFile = () => {
    setFileParse(null);
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <DialogShell onClose={onClose} label="Import contacts">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">Import contacts</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Upload a CSV, Excel (.xlsx), JSON, or vCard (.vcf) file — or paste below. Up to 5,000
          contacts.
        </p>
        {/* Extra columns are no longer thrown away. They become contact
            attributes, which is what makes a list carrying city / order number /
            plan tier personalisable in a campaign at all. */}
        <p className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-muted)]">
          Columns other than <code>phone</code>, <code>name</code> and <code>tags</code> are kept as
          contact attributes — a <code>City</code> column becomes <code>{'{{attr.city}}'}</code>,
          usable in a campaign&apos;s variable mapping.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.json,.vcf,text/csv,application/json,text/vcard"
          onChange={onFileChange}
          className="hidden"
        />
        {fileParse ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <FileUp className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="truncate text-sm text-[var(--text)]">{fileName}</span>
            </div>
            <button
              type="button"
              onClick={clearFile}
              className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
            className="hover:border-primary flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--border)] px-4 py-6 text-center transition-colors hover:bg-[var(--bg-secondary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileUp className="h-6 w-6 text-[var(--text-muted)]" />
            <span className="text-sm font-medium text-[var(--text)]">
              {parsing ? 'Parsing…' : 'Choose a file to upload'}
            </span>
            <span className="text-xs text-[var(--text-muted)]">CSV, XLSX, JSON, or vCard</span>
          </button>
        )}

        <div className="my-4 flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span className="h-px flex-1 bg-[var(--border)]" />
          or paste
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <p className="mb-2 text-xs text-[var(--text-muted)]">
          One contact per line: <code>phone,name,tag1;tag2</code> (name &amp; tags optional).
        </p>
        <Textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          disabled={!!fileParse}
          placeholder={'+919876543210,Asha Verma,leads;mumbai\n+14155550123,John'}
        />
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
          Mark these contacts as opted-in (you have consent)
        </label>
        {/* Tags used to be REPLACED unconditionally, so importing a "mumbai-leads"
            list silently wiped the "vip" and "support" tags those contacts already
            carried. Merging is now the default; replacing has to be asked for. */}
        <label className="mt-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={replaceTags}
            onChange={(e) => setReplaceTags(e.target.checked)}
          />
          Replace existing tags instead of adding to them
        </label>
        {/* Everything the parse threw away, stated up front. A silently truncated
            file used to report only the rows that survived, so an operator imported
            a fifth of their list believing it was complete. */}
        {parseResult.truncated && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This file contains {parseResult.totalSeen.toLocaleString('en-IN')} contacts — only the
            first {rows.length.toLocaleString('en-IN')} will be imported. Split the file and import
            the rest separately.
          </p>
        )}
        {(parseResult.droppedNoPhone > 0 || parseResult.merged > 0) && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {parseResult.droppedNoPhone > 0 &&
              `${parseResult.droppedNoPhone} row(s) had no phone number and were skipped. `}
            {parseResult.merged > 0 &&
              `${parseResult.merged} duplicate row(s) were merged into an existing contact.`}
          </p>
        )}
        {/* Live progress. The import runs on a worker, so this is the only
            thing that tells the operator it is still moving — previously a long
            import was a spinner that eventually turned into a timeout. */}
        {jobId && job && (
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>
                {job.status === 'FAILED'
                  ? 'Import failed'
                  : job.status === 'COMPLETED'
                    ? 'Import complete'
                    : 'Importing…'}
              </span>
              <span>
                {job.processed.toLocaleString('en-IN')} / {job.total.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-300',
                  job.status === 'FAILED' ? 'bg-[var(--error)]' : 'bg-emerald-500',
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
            {job.status === 'FAILED' && job.error && (
              <p className="mt-2 text-xs text-[var(--error)]">{job.error}</p>
            )}
          </div>
        )}
        <div className="mt-5 flex items-center justify-between">
          <span className="text-xs text-[var(--text-muted)]">
            {rows.length} rows detected
            {parseResult.truncated ? ` of ${parseResult.totalSeen.toLocaleString('en-IN')}` : ''}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              {running ? 'Close' : 'Cancel'}
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              isLoading={running}
              disabled={!rows.length || running}
            >
              Import {rows.length || ''}
            </Button>
          </div>
        </div>
        {/* Closing is safe: the worker owns the import from here. */}
        {running && jobId && (
          <p className="mt-2 text-right text-[11px] text-[var(--text-muted)]">
            This runs in the background — you can close this window.
          </p>
        )}
      </div>
    </DialogShell>
  );
}

/**
 * Possible-duplicate report, and the merge that resolves one.
 *
 * Phone is the sole identity in this module, and the normalisation rules
 * manufacture near-duplicates on their own: a number stored before country-code
 * prefixing existed, or an inbound wa_id that differs from the stored phone,
 * produces two rows that each hold real conversation history and each carry
 * their own consent state. Nothing surfaced that, so a customer could be
 * OPTED_OUT on one row and marketed to on the other indefinitely.
 *
 * The operator picks which row SURVIVES; everything else is folded into it and
 * consent is tightened (an opt-out on either side wins).
 */
function DuplicatesModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [survivorByKey, setSurvivorByKey] = useState<Record<string, string>>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['wa-contact-duplicates'],
    queryFn: () => svc.listDuplicateContacts(),
  });
  const groups = data?.data ?? [];

  const mergeMut = useMutation({
    mutationFn: (vars: { survivorId: string; mergeId: string }) =>
      svc.mergeContacts(vars.survivorId, vars.mergeId),
    onSuccess: (res) => {
      const r = res.data;
      showToast.success(
        `Merged — ${r?.messagesMoved ?? 0} message(s) and ${
          (r?.conversationsMoved ?? 0) + (r?.conversationsFolded ?? 0)
        } conversation(s) moved onto the surviving contact.`,
      );
      // Said explicitly rather than left to be discovered: the survivor's
      // consent just changed, and the operator merged two rows expecting a
      // clerical tidy-up, not a marketing state change.
      if (r?.consentTightened) {
        showToast.info(
          'The merged contact had opted out, so the surviving contact is now OPTED OUT.',
        );
      }
      qc.invalidateQueries({ queryKey: ['wa-contacts'] });
      void refetch();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Merge failed'),
  });

  const runMerge = async (key: string, group: WaDuplicateGroup) => {
    const survivorId = survivorByKey[key] ?? group.contacts[0]?.id;
    const losers = group.contacts.filter((c) => c.id !== survivorId);
    if (!survivorId || losers.length === 0) return;
    const survivor = group.contacts.find((c) => c.id === survivorId);
    const ok = await confirmDialog({
      title: 'Merge these contacts',
      message:
        `Everything belonging to ${losers.map((c) => c.phone).join(', ')} moves onto ` +
        `${survivor?.phone ?? 'the surviving contact'}, and those rows are retired. ` +
        'If any of them had opted out, the surviving contact will be opted out too. ' +
        'This cannot be undone.',
      confirmLabel: 'Merge',
      variant: 'danger',
    });
    if (!ok) return;
    // One at a time: each merge re-reads both rows, so firing them together
    // would let two of them resolve the same survivor from stale copies.
    for (const loser of losers) {
      await mergeMut.mutateAsync({ survivorId, mergeId: loser.id }).catch(() => null);
    }
  };

  return (
    <DialogShell onClose={onClose} label="Possible duplicate contacts">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--text)]">
            <Users className="h-5 w-5 text-emerald-600" /> Possible duplicates
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          Contacts whose numbers end in the same nine digits — usually the same person stored twice
          with and without a country code. Choose the row to keep; its consent, tags and history
          absorb the others, and an opt-out on any of them wins.
        </p>

        {isLoading && (
          <p className="p-6 text-center text-sm text-[var(--text-muted)]">Scanning contacts…</p>
        )}
        {!isLoading && isError && (
          <div className="p-6 text-center">
            <p className="text-sm text-[var(--error)]">Could not run the duplicate check.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        )}
        {!isLoading && !isError && groups.length === 0 && (
          <p className="p-6 text-center text-sm text-[var(--text-muted)]">
            No duplicate numbers found.
          </p>
        )}

        <div className="space-y-3">
          {groups.map((group) => {
            const survivorId = survivorByKey[group.key] ?? group.contacts[0]?.id;
            return (
              <div key={group.key} className="rounded-lg border border-[var(--border)] p-3">
                <p className="mb-2 text-[11px] font-medium text-[var(--text-muted)]">
                  …{group.key} · {group.contacts.length} rows
                </p>
                <div className="space-y-1.5">
                  {group.contacts.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--bg-secondary)]"
                    >
                      <input
                        type="radio"
                        name={`survivor-${group.key}`}
                        checked={survivorId === c.id}
                        onChange={() =>
                          setSurvivorByKey((prev) => ({ ...prev, [group.key]: c.id }))
                        }
                        aria-label={`Keep ${c.phone}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--text)]">
                          {c.name || c.phone}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {c.phone} · {c.optInStatus.replace('_', ' ')} · {c.messageCount} message
                          {c.messageCount === 1 ? '' : 's'}
                          {c.tags.length > 0 && ` · ${c.tags.join(', ')}`}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    isLoading={mergeMut.isPending}
                    onClick={() => void runMerge(group.key, group)}
                  >
                    Merge into selected
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DialogShell>
  );
}

function EditModal({ contact, onClose }: { contact: WaContact; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(contact.name ?? '');
  const [tags, setTags] = useState(contact.tags.join(', '));

  const mutation = useMutation({
    mutationFn: () =>
      svc.updateContact(contact.id, {
        name: name.trim() || null,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      showToast.success('Contact updated');
      qc.invalidateQueries({ queryKey: ['wa-contacts'] });
      onClose();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Update failed'),
  });

  return (
    <DialogShell onClose={onClose} label="Edit contact">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">Edit contact</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--bg-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">{contact.phone}</p>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Tags (comma-separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="leads, mumbai"
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} isLoading={mutation.isPending}>
            Save
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}

export default function SuperAdminWhatsappContactsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [optInStatus, setOptInStatus] = useState('');
  const [tag, setTag] = useState('');
  // Tri-state block filter ('' | 'true' | 'false'). `isBlocked` silently drops
  // every outbound send to a contact, so an operator has to be able to LIST the
  // blocked rows — to review, export or bulk-unblock them — rather than spotting
  // the Ban icon a page at a time.
  const [blocked, setBlocked] = useState('');
  // Tri-state suppression filter ('' | 'true' | 'false'), mirroring `blocked`.
  const [suppressed, setSuppressed] = useState('');
  // Applied saved set, sent to the backend as an id. The whole stored filter —
  // attribute, recency and campaign-engagement rules included — is resolved
  // server-side with the campaign's own predicate, so the count on this page is
  // the count a campaign targeting the set will reach.
  const [segmentId, setSegmentId] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [importing, setImporting] = useState(false);
  const [dedupeOpen, setDedupeOpen] = useState(false);
  const [editing, setEditing] = useState<WaContact | null>(null);
  // The contact whose consent record is open. Every field behind this drawer was
  // recorded by the backend and shown nowhere — see ContactDetailsDrawer.
  const [viewing, setViewing] = useState<WaContact | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // "Select all N matching the filter" (acts via backend filters, not the id list).
  const [allMatchingContacts, setAllMatchingContacts] = useState(false);

  // The inputs stay instant; the QUERY runs on a 300ms-settled value. Bound
  // directly, every keystroke fired a request — and each one is a LIKE across
  // the contacts table. The inbox already does exactly this for the same reason.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debouncedTag, setDebouncedTag] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedTag(tag), 300);
    return () => window.clearTimeout(id);
  }, [tag]);

  // The box takes a comma-separated list and matches ANY of them, because that
  // is what a saved segment stores and how a campaign resolves one. A single
  // tag behaves exactly as before.
  const tagList = splitTagFilter(debouncedTag);

  // '' travels as undefined (no predicate at all); `false` is a real filter value
  // and has to survive, which is why this is not the usual `|| undefined`.
  const blockedFilter = blocked === '' ? undefined : blocked === 'true';
  const suppressedFilter = suppressed === '' ? undefined : suppressed === 'true';

  const {
    data,
    isLoading,
    isError,
    refetch: refetchContacts,
  } = useQuery({
    queryKey: [
      'wa-contacts',
      { debouncedSearch, optInStatus, debouncedTag, segmentId, blocked, suppressed, page, limit },
    ],
    queryFn: () =>
      svc.listContacts({
        q: debouncedSearch,
        optInStatus: optInStatus || undefined,
        tags: tagList,
        segmentId,
        blocked: blockedFilter,
        suppressed: suppressedFilter,
        page,
        limit,
      }),
  });
  const contacts = data?.data?.items ?? [];
  const totalPages = data?.data?.totalPages ?? 1;
  const totalMatching = data?.data?.total ?? contacts.length;

  // Reset all-matching when the filter (not the page) changes.
  const contactFilterKey = `${debouncedSearch}|${optInStatus}|${debouncedTag}|${segmentId ?? ''}|${blocked}|${suppressed}`;
  const [prevContactFilterKey, setPrevContactFilterKey] = useState(contactFilterKey);
  if (contactFilterKey !== prevContactFilterKey) {
    setPrevContactFilterKey(contactFilterKey);
    setAllMatchingContacts(false);
  }

  // Drop any selected ids no longer present on the page (after paging, filtering,
  // erasing, or invalidation). Render-time + keyed by the actual id set so it
  // only runs when the visible contacts change (no setState-in-effect).
  const contactIdsKey = contacts.map((c) => c.id).join(',');
  const [prunedKey, setPrunedKey] = useState(contactIdsKey);
  if (contactIdsKey !== prunedKey) {
    setPrunedKey(contactIdsKey);
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(contacts.map((c) => c.id));
      const next = new Set<string>();
      for (const id of prev) if (present.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }

  const allSelected = contacts.length > 0 && selectedIds.size === contacts.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => {
    setSelectedIds((prev) =>
      prev.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.id)),
    );
    setAllMatchingContacts(false);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setAllMatchingContacts(false);
  };

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; body: Parameters<typeof svc.updateContact>[1] }) =>
      svc.updateContact(vars.id, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-contacts'] }),
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Update failed'),
  });

  // "Open chat": the contact row carries no conversation id, so resolve it the
  // way the inbox search would and then navigate to the thread's permalink.
  // Archived and snoozed threads are included — a parked conversation is still
  // the one the operator means — and the phone is matched exactly because the
  // backend search is a `contains`, which would otherwise open a longer number
  // that merely ends with this one.
  const openChatMut = useMutation({
    mutationFn: async (contact: WaContact) => {
      const res = await svc.listConversations({
        q: contact.phone,
        includeArchived: true,
        includeSnoozed: true,
        limit: 20,
      });
      return res.data?.items.find((c) => c.contact.phone === contact.phone) ?? null;
    },
    onSuccess: (conv) => {
      if (!conv) {
        showToast.info('No conversation with this contact yet — start one from the inbox.');
        return;
      }
      router.push(ROUTES.SUPER_ADMIN.WHATSAPP_CONVERSATION(conv.id));
    },
    onError: (e) =>
      showToast.error((e as unknown as ApiError).message || 'Could not open the conversation'),
  });

  return (
    <DashboardLayout
      requiredRole={['ADMIN', 'SUPER_ADMIN']}
      requiredPermission="whatsapp.contacts.view"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
            <Users className="h-6 w-6 text-emerald-600" /> WhatsApp Contacts
          </h1>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={() =>
                svc.exportContacts({
                  optInStatus: optInStatus || undefined,
                  tags: tagList,
                  segmentId,
                  blocked: blockedFilter,
                  suppressed: suppressedFilter,
                  q: debouncedSearch || undefined,
                })
              }
            >
              Export
            </Button>
            <Button
              variant="secondary"
              leftIcon={<Copy className="h-4 w-4" />}
              onClick={() => setDedupeOpen(true)}
            >
              Duplicates
            </Button>
            <Button leftIcon={<Upload className="h-4 w-4" />} onClick={() => setImporting(true)}>
              Import
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name or number…"
              className="pl-9"
            />
          </div>
          <div className="min-w-[160px]">
            <Select
              options={OPT_IN_OPTIONS}
              value={optInStatus}
              onChange={(v) => {
                setOptInStatus(v);
                setPage(1);
              }}
            />
          </div>
          <div className="min-w-[160px]">
            <Select
              options={BLOCKED_OPTIONS}
              value={blocked}
              onChange={(v) => {
                setBlocked(v);
                setPage(1);
              }}
            />
          </div>
          <div className="min-w-[180px]">
            <Select
              options={SUPPRESSED_OPTIONS}
              value={suppressed}
              onChange={(v) => {
                setSuppressed(v);
                setPage(1);
              }}
            />
          </div>
          <div className="min-w-[150px]">
            <Input
              value={tag}
              onChange={(e) => {
                setTag(e.target.value);
                setPage(1);
              }}
              placeholder="Filter by tag (comma-separated)…"
            />
          </div>
          <ContactSegmentBar
            current={{ optInStatus, tags: tagList, segmentId }}
            onApply={(c) => {
              setOptInStatus(c.optInStatus ?? '');
              // Every tag of the segment, not just its first — the list matches
              // them the same way the campaign audience does.
              setTag((c.tags ?? []).join(', '));
              // The set itself travels as an id; the backend resolves the rules
              // the filter boxes here cannot express.
              setSegmentId(c.segmentId);
              setPage(1);
            }}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          {isLoading && (
            <p className="p-6 text-center text-sm text-[var(--text-muted)]">Loading…</p>
          )}
          {/* A failed request rendered the friendly empty state — "No contacts",
              on an account with thousands. Say what actually happened and offer
              a retry, the way the inbox and campaign detail already do. */}
          {!isLoading && isError && (
            <div className="p-8 text-center">
              <p className="text-sm text-[var(--error)]">Could not load contacts.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void refetchContacts()}
              >
                Retry
              </Button>
            </div>
          )}
          {!isLoading && !isError && contacts.length === 0 && (
            <p className="p-8 text-center text-sm text-[var(--text-muted)]">
              No contacts. Import a list, or they appear automatically when people message you.
            </p>
          )}
          {!isLoading && contacts.length > 0 && (
            <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2">
              <Checkbox
                aria-label={allSelected ? 'Deselect all on this page' : 'Select all on this page'}
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
              />
              <span className="text-xs font-medium text-[var(--text-muted)]">
                {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all on page'}
              </span>
            </div>
          )}
          {contacts.map((c) => (
            <div
              key={c.id}
              className={cn(
                'flex items-center justify-between gap-4 border-b border-[var(--border)] px-4 py-3',
                selectedIds.has(c.id) && 'bg-[var(--info-light)]',
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <Checkbox
                  aria-label={`Select ${c.name || c.phone}`}
                  checked={selectedIds.has(c.id)}
                  onChange={() => toggleOne(c.id)}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-[var(--text)]">
                      {c.name || c.phone}
                    </span>
                    {c.isBlocked && <Ban className="h-3.5 w-3.5 text-[var(--error)]" />}
                    {/* Suppression lives in its own table, so nothing on this row
                        used to say it: the contact kept a green OPTED IN badge
                        while every send to them was refused with 131050. */}
                    {c.suppressed && (
                      <span
                        title="On the do-not-contact list — no campaign will send to this number"
                        className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
                      >
                        <ShieldX className="h-3 w-3" /> SUPPRESSED
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {c.phone}
                    {c.tags.length > 0 && ` · ${c.tags.join(', ')}`}
                  </p>
                  {/* When and by what route consent was recorded. The row showed
                      only the status badge, so "opted in" appeared with nothing
                      behind it — the one thing a consent dispute turns on. */}
                  <p className="text-[11px] text-[var(--text-muted)]">{consentLine(c)}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {/* Colour still carries the state at a glance; the shared Select
                    trigger is a plain control by design, so the dot keeps what the
                    old coloured pill was doing. */}
                <span
                  aria-hidden
                  className={cn('h-2 w-2 shrink-0 rounded-full', OPT_IN_DOT[c.optInStatus])}
                />
                <div className="w-[132px]">
                  <Select
                    value={c.optInStatus}
                    onChange={(v) => updateMut.mutate({ id: c.id, body: { optInStatus: v } })}
                    options={OPT_IN_CHOICES as unknown as { value: string; label: string }[]}
                    disabled={updateMut.isPending}
                    size="sm"
                    clearable={false}
                    aria-label={`Marketing consent for ${c.name || c.phone}`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => updateMut.mutate({ id: c.id, body: { isBlocked: !c.isBlocked } })}
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--bg-secondary)]"
                >
                  {c.isBlocked ? 'Unblock' : 'Block'}
                </button>
                <button
                  type="button"
                  onClick={() => openChatMut.mutate(c)}
                  disabled={openChatMut.isPending}
                  className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`Open chat with ${c.name || c.phone}`}
                >
                  {openChatMut.isPending && openChatMut.variables.id === c.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageCircle className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setViewing(c)}
                  className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                  aria-label={`Consent and activity for ${c.name || c.phone}`}
                >
                  <Info className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(c)}
                  className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]"
                  aria-label="Edit contact"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <ContactDpdpActions contact={c} />
              </div>
            </div>
          ))}
        </div>

        {(selectedIds.size > 0 || allMatchingContacts) && (
          <ContactBulkActionBar
            ids={[...selectedIds]}
            totalMatching={totalMatching}
            allMatching={allMatchingContacts}
            filters={{
              // The DEBOUNCED term, like the list query and the export: bulk
              // actions have to run against the same filter that produced the
              // "N matching" count sitting next to the button.
              q: debouncedSearch || undefined,
              optInStatus: optInStatus || undefined,
              tags: tagList,
              segmentId,
              blocked: blockedFilter,
              suppressed: suppressedFilter,
            }}
            onSelectAllMatching={() => setAllMatchingContacts(true)}
            onClear={clearSelection}
            onDone={clearSelection}
          />
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={totalMatching}
          pageSize={limit}
          onPageSizeChange={(s) => {
            setLimit(s);
            setPage(1);
          }}
        />
      </div>

      {importing && <ImportModal onClose={() => setImporting(false)} />}
      {dedupeOpen && <DuplicatesModal onClose={() => setDedupeOpen(false)} />}
      {editing && <EditModal contact={editing} onClose={() => setEditing(null)} />}
      {viewing && <ContactDetailsDrawer contact={viewing} onClose={() => setViewing(null)} />}
    </DashboardLayout>
  );
}
