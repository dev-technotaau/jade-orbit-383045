import { useState } from 'react';
import { Plus } from 'lucide-react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Tag from '@/components/ui/Tag';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import type { EmployerProfileSectionProps } from './types';

const WORKPLACE_POLICY_KEYS = ['Remote Work Policy', 'Leave Policy', 'Work Hours', 'Dress Code'];

export default function TechPoliciesSection({
  form,
  updateField,
  addToArray,
  removeFromArray,
}: EmployerProfileSectionProps) {
  const [techInput, setTechInput] = useState('');
  const [productInput, setProductInput] = useState('');

  const updatePolicy = (key: string, value: string) => {
    updateField('workplacePolicies', { ...form.workplacePolicies, [key]: value });
  };

  return (
    <div className="space-y-8">
      {/* Tech Stack */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Tech Stack</label>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Technologies and tools your company uses
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <ServerSuggestionInput
              category="skill"
              placeholder="e.g. React, Node.js, AWS"
              value={techInput}
              onChange={setTechInput}
              onSelect={(v) => addToArray('techStack', v, setTechInput)}
            />
          </div>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => addToArray('techStack', techInput, setTechInput)}
            disabled={!techInput.trim()}
            tooltip="Add technology"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {(form.techStack || []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(form.techStack || []).map((t) => (
              <Tag
                key={t}
                label={t}
                variant="primary"
                onRemove={() => removeFromArray('techStack', t)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Products & Services */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          Products & Services
        </label>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Key products or services your company offers
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <ServerSuggestionInput
              category="product_service"
              placeholder="e.g. Enterprise Software, API Services"
              value={productInput}
              onChange={setProductInput}
              onSelect={(v) => addToArray('productsServices', v, setProductInput)}
            />
          </div>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => addToArray('productsServices', productInput, setProductInput)}
            disabled={!productInput.trim()}
            tooltip="Add product or service"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {(form.productsServices || []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(form.productsServices || []).map((p) => (
              <Tag
                key={p}
                label={p}
                variant="primary"
                onRemove={() => removeFromArray('productsServices', p)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Workplace Policies */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          Workplace Policies
        </label>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Share key workplace policies so candidates know what to expect
        </p>
        <div className="space-y-4">
          {WORKPLACE_POLICY_KEYS.map((policyKey) => (
            <Input
              key={policyKey}
              label={policyKey}
              placeholder={`Describe your ${policyKey.toLowerCase()}`}
              value={
                (form.workplacePolicies as Record<string, string> | undefined)?.[policyKey] || ''
              }
              onChange={(e) => updatePolicy(policyKey, e.target.value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
