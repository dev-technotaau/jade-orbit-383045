'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart3, Loader2, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { whatsappService as svc } from '@/services/whatsapp.service';

const num = (n: number) => n.toLocaleString('en-IN');
/**
 * Meta's cost, WITH the currency it is actually billed in.
 *
 * These figures used to render as bare numbers directly beneath ₹ amounts from
 * our own estimate, so a page could show two different currencies under two
 * money-looking labels and give the reader no way to tell them apart.
 */
const money = (n: number, currency: string | null) => {
  const value = n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${value} ${currency}` : value;
};
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
 * pricing_analytics / analytics). Complements the DB-computed dashboards with
 * Meta's authoritative numbers. Each block degrades independently when a field is
 * unavailable for the account (e.g. missing whatsapp_business_management).
 */
export default function MetaAnalyticsSection({ days = 30 }: { days?: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-meta-analytics', days],
    queryFn: () => svc.getMetaAnalytics(days),
    staleTime: 30 * 60 * 1000,
  });
  const a = data?.data;
  // The window Meta ACTUALLY answered for, which is not always the one this panel
  // asked for: Graph's analytics edges only retain ~90 days, so the backend clamps
  // the request and reports what it used in `range.days`. The page's "1y" and
  // "All time" selections both arrive here as 365, so labelling the heading from
  // the prop printed "last 365 days" above 90 days of Meta figures — a panel that
  // is wrong about its own axis, and silently so, which is worse for a reader than
  // the plain "Not available" the unclamped request used to produce.
  const effectiveDays = a?.range.days ?? days;
  const narrowed = effectiveDays < days;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-white p-4">
      <div className="mb-1 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-emerald-600" />
        <h2 className="text-sm font-semibold text-[var(--text)]">Meta official analytics</h2>
      </div>
      <p
        className={cn(
          'flex items-center gap-1 text-[11px] text-[var(--text-muted)]',
          narrowed ? 'mb-1' : 'mb-4',
        )}
      >
        <Info className="h-3 w-3" /> Pulled live from Meta&apos;s Graph API (last {effectiveDays}{' '}
        days, cached ~30&nbsp;min).
      </p>
      {narrowed && (
        <p className="mb-4 text-[11px] text-[var(--text-muted)]">
          Meta keeps only about this much analytics history, so the dashboard&apos;s {days}-day
          range is narrowed for this section — the figures below cover a shorter period than the
          panels above them.
        </p>
      )}

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
            <h3 className="mb-2 text-xs font-semibold text-[var(--text)]">
              Template performance
              {a.templatesTotal > 0 && (
                <span className="font-normal text-[var(--text-muted)]">
                  {' '}
                  · covering {num(a.templatesCovered)} of {num(a.templatesTotal)} templates
                </span>
              )}
            </h3>
            {/* Meta caps template_analytics at 10 ids per call. The backend batches
                across every synced template, but a failed batch or a catalogue past
                the fan-out ceiling still leaves templates out — and a table that
                quietly omits the one template that is under-delivering is worse
                than no table. */}
            {a.templatesCovered < a.templatesTotal && (
              <p className="mb-2 flex items-start gap-1.5 text-[11px] text-amber-700">
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                <span>
                  {num(a.templatesTotal - a.templatesCovered)} template(s) are missing from this
                  table — Meta answered for only part of the catalogue. Retry in a few minutes; the
                  figures below are not the whole picture.
                </span>
              </p>
            )}
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
                  {money(a.conversations.totalCost, a.currency)}
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
                      {num(c.conversations)} · {money(c.cost, a.currency)}
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
                  · {num(a.pricing.totalVolume)} msgs · cost{' '}
                  {money(a.pricing.totalCost, a.currency)}
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
                      {num(p.volume)} · {money(p.cost, a.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Messaging volume — Meta's own SENT/DELIVERED per day. Every other
              volume figure in this product is counted from our message rows, which
              drift downward whenever a status webhook is dropped; this is the
              series they can finally be checked against. */}
          <div>
            <h3 className="mb-2 text-xs font-semibold text-[var(--text)]">
              Messaging volume
              {a.volume.available && (
                <span className="font-normal text-[var(--text-muted)]">
                  {' '}
                  · {num(a.volume.totalSent)} sent · {num(a.volume.totalDelivered)} delivered (
                  {pct(a.volume.totalDelivered, a.volume.totalSent)})
                </span>
              )}
            </h3>
            {!a.volume.available ? (
              <Unavailable error={a.volume.error} />
            ) : a.volume.data.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No messages in this window.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[var(--text-muted)]">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Day</th>
                      <th className="py-1 pr-3 text-right font-medium">Sent</th>
                      <th className="py-1 pr-3 text-right font-medium">Delivered</th>
                      <th className="py-1 text-right font-medium">Delivery rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.volume.data.map((v) => (
                      <tr key={v.date} className="border-t border-[var(--border)]">
                        <td className="py-1.5 pr-3 font-medium text-[var(--text)]">{v.date}</td>
                        <td className="py-1.5 pr-3 text-right">{num(v.sent)}</td>
                        <td className="py-1.5 pr-3 text-right">{num(v.delivered)}</td>
                        <td className="py-1.5 text-right text-[var(--text-muted)]">
                          {pct(v.delivered, v.sent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-[10px] text-[var(--text-muted)]">
            {a.currency
              ? `Cost is in ${a.currency}, your WhatsApp billing currency.`
              : 'Cost is in your WhatsApp billing currency (Meta did not report which).'}{' '}
            These are Meta&apos;s authoritative figures; they are also persisted daily and
            reconciled against our per-category estimate in the spend panel above.
          </p>
        </div>
      )}
    </section>
  );
}
