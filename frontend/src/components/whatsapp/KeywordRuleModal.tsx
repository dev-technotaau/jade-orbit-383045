'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import FormattedTextarea from '@/components/whatsapp/FormattedTextarea';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaKeywordRule } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

type MatchType = 'exact' | 'contains' | 'starts';
type ReplyMode = 'text' | 'template';

const MATCH_TYPE_OPTIONS: { value: MatchType; label: string }[] = [
  { value: 'exact', label: 'Exact match' },
  { value: 'contains', label: 'Contains' },
  { value: 'starts', label: 'Starts with' },
];

const REPLY_MODE_OPTIONS: { value: ReplyMode; label: string }[] = [
  { value: 'text', label: 'Free text reply' },
  { value: 'template', label: 'Approved template' },
];

/**
 * Create or edit a keyword auto-responder rule. Reply is either a free-text
 * body OR an approved template (mutually exclusive). Backed by
 * createKeywordRule / updateKeywordRule and invalidates `wa-keyword-rules`.
 */
export default function KeywordRuleModal({
  rule,
  onClose,
}: {
  rule: WaKeywordRule | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!rule;

  const [name, setName] = useState(rule?.name ?? '');
  const [match, setMatch] = useState(rule?.match ?? '');
  const [matchType, setMatchType] = useState<MatchType>(rule?.matchType ?? 'contains');
  const [priority, setPriority] = useState<number>(rule?.priority ?? 0);
  const [isActive, setIsActive] = useState<boolean>(rule?.isActive ?? true);
  const [replyMode, setReplyMode] = useState<ReplyMode>(
    rule?.replyTemplateId ? 'template' : 'text',
  );
  const [replyText, setReplyText] = useState(rule?.replyText ?? '');
  const [replyTemplateId, setReplyTemplateId] = useState(rule?.replyTemplateId ?? '');

  const { data: templatesData } = useQuery({
    queryKey: ['wa-templates', 'approved'],
    queryFn: () => svc.listTemplates({ status: 'APPROVED', limit: 100 }),
  });
  const templates = templatesData?.data?.items ?? [];
  const templateOptions = templates.map((t) => ({
    value: t.id,
    label: `${t.name} (${t.language})`,
  }));

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        match: match.trim(),
        matchType,
        priority,
        isActive,
        replyText: replyMode === 'text' ? replyText.trim() || null : null,
        replyTemplateId: replyMode === 'template' ? replyTemplateId || null : null,
      };
      return isEdit ? svc.updateKeywordRule(rule.id, payload) : svc.createKeywordRule(payload);
    },
    onSuccess: () => {
      showToast.success(isEdit ? 'Rule updated' : 'Rule created');
      qc.invalidateQueries({ queryKey: ['wa-keyword-rules'] });
      onClose();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to save rule'),
  });

  const submit = () => {
    if (!name.trim()) return showToast.error('Give the rule a name');
    if (!match.trim()) return showToast.error('Enter the keyword to match');
    if (replyMode === 'text' && !replyText.trim()) {
      return showToast.error('Enter the reply text');
    }
    if (replyMode === 'template' && !replyTemplateId) {
      return showToast.error('Pick an approved template');
    }
    mutation.mutate();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? 'Edit auto-responder rule' : 'New auto-responder rule'}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={mutation.isPending}>
            {isEdit ? 'Save changes' : 'Create rule'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Rule name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Pricing enquiry"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Keyword / phrase"
            required
            value={match}
            onChange={(e) => setMatch(e.target.value)}
            placeholder="e.g. price"
          />
          <Select
            label="Match type"
            options={MATCH_TYPE_OPTIONS}
            value={matchType}
            onChange={(v) => setMatchType(v as MatchType)}
            clearable={false}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Priority"
            type="number"
            value={String(priority)}
            onChange={(e) => setPriority(Number(e.target.value) || 0)}
            helperText="Higher priority rules are evaluated first."
          />
          <div>
            <span className="mb-1.5 block text-sm font-medium text-[var(--text)]">Status</span>
            <label className="flex h-10 cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] bg-white px-3">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              <span className="text-sm text-[var(--text)]">{isActive ? 'Active' : 'Inactive'}</span>
            </label>
          </div>
        </div>

        <Select
          label="Reply with"
          options={REPLY_MODE_OPTIONS}
          value={replyMode}
          onChange={(v) => setReplyMode(v as ReplyMode)}
          clearable={false}
        />

        {replyMode === 'text' ? (
          <FormattedTextarea
            label="Reply text"
            rows={4}
            value={replyText}
            onChange={setReplyText}
            placeholder="Thanks for reaching out! Our pricing starts at…"
            maxLength={1024}
          />
        ) : (
          <Select
            label="Approved template"
            options={templateOptions}
            value={replyTemplateId}
            onChange={setReplyTemplateId}
            searchable
            placeholder={
              templates.length
                ? 'Select an approved template'
                : 'No approved templates — sync first'
            }
          />
        )}
      </div>
    </Modal>
  );
}
