'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Building2, Eye, ImageIcon, Save, Upload, X, Loader2, Camera } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';
import { ROUTES } from '@/constants/routes';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import ProgressBar from '@/components/ui/ProgressBar';
import Skeleton from '@/components/ui/Skeleton';
import { showToast } from '@/components/ui/Toast';
import ImageCropper from '@/components/ui/ImageCropper';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { employerService } from '@/services/employer.service';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';
import { emailsMatch, phonesMatch } from '@/lib/account-contact';
import {
  isValidGstin,
  isValidCin,
  isValidLlpin,
  isValidTan,
  gstinEmbedsPan,
} from '@/lib/legal-ids';
import { formatCompactCurrency } from '@/lib/currency';
import { FILE_LIMITS } from '@/constants/config';
import { QUERY_KEYS } from '@/constants/config';
import type { UpdateCompanyRequest, FundingStage } from '@/types/employer';
import type { ApiError } from '@/types/api';
import type { ArrayKey } from '@/components/employer-profile/types';
import CompanyInfoSection from '@/components/employer-profile/CompanyInfoSection';
import AboutSection from '@/components/employer-profile/AboutSection';
import CultureSection from '@/components/employer-profile/CultureSection';
import BenefitsSection from '@/components/employer-profile/BenefitsSection';
import TechPoliciesSection from '@/components/employer-profile/TechPoliciesSection';
import PeopleSection from '@/components/employer-profile/PeopleSection';
import AwardsFundingSection from '@/components/employer-profile/AwardsFundingSection';
import LegalSection from '@/components/employer-profile/LegalSection';
import ContactSection from '@/components/employer-profile/ContactSection';
import AddressSection from '@/components/employer-profile/AddressSection';
import SocialSection from '@/components/employer-profile/SocialSection';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type Section =
  | 'company'
  | 'about'
  | 'culture'
  | 'benefits'
  | 'tech'
  | 'people'
  | 'awards'
  | 'legal'
  | 'contact'
  | 'address'
  | 'social';

const sections: { key: Section; label: string }[] = [
  { key: 'company', label: 'Company Info' },
  { key: 'about', label: 'About' },
  { key: 'culture', label: 'Culture & Values' },
  { key: 'benefits', label: 'Benefits' },
  { key: 'tech', label: 'Tech & Policies' },
  { key: 'people', label: 'People' },
  { key: 'awards', label: 'Awards & Funding' },
  { key: 'legal', label: 'Legal & Financial' },
  { key: 'contact', label: 'Contact' },
  { key: 'address', label: 'Address' },
  { key: 'social', label: 'Social & Links' },
];

