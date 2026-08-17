'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Send, Copy, Check, Webhook as WebhookIcon } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Switch from '@/components/ui/Switch';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import { WA_WEBHOOK_EVENTS, type WaWebhookEndpoint } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';
import { cn } from '@/lib/utils';

/**
 * Outbound webhook subscribers.
 *
 * The backend has always had CRUD, HMAC signing, a retrying delivery queue and a
 * test-fire helper — with no route and no screen, so the only way to register a
 * subscriber was an INSERT by hand and every emitted event fanned out to nobody.
 * This is the surface that makes the module integrable.
 */
export default function WebhooksPage() {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [events, setEvents] = useState<string[]>([...WA_WEBHOOK_EVENTS]);
  const [newSecret, setNewSecret] = useState<{ id: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [openDeliveries, setOpenDeliveries] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['wa-webhooks'],
    queryFn: () => svc.listWebhooks(1, 100),
  });
  const endpoints: WaWebhookEndpoint[] = data?.data?.items ?? [];

  const refresh = () => void qc.invalidateQueries({ queryKey: ['wa-webhooks'] });
  const fail = (e: unknown) =>
    showToast.error((e as unknown as ApiError).message || 'Something went wrong');

  const createMut = useMutation({
    mutationFn: () =>
      svc.createWebhook({ url: url.trim(), events, description: description.trim() || undefined }),
    onSuccess: (res) => {
      // The signing secret is shown ONCE. Nothing echoes it afterwards, so an
      // operator who closes this without copying has to recreate the endpoint.
      if (res.data?.secret) setNewSecret({ id: res.data.id, secret: res.data.secret });
      setUrl('');
      setDescription('');
      showToast.success('Webhook created');
      refresh();
    },
    onError: fail,
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) =>
      svc.updateWebhook(v.id, { isActive: v.isActive }),
    onSuccess: refresh,
    onError: fail,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => svc.deleteWebhook(id),
    onSuccess: () => {
      showToast.success('Webhook deleted');
      refresh();
    },
    onError: fail,
  });

  const testMut = useMutation({
    mutationFn: (id: string) => svc.testWebhook(id),
    onSuccess: () => showToast.success('Test event sent — check your endpoint'),
    onError: fail,
  });

  const replayMut = useMutation({
    mutationFn: (v: { id: string; deliveryId: string }) =>
      svc.replayWebhookDelivery(v.id, v.deliveryId),
    onSuccess: () => showToast.success('Delivery queued for replay'),
    onError: fail,
  });

  const { data: deliveriesData } = useQuery({
    queryKey: ['wa-webhook-deliveries', openDeliveries],
    queryFn: () => svc.listWebhookDeliveries(openDeliveries as string, 1, 20),
    enabled: !!openDeliveries,
  });

  const toggleEvent = (e: string) =>
    setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text)]">
          <WebhookIcon className="h-5 w-5" aria-hidden="true" />
          Webhooks
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Send WhatsApp events to your own systems. Each delivery is signed with the endpoint&apos;s
          secret and retried on failure.
        </p>
      </div>

      {newSecret && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">Signing secret — shown once</p>
          <p className="mt-1 text-xs text-amber-800">
            Store this now. It is never displayed again, and without it your endpoint cannot verify
            that a delivery really came from us.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 truncate rounded border border-amber-300 bg-white px-2 py-1 font-mono text-xs">
              {newSecret.secret}
            </code>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              onClick={async () => {
                await navigator.clipboard.writeText(newSecret.secret);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNewSecret(null)}>
              Done
            </Button>
          </div>
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Add an endpoint</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Endpoint URL"
            placeholder="https://example.com/hooks/whatsapp"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Input
            label="Description (optional)"
            placeholder="e.g. CRM sync"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-[var(--text-muted)]">Events</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {WA_WEBHOOK_EVENTS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => toggleEvent(e)}
                aria-pressed={events.includes(e)}
                className={cn(
                  'rounded-full px-3 py-1 font-mono text-xs transition-colors',
                  events.includes(e)
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="mt-4">
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            disabled={!url.trim() || events.length === 0 || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            Create webhook
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-[var(--text)]">Endpoints</h2>
        {isLoading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        ) : endpoints.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No endpoints yet. Events are being emitted but nothing is subscribed to them.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {endpoints.map((w) => (
              <li key={w.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-[var(--text)]">{w.url}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {w.description ? `${w.description} · ` : ''}
                      {w.events.length} event{w.events.length === 1 ? '' : 's'}
                      {w.failureCount > 0 ? ` · ${w.failureCount} recent failures` : ''}
                    </p>
                    {/* An auto-disabled endpoint is otherwise indistinguishable from
                        one the operator switched off on purpose. Re-enabling clears
                        the strike count server-side. */}
                    {!w.isActive && w.failureCount >= 10 && (
                      <p className="mt-1 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                        Auto-disabled after repeated delivery failures
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={w.isActive}
                      onChange={(e) => toggleMut.mutate({ id: w.id, isActive: e.target.checked })}
                      aria-label={w.isActive ? 'Disable endpoint' : 'Enable endpoint'}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<Send className="h-4 w-4" />}
                      onClick={() => testMut.mutate(w.id)}
                    >
                      Test
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setOpenDeliveries(openDeliveries === w.id ? null : w.id)}
                    >
                      {openDeliveries === w.id ? 'Hide' : 'Deliveries'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={<Trash2 className="h-4 w-4" />}
                      onClick={() => deleteMut.mutate(w.id)}
                      aria-label="Delete endpoint"
                    />
                  </div>
                </div>

                {openDeliveries === w.id && (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)]">
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Event</th>
                          <th className="px-3 py-2 text-left font-medium">Status</th>
                          <th className="px-3 py-2 text-left font-medium">Attempt</th>
                          <th className="px-3 py-2 text-left font-medium">When</th>
                          <th className="px-3 py-2 text-right font-medium">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(deliveriesData?.data?.items ?? []).map((d) => (
                          <tr key={d.id} className="border-t border-[var(--border)]">
                            <td className="px-3 py-2 font-mono">{d.event}</td>
                            <td
                              className={cn(
                                'px-3 py-2 font-medium',
                                d.success ? 'text-emerald-700' : 'text-red-700',
                              )}
                            >
                              {d.statusCode ?? '—'} {d.success ? 'OK' : (d.error ?? 'failed')}
                            </td>
                            <td className="px-3 py-2">{d.attempt}</td>
                            <td className="px-3 py-2">{new Date(d.createdAt).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right">
                              {/* Retries are bounded, so an event that failed while
                                  the subscriber was down was simply lost — the row
                                  recorded the loss and offered no way to undo it. */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => replayMut.mutate({ id: w.id, deliveryId: d.id })}
                                disabled={replayMut.isPending}
                              >
                                Replay
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {(deliveriesData?.data?.items ?? []).length === 0 && (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-3 py-3 text-center text-[var(--text-muted)]"
                            >
                              No deliveries yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </DashboardLayout>
  );
}
