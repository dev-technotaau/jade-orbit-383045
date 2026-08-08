'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import Input from '@/components/ui/Input';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import Select from '@/components/ui/Select';
import Tag from '@/components/ui/Tag';
import type { ProfileSectionProps } from './types';
import type { SkillWithProficiency, ITSkillEntry } from '@/types/candidate';

export default function SkillsSection({ form, updateField }: ProfileSectionProps) {
  const [skillInput, setSkillInput] = useState('');

  const addSkill = () => {
    const skill = skillInput.trim();
    if (skill && !form.skills?.includes(skill)) {
      updateField('skills', [...(form.skills || []), skill]);
      setSkillInput('');
    }
  };

  const removeSkill = (skill: string) => {
    updateField(
      'skills',
      (form.skills || []).filter((s) => s !== skill),
    );
  };

  // Skills with Proficiency
  const addSkillWithProficiency = () => {
    const entry: SkillWithProficiency = { skill: '', proficiency: 'INTERMEDIATE' };
    updateField('skillsWithProficiency', [...(form.skillsWithProficiency || []), entry]);
  };
  const updateSkillWithProficiency = (index: number, updates: Partial<SkillWithProficiency>) => {
    const updated = [...(form.skillsWithProficiency || [])];
    updated[index] = { ...updated[index], ...updates };
    updateField('skillsWithProficiency', updated);
  };
  const removeSkillWithProficiency = (index: number) => {
    updateField(
      'skillsWithProficiency',
      (form.skillsWithProficiency || []).filter((_, i) => i !== index),
    );
  };

  // IT Skills
  const addITSkill = () => {
    const entry: ITSkillEntry = { technology: '' };
    updateField('itSkills', [...(form.itSkills || []), entry]);
  };
  const updateITSkill = (index: number, updates: Partial<ITSkillEntry>) => {
    const updated = [...(form.itSkills || [])];
    updated[index] = { ...updated[index], ...updates };
    updateField('itSkills', updated);
  };
  const removeITSkill = (index: number) => {
    updateField(
      'itSkills',
      (form.itSkills || []).filter((_, i) => i !== index),
    );
  };

  return (
    <div className="space-y-6">
      {/* Basic Skills */}
      <Card header={<h2 className="text-lg font-semibold text-[var(--text)]">Skills</h2>}>
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <ServerSuggestionInput
                category="skill"
                placeholder="Add a skill (e.g. React, Python)"
                value={skillInput}
                onChange={setSkillInput}
                onSelect={(val) => {
                  if (val && !form.skills?.includes(val)) {
                    updateField('skills', [...(form.skills || []), val]);
                    setSkillInput('');
                  }
                }}
              />
            </div>
            <Button
              variant="outline"
              onClick={addSkill}
              className="shrink-0"
              tooltip="Add this skill"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(form.skills || []).map((skill) => (
              <Tag
                key={skill}
                label={skill}
                variant="primary"
                onRemove={() => removeSkill(skill)}
              />
            ))}
            {(form.skills || []).length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">No skills added yet</p>
            )}
          </div>
        </div>
      </Card>

      {/* Skills with Proficiency */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text)]">Skills with Proficiency</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={addSkillWithProficiency}
              tooltip="Add a skill with proficiency level"
            >
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {(form.skillsWithProficiency || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              Rate your skills with proficiency levels and years of experience.
            </p>
          ) : (
            (form.skillsWithProficiency || []).map((sp, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1">
                  <ServerSuggestionInput
                    category="skill"
                    label={i === 0 ? 'Skill' : undefined}
                    placeholder="e.g. React"
                    value={sp.skill}
                    onChange={(val) => updateSkillWithProficiency(i, { skill: val })}
                  />
                </div>
                <div className="w-40">
                  <Select
                    label={i === 0 ? 'Proficiency' : undefined}
                    options={[
                      { value: 'BEGINNER', label: 'Beginner' },
                      { value: 'INTERMEDIATE', label: 'Intermediate' },
                      { value: 'ADVANCED', label: 'Advanced' },
                      { value: 'EXPERT', label: 'Expert' },
                    ]}
                    value={sp.proficiency}
                    onChange={(v) =>
                      updateSkillWithProficiency(i, {
                        proficiency: v as SkillWithProficiency['proficiency'],
                      })
                    }
                  />
                </div>
                <div className="w-24">
                  <Input
                    label={i === 0 ? 'Years' : undefined}
                    type="number"
                    placeholder="Yrs"
                    value={sp.yearsOfExperience?.toString() || ''}
                    onChange={(e) =>
                      updateSkillWithProficiency(i, {
                        yearsOfExperience: parseInt(e.target.value) || undefined,
                      })
                    }
                  />
                </div>
                <Tooltip content="Remove this skill">
                  <button
                    onClick={() => removeSkillWithProficiency(i)}
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

      {/* IT Skills */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text)]">IT Skills</h2>
            <Button size="sm" variant="outline" onClick={addITSkill} tooltip="Add a new IT skill">
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {(form.itSkills || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              Add specific technologies and tools with version details.
            </p>
          ) : (
            (form.itSkills || []).map((it, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1">
                  <ServerSuggestionInput
                    category="skill"
                    label={i === 0 ? 'Technology' : undefined}
                    placeholder="e.g. Docker"
                    value={it.technology}
                    onChange={(val) => updateITSkill(i, { technology: val })}
                  />
                </div>
                <div className="w-28">
                  <Input
                    label={i === 0 ? 'Version' : undefined}
                    placeholder="e.g. 24.0"
                    value={it.version || ''}
                    onChange={(e) => updateITSkill(i, { version: e.target.value })}
                  />
                </div>
                <div className="w-24">
                  <Input
                    label={i === 0 ? 'Years' : undefined}
                    type="number"
                    placeholder="Yrs"
                    value={it.experienceYears?.toString() || ''}
                    onChange={(e) =>
                      updateITSkill(i, { experienceYears: parseInt(e.target.value) || undefined })
                    }
                  />
                </div>
                <div className="w-40">
                  <Select
                    label={i === 0 ? 'Proficiency' : undefined}
                    options={[
                      { value: 'BEGINNER', label: 'Beginner' },
                      { value: 'INTERMEDIATE', label: 'Intermediate' },
                      { value: 'ADVANCED', label: 'Advanced' },
                      { value: 'EXPERT', label: 'Expert' },
                    ]}
                    value={it.proficiency || ''}
                    onChange={(v) =>
                      updateITSkill(i, { proficiency: v as ITSkillEntry['proficiency'] })
                    }
                  />
                </div>
                <Tooltip content="Remove this IT skill">
                  <button
                    onClick={() => removeITSkill(i)}
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
    </div>
  );
}
