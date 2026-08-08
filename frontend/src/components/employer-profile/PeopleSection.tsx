import { Plus, Trash2, Linkedin, UserCircle, BookOpen } from 'lucide-react';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import type {
  UpdateCompanyRequest,
  LeadershipEntry,
  EmployeeTestimonialEntry,
} from '@/types/employer';

function emptyLeadership(): LeadershipEntry {
  return { name: '', designation: '', linkedinUrl: '', bio: '' };
}

function emptyTestimonial(): EmployeeTestimonialEntry {
  return { name: '', designation: '', department: '', quote: '' };
}

interface PeopleSectionProps {
  form: UpdateCompanyRequest;
  updateField: <K extends keyof UpdateCompanyRequest>(
    key: K,
    value: UpdateCompanyRequest[K],
  ) => void;
  isIndividual?: boolean;
}

export default function PeopleSection({ form, updateField, isIndividual }: PeopleSectionProps) {
  // Leadership helpers
  const addLeadership = () => {
    updateField('leadershipTeam', [...(form.leadershipTeam || []), emptyLeadership()]);
  };
  const updateLeadership = (index: number, field: string, value: string) => {
    const updated = [...(form.leadershipTeam || [])];
    updated[index] = { ...updated[index], [field]: value };
    updateField('leadershipTeam', updated);
  };
  const removeLeadership = (index: number) => {
    updateField(
      'leadershipTeam',
      (form.leadershipTeam || []).filter((_, i) => i !== index),
    );
  };

  // Testimonial helpers
  const addTestimonial = () => {
    updateField('employeeTestimonials', [...(form.employeeTestimonials || []), emptyTestimonial()]);
  };
  const updateTestimonial = (index: number, field: string, value: string) => {
    const updated = [...(form.employeeTestimonials || [])];
    updated[index] = { ...updated[index], [field]: value };
    updateField('employeeTestimonials', updated);
  };
  const removeTestimonial = (index: number) => {
    updateField(
      'employeeTestimonials',
      (form.employeeTestimonials || []).filter((_, i) => i !== index),
    );
  };

  if (isIndividual) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-secondary)]">
          <UserCircle className="h-8 w-8 text-[var(--text-muted)]" />
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          Leadership team and employee testimonials are not applicable for individual accounts.
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          You can manage this section from your profile settings if you switch to a company account.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Leadership Team */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-xl">
            <UserCircle className="text-primary h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">Leadership Team</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Showcase your company&apos;s key leaders
            </p>
          </div>
        </div>

        {(form.leadershipTeam || []).length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-10 text-center">
            <UserCircle className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No leaders added yet</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Add members of your leadership team to build trust with candidates
            </p>
          </div>
        )}

        {(form.leadershipTeam || []).map((leader, index) => (
          <div
            key={index}
            className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text)]">Leader #{index + 1}</span>
              <Tooltip content="Remove leader">
                <button
                  type="button"
                  onClick={() => removeLeadership(index)}
                  className="hover:text-error cursor-pointer rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-white"
                  aria-label="Remove leader"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Name"
                placeholder="e.g. Jane Doe"
                value={leader.name}
                onChange={(e) => updateLeadership(index, 'name', e.target.value)}
                required
              />
              <Input
                label="Designation"
                placeholder="e.g. CEO, CTO"
                value={leader.designation}
                onChange={(e) => updateLeadership(index, 'designation', e.target.value)}
                required
              />
              <Input
                label="LinkedIn URL"
                type="url"
                placeholder="https://linkedin.com/in/..."
                value={leader.linkedinUrl ?? ''}
                onChange={(e) => updateLeadership(index, 'linkedinUrl', e.target.value)}
                leftIcon={<Linkedin className="h-4 w-4" />}
              />
            </div>
            <div className="mt-4">
              <Textarea
                label="Bio"
                placeholder="Brief bio of this leader..."
                value={leader.bio ?? ''}
                onChange={(e) => updateLeadership(index, 'bio', e.target.value)}
                rows={2}
              />
            </div>
          </div>
        ))}

        <Button variant="outline" onClick={addLeadership} tooltip="Add a new leader">
          <Plus className="mr-1 h-4 w-4" /> Add Leader
        </Button>
      </div>

      {/* Employee Testimonials */}
      <div className="border-t border-[var(--border)] pt-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-xl">
            <BookOpen className="text-primary h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">Employee Testimonials</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Share what your employees say about working here
            </p>
          </div>
        </div>

        {(form.employeeTestimonials || []).length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-10 text-center">
            <BookOpen className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No testimonials added yet</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Employee testimonials help candidates understand your work culture
            </p>
          </div>
        )}

        {(form.employeeTestimonials || []).map((testimonial, index) => (
          <div
            key={index}
            className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text)]">
                Testimonial #{index + 1}
              </span>
              <Tooltip content="Remove testimonial">
                <button
                  type="button"
                  onClick={() => removeTestimonial(index)}
                  className="hover:text-error cursor-pointer rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-white"
                  aria-label="Remove testimonial"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Name"
                placeholder="e.g. John Smith"
                value={testimonial.name}
                onChange={(e) => updateTestimonial(index, 'name', e.target.value)}
                required
              />
              <Input
                label="Designation"
                placeholder="e.g. Senior Engineer"
                value={testimonial.designation ?? ''}
                onChange={(e) => updateTestimonial(index, 'designation', e.target.value)}
              />
              <Input
                label="Department"
                placeholder="e.g. Engineering"
                value={testimonial.department ?? ''}
                onChange={(e) => updateTestimonial(index, 'department', e.target.value)}
              />
            </div>
            <div className="mt-4">
              <Textarea
                label="Quote"
                placeholder="What does this employee say about working here?"
                value={testimonial.quote}
                onChange={(e) => updateTestimonial(index, 'quote', e.target.value)}
                rows={3}
                required
              />
            </div>
          </div>
        ))}

        <Button variant="outline" onClick={addTestimonial} tooltip="Add a new testimonial">
          <Plus className="mr-1 h-4 w-4" /> Add Testimonial
        </Button>
      </div>
    </div>
  );
}
