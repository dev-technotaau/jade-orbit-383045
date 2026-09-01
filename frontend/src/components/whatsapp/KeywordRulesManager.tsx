'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { showToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api';
import { confirmDialog } from '@/components/ui/dialog-service';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaKeywordRule } from '@/types/whatsapp';
import KeywordRuleModal from './KeywordRuleModal';
import { useTemplatesByIds } from './TemplatePicker';

const MATCH_TYPE_LABEL: Record<WaKeywordRule['matchType'], string> = {
  exact: 'Exact',
  contains: 'Contains',
  starts: 'Starts with',
  substring: 'Contains (anywhere)',
  regex: 'Regex',
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

  // The FAQ layers are evaluated BEFORE these rules and are configured on a
  // different card of this page, so an FAQ trigger keyword shadows a rule on the
  // same word with nothing here to hint at it. Shares the `wa-settings` cache
  // entry the rest of the settings page already fills.
  const { data: settingsData } = useQuery({
    queryKey: ['wa-settings'],
    queryFn: () => svc.getSettings(),
  });
  const settings = settingsData?.data;
  // A disabled FAQ menu shadows nothing, so its trigger list is not a collision.
  const faqTriggers = settings?.faqMenuEnabled ? (settings.faqTriggerKeywords ?? []) : [];
  const rules = [...(data?.data ?? [])].sort((a, b) => b.priority - a.priority);

  // Resolved per referenced id. The names used to come out of the first 100
  // approved templates, so a rule bound to a template past that point showed a
  // raw cuid in the Reply column instead of the template it answers with.
  const lookupTemplate = useTemplatesByIds(rules.map((r) => r.replyTemplateId));
  const templateName = (id: string): string => {
    const t = lookupTemplate(id);
    return t ? `${t.name} (${t.language})` : id;
  };

  const toggleMut = useMutation({
    mutationFn: (rule: WaKeywordRule) =>
      svc.updateKeywordRule(rule.id, { isActive: !rule.isActive }),
    onSuccess: () => {
      showToast.success('Rule updated');
      qc.invalidateQueries({ queryKey: ['wa-keyword-rules'] });
    },
    onError: (e) => showToast.error(errorMessage(e, 'Failed to update rule')),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => svc.deleteKeywordRule(id),
    onSuccess: () => {
      showToast.success('Rule deleted');
      qc.invalidateQueries({ queryKey: ['wa-keyword-rules'] });
    },
    onError: (e) => showToast.error(errorMessage(e, 'Failed to delete rule')),
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

      <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-muted)]">
        <span className="font-medium text-[var(--text)]">Evaluation order:</span> FAQ menu tap → FAQ
        trigger keywords
        {faqTriggers.length > 0 && <span className="font-mono"> ({faqTriggers.join(', ')})</span>} →
        these rules, highest priority first → welcome message → away message. The first step that
        matches answers, and nothing after it runs.
      </p>

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
                      {rule.action === 'handoff' ? (
                        // A handoff routes rather than answers, so showing its
                        // (optional) acknowledgement text alone would read as an
                        // ordinary auto-reply.
                        <div className="space-y-1">
                          <Badge variant="warning">Hand off to a human</Badge>
                          <span className="block text-xs text-[var(--text-muted)]">
                            {[
                              rule.handoffAssignee ? `assign ${rule.handoffAssignee}` : null,
                              rule.handoffLabel ? `label ${rule.handoffLabel}` : null,
                              rule.handoffStatus ? `status ${rule.handoffStatus}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'no routing configured'}
                          </span>
                        </div>
                      ) : rule.replyTemplateId ? (
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

      {creating && (
        <KeywordRuleModal
          rule={null}
          faqTriggers={faqTriggers}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <KeywordRuleModal
          rule={editing}
          faqTriggers={faqTriggers}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
