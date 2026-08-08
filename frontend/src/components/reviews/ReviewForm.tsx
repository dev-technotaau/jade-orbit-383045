'use client';

/**
 * ReviewForm — multi-section company review form modeled on AmbitionBox.
 * Layout, but our brand styling. Anonymous-friendly (works for both
 * guest and logged-in candidate — same form).
 *
 * Sections (in order):
 *   1. Company name (CompanyAutocomplete; prefilled from prop)
 *   2. Overall rating (5 stars + emoji label)
 *   3. 7-criteria rating rows
 *   4. Gender radio
 *   5. Work policy radio
 *   6. Currently work here? Yes/No (Yes hides BOTH dates; No shows BOTH)
 *   7. Designation (text)
 *   8. Employment type (select)
 *   9. Department (text)
 *   10. Work location (optional text)
 *   11. Likes textarea
 *   12. Dislikes textarea
 *   13. Work details textarea
 *   14. Submit "Submit Anonymously"
 *   15. Footer — community guidelines / terms / privacy
 *
 * On submit, calls companyReviewService.submit and routes to the
 * dedicated reviews page on success.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertCircle, Lock, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import Select from '@/components/ui/Select';
import StarRating from './StarRating';
import CompanyAutocomplete from './CompanyAutocomplete';
import { companyReviewService } from '@/services/company-review.service';
import type {
  CompanyAutocompleteItem,
  ReviewEmploymentType,
  ReviewGender,
  ReviewWorkPolicy,
  SubmitReviewInput,
} from '@/types/review';

interface Props {
  initialCompany: CompanyAutocompleteItem | null;
}

const CRITERIA: { key: keyof CriteriaRatings; label: string }[] = [
  { key: 'workLifeBalance', label: 'Work-life balance' },
  { key: 'salary', label: 'Salary & benefits' },
  { key: 'promotions', label: 'Promotions & career growth' },
  { key: 'jobSecurity', label: 'Job security' },
  { key: 'skillDev', label: 'Skill development & learning' },
  { key: 'workSatisfaction', label: 'Work satisfaction' },
  { key: 'companyCulture', label: 'Company culture' },
];

interface CriteriaRatings {
  workLifeBalance: number;
  salary: number;
  promotions: number;
  jobSecurity: number;
  skillDev: number;
  workSatisfaction: number;
  companyCulture: number;
}

const EMPTY_CRITERIA: CriteriaRatings = {
  workLifeBalance: 0,
  salary: 0,
  promotions: 0,
  jobSecurity: 0,
  skillDev: 0,
  workSatisfaction: 0,
  companyCulture: 0,
};

const EMPLOYMENT_TYPES: { value: ReviewEmploymentType; label: string }[] = [
  { value: 'PERMANENT', label: 'Permanent / Full-time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERNSHIP', label: 'Internship' },
  { value: 'TRAINEE', label: 'Trainee' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'TEMPORARY', label: 'Temporary' },
  { value: 'FREELANCE', label: 'Freelance' },
];

const WORK_POLICIES: { value: ReviewWorkPolicy; label: string }[] = [
  { value: 'PERMANENT_WFH', label: 'Permanent WFH' },
  { value: 'WORKING_FROM_OFFICE', label: 'Working from office' },
  { value: 'HYBRID', label: 'Hybrid' },
];

const GENDERS: { value: ReviewGender; label: string }[] = [
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' },
  { value: 'TRANSGENDER', label: 'Transgender' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 60 }, (_, i) => CURRENT_YEAR - i);

const MAX_BODY_LENGTH = 1500;
const MIN_DETAILED_LENGTH = 30;

const SectionHeader = ({
  n,
  title,
  required,
}: {
  n: number;
  title: string;
  required?: boolean;
}) => (
  <div className="mb-3 flex items-baseline gap-3">
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-sm font-semibold text-[var(--primary)]">
      {n}
    </span>
    <h3 className="text-base font-semibold text-[var(--text)]">
      {title}
      {required && <span className="ml-1 text-red-500">*</span>}
    </h3>
  </div>
);

export default function ReviewForm({ initialCompany }: Props) {
  const router = useRouter();
  const [company, setCompany] = useState<CompanyAutocompleteItem | null>(initialCompany);

  const [overallRating, setOverallRating] = useState(0);
  const [criteria, setCriteria] = useState<CriteriaRatings>({ ...EMPTY_CRITERIA });
  const [gender, setGender] = useState<ReviewGender | ''>('');
  const [workPolicy, setWorkPolicy] = useState<ReviewWorkPolicy | ''>('');
  const [currentlyWorking, setCurrentlyWorking] = useState<boolean | null>(null);
  const [startedMonth, setStartedMonth] = useState<string>('');
  const [startedYear, setStartedYear] = useState<string>('');
  const [endedMonth, setEndedMonth] = useState<string>('');
  const [endedYear, setEndedYear] = useState<string>('');
  const [designation, setDesignation] = useState('');
  const [employmentType, setEmploymentType] = useState<ReviewEmploymentType | ''>('');
  const [department, setDepartment] = useState('');
  const [workLocation, setWorkLocation] = useState('');
  const [likes, setLikes] = useState('');
  const [dislikes, setDislikes] = useState('');
  const [workDetails, setWorkDetails] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Sync prefill when prop changes (e.g. user navigates from another company).
  useEffect(() => {
    if (initialCompany && (!company || company.id !== initialCompany.id)) {
      setCompany(initialCompany);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCompany?.id]);

  // localStorage draft auto-save (per company id) — survives accidental
  // navigation. Cleared on successful submit.
  const draftKey = useMemo(
    () => (company ? `reviewDraft:${company.id}` : 'reviewDraft:none'),
    [company],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<DraftShape>;
      if (typeof draft.overallRating === 'number') setOverallRating(draft.overallRating);
      if (draft.criteria) setCriteria({ ...EMPTY_CRITERIA, ...draft.criteria });
      if (draft.gender) setGender(draft.gender);
      if (draft.workPolicy) setWorkPolicy(draft.workPolicy);
      if (typeof draft.currentlyWorking === 'boolean') setCurrentlyWorking(draft.currentlyWorking);
      if (draft.startedMonth) setStartedMonth(draft.startedMonth);
      if (draft.startedYear) setStartedYear(draft.startedYear);
      if (draft.endedMonth) setEndedMonth(draft.endedMonth);
      if (draft.endedYear) setEndedYear(draft.endedYear);
      if (draft.designation) setDesignation(draft.designation);
      if (draft.employmentType) setEmploymentType(draft.employmentType);
      if (draft.department) setDepartment(draft.department);
      if (draft.workLocation) setWorkLocation(draft.workLocation);
      if (draft.likes) setLikes(draft.likes);
      if (draft.dislikes) setDislikes(draft.dislikes);
      if (draft.workDetails) setWorkDetails(draft.workDetails);
    } catch {
      // ignore
    }
  }, [draftKey]);

  useEffect(() => {
    const draft: DraftShape = {
      overallRating,
      criteria,
      gender,
      workPolicy,
      currentlyWorking,
      startedMonth,
      startedYear,
      endedMonth,
      endedYear,
      designation,
      employmentType,
      department,
      workLocation,
      likes,
      dislikes,
      workDetails,
    };
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // ignore quota errors
    }
  }, [
    draftKey,
    overallRating,
    criteria,
    gender,
    workPolicy,
    currentlyWorking,
    startedMonth,
    startedYear,
    endedMonth,
    endedYear,
    designation,
    employmentType,
    department,
    workLocation,
    likes,
    dislikes,
    workDetails,
  ]);

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!company) errs.company = 'Please select a company.';
    if (overallRating < 1) errs.overallRating = 'Please give an overall rating.';
    for (const c of CRITERIA) {
      if (criteria[c.key] < 1) errs[`criteria_${c.key}`] = `Rate ${c.label}.`;
    }
    if (!workPolicy) errs.workPolicy = 'Select a work policy.';
    if (currentlyWorking === null) errs.currentlyWorking = 'Tell us if you currently work here.';
    if (currentlyWorking === false) {
      if (!startedMonth || !startedYear) errs.startedAt = 'When did you start?';
      if (!endedMonth || !endedYear) errs.endedAt = 'When did you leave?';
      if (startedMonth && startedYear && endedMonth && endedYear) {
        const start = new Date(Number(startedYear), MONTHS.indexOf(startedMonth), 1);
        const end = new Date(Number(endedYear), MONTHS.indexOf(endedMonth), 1);
        if (start > end) errs.endedAt = 'End date must be after start date.';
      }
    }
    if (!designation.trim()) errs.designation = 'Designation is required.';
    if (!employmentType) errs.employmentType = 'Select an employment type.';
    if (!department.trim()) errs.department = 'Department is required.';

    const cap = (s: string) => s.length > MAX_BODY_LENGTH;
    if (cap(likes)) errs.likes = `Max ${MAX_BODY_LENGTH} characters.`;
    if (cap(dislikes)) errs.dislikes = `Max ${MAX_BODY_LENGTH} characters.`;
    if (cap(workDetails)) errs.workDetails = `Max ${MAX_BODY_LENGTH} characters.`;

    return errs;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      // Scroll to first error
      const first = document.querySelector('[data-error="true"]');
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!company) return;

    const startedISO =
      currentlyWorking === false && startedMonth && startedYear
        ? new Date(Number(startedYear), MONTHS.indexOf(startedMonth), 1).toISOString()
        : null;
    const endedISO =
      currentlyWorking === false && endedMonth && endedYear
        ? new Date(Number(endedYear), MONTHS.indexOf(endedMonth), 1).toISOString()
        : null;

    const payload: SubmitReviewInput = {
      overallRating,
      ratingWorkLifeBalance: criteria.workLifeBalance,
      ratingSalary: criteria.salary,
      ratingPromotions: criteria.promotions,
      ratingJobSecurity: criteria.jobSecurity,
      ratingSkillDev: criteria.skillDev,
      ratingWorkSatisfaction: criteria.workSatisfaction,
      ratingCompanyCulture: criteria.companyCulture,
      gender: gender || null,
      workPolicy: workPolicy as ReviewWorkPolicy,
      currentlyWorking: currentlyWorking === true,
      startedWorkingAt: startedISO,
      endedWorkingAt: endedISO,
      designation: designation.trim(),
      employmentType: employmentType as ReviewEmploymentType,
      department: department.trim(),
      workLocation: workLocation.trim() || null,
      likes: likes.trim() || null,
      dislikes: dislikes.trim() || null,
      workDetails: workDetails.trim() || null,
    };

    setSubmitting(true);
    try {
      const idOrSlug = company.slug || company.id;
      const result = await companyReviewService.submit(idOrSlug, payload);
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }
      const target = company.slug
        ? `/companies/${company.slug}/reviews?focus=${result.id}&new=1`
        : `/companies/${company.id}/reviews?focus=${result.id}&new=1`;
      router.push(target);
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error
          ?.message ?? 'Failed to submit review. Please try again.';
      setServerError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const counter = (s: string) => `${s.length}/${MAX_BODY_LENGTH}`;
  const detailedHint = (s: string) =>
    s.length > 0 && s.length < MIN_DETAILED_LENGTH
      ? `${MIN_DETAILED_LENGTH - s.length} more chars to qualify as a Detailed review`
      : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* 1. Company name */}
      <section data-error={!!errors.company}>
        <SectionHeader n={1} title="Which company are you reviewing?" required />
        <CompanyAutocomplete
          value={company}
          onChange={setCompany}
          required
          error={errors.company}
        />
      </section>

      {/* 2. Overall rating */}
      <section data-error={!!errors.overallRating}>
        <SectionHeader n={2} title="Overall rating" required />
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
          <StarRating
            value={overallRating}
            onChange={setOverallRating}
            size="xl"
            showLabel
            ariaLabel="Overall rating"
          />
        </div>
        {errors.overallRating && (
          <p className="mt-1 text-xs text-red-600">{errors.overallRating}</p>
        )}
      </section>

      {/* 3. Criteria ratings */}
      <section>
        <SectionHeader
          n={3}
          title={`Rate ${company?.companyName ?? 'the company'} on the following criteria`}
          required
        />
        <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
          {CRITERIA.map((c) => (
            <div
              key={c.key}
              data-error={!!errors[`criteria_${c.key}`]}
              className="flex flex-wrap items-center justify-between gap-3 p-3"
            >
              <span className="text-sm font-medium text-[var(--text)]">{c.label}</span>
              <div className="flex flex-col items-end">
                <StarRating
                  value={criteria[c.key]}
                  onChange={(v) => setCriteria((prev) => ({ ...prev, [c.key]: v }))}
                  size="lg"
                  showLabel
                  ariaLabel={c.label}
                />
                {errors[`criteria_${c.key}`] && (
                  <p className="text-xs text-red-600">{errors[`criteria_${c.key}`]}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Gender */}
      <section>
        <SectionHeader n={4} title="Your gender (optional)" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GENDERS.map((g) => (
            <RadioPill
              key={g.value}
              label={g.label}
              checked={gender === g.value}
              onChange={() => setGender(g.value)}
            />
          ))}
        </div>
      </section>

      {/* 5. Work policy */}
      <section data-error={!!errors.workPolicy}>
        <SectionHeader n={5} title="Work policy" required />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {WORK_POLICIES.map((p) => (
            <RadioPill
              key={p.value}
              label={p.label}
              checked={workPolicy === p.value}
              onChange={() => setWorkPolicy(p.value)}
            />
          ))}
        </div>
        {errors.workPolicy && <p className="mt-1 text-xs text-red-600">{errors.workPolicy}</p>}
      </section>

      {/* 6. Currently work here? */}
      <section data-error={!!errors.currentlyWorking || !!errors.startedAt || !!errors.endedAt}>
        <SectionHeader n={6} title="Do you currently work here?" required />
        <div className="grid grid-cols-2 gap-2">
          <RadioPill
            label="Yes, I currently work here"
            checked={currentlyWorking === true}
            onChange={() => setCurrentlyWorking(true)}
          />
          <RadioPill
            label="No, I worked here before"
            checked={currentlyWorking === false}
            onChange={() => setCurrentlyWorking(false)}
          />
        </div>
        {errors.currentlyWorking && (
          <p className="mt-1 text-xs text-red-600">{errors.currentlyWorking}</p>
        )}
        {currentlyWorking === false && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text)]">
                Started working on
              </label>
              <div className="grid grid-cols-2 gap-2">
                <SelectField
                  value={startedMonth}
                  onChange={setStartedMonth}
                  placeholder="Month"
                  options={MONTHS.map((m) => ({ value: m, label: m }))}
                />
                <SelectField
                  value={startedYear}
                  onChange={setStartedYear}
                  placeholder="Year"
                  options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
                />
              </div>
              {errors.startedAt && <p className="mt-1 text-xs text-red-600">{errors.startedAt}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text)]">
                Employment ended on
              </label>
              <div className="grid grid-cols-2 gap-2">
                <SelectField
                  value={endedMonth}
                  onChange={setEndedMonth}
                  placeholder="Month"
                  options={MONTHS.map((m) => ({ value: m, label: m }))}
                />
                <SelectField
                  value={endedYear}
                  onChange={setEndedYear}
                  placeholder="Year"
                  options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
                />
              </div>
              {errors.endedAt && <p className="mt-1 text-xs text-red-600">{errors.endedAt}</p>}
            </div>
          </div>
        )}
      </section>

      {/* 7. Designation */}
      <section data-error={!!errors.designation}>
        <SectionHeader n={7} title="Your designation / job title" required />
        <input
          type="text"
          value={designation}
          onChange={(e) => setDesignation(e.target.value)}
          placeholder="e.g. Senior Software Engineer"
          maxLength={120}
          className={cn(
            'w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm',
            'focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] focus:outline-none',
            errors.designation && 'border-red-500',
          )}
        />
        {errors.designation && <p className="mt-1 text-xs text-red-600">{errors.designation}</p>}
      </section>

      {/* 8. Employment type */}
      <section data-error={!!errors.employmentType}>
        <SectionHeader n={8} title="Employment type" required />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {EMPLOYMENT_TYPES.map((t) => (
            <RadioPill
              key={t.value}
              label={t.label}
              checked={employmentType === t.value}
              onChange={() => setEmploymentType(t.value)}
            />
          ))}
        </div>
        {errors.employmentType && (
          <p className="mt-1 text-xs text-red-600">{errors.employmentType}</p>
        )}
      </section>

      {/* 9. Department */}
      <section data-error={!!errors.department}>
        <SectionHeader n={9} title="Your department" required />
        <input
          type="text"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          placeholder="e.g. Engineering / Sales / Operations"
          maxLength={80}
          className={cn(
            'w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm',
            'focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] focus:outline-none',
            errors.department && 'border-red-500',
          )}
        />
        {errors.department && <p className="mt-1 text-xs text-red-600">{errors.department}</p>}
      </section>

      {/* 10. Work location */}
      <section>
        <SectionHeader n={10} title="Work location (optional)" />
        <input
          type="text"
          value={workLocation}
          onChange={(e) => setWorkLocation(e.target.value)}
          placeholder="e.g. Bengaluru"
          maxLength={80}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] focus:outline-none"
        />
      </section>

      {/* 11. Likes */}
      <section data-error={!!errors.likes}>
        <SectionHeader n={11} title="What did you like?" />
        <Textarea
          value={likes}
          onChange={setLikes}
          placeholder="Share what worked well — culture, learning, perks…"
        />
        <Counter text={counter(likes)} hint={detailedHint(likes)} />
        {errors.likes && <p className="mt-1 text-xs text-red-600">{errors.likes}</p>}
      </section>

      {/* 12. Dislikes */}
      <section data-error={!!errors.dislikes}>
        <SectionHeader n={12} title="What didn't you like?" />
        <Textarea
          value={dislikes}
          onChange={setDislikes}
          placeholder="Share areas the company can improve…"
        />
        <Counter text={counter(dislikes)} hint={detailedHint(dislikes)} />
        {errors.dislikes && <p className="mt-1 text-xs text-red-600">{errors.dislikes}</p>}
      </section>

      {/* 13. Work details */}
      <section data-error={!!errors.workDetails}>
        <SectionHeader n={13} title="Tell us about your role / work" />
        <Textarea
          value={workDetails}
          onChange={setWorkDetails}
          placeholder="Day-to-day responsibilities, team size, tools, projects you worked on…"
        />
        <Counter text={counter(workDetails)} hint={detailedHint(workDetails)} />
        {errors.workDetails && <p className="mt-1 text-xs text-red-600">{errors.workDetails}</p>}
      </section>

      {serverError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <button
          type="submit"
          disabled={submitting}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-6 py-3 text-base font-semibold text-white shadow transition-colors hover:bg-[var(--primary-dark,_#1d4ed8)]',
            submitting && 'opacity-70',
          )}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Submitting…
            </>
          ) : (
            <>
              <Lock className="h-4 w-4" aria-hidden="true" />
              Submit Anonymously
            </>
          )}
        </button>
        <div className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
          <ShieldCheck
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500"
            aria-hidden="true"
          />
          <p>
            Your review is published anonymously. By submitting, you agree to our{' '}
            <Link href="/community-guidelines" className="text-[var(--primary)] underline">
              community guidelines
            </Link>
            ,{' '}
            <Link href="/terms" className="text-[var(--primary)] underline">
              terms
            </Link>
            , and{' '}
            <Link href="/privacy" className="text-[var(--primary)] underline">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </div>
    </form>
  );
}

interface DraftShape {
  overallRating: number;
  criteria: CriteriaRatings;
  gender: ReviewGender | '';
  workPolicy: ReviewWorkPolicy | '';
  currentlyWorking: boolean | null;
  startedMonth: string;
  startedYear: string;
  endedMonth: string;
  endedYear: string;
  designation: string;
  employmentType: ReviewEmploymentType | '';
  department: string;
  workLocation: string;
  likes: string;
  dislikes: string;
  workDetails: string;
}

function RadioPill({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        'rounded-md border px-3 py-2 text-left text-sm font-medium transition-all',
        checked
          ? 'border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm'
          : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text)] hover:border-[var(--primary)]',
      )}
    >
      {label}
    </button>
  );
}

function SelectField({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      options={options}
      clearable={false}
      className="w-full"
    />
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={MAX_BODY_LENGTH}
      rows={4}
      className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] focus:outline-none"
    />
  );
}

function Counter({ text, hint }: { text: string; hint?: string | null }) {
  return (
    <div className="mt-1 flex items-center justify-between text-xs text-[var(--text-muted)]">
      <span>{hint ?? ''}</span>
      <span className="tabular-nums">{text}</span>
    </div>
  );
}
