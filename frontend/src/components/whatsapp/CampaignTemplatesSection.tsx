'use client';

import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Play, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { ApiError } from '@/types/api';

/**
 * Saved campaign blueprints ("save as template"). Lists reusable template+
 * audience+settings bundles and lets the admin spin up a fresh draft from one in
 * a click (or delete it). Hidden when there are none.
 */
export default function CampaignTemplatesSection() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['wa-campaign-templates'],
    queryFn: () => svc.listCampaignTemplates(),
  });
  const templates = data?.data ?? [];

  const useMut = useMutation({
    mutationFn: (id: string) => svc.useCampaignTemplate(id),
    onSuccess: (res) => {
      showToast.success('Campaign created from template');
      const newId = res.data?.id;
      if (newId) router.push(`/whatsapp/campaigns/${newId}`);
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to use template'),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => svc.deleteCampaignTemplate(id),
    onSuccess: () => {
      showToast.success('Template deleted');
      qc.invalidateQueries({ queryKey: ['wa-campaign-templates'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Delete failed'),
  });

  if (!isLoading && templates.length === 0) return null;

  return (
    <section className="rounded-xl border border-[var(--border)] bg-white p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        <Layers className="h-4 w-4 text-emerald-600" /> Saved campaign templates
      </h2>
      <div className="space-y-2">
        {templates.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--text)]">{t.name}</p>
              <p className="truncate text-xs text-[var(--text-muted)]">
                {t.type}
                {t.isAbTest ? ' · A/B' : ''}
                {t.recurrenceDays ? ` · every ${t.recurrenceDays}d` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                leftIcon={<Play className="h-3.5 w-3.5" />}
                isLoading={useMut.isPending && useMut.variables === t.id}
                onClick={() => useMut.mutate(t.id)}
              >
                Use
              </Button>
              <button
                type="button"
                onClick={() => delMut.mutate(t.id)}
                aria-label="Delete template"
                className="rounded-md p-1.5 text-[var(--text-muted)] hover:text-[var(--error)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
