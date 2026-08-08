'use client';

import ResumeParseReview from '@/components/common/ResumeParseReview';
import BrandIcon from '@/components/common/BrandIcon';
import OnboardingShell, { type OnboardingStep } from '@/components/onboarding/OnboardingShell';
import AuthSupportFooter from '@/components/support/AuthSupportFooter';
import Button from '@/components/ui/Button';
import DatePicker from '@/components/ui/DatePicker';
import FileUpload from '@/components/ui/FileUpload';
import ImageCropper from '@/components/ui/ImageCropper';
import Input from '@/components/ui/Input';
import PhoneInput from '@/components/ui/PhoneInput';
import Select, { type SelectOption } from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import CurrencySelect from '@/components/ui/CurrencySelect';
import ServerAutoSuggest from '@/components/ui/ServerAutoSuggest';
import ServerSuggestionInput from '@/components/ui/ServerSuggestionInput';
import Tag from '@/components/ui/Tag';
import Textarea from '@/components/ui/Textarea';
import { showToast } from '@/components/ui/Toast';
import Tooltip from '@/components/ui/Tooltip';
import { FILE_LIMITS, QUERY_KEYS } from '@/constants/config';
import {
  CAREER_BREAK_TYPE_LABELS,
  COURSE_TYPE_LABELS,
  EDUCATION_LEVEL_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  GENDER_LABELS,
  GRADE_TYPE_LABELS,
  JOB_TYPE_LABELS,
  MARITAL_STATUS_LABELS,
  NOTICE_PERIOD_LABELS,
  OPEN_TO_WORK_LABELS,
  PATENT_STATUS_LABELS,
  PRONOUN_OPTIONS,
  RESERVATION_CATEGORY_LABELS,
  SHIFT_TYPE_LABELS,
  SPECIFIC_DEGREE_LABELS,
  WORK_MODE_LABELS,
  WORK_STATUS_LABELS,
  EDUCATION_BOARD_LABELS,
  TWELFTH_STREAM_LABELS,
  getDegreesForLevel,
  getLevelsAtOrBelow,
} from '@/constants/enums';
import { ROUTES } from '@/constants/routes';
import { INDIAN_STATES, VISA_STATUS_OPTIONS } from '@/constants/suggestions';
import { useAuth } from '@/hooks/use-auth';
import { markOnboardingComplete, useOnboarding } from '@/hooks/use-onboarding';
import { formatCurrency, formatFileSize } from '@/lib/utils';
import { authService } from '@/services/auth.service';
import { candidateService } from '@/services/candidate.service';
import { useAuthStore } from '@/store/auth.store';
import type { ApiError } from '@/types/api';
import type {
  AwardEntry,
  CareerBreakType,
  CertificationEntry,
  CourseCompletionEntry,
  DisabilityType,
  EducationEntry,
  ExperienceEntry,
  Gender,
  ITSkillEntry,
  LanguageEntry,
  MaritalStatus,
  MembershipEntry,
  NoticePeriod,
  OpenToWorkStatus,
  PatentEntry,
  PublicationEntry,
  ReferenceEntry,
  ReservationCategory,
  SkillWithProficiency,
  TestScoreEntry,
  UpdateCandidateRequest,
  VehicleType,
  VolunteerEntry,
  WorkStatus,
} from '@/types/candidate';
import type {
  DrivingLicenseType,
  EducationLevel,
  ExperienceLevel,
  JobType,
  ShiftType,
  SpecificDegree,
  WorkMode,
} from '@/types/job';
import type { ApplyableResumeFields, ParsedResumeData } from '@/types/resume-parse';
import { getFileTypeBadge } from '@/utils/format';
import { resetEducationEntryForLevel } from '@/utils/education';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Camera,
  Code,
  Eye,
  FileCheck,
  FileText,
  Globe,
  GraduationCap,
  Heart,
  Mail,
  MapPin,
  Plus,
  Settings,
  Sparkles,
  WandSparkles,
  Pencil,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSelectOptions(labels: Record<string, string>): SelectOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CandidateOnboardingData {
  [key: string]: unknown;
  // Step: Candidate Type (Fresher / Experienced)
  candidateType: string;
  // Step: Profile Basics
  headline: string;
  pronouns: string;
  phone: string;
  currentLocation: string;
  // Step: Personal Details
  dob: string;
  gender: string;
  maritalStatus: string;
  nationality: string;
  hometown: string;
  category: string;
  alternatePhone: string;
  alternateEmail: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  // Step: Professional Summary
  bio: string;
  experienceYears: number;
  totalExperienceMonths: number;
  experienceLevel: string;
  workStatus: string;
  hasCareerBreak: boolean;
  careerBreakType: string;
  careerBreakReason: string;
  openToWork: string;
  // Step: Current Employment
  currentCompany: string;
  currentRole: string;
  currentIndustry: string;
  currentDepartment: string;
  functionalArea: string;
  currSalary: number | undefined;
  noticePeriod: string;
  servingNoticePeriod: boolean;
  // Step: Work Experience
  experience: ExperienceEntry[];
  // Step: Education
  highestEducationLevel: string;
  highestDegree: string;
  education: EducationEntry[];
  // Step: Skills
  skills: string[];
  skillsWithProficiency: SkillWithProficiency[];
  itSkills: ITSkillEntry[];
  // Step: Certifications, Courses & Tests
  certifications: CertificationEntry[];
  awards: AwardEntry[];
  courses: CourseCompletionEntry[];
  testScores: TestScoreEntry[];
  // Step: Languages
  languages: string[];
  languageProficiency: LanguageEntry[];
  // Step: Publications & Memberships
  publications: PublicationEntry[];
  patents: PatentEntry[];
  professionalMemberships: MembershipEntry[];
  // Step: Volunteering & References
  volunteerExperience: VolunteerEntry[];
  references: ReferenceEntry[];
  // Step: Job Preferences
  preferredJobType: string[];
  preferredWorkMode: string[];
  preferredShift: string;
  expectedSalaryMin: number | undefined;
  expectedSalaryMax: number | undefined;
  salaryCurrency: string;
  preferredLocations: string[];
  preferredIndustries: string[];
  preferredRoleCategories: string[];
  willingToRelocate: boolean;
  travelWillingnessPercent: number;
  dateOfAvailability: string;
  visaStatus: string;
  // Step: Documents & Misc
  passportNumber: string;
  passportExpiryDate: string;
  workPermitStatus: string;
  hasDrivingLicense: boolean;
  drivingLicenseType: string;
  ownVehicle: boolean;
  vehicleTypes: string[];
  isVeteran: boolean;
  isPhysicallyChallenged: boolean;
  disabilityType: string;
  disabilityPercentage: number | undefined;
  videoResumeUrl: string;
  blockedCompanies: string[];
  // Step: Interests
  hobbies: string[];
  interests: string[];
  // Step: Social Links
  linkedinProfile: string;
  githubProfile: string;
  portfolioUrl: string;
  stackOverflowProfile: string;
  twitterProfile: string;
  personalBlogUrl: string;
  dribbbleProfile: string;
  behanceProfile: string;
  mediumProfile: string;
  youtubeChannel: string;
}

// ---------------------------------------------------------------------------
// Steps & Initial Data
// ---------------------------------------------------------------------------

const STEPS: OnboardingStep[] = [
  { key: 'welcome', label: 'Welcome' },
  { key: 'candidateType', label: 'I Am' },
  { key: 'avatar', label: 'Profile Photo', optional: true },
  { key: 'resume', label: 'Resume', optional: true },
  { key: 'personal', label: 'Personal Details', optional: true },
  { key: 'professional', label: 'Professional Summary' },
  { key: 'employment', label: 'Current Employment', optional: true },
  { key: 'experience', label: 'Work Experience', optional: true },
  { key: 'education', label: 'Education' },
  { key: 'skills', label: 'Skills' },
  { key: 'preferences', label: 'Job Preferences' },
  // 'documents' step (driving license / vehicle / veteran / disability) intentionally
  // removed from the onboarding wizard to keep it short — these fields remain editable
  // via the profile page. `blockedCompanies` which used to live in that step has moved
  // into the preferences step below.
  { key: 'social', label: 'Social Links', optional: true },
  { key: 'review', label: 'Review' },
];

const INITIAL_DATA: CandidateOnboardingData = {
  candidateType: '',
  headline: '',
  pronouns: '',
  phone: '',
  currentLocation: '',
  dob: '',
  gender: '',
  maritalStatus: '',
  nationality: '',
  hometown: '',
  category: '',
  alternatePhone: '',
  alternateEmail: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  bio: '',
  experienceYears: 0,
  totalExperienceMonths: 0,
  experienceLevel: '',
  workStatus: '',
  hasCareerBreak: false,
  careerBreakType: '',
  careerBreakReason: '',
  openToWork: '',
  currentCompany: '',
  currentRole: '',
  currentIndustry: '',
  currentDepartment: '',
  functionalArea: '',
  currSalary: undefined,
  noticePeriod: '',
  servingNoticePeriod: false,
  experience: [],
  highestEducationLevel: '',
  highestDegree: '',
  education: [],
  skills: [],
  skillsWithProficiency: [],
  itSkills: [],
  certifications: [],
  awards: [],
  courses: [],
  testScores: [],
  languages: [],
  languageProficiency: [],
  publications: [],
  patents: [],
  professionalMemberships: [],
  volunteerExperience: [],
  references: [],
  preferredJobType: [],
  preferredWorkMode: [],
  preferredShift: '',
  expectedSalaryMin: undefined,
  expectedSalaryMax: undefined,
  salaryCurrency: 'INR',
  preferredLocations: [],
  preferredIndustries: [],
  preferredRoleCategories: [],
  willingToRelocate: false,
  travelWillingnessPercent: 0,
  dateOfAvailability: '',
  visaStatus: '',
  passportNumber: '',
  passportExpiryDate: '',
  workPermitStatus: '',
  hasDrivingLicense: false,
  drivingLicenseType: '',
  ownVehicle: false,
  vehicleTypes: [],
  isVeteran: false,
  isPhysicallyChallenged: false,
  disabilityType: '',
  disabilityPercentage: undefined,
  videoResumeUrl: '',
  blockedCompanies: [],
  hobbies: [],
  interests: [],
  linkedinProfile: '',
  githubProfile: '',
  portfolioUrl: '',
  stackOverflowProfile: '',
  twitterProfile: '',
  personalBlogUrl: '',
  dribbbleProfile: '',
  behanceProfile: '',
  mediumProfile: '',
  youtubeChannel: '',
};

// ---------------------------------------------------------------------------
// Static select option sets
// ---------------------------------------------------------------------------

const GENDER_OPTIONS = toSelectOptions(GENDER_LABELS);
const MARITAL_OPTIONS = toSelectOptions(MARITAL_STATUS_LABELS);
const WORK_STATUS_OPTIONS = toSelectOptions(WORK_STATUS_LABELS);
const NOTICE_PERIOD_OPTIONS = toSelectOptions(NOTICE_PERIOD_LABELS);
const JOB_TYPE_OPTIONS = toSelectOptions(JOB_TYPE_LABELS);
const WORK_MODE_OPTIONS = toSelectOptions(WORK_MODE_LABELS);
const SHIFT_TYPE_OPTIONS = toSelectOptions(SHIFT_TYPE_LABELS);

const STATE_OPTIONS: SelectOption[] = INDIAN_STATES.map((s) => ({ value: s, label: s }));
const VISA_OPTIONS: SelectOption[] = VISA_STATUS_OPTIONS.map((v) => ({ value: v, label: v }));

const LANGUAGE_PROFICIENCY_OPTIONS: SelectOption[] = [
  { value: 'BASIC', label: 'Basic' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'FLUENT', label: 'Fluent' },
  { value: 'NATIVE', label: 'Native' },
];

const SKILL_PROFICIENCY_OPTIONS: SelectOption[] = [
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'ADVANCED', label: 'Advanced' },
  { value: 'EXPERT', label: 'Expert' },
];

const EXPERIENCE_LEVEL_OPTIONS = toSelectOptions(EXPERIENCE_LEVEL_LABELS);
const EDUCATION_LEVEL_OPTIONS = toSelectOptions(EDUCATION_LEVEL_LABELS);
const SPECIFIC_DEGREE_OPTIONS = toSelectOptions(SPECIFIC_DEGREE_LABELS);
// DRIVING_LICENSE_OPTIONS / VEHICLE_TYPE_OPTIONS / DISABILITY_TYPE_OPTIONS were only
// used by the 'documents' step which has been removed from onboarding. The underlying
// fields are still collected via the profile page.
const CAREER_BREAK_OPTIONS = toSelectOptions(CAREER_BREAK_TYPE_LABELS);
const CATEGORY_OPTIONS = toSelectOptions(RESERVATION_CATEGORY_LABELS);
const COURSE_TYPE_OPTIONS = toSelectOptions(COURSE_TYPE_LABELS);
const BOARD_OPTIONS = toSelectOptions(EDUCATION_BOARD_LABELS);
const STREAM_OPTIONS = toSelectOptions(TWELFTH_STREAM_LABELS);
const OPEN_TO_WORK_OPTIONS = toSelectOptions(OPEN_TO_WORK_LABELS);
const PATENT_STATUS_OPTIONS = toSelectOptions(PATENT_STATUS_LABELS);
const GRADE_TYPE_OPTIONS = toSelectOptions(GRADE_TYPE_LABELS);
const PRONOUN_OPTIONS_SELECT = toSelectOptions(PRONOUN_OPTIONS);

// ---------------------------------------------------------------------------
// Empty entry factories
// ---------------------------------------------------------------------------

function emptyExperience(): ExperienceEntry {
  return {
    company: '',
    role: '',
    location: '',
    startDate: '',
    endDate: '',
    isCurrent: false,
    description: '',
  };
}

function emptyEducation(): EducationEntry {
  return {
    educationLevel: '',
    institution: '',
    degree: '',
    field: '',
    startDate: '',
    endDate: '',
    grade: '',
  };
}

function emptyCertification(): CertificationEntry {
  return { name: '', issuer: '', issueDate: '', expiryDate: '', credentialId: '', url: '' };
}

function emptyAward(): AwardEntry {
  return { title: '', issuer: '', date: '', description: '' };
}

function emptyLanguage(): LanguageEntry {
  return { language: '', proficiency: 'BASIC' };
}

function emptySkillWithProficiency(): SkillWithProficiency {
  return { skill: '', proficiency: 'BEGINNER', yearsOfExperience: 0 };
}

function emptyITSkill(): ITSkillEntry {
  return { technology: '', version: '', experienceYears: 0, proficiency: 'BEGINNER' };
}

function emptyPublication(): PublicationEntry {
  return { title: '', publisher: '', publicationDate: '', url: '', description: '', authors: '' };
}

function emptyPatent(): PatentEntry {
  return {
    title: '',
    patentOffice: '',
    patentNumber: '',
    status: 'FILED',
    filingDate: '',
    issueDate: '',
    url: '',
    description: '',
    inventors: '',
  };
}

function emptyVolunteer(): VolunteerEntry {
  return {
    organization: '',
    role: '',
    cause: '',
    startDate: '',
    endDate: '',
    isCurrent: false,
    description: '',
  };
}

function emptyMembership(): MembershipEntry {
  return {
    organization: '',
    role: '',
    startDate: '',
    endDate: '',
    membershipId: '',
    description: '',
  };
}

function emptyCourse(): CourseCompletionEntry {
  return { name: '', provider: '', completionDate: '', url: '', associatedWith: '' };
}

function emptyTestScore(): TestScoreEntry {
  return { testName: '', score: '', dateOfExam: '', associatedWith: '', description: '' };
}

function emptyReference(): ReferenceEntry {
  return { name: '', designation: '', organization: '', email: '', phone: '', relationship: '' };
}

// ===========================================================================
// Component
// ===========================================================================

/**
 * Page wrapper — holds rendering until the auth store hydrates so the
 * wizard below receives a STABLE, user-scoped localStorage key.
 *
 * Why the gate matters: the onboarding autosave + `_skipped` completion
 * flag used to live under the browser-global key `ha_candidate_onboarding`.
 * Any account that completed/skipped the wizard poisoned that key for
 * every LATER account on the same browser — new users were silently
 * bounced past the wizard straight to the WelcomeScreen (whose own
 * `ha_welcomed_<role>_<userId>` key IS user-scoped, so it fired). Keys
 * are now `ha_candidate_onboarding_<userId>`, and mounting the wizard
 * only after `user.id` exists prevents an "anon"-keyed first render
 * from autosaving (and later leaking) draft data across accounts.
 */
