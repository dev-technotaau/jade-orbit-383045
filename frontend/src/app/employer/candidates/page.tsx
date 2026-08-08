'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ROUTES } from '@/constants/routes';
import {
  Search,
  Filter,
  MapPin,
  Briefcase,
  Clock,
  Mail,
  Phone,
  FileText,
  User,
  Building2,
  CheckCircle,
  XCircle,
  Activity,
  Bookmark,
  Star,
  Sparkles,
  WandSparkles,
  Locate,
  Loader2,
  Pencil,
  UserCheck,
  ChevronDown,
  X,
  LayoutList,
  LayoutGrid,
  Download,
  CheckSquare,
  Square,
  GitCompareArrows,
  Map,
  Bell,
  FileDown,
  Lock,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import PlanGate from '@/components/billing/PlanGate';
import PremiumLockBadge from '@/components/billing/PremiumLockBadge';
import VerifiedBadge from '@/components/billing/VerifiedBadge';
import BrandIcon from '@/components/common/BrandIcon';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Tag from '@/components/ui/Tag';
import Pagination from '@/components/ui/Pagination';
import Skeleton from '@/components/ui/Skeleton';
import DatePicker from '@/components/ui/DatePicker';
import EmptyState from '@/components/ui/EmptyState';
import Tooltip from '@/components/ui/Tooltip';
import SearchBar from '@/components/ui/SearchBar';
import AutoSuggest from '@/components/ui/AutoSuggest';
import ServerAutoSuggest from '@/components/ui/ServerAutoSuggest';
import AdvancedFilters, {
  ActiveFilterTags,
  type FilterSection,
} from '@/components/ui/AdvancedFilters';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { candidateService } from '@/services/candidate.service';
import { cvUnlockService, type UnlockResult } from '@/services/cv-unlock.service';
import UnlockContactButton from '@/components/billing/UnlockContactButton';
import { employerService } from '@/services/employer.service';
import { jobService } from '@/services/job.service';
import { savedSearchService } from '@/services/saved-search.service';
import { searchService } from '@/services/search.service';
import { recommendationService } from '@/services/recommendation.service';
import { showToast } from '@/components/ui/Toast';
import ExperienceSelect, { type ExperienceValue } from '@/components/ui/ExperienceSelect';
import { QUERY_KEYS, PAGINATION } from '@/constants/config';
import {
  useSuggestLocations,
  useSuggestSkills,
  useSuggestCompanies,
  useDidYouMean,
} from '@/hooks/use-search';
import { useSuggest, useStaticSuggestions } from '@/hooks/use-suggestions';
import {
  useFieldHistory,
  useAddToFieldHistory,
  useClearFieldHistory,
} from '@/hooks/use-field-history';
import { useAuthStore } from '@/store/auth.store';
import {
  WORK_MODE_LABELS,
  WORK_STATUS_LABELS,
  NOTICE_PERIOD_LABELS,
  GENDER_LABELS,
  DISABILITY_TYPE_LABELS,
  JOB_TYPE_LABELS,
  LAST_ACTIVE_LABELS,
  YES_NO_LABELS,
  SALARY_CURRENCY_LABELS,
  OPEN_TO_WORK_LABELS,
  RESERVATION_CATEGORY_LABELS,
  CAREER_BREAK_TYPE_LABELS,
  EDUCATION_LEVEL_SEARCH_LABELS,
  KEYWORD_OPERATOR_LABELS,
  BROAD_REGION_PRESETS,
  INDIAN_REGION_PRESETS,
  EXPERIENCE_LEVEL_LABELS,
  EDUCATION_LEVEL_LABELS,
  FUNCTIONAL_AREA_LABELS,
  DRIVING_LICENSE_TYPE_LABELS,
} from '@/constants/enums';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { formatRelativeDate, cn } from '@/lib/utils';
import HighlightText from '@/components/ui/HighlightText';
import PresenceIndicator from '@/components/ui/PresenceIndicator';
import SwipeableCard from '@/components/jobs/SwipeableCard';
import RadiusSlider from '@/components/jobs/RadiusSlider';
import CompareBar from '@/components/candidates/CompareBar';
import CompareModal from '@/components/candidates/CompareModal';
import type { CandidateSearchFilters, CandidateProfile } from '@/types/candidate';
import type { ApiError, SearchFacets } from '@/types/api';
import dynamic from 'next/dynamic';

const CandidateMapView = dynamic(() => import('@/components/candidates/MapView'), { ssr: false });

const toSelectOptions = (map: Record<string, string>) =>
  Object.entries(map).map(([value, label]) => ({ value, label }));

/** Build filter sections from static config + live facets. */
function buildCandidateFilterSections(facets: SearchFacets): FilterSection[] {
  return [
    // Row 0: Search operators
    {
      key: 'keywordScope',
      label: 'Search Scope',
      type: 'select',
      options: {
        '': 'All Fields',
        all: 'All Fields',
        title: 'Job Title',
        skills: 'Skills',
        designation: 'Designation',
        company: 'Company',
      },
    },
    {
      key: 'keywordOperator',
      label: 'Keyword Match',
      type: 'select',
      options: {
        '': 'Any (OR)',
        or: 'Any (OR)',
        and: 'All (AND)',
      },
    },
    // Row 1: Employment status
    {
      key: 'workStatus',
      label: 'Work Status',
      type: 'select',
      options: WORK_STATUS_LABELS,
      facets: facets.workStatus,
    },
    {
      key: 'noticePeriod',
      label: 'Notice Period',
      type: 'select',
      options: NOTICE_PERIOD_LABELS,
      facets: facets.noticePeriod,
    },
    { key: 'servingNoticePeriod', label: 'Serving Notice', type: 'select', options: YES_NO_LABELS },
    {
      key: 'preferredWorkMode',
      label: 'Work Mode',
      type: 'select',
      options: WORK_MODE_LABELS,
      facets: facets.preferredWorkMode,
    },
    // Row 2: Preferences
    { key: 'preferredJobType', label: 'Job Type', type: 'select', options: JOB_TYPE_LABELS },
    {
      key: 'willingToRelocate',
      label: 'Willing to Relocate',
      type: 'select',
      options: YES_NO_LABELS,
    },
    {
      key: 'lastActiveWithin',
      label: 'Last Active',
      type: 'select',
      options: LAST_ACTIVE_LABELS,
      facets: facets.lastActive,
    },
    { key: 'hasResume', label: 'Has Resume', type: 'select', options: YES_NO_LABELS },
    // Row 3: Ranges (with dynamic buckets from ES)
    ...(facets.experienceRange?.length
      ? [
          {
            key: 'experienceBucket',
            label: 'Experience',
            type: 'radio' as const,
            options: Object.fromEntries(facets.experienceRange.map((b) => [b.key, b.key])),
            facets: facets.experienceRange,
          },
        ]
      : [
          {
            key: 'experience',
            label: 'Experience (years)',
            type: 'range' as const,
            rangePlaceholderMin: '0',
            rangePlaceholderMax: '30',
            rangeSuffix: 'yrs',
          },
        ]),
    ...(facets.salaryRange?.length
      ? [
          {
            key: 'salaryBucket',
            label: 'Salary Range',
            type: 'radio' as const,
            options: Object.fromEntries(facets.salaryRange.map((b) => [b.key, b.key])),
            facets: facets.salaryRange,
          },
        ]
      : [
          {
            key: 'salary',
            label: 'Salary Range',
            type: 'range' as const,
            rangePlaceholderMin: 'e.g. 300000',
            rangePlaceholderMax: 'e.g. 2000000',
            rangePrefix: '₹',
          },
        ]),
    {
      key: 'salaryCurrency',
      label: 'Salary Currency',
      type: 'select',
      options: SALARY_CURRENCY_LABELS,
    },
    {
      key: 'includeSalaryNotDisclosed',
      label: 'Undisclosed Salary',
      type: 'select',
      options: YES_NO_LABELS,
    },
    // Row 4: Demographics & verification
    {
      key: 'age',
      label: 'Age Range',
      type: 'range',
      rangePlaceholderMin: '18',
      rangePlaceholderMax: '60',
      rangeSuffix: 'yrs',
    },
    {
      key: 'gender',
      label: 'Gender',
      type: 'select',
      options: GENDER_LABELS,
      facets: facets.gender,
    },
    { key: 'disabilityType', label: 'Disability', type: 'select', options: DISABILITY_TYPE_LABELS },
    { key: 'hasCareerBreak', label: 'Career Break', type: 'select', options: YES_NO_LABELS },
    // Row 5: Profile details
    {
      key: 'openToWork',
      label: 'Open to Work',
      type: 'select',
      options: OPEN_TO_WORK_LABELS,
      facets: facets.openToWork,
    },
    {
      key: 'careerBreakType',
      label: 'Break Reason',
      type: 'select',
      options: CAREER_BREAK_TYPE_LABELS,
    },
    {
      key: 'category',
      label: 'Category',
      type: 'select',
      options: RESERVATION_CATEGORY_LABELS,
      facets: facets.category,
    },
    { key: 'isVeteran', label: 'Veteran', type: 'select', options: YES_NO_LABELS },
    // Row 6: Verification
    { key: 'verifiedEmail', label: 'Email Verified', type: 'select', options: YES_NO_LABELS },
    { key: 'verifiedMobile', label: 'Mobile Verified', type: 'select', options: YES_NO_LABELS },

    // Row 7: Professional Details (NEW - with facets)
    {
      key: 'experienceLevel',
      label: 'Experience Level',
      type: 'select',
      options: EXPERIENCE_LEVEL_LABELS,
      facets: facets.experienceLevel,
    },
    {
      key: 'highestEducationLevel',
      label: 'Education Level',
      type: 'select',
      options: EDUCATION_LEVEL_LABELS,
      facets: facets.highestEducationLevel,
    },
    {
      key: 'drivingLicenseType',
      label: 'Driving License',
      type: 'select',
      options: DRIVING_LICENSE_TYPE_LABELS,
      facets: facets.drivingLicenseType,
    },
    {
      key: 'workPermit',
      label: 'Work Permit',
      type: 'select',
      options: {
        '': 'All',
        INDIAN_CITIZEN: 'Indian Citizen',
        PERMANENT_RESIDENT: 'Permanent Resident',
        WORK_VISA: 'Work Visa',
        DEPENDENT_VISA: 'Dependent Visa',
        STUDENT_VISA: 'Student Visa',
        NO_PERMIT: 'No Permit',
      },
    },

    // Row 8: Education Level filter
    {
      key: 'educationLevel',
      label: 'Education Level',
      type: 'select',
      options: {
        '': 'All',
        UG: 'Undergraduate',
        PG: 'Postgraduate',
        DOCTORATE: 'Doctorate',
      },
    },

    // Dynamic facets from ES aggregations
    ...(facets.currentIndustry?.length
      ? [
          {
            key: 'currentIndustry',
            label: 'Industry',
            type: 'multiselect' as const,
            options: Object.fromEntries(facets.currentIndustry.map((b) => [b.key, b.key])),
            facets: facets.currentIndustry,
            collapsible: true,
            defaultOpen: false,
          },
        ]
      : []),
    ...(facets.currentDepartment?.length
      ? [
          {
            key: 'department',
            label: 'Department',
            type: 'multiselect' as const,
            options: Object.fromEntries(facets.currentDepartment.map((b) => [b.key, b.key])),
            facets: facets.currentDepartment,
            collapsible: true,
            defaultOpen: false,
          },
        ]
      : []),
    ...(facets.functionalArea?.length
      ? [
          {
            key: 'functionalArea',
            label: 'Functional Area',
            type: 'multiselect' as const,
            options: Object.fromEntries(facets.functionalArea.map((b) => [b.key, b.key])),
            facets: facets.functionalArea,
            collapsible: true,
            defaultOpen: false,
          },
        ]
      : []),
    ...(facets.topSkills?.length
      ? [
          {
            key: 'skills',
            label: 'Popular Skills',
            type: 'multiselect' as const,
            options: Object.fromEntries(facets.topSkills.map((b) => [b.key, b.key])),
            facets: facets.topSkills,
            collapsible: true,
            defaultOpen: true,
          },
        ]
      : []),
    ...(facets.topLocations?.length
      ? [
          {
            key: 'location',
            label: 'Top Locations',
            type: 'radio' as const,
            options: Object.fromEntries(facets.topLocations.map((b) => [b.key, b.key])),
            facets: facets.topLocations,
            collapsible: true,
            defaultOpen: false,
          },
        ]
      : []),
    ...(facets.topCompanies?.length
      ? [
          {
            key: 'currentCompany',
            label: 'Top Companies',
            type: 'multiselect' as const,
            options: Object.fromEntries(facets.topCompanies.map((b) => [b.key, b.key])),
            facets: facets.topCompanies,
            collapsible: true,
            defaultOpen: false,
          },
        ]
      : []),
  ];
}

const DEFAULT_CANDIDATE_LIMIT = String(PAGINATION.CANDIDATES_PER_PAGE);

/** URL query params → CandidateSearchFilters (round-trips every field so
 *  browser BACK restores the exact search). */
function paramsToFilters(sp: URLSearchParams): CandidateSearchFilters {
  const out: Record<string, string> = {};
  sp.forEach((v, k) => {
    if (v) out[k] = v;
  });
  // Back-compat: hero deep links arrive as ?q= ; the filter field is `keyword`.
  if (out.q && !out.keyword) out.keyword = out.q;
  delete out.q;
  return {
    ...out,
    page: out.page || '1',
    limit: out.limit || DEFAULT_CANDIDATE_LIMIT,
  } as CandidateSearchFilters;
}

/** CandidateSearchFilters → URL query params (omits empties + defaults). */
function filtersToParams(filters: CandidateSearchFilters): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '') continue;
    if (k === 'page' && v === '1') continue;
    if (k === 'limit' && v === DEFAULT_CANDIDATE_LIMIT) continue;
    sp.set(k, String(v));
  }
  return sp;
}

