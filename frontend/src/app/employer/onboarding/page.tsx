'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Globe,
  Briefcase,
  Users,
  Award,
  MapPin,
  Mail,
  Phone,
  Plus,
  Trash2,
  Sparkles,
  Heart,
  Shield,
  Zap,
  Linkedin,
  Twitter,
  Facebook,
  Instagram,
  Youtube,
  Calendar,
  DollarSign,
  Gem,
  BookOpen,
  HandHeart,
  TrendingUp,
  UserCircle,
  Camera,
  ImageIcon,
  Briefcase as BriefcaseBusiness,
  Layers,
  Pencil,
} from 'lucide-react';
import OnboardingShell, { type OnboardingStep } from '@/components/onboarding/OnboardingShell';
import AuthSupportFooter from '@/components/support/AuthSupportFooter';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import { useOnboarding, markOnboardingComplete } from '@/hooks/use-onboarding';
import { emailsMatch, phonesMatch } from '@/lib/account-contact';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import DatePicker from '@/components/ui/DatePicker';
import Checkbox from '@/components/ui/Checkbox';
import PanInput from '@/components/ui/PanInput';
import GstinInput from '@/components/ui/GstinInput';
import CinInput from '@/components/ui/CinInput';
import LlpinInput from '@/components/ui/LlpinInput';
import TanInput from '@/components/ui/TanInput';
import CurrencyAmountInput from '@/components/ui/CurrencyAmountInput';
import { formatCompactCurrency } from '@/lib/currency';
import {
  isValidGstin,
  isValidCin,
  isValidLlpin,
  isValidTan,
  gstinEmbedsPan,
} from '@/lib/legal-ids';
import PhoneInput from '@/components/ui/PhoneInput';
import Textarea from '@/components/ui/Textarea';
import Select, { type SelectOption } from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import Tag from '@/components/ui/Tag';
import Tooltip from '@/components/ui/Tooltip';
import FileUpload from '@/components/ui/FileUpload';
import ImageCropper from '@/components/ui/ImageCropper';
import { showToast } from '@/components/ui/Toast';
import { employerService } from '@/services/employer.service';
import { ROUTES } from '@/constants/routes';
import { QUERY_KEYS, FILE_LIMITS } from '@/constants/config';
import {
  COMPANY_TYPE_LABELS,
  FUNDING_STAGE_LABELS,
  ACCOUNT_TYPE_LABELS,
  HIRING_TYPE_LABELS,
  getSubIndustriesForIndustry,
} from '@/constants/enums';
import { INDIAN_STATES, REVENUE_RANGE_OPTIONS } from '@/constants/suggestions';
import { useAuth } from '@/hooks/use-auth';
import type {
  UpdateCompanyRequest,
  LeadershipEntry,
  EmployeeTestimonialEntry,
} from '@/types/employer';
import type { ApiError } from '@/types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSelectOptions(labels: Record<string, string>): SelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

function emptyLeadership(): LeadershipEntry {
  return { name: '', designation: '', linkedinUrl: '', bio: '' };
}

function emptyTestimonial(): EmployeeTestimonialEntry {
  return { name: '', designation: '', department: '', quote: '' };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmployerOnboardingData {
  [key: string]: unknown;
  // Step: Account Type
  accountType: string;
  hiringType: string;
  // Step: Company Basics
  companyName: string;
  companyType: string;
  industry: string;
  subIndustry: string;
  specialties: string[];
  companySize: string;
  employeeCount: number | undefined;
  numberOfOffices: number | undefined;
  foundedYear: number | undefined;
  website: string;
  parentCompany: string;
  stockTicker: string;
  // Step: Company Identity
  tagline: string;
  description: string;
  whyWorkForUs: string;
  // Step: Mission & Culture
  missionStatement: string;
  visionStatement: string;
  companyCulture: string;
  diversityStatement: string;
  coreValues: string[];
  employeeResourceGroups: string[];
  // Step: Benefits & Perks
  benefits: string[];
  structuredPerks: Array<{ category: string; perks: string[] }>;
  // Step: Tech Stack & Policies
  techStack: string[];
  productsServices: string[];
  workplacePolicies: Record<string, string>;
  // Step: Awards & Recognition
  awardsRecognitions: Array<{ title: string; year?: number; issuer?: string }>;
  // Step: Legal & Financial (optional)
  gstNumber: string;
  cinNumber: string;
  panNumber: string;
  llpinNumber: string;
  tanNumber: string;
  annualRevenueRange: string;
  // Step: Funding
  fundingStage: string;
  totalFundingRaised: string;
  totalFundingRaisedAmount: number | undefined;
  fundingCurrency: string;
  investors: string[];
  // Step: Leadership
  leadershipTeam: LeadershipEntry[];
  employeeTestimonials: EmployeeTestimonialEntry[];
  // Step: Why Work For Us / Interview Process
  // Step: CSR & Values
  csrInitiatives: string;
  // Step: Contact Information
  /**
   * Explicit consent to use the ACCOUNT email/mobile as the public
   * company contact. Persisted with the draft so revisiting the step
   * (or reloading) keeps the fields locked/cleared consistently.
   */
  useAccountContact: boolean;
  contactEmail: string;
  contactPhone: string;
  contactPersonName: string;
  contactPersonDesignation: string;
  // Step: Company Address
  headquarters: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  locations: string[];
  // Step: Social Profiles & Video
  companyVideoUrl: string;
  socialLinks: {
    linkedin: string;
    twitter: string;
    facebook: string;
    instagram: string;
    youtube: string;
    glassdoor: string;
  };
  careersPageUrl: string;
  blogUrl: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS: OnboardingStep[] = [
  { key: 'welcome', label: 'Welcome' },
  { key: 'accountType', label: 'Account Type' },
  { key: 'basics', label: 'Company Basics' },
  { key: 'legal', label: 'Legal & Financial' },
  { key: 'contact', label: 'Contact Info' },
  { key: 'address', label: 'Address & Locations' },
  { key: 'social', label: 'Social Profiles', optional: true },
  { key: 'review', label: 'Review' },
];

const INITIAL_DATA: EmployerOnboardingData = {
  accountType: '',
  hiringType: '',
  companyName: '',
  companyType: '',
  industry: '',
  subIndustry: '',
  specialties: [],
  companySize: '',
  employeeCount: undefined,
  numberOfOffices: undefined,
  foundedYear: undefined,
  website: '',
  parentCompany: '',
  stockTicker: '',
  tagline: '',
  description: '',
  whyWorkForUs: '',
  missionStatement: '',
  visionStatement: '',
  companyCulture: '',
  diversityStatement: '',
  coreValues: [],
  employeeResourceGroups: [],
  benefits: [],
  structuredPerks: [],
  techStack: [],
  productsServices: [],
  workplacePolicies: {},
  awardsRecognitions: [],
  gstNumber: '',
  cinNumber: '',
  panNumber: '',
  llpinNumber: '',
  tanNumber: '',
  annualRevenueRange: '',
  fundingStage: '',
  totalFundingRaised: '',
  totalFundingRaisedAmount: undefined,
  fundingCurrency: 'INR',
  investors: [],
  leadershipTeam: [],
  employeeTestimonials: [],
  csrInitiatives: '',
  useAccountContact: false,
  contactEmail: '',
  contactPhone: '',
  contactPersonName: '',
  contactPersonDesignation: '',
  headquarters: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  locations: [],
  companyVideoUrl: '',
  socialLinks: {
    linkedin: '',
    twitter: '',
    facebook: '',
    instagram: '',
    youtube: '',
    glassdoor: '',
  },
  careersPageUrl: '',
  blogUrl: '',
};

const companySizeOptions: SelectOption[] = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1000 employees' },
  { value: '1001-5000', label: '1001-5000 employees' },
  { value: '5001-10000', label: '5001-10000 employees' },
  { value: '10000+', label: '10000+ employees' },
];

const QUICK_BENEFITS = [
  'Health Insurance',
  'Work From Home',
  'Flexible Hours',
  'Stock Options (ESOPs)',
  'Free Meals',
  'Paid Vacation',
];

const WORKPLACE_POLICY_KEYS = ['Remote Work Policy', 'Leave Policy', 'Work Hours', 'Dress Code'];

const stateOptions: SelectOption[] = INDIAN_STATES.map((s) => ({ value: s, label: s }));

const revenueOptions: SelectOption[] = REVENUE_RANGE_OPTIONS.map((r) => ({ value: r, label: r }));

const FUNDING_STAGE_OPTIONS: SelectOption[] = toSelectOptions(FUNDING_STAGE_LABELS);

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

/**
 * Page wrapper — holds rendering until the auth store hydrates so the
 * wizard below receives a STABLE, user-scoped localStorage key.
 *
 * The onboarding autosave + `_skipped` completion flag used to live
 * under the browser-global key `ha_employer_onboarding`; any account
 * that completed/skipped the wizard poisoned that key for every later
 * account on the same browser, silently bypassing the wizard. Keys are
 * now `ha_employer_onboarding_<userId>` (see the candidate wizard for
 * the full rationale), and mounting only after `user.id` exists keeps
 * an "anon"-keyed first render from leaking drafts across accounts.
 */
export default function EmployerOnboardingPage() {
  const { user } = useAuth();
  if (!user?.id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)]">
        <Spinner size="lg" />
      </div>
    );
  }
  return <EmployerOnboardingWizard userId={user.id} />;
}

