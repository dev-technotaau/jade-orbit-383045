'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Globe,
  Mail,
  Phone,
  Briefcase,
  MapPin,
  Eye,
  Upload,
  Sparkles,
} from 'lucide-react';
import OnboardingShell, { type OnboardingStep } from '@/components/onboarding/OnboardingShell';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Switch from '@/components/ui/Switch';
import Spinner from '@/components/ui/Spinner';
import ImageCropper from '@/components/ui/ImageCropper';
import { showToast } from '@/components/ui/Toast';
import { vendorService, type UpsertVendorInput } from '@/services/vendor.service';
import { employerService } from '@/services/employer.service';
import { ROUTES } from '@/constants/routes';
import type { ApiError } from '@/types/api';

const EMPTY: UpsertVendorInput = {
  businessName: '',
  description: '',
  website: '',
  contactEmail: '',
  contactPhone: '',
  services: [],
  industries: [],
  locations: [],
};

const STEPS: OnboardingStep[] = [
  { key: 'basics', label: 'Business basics', icon: Building2 },
  { key: 'coverage', label: 'Services & coverage', icon: Briefcase },
  { key: 'publish', label: 'Publish', icon: Eye },
];

/**
 * Vendor onboarding wizard — replaces the old single-page form so new
 * vendors aren't dropped onto a blank page. Three steps:
 *
 *   1. Basics — business name, contact email/phone, website, logo upload.
 *   2. Coverage — services / industries / locations (CSV inputs), team size.
 *   3. Publish — visibility toggle + go-live confirmation.
 *
 * Each step persists via `vendorService.upsertMyProfile` so progress
 * isn't lost if the user closes the tab. Returning visitors with a
 * complete profile land on step 3 (Publish) directly.
 */
