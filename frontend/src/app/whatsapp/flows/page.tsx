'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Workflow,
  RefreshCw,
  Plus,
  Eye,
  Upload,
  CheckCircle2,
  Archive,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Textarea from '@/components/ui/Textarea';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import { WA_FLOW_CATEGORIES, type WaFlow } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';
import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PUBLISHED: 'bg-emerald-100 text-emerald-800',
  DEPRECATED: 'bg-amber-100 text-amber-800',
  BLOCKED: 'bg-red-100 text-red-800',
  THROTTLED: 'bg-orange-100 text-orange-800',
};

/**
 * WhatsApp Flows — native multi-screen forms.
 *
 * Sending a flow already worked; managing one did not. Without this page an
 * operator authored in Meta's Flow Builder and copied ids across by hand, with no
 * local record of which flows existed or what state they were in.
 */
export default function FlowsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [categories, setCategories] = useState<string[]>(['OTHER']);
  const [endpointUri, setEndpointUri] = useState('');
  const [jsonFor, setJsonFor] = useState<WaFlow | null>(null);
  const [flowJsonText, setFlowJsonText] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['wa-flows'], queryFn: () => svc.listFlows() });
  const flows = data?.data ?? [];

  const { data: responses } = useQuery({
    queryKey: ['wa-flow-responses'],
    queryFn: () => svc.listFlowResponses(1, 10),
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ['wa-flows'] });
  const fail = (e: unknown) =>
    showToast.error((e as unknown as ApiError).message || 'Something went wrong');

  const syncMut = useMutation({
    mutationFn: () => svc.syncFlows(),
    onSuccess: (r) => {
      showToast.success(`Synced ${r.data?.synced ?? 0} flow(s) from Meta`);
      refresh();
    },
    onError: fail,
  });

  const createMut = useMutation({
    mutationFn: () =>
      svc.createFlow({
        name: name.trim(),
        categories,
        endpointUri: endpointUri.trim() || undefined,
      }),
    onSuccess: () => {
      setName('');
      setEndpointUri('');
      showToast.success('Flow created as a draft');
      refresh();
    },
    onError: fail,
  });

  const publishMut = useMutation({
    mutationFn: (id: string) => svc.publishFlow(id),
    onSuccess: () => {
      showToast.success('Flow published');
      refresh();
    },
    onError: fail,
  });

  const deprecateMut = useMutation({
    mutationFn: (id: string) => svc.deprecateFlow(id),
    onSuccess: () => {
      showToast.success('Flow deprecated');
      refresh();
    },
    onError: fail,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => svc.deleteFlow(id),
    onSuccess: () => {
      showToast.success('Flow deleted');
      refresh();
    },
    onError: fail,
  });

  const previewMut = useMutation({
    mutationFn: (id: string) => svc.previewFlow(id),
    onSuccess: (r) => {
      const url = r.data?.previewUrl;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else showToast.error('Meta returned no preview URL for this flow');
    },
    onError: fail,
  });

  const jsonMut = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(flowJsonText);
      } catch {
        return Promise.reject(new Error('That is not valid JSON'));
      }
      return svc.updateFlowJson(jsonFor!.id, parsed);
    },
    onSuccess: (r) => {
      const errs = r.data?.validationErrors;
      // Meta VALIDATES on upload and returns errors rather than failing the call,
      // so a silent success here would leave a broken flow looking saved.
      if (Array.isArray(errs) && errs.length > 0) {
        showToast.warning(`Uploaded, but Meta reported ${errs.length} validation issue(s)`);
      } else {
        showToast.success('Flow JSON uploaded');
      }
      setJsonFor(null);
      setFlowJsonText('');
      refresh();
    },
    onError: fail,
  });

  const toggleCategory = (c: string) =>
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text)]">
            <Workflow className="h-5 w-5" aria-hidden="true" />
            Flows
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Multi-screen forms customers fill in inside WhatsApp — bookings, sign-ups, surveys.
          </p>
        </div>
        <Button
          variant="secondary"
          leftIcon={<RefreshCw className="h-4 w-4" />}
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
        >
          Sync from Meta
        </Button>
      </div>

      <Card className="mb-6">
        <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Create a flow</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Name"
            placeholder="e.g. Appointment booking"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Data endpoint (optional)"
            placeholder="https://example.com/api/v1/webhooks/flows-data"
            value={endpointUri}
            onChange={(e) => setEndpointUri(e.target.value)}
            helperText="Only for dynamic flows that call back between screens."
          />
        </div>
        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-[var(--text-muted)]">Categories</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {WA_FLOW_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => toggleCategory(c)}
                aria-pressed={categories.includes(c)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  categories.includes(c)
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
                )}
              >
                {c.replace(/_/g, ' ').toLowerCase()}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="mt-4">
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            disabled={!name.trim() || categories.length === 0 || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            Create draft
          </Button>
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Your flows</h2>
        {isLoading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        ) : flows.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No flows yet. Create one here, or press “Sync from Meta” to pull in flows you built in
            Flow Builder.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {flows.map((f) => {
              const errs = Array.isArray(f.validationErrors) ? f.validationErrors : [];
              return (
                <li key={f.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--text)]">{f.name}</span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            STATUS_STYLE[f.status] ?? 'bg-slate-100 text-slate-700',
                          )}
                        >
                          {f.status}
                        </span>
                        {f.endpointUri && (
                          <span className="rounded bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                            dynamic
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                        {f.metaId}
                      </p>
                      {errs.length > 0 && (
                        <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
                          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                          {errs.length} validation issue(s) reported by Meta
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<Eye className="h-4 w-4" />}
                        onClick={() => previewMut.mutate(f.id)}
                      >
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<Upload className="h-4 w-4" />}
                        onClick={() => {
                          setJsonFor(f);
                          setFlowJsonText(
                            f.validationErrors && typeof f.validationErrors === 'object' ? '' : '',
                          );
                        }}
                      >
                        JSON
                      </Button>
                      {f.status === 'DRAFT' && (
                        <Button
                          size="sm"
                          leftIcon={<CheckCircle2 className="h-4 w-4" />}
                          onClick={() => publishMut.mutate(f.id)}
                        >
                          Publish
                        </Button>
                      )}
                      {f.status === 'PUBLISHED' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          leftIcon={<Archive className="h-4 w-4" />}
                          onClick={() => deprecateMut.mutate(f.id)}
                        >
                          Deprecate
                        </Button>
                      )}
                      {f.status === 'DRAFT' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={<Trash2 className="h-4 w-4" />}
                          onClick={() => deleteMut.mutate(f.id)}
                          aria-label="Delete flow"
                        />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-base font-semibold text-[var(--text)]">Recent submissions</h2>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          What customers actually filled in. These were captured on every reply and displayed
          nowhere.
        </p>
        {(responses?.data?.items ?? []).length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No submissions yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {(responses?.data?.items ?? []).map((r) => (
              <li key={r.id} className="py-3">
                <p className="text-xs text-[var(--text-muted)]">
                  {new Date(r.submittedAt).toLocaleString()}
                  {r.flowToken ? ` · token ${r.flowToken.slice(0, 12)}…` : ''}
                </p>
                <pre className="mt-1 overflow-x-auto rounded bg-[var(--bg-secondary)] p-2 font-mono text-[11px] text-[var(--text-secondary)]">
                  {JSON.stringify(r.responseJson, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {jsonFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-[var(--bg)] p-5 shadow-xl">
            <h3 className="text-base font-semibold text-[var(--text)]">
              Flow JSON — {jsonFor.name}
            </h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Meta validates on upload and reports problems rather than rejecting the call, so check
              for warnings after saving.
            </p>
            <Textarea
              className="mt-3 font-mono text-xs"
              rows={16}
              value={flowJsonText}
              onChange={(e) => setFlowJsonText(e.target.value)}
              placeholder='{ "version": "7.0", "screens": [] }'
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setJsonFor(null)}>
                Cancel
              </Button>
              <Button
                disabled={!flowJsonText.trim() || jsonMut.isPending}
                onClick={() => jsonMut.mutate()}
              >
                Upload
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
