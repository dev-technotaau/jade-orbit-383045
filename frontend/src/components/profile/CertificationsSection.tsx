'use client';

import { Plus, Trash2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import Input from '@/components/ui/Input';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import DatePicker from '@/components/ui/DatePicker';
import type { ProfileSectionProps } from './types';
import type { CertificationEntry } from '@/types/candidate';

export default function CertificationsSection({ form, updateField }: ProfileSectionProps) {
  const addCertification = () => {
    const newCert: CertificationEntry = { name: '', issuer: '' };
    updateField('certifications', [...(form.certifications || []), newCert]);
  };

  const updateCertification = (index: number, updates: Partial<CertificationEntry>) => {
    const updated = [...(form.certifications || [])];
    updated[index] = { ...updated[index], ...updates };
    updateField('certifications', updated);
  };

  const removeCertification = (index: number) => {
    updateField(
      'certifications',
      (form.certifications || []).filter((_, i) => i !== index),
    );
  };

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text)]">Certifications</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={addCertification}
            tooltip="Add a new certification"
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {(form.certifications || []).length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            No certifications added. Click &quot;Add&quot; to add your certifications.
          </p>
        ) : (
          (form.certifications || []).map((cert, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-[var(--text)]">Certification {i + 1}</h4>
                <Tooltip content="Remove this certification">
                  <button
                    onClick={() => removeCertification(i)}
                    className="cursor-pointer text-[var(--error)] hover:text-[var(--error-dark)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ServerSuggestionInput
                  category="certification"
                  label="Certification Name"
                  value={cert.name}
                  onChange={(val) => updateCertification(i, { name: val })}
                  required
                />
                <Input
                  label="Issuing Organization"
                  value={cert.issuer}
                  onChange={(e) => updateCertification(i, { issuer: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <DatePicker
                  label="Issue Date"
                  mode="month"
                  value={cert.issueDate || ''}
                  onChange={(val) => updateCertification(i, { issueDate: val })}
                />
                <DatePicker
                  label="Expiry Date"
                  mode="month"
                  value={cert.expiryDate || ''}
                  onChange={(val) => updateCertification(i, { expiryDate: val })}
                  disabled={cert.doesNotExpire}
                  helperText={cert.doesNotExpire ? 'No expiry' : ''}
                />
              </div>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={cert.doesNotExpire || false}
                  onChange={(e) =>
                    updateCertification(i, {
                      doesNotExpire: e.target.checked,
                      expiryDate: e.target.checked ? undefined : cert.expiryDate,
                    })
                  }
                  className="text-primary h-4 w-4 rounded border-[var(--border)]"
                />
                <span className="text-sm text-[var(--text)]">
                  This certification does not expire
                </span>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Credential ID"
                  value={cert.credentialId || ''}
                  onChange={(e) => updateCertification(i, { credentialId: e.target.value })}
                />
                <Input
                  label="Credential URL"
                  placeholder="https://..."
                  value={cert.url || ''}
                  onChange={(e) => updateCertification(i, { url: e.target.value })}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