export default function VendorProfileWizardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [highest, setHighest] = useState(0);
  const [form, setForm] = useState<UpsertVendorInput>(EMPTY);
  const [logoUploading, setLogoUploading] = useState(false);

  // Cropper state — opened when the user picks a logo file. The chosen
  // file is read into a data URL and passed to the cropper; on confirm
  // we get a square `Blob` we can ship to R2.
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['vendor', 'me'],
    queryFn: () => vendorService.getMyProfile(),
  });

  // Hydrate from existing profile + jump to publish step if already complete.
  useEffect(() => {
    if (profile) {
      setForm({
        businessName: profile.businessName,
        description: profile.description ?? '',
        logo: profile.logo ?? undefined,
        website: profile.website ?? '',
        contactEmail: profile.contactEmail,
        contactPhone: profile.contactPhone,
        services: profile.services,
        industries: profile.industries,
        locations: profile.locations,
        yearsInBusiness: profile.yearsInBusiness ?? undefined,
        teamSize: profile.teamSize ?? undefined,
      });
      // Jump to last step if everything is already filled.
      if (
        profile.businessName &&
        profile.contactEmail &&
        profile.contactPhone &&
        profile.services.length > 0 &&
        profile.locations.length > 0
      ) {
        setStep(2);
        setHighest(2);
      }
    }
  }, [profile]);

  // First-time setup (no existing vendor profile yet): pre-fill the shared
  // fields from the employer's company profile so they don't re-enter
  // name / logo / description / website / contact. Vendor-specific fields
  // (services, coverage locations) are still chosen by the user. Only fills
  // blanks, so it never clobbers anything typed.
  useEffect(() => {
    if (isLoading || profile) return;
    let active = true;
    employerService
      .getCompany()
      .then((res) => {
        if (!active) return;
        const c = res?.data;
        if (!c) return;
        setForm((prev) => ({
          ...prev,
          businessName: prev.businessName || c.companyName || '',
          description: prev.description || c.description || '',
          logo: prev.logo || c.logo || undefined,
          website: prev.website || c.website || '',
          contactEmail: prev.contactEmail || c.contactEmail || '',
          contactPhone: prev.contactPhone || c.contactPhone || '',
          industries:
            prev.industries && prev.industries.length
              ? prev.industries
              : c.industry
                ? [c.industry]
                : [],
        }));
      })
      .catch(() => {
        // No company profile yet — leave the form blank.
      });
    return () => {
      active = false;
    };
  }, [isLoading, profile]);

  const upsert = useMutation({
    mutationFn: (input: UpsertVendorInput) => vendorService.upsertMyProfile(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', 'me'] });
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Failed to save');
    },
  });

  const visibility = useMutation({
    mutationFn: (isPublic: boolean) => vendorService.setVisibility(isPublic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', 'me'] });
    },
  });

  function set<K extends keyof UpsertVendorInput>(key: K, value: UpsertVendorInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setCsv<K extends 'services' | 'industries' | 'locations'>(key: K, value: string) {
    setForm((f) => ({
      ...f,
      [key]: value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    }));
  }

  /**
   * User picked a file — read into a data URL and open the cropper.
   * Reset the input so picking the same file twice still triggers
   * `onChange`.
   */
  function handleLogoFileSelected(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') setCropperSrc(result);
    };
    reader.readAsDataURL(file);
  }

  /**
   * Cropper confirmed — upload the cropped square Blob to R2 via the
   * vendor logo endpoint. Profile must exist first; if not, save the
   * basics inline before uploading.
   */
  async function handleCropConfirm(croppedBlob: Blob) {
    setCropperSrc(null);
    setLogoUploading(true);
    try {
      if (!profile) {
        if (!form.businessName.trim() || !form.contactEmail.trim() || !form.contactPhone.trim()) {
          showToast.error('Save your business name, email and phone first.');
          return;
        }
        await upsert.mutateAsync(form);
      }
      const file = new File([croppedBlob], 'logo.png', { type: 'image/png' });
      const { logo } = await vendorService.uploadLogo(file);
      set('logo', logo);
      queryClient.invalidateQueries({ queryKey: ['vendor', 'me'] });
      showToast.success('Logo uploaded');
    } catch (err) {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr.message || 'Upload failed');
    } finally {
      setLogoUploading(false);
    }
  }

  function isStepValid(idx: number): boolean {
    if (idx === 0) {
      return Boolean(
        form.businessName.trim() && form.contactEmail.trim() && form.contactPhone.trim(),
      );
    }
    if (idx === 1) {
      return (form.services?.length ?? 0) > 0 && (form.locations?.length ?? 0) > 0;
    }
    return true;
  }

  async function handleNext() {
    if (!isStepValid(step)) {
      showToast.error('Fill required fields to continue');
      return;
    }
    // Save progress at each step transition.
    try {
      await upsert.mutateAsync(form);
    } catch {
      return; // toast shown by mutation
    }
    const nextStep = Math.min(step + 1, STEPS.length - 1);
    setStep(nextStep);
    setHighest((h) => Math.max(h, nextStep));
  }

  async function handleFinish() {
    try {
      await upsert.mutateAsync(form);
      // If still hidden, prompt to publish — otherwise just go to dashboard.
      if (profile && !profile.isPublic) {
        await visibility.mutateAsync(true);
      }
      showToast.success('Vendor profile published');
      router.push('/employer/vendor');
    } catch {
      /* toast shown by mutation */
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <OnboardingShell
      steps={STEPS}
      currentStep={step}
      isFirstStep={step === 0}
      isLastStep={step === STEPS.length - 1}
      onPrev={() => setStep((s) => Math.max(0, s - 1))}
      onNext={step === STEPS.length - 1 ? handleFinish : handleNext}
      onSkip={() => router.push('/employer/vendor')}
      onGoToStep={(i) => {
        if (i <= highest) setStep(i);
      }}
      highestVisitedStep={highest}
      isSubmitting={upsert.isPending || visibility.isPending}
      nextLabel={step === STEPS.length - 1 ? 'Publish & finish' : undefined}
      nextDisabled={!isStepValid(step)}
      dashboardPath="/employer/vendor"
      title="Set up your vendor profile"
      subtitle="Three quick steps and you're listed in the Hire Adda directory."
    >
      {step === 0 && (
        <BasicsStep
          form={form}
          set={set}
          logoUrl={profile?.logo ?? form.logo ?? undefined}
          logoUploading={logoUploading}
          onLogoSelect={handleLogoFileSelected}
        />
      )}
      {cropperSrc && (
        <ImageCropper
          isOpen
          imageSrc={cropperSrc}
          aspectRatio={1}
          circularCrop={false}
          outputWidth={400}
          outputHeight={400}
          onClose={() => setCropperSrc(null)}
          onCropComplete={handleCropConfirm}
        />
      )}
      {step === 1 && <CoverageStep form={form} setCsv={setCsv} set={set} />}
      {step === 2 && (
        <PublishStep
          form={form}
          isPublic={profile?.isPublic ?? false}
          onTogglePublic={(v) => visibility.mutate(v)}
        />
      )}
    </OnboardingShell>
  );
}

