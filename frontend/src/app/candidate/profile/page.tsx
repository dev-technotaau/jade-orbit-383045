'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import {
  User,
  Briefcase,
  GraduationCap,
  Code,
  FileText,
  FileCheck,
  Globe,
  Save,
  Upload,
  Languages,
  Settings,
  Download,
  Eye,
  Sparkles,
  WandSparkles,
  Calendar,
  Loader2,
  FolderKanban,
  Brain,
  CheckCircle2,
  Award,
  BookOpen,
  Trophy,
  Users,
  Heart,
  Palette,
  XCircle,
  AlertTriangle,
  Lightbulb,
  ChevronRight,
  Check,
  X,
} from 'lucide-react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Card from '@/components/ui/Card';
import { confirmDialog } from '@/components/ui/dialog-service';
import Button from '@/components/ui/Button';
import ProgressBar from '@/components/ui/ProgressBar';
import FileUpload from '@/components/ui/FileUpload';
import Skeleton from '@/components/ui/Skeleton';
import { showToast } from '@/components/ui/Toast';
import Tooltip from '@/components/ui/Tooltip';
import { candidateService } from '@/services/candidate.service';
import { authService } from '@/services/auth.service';
import { formatFileSize } from '@/lib/utils';
import { getFileTypeBadge } from '@/utils/format';
import { QUERY_KEYS, FILE_LIMITS } from '@/constants/config';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/hooks/use-auth';
import { useAuthStore } from '@/store/auth.store';
import type { UpdateCandidateRequest, ResumeReadinessItem } from '@/types/candidate';
import type { ApiError } from '@/types/api';
import type { ParsedResumeData, ApplyableResumeFields } from '@/types/resume-parse';
import ResumeParseReview from '@/components/common/ResumeParseReview';
import ResumeTemplatePicker from '@/components/candidate/ResumeTemplatePicker';
import VerifiedBadge from '@/components/billing/VerifiedBadge';
import { useUpgradeModal } from '@/components/billing/UpgradeModal';
import { useEntitlements } from '@/hooks/use-entitlements';
import { ShieldCheck } from 'lucide-react';

import PersonalSection from '@/components/profile/PersonalSection';
import ExperienceSection from '@/components/profile/ExperienceSection';
import EducationSection from '@/components/profile/EducationSection';
import SkillsSection from '@/components/profile/SkillsSection';
import CertificationsSection from '@/components/profile/CertificationsSection';
import ProjectsSection from '@/components/profile/ProjectsSection';
import LanguagesSection from '@/components/profile/LanguagesSection';
import PreferencesSection from '@/components/profile/PreferencesSection';
import SocialSection from '@/components/profile/SocialSection';
import PublicationsSection from '@/components/profile/PublicationsSection';
import AwardsSection from '@/components/profile/AwardsSection';
import CoursesSection from '@/components/profile/CoursesSection';
import MembershipsSection from '@/components/profile/MembershipsSection';
import VolunteeringSection from '@/components/profile/VolunteeringSection';
import InterestsSection from '@/components/profile/InterestsSection';

type Section =
  | 'personal'
  | 'experience'
  | 'education'
  | 'skills'
  | 'certifications'
  | 'projects'
  | 'languages'
  | 'resume'
  | 'preferences'
  | 'social'
  | 'publications'
  | 'awards'
  | 'courses'
  | 'memberships'
  | 'volunteering'
  | 'interests';

const sections: { key: Section; label: string; icon: React.ElementType }[] = [
  { key: 'personal', label: 'Personal Info', icon: User },
  { key: 'experience', label: 'Experience', icon: Briefcase },
  { key: 'education', label: 'Education', icon: GraduationCap },
  { key: 'skills', label: 'Skills', icon: Code },
  { key: 'certifications', label: 'Certifications', icon: Award },
  { key: 'projects', label: 'Projects', icon: FolderKanban },
  { key: 'publications', label: 'Publications & Patents', icon: BookOpen },
  { key: 'awards', label: 'Awards', icon: Trophy },
  { key: 'courses', label: 'Courses & Tests', icon: GraduationCap },
  { key: 'memberships', label: 'Memberships', icon: Users },
  { key: 'volunteering', label: 'Volunteering & Refs', icon: Heart },
  { key: 'interests', label: 'Interests & Hobbies', icon: Palette },
  { key: 'languages', label: 'Languages', icon: Languages },
  { key: 'resume', label: 'Resume', icon: FileText },
  { key: 'preferences', label: 'Preferences', icon: Settings },
  { key: 'social', label: 'Social Links', icon: Globe },
];

