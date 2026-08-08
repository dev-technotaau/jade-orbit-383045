'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart3, Loader2, Info } from 'lucide-react';
import { whatsappService as svc } from '@/services/whatsapp.service';

const num = (n: number) => n.toLocaleString('en-IN');
const money = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');

function Unavailable({ error }: { error?: string }) {
  return (
    <p className="text-xs text-[var(--text-muted)]">
      {error ? `Not available — ${error}` : 'Not available for this account.'}
    </p>
  );
}

const chip = 'rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs';

/**
 * Official Meta Graph analytics (template_analytics / conversation_analytics /
 * pricing_analytics). Complements the DB-computed dashboards with Meta's
 * authoritative numbers. Each block degrades independently when a field is
 * unavailable for the account (e.g. missing whatsapp_business_management).
 */
export default function MetaAnalyticsSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-meta-analytics', 30],
    queryFn: () => svc.getMetaAnalytics(30),
    staleTime: 30 * 60 * 1000,
  });
  const a = data?.data;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-white p-4">
      <div className="mb-1 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-emerald-600" />
        <h2 className="text-sm font-semibold text-[var(--text)]">Meta official analytics</h2>
      </div>
      <p className="mb-4 flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
        <Info className="h-3 w-3" /> Pulled live from Meta&apos;s Graph API (last 30 days, cached
        ~30&nbsp;min).
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading from Meta…
        </div>
      )}
      {isError && <Unavailable error="request failed" />}

      {a && !a.configured && (
        <p className="text-xs text-[var(--text-muted)]">
          WhatsApp Business Account is not configured.
        </p>
      )}

      {a && a.configured && (
        <div className="space-y-5">
          {/* Template performance */}
          <div>
            <h3 className="mb-2 text-xs font-semibold text-[var(--text)]">Template performance</h3>
            {!a.templates.available ? (
              <Unavailable error={a.templates.error} />
            ) : a.templates.data.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No template sends in this window.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[var(--text-muted)]">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Template</th>
                      <th className="py-1 pr-3 text-right font-medium">Sent</th>
                      <th className="py-1 pr-3 text-right font-medium">Delivered</th>
                      <th className="py-1 pr-3 text-right font-medium">Read</th>
                      <th className="py-1 pr-3 text-right font-medium">Clicked</th>
                      <th className="py-1 text-right font-medium">Read rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.templates.data.map((t) => (
                      <tr key={t.templateId} className="border-t border-[var(--border)]">
                        <td className="py-1.5 pr-3 font-medium text-[var(--text)]">{t.name}</td>
                        <td className="py-1.5 pr-3 text-right">{num(t.sent)}</td>
                        <td className="py-1.5 pr-3 text-right">{num(t.delivered)}</td>
                        <td className="py-1.5 pr-3 text-right">{num(t.read)}</td>
                        <td className="py-1.5 pr-3 text-right">{num(t.clicked)}</td>
                        <td className="py-1.5 text-right text-[var(--text-muted)]">
                          {pct(t.read, t.sent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Conversations by category */}
          <div>
            <h3 className="mb-2 text-xs font-semibold text-[var(--text)]">
              Conversations by category
              {a.conversations.available && (
                <span className="font-normal text-[var(--text-muted)]">
                  {' '}
                  · {num(a.conversations.totalConversations)} total · cost{' '}
                  {money(a.conversations.totalCost)}
                </span>
              )}
            </h3>
            {!a.conversations.available ? (
              <Unavailable error={a.conversations.error} />
            ) : a.conversations.data.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                No conversation data in this window.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {a.conversations.data.map((c) => (
                  <div key={c.category} className={chip}>
                    <span className="font-medium text-[var(--text)]">{c.category}</span>
                    <span className="ml-2 text-[var(--text-muted)]">
                      {num(c.conversations)} · {money(c.cost)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pricing breakdown */}
          <div>
            <h3 className="mb-2 text-xs font-semibold text-[var(--text)]">
              Pricing breakdown
              {a.pricing.available && (
                <span className="font-normal text-[var(--text-muted)]">
                  {' '}
                  · {num(a.pricing.totalVolume)} msgs · cost {money(a.pricing.totalCost)}
                </span>
              )}
            </h3>
            {!a.pricing.available ? (
              <Unavailable error={a.pricing.error} />
            ) : a.pricing.data.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No pricing data in this window.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {a.pricing.data.map((p) => (
                  <div key={`${p.category}-${p.type}`} className={chip}>
                    <span className="font-medium text-[var(--text)]">{p.category}</span>
                    <span className="ml-1 text-[var(--text-muted)]">/ {p.type}</span>
                    <span className="ml-2 text-[var(--text-muted)]">
                      {num(p.volume)} · {money(p.cost)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-[10px] text-[var(--text-muted)]">
            Cost is in your WhatsApp billing currency. These are Meta&apos;s authoritative figures;
            the dashboards above are computed from our own delivery webhooks.
          </p>
        </div>
      )}
    </section>
  );
}
