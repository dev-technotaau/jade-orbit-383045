'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, ChevronDown, ChevronRight, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import FormattedTextarea from '@/components/whatsapp/FormattedTextarea';
import { confirmDialog } from '@/components/ui/dialog-service';
import { showToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { whatsappService as svc } from '@/services/whatsapp.service';
import type { WaBotFlow, WaBotStep, WaBotStepKind, WaBotChoice } from '@/types/whatsapp';

/**
 * Conversational bot flows.
 *
 * Keyword rules answer one message with one canned line and forget it happened.
 * A flow remembers: it can ask for a name, then an email, branch on the answer
 * and hand the thread to a human with everything it captured. That whole tier of
 * automation did not exist — the console could only offer a flat FAQ list and a
 * keyword table — so anything past a single exchange had to be done by hand.
 *
 * The editor is deliberately a list of steps rather than a canvas: a step's
 * `key` is what `nextStepKey` and every live session reference, so the text a
 * flow is authored in IS the flow. A canvas would hide exactly the field that
 * matters.
 */

const STEP_KINDS: Array<{ value: WaBotStepKind; label: string; hint: string }> = [
  { value: 'message', label: 'Say something', hint: 'Sends a line and moves straight on.' },
  { value: 'ask', label: 'Ask a question', hint: 'Waits for a typed answer and saves it.' },
  { value: 'choice', label: 'Offer choices', hint: 'Up to 3 buttons; each can branch.' },
  {
    value: 'set_attribute',
    label: 'Save to the contact',
    hint: 'Writes a value onto the contact record. Sends nothing.',
  },
  {
    value: 'send_template',
    label: 'Send a template',
    hint: 'An approved template — the only thing deliverable outside the 24h window.',
  },
  { value: 'handoff', label: 'Hand to a human', hint: 'Assigns, labels and pauses the bot.' },
  { value: 'end', label: 'End the flow', hint: 'Optional closing line, then finish.' },
];

const VALIDATIONS = [
  { value: 'text', label: 'Any text' },
  { value: 'number', label: 'A number' },
  { value: 'email', label: 'An email address' },
  { value: 'phone', label: 'A phone number' },
];

const MATCH_TYPES = [
  { value: 'contains', label: 'Contains the word' },
  { value: 'exact', label: 'Exactly matches' },
  { value: 'starts', label: 'Starts with' },
  { value: 'substring', label: 'Contains anywhere (loose)' },
  { value: 'regex', label: 'Regular expression' },
];

/** `label|value|next` per line — the flat form the step editor edits choices in. */
function choicesToText(choices: WaBotChoice[] | null): string {
  return (choices ?? []).map((c) => [c.label, c.value ?? '', c.next ?? ''].join('|')).join('\n');
}

function textToChoices(text: string): WaBotChoice[] {
  return text
    .split('\n')
    .map((line) => line.split('|').map((p) => p.trim()))
    .filter((parts) => parts[0])
    .map((parts) => ({
      label: parts[0].slice(0, 20),
      ...(parts[1] ? { value: parts[1] } : {}),
      ...(parts[2] ? { next: parts[2] } : {}),
    }));
}

export default function BotFlowsManager() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-bot-flows'],
    queryFn: () => svc.listBotFlows(),
  });
  const flows: WaBotFlow[] = data?.data ?? [];

  const refresh = () => void qc.invalidateQueries({ queryKey: ['wa-bot-flows'] });
  const fail = (e: unknown) => showToast.error(errorMessage(e, 'Failed'));

  const createMut = useMutation({
    mutationFn: (name: string) => svc.createBotFlow({ name }),
    onSuccess: (res) => {
      setNewName('');
      setOpenId(res.data?.id ?? null);
      showToast.success('Flow created — add its first step');
      refresh();
    },
    onError: fail,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => svc.deleteBotFlow(id),
    onSuccess: () => {
      showToast.success('Flow deleted');
      refresh();
    },
    onError: fail,
  });

  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <Bot className="h-4 w-4 text-emerald-600" /> Bot flows
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Multi-step conversations: ask a question, remember the answer, branch on it, hand over to
          a human. A flow&apos;s trigger words are checked <strong>before</strong> the keyword rules
          below, and a running flow answers the customer&apos;s next message before anything else.
        </p>
      </div>

      <div className="flex items-end gap-2">
        <div className="max-w-xs flex-1">
          <Input
            label="New flow"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Lead qualification"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) createMut.mutate(newName.trim());
            }}
          />
        </div>
        <Button
          variant="outline"
          leftIcon={<Plus className="h-4 w-4" />}
          isLoading={createMut.isPending}
          disabled={!newName.trim() || createMut.isPending}
          onClick={() => createMut.mutate(newName.trim())}
        >
          Add flow
        </Button>
      </div>

      {isLoading && (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading flows…
        </p>
      )}
      {isError && <p className="py-4 text-center text-sm text-red-600">Failed to load flows.</p>}
      {!isLoading && !isError && flows.length === 0 && (
        <p className="py-4 text-center text-sm text-[var(--text-muted)]">
          No bot flows yet. Everything automated is one keyword in, one canned reply out until you
          add one.
        </p>
      )}

      <div className="space-y-2">
        {flows.map((flow) => (
          <div key={flow.id} className="rounded-lg border border-[var(--border)]">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => setOpenId(openId === flow.id ? null : flow.id)}
                className="flex flex-1 items-center gap-2 text-left"
                aria-expanded={openId === flow.id}
              >
                {openId === flow.id ? (
                  <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                )}
                <span className="text-sm font-medium text-[var(--text)]">{flow.name}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    flow.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600',
                  )}
                >
                  {flow.isActive ? 'Live' : 'Off'}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {flow.steps.length} step{flow.steps.length === 1 ? '' : 's'} · started{' '}
                  {flow.hitCount}× · completed {flow.completedCount}×
                </span>
              </button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${flow.name}`}
                leftIcon={<Trash2 className="h-4 w-4 text-red-600" />}
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: `Delete "${flow.name}"?`,
                    message:
                      'Any customer part-way through this flow is released back to the normal auto-replies.',
                    confirmLabel: 'Delete',
                    variant: 'danger',
                  });
                  if (ok) deleteMut.mutate(flow.id);
                }}
              />
            </div>
            {openId === flow.id && <FlowEditor flow={flow} onChanged={refresh} />}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── One flow: its trigger settings and its steps ── */
function FlowEditor({ flow, onChanged }: { flow: WaBotFlow; onChanged: () => void }) {
  const [name, setName] = useState(flow.name);
  const [isActive, setIsActive] = useState(flow.isActive);
  const [triggers, setTriggers] = useState(flow.triggerKeywords.join(', '));
  const [matchType, setMatchType] = useState<string>(flow.triggerMatchType);
  const [timeout, setTimeoutMinutes] = useState(String(flow.timeoutMinutes));
  const [escapes, setEscapes] = useState(flow.escapeKeywords.join(', '));
  const [cancelMessage, setCancelMessage] = useState(flow.cancelMessage ?? '');
  const [entryStepKey, setEntryStepKey] = useState(flow.entryStepKey ?? '');
  const [newStepKey, setNewStepKey] = useState('');

  const fail = (e: unknown) => showToast.error(errorMessage(e, 'Failed'));

  const saveMut = useMutation({
    mutationFn: () =>
      svc.updateBotFlow(flow.id, {
        name: name.trim(),
        isActive,
        triggerKeywords: triggers
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        triggerMatchType: matchType as WaBotFlow['triggerMatchType'],
        timeoutMinutes: Math.min(10080, Math.max(1, parseInt(timeout, 10) || 60)),
        escapeKeywords: escapes
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        cancelMessage: cancelMessage.trim() || null,
        entryStepKey: entryStepKey.trim() || null,
      }),
    onSuccess: () => {
      showToast.success('Flow saved');
      onChanged();
    },
    onError: fail,
  });

  const addStepMut = useMutation({
    mutationFn: (key: string) =>
      svc.createBotStep(flow.id, { key, kind: 'message', order: flow.steps.length }),
    onSuccess: () => {
      setNewStepKey('');
      onChanged();
    },
    onError: fail,
  });

  return (
    <div className="space-y-4 border-t border-[var(--border)] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          label="Trigger keywords"
          value={triggers}
          onChange={(e) => setTriggers(e.target.value)}
          placeholder="book, appointment"
          helperText="Comma-separated. An inbound message matching any of these starts the flow."
        />
        <Select
          label="Match trigger keywords by"
          options={MATCH_TYPES}
          value={matchType}
          onChange={setMatchType}
          clearable={false}
        />
        <Input
          label="Abandon after (minutes)"
          type="number"
          min={1}
          max={10080}
          value={timeout}
          onChange={(e) => setTimeoutMinutes(e.target.value)}
          helperText="Silence for this long ends the session, so a message days later is not read as an answer."
        />
        <Input
          label="Exit words"
          value={escapes}
          onChange={(e) => setEscapes(e.target.value)}
          placeholder="cancel, stop, menu"
          helperText="Anything the customer can type to leave. A flow with no exit traps them in it."
        />
        <Input
          label="First step (key)"
          value={entryStepKey}
          onChange={(e) => setEntryStepKey(e.target.value)}
          placeholder="(the first step below)"
        />
      </div>

      <FormattedTextarea
        label="Message when the flow is cancelled"
        value={cancelMessage}
        onChange={setCancelMessage}
        rows={2}
        maxLength={1024}
        placeholder="No problem — I've stopped there."
      />

      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4 accent-[var(--primary)]"
        />
        <span className="text-sm font-medium text-[var(--text)]">
          Live — start this flow on its trigger words
        </span>
      </label>

      <div className="flex justify-end">
        <Button
          leftIcon={<Save className="h-4 w-4" />}
          isLoading={saveMut.isPending}
          onClick={() => saveMut.mutate()}
        >
          Save flow
        </Button>
      </div>

      <div className="space-y-2 border-t border-[var(--border)] pt-3">
        <h3 className="text-xs font-semibold text-[var(--text)]">Steps</h3>
        {flow.steps.length === 0 && (
          <p className="text-xs text-[var(--text-muted)]">
            No steps yet — a flow with no steps never starts.
          </p>
        )}
        {flow.steps.map((step) => (
          <StepEditor key={step.id} flow={flow} step={step} onChanged={onChanged} />
        ))}
        <div className="flex items-end gap-2">
          <div className="max-w-xs flex-1">
            <Input
              label="New step key"
              value={newStepKey}
              onChange={(e) => setNewStepKey(e.target.value)}
              placeholder="ask_name"
              helperText="Letters, numbers, - and _. Referenced by the other steps, so keep it meaningful."
            />
          </div>
          <Button
            variant="outline"
            leftIcon={<Plus className="h-4 w-4" />}
            isLoading={addStepMut.isPending}
            disabled={!newStepKey.trim()}
            onClick={() => addStepMut.mutate(newStepKey.trim())}
          >
            Add step
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── One step ── */
function StepEditor({
  flow,
  step,
  onChanged,
}: {
  flow: WaBotFlow;
  step: WaBotStep;
  onChanged: () => void;
}) {
  const [kind, setKind] = useState<string>(step.kind);
  const [prompt, setPrompt] = useState(step.prompt ?? '');
  const [saveAs, setSaveAs] = useState(step.saveAs ?? '');
  const [validation, setValidation] = useState<string>(step.validation);
  const [choices, setChoices] = useState(choicesToText(step.choices));
  const [retryMessage, setRetryMessage] = useState(step.retryMessage ?? '');
  const [value, setValue] = useState(step.value ?? '');
  const [nextStepKey, setNextStepKey] = useState(step.nextStepKey ?? '');
  const [handoffAssignee, setHandoffAssignee] = useState(step.handoffAssignee ?? '');
  const [handoffLabel, setHandoffLabel] = useState(step.handoffLabel ?? '');

  const fail = (e: unknown) => showToast.error(errorMessage(e, 'Failed'));

  const saveMut = useMutation({
    mutationFn: () =>
      svc.updateBotStep(flow.id, step.id, {
        kind: kind as WaBotStepKind,
        prompt: prompt.trim() || null,
        saveAs: saveAs.trim() || null,
        validation: validation as WaBotStep['validation'],
        choices: kind === 'choice' ? textToChoices(choices) : null,
        retryMessage: retryMessage.trim() || null,
        value: value.trim() || null,
        nextStepKey: nextStepKey.trim() || null,
        handoffAssignee: handoffAssignee.trim() || null,
        handoffLabel: handoffLabel.trim() || null,
      }),
    onSuccess: () => {
      showToast.success('Step saved');
      onChanged();
    },
    onError: fail,
  });

  const deleteMut = useMutation({
    mutationFn: () => svc.deleteBotStep(flow.id, step.id),
    onSuccess: () => {
      showToast.success('Step deleted');
      onChanged();
    },
    onError: fail,
  });

  const hint = STEP_KINDS.find((k) => k.value === kind)?.hint ?? '';

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
      <div className="flex items-center gap-2">
        <code className="rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-[var(--text)]">
          {step.key}
        </code>
        <div className="w-56">
          <Select
            options={STEP_KINDS.map((k) => ({ value: k.value, label: k.label }))}
            value={kind}
            onChange={setKind}
            size="sm"
            clearable={false}
          />
        </div>
        <span className="flex-1 text-[11px] text-[var(--text-muted)]">{hint}</span>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Delete step ${step.key}`}
          leftIcon={<Trash2 className="h-4 w-4 text-red-600" />}
          onClick={async () => {
            const ok = await confirmDialog({
              title: `Delete step "${step.key}"?`,
              message: 'Anyone waiting on this step is released from the flow.',
              confirmLabel: 'Delete',
              variant: 'danger',
            });
            if (ok) deleteMut.mutate();
          }}
        />
      </div>

      {kind !== 'set_attribute' && (
        <FormattedTextarea
          label={kind === 'ask' || kind === 'choice' ? 'Question' : 'Message'}
          value={prompt}
          onChange={setPrompt}
          rows={2}
          maxLength={1024}
          placeholder="What's your name?"
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(kind === 'ask' || kind === 'choice' || kind === 'set_attribute') && (
          <Input
            label={kind === 'set_attribute' ? 'Contact field' : 'Save the answer as'}
            value={saveAs}
            onChange={(e) => setSaveAs(e.target.value)}
            placeholder="name"
            helperText="Reuse it later as {{name}} in any message, template parameter or value."
          />
        )}
        {kind === 'ask' && (
          <Select
            label="Accept"
            options={VALIDATIONS}
            value={validation}
            onChange={setValidation}
            clearable={false}
          />
        )}
        {kind === 'set_attribute' && (
          <Input
            label="Value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="{{name}}"
          />
        )}
        {kind === 'handoff' && (
          <>
            <Input
              label="Assign to"
              value={handoffAssignee}
              onChange={(e) => setHandoffAssignee(e.target.value)}
              placeholder="operator"
            />
            <Input
              label="Add label"
              value={handoffLabel}
              onChange={(e) => setHandoffLabel(e.target.value)}
              placeholder="needs-human"
            />
          </>
        )}
        <Input
          label="Then go to (step key)"
          value={nextStepKey}
          onChange={(e) => setNextStepKey(e.target.value)}
          placeholder="(end the flow)"
        />
      </div>

      {kind === 'choice' && (
        <FormattedTextarea
          label="Options — one per line: label|value|next step"
          value={choices}
          onChange={setChoices}
          rows={3}
          maxLength={1024}
          placeholder={'Yes|yes|confirm\nNo|no|goodbye'}
        />
      )}

      {(kind === 'ask' || kind === 'choice') && (
        <Input
          label="If the answer is not accepted"
          value={retryMessage}
          onChange={(e) => setRetryMessage(e.target.value)}
          placeholder="Sorry, that doesn't look right — could you try again?"
        />
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          leftIcon={<Save className="h-4 w-4" />}
          isLoading={saveMut.isPending}
          onClick={() => saveMut.mutate()}
        >
          Save step
        </Button>
      </div>
    </div>
  );
}
