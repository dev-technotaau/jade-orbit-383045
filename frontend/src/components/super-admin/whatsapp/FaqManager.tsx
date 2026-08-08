'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Power,
  Trash2,
  X,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { showToast } from '@/components/ui/Toast';
import { confirmDialog } from '@/components/ui/dialog-service';
import FormattedTextarea from '@/components/super-admin/whatsapp/FormattedTextarea';
import { cn } from '@/lib/utils';
import { superAdminWhatsappService as svc } from '@/services/super-admin-whatsapp.service';
import type { WaFaq } from '@/types/whatsapp';
import type { ApiError } from '@/types/api';

const QUESTION_MAX = 24;

/**
 * FAQ menu manager — the tappable list customers see on first contact and when
 * they hit a trigger keyword. Supports create / inline-edit / reorder / active
 * toggle / delete. Backed by listFaqs / createFaq / updateFaq / reorderFaqs /
 * deleteFaq; every mutation invalidates `wa-faqs`.
 */
export default function FaqManager() {
  const qc = useQueryClient();

  // Create form
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['wa-faqs'],
    queryFn: () => svc.listFaqs(),
  });
  const items = data?.data ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['wa-faqs'] });

  const createMut = useMutation({
    mutationFn: () => svc.createFaq({ question: question.trim(), answer: answer.trim() }),
    onSuccess: () => {
      showToast.success('FAQ added');
      setQuestion('');
      setAnswer('');
      invalidate();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to add FAQ'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof svc.updateFaq>[1] }) =>
      svc.updateFaq(id, body),
    onSuccess: () => {
      showToast.success('FAQ updated');
      setEditingId(null);
      invalidate();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to update FAQ'),
  });

  const reorderMut = useMutation({
    mutationFn: (ids: string[]) => svc.reorderFaqs(ids),
    onSuccess: () => {
      showToast.success('FAQ order updated');
      invalidate();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to reorder FAQs'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => svc.deleteFaq(id),
    onSuccess: () => {
      showToast.success('FAQ deleted');
      invalidate();
    },
    onError: (e) => showToast.error((e as unknown as ApiError).message || 'Failed to delete FAQ'),
  });

  const submitCreate = () => {
    if (!question.trim()) return showToast.error('Enter a question');
    if (!answer.trim()) return showToast.error('Enter an answer');
    createMut.mutate();
  };

  const startEdit = (faq: WaFaq) => {
    setEditingId(faq.id);
    setEditQuestion(faq.question);
    setEditAnswer(faq.answer);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditQuestion('');
    setEditAnswer('');
  };

  const saveEdit = (faq: WaFaq) => {
    if (!editQuestion.trim()) return showToast.error('Enter a question');
    if (!editAnswer.trim()) return showToast.error('Enter an answer');
    updateMut.mutate({
      id: faq.id,
      body: { question: editQuestion.trim(), answer: editAnswer.trim() },
    });
  };

  const toggleActive = (faq: WaFaq) =>
    updateMut.mutate({ id: faq.id, body: { isActive: !faq.isActive } });

  // Move the FAQ at `index` by `delta` (-1 up / +1 down) and persist new order.
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const ids = items.map((f) => f.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(target, 0, moved);
    reorderMut.mutate(ids);
  };

  const handleDelete = async (faq: WaFaq) => {
    const ok = await confirmDialog({
      title: 'Delete FAQ',
      message: `Delete the FAQ "${faq.question}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteMut.mutate(faq.id);
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <ListChecks className="h-4 w-4 text-[var(--primary)]" /> FAQ menu
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Shown to customers as a tappable list on first contact and when they message one of the
          trigger keywords. Tapping an FAQ auto-sends its answer. Up to 10 are shown; keep questions
          short (WhatsApp caps the list label at 24 characters).
        </p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-white">
        {/* Create form */}
        <div className="space-y-3 border-b border-[var(--border)] p-4">
          <Input
            label="Question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={QUESTION_MAX}
            placeholder="e.g. How do I apply?"
            helperText={`${question.length}/${QUESTION_MAX}`}
          />
          <FormattedTextarea
            label="Answer"
            value={answer}
            onChange={setAnswer}
            rows={3}
            placeholder="The reply sent when a customer taps this FAQ…"
          />
          <div className="flex justify-end">
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              isLoading={createMut.isPending}
              onClick={submitCreate}
            >
              Add FAQ
            </Button>
          </div>
        </div>

        {/* List */}
        {isLoading && (
          <p className="flex items-center justify-center gap-2 p-8 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading FAQs…
          </p>
        )}
        {isError && <p className="p-4 text-center text-sm text-red-600">Failed to load FAQs.</p>}
        {!isLoading && !isError && items.length === 0 && (
          <p className="p-8 text-center text-sm text-[var(--text-muted)]">No FAQs yet.</p>
        )}

        {!isLoading && !isError && items.length > 0 && (
          <ul className="divide-y divide-[var(--border)]">
            {items.map((faq, index) => {
              const isEditing = editingId === faq.id;
              return (
                <li key={faq.id} className={cn('p-4', !faq.isActive && !isEditing && 'opacity-50')}>
                  {isEditing ? (
                    <div className="space-y-3">
                      <Input
                        label="Question"
                        value={editQuestion}
                        onChange={(e) => setEditQuestion(e.target.value)}
                        maxLength={QUESTION_MAX}
                        placeholder="e.g. How do I apply?"
                        helperText={`${editQuestion.length}/${QUESTION_MAX}`}
                      />
                      <FormattedTextarea
                        label="Answer"
                        value={editAnswer}
                        onChange={setEditAnswer}
                        rows={3}
                        placeholder="The reply sent when a customer taps this FAQ…"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          leftIcon={<X className="h-4 w-4" />}
                          onClick={cancelEdit}
                        >
                          Cancel
                        </Button>
                        <Button
                          isLoading={updateMut.isPending && updateMut.variables?.id === faq.id}
                          onClick={() => saveEdit(faq)}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      {/* Reorder controls */}
                      <div className="flex flex-col">
                        <Button
                          variant="ghost"
                          size="icon"
                          tooltip="Move up"
                          disabled={index === 0 || reorderMut.isPending}
                          onClick={() => move(index, -1)}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          tooltip="Move down"
                          disabled={index === items.length - 1 || reorderMut.isPending}
                          onClick={() => move(index, 1)}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Question + answer preview */}
                      <div className="min-w-0 flex-1 pt-1">
                        <p className="font-semibold text-[var(--text)]">{faq.question}</p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-[var(--text-muted)]">
                          {faq.answer || '—'}
                        </p>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          tooltip={faq.isActive ? 'Disable' : 'Enable'}
                          isLoading={updateMut.isPending && updateMut.variables?.id === faq.id}
                          onClick={() => toggleActive(faq)}
                        >
                          <Power
                            className={cn('h-4 w-4', faq.isActive ? 'text-green-600' : undefined)}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          tooltip="Edit"
                          onClick={() => startEdit(faq)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          tooltip="Delete"
                          isLoading={deleteMut.isPending && deleteMut.variables === faq.id}
                          onClick={() => handleDelete(faq)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
