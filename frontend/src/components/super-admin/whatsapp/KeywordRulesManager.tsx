'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/dialog-service';
import { superAdminWhatsappService as svc } from '@/services/super-admin-whatsapp.service';
import type { WaKeywordRule } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';
import KeywordRuleModal from './KeywordRuleModal';

const MATCH_TYPE_LABEL: Record<WaKeywordRule['matchType'], string> = {
  exact: 'Exact',
  contains: 'Contains',
  starts: 'Starts with',
};

/**
 * Keyword auto-responder manager — lists rules with create / edit / toggle /
 * delete. Reply column shows either the free text or the bound template id.
 */
export default function KeywordRulesManager() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<WaKeywordRule | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-keyword-rules'],
    queryFn: () => svc.listKeywordRules(),
  });
  const rules = [...(data?.data ?? [])].sort((a, b) => b.priority - a.priority);

  const { data: templatesData } = useQuery({
    queryKey: ['wa-templates', 'approved'],
    queryFn: () => svc.listTemplates({ status: 'APPROVED', limit: 100 }),
  });
  const templateName = (id: string): string => {
    const t = templatesData?.data?.items.find((x) => x.id === id);
    return t ? `${t.name} (${t.language})` : id;
  };

  const toggleMut = useMutation({
    mutationFn: (rule: WaKeywordRule) =>
      svc.updateKeywordRule(rule.id, { isActive: !rule.isActive }),
    onSuccess: () => {
      showToast.success('Rule updated');
      qc.invalidateQueries({ queryKey: ['wa-keyword-rules'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to update rule'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => svc.deleteKeywordRule(id),
    onSuccess: () => {
      showToast.success('Rule deleted');
      qc.invalidateQueries({ queryKey: ['wa-keyword-rules'] });
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to delete rule'),
  });

  const handleDelete = async (rule: WaKeywordRule) => {
    const ok = await confirmDialog({
      title: 'Delete rule',
      message: `Delete the "${rule.name}" rule?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteMut.mutate(rule.id);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">Keyword auto-responder</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Reply automatically when an inbound message matches a keyword.
          </p>
        </div>
        <Button
          variant="secondary"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setCreating(true)}
        >
          New rule
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
        {isLoading && (
          <p className="flex items-center justify-center gap-2 p-8 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading rules…
          </p>
        )}
        {isError && <p className="p-4 text-center text-sm text-red-600">Failed to load rules.</p>}
        {!isLoading && !isError && rules.length === 0 && (
          <p className="p-8 text-center text-sm text-[var(--text-muted)]">
            No auto-responder rules yet.
          </p>
        )}

        {!isLoading && !isError && rules.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Match</th>
                  <th className="px-4 py-2.5 font-medium">Reply</th>
                  <th className="px-4 py-2.5 font-medium">Priority</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr
                    key={rule.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-secondary)]"
                  >
                    <td className="px-4 py-2.5 font-medium text-[var(--text)]">{rule.name}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-[var(--text)]">{rule.match}</span>
                      <span className="ml-1.5 text-xs text-[var(--text-muted)]">
                        {MATCH_TYPE_LABEL[rule.matchType]}
                      </span>
                    </td>
                    <td className="max-w-[18rem] px-4 py-2.5">
                      {rule.replyTemplateId ? (
                        <Badge variant="info">Template: {templateName(rule.replyTemplateId)}</Badge>
                      ) : (
                        <span className="line-clamp-2 text-[var(--text-secondary)]">
                          {rule.replyText || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{rule.priority}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={rule.isActive ? 'success' : 'neutral'}>
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          tooltip={rule.isActive ? 'Disable' : 'Enable'}
                          isLoading={toggleMut.isPending && toggleMut.variables?.id === rule.id}
                          onClick={() => toggleMut.mutate(rule)}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          tooltip="Edit"
                          onClick={() => setEditing(rule)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          tooltip="Delete"
                          isLoading={deleteMut.isPending && deleteMut.variables === rule.id}
                          onClick={() => handleDelete(rule)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && <KeywordRuleModal rule={null} onClose={() => setCreating(false)} />}
      {editing && <KeywordRuleModal rule={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