export default function CandidateProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<Section>('personal');

  const handleSectionChange = (section: Section) => {
    setActiveSection(section);
    const url = new URL(window.location.href);
    url.searchParams.set('section', section);
    window.history.replaceState({}, '', url.toString());
  };

  const [form, setForm] = useState<UpdateCandidateRequest>({});
  const [formDirty, setFormDirty] = useState(false);
  const initialFormRef = useRef<string>('');
  const [resumeFile, setResumeFile] = useState<File[]>([]);
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [resumeParsing, setResumeParsing] = useState(false);
  const [resumeParsePolling, setResumeParsePolling] = useState(false);
  const [parsedResumeData, setParsedResumeData] = useState<ParsedResumeData | null>(null);
  const [resumeParseApplied, setResumeParseApplied] = useState(false);
  const [showUploadedResumePreview, setShowUploadedResumePreview] = useState(false);
  const [showResumePreview, setShowResumePreview] = useState(false);
  const [showActiveResumePreview, setShowActiveResumePreview] = useState(false);
  const [resumeTemplateId, setResumeTemplateId] = useState<string>('classic');

  const { data: profileData, isLoading } = useQuery({
    queryKey: QUERY_KEYS.CANDIDATES.PROFILE,
    queryFn: () => candidateService.getProfile(),
  });

  const { data: completenessData } = useQuery({
    queryKey: QUERY_KEYS.CANDIDATES.COMPLETENESS,
    queryFn: () => candidateService.getCompleteness(),
  });

  const { data: readinessData } = useQuery({
    queryKey: [...QUERY_KEYS.CANDIDATES.PROFILE, 'resume-readiness'],
    queryFn: () => candidateService.getResumeReadiness(),
    enabled: activeSection === 'resume',
  });

  const profile = profileData?.data;
  const completeness = completenessData?.data;
  const isFresher = profile?.experienceLevel === 'FRESHER';
  const visibleSections = isFresher ? sections.filter((s) => s.key !== 'experience') : sections;

  useEffect(() => {
    if (profile) {
      queueMicrotask(() => {
        const initial: UpdateCandidateRequest = {
          firstName: profile.user?.firstName || '',
          lastName: profile.user?.lastName || '',
          headline: profile.headline || '',
          pronouns: profile.pronouns || '',
          gender: profile.gender || undefined,
          dob: profile.dob || '',
          maritalStatus: profile.maritalStatus || undefined,
          nationality: profile.nationality || '',
          hometown: profile.hometown || '',
          category: profile.category || undefined,
          bio: profile.bio || '',
          videoResumeUrl: profile.videoResumeUrl || '',
          addressLine1: profile.addressLine1 || '',
          addressLine2: profile.addressLine2 || '',
          city: profile.city || '',
          state: profile.state || '',
          pincode: profile.pincode || '',
          country: profile.country || 'India',
          currentLocation: profile.currentLocation || '',
          preferredLocations: profile.preferredLocations || [],
          phone: profile.phone || '',
          alternatePhone: profile.alternatePhone || '',
          alternateEmail: profile.alternateEmail || '',
          experienceYears: profile.experienceYears || 0,
          totalExperienceMonths: profile.totalExperienceMonths || undefined,
          experienceLevel: profile.experienceLevel || undefined,
          currentCompany: profile.currentCompany || '',
          currentRole: profile.currentRole || '',
          currentIndustry: profile.currentIndustry || '',
          currentDepartment: profile.currentDepartment || '',
          functionalArea: profile.functionalArea || '',
          currSalary: profile.currSalary != null ? Number(profile.currSalary) : undefined,
          expectedSalaryMin:
            profile.expectedSalaryMin != null ? Number(profile.expectedSalaryMin) : undefined,
          expectedSalaryMax:
            profile.expectedSalaryMax != null ? Number(profile.expectedSalaryMax) : undefined,
          salaryCurrency: profile.salaryCurrency || 'INR',
          noticePeriod: profile.noticePeriod || undefined,
          servingNoticePeriod: profile.servingNoticePeriod || false,
          workStatus: profile.workStatus || undefined,
          hasCareerBreak: profile.hasCareerBreak || false,
          careerBreakType: profile.careerBreakType || undefined,
          careerBreakReason: profile.careerBreakReason || '',
          openToWork: profile.openToWork || undefined,
          preferredJobType: profile.preferredJobType || [],
          preferredWorkMode: profile.preferredWorkMode || [],
          preferredShift: profile.preferredShift || undefined,
          preferredIndustries: profile.preferredIndustries || [],
          preferredRoleCategories: profile.preferredRoleCategories || [],
          dateOfAvailability: profile.dateOfAvailability || '',
          willingToRelocate: profile.willingToRelocate || false,
          travelWillingnessPercent: profile.travelWillingnessPercent || undefined,
          highestEducationLevel: profile.highestEducationLevel || undefined,
          highestDegree: profile.highestDegree || undefined,
          visaStatus: profile.visaStatus || '',
          workPermitStatus: profile.workPermitStatus || '',
          passportNumber: profile.passportNumber || '',
          passportExpiryDate: profile.passportExpiryDate || '',
          hasDrivingLicense: profile.hasDrivingLicense || false,
          drivingLicenseType: profile.drivingLicenseType || undefined,
          ownVehicle: profile.ownVehicle || false,
          isVeteran: profile.isVeteran || false,
          blockedCompanies: profile.blockedCompanies || [],
          skills: profile.skills || [],
          itSkills: profile.itSkills || [],
          education: profile.education || [],
          experience: profile.experience || [],
          certifications: profile.certifications || [],
          projects: profile.projects || [],
          publications: profile.publications || [],
          patents: profile.patents || [],
          awards: profile.awards || [],
          volunteerExperience: profile.volunteerExperience || [],
          professionalMemberships: profile.professionalMemberships || [],
          courses: profile.courses || [],
          testScores: profile.testScores || [],
          references: profile.references || [],
          languageProficiency: profile.languageProficiency || [],
          skillsWithProficiency: profile.skillsWithProficiency || [],
          interests: profile.interests || [],
          hobbies: profile.hobbies || [],
          languages: profile.languages || [],
          isPhysicallyChallenged: profile.isPhysicallyChallenged || false,
          disabilityType: profile.disabilityType || undefined,
          disabilityPercentage: profile.disabilityPercentage || undefined,
          githubProfile: profile.githubProfile || '',
          linkedinProfile: profile.linkedinProfile || '',
          portfolioUrl: profile.portfolioUrl || '',
          stackOverflowProfile: profile.stackOverflowProfile || '',
          twitterProfile: profile.twitterProfile || '',
          personalBlogUrl: profile.personalBlogUrl || '',
          dribbbleProfile: profile.dribbbleProfile || '',
          behanceProfile: profile.behanceProfile || '',
          mediumProfile: profile.mediumProfile || '',
          youtubeChannel: profile.youtubeChannel || '',
        };
        initialFormRef.current = JSON.stringify(initial);
        setFormDirty(false);
        setForm(initial);
      });
    }
  }, [profile]);

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

  const updateMutation = useMutation({
    mutationFn: (data: UpdateCandidateRequest) => candidateService.updateProfile(data),
    onSuccess: () => {
      setFormDirty(false);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.PROFILE });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.COMPLETENESS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.DASHBOARD });
      showToast.success('Profile updated successfully!');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to update profile');
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (file: File) => candidateService.uploadResume(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.PROFILE });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.COMPLETENESS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.DASHBOARD });
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to upload resume');
    },
  });

  const generateResumeMutation = useMutation({
    mutationFn: () => candidateService.generateResume(resumeTemplateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.PROFILE });
      setShowResumePreview(true);
      showToast.success('Resume generated and saved!');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to generate resume');
    },
  });

  const useGeneratedResumeMutation = useMutation({
    mutationFn: () => candidateService.useGeneratedResume(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.PROFILE });
      showToast.success('Generated resume set as your profile resume!');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to set resume');
    },
  });

  const deleteResumeMutation = useMutation({
    mutationFn: (type: 'uploaded' | 'generated' | 'both' = 'both') =>
      candidateService.deleteResume(type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CANDIDATES.PROFILE });
      setShowUploadedResumePreview(false);
      setShowResumePreview(false);
      setShowActiveResumePreview(false);
      showToast.success('Resume deleted successfully!');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to delete resume');
    },
  });

  const parseResumeMutation = useMutation({
    mutationFn: () => candidateService.parseResume(),
    onSuccess: () => {
      setResumeParsePolling(true);
    },
    onError: () => {
      showToast.error('Resume parsing failed. Please try again.');
      setResumeParsing(false);
    },
  });

  const { data: polledParsedData } = useQuery({
    queryKey: [...QUERY_KEYS.CANDIDATES.PARSED_RESUME, 'upload-polling'],
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

  // 60-second polling timeout
  useEffect(() => {
    if (!resumeParsePolling) return;
    const timeout = setTimeout(() => {
      setResumeParsePolling(false);
      setResumeParsing(false);
      showToast.error(
        'Resume parsing is taking longer than expected. Try again from the AI Parser section.',
      );
    }, 60000);
    return () => clearTimeout(timeout);
  }, [resumeParsePolling]);

  const updateField = <K extends keyof UpdateCandidateRequest>(
    key: K,
    value: UpdateCandidateRequest[K],
  ) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      setFormDirty(JSON.stringify(next) !== initialFormRef.current);
      return next;
    });
  };

  const handleSave = async () => {
    // Update name on the User model if changed
    const { user } = useAuthStore.getState();
    const nameChanged =
      form.firstName !== (user?.firstName || '') || form.lastName !== (user?.lastName || '');
    if (nameChanged && form.firstName?.trim() && form.lastName?.trim()) {
      try {
        const res = await authService.updateProfile({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
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

    // Update candidate profile
    const { firstName: _fn, lastName: _ln, ...profileFields } = form;
    const payload = {
      ...profileFields,
      dob: form.dob ? new Date(form.dob).toISOString() : undefined,
      dateOfAvailability: form.dateOfAvailability
        ? new Date(form.dateOfAvailability).toISOString()
        : undefined,
      passportExpiryDate: form.passportExpiryDate
        ? new Date(form.passportExpiryDate).toISOString()
        : undefined,
      // Prisma Decimal fields serialize as strings — coerce back to numbers for Zod
      currSalary: profileFields.currSalary != null ? Number(profileFields.currSalary) : undefined,
      expectedSalaryMin:
        profileFields.expectedSalaryMin != null
          ? Number(profileFields.expectedSalaryMin)
          : undefined,
      expectedSalaryMax:
        profileFields.expectedSalaryMax != null
          ? Number(profileFields.expectedSalaryMax)
          : undefined,
    };
    updateMutation.mutate(payload);
  };

  const handleUploadOnly = useCallback(async () => {
    if (resumeFile.length === 0) return;
    try {
      await resumeMutation.mutateAsync(resumeFile[0]);
      setResumeUploaded(true);
      showToast.success('Resume uploaded successfully!');
    } catch {
      // Error handled by mutation onError
    }
  }, [resumeFile, resumeMutation]);

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
    }
  }, [resumeFile, resumeMutation, parseResumeMutation]);

  const handleParseOnly = useCallback(() => {
    setResumeParsing(true);
    setParsedResumeData(null);
    setResumeParseApplied(false);
    parseResumeMutation.mutate();
  }, [parseResumeMutation]);

  const handleApplyParsedFields = useCallback(
    (fields: Partial<ApplyableResumeFields>) => {
      // ApplyableResumeFields keys match UpdateCandidateRequest keys
      // 1:1 — INCLUDING firstName/lastName. Although those two live
      // on the User record (not the CandidateProfile), the profile
      // form treats them as first-class fields: PersonalSection has
      // input bindings for `form.firstName`/`form.lastName`, and
      // handleSave detects when they differ from the cached User and
      // pushes the diff to authService.updateProfile.
      //
      // Earlier this handler dispatched authService.updateProfile
      // *immediately* and excluded firstName/lastName from the
      // form-state spread. That caused a regression: the parsed name
      // hit the User record via the immediate call, but the form
      // inputs kept the old name. When the user clicked Save, the
      // nameChanged check (form.firstName vs user.firstName) found a
      // mismatch and overwrote the just-applied name back to the
      // stale form value. Net effect: the parsed name disappeared.
      //
      // Spread everything into form state instead — same path as
      // every other field — and let Save persist it.
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined || v === null) continue;
        updateField(k as keyof UpdateCandidateRequest, v as never);
      }
      setResumeParseApplied(true);
      showToast.success("Parsed data applied to profile! Don't forget to save your changes.");
    },
    [updateField],
  );

  if (isLoading) {
    return (
      <DashboardLayout requiredRole={['CANDIDATE']}>
        <div className="space-y-6">
          <Skeleton variant="rect" height={60} />
          <div className="grid gap-6 lg:grid-cols-4">
            <Skeleton variant="rect" height={300} />
            <div className="lg:col-span-3">
              <Skeleton variant="text" lines={10} />
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout requiredRole={['CANDIDATE']}>
      <CandidateProfilePremiumBanner />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-[var(--text)]">My Profile</h1>
              <VerifiedBadge isOwnProfile size="md" />
            </div>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Keep your profile updated to get better job matches
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={ROUTES.CANDIDATE.PROFILE_PREVIEW}>
              <Button variant="outline" tooltip="Preview your profile as an employer">
                <Eye className="mr-1.5 h-4 w-4" /> Preview as Employer
              </Button>
            </Link>
            <Button
              onClick={handleSave}
              isLoading={updateMutation.isPending}
              disabled={!formDirty}
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

        <div className="grid gap-6 lg:grid-cols-4">
          {/* Sidebar Nav */}
          <div className="lg:col-span-1">
            <Card padding="sm">
              <nav className="space-y-1">
                {visibleSections.map(({ key, label, icon: Icon }) => (
                  <Tooltip key={key} content={`Go to ${label} section`} className="w-full">
                    <button
                      type="button"
                      onClick={() => handleSectionChange(key)}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        activeSection === key
                          ? 'bg-primary-light text-primary'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text)]'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  </Tooltip>
                ))}
              </nav>
            </Card>
          </div>

          {/* Content */}
          <div className="space-y-6 lg:col-span-3">
            {activeSection === 'personal' && (
              <PersonalSection form={form} updateField={updateField} profile={profile} />
            )}

            {activeSection === 'experience' && !isFresher && (
              <ExperienceSection form={form} updateField={updateField} />
            )}

            {activeSection === 'education' && (
              <EducationSection form={form} updateField={updateField} />
            )}

            {activeSection === 'skills' && <SkillsSection form={form} updateField={updateField} />}

            {activeSection === 'certifications' && (
              <CertificationsSection form={form} updateField={updateField} />
            )}

            {activeSection === 'projects' && (
              <ProjectsSection form={form} updateField={updateField} />
            )}

            {activeSection === 'publications' && (
              <PublicationsSection form={form} updateField={updateField} />
            )}

            {activeSection === 'awards' && <AwardsSection form={form} updateField={updateField} />}

            {activeSection === 'courses' && (
              <CoursesSection form={form} updateField={updateField} />
            )}

            {activeSection === 'memberships' && (
              <MembershipsSection form={form} updateField={updateField} />
            )}

            {activeSection === 'volunteering' && (
              <VolunteeringSection form={form} updateField={updateField} />
            )}

            {activeSection === 'interests' && (
              <InterestsSection form={form} updateField={updateField} />
            )}

            {activeSection === 'languages' && (
              <LanguagesSection form={form} updateField={updateField} />
            )}

            {activeSection === 'resume' && (
              <div className="space-y-6">
                {/* Active Profile Resume */}
                <Card
                  header={
                    <h2 className="text-lg font-semibold text-[var(--text)]">
                      Active Profile Resume
                    </h2>
                  }
                >
                  {profile?.resume ? (
                    (() => {
                      const isGenerated = profile.resume === profile.generatedResumeUrl;
                      const isPdf =
                        profile.resume.toLowerCase().endsWith('.pdf') ||
                        profile.resumeOriginalName?.toLowerCase().endsWith('.pdf');
                      return (
                        <div className="space-y-4">
                          <div className="flex items-start gap-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                            <div className="bg-primary/10 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg">
                              {isGenerated ? (
                                <WandSparkles className="text-primary h-6 w-6" />
                              ) : (
                                <FileText className="text-primary h-6 w-6" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold text-[var(--text)]">
                                  {profile.resumeOriginalName || 'Resume'}
                                </p>
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                    isGenerated
                                      ? 'border border-purple-200 bg-purple-50 text-purple-700'
                                      : 'border border-green-200 bg-green-50 text-green-700'
                                  }`}
                                >
                                  {isGenerated ? 'Generated' : 'Uploaded'}
                                </span>
                                {(() => {
                                  const badge = getFileTypeBadge(
                                    null,
                                    profile.resumeMimeType,
                                    profile.resumeOriginalName,
                                  );
                                  return (
                                    <span
                                      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${badge.color}`}
                                    >
                                      {badge.label}
                                    </span>
                                  );
                                })()}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                                {profile.resumeSize != null && (
                                  <>
                                    <span>{formatFileSize(profile.resumeSize)}</span>
                                    <span className="text-[var(--border)]">|</span>
                                  </>
                                )}
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3.5 w-3.5" />
                                  <span>
                                    {isGenerated ? 'Generated' : 'Uploaded'}{' '}
                                    {(() => {
                                      const dateStr = isGenerated
                                        ? profile.generatedResumeAt
                                        : profile.resumeUploadedAt || profile.updatedAt;
                                      return dateStr
                                        ? new Date(dateStr).toLocaleDateString('en-IN', {
                                            day: 'numeric',
                                            month: 'short',
                                            year: 'numeric',
                                          })
                                        : 'N/A';
                                    })()}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              {isPdf ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setShowActiveResumePreview((prev) => !prev)}
                                  tooltip={
                                    showActiveResumePreview
                                      ? 'Hide resume preview'
                                      : 'Preview your resume'
                                  }
                                >
                                  <Eye className="mr-1.5 h-4 w-4" />{' '}
                                  {showActiveResumePreview ? 'Hide Preview' : 'Preview'}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    window.open(profile.resume!, '_blank', 'noopener,noreferrer')
                                  }
                                  tooltip="Preview your resume"
                                >
                                  <Eye className="mr-1.5 h-4 w-4" /> Preview
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const link = document.createElement('a');
                                  link.href = profile.resume!;
                                  link.target = '_blank';
                                  link.rel = 'noopener noreferrer';
                                  link.click();
                                }}
                                tooltip="Download your resume"
                              >
                                <Download className="mr-1.5 h-4 w-4" /> Download
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  const confirmed = await confirmDialog({
                                    title: 'Delete resume',
                                    message: isGenerated
                                      ? 'Are you sure you want to delete your generated resume? This action cannot be undone.'
                                      : 'Are you sure you want to delete your resume? This action cannot be undone.',
                                    confirmLabel: 'Delete',
                                    variant: 'danger',
                                  });
                                  if (confirmed) {
                                    deleteResumeMutation.mutate(
                                      isGenerated ? 'generated' : 'uploaded',
                                    );
                                  }
                                }}
                                disabled={deleteResumeMutation.isPending}
                                className="text-[var(--error)] hover:bg-red-50 hover:text-[var(--error)]"
                                tooltip="Delete this resume"
                              >
                                <XCircle className="mr-1.5 h-4 w-4" /> Delete
                              </Button>
                            </div>
                          </div>

                          {/* Inline PDF Preview */}
                          {isPdf && showActiveResumePreview && (
                            <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                              <iframe
                                src={profile.resume}
                                title="Active Resume Preview"
                                className="w-full border-0"
                                style={{ height: '600px' }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] py-10">
                      <FileText className="mb-3 h-10 w-10 text-[var(--text-muted)]" />
                      <p className="text-sm font-medium text-[var(--text)]">
                        No resume uploaded yet
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Upload a resume or generate one from your profile data
                      </p>
                    </div>
                  )}
                </Card>

                {/* Upload / Replace Resume — 3-state UI */}
                <Card
                  id="upload-resume"
                  header={
                    <div className="flex items-center gap-3">
                      <div className="bg-primary-light flex h-9 w-9 items-center justify-center rounded-lg">
                        <Upload className="text-primary h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-[var(--text)]">Upload Resume</h2>
                        <p className="text-sm text-[var(--text-muted)]">
                          Upload your resume and optionally let AI extract your details
                        </p>
                      </div>
                    </div>
                  }
                >
                  <div className="space-y-4">
                    {/* State A: No file selected, not just uploaded */}
                    {!resumeUploaded && resumeFile.length === 0 && (
                      <>
                        <FileUpload
                          label="Resume (PDF, DOC, DOCX)"
                          accept={{
                            'application/pdf': ['.pdf'],
                            'application/msword': ['.doc'],
                            'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                              ['.docx'],
                          }}
                          maxSize={FILE_LIMITS.RESUME_MAX_SIZE}
                          onDrop={(files) => {
                            setResumeFile(files);
                            setResumeUploaded(false);
                            setParsedResumeData(null);
                            setResumeParseApplied(false);
                            setShowUploadedResumePreview(false);
                          }}
                          files={resumeFile}
                          onRemove={() => {
                            setResumeFile([]);
                            setResumeUploaded(false);
                            setParsedResumeData(null);
                            setResumeParseApplied(false);
                            setShowUploadedResumePreview(false);
                          }}
                          disabled={resumeMutation.isPending}
                        />
                        <p className="text-xs text-[var(--text-muted)]">
                          Max 5MB. Accepted formats: PDF, DOC, DOCX
                        </p>
                      </>
                    )}

                    {/* State B: File selected, not yet uploaded */}
                    {!resumeUploaded &&
                      resumeFile.length > 0 &&
                      (() => {
                        const selectedFile = resumeFile[0];
                        const typeBadge = getFileTypeBadge(selectedFile);
                        return (
                          <>
                            {/* File info card */}
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
                                  <span
                                    className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${typeBadge.color}`}
                                  >
                                    {typeBadge.label}
                                  </span>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setResumeFile([]);
                                  setParsedResumeData(null);
                                  setResumeParseApplied(false);
                                }}
                                tooltip="Remove selected file"
                              >
                                Remove
                              </Button>
                            </div>

                            {/* Action buttons */}
                            <div className="flex flex-wrap items-center gap-3">
                              <Button
                                onClick={handleUploadOnly}
                                isLoading={resumeMutation.isPending && !resumeParsing}
                                disabled={resumeParsing || resumeMutation.isPending}
                                tooltip="Upload resume without AI parsing"
                              >
                                <Upload className="mr-1.5 h-4 w-4" />
                                Upload Resume
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={handleUploadAndParse}
                                isLoading={resumeMutation.isPending && resumeParsing}
                                disabled={resumeParsing || resumeMutation.isPending}
                                tooltip="Upload and extract details using AI"
                              >
                                <WandSparkles className="mr-1.5 h-4 w-4" />
                                Upload & Parse with AI
                              </Button>
                            </div>
                          </>
                        );
                      })()}

                    {/* State C: File uploaded */}
                    {resumeUploaded &&
                      (() => {
                        const selectedFile = resumeFile[0] ?? null;
                        const isPdf = selectedFile?.type === 'application/pdf';
                        const typeBadge = selectedFile ? getFileTypeBadge(selectedFile) : null;
                        return (
                          <>
                            {/* Green success card */}
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
                                    onClick={() => setShowUploadedResumePreview((prev) => !prev)}
                                    tooltip={
                                      showUploadedResumePreview
                                        ? 'Hide resume preview'
                                        : 'Preview uploaded resume'
                                    }
                                  >
                                    <Eye className="mr-1.5 h-4 w-4" />
                                    {showUploadedResumePreview ? 'Hide' : 'Preview'}
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
                                    setShowUploadedResumePreview(false);
                                  }}
                                  tooltip="Replace with a different resume"
                                >
                                  Replace
                                </Button>
                              </div>
                            </div>

                            {/* Inline PDF preview */}
                            {isPdf && showUploadedResumePreview && selectedFile && (
                              <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                                <iframe
                                  src={URL.createObjectURL(selectedFile)}
                                  title="Resume Preview"
                                  className="w-full border-0"
                                  style={{ height: '500px' }}
                                />
                              </div>
                            )}

                            {/* Parse with AI button (only if not yet parsed/applied) */}
                            {!resumeParsing && !parsedResumeData && !resumeParseApplied && (
                              <Button
                                variant="secondary"
                                onClick={handleParseOnly}
                                tooltip="Extract profile details using AI"
                              >
                                <WandSparkles className="mr-1.5 h-4 w-4" />
                                Parse with AI
                              </Button>
                            )}

                            {/* Parsing spinner */}
                            {resumeParsing && !parsedResumeData && (
                              <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                                <div className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
                                <div>
                                  <p className="text-sm font-medium text-[var(--text)]">
                                    AI is analyzing your resume...
                                  </p>
                                  <p className="text-xs text-[var(--text-muted)]">
                                    This usually takes 10-30 seconds
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Parsed data review */}
                            {parsedResumeData && !resumeParseApplied && (
                              <ResumeParseReview
                                parsedData={parsedResumeData}
                                onApplyFields={handleApplyParsedFields}
                                onCancel={() => setParsedResumeData(null)}
                              />
                            )}

                            {/* Applied confirmation */}
                            {resumeParseApplied && (
                              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4">
                                <Sparkles className="h-5 w-5 text-green-600" />
                                <div>
                                  <p className="text-sm font-medium text-green-800">
                                    Resume data applied!
                                  </p>
                                  <p className="text-xs text-green-600">
                                    The extracted data has been applied to your profile fields.
                                    Don&apos;t forget to save your changes.
                                  </p>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                  </div>
                </Card>

                {/* AI Resume Parser — for parsing existing (already uploaded) resume */}
                {profile?.resume && !resumeUploaded && (
                  <div id="parse-resume">
                    <ResumeParserSection updateField={updateField} />
                  </div>
                )}

                {/* Last Generated Resume */}
                {profile?.generatedResumeUrl &&
                  (() => {
                    const isAlreadyActive = profile.resume === profile.generatedResumeUrl;
                    const hasUploadedResume = profile.resume && !isAlreadyActive;

                    return (
                      <Card
                        header={
                          <h2 className="text-lg font-semibold text-[var(--text)]">
                            Generated Resume
                          </h2>
                        }
                      >
                        <div className="space-y-4">
                          <div className="flex items-start gap-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                            <div className="bg-primary/10 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg">
                              <WandSparkles className="text-primary h-6 w-6" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-[var(--text)]">
                                  Generated Resume
                                </p>
                                {isAlreadyActive && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                                    <Check className="h-3 w-3" /> Active
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>
                                  Generated{' '}
                                  {profile.generatedResumeAt
                                    ? new Date(profile.generatedResumeAt).toLocaleDateString(
                                        'en-IN',
                                        {
                                          day: 'numeric',
                                          month: 'short',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        },
                                      )
                                    : 'N/A'}
                                </span>
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowResumePreview((prev) => !prev)}
                                tooltip={
                                  showResumePreview
                                    ? 'Hide generated resume preview'
                                    : 'Preview generated resume'
                                }
                              >
                                <Eye className="mr-1.5 h-4 w-4" />{' '}
                                {showResumePreview ? 'Hide Preview' : 'Preview'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const link = document.createElement('a');
                                  link.href = profile.generatedResumeUrl!;
                                  link.download = `${user?.firstName || 'candidate'}_resume.pdf`;
                                  link.target = '_blank';
                                  link.rel = 'noopener noreferrer';
                                  link.click();
                                }}
                                tooltip="Download generated resume as PDF"
                              >
                                <Download className="mr-1.5 h-4 w-4" /> Download
                              </Button>
                              {!isAlreadyActive && (
                                <Button
                                  size="sm"
                                  onClick={async () => {
                                    if (hasUploadedResume) {
                                      const confirmed = await confirmDialog({
                                        title: 'Use as profile resume',
                                        message:
                                          "This will replace your currently uploaded resume as the active profile resume. The uploaded file will still exist but won't be your active resume. Continue?",
                                        confirmLabel: 'Continue',
                                        variant: 'warning',
                                      });
                                      if (!confirmed) return;
                                    }
                                    useGeneratedResumeMutation.mutate();
                                  }}
                                  isLoading={useGeneratedResumeMutation.isPending}
                                  tooltip="Set this as your active profile resume"
                                >
                                  <Upload className="mr-1.5 h-4 w-4" /> Use as Profile Resume
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  const message = isAlreadyActive
                                    ? 'This is your active profile resume. Deleting it will remove it from your profile. Continue?'
                                    : 'Are you sure you want to delete this generated resume? This action cannot be undone.';
                                  const confirmed = await confirmDialog({
                                    title: 'Delete resume',
                                    message,
                                    confirmLabel: 'Delete',
                                    variant: 'danger',
                                  });
                                  if (confirmed) {
                                    deleteResumeMutation.mutate('generated');
                                  }
                                }}
                                disabled={deleteResumeMutation.isPending}
                                className="text-[var(--error)] hover:bg-red-50 hover:text-[var(--error)]"
                                tooltip="Delete this generated resume"
                              >
                                <X className="mr-1.5 h-4 w-4" /> Delete
                              </Button>
                            </div>
                          </div>

                          {/* Inline PDF Preview */}
                          {showResumePreview && (
                            <div className="overflow-hidden rounded-lg border border-[var(--border)]">
                              <iframe
                                src={profile.generatedResumeUrl}
                                title="Generated Resume Preview"
                                className="w-full border-0"
                                style={{ height: '600px' }}
                              />
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })()}

                {/* Generate Resume from Profile */}
                <Card
                  id="generate-resume"
                  header={
                    <h2 className="text-lg font-semibold text-[var(--text)]">Generate Resume</h2>
                  }
                >
                  <div className="space-y-4">
                    <p className="text-sm text-[var(--text-secondary)]">
                      Generate a professionally formatted PDF resume from your profile information.
                    </p>

                    {/* Readiness Status */}
                    {readinessData?.data &&
                      (() => {
                        const r = readinessData.data;
                        const sectionMap = Object.fromEntries(sections.map((s) => [s.key, s]));

                        const renderChips = (
                          items: ResumeReadinessItem[],
                          color: 'red' | 'amber' | 'blue',
                        ) => {
                          const colorClasses = {
                            red: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
                            amber: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
                            blue: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
                          }[color];
                          return (
                            <div className="flex flex-wrap gap-2">
                              {items.map((item) => {
                                const sec = sectionMap[item.section];
                                const Icon = sec?.icon || FileText;
                                return (
                                  <Tooltip
                                    key={item.field}
                                    content={`Go to ${item.section} section`}
                                  >
                                    <button
                                      onClick={() => handleSectionChange(item.section as Section)}
                                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${colorClasses}`}
                                    >
                                      <Icon className="h-3.5 w-3.5" />
                                      {item.message}
                                      <ChevronRight className="h-3 w-3 opacity-50" />
                                    </button>
                                  </Tooltip>
                                );
                              })}
                            </div>
                          );
                        };

                        return (
                          <div className="space-y-3">
                            {/* Status Banner */}
                            {r.canGenerate &&
                            r.warnings.length === 0 &&
                            r.suggestions.length === 0 ? (
                              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                                <CheckCircle2 className="h-4 w-4" /> Your profile is ready for
                                resume generation!
                              </div>
                            ) : r.canGenerate ? (
                              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-stone-900">
                                <AlertTriangle className="h-4 w-4" /> Resume can be generated, but
                                could be improved
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                                <XCircle className="h-4 w-4" /> Complete required fields before
                                generating
                              </div>
                            )}

                            {/* Errors */}
                            {r.errors.length > 0 && (
                              <div className="space-y-2 border-l-2 border-red-300 pl-4">
                                <p className="text-xs font-semibold tracking-wide text-red-600 uppercase">
                                  Required Information Missing
                                </p>
                                {renderChips(r.errors, 'red')}
                              </div>
                            )}

                            {/* Warnings */}
                            {r.warnings.length > 0 && (
                              <div className="space-y-2 border-l-2 border-amber-300 pl-4">
                                <p className="text-xs font-semibold tracking-wide text-amber-600 uppercase">
                                  Recommended for Better Resume
                                </p>
                                {renderChips(r.warnings, 'amber')}
                              </div>
                            )}

                            {/* Suggestions */}
                            {r.suggestions.length > 0 && (
                              <div className="space-y-2 border-l-2 border-blue-300 pl-4">
                                <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">
                                  Suggestions to Stand Out
                                </p>
                                {renderChips(r.suggestions, 'blue')}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                    <ResumeTemplatePicker value={resumeTemplateId} onChange={setResumeTemplateId} />

                    <Button
                      variant="outline"
                      onClick={() => generateResumeMutation.mutate()}
                      isLoading={generateResumeMutation.isPending}
                      disabled={readinessData?.data && !readinessData.data.canGenerate}
                      tooltip="Generate a PDF resume from your profile"
                      // Button already renders the loading spinner when
                      // isLoading is true (and swaps it for leftIcon when
                      // idle). Don't render a manual Loader2 in children —
                      // that produced two spinners side-by-side.
                      leftIcon={<WandSparkles className="h-4 w-4" />}
                    >
                      {generateResumeMutation.isPending
                        ? 'Generating...'
                        : 'Generate Resume from Profile'}
                    </Button>
                    {readinessData?.data && !readinessData.data.canGenerate && (
                      <p className="text-xs text-red-500">
                        Add the required fields above to enable resume generation.
                      </p>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {activeSection === 'preferences' && (
              <PreferencesSection form={form} updateField={updateField} />
            )}

            {activeSection === 'social' && <SocialSection form={form} updateField={updateField} />}

            {/* Save Button (bottom) */}
            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                isLoading={updateMutation.isPending}
                disabled={!formDirty}
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

function ResumeParserSection({
  updateField,
}: {
  updateField: <K extends keyof UpdateCandidateRequest>(
    key: K,
    value: UpdateCandidateRequest[K],
  ) => void;
}) {
  const [polling, setPolling] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedResumeData | null>(null);
  const [showReview, setShowReview] = useState(false);

  // Fetch existing parsed data on mount
  const { data: existingParsed } = useQuery({
    queryKey: QUERY_KEYS.CANDIDATES.PARSED_RESUME,
    queryFn: () => candidateService.getParsedResumeData(),
  });

  // Poll for parsed data after triggering parse
  const { data: polledParsed } = useQuery({
    queryKey: [...QUERY_KEYS.CANDIDATES.PARSED_RESUME, 'polling'],
    queryFn: () => candidateService.getParsedResumeData(),
    refetchInterval: 3000,
    enabled: polling,
  });

  useEffect(() => {
    if (existingParsed?.data) {
      queueMicrotask(() => setParsedData(existingParsed.data));
    }
  }, [existingParsed]);

  // Stop polling when data arrives
  useEffect(() => {
    if (polling && polledParsed?.data) {
      queueMicrotask(() => {
        setParsedData(polledParsed.data);
        setPolling(false);
        setShowReview(true);
      });
      showToast.success('Resume parsed successfully!');
    }
  }, [polling, polledParsed]);

  // 60-second polling timeout
  useEffect(() => {
    if (!polling) return;
    const timer = setTimeout(() => {
      setPolling(false);
      showToast.error('Resume parsing timed out. Please try again.');
    }, 60000);
    return () => clearTimeout(timer);
  }, [polling]);

  const parseMutation = useMutation({
    mutationFn: () => candidateService.parseResume(),
    onSuccess: () => {
      showToast.success('Resume parsing started! This may take a moment.');
      setPolling(true);
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to parse resume');
    },
  });

  const handleApplyFields = (fields: Partial<ApplyableResumeFields>) => {
    // Same approach as the outer handler — see its comment for the
    // full rationale. Spread firstName/lastName into form state along
    // with every other field; handleSave on the profile page detects
    // name diffs and persists them via authService.updateProfile.
    // Doing it immediately here caused the parsed name to be reverted
    // by handleSave's stale form value.
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue;
      updateField(k as keyof UpdateCandidateRequest, v as never);
    }
    showToast.success('Parsed data applied to profile!');
    setShowReview(false);
  };

  return (
    <Card
      header={
        <div className="flex items-center gap-2">
          <Brain className="text-primary h-5 w-5" />
          <h2 className="text-lg font-semibold text-[var(--text)]">AI Resume Parser</h2>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">
          Use AI to extract information from your uploaded resume and auto-fill your profile fields.
        </p>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => parseMutation.mutate()}
            isLoading={parseMutation.isPending || polling}
            disabled={polling}
            tooltip="Extract profile details from your resume using AI"
          >
            <Brain className="mr-1.5 h-4 w-4" />
            {polling ? 'Analyzing...' : parsedData ? 'Re-parse Resume' : 'Parse with AI'}
          </Button>

          {parsedData && !showReview && !polling && (
            <Button
              variant="outline"
              onClick={() => setShowReview(true)}
              tooltip="Review extracted resume data"
            >
              <Eye className="mr-1.5 h-4 w-4" /> Review Parsed Data
            </Button>
          )}
        </div>

        {polling && (
          <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
            <Loader2 className="text-primary h-5 w-5 animate-spin" />
            <div>
              <p className="text-sm font-medium text-[var(--text)]">
                AI is analyzing your resume...
              </p>
              <p className="text-xs text-[var(--text-muted)]">This usually takes 10-30 seconds.</p>
            </div>
          </div>
        )}

        {showReview && parsedData && (
          <ResumeParseReview
            parsedData={parsedData}
            onApplyFields={handleApplyFields}
            onCancel={() => setShowReview(false)}
          />
        )}
      </div>
    </Card>
  );
}

/**
 * Inline upsell banner shown when the candidate has no Premium entitlement.
 * Surfaces the value of CAND_PREMIUM (₹199/30d) without blocking profile editing.
 * Click → opens the upgrade modal pre-filled for the verified-badge feature
 * (most concrete benefit for profile-page context).
 */
function CandidateProfilePremiumBanner() {
  const { hasFeature } = useEntitlements();
  const upgrade = useUpgradeModal();
  const isPremium =
    hasFeature('feature.candidate_ai_resume_premium') ||
    hasFeature('feature.candidate_verified_badge') ||
    hasFeature('feature.candidate_top_visibility');
  if (isPremium) return null;
  return (
    <>
      <div className="mb-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 p-4 shadow-sm dark:from-amber-700 dark:via-amber-800 dark:to-orange-800">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/20 text-white shadow-inner ring-1 ring-white/30 backdrop-blur-sm">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-white">Stand out with Candidate Premium</h3>
              <p className="mt-0.5 text-xs text-white/90">
                AI Resume Premium · Verified Badge · 7-day Profile Boost · Priority WhatsApp Support
                · Top Visibility — just ₹199/month.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => upgrade.open({ feature: 'feature.candidate_verified_badge' })}
            className="flex-shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm transition-colors hover:bg-amber-50"
          >
            Upgrade →
          </button>
        </div>
      </div>
      {upgrade.modal}
    </>
  );
}