export default function CandidateSearchPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Seed the ENTIRE filter set from the URL so browser BACK (from a candidate
  // detail page) restores the exact search instead of resetting it.
  const [filters, setFilters] = useState<CandidateSearchFilters>(() =>
    paramsToFilters(new URLSearchParams(searchParams?.toString() ?? '')),
  );
  const [keyword, setKeyword] = useState(() => filters.keyword ?? '');
  const [locationQuery, setLocationQuery] = useState(() => filters.location ?? '');
  const [skillsQuery, setSkillsQuery] = useState('');
  const [companyQuery, setCompanyQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [savedCandidateIds, setSavedCandidateIds] = useState<Set<string>>(new Set());
  const [showSaveSearch, setShowSaveSearch] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [geoLocationName, setGeoLocationName] = useState('');
  const [nearbyCities, setNearbyCities] = useState<string[]>([]);
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const [jobPickerAction, setJobPickerAction] = useState<'shortlist' | 'select'>('shortlist');
  const [jobPickerCandidateId, setJobPickerCandidateId] = useState('');
  const [jobSearch, setJobSearch] = useState('');
  // Track candidates that have been actioned in this session (candidateId → last action)
  const [actionedCandidates, setActionedCandidates] = useState<
    Record<string, 'shortlisted' | 'selected'>
  >({});
  const [viewMode, setViewMode] = useState<'list' | 'compact' | 'map'>(() => {
    if (typeof window !== 'undefined') {
      return (
        (localStorage.getItem('candidate-search-view') as 'list' | 'compact' | 'map') || 'list'
      );
    }
    return 'list';
  });
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Contacts revealed THIS session (card-level / bulk unlocks). Keyed by
  // row id — the search route's 60s cache would otherwise keep returning
  // the stripped payload after an unlock.
  const [unlockedMap, setUnlockedMap] = useState<Record<string, UnlockResult>>({});
  const [bulkUnlocking, setBulkUnlocking] = useState(false);
  const [bulkActionOpen, setBulkActionOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  // Persist view mode to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('candidate-search-view', viewMode);
    }
  }, [viewMode]);

  // Mirror filters → URL (replace — no history spam, no scroll jump) so that
  // browser BACK from a candidate detail page restores the full search
  // (query + every filter + page), instead of resetting to defaults.
  useEffect(() => {
    const next = filtersToParams(filters).toString();
    const current = new URLSearchParams(searchParams?.toString() ?? '').toString();
    if (next !== current) {
      router.replace(next ? `?${next}` : '?', { scroll: false });
    }
  }, [filters, router, searchParams]);

  // Detect touch device
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    }
  }, []);

  const { data: didYouMeanData } = useDidYouMean(keyword, 'candidates');
  const { data: locationSuggestions, isLoading: isLoadingLocations } =
    useSuggestLocations(locationQuery);
  const { data: skillSuggestions, isLoading: isLoadingSkills } = useSuggestSkills(skillsQuery);
  const { data: companySuggestions, isLoading: isLoadingCompanies } =
    useSuggestCompanies(companyQuery);

  // ES suggestions index — additive sections for search dropdowns
  const { suggestions: esLocationSugs, isLoading: esLocLoading } = useSuggest({
    category: 'location',
    query: locationQuery,
    limit: 10,
    minChars: 2,
  });
  const { suggestions: esSkillSugs, isLoading: esSkillLoading } = useSuggest({
    category: 'skill',
    query: skillsQuery,
    limit: 10,
    minChars: 1,
  });
  const { suggestions: esCompanySugs, isLoading: esCompanyLoading } = useSuggest({
    category: 'company',
    query: companyQuery,
    limit: 10,
    minChars: 2,
  });

  // Pre-populate saved candidate IDs on mount
  const { data: savedCandidatesData } = useQuery({
    queryKey: QUERY_KEYS.EMPLOYERS.SAVED_CANDIDATES,
    queryFn: () => employerService.getSavedCandidates(1, 200),
  });
  useEffect(() => {
    const items = savedCandidatesData?.data?.items;
    if (items && items.length > 0) {
      setSavedCandidateIds(new Set(items.map((c: CandidateProfile) => c.id)));
    }
  }, [savedCandidatesData]);

  const toggleSaveMutation = useMutation({
    mutationFn: (candidateId: string) => employerService.toggleSavedCandidate(candidateId),
    onSuccess: (data, candidateId) => {
      const saved = data.data?.saved ?? false;
      setSavedCandidateIds((prev) => {
        const next = new Set(prev);
        if (saved) {
          next.add(candidateId);
        } else {
          next.delete(candidateId);
        }
        return next;
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.EMPLOYERS.SAVED_CANDIDATES });
      showToast.success(saved ? 'Candidate saved!' : 'Candidate unsaved');
    },
    onError: () => {
      showToast.error('Failed to save candidate');
    },
  });

  const { data: myJobsData } = useQuery({
    queryKey: [...QUERY_KEYS.JOBS.MY_JOBS, 'picker'],
    queryFn: () => jobService.getMyJobs(1, 100),
    enabled: jobPickerOpen,
  });

  const shortlistMutation = useMutation({
    mutationFn: ({ candidateId, jobId }: { candidateId: string; jobId: string }) =>
      employerService.shortlistCandidateForJob(candidateId, jobId),
    onSuccess: (_data, vars) => {
      setJobPickerOpen(false);
      setActionedCandidates((prev) => ({ ...prev, [vars.candidateId]: 'shortlisted' as const }));
      showToast.success('Candidate shortlisted!');
    },
    onError: (err) => {
      const e = err as unknown as ApiError;
      showToast.error(e.message || 'Failed to shortlist');
    },
  });

  const selectMutation = useMutation({
    mutationFn: ({ candidateId, jobId }: { candidateId: string; jobId: string }) =>
      employerService.selectCandidateForJob(candidateId, jobId),
    onSuccess: (_data, vars) => {
      setJobPickerOpen(false);
      setActionedCandidates((prev) => ({ ...prev, [vars.candidateId]: 'selected' as const }));
      showToast.success('Candidate selected!');
    },
    onError: (err) => {
      const e = err as unknown as ApiError;
      showToast.error(e.message || 'Failed to select');
    },
  });

  const openJobPicker = (candidateId: string, action: 'shortlist' | 'select') => {
    setJobPickerCandidateId(candidateId);
    setJobPickerAction(action);
    setJobSearch('');
    setJobPickerOpen(true);
  };

  const saveSearchMutation = useMutation({
    mutationFn: (name: string) =>
      savedSearchService.create({
        name,
        searchType: 'CANDIDATE_SEARCH',
        filters: filters as Record<string, unknown>,
      }),
    onSuccess: () => {
      showToast.success('Search saved successfully');
      setShowSaveSearch(false);
      setSaveSearchName('');
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to save search');
    },
  });

  const bulkExportMutation = useMutation({
    mutationFn: (candidateIds: string[]) =>
      employerService.bulkExportCandidates({ candidateIds, format: 'xlsx' }),
    onSuccess: () => {
      showToast.success("Export queued! You'll receive an email when ready.");
      clearSelection();
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to queue export');
    },
  });

  const bulkExportResumesMutation = useMutation({
    mutationFn: (candidateIds: string[]) => employerService.bulkExportResumes(candidateIds),
    onSuccess: () => {
      showToast.success("Resume export queued! You'll receive an email with a ZIP download link.");
      clearSelection();
    },
    onError: (err) => {
      const error = err as unknown as ApiError;
      showToast.error(error.message || 'Failed to queue resume export');
    },
  });

  const bulkSaveMutation = useMutation({
    mutationFn: async (candidateIds: string[]) => {
      const promises = candidateIds.map((id) => employerService.toggleSavedCandidate(id));
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.EMPLOYERS.SAVED_CANDIDATES });
      showToast.success('Candidates saved!');
      clearSelection();
    },
    onError: () => {
      showToast.error('Failed to save some candidates');
    },
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleToggleCompare = useCallback((candidateId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(candidateId)) {
        return prev.filter((id) => id !== candidateId);
      }
      if (prev.length >= 3) {
        showToast.error('You can compare up to 3 candidates');
        return prev;
      }
      return [...prev, candidateId];
    });
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.CANDIDATES.SEARCH(filters as unknown as Record<string, unknown>),
    queryFn: () => employerService.searchCandidates(filters),
  });

  // Fetch employer's open jobs to calculate skill match %
  const { data: activeJobsData } = useQuery({
    queryKey: [...QUERY_KEYS.JOBS.MY_JOBS, 'active-skills'],
    queryFn: () => jobService.getMyJobs(1, 100, 'OPEN'),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Calculate aggregated required skills from all open jobs
  const requiredSkills = useMemo(() => {
    const jobs = activeJobsData?.data?.items || [];
    const allSkills = jobs.flatMap((j) => j.skillsRequired || []);
    return new Set(allSkills.map((s) => s.toLowerCase()));
  }, [activeJobsData]);

  // Fetch search history
  const { data: historyData } = useQuery({
    queryKey: ['search-history', 'candidates'],
    queryFn: () => searchService.getSearchHistory(10),
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });

  const searchHistory = useMemo(() => {
    const history = historyData?.data?.history || [];
    return history.filter((h) => h.type === 'candidate');
  }, [historyData]);

  const candidates = data?.data?.items || [];
  const pagination = data?.data;
  const facets: SearchFacets = (data?.data as unknown as { facets?: SearchFacets })?.facets || {};

  const filterSections = useMemo(() => buildCandidateFilterSections(facets), [facets]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(candidates.map((c) => c.id)));
  }, [candidates]);

  const compareCandidates = useMemo(
    () =>
      compareIds
        .map((id) => candidates.find((c) => c.id === id))
        .filter((c): c is CandidateProfile => c !== undefined),
    [compareIds, candidates],
  );

  // Fetch AI recommendations when results are sparse
  const showRecommendations = !isLoading && candidates.length < 5;
  const { data: recommendedData } = useQuery({
    queryKey: ['recommended-candidates-for-employer'],
    queryFn: () => recommendationService.getRecommendedCandidatesForEmployer(10),
    enabled: showRecommendations,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const recommendedCandidates = useMemo(() => {
    return (recommendedData?.data || []).filter((rc) => !candidates.some((c) => c.id === rc.id));
  }, [recommendedData, candidates]);

  // ── Field history hooks (must be before handlers that reference them) ──
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: locationHistory } = useFieldHistory('location');
  const addLocationHistory = useAddToFieldHistory('location');
  const clearLocationHistory = useClearFieldHistory('location');
  const { suggestions: popularLocations, isLoading: isLoadingPopular } = useStaticSuggestions(
    'location',
    8,
  );

  const handleKeywordSearch = useCallback((query: string) => {
    setKeyword(query);
    setFilters((prev) => ({
      ...prev,
      keyword: query || undefined,
      page: '1',
    }));
  }, []);

  const handleLocationChange = useCallback(
    (value: string | string[]) => {
      const loc = typeof value === 'string' ? value : value[0] || '';
      setFilters((prev) => ({
        ...prev,
        location: loc || undefined,
        page: '1',
      }));
      if (loc) addLocationHistory.mutate(loc);
    },
    [addLocationHistory],
  );

  // ── Experience inline select ──
  const experienceValue = useMemo((): ExperienceValue | null => {
    if (!filters.experienceMin) return null;
    const min = Number(filters.experienceMin);
    const max = filters.experienceMax ? Number(filters.experienceMax) : undefined;
    return { min, max };
  }, [filters.experienceMin, filters.experienceMax]);

  const handleExperienceChange = useCallback((val: ExperienceValue | null) => {
    setFilters((prev) => ({
      ...prev,
      experienceMin: val ? String(val.min) : undefined,
      experienceMax: val?.max != null ? String(val.max) : undefined,
      page: '1',
    }));
  }, []);

  const handleFilterChange = (key: string, value: string | undefined) => {
    // Translate experience bucket selections into experienceMin/Max
    if (key === 'experienceBucket') {
      setFilters((prev) => {
        const next = { ...prev, experienceBucket: value, page: '1' };
        if (!value) {
          next.experienceMin = undefined;
          next.experienceMax = undefined;
        } else if (value === 'Fresher') {
          next.experienceMin = '0';
          next.experienceMax = '1';
        } else if (value.endsWith('+') || value.endsWith('+ years')) {
          const num = value.match(/^(\d+)/)?.[1];
          next.experienceMin = num;
          next.experienceMax = undefined;
        } else {
          const match = value.match(/^(\d+)-(\d+)/);
          if (match) {
            next.experienceMin = match[1];
            next.experienceMax = match[2];
          }
        }
        return next;
      });
      return;
    }
    // Translate salary bucket selections into salaryMin/Max
    if (key === 'salaryBucket') {
      setFilters((prev) => {
        const next = { ...prev, salaryBucket: value, page: '1' };
        if (!value) {
          next.salaryMin = undefined;
          next.salaryMax = undefined;
        } else {
          const bucketRanges: Record<string, [string | undefined, string | undefined]> = {
            '0-3L': [undefined, '300000'],
            '3-6L': ['300000', '600000'],
            '6-10L': ['600000', '1000000'],
            '10-15L': ['1000000', '1500000'],
            '15-25L': ['1500000', '2500000'],
            '25L+': ['2500000', undefined],
          };
          const range = bucketRanges[value];
          if (range) {
            next.salaryMin = range[0];
            next.salaryMax = range[1];
          }
        }
        return next;
      });
      return;
    }
    setFilters((prev) => ({ ...prev, [key]: value, page: '1' }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page: String(page) }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePageSizeChange = (size: number) => {
    setFilters((prev) => ({ ...prev, limit: String(size), page: '1' }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchArea = useCallback((lat: number, lng: number, radiusKm: number) => {
    setFilters((prev) => ({
      ...prev,
      latitude: String(lat),
      longitude: String(lng),
      radiusKm: String(radiusKm),
      page: '1',
    }));
  }, []);

  const handleRadiusLocationChange = useCallback((lat: string, lng: string, cityName?: string) => {
    setFilters((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lng,
      radiusKm: prev.radiusKm || '25',
      page: '1',
    }));
    if (cityName) {
      setGeoLocationName(cityName);
    }
  }, []);

  const handleRadiusChange = useCallback((radiusKm: string) => {
    setFilters((prev) => ({ ...prev, radiusKm, page: '1' }));
  }, []);

  const handleClearGeoLocation = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      latitude: undefined,
      longitude: undefined,
      radiusKm: undefined,
      page: '1',
    }));
    setGeoLocationName('');
    setNearbyCities([]);
  }, []);

  const clearFilters = () => {
    setFilters({ page: '1', limit: String(PAGINATION.CANDIDATES_PER_PAGE) });
    setKeyword('');
    setLocationQuery('');
    setGeoLocationName('');
    setNearbyCities([]);
  };

  const fetchNearbyCities = useCallback(async (lat: number, lon: number, currentCity?: string) => {
    try {
      // Use Nominatim to find cities/towns near the coordinates
      const radiusDeg = 1.5; // ~150km bounding box
      const viewbox = `${lon - radiusDeg},${lat + radiusDeg},${lon + radiusDeg},${lat - radiusDeg}`;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&viewbox=${viewbox}&bounded=1&featuretype=city&limit=15&addressdetails=0`,
        { headers: { 'Accept-Language': 'en' } },
      );
      const results = await res.json();
      const cities = (results as Array<{ display_name: string; type: string; class: string }>)
        .map((r) => r.display_name.split(',')[0].trim())
        .filter((name, i, arr) => {
          if (!name) return false;
          // Deduplicate and exclude the current city
          if (arr.indexOf(name) !== i) return false;
          if (currentCity && name.toLowerCase() === currentCity.toLowerCase()) return false;
          return true;
        })
        .slice(0, 8);
      setNearbyCities(cities);
    } catch {
      setNearbyCities([]);
    }
  }, []);

  const handleGetLocation = useCallback(() => {
    if (!navigator.geolocation) {
      showToast.error('Geolocation is not supported by your browser');
      return;
    }
    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setFilters((prev) => ({
          ...prev,
          latitude: String(lat),
          longitude: String(lon),
          radiusKm: prev.radiusKm || '25',
          page: '1',
        }));
        // Reverse geocode via Nominatim (free, no API key)
        let detectedCity = '';
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`,
            { headers: { 'Accept-Language': 'en' } },
          );
          const data = await res.json();
          const parts = (data.display_name || '').split(',').map((s: string) => s.trim());
          detectedCity = parts[0] || '';
          setGeoLocationName(
            parts.slice(0, 2).join(', ') || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
          );
        } catch {
          setGeoLocationName(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
        }
        // Fetch nearby cities after a short delay (Nominatim rate limit: 1 req/sec)
        setTimeout(() => fetchNearbyCities(lat, lon, detectedCity), 1100);
        setIsGettingLocation(false);
        showToast.success('Location detected');
      },
      (error) => {
        setIsGettingLocation(false);
        if (error.code === error.PERMISSION_DENIED) {
          showToast.error('Location access denied. Please enable it in browser settings.');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          showToast.error('Location information unavailable');
        } else {
          showToast.error('Failed to get your location');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  }, [fetchNearbyCities]);

  const clearGeoLocation = useCallback(() => {
    setFilters((prev) => {
      const next = { ...prev, page: '1' };
      delete next.latitude;
      delete next.longitude;
      delete next.radiusKm;
      return next;
    });
    setGeoLocationName('');
    setNearbyCities([]);
  }, []);

  const activeFilterCount = Object.entries(filters).filter(
    ([key, val]) =>
      val &&
      ![
        'page',
        'limit',
        'sortBy',
        'keyword',
        'location',
        'experienceBucket',
        'salaryBucket',
      ].includes(key),
  ).length;

  const filterValues = useMemo(
    () => ({
      workStatus: filters.workStatus,
      noticePeriod: filters.noticePeriod,
      servingNoticePeriod: filters.servingNoticePeriod,
      preferredWorkMode: filters.preferredWorkMode,
      preferredJobType: filters.preferredJobType,
      willingToRelocate: filters.willingToRelocate,
      lastActiveWithin: filters.lastActiveWithin,
      hasResume: filters.hasResume,
      experienceMin: filters.experienceMin,
      experienceMax: filters.experienceMax,
      salaryMin: filters.salaryMin,
      salaryMax: filters.salaryMax,
      salaryCurrency: filters.salaryCurrency,
      includeSalaryNotDisclosed: filters.includeSalaryNotDisclosed,
      ageMin: filters.ageMin,
      ageMax: filters.ageMax,
      gender: filters.gender,
      disabilityType: filters.disabilityType,
      hasCareerBreak: filters.hasCareerBreak,
      openToWork: filters.openToWork,
      careerBreakType: filters.careerBreakType,
      category: filters.category,
      isVeteran: filters.isVeteran,
      verifiedEmail: filters.verifiedEmail,
      verifiedMobile: filters.verifiedMobile,
      keywordOperator: filters.keywordOperator,
      educationLevel: filters.educationLevel,
      itSkill: filters.itSkill,
      workPermit: filters.workPermit,
      // Dynamic facet filter keys
      experienceBucket: filters.experienceBucket,
      salaryBucket: filters.salaryBucket,
      experienceLevel: filters.experienceLevel,
      highestEducationLevel: filters.highestEducationLevel,
      drivingLicenseType: filters.drivingLicenseType,
      currentIndustry: filters.currentIndustry,
      department: filters.department,
      functionalArea: filters.functionalArea,
      skills: filters.skills,
      location: filters.location,
      currentCompany: filters.currentCompany,
    }),
    [filters],
  );

  const locationOptions = useMemo(
    () =>
      (locationSuggestions?.data?.suggestions ?? []).map((s) => ({
        label: s.text,
        value: s.text,
        count: s.count,
      })),
    [locationSuggestions],
  );

  const skillOptions = useMemo(
    () =>
      (skillSuggestions?.data?.suggestions ?? []).map((s) => ({
        label: s.text,
        value: s.text,
        count: s.count,
      })),
    [skillSuggestions],
  );

  const companyOptions = useMemo(
    () =>
      (companySuggestions?.data?.suggestions ?? []).map((s) => ({
        label: s.text,
        value: s.text,
        count: s.count,
      })),
    [companySuggestions],
  );

  // Additional suggestion sections from ES suggestions index
  const locationAdditionalSections = useMemo(
    () =>
      locationQuery.length >= 2
        ? [
            {
              label: 'Suggestions',
              options: esLocationSugs.map((s) => ({ label: s, value: s })),
              isLoading: esLocLoading,
            },
          ]
        : [],
    [locationQuery, esLocationSugs, esLocLoading],
  );

  // ── Focus sections: Recent Locations + Popular Locations ──
  const locationFocusSections = useMemo(() => {
    const sections: import('@/components/ui/AutoSuggest').AdditionalSuggestSection[] = [];
    const historyItems = locationHistory?.data?.history ?? [];
    if (isAuthenticated && historyItems.length > 0) {
      sections.push({
        label: 'Recent Locations',
        options: historyItems.map((h) => ({ label: h.value, value: h.value })),
        onClear: () => clearLocationHistory.mutate(),
      });
    }
    sections.push({
      label: 'Popular Locations',
      options: popularLocations.map((loc) => ({ label: loc, value: loc })),
      isLoading: isLoadingPopular,
    });
    return sections;
  }, [isAuthenticated, locationHistory, popularLocations, isLoadingPopular, clearLocationHistory]);

  const skillAdditionalSections = useMemo(
    () =>
      skillsQuery.length >= 1
        ? [
            {
              label: 'Suggestions',
              options: esSkillSugs.map((s) => ({ label: s, value: s })),
              isLoading: esSkillLoading,
            },
          ]
        : [],
    [skillsQuery, esSkillSugs, esSkillLoading],
  );
  const companyAdditionalSections = useMemo(
    () =>
      companyQuery.length >= 2
        ? [
            {
              label: 'Suggestions',
              options: esCompanySugs.map((s) => ({ label: s, value: s })),
              isLoading: esCompanyLoading,
            },
          ]
        : [],
    [companyQuery, esCompanySugs, esCompanyLoading],
  );

  const didYouMean = didYouMeanData?.data?.suggestion;

  const handleResumeDownload = useCallback(async (candidateUserId: string) => {
    try {
      const res = await candidateService.getResumeDownloadUrl(candidateUserId);
      if (res.data?.url) {
        window.open(res.data.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      // Surface the backend's reason — e.g. the contact-paywall nudge
      // "Unlock this candidate (1 CV unlock) to download their resume."
      const apiErr = err as unknown as ApiError;
      showToast.error(apiErr?.message ?? 'Failed to download resume');
    }
  }, []);

  // Bulk unlock — burns 1 CV unlock per locked selected candidate
  // (already-unlocked / applicants come back cached at no cost).
  async function handleBulkUnlock() {
    const targets = candidates.filter(
      (c) => selectedIds.has(c.id) && c.contactUnlocked === false && !unlockedMap[c.id],
    );
    if (targets.length === 0) {
      showToast.success('All selected candidates are already unlocked');
      return;
    }
    setBulkUnlocking(true);
    let fresh = 0;
    let cached = 0;
    let failed = 0;
    for (const c of targets) {
      try {
        const res = await cvUnlockService.unlock(c.userId ?? c.id);
        setUnlockedMap((prev) => ({ ...prev, [c.id]: res }));
        if (res.cached) cached += 1;
        else fresh += 1;
      } catch {
        failed += 1;
      }
    }
    setBulkUnlocking(false);
    const parts: string[] = [];
    if (fresh) parts.push(`${fresh} unlocked (${fresh} CV unlock${fresh === 1 ? '' : 's'} used)`);
    if (cached) parts.push(`${cached} already unlocked`);
    if (failed) parts.push(`${failed} failed`);
    const summary = parts.join(' · ');
    if (failed && !fresh && !cached) showToast.error(summary);
    else showToast.success(summary);
  }

  return (
    <DashboardLayout requiredRole={['EMPLOYER']}>
      <PlanGate
        require={['feature.cv_db_access']}
        feature="CV Database"
        upgradeHref="/pricing/employer?from=cv_db_access#employer_cv_database"
      >
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Search Candidates</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Find the right talent for your openings
            </p>
          </div>

          {/* Search Bar */}
          <Card>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <SearchBar
                placeholder="Skills, designation, or company..."
                searchType="candidates"
                defaultValue={keyword}
                onSearch={handleKeywordSearch}
                size="lg"
                fullWidth
                className="flex-1"
              />
              <ExperienceSelect
                value={experienceValue}
                onChange={handleExperienceChange}
                size="lg"
                className="w-full shrink-0 sm:w-40"
              />
              <div className="flex-1 sm:max-w-xs">
                <AutoSuggest
                  placeholder="City or location"
                  value={filters.location || ''}
                  onChange={handleLocationChange}
                  suggestions={locationOptions}
                  isLoading={isLoadingLocations}
                  onInputChange={setLocationQuery}
                  allowCreate
                  createLabel={(q) => `Search in "${q}"`}
                  minChars={2}
                  inputSize="lg"
                  additionalSections={locationAdditionalSections}
                  focusSections={locationFocusSections}
                />
              </div>
            </div>

            {/* Radius Slider for Geo-Search */}
            <div className="mt-3">
              <RadiusSlider
                latitude={filters.latitude}
                longitude={filters.longitude}
                radiusKm={filters.radiusKm}
                onLocationChange={handleRadiusLocationChange}
                onRadiusChange={handleRadiusChange}
                onClear={handleClearGeoLocation}
              />
              {geoLocationName && (
                <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                  📍 Searching near {geoLocationName}
                </p>
              )}
            </div>

            {/* Keyword Scope + Operator */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[var(--text-muted)]">Search in:</span>
              {(['all', 'title', 'skills', 'designation', 'company'] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() =>
                    handleFilterChange('keywordScope', scope === 'all' ? undefined : scope)
                  }
                  className={`rounded-full px-2.5 py-1 transition-colors ${
                    (filters.keywordScope || 'all') === scope
                      ? 'bg-primary text-white'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  {scope.charAt(0).toUpperCase() + scope.slice(1)}
                </button>
              ))}
              <span className="mx-1 h-4 w-px bg-[var(--border)]" />
              <span className="text-[var(--text-muted)]">Match:</span>
              {(['or', 'and'] as const).map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() =>
                    handleFilterChange('keywordOperator', op === 'or' ? undefined : op)
                  }
                  className={`rounded-full px-2.5 py-1 transition-colors ${
                    (filters.keywordOperator || 'or') === op
                      ? 'bg-primary text-white'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  {KEYWORD_OPERATOR_LABELS[op]}
                </button>
              ))}
            </div>

            {/* Did you mean? */}
            {didYouMean && didYouMean !== keyword && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-[var(--warning)]" />
                <span className="text-[var(--text-secondary)]">Did you mean:</span>
                <button
                  type="button"
                  onClick={() => handleKeywordSearch(didYouMean)}
                  className="text-primary font-medium hover:underline"
                >
                  {didYouMean}
                </button>
              </div>
            )}
          </Card>

          {/* ── Main layout: filter SIDEBAR (left) + results (right).
              Mirrors the candidate /jobs page UX so the experience is
              symmetric for both audiences. Every existing filter card
              moves into the <aside> below — none are removed; the
              source-of-truth IS this DOM region, simply re-anchored
              from "above the results" to "to the left of the results".
              On <lg, the aside collapses to hidden by default and the
              "Filters" button in the toolbar toggles `showAdvanced`
              to reveal it inline above the results (no separate
              drawer — the same DOM does both). */}
          <div className="flex flex-col gap-6 lg:flex-row">
            <aside
              className={cn(
                'w-full shrink-0 space-y-4 lg:block lg:w-[340px]',
                showAdvanced ? 'block' : 'hidden lg:block',
              )}
              aria-label="Candidate filters"
            >
              {/* Inline skill/company/designation/IT skill autosuggests */}
              <Card>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <AutoSuggest
                    label="Skills"
                    placeholder="e.g. React, Node.js"
                    value={filters.skills?.split(',').filter(Boolean) ?? []}
                    onChange={(val) => {
                      const str = Array.isArray(val) ? val.join(',') : val;
                      handleFilterChange('skills', str || undefined);
                    }}
                    suggestions={skillOptions}
                    isLoading={isLoadingSkills}
                    onInputChange={setSkillsQuery}
                    multiple
                    allowCreate
                    createLabel={(q) => `Add "${q}"`}
                    maxSelections={15}
                    minChars={1}
                    inputSize="sm"
                    additionalSections={skillAdditionalSections}
                  />
                  <AutoSuggest
                    label="Current Company"
                    placeholder="e.g. Google"
                    value={filters.currentCompany || ''}
                    onChange={(val) =>
                      handleFilterChange(
                        'currentCompany',
                        (typeof val === 'string' ? val : val[0]) || undefined,
                      )
                    }
                    suggestions={companyOptions}
                    isLoading={isLoadingCompanies}
                    onInputChange={setCompanyQuery}
                    allowCreate
                    createLabel={(q) => `Search "${q}"`}
                    minChars={2}
                    inputSize="sm"
                    additionalSections={companyAdditionalSections}
                  />
                  <ServerAutoSuggest
                    category="role_category"
                    label="Designation"
                    placeholder="e.g. Senior Developer"
                    value={filters.designation || ''}
                    onChange={(v) =>
                      handleFilterChange(
                        'designation',
                        (typeof v === 'string' ? v : v[0]) || undefined,
                      )
                    }
                    allowCreate
                    inputSize="sm"
                  />
                  <ServerAutoSuggest
                    category="skill"
                    label="IT Skill / Technology"
                    placeholder="e.g. Docker, AWS"
                    value={filters.itSkill || ''}
                    onChange={(v) =>
                      handleFilterChange('itSkill', (typeof v === 'string' ? v : v[0]) || undefined)
                    }
                    allowCreate
                    inputSize="sm"
                  />
                </div>
              </Card>

              {/* Exclusion filters */}
              <Card>
                <p className="mb-3 text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                  Exclude from results
                </p>
                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                  <Input
                    label="Exclude Keywords"
                    placeholder="e.g. intern, fresher"
                    value={filters.excludeKeywords || ''}
                    onChange={(e) =>
                      handleFilterChange('excludeKeywords', e.target.value || undefined)
                    }
                    inputSize="sm"
                  />
                  <ServerAutoSuggest
                    category="company"
                    label="Exclude Company"
                    placeholder="e.g. CompetitorCo"
                    value={filters.excludeCompany || ''}
                    onChange={(v) =>
                      handleFilterChange(
                        'excludeCompany',
                        (typeof v === 'string' ? v : v[0]) || undefined,
                      )
                    }
                    allowCreate
                    inputSize="sm"
                  />
                  <ServerAutoSuggest
                    category="location"
                    label="Exclude Location"
                    placeholder="e.g. City to exclude"
                    value={filters.excludeLocation || ''}
                    onChange={(v) =>
                      handleFilterChange(
                        'excludeLocation',
                        (typeof v === 'string' ? v : v[0]) || undefined,
                      )
                    }
                    allowCreate
                    inputSize="sm"
                  />
                </div>
              </Card>

              {/* Certifications */}
              <Card>
                <h3 className="mb-3 text-base font-semibold text-[var(--text)]">Certifications</h3>
                <ServerAutoSuggest
                  category="certification"
                  value={filters.certifications ? filters.certifications.split(',') : []}
                  onChange={(vals) =>
                    handleFilterChange(
                      'certifications',
                      Array.isArray(vals) ? vals.join(',') : vals,
                    )
                  }
                  placeholder="Search certifications..."
                  multiple
                  maxSelections={10}
                />
              </Card>

              {/* Professional Search */}
              <Card>
                <h3 className="mb-3 text-base font-semibold text-[var(--text)]">
                  Professional Search
                </h3>
                <p className="mb-4 text-sm text-[var(--text-muted)]">
                  Search for specific education, skills, or designations
                </p>
                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                  <Input
                    label="Education"
                    placeholder="e.g. B.Tech, MBA"
                    value={filters.education || ''}
                    onChange={(e) => handleFilterChange('education', e.target.value || undefined)}
                    inputSize="sm"
                  />
                  <Input
                    label="IT Skill"
                    placeholder="e.g. Python, AWS"
                    value={filters.itSkill || ''}
                    onChange={(e) => handleFilterChange('itSkill', e.target.value || undefined)}
                    inputSize="sm"
                  />
                  <Input
                    label="Designation"
                    placeholder="e.g. Senior Engineer"
                    value={filters.designation || ''}
                    onChange={(e) => handleFilterChange('designation', e.target.value || undefined)}
                    inputSize="sm"
                  />
                </div>
              </Card>

              {/* Activity Dates */}
              <Card>
                <h3 className="mb-3 text-base font-semibold text-[var(--text)]">Activity Dates</h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                      Registered After
                    </label>
                    <DatePicker
                      value={filters.registeredAfter || ''}
                      onChange={(val) => handleFilterChange('registeredAfter', val || undefined)}
                      maxDate={new Date()}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[var(--text)]">
                      Modified After
                    </label>
                    <DatePicker
                      value={filters.modifiedAfter || ''}
                      onChange={(val) => handleFilterChange('modifiedAfter', val || undefined)}
                      maxDate={new Date()}
                    />
                  </div>
                </div>
              </Card>

              {/* Radius Search */}
              <Card>
                <h3 className="mb-3 text-base font-semibold text-[var(--text)]">Radius Search</h3>
                <p className="mb-4 text-sm text-[var(--text-muted)]">
                  Search candidates within a specific radius of a location
                </p>
                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                  <Input
                    label="Latitude"
                    type="number"
                    step="0.000001"
                    placeholder="e.g. 28.6139"
                    value={filters.latitude || ''}
                    onChange={(e) => handleFilterChange('latitude', e.target.value || undefined)}
                    inputSize="sm"
                  />
                  <Input
                    label="Longitude"
                    type="number"
                    step="0.000001"
                    placeholder="e.g. 77.2090"
                    value={filters.longitude || ''}
                    onChange={(e) => handleFilterChange('longitude', e.target.value || undefined)}
                    inputSize="sm"
                  />
                  <Input
                    label="Radius (km)"
                    type="number"
                    min="1"
                    max="1000"
                    placeholder="e.g. 50"
                    value={filters.radiusKm || ''}
                    onChange={(e) => handleFilterChange('radiusKm', e.target.value || undefined)}
                    inputSize="sm"
                  />
                </div>
                {filters.latitude && filters.longitude && filters.radiusKm && (
                  <p className="mt-2 text-xs text-[var(--success)]">
                    Searching within {filters.radiusKm}km of ({filters.latitude},{' '}
                    {filters.longitude})
                  </p>
                )}
              </Card>

              {/* Region Presets */}
              <Card>
                <p className="mb-3 text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                  Quick Location Presets
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(BROAD_REGION_PRESETS).map(([key, preset]) => {
                    const isActive =
                      preset.special === 'clear'
                        ? !filters.location
                        : (preset.cities?.some((c) => filters.location === c) ?? false);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          if (preset.special === 'clear') {
                            handleFilterChange('location', undefined);
                            setLocationQuery('');
                          } else if (preset.special === 'international') {
                            handleFilterChange('location', 'International');
                            setLocationQuery('International');
                          } else if (preset.cities) {
                            if (isActive) {
                              handleFilterChange('location', undefined);
                              setLocationQuery('');
                            } else {
                              handleFilterChange('location', preset.cities[0]);
                              setLocationQuery(preset.cities[0]);
                            }
                          }
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          isActive
                            ? 'bg-primary text-white'
                            : 'border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(INDIAN_REGION_PRESETS).map(([region, cities]) => {
                    const isActive = cities.some((c) => filters.location === c);
                    return (
                      <button
                        key={region}
                        type="button"
                        onClick={() => {
                          if (isActive) {
                            handleFilterChange('location', undefined);
                            setLocationQuery('');
                          } else {
                            handleFilterChange('location', cities[0]);
                            setLocationQuery(cities[0]);
                          }
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          isActive
                            ? 'bg-primary text-white'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                        }`}
                      >
                        {region}
                      </button>
                    );
                  })}
                </div>
              </Card>

              {/* Education, certifications, department, industry, work permit */}
              <Card>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <ServerAutoSuggest
                    category="field_of_study"
                    label="Education"
                    placeholder="e.g. B.Tech, MBA"
                    value={filters.education || ''}
                    onChange={(v) =>
                      handleFilterChange(
                        'education',
                        (typeof v === 'string' ? v : v[0]) || undefined,
                      )
                    }
                    allowCreate
                    inputSize="sm"
                  />
                  <Select
                    label="Education Level"
                    options={toSelectOptions(EDUCATION_LEVEL_SEARCH_LABELS)}
                    value={filters.educationLevel || ''}
                    onChange={(v) => handleFilterChange('educationLevel', v || undefined)}
                    placeholder="Any level"
                    searchable
                  />
                  <ServerAutoSuggest
                    category="certification"
                    label="Certifications"
                    placeholder="e.g. AWS, PMP"
                    value={filters.certifications || ''}
                    onChange={(v) =>
                      handleFilterChange(
                        'certifications',
                        (typeof v === 'string' ? v : v[0]) || undefined,
                      )
                    }
                    allowCreate
                    inputSize="sm"
                  />
                  <ServerAutoSuggest
                    category="department"
                    label="Department"
                    placeholder="e.g. Engineering"
                    value={filters.department || ''}
                    onChange={(v) =>
                      handleFilterChange(
                        'department',
                        (typeof v === 'string' ? v : v[0]) || undefined,
                      )
                    }
                    allowCreate
                    inputSize="sm"
                  />
                  <ServerAutoSuggest
                    category="industry"
                    label="Industry"
                    placeholder="e.g. IT, Finance"
                    value={filters.currentIndustry || ''}
                    onChange={(v) =>
                      handleFilterChange(
                        'currentIndustry',
                        (typeof v === 'string' ? v : v[0]) || undefined,
                      )
                    }
                    allowCreate
                    inputSize="sm"
                  />
                  <ServerAutoSuggest
                    category="visa_status"
                    label="Work Permit / Visa"
                    placeholder="e.g. Indian Citizen, H-1B Visa"
                    value={filters.workPermit || ''}
                    onChange={(v) =>
                      handleFilterChange(
                        'workPermit',
                        (typeof v === 'string' ? v : v[0]) || undefined,
                      )
                    }
                    allowCreate
                    inputSize="sm"
                  />
                </div>
              </Card>

              {/* Profile freshness date filters */}
              <Card>
                <p className="mb-3 text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                  Registration Date Presets
                </p>
                <div className="mb-4 flex flex-wrap gap-2">
                  {[
                    { label: 'Last 24h', days: 1 },
                    { label: 'Last 7 days', days: 7 },
                    { label: 'Last 30 days', days: 30 },
                    { label: 'Last 90 days', days: 90 },
                  ].map(({ label, days }) => {
                    const targetDate = new Date();
                    targetDate.setDate(targetDate.getDate() - days);
                    const dateStr = targetDate.toISOString().split('T')[0];
                    const isActive = filters.registeredAfter === dateStr;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() =>
                          handleFilterChange('registeredAfter', isActive ? undefined : dateStr)
                        }
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                          isActive
                            ? 'bg-primary text-white'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]',
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <DatePicker
                    label="Registered After"
                    value={filters.registeredAfter || ''}
                    onChange={(v) => handleFilterChange('registeredAfter', v || undefined)}
                    inputSize="sm"
                    placeholder="Select date"
                    maxDate={new Date()}
                  />
                  <DatePicker
                    label="Profile Modified After"
                    value={filters.modifiedAfter || ''}
                    onChange={(v) => handleFilterChange('modifiedAfter', v || undefined)}
                    inputSize="sm"
                    placeholder="Select date"
                    maxDate={new Date()}
                  />
                </div>
              </Card>

              {/* Proximity search (geo) */}
              <Card>
                <div className="mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[var(--text-secondary)]" />
                  <p className="text-xs font-semibold tracking-wider text-[var(--text-secondary)] uppercase">
                    Proximity Search
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                      Search near location
                    </label>
                    <div className="flex items-center gap-2">
                      <Tooltip content="Detect my location">
                        <button
                          type="button"
                          onClick={handleGetLocation}
                          disabled={isGettingLocation}
                          className="hover:border-primary hover:text-primary hover:bg-primary-light flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors disabled:opacity-50"
                        >
                          {isGettingLocation ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Locate className="h-4 w-4" />
                          )}
                          {filters.latitude ? 'Update location' : 'Use my location'}
                        </button>
                      </Tooltip>
                      {filters.latitude && (
                        <Tooltip content="Clear location">
                          <button
                            type="button"
                            onClick={clearGeoLocation}
                            className="cursor-pointer text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--error)]"
                          >
                            Clear
                          </button>
                        </Tooltip>
                      )}
                    </div>
                    {geoLocationName && filters.latitude && (
                      <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                        Detected: {geoLocationName}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                      Radius
                    </label>
                    <Select
                      options={[
                        { value: '5', label: '5 km' },
                        { value: '10', label: '10 km' },
                        { value: '25', label: '25 km' },
                        { value: '50', label: '50 km' },
                        { value: '100', label: '100 km' },
                        { value: '200', label: '200 km' },
                      ]}
                      value={filters.radiusKm || ''}
                      onChange={(v) => handleFilterChange('radiusKm', v || undefined)}
                      placeholder="Select radius"
                      disabled={!filters.latitude}
                    />
                  </div>
                </div>
                {nearbyCities.length > 0 && (
                  <div className="mt-4 border-t border-[var(--border)] pt-3">
                    <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
                      Nearby Cities
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {nearbyCities.map((city) => (
                        <button
                          key={city}
                          type="button"
                          onClick={() => {
                            handleFilterChange('location', city);
                            setLocationQuery(city);
                          }}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                            filters.location === city
                              ? 'bg-primary text-white'
                              : 'hover:bg-primary-light hover:text-primary bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                          }`}
                        >
                          {city}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Card>

              {/* Advanced Filters Panel — moved from the old main-
                  column "below the toolbar" position into the
                  sidebar so the categorized filter sections live
                  alongside the inline filter cards above. `layout`
                  switches to "sidebar" (always-visible vertical
                  accordion variant) and `isOpen` is hard-coded
                  true — no inline collapse on desktop. The mobile
                  show/hide is now handled by the `showAdvanced`
                  class swap on the `<aside>` itself, so this
                  component doesn't need an `onClose` either. */}
              <AdvancedFilters
                sections={filterSections}
                values={filterValues}
                onChange={handleFilterChange}
                onClear={clearFilters}
                activeCount={activeFilterCount}
                isOpen
                layout="sidebar"
                title="Advanced Filters"
              />

              {/* Quick Filter Pills — moved into the sidebar so the
                  one-tap shortcuts live next to the rest of the
                  filter controls instead of floating in the
                  results column. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  Quick filters:
                </span>
                <button
                  onClick={() =>
                    handleFilterChange(
                      'lastActiveWithin',
                      filters.lastActiveWithin === '7d' ? undefined : '7d',
                    )
                  }
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    filters.lastActiveWithin === '7d'
                      ? 'bg-primary text-white'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]',
                  )}
                >
                  Active last 7 days
                </button>
                <button
                  onClick={() =>
                    handleFilterChange(
                      'noticePeriod',
                      filters.noticePeriod === 'IMMEDIATE' ? undefined : 'IMMEDIATE',
                    )
                  }
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    filters.noticePeriod === 'IMMEDIATE'
                      ? 'bg-primary text-white'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]',
                  )}
                >
                  Immediate joiners
                </button>
                <button
                  onClick={() =>
                    handleFilterChange(
                      'openToWork',
                      filters.openToWork === 'ACTIVELY_LOOKING' ? undefined : 'ACTIVELY_LOOKING',
                    )
                  }
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    filters.openToWork === 'ACTIVELY_LOOKING'
                      ? 'bg-primary text-white'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]',
                  )}
                >
                  Open to work
                </button>
              </div>
            </aside>

            {/* Main results column — Active filter tags, search
                history, toolbar, save-search dialog, bulk-actions
                bar, results grid + pagination. Closes before the
                Modal/Compare overlays at the page bottom. */}
            <div className="min-w-0 flex-1 space-y-4">
              {/* Active filter tags */}
              <ActiveFilterTags
                sections={filterSections}
                values={filterValues}
                onChange={handleFilterChange}
                onClear={clearFilters}
              />

              {/* Search History */}
              {searchHistory.length > 0 && !keyword && activeFilterCount === 0 && (
                <Card>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[var(--text)]">Recent Searches</h3>
                    <Tooltip content="Clear search history">
                      <button
                        onClick={async () => {
                          await searchService.clearSearchHistory();
                          queryClient.invalidateQueries({ queryKey: ['search-history'] });
                        }}
                        className="cursor-pointer text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--error)]"
                      >
                        Clear all
                      </button>
                    </Tooltip>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {searchHistory.slice(0, 8).map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          if (item.query) {
                            setKeyword(item.query);
                            setFilters((prev) => ({
                              ...prev,
                              keyword: item.query,
                              page: '1',
                            }));
                          }
                        }}
                        className="hover:border-primary hover:bg-primary-light hover:text-primary flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors"
                      >
                        <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                        <span>{item.query || 'Previous search'}</span>
                      </button>
                    ))}
                  </div>
                </Card>
              )}

              {/* Toolbar */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  {/* Mobile-only filter trigger. On desktop the
                  filters sidebar is always visible to the left,
                  so this button is hidden via `lg:hidden`. On
                  mobile it toggles `showAdvanced` which swaps the
                  aside's `hidden`/`block` class so the same filter
                  DOM appears in-line above the results (no separate
                  drawer — single source of filter UI). The
                  PremiumLockBadge gate is preserved so non-premium
                  employers still get the upgrade prompt. */}
                  <PremiumLockBadge feature="feature.advanced_filters" variant="inline">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      tooltip={showAdvanced ? 'Hide filters' : 'Show filters'}
                      className="lg:hidden"
                    >
                      <Filter className="mr-1.5 h-4 w-4" />
                      {showAdvanced ? 'Hide filters' : 'Filters'}
                      {activeFilterCount > 0 && (
                        <span className="bg-primary ml-1.5 flex h-5 w-5 items-center justify-center rounded-full text-xs text-white">
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>
                  </PremiumLockBadge>
                  {activeFilterCount > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSaveSearch(true)}
                        tooltip="Create candidate alert"
                      >
                        <Bell className="mr-1.5 h-4 w-4" />
                        Create Alert
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSaveSearch(true)}
                        tooltip="Save search criteria"
                      >
                        <Star className="mr-1.5 h-4 w-4" />
                        Save Search
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {/* View Mode Toggle */}
                  <div className="flex rounded-lg border border-[var(--border)] bg-white p-0.5">
                    <Tooltip content="List view">
                      <button
                        onClick={() => setViewMode('list')}
                        className={cn(
                          'cursor-pointer rounded-md p-1.5 transition-colors',
                          viewMode === 'list'
                            ? 'bg-primary text-white'
                            : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]',
                        )}
                        aria-label="List view"
                      >
                        <LayoutList className="h-4 w-4" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Compact view">
                      <button
                        onClick={() => setViewMode('compact')}
                        className={cn(
                          'cursor-pointer rounded-md p-1.5 transition-colors',
                          viewMode === 'compact'
                            ? 'bg-primary text-white'
                            : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]',
                        )}
                        aria-label="Compact view"
                      >
                        <LayoutGrid className="h-4 w-4" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Map view">
                      <button
                        onClick={() => setViewMode('map')}
                        className={cn(
                          'cursor-pointer rounded-md p-1.5 transition-colors',
                          viewMode === 'map'
                            ? 'bg-primary text-white'
                            : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]',
                        )}
                        aria-label="Map view"
                      >
                        <Map className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </div>
                  {/* Sort Dropdown */}
                  <div className="flex items-center gap-2">
                    <label className="hidden shrink-0 text-sm whitespace-nowrap text-[var(--text-muted)] sm:inline">
                      Sort by:
                    </label>
                    <Select
                      options={[
                        { value: 'relevance', label: 'Best Match' },
                        { value: 'profileUpdated', label: 'Recently Updated' },
                        { value: 'lastActive', label: 'Recently Active' },
                        { value: 'experience', label: 'Experience: High to Low' },
                        { value: 'experience_asc', label: 'Experience: Low to High' },
                        { value: 'salary', label: 'Salary: High to Low' },
                        { value: 'salary_asc', label: 'Salary: Low to High' },
                        ...(filters.latitude
                          ? [{ value: 'distance', label: 'Nearest First' }]
                          : []),
                      ]}
                      value={filters.sortBy || 'relevance'}
                      onChange={(v) => handleFilterChange('sortBy', v || undefined)}
                    />
                  </div>
                  {pagination && (
                    <span className="text-sm whitespace-nowrap text-[var(--text-muted)]">
                      {pagination.total.toLocaleString()} candidates found
                    </span>
                  )}
                </div>
              </div>

              {/* Save Search Dialog */}
              {showSaveSearch && (
                <Card>
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="mb-1.5 block text-sm font-medium text-[var(--text)]">
                        Save this search
                      </label>
                      <input
                        type="text"
                        placeholder="Name your search, e.g. 'Senior React developers'"
                        value={saveSearchName}
                        onChange={(e) => setSaveSearchName(e.target.value)}
                        className="focus:border-primary focus:ring-primary/20 h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && saveSearchName.trim()) {
                            saveSearchMutation.mutate(saveSearchName.trim());
                          }
                        }}
                      />
                    </div>
                    <Button
                      onClick={() => saveSearchMutation.mutate(saveSearchName.trim())}
                      disabled={!saveSearchName.trim()}
                      isLoading={saveSearchMutation.isPending}
                      size="sm"
                      tooltip="Save search"
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowSaveSearch(false);
                        setSaveSearchName('');
                      }}
                      tooltip="Cancel save"
                    >
                      Cancel
                    </Button>
                  </div>
                </Card>
              )}

              {/* Bulk Actions Toolbar */}
              {selectedIds.size > 0 && (
                <Card className="border-primary bg-primary/5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Tooltip content="Toggle select all">
                        <button
                          onClick={() => {
                            if (selectedIds.size === candidates.length) {
                              clearSelection();
                            } else {
                              selectAll();
                            }
                          }}
                          className="text-primary hover:text-primary-dark flex cursor-pointer items-center gap-1.5 text-sm font-medium"
                        >
                          {selectedIds.size === candidates.length ? (
                            <CheckSquare className="h-4 w-4" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                          {selectedIds.size === candidates.length ? 'Deselect' : 'Select'} all on
                          page
                        </button>
                      </Tooltip>
                      <span className="text-sm font-medium text-[var(--text)]">
                        {selectedIds.size} candidate{selectedIds.size !== 1 ? 's' : ''} selected
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const userIds = candidates
                            .filter((c) => selectedIds.has(c.id))
                            .map((c) => c.userId);
                          bulkSaveMutation.mutate(userIds);
                        }}
                        disabled={bulkSaveMutation.isPending}
                        tooltip="Save selected"
                      >
                        <Bookmark className="mr-1.5 h-4 w-4" />
                        Save All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBulkActionOpen(true)}
                        tooltip="Shortlist selected"
                      >
                        <UserCheck className="mr-1.5 h-4 w-4" />
                        Shortlist
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => bulkExportMutation.mutate(Array.from(selectedIds))}
                        disabled={bulkExportMutation.isPending}
                        isLoading={bulkExportMutation.isPending}
                        tooltip="Export as XLSX"
                      >
                        <Download className="mr-1.5 h-4 w-4" />
                        Export
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleBulkUnlock()}
                        disabled={bulkUnlocking}
                        isLoading={bulkUnlocking}
                        tooltip="Unlock contacts & resumes — 1 CV unlock per locked candidate"
                      >
                        <Lock className="mr-1.5 h-4 w-4" />
                        Unlock
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => bulkExportResumesMutation.mutate(Array.from(selectedIds))}
                        disabled={bulkExportResumesMutation.isPending}
                        isLoading={bulkExportResumesMutation.isPending}
                        tooltip="Export resumes as ZIP"
                      >
                        <FileDown className="mr-1.5 h-4 w-4" />
                        Export Resumes
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearSelection}
                        tooltip="Clear selection"
                      >
                        <X className="mr-1.5 h-4 w-4" />
                        Clear
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* Results */}
              {viewMode === 'map' ? (
                <div className="h-[calc(100vh-350px)] min-h-[600px]">
                  <CandidateMapView
                    candidates={candidates}
                    savedCandidateIds={savedCandidateIds}
                    onSaveCandidate={(id) => toggleSaveMutation.mutate(id)}
                    onSearchArea={handleSearchArea}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <Card key={i}>
                        <Skeleton variant="card" />
                      </Card>
                    ))
                  ) : candidates.length > 0 ? (
                    candidates.map((candidate) => {
                      const card =
                        viewMode === 'compact' ? (
                          <CompactCandidateCard
                            key={candidate.id}
                            candidate={candidate}
                            searchKeyword={keyword}
                            requiredSkills={requiredSkills}
                            isSaved={savedCandidateIds.has(candidate.userId)}
                            onToggleSave={() => toggleSaveMutation.mutate(candidate.userId)}
                            isSaving={
                              toggleSaveMutation.isPending &&
                              toggleSaveMutation.variables === candidate.userId
                            }
                            isSelected={selectedIds.has(candidate.id)}
                            onToggleSelect={() => toggleSelect(candidate.id)}
                            isComparing={compareIds.includes(candidate.id)}
                            onToggleCompare={() => handleToggleCompare(candidate.id)}
                          />
                        ) : (
                          <CandidateCard
                            key={candidate.id}
                            candidate={candidate}
                            unlockedContact={unlockedMap[candidate.id]}
                            onUnlocked={(res) =>
                              setUnlockedMap((prev) => ({ ...prev, [candidate.id]: res }))
                            }
                            searchKeyword={keyword}
                            requiredSkills={requiredSkills}
                            isSaved={savedCandidateIds.has(candidate.userId)}
                            onToggleSave={() => toggleSaveMutation.mutate(candidate.userId)}
                            isSaving={
                              toggleSaveMutation.isPending &&
                              toggleSaveMutation.variables === candidate.userId
                            }
                            actionedStatus={actionedCandidates[candidate.id]}
                            onShortlist={() => openJobPicker(candidate.id, 'shortlist')}
                            onSelect={() => openJobPicker(candidate.id, 'select')}
                            onResumeDownload={() => handleResumeDownload(candidate.userId)}
                            isSelected={selectedIds.has(candidate.id)}
                            onToggleSelect={() => toggleSelect(candidate.id)}
                            isComparing={compareIds.includes(candidate.id)}
                            onToggleCompare={() => handleToggleCompare(candidate.id)}
                          />
                        );

                      return isTouchDevice ? (
                        <SwipeableCard
                          key={candidate.id}
                          enabled={true}
                          onSave={() => toggleSaveMutation.mutate(candidate.userId)}
                          onDismiss={() => {
                            // Track dismissed candidate (optional analytics)
                          }}
                        >
                          {card}
                        </SwipeableCard>
                      ) : (
                        <div key={candidate.id}>{card}</div>
                      );
                    })
                  ) : (
                    <EmptyState
                      icon={Search}
                      title="No candidates found"
                      description="Try adjusting your search criteria or filters."
                      action={
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={clearFilters}
                          tooltip="Clear all filters"
                        >
                          Clear Filters
                        </Button>
                      }
                    />
                  )}
                </div>
              )}

              {/* AI Recommendations */}
              {recommendedCandidates.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pt-4">
                    <WandSparkles className="text-primary h-4 w-4" />
                    <h3 className="text-sm font-semibold text-[var(--text)]">
                      Recommended for You
                    </h3>
                    <Badge variant="info" size="sm">
                      AI-Powered
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    Based on your recent open job postings and hiring patterns
                  </p>
                  <div className="space-y-4">
                    {recommendedCandidates.slice(0, 5).map((candidate) => {
                      const card =
                        viewMode === 'compact' ? (
                          <CompactCandidateCard
                            key={candidate.id}
                            candidate={candidate as CandidateProfile}
                            searchKeyword={keyword}
                            requiredSkills={requiredSkills}
                            isSaved={savedCandidateIds.has(candidate.userId)}
                            onToggleSave={() => toggleSaveMutation.mutate(candidate.userId)}
                            isSaving={
                              toggleSaveMutation.isPending &&
                              toggleSaveMutation.variables === candidate.userId
                            }
                            isSelected={selectedIds.has(candidate.id)}
                            onToggleSelect={() => toggleSelect(candidate.id)}
                            isComparing={compareIds.includes(candidate.id)}
                            onToggleCompare={() => handleToggleCompare(candidate.id)}
                          />
                        ) : (
                          <CandidateCard
                            key={candidate.id}
                            candidate={candidate as CandidateProfile}
                            unlockedContact={unlockedMap[candidate.id]}
                            onUnlocked={(res) =>
                              setUnlockedMap((prev) => ({ ...prev, [candidate.id]: res }))
                            }
                            searchKeyword={keyword}
                            requiredSkills={requiredSkills}
                            isSaved={savedCandidateIds.has(candidate.userId)}
                            onToggleSave={() => toggleSaveMutation.mutate(candidate.userId)}
                            isSaving={
                              toggleSaveMutation.isPending &&
                              toggleSaveMutation.variables === candidate.userId
                            }
                            actionedStatus={actionedCandidates[candidate.id]}
                            onShortlist={() => openJobPicker(candidate.id, 'shortlist')}
                            onSelect={() => openJobPicker(candidate.id, 'select')}
                            onResumeDownload={() => handleResumeDownload(candidate.userId)}
                            isSelected={selectedIds.has(candidate.id)}
                            onToggleSelect={() => toggleSelect(candidate.id)}
                            isComparing={compareIds.includes(candidate.id)}
                            onToggleCompare={() => handleToggleCompare(candidate.id)}
                          />
                        );
                      return <div key={candidate.id}>{card}</div>;
                    })}
                  </div>
                </div>
              )}

              {pagination && pagination.total > 0 && (
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.totalPages}
                  onPageChange={handlePageChange}
                  totalItems={pagination.total}
                  pageSize={Number(filters.limit) || PAGINATION.CANDIDATES_PER_PAGE}
                  onPageSizeChange={handlePageSizeChange}
                />
              )}
              {/* Job Picker Modal */}
              {jobPickerOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="w-full max-w-lg rounded-xl bg-[var(--bg)] shadow-xl">
                    <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
                      <h3 className="text-lg font-semibold text-[var(--text)]">
                        {jobPickerAction === 'shortlist' ? 'Shortlist' : 'Select'} for Job
                      </h3>
                      <Tooltip content="Close">
                        <button
                          onClick={() => setJobPickerOpen(false)}
                          aria-label="Close"
                          className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text)]"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </Tooltip>
                    </div>
                    <div className="p-4">
                      <div className="relative mb-3">
                        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                        <input
                          type="text"
                          placeholder="Search your jobs..."
                          value={jobSearch}
                          onChange={(e) => setJobSearch(e.target.value)}
                          className="focus:border-primary w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] py-2 pr-3 pl-10 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none"
                        />
                      </div>
                      <div data-lenis-prevent className="max-h-72 space-y-1 overflow-y-auto">
                        {(myJobsData?.data?.items || [])
                          .filter(
                            (job: { title: string; status: string }) =>
                              job.status === 'OPEN' &&
                              job.title.toLowerCase().includes(jobSearch.toLowerCase()),
                          )
                          .map((job: { id: string; title: string; location: string }) => (
                            <Tooltip key={job.id} content={`Select ${job.title}`}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (jobPickerAction === 'shortlist') {
                                    shortlistMutation.mutate({
                                      candidateId: jobPickerCandidateId,
                                      jobId: job.id,
                                    });
                                  } else {
                                    selectMutation.mutate({
                                      candidateId: jobPickerCandidateId,
                                      jobId: job.id,
                                    });
                                  }
                                }}
                                disabled={shortlistMutation.isPending || selectMutation.isPending}
                                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                              >
                                <div>
                                  <p className="font-medium text-[var(--text)]">{job.title}</p>
                                  <p className="text-xs text-[var(--text-muted)]">{job.location}</p>
                                </div>
                              </button>
                            </Tooltip>
                          ))}
                        {(myJobsData?.data?.items || []).filter(
                          (job: { status: string; title: string }) =>
                            job.status === 'OPEN' &&
                            job.title.toLowerCase().includes(jobSearch.toLowerCase()),
                        ).length === 0 && (
                          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
                            No open jobs found.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* /main column */}
          </div>
          {/* /sidebar + main flex container */}

          {/* Comparison Features — overlays / sticky bars that
              sit on top of the page, outside the sidebar+main
              flex container so they span the full viewport. */}
          <CompareBar
            candidates={compareCandidates}
            onRemove={(id) => setCompareIds((prev) => prev.filter((cid) => cid !== id))}
            onClear={() => setCompareIds([])}
            onCompare={() => setShowCompare(true)}
          />

          <CompareModal
            isOpen={showCompare}
            onClose={() => setShowCompare(false)}
            candidates={compareCandidates}
            onRemove={(id) => {
              setCompareIds((prev) => prev.filter((cid) => cid !== id));
              if (compareCandidates.length <= 1) {
                setShowCompare(false);
              }
            }}
          />
        </div>
      </PlanGate>
    </DashboardLayout>
  );
}