const SECTION_HEADERS: Record<Section, string> = {
  company: 'Company Information',
  about: 'About Company',
  culture: 'Culture & Values',
  benefits: 'Benefits & Perks',
  tech: 'Tech Stack & Policies',
  people: 'People',
  awards: 'Awards & Funding',
  legal: 'Legal & Financial',
  contact: 'Contact Information',
  address: 'Address & Locations',
  social: 'Social & Links',
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function CompanyProfilePage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const [activeSection, setActiveSection] = useState<Section>('company');

  const handleSectionChange = (section: Section) => {
    setActiveSection(section);
    const url = new URL(window.location.href);
    url.searchParams.set('section', section);
    window.history.replaceState({}, '', url.toString());
  };

  const [form, setForm] = useState<UpdateCompanyRequest>({});
  const [formDirty, setFormDirty] = useState(false);
  // Consent flag for using the ACCOUNT email/mobile as the public company
  // contact. Initialised from the saved row on hydration (legacy rows
  // where the old auto-prefill stored the account values arrive checked
  // + locked); save-time validation blocks account values without it.
  const [useAccountContact, setUseAccountContact] = useState(false);
  const initialFormRef = useRef<string>('');

  // Personal name state (lives on User model, not CompanyProfile)
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');

  // Sync name state when user data loads/changes
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
    }
  }, [user]);

  // Logo cropper state
  const [logoCropperOpen, setLogoCropperOpen] = useState(false);
  const [selectedLogoImage, setSelectedLogoImage] = useState<string | null>(null);
  const [isLogoUploading, setIsLogoUploading] = useState(false);

  // Cover image cropper state
  const [coverCropperOpen, setCoverCropperOpen] = useState(false);
  const [selectedCoverImage, setSelectedCoverImage] = useState<string | null>(null);
  const [isCoverUploading, setIsCoverUploading] = useState(false);

  // Confirm dialog state
  const [showRemoveLogoConfirm, setShowRemoveLogoConfirm] = useState(false);
  const [showRemoveCoverConfirm, setShowRemoveCoverConfirm] = useState(false);

  // Deep-link: read ?section= and ?focus= query params
  useEffect(() => {
    const section = searchParams.get('section');
    if (section && sections.some((s) => s.key === section)) {
      queueMicrotask(() => setActiveSection(section as Section));
    }
  }, [searchParams]);

  useEffect(() => {
    const focus = searchParams.get('focus');
    if (focus) {
      const timer = setTimeout(() => {
        const el = document.getElementById(focus);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [searchParams, activeSection]);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const { data: companyData, isLoading } = useQuery({
    queryKey: QUERY_KEYS.EMPLOYERS.COMPANY,
    queryFn: () => employerService.getCompany(),
  });

  const { data: completenessData } = useQuery({
    queryKey: QUERY_KEYS.EMPLOYERS.COMPLETENESS,
    queryFn: () => employerService.getCompleteness(),
  });

  const company = companyData?.data;
  const completeness = completenessData?.data;

  useEffect(() => {
    if (company) {
      queueMicrotask(() => {
        const initial: UpdateCompanyRequest = {
          accountType: company.accountType || undefined,
          hiringType: company.hiringType || undefined,
          companyName: company.companyName || '',
          companyType: company.companyType || undefined,
          tagline: company.tagline || '',
          industry: company.industry || '',
          subIndustry: company.subIndustry || '',
          specialties: company.specialties || [],
          companySize: company.companySize || '',
          employeeCount: company.employeeCount || undefined,
          numberOfOffices: company.numberOfOffices || undefined,
          description: company.description || '',
          whyWorkForUs: company.whyWorkForUs || '',
          website: company.website || '',
          careersPageUrl: company.careersPageUrl || '',
          blogUrl: company.blogUrl || '',
          companyVideoUrl: company.companyVideoUrl || '',
          foundedYear: company.foundedYear || undefined,
          parentCompany: company.parentCompany || '',
          stockTicker: company.stockTicker || '',
          gstNumber: company.gstNumber || '',
          cinNumber: company.cinNumber || '',
          panNumber: company.panNumber || '',
          llpinNumber: company.llpinNumber || '',
          tanNumber: company.tanNumber || '',
          annualRevenueRange: company.annualRevenueRange || '',
          fundingStage: (company.fundingStage || undefined) as FundingStage | undefined,
          totalFundingRaised: company.totalFundingRaised || '',
          totalFundingRaisedAmount:
            company.totalFundingRaisedAmount != null
              ? Number(company.totalFundingRaisedAmount)
              : undefined,
          fundingCurrency: company.fundingCurrency || 'INR',
          investors: company.investors || [],
          productsServices: company.productsServices || [],
          techStack: company.techStack || [],
          companyCulture: company.companyCulture || '',
          missionStatement: company.missionStatement || '',
          visionStatement: company.visionStatement || '',
          coreValues: company.coreValues || [],
          diversityStatement: company.diversityStatement || '',
          employeeResourceGroups: company.employeeResourceGroups || [],
          csrInitiatives: company.csrInitiatives || '',
          benefits: company.benefits || [],
          structuredPerks:
            (company.structuredPerks as Array<{ category: string; perks: string[] }>) || [],
          // Backend stores as Array<{ title, description }> — convert to Record for UI
          workplacePolicies: Array.isArray(company.workplacePolicies)
            ? Object.fromEntries(
                (company.workplacePolicies as Array<{ title: string; description?: string }>).map(
                  (p) => [p.title, p.description || ''],
                ),
              )
            : company.workplacePolicies || {},
          interviewProcess: company.interviewProcess || '',
          // Backend uses 'issuingOrg' — convert to 'issuer' for UI
          awardsRecognitions: (company.awardsRecognitions || []).map(
            (a: Record<string, unknown>) => ({
              title: (a.title as string) || '',
              year: a.year as number | undefined,
              issuer: (a.issuingOrg as string) || (a.issuer as string) || '',
            }),
          ),
          leadershipTeam: company.leadershipTeam || [],
          employeeTestimonials: company.employeeTestimonials || [],
          socialLinks: company.socialLinks || {
            linkedin: '',
            twitter: '',
            facebook: '',
            instagram: '',
            youtube: '',
            glassdoor: '',
          },
          contactEmail: company.contactEmail || '',
          contactPhone: company.contactPhone || '',
          contactPersonName: company.contactPersonName || '',
          contactPersonDesignation: company.contactPersonDesignation || '',
          addressLine1: company.addressLine1 || '',
          addressLine2: company.addressLine2 || '',
          city: company.city || '',
          state: company.state || '',
          pincode: company.pincode || '',
          country: company.country || 'India',
          headquarters: company.headquarters || '',
          locations: company.locations || [],
        };
        initialFormRef.current = JSON.stringify(initial);
        setFormDirty(false);
        setForm(initial);
        // Derive consent from the data itself: a saved contact that
        // matches the account values means the account details ARE in
        // use (the old prefill era stored them silently) — arrive
        // checked so the fields show locked, and unchecking clears them.
        setUseAccountContact(
          emailsMatch(company.contactEmail, user?.email) ||
            phonesMatch(company.contactPhone, user?.mobileNumber),
        );
      });
    }
  }, [company, user?.email, user?.mobileNumber]);

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  const updateMutation = useMutation({
    mutationFn: (data: UpdateCompanyRequest) => employerService.updateCompany(data),
    onSuccess: () => {
      setFormDirty(false);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.EMPLOYERS.COMPANY });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.EMPLOYERS.COMPLETENESS });
      showToast.success('Company profile updated!');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update profile');
    },
  });

  const logoMutation = useMutation({
    mutationFn: (file: File) => employerService.uploadLogo(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.EMPLOYERS.COMPANY });
      showToast.success('Logo uploaded!');
      setIsLogoUploading(false);
      setSelectedLogoImage(null);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to upload logo');
      setIsLogoUploading(false);
    },
  });

  const removeLogoMutation = useMutation({
    mutationFn: () => employerService.removeLogo(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.EMPLOYERS.COMPANY });
      showToast.success('Logo removed');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error?.message || 'Failed to remove logo');
    },
  });

  const coverImageMutation = useMutation({
    mutationFn: (file: File) => employerService.uploadCoverImage(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.EMPLOYERS.COMPANY });
      showToast.success('Cover image uploaded!');
      setIsCoverUploading(false);
      setSelectedCoverImage(null);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to upload cover image');
      setIsCoverUploading(false);
    },
  });

  const removeCoverImageMutation = useMutation({
    mutationFn: () => employerService.removeCoverImage(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.EMPLOYERS.COMPANY });
      showToast.success('Cover image removed');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error?.message || 'Failed to remove cover image');
    },
  });

  // -----------------------------------------------------------------------
  // Logo handlers
  // -----------------------------------------------------------------------

  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!(FILE_LIMITS.IMAGE_TYPES as readonly string[]).includes(file.type)) {
      showToast.error('Please select a JPG, PNG, or WebP image');
      return;
    }
    if (file.size > FILE_LIMITS.LOGO_MAX_SIZE) {
      showToast.error('Logo must be under 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedLogoImage(reader.result as string);
      setLogoCropperOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleLogoCropComplete = async (blob: Blob) => {
    setIsLogoUploading(true);
    const file = new File([blob], 'logo.jpg', { type: 'image/jpeg' });
    logoMutation.mutate(file);
  };

  // -----------------------------------------------------------------------
  // Cover Image handlers
  // -----------------------------------------------------------------------

  const handleCoverFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!(FILE_LIMITS.IMAGE_TYPES as readonly string[]).includes(file.type)) {
      showToast.error('Please select a JPG, PNG, or WebP image');
      return;
    }
    if (file.size > FILE_LIMITS.COVER_MAX_SIZE) {
      showToast.error('Cover image must be under 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedCoverImage(reader.result as string);
      setCoverCropperOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCoverCropComplete = async (blob: Blob) => {
    setIsCoverUploading(true);
    const file = new File([blob], 'cover.jpg', { type: 'image/jpeg' });
    coverImageMutation.mutate(file);
  };

  // -----------------------------------------------------------------------
  // Field helpers
  // -----------------------------------------------------------------------

  const updateField = <K extends keyof UpdateCompanyRequest>(
    key: K,
    value: UpdateCompanyRequest[K],
  ) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      setFormDirty(JSON.stringify(next) !== initialFormRef.current);
      return next;
    });
  };

  const addToArray = (key: ArrayKey, value: string, clearFn: (v: string) => void) => {
    const trimmed = value.trim();
    if (trimmed && !((form[key] as string[] | undefined) || []).includes(trimmed)) {
      updateField(key, [
        ...((form[key] as string[] | undefined) || []),
        trimmed,
      ] as UpdateCompanyRequest[typeof key]);
      clearFn('');
    }
  };

  const removeFromArray = (key: ArrayKey, value: string) => {
    updateField(
      key,
      ((form[key] as string[] | undefined) || []).filter(
        (v) => v !== value,
      ) as UpdateCompanyRequest[typeof key],
    );
  };

  // Tick: copy whichever account values exist into the contact fields
  // (ContactSection locks them). Untick: clear ONLY account-derived
  // values so a manually-typed different email/phone isn't wiped.
  const handleUseAccountContact = (checked: boolean) => {
    setUseAccountContact(checked);
    setForm((prev) => {
      const next = checked
        ? {
            ...prev,
            ...(user?.email ? { contactEmail: user.email } : {}),
            ...(user?.mobileNumber ? { contactPhone: user.mobileNumber } : {}),
          }
        : {
            ...prev,
            ...(emailsMatch(prev.contactEmail, user?.email) ? { contactEmail: '' } : {}),
            ...(phonesMatch(prev.contactPhone, user?.mobileNumber) ? { contactPhone: '' } : {}),
          };
      setFormDirty(JSON.stringify(next) !== initialFormRef.current);
      return next;
    });
  };

  const handleSave = async () => {
    // Consent gate — account email/mobile may only be used as the public
    // contact via the checkbox in the Contact section. Format-tolerant
    // matching (case/whitespace for email, last-10-digits for phone) so
    // a manual retype can't dodge it.
    if (!useAccountContact) {
      if (
        emailsMatch(form.contactEmail, user?.email) ||
        phonesMatch(form.contactPhone, user?.mobileNumber)
      ) {
        handleSectionChange('contact');
        showToast.error(
          'Those are your account contact details — tick "Use my account contact details" in the Contact section, or enter different ones',
        );
        return;
      }
    }

    // PAN is mandatory for every employer (both account types) — same
    // rule the onboarding wizard enforces. Gating the save also walks
    // legacy employers (onboarded before PAN was required) to the Legal
    // section the next time they edit their profile.
    const pan = (form.panNumber || '').trim();
    if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
      handleSectionChange('legal');
      showToast.error(
        pan ? 'Enter a valid PAN (10 characters, e.g. AAAAA1234A)' : 'PAN number is required',
      );
      return;
    }

    // GST/CIN are optional, but if provided they must be valid - and a
    // GSTIN must embed the PAN (chars 3-12 are the PAN by spec).
    // Company-only: the fields are hidden for individuals, so legacy
    // junk on an individual row must not block a save they cannot fix.
    if (form.accountType !== 'INDIVIDUAL') {
      const gst = (form.gstNumber || '').trim();
      if (gst && !isValidGstin(gst)) {
        handleSectionChange('legal');
        showToast.error('Enter a valid 15-character GSTIN (e.g. 22AAAAA0000A1Z5)');
        return;
      }
      if (gst && !gstinEmbedsPan(gst, pan)) {
        handleSectionChange('legal');
        showToast.error('GSTIN does not match your PAN - characters 3-12 of a GSTIN are the PAN');
        return;
      }
      const cin = (form.cinNumber || '').trim();
      if (cin && !isValidCin(cin)) {
        handleSectionChange('legal');
        showToast.error('Enter a valid 21-character CIN (e.g. U12345MH2020PTC123456)');
        return;
      }
      const llpin = (form.llpinNumber || '').trim();
      if (llpin && !isValidLlpin(llpin)) {
        handleSectionChange('legal');
        showToast.error('Enter a valid LLPIN (e.g. AAB-1234)');
        return;
      }
    }

    // TAN applies to both account types (any TDS deductor).
    const tan = (form.tanNumber || '').trim();
    if (tan && !isValidTan(tan)) {
      handleSectionChange('legal');
      showToast.error('Enter a valid 10-character TAN (e.g. DELM12345B)');
      return;
    }

    // Save name if changed (lives on User model, not CompanyProfile)
    const nameChanged =
      firstName !== (user?.firstName || '') || lastName !== (user?.lastName || '');
    if (nameChanged && firstName.trim() && lastName.trim()) {
      try {
        const res = await authService.updateProfile({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });
        if (res.data?.user) {
          useAuthStore.getState().setUser(res.data.user);
        }
      } catch (err) {
        const error = err as unknown as ApiError;
        showToast.error(error.message || 'Failed to update name');
        return;
      }
    }

    // Transform fields to match backend schema before sending
    const { workplacePolicies, awardsRecognitions, structuredPerks, ...rest } = form;

    const payload = {
      ...rest,
      // Structured funding entered? Refresh the legacy display string so
      // every read site (company page, preview, super-admin) stays
      // correct without knowing about the structured columns.
      ...(rest.totalFundingRaisedAmount != null
        ? {
            totalFundingRaised: formatCompactCurrency(
              rest.totalFundingRaisedAmount,
              rest.fundingCurrency || 'INR',
            ),
          }
        : {}),
      // Filter out empty categories
      structuredPerks: structuredPerks?.length
        ? structuredPerks.filter((p) => p.category.trim())
        : undefined,
      // Backend expects Array<{ title, description }> not Record<string, string>
      workplacePolicies: workplacePolicies
        ? Object.entries(workplacePolicies as Record<string, string>)
            .filter(([, desc]) => desc.trim())
            .map(([title, description]) => ({ title, description }))
        : undefined,
      // Backend uses 'issuingOrg', frontend uses 'issuer'
      awardsRecognitions: awardsRecognitions?.length
        ? awardsRecognitions
            .filter((a) => a.title.trim())
            .map(({ issuer, ...award }) => ({
              ...award,
              issuingOrg: issuer || undefined,
            }))
        : undefined,
    };

    updateMutation.mutate(payload as UpdateCompanyRequest);
  };

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (isLoading) {
    return (
      <DashboardLayout requiredRole={['EMPLOYER']}>
        <div className="space-y-6">
          <Skeleton variant="rect" height={60} />
          <Skeleton variant="text" lines={10} />
        </div>
      </DashboardLayout>
    );
  }

  // -----------------------------------------------------------------------
  // Section content
  // -----------------------------------------------------------------------

  const isIndividual = form.accountType === 'INDIVIDUAL';
  const sectionProps = { form, updateField, addToArray, removeFromArray, isIndividual };

  const renderSection = () => {
    switch (activeSection) {
      case 'company':
        return <CompanyInfoSection {...sectionProps} />;
      case 'about':
        return <AboutSection form={form} updateField={updateField} />;
      case 'culture':
        return <CultureSection {...sectionProps} />;
      case 'benefits':
        return <BenefitsSection {...sectionProps} />;
      case 'tech':
        return <TechPoliciesSection {...sectionProps} />;
      case 'people':
        return <PeopleSection form={form} updateField={updateField} isIndividual={isIndividual} />;
      case 'awards':
        return <AwardsFundingSection {...sectionProps} />;
      case 'legal':
        return <LegalSection form={form} updateField={updateField} isIndividual={isIndividual} />;
      case 'contact':
        return (
          <ContactSection
            form={form}
            updateField={updateField}
            useAccountContact={useAccountContact}
            onUseAccountContactChange={handleUseAccountContact}
            isIndividual={isIndividual}
          />
        );
      case 'address':
        return <AddressSection {...sectionProps} />;
      case 'social':
        return <SocialSection form={form} updateField={updateField} />;
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Company Profile</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Manage your company information</p>
          </div>
          <div className="flex gap-2">
            <Tooltip content="Preview how candidates will see your profile">
              <Link href={ROUTES.EMPLOYER.PROFILE_PREVIEW}>
                <Button variant="outline" tooltip="Preview your company profile as a candidate">
                  <Eye className="mr-1.5 h-4 w-4" /> Preview as Candidate
                </Button>
              </Link>
            </Tooltip>
            <Button
              onClick={handleSave}
              isLoading={updateMutation.isPending}
              disabled={
                !formDirty &&
                firstName === (user?.firstName || '') &&
                lastName === (user?.lastName || '')
              }
              tooltip="Save all profile changes"
            >
              <Save className="mr-1.5 h-4 w-4" /> Save Changes
            </Button>
          </div>
        </div>

        {/* Completeness */}
        {completeness && completeness.score < 100 && (
          <Card padding="sm">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--text)]">
                  Profile Completeness: {completeness.score}%
                </p>
                <ProgressBar
                  value={completeness.score}
                  color={
                    completeness.score >= 80
                      ? 'success'
                      : completeness.score >= 50
                        ? 'warning'
                        : 'error'
                  }
                  size="sm"
                  className="mt-2"
                />
                {completeness.sections.filter((s) => !s.completed).length > 0 && (
                  <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                    Missing:{' '}
                    {completeness.sections
                      .filter((s) => !s.completed)
                      .slice(0, 3)
                      .map((s) => s.name)
                      .join(', ')}
                    {completeness.sections.filter((s) => !s.completed).length > 3 &&
                      ` +${completeness.sections.filter((s) => !s.completed).length - 3} more`}
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Logo */}
        <Card padding="sm">
          <div>
            <p className="mb-2 font-medium text-[var(--text)]">Company Logo</p>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Upload your company logo (aspect ratio 1:1, max 5MB)
            </p>
            <div className="flex items-center gap-4">
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--bg-tertiary)]">
                {company?.logo ? (
                  <img
                    src={company.logo}
                    alt={company?.companyName || 'Company logo'}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Building2 className="h-10 w-10 text-[var(--text-muted)]" />
                )}
                {isLogoUploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    onChange={handleLogoFileSelect}
                    className="sr-only"
                    disabled={isLogoUploading}
                  />
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)]">
                    <Camera className="h-4 w-4" />
                    {company?.logo ? 'Change Logo' : 'Upload Logo'}
                  </span>
                </label>
                {company?.logo && (
                  <Tooltip content="Remove your company logo">
                    <button
                      onClick={() => setShowRemoveLogoConfirm(true)}
                      disabled={isLogoUploading}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm font-medium text-[var(--error)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      Remove Logo
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              JPG, PNG, or WebP. Max 5MB. Will be cropped to 1:1 aspect ratio (400x400px).
            </p>
          </div>

          {selectedLogoImage && (
            <ImageCropper
              isOpen={logoCropperOpen}
              onClose={() => {
                setLogoCropperOpen(false);
                setSelectedLogoImage(null);
              }}
              imageSrc={selectedLogoImage}
              onCropComplete={handleLogoCropComplete}
              aspectRatio={1}
              circularCrop={true}
              outputWidth={400}
              outputHeight={400}
            />
          )}

          <ConfirmDialog
            isOpen={showRemoveLogoConfirm}
            onClose={() => setShowRemoveLogoConfirm(false)}
            onConfirm={async () => {
              try {
                setIsLogoUploading(true);
                setShowRemoveLogoConfirm(false);
                await removeLogoMutation.mutateAsync();
              } catch {
                // Error already handled in mutation
              } finally {
                setIsLogoUploading(false);
              }
            }}
            title="Remove Company Logo"
            message="Are you sure you want to remove your company logo? This action cannot be undone."
            confirmLabel="Remove"
            isLoading={isLogoUploading}
          />
        </Card>

        {/* Cover Image */}
        <Card padding="sm">
          <div>
            <p className="mb-2 font-medium text-[var(--text)]">Cover Image</p>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Upload a banner image for your company profile (aspect ratio 3:1, max 10MB)
            </p>
            <div className="flex items-center gap-4">
              <div className="relative flex h-32 w-48 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-tertiary)]">
                {company?.coverImage ? (
                  <img
                    src={company.coverImage}
                    alt="Company cover"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-12 w-12 text-[var(--text-muted)]" />
                )}
                {isCoverUploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    onChange={handleCoverFileSelect}
                    className="sr-only"
                    disabled={isCoverUploading}
                  />
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)]">
                    <Camera className="h-4 w-4" />
                    {company?.coverImage ? 'Change Cover' : 'Upload Cover'}
                  </span>
                </label>
                {company?.coverImage && (
                  <Tooltip content="Remove your cover image">
                    <button
                      onClick={() => setShowRemoveCoverConfirm(true)}
                      disabled={isCoverUploading}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm font-medium text-[var(--error)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      Remove Cover
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              JPG, PNG, or WebP. Max 5MB. Will be cropped to 3:1 aspect ratio (1920x640px).
            </p>
          </div>

          {selectedCoverImage && (
            <ImageCropper
              isOpen={coverCropperOpen}
              onClose={() => {
                setCoverCropperOpen(false);
                setSelectedCoverImage(null);
              }}
              imageSrc={selectedCoverImage}
              onCropComplete={handleCoverCropComplete}
              aspectRatio={3}
              circularCrop={false}
              outputWidth={1920}
              outputHeight={640}
            />
          )}

          <ConfirmDialog
            isOpen={showRemoveCoverConfirm}
            onClose={() => setShowRemoveCoverConfirm(false)}
            onConfirm={async () => {
              try {
                setIsCoverUploading(true);
                setShowRemoveCoverConfirm(false);
                await removeCoverImageMutation.mutateAsync();
              } catch {
                // Error already handled in mutation
              } finally {
                setIsCoverUploading(false);
              }
            }}
            title="Remove Cover Image"
            message="Are you sure you want to remove your cover image? This action cannot be undone."
            confirmLabel="Remove"
            isLoading={isCoverUploading}
          />
        </Card>

        {/* Your Name */}
        <Card padding="sm">
          <div>
            <p className="mb-2 font-medium text-[var(--text)]">Your Name</p>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Your personal name for account identification
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="First Name"
                placeholder="Enter your first name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
              <Input
                label="Last Name"
                placeholder="Enter your last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-4">
          {/* Sidebar */}
          <Card padding="sm">
            <nav className="space-y-1">
              {sections.map(({ key, label }) => (
                <Tooltip key={key} content={`Edit ${label} section`}>
                  <button
                    type="button"
                    onClick={() => handleSectionChange(key)}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      activeSection === key
                        ? 'bg-primary-light text-primary'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                    }`}
                  >
                    {label}
                  </button>
                </Tooltip>
              ))}
            </nav>
          </Card>

          {/* Content */}
          <div className="space-y-6 lg:col-span-3">
            <Card
              header={
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  {SECTION_HEADERS[activeSection]}
                </h2>
              }
            >
              {renderSection()}
            </Card>

            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                isLoading={updateMutation.isPending}
                tooltip="Save all profile changes"
              >
                <Save className="mr-1.5 h-4 w-4" /> Save Changes
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
