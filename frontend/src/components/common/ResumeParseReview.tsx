'use client';

/**
 * ResumeParseReview — comprehensive review UI for the Vertex AI /
 * Gemini resume-extraction pipeline.
 *
 * Every field the extractor can fill (~80 candidate-profile columns)
 * is grouped into a logical section. Sections appear only when the
 * parse actually populated at least one of their fields, so the UI
 * stays compact for sparse resumes. Each section:
 *
 *   - has a checkbox at the section level (toggle on / off in bulk);
 *   - expands to show the actual extracted values so the user can
 *     spot-check before applying;
 *   - exposes FINE-GRAINED toggles inside the expanded preview:
 *       · per scalar field    (Identity → DOB, Address → Pincode)
 *       · per array entry     (Experience #2, Education #1)
 *       · per chip            (skills["Python"], languages["Hindi"])
 *     All four toggle types share a single Set<string> of prefixed
 *     deselect keys ("scalar:headline", "item:experience:0", etc.) and
 *     are wired through a `FieldDeselectContext` so individual rows
 *     can render their own checkboxes without each section having to
 *     thread props through manually.
 *
 * The apply payload comes from the single source-of-truth helper
 * `buildApplyableFields`, then THREE filter passes are applied on top:
 *   1. drop keys belonging to unchecked sections;
 *   2. drop scalar keys whose row was unticked inside a checked section;
 *   3. splice out array indices whose item/chip was unticked.
 *
 * This way the helper stays the canonical mapping; the review UI just
 * decides which subset (and which array indices) to send through.
 */

