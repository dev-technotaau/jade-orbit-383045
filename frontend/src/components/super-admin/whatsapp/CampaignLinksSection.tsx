'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, Copy, Check, ExternalLink } from 'lucide-react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { showToast } from '@/components/ui/Toast';
import { superAdminWhatsappService as svc } from '@/services/super-admin-whatsapp.service';
import type { ApiError } from '@/types/api';

interface CampaignLinksSectionProps {
  campaignId: string;
}

/**
 * Trackable short links for a campaign. Lists existing links (code, target,
 * clicks), lets the admin mint new ones, and surfaces the public short URL
 * (`<origin>/l/<code>`) with a copy button.
 *
 * React-compiler safe: `window.location.origin` is read inside event handlers
 * (copy / open), never during render.
 */
export default function CampaignLinksSection({ campaignId }: CampaignLinksSectionProps) {
  const qc = useQueryClient();
  const [targetUrl, setTargetUrl] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['wa-campaign-links', campaignId],
    queryFn: () => svc.getCampaignLinks(campaignId),
  });
  const links = data?.data ?? [];

  const createMut = useMutation({
    mutationFn: () => svc.createCampaignLink(campaignId, targetUrl.trim()),
    onSuccess: () => {
      showToast.success('Trackable link created');
      setTargetUrl('');
      qc.invalidateQueries({ queryKey: ['wa-campaign-links', campaignId] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to create link'),
  });

  const shortUrl = (code: string) => `${window.location.origin}/l/${code}`;

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(shortUrl(code));
      setCopiedCode(code);
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
        template instead of the raw link.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            label="Target URL"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://hireadda.com/jobs/123"
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
          <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-[11px] font-semibold text-[var(--text-muted)]">
            <span>Short link / destination</span>
            <span>Clicks</span>
          </div>
          {links.map((l) => (
            <div
              key={l.id}
              className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-[var(--border)] px-3 py-2 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <code className="truncate text-xs font-medium text-[var(--text)]">
                    /l/{l.code}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(l.code)}
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
              <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-xs font-semibold text-[var(--text)]">
                {l.clickCount.toLocaleString('en-IN')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