function CandidateCard({
  candidate,
  searchKeyword,
  requiredSkills,
  isSaved,
  onToggleSave,
  isSaving,
  actionedStatus,
  onShortlist,
  onSelect,
  onResumeDownload,
  isSelected,
  onToggleSelect,
  isComparing,
  onToggleCompare,
  unlockedContact,
  onUnlocked,
}: {
  candidate: CandidateProfile;
  searchKeyword?: string;
  requiredSkills?: Set<string>;
  isSaved: boolean;
  onToggleSave: () => void;
  isSaving: boolean;
  actionedStatus?: 'shortlisted' | 'selected';
  onShortlist: () => void;
  onSelect: () => void;
  onResumeDownload: () => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  isComparing?: boolean;
  onToggleCompare?: () => void;
  /** Contact revealed via a card/bulk unlock this session. */
  unlockedContact?: UnlockResult;
  onUnlocked?: (result: UnlockResult) => void;
}) {
  const [contactOpen, setContactOpen] = useState(false);
  // Prefer the freshly-unlocked contacts — the cached search payload
  // still carries stripped fields for up to 60s after an unlock.
  const contactEmail = unlockedContact?.email || candidate.user?.email;
  const contactPhone = unlockedContact?.phone || candidate.user?.mobileNumber || candidate.phone;
  const contactWhatsapp = candidate.user?.whatsappNumber || contactPhone;
  const isContactLocked =
    candidate.contactUnlocked === false && !unlockedContact && !contactEmail && !contactPhone;
  const name = candidate.user
    ? `${candidate.user.firstName || ''} ${candidate.user.lastName || ''}`.trim()
    : 'Anonymous';

  const lastActive = candidate.user?.lastActiveAt;
  const isRecentlyActive = (() => {
    const ts = lastActive ? new Date(lastActive) : new Date(candidate.updatedAt);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    return ts >= fourteenDaysAgo;
  })();

  // Calculate skill match percentage
  const skillMatchCount =
    requiredSkills && requiredSkills.size && candidate.skills?.length
      ? candidate.skills.filter((s) => requiredSkills.has(s.toLowerCase())).length
      : 0;
  const skillMatchPct =
    requiredSkills && requiredSkills.size
      ? Math.round((skillMatchCount / requiredSkills.size) * 100)
      : 0;

  return (
    <Card
      className={cn(
        'hover:border-primary/20 transition-all hover:shadow-sm',
        isSelected && 'border-primary bg-primary/5',
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 gap-3">
          {onToggleSelect && (
            <button
              onClick={onToggleSelect}
              className="mt-1 shrink-0"
              aria-label={isSelected ? 'Deselect candidate' : 'Select candidate'}
            >
              {isSelected ? (
                <CheckSquare className="text-primary h-5 w-5" />
              ) : (
                <Square className="hover:text-primary h-5 w-5 text-[var(--text-muted)]" />
              )}
            </button>
          )}
          <div className="bg-primary-light flex h-12 w-12 shrink-0 items-center justify-center rounded-full">
            {candidate.user?.avatar ? (
              <img
                src={candidate.user.avatar}
                alt={
                  candidate.user?.firstName
                    ? `${candidate.user.firstName}'s photo`
                    : 'Candidate photo'
                }
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <User className="text-primary h-6 w-6" />
            )}
          </div>
          <div className="min-w-0">
            <Link
              href={ROUTES.EMPLOYER.CANDIDATE_DETAIL(candidate.id)}
              className="hover:text-primary flex items-center gap-2 font-semibold text-[var(--text)] hover:underline"
            >
              <HighlightText text={name} highlight={searchKeyword} />
              <PresenceIndicator userId={candidate.userId} />
              <VerifiedBadge
                isVerified={Boolean(
                  (candidate as unknown as { hasVerifiedBadge?: boolean }).hasVerifiedBadge,
                )}
                size="sm"
              />
            </Link>
            {candidate.headline && (
              <p className="text-sm text-[var(--text-secondary)]">
                <HighlightText text={candidate.headline} highlight={searchKeyword} />
              </p>
            )}
            {/* Special Badges */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {candidate.noticePeriod === 'IMMEDIATE' && (
                <Badge variant="success" size="sm">
                  ⚡ Immediate Joiner
                </Badge>
              )}
              {candidate.workStatus === 'ACTIVELY_LOOKING' && (
                <Badge variant="info" size="sm">
                  🔍 Actively Looking
                </Badge>
              )}
              {candidate.openToWork === 'OPEN_TO_OFFERS' && (
                <Badge variant="info" size="sm">
                  💼 Open to Offers
                </Badge>
              )}
              {isRecentlyActive && (
                <Badge variant="warning" size="sm">
                  🕒 Recently Active
                </Badge>
              )}
              {candidate.willingToRelocate && (
                <Badge variant="neutral" size="sm">
                  📍 Open to Relocation
                </Badge>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
              {candidate.currentLocation && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {candidate.currentLocation}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" /> {candidate.experienceYears} yrs exp
              </span>
              {candidate.currentCompany && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" /> {candidate.currentCompany}
                </span>
              )}
              {candidate.currentRole && (
                <span className="flex items-center gap-1">{candidate.currentRole}</span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {candidate.workStatus && WORK_STATUS_LABELS[candidate.workStatus] && (
                <Badge
                  variant={candidate.workStatus === 'ACTIVELY_LOOKING' ? 'success' : 'neutral'}
                  size="sm"
                >
                  {WORK_STATUS_LABELS[candidate.workStatus]}
                </Badge>
              )}
              {candidate.noticePeriod && (
                <Badge variant="info" size="sm">
                  {NOTICE_PERIOD_LABELS[candidate.noticePeriod]}
                </Badge>
              )}
              {candidate.preferredWorkMode?.map((mode) => (
                <Badge key={mode} variant="neutral" size="sm">
                  {WORK_MODE_LABELS[mode]}
                </Badge>
              ))}
              <Badge variant={isRecentlyActive ? 'success' : 'neutral'} size="sm">
                <Activity className="mr-0.5 h-3 w-3" />
                {lastActive
                  ? `Active ${formatRelativeDate(lastActive)}`
                  : isRecentlyActive
                    ? 'Active'
                    : 'Inactive'}
              </Badge>
            </div>

            {/* Activity timestamps */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-[var(--text-muted)]">
              {candidate.updatedAt && (
                <span className="flex items-center gap-0.5">
                  <Pencil className="h-2.5 w-2.5" /> Modified{' '}
                  {formatRelativeDate(candidate.updatedAt)}
                </span>
              )}
            </div>

            {/* Skill Match Badge */}
            {skillMatchCount > 0 && requiredSkills && requiredSkills.size > 0 && (
              <div className="mt-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    skillMatchPct >= 70
                      ? 'bg-emerald-50 text-emerald-700'
                      : skillMatchPct >= 40
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-100 text-slate-600',
                  )}
                >
                  <CheckCircle className="h-3 w-3" />
                  {skillMatchCount}/{requiredSkills.size} skills match ({skillMatchPct}%)
                </span>
              </div>
            )}

            {(candidate.skills?.length ?? 0) > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {candidate.skills.slice(0, 6).map((skill) => {
                  const isMatch =
                    searchKeyword &&
                    searchKeyword
                      .toLowerCase()
                      .split(/[\s,]+/)
                      .some((t) => t.length > 1 && skill.toLowerCase().includes(t));
                  return (
                    <Tag
                      key={skill}
                      label={skill}
                      size="sm"
                      variant={isMatch ? 'success' : 'primary'}
                    />
                  );
                })}
                {candidate.skills.length > 6 && (
                  <Tag label={`+${candidate.skills.length - 6}`} size="sm" />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {actionedStatus && (
            <Badge variant="success" size="sm">
              {actionedStatus === 'shortlisted' ? 'Shortlisted' : 'Selected'}
            </Badge>
          )}
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Tooltip content="Shortlist for a job">
              <button
                type="button"
                onClick={onShortlist}
                className={cn(
                  'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  actionedStatus === 'shortlisted'
                    ? 'border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]'
                    : 'hover:border-primary hover:text-primary hover:bg-primary-light border-[var(--border)] text-[var(--text-secondary)]',
                )}
              >
                <Star
                  className={cn('h-3.5 w-3.5', actionedStatus === 'shortlisted' && 'fill-current')}
                />{' '}
                Shortlist
              </button>
            </Tooltip>
            <Tooltip content="Select for a job">
              <button
                type="button"
                onClick={onSelect}
                className={cn(
                  'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  actionedStatus === 'selected'
                    ? 'border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]'
                    : 'hover:border-primary hover:text-primary hover:bg-primary-light border-[var(--border)] text-[var(--text-secondary)]',
                )}
              >
                <UserCheck className="h-3.5 w-3.5" /> Select
              </button>
            </Tooltip>
            <div className="relative">
              <Tooltip content="Contact candidate">
                <button
                  type="button"
                  onClick={() => setContactOpen(!contactOpen)}
                  className="hover:border-primary hover:text-primary hover:bg-primary-light flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors"
                >
                  <Phone className="h-3.5 w-3.5" /> Contact <ChevronDown className="h-3 w-3" />
                </button>
              </Tooltip>
              {contactOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setContactOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute top-full right-0 z-50 mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1 shadow-lg">
                    {contactEmail && (
                      <a
                        href={`mailto:${contactEmail}`}
                        onClick={() => setContactOpen(false)}
                        className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                      >
                        <Mail className="h-3.5 w-3.5" /> Email
                      </a>
                    )}
                    {contactPhone && (
                      <a
                        href={`tel:${contactPhone}`}
                        onClick={() => setContactOpen(false)}
                        className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                      >
                        <Phone className="h-3.5 w-3.5" /> Call
                      </a>
                    )}
                    {contactWhatsapp && (
                      <a
                        href={`https://wa.me/${(contactWhatsapp || '').replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setContactOpen(false)}
                        className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                      >
                        <BrandIcon name="whatsapp" className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                    )}
                    {isContactLocked && (
                      <div className="space-y-1.5 p-2">
                        <p className="text-xs text-[var(--text-muted)]">
                          Unlock contact & resume (1 CV unlock)
                        </p>
                        <UnlockContactButton
                          compact
                          candidateId={candidate.userId ?? candidate.id}
                          onUnlocked={onUnlocked}
                        />
                      </div>
                    )}
                    {!isContactLocked && !contactEmail && !contactPhone && !contactWhatsapp && (
                      <p className="px-3 py-2 text-xs text-[var(--text-muted)]">
                        No contact info available
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip content={isSaved ? 'Unsave candidate' : 'Save candidate'}>
              <button
                type="button"
                onClick={onToggleSave}
                disabled={isSaving}
                aria-label={isSaved ? 'Unsave candidate' : 'Save candidate'}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                  isSaved
                    ? 'border-primary bg-primary-light text-primary'
                    : 'hover:border-primary hover:text-primary hover:bg-primary-light border-[var(--border)] text-[var(--text-secondary)]'
                }`}
              >
                <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
                {isSaved ? 'Saved' : 'Save'}
              </button>
            </Tooltip>
            {onToggleCompare && (
              <Tooltip content={isComparing ? 'Remove from comparison' : 'Add to comparison'}>
                <button
                  type="button"
                  onClick={onToggleCompare}
                  aria-label={isComparing ? 'Remove from comparison' : 'Add to comparison'}
                  className={`rounded-lg border p-2 transition-colors ${
                    isComparing
                      ? 'border-primary bg-primary-light text-primary'
                      : 'hover:border-primary hover:text-primary hover:bg-primary-light border-[var(--border)] text-[var(--text-secondary)]'
                  }`}
                >
                  <GitCompareArrows className="h-4 w-4" />
                </button>
              </Tooltip>
            )}
            {candidate.resume &&
              (isContactLocked ? (
                // Resume downloads follow the same contact paywall (resumes
                // embed contacts). When locked, surface the unlock prompt
                // instead of a download that would 403 — same dropdown the
                // Contact button opens (it reads "Unlock contact & resume").
                <Tooltip content="Unlock this candidate (1 CV unlock) to download their resume">
                  <button
                    type="button"
                    onClick={() => setContactOpen(true)}
                    className="hover:border-primary hover:text-primary hover:bg-primary-light flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors"
                  >
                    <Lock className="h-4 w-4" />
                    Resume
                  </button>
                </Tooltip>
              ) : (
                <Tooltip content="Download resume">
                  <button
                    type="button"
                    onClick={onResumeDownload}
                    className="hover:border-primary hover:text-primary hover:bg-primary-light flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors"
                  >
                    <FileText className="h-4 w-4" />
                    Resume
                  </button>
                </Tooltip>
              ))}
          </div>
          {candidate.expectedSalaryMin && (
            <p className="text-sm font-semibold text-[var(--text)]">
              {candidate.expectedSalaryMin.toLocaleString()}
              {candidate.expectedSalaryMax
                ? ` - ${candidate.expectedSalaryMax.toLocaleString()}`
                : '+'}
              <span className="text-xs font-normal text-[var(--text-muted)]">
                {' '}
                {candidate.salaryCurrency}/yr
              </span>
            </p>
          )}

          {/* Verification Status */}
          <div className="flex items-center gap-2">
            <Tooltip
              content={candidate.user?.isEmailVerified ? 'Email verified' : 'Email not verified'}
            >
              <span
                className="flex items-center gap-0.5 text-xs"
                aria-label={
                  candidate.user?.isEmailVerified ? 'Email verified' : 'Email not verified'
                }
              >
                <Mail className="h-3 w-3 text-[var(--text-muted)]" />
                {candidate.user?.isEmailVerified ? (
                  <CheckCircle className="h-3 w-3 text-[var(--success)]" />
                ) : (
                  <XCircle className="h-3 w-3 text-[var(--text-muted)]" />
                )}
              </span>
            </Tooltip>
            <Tooltip
              content={candidate.user?.isMobileVerified ? 'Mobile verified' : 'Mobile not verified'}
            >
              <span
                className="flex items-center gap-0.5 text-xs"
                aria-label={
                  candidate.user?.isMobileVerified ? 'Mobile verified' : 'Mobile not verified'
                }
              >
                <Phone className="h-3 w-3 text-[var(--text-muted)]" />
                {candidate.user?.isMobileVerified ? (
                  <CheckCircle className="h-3 w-3 text-[var(--success)]" />
                ) : (
                  <XCircle className="h-3 w-3 text-[var(--text-muted)]" />
                )}
              </span>
            </Tooltip>
            <Tooltip
              content={
                candidate.user?.isWhatsappVerified ? 'WhatsApp verified' : 'WhatsApp not verified'
              }
            >
              <span
                className="flex items-center gap-0.5 text-xs"
                aria-label={
                  candidate.user?.isWhatsappVerified ? 'WhatsApp verified' : 'WhatsApp not verified'
                }
              >
                <BrandIcon name="whatsapp" className="h-3 w-3 text-[var(--text-muted)]" />
                {candidate.user?.isWhatsappVerified ? (
                  <CheckCircle className="h-3 w-3 text-[var(--success)]" />
                ) : (
                  <XCircle className="h-3 w-3 text-[var(--text-muted)]" />
                )}
              </span>
            </Tooltip>
          </div>

          {candidate.user?.email && (
            <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <Mail className="h-3 w-3" /> {candidate.user.email}
            </span>
          )}
          {candidate.phone && (
            <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <Phone className="h-3 w-3" /> {candidate.phone}
            </span>
          )}

          {/* Profile Completeness */}
          <Tooltip content={`Profile ${candidate.profileCompleteness}% complete`}>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                <div
                  className={`h-full rounded-full transition-all ${
                    candidate.profileCompleteness >= 80
                      ? 'bg-[var(--success)]'
                      : candidate.profileCompleteness >= 50
                        ? 'bg-[var(--warning)]'
                        : 'bg-[var(--error)]'
                  }`}
                  style={{ width: `${candidate.profileCompleteness}%` }}
                />
              </div>
              <span className="text-[10px] font-medium text-[var(--text-muted)]">
                {candidate.profileCompleteness}%
              </span>
            </div>
          </Tooltip>

          <span className="text-xs text-[var(--text-muted)]">
            Updated {formatRelativeDate(candidate.updatedAt)}
          </span>
        </div>
      </div>
    </Card>
  );
}

function CompactCandidateCard({
  candidate,
  searchKeyword,
  requiredSkills,
  isSaved,
  onToggleSave,
  isSaving,
  isSelected,
  onToggleSelect,
  isComparing,
  onToggleCompare,
}: {
  candidate: CandidateProfile;
  searchKeyword?: string;
  requiredSkills?: Set<string>;
  isSaved: boolean;
  onToggleSave: () => void;
  isSaving: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  isComparing?: boolean;
  onToggleCompare?: () => void;
}) {
  const name = candidate.user
    ? `${candidate.user.firstName || ''} ${candidate.user.lastName || ''}`.trim()
    : 'Anonymous';

  // Calculate skill match percentage
  const skillMatchCount =
    requiredSkills && requiredSkills.size && candidate.skills?.length
      ? candidate.skills.filter((s) => requiredSkills.has(s.toLowerCase())).length
      : 0;
  const skillMatchPct =
    requiredSkills && requiredSkills.size
      ? Math.round((skillMatchCount / requiredSkills.size) * 100)
      : 0;

  return (
    <Card
      className={cn(
        'hover:border-primary/20 transition-all hover:shadow-sm',
        isSelected && 'border-primary bg-primary/5',
      )}
    >
      <div className="flex items-center gap-3">
        {/* Checkbox */}
        {onToggleSelect && (
          <button
            onClick={onToggleSelect}
            className="shrink-0"
            aria-label={isSelected ? 'Deselect candidate' : 'Select candidate'}
          >
            {isSelected ? (
              <CheckSquare className="text-primary h-5 w-5" />
            ) : (
              <Square className="hover:text-primary h-5 w-5 text-[var(--text-muted)]" />
            )}
          </button>
        )}

        {/* Avatar */}
        <div className="bg-primary-light flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
          {candidate.user?.avatar ? (
            <img
              src={candidate.user.avatar}
              alt={name}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <User className="text-primary h-5 w-5" />
          )}
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
          {/* Left: Name + metadata */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                href={ROUTES.EMPLOYER.CANDIDATE_DETAIL(candidate.id)}
                className="hover:text-primary truncate font-semibold text-[var(--text)] hover:underline"
              >
                <HighlightText text={name} highlight={searchKeyword} />
              </Link>
              <PresenceIndicator userId={candidate.userId} />
              <VerifiedBadge
                isVerified={Boolean(
                  (candidate as unknown as { hasVerifiedBadge?: boolean }).hasVerifiedBadge,
                )}
                size="sm"
              />
              {candidate.workStatus && WORK_STATUS_LABELS[candidate.workStatus] && (
                <Badge
                  variant={candidate.workStatus === 'ACTIVELY_LOOKING' ? 'success' : 'neutral'}
                  size="sm"
                >
                  {WORK_STATUS_LABELS[candidate.workStatus]}
                </Badge>
              )}
            </div>
            {candidate.headline && (
              <p className="truncate text-xs text-[var(--text-secondary)]">
                <HighlightText text={candidate.headline} highlight={searchKeyword} />
              </p>
            )}
            {/* Special Badges (Compact) */}
            <div className="mt-1 flex flex-wrap gap-1">
              {candidate.noticePeriod === 'IMMEDIATE' && (
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700">
                  ⚡ Immediate
                </span>
              )}
              {candidate.workStatus === 'ACTIVELY_LOOKING' && (
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-700">
                  🔍 Active
                </span>
              )}
              {candidate.openToWork === 'OPEN_TO_OFFERS' && (
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-700">
                  💼 Open
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-[var(--text-muted)]">
              {candidate.currentLocation && (
                <span className="flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" /> {candidate.currentLocation}
                </span>
              )}
              <span className="flex items-center gap-0.5">
                <Briefcase className="h-3 w-3" /> {candidate.experienceYears} yrs
              </span>
              {candidate.currentCompany && (
                <span className="flex items-center gap-0.5">
                  <Building2 className="h-3 w-3" /> {candidate.currentCompany}
                </span>
              )}
              {candidate.noticePeriod && (
                <Badge variant="info" size="sm">
                  {NOTICE_PERIOD_LABELS[candidate.noticePeriod]}
                </Badge>
              )}
            </div>
          </div>

          {/* Center: Skills with match */}
          <div className="hidden max-w-xs flex-wrap items-center gap-1.5 md:flex">
            {skillMatchCount > 0 && requiredSkills && requiredSkills.size > 0 && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap',
                  skillMatchPct >= 70
                    ? 'bg-emerald-50 text-emerald-700'
                    : skillMatchPct >= 40
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-slate-100 text-slate-600',
                )}
              >
                {skillMatchCount}/{requiredSkills.size} match
              </span>
            )}
            {candidate.skills?.slice(0, 4).map((skill) => {
              const isMatch =
                searchKeyword &&
                searchKeyword
                  .toLowerCase()
                  .split(/[\s,]+/)
                  .some((t) => t.length > 1 && skill.toLowerCase().includes(t));
              return (
                <Tag
                  key={skill}
                  label={skill}
                  size="sm"
                  variant={isMatch ? 'success' : 'primary'}
                />
              );
            })}
            {(candidate.skills?.length || 0) > 4 && (
              <span className="text-[10px] text-[var(--text-muted)]">
                +{candidate.skills!.length - 4}
              </span>
            )}
          </div>

          {/* Right: Salary + Actions */}
          <div className="flex shrink-0 items-center gap-3">
            {candidate.expectedSalaryMin && (
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold whitespace-nowrap text-[var(--text)]">
                  {candidate.expectedSalaryMin.toLocaleString()}
                  {candidate.expectedSalaryMax
                    ? ` - ${candidate.expectedSalaryMax.toLocaleString()}`
                    : '+'}
                </p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {candidate.salaryCurrency}/yr
                </p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = `/employer/candidates/${candidate.userId}`;
                }}
                tooltip="View profile"
              >
                View
              </Button>
              <button
                type="button"
                onClick={onToggleSave}
                disabled={isSaving}
                aria-label={isSaved ? 'Unsave' : 'Save'}
                className={cn(
                  'rounded-lg p-2 transition-colors disabled:opacity-50',
                  isSaved ? 'text-primary' : 'hover:text-primary text-[var(--text-muted)]',
                )}
              >
                <Bookmark className={cn('h-4 w-4', isSaved && 'fill-current')} />
              </button>
              {onToggleCompare && (
                <button
                  type="button"
                  onClick={onToggleCompare}
                  aria-label={isComparing ? 'Remove from comparison' : 'Add to comparison'}
                  className={cn(
                    'rounded-lg p-2 transition-colors',
                    isComparing ? 'text-primary' : 'hover:text-primary text-[var(--text-muted)]',
                  )}
                >
                  <GitCompareArrows className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
