'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import FormattedTextarea from '@/components/whatsapp/FormattedTextarea';
import TemplatePicker from '@/components/whatsapp/TemplatePicker';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import { analyzeTemplate, templateParamsBeyondBody } from '@/lib/whatsapp-template-vars';
import type { WaKeywordRule, WaMatchType, WaTemplate } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

type MatchType = WaMatchType;
type ReplyMode = 'text' | 'template';
type RuleAction = 'reply' | 'handoff';

// `substring` and `regex` were live in the engine but unreachable from here.
const MATCH_TYPE_OPTIONS: { value: MatchType; label: string }[] = [
  { value: 'exact', label: 'Exact match' },
  { value: 'contains', label: 'Contains (whole word)' },
  { value: 'starts', label: 'Starts with' },
  { value: 'substring', label: 'Contains (anywhere in the text)' },
  { value: 'regex', label: 'Regular expression' },
];

const REPLY_MODE_OPTIONS: { value: ReplyMode; label: string }[] = [
  { value: 'text', label: 'Free text reply' },
  { value: 'template', label: 'Approved template' },
];

const ACTION_OPTIONS: { value: RuleAction; label: string }[] = [
  { value: 'reply', label: 'Answer the customer' },
  { value: 'handoff', label: 'Hand off to a human' },
];

const HANDOFF_STATUS_OPTIONS = [
  { value: '', label: 'Leave unchanged' },
  { value: 'OPEN', label: 'Open' },
  { value: 'PENDING', label: 'Pending' },
];

/** Escape a trigger word for use inside the word-boundary probe below. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The FAQ trigger keywords this rule would never get to answer.
 *
 * The engine checks FAQ triggers BEFORE keyword rules and returns as soon as one
 * matches, so a rule keyed on a word that is also a trigger is dead on arrival —
 * and the two lists live on different cards of the settings page, so nothing on
 * screen connects them. Mirrors the engine's `contains` comparison (NFKC, case
 * insensitive, whole word) against the rule's own keyword: if the trigger fires
 * on the keyword, it fires on every message the rule was written for.
 */
function shadowingTriggers(match: string, triggers: string[]): string[] {
  const haystack = match.normalize('NFKC').trim().toLowerCase();
  if (!haystack) return [];
  return triggers.filter((trigger) => {
    const needle = trigger.normalize('NFKC').trim().toLowerCase();
    if (!needle) return false;
    try {
      return new RegExp(`(^|\\P{L})${escapeRegex(needle)}(\\P{L}|$)`, 'iu').test(haystack);
    } catch {
      return haystack.includes(needle);
    }
  });
}

/**
 * Create or edit a keyword auto-responder rule.
 *
 * A rule either answers (free text OR an approved template, mutually exclusive)
 * or hands the thread to a human — assigning it, labelling it and setting its
 * status, and silencing the bot on that thread so it does not talk over the agent
 * who picks it up. Without the handoff action "talk to a human" got a canned
 * sentence and escalated to nobody.
 *
 * Backed by createKeywordRule / updateKeywordRule; invalidates `wa-keyword-rules`.
 */
