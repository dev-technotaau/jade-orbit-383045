/**
 * Resume template registry — single source of truth for the templates
 * the candidate can pick when generating a PDF resume.
 *
 * Adding a new template = drop a new `.hbs` file under `src/templates/resume/`
 * and add an entry to the array below. No service or controller changes.
 *
 * Free vs paid:
 *   - `requiresPremium: false` → available to every candidate.
 *   - `requiresPremium: true`  → gated by the `feature.candidate_ai_resume_premium`
 *     entitlement (CAND_PREMIUM plan, ₹199 / 30d). The generator service
 *     enforces this at render time; the frontend renders a lock badge.
 */

export interface ResumeTemplateConfig {
  /** Stable identifier — used in URLs (?template=...) and persisted prefs. */
  id: string;
  /** Human-readable label shown in the picker. */
  name: string;
  /** One-line description shown under the name. */
  description: string;
  /** Filename inside `src/templates/resume/` (without the .hbs extension). */
  file: string;
  /** Whether the template is gated by the candidate-Premium feature flag. */
  requiresPremium: boolean;
  /** Hex accent — drives the small swatch in the picker thumbnail. */
  accentColor: string;
}

export const RESUME_TEMPLATES: ResumeTemplateConfig[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Clean, single-column layout with a blue header. Recruiter-friendly default.',
    file: 'classic',
    requiresPremium: false,
    accentColor: '#2563eb',
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Two-column layout with a coloured sidebar for contact, skills and languages.',
    file: 'modern',
    requiresPremium: true,
    accentColor: '#0f766e',
  },
  {
    id: 'executive',
    name: 'Executive',
    description: 'Serif typography and dignified spacing — for senior and leadership roles.',
    file: 'executive',
    requiresPremium: true,
    accentColor: '#7c2d12',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Lots of whitespace, ultra-light type. Hands the focus to your content.',
    file: 'minimal',
    requiresPremium: true,
    accentColor: '#111827',
  },
  {
    id: 'tech',
    name: 'Tech',
    description: 'Mono-font headings with a project-first ordering — built for engineers.',
    file: 'tech',
    requiresPremium: true,
    accentColor: '#9333ea',
  },
];

export const DEFAULT_RESUME_TEMPLATE_ID = 'classic';

export function getResumeTemplate(id: string | undefined | null): ResumeTemplateConfig {
  const normalised = (id ?? '').trim().toLowerCase() || DEFAULT_RESUME_TEMPLATE_ID;
  const found = RESUME_TEMPLATES.find((t) => t.id === normalised);
  return found ?? RESUME_TEMPLATES[0];
}
