'use client';

import { Plus, X, GripVertical } from 'lucide-react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Switch from '@/components/ui/Switch';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import type { ScreeningQuestionInput, ScreeningQuestionType } from '@/types/job';

const QUESTION_TYPE_OPTIONS = [
  { value: 'TEXT', label: 'Text' },
  { value: 'YES_NO', label: 'Yes / No' },
  { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice' },
  { value: 'NUMERIC', label: 'Numeric' },
];

const MAX_QUESTIONS = 20;

interface ScreeningQuestionBuilderProps {
  questions: ScreeningQuestionInput[];
  onChange: (questions: ScreeningQuestionInput[]) => void;
}

export default function ScreeningQuestionBuilder({
  questions,
  onChange,
}: ScreeningQuestionBuilderProps) {
  const addQuestion = () => {
    if (questions.length >= MAX_QUESTIONS) return;
    onChange([
      ...questions,
      {
        question: '',
        questionType: 'TEXT',
        isRequired: false,
        isDealBreaker: false,
        displayOrder: questions.length,
      },
    ]);
  };

  const updateQuestion = (idx: number, field: keyof ScreeningQuestionInput, value: unknown) => {
    const updated = [...questions];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  const removeQuestion = (idx: number) => {
    onChange(questions.filter((_, i) => i !== idx));
  };

  const moveQuestion = (idx: number, direction: -1 | 1) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= questions.length) return;
    const updated = [...questions];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    onChange(updated.map((q, i) => ({ ...q, displayOrder: i })));
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <label className="text-sm font-medium text-[var(--text)]">
          Screening Questions
          <span className="ml-2 text-xs text-[var(--text-muted)]">
            ({questions.length}/{MAX_QUESTIONS})
          </span>
        </label>
        <Button
          variant="outline"
          size="sm"
          onClick={addQuestion}
          disabled={questions.length >= MAX_QUESTIONS}
          tooltip="Add screening question"
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Question
        </Button>
      </div>

      {questions.length === 0 && (
        <p className="rounded-lg border border-dashed border-[var(--border)] py-4 text-center text-sm text-[var(--text-muted)]">
          No screening questions added. Click &quot;Add Question&quot; to create one.
        </p>
      )}

      <div className="space-y-3">
        {questions.map((sq, idx) => (
          <div key={idx} className="space-y-3 rounded-lg border border-[var(--border)] p-3">
            <div className="flex items-start gap-2">
              <div className="flex flex-col gap-0.5 pt-2">
                <Tooltip content="Move up">
                  <button
                    type="button"
                    onClick={() => moveQuestion(idx, -1)}
                    disabled={idx === 0}
                    className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>
              <div className="flex-1">
                <Input
                  placeholder={`Question ${idx + 1}...`}
                  value={sq.question}
                  onChange={(e) => updateQuestion(idx, 'question', e.target.value)}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeQuestion(idx)}
                className="mt-0.5 shrink-0"
                tooltip="Remove question"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                options={QUESTION_TYPE_OPTIONS}
                value={sq.questionType || 'TEXT'}
                onChange={(v) => updateQuestion(idx, 'questionType', v as ScreeningQuestionType)}
                placeholder="Question type"
              />
              <div className="flex items-center">
                <Switch
                  label="Required"
                  checked={sq.isRequired || false}
                  onChange={() => updateQuestion(idx, 'isRequired', !sq.isRequired)}
                />
              </div>
              <div className="flex items-center">
                <Switch
                  label="Deal Breaker"
                  checked={sq.isDealBreaker || false}
                  onChange={() => updateQuestion(idx, 'isDealBreaker', !sq.isDealBreaker)}
                />
              </div>
            </div>

            {sq.questionType === 'MULTIPLE_CHOICE' && (
              <Textarea
                label="Options (one per line)"
                rows={3}
                placeholder={'Option A\nOption B\nOption C'}
                value={(sq.options || []).join('\n')}
                onChange={(e) =>
                  updateQuestion(idx, 'options', e.target.value.split('\n').filter(Boolean))
                }
              />
            )}

            <Input
              label="Ideal Answer (optional)"
              placeholder={
                sq.questionType === 'YES_NO'
                  ? 'e.g. Yes'
                  : sq.questionType === 'NUMERIC'
                    ? 'e.g. 5'
                    : 'e.g. Expected answer'
              }
              value={sq.idealAnswer || ''}
              onChange={(e) => updateQuestion(idx, 'idealAnswer', e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
