'use client';

import { Plus, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import ServerAutoSuggest from '@/components/ui/ServerAutoSuggest';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import Select from '@/components/ui/Select';
import type { ProfileSectionProps } from './types';
import type { LanguageEntry } from '@/types/candidate';

export default function LanguagesSection({ form, updateField }: ProfileSectionProps) {
  const addLanguage = () => {
    const newLang: LanguageEntry = { language: '', proficiency: 'BASIC' };
    updateField('languageProficiency', [...(form.languageProficiency || []), newLang]);
  };

  const updateLanguage = (index: number, field: keyof LanguageEntry, value: string) => {
    const updated = [...(form.languageProficiency || [])];
    updated[index] = { ...updated[index], [field]: value } as LanguageEntry;
    updateField('languageProficiency', updated);
  };

  const removeLanguage = (index: number) => {
    updateField(
      'languageProficiency',
      (form.languageProficiency || []).filter((_, i) => i !== index),
    );
  };

  return (
    <>
      <Card>
        <h3 className="mb-4 text-lg font-semibold text-[var(--text)]">Languages (Quick List)</h3>
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          List languages you can speak (for detailed proficiency levels, use the section below)
        </p>
        <ServerAutoSuggest
          category="language"
          placeholder="Search languages..."
          value={form.languages || []}
          onChange={(val) => updateField('languages', val as string[])}
          multiple
          allowCreate
          createLabel={(q) => `Add "${q}"`}
          maxSelections={20}
        />
      </Card>

      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text)]">
              Language Proficiency (Detailed)
            </h2>
            <Button
              size="sm"
              variant="outline"
              onClick={addLanguage}
              tooltip="Add a new language proficiency"
            >
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {(form.languageProficiency || []).length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">
              No languages added. Click &quot;Add&quot; to add your language proficiencies.
            </p>
          ) : (
            (form.languageProficiency || []).map((lang, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1">
                  <ServerSuggestionInput
                    category="language"
                    label={i === 0 ? 'Language' : undefined}
                    placeholder="e.g. English, Hindi"
                    value={lang.language}
                    onChange={(val) => updateLanguage(i, 'language', val)}
                  />
                </div>
                <div className="w-44">
                  <Select
                    label={i === 0 ? 'Proficiency' : undefined}
                    options={[
                      { value: 'BASIC', label: 'Basic' },
                      { value: 'INTERMEDIATE', label: 'Intermediate' },
                      { value: 'FLUENT', label: 'Fluent' },
                      { value: 'NATIVE', label: 'Native' },
                    ]}
                    value={lang.proficiency}
                    onChange={(v) => updateLanguage(i, 'proficiency', v)}
                  />
                </div>
                <Tooltip content="Remove this language">
                  <button
                    onClick={() => removeLanguage(i)}
                    className={`cursor-pointer text-[var(--error)] hover:text-[var(--error-dark)] ${i === 0 ? 'mt-6' : ''}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>
            ))
          )}
        </div>
      </Card>
    </>
  );
}
