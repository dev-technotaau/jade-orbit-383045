'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, Copy, Check, ExternalLink } from 'lucide-react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { ApiError } from '@/types/api';
import type { WaShortLink } from '@/types/whatsapp';

interface CampaignLinksSectionProps {
  campaignId: string;
}

/** Compact metric tile for the click-through header row. */
function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2 text-center">
      <p className="text-base font-bold text-[var(--text)]">{value}</p>
      <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
      {hint && <p className="text-[10px] text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

/**
 * Trackable short links for a campaign. Lists existing links (code, target,
 * clicks), lets the admin mint new ones, and surfaces the public short URL
 * (`<origin>/l/<code>`) with a copy button.
 *
 * The short URL is resolved by the API and read off the link record; it is not
 * assembled from this app's origin, because the /l/:code redirect is served by
 * the API on a different host.
 */
export default function CampaignLinksSection({ campaignId }: CampaignLinksSectionProps) {
  const qc = useQueryClient();
  const [targetUrl, setTargetUrl] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['wa-campaign-links', campaignId],
    queryFn: () => svc.getCampaignLinks(campaignId),
  });
  const stats = data?.data ?? null;
  const links = stats?.links ?? [];

  const createMut = useMutation({
    mutationFn: () => svc.createCampaignLink(campaignId, targetUrl.trim()),
    onSuccess: () => {
      showToast.success('Trackable link created');
      setTargetUrl('');
      qc.invalidateQueries({ queryKey: ['wa-campaign-links', campaignId] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to create link'),
  });

  // The API returns the absolute URL. It used to be assembled here from
  // window.location.origin, which is THIS app's origin — but /l/:code is served
  // by the API on a different host, so every copied link 404'd and then got
  // redirected to /unlock by the app's own gate. Nothing was ever tracked.
  const shortUrl = (l: WaShortLink) => l.url ?? `/l/${l.code}`;

  const copy = async (l: WaShortLink) => {
    try {
      await navigator.clipboard.writeText(shortUrl(l));
      setCopiedCode(l.code);
      showToast.success('Link copied');
      window.setTimeout(() => setCopiedCode(null), 1500);
    } catch {
      showToast.error('Could not copy link');
    }
  };

  const submit = () => {
    const url = targetUrl.trim();
    if (!url) return showToast.error('Enter a target URL');
    if (!/^https?:\/\//i.test(url))
      return showToast.error('Target URL must start with http:// or https://');
    createMut.mutate();
  };

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-white p-4">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-[var(--text-muted)]" />
        <h2 className="text-sm font-semibold text-[var(--text)]">Trackable links</h2>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Shorten a destination URL to track clicks from this campaign. Use the short URL inside your
        template instead of the raw link — the send stamps a per-recipient token onto it, so clicks
        are attributed to the contact who made them.
      </p>

      {stats && stats.links.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Clicks" value={stats.totalClicks.toLocaleString('en-IN')} />
          <Metric
            label="Unique clickers"
            value={stats.uniqueClickers.toLocaleString('en-IN')}
            hint={`of ${stats.delivered.toLocaleString('en-IN')} delivered`}
          />
          <Metric label="CTR" value={`${stats.ctr}%`} hint="unique clickers / delivered" />
          <Metric
            label="Click → conversion"
            value={`${stats.clickToConversionRate}%`}
            hint={`${stats.convertedClickers.toLocaleString('en-IN')} converted within 7 days`}
          />
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            label="Target URL"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://example.com/landing-page"
          />
        </div>
        <Button
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={submit}
          isLoading={createMut.isPending}
        >
          Create link
        </Button>
      </div>

      {links.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--text-muted)]">
          No trackable links yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--border)]">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-[11px] font-semibold text-[var(--text-muted)]">
            <span>Short link / destination</span>
            <span className="text-right">Clicks</span>
            <span className="text-right">Unique</span>
            <span className="text-right">CTR</span>
          </div>
          {links.map((l) => (
            <div
              key={l.id}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-[var(--border)] px-3 py-2 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <code className="truncate text-xs font-medium text-[var(--text)]">
                    /l/{l.code}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(l)}
                    className="rounded p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
                    aria-label="Copy short link"
                  >
                    {copiedCode === l.code ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <a
                  href={l.targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1 truncate text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <span className="truncate">{l.targetUrl}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
              <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-right text-xs font-semibold text-[var(--text)]">
                {l.clickCount.toLocaleString('en-IN')}
              </span>
              <span className="text-right text-xs text-[var(--text-secondary)]">
                {l.uniqueClickers.toLocaleString('en-IN')}
              </span>
              <span className="text-right text-xs font-semibold text-emerald-600">{l.ctr}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
