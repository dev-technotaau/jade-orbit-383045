'use client';

import { useQuery } from '@tanstack/react-query';
import { Users, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { whatsappService as svc } from '@/services/whatsapp.service';

const num = (n: number) => n.toLocaleString('en-IN');
/** Paise as rupees. Every money column on this dashboard is stored in paise. */
const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const AUDIENCE_LABELS: Record<string, string> = {
  segment: 'Saved segment',
  upload: 'Uploaded list',
  manual: 'Picked by hand',
};

/**
 * Per-segment performance, side by side.
 *
 * A saved segment could be created, counted and sent to, and then never reported
 * on: "does segment A convert better than segment B" — the question that decides
 * where the next campaign goes — had no answer anywhere in the product, so the
 * only way to compare two audiences was to launch to both and reconcile the
 * numbers by hand.
 *
 * Polled on the server's cache TTL rather than the 30-60s the other panels use:
 * this report resolves one audience filter per segment against the contacts table
 * and is cached for ten minutes, so a faster interval only re-fetches a
 * byte-identical answer.
 */
export default function SegmentPerformanceSection({
  days,
  channelId,
}: {
  /** null / undefined = lifetime, matching the page's range control. */
  days?: number | null;
  channelId?: string;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['wa-analytics-segments', days ?? null, channelId ?? ''],
    queryFn: () => svc.getSegmentPerformance(days ?? undefined, channelId),
    refetchInterval: 10 * 60_000,
  });
  const report = data?.data ?? null;
  const rows = report?.rows ?? [];
  const byAudienceType = report?.byAudienceType ?? [];
  // Named off the RESPONSE, not off the prop: the backend clamps the window it was
  // asked for, and a heading that states a range the figures underneath it do not
  // cover is worse than one that states nothing.
  const windowLabel =
    report === null
      ? 'the selected range'
      : report.window.days === null
        ? 'all time'
        : `the last ${report.window.days} days`;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-white p-4">
      <div className="mb-1 flex items-center gap-2">
        <Users className="h-4 w-4 text-emerald-600" />
        <h2 className="text-sm font-semibold text-[var(--text)]">Segment performance</h2>
      </div>
      <p className="mb-4 text-[11px] text-[var(--text-muted)]">
        Saved audiences over {windowLabel}. Membership is resolved now — the same filter a campaign
        launch resolves — so somebody who has since opted out or been blocked has left the segment,
        and their traffic leaves with them. Churn is attributed through the campaigns sent to the
        segment, which is the half that survives them leaving. For retention over time, read the
        cohort table below.
        {report?.truncated && (
          <>
            {' '}
            Showing the {rows.length} most recently created of {num(report.totalSegments)} saved
            segments.
          </>
        )}
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}
      {isError && (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <p className="text-xs text-[var(--text-muted)]">Failed to load segment performance.</p>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => refetch()}
          >
            Retry
          </Button>
        </div>
      )}

      {report && !isError && (
        <div className="space-y-5">
          {rows.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              No saved segments yet. Save an audience filter as a segment and it will be compared
              here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[var(--text-muted)]">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Segment</th>
                    <th className="py-1 pr-3 text-right font-medium">Contacts</th>
                    <th className="py-1 pr-3 text-right font-medium">Sent</th>
                    <th className="py-1 pr-3 text-right font-medium">Delivered</th>
                    <th className="py-1 pr-3 text-right font-medium">Read rate</th>
                    <th className="py-1 pr-3 text-right font-medium">Failed</th>
                    <th className="py-1 pr-3 text-right font-medium">Replies in</th>
                    <th className="py-1 pr-3 text-right font-medium">Campaigns</th>
                    <th className="py-1 pr-3 text-right font-medium">Opt-outs /1k</th>
                    <th className="py-1 pr-3 text-right font-medium">Conversions</th>
                    <th className="py-1 pr-3 text-right font-medium">Value</th>
                    <th className="py-1 text-right font-medium">Billed cost</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.segmentId} className="border-t border-[var(--border)]">
                      <td className="py-1.5 pr-3 font-medium text-[var(--text)]">{s.name}</td>
                      <td className="py-1.5 pr-3 text-right">{num(s.contacts)}</td>
                      <td className="py-1.5 pr-3 text-right">{num(s.outbound)}</td>
                      <td className="py-1.5 pr-3 text-right">
                        {num(s.delivered)}
                        <span className="ml-1 text-[var(--text-muted)]">({s.deliveryRate}%)</span>
                      </td>
                      <td className="py-1.5 pr-3 text-right">{s.readRate}%</td>
                      <td className="py-1.5 pr-3 text-right">{num(s.failed)}</td>
                      <td className="py-1.5 pr-3 text-right">{num(s.inbound)}</td>
                      <td className="py-1.5 pr-3 text-right">{num(s.campaigns)}</td>
                      <td className="py-1.5 pr-3 text-right">
                        {/* The rate needs a denominator to mean anything: 40 opt-outs is
                            excellent after a 200k send and alarming after a 2k one. With
                            no campaign sent to this segment in the window there is no
                            denominator at all, so it prints an em dash rather than 0. */}
                        {s.campaignDelivered > 0 ? (
                          <>
                            {s.optOutsPer1000}
                            <span className="ml-1 text-[var(--text-muted)]">
                              ({num(s.optOuts)})
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-right">{num(s.conversions)}</td>
                      <td className="py-1.5 pr-3 text-right">{rupees(s.conversionValuePaise)}</td>
                      <td className="py-1.5 text-right text-[var(--text-muted)]">
                        {/* Meta only prices some accounts' status callbacks, so zero here
                            means "never reported", not "free". */}
                        {s.costPaise > 0 ? rupees(s.costPaise) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* How the audience was chosen, across every launched campaign in the
              window — the coarse version of the same question for deployments that
              blast uploaded lists instead of maintaining segments. */}
          <div>
            <h3 className="mb-2 text-xs font-semibold text-[var(--text)]">
              Campaigns by audience type
            </h3>
            {byAudienceType.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                No campaigns were launched in this range.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {byAudienceType.map((a) => (
                  <div
                    key={a.audienceType}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
                  >
                    <span className="font-medium text-[var(--text)]">
                      {AUDIENCE_LABELS[a.audienceType] ?? a.audienceType}
                    </span>
                    <span className="ml-2 text-[var(--text-muted)]">
                      {num(a.campaigns)} campaign(s) · {num(a.recipients)} recipients ·{' '}
                      {a.deliveryRate}% delivered · {a.readRate}% read
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