function EmployerOnboardingWizard({ userId }: { userId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // --- Onboarding hook ---------------------------------------------------
  const {
    step,
    data,
    updateData,
    nextStep,
    prevStep,
    goToStep,
    editFromReview,
    goToStepFromReview,
    returnToReview,
    highestVisitedStep,
    isFirstStep,
    isLastStep,
    skipOnboarding,
  } = useOnboarding<EmployerOnboardingData>({
    // User-scoped — the derived `${storageKey}_skipped` flag inherits it.
    storageKey: `ha_employer_onboarding_${userId}`,
    totalSteps: STEPS.length,
    initialData: INITIAL_DATA,
  });

  // --- Pre-fill from existing company profile (e.g. company name from registration) ---
  const prefilled = useRef(false);
  const { data: existingCompany } = useQuery({
    queryKey: QUERY_KEYS.EMPLOYERS.COMPANY,
    queryFn: () => employerService.getCompany(),
  });

  useEffect(() => {
    if (prefilled.current || !existingCompany?.data) return;
    const c = existingCompany.data;
    // Only pre-fill fields that are empty in the onboarding form
    const updates: Partial<EmployerOnboardingData> = {};
    if (c.accountType && !data.accountType) updates.accountType = c.accountType;
    if (c.hiringType && !data.hiringType) updates.hiringType = c.hiringType;
    // Individuals always hire DIRECT — normalise legacy rows that were
    // saved before hiringType became company-only (e.g. an INDIVIDUAL
    // row with CONSULTANCY from the old always-visible selector).
    const effectiveAccountType = updates.accountType ?? data.accountType;
    if (effectiveAccountType === 'INDIVIDUAL') updates.hiringType = 'DIRECT';
    if (c.companyName && !data.companyName) updates.companyName = c.companyName;
    if (c.industry && !data.industry) updates.industry = c.industry;
    if (c.companyType && !data.companyType) updates.companyType = c.companyType;
    if (c.companySize && !data.companySize) updates.companySize = c.companySize;
    if (c.website && !data.website) updates.website = c.website;
    if (c.description && !data.description) updates.description = c.description;
    if (c.tagline && !data.tagline) updates.tagline = c.tagline;
    if (Object.keys(updates).length > 0) {
      updateData(updates);
      prefilled.current = true;
    }
  }, [existingCompany, data, updateData]);

  // ── Account-contact consent invariant ────────────────────────────────
  // While the "use my account contact details" checkbox is ticked, the
  // contact fields must EXACTLY hold the account values. Re-asserting on
  // every relevant change closes the step-navigation loopholes: a stale
  // autosaved draft restored from localStorage, the account email/mobile
  // changing between sessions, or hand-edited storage can't leave a
  // ticked checkbox with mismatched (yet locked-looking) values.
  useEffect(() => {
    if (!data.useAccountContact) return;
    const fix: Partial<EmployerOnboardingData> = {};
    if (user?.email && !emailsMatch(data.contactEmail, user.email)) {
      fix.contactEmail = user.email;
    }
    if (user?.mobileNumber && !phonesMatch(data.contactPhone, user.mobileNumber)) {
      fix.contactPhone = user.mobileNumber;
    }
    if (Object.keys(fix).length > 0) updateData(fix);
  }, [
    data.useAccountContact,
    data.contactEmail,
    data.contactPhone,
    user?.email,
    user?.mobileNumber,
    updateData,
  ]);

  // Tick: copy whichever account values exist into the contact fields
  // (they become locked in renderContact). Untick: clear ONLY the
  // account-derived values so a manually-typed different email/phone
  // isn't wiped. Plain function — React Compiler memoizes automatically
  // (manual useCallback with optional-chained deps gets skipped by it).
  const handleUseAccountContact = (checked: boolean) => {
    if (checked) {
      updateData({
        useAccountContact: true,
        ...(user?.email ? { contactEmail: user.email } : {}),
        ...(user?.mobileNumber ? { contactPhone: user.mobileNumber } : {}),
      });
    } else {
      updateData({
        useAccountContact: false,
        ...(emailsMatch(data.contactEmail, user?.email) ? { contactEmail: '' } : {}),
        ...(phonesMatch(data.contactPhone, user?.mobileNumber) ? { contactPhone: '' } : {}),
      });
    }
  };

  // --- Local input states for tag-based fields ---------------------------
  const [benefitInput, setBenefitInput] = useState('');
  const [techInput, setTechInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [specialtyInput, setSpecialtyInput] = useState('');
  const [coreValueInput, setCoreValueInput] = useState('');
  const [investorInput, setInvestorInput] = useState('');
  const [productInput, setProductInput] = useState('');
  const [ergInput, setErgInput] = useState('');
  const [perkInputs, setPerkInputs] = useState<Record<number, string>>({});

  // Logo cropper state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoCropperOpen, setLogoCropperOpen] = useState(false);
  const [selectedLogoImage, setSelectedLogoImage] = useState<string | null>(null);

  // Cover image cropper state
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);
  const [coverCropperOpen, setCoverCropperOpen] = useState(false);
  const [selectedCoverImage, setSelectedCoverImage] = useState<string | null>(null);

  // --- Mutations ----------------------------------------------------------
  const saveMutation = useMutation({
    mutationFn: (payload: UpdateCompanyRequest) => employerService.updateCompany(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.EMPLOYERS.COMPANY });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.EMPLOYERS.COMPLETENESS });
    },
  });

  const logoMutation = useMutation({
    mutationFn: (file: File) => employerService.uploadLogo(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.EMPLOYERS.COMPANY });
      showToast.success('Logo uploaded successfully');
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr?.message || 'Failed to upload logo');
    },
  });

  const coverImageMutation = useMutation({
    mutationFn: (file: File) => employerService.uploadCoverImage(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.EMPLOYERS.COMPANY });
      showToast.success('Cover image uploaded successfully');
    },
    onError: (err) => {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr?.message || 'Failed to upload cover image');
    },
  });

  // --- Logo handlers ------------------------------------------------------
  const handleLogoDrop = (files: File[]) => {
    const file = files[0];
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
  };

  const handleLogoCropComplete = (blob: Blob) => {
    const file = new File([blob], 'logo.jpg', { type: 'image/jpeg' });
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(blob));
    setSelectedLogoImage(null);
  };

  // --- Cover image handlers -----------------------------------------------
  const handleCoverDrop = (files: File[]) => {
    const file = files[0];
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
  };

  const handleCoverCropComplete = (blob: Blob) => {
    const file = new File([blob], 'cover.jpg', { type: 'image/jpeg' });
    setCoverImageFile(file);
    setCoverImagePreview(URL.createObjectURL(blob));
    setSelectedCoverImage(null);
  };

  // --- Validation ---------------------------------------------------------
  const validateStepByKey = useCallback(
    (key: string): string | null => {
      if (key === 'accountType') {
        if (!data.accountType) return 'Please select your account type';
        // Hiring type is only asked of companies — individuals are
        // auto-assigned DIRECT when they pick Individual/Proprietor.
        if (data.accountType === 'COMPANY' && !data.hiringType)
          return 'Please select your hiring type';
      }
      if (key === 'basics') {
        if (!data.companyName.trim()) return 'Company name is required';
        if (!data.industry.trim()) return 'Industry is required';
      }
      if (key === 'identity') {
        if (!data.description.trim()) return 'Company description is required';
      }
      if (key === 'legal') {
        const pan = data.panNumber.trim();
        if (!pan) return 'PAN number is required';
        if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan))
          return 'Enter a valid PAN (10 characters, e.g. AAAAA1234A)';
        // GST/CIN are optional, but if provided they must be valid.
        // Company-only: the fields are hidden for individuals, so a
        // legacy junk value on an individual row must not hard-block a
        // step they cannot see or fix.
        if (data.accountType === 'COMPANY') {
          const gst = data.gstNumber.trim();
          if (gst && !isValidGstin(gst))
            return 'Enter a valid 15-character GSTIN (e.g. 22AAAAA0000A1Z5)';
          if (gst && !gstinEmbedsPan(gst, pan))
            return 'GSTIN does not match your PAN - characters 3-12 of a GSTIN are the PAN';
          const cin = data.cinNumber.trim();
          if (cin && !isValidCin(cin))
            return 'Enter a valid 21-character CIN (e.g. U12345MH2020PTC123456)';
          const llpin = data.llpinNumber.trim();
          if (llpin && !isValidLlpin(llpin)) return 'Enter a valid LLPIN (e.g. AAB-1234)';
        }
        // TAN applies to both account types (any TDS deductor).
        const tan = data.tanNumber.trim();
        if (tan && !isValidTan(tan)) return 'Enter a valid 10-character TAN (e.g. DELM12345B)';
      }
      if (key === 'contact') {
        if (!data.contactEmail.trim()) return 'Contact email is required';
        // Consent gate: the ACCOUNT email/mobile may only be used as the
        // public contact via the explicit checkbox (which also locks the
        // field). Typing the same value manually without ticking it is
        // rejected — matching is format-tolerant (case/whitespace for
        // email, last-10-digits for phone) so it can't be dodged.
        if (!data.useAccountContact) {
          if (emailsMatch(data.contactEmail, user?.email)) {
            return 'That is your account email — tick "Use my account contact details" to use it, or enter a different contact email';
          }
          if (phonesMatch(data.contactPhone, user?.mobileNumber)) {
            return 'That is your account mobile number — tick "Use my account contact details" to use it, or enter a different contact phone';
          }
        }
      }
      return null;
    },
    [data, user?.email, user?.mobileNumber],
  );

  const validateStep = useCallback((): boolean => {
    const error = validateStepByKey(STEPS[step]?.key ?? '');
    if (error) {
      showToast.error(error);
      return false;
    }
    return true;
  }, [step, validateStepByKey]);

  // --- Handle next --------------------------------------------------------
  // Build the full company payload from current form state. Used by both the
  // final-step save (handleNext) and the Skip-to-dashboard handler so partial
  // progress isn't lost when the user skips mid-wizard.
  const buildPayload = useCallback(
    (): UpdateCompanyRequest => ({
      accountType: (data.accountType as UpdateCompanyRequest['accountType']) || undefined,
      hiringType: (data.hiringType as UpdateCompanyRequest['hiringType']) || undefined,
      companyName: data.companyName || undefined,
      companyType: (data.companyType as UpdateCompanyRequest['companyType']) || undefined,
      industry: data.industry || undefined,
      subIndustry: data.subIndustry || undefined,
      specialties: data.specialties.length > 0 ? data.specialties : undefined,
      companySize: data.companySize || undefined,
      employeeCount: data.employeeCount,
      numberOfOffices: data.numberOfOffices,
      foundedYear: data.foundedYear,
      website: data.website || undefined,
      parentCompany: data.parentCompany || undefined,
      stockTicker: data.stockTicker || undefined,
      tagline: data.tagline || undefined,
      description: data.description || undefined,
      whyWorkForUs: data.whyWorkForUs || undefined,
      missionStatement: data.missionStatement || undefined,
      visionStatement: data.visionStatement || undefined,
      companyCulture: data.companyCulture || undefined,
      diversityStatement: data.diversityStatement || undefined,
      coreValues: data.coreValues.length > 0 ? data.coreValues : undefined,
      employeeResourceGroups:
        data.employeeResourceGroups.length > 0 ? data.employeeResourceGroups : undefined,
      benefits: data.benefits.length > 0 ? data.benefits : undefined,
      structuredPerks:
        data.structuredPerks.length > 0
          ? (data.structuredPerks.filter((p) =>
              p.category.trim(),
            ) as UpdateCompanyRequest['structuredPerks'])
          : undefined,
      techStack: data.techStack.length > 0 ? data.techStack : undefined,
      productsServices: data.productsServices.length > 0 ? data.productsServices : undefined,
      // Backend expects Array<{ title, description }> not Record<string, string>
      workplacePolicies:
        Object.keys(data.workplacePolicies).length > 0
          ? (Object.entries(data.workplacePolicies)
              .filter(([, desc]) => desc.trim())
              .map(([title, description]) => ({
                title,
                description,
              })) as unknown as UpdateCompanyRequest['workplacePolicies'])
          : undefined,
      // Backend uses 'issuingOrg', frontend uses 'issuer'
      awardsRecognitions:
        data.awardsRecognitions.length > 0
          ? (data.awardsRecognitions
              .filter((a) => a.title.trim())
              .map(({ issuer, ...award }) => ({
                ...award,
                issuingOrg: issuer || undefined,
              })) as unknown as UpdateCompanyRequest['awardsRecognitions'])
          : undefined,
      gstNumber: data.gstNumber || undefined,
      cinNumber: data.cinNumber || undefined,
      panNumber: data.panNumber || undefined,
      llpinNumber: data.llpinNumber || undefined,
      tanNumber: data.tanNumber || undefined,
      annualRevenueRange: data.annualRevenueRange || undefined,
      // Funding & investors are intentionally NOT collected in the
      // onboarding wizard (the step was removed to keep onboarding short).
      // These fields remain fully editable from the company profile page,
      // so they're simply omitted from the onboarding payload rather than
      // sent as empty values.
      leadershipTeam: data.leadershipTeam.length > 0 ? data.leadershipTeam : undefined,
      employeeTestimonials:
        data.employeeTestimonials.length > 0 ? data.employeeTestimonials : undefined,
      csrInitiatives: data.csrInitiatives || undefined,
      contactEmail: data.contactEmail || undefined,
      contactPhone: data.contactPhone || undefined,
      contactPersonName: data.contactPersonName || undefined,
      contactPersonDesignation: data.contactPersonDesignation || undefined,
      headquarters: data.headquarters || undefined,
      addressLine1: data.addressLine1 || undefined,
      addressLine2: data.addressLine2 || undefined,
      city: data.city || undefined,
      state: data.state || undefined,
      pincode: data.pincode || undefined,
      country: data.country || undefined,
      locations: data.locations.length > 0 ? data.locations : undefined,
      socialLinks: {
        linkedin: data.socialLinks.linkedin || undefined,
        twitter: data.socialLinks.twitter || undefined,
        facebook: data.socialLinks.facebook || undefined,
        instagram: data.socialLinks.instagram || undefined,
        youtube: data.socialLinks.youtube || undefined,
        glassdoor: data.socialLinks.glassdoor || undefined,
      },
      careersPageUrl: data.careersPageUrl || undefined,
      blogUrl: data.blogUrl || undefined,
      companyVideoUrl: data.companyVideoUrl || undefined,
    }),
    [data],
  );

  const handleNext = useCallback(async () => {
    if (!validateStep()) return;

    if (isLastStep) {
      // Defense-in-depth for the contact-consent rule: "Save & Return to
      // Review" doesn't validate, so a user can edit the contact step
      // from review, type their account email/mobile WITHOUT ticking the
      // consent checkbox, and arrive back here — where validateStep()
      // only checks the review step. Re-validate the contact rules at
      // the final save and route the user back to the offending step.
      for (const guardKey of ['legal', 'contact'] as const) {
        const guardError = validateStepByKey(guardKey);
        if (guardError) {
          showToast.error(guardError);
          const guardIdx = STEPS.findIndex((s) => s.key === guardKey);
          if (guardIdx >= 0) goToStep(guardIdx);
          return;
        }
      }
      try {
        await saveMutation.mutateAsync(buildPayload());

        // Upload logo if provided
        if (logoFile) {
          await logoMutation.mutateAsync(logoFile);
        }

        // Upload cover image if provided
        if (coverImageFile) {
          await coverImageMutation.mutateAsync(coverImageFile);
        }

        markOnboardingComplete(`ha_employer_onboarding_${userId}`);
        showToast.success('Company profile created!', 'Welcome to Hire Adda');
        // Send the new employer to the pricing page so they can pick a paid
        // plan immediately, or fall through to the dashboard via the
        // "Continue with Free Plan" CTA (EMP_FREE was auto-granted at signup).
        router.push('/pricing/employer?from=onboarding');
      } catch (err) {
        const apiErr = err as unknown as ApiError;
        showToast.error(apiErr?.message || 'Failed to save profile. Please try again.');
      }
      return;
    }

    // Auto-skip steps that don't apply to this account type
    let target = step + 1;
    while (
      target < STEPS.length &&
      data.accountType === 'INDIVIDUAL' &&
      ['funding'].includes(STEPS[target].key)
    ) {
      target++;
    }
    if (target >= STEPS.length) target = STEPS.length - 1;
    goToStep(target);
  }, [
    validateStep,
    validateStepByKey,
    isLastStep,
    buildPayload,
    data.accountType,
    step,
    logoFile,
    coverImageFile,
    saveMutation,
    logoMutation,
    coverImageMutation,
    goToStep,
    router,
    userId,
  ]);

  // --- Skip handler -------------------------------------------------------
  // Persist whatever the user has filled so far before leaving — otherwise
  // localStorage gets cleared on skip and partial progress is lost.
  // Plain function — React Compiler memoizes automatically (manual
  // useCallback with optional-chained deps gets skipped by it).
  const handleSkip = async () => {
    try {
      // Skip must stay frictionless (it's "save partial progress"), so
      // instead of erroring on the contact-consent rule we silently OMIT
      // unconsented account-matching contact values from the saved
      // payload. Without this, typing the account email on the contact
      // step and hitting "Skip for now" would persist it with zero
      // validation — the exact loophole the consent checkbox exists to
      // close. The typed value stays in the local draft, so when the
      // user resumes the wizard the normal step validation picks it up.
      const payload = buildPayload();
      if (!data.useAccountContact) {
        if (emailsMatch(payload.contactEmail, user?.email)) payload.contactEmail = undefined;
        if (phonesMatch(payload.contactPhone, user?.mobileNumber)) payload.contactPhone = undefined;
      }
      await saveMutation.mutateAsync(payload);
      if (logoFile) await logoMutation.mutateAsync(logoFile);
      if (coverImageFile) await coverImageMutation.mutateAsync(coverImageFile);
      skipOnboarding();
      router.push(ROUTES.EMPLOYER.DASHBOARD);
    } catch (err) {
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr?.message || 'Failed to save progress. Please try again.');
    }
  };

  // --- Tag helpers --------------------------------------------------------
  const addBenefit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed && !data.benefits.includes(trimmed)) {
        updateData({ benefits: [...data.benefits, trimmed] });
      }
      setBenefitInput('');
    },
    [data.benefits, updateData],
  );

  const removeBenefit = useCallback(
    (value: string) => {
      updateData({ benefits: data.benefits.filter((b) => b !== value) });
    },
    [data.benefits, updateData],
  );

  const addTech = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed && !data.techStack.includes(trimmed)) {
        updateData({ techStack: [...data.techStack, trimmed] });
      }
      setTechInput('');
    },
    [data.techStack, updateData],
  );

  const removeTech = useCallback(
    (value: string) => {
      updateData({ techStack: data.techStack.filter((t) => t !== value) });
    },
    [data.techStack, updateData],
  );

  const addLocation = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed && !data.locations.includes(trimmed)) {
        updateData({ locations: [...data.locations, trimmed] });
      }
      setLocationInput('');
    },
    [data.locations, updateData],
  );

  const removeLocation = useCallback(
    (value: string) => {
      updateData({ locations: data.locations.filter((l) => l !== value) });
    },
    [data.locations, updateData],
  );

  const addSpecialty = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed && !data.specialties.includes(trimmed)) {
        updateData({ specialties: [...data.specialties, trimmed] });
      }
      setSpecialtyInput('');
    },
    [data.specialties, updateData],
  );

  const removeSpecialty = useCallback(
    (value: string) => {
      updateData({ specialties: data.specialties.filter((s) => s !== value) });
    },
    [data.specialties, updateData],
  );

  const addCoreValue = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed && !data.coreValues.includes(trimmed)) {
        updateData({ coreValues: [...data.coreValues, trimmed] });
      }
      setCoreValueInput('');
    },
    [data.coreValues, updateData],
  );

  const removeCoreValue = useCallback(
    (value: string) => {
      updateData({ coreValues: data.coreValues.filter((v) => v !== value) });
    },
    [data.coreValues, updateData],
  );

  const addInvestor = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed && !data.investors.includes(trimmed)) {
        updateData({ investors: [...data.investors, trimmed] });
      }
      setInvestorInput('');
    },
    [data.investors, updateData],
  );

  const removeInvestor = useCallback(
    (value: string) => {
      updateData({ investors: data.investors.filter((i) => i !== value) });
    },
    [data.investors, updateData],
  );

  const addProduct = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed && !data.productsServices.includes(trimmed)) {
        updateData({ productsServices: [...data.productsServices, trimmed] });
      }
      setProductInput('');
    },
    [data.productsServices, updateData],
  );

  const removeProduct = useCallback(
    (value: string) => {
      updateData({ productsServices: data.productsServices.filter((p) => p !== value) });
    },
    [data.productsServices, updateData],
  );

  const addErg = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed && !data.employeeResourceGroups.includes(trimmed)) {
        updateData({ employeeResourceGroups: [...data.employeeResourceGroups, trimmed] });
      }
      setErgInput('');
    },
    [data.employeeResourceGroups, updateData],
  );

  const removeErg = useCallback(
    (value: string) => {
      updateData({
        employeeResourceGroups: data.employeeResourceGroups.filter((e) => e !== value),
      });
    },
    [data.employeeResourceGroups, updateData],
  );

  // --- Award helpers ------------------------------------------------------
  const addAward = useCallback(() => {
    updateData({
      awardsRecognitions: [...data.awardsRecognitions, { title: '', year: undefined, issuer: '' }],
    });
  }, [data.awardsRecognitions, updateData]);

  const updateAward = useCallback(
    (index: number, field: string, value: string | number | undefined) => {
      const updated = [...data.awardsRecognitions];
      updated[index] = { ...updated[index], [field]: value };
      updateData({ awardsRecognitions: updated });
    },
    [data.awardsRecognitions, updateData],
  );

  const removeAward = useCallback(
    (index: number) => {
      updateData({ awardsRecognitions: data.awardsRecognitions.filter((_, i) => i !== index) });
    },
    [data.awardsRecognitions, updateData],
  );

  // --- Leadership helpers -------------------------------------------------
  const addLeadership = useCallback(() => {
    updateData({ leadershipTeam: [...data.leadershipTeam, emptyLeadership()] });
  }, [data.leadershipTeam, updateData]);

  const updateLeadership = useCallback(
    (index: number, field: string, value: string) => {
      const updated = [...data.leadershipTeam];
      updated[index] = { ...updated[index], [field]: value };
      updateData({ leadershipTeam: updated });
    },
    [data.leadershipTeam, updateData],
  );

  const removeLeadership = useCallback(
    (index: number) => {
      updateData({ leadershipTeam: data.leadershipTeam.filter((_, i) => i !== index) });
    },
    [data.leadershipTeam, updateData],
  );

  // --- Testimonial helpers ------------------------------------------------
  const addTestimonial = useCallback(() => {
    updateData({ employeeTestimonials: [...data.employeeTestimonials, emptyTestimonial()] });
  }, [data.employeeTestimonials, updateData]);

  const updateTestimonial = useCallback(
    (index: number, field: string, value: string) => {
      const updated = [...data.employeeTestimonials];
      updated[index] = { ...updated[index], [field]: value };
      updateData({ employeeTestimonials: updated });
    },
    [data.employeeTestimonials, updateData],
  );

  const removeTestimonial = useCallback(
    (index: number) => {
      updateData({ employeeTestimonials: data.employeeTestimonials.filter((_, i) => i !== index) });
    },
    [data.employeeTestimonials, updateData],
  );

  // --- Workplace policy helpers -------------------------------------------
  const updatePolicy = useCallback(
    (key: string, value: string) => {
      updateData({
        workplacePolicies: { ...data.workplacePolicies, [key]: value },
      });
    },
    [data.workplacePolicies, updateData],
  );

  // --- Social link helper -------------------------------------------------
  const updateSocial = useCallback(
    (platform: keyof EmployerOnboardingData['socialLinks'], value: string) => {
      updateData({
        socialLinks: { ...data.socialLinks, [platform]: value },
      });
    },
    [data.socialLinks, updateData],
  );

  // --- Compute step title / subtitle --------------------------------------
  const getStepTitle = (): string => {
    const titles: Record<string, string> = {
      welcome: 'Welcome to Hire Adda!',
      accountType: 'Account Type',
      basics: `${companyLabel} Basics`,
      identity: 'Company Identity',
      culture: 'Mission & Culture',
      whyWorkForUs: 'Why Work For Us',
      benefits: 'Benefits & Perks',
      tech: 'Tech Stack & Policies',
      leadership: 'Leadership & Testimonials',
      awards: 'Awards & Recognition',
      funding: 'Funding & Investors',
      contact: 'Contact Information',
      address: 'Address & Locations',
      social: 'Social Profiles',
      // `legal` was missing here (the map still carries keys from an
      // older step layout) — the step rendered the 'Onboarding' fallback
      // title instead of its label.
      legal: 'Legal & Financial',
      csrValues: 'CSR & Values',
      review: 'Review & Complete',
    };
    return titles[STEPS[step]?.key] || 'Onboarding';
  };

  const getStepSubtitle = (): string => {
    const subtitles: Record<string, string> = {
      welcome: "Let's set up your company profile",
      accountType: 'Tell us about your hiring setup',
      basics: `Tell us about your ${companyLabel.toLowerCase()}`,
      identity: 'Help candidates understand who you are',
      culture: 'Share your company values and culture',
      whyWorkForUs: 'Tell candidates why they should join you',
      benefits: 'Highlight what you offer to employees',
      tech: 'Share your tech stack and workplace policies',
      leadership: 'Showcase your team and employee voices',
      awards: 'Showcase your achievements',
      funding: 'Share your funding journey',
      contact: 'How can candidates reach you?',
      address: 'Where is your company located?',
      social: 'Connect your social media profiles',
      legal: 'Registration and financial details build candidate trust',
      csrValues: 'Share your social responsibility initiatives',
      review: 'Review your profile before completing setup',
    };
    return subtitles[STEPS[step]?.key] || '';
  };

  // --- Computed helpers for review ----------------------------------------
  const isIndividual = data.accountType === 'INDIVIDUAL';
  const isConsultancy = data.hiringType === 'CONSULTANCY';
  const companyLabel = isIndividual ? 'Business' : 'Company';

  // Hide steps that are not applicable for INDIVIDUAL accounts.
  // `step` state remains an index into the full STEPS array.
  const HIDDEN_FOR_INDIVIDUAL = ['funding'];
  const isHidden = (key: string) => isIndividual && HIDDEN_FOR_INDIVIDUAL.includes(key);
  const visibleSteps = STEPS.filter((s) => !isHidden(s.key));

  // Skip is blocked until the critical steps are filled — account type,
  // company basics, and legal (PAN is mandatory for every employer).
  // Later required steps (contact, address) can be skipped and completed
  // later from the dashboard.
  const MUST_COMPLETE_BEFORE_SKIP = ['accountType', 'basics', 'legal'];
  const canSkip = MUST_COMPLETE_BEFORE_SKIP.every((key) => !validateStepByKey(key));
  const currentVisibleStep = Math.max(
    0,
    visibleSteps.findIndex((s) => s.key === STEPS[step]?.key),
  );

  const handlePrevSmart = useCallback(() => {
    let target = step - 1;
    while (target >= 0 && isHidden(STEPS[target].key)) target--;
    if (target < 0) target = 0;
    goToStep(target);
  }, [step, isHidden, goToStep]);

  // When jumping FORWARD via tab click, validate every required step in between.
  // If any fail, route the user to the first failing step.
  const handleGoToVisibleStep = useCallback(
    (visibleIdx: number) => {
      const targetKey = visibleSteps[visibleIdx]?.key;
      if (!targetKey) return;
      const targetIdx = STEPS.findIndex((s) => s.key === targetKey);
      if (targetIdx < 0) return;

      if (targetIdx <= step) {
        goToStep(targetIdx);
        return;
      }

      for (let i = step; i < targetIdx; i++) {
        if (isHidden(STEPS[i].key)) continue;
        const error = validateStepByKey(STEPS[i].key);
        if (error) {
          showToast.error(error);
          goToStep(i);
          return;
        }
      }
      goToStep(targetIdx);
    },
    [visibleSteps, step, isHidden, validateStepByKey, goToStep],
  );

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
    : 'there';

  // =======================================================================
  // STEP RENDERERS
  // =======================================================================

  const renderWelcome = () => (
    <div className="flex flex-col items-center py-6 text-center">
      <div className="bg-primary-light mb-6 flex h-20 w-20 items-center justify-center rounded-2xl">
        <Building2 className="text-primary h-10 w-10" />
      </div>
      <h2 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
        Hey {displayName}! <span className="inline-block animate-bounce">&#128075;</span>
      </h2>
      <p className="mt-2 max-w-md text-[var(--text-secondary)]">
        Let&apos;s set up your company profile on Hire Adda. A complete profile helps you attract
        the best candidates.
      </p>

      <div className="mt-8 w-full max-w-md space-y-3 text-left">
        {[
          { icon: Layers, text: 'Account type and hiring setup' },
          { icon: Building2, text: 'Company basics and details' },
          { icon: Mail, text: 'Contact information' },
          { icon: MapPin, text: 'Address and office locations' },
          { icon: Globe, text: 'Social media profiles' },
          { icon: Shield, text: 'Legal and financial info (optional)' },
        ].map(({ icon: Icon, text }) => (
          <div
            key={text}
            className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3"
          >
            <div className="bg-primary-light flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
              <Icon className="text-primary h-4 w-4" />
            </div>
            <span className="text-sm text-[var(--text)]">{text}</span>
          </div>
        ))}
      </div>

      <Button className="mt-8" size="lg" onClick={nextStep} tooltip="Start company profile setup">
        Let&apos;s Go!
      </Button>
      <p className="mt-4 text-xs text-[var(--text-muted)]">
        This takes about 5-10 minutes. You can always save and continue later.
      </p>
    </div>
  );

  const renderAccountType = () => (
    <div className="space-y-8">
      {/* Account Type */}
      <div>
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          Are you hiring as a company or an individual?{' '}
          <span className="text-[var(--error)]">*</span>
        </label>
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          This helps us tailor the experience for you
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => {
            const isSelected = data.accountType === value;
            const Icon = value === 'COMPANY' ? Building2 : UserCircle;
            const desc =
              value === 'COMPANY'
                ? 'Registered business, startup, or organization'
                : 'Sole proprietor, freelancer, or individual hiring';
            return (
              <button
                key={value}
                type="button"
                // INDIVIDUAL accounts hire directly by definition (the
                // consultancy concept applies to companies), so picking
                // Individual auto-sets hiringType=DIRECT and the hiring-
                // type question below is hidden. Backend normalises the
                // same rule, so stale clients can't desync the pair.
                onClick={() =>
                  updateData(
                    value === 'INDIVIDUAL'
                      ? { accountType: value, hiringType: 'DIRECT' }
                      : { accountType: value },
                  )
                }
                className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                  isSelected
                    ? 'border-[var(--primary)] bg-[var(--primary)]/5 shadow-sm'
                    : 'border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--text-muted)]'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    isSelected
                      ? 'bg-primary-light text-primary'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <span
                    className={`block text-sm font-semibold ${isSelected ? 'text-primary' : 'text-[var(--text)]'}`}
                  >
                    {label}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{desc}</span>
                </div>
                <div
                  className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    isSelected
                      ? 'border-[var(--primary)] bg-[var(--primary)]'
                      : 'border-[var(--border)]'
                  }`}
                >
                  {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hiring Type — companies only. Individuals are auto-assigned
          DIRECT (see the accountType onClick above), so asking them
          "own company or client companies?" makes no sense. */}
      {data.accountType === 'COMPANY' && (
        <div>
          <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
            What kind of hiring do you do?
          </label>
          <p className="mb-4 text-xs text-[var(--text-muted)]">
            Are you hiring for your own company or for client companies?
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(HIRING_TYPE_LABELS).map(([value, label]) => {
              const isSelected = data.hiringType === value;
              const Icon = value === 'DIRECT' ? Building2 : Briefcase;
              const desc =
                value === 'DIRECT'
                  ? 'Hiring employees directly for your organization'
                  : 'Recruiting for other companies as a staffing agency';
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateData({ hiringType: value })}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                    isSelected
                      ? 'border-[var(--primary)] bg-[var(--primary)]/5 shadow-sm'
                      : 'border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--text-muted)]'
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      isSelected
                        ? 'bg-primary-light text-primary'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <span
                      className={`block text-sm font-semibold ${isSelected ? 'text-primary' : 'text-[var(--text)]'}`}
                    >
                      {label}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{desc}</span>
                  </div>
                  <div
                    className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      isSelected
                        ? 'border-[var(--primary)] bg-[var(--primary)]'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const renderBasics = () => (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={isIndividual ? 'Business Name' : 'Company Name'}
          placeholder={
            isIndividual ? 'e.g. John Doe Consulting' : 'e.g. Acme Technologies Pvt. Ltd.'
          }
          value={data.companyName}
          onChange={(e) => updateData({ companyName: e.target.value })}
          leftIcon={<Building2 className="h-4 w-4" />}
          required
        />
        {!isIndividual && (
          <Select
            label="Company Type"
            options={toSelectOptions(COMPANY_TYPE_LABELS)}
            value={data.companyType}
            onChange={(v) => updateData({ companyType: v })}
            placeholder="Select type"
          />
        )}
      </div>

      <ServerSuggestionInput
        label="Industry"
        placeholder="e.g. Information Technology"
        value={data.industry}
        onChange={(v) => updateData({ industry: v })}
        category="industry"
        onSelect={(v) => updateData({ industry: v, subIndustry: '' })}
        leftIcon={<Briefcase className="h-4 w-4" />}
        required
      />

      {getSubIndustriesForIndustry(data.industry).length > 0 ? (
        <Select
          label="Sub-Industry"
          options={getSubIndustriesForIndustry(data.industry).map((s) => ({ value: s, label: s }))}
          value={data.subIndustry}
          onChange={(v) => updateData({ subIndustry: v as string })}
          placeholder={data.industry ? 'Select sub-industry' : 'Select industry first'}
          disabled={!data.industry}
        />
      ) : (
        <ServerSuggestionInput
          label="Sub-Industry"
          placeholder={data.industry ? 'e.g. SaaS, AI/ML, Payments' : 'Select industry first'}
          value={data.subIndustry}
          onChange={(v) => updateData({ subIndustry: v })}
          category="sub_industry"
          onSelect={(v) => updateData({ subIndustry: v })}
          leftIcon={<BriefcaseBusiness className="h-4 w-4" />}
          disabled={!data.industry}
        />
      )}

      {/* Specialties */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Specialties</label>
        <p className="mb-3 text-xs text-[var(--text-muted)]">Areas your company specializes in</p>
        <div className="flex gap-2">
          <div className="flex-1">
            <ServerSuggestionInput
              placeholder="e.g. Cloud Computing, DevOps, AI/ML"
              value={specialtyInput}
              onChange={setSpecialtyInput}
              category="skill"
              onSelect={addSpecialty}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => addSpecialty(specialtyInput)}
            disabled={!specialtyInput.trim()}
            className="shrink-0"
            tooltip="Add specialty"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        {data.specialties.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.specialties.map((s) => (
              <Tag key={s} label={s} variant="primary" onRemove={() => removeSpecialty(s)} />
            ))}
          </div>
        )}
      </div>

      {!isIndividual && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Company Size"
            options={companySizeOptions}
            value={data.companySize}
            onChange={(v) => updateData({ companySize: v })}
            placeholder="Select size"
          />
          <Input
            label="Employee Count"
            type="number"
            placeholder="e.g. 250"
            value={data.employeeCount ?? ''}
            onChange={(e) =>
              updateData({ employeeCount: e.target.value ? Number(e.target.value) : undefined })
            }
            leftIcon={<Users className="h-4 w-4" />}
          />
          <Input
            label="Number of Offices"
            type="number"
            placeholder="e.g. 5"
            value={data.numberOfOffices ?? ''}
            onChange={(e) =>
              updateData({ numberOfOffices: e.target.value ? Number(e.target.value) : undefined })
            }
            leftIcon={<MapPin className="h-4 w-4" />}
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <DatePicker
          label={isIndividual ? 'Year Started' : 'Founded Year'}
          mode="year"
          placeholder="e.g. 2015"
          value={data.foundedYear ? String(data.foundedYear) : ''}
          onChange={(v) => updateData({ foundedYear: v ? Number(v) : undefined })}
          leftIcon={<Calendar className="h-4 w-4" />}
          maxDate={new Date()}
        />
        <Input
          label="Website"
          type="url"
          placeholder="https://www.example.com"
          value={data.website}
          onChange={(e) => updateData({ website: e.target.value })}
          leftIcon={<Globe className="h-4 w-4" />}
        />
      </div>

      {/* Parent Company and Stock Ticker available in profile settings */}
    </div>
  );

  const renderIdentity = () => (
    <div className="space-y-6">
      <Input
        label="Tagline"
        placeholder="A short tagline for your company"
        value={data.tagline}
        onChange={(e) => updateData({ tagline: e.target.value })}
        leftIcon={<Sparkles className="h-4 w-4" />}
        helperText="A brief one-liner that captures what your company does"
      />

      <Textarea
        label="Company Description"
        placeholder="Tell candidates about your company, what you do, your products/services..."
        value={data.description}
        onChange={(e) => updateData({ description: e.target.value })}
        rows={6}
        maxLength={3000}
        showCount
        required
      />

      {/* Company Logo */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <label className="mb-3 block text-sm font-semibold text-[var(--text)]">Company Logo</label>
        {!logoPreview ? (
          <FileUpload
            label="Company Logo (JPG, PNG, WebP)"
            accept={{
              'image/jpeg': ['.jpg', '.jpeg'],
              'image/png': ['.png'],
              'image/webp': ['.webp'],
            }}
            maxSize={FILE_LIMITS.LOGO_MAX_SIZE}
            onDrop={handleLogoDrop}
            files={[]}
            multiple={false}
          />
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--bg-tertiary)]">
              <img src={logoPreview} alt="Logo preview" className="h-full w-full object-contain" />
            </div>
            <div className="flex flex-col gap-2">
              <Tooltip content="Change logo">
                <button
                  onClick={() => {
                    setLogoFile(null);
                    setLogoPreview(null);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  <Camera className="h-4 w-4" />
                  Change Logo
                </button>
              </Tooltip>
              <Tooltip content="Remove logo">
                <button
                  onClick={() => {
                    setLogoFile(null);
                    setLogoPreview(null);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm font-medium text-[var(--error)] transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </Tooltip>
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          JPG, PNG, or WebP. Max 5MB. Will be cropped to 1:1 aspect ratio (400x400px).
        </p>
      </div>

      {/* Cover Image */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <label className="mb-1 block text-sm font-semibold text-[var(--text)]">
          Cover Image <span className="text-[var(--text-muted)]">(Optional)</span>
        </label>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Banner image for your profile (1920x640px recommended)
        </p>
        {!coverImagePreview ? (
          <FileUpload
            label="Cover Image (JPG, PNG, WebP)"
            accept={{
              'image/jpeg': ['.jpg', '.jpeg'],
              'image/png': ['.png'],
              'image/webp': ['.webp'],
            }}
            maxSize={FILE_LIMITS.COVER_MAX_SIZE}
            onDrop={handleCoverDrop}
            files={[]}
            multiple={false}
          />
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex h-32 w-48 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--bg-tertiary)]">
              <img
                src={coverImagePreview}
                alt="Cover preview"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Tooltip content="Change cover image">
                <button
                  onClick={() => {
                    setCoverImageFile(null);
                    setCoverImagePreview(null);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  <Camera className="h-4 w-4" />
                  Change Cover
                </button>
              </Tooltip>
              <Tooltip content="Remove cover image">
                <button
                  onClick={() => {
                    setCoverImageFile(null);
                    setCoverImagePreview(null);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm font-medium text-[var(--error)] transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </Tooltip>
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          JPG, PNG, or WebP. Max 5MB. Will be cropped to 3:1 aspect ratio (1920x640px).
        </p>
      </div>
    </div>
  );

  const renderCulture = () => (
    <div className="space-y-6">
      <Textarea
        label="Mission Statement"
        placeholder="What is your company's mission?"
        value={data.missionStatement}
        onChange={(e) => updateData({ missionStatement: e.target.value })}
        rows={3}
      />

      <Textarea
        label="Vision Statement"
        placeholder="Where does your company want to be in the future?"
        value={data.visionStatement}
        onChange={(e) => updateData({ visionStatement: e.target.value })}
        rows={3}
      />

      <Textarea
        label="Company Culture"
        placeholder="Describe your work culture, team dynamics..."
        value={data.companyCulture}
        onChange={(e) => updateData({ companyCulture: e.target.value })}
        rows={4}
      />

      <Textarea
        label="Diversity & Inclusion Statement"
        placeholder="Share your commitment to diversity and inclusion"
        value={data.diversityStatement}
        onChange={(e) => updateData({ diversityStatement: e.target.value })}
        rows={3}
      />

      {/* Core Values */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Core Values</label>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Add the core values that define your company culture
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <ServerSuggestionInput
              placeholder="e.g. Innovation, Integrity"
              value={coreValueInput}
              onChange={setCoreValueInput}
              category="core_value"
              onSelect={addCoreValue}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => addCoreValue(coreValueInput)}
            disabled={!coreValueInput.trim()}
            className="shrink-0"
            tooltip="Add core value"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        {data.coreValues.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.coreValues.map((val) => (
              <Tag key={val} label={val} variant="primary" onRemove={() => removeCoreValue(val)} />
            ))}
          </div>
        )}
      </div>

      {/* Employee Resource Groups */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          Employee Resource Groups (ERGs)
        </label>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Add any employee-led groups that support diversity, equity, and inclusion
        </p>
        <div className="flex gap-2">
          <div className="flex-1">
            <ServerSuggestionInput
              placeholder="e.g. Women in Tech, LGBTQ+ Alliance"
              value={ergInput}
              onChange={setErgInput}
              category="erg"
              onSelect={addErg}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => addErg(ergInput)}
            disabled={!ergInput.trim()}
            className="shrink-0"
            tooltip="Add resource group"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        {data.employeeResourceGroups.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.employeeResourceGroups.map((erg) => (
              <Tag key={erg} label={erg} variant="primary" onRemove={() => removeErg(erg)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderWhyWorkForUs = () => (
    <div className="space-y-6">
      <div className="mb-2 flex items-center gap-3">
        <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-xl">
          <Gem className="text-primary h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)]">Why Work For Us</h3>
          <p className="text-xs text-[var(--text-muted)]">
            This is optional but highly recommended
          </p>
        </div>
      </div>

      <Textarea
        label="Why Work For Us"
        placeholder="Describe what makes your company a great place to work. Cover growth opportunities, work-life balance, team culture, unique perks, and what sets you apart from other employers..."
        value={data.whyWorkForUs}
        onChange={(e) => updateData({ whyWorkForUs: e.target.value })}
        rows={8}
        maxLength={3000}
        showCount
        helperText="A compelling 'Why Work For Us' section helps attract top talent. Be specific and authentic."
      />
    </div>
  );

  const renderBenefits = () => (
    <div className="space-y-6">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          Benefits & Perks
        </label>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Add the benefits you offer to employees. Type to search or click the popular ones below.
        </p>

        <div className="flex gap-2">
          <div className="flex-1">
            <ServerSuggestionInput
              placeholder="e.g. Health Insurance"
              value={benefitInput}
              onChange={setBenefitInput}
              category="benefit"
              onSelect={addBenefit}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => addBenefit(benefitInput)}
            disabled={!benefitInput.trim()}
            className="shrink-0"
            tooltip="Add benefit"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      {/* Quick-add chips */}
      <div>
        <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Popular benefits</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_BENEFITS.map((benefit) => {
            const isAdded = data.benefits.includes(benefit);
            return (
              <Tooltip key={benefit} content={isAdded ? 'Already added' : `Add ${benefit}`}>
                <button
                  type="button"
                  onClick={() => !isAdded && addBenefit(benefit)}
                  disabled={isAdded}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isAdded
                      ? 'border-primary/30 bg-primary-light text-primary cursor-default'
                      : 'hover:border-primary hover:text-primary cursor-pointer border-[var(--border)] bg-white text-[var(--text-secondary)]'
                  }`}
                >
                  {isAdded ? '+ ' : '+ '}
                  {benefit}
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Selected benefits */}
      {data.benefits.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
            Added benefits ({data.benefits.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {data.benefits.map((benefit) => (
              <Tag
                key={benefit}
                label={benefit}
                variant="primary"
                onRemove={() => removeBenefit(benefit)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ---- Structured Perks by Category ---- */}
      <div className="border-t border-[var(--border)] pt-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-xl">
            <Layers className="text-primary h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">Structured Perks</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Organize perks by category for a clearer presentation
            </p>
          </div>
        </div>

        {data.structuredPerks.length === 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
              Quick-add categories
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                'Health & Wellness',
                'Financial',
                'Work-Life Balance',
                'Learning & Development',
              ].map((cat) => (
                <Tooltip key={cat} content={`Add ${cat} category`}>
                  <button
                    type="button"
                    onClick={() =>
                      updateData({
                        structuredPerks: [...data.structuredPerks, { category: cat, perks: [] }],
                      })
                    }
                    className="hover:border-primary hover:text-primary cursor-pointer rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors"
                  >
                    + {cat}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
        )}

        {data.structuredPerks.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-8 text-center">
            <Layers className="mx-auto mb-2 h-7 w-7 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No perk categories added yet</p>
          </div>
        )}

        {data.structuredPerks.map((cat, catIndex) => (
          <div
            key={catIndex}
            className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex-1">
                <Input
                  label="Category"
                  placeholder="e.g. Health & Wellness"
                  value={cat.category}
                  onChange={(e) => {
                    const updated = [...data.structuredPerks];
                    updated[catIndex] = { ...updated[catIndex], category: e.target.value };
                    updateData({ structuredPerks: updated });
                  }}
                />
              </div>
              <Tooltip content="Remove category">
                <button
                  type="button"
                  onClick={() =>
                    updateData({
                      structuredPerks: data.structuredPerks.filter((_, i) => i !== catIndex),
                    })
                  }
                  className="mt-5 cursor-pointer rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-white hover:text-[var(--error)]"
                  aria-label="Remove category"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Add a perk"
                value={perkInputs[catIndex] || ''}
                onChange={(e) => setPerkInputs((prev) => ({ ...prev, [catIndex]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const value = (perkInputs[catIndex] || '').trim();
                    if (value && !cat.perks.includes(value)) {
                      const updated = [...data.structuredPerks];
                      updated[catIndex] = { ...cat, perks: [...cat.perks, value] };
                      updateData({ structuredPerks: updated });
                      setPerkInputs((prev) => ({ ...prev, [catIndex]: '' }));
                    }
                  }
                }}
                className="flex-1"
              />
              <Button
                variant="secondary"
                className="shrink-0"
                onClick={() => {
                  const value = (perkInputs[catIndex] || '').trim();
                  if (value && !cat.perks.includes(value)) {
                    const updated = [...data.structuredPerks];
                    updated[catIndex] = { ...cat, perks: [...cat.perks, value] };
                    updateData({ structuredPerks: updated });
                    setPerkInputs((prev) => ({ ...prev, [catIndex]: '' }));
                  }
                }}
                disabled={!(perkInputs[catIndex] || '').trim()}
                tooltip="Add perk"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {cat.perks.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {cat.perks.map((perk) => (
                  <Tag
                    key={perk}
                    label={perk}
                    variant="primary"
                    onRemove={() => {
                      const updated = [...data.structuredPerks];
                      updated[catIndex] = {
                        ...updated[catIndex],
                        perks: updated[catIndex].perks.filter((p) => p !== perk),
                      };
                      updateData({ structuredPerks: updated });
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        <Button
          variant="outline"
          onClick={() =>
            updateData({
              structuredPerks: [...data.structuredPerks, { category: '', perks: [] }],
            })
          }
          tooltip="Add perk category"
        >
          <Plus className="mr-1 h-4 w-4" /> Add Category
        </Button>
      </div>
    </div>
  );

  const renderTech = () => (
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
              placeholder="e.g. React, Node.js, AWS"
              value={techInput}
              onChange={setTechInput}
              category="skill"
              onSelect={addTech}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => addTech(techInput)}
            disabled={!techInput.trim()}
            className="shrink-0"
            tooltip="Add technology"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {data.techStack.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.techStack.map((tech) => (
              <Tag key={tech} label={tech} variant="primary" onRemove={() => removeTech(tech)} />
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
              placeholder="e.g. Enterprise Software, API Services"
              value={productInput}
              onChange={setProductInput}
              category="product_service"
              onSelect={addProduct}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => addProduct(productInput)}
            disabled={!productInput.trim()}
            className="shrink-0"
            tooltip="Add product or service"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {data.productsServices.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {data.productsServices.map((product) => (
              <Tag
                key={product}
                label={product}
                variant="primary"
                onRemove={() => removeProduct(product)}
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
              value={data.workplacePolicies[policyKey] || ''}
              onChange={(e) => updatePolicy(policyKey, e.target.value)}
            />
          ))}
        </div>
      </div>
    </div>
  );

  const renderLeadership = () => (
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

        {data.leadershipTeam.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-10 text-center">
            <UserCircle className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No leaders added yet</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Add members of your leadership team to build trust with candidates
            </p>
          </div>
        )}

        {data.leadershipTeam.map((leader, index) => (
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
                  aria-label="Remove leader"
                  className="hover:text-error cursor-pointer rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-white"
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
                placeholder="e.g. CEO, CTO, VP Engineering"
                value={leader.designation}
                onChange={(e) => updateLeadership(index, 'designation', e.target.value)}
                required
              />
              <Input
                label="LinkedIn URL"
                type="url"
                placeholder="https://linkedin.com/in/janedoe"
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

        <Button variant="outline" onClick={addLeadership} tooltip="Add team leader">
          <Plus className="h-4 w-4" />
          Add Leader
        </Button>
      </div>

      {/* Employee Testimonials */}
      <div>
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

        {data.employeeTestimonials.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-10 text-center">
            <BookOpen className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No testimonials added yet</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Employee testimonials help candidates understand your work culture
            </p>
          </div>
        )}

        {data.employeeTestimonials.map((testimonial, index) => (
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
                  aria-label="Remove testimonial"
                  className="hover:text-error cursor-pointer rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-white"
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

        <Button variant="outline" onClick={addTestimonial} tooltip="Add testimonial">
          <Plus className="h-4 w-4" />
          Add Testimonial
        </Button>
      </div>
    </div>
  );

  const renderAwards = () => (
    <div className="space-y-6">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
          Awards & Recognition
        </label>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Highlight any awards, certifications, or recognition your company has received
        </p>
      </div>

      {data.awardsRecognitions.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-10 text-center">
          <Award className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">No awards added yet</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Click the button below to add awards and recognitions
          </p>
        </div>
      )}

      {data.awardsRecognitions.map((award, index) => (
        <div
          key={index}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--text)]">Award #{index + 1}</span>
            <Tooltip content="Remove award">
              <button
                type="button"
                onClick={() => removeAward(index)}
                aria-label="Remove award"
                className="hover:text-error cursor-pointer rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-white"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Title"
              placeholder="e.g. Best Place to Work"
              value={award.title}
              onChange={(e) => updateAward(index, 'title', e.target.value)}
              required
            />
            <DatePicker
              label="Year"
              mode="year"
              placeholder="e.g. 2024"
              value={award.year ? String(award.year) : ''}
              onChange={(v) => updateAward(index, 'year', v ? Number(v) : undefined)}
              maxDate={new Date()}
            />
            <Input
              label="Issuer"
              placeholder="e.g. Great Place to Work"
              value={award.issuer ?? ''}
              onChange={(e) => updateAward(index, 'issuer', e.target.value)}
            />
          </div>
        </div>
      ))}

      <Button variant="outline" onClick={addAward} tooltip="Add award">
        <Plus className="h-4 w-4" />
        Add Award
      </Button>
    </div>
  );

  const renderFunding = () => {
    if (isIndividual) {
      return (
        <div className="flex flex-col items-center py-8 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-secondary)]">
            <TrendingUp className="h-8 w-8 text-[var(--text-muted)]" />
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            Funding details are not applicable for individual accounts.
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">You can skip this step.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="mb-2 flex items-center gap-3">
          <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-xl">
            <TrendingUp className="text-primary h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">Funding Details</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Share your company&apos;s funding journey (optional)
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Funding Stage"
            options={FUNDING_STAGE_OPTIONS}
            value={data.fundingStage}
            onChange={(v) => updateData({ fundingStage: v })}
            placeholder="Select funding stage"
          />
          <CurrencyAmountInput
            label="Total Funding Raised"
            amount={data.totalFundingRaisedAmount}
            currency={data.fundingCurrency || 'INR'}
            onAmountChange={(amt) => updateData({ totalFundingRaisedAmount: amt })}
            onCurrencyChange={(code) => updateData({ fundingCurrency: code })}
            placeholder="e.g. 500000000"
            helperText={
              data.totalFundingRaisedAmount != null
                ? `Will display as ${formatCompactCurrency(data.totalFundingRaisedAmount, data.fundingCurrency || 'INR')}`
                : undefined
            }
          />
        </div>

        {/* Investors */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">Investors</label>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Add your key investors and backers
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <ServerSuggestionInput
                placeholder="e.g. Sequoia Capital India"
                value={investorInput}
                onChange={setInvestorInput}
                category="investor"
                onSelect={addInvestor}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => addInvestor(investorInput)}
              disabled={!investorInput.trim()}
              className="shrink-0"
              tooltip="Add investor"
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {data.investors.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.investors.map((investor) => (
                <Tag
                  key={investor}
                  label={investor}
                  variant="primary"
                  onRemove={() => removeInvestor(investor)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderLegal = () => {
    const isCompany = data.accountType === 'COMPANY';
    return (
      <div className="space-y-6">
        <p className="text-sm text-[var(--text-muted)]">
          These details are optional and kept private. They help verify your{' '}
          {isCompany ? 'company' : 'identity'} and are not shown publicly.
        </p>

        {isCompany && (
          <div className="grid gap-4 sm:grid-cols-2">
            <GstinInput
              value={data.gstNumber}
              onChange={(v) => updateData({ gstNumber: v })}
              // Live PAN-GSTIN cross-check: characters 3-12 of a GSTIN
              // ARE the entity's PAN by spec - a mismatch is always a
              // data-entry error (or someone else's GSTIN).
              error={
                data.gstNumber.length === 15 &&
                data.panNumber.length === 10 &&
                !gstinEmbedsPan(data.gstNumber, data.panNumber)
                  ? 'This GSTIN does not match your PAN (characters 3-12 of a GSTIN are the PAN)'
                  : undefined
              }
            />
            <CinInput value={data.cinNumber} onChange={(v) => updateData({ cinNumber: v })} />
            <LlpinInput value={data.llpinNumber} onChange={(v) => updateData({ llpinNumber: v })} />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <PanInput
            value={data.panNumber}
            onChange={(v) => updateData({ panNumber: v })}
            required
          />
          <TanInput value={data.tanNumber} onChange={(v) => updateData({ tanNumber: v })} />
        </div>
        {/* Annual Revenue Range available in profile settings */}
      </div>
    );
  };

  const renderContact = () => (
    <div className="space-y-6">
      <p className="text-sm text-[var(--text-muted)]">
        {isIndividual
          ? 'Provide your contact details so candidates can reach you.'
          : 'Provide contact details so candidates and our team can reach you.'}
      </p>

      {/* Consent checkbox — using the ACCOUNT email/mobile as the public
          contact requires an explicit opt-in. No silent prefill: the old
          `value={data.contactEmail || user?.email}` render fallback showed
          the account email without the user ever choosing it. Ticking
          copies whichever account values exist and locks those fields
          (an account without a mobile number leaves the phone editable). */}
      <Checkbox
        label="Use my account contact details"
        description={[
          user?.email ? `email ${user.email}` : null,
          user?.mobileNumber ? `mobile ${user.mobileNumber}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        checked={data.useAccountContact}
        onChange={(e) => handleUseAccountContact(e.target.checked)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={isIndividual ? 'Your Email' : 'Contact Email'}
          type="email"
          placeholder={isIndividual ? 'you@example.com' : 'hr@company.com'}
          value={data.contactEmail}
          onChange={(e) => updateData({ contactEmail: e.target.value })}
          leftIcon={<Mail className="h-4 w-4" />}
          disabled={data.useAccountContact && emailsMatch(data.contactEmail, user?.email)}
          helperText={
            data.useAccountContact && emailsMatch(data.contactEmail, user?.email)
              ? 'Locked to your account email — untick the checkbox to edit'
              : undefined
          }
          required
        />
        <PhoneInput
          label={isIndividual ? 'Your Phone' : 'Contact Phone'}
          placeholder="9876xxxxxx"
          value={data.contactPhone}
          onValueChange={(val) => updateData({ contactPhone: val })}
          disabled={data.useAccountContact && phonesMatch(data.contactPhone, user?.mobileNumber)}
          helperText={
            data.useAccountContact && phonesMatch(data.contactPhone, user?.mobileNumber)
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
            value={data.contactPersonName}
            onChange={(e) => updateData({ contactPersonName: e.target.value })}
            leftIcon={<UserCircle className="h-4 w-4" />}
            helperText="Primary point of contact for candidates"
          />
          <ServerSuggestionInput
            category="role_category"
            label="Contact Person Designation"
            placeholder="e.g. HR Manager, Talent Acquisition Lead"
            value={data.contactPersonDesignation}
            onChange={(val) => updateData({ contactPersonDesignation: val })}
          />
        </div>
      )}
    </div>
  );

  const renderAddress = () => (
    <div className="space-y-6">
      <ServerSuggestionInput
        label={isIndividual ? 'Your Location' : 'Headquarters'}
        placeholder="e.g. Bangalore, Karnataka"
        value={data.headquarters}
        onChange={(v) => updateData({ headquarters: v })}
        category="location"
        onSelect={(v) => updateData({ headquarters: v })}
        leftIcon={<MapPin className="h-4 w-4" />}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Address Line 1"
          placeholder="Street address, building name"
          value={data.addressLine1}
          onChange={(e) => updateData({ addressLine1: e.target.value })}
        />
        <Input
          label="Address Line 2"
          placeholder="Floor, suite, area (optional)"
          value={data.addressLine2}
          onChange={(e) => updateData({ addressLine2: e.target.value })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label="City"
          placeholder="e.g. Bangalore"
          value={data.city}
          onChange={(e) => updateData({ city: e.target.value })}
        />
        <Select
          label="State"
          options={stateOptions}
          value={data.state}
          onChange={(v) => updateData({ state: v })}
          placeholder="Select state"
          searchable
        />
        <Input
          label="Pincode"
          placeholder="e.g. 560001"
          value={data.pincode}
          onChange={(e) => updateData({ pincode: e.target.value })}
        />
      </div>

      <Input
        label="Country"
        value={data.country}
        onChange={(e) => updateData({ country: e.target.value })}
        leftIcon={<Globe className="h-4 w-4" />}
      />

      {/* Additional Office Locations — Company only */}
      {!isIndividual && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
            Additional Office Locations
          </label>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Add other cities or locations where you have offices
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <ServerSuggestionInput
                placeholder="e.g. Mumbai, Maharashtra"
                value={locationInput}
                onChange={setLocationInput}
                category="location"
                onSelect={addLocation}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => addLocation(locationInput)}
              disabled={!locationInput.trim()}
              className="shrink-0"
              tooltip="Add location"
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {data.locations.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.locations.map((loc) => (
                <Tag key={loc} label={loc} variant="primary" onRemove={() => removeLocation(loc)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderSocial = () => (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        Link your company social media profiles so candidates can learn more about you.
      </p>

      <Input
        label="LinkedIn"
        type="url"
        placeholder="https://linkedin.com/company/your-company"
        value={data.socialLinks.linkedin}
        onChange={(e) => updateSocial('linkedin', e.target.value)}
        leftIcon={<Linkedin className="h-4 w-4" />}
      />

      <Input
        label="Twitter / X"
        type="url"
        placeholder="https://twitter.com/your-company"
        value={data.socialLinks.twitter}
        onChange={(e) => updateSocial('twitter', e.target.value)}
        leftIcon={<Twitter className="h-4 w-4" />}
      />

      <Input
        label="Facebook"
        type="url"
        placeholder="https://facebook.com/your-company"
        value={data.socialLinks.facebook}
        onChange={(e) => updateSocial('facebook', e.target.value)}
        leftIcon={<Facebook className="h-4 w-4" />}
      />

      <Input
        label="Instagram"
        type="url"
        placeholder="https://instagram.com/your-company"
        value={data.socialLinks.instagram}
        onChange={(e) => updateSocial('instagram', e.target.value)}
        leftIcon={<Instagram className="h-4 w-4" />}
      />

      <Input
        label="YouTube"
        type="url"
        placeholder="https://youtube.com/@your-company"
        value={data.socialLinks.youtube}
        onChange={(e) => updateSocial('youtube', e.target.value)}
        leftIcon={<Youtube className="h-4 w-4" />}
      />

      {!isIndividual && (
        <>
          <Input
            label="Glassdoor"
            type="url"
            placeholder="https://glassdoor.co.in/Overview/your-company"
            value={data.socialLinks.glassdoor}
            onChange={(e) => updateSocial('glassdoor', e.target.value)}
            leftIcon={<Globe className="h-4 w-4" />}
          />

          <Input
            label="Careers Page URL"
            type="url"
            placeholder="https://yourcompany.com/careers"
            value={data.careersPageUrl}
            onChange={(e) => updateData({ careersPageUrl: e.target.value })}
            leftIcon={<BriefcaseBusiness className="h-4 w-4" />}
            helperText="Link to your company's careers page"
          />
        </>
      )}

      <Input
        label={isIndividual ? 'Portfolio / Blog URL' : 'Blog URL'}
        type="url"
        placeholder={isIndividual ? 'https://your-portfolio.com' : 'https://blog.yourcompany.com'}
        value={data.blogUrl}
        onChange={(e) => updateData({ blogUrl: e.target.value })}
        leftIcon={<BookOpen className="h-4 w-4" />}
        helperText={
          isIndividual
            ? 'Link to your portfolio or blog'
            : "Link to your company's blog or engineering blog"
        }
      />

      <Input
        label={isIndividual ? 'Intro Video URL' : 'Company Video URL'}
        type="url"
        placeholder="https://youtube.com/watch?v=..."
        value={data.companyVideoUrl}
        onChange={(e) => updateData({ companyVideoUrl: e.target.value })}
        leftIcon={<Camera className="h-4 w-4" />}
        helperText={
          isIndividual
            ? 'Intro or portfolio showcase video'
            : 'Intro video, office tour, or culture video (YouTube, Vimeo)'
        }
      />
    </div>
  );

  const renderCsrValues = () => (
    <div className="space-y-6">
      <div className="mb-2 flex items-center gap-3">
        <div className="bg-primary-light flex h-10 w-10 items-center justify-center rounded-xl">
          <HandHeart className="text-primary h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)]">CSR & Social Responsibility</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Share your company&apos;s social impact initiatives
          </p>
        </div>
      </div>

      <Textarea
        label="CSR Initiatives"
        placeholder="Describe your company's Corporate Social Responsibility initiatives, community programs, sustainability efforts, charitable contributions, volunteer programs, environmental commitments..."
        value={data.csrInitiatives}
        onChange={(e) => updateData({ csrInitiatives: e.target.value })}
        rows={8}
        maxLength={3000}
        showCount
        helperText="Candidates increasingly value employers with strong social responsibility programs"
      />
    </div>
  );

  const renderReview = () => {
    // Edit-jump targets are derived from step KEYS (not hardcoded
    // indexes) so reordering STEPS can't silently point a review
    // section at the wrong step — exactly what happened when the
    // legal step moved earlier in the flow.
    const stepIndexOf = (key: string) => STEPS.findIndex((s) => s.key === key);
    const sections: Array<{
      title: string;
      stepIndex: number;
      icon: React.ElementType;
      items: Array<{ label: string; value: string | number | undefined | null }>;
    }> = [
      {
        title: 'Account Type',
        stepIndex: stepIndexOf('accountType'),
        icon: Layers,
        items: [
          {
            label: 'Account Type',
            value: data.accountType ? ACCOUNT_TYPE_LABELS[data.accountType] : undefined,
          },
          {
            label: 'Hiring Type',
            // Companies only — individuals never see the hiring-type
            // question (auto-assigned DIRECT), so don't echo it back
            // on review as if they had answered it.
            value:
              data.accountType === 'COMPANY' && data.hiringType
                ? HIRING_TYPE_LABELS[data.hiringType]
                : undefined,
          },
        ],
      },
      {
        title: `${companyLabel} Basics`,
        stepIndex: stepIndexOf('basics'),
        icon: Building2,
        items: [
          { label: isIndividual ? 'Business Name' : 'Company Name', value: data.companyName },
          ...(!isIndividual
            ? [
                {
                  label: 'Company Type',
                  value: data.companyType ? COMPANY_TYPE_LABELS[data.companyType] : undefined,
                },
              ]
            : []),
          { label: 'Industry', value: data.industry },
          { label: 'Sub-Industry', value: data.subIndustry },
          {
            label: 'Specialties',
            value: data.specialties.length > 0 ? data.specialties.join(', ') : undefined,
          },
          ...(!isIndividual
            ? [
                { label: 'Company Size', value: data.companySize },
                { label: 'Employee Count', value: data.employeeCount },
                { label: 'Number of Offices', value: data.numberOfOffices },
              ]
            : []),
          { label: isIndividual ? 'Year Started' : 'Founded Year', value: data.foundedYear },
          { label: 'Website', value: data.website },
        ],
      },
      {
        title: 'Contact Info',
        stepIndex: stepIndexOf('contact'),
        icon: Mail,
        items: [
          { label: 'Email', value: data.contactEmail },
          { label: 'Phone', value: data.contactPhone },
          ...(!isIndividual
            ? [
                { label: 'Contact Person', value: data.contactPersonName },
                { label: 'Designation', value: data.contactPersonDesignation },
              ]
            : []),
        ],
      },
      {
        title: 'Address & Locations',
        stepIndex: stepIndexOf('address'),
        icon: MapPin,
        items: [
          { label: isIndividual ? 'Location' : 'Headquarters', value: data.headquarters },
          {
            label: 'Full Address',
            value:
              [data.addressLine1, data.addressLine2, data.city, data.state, data.pincode]
                .filter(Boolean)
                .join(', ') || undefined,
          },
          { label: 'Country', value: data.country },
          {
            label: 'Additional Locations',
            value: data.locations.length > 0 ? data.locations.join(', ') : undefined,
          },
        ],
      },
      {
        title: 'Social Profiles',
        stepIndex: stepIndexOf('social'),
        icon: Globe,
        items: [
          { label: 'LinkedIn', value: data.socialLinks.linkedin },
          { label: 'Twitter', value: data.socialLinks.twitter },
          { label: 'Facebook', value: data.socialLinks.facebook },
          { label: 'Instagram', value: data.socialLinks.instagram },
          { label: 'YouTube', value: data.socialLinks.youtube },
          ...(!isIndividual
            ? [
                { label: 'Glassdoor', value: data.socialLinks.glassdoor },
                { label: 'Careers Page', value: data.careersPageUrl },
              ]
            : []),
          { label: isIndividual ? 'Portfolio / Blog' : 'Blog', value: data.blogUrl },
          { label: isIndividual ? 'Intro Video' : 'Company Video', value: data.companyVideoUrl },
        ],
      },
      {
        title: 'Legal & Financial',
        stepIndex: stepIndexOf('legal'),
        icon: Shield,
        items: [
          ...(data.accountType === 'COMPANY'
            ? [
                { label: 'GST Number', value: data.gstNumber },
                { label: 'CIN Number', value: data.cinNumber },
                { label: 'LLPIN', value: data.llpinNumber },
              ]
            : []),
          { label: 'PAN Number', value: data.panNumber },
          { label: 'TAN Number', value: data.tanNumber },
        ],
      },
    ];

    return (
      <div className="space-y-6">
        <p className="text-sm text-[var(--text-muted)]">
          Review your company profile below. Click any section title to edit it.
        </p>

        {sections.map((section) => {
          const filledItems = section.items.filter(
            (item) => item.value !== undefined && item.value !== null && item.value !== '',
          );
          if (filledItems.length === 0) return null;

          const Icon = section.icon;

          return (
            <div
              key={section.title}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
            >
              <Tooltip content="Edit this section">
                <button
                  type="button"
                  onClick={() => goToStepFromReview(section.stepIndex)}
                  className="text-primary mb-3 flex cursor-pointer items-center gap-2 text-sm font-semibold hover:underline"
                >
                  <Icon className="h-4 w-4" />
                  {section.title}
                  <Pencil className="h-3 w-3" />
                </button>
              </Tooltip>
              <div className="grid gap-2 sm:grid-cols-2">
                {filledItems.map((item) => (
                  <div key={item.label}>
                    <span className="text-xs text-[var(--text-muted)]">{item.label}</span>
                    <p className="truncate text-sm text-[var(--text)]">{String(item.value)}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Specialties tags in review */}
        {data.specialties.length > 0 && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
            <button
              type="button"
              onClick={() => goToStepFromReview(2)}
              className="text-primary mb-3 flex items-center gap-2 text-sm font-semibold hover:underline"
            >
              <Briefcase className="h-4 w-4" />
              Specialties
              <Pencil className="h-3 w-3" />
            </button>
            <div className="flex flex-wrap gap-2">
              {data.specialties.map((s) => (
                <Tag key={s} label={s} variant="primary" size="sm" />
              ))}
            </div>
          </div>
        )}

        {/* Locations tags in review */}
        {data.locations.length > 0 && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
            <button
              type="button"
              onClick={() => goToStepFromReview(4)}
              className="text-primary mb-3 flex items-center gap-2 text-sm font-semibold hover:underline"
            >
              <MapPin className="h-4 w-4" />
              Office Locations
              <Pencil className="h-3 w-3" />
            </button>
            <div className="flex flex-wrap gap-2">
              {data.locations.map((l) => (
                <Tag key={l} label={l} variant="primary" size="sm" />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // =======================================================================
  // STEP CONTENT SWITCH
  // =======================================================================

  const renderStepContent = () => {
    const key = STEPS[step]?.key;
    switch (key) {
      case 'welcome':
        return renderWelcome();
      case 'accountType':
        return renderAccountType();
      case 'basics':
        return renderBasics();
      case 'identity':
        return renderIdentity();
      case 'culture':
        return renderCulture();
      case 'whyWorkForUs':
        return renderWhyWorkForUs();
      case 'benefits':
        return renderBenefits();
      case 'tech':
        return renderTech();
      case 'leadership':
        return renderLeadership();
      case 'awards':
        return renderAwards();
      case 'funding':
        return renderFunding();
      case 'legal':
        return renderLegal();
      case 'contact':
        return renderContact();
      case 'address':
        return renderAddress();
      case 'social':
        return renderSocial();
      case 'csrValues':
        return renderCsrValues();
      case 'review':
        return renderReview();
      default:
        return null;
    }
  };

  // =======================================================================
  // RENDER
  // =======================================================================

  return (
    <>
      {/* Logo Cropper Modal */}
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

      {/* Cover Image Cropper Modal */}
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

      <OnboardingShell
        steps={visibleSteps}
        currentStep={currentVisibleStep}
        onNext={handleNext}
        onPrev={handlePrevSmart}
        onSkip={handleSkip}
        onGoToStep={handleGoToVisibleStep}
        isSubmitting={saveMutation.isPending || logoMutation.isPending}
        isLastStep={isLastStep}
        isFirstStep={isFirstStep}
        nextDisabled={false}
        nextLabel={isLastStep ? 'Complete Setup' : undefined}
        dashboardPath={ROUTES.EMPLOYER.DASHBOARD}
        title={getStepTitle()}
        subtitle={getStepSubtitle()}
        editFromReview={editFromReview}
        onReturnToReview={returnToReview}
        highestVisitedStep={highestVisitedStep}
        canSkip={canSkip}
        // Support strip (helpline bar + Help & FAQs + Contact us) lives in
        // the shell's page-footer slot — below the step card and nav — so
        // it no longer repeats inside every step's form. The compact
        // EmployerHelplineBanner that used to sit ABOVE the step content
        // was removed: combined with AuthSupportFooter's own helpline row
        // it showed the employer helpline twice on the welcome step.
        footer={<AuthSupportFooter pageContext="onboarding-employer" audience="employer" />}
      >
        {renderStepContent()}
      </OnboardingShell>
    </>
  );
}
