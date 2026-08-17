'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquarePlus, Plus, Save, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Switch from '@/components/ui/Switch';
import { showToast } from '@/components/ui/Toast';
import { whatsappService as svc } from '@/services/whatsapp.service';
import {
  WA_COMMAND_DESCRIPTION_MAX,
  WA_COMMAND_MAX,
  WA_COMMAND_NAME_MAX,
  WA_ICE_BREAKER_MAX,
  WA_ICE_BREAKER_TEXT_MAX,
  type WaConversationalAutomation,
} from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

const errText = (e: unknown, fallback: string) => (e as unknown as ApiError)?.message || fallback;

/** Seeded from a prop — the parent gates on load, so this only mounts with data. */
function AutomationForm({ initial }: { initial: WaConversationalAutomation }) {
  const qc = useQueryClient();
  const [welcome, setWelcome] = useState(initial.enableWelcomeMessage);
  const [prompts, setPrompts] = useState<string[]>(initial.prompts);
  const [commands, setCommands] = useState(initial.commands);

  const { data: faqData } = useQuery({ queryKey: ['wa-faqs'], queryFn: () => svc.listFaqs() });
  const faqs = faqData?.data ?? [];

  const saveMut = useMutation({
    mutationFn: () =>
      svc.updateConversationalAutomation({
        enableWelcomeMessage: welcome,
        prompts: prompts.map((p) => p.trim()).filter(Boolean),
        commands: commands
          .map((c) => ({ name: c.name.trim(), description: c.description.trim() }))
          .filter((c) => c.name && c.description),
      }),
    onSuccess: (res) => {
      showToast.success('Conversational components saved');
      // Meta normalises what it stores, so redraw from the read-back rather than
      // leaving the form showing what was typed.
      const saved = res.data;
      if (saved) {
        setWelcome(saved.enableWelcomeMessage);
        setPrompts(saved.prompts);
        setCommands(saved.commands);
      }
      qc.invalidateQueries({ queryKey: ['wa-conversational-automation'] });
    },
    onError: (e) => showToast.error(errText(e, 'Could not save the conversational components')),
  });

  /**
   * The FAQ rows are already the answer to "what do customers ask first", and
   * retyping them as ice breakers is the kind of duplication that goes stale —
   * so the topics seed the prompts, trimmed to Meta's four.
   */
  const seedFromFaqs = () => {
    const seeds = faqs
      .filter((f) => f.isActive)
      .map((f) => f.question.trim().slice(0, WA_ICE_BREAKER_TEXT_MAX))
      .filter(Boolean)
      .slice(0, WA_ICE_BREAKER_MAX);
    if (seeds.length === 0) {
      showToast.error('There are no active FAQ topics to seed from');
      return;
    }
    setPrompts(seeds);
  };

  return (
    <div className="space-y-4">
      <Switch
        label="Tell us when a customer opens the chat (Meta welcome-message webhook)"
        checked={welcome}
        onChange={(e) => setWelcome(e.target.checked)}
      />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-[var(--text)]">
              Ice breakers ({prompts.length}/{WA_ICE_BREAKER_MAX})
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Tappable suggestions on an empty chat — the customer picks one instead of having to
              guess what to type.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={seedFromFaqs}>
            Seed from FAQs
          </Button>
        </div>
        {prompts.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              aria-label={`Ice breaker ${i + 1}`}
              value={p}
              maxLength={WA_ICE_BREAKER_TEXT_MAX}
              onChange={(e) =>
                setPrompts((list) => list.map((v, idx) => (idx === i ? e.target.value : v)))
              }
              placeholder="e.g. Check my order status"
            />
            <button
              type="button"
              aria-label={`Remove ice breaker ${i + 1}`}
              onClick={() => setPrompts((list) => list.filter((_, idx) => idx !== i))}
              className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {prompts.length < WA_ICE_BREAKER_MAX && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setPrompts((list) => [...list, ''])}
          >
            Add ice breaker
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium text-[var(--text)]">
            Commands ({commands.length}/{WA_COMMAND_MAX})
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Offered in the customer&apos;s composer after a &ldquo;/&rdquo;. The name is one word;
            the description is what the list shows beside it.
          </p>
        </div>
        {commands.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={`Command ${i + 1} name`}
              value={c.name}
              maxLength={WA_COMMAND_NAME_MAX}
              onChange={(e) =>
                setCommands((list) =>
                  list.map((v, idx) => (idx === i ? { ...v, name: e.target.value } : v)),
                )
              }
              placeholder="orders"
              className="w-40"
            />
            <Input
              aria-label={`Command ${i + 1} description`}
              value={c.description}
              maxLength={WA_COMMAND_DESCRIPTION_MAX}
              onChange={(e) =>
                setCommands((list) =>
                  list.map((v, idx) => (idx === i ? { ...v, description: e.target.value } : v)),
                )
              }
              placeholder="Track a recent order"
              className="min-w-[220px] flex-1"
            />
            <button
              type="button"
              aria-label={`Remove command ${i + 1}`}
              onClick={() => setCommands((list) => list.filter((_, idx) => idx !== i))}
              className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {commands.length < WA_COMMAND_MAX && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setCommands((list) => [...list, { name: '', description: '' }])}
          >
            Add command
          </Button>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => saveMut.mutate()}
          isLoading={saveMut.isPending}
          leftIcon={<Save className="h-4 w-4" />}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

/**
 * Meta's native conversational components for the sending number.
 *
 * Everything else in this console answers a customer who has already written in:
 * the greeting, the away reply and the FAQ menu all fire on an INBOUND message.
 * A customer opening the thread for the first time therefore saw an empty screen
 * and had to invent an opening line — and these three settings, which exist
 * precisely to remove that, could only be configured in Meta Business Manager.
 */
export default function ConversationalAutomationSection() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-conversational-automation'],
    queryFn: () => svc.getConversationalAutomation(),
  });
  const automation = data?.data;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
        <MessageSquarePlus className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Ice breakers
        and commands
      </h2>
      <p className="text-xs text-[var(--text-muted)]">
        What WhatsApp offers a customer before they have typed anything — shown on an empty chat and
        in their composer.
      </p>

      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        {isLoading && (
          <p className="flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}
        {isError && (
          <p className="text-center text-sm text-red-600">
            Failed to load the conversational components from Meta.
          </p>
        )}
        {automation && <AutomationForm initial={automation} />}
      </div>
    </section>
  );
}
