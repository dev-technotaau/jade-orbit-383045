import { Mail, UserCircle, Briefcase } from 'lucide-react';
import Input from '@/components/ui/Input';
import PhoneInput from '@/components/ui/PhoneInput';
import Checkbox from '@/components/ui/Checkbox';
import { useAuthStore } from '@/store/auth.store';
import { emailsMatch, phonesMatch } from '@/lib/account-contact';
import type { UpdateCompanyRequest } from '@/types/employer';

interface ContactSectionProps {
  form: UpdateCompanyRequest;
  updateField: <K extends keyof UpdateCompanyRequest>(
    key: K,
    value: UpdateCompanyRequest[K],
  ) => void;
  /**
   * Consent to use the ACCOUNT email/mobile as the public company
   * contact. State + the fill/clear toggle live on the page (the save
   * handler validates against it); this section renders the checkbox
   * and locks whichever fields are account-backed while ticked.
   */
  useAccountContact: boolean;
  onUseAccountContactChange: (checked: boolean) => void;
  /**
   * INDIVIDUAL/proprietor accounts ARE the contact person — hide the
   * org-chart fields (Contact Person Name / Designation) to match the
   * onboarding wizard, which never asks individuals for them.
   */
  isIndividual?: boolean;
}

export default function ContactSection({
  form,
  updateField,
  useAccountContact,
  onUseAccountContactChange,
  isIndividual = false,
}: ContactSectionProps) {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="space-y-4">
      {/* Explicit opt-in for account contact details — no silent prefill.
          Locks only the fields the account actually has values for: an
          account without a mobile number leaves the phone editable. */}
      <Checkbox
        label="Use my account contact details"
        description={[
          user?.email ? `email ${user.email}` : null,
          user?.mobileNumber ? `mobile ${user.mobileNumber}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        checked={useAccountContact}
        onChange={(e) => onUseAccountContactChange(e.target.checked)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Contact Email"
          type="email"
          leftIcon={<Mail className="h-4 w-4" />}
          value={form.contactEmail || ''}
          onChange={(e) => updateField('contactEmail', e.target.value)}
          disabled={useAccountContact && emailsMatch(form.contactEmail, user?.email)}
          helperText={
            useAccountContact && emailsMatch(form.contactEmail, user?.email)
              ? 'Locked to your account email — untick the checkbox to edit'
              : undefined
          }
        />
        <PhoneInput
          label="Contact Phone"
          placeholder="9876xxxxxx"
          value={form.contactPhone || ''}
          onValueChange={(val) => updateField('contactPhone', val)}
          disabled={useAccountContact && phonesMatch(form.contactPhone, user?.mobileNumber)}
          helperText={
            useAccountContact && phonesMatch(form.contactPhone, user?.mobileNumber)
              ? 'Locked to your account mobile — untick the checkbox to edit'
              : undefined
          }
        />
      </div>
      {!isIndividual && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Contact Person Name"
            placeholder="e.g. Priya Sharma"
            value={form.contactPersonName || ''}
            onChange={(e) => updateField('contactPersonName', e.target.value)}
            leftIcon={<UserCircle className="h-4 w-4" />}
            helperText="Primary point of contact for candidates"
          />
          <Input
            label="Contact Person Designation"
            placeholder="e.g. HR Manager"
            value={form.contactPersonDesignation || ''}
            onChange={(e) => updateField('contactPersonDesignation', e.target.value)}
            leftIcon={<Briefcase className="h-4 w-4" />}
          />
        </div>
      )}
    </div>
  );
}