import {
  useMemo,
  useState,
  useContext,
  createContext,
  type ReactNode,
  type ComponentType,
} from 'react';
import {
  WandSparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Briefcase,
  GraduationCap,
  Code,
  Award,
  Phone,
  FileText,
  User,
  MapPin,
  TrendingUp,
  Sliders,
  ShieldCheck,
  Accessibility,
  Languages,
  FolderGit2,
  BookOpen,
  Scroll,
  HandHeart,
  Users,
  ListChecks,
  ContactRound,
  Heart,
  Globe,
  type LucideIcon,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Tooltip from '@/components/ui/Tooltip';
import type { ParsedResumeData, ApplyableResumeFields } from '@/types/resume-parse';
import { buildApplyableFields } from '@/utils/build-applyable-resume-fields';

// ── Formatting helpers ───────────────────────────────────────────────

// UPPER_SNAKE → "Upper Snake"
function formatEnum(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatBool(v: boolean | null | undefined): string {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return '';
}

function formatSalary(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (typeof amount !== 'number') return '';
  const cur = currency || 'INR';
  try {
    return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${cur} ${amount.toLocaleString()}`;
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  // Accepts YYYY-MM-DD; fall back to as-is when input doesn't match
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const monthName = new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleString('en-US', {
    month: 'short',
  });
  return `${monthName} ${m[1]}`;
}

function isTruthyString(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

// ── Field-deselect context ───────────────────────────────────────────
// Section toggles (whole section on/off) live alongside field-level
// toggles (individual scalar fields), per-item toggles (Experience #2),
// and per-chip toggles (skills["Python"]). All four are stored as
// prefixed string keys in a single Set so we don't proliferate
// independent state shapes:
//   "scalar:headline"            — single scalar applyKey
//   "scalar:firstName,lastName"  — composite (toggling Name affects both)
//   "item:experience:0"          — entry #0 in the experience array
//   "chip:skills:3"              — index 3 in d.skills
// Membership in this set means "DESELECTED" (will be stripped from the
// apply payload). Default state for everything is selected.
interface FieldDeselectCtx {
  isDeselected: (key: string) => boolean;
  toggle: (key: string) => void;
  /** When true, render the checkbox UI. False when the parent section
   *  itself is unchecked — there's no point fine-tuning a section that
   *  will be dropped wholesale. */
  enabled: boolean;
}
const FieldDeselectContext = createContext<FieldDeselectCtx | null>(null);

function useFieldDeselect(): FieldDeselectCtx | null {
  return useContext(FieldDeselectContext);
}

// ── Atomic display blocks ────────────────────────────────────────────

function FieldRow({
  label,
  value,
  applyKey,
}: {
  label: string;
  value: ReactNode;
  /** Optional apply payload key (or comma-separated keys, for composites
   *  like Name → "firstName,lastName"). When present + inside a
   *  FieldDeselectContext, renders a checkbox that toggles whether this
   *  row's value is included in the apply payload. */
  applyKey?: string;
}) {
  const ctx = useFieldDeselect();
  if (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && !value.trim()) ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return null;
  }
  const showCheckbox = !!ctx && ctx.enabled && !!applyKey;
  const deselected = showCheckbox ? ctx!.isDeselected(`scalar:${applyKey}`) : false;
  return (
    <div className="flex items-baseline gap-2">
      {showCheckbox && (
        <input
          type="checkbox"
          aria-label={`Apply ${label}`}
          checked={!deselected}
          onChange={() => ctx!.toggle(`scalar:${applyKey}`)}
          className="accent-primary h-3.5 w-3.5 flex-none cursor-pointer rounded border-[var(--border)]"
        />
      )}
      <div
        className={`flex flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2 ${
          deselected ? 'opacity-40' : ''
        }`}
      >
        <span className="min-w-[140px] text-xs font-medium text-[var(--text-muted)]">{label}</span>
        <span
          className={`text-sm break-words text-[var(--text)] ${
            deselected ? 'line-through decoration-[var(--text-muted)]' : ''
          }`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function ChipList({
  items,
  /** When provided + inside a FieldDeselectContext, each chip becomes
   *  clickable: clicking toggles its deselected state (strike-through +
   *  fade). The `chipKey` is the apply-payload array key (e.g. "skills",
   *  "languages", "interests") — used to compose the per-chip deselect
   *  key as `chip:${chipKey}:${index}`. */
  chipKey,
}: {
  items: string[];
  chipKey?: string;
}) {
  const ctx = useFieldDeselect();
  if (!items?.length) return null;
  const interactive = !!ctx && ctx.enabled && !!chipKey;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s, i) => {
        const deselected = interactive ? ctx!.isDeselected(`chip:${chipKey}:${i}`) : false;
        const className = `rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
          deselected
            ? 'bg-[var(--bg-secondary)] text-[var(--text-muted)] line-through'
            : 'bg-primary/10 text-primary'
        } ${interactive ? 'cursor-pointer hover:ring-1 hover:ring-[var(--primary)]/30' : ''}`;
        if (interactive) {
          return (
            <button
              type="button"
              key={`${s}-${i}`}
              onClick={() => ctx!.toggle(`chip:${chipKey}:${i}`)}
              aria-pressed={!deselected}
              aria-label={`${deselected ? 'Include' : 'Exclude'} ${s}`}
              className={className}
            >
              {s}
            </button>
          );
        }
        return (
          <span key={`${s}-${i}`} className={className}>
            {s}
          </span>
        );
      })}
    </div>
  );
}

function ItemCard({
  children,
  /** Optional pair (arrayKey + index) — when both present + inside a
   *  FieldDeselectContext, renders a small include-this-entry checkbox
   *  in the top-right of the card. */
  arrayKey,
  index,
}: {
  children: ReactNode;
  arrayKey?: string;
  index?: number;
}) {
  const ctx = useFieldDeselect();
  const interactive = !!ctx && ctx.enabled && !!arrayKey && typeof index === 'number';
  const deselected = interactive ? ctx!.isDeselected(`item:${arrayKey}:${index}`) : false;
  return (
    <div
      className={`relative space-y-0.5 rounded border border-[var(--border)] bg-white p-2.5 text-xs text-[var(--text-secondary)] transition ${
        deselected ? 'opacity-40' : ''
      }`}
    >
      {interactive && (
        <input
          type="checkbox"
          aria-label={`Include entry ${(index ?? 0) + 1}`}
          checked={!deselected}
          onChange={() => ctx!.toggle(`item:${arrayKey}:${index}`)}
          className="accent-primary absolute top-2 right-2 h-3.5 w-3.5 cursor-pointer rounded border-[var(--border)]"
        />
      )}
      <div className={`${interactive ? 'pr-6' : ''} ${deselected ? 'line-through' : ''}`}>
        {children}
      </div>
    </div>
  );
}

/**
 * List-item variant of ItemCard for skills/proficiency rows that are
 * too compact to deserve a full card. Renders inline as `<li>` with an
 * optional include-checkbox on the left.
 */
function SkillsListItem({
  arrayKey,
  index,
  primary,
  meta,
}: {
  arrayKey: string;
  index: number;
  /** Parsed entries can have nullable primary (e.g. ITSkillEntry.technology
   *  may be null if Gemini missed it). Null collapses to empty string for
   *  display; the entry itself stays in the apply payload until the user
   *  unchecks it. */
  primary: string | null | undefined;
  /** Meta strings to append after the primary label, joined by spaces.
   *  Null/empty entries are filtered out. */
  meta: Array<string | null | undefined>;
}) {
  const ctx = useFieldDeselect();
  const interactive = !!ctx && ctx.enabled;
  const deselected = interactive ? ctx!.isDeselected(`item:${arrayKey}:${index}`) : false;
  return (
    <li className={`flex items-center gap-2 ${deselected ? 'opacity-40' : ''}`}>
      {interactive && (
        <input
          type="checkbox"
          aria-label={`Include ${primary}`}
          checked={!deselected}
          onChange={() => ctx!.toggle(`item:${arrayKey}:${index}`)}
          className="accent-primary h-3 w-3 flex-none cursor-pointer rounded border-[var(--border)]"
        />
      )}
      <span className={deselected ? 'line-through' : ''}>
        <span className="font-medium text-[var(--text)]">{primary ?? ''}</span>
        {meta
          .filter((m): m is string => !!m)
          .map((m, i) => (
            <span key={i} className="text-[var(--text-muted)]">
              {' '}
              {m}
            </span>
          ))}
      </span>
    </li>
  );
}

function UrlLink({ href }: { href: string | null | undefined }) {
  if (!isTruthyString(href)) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary break-all underline-offset-2 hover:underline"
    >
      {href}
    </a>
  );
}

// ── Section definitions ──────────────────────────────────────────────

type SectionKey =
  | 'identity'
  | 'contact'
  | 'address'
  | 'professional'
  | 'preferences'
  | 'educationSummary'
  | 'visa'
  | 'disability'
  | 'skills'
  | 'experience'
  | 'education'
  | 'certifications'
  | 'projects'
  | 'publications'
  | 'patents'
  | 'awards'
  | 'volunteer'
  | 'memberships'
  | 'courses'
  | 'testScores'
  | 'references'
  | 'interests'
  | 'social';

interface SectionDef {
  key: SectionKey;
  label: string;
  icon: LucideIcon;
  /** Apply-payload keys to drop when this section is unchecked. */
  applyKeys: ReadonlyArray<keyof ApplyableResumeFields>;
  /** True if the parsed data has at least one populated field in this section. */
  isAvailable: (d: ParsedResumeData) => boolean;
  /** Short summary (e.g. "5 items", "Bangalore, KA") shown collapsed. */
  countLabel: (d: ParsedResumeData) => string | null;
  /** Detail view when expanded. */
  renderPreview: (d: ParsedResumeData) => ReactNode;
}

// Helper: did at least one of the keys in `d` have a truthy value?
function anyTruthy(d: ParsedResumeData, keys: ReadonlyArray<keyof ParsedResumeData>): boolean {
  for (const k of keys) {
    const v = d[k];
    if (Array.isArray(v) && v.length > 0) return true;
    if (typeof v === 'string' && v.trim().length > 0) return true;
    if (typeof v === 'number' && !isNaN(v)) return true;
    if (typeof v === 'boolean') return true;
  }
  return false;
}

const SECTIONS: SectionDef[] = [
  {
    key: 'identity',
    label: 'Identity',
    icon: User,
    applyKeys: [
      // firstName/lastName aren't candidate-profile columns — the apply
      // handlers route them to authService.updateProfile. They live in
      // this section because the parsed `name` is shown here.
      'firstName',
      'lastName',
      'bio',
      'headline',
      'pronouns',
      'dob',
      'gender',
      'maritalStatus',
      'nationality',
      'hometown',
      'category',
    ],
    isAvailable: (d) =>
      anyTruthy(d, [
        'summary',
        'headline',
        'pronouns',
        'dob',
        'gender',
        'maritalStatus',
        'nationality',
        'hometown',
        'category',
      ]),
    countLabel: (d) => d.headline ?? d.summary?.slice(0, 60) ?? null,
    renderPreview: (d) => (
      <div className="space-y-1.5">
        {/* Name maps to BOTH firstName + lastName via the composite
            "firstName,lastName" applyKey. Toggling the row drops/restores
            both at once — useful since users almost always want either
            both or neither. */}
        <FieldRow label="Name" value={d.name} applyKey="firstName,lastName" />
        <FieldRow label="Headline" value={d.headline} applyKey="headline" />
        {/* "Summary" in the resume maps to `bio` in CandidateProfile —
            buildApplyableFields does the rename. */}
        <FieldRow label="Summary" value={d.summary} applyKey="bio" />
        <FieldRow label="Pronouns" value={d.pronouns} applyKey="pronouns" />
        <FieldRow label="Date of birth" value={formatDate(d.dob)} applyKey="dob" />
        <FieldRow label="Gender" value={formatEnum(d.gender)} applyKey="gender" />
        <FieldRow
          label="Marital status"
          value={formatEnum(d.maritalStatus)}
          applyKey="maritalStatus"
        />
        <FieldRow label="Nationality" value={d.nationality} applyKey="nationality" />
        <FieldRow label="Hometown" value={d.hometown} applyKey="hometown" />
        <FieldRow label="Category" value={formatEnum(d.category)} applyKey="category" />
      </div>
    ),
  },
  {
    key: 'contact',
    label: 'Contact',
    icon: Phone,
    // Primary phone/email are deliberately NOT in applyKeys — those
    // are auth identifiers. buildApplyableFields routes the resume's
    // primary contact into the alternatePhone / alternateEmail slots
    // so applying this section adds them as additional contact info
    // (or updates them if already filled).
    applyKeys: ['alternatePhone', 'alternateEmail'],
    isAvailable: (d) => anyTruthy(d, ['phone', 'email', 'alternatePhone', 'alternateEmail']),
    countLabel: (d) => d.phone ?? d.email ?? d.alternateEmail ?? null,
    renderPreview: (d) => (
      <div className="space-y-1.5">
        {/* Phone + Email are SHOWN as context but not applied (auth
            identifiers — see Contact section's applyKeys comment). No
            applyKey → no checkbox; user sees "here's what we parsed" for
            informational purposes only. */}
        <FieldRow label="Phone" value={d.phone} />
        <FieldRow label="Email" value={d.email} />
        <FieldRow label="Alternate phone" value={d.alternatePhone} applyKey="alternatePhone" />
        <FieldRow label="Alternate email" value={d.alternateEmail} applyKey="alternateEmail" />
      </div>
    ),
  },
  {
    key: 'address',
    label: 'Address',
    icon: MapPin,
    applyKeys: [
      'addressLine1',
      'addressLine2',
      'city',
      'state',
      'pincode',
      'country',
      'currentLocation',
    ],
    isAvailable: (d) =>
      anyTruthy(d, [
        'addressLine1',
        'addressLine2',
        'city',
        'state',
        'pincode',
        'country',
        'currentLocation',
      ]),
    countLabel: (d) =>
      [d.city, d.state, d.country].filter(isTruthyString).join(', ') || d.currentLocation || null,
    renderPreview: (d) => (
      <div className="space-y-1.5">
        <FieldRow label="Line 1" value={d.addressLine1} applyKey="addressLine1" />
        <FieldRow label="Line 2" value={d.addressLine2} applyKey="addressLine2" />
        <FieldRow label="City" value={d.city} applyKey="city" />
        <FieldRow label="State" value={d.state} applyKey="state" />
        <FieldRow label="Pincode" value={d.pincode} applyKey="pincode" />
        <FieldRow label="Country" value={d.country} applyKey="country" />
        <FieldRow label="Current location" value={d.currentLocation} applyKey="currentLocation" />
      </div>
    ),
  },
  {
    key: 'professional',
    label: 'Professional snapshot',
    icon: TrendingUp,
    applyKeys: [
      'experienceYears',
      'totalExperienceMonths',
      'experienceLevel',
      'currentCompany',
      'currentRole',
      'currentIndustry',
      'currentDepartment',
      'functionalArea',
      'workStatus',
      'openToWork',
      'noticePeriod',
      'servingNoticePeriod',
      'hasCareerBreak',
      'careerBreakType',
      'careerBreakReason',
      'currSalary',
      'expectedSalaryMin',
      'expectedSalaryMax',
      'salaryCurrency',
    ],
    isAvailable: (d) =>
      anyTruthy(d, [
        'experienceYears',
        'totalExperienceMonths',
        'experienceLevel',
        'currentCompany',
        'currentRole',
        'currentIndustry',
        'currentDepartment',
        'functionalArea',
        'workStatus',
        'openToWork',
        'noticePeriod',
        'servingNoticePeriod',
        'hasCareerBreak',
        'careerBreakType',
        'currSalary',
        'expectedSalaryMin',
        'expectedSalaryMax',
      ]),
    countLabel: (d) =>
      [d.currentRole, d.currentCompany].filter(isTruthyString).join(' @ ') ||
      (typeof d.experienceYears === 'number' ? `${d.experienceYears} years experience` : null),
    renderPreview: (d) => (
      <div className="space-y-1.5">
        <FieldRow
          label="Total experience"
          value={d.experienceYears != null ? `${d.experienceYears} years` : null}
          applyKey="experienceYears"
        />
        <FieldRow
          label="Total (months)"
          value={d.totalExperienceMonths}
          applyKey="totalExperienceMonths"
        />
        <FieldRow
          label="Experience level"
          value={formatEnum(d.experienceLevel)}
          applyKey="experienceLevel"
        />
        <FieldRow label="Current company" value={d.currentCompany} applyKey="currentCompany" />
        <FieldRow label="Current role" value={d.currentRole} applyKey="currentRole" />
        <FieldRow label="Current industry" value={d.currentIndustry} applyKey="currentIndustry" />
        <FieldRow
          label="Current department"
          value={d.currentDepartment}
          applyKey="currentDepartment"
        />
        <FieldRow label="Functional area" value={d.functionalArea} applyKey="functionalArea" />
        <FieldRow label="Work status" value={formatEnum(d.workStatus)} applyKey="workStatus" />
        <FieldRow label="Open to work" value={formatEnum(d.openToWork)} applyKey="openToWork" />
        <FieldRow
          label="Notice period"
          value={formatEnum(d.noticePeriod)}
          applyKey="noticePeriod"
        />
        <FieldRow
          label="Serving notice"
          value={formatBool(d.servingNoticePeriod)}
          applyKey="servingNoticePeriod"
        />
        <FieldRow
          label="Career break"
          value={formatBool(d.hasCareerBreak)}
          applyKey="hasCareerBreak"
        />
        <FieldRow
          label="Break type"
          value={formatEnum(d.careerBreakType)}
          applyKey="careerBreakType"
        />
        <FieldRow label="Break reason" value={d.careerBreakReason} applyKey="careerBreakReason" />
        <FieldRow
          label="Current salary"
          value={formatSalary(d.currSalary, d.salaryCurrency)}
          applyKey="currSalary,salaryCurrency"
        />
        <FieldRow
          label="Expected salary"
          value={
            d.expectedSalaryMin || d.expectedSalaryMax
              ? `${formatSalary(d.expectedSalaryMin, d.salaryCurrency)}${
                  d.expectedSalaryMin && d.expectedSalaryMax ? ' – ' : ''
                }${formatSalary(d.expectedSalaryMax, d.salaryCurrency)}`
              : null
          }
          applyKey="expectedSalaryMin,expectedSalaryMax"
        />
      </div>
    ),
  },
  {
    key: 'preferences',
    label: 'Career preferences',
    icon: Sliders,
    applyKeys: [
      'preferredJobType',
      'preferredWorkMode',
      'preferredShift',
      'preferredLocations',
      'preferredIndustries',
      'preferredRoleCategories',
      'willingToRelocate',
      'travelWillingnessPercent',
      'dateOfAvailability',
    ],
    isAvailable: (d) =>
      anyTruthy(d, [
        'preferredJobType',
        'preferredWorkMode',
        'preferredShift',
        'preferredLocations',
        'preferredIndustries',
        'preferredRoleCategories',
        'willingToRelocate',
        'travelWillingnessPercent',
        'dateOfAvailability',
      ]),
    countLabel: (d) => {
      const bits = [
        d.preferredJobType?.length ? `${d.preferredJobType.length} job type(s)` : null,
        d.preferredLocations?.length ? `${d.preferredLocations.length} location(s)` : null,
      ];
      return bits.filter(Boolean).join(' · ') || null;
    },
    renderPreview: (d) => (
      <div className="space-y-1.5">
        <FieldRow
          label="Preferred job types"
          value={d.preferredJobType?.map(formatEnum).join(', ') || null}
          applyKey="preferredJobType"
        />
        <FieldRow
          label="Preferred work mode"
          value={d.preferredWorkMode?.map(formatEnum).join(', ') || null}
          applyKey="preferredWorkMode"
        />
        <FieldRow
          label="Preferred shift"
          value={formatEnum(d.preferredShift)}
          applyKey="preferredShift"
        />
        <FieldRow
          label="Preferred locations"
          value={d.preferredLocations?.length ? <ChipList items={d.preferredLocations} /> : null}
          applyKey="preferredLocations"
        />
        <FieldRow
          label="Preferred industries"
          value={d.preferredIndustries?.length ? <ChipList items={d.preferredIndustries} /> : null}
          applyKey="preferredIndustries"
        />
        <FieldRow
          label="Preferred roles"
          value={
            d.preferredRoleCategories?.length ? (
              <ChipList items={d.preferredRoleCategories} />
            ) : null
          }
          applyKey="preferredRoleCategories"
        />
        <FieldRow
          label="Willing to relocate"
          value={formatBool(d.willingToRelocate)}
          applyKey="willingToRelocate"
        />
        <FieldRow
          label="Travel willingness"
          value={
            typeof d.travelWillingnessPercent === 'number' ? `${d.travelWillingnessPercent}%` : null
          }
          applyKey="travelWillingnessPercent"
        />
        <FieldRow
          label="Available from"
          value={formatDate(d.dateOfAvailability)}
          applyKey="dateOfAvailability"
        />
      </div>
    ),
  },
  {
    key: 'educationSummary',
    label: 'Education summary',
    icon: GraduationCap,
    applyKeys: ['highestEducationLevel', 'highestDegree'],
    isAvailable: (d) => anyTruthy(d, ['highestEducationLevel', 'highestDegree']),
    countLabel: (d) => formatEnum(d.highestDegree) || formatEnum(d.highestEducationLevel) || null,
    renderPreview: (d) => (
      <div className="space-y-1.5">
        <FieldRow
          label="Education level"
          value={formatEnum(d.highestEducationLevel)}
          applyKey="highestEducationLevel"
        />
        <FieldRow label="Degree" value={formatEnum(d.highestDegree)} applyKey="highestDegree" />
      </div>
    ),
  },
  {
    key: 'visa',
    label: 'Visa & documents',
    icon: ShieldCheck,
    applyKeys: [
      'visaStatus',
      'workPermitStatus',
      'passportNumber',
      'passportExpiryDate',
      'hasDrivingLicense',
      'drivingLicenseType',
      'ownVehicle',
      'vehicleTypes',
      'isVeteran',
    ],
    isAvailable: (d) =>
      anyTruthy(d, [
        'visaStatus',
        'workPermitStatus',
        'passportNumber',
        'passportExpiryDate',
        'hasDrivingLicense',
        'drivingLicenseType',
        'ownVehicle',
        'vehicleTypes',
        'isVeteran',
      ]),
    countLabel: (d) =>
      [d.visaStatus, d.hasDrivingLicense ? 'driving licence' : null, d.isVeteran ? 'veteran' : null]
        .filter(isTruthyString)
        .join(' · ') || null,
    renderPreview: (d) => (
      <div className="space-y-1.5">
        <FieldRow label="Visa status" value={d.visaStatus} applyKey="visaStatus" />
        <FieldRow label="Work permit" value={d.workPermitStatus} applyKey="workPermitStatus" />
        <FieldRow label="Passport number" value={d.passportNumber} applyKey="passportNumber" />
        <FieldRow
          label="Passport expiry"
          value={formatDate(d.passportExpiryDate)}
          applyKey="passportExpiryDate"
        />
        <FieldRow
          label="Driving licence"
          value={formatBool(d.hasDrivingLicense)}
          applyKey="hasDrivingLicense"
        />
        <FieldRow
          label="Licence type"
          value={formatEnum(d.drivingLicenseType)}
          applyKey="drivingLicenseType"
        />
        <FieldRow label="Owns vehicle" value={formatBool(d.ownVehicle)} applyKey="ownVehicle" />
        <FieldRow
          label="Vehicle types"
          value={d.vehicleTypes?.length ? d.vehicleTypes.map(formatEnum).join(', ') : null}
          applyKey="vehicleTypes"
        />
        <FieldRow label="Veteran" value={formatBool(d.isVeteran)} applyKey="isVeteran" />
      </div>
    ),
  },
  {
    key: 'disability',
    label: 'Disability disclosure',
    icon: Accessibility,
    applyKeys: ['isPhysicallyChallenged', 'disabilityType', 'disabilityPercentage'],
    isAvailable: (d) =>
      anyTruthy(d, ['isPhysicallyChallenged', 'disabilityType', 'disabilityPercentage']),
    countLabel: (d) => (d.isPhysicallyChallenged ? formatEnum(d.disabilityType) : null),
    renderPreview: (d) => (
      <div className="space-y-1.5">
        <FieldRow
          label="Has disability"
          value={formatBool(d.isPhysicallyChallenged)}
          applyKey="isPhysicallyChallenged"
        />
        <FieldRow label="Type" value={formatEnum(d.disabilityType)} applyKey="disabilityType" />
        <FieldRow
          label="Percentage"
          value={typeof d.disabilityPercentage === 'number' ? `${d.disabilityPercentage}%` : null}
          applyKey="disabilityPercentage"
        />
      </div>
    ),
  },
  {
    key: 'skills',
    label: 'Skills & languages',
    icon: Code,
    applyKeys: ['skills', 'languages', 'itSkills', 'skillsWithProficiency', 'languageProficiency'],
    isAvailable: (d) =>
      d.skills.length > 0 ||
      d.languages.length > 0 ||
      d.itSkills.length > 0 ||
      d.skillsWithProficiency.length > 0 ||
      d.languageProficiency.length > 0,
    countLabel: (d) => {
      const parts: string[] = [];
      if (d.skills.length) parts.push(`${d.skills.length} skills`);
      if (d.itSkills.length) parts.push(`${d.itSkills.length} IT skills`);
      if (d.languages.length) parts.push(`${d.languages.length} languages`);
      return parts.join(' · ') || null;
    },
    renderPreview: (d) => (
      <div className="space-y-3">
        {d.skills.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">Skills</p>
            <ChipList items={d.skills} chipKey="skills" />
          </div>
        )}
        {d.skillsWithProficiency.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">Proficiency-rated</p>
            <ul className="space-y-1 text-xs">
              {d.skillsWithProficiency.map((s, i) => (
                <SkillsListItem
                  key={i}
                  arrayKey="skillsWithProficiency"
                  index={i}
                  primary={s.skill}
                  meta={[
                    s.proficiency ? `— ${formatEnum(s.proficiency)}` : null,
                    typeof s.yearsOfExperience === 'number' ? `(${s.yearsOfExperience} yrs)` : null,
                  ]}
                />
              ))}
            </ul>
          </div>
        )}
        {d.itSkills.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">IT skills</p>
            <ul className="space-y-1 text-xs">
              {d.itSkills.map((s, i) => (
                <SkillsListItem
                  key={i}
                  arrayKey="itSkills"
                  index={i}
                  primary={s.technology}
                  meta={[
                    s.version ? ` ${s.version}` : null,
                    s.proficiency ? `— ${formatEnum(s.proficiency)}` : null,
                    typeof s.experienceYears === 'number' ? `· ${s.experienceYears} yrs` : null,
                  ]}
                />
              ))}
            </ul>
          </div>
        )}
        {d.languages.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">Languages</p>
            <ChipList items={d.languages} chipKey="languages" />
          </div>
        )}
        {d.languageProficiency.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">
              Language proficiency
            </p>
            <ul className="space-y-1 text-xs">
              {d.languageProficiency.map((l, i) => (
                <SkillsListItem
                  key={i}
                  arrayKey="languageProficiency"
                  index={i}
                  primary={l.language}
                  meta={[l.proficiency ? `— ${formatEnum(l.proficiency)}` : null]}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    ),
  },
  {
    key: 'experience',
    label: 'Work experience',
    icon: Briefcase,
    applyKeys: ['experience'],
    isAvailable: (d) => d.experience.length > 0,
    countLabel: (d) => `${d.experience.length} ${d.experience.length === 1 ? 'role' : 'roles'}`,
    renderPreview: (d) => (
      <div className="space-y-2">
        {d.experience.map((e, i) => (
          <ItemCard key={i} arrayKey="experience" index={i}>
            <p className="text-sm font-medium text-[var(--text)]">{e.role || 'Untitled role'}</p>
            {(e.company || e.location) && (
              <p>
                {e.company}
                {e.location && ` · ${e.location}`}
              </p>
            )}
            {(e.startDate || e.endDate) && (
              <p>
                {formatDate(e.startDate)}
                {' – '}
                {e.isCurrent && !e.endDate ? 'Present' : formatDate(e.endDate)}
              </p>
            )}
            {e.industry && <p>Industry: {e.industry}</p>}
            {e.department && <p>Dept: {e.department}</p>}
            {e.employmentType && <p>{formatEnum(e.employmentType)}</p>}
            {e.description && <p className="text-[var(--text-secondary)]">{e.description}</p>}
            {e.keyAchievements?.length ? (
              <ul className="ml-4 list-disc">
                {e.keyAchievements.map((a, j) => (
                  <li key={j}>{a}</li>
                ))}
              </ul>
            ) : null}
            {(typeof e.teamSize === 'number' || e.reportingTo) && (
              <p>
                {typeof e.teamSize === 'number' ? `Team: ${e.teamSize}` : ''}
                {typeof e.teamSize === 'number' && e.reportingTo ? ' · ' : ''}
                {e.reportingTo ? `Reports to: ${e.reportingTo}` : ''}
              </p>
            )}
          </ItemCard>
        ))}
      </div>
    ),
  },
  {
    key: 'education',
    label: 'Education',
    icon: GraduationCap,
    applyKeys: ['education'],
    isAvailable: (d) => d.education.length > 0,
    countLabel: (d) => `${d.education.length} ${d.education.length === 1 ? 'degree' : 'degrees'}`,
    renderPreview: (d) => (
      <div className="space-y-2">
        {d.education.map((e, i) => (
          <ItemCard key={i} arrayKey="education" index={i}>
            <p className="text-sm font-medium text-[var(--text)]">
              {e.degree || 'Degree'}
              {e.specialization && ` (${e.specialization})`}
            </p>
            {e.institution && <p>{e.institution}</p>}
            {(e.field || e.fieldOfStudy) && <p>Field: {e.field || e.fieldOfStudy}</p>}
            {(e.startDate || e.endDate) && (
              <p>
                {formatDate(e.startDate)} – {formatDate(e.endDate) || 'Present'}
              </p>
            )}
            {e.grade && (
              <p>
                Grade: {e.grade}
                {e.gradeType && ` (${formatEnum(e.gradeType)})`}
              </p>
            )}
            {e.courseType && <p>{formatEnum(e.courseType)}</p>}
            {e.boardState && <p>Board / state: {e.boardState}</p>}
            {e.activities && <p>Activities: {e.activities}</p>}
          </ItemCard>
        ))}
      </div>
    ),
  },
  {
    key: 'certifications',
    label: 'Certifications',
    icon: Award,
    applyKeys: ['certifications'],
    isAvailable: (d) => d.certifications.length > 0,
    countLabel: (d) =>
      `${d.certifications.length} ${d.certifications.length === 1 ? 'cert' : 'certs'}`,
    renderPreview: (d) => (
      <div className="space-y-2">
        {d.certifications.map((c, i) => (
          <ItemCard key={i} arrayKey="certifications" index={i}>
            <p className="text-sm font-medium text-[var(--text)]">{c.name}</p>
            {c.issuer && <p>{c.issuer}</p>}
            {(c.issueDate || c.expiryDate) && (
              <p>
                {formatDate(c.issueDate)}
                {c.expiryDate && ` → ${formatDate(c.expiryDate)}`}
                {c.doesNotExpire && ' (no expiry)'}
              </p>
            )}
            {c.credentialId && <p>ID: {c.credentialId}</p>}
            {c.url && <UrlLink href={c.url} />}
          </ItemCard>
        ))}
      </div>
    ),
  },
  {
    key: 'projects',
    label: 'Projects',
    icon: FolderGit2,
    applyKeys: ['projects'],
    isAvailable: (d) => d.projects.length > 0,
    countLabel: (d) => `${d.projects.length} ${d.projects.length === 1 ? 'project' : 'projects'}`,
    renderPreview: (d) => (
      <div className="space-y-2">
        {d.projects.map((p, i) => (
          <ItemCard key={i} arrayKey="projects" index={i}>
            <p className="text-sm font-medium text-[var(--text)]">{p.name}</p>
            {p.role && <p>Role: {p.role}</p>}
            {p.client && <p>Client: {p.client}</p>}
            {(p.startDate || p.endDate) && (
              <p>
                {formatDate(p.startDate)} –{' '}
                {p.isCurrent && !p.endDate ? 'Present' : formatDate(p.endDate)}
              </p>
            )}
            {p.description && <p className="text-[var(--text-secondary)]">{p.description}</p>}
            {p.technologies?.length ? <ChipList items={p.technologies} /> : null}
            {p.url && <UrlLink href={p.url} />}
          </ItemCard>
        ))}
      </div>
    ),
  },
  {
    key: 'publications',
    label: 'Publications',
    icon: BookOpen,
    applyKeys: ['publications'],
    isAvailable: (d) => d.publications.length > 0,
    countLabel: (d) =>
      `${d.publications.length} ${d.publications.length === 1 ? 'publication' : 'publications'}`,
    renderPreview: (d) => (
      <div className="space-y-2">
        {d.publications.map((p, i) => (
          <ItemCard key={i} arrayKey="publications" index={i}>
            <p className="text-sm font-medium text-[var(--text)]">{p.title}</p>
            {p.publisher && <p>{p.publisher}</p>}
            {p.publicationDate && <p>{formatDate(p.publicationDate)}</p>}
            {p.authors && <p>Authors: {p.authors}</p>}
            {p.description && <p className="text-[var(--text-secondary)]">{p.description}</p>}
            {p.url && <UrlLink href={p.url} />}
          </ItemCard>
        ))}
      </div>
    ),
  },
  {
    key: 'patents',
    label: 'Patents',
    icon: Scroll,
    applyKeys: ['patents'],
    isAvailable: (d) => d.patents.length > 0,
    countLabel: (d) => `${d.patents.length} ${d.patents.length === 1 ? 'patent' : 'patents'}`,
    renderPreview: (d) => (
      <div className="space-y-2">
        {d.patents.map((p, i) => (
          <ItemCard key={i} arrayKey="patents" index={i}>
            <p className="text-sm font-medium text-[var(--text)]">{p.title}</p>
            {p.patentNumber && <p>No. {p.patentNumber}</p>}
            {p.patentOffice && <p>{p.patentOffice}</p>}
            {p.status && <p>Status: {formatEnum(p.status)}</p>}
            {(p.filingDate || p.issueDate) && (
              <p>
                Filed {formatDate(p.filingDate)}
                {p.issueDate && ` · Issued ${formatDate(p.issueDate)}`}
              </p>
            )}
            {p.inventors && <p>Inventors: {p.inventors}</p>}
            {p.url && <UrlLink href={p.url} />}
          </ItemCard>
        ))}
      </div>
    ),
  },
  {
    key: 'awards',
    label: 'Awards',
    icon: Award,
    applyKeys: ['awards'],
    isAvailable: (d) => d.awards.length > 0,
    countLabel: (d) => `${d.awards.length} ${d.awards.length === 1 ? 'award' : 'awards'}`,
    renderPreview: (d) => (
      <div className="space-y-2">
        {d.awards.map((a, i) => (
          <ItemCard key={i} arrayKey="awards" index={i}>
            <p className="text-sm font-medium text-[var(--text)]">{a.title}</p>
            {a.issuer && <p>{a.issuer}</p>}
            {a.date && <p>{formatDate(a.date)}</p>}
            {a.description && <p className="text-[var(--text-secondary)]">{a.description}</p>}
          </ItemCard>
        ))}
      </div>
    ),
  },
  {
    key: 'volunteer',
    label: 'Volunteer experience',
    icon: HandHeart,
    applyKeys: ['volunteerExperience'],
    isAvailable: (d) => d.volunteerExperience.length > 0,
    countLabel: (d) =>
      `${d.volunteerExperience.length} ${
        d.volunteerExperience.length === 1 ? 'engagement' : 'engagements'
      }`,
    renderPreview: (d) => (
      <div className="space-y-2">
        {d.volunteerExperience.map((v, i) => (
          <ItemCard key={i} arrayKey="volunteerExperience" index={i}>
            <p className="text-sm font-medium text-[var(--text)]">{v.role || 'Volunteer'}</p>
            {v.organization && <p>{v.organization}</p>}
            {v.cause && <p>Cause: {v.cause}</p>}
            {(v.startDate || v.endDate) && (
              <p>
                {formatDate(v.startDate)} –{' '}
                {v.isCurrent && !v.endDate ? 'Present' : formatDate(v.endDate)}
              </p>
            )}
            {v.description && <p className="text-[var(--text-secondary)]">{v.description}</p>}
          </ItemCard>
        ))}
      </div>
    ),
  },
  {
    key: 'memberships',
    label: 'Professional memberships',
    icon: Users,
    applyKeys: ['professionalMemberships'],
    isAvailable: (d) => d.professionalMemberships.length > 0,
    countLabel: (d) =>
      `${d.professionalMemberships.length} ${
        d.professionalMemberships.length === 1 ? 'membership' : 'memberships'
      }`,
    renderPreview: (d) => (
      <div className="space-y-2">
        {d.professionalMemberships.map((m, i) => (
          <ItemCard key={i} arrayKey="professionalMemberships" index={i}>
            <p className="text-sm font-medium text-[var(--text)]">{m.organization}</p>
            {m.role && <p>{m.role}</p>}
            {(m.startDate || m.endDate) && (
              <p>
                {formatDate(m.startDate)} – {formatDate(m.endDate) || 'Present'}
              </p>
            )}
            {m.membershipId && <p>ID: {m.membershipId}</p>}
            {m.description && <p className="text-[var(--text-secondary)]">{m.description}</p>}
          </ItemCard>
        ))}
      </div>
    ),
  },
  {
    key: 'courses',
    label: 'Courses',
    icon: BookOpen,
    applyKeys: ['courses'],
    isAvailable: (d) => d.courses.length > 0,
    countLabel: (d) => `${d.courses.length} ${d.courses.length === 1 ? 'course' : 'courses'}`,
    renderPreview: (d) => (
      <div className="space-y-2">
        {d.courses.map((c, i) => (
          <ItemCard key={i} arrayKey="courses" index={i}>
            <p className="text-sm font-medium text-[var(--text)]">{c.name}</p>
            {c.provider && <p>{c.provider}</p>}
            {c.completionDate && <p>Completed {formatDate(c.completionDate)}</p>}
            {c.associatedWith && <p>Through: {c.associatedWith}</p>}
            {c.url && <UrlLink href={c.url} />}
          </ItemCard>
        ))}
      </div>
    ),
  },
  {
    key: 'testScores',
    label: 'Test scores',
    icon: ListChecks,
    applyKeys: ['testScores'],
    isAvailable: (d) => d.testScores.length > 0,
    countLabel: (d) => `${d.testScores.length} ${d.testScores.length === 1 ? 'score' : 'scores'}`,
    renderPreview: (d) => (
      <div className="space-y-2">
        {d.testScores.map((t, i) => (
          <ItemCard key={i} arrayKey="testScores" index={i}>
            <p className="text-sm font-medium text-[var(--text)]">{t.testName}</p>
            <p>Score: {t.score}</p>
            {t.dateOfExam && <p>{formatDate(t.dateOfExam)}</p>}
            {t.associatedWith && <p>Through: {t.associatedWith}</p>}
            {t.description && <p className="text-[var(--text-secondary)]">{t.description}</p>}
          </ItemCard>
        ))}
      </div>
    ),
  },
  {
    key: 'references',
    label: 'References',
    icon: ContactRound,
    applyKeys: ['references'],
    isAvailable: (d) => d.references.length > 0,
    countLabel: (d) =>
      `${d.references.length} ${d.references.length === 1 ? 'reference' : 'references'}`,
    renderPreview: (d) => (
      <div className="space-y-2">
        {d.references.map((r, i) => (
          <ItemCard key={i} arrayKey="references" index={i}>
            <p className="text-sm font-medium text-[var(--text)]">{r.name}</p>
            {(r.designation || r.organization) && (
              <p>
                {r.designation}
                {r.designation && r.organization ? ' · ' : ''}
                {r.organization}
              </p>
            )}
            {r.email && <p>{r.email}</p>}
            {r.phone && <p>{r.phone}</p>}
            {r.relationship && <p>{r.relationship}</p>}
          </ItemCard>
        ))}
      </div>
    ),
  },
  {
    key: 'interests',
    label: 'Interests, hobbies & exclusions',
    icon: Heart,
    applyKeys: ['interests', 'hobbies', 'blockedCompanies'],
    isAvailable: (d) =>
      d.interests.length > 0 || d.hobbies.length > 0 || d.blockedCompanies.length > 0,
    countLabel: (d) => {
      const parts: string[] = [];
      if (d.interests.length) parts.push(`${d.interests.length} interests`);
      if (d.hobbies.length) parts.push(`${d.hobbies.length} hobbies`);
      if (d.blockedCompanies.length) parts.push(`${d.blockedCompanies.length} blocked`);
      return parts.join(' · ') || null;
    },
    renderPreview: (d) => (
      <div className="space-y-3">
        {d.interests.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">Interests</p>
            <ChipList items={d.interests} chipKey="interests" />
          </div>
        )}
        {d.hobbies.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">Hobbies</p>
            <ChipList items={d.hobbies} chipKey="hobbies" />
          </div>
        )}
        {d.blockedCompanies.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">
              Companies to exclude
            </p>
            <ChipList items={d.blockedCompanies} chipKey="blockedCompanies" />
          </div>
        )}
      </div>
    ),
  },
  {
    key: 'social',
    label: 'Social profiles',
    icon: Globe,
    applyKeys: [
      'linkedinProfile',
      'githubProfile',
      'portfolioUrl',
      'stackOverflowProfile',
      'twitterProfile',
      'personalBlogUrl',
      'dribbbleProfile',
      'behanceProfile',
      'mediumProfile',
      'youtubeChannel',
    ],
    isAvailable: (d) =>
      anyTruthy(d, [
        'linkedinProfile',
        'githubProfile',
        'portfolioUrl',
        'stackOverflowProfile',
        'twitterProfile',
        'personalBlogUrl',
        'dribbbleProfile',
        'behanceProfile',
        'mediumProfile',
        'youtubeChannel',
      ]),
    countLabel: (d) => {
      const count = [
        d.linkedinProfile,
        d.githubProfile,
        d.portfolioUrl,
        d.stackOverflowProfile,
        d.twitterProfile,
        d.personalBlogUrl,
        d.dribbbleProfile,
        d.behanceProfile,
        d.mediumProfile,
        d.youtubeChannel,
      ].filter(isTruthyString).length;
      return count > 0 ? `${count} link${count === 1 ? '' : 's'}` : null;
    },
    renderPreview: (d) => (
      <div className="space-y-1.5">
        <FieldRow
          label="LinkedIn"
          value={<UrlLink href={d.linkedinProfile} />}
          applyKey="linkedinProfile"
        />
        <FieldRow
          label="GitHub"
          value={<UrlLink href={d.githubProfile} />}
          applyKey="githubProfile"
        />
        <FieldRow
          label="Portfolio"
          value={<UrlLink href={d.portfolioUrl} />}
          applyKey="portfolioUrl"
        />
        <FieldRow
          label="Stack Overflow"
          value={<UrlLink href={d.stackOverflowProfile} />}
          applyKey="stackOverflowProfile"
        />
        <FieldRow
          label="Twitter / X"
          value={<UrlLink href={d.twitterProfile} />}
          applyKey="twitterProfile"
        />
        <FieldRow
          label="Blog"
          value={<UrlLink href={d.personalBlogUrl} />}
          applyKey="personalBlogUrl"
        />
        <FieldRow
          label="Dribbble"
          value={<UrlLink href={d.dribbbleProfile} />}
          applyKey="dribbbleProfile"
        />
        <FieldRow
          label="Behance"
          value={<UrlLink href={d.behanceProfile} />}
          applyKey="behanceProfile"
        />
        <FieldRow
          label="Medium"
          value={<UrlLink href={d.mediumProfile} />}
          applyKey="mediumProfile"
        />
        <FieldRow
          label="YouTube"
          value={<UrlLink href={d.youtubeChannel} />}
          applyKey="youtubeChannel"
        />
      </div>
    ),
  },
];

// ── Component ────────────────────────────────────────────────────────

interface ResumeParseReviewProps {
  parsedData: ParsedResumeData;
  onApplyFields: (fields: Partial<ApplyableResumeFields>) => void;
  onCancel: () => void;
}

export default function ResumeParseReview({
  parsedData,
  onApplyFields,
  onCancel,
}: ResumeParseReviewProps) {
  const availableSections = useMemo(
    () => SECTIONS.filter((s) => s.isAvailable(parsedData)),
    [parsedData],
  );

  const [selected, setSelected] = useState<Set<SectionKey>>(
    () => new Set(availableSections.map((s) => s.key)),
  );
  // Start collapsed by default — fewer than 4 sections is the
  // exception (most resumes have 10+ filled sections, would otherwise
  // produce a wall of text). User clicks to expand the ones they
  // want to verify before applying.
  const [expanded, setExpanded] = useState<Set<SectionKey>>(() => new Set());
  // Field/item/chip-level deselections live in a single string-keyed
  // set with prefixed keys — see FieldDeselectContext comment for the
  // key format. Membership means "exclude from apply payload".
  const [deselected, setDeselected] = useState<Set<string>>(() => new Set());

  function toggleDeselected(key: string) {
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allSelected =
    availableSections.length > 0 && availableSections.every((s) => selected.has(s.key));
  const noneSelected = selected.size === 0;

  function toggleSection(key: SectionKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleExpand(key: SectionKey) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(availableSections.map((s) => s.key)));
  }

  function expandAll() {
    setExpanded(new Set(availableSections.map((s) => s.key)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  /**
   * Build the apply payload in three filter passes:
   *
   *   1. Start from the canonical `buildApplyableFields` mapping.
   *   2. Strip all keys belonging to UNCHECKED sections (section-level
   *      toggle — bulk drop).
   *   3. For sections that ARE checked, apply finer-grained
   *      deselections:
   *        - `scalar:<key>`     drops that scalar key (or comma-separated
   *                             composite of keys, e.g. "firstName,lastName")
   *        - `item:<arrayKey>:<index>`  splices that index out of the
   *                             corresponding array (experience #2 etc.)
   *        - `chip:<arrayKey>:<index>`  splices that index out of a
   *                             chip-style array (skills, languages,
   *                             interests, hobbies, blockedCompanies,
   *                             preferredLocations, etc.)
   *
   * Order matters — section-level drops first means we don't waste
   * cycles filtering arrays whose entire section was already removed.
   */
  function buildPayload(
    sel: ReadonlySet<SectionKey>,
    fieldDeselect: ReadonlySet<string>,
  ): Partial<ApplyableResumeFields> {
    const payload = buildApplyableFields(parsedData) as Record<string, unknown>;

    // Pass 1 — section-level toggle
    for (const section of SECTIONS) {
      if (!sel.has(section.key)) {
        for (const k of section.applyKeys) delete payload[k];
      }
    }

    // Pass 2/3 — field- and item-level toggles. Only applies to keys
    // still present after the section pass.
    for (const key of fieldDeselect) {
      if (key.startsWith('scalar:')) {
        // Composite keys like "firstName,lastName" map to multiple
        // payload entries — split + drop each.
        const compositeKeys = key.slice('scalar:'.length).split(',');
        for (const ck of compositeKeys) {
          delete payload[ck];
        }
      } else if (key.startsWith('item:') || key.startsWith('chip:')) {
        // "item:experience:3" or "chip:skills:5" — drop index 3 / 5
        // from the corresponding array. We mutate (filter) the array
        // in place rather than re-keying because the apply handler
        // doesn't care about index continuity, only content.
        const parts = key.split(':'); // [item|chip, arrayKey, index]
        if (parts.length !== 3) continue;
        const [, arrayKey, idxStr] = parts;
        const idx = Number(idxStr);
        if (!Number.isFinite(idx)) continue;
        const arr = payload[arrayKey];
        if (Array.isArray(arr)) {
          // Defer index-based filtering: collect all deselected
          // indices for this arrayKey, then filter once. To keep this
          // function simple we do per-key filter — N is small (resumes
          // rarely have 50+ items in one array) so O(items × deselects)
          // is fine.
          payload[arrayKey] = arr.filter((_, i) => i !== idx);
        }
      }
    }

    // After array-item filtering, drop empty arrays — applying an
    // empty array would clobber the user's existing list. Same rule
    // buildApplyableFields uses for missing-from-parse arrays.
    for (const [k, v] of Object.entries(payload)) {
      if (Array.isArray(v) && v.length === 0) {
        delete payload[k];
      }
    }

    return payload as Partial<ApplyableResumeFields>;
  }

  function handleApply() {
    const payload = buildPayload(selected, deselected);
    if (Object.keys(payload).length > 0) onApplyFields(payload);
  }

  function handleApplyAll() {
    // "Apply All" forces every section ON and clears every field-level
    // deselection — semantically "apply everything we found, no
    // exceptions". We update local state too so the UI reflects what
    // was applied.
    const all = new Set(availableSections.map((s) => s.key));
    const emptyDeselect = new Set<string>();
    setSelected(all);
    setDeselected(emptyDeselect);
    onApplyFields(buildPayload(all, emptyDeselect));
  }

  if (availableSections.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <FileText className="h-10 w-10 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-secondary)]">
            No extractable data found in your resume. Try uploading a different format.
          </p>
          <Button variant="ghost" size="sm" onClick={onCancel} tooltip="Dismiss parsed results">
            Dismiss
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <WandSparkles className="text-primary h-5 w-5" />
        <h3 className="text-base font-semibold text-[var(--text)]">AI-Parsed Resume Data</h3>
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        {availableSections.length} sections extracted from your resume. Untick whole sections to
        skip them, or expand a section to untick individual fields, entries, or chips inside it.
      </p>

      {/* Bulk controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2.5">
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="text-primary focus:ring-primary h-4 w-4 rounded border-[var(--border)]"
          />
          <span className="text-sm font-medium text-[var(--text)]">
            Select all ({selected.size}/{availableSections.length})
          </span>
        </label>
        <div className="flex items-center gap-3 text-xs">
          <button type="button" onClick={expandAll} className="text-primary hover:underline">
            Expand all
          </button>
          <span className="text-[var(--text-muted)]">·</span>
          <button type="button" onClick={collapseAll} className="text-primary hover:underline">
            Collapse all
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {availableSections.map((section) => {
          const sectionChecked = selected.has(section.key);
          // Provide a per-section context so the FieldRows / ItemCards
          // / ChipLists inside this section's renderPreview render
          // checkboxes that toggle the shared `deselected` set.
          //
          // `enabled` reflects whether the section itself is selected —
          // when the section is unchecked the whole payload-subset is
          // dropped wholesale, so showing field-level checkboxes would
          // suggest a granularity the user doesn't actually have.
          const ctxValue: FieldDeselectCtx = {
            isDeselected: (key: string) => deselected.has(key),
            toggle: toggleDeselected,
            enabled: sectionChecked,
          };
          return (
            <FieldDeselectContext.Provider key={section.key} value={ctxValue}>
              <SectionCard
                section={section}
                data={parsedData}
                checked={sectionChecked}
                expanded={expanded.has(section.key)}
                onToggleSelected={() => toggleSection(section.key)}
                onToggleExpanded={() => toggleExpand(section.key)}
              />
            </FieldDeselectContext.Provider>
          );
        })}
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-3">
        <Button
          onClick={handleApply}
          disabled={noneSelected}
          tooltip="Apply selected fields to your profile"
        >
          <CheckCircle2 className="mr-1.5 h-4 w-4" />
          Apply Selected ({selected.size})
        </Button>
        <Button
          variant="outline"
          onClick={handleApplyAll}
          tooltip="Apply all parsed fields to your profile"
        >
          Apply All
        </Button>
        <Button variant="ghost" onClick={onCancel} tooltip="Cancel and discard parsed data">
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Single-section card (extracted for readability) ──────────────────

function SectionCard({
  section,
  data,
  checked,
  expanded,
  onToggleSelected,
  onToggleExpanded,
}: {
  section: SectionDef;
  data: ParsedResumeData;
  checked: boolean;
  expanded: boolean;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
}) {
  const Icon: ComponentType<{ className?: string }> = section.icon;
  const summary = section.countLabel(data);

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleSelected}
          className="text-primary focus:ring-primary h-4 w-4 rounded border-[var(--border)]"
        />
        <Icon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text)]">{section.label}</p>
          {summary && <p className="truncate text-xs text-[var(--text-muted)]">{summary}</p>}
        </div>
        <Tooltip content={expanded ? 'Collapse section' : 'Expand section'}>
          <button
            type="button"
            onClick={onToggleExpanded}
            className="rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </Tooltip>
      </div>
      {expanded && (
        <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
          {section.renderPreview(data)}
        </div>
      )}
    </div>
  );
}