export default function CandidateOnboardingPage() {
  const { user } = useAuth();
  if (!user?.id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-secondary)]">
        <Spinner size="lg" />
      </div>
    );
  }
  return <CandidateOnboardingWizard userId={user.id} />;
}

function CandidateOnboardingWizard({ userId }: { userId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Local UI state for tag inputs
  const [skillInput, setSkillInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [industryInput, setIndustryInput] = useState('');
  const [roleCatInput, setRoleCatInput] = useState('');
  const [hobbyInput, setHobbyInput] = useState('');
  const [interestInput, setInterestInput] = useState('');
  const [blockedCompanyInput, setBlockedCompanyInput] = useState('');
  const [resumeFile, setResumeFile] = useState<File[]>([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

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
    clearSavedData,
  } = useOnboarding<CandidateOnboardingData>({
    // User-scoped — see CandidateOnboardingPage docblock. The derived
    // `${storageKey}_skipped` completion flag inherits the scoping.
    storageKey: `ha_candidate_onboarding_${userId}`,
    totalSteps: STEPS.length,
    initialData: INITIAL_DATA,
  });

  // -----------------------------------------------------------------------
  // Computed flags + visible steps
  // -----------------------------------------------------------------------
  const isFresher = data.candidateType === 'FRESHER';

  // Validate a single step by key — extracted so we can validate intermediate
  // steps when the user jumps forward via the tab navigator.
  const validateStepByKey = useCallback(
    (key: string): string | null => {
      switch (key) {
        case 'candidateType':
          if (!data.candidateType) return 'Please select whether you are experienced or a fresher';
          return null;
        case 'basics':
          if (!data.headline.trim()) return 'Please enter a headline';
          if (!data.currentLocation.trim()) return 'Please enter your current location';
          return null;
        case 'professional':
          if (!data.bio.trim()) return 'Please enter a brief summary about yourself';
          if (!data.workStatus) return 'Please select your work status';
          return null;
        case 'education':
          if (!data.highestEducationLevel) return 'Please select your highest education level';
          if (getDegreesForLevel(data.highestEducationLevel).length > 0 && !data.highestDegree)
            return 'Please select your highest degree';
          if (data.education.length === 0) return 'Please add at least one education entry';
          for (const edu of data.education) {
            if (!edu.educationLevel) return 'Please select education level for each entry';
            if (!edu.institution.trim() || !edu.degree.trim()) {
              return 'Please fill in institution and degree for each entry';
            }
            if (
              edu.educationLevel !== 'TENTH' &&
              edu.educationLevel !== 'TWELFTH' &&
              !edu.field.trim()
            ) {
              return 'Please fill in field of study for diploma and above';
            }
          }
          return null;
        case 'skills':
          if (data.skills.length === 0) return 'Please add at least one skill';
          return null;
        case 'preferences':
          if (data.preferredJobType.length === 0)
            return 'Please select at least one preferred job type';
          return null;
        default:
          return null;
      }
    },
    [data],
  );

  // Hide steps entirely when the candidate's selections make them irrelevant.
  // `step` state remains an index into the full STEPS array (stable across
  // candidateType/workStatus changes); we only filter for display + auto-skip
  // in nav. If the candidate later switches Work Status back to EMPLOYED, the
  // Current Employment step reappears and any previously-entered values are
  // still in `data` (we never clear them on hide).
  //
  // Rules:
  //   - Fresher → hide resume + employment + experience (no work history yet)
  //   - Non-EMPLOYED work status (Unemployed/Student/Freelancer) → hide
  //     Current Employment specifically. Past experience + resume still apply
  //     (a student or freelancer may have prior employment / a resume).
  const HIDDEN_FOR_FRESHER = ['resume', 'employment', 'experience'];
  // workStatus is required in the prior `professional` step so by the time
  // step navigation reaches `employment` it's always set. Default empty value
  // is treated as "show" so we don't pre-hide on first page load before the
  // user has answered.
  const hasCurrentEmployment = !data.workStatus || data.workStatus === 'EMPLOYED';
  const isHidden = (key: string) =>
    (isFresher && HIDDEN_FOR_FRESHER.includes(key)) ||
    (!hasCurrentEmployment && key === 'employment');
  const visibleSteps = STEPS.filter((s) => !isHidden(s.key));

  // Skip is blocked until the first few critical steps are filled — candidate type
  // + professional summary. Later required steps (education, skills, preferences)
  // can be skipped and completed later from the dashboard.
  const MUST_COMPLETE_BEFORE_SKIP = ['candidateType', 'professional'];
  const canSkip = MUST_COMPLETE_BEFORE_SKIP.every((key) => !validateStepByKey(key));

  // Map full step index → visible step index for OnboardingShell display
  const currentVisibleStep = Math.max(
    0,
    visibleSteps.findIndex((s) => s.key === STEPS[step]?.key),
  );

  // Wrap next/prev to skip hidden steps when transitioning
  const handleNextSmart = useCallback(() => {
    let target = step + 1;
    while (target < STEPS.length && isHidden(STEPS[target].key)) target++;
    if (target >= STEPS.length) target = STEPS.length - 1;
    goToStep(target);
  }, [step, isHidden, goToStep]);

  const handlePrevSmart = useCallback(() => {
    let target = step - 1;
    while (target >= 0 && isHidden(STEPS[target].key)) target--;
    if (target < 0) target = 0;
    goToStep(target);
  }, [step, isHidden, goToStep]);

  // Convert a visible-step index (from OnboardingShell click) to full STEPS index.
  // When jumping FORWARD, validate every required step in between — if any fail,
  // route the user to the first failing step instead of the requested target.
  const handleGoToVisibleStep = useCallback(
    (visibleIdx: number) => {
      const targetKey = visibleSteps[visibleIdx]?.key;
      if (!targetKey) return;
      const targetIdx = STEPS.findIndex((s) => s.key === targetKey);
      if (targetIdx < 0) return;

      // Backward / same-step navigation — always allowed
      if (targetIdx <= step) {
        goToStep(targetIdx);
        return;
      }

      // Forward navigation — validate every step between current (inclusive)
      // and target (exclusive). Skip hidden steps for current candidate type.
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

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  const saveMutation = useMutation({
    mutationFn: (payload: UpdateCandidateRequest) => candidateService.updateProfile(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.PROFILE });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.COMPLETENESS });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (file: File) => candidateService.uploadResume(file),
  });

  const avatarMutation = useMutation({
    mutationFn: (file: File) => candidateService.uploadAvatar(file),
  });

  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeParsePolling, setResumeParsePolling] = useState(false);
  const [parsedResumeData, setParsedResumeData] = useState<ParsedResumeData | null>(null);
  const [resumeParseApplied, setResumeParseApplied] = useState(false);
  const [showOnboardingResumePreview, setShowOnboardingResumePreview] = useState(false);
  const [showReviewResumePreview, setShowReviewResumePreview] = useState(false);

  // Poll for parsed resume data after triggering parse
  const { data: polledParsedData } = useQuery({
    queryKey: QUERY_KEYS.CANDIDATES.PARSED_RESUME,
    queryFn: () => candidateService.getParsedResumeData(),
    refetchInterval: resumeParsePolling ? 3000 : false,
    enabled: resumeParsePolling,
  });

  // Stop polling when parsed data arrives
  useEffect(() => {
    if (polledParsedData?.data && resumeParsePolling) {
      queueMicrotask(() => {
        setParsedResumeData(polledParsedData.data);
        setResumeParsePolling(false);
        setResumeParsing(false);
      });
    }
  }, [polledParsedData, resumeParsePolling]);

  // Timeout polling after 60 seconds
  useEffect(() => {
    if (!resumeParsePolling) return;
    const timeout = setTimeout(() => {
      setResumeParsePolling(false);
      setResumeParsing(false);
      showToast.error(
        'Resume parsing is taking longer than expected. Check back on your profile page.',
      );
    }, 60000);
    return () => clearTimeout(timeout);
  }, [resumeParsePolling]);

  const parseResumeMutation = useMutation({
    mutationFn: () => candidateService.parseResume(),
    onSuccess: () => {
      setResumeParsePolling(true);
    },
    onError: () => {
      showToast.error('Resume parsing failed. You can try again from your profile page.');
      setResumeParsing(false);
    },
  });

  const handleUploadAndParse = useCallback(async () => {
    if (resumeFile.length === 0) return;
    setResumeParsing(true);
    setParsedResumeData(null);
    setResumeParseApplied(false);
    try {
      await resumeMutation.mutateAsync(resumeFile[0]);
      setResumeUploaded(true);
      parseResumeMutation.mutate();
    } catch {
      setResumeParsing(false);
      showToast.error('Resume upload failed. Please try again.');
    }
  }, [resumeFile, resumeMutation, parseResumeMutation]);

  const handleUploadOnly = useCallback(async () => {
    if (resumeFile.length === 0) return;
    try {
      await resumeMutation.mutateAsync(resumeFile[0]);
      setResumeUploaded(true);
      showToast.success('Resume uploaded successfully!');
    } catch {
      showToast.error('Resume upload failed. Please try again.');
    }
  }, [resumeFile, resumeMutation]);

  const handleParseOnly = useCallback(() => {
    setResumeParsing(true);
    setParsedResumeData(null);
    setResumeParseApplied(false);
    parseResumeMutation.mutate();
  }, [parseResumeMutation]);

  const setAuthUser = useAuthStore((s) => s.setUser);

  const handleApplyParsedFields = useCallback(
    (fields: Partial<ApplyableResumeFields>) => {
      // firstName / lastName aren't part of the onboarding form (they
      // were collected at registration and live on the User record).
      // The apply handler dispatches them to authService.updateProfile
      // separately so the parsed name overrides what the user typed at
      // signup — the rest of the payload spreads into local form state
      // and is sent on wizard submit. Email + mobile are deliberately
      // never in `fields` (auth identifiers, must not be overwritten
      // from a parsed resume).
      const { firstName, lastName, ...rest } = fields;
      if (firstName || lastName) {
        authService
          .updateProfile({
            firstName: firstName ?? user?.firstName ?? '',
            lastName: lastName ?? user?.lastName ?? '',
          })
          .then((res) => {
            if (res?.data?.user) setAuthUser(res.data.user);
          })
          .catch(() => {
            // Non-fatal — toast below still confirms the form-state
            // apply succeeded. If the name update failed (rate limit,
            // network), the user can re-trigger from their profile.
          });
      }

      // `rest` is the canonical Entry-shaped payload built by
      // ResumeParseReview → buildApplyableFields. Every remaining key
      // in ApplyableResumeFields matches the CandidateOnboardingData
      // key 1:1 — the only deliberate rename (summary → bio) happens
      // inside the helper.
      updateData(rest as Partial<CandidateOnboardingData>);
      setResumeParseApplied(true);
      showToast.success('Parsed data applied! Fields will be pre-filled in upcoming steps.');
    },
    [updateData, user?.firstName, user?.lastName, setAuthUser],
  );

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  const validateStep = useCallback(
    (): string | null => validateStepByKey(STEPS[step].key),
    [step, validateStepByKey],
  );

  // -----------------------------------------------------------------------
  // Handle Next / Submit
  // -----------------------------------------------------------------------

  // Build the full candidate payload from current form state. Used by both the
  // final-step save (handleNext) and the Skip-to-dashboard handler so partial
  // progress isn't lost when the user skips mid-wizard.
  const buildPayload = useCallback(
    (): UpdateCandidateRequest => ({
      headline: data.headline || undefined,
      pronouns: data.pronouns || undefined,
      phone: data.phone || undefined,
      currentLocation: data.currentLocation || undefined,
      dob: data.dob ? new Date(data.dob).toISOString() : undefined,
      gender: (data.gender as Gender) || undefined,
      maritalStatus: (data.maritalStatus as MaritalStatus) || undefined,
      nationality: data.nationality || undefined,
      hometown: data.hometown || undefined,
      category: (data.category as ReservationCategory) || undefined,
      alternatePhone: data.alternatePhone || undefined,
      alternateEmail: data.alternateEmail || undefined,
      addressLine1: data.addressLine1 || undefined,
      addressLine2: data.addressLine2 || undefined,
      city: data.city || undefined,
      state: data.state || undefined,
      pincode: data.pincode || undefined,
      country: data.country || undefined,
      bio: data.bio || undefined,
      experienceYears: isFresher ? 0 : data.experienceYears || 0,
      totalExperienceMonths: isFresher ? 0 : data.totalExperienceMonths || undefined,
      workStatus: (data.workStatus as WorkStatus) || undefined,
      hasCareerBreak: isFresher ? false : data.hasCareerBreak,
      careerBreakType: isFresher
        ? undefined
        : (data.careerBreakType as CareerBreakType) || undefined,
      careerBreakReason: isFresher ? undefined : data.careerBreakReason || undefined,
      openToWork: (data.openToWork as OpenToWorkStatus) || undefined,
      currentCompany: isFresher ? undefined : data.currentCompany || undefined,
      currentRole: isFresher ? undefined : data.currentRole || undefined,
      currentIndustry: isFresher ? undefined : data.currentIndustry || undefined,
      currentDepartment: isFresher ? undefined : data.currentDepartment || undefined,
      functionalArea: isFresher ? undefined : data.functionalArea || undefined,
      currSalary: isFresher ? undefined : data.currSalary || undefined,
      noticePeriod: isFresher ? undefined : (data.noticePeriod as NoticePeriod) || undefined,
      servingNoticePeriod: isFresher ? false : data.servingNoticePeriod,
      experience: isFresher ? undefined : data.experience.length > 0 ? data.experience : undefined,
      education: data.education.length > 0 ? data.education : undefined,
      skills: data.skills.length > 0 ? data.skills : undefined,
      skillsWithProficiency:
        data.skillsWithProficiency.length > 0 ? data.skillsWithProficiency : undefined,
      itSkills: data.itSkills.length > 0 ? data.itSkills : undefined,
      certifications: data.certifications.length > 0 ? data.certifications : undefined,
      awards: data.awards.length > 0 ? data.awards : undefined,
      courses: data.courses.length > 0 ? data.courses : undefined,
      testScores: data.testScores.length > 0 ? data.testScores : undefined,
      languages: data.languages.length > 0 ? data.languages : undefined,
      languageProficiency:
        data.languageProficiency.length > 0 ? data.languageProficiency : undefined,
      publications: data.publications.length > 0 ? data.publications : undefined,
      patents: data.patents.length > 0 ? data.patents : undefined,
      professionalMemberships:
        data.professionalMemberships.length > 0 ? data.professionalMemberships : undefined,
      volunteerExperience:
        data.volunteerExperience.length > 0 ? data.volunteerExperience : undefined,
      references: data.references.length > 0 ? data.references : undefined,
      preferredJobType:
        data.preferredJobType.length > 0 ? (data.preferredJobType as JobType[]) : undefined,
      preferredWorkMode:
        data.preferredWorkMode.length > 0 ? (data.preferredWorkMode as WorkMode[]) : undefined,
      preferredShift: (data.preferredShift as ShiftType) || undefined,
      expectedSalaryMin: data.expectedSalaryMin || undefined,
      expectedSalaryMax: data.expectedSalaryMax || undefined,
      salaryCurrency: data.salaryCurrency || undefined,
      preferredLocations: data.preferredLocations.length > 0 ? data.preferredLocations : undefined,
      preferredIndustries:
        data.preferredIndustries.length > 0 ? data.preferredIndustries : undefined,
      preferredRoleCategories:
        data.preferredRoleCategories.length > 0 ? data.preferredRoleCategories : undefined,
      willingToRelocate: data.willingToRelocate,
      travelWillingnessPercent: data.travelWillingnessPercent || undefined,
      dateOfAvailability: data.dateOfAvailability
        ? new Date(data.dateOfAvailability).toISOString()
        : undefined,
      visaStatus: data.visaStatus || undefined,
      passportNumber: data.passportNumber || undefined,
      passportExpiryDate: data.passportExpiryDate
        ? new Date(data.passportExpiryDate).toISOString()
        : undefined,
      experienceLevel: (data.experienceLevel as ExperienceLevel) || undefined,
      highestEducationLevel: (data.highestEducationLevel as EducationLevel) || undefined,
      highestDegree: (data.highestDegree as SpecificDegree) || undefined,
      workPermitStatus: data.workPermitStatus || undefined,
      hasDrivingLicense: data.hasDrivingLicense,
      drivingLicenseType: (data.drivingLicenseType as DrivingLicenseType) || undefined,
      ownVehicle: data.ownVehicle,
      vehicleTypes:
        data.ownVehicle && data.vehicleTypes.length > 0 ? (data.vehicleTypes as VehicleType[]) : [],
      isVeteran: data.isVeteran,
      isPhysicallyChallenged: data.isPhysicallyChallenged,
      disabilityType: data.isPhysicallyChallenged
        ? (data.disabilityType as DisabilityType) || undefined
        : undefined,
      disabilityPercentage: data.isPhysicallyChallenged
        ? data.disabilityPercentage || undefined
        : undefined,
      videoResumeUrl: data.videoResumeUrl || undefined,
      blockedCompanies: data.blockedCompanies.length > 0 ? data.blockedCompanies : undefined,
      hobbies: data.hobbies.length > 0 ? data.hobbies : undefined,
      interests: data.interests.length > 0 ? data.interests : undefined,
      linkedinProfile: data.linkedinProfile || undefined,
      githubProfile: data.githubProfile || undefined,
      portfolioUrl: data.portfolioUrl || undefined,
      stackOverflowProfile: data.stackOverflowProfile || undefined,
      twitterProfile: data.twitterProfile || undefined,
      personalBlogUrl: data.personalBlogUrl || undefined,
      dribbbleProfile: data.dribbbleProfile || undefined,
      behanceProfile: data.behanceProfile || undefined,
      mediumProfile: data.mediumProfile || undefined,
      youtubeChannel: data.youtubeChannel || undefined,
    }),
    [data, isFresher],
  );

  const handleNext = useCallback(async () => {
    const error = validateStep();
    if (error) {
      showToast.error(error);
      return;
    }

    if (isLastStep) {
      try {
        await saveMutation.mutateAsync(buildPayload());

        // Upload resume if selected but not yet uploaded in resume step
        if (resumeFile.length > 0 && !resumeUploaded) {
          await resumeMutation.mutateAsync(resumeFile[0]);
        }

        if (avatarFile) {
          await avatarMutation.mutateAsync(avatarFile);
        }

        markOnboardingComplete(`ha_candidate_onboarding_${userId}`);
        clearSavedData();
        showToast.success('Profile setup complete! Welcome to Hire Adda.');
        router.push(ROUTES.CANDIDATE.DASHBOARD);
      } catch (err) {
        const apiError = err as unknown as ApiError;
        showToast.error(apiError.message || 'Failed to save profile. Please try again.');
      }
      return;
    }

    handleNextSmart();
  }, [
    validateStep,
    isLastStep,
    buildPayload,
    resumeFile,
    resumeUploaded,
    avatarFile,
    handleNextSmart,
    saveMutation,
    resumeMutation,
    avatarMutation,
    clearSavedData,
    router,
    userId,
  ]);

  // Persist whatever the user has filled so far before leaving — otherwise
  // localStorage gets cleared on skip and partial progress is lost.
  const handleSkip = useCallback(async () => {
    try {
      await saveMutation.mutateAsync(buildPayload());
      if (resumeFile.length > 0 && !resumeUploaded) {
        await resumeMutation.mutateAsync(resumeFile[0]);
      }
      if (avatarFile) await avatarMutation.mutateAsync(avatarFile);
      markOnboardingComplete(`ha_candidate_onboarding_${userId}`);
      clearSavedData();
      router.push(ROUTES.CANDIDATE.DASHBOARD);
    } catch (err) {
      const apiError = err as unknown as ApiError;
      showToast.error(apiError.message || 'Failed to save progress. Please try again.');
    }
  }, [
    buildPayload,
    saveMutation,
    resumeFile,
    resumeUploaded,
    resumeMutation,
    avatarFile,
    avatarMutation,
    clearSavedData,
    router,
    userId,
  ]);

  // -----------------------------------------------------------------------
  // Array-entry helpers
  // -----------------------------------------------------------------------

  function updateExperience(index: number, partial: Partial<ExperienceEntry>) {
    const updated = [...data.experience];
    updated[index] = { ...updated[index], ...partial };
    updateData({ experience: updated });
  }

  function removeExperience(index: number) {
    updateData({ experience: data.experience.filter((_, i) => i !== index) });
  }

  function updateEducation(index: number, partial: Partial<EducationEntry>) {
    const updated = [...data.education];
    updated[index] = { ...updated[index], ...partial };
    updateData({ education: updated });
  }

  function removeEducation(index: number) {
    updateData({ education: data.education.filter((_, i) => i !== index) });
  }

  function updateCertification(index: number, partial: Partial<CertificationEntry>) {
    const updated = [...data.certifications];
    updated[index] = { ...updated[index], ...partial };
    updateData({ certifications: updated });
  }

  function removeCertification(index: number) {
    updateData({ certifications: data.certifications.filter((_, i) => i !== index) });
  }

  function updateAward(index: number, partial: Partial<AwardEntry>) {
    const updated = [...data.awards];
    updated[index] = { ...updated[index], ...partial };
    updateData({ awards: updated });
  }

  function removeAward(index: number) {
    updateData({ awards: data.awards.filter((_, i) => i !== index) });
  }

  function updateLanguage(index: number, partial: Partial<LanguageEntry>) {
    const updated = [...data.languageProficiency];
    updated[index] = { ...updated[index], ...partial };
    updateData({ languageProficiency: updated });
  }

  function removeLanguage(index: number) {
    updateData({ languageProficiency: data.languageProficiency.filter((_, i) => i !== index) });
  }

  function updateSkillWithProf(index: number, partial: Partial<SkillWithProficiency>) {
    const updated = [...data.skillsWithProficiency];
    updated[index] = { ...updated[index], ...partial };
    updateData({ skillsWithProficiency: updated });
  }

  function removeSkillWithProf(index: number) {
    updateData({ skillsWithProficiency: data.skillsWithProficiency.filter((_, i) => i !== index) });
  }

  function updateITSkill(index: number, partial: Partial<ITSkillEntry>) {
    const updated = [...data.itSkills];
    updated[index] = { ...updated[index], ...partial };
    updateData({ itSkills: updated });
  }

  function removeITSkill(index: number) {
    updateData({ itSkills: data.itSkills.filter((_, i) => i !== index) });
  }

  function updatePublication(index: number, partial: Partial<PublicationEntry>) {
    const updated = [...data.publications];
    updated[index] = { ...updated[index], ...partial };
    updateData({ publications: updated });
  }

  function removePublication(index: number) {
    updateData({ publications: data.publications.filter((_, i) => i !== index) });
  }

  function updatePatent(index: number, partial: Partial<PatentEntry>) {
    const updated = [...data.patents];
    updated[index] = { ...updated[index], ...partial };
    updateData({ patents: updated });
  }

  function removePatent(index: number) {
    updateData({ patents: data.patents.filter((_, i) => i !== index) });
  }

  function updateVolunteer(index: number, partial: Partial<VolunteerEntry>) {
    const updated = [...data.volunteerExperience];
    updated[index] = { ...updated[index], ...partial };
    updateData({ volunteerExperience: updated });
  }

  function removeVolunteer(index: number) {
    updateData({ volunteerExperience: data.volunteerExperience.filter((_, i) => i !== index) });
  }

  function updateMembership(index: number, partial: Partial<MembershipEntry>) {
    const updated = [...data.professionalMemberships];
    updated[index] = { ...updated[index], ...partial };
    updateData({ professionalMemberships: updated });
  }

  function removeMembership(index: number) {
    updateData({
      professionalMemberships: data.professionalMemberships.filter((_, i) => i !== index),
    });
  }

  function updateCourse(index: number, partial: Partial<CourseCompletionEntry>) {
    const updated = [...data.courses];
    updated[index] = { ...updated[index], ...partial };
    updateData({ courses: updated });
  }

  function removeCourse(index: number) {
    updateData({ courses: data.courses.filter((_, i) => i !== index) });
  }

  function updateTestScore(index: number, partial: Partial<TestScoreEntry>) {
    const updated = [...data.testScores];
    updated[index] = { ...updated[index], ...partial };
    updateData({ testScores: updated });
  }

  function removeTestScore(index: number) {
    updateData({ testScores: data.testScores.filter((_, i) => i !== index) });
  }

  function updateReference(index: number, partial: Partial<ReferenceEntry>) {
    const updated = [...data.references];
    updated[index] = { ...updated[index], ...partial };
    updateData({ references: updated });
  }

  function removeReference(index: number) {
    updateData({ references: data.references.filter((_, i) => i !== index) });
  }

  // -----------------------------------------------------------------------
  // Tag-add helpers
  // -----------------------------------------------------------------------

  function addSkill(value: string) {
    const trimmed = value.trim();
    if (trimmed && !data.skills.includes(trimmed)) {
      updateData({ skills: [...data.skills, trimmed] });
    }
    setSkillInput('');
  }

  function addPreferredLocation(value: string) {
    const trimmed = value.trim();
    if (trimmed && !data.preferredLocations.includes(trimmed)) {
      updateData({ preferredLocations: [...data.preferredLocations, trimmed] });
    }
    setLocationInput('');
  }

  function addPreferredIndustry(value: string) {
    const trimmed = value.trim();
    if (trimmed && !data.preferredIndustries.includes(trimmed)) {
      updateData({ preferredIndustries: [...data.preferredIndustries, trimmed] });
    }
    setIndustryInput('');
  }

  function addPreferredRoleCategory(value: string) {
    const trimmed = value.trim();
    if (trimmed && !data.preferredRoleCategories.includes(trimmed)) {
      updateData({ preferredRoleCategories: [...data.preferredRoleCategories, trimmed] });
    }
    setRoleCatInput('');
  }

  function addHobby(value: string) {
    const trimmed = value.trim();
    if (trimmed && !data.hobbies.includes(trimmed)) {
      updateData({ hobbies: [...data.hobbies, trimmed] });
    }
    setHobbyInput('');
  }

  function addInterest(value: string) {
    const trimmed = value.trim();
    if (trimmed && !data.interests.includes(trimmed)) {
      updateData({ interests: [...data.interests, trimmed] });
    }
    setInterestInput('');
  }

  function addBlockedCompany(value: string) {
    const trimmed = value.trim();
    if (trimmed && !data.blockedCompanies.includes(trimmed)) {
      updateData({ blockedCompanies: [...data.blockedCompanies, trimmed] });
    }
    setBlockedCompanyInput('');
  }

  // -----------------------------------------------------------------------
  // Step Content Renderer
  // -----------------------------------------------------------------------

  function renderStepContent() {
    const currentKey = STEPS[step].key;

    // ===================================================================
    // Step 0 - Welcome
    // ===================================================================
    if (currentKey === 'welcome') {
      return (
        <div className="flex flex-col items-center py-4 text-center">
          <div className="bg-primary-light mb-6 flex h-20 w-20 items-center justify-center rounded-2xl">
            <Sparkles className="text-primary h-10 w-10" />
          </div>
          <h2 className="text-2xl font-bold text-[var(--text)] sm:text-3xl">
            Welcome{user?.firstName ? `, ${user.firstName}` : ''}!
          </h2>
          <p className="mt-3 max-w-md text-[var(--text-secondary)]">
            Let&apos;s set up your profile in a few easy steps. A complete profile increases your
            chances of getting discovered by top employers.
          </p>

          <div className="mt-8 w-full max-w-sm space-y-3 text-left">
            {[
              { icon: User, label: 'Profile Basics' },
              ...(isFresher ? [] : [{ icon: Briefcase, label: 'Experience & Employment' }]),
              { icon: GraduationCap, label: 'Education' },
              { icon: Code, label: 'Skills & Certifications' },
              { icon: Settings, label: 'Job Preferences' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3"
              >
                <div className="bg-primary-light flex h-8 w-8 items-center justify-center rounded-lg">
                  <Icon className="text-primary h-4 w-4" />
                </div>
                <span className="text-sm font-medium text-[var(--text)]">{label}</span>
              </div>
            ))}
          </div>

          <Button className="mt-8" size="lg" onClick={nextStep} tooltip="Start profile setup">
            Let&apos;s Go!
          </Button>
        </div>
      );
    }

    // ===================================================================
    // Step 1 - Candidate Type (Fresher / Experienced)
    // ===================================================================
    if (currentKey === 'candidateType') {
      const options = [
        {
          value: 'EXPERIENCED',
          label: 'Experienced',
          icon: Briefcase,
          desc: 'I have work experience and want to upload my resume',
        },
        {
          value: 'FRESHER',
          label: 'Fresher',
          icon: GraduationCap,
          desc: 'I am a recent graduate or have no prior work experience',
        },
      ];

      return (
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-[var(--text)]">Tell us about yourself</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              This helps us tailor the onboarding experience for you
            </p>
          </div>
          <div className="mx-auto grid max-w-lg gap-4 sm:grid-cols-2">
            {options.map(({ value, label, icon: Icon, desc }) => {
              const isSelected = data.candidateType === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    const updates: Partial<CandidateOnboardingData> = { candidateType: value };
                    if (value === 'FRESHER') {
                      updates.experienceLevel = 'FRESHER';
                      updates.experienceYears = 0;
                      updates.totalExperienceMonths = 0;
                    } else if (data.experienceLevel === 'FRESHER') {
                      updates.experienceLevel = '';
                    }
                    updateData(updates);
                  }}
                  className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 p-6 text-center transition-all ${
                    isSelected
                      ? 'border-[var(--primary)] bg-[var(--primary)]/5 shadow-sm'
                      : 'border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--text-muted)]'
                  }`}
                >
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                      isSelected
                        ? 'bg-primary-light text-primary'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                    }`}
                  >
                    <Icon className="h-7 w-7" />
                  </div>
                  <div>
                    <span
                      className={`block text-base font-semibold ${isSelected ? 'text-primary' : 'text-[var(--text)]'}`}
                    >
                      {label}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--text-muted)]">{desc}</span>
                  </div>
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
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
      );
    }

    // ===================================================================
    // Step 2 - Profile Photo
    // ===================================================================
    if (currentKey === 'avatar') {
      const handleAvatarDrop = (files: File[]) => {
        const file = files[0];
        if (!file) return;
        if (!(FILE_LIMITS.IMAGE_TYPES as readonly string[]).includes(file.type)) {
          showToast.error('Please select a JPG, PNG, or WebP image');
          return;
        }
        if (file.size > FILE_LIMITS.AVATAR_MAX_SIZE) {
          showToast.error('Image must be under 5MB');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          setSelectedImage(reader.result as string);
          setCropperOpen(true);
        };
        reader.readAsDataURL(file);
      };

      const handleCropComplete = (blob: Blob) => {
        const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
        setAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(blob));
        setSelectedImage(null);
      };

      return (
        <div className="space-y-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
              <Camera className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Profile Photo</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Add a photo to help employers recognize you
              </p>
            </div>
          </div>

          {!avatarPreview ? (
            <FileUpload
              label="Profile Photo (JPG, PNG, WebP)"
              accept={{
                'image/jpeg': ['.jpg', '.jpeg'],
                'image/png': ['.png'],
                'image/webp': ['.webp'],
              }}
              maxSize={FILE_LIMITS.AVATAR_MAX_SIZE}
              onDrop={handleAvatarDrop}
              files={[]}
              multiple={false}
            />
          ) : (
            <div className="flex flex-col items-center py-6">
              <div className="relative mb-6">
                <div className="h-32 w-32 overflow-hidden rounded-full border-2 border-[var(--border)] bg-[var(--bg-secondary)]">
                  <img
                    src={avatarPreview}
                    alt="Avatar preview"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAvatarFile(null);
                    setAvatarPreview(null);
                  }}
                  tooltip="Upload new photo"
                >
                  <Upload className="mr-1.5 h-4 w-4" />
                  Change Photo
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAvatarFile(null);
                    setAvatarPreview(null);
                  }}
                  className="text-[var(--error)]"
                  tooltip="Remove photo"
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Remove
                </Button>
              </div>

              <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
                JPG, PNG, or WebP. Max 5MB. Will be cropped to 1:1 aspect ratio (400x400px).
              </p>
            </div>
          )}

          {selectedImage && (
            <ImageCropper
              isOpen={cropperOpen}
              onClose={() => {
                setCropperOpen(false);
                setSelectedImage(null);
              }}
              imageSrc={selectedImage}
              onCropComplete={handleCropComplete}
              aspectRatio={1}
              circularCrop={true}
              outputWidth={400}
              outputHeight={400}
            />
          )}
        </div>
      );
    }

    // ===================================================================
    // Step 2 - Resume Upload & AI Parse
    // ===================================================================
    if (currentKey === 'resume') {
      if (isFresher) {
        return (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-secondary)]">
              <FileText className="h-8 w-8 text-[var(--text-muted)]" />
            </div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Build Your Resume</h2>
            <p className="mt-2 max-w-md text-sm text-[var(--text-muted)]">
              As a fresher, we&apos;ll help you build a great profile using the details you provide
              in the next steps — your education, skills, projects, and certifications.
            </p>
            <p className="mt-4 text-xs text-[var(--text-muted)]">
              You can skip this step and continue to fill in your details.
            </p>
          </div>
        );
      }

      const selectedFile = resumeFile[0] ?? null;
      const isPdf = selectedFile?.type === 'application/pdf';
      const typeBadge = selectedFile ? getFileTypeBadge(selectedFile) : null;

      return (
        <div className="space-y-6">
          {/* Header */}
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
              <FileText className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Upload Resume</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Upload your resume and optionally let AI extract your details
              </p>
            </div>
          </div>

          {/* ===== File drop zone (visible when not uploaded) ===== */}
          {!resumeUploaded && (
            <>
              <FileUpload
                label="Resume (PDF, DOC, DOCX)"
                accept={{
                  'application/pdf': ['.pdf'],
                  'application/msword': ['.doc'],
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
                    '.docx',
                  ],
                }}
                maxSize={FILE_LIMITS.RESUME_MAX_SIZE}
                onDrop={(files) => {
                  setResumeFile(files);
                  setResumeUploaded(false);
                  setParsedResumeData(null);
                  setResumeParseApplied(false);
                  setShowOnboardingResumePreview(false);
                }}
                files={resumeFile}
                onRemove={() => {
                  setResumeFile([]);
                  setResumeUploaded(false);
                  setParsedResumeData(null);
                  setResumeParseApplied(false);
                  setShowOnboardingResumePreview(false);
                }}
              />
              <p className="text-xs text-[var(--text-muted)]">
                Max 5MB. Accepted formats: PDF, DOC, DOCX
              </p>
            </>
          )}

          {/* ===== File selected, not yet uploaded — info card + action buttons ===== */}
          {selectedFile && !resumeUploaded && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                <FileText className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text)]">
                    {selectedFile.name}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)]">
                      {formatFileSize(selectedFile.size)}
                    </span>
                    {typeBadge && (
                      <span
                        className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${typeBadge.color}`}
                      >
                        {typeBadge.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleUploadOnly}
                  isLoading={resumeMutation.isPending && !resumeParsing}
                  disabled={resumeParsing || resumeMutation.isPending}
                  tooltip="Upload without parsing"
                >
                  <Upload className="mr-1.5 h-4 w-4" />
                  Upload Resume
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleUploadAndParse}
                  isLoading={resumeMutation.isPending && resumeParsing}
                  disabled={resumeParsing || resumeMutation.isPending}
                  tooltip="Upload and extract details"
                >
                  <WandSparkles className="mr-1.5 h-4 w-4" />
                  Upload & Parse with AI
                </Button>
              </div>
            </div>
          )}

          {/* ===== Uploaded — resume info card with preview + actions ===== */}
          {resumeUploaded && (
            <div className="space-y-4">
              <div className="flex items-start gap-4 rounded-lg border border-green-200 bg-green-50/50 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100">
                  <FileCheck className="h-5 w-5 text-green-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--text)]">
                      {selectedFile?.name || 'Resume'}
                    </p>
                    <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                      Uploaded
                    </span>
                    {typeBadge && (
                      <span
                        className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${typeBadge.color}`}
                      >
                        {typeBadge.label}
                      </span>
                    )}
                  </div>
                  {selectedFile && (
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  {isPdf && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowOnboardingResumePreview((prev) => !prev)}
                      tooltip="Toggle resume preview"
                    >
                      <Eye className="mr-1.5 h-4 w-4" />
                      {showOnboardingResumePreview ? 'Hide' : 'Preview'}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setResumeFile([]);
                      setResumeUploaded(false);
                      setParsedResumeData(null);
                      setResumeParseApplied(false);
                      setResumeParsing(false);
                      setShowOnboardingResumePreview(false);
                    }}
                    tooltip="Replace resume file"
                  >
                    Replace
                  </Button>
                </div>
              </div>

              {/* Inline PDF preview */}
              {isPdf && showOnboardingResumePreview && selectedFile && (
                <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                  <iframe
                    src={URL.createObjectURL(selectedFile)}
                    title="Resume Preview"
                    className="w-full border-0"
                    style={{ height: '500px' }}
                  />
                </div>
              )}

              {/* Parse with AI (only if not already parsing/parsed) */}
              {!resumeParsing && !parsedResumeData && !resumeParseApplied && (
                <Button
                  variant="secondary"
                  onClick={handleParseOnly}
                  tooltip="Extract resume details"
                >
                  <WandSparkles className="mr-1.5 h-4 w-4" />
                  Parse with AI
                </Button>
              )}
            </div>
          )}

          {/* ===== Parsing in progress ===== */}
          {resumeUploaded && resumeParsing && !parsedResumeData && (
            <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
              <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
              <div>
                <p className="text-sm font-medium text-[var(--text)]">
                  AI is analyzing your resume...
                </p>
                <p className="text-xs text-[var(--text-muted)]">This usually takes 10-30 seconds</p>
              </div>
            </div>
          )}

          {/* ===== Parsed data review ===== */}
          {parsedResumeData && !resumeParseApplied && (
            <ResumeParseReview
              parsedData={parsedResumeData}
              onApplyFields={handleApplyParsedFields}
              onCancel={() => setParsedResumeData(null)}
            />
          )}

          {/* ===== Applied confirmation ===== */}
          {resumeParseApplied && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4">
              <Sparkles className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">Resume data applied!</p>
                <p className="text-xs text-green-600">
                  The extracted data has been pre-filled into your profile. You can customize each
                  field in the upcoming steps.
                </p>
              </div>
            </div>
          )}
        </div>
      );
    }

    // ===================================================================
    // Step 3 - Profile Basics
    // ===================================================================
    if (currentKey === 'basics') {
      return (
        <div className="space-y-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
              <User className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Profile Basics</h2>
              <p className="text-sm text-[var(--text-muted)]">Tell us a bit about yourself</p>
            </div>
          </div>

          <Input
            label="Professional Headline"
            placeholder="e.g. Senior React Developer with 5+ years"
            value={data.headline}
            onChange={(e) => updateData({ headline: e.target.value })}
            required
            leftIcon={<Briefcase className="h-4 w-4" />}
          />

          <Select
            label="Pronouns"
            options={PRONOUN_OPTIONS_SELECT}
            value={data.pronouns}
            onChange={(val) => updateData({ pronouns: val })}
            placeholder="Select pronouns (optional)"
          />

          <PhoneInput
            label="Phone Number"
            placeholder="9876xxxxxx"
            value={data.phone}
            onValueChange={(val) => updateData({ phone: val })}
          />

          <ServerSuggestionInput
            label="Current Location"
            placeholder="Start typing your city..."
            value={data.currentLocation}
            onChange={(val) => updateData({ currentLocation: val })}
            category="location"
            required
            leftIcon={<MapPin className="h-4 w-4" />}
          />
        </div>
      );
    }

    // ===================================================================
    // Step 2 - Personal Details (optional)
    // ===================================================================
    if (currentKey === 'personal') {
      return (
        <div className="space-y-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
              <User className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Personal Details</h2>
              <p className="text-sm text-[var(--text-muted)]">Optional but helps with matching</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <DatePicker
              label="Date of Birth"
              value={data.dob}
              onChange={(val) => updateData({ dob: val })}
              leftIcon={<Calendar className="h-4 w-4" />}
              maxDate={new Date()}
            />
            <Select
              label="Gender"
              options={GENDER_OPTIONS}
              value={data.gender}
              onChange={(val) => updateData({ gender: val })}
              placeholder="Select gender"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Marital Status"
              options={MARITAL_OPTIONS}
              value={data.maritalStatus}
              onChange={(val) => updateData({ maritalStatus: val })}
              placeholder="Select status"
            />
            <ServerSuggestionInput
              label="Nationality"
              placeholder="e.g. Indian"
              value={data.nationality}
              onChange={(val) => updateData({ nationality: val })}
              category="nationality"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ServerSuggestionInput
              label="Hometown"
              placeholder="e.g. Jaipur"
              value={data.hometown}
              onChange={(val) => updateData({ hometown: val })}
              category="location"
            />
            <Select
              label="Category (Reservation)"
              options={CATEGORY_OPTIONS}
              value={data.category}
              onChange={(val) => updateData({ category: val })}
              placeholder="Select category"
            />
          </div>

          {/* Alternate phone/email hidden from onboarding — available in profile settings */}

          {/* Address Section */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Address</h3>
            <div className="space-y-4">
              <Input
                label="Address Line 1"
                placeholder="Street address, building name"
                value={data.addressLine1}
                onChange={(e) => updateData({ addressLine1: e.target.value })}
              />
              <Input
                label="Address Line 2"
                placeholder="Apartment, suite, floor (optional)"
                value={data.addressLine2}
                onChange={(e) => updateData({ addressLine2: e.target.value })}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <ServerSuggestionInput
                  label="City"
                  placeholder="e.g. Bengaluru"
                  value={data.city}
                  onChange={(val) => updateData({ city: val })}
                  category="location"
                />
                <Select
                  label="State"
                  options={STATE_OPTIONS}
                  value={data.state}
                  onChange={(val) => updateData({ state: val })}
                  placeholder="Select state"
                  searchable
                />
                <Input
                  label="Pincode"
                  placeholder="e.g. 560001"
                  value={data.pincode}
                  onChange={(e) => updateData({ pincode: e.target.value })}
                  maxLength={6}
                />
              </div>
              <ServerSuggestionInput
                label="Country"
                value={data.country}
                onChange={(val) => updateData({ country: val })}
                placeholder="e.g. India"
                category="country"
              />
            </div>
          </div>
        </div>
      );
    }

    // ===================================================================
    // Step 3 - Professional Summary
    // ===================================================================
    if (currentKey === 'professional') {
      return (
        <div className="space-y-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
              <FileText className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Professional Summary</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Summarize your career and work status
              </p>
            </div>
          </div>

          <Textarea
            label="About You"
            placeholder="Write a short bio about your professional background, key achievements, and career goals..."
            value={data.bio}
            onChange={(e) => updateData({ bio: e.target.value })}
            rows={4}
            maxLength={1000}
            showCount
            required
          />

          {!isFresher && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Total Experience (Years)"
                type="number"
                min={0}
                max={50}
                value={data.experienceYears || ''}
                onChange={(e) => updateData({ experienceYears: Number(e.target.value) || 0 })}
                placeholder="e.g. 5"
              />
              <Input
                label="Total Experience (Months)"
                type="number"
                min={0}
                max={11}
                value={data.totalExperienceMonths || ''}
                onChange={(e) => updateData({ totalExperienceMonths: Number(e.target.value) || 0 })}
                placeholder="e.g. 6"
                helperText="Additional months beyond full years"
              />
              <Select
                label="Experience Level"
                options={EXPERIENCE_LEVEL_OPTIONS.filter((o) => o.value !== 'FRESHER')}
                value={data.experienceLevel}
                onChange={(val) => updateData({ experienceLevel: val })}
                placeholder="Select level"
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Work Status"
              options={WORK_STATUS_OPTIONS}
              value={data.workStatus}
              onChange={(val) => updateData({ workStatus: val })}
              placeholder="Select work status"
              required
            />
            <Select
              label="Open to Work"
              options={OPEN_TO_WORK_OPTIONS}
              value={data.openToWork}
              onChange={(val) => updateData({ openToWork: val })}
              placeholder="Select status"
            />
          </div>

          {!isFresher && (
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={data.hasCareerBreak}
                  onChange={(e) => updateData({ hasCareerBreak: e.target.checked })}
                  className="text-primary focus:ring-primary/20 h-4 w-4 rounded border-[var(--border)]"
                />
                <span className="text-sm text-[var(--text)]">I have had a career break</span>
              </label>

              {data.hasCareerBreak && (
                <div className="space-y-3">
                  <Select
                    label="Career Break Type"
                    options={CAREER_BREAK_OPTIONS}
                    value={data.careerBreakType}
                    onChange={(val) => updateData({ careerBreakType: val })}
                    placeholder="Select break type"
                  />
                  <Textarea
                    label="Career Break Reason"
                    placeholder="Briefly explain the reason for your career break..."
                    value={data.careerBreakReason}
                    onChange={(e) => updateData({ careerBreakReason: e.target.value })}
                    rows={3}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // ===================================================================
    // Step 4 - Current Employment (optional)
    // ===================================================================
    if (currentKey === 'employment') {
      if (isFresher) {
        return (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-secondary)]">
              <Building2 className="h-8 w-8 text-[var(--text-muted)]" />
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              Current employment details are not applicable for freshers. You can skip this step.
            </p>
          </div>
        );
      }
      // Defensive guard: the step is filtered out of the navigator when
      // workStatus is Unemployed/Student/Freelancer (see `isHidden`), but
      // a user could still land here via browser back-button or a stale
      // deep link. Show the same explanatory empty state used for freshers
      // rather than a blank form.
      if (!hasCurrentEmployment) {
        return (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-secondary)]">
              <Building2 className="h-8 w-8 text-[var(--text-muted)]" />
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              Current employment details aren&apos;t applicable for your work status (
              {WORK_STATUS_LABELS[data.workStatus] || data.workStatus}). You can skip this step.
            </p>
          </div>
        );
      }
      return (
        <div className="space-y-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
              <Building2 className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Current Employment</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Details about your current or most recent role
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ServerSuggestionInput
              label="Current Company"
              placeholder="e.g. Google"
              value={data.currentCompany}
              onChange={(val) => updateData({ currentCompany: val })}
              category="company"
              leftIcon={<Building2 className="h-4 w-4" />}
            />
            <ServerSuggestionInput
              label="Current Role"
              placeholder="e.g. Senior Software Engineer"
              value={data.currentRole}
              onChange={(val) => updateData({ currentRole: val })}
              category="role_category"
              leftIcon={<Briefcase className="h-4 w-4" />}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ServerSuggestionInput
              label="Industry"
              placeholder="e.g. Information Technology"
              value={data.currentIndustry}
              onChange={(val) => updateData({ currentIndustry: val })}
              category="industry"
            />
            <ServerSuggestionInput
              label="Department"
              placeholder="e.g. Engineering - Software"
              value={data.currentDepartment}
              onChange={(val) => updateData({ currentDepartment: val })}
              category="department"
            />
          </div>

          <ServerSuggestionInput
            label="Functional Area"
            placeholder="e.g. Backend Development"
            value={data.functionalArea}
            onChange={(val) => updateData({ functionalArea: val })}
            category="department"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Current Salary (Annual)"
              type="number"
              min={0}
              value={data.currSalary ?? ''}
              onChange={(e) =>
                updateData({ currSalary: e.target.value ? Number(e.target.value) : undefined })
              }
              placeholder="e.g. 1200000"
              helperText="In \u20B9 (INR) per annum"
            />
            <Select
              label="Notice Period"
              options={NOTICE_PERIOD_OPTIONS}
              value={data.noticePeriod}
              onChange={(val) => updateData({ noticePeriod: val })}
              placeholder="Select notice period"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={data.servingNoticePeriod}
              onChange={(e) => updateData({ servingNoticePeriod: e.target.checked })}
              className="text-primary focus:ring-primary/20 h-4 w-4 rounded border-[var(--border)]"
            />
            <span className="text-sm text-[var(--text)]">Currently serving notice period</span>
          </label>
        </div>
      );
    }

    // ===================================================================
    // Step 5 - Work Experience (optional)
    // ===================================================================
    if (currentKey === 'experience') {
      if (isFresher) {
        return (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--bg-secondary)]">
              <Briefcase className="h-8 w-8 text-[var(--text-muted)]" />
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              Work experience is not applicable for freshers. You can skip this step.
            </p>
          </div>
        );
      }
      return (
        <div className="space-y-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
              <Briefcase className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Work Experience</h2>
              <p className="text-sm text-[var(--text-muted)]">Add your past and present roles</p>
            </div>
          </div>

          {data.experience.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              No experience added yet. Click below to add your work history.
            </p>
          )}

          {data.experience.map((exp, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text)]">Experience {i + 1}</h3>
                <Tooltip content="Remove entry">
                  <button
                    type="button"
                    onClick={() => removeExperience(i)}
                    className="cursor-pointer text-[var(--error)] transition-colors hover:text-[var(--error-dark)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <ServerSuggestionInput
                  label="Company"
                  placeholder="e.g. Infosys"
                  value={exp.company}
                  onChange={(val) => updateExperience(i, { company: val })}
                  category="company"
                  required
                />
                <ServerSuggestionInput
                  label="Role"
                  placeholder="e.g. Software Developer"
                  value={exp.role}
                  onChange={(val) => updateExperience(i, { role: val })}
                  category="role_category"
                  required
                />
              </div>

              <ServerSuggestionInput
                label="Location"
                placeholder="e.g. Bangalore, Karnataka"
                value={exp.location || ''}
                onChange={(val) => updateExperience(i, { location: val })}
                category="location"
              />

              <div className="grid gap-3 sm:grid-cols-3">
                <ServerSuggestionInput
                  label="Industry"
                  placeholder="e.g. Information Technology"
                  value={exp.industry || ''}
                  onChange={(val) => updateExperience(i, { industry: val })}
                  category="industry"
                />
                <ServerSuggestionInput
                  label="Department"
                  placeholder="e.g. Engineering"
                  value={exp.department || ''}
                  onChange={(val) => updateExperience(i, { department: val })}
                  category="department"
                />
                <Input
                  label="Employment Type"
                  placeholder="e.g. Full Time"
                  value={exp.employmentType || ''}
                  onChange={(e) => updateExperience(i, { employmentType: e.target.value })}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <DatePicker
                  label="Start Date"
                  mode="month"
                  value={exp.startDate}
                  onChange={(val) => updateExperience(i, { startDate: val })}
                  required
                />
                <DatePicker
                  label="End Date"
                  mode="month"
                  value={exp.endDate || ''}
                  onChange={(val) => updateExperience(i, { endDate: val })}
                  disabled={exp.isCurrent}
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={exp.isCurrent || false}
                  onChange={(e) =>
                    updateExperience(i, {
                      isCurrent: e.target.checked,
                      endDate: e.target.checked ? '' : exp.endDate,
                    })
                  }
                  className="text-primary focus:ring-primary/20 h-4 w-4 rounded border-[var(--border)]"
                />
                <span className="text-sm text-[var(--text)]">I currently work here</span>
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  label="Team Size"
                  type="number"
                  min={0}
                  value={exp.teamSize ?? ''}
                  onChange={(e) =>
                    updateExperience(i, {
                      teamSize: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="e.g. 10"
                />
                <ServerSuggestionInput
                  category="role_category"
                  label="Reporting To"
                  placeholder="e.g. Engineering Manager"
                  value={exp.reportingTo || ''}
                  onChange={(val) => updateExperience(i, { reportingTo: val })}
                />
                <Input
                  label="Annual CTC"
                  type="number"
                  min={0}
                  value={exp.annualCtc ?? ''}
                  onChange={(e) =>
                    updateExperience(i, {
                      annualCtc: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  placeholder="e.g. 1200000"
                />
              </div>

              <Textarea
                label="Description"
                placeholder="Describe your responsibilities and achievements..."
                value={exp.description || ''}
                onChange={(e) => updateExperience(i, { description: e.target.value })}
                rows={3}
              />

              <Textarea
                label="Key Achievements"
                placeholder="List key achievements (one per line)..."
                value={(exp.keyAchievements || []).join('\n')}
                onChange={(e) =>
                  updateExperience(i, {
                    keyAchievements: e.target.value.split('\n').filter((a) => a.trim()),
                  })
                }
                rows={2}
                helperText="Enter one achievement per line"
              />
            </div>
          ))}

          <Button
            variant="outline"
            onClick={() => updateData({ experience: [...data.experience, emptyExperience()] })}
            leftIcon={<Plus className="h-4 w-4" />}
            tooltip="Add work experience"
          >
            Add Experience
          </Button>
        </div>
      );
    }

    // ===================================================================
    // Step 6 - Education
    // ===================================================================
    if (currentKey === 'education') {
      return (
        <div className="space-y-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
              <GraduationCap className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Education</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Add your educational qualifications
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Highest Education Level"
              options={EDUCATION_LEVEL_OPTIONS}
              value={data.highestEducationLevel}
              onChange={(val) => {
                const degreeOptions = getDegreesForLevel(val as string);
                const currentDegreeValid = degreeOptions.some(
                  (d) => d.value === data.highestDegree,
                );
                updateData({
                  highestEducationLevel: val,
                  highestDegree: currentDegreeValid ? data.highestDegree : '',
                });
              }}
              placeholder="Select level"
            />
            <Select
              label="Highest Degree"
              options={getDegreesForLevel(data.highestEducationLevel)}
              value={data.highestDegree}
              onChange={(val) => updateData({ highestDegree: val })}
              placeholder={
                !data.highestEducationLevel
                  ? 'Select education level first'
                  : getDegreesForLevel(data.highestEducationLevel).length === 0
                    ? 'Not applicable for this level'
                    : 'Select degree'
              }
              disabled={
                !data.highestEducationLevel ||
                getDegreesForLevel(data.highestEducationLevel).length === 0
              }
            />
          </div>

          {data.education.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              No education added yet. Please add at least one entry.
            </p>
          )}

          {data.education.map((edu, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-[var(--border)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text)]">Education {i + 1}</h3>
                <Tooltip content="Remove entry">
                  <button
                    type="button"
                    onClick={() => removeEducation(i)}
                    className="cursor-pointer text-[var(--error)] transition-colors hover:text-[var(--error-dark)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>

              <Select
                label="Education Level"
                options={
                  data.highestEducationLevel
                    ? getLevelsAtOrBelow(data.highestEducationLevel).map((l) => ({
                        value: l,
                        label: EDUCATION_LEVEL_LABELS[l] || l,
                      }))
                    : EDUCATION_LEVEL_OPTIONS
                }
                value={edu.educationLevel || ''}
                onChange={(val) => {
                  // Reset all entry fields on level change — previous values
                  // (college name, specialization, CGPA, etc.) no longer match
                  // the new context and would mix into the new level's form.
                  if ((val as string) === edu.educationLevel) return;
                  updateEducation(i, resetEducationEntryForLevel(val as string));
                }}
                placeholder="Select education level for this entry"
                required
              />

              <ServerSuggestionInput
                label="Institution"
                placeholder={
                  edu.educationLevel === 'TENTH' || edu.educationLevel === 'TWELFTH'
                    ? 'e.g. Delhi Public School'
                    : 'e.g. IIT Bombay'
                }
                value={edu.institution}
                onChange={(val) => updateEducation(i, { institution: val })}
                category={
                  edu.educationLevel === 'TENTH' || edu.educationLevel === 'TWELFTH'
                    ? 'school'
                    : 'institution'
                }
                required
              />

              <div className="grid gap-3 sm:grid-cols-2">
                {edu.educationLevel === 'TENTH' || edu.educationLevel === 'TWELFTH' ? (
                  <Select
                    label="Board"
                    options={BOARD_OPTIONS}
                    value={edu.degree}
                    onChange={(val) =>
                      updateEducation(i, {
                        degree: val as string,
                        boardState: val === 'STATE_BOARD' ? edu.boardState : undefined,
                      })
                    }
                    placeholder="Select board"
                    required
                  />
                ) : (
                  <ServerSuggestionInput
                    label="Degree"
                    placeholder="e.g. B.Tech"
                    value={edu.degree}
                    onChange={(val) => updateEducation(i, { degree: val })}
                    category="degree"
                    required
                  />
                )}
                {edu.educationLevel === 'TENTH' ? (
                  <Select
                    label="Medium"
                    options={STREAM_OPTIONS}
                    value={edu.field}
                    onChange={(val) => updateEducation(i, { field: val as string })}
                    placeholder="Select medium (optional)"
                  />
                ) : edu.educationLevel === 'TWELFTH' ? (
                  <Select
                    label="Stream"
                    options={STREAM_OPTIONS}
                    value={edu.field}
                    onChange={(val) => updateEducation(i, { field: val as string })}
                    placeholder="Select stream"
                    required
                  />
                ) : (
                  <ServerSuggestionInput
                    label="Field of Study"
                    placeholder="e.g. Computer Science"
                    value={edu.field}
                    onChange={(val) => updateEducation(i, { field: val })}
                    category="field_of_study"
                    required
                  />
                )}
              </div>

              {edu.degree === 'STATE_BOARD' && (
                <Select
                  label="State"
                  options={STATE_OPTIONS}
                  value={edu.boardState || ''}
                  onChange={(val) => updateEducation(i, { boardState: val as string })}
                  placeholder="Select state"
                  required
                />
              )}

              {edu.educationLevel !== 'TENTH' && edu.educationLevel !== 'TWELFTH' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Course Type"
                    options={COURSE_TYPE_OPTIONS}
                    value={edu.courseType || ''}
                    onChange={(val) =>
                      updateEducation(i, { courseType: val as EducationEntry['courseType'] })
                    }
                    placeholder="Select course type"
                  />
                  <ServerSuggestionInput
                    category="field_of_study"
                    label="Specialization"
                    placeholder="e.g. Data Science"
                    value={edu.specialization || ''}
                    onChange={(val) => updateEducation(i, { specialization: val })}
                  />
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <DatePicker
                  label="Start Date"
                  mode="month"
                  value={edu.startDate}
                  onChange={(val) => updateEducation(i, { startDate: val })}
                />
                <DatePicker
                  label="End Date"
                  mode="month"
                  value={edu.endDate || ''}
                  onChange={(val) => updateEducation(i, { endDate: val })}
                />
                <Input
                  label="Grade / CGPA"
                  placeholder="e.g. 8.5 / 10"
                  value={edu.grade || ''}
                  onChange={(e) => updateEducation(i, { grade: e.target.value })}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Grade Type"
                  options={GRADE_TYPE_OPTIONS}
                  value={edu.gradeType || ''}
                  onChange={(val) =>
                    updateEducation(i, { gradeType: val as EducationEntry['gradeType'] })
                  }
                  placeholder="Select grade type"
                />
                <Input
                  label="Activities"
                  placeholder="e.g. Student Council, Sports"
                  value={edu.activities || ''}
                  onChange={(e) => updateEducation(i, { activities: e.target.value })}
                />
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            onClick={() => updateData({ education: [...data.education, emptyEducation()] })}
            leftIcon={<Plus className="h-4 w-4" />}
            tooltip="Add education entry"
          >
            Add Education
          </Button>
        </div>
      );
    }

    // ===================================================================
    // Step 7 - Skills
    // ===================================================================
    if (currentKey === 'skills') {
      return (
        <div className="space-y-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
              <Code className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Skills</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Add your technical and professional skills
              </p>
            </div>
          </div>

          {/* Quick-add skill tags */}
          <div>
            <ServerSuggestionInput
              label="Add Skills"
              placeholder="Type a skill and press Enter..."
              value={skillInput}
              onChange={setSkillInput}
              category="skill"
              onSelect={(val) => addSkill(val)}
              required
              helperText="Select from suggestions or type and press Enter"
            />
            {/* Handle enter key to add custom skill */}
            <div className="mt-1">
              {skillInput.trim() && (
                <Tooltip content="Add custom skill">
                  <button
                    type="button"
                    onClick={() => addSkill(skillInput)}
                    className="text-primary cursor-pointer text-xs hover:underline"
                  >
                    + Add &ldquo;{skillInput.trim()}&rdquo;
                  </button>
                </Tooltip>
              )}
            </div>
          </div>

          {data.skills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.skills.map((skill) => (
                <Tag
                  key={skill}
                  label={skill}
                  variant="primary"
                  onRemove={() => updateData({ skills: data.skills.filter((s) => s !== skill) })}
                />
              ))}
            </div>
          )}

          {/* Skills with Proficiency */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">
              Skills with Proficiency (Optional)
            </h3>
            <p className="mb-4 text-xs text-[var(--text-muted)]">
              Rate your proficiency for key skills to help employers understand your expertise.
            </p>

            {data.skillsWithProficiency.map((sp, i) => (
              <div key={i} className="mb-3 space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Skill {i + 1}</h4>
                  <Tooltip content="Remove entry">
                    <button
                      type="button"
                      onClick={() => removeSkillWithProf(i)}
                      className="cursor-pointer text-[var(--error)] transition-colors hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <ServerSuggestionInput
                    label="Skill Name"
                    placeholder="e.g. React"
                    value={sp.skill}
                    onChange={(val) => updateSkillWithProf(i, { skill: val })}
                    category="skill"
                  />
                  <Select
                    label="Proficiency"
                    options={SKILL_PROFICIENCY_OPTIONS}
                    value={sp.proficiency}
                    onChange={(val) =>
                      updateSkillWithProf(i, {
                        proficiency: val as SkillWithProficiency['proficiency'],
                      })
                    }
                    placeholder="Select level"
                  />
                  <Input
                    label="Years of Experience"
                    type="number"
                    min={0}
                    max={50}
                    value={sp.yearsOfExperience ?? ''}
                    onChange={(e) =>
                      updateSkillWithProf(i, { yearsOfExperience: Number(e.target.value) || 0 })
                    }
                    placeholder="e.g. 3"
                  />
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                updateData({
                  skillsWithProficiency: [
                    ...data.skillsWithProficiency,
                    emptySkillWithProficiency(),
                  ],
                })
              }
              leftIcon={<Plus className="h-4 w-4" />}
              tooltip="Add rated skill"
            >
              Add Skill with Proficiency
            </Button>
          </div>

          {/* IT Skills */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">IT Skills (Optional)</h3>
            <p className="mb-4 text-xs text-[var(--text-muted)]">
              Add specific IT technologies with version and experience details.
            </p>

            {data.itSkills.map((it, i) => (
              <div key={i} className="mb-3 space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">IT Skill {i + 1}</h4>
                  <Tooltip content="Remove entry">
                    <button
                      type="button"
                      onClick={() => removeITSkill(i)}
                      className="cursor-pointer text-[var(--error)] transition-colors hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ServerSuggestionInput
                    label="Technology"
                    placeholder="e.g. React"
                    value={it.technology}
                    onChange={(val) => updateITSkill(i, { technology: val })}
                    category="skill"
                  />
                  <Input
                    label="Version"
                    placeholder="e.g. 18.x"
                    value={it.version || ''}
                    onChange={(e) => updateITSkill(i, { version: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Experience (Years)"
                    type="number"
                    min={0}
                    max={50}
                    value={it.experienceYears ?? ''}
                    onChange={(e) =>
                      updateITSkill(i, { experienceYears: Number(e.target.value) || 0 })
                    }
                    placeholder="e.g. 3"
                  />
                  <Select
                    label="Proficiency"
                    options={SKILL_PROFICIENCY_OPTIONS}
                    value={it.proficiency || ''}
                    onChange={(val) =>
                      updateITSkill(i, { proficiency: val as ITSkillEntry['proficiency'] })
                    }
                    placeholder="Select level"
                  />
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => updateData({ itSkills: [...data.itSkills, emptyITSkill()] })}
              leftIcon={<Plus className="h-4 w-4" />}
              tooltip="Add IT skill entry"
            >
              Add IT Skill
            </Button>
          </div>
        </div>
      );
    }

    // ===================================================================
    // Step 8 - Certifications & Awards (optional)
    // ===================================================================
    if (currentKey === 'certifications') {
      return (
        <div className="space-y-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
              <Award className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Certifications & Awards</h2>
              <p className="text-sm text-[var(--text-muted)]">Showcase your accomplishments</p>
            </div>
          </div>

          {/* Certifications */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Certifications</h3>

            {data.certifications.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                No certifications added yet.
              </p>
            )}

            {data.certifications.map((cert, i) => (
              <div key={i} className="mb-3 space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Certification {i + 1}</h4>
                  <Tooltip content="Remove entry">
                    <button
                      type="button"
                      onClick={() => removeCertification(i)}
                      className="cursor-pointer text-[var(--error)] transition-colors hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <ServerSuggestionInput
                    label="Certification Name"
                    placeholder="e.g. AWS Solutions Architect"
                    value={cert.name}
                    onChange={(val) => updateCertification(i, { name: val })}
                    category="certification"
                    required
                  />
                  <ServerSuggestionInput
                    category="company"
                    label="Issuing Organization"
                    placeholder="e.g. Amazon Web Services"
                    value={cert.issuer}
                    onChange={(val) => updateCertification(i, { issuer: val })}
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
                  />
                </div>

                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cert.doesNotExpire || false}
                    onChange={(e) =>
                      updateCertification(i, {
                        doesNotExpire: e.target.checked,
                        expiryDate: e.target.checked ? '' : cert.expiryDate,
                      })
                    }
                    className="text-primary focus:ring-primary/20 h-4 w-4 rounded border-[var(--border)]"
                  />
                  <span className="text-sm text-[var(--text)]">
                    This certification does not expire
                  </span>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Credential ID"
                    placeholder="e.g. ABC123XYZ"
                    value={cert.credentialId || ''}
                    onChange={(e) => updateCertification(i, { credentialId: e.target.value })}
                  />
                  <Input
                    label="Credential URL"
                    placeholder="https://..."
                    value={cert.url || ''}
                    onChange={(e) => updateCertification(i, { url: e.target.value })}
                    leftIcon={<Globe className="h-4 w-4" />}
                  />
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                updateData({ certifications: [...data.certifications, emptyCertification()] })
              }
              leftIcon={<Plus className="h-4 w-4" />}
              tooltip="Add certification"
            >
              Add Certification
            </Button>
          </div>

          {/* Courses */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Courses Completed</h3>

            {data.courses.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                No courses added yet.
              </p>
            )}

            {data.courses.map((course, i) => (
              <div key={i} className="mb-3 space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Course {i + 1}</h4>
                  <Tooltip content="Remove entry">
                    <button
                      type="button"
                      onClick={() => removeCourse(i)}
                      className="cursor-pointer text-[var(--error)] transition-colors hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Course Name"
                    placeholder="e.g. Machine Learning Specialization"
                    value={course.name}
                    onChange={(e) => updateCourse(i, { name: e.target.value })}
                    required
                  />
                  <ServerSuggestionInput
                    category="company"
                    label="Provider"
                    placeholder="e.g. Coursera"
                    value={course.provider || ''}
                    onChange={(val) => updateCourse(i, { provider: val })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <DatePicker
                    label="Completion Date"
                    mode="month"
                    value={course.completionDate || ''}
                    onChange={(val) => updateCourse(i, { completionDate: val })}
                  />
                  <Input
                    label="URL"
                    placeholder="https://..."
                    value={course.url || ''}
                    onChange={(e) => updateCourse(i, { url: e.target.value })}
                    leftIcon={<Globe className="h-4 w-4" />}
                  />
                  <Input
                    label="Associated With"
                    placeholder="e.g. Stanford University"
                    value={course.associatedWith || ''}
                    onChange={(e) => updateCourse(i, { associatedWith: e.target.value })}
                  />
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => updateData({ courses: [...data.courses, emptyCourse()] })}
              leftIcon={<Plus className="h-4 w-4" />}
              tooltip="Add course entry"
            >
              Add Course
            </Button>
          </div>

          {/* Test Scores */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Test Scores</h3>

            {data.testScores.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                No test scores added yet.
              </p>
            )}

            {data.testScores.map((ts, i) => (
              <div key={i} className="mb-3 space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Test Score {i + 1}</h4>
                  <Tooltip content="Remove entry">
                    <button
                      type="button"
                      onClick={() => removeTestScore(i)}
                      className="cursor-pointer text-[var(--error)] transition-colors hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ServerSuggestionInput
                    label="Test Name"
                    placeholder="e.g. GRE"
                    value={ts.testName}
                    onChange={(val) => updateTestScore(i, { testName: val })}
                    category="test_score"
                    required
                  />
                  <Input
                    label="Score"
                    placeholder="e.g. 320/340"
                    value={ts.score}
                    onChange={(e) => updateTestScore(i, { score: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DatePicker
                    label="Date of Exam"
                    mode="month"
                    value={ts.dateOfExam || ''}
                    onChange={(val) => updateTestScore(i, { dateOfExam: val })}
                  />
                  <Input
                    label="Associated With"
                    placeholder="e.g. MS Applications"
                    value={ts.associatedWith || ''}
                    onChange={(e) => updateTestScore(i, { associatedWith: e.target.value })}
                  />
                </div>
                <Textarea
                  label="Description"
                  placeholder="Additional details about the score..."
                  value={ts.description || ''}
                  onChange={(e) => updateTestScore(i, { description: e.target.value })}
                  rows={2}
                />
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => updateData({ testScores: [...data.testScores, emptyTestScore()] })}
              leftIcon={<Plus className="h-4 w-4" />}
              tooltip="Add test score"
            >
              Add Test Score
            </Button>
          </div>

          {/* Awards */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Awards & Achievements</h3>

            {data.awards.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                No awards added yet.
              </p>
            )}

            {data.awards.map((award, i) => (
              <div key={i} className="mb-3 space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Award {i + 1}</h4>
                  <Tooltip content="Remove entry">
                    <button
                      type="button"
                      onClick={() => removeAward(i)}
                      className="cursor-pointer text-[var(--error)] transition-colors hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Title"
                    placeholder="e.g. Employee of the Year"
                    value={award.title}
                    onChange={(e) => updateAward(i, { title: e.target.value })}
                    required
                  />
                  <Input
                    label="Issued By"
                    placeholder="e.g. Google"
                    value={award.issuer || ''}
                    onChange={(e) => updateAward(i, { issuer: e.target.value })}
                  />
                </div>

                <DatePicker
                  label="Date"
                  mode="month"
                  value={award.date || ''}
                  onChange={(val) => updateAward(i, { date: val })}
                />

                <Textarea
                  label="Description"
                  placeholder="Briefly describe this award or achievement..."
                  value={award.description || ''}
                  onChange={(e) => updateAward(i, { description: e.target.value })}
                  rows={2}
                />
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => updateData({ awards: [...data.awards, emptyAward()] })}
              leftIcon={<Plus className="h-4 w-4" />}
              tooltip="Add award entry"
            >
              Add Award
            </Button>
          </div>

          {/* Languages (Quick List) */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">
              Languages <span className="text-[var(--text-muted)]">(Optional)</span>
            </h3>
            <p className="mb-3 text-xs text-[var(--text-muted)]">List languages you can speak</p>
            <ServerAutoSuggest
              category="language"
              placeholder="Search languages..."
              value={data.languages}
              onChange={(val) => updateData({ languages: val as string[] })}
              multiple
              allowCreate
              createLabel={(q) => `Add "${q}"`}
              maxSelections={20}
            />
          </div>

          {/* Language Proficiency (Detailed) */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">
              Language Proficiency (Detailed){' '}
              <span className="text-[var(--text-muted)]">(Optional)</span>
            </h3>

            {data.languageProficiency.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                No languages added yet.
              </p>
            )}

            {data.languageProficiency.map((lang, i) => (
              <div key={i} className="mb-3 space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Language {i + 1}</h4>
                  <Tooltip content="Remove entry">
                    <button
                      type="button"
                      onClick={() => removeLanguage(i)}
                      className="cursor-pointer text-[var(--error)] transition-colors hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <ServerSuggestionInput
                    label="Language"
                    placeholder="e.g. English"
                    value={lang.language}
                    onChange={(val) => updateLanguage(i, { language: val })}
                    category="language"
                    required
                  />
                  <Select
                    label="Proficiency"
                    options={LANGUAGE_PROFICIENCY_OPTIONS}
                    value={lang.proficiency}
                    onChange={(val) =>
                      updateLanguage(i, { proficiency: val as LanguageEntry['proficiency'] })
                    }
                    placeholder="Select proficiency"
                  />
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                updateData({ languageProficiency: [...data.languageProficiency, emptyLanguage()] })
              }
              leftIcon={<Plus className="h-4 w-4" />}
              tooltip="Add language entry"
            >
              Add Language
            </Button>
          </div>
        </div>
      );
    }

    // ===================================================================
    // Publications & Memberships (optional)
    // ===================================================================
    if (currentKey === 'publications') {
      return (
        <div className="space-y-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
              <BookOpen className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">
                Publications & Memberships
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                Add your publications, patents, and professional memberships
              </p>
            </div>
          </div>

          {/* Publications */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Publications</h3>

            {data.publications.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                No publications added yet.
              </p>
            )}

            {data.publications.map((pub, i) => (
              <div key={i} className="mb-3 space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Publication {i + 1}</h4>
                  <Tooltip content="Remove entry">
                    <button
                      type="button"
                      onClick={() => removePublication(i)}
                      className="cursor-pointer text-[var(--error)] transition-colors hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
                <Input
                  label="Title"
                  placeholder="e.g. A Study on Machine Learning"
                  value={pub.title}
                  onChange={(e) => updatePublication(i, { title: e.target.value })}
                  required
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <ServerSuggestionInput
                    label="Publisher"
                    placeholder="e.g. IEEE"
                    value={pub.publisher || ''}
                    onChange={(val) => updatePublication(i, { publisher: val })}
                    category="publisher"
                  />
                  <DatePicker
                    label="Publication Date"
                    mode="month"
                    value={pub.publicationDate || ''}
                    onChange={(val) => updatePublication(i, { publicationDate: val })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="URL"
                    placeholder="https://..."
                    value={pub.url || ''}
                    onChange={(e) => updatePublication(i, { url: e.target.value })}
                    leftIcon={<Globe className="h-4 w-4" />}
                  />
                  <Input
                    label="Authors"
                    placeholder="e.g. John Doe, Jane Smith"
                    value={pub.authors || ''}
                    onChange={(e) => updatePublication(i, { authors: e.target.value })}
                  />
                </div>
                <Textarea
                  label="Description"
                  placeholder="Brief description of the publication..."
                  value={pub.description || ''}
                  onChange={(e) => updatePublication(i, { description: e.target.value })}
                  rows={2}
                />
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                updateData({ publications: [...data.publications, emptyPublication()] })
              }
              leftIcon={<Plus className="h-4 w-4" />}
              tooltip="Add publication"
            >
              Add Publication
            </Button>
          </div>

          {/* Patents */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Patents</h3>

            {data.patents.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                No patents added yet.
              </p>
            )}

            {data.patents.map((pat, i) => (
              <div key={i} className="mb-3 space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Patent {i + 1}</h4>
                  <Tooltip content="Remove entry">
                    <button
                      type="button"
                      onClick={() => removePatent(i)}
                      className="cursor-pointer text-[var(--error)] transition-colors hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
                <Input
                  label="Title"
                  placeholder="e.g. Method for Efficient Data Processing"
                  value={pat.title}
                  onChange={(e) => updatePatent(i, { title: e.target.value })}
                  required
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    label="Patent Office"
                    placeholder="e.g. USPTO"
                    value={pat.patentOffice || ''}
                    onChange={(e) => updatePatent(i, { patentOffice: e.target.value })}
                  />
                  <Input
                    label="Patent Number"
                    placeholder="e.g. US1234567"
                    value={pat.patentNumber || ''}
                    onChange={(e) => updatePatent(i, { patentNumber: e.target.value })}
                  />
                  <Select
                    label="Status"
                    options={PATENT_STATUS_OPTIONS}
                    value={pat.status || ''}
                    onChange={(val) => updatePatent(i, { status: val as PatentEntry['status'] })}
                    placeholder="Select status"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DatePicker
                    label="Filing Date"
                    mode="month"
                    value={pat.filingDate || ''}
                    onChange={(val) => updatePatent(i, { filingDate: val })}
                  />
                  <DatePicker
                    label="Issue Date"
                    mode="month"
                    value={pat.issueDate || ''}
                    onChange={(val) => updatePatent(i, { issueDate: val })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="URL"
                    placeholder="https://..."
                    value={pat.url || ''}
                    onChange={(e) => updatePatent(i, { url: e.target.value })}
                    leftIcon={<Globe className="h-4 w-4" />}
                  />
                  <Input
                    label="Inventors"
                    placeholder="e.g. John Doe, Jane Smith"
                    value={pat.inventors || ''}
                    onChange={(e) => updatePatent(i, { inventors: e.target.value })}
                  />
                </div>
                <Textarea
                  label="Description"
                  placeholder="Brief description of the patent..."
                  value={pat.description || ''}
                  onChange={(e) => updatePatent(i, { description: e.target.value })}
                  rows={2}
                />
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => updateData({ patents: [...data.patents, emptyPatent()] })}
              leftIcon={<Plus className="h-4 w-4" />}
              tooltip="Add patent entry"
            >
              Add Patent
            </Button>
          </div>

          {/* Professional Memberships */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">
              Professional Memberships
            </h3>

            {data.professionalMemberships.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                No memberships added yet.
              </p>
            )}

            {data.professionalMemberships.map((mem, i) => (
              <div key={i} className="mb-3 space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Membership {i + 1}</h4>
                  <Tooltip content="Remove entry">
                    <button
                      type="button"
                      onClick={() => removeMembership(i)}
                      className="cursor-pointer text-[var(--error)] transition-colors hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ServerSuggestionInput
                    label="Organization"
                    placeholder="e.g. IEEE"
                    value={mem.organization}
                    onChange={(val) => updateMembership(i, { organization: val })}
                    category="professional_org"
                    required
                  />
                  <Input
                    label="Role"
                    placeholder="e.g. Member"
                    value={mem.role || ''}
                    onChange={(e) => updateMembership(i, { role: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <DatePicker
                    label="Start Date"
                    mode="month"
                    value={mem.startDate || ''}
                    onChange={(val) => updateMembership(i, { startDate: val })}
                  />
                  <DatePicker
                    label="End Date"
                    mode="month"
                    value={mem.endDate || ''}
                    onChange={(val) => updateMembership(i, { endDate: val })}
                  />
                  <Input
                    label="Membership ID"
                    placeholder="e.g. M-12345"
                    value={mem.membershipId || ''}
                    onChange={(e) => updateMembership(i, { membershipId: e.target.value })}
                  />
                </div>
                <Textarea
                  label="Description"
                  placeholder="Brief description of your involvement..."
                  value={mem.description || ''}
                  onChange={(e) => updateMembership(i, { description: e.target.value })}
                  rows={2}
                />
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                updateData({
                  professionalMemberships: [...data.professionalMemberships, emptyMembership()],
                })
              }
              leftIcon={<Plus className="h-4 w-4" />}
              tooltip="Add membership"
            >
              Add Membership
            </Button>
          </div>
        </div>
      );
    }

    // ===================================================================
    // Volunteering & References (optional)
    // ===================================================================
    if (currentKey === 'volunteering') {
      return (
        <div className="space-y-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
              <Heart className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">
                Volunteering & References
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                Showcase your community involvement and references
              </p>
            </div>
          </div>

          {/* Volunteer Experience */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Volunteer Experience</h3>

            {data.volunteerExperience.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                No volunteer experience added yet.
              </p>
            )}

            {data.volunteerExperience.map((vol, i) => (
              <div key={i} className="mb-3 space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Volunteer {i + 1}</h4>
                  <Tooltip content="Remove entry">
                    <button
                      type="button"
                      onClick={() => removeVolunteer(i)}
                      className="cursor-pointer text-[var(--error)] transition-colors hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ServerSuggestionInput
                    label="Organization"
                    placeholder="e.g. Red Cross"
                    value={vol.organization}
                    onChange={(val) => updateVolunteer(i, { organization: val })}
                    category="company"
                    required
                  />
                  <Input
                    label="Role"
                    placeholder="e.g. Volunteer Coordinator"
                    value={vol.role}
                    onChange={(e) => updateVolunteer(i, { role: e.target.value })}
                    required
                  />
                </div>
                <ServerSuggestionInput
                  label="Cause"
                  placeholder="e.g. Education"
                  value={vol.cause || ''}
                  onChange={(val) => updateVolunteer(i, { cause: val })}
                  category="volunteer_cause"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <DatePicker
                    label="Start Date"
                    mode="month"
                    value={vol.startDate || ''}
                    onChange={(val) => updateVolunteer(i, { startDate: val })}
                  />
                  <DatePicker
                    label="End Date"
                    mode="month"
                    value={vol.endDate || ''}
                    onChange={(val) => updateVolunteer(i, { endDate: val })}
                    disabled={vol.isCurrent}
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={vol.isCurrent || false}
                    onChange={(e) =>
                      updateVolunteer(i, {
                        isCurrent: e.target.checked,
                        endDate: e.target.checked ? '' : vol.endDate,
                      })
                    }
                    className="text-primary focus:ring-primary/20 h-4 w-4 rounded border-[var(--border)]"
                  />
                  <span className="text-sm text-[var(--text)]">I currently volunteer here</span>
                </label>
                <Textarea
                  label="Description"
                  placeholder="Describe your role and contributions..."
                  value={vol.description || ''}
                  onChange={(e) => updateVolunteer(i, { description: e.target.value })}
                  rows={2}
                />
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                updateData({ volunteerExperience: [...data.volunteerExperience, emptyVolunteer()] })
              }
              leftIcon={<Plus className="h-4 w-4" />}
              tooltip="Add volunteer entry"
            >
              Add Volunteer Experience
            </Button>
          </div>

          {/* References */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">References</h3>

            {data.references.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                No references added yet.
              </p>
            )}

            {data.references.map((ref, i) => (
              <div key={i} className="mb-3 space-y-3 rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-[var(--text)]">Reference {i + 1}</h4>
                  <Tooltip content="Remove entry">
                    <button
                      type="button"
                      onClick={() => removeReference(i)}
                      className="cursor-pointer text-[var(--error)] transition-colors hover:text-[var(--error-dark)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Name"
                    placeholder="e.g. John Smith"
                    value={ref.name}
                    onChange={(e) => updateReference(i, { name: e.target.value })}
                    required
                  />
                  <ServerSuggestionInput
                    category="role_category"
                    label="Designation"
                    placeholder="e.g. Engineering Manager"
                    value={ref.designation || ''}
                    onChange={(val) => updateReference(i, { designation: val })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ServerSuggestionInput
                    category="company"
                    label="Organization"
                    placeholder="e.g. Google"
                    value={ref.organization || ''}
                    onChange={(val) => updateReference(i, { organization: val })}
                  />
                  <Input
                    label="Relationship"
                    placeholder="e.g. Former Manager"
                    value={ref.relationship || ''}
                    onChange={(e) => updateReference(i, { relationship: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Email"
                    type="email"
                    placeholder="e.g. john@example.com"
                    value={ref.email || ''}
                    onChange={(e) => updateReference(i, { email: e.target.value })}
                    leftIcon={<Mail className="h-4 w-4" />}
                  />
                  <PhoneInput
                    label="Phone"
                    placeholder="9876xxxxxx"
                    value={ref.phone || ''}
                    onValueChange={(val) => updateReference(i, { phone: val })}
                  />
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => updateData({ references: [...data.references, emptyReference()] })}
              leftIcon={<Plus className="h-4 w-4" />}
              tooltip="Add reference"
            >
              Add Reference
            </Button>
          </div>
        </div>
      );
    }

    // ===================================================================
    // Step 9 - Job Preferences
    // ===================================================================
    if (currentKey === 'preferences') {
      return (
        <div className="space-y-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
              <Settings className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Job Preferences</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Let us know what you are looking for
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Preferred Job Type"
              options={JOB_TYPE_OPTIONS}
              value={data.preferredJobType}
              onChange={(val) => updateData({ preferredJobType: val })}
              multiple
              placeholder="Select job types"
              required
            />
            <Select
              label="Preferred Work Mode"
              options={WORK_MODE_OPTIONS}
              value={data.preferredWorkMode}
              onChange={(val) => updateData({ preferredWorkMode: val })}
              multiple
              placeholder="Select work modes"
            />
          </div>

          <Select
            label="Preferred Shift"
            options={SHIFT_TYPE_OPTIONS}
            value={data.preferredShift}
            onChange={(val) => updateData({ preferredShift: val })}
            placeholder="Select shift preference"
          />

          {/* Salary Expectations */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Salary Expectations</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Minimum (Annual)"
                type="number"
                min={0}
                value={data.expectedSalaryMin ?? ''}
                onChange={(e) =>
                  updateData({
                    expectedSalaryMin: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="e.g. 800000"
              />
              <Input
                label="Maximum (Annual)"
                type="number"
                min={0}
                value={data.expectedSalaryMax ?? ''}
                onChange={(e) =>
                  updateData({
                    expectedSalaryMax: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="e.g. 1500000"
              />
              <CurrencySelect
                label="Currency"
                value={data.salaryCurrency}
                onChange={(val) => updateData({ salaryCurrency: val })}
              />
            </div>
          </div>

          {/* Preferred Locations */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Preferred Locations</h3>
            <ServerSuggestionInput
              placeholder="Type a location and select..."
              value={locationInput}
              onChange={setLocationInput}
              category="location"
              onSelect={(val) => addPreferredLocation(val)}
              helperText="Select from suggestions or type and click add"
            />
            {locationInput.trim() && (
              <Tooltip content="Add custom location" className="mt-1">
                <button
                  type="button"
                  onClick={() => addPreferredLocation(locationInput)}
                  className="text-primary cursor-pointer text-xs hover:underline"
                >
                  + Add &ldquo;{locationInput.trim()}&rdquo;
                </button>
              </Tooltip>
            )}
            {data.preferredLocations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {data.preferredLocations.map((loc) => (
                  <Tag
                    key={loc}
                    label={loc}
                    variant="primary"
                    onRemove={() =>
                      updateData({
                        preferredLocations: data.preferredLocations.filter((l) => l !== loc),
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Preferred Industries */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Preferred Industries</h3>
            <ServerSuggestionInput
              placeholder="Type an industry and select..."
              value={industryInput}
              onChange={setIndustryInput}
              category="industry"
              onSelect={(val) => addPreferredIndustry(val)}
            />
            {industryInput.trim() && (
              <Tooltip content="Add custom industry" className="mt-1">
                <button
                  type="button"
                  onClick={() => addPreferredIndustry(industryInput)}
                  className="text-primary cursor-pointer text-xs hover:underline"
                >
                  + Add &ldquo;{industryInput.trim()}&rdquo;
                </button>
              </Tooltip>
            )}
            {data.preferredIndustries.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {data.preferredIndustries.map((ind) => (
                  <Tag
                    key={ind}
                    label={ind}
                    variant="primary"
                    onRemove={() =>
                      updateData({
                        preferredIndustries: data.preferredIndustries.filter((i) => i !== ind),
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Preferred Role Categories */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">
              Preferred Role Categories
            </h3>
            <ServerSuggestionInput
              placeholder="Type a role category and select..."
              value={roleCatInput}
              onChange={setRoleCatInput}
              category="role_category"
              onSelect={(val) => addPreferredRoleCategory(val)}
            />
            {roleCatInput.trim() && (
              <Tooltip content="Add custom role category" className="mt-1">
                <button
                  type="button"
                  onClick={() => addPreferredRoleCategory(roleCatInput)}
                  className="text-primary cursor-pointer text-xs hover:underline"
                >
                  + Add &ldquo;{roleCatInput.trim()}&rdquo;
                </button>
              </Tooltip>
            )}
            {data.preferredRoleCategories.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {data.preferredRoleCategories.map((rc) => (
                  <Tag
                    key={rc}
                    label={rc}
                    variant="primary"
                    onRemove={() =>
                      updateData({
                        preferredRoleCategories: data.preferredRoleCategories.filter(
                          (r) => r !== rc,
                        ),
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Blocked Companies — moved here from the removed 'documents' step
              so users can still express this preference during onboarding. */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Blocked Companies</h3>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Your profile will not be visible to these companies.
            </p>
            <ServerSuggestionInput
              placeholder="Type a company name and select..."
              value={blockedCompanyInput}
              onChange={setBlockedCompanyInput}
              category="company"
              onSelect={(val) => addBlockedCompany(val)}
            />
            {blockedCompanyInput.trim() && (
              <Tooltip content="Add blocked company" className="mt-1">
                <button
                  type="button"
                  onClick={() => addBlockedCompany(blockedCompanyInput)}
                  className="text-primary cursor-pointer text-xs hover:underline"
                >
                  + Add &ldquo;{blockedCompanyInput.trim()}&rdquo;
                </button>
              </Tooltip>
            )}
            {data.blockedCompanies.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {data.blockedCompanies.map((company) => (
                  <Tag
                    key={company}
                    label={company}
                    variant="primary"
                    onRemove={() =>
                      updateData({
                        blockedCompanies: data.blockedCompanies.filter((c) => c !== company),
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Availability & relocation hidden from onboarding — available in profile settings */}
        </div>
      );
    }

    // ===================================================================
    // Interests & Hobbies (optional)
    // ===================================================================
    if (currentKey === 'interests') {
      return (
        <div className="space-y-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
              <Heart className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Interests & Hobbies</h2>
              <p className="text-sm text-[var(--text-muted)]">Share your interests and hobbies</p>
            </div>
          </div>

          {/* Hobbies */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Hobbies</h3>
            <ServerSuggestionInput
              placeholder="Type a hobby and select..."
              value={hobbyInput}
              onChange={setHobbyInput}
              category="hobby"
              onSelect={(val) => addHobby(val)}
              helperText="Select from suggestions or type and click add"
            />
            {hobbyInput.trim() && (
              <Tooltip content="Add custom hobby" className="mt-1">
                <button
                  type="button"
                  onClick={() => addHobby(hobbyInput)}
                  className="text-primary cursor-pointer text-xs hover:underline"
                >
                  + Add &ldquo;{hobbyInput.trim()}&rdquo;
                </button>
              </Tooltip>
            )}
            {data.hobbies.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {data.hobbies.map((hobby) => (
                  <Tag
                    key={hobby}
                    label={hobby}
                    variant="primary"
                    onRemove={() =>
                      updateData({ hobbies: data.hobbies.filter((h) => h !== hobby) })
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Interests */}
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Interests</h3>
            <ServerSuggestionInput
              placeholder="Type an interest and select..."
              value={interestInput}
              onChange={setInterestInput}
              category="interest"
              onSelect={(val) => addInterest(val)}
              helperText="Select from suggestions or type and click add"
            />
            {interestInput.trim() && (
              <Tooltip content="Add custom interest" className="mt-1">
                <button
                  type="button"
                  onClick={() => addInterest(interestInput)}
                  className="text-primary cursor-pointer text-xs hover:underline"
                >
                  + Add &ldquo;{interestInput.trim()}&rdquo;
                </button>
              </Tooltip>
            )}
            {data.interests.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {data.interests.map((interest) => (
                  <Tag
                    key={interest}
                    label={interest}
                    variant="primary"
                    onRemove={() =>
                      updateData({ interests: data.interests.filter((i) => i !== interest) })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    // ===================================================================
    // Step 10 - Social Links (optional)
    // ===================================================================
    if (currentKey === 'social') {
      return (
        <div className="space-y-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
              <Globe className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Social Links</h2>
              <p className="text-sm text-[var(--text-muted)]">Help employers find you online</p>
            </div>
          </div>

          <Input
            label="LinkedIn Profile"
            placeholder="https://linkedin.com/in/yourprofile"
            value={data.linkedinProfile}
            onChange={(e) => updateData({ linkedinProfile: e.target.value })}
            leftIcon={<BrandIcon name="linkedin" className="h-4 w-4" />}
          />

          <Input
            label="GitHub Profile"
            placeholder="https://github.com/yourusername"
            value={data.githubProfile}
            onChange={(e) => updateData({ githubProfile: e.target.value })}
            leftIcon={<BrandIcon name="github" className="h-4 w-4" />}
          />

          <Input
            label="Portfolio Website"
            placeholder="https://yourportfolio.com"
            value={data.portfolioUrl}
            onChange={(e) => updateData({ portfolioUrl: e.target.value })}
            leftIcon={<Globe className="h-4 w-4" />}
          />

          <Input
            label="Stack Overflow Profile"
            placeholder="https://stackoverflow.com/users/yourid"
            value={data.stackOverflowProfile}
            onChange={(e) => updateData({ stackOverflowProfile: e.target.value })}
            leftIcon={<BrandIcon name="stackoverflow" className="h-4 w-4" />}
          />

          <Input
            label="X (Twitter) Profile"
            placeholder="https://x.com/yourhandle"
            value={data.twitterProfile}
            onChange={(e) => updateData({ twitterProfile: e.target.value })}
            leftIcon={<BrandIcon name="x" className="h-4 w-4" />}
          />

          <Input
            label="Personal Blog"
            placeholder="https://yourblog.com"
            value={data.personalBlogUrl}
            onChange={(e) => updateData({ personalBlogUrl: e.target.value })}
            leftIcon={<FileText className="h-4 w-4" />}
          />

          <Input
            label="Dribbble Profile"
            placeholder="https://dribbble.com/yourprofile"
            value={data.dribbbleProfile}
            onChange={(e) => updateData({ dribbbleProfile: e.target.value })}
            leftIcon={<BrandIcon name="dribbble" className="h-4 w-4" />}
          />

          <Input
            label="Behance Profile"
            placeholder="https://behance.net/yourprofile"
            value={data.behanceProfile}
            onChange={(e) => updateData({ behanceProfile: e.target.value })}
            leftIcon={<BrandIcon name="behance" className="h-4 w-4" />}
          />

          <Input
            label="Medium Profile"
            placeholder="https://medium.com/@yourprofile"
            value={data.mediumProfile}
            onChange={(e) => updateData({ mediumProfile: e.target.value })}
            leftIcon={<BrandIcon name="medium" className="h-4 w-4" />}
          />

          <Input
            label="YouTube Channel"
            placeholder="https://youtube.com/@yourchannel"
            value={data.youtubeChannel}
            onChange={(e) => updateData({ youtubeChannel: e.target.value })}
            leftIcon={<BrandIcon name="youtube" className="h-4 w-4" />}
          />
        </div>
      );
    }

    // ===================================================================
    // Step 11 - Review
    // ===================================================================
    if (currentKey === 'review') {
      const sectionClass = 'rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4';
      const sectionTitle =
        'flex items-center gap-1.5 text-sm font-semibold text-primary cursor-pointer hover:underline';
      const fieldLabel = 'text-xs font-medium text-[var(--text-muted)]';
      const fieldValue = 'text-sm text-[var(--text)]';

      return (
        <div className="space-y-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
              <Sparkles className="text-primary h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Review Your Profile</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Review your information before submitting. Click{' '}
                <Pencil className="mx-0.5 inline h-3 w-3" /> to edit any field.
              </p>
            </div>
          </div>

          {/* Profile Photo */}
          {avatarPreview && (
            <div className={sectionClass}>
              <Tooltip content="Edit profile photo">
                <button
                  type="button"
                  onClick={() => goToStepFromReview(2)}
                  className={sectionTitle}
                >
                  Profile Photo <Pencil className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <div className="mt-2 flex items-center gap-3">
                <img
                  src={avatarPreview}
                  alt="Profile photo"
                  className="h-16 w-16 rounded-full border border-[var(--border)] object-cover"
                />
                <span className="text-sm font-medium text-green-600">Photo uploaded</span>
              </div>
            </div>
          )}

          {/* Resume */}
          {(resumeUploaded || resumeFile.length > 0) &&
            (() => {
              const reviewFile = resumeFile[0] ?? null;
              const isReviewPdf = reviewFile?.type === 'application/pdf';
              const reviewBadge = reviewFile ? getFileTypeBadge(reviewFile) : null;
              return (
                <div className={sectionClass}>
                  <Tooltip content="Edit resume">
                    <button
                      type="button"
                      onClick={() => goToStepFromReview(3)}
                      className={sectionTitle}
                    >
                      Resume <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                  <div className="mt-2 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 text-[var(--text-muted)]" />
                      <span className="max-w-[200px] truncate text-sm text-[var(--text)]">
                        {reviewFile?.name || 'Resume uploaded'}
                      </span>
                      {reviewFile && (
                        <span className="text-xs text-[var(--text-muted)]">
                          ({formatFileSize(reviewFile.size)})
                        </span>
                      )}
                      {reviewBadge && (
                        <span
                          className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${reviewBadge.color}`}
                        >
                          {reviewBadge.label}
                        </span>
                      )}
                      {resumeUploaded && (
                        <span className="text-xs font-medium text-green-600">Uploaded</span>
                      )}
                      {resumeParseApplied && (
                        <span className="text-primary text-xs font-medium">AI data applied</span>
                      )}
                    </div>
                    {isReviewPdf && resumeUploaded && reviewFile && (
                      <>
                        <Tooltip content="Toggle resume preview">
                          <button
                            type="button"
                            onClick={() => setShowReviewResumePreview((prev) => !prev)}
                            className="text-primary inline-flex cursor-pointer items-center gap-1.5 text-xs hover:underline"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {showReviewResumePreview ? 'Hide preview' : 'Show preview'}
                          </button>
                        </Tooltip>
                        {showReviewResumePreview && (
                          <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                            <iframe
                              src={URL.createObjectURL(reviewFile)}
                              title="Resume Preview"
                              className="w-full border-0"
                              style={{ height: '400px' }}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

          {/* Personal Details */}
          <div className={sectionClass}>
            <Tooltip content="Edit personal details">
              <button type="button" onClick={() => goToStepFromReview(4)} className={sectionTitle}>
                Personal Details <Pencil className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div>
                <p className={fieldLabel}>DOB</p>
                <p className={fieldValue}>{data.dob || '--'}</p>
              </div>
              <div>
                <p className={fieldLabel}>Gender</p>
                <p className={fieldValue}>
                  {data.gender ? GENDER_LABELS[data.gender] || data.gender : '--'}
                </p>
              </div>
              <div>
                <p className={fieldLabel}>Marital Status</p>
                <p className={fieldValue}>
                  {data.maritalStatus
                    ? MARITAL_STATUS_LABELS[data.maritalStatus] || data.maritalStatus
                    : '--'}
                </p>
              </div>
              <div>
                <p className={fieldLabel}>Nationality</p>
                <p className={fieldValue}>{data.nationality || '--'}</p>
              </div>
              <div>
                <p className={fieldLabel}>Hometown</p>
                <p className={fieldValue}>{data.hometown || '--'}</p>
              </div>
              <div>
                <p className={fieldLabel}>Category</p>
                <p className={fieldValue}>
                  {data.category
                    ? RESERVATION_CATEGORY_LABELS[data.category] || data.category
                    : '--'}
                </p>
              </div>
              <div>
                <p className={fieldLabel}>City</p>
                <p className={fieldValue}>{data.city || '--'}</p>
              </div>
              <div>
                <p className={fieldLabel}>State</p>
                <p className={fieldValue}>{data.state || '--'}</p>
              </div>
              <div>
                <p className={fieldLabel}>Pincode</p>
                <p className={fieldValue}>{data.pincode || '--'}</p>
              </div>
              <div>
                <p className={fieldLabel}>Country</p>
                <p className={fieldValue}>{data.country || '--'}</p>
              </div>
            </div>
          </div>

          {/* Professional Summary */}
          <div className={sectionClass}>
            <Tooltip content="Edit professional summary">
              <button type="button" onClick={() => goToStepFromReview(5)} className={sectionTitle}>
                Professional Summary <Pencil className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <div className="mt-2 space-y-2">
              <div>
                <p className={fieldLabel}>Bio</p>
                <p className={`${fieldValue} line-clamp-3`}>{data.bio || '--'}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                {!isFresher && (
                  <>
                    <div>
                      <p className={fieldLabel}>Experience</p>
                      <p className={fieldValue}>
                        {data.experienceYears}y {data.totalExperienceMonths}m
                      </p>
                    </div>
                    <div>
                      <p className={fieldLabel}>Experience Level</p>
                      <p className={fieldValue}>
                        {data.experienceLevel
                          ? EXPERIENCE_LEVEL_LABELS[data.experienceLevel] || data.experienceLevel
                          : '--'}
                      </p>
                    </div>
                  </>
                )}
                {isFresher && (
                  <div>
                    <p className={fieldLabel}>Candidate Type</p>
                    <p className={fieldValue}>Fresher</p>
                  </div>
                )}
                <div>
                  <p className={fieldLabel}>Work Status</p>
                  <p className={fieldValue}>
                    {data.workStatus
                      ? WORK_STATUS_LABELS[data.workStatus] || data.workStatus
                      : '--'}
                  </p>
                </div>
                <div>
                  <p className={fieldLabel}>Open to Work</p>
                  <p className={fieldValue}>
                    {data.openToWork
                      ? OPEN_TO_WORK_LABELS[data.openToWork] || data.openToWork
                      : '--'}
                  </p>
                </div>
                <div>
                  <p className={fieldLabel}>Career Break</p>
                  <p className={fieldValue}>
                    {data.hasCareerBreak
                      ? data.careerBreakType
                        ? CAREER_BREAK_TYPE_LABELS[data.careerBreakType] || 'Yes'
                        : 'Yes'
                      : 'No'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Current Employment — Experienced + EMPLOYED only.
              Mirrors the same hide rule used by `isHidden('employment')`.
              Hidden for freshers, and for non-employed work statuses
              (Unemployed / Student / Freelancer) — there's no current
              job to summarise in those cases. */}
          {!isFresher && hasCurrentEmployment && (
            <div className={sectionClass}>
              <Tooltip content="Edit current employment">
                <button
                  type="button"
                  onClick={() => goToStepFromReview(6)}
                  className={sectionTitle}
                >
                  Current Employment <Pencil className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <p className={fieldLabel}>Company</p>
                  <p className={fieldValue}>{data.currentCompany || '--'}</p>
                </div>
                <div>
                  <p className={fieldLabel}>Role</p>
                  <p className={fieldValue}>{data.currentRole || '--'}</p>
                </div>
                <div>
                  <p className={fieldLabel}>Industry</p>
                  <p className={fieldValue}>{data.currentIndustry || '--'}</p>
                </div>
                <div>
                  <p className={fieldLabel}>Department</p>
                  <p className={fieldValue}>{data.currentDepartment || '--'}</p>
                </div>
                <div>
                  <p className={fieldLabel}>Functional Area</p>
                  <p className={fieldValue}>{data.functionalArea || '--'}</p>
                </div>
                <div>
                  <p className={fieldLabel}>Current Salary</p>
                  <p className={fieldValue}>
                    {data.currSalary
                      ? formatCurrency(data.currSalary, data.salaryCurrency || 'INR')
                      : '--'}
                  </p>
                </div>
                <div>
                  <p className={fieldLabel}>Notice Period</p>
                  <p className={fieldValue}>
                    {data.noticePeriod
                      ? NOTICE_PERIOD_LABELS[data.noticePeriod] || data.noticePeriod
                      : '--'}
                    {data.servingNoticePeriod && ' (Serving)'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Experience — Experienced only */}
          {!isFresher && (
            <div className={sectionClass}>
              <Tooltip content="Edit work experience">
                <button
                  type="button"
                  onClick={() => goToStepFromReview(7)}
                  className={sectionTitle}
                >
                  Work Experience <Pencil className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <p className="mt-2 text-sm text-[var(--text)]">
                {data.experience.length === 0
                  ? 'No experience entries added'
                  : `${data.experience.length} experience ${data.experience.length === 1 ? 'entry' : 'entries'} added`}
              </p>
              {data.experience.length > 0 && (
                <div className="mt-2 space-y-1">
                  {data.experience.map((exp, i) => (
                    <p key={i} className="text-xs text-[var(--text-secondary)]">
                      {exp.role} at {exp.company}
                      {exp.isCurrent ? ' (Current)' : ''}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Education */}
          <div className={sectionClass}>
            <Tooltip content="Edit education">
              <button type="button" onClick={() => goToStepFromReview(8)} className={sectionTitle}>
                Education <Pencil className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <p className={fieldLabel}>Highest Education Level</p>
                <p className={fieldValue}>
                  {data.highestEducationLevel
                    ? EDUCATION_LEVEL_LABELS[data.highestEducationLevel] ||
                      data.highestEducationLevel
                    : '--'}
                </p>
              </div>
              <div>
                <p className={fieldLabel}>Highest Degree</p>
                <p className={fieldValue}>
                  {data.highestDegree
                    ? SPECIFIC_DEGREE_LABELS[data.highestDegree] || data.highestDegree
                    : '--'}
                </p>
              </div>
            </div>
            <p className="mt-2 text-sm text-[var(--text)]">
              {data.education.length === 0
                ? 'No education entries added'
                : `${data.education.length} education ${data.education.length === 1 ? 'entry' : 'entries'} added`}
            </p>
            {data.education.length > 0 && (
              <div className="mt-2 space-y-1">
                {data.education.map((edu, i) => (
                  <p key={i} className="text-xs text-[var(--text-secondary)]">
                    {edu.educationLevel ? EDUCATION_LEVEL_LABELS[edu.educationLevel] + ': ' : ''}
                    {edu.degree}
                    {edu.field ? ` in ${edu.field}` : ''} from {edu.institution}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Skills */}
          <div className={sectionClass}>
            <Tooltip content="Edit skills">
              <button type="button" onClick={() => goToStepFromReview(9)} className={sectionTitle}>
                Skills <Pencil className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div>
                <p className={fieldLabel}>Skills</p>
                <p className={fieldValue}>
                  {data.skills.length > 0 ? `${data.skills.length} added` : '--'}
                </p>
              </div>
              <div>
                <p className={fieldLabel}>Skills with Proficiency</p>
                <p className={fieldValue}>
                  {data.skillsWithProficiency.length > 0
                    ? `${data.skillsWithProficiency.length} added`
                    : '--'}
                </p>
              </div>
              <div>
                <p className={fieldLabel}>IT Skills</p>
                <p className={fieldValue}>
                  {data.itSkills.length > 0 ? `${data.itSkills.length} added` : '--'}
                </p>
              </div>
            </div>
            {data.skills.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.skills.map((skill) => (
                  <Tag key={skill} label={skill} size="sm" variant="primary" />
                ))}
              </div>
            )}
          </div>

          {/* Preferences */}
          <div className={sectionClass}>
            <Tooltip content="Edit job preferences">
              <button type="button" onClick={() => goToStepFromReview(10)} className={sectionTitle}>
                Job Preferences <Pencil className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <p className={fieldLabel}>Job Types</p>
                <p className={fieldValue}>
                  {data.preferredJobType.length > 0
                    ? data.preferredJobType.map((t) => JOB_TYPE_LABELS[t] || t).join(', ')
                    : '--'}
                </p>
              </div>
              <div>
                <p className={fieldLabel}>Work Modes</p>
                <p className={fieldValue}>
                  {data.preferredWorkMode.length > 0
                    ? data.preferredWorkMode.map((m) => WORK_MODE_LABELS[m] || m).join(', ')
                    : '--'}
                </p>
              </div>
              <div>
                <p className={fieldLabel}>Preferred Shift</p>
                <p className={fieldValue}>
                  {data.preferredShift
                    ? SHIFT_TYPE_LABELS[data.preferredShift] || data.preferredShift
                    : '--'}
                </p>
              </div>
              <div>
                <p className={fieldLabel}>Salary Range</p>
                <p className={fieldValue}>
                  {data.expectedSalaryMin || data.expectedSalaryMax
                    ? `${data.salaryCurrency} ${data.expectedSalaryMin?.toLocaleString() || '0'} - ${data.expectedSalaryMax?.toLocaleString() || '0'}`
                    : '--'}
                </p>
              </div>
              <div>
                <p className={fieldLabel}>Preferred Locations</p>
                <p className={fieldValue}>
                  {data.preferredLocations.length > 0 ? data.preferredLocations.join(', ') : '--'}
                </p>
              </div>
              <div>
                <p className={fieldLabel}>Preferred Industries</p>
                <p className={fieldValue}>
                  {data.preferredIndustries.length > 0 ? data.preferredIndustries.join(', ') : '--'}
                </p>
              </div>
              <div>
                <p className={fieldLabel}>Preferred Roles</p>
                <p className={fieldValue}>
                  {data.preferredRoleCategories.length > 0
                    ? data.preferredRoleCategories.join(', ')
                    : '--'}
                </p>
              </div>
              {data.blockedCompanies.length > 0 && (
                <div className="sm:col-span-2">
                  <p className={fieldLabel}>Blocked Companies</p>
                  <p className={fieldValue}>{data.blockedCompanies.join(', ')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Social Links */}
          <div className={sectionClass}>
            <Tooltip content="Edit social links">
              <button type="button" onClick={() => goToStepFromReview(11)} className={sectionTitle}>
                Social Links <Pencil className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {[
                { label: 'LinkedIn', value: data.linkedinProfile },
                { label: 'GitHub', value: data.githubProfile },
                { label: 'Portfolio', value: data.portfolioUrl },
                { label: 'Stack Overflow', value: data.stackOverflowProfile },
                { label: 'Twitter / X', value: data.twitterProfile },
                { label: 'Blog', value: data.personalBlogUrl },
                { label: 'Dribbble', value: data.dribbbleProfile },
                { label: 'Behance', value: data.behanceProfile },
                { label: 'Medium', value: data.mediumProfile },
                { label: 'YouTube', value: data.youtubeChannel },
              ]
                .filter(({ value }) => value)
                .map(({ label, value }) => (
                  <div key={label}>
                    <p className={fieldLabel}>{label}</p>
                    <p className={`${fieldValue} truncate`}>{value}</p>
                  </div>
                ))}
              {!data.linkedinProfile &&
                !data.githubProfile &&
                !data.portfolioUrl &&
                !data.stackOverflowProfile &&
                !data.twitterProfile &&
                !data.personalBlogUrl &&
                !data.dribbbleProfile &&
                !data.behanceProfile &&
                !data.mediumProfile &&
                !data.youtubeChannel && (
                  <p className="col-span-2 text-sm text-[var(--text-muted)]">
                    No social links added
                  </p>
                )}
            </div>
          </div>
        </div>
      );
    }

    return null;
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const currentKey = STEPS[step].key;
  const isWelcome = currentKey === 'welcome';

  return (
    <OnboardingShell
      steps={visibleSteps}
      currentStep={currentVisibleStep}
      onNext={handleNext}
      onPrev={handlePrevSmart}
      onSkip={handleSkip}
      onGoToStep={handleGoToVisibleStep}
      isSubmitting={saveMutation.isPending || resumeMutation.isPending || avatarMutation.isPending}
      isLastStep={isLastStep}
      isFirstStep={isFirstStep}
      nextLabel={isWelcome ? "Let's Go!" : isLastStep ? 'Complete Setup' : 'Continue'}
      dashboardPath={ROUTES.CANDIDATE.DASHBOARD}
      title={isWelcome ? '' : STEPS[step].label}
      subtitle={
        isWelcome
          ? undefined
          : STEPS[step].optional
            ? 'This step is optional -- you can skip it'
            : undefined
      }
      editFromReview={editFromReview}
      onReturnToReview={returnToReview}
      highestVisitedStep={highestVisitedStep}
      canSkip={canSkip}
      // Help/contact strip lives in the shell's page-footer slot — below
      // the step card and nav buttons — instead of inside every step form.
      footer={<AuthSupportFooter pageContext="onboarding-candidate" audience="candidate" />}
    >
      {renderStepContent()}
    </OnboardingShell>
  );
}