export default function KeywordRuleModal({
  rule,
  faqTriggers = [],
  onClose,
}: {
  rule: WaKeywordRule | null;
  /** Live FAQ trigger keywords, so a keyword the FAQ menu would swallow is flagged. */
  faqTriggers?: string[];
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
  // The template behind `replyTemplateId`, once the picker has resolved it. An
  // edit opens holding only the stored id, so this stays null for a beat.
  const [replyTemplate, setReplyTemplate] = useState<WaTemplate | null>(null);
  // {{n}} values for the reply template. Keyword template replies used to send NO
  // parameters, so a rule pointing at a parameterised template answered the
  // customer with visible empty placeholders.
  const [replyVariables, setReplyVariables] = useState<string[]>(rule?.replyVariables ?? []);
  // Handoff: what happens to the CONVERSATION when this rule matches.
  const [action, setAction] = useState<RuleAction>(rule?.action ?? 'reply');
  const [handoffAssignee, setHandoffAssignee] = useState(rule?.handoffAssignee ?? '');
  const [handoffLabel, setHandoffLabel] = useState(rule?.handoffLabel ?? '');
  const [handoffStatus, setHandoffStatus] = useState<string>(rule?.handoffStatus ?? '');

  const isHandoff = action === 'handoff';
  const shadowedBy = shadowingTriggers(match, faqTriggers);
  /**
   * The reply template's spec, once the picker has resolved it.
   *
   * A rule stores a template id and an ordered list of {{n}} values and nothing
   * else, so anything a template needs beyond those cannot be supplied: Meta
   * refuses the auto-reply with (#131008) and the customer who typed the keyword
   * simply gets no answer, with the failure visible only as the rule's
   * `lastError`. The server refuses such a rule now; this names it first.
   */
  const replySpec =
    replyTemplate && replyTemplate.id === replyTemplateId ? analyzeTemplate(replyTemplate) : null;
  const replyUnsupported = replySpec ? templateParamsBeyondBody(replySpec) : [];

  const mutation = useMutation({
    mutationFn: () => {
      // A handoff routes rather than answers, so it never carries a template —
      // its optional reply text is only an acknowledgement to the customer.
      const payload = {
        name: name.trim(),
        match: match.trim(),
        matchType,
        priority,
        isActive,
        action,
        replyText: isHandoff
          ? replyText.trim() || null
          : replyMode === 'text'
            ? replyText.trim() || null
            : null,
        replyTemplateId: !isHandoff && replyMode === 'template' ? replyTemplateId || null : null,
        replyVariables:
          !isHandoff && replyMode === 'template' && replyVariables.length ? replyVariables : null,
        handoffAssignee: isHandoff ? handoffAssignee.trim() || null : null,
        handoffLabel: isHandoff ? handoffLabel.trim() || null : null,
        handoffStatus: isHandoff ? ((handoffStatus || null) as 'OPEN' | 'PENDING' | null) : null,
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
    if (isHandoff) {
      // A handoff that assigns nobody, labels nothing and leaves the status alone
      // is indistinguishable from no rule at all.
      if (!handoffAssignee.trim() && !handoffLabel.trim() && !handoffStatus) {
        return showToast.error('Set at least one of assignee, label or status for the handoff');
      }
      return mutation.mutate();
    }
    if (replyMode === 'text' && !replyText.trim()) {
      return showToast.error('Enter the reply text');
    }
    if (replyMode === 'template' && !replyTemplateId) {
      return showToast.error('Pick an approved template');
    }
    if (replyMode === 'template' && replyUnsupported.length > 0) {
      return showToast.error(
        `This template needs ${replyUnsupported.join(', ')}, which an auto-reply cannot supply. Pick a template that needs body values alone.`,
      );
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

        {shadowedBy.length > 0 && (
          // Not blocking: the operator may genuinely want the FAQ menu to win, or
          // may be about to change the triggers. It just must not be a surprise.
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-mono">{shadowedBy.join(', ')}</span>{' '}
              {shadowedBy.length === 1 ? 'is an FAQ menu trigger' : 'are FAQ menu triggers'}, and
              the FAQ menu is evaluated before these rules — a customer typing this gets the FAQ
              list and this rule never runs. Change the keyword, or remove it from the FAQ triggers
              on the automation settings card.
            </span>
          </p>
        )}

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

        <div>
          <Select
            label="When it matches"
            options={ACTION_OPTIONS}
            value={action}
            onChange={(v) => setAction(v as RuleAction)}
            clearable={false}
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {isHandoff
              ? 'Routes the thread to an agent and pauses automated replies on it for an hour, so the bot does not talk over them.'
              : 'Sends an automated answer back to the customer.'}
          </p>
        </div>

        {isHandoff ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Assign to"
                value={handoffAssignee}
                onChange={(e) => setHandoffAssignee(e.target.value)}
                placeholder="operator"
                helperText="Operator label the thread is assigned to."
              />
              <Input
                label="Apply label"
                value={handoffLabel}
                onChange={(e) => setHandoffLabel(e.target.value)}
                placeholder="escalation"
                maxLength={40}
              />
            </div>
            <Select
              label="Set status to"
              options={HANDOFF_STATUS_OPTIONS}
              value={handoffStatus}
              onChange={setHandoffStatus}
              clearable={false}
            />
            <FormattedTextarea
              label="Acknowledgement (optional)"
              rows={3}
              value={replyText}
              onChange={setReplyText}
              placeholder="Thanks — I'm passing you to a colleague now."
              maxLength={1024}
            />
          </>
        ) : (
          <Select
            label="Reply with"
            options={REPLY_MODE_OPTIONS}
            value={replyMode}
            onChange={(v) => setReplyMode(v as ReplyMode)}
            clearable={false}
          />
        )}

        {isHandoff ? null : replyMode === 'text' ? (
          <FormattedTextarea
            label="Reply text"
            rows={4}
            value={replyText}
            onChange={setReplyText}
            placeholder="Thanks for reaching out! Our pricing starts at…"
            maxLength={1024}
          />
        ) : (
          <>
            <TemplatePicker
              label="Approved template"
              value={replyTemplateId}
              onChange={(t) => {
                setReplyTemplateId(t?.id ?? '');
                setReplyTemplate(t);
                // A different template has a different set of placeholders, so
                // keeping the old values would silently send them in new slots.
                setReplyVariables([]);
              }}
              onResolve={setReplyTemplate}
            />
            {(() => {
              if (replySpec && replySpec.carouselCards.length > 0) {
                return (
                  <p className="text-error mt-3 text-[11px]">
                    A carousel needs media and text for each of its {replySpec.carouselCards.length}{' '}
                    cards, which an auto-reply cannot supply — Meta would refuse every reply and the
                    customer would simply get no answer. Pick a template without cards.
                  </p>
                );
              }
              // Everything else the rule has no field for, for the same reason.
              if (replyUnsupported.length > 0) {
                return (
                  <p className="text-error mt-3 text-[11px]">
                    This template needs {replyUnsupported.join(', ')}, which an auto-reply cannot
                    supply — Meta would refuse every reply and the customer would get no answer.
                    Pick a template that needs body values alone.
                  </p>
                );
              }
              const n = replySpec?.bodyPositional ?? 0;
              if (n === 0) return null;
              return (
                <div className="mt-3 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                  <p className="text-xs font-semibold text-[var(--text-muted)]">
                    Reply variables — a literal, or {'{{name}}'} / {'{{phone}}'}
                  </p>
                  {Array.from({ length: n }, (_, vi) => (
                    <Input
                      key={vi}
                      label={`{{${vi + 1}}}`}
                      value={replyVariables[vi] ?? ''}
                      placeholder="{{name}}"
                      onChange={(e) => {
                        const next = [...replyVariables];
                        next[vi] = e.target.value;
                        setReplyVariables(next);
                      }}
                    />
                  ))}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </Modal>
  );
}
