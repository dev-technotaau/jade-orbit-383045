import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import type { EmployerProfileSectionProps } from './types';

export default function AboutSection({
  form,
  updateField,
}: Pick<EmployerProfileSectionProps, 'form' | 'updateField'>) {
  return (
    <div className="space-y-4">
      <Input
        label="Tagline"
        placeholder="A brief one-liner that captures what your company does"
        value={form.tagline || ''}
        onChange={(e) => updateField('tagline', e.target.value)}
      />
      <Textarea
        label="Company Description"
        rows={6}
        value={form.description || ''}
        onChange={(e) => updateField('description', e.target.value)}
        maxLength={3000}
        showCount
      />
      <Textarea
        label="Why Work For Us"
        placeholder="Describe what makes your company a great place to work..."
        rows={6}
        value={form.whyWorkForUs || ''}
        onChange={(e) => updateField('whyWorkForUs', e.target.value)}
        maxLength={3000}
        showCount
        helperText="A compelling section helps attract top talent"
      />
      <Textarea
        label="Interview Process"
        placeholder="Describe your typical interview process step-by-step..."
        rows={6}
        value={form.interviewProcess || ''}
        onChange={(e) => updateField('interviewProcess', e.target.value)}
        maxLength={3000}
        showCount
        helperText="Candidates appreciate transparency about your interview process"
      />
      <Textarea
        label="CSR Initiatives"
        placeholder="Share your corporate social responsibility initiatives..."
        rows={6}
        value={form.csrInitiatives || ''}
        onChange={(e) => updateField('csrInitiatives', e.target.value)}
        maxLength={3000}
        showCount
      />
    </div>
  );
}
