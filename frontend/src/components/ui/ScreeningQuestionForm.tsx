'use client';

import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import type { ScreeningQuestion } from '@/types/job';

interface ScreeningQuestionFormProps {
  questions: ScreeningQuestion[];
  answers: Record<string, string>;
  onChange: (answers: Record<string, string>) => void;
}

export default function ScreeningQuestionForm({
  questions,
  answers,
  onChange,
}: ScreeningQuestionFormProps) {
  const updateAnswer = (questionId: string, value: string) => {
    onChange({ ...answers, [questionId]: value });
  };

  if (questions.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium text-[var(--text)]">Screening Questions</h4>
        <Badge variant="neutral">{questions.length}</Badge>
      </div>

      {questions.map((q) => (
        <div key={q.id} className="space-y-1.5">
          <label className="block text-sm font-medium text-[var(--text)]">
            {q.question}
            {q.isRequired && <span className="text-error ml-0.5">*</span>}
            {q.isDealBreaker && (
              <Badge variant="warning" className="ml-2 text-[10px]">
                Deal Breaker
              </Badge>
            )}
          </label>

          {q.questionType === 'TEXT' && (
            <Textarea
              rows={2}
              placeholder="Your answer..."
              value={answers[q.id] || ''}
              onChange={(e) => updateAnswer(q.id, e.target.value)}
            />
          )}

          {q.questionType === 'YES_NO' && (
            <div className="flex gap-3">
              {['Yes', 'No'].map((opt) => (
                <label key={opt} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name={`screening-${q.id}`}
                    value={opt}
                    checked={answers[q.id] === opt}
                    onChange={() => updateAnswer(q.id, opt)}
                    className="text-primary focus:ring-primary/20 h-4 w-4 border-[var(--border)]"
                  />
                  <span className="text-sm text-[var(--text)]">{opt}</span>
                </label>
              ))}
            </div>
          )}

          {q.questionType === 'MULTIPLE_CHOICE' && q.options && (
            <div className="space-y-2">
              {q.options.map((opt) => (
                <label key={opt} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name={`screening-${q.id}`}
                    value={opt}
                    checked={answers[q.id] === opt}
                    onChange={() => updateAnswer(q.id, opt)}
                    className="text-primary focus:ring-primary/20 h-4 w-4 border-[var(--border)]"
                  />
                  <span className="text-sm text-[var(--text)]">{opt}</span>
                </label>
              ))}
            </div>
          )}

          {q.questionType === 'NUMERIC' && (
            <Input
              type="number"
              placeholder="Enter a number..."
              value={answers[q.id] || ''}
              onChange={(e) => updateAnswer(q.id, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
