'use client';

import { Plus, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import DatePicker from '@/components/ui/DatePicker';
import type { ProfileSectionProps } from './types';
import type { CourseCompletionEntry, TestScoreEntry } from '@/types/candidate';

export default function CoursesSection({ form, updateField }: ProfileSectionProps) {
  // Courses
  const addCourse = () => updateField('courses', [...(form.courses || []), { name: '' }]);
  const updateCourse = (index: number, updates: Partial<CourseCompletionEntry>) => {
    const updated = [...(form.courses || [])];
    updated[index] = { ...updated[index], ...updates };
    updateField('courses', updated);
  };
  const removeCourse = (index: number) =>
    updateField(
      'courses',
      (form.courses || []).filter((_, i) => i !== index),
    );

  // Test Scores
  const addTestScore = () =>
    updateField('testScores', [...(form.testScores || []), { testName: '', score: '' }]);
  const updateTestScore = (index: number, updates: Partial<TestScoreEntry>) => {
    const updated = [...(form.testScores || [])];
    updated[index] = { ...updated[index], ...updates };
    updateField('testScores', updated);
  };
  const removeTestScore = (index: number) =>
    updateField(
      'testScores',
      (form.testScores || []).filter((_, i) => i !== index),
    );

  return (
    <div className="space-y-6">
      {/* Courses */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text)]">Courses Completed</h2>
            <Button size="sm" variant="outline" onClick={addCourse} tooltip="Add a new course">
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {(form.courses || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              No courses added yet.
            </p>
          ) : (
            (form.courses || []).map((course, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Course {i + 1}</h4>
                  <Tooltip content="Remove this course">
                    <button
                      onClick={() => removeCourse(i)}
                      className="cursor-pointer text-[var(--error)] hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Course Name"
                    value={course.name}
                    onChange={(e) => updateCourse(i, { name: e.target.value })}
                    required
                  />
                  <Input
                    label="Provider"
                    value={course.provider || ''}
                    onChange={(e) => updateCourse(i, { provider: e.target.value })}
                    placeholder="e.g. Coursera, Udemy"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <DatePicker
                    label="Completion Date"
                    value={course.completionDate || ''}
                    onChange={(val) => updateCourse(i, { completionDate: val })}
                  />
                  <Input
                    label="URL"
                    placeholder="https://..."
                    value={course.url || ''}
                    onChange={(e) => updateCourse(i, { url: e.target.value })}
                  />
                  <Input
                    label="Associated With"
                    value={course.associatedWith || ''}
                    onChange={(e) => updateCourse(i, { associatedWith: e.target.value })}
                    placeholder="e.g. Job, Education"
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Test Scores */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text)]">Test Scores</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={addTestScore}
              tooltip="Add a new test score"
            >
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {(form.testScores || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              No test scores added yet.
            </p>
          ) : (
            (form.testScores || []).map((test, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Test Score {i + 1}</h4>
                  <Tooltip content="Remove this test score">
                    <button
                      onClick={() => removeTestScore(i)}
                      className="cursor-pointer text-[var(--error)] hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ServerSuggestionInput
                    category="test_score"
                    label="Test Name"
                    value={test.testName}
                    onChange={(val) => updateTestScore(i, { testName: val })}
                    required
                  />
                  <Input
                    label="Score"
                    value={test.score}
                    onChange={(e) => updateTestScore(i, { score: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DatePicker
                    label="Date of Exam"
                    value={test.dateOfExam || ''}
                    onChange={(val) => updateTestScore(i, { dateOfExam: val })}
                  />
                  <Input
                    label="Associated With"
                    value={test.associatedWith || ''}
                    onChange={(e) => updateTestScore(i, { associatedWith: e.target.value })}
                  />
                </div>
                <Textarea
                  label="Description"
                  value={test.description || ''}
                  onChange={(e) => updateTestScore(i, { description: e.target.value })}
                  rows={2}
                />
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