function BasicsStep({
  form,
  set,
  logoUrl,
  logoUploading,
  onLogoSelect,
}: {
  form: UpsertVendorInput;
  set: <K extends keyof UpsertVendorInput>(key: K, value: UpsertVendorInput[K]) => void;
  logoUrl: string | undefined;
  logoUploading: boolean;
  onLogoSelect: (file: File) => void;
}) {
  return (
    <Card padding="lg">
      <h2 className="text-lg font-semibold text-[var(--text)]">Business basics</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Required fields are marked with *.</p>
      <div className="mt-5 flex items-center gap-4">
        <div className="flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
          ) : (
            <Building2 className="h-8 w-8 text-[var(--text-muted)]" />
          )}
        </div>
        <div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--bg-secondary)]">
            <Upload className="h-4 w-4" />
            {logoUploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              disabled={logoUploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onLogoSelect(f);
              }}
            />
          </label>
          <p className="mt-1 text-xs text-[var(--text-muted)]">PNG / JPG / SVG, max 5 MB.</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
          label="Business name *"
          value={form.businessName}
          onChange={(e) => set('businessName', e.target.value)}
          leftIcon={<Building2 className="h-4 w-4" />}
        />
        <Input
          label="Website"
          value={form.website ?? ''}
          onChange={(e) => set('website', e.target.value)}
          leftIcon={<Globe className="h-4 w-4" />}
          placeholder="https://example.com"
        />
        <Input
          label="Contact email *"
          type="email"
          value={form.contactEmail}
          onChange={(e) => set('contactEmail', e.target.value)}
          leftIcon={<Mail className="h-4 w-4" />}
        />
        <Input
          label="Contact phone *"
          value={form.contactPhone}
          onChange={(e) => set('contactPhone', e.target.value)}
          leftIcon={<Phone className="h-4 w-4" />}
        />
      </div>
      <Textarea
        label="Description"
        rows={4}
        value={form.description ?? ''}
        onChange={(e) => set('description', e.target.value)}
        placeholder="Tell employers about your specialties, success stories, key clients."
        className="mt-4"
      />
    </Card>
  );
}

function CoverageStep({
  form,
  setCsv,
  set,
}: {
  form: UpsertVendorInput;
  setCsv: <K extends 'services' | 'industries' | 'locations'>(key: K, value: string) => void;
  set: <K extends keyof UpsertVendorInput>(key: K, value: UpsertVendorInput[K]) => void;
}) {
  return (
    <Card padding="lg">
      <h2 className="text-lg font-semibold text-[var(--text)]">Services & coverage</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Comma-separated values. Employers filter the directory by these.
      </p>
      <div className="mt-5 grid grid-cols-1 gap-4">
        <Input
          label="Services offered *"
          value={(form.services ?? []).join(', ')}
          onChange={(e) => setCsv('services', e.target.value)}
          placeholder="Permanent staffing, Contract staffing, RPO, Executive search"
          leftIcon={<Briefcase className="h-4 w-4" />}
        />
        <Input
          label="Industries served"
          value={(form.industries ?? []).join(', ')}
          onChange={(e) => setCsv('industries', e.target.value)}
          placeholder="IT, Finance, Healthcare, Manufacturing"
        />
        <Input
          label="Locations covered *"
          value={(form.locations ?? []).join(', ')}
          onChange={(e) => setCsv('locations', e.target.value)}
          placeholder="Mumbai, Bengaluru, Delhi-NCR, Pune, Remote"
          leftIcon={<MapPin className="h-4 w-4" />}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Years in business"
            type="number"
            value={form.yearsInBusiness ?? ''}
            onChange={(e) =>
              set('yearsInBusiness', e.target.value ? Number(e.target.value) : undefined)
            }
          />
          <Input
            label="Team size"
            type="number"
            value={form.teamSize ?? ''}
            onChange={(e) => set('teamSize', e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
      </div>
    </Card>
  );
}

function PublishStep({
  form,
  isPublic,
  onTogglePublic,
}: {
  form: UpsertVendorInput;
  isPublic: boolean;
  onTogglePublic: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <Card padding="lg" className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10">
        <div className="flex items-start gap-3">
          <Sparkles className="h-6 w-6 flex-none text-emerald-600" />
          <div>
            <h2 className="font-semibold text-[var(--text)]">Almost there!</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Review your details below and toggle visibility to publish your profile in the public
              directory at{' '}
              <a
                href={ROUTES.VENDORS_PUBLIC.LIST}
                className="text-primary underline underline-offset-2"
              >
                /vendors
              </a>
              .
            </p>
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <h3 className="text-base font-semibold text-[var(--text)]">{form.businessName}</h3>
        {form.description && (
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{form.description}</p>
        )}
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <SummaryRow label="Email" value={form.contactEmail} />
          <SummaryRow label="Phone" value={form.contactPhone} />
          <SummaryRow label="Services" value={(form.services ?? []).join(', ') || '—'} />
          <SummaryRow label="Industries" value={(form.industries ?? []).join(', ') || '—'} />
          <SummaryRow label="Locations" value={(form.locations ?? []).join(', ') || '—'} />
          {form.yearsInBusiness != null && (
            <SummaryRow label="Years" value={String(form.yearsInBusiness)} />
          )}
        </dl>
      </Card>

      <Card padding="md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-[var(--text)]">Public visibility</p>
            <p className="text-xs text-[var(--text-muted)]">
              When on, your profile appears at /vendors and employers can send you hiring leads.
              Requires an active VENDOR_CONNECT subscription.
            </p>
          </div>
          <Switch checked={isPublic} onChange={(e) => onTogglePublic(e.target.checked)} />
        </div>
        {!isPublic && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-stone-900">
            Your profile is currently <strong>hidden</strong>. Toggle the switch above (or click
            &quot;Publish &amp; finish&quot;) to go live.
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-wider text-[var(--text-muted)] uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-[var(--text)]">{value}</dd>
    </div>
  );
}
