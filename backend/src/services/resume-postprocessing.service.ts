/**
 * Resume post-processing: normalises, deduplicates, validates, and
 * scores the output of the OCR → Gemini extraction pipeline.
 *
 * Inputs are already schema-validated (Zod) by the extractor, so this
 * stage focuses on:
 *   - Surface-cleaning (trim, title-case names, lower-case emails,
 *     dedupe skills with canonical aliases)
 *   - Format conversion (date strings → ISO YYYY-MM-DD, phone numbers
 *     → E.164-ish, "5 LPA" stays as a number, etc.)
 *   - Cross-field validation (endDate >= startDate; flag impossibly
 *     long employments; collapse "current" markers)
 *   - Confidence scoring (the worker writes this back so the frontend
 *     can show a "85% confidence" hint before applying fields)
 *
 * Everything here is defensive — if normalisation fails for any field
 * the raw value is preserved and a warning is added. The pipeline must
 * never throw out useful data because of a normaliser bug.
 */
import logger from '../config/logger';
import type { ParsedResumeData } from './resume-schema';

interface ConfidenceScores {
  overall: number;
  fields: Record<string, number>;
}

interface PostprocessResult {
  data: ParsedResumeData;
  confidence: ConfidenceScores;
  warnings: string[];
}

// ── Scalar normalisers ──────────────────────────────────────────────

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    logger.warn(`Invalid email format dropped: ${trimmed}`);
    return null;
  }
  return trimmed;
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (phone.trim().startsWith('+')) {
    cleaned = '+' + cleaned.replace(/\+/g, '');
  }
  // Indian 10-digit mobile numbers without country code → +91
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) cleaned = '+91' + cleaned;
  // US 10-digit → +1
  if (cleaned.length === 10 && !cleaned.startsWith('+')) cleaned = '+1' + cleaned;

  const digitCount = cleaned.replace(/\+/g, '').length;
  if (digitCount < 10 || digitCount > 15) {
    logger.warn(`Phone length out of range, keeping original: ${phone}`);
    return phone.trim();
  }
  return cleaned;
}

function normalizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  let cleaned = name
    .trim()
    .replace(/^(Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Prof\.?)\s+/i, '')
    .replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '');
  cleaned = cleaned
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
  return cleaned.length > 0 ? cleaned : null;
}

// Canonical-form lookup table for common skill aliases. Extend
// conservatively — wrong aliases hurt search matching downstream.
const SKILL_ALIASES: Record<string, string> = {
  javascript: 'JavaScript',
  js: 'JavaScript',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  nodejs: 'Node.js',
  'node.js': 'Node.js',
  node: 'Node.js',
  reactjs: 'React',
  'react.js': 'React',
  vuejs: 'Vue.js',
  'vue.js': 'Vue.js',
  angularjs: 'Angular',
  nextjs: 'Next.js',
  'next.js': 'Next.js',
  mongodb: 'MongoDB',
  postgresql: 'PostgreSQL',
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  aws: 'AWS',
  gcp: 'Google Cloud',
  'google cloud platform': 'Google Cloud',
  azure: 'Microsoft Azure',
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  k8s: 'Kubernetes',
  git: 'Git',
  github: 'GitHub',
  gitlab: 'GitLab',
  python: 'Python',
  java: 'Java',
  'c++': 'C++',
  cpp: 'C++',
  csharp: 'C#',
  'c#': 'C#',
  dotnet: '.NET',
  '.net': '.NET',
  golang: 'Go',
  go: 'Go',
  rust: 'Rust',
  ruby: 'Ruby',
  rails: 'Ruby on Rails',
  'ruby on rails': 'Ruby on Rails',
  swift: 'Swift',
  kotlin: 'Kotlin',
  flutter: 'Flutter',
  'react native': 'React Native',
  graphql: 'GraphQL',
  rest: 'REST API',
  'rest api': 'REST API',
  html: 'HTML',
  html5: 'HTML5',
  css: 'CSS',
  css3: 'CSS3',
  sass: 'Sass',
  scss: 'Sass',
  tailwind: 'Tailwind CSS',
  'tailwind css': 'Tailwind CSS',
  bootstrap: 'Bootstrap',
  jquery: 'jQuery',
  express: 'Express.js',
  'express.js': 'Express.js',
  django: 'Django',
  flask: 'Flask',
  spring: 'Spring',
  'spring boot': 'Spring Boot',
  redis: 'Redis',
  kafka: 'Apache Kafka',
  rabbitmq: 'RabbitMQ',
  elasticsearch: 'Elasticsearch',
  terraform: 'Terraform',
  ansible: 'Ansible',
};

function normalizeSkills(skills: string[]): string[] {
  if (!skills.length) return [];
  const normalised = skills
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .map((s) => {
      const lower = s.toLowerCase();
      if (SKILL_ALIASES[lower]) return SKILL_ALIASES[lower];
      // Multi-word: title-case each word
      if (s.includes(' ')) {
        return s
          .split(' ')
          .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
          .join(' ');
      }
      return s;
    });

  // Dedupe case-insensitively, keep first canonical form
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const skill of normalised) {
    const key = skill.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(skill);
    }
  }
  return unique;
}

// Dedupe a string[] preserving order. Used for languages, interests,
// hobbies, preferredLocations, etc.
function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

// Date string → ISO YYYY-MM-DD. Accepts most common resume formats,
// preserving the day-of-month wherever the source contains one. Returns
// null for "Present" / "Current" / "Ongoing".
//
// Day-preserving regexes are matched BEFORE month-year-only fallbacks so
// "15-10-1996" (a complete DD-MM-YYYY date) is never collapsed to
// "1996-01-01" by the bare-YYYY rule.
function normalizeDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr
    .trim()
    // Some Gemini outputs include a trailing comma or period from the
    // source ("October 15, 1996.") — strip non-date punctuation first.
    .replace(/[,.;]+$/, '')
    .trim();
  if (!trimmed) return null;
  if (/^(present|current|now|ongoing|till date|todate|to date|date)$/i.test(trimmed)) return null;

  const monthMap: Record<string, string> = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };

  // Already ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // YYYY/MM/DD or YYYY.MM.DD
  let m = trimmed.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (Indian + European default)
  m = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  // DD Mon YYYY  (e.g. "15 Oct 1996" / "15 October 1996")
  // Hyphens placed at end of character classes so they're treated as
  // literal `-` rather than a range delimiter — no backslash needed,
  // satisfies eslint no-useless-escape.
  m = trimmed.match(/^(\d{1,2})[\s-]([A-Za-z]+)[\s,-]+(\d{4})$/);
  if (m) {
    const month = monthMap[m[2].toLowerCase().slice(0, 3)];
    if (month) return `${m[3]}-${month}-${m[1].padStart(2, '0')}`;
  }

  // Mon DD, YYYY  (e.g. "Oct 15, 1996" / "October 15, 1996")
  m = trimmed.match(/^([A-Za-z]+)[\s.-]+(\d{1,2})(?:st|nd|rd|th)?[\s,]+(\d{4})$/);
  if (m) {
    const month = monthMap[m[1].toLowerCase().slice(0, 3)];
    if (month) return `${m[3]}-${month}-${m[2].padStart(2, '0')}`;
  }

  // YYYY-MM (no day) — must come AFTER day-bearing patterns above.
  m = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-01`;

  // MM/YYYY (no day)
  m = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;

  // YYYY only — last-resort numeric pattern. Day-bearing DD/MM/YYYY etc.
  // are matched above, so reaching here means there really is no day or
  // month in the source.
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;

  // Month YYYY or Mon YYYY  (no day in source)
  m = trimmed.match(/^([A-Za-z]+)[\s,]+(\d{4})$/);
  if (m) {
    const month = monthMap[m[1].toLowerCase().slice(0, 3)] ?? '01';
    return `${m[2]}-${month}-01`;
  }

  logger.debug(`Could not normalise date, keeping original: ${dateStr}`);
  return trimmed;
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let v = url.trim();
  if (!v) return null;
  // Add scheme if missing (LinkedIn URLs frequently show as "linkedin.com/in/...")
  if (!/^https?:\/\//i.test(v) && /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(v)) {
    v = 'https://' + v;
  }
  return v;
}

// ── Array normalisers ──────────────────────────────────────────────

function normalizeExperience(entries: ParsedResumeData['experience']): {
  data: ParsedResumeData['experience'];
  warnings: string[];
} {
  const warnings: string[] = [];
  const cleaned = entries
    .map((e) => ({
      ...e,
      startDate: normalizeDate(e.startDate),
      endDate: normalizeDate(e.endDate),
      isCurrent: e.isCurrent ?? !e.endDate, // if endDate fell through to null, treat as current
      keyAchievements: e.keyAchievements ? dedupeStrings(e.keyAchievements) : null,
    }))
    .filter((e) => {
      if (!e.company && !e.role) {
        warnings.push('Dropped experience entry missing both company and role');
        return false;
      }
      if (e.startDate && e.endDate && new Date(e.endDate) < new Date(e.startDate)) {
        warnings.push(`Experience date inversion: ${e.company || e.role}`);
      }
      return true;
    });
  return { data: cleaned, warnings };
}

function normalizeEducation(entries: ParsedResumeData['education']): {
  data: ParsedResumeData['education'];
  warnings: string[];
} {
  const warnings: string[] = [];
  const cleaned = entries
    .map((e) => ({
      ...e,
      startDate: normalizeDate(e.startDate),
      endDate: normalizeDate(e.endDate),
    }))
    .filter((e) => {
      if (!e.institution && !e.degree) {
        warnings.push('Dropped education entry missing both institution and degree');
        return false;
      }
      return true;
    });
  return { data: cleaned, warnings };
}

function normalizeCertifications(
  entries: ParsedResumeData['certifications']
): ParsedResumeData['certifications'] {
  return entries
    .map((c) => ({
      ...c,
      issueDate: normalizeDate(c.issueDate),
      expiryDate: normalizeDate(c.expiryDate),
      url: normalizeUrl(c.url),
    }))
    .filter((c) => (c.name?.length ?? 0) >= 2);
}

function normalizeProjects(entries: ParsedResumeData['projects']): ParsedResumeData['projects'] {
  return entries
    .map((p) => ({
      ...p,
      startDate: normalizeDate(p.startDate),
      endDate: normalizeDate(p.endDate),
      url: normalizeUrl(p.url),
      isCurrent: p.isCurrent ?? !p.endDate,
      technologies: p.technologies ? dedupeStrings(p.technologies) : null,
    }))
    .filter((p) => (p.name?.length ?? 0) >= 2);
}

function normalizePublications(
  entries: ParsedResumeData['publications']
): ParsedResumeData['publications'] {
  return entries
    .map((p) => ({
      ...p,
      publicationDate: normalizeDate(p.publicationDate),
      url: normalizeUrl(p.url),
    }))
    .filter((p) => (p.title?.length ?? 0) >= 2);
}

function normalizePatents(entries: ParsedResumeData['patents']): ParsedResumeData['patents'] {
  return entries
    .map((p) => ({
      ...p,
      filingDate: normalizeDate(p.filingDate),
      issueDate: normalizeDate(p.issueDate),
      url: normalizeUrl(p.url),
    }))
    .filter((p) => (p.title?.length ?? 0) >= 2);
}

function normalizeAwards(entries: ParsedResumeData['awards']): ParsedResumeData['awards'] {
  return entries
    .map((a) => ({ ...a, date: normalizeDate(a.date) }))
    .filter((a) => (a.title?.length ?? 0) >= 2);
}

function normalizeVolunteer(
  entries: ParsedResumeData['volunteerExperience']
): ParsedResumeData['volunteerExperience'] {
  return entries
    .map((v) => ({
      ...v,
      startDate: normalizeDate(v.startDate),
      endDate: normalizeDate(v.endDate),
      isCurrent: v.isCurrent ?? !v.endDate,
    }))
    .filter((v) => (v.organization?.length ?? 0) >= 2 || (v.role?.length ?? 0) >= 2);
}

function normalizeMemberships(
  entries: ParsedResumeData['professionalMemberships']
): ParsedResumeData['professionalMemberships'] {
  return entries
    .map((m) => ({
      ...m,
      startDate: normalizeDate(m.startDate),
      endDate: normalizeDate(m.endDate),
    }))
    .filter((m) => (m.organization?.length ?? 0) >= 2);
}

function normalizeCourses(entries: ParsedResumeData['courses']): ParsedResumeData['courses'] {
  return entries
    .map((c) => ({
      ...c,
      completionDate: normalizeDate(c.completionDate),
      url: normalizeUrl(c.url),
    }))
    .filter((c) => (c.name?.length ?? 0) >= 2);
}

function normalizeTestScores(
  entries: ParsedResumeData['testScores']
): ParsedResumeData['testScores'] {
  return entries
    .map((t) => ({ ...t, dateOfExam: normalizeDate(t.dateOfExam) }))
    .filter((t) => (t.testName?.length ?? 0) >= 2 && (t.score?.length ?? 0) >= 1);
}

function normalizeReferences(
  entries: ParsedResumeData['references']
): ParsedResumeData['references'] {
  return entries
    .map((r) => ({
      ...r,
      email: normalizeEmail(r.email),
      phone: normalizePhone(r.phone),
    }))
    .filter((r) => (r.name?.length ?? 0) >= 2);
}

// ── Confidence scoring ─────────────────────────────────────────────

function calculateConfidence(data: ParsedResumeData): ConfidenceScores {
  const scores: Record<string, number> = {};

  if (data.name) {
    const words = data.name.split(/\s+/);
    if (words.length >= 2 && words.every((w) => w.length >= 2 && /^[A-Z]/.test(w))) {
      scores.name = 0.95;
    } else if (words.length >= 2) {
      scores.name = 0.75;
    } else {
      scores.name = 0.5;
    }
  }

  if (data.email) {
    scores.email = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(data.email) ? 0.98 : 0.6;
  }

  if (data.phone) {
    const hasCountryCode = data.phone.startsWith('+');
    const digitCount = data.phone.replace(/\D/g, '').length;
    if (hasCountryCode && digitCount >= 10 && digitCount <= 15) scores.phone = 0.95;
    else if (digitCount >= 10) scores.phone = 0.8;
    else scores.phone = 0.5;
  }

  if (data.skills.length > 0) {
    const avg = data.skills.reduce((s, x) => s + x.length, 0) / data.skills.length;
    if (data.skills.length >= 5 && avg >= 3) scores.skills = 0.9;
    else if (data.skills.length >= 3) scores.skills = 0.75;
    else scores.skills = 0.6;
  }

  if (data.experience.length > 0) {
    const allHaveCompanyOrRole = data.experience.every((e) => e.company || e.role);
    const detailed = data.experience.some((e) => e.startDate && e.role && e.company);
    if (allHaveCompanyOrRole && detailed) scores.experience = 0.9;
    else if (allHaveCompanyOrRole) scores.experience = 0.75;
    else scores.experience = 0.6;
  }

  if (data.education.length > 0) {
    const allHaveInstitutionOrDegree = data.education.every((e) => e.institution || e.degree);
    const detailed = data.education.some((e) => e.degree && e.institution);
    if (allHaveInstitutionOrDegree && detailed) scores.education = 0.95;
    else if (allHaveInstitutionOrDegree) scores.education = 0.8;
    else scores.education = 0.65;
  }

  // Bonus signals: when these surface they're strongly positive
  if (data.linkedinProfile) scores.linkedinProfile = 0.95;
  if (data.githubProfile) scores.githubProfile = 0.95;
  if (data.summary && data.summary.length >= 50) scores.summary = 0.85;
  if (data.certifications.length > 0) scores.certifications = 0.85;
  if (data.projects.length > 0) scores.projects = 0.85;

  // Weighted overall — heavier weight on core fields. Bonus signals
  // only nudge the score; they don't dominate it.
  const weights: Record<string, number> = {
    name: 0.15,
    email: 0.15,
    phone: 0.1,
    skills: 0.2,
    experience: 0.25,
    education: 0.15,
  };

  let overall = 0;
  let totalWeight = 0;
  for (const [field, weight] of Object.entries(weights)) {
    const score = scores[field];
    if (score !== undefined) {
      overall += score * weight;
      totalWeight += weight;
    }
  }

  return {
    overall: totalWeight > 0 ? overall / totalWeight : 0,
    fields: scores,
  };
}

// ── Public API ─────────────────────────────────────────────────────

export async function postprocessResume(data: ParsedResumeData): Promise<PostprocessResult> {
  const warnings: string[] = [];

  try {
    const normalised: ParsedResumeData = {
      ...data,

      // Identity
      name: normalizeName(data.name),
      email: normalizeEmail(data.email),
      phone: normalizePhone(data.phone),
      alternateEmail: normalizeEmail(data.alternateEmail),
      alternatePhone: normalizePhone(data.alternatePhone),

      // Dates
      dob: normalizeDate(data.dob),
      passportExpiryDate: normalizeDate(data.passportExpiryDate),
      dateOfAvailability: normalizeDate(data.dateOfAvailability),

      // Lists
      skills: normalizeSkills(data.skills),
      languages: dedupeStrings(data.languages),
      interests: dedupeStrings(data.interests),
      hobbies: dedupeStrings(data.hobbies),
      preferredLocations: data.preferredLocations ? dedupeStrings(data.preferredLocations) : null,
      preferredIndustries: data.preferredIndustries
        ? dedupeStrings(data.preferredIndustries)
        : null,
      preferredRoleCategories: data.preferredRoleCategories
        ? dedupeStrings(data.preferredRoleCategories)
        : null,
      blockedCompanies: dedupeStrings(data.blockedCompanies),

      // Social URLs (normalise scheme on each)
      linkedinProfile: normalizeUrl(data.linkedinProfile),
      githubProfile: normalizeUrl(data.githubProfile),
      portfolioUrl: normalizeUrl(data.portfolioUrl),
      stackOverflowProfile: normalizeUrl(data.stackOverflowProfile),
      twitterProfile: normalizeUrl(data.twitterProfile),
      personalBlogUrl: normalizeUrl(data.personalBlogUrl),
      dribbbleProfile: normalizeUrl(data.dribbbleProfile),
      behanceProfile: normalizeUrl(data.behanceProfile),
      mediumProfile: normalizeUrl(data.mediumProfile),
      youtubeChannel: normalizeUrl(data.youtubeChannel),

      // Free-text trims. `summary` (resume's "Professional Summary" /
      // "About" section) maps to the Prisma `bio` column at the
      // frontend's apply-fields step; we keep the resume-side name
      // here to mirror resume convention.
      summary: data.summary?.trim() ?? null,
      headline: data.headline?.trim() ?? null,
    } as ParsedResumeData;

    // Rich arrays — replace + capture per-array warnings
    const exp = normalizeExperience(data.experience);
    normalised.experience = exp.data;
    warnings.push(...exp.warnings);

    const edu = normalizeEducation(data.education);
    normalised.education = edu.data;
    warnings.push(...edu.warnings);

    normalised.certifications = normalizeCertifications(data.certifications);
    normalised.projects = normalizeProjects(data.projects);
    normalised.publications = normalizePublications(data.publications);
    normalised.patents = normalizePatents(data.patents);
    normalised.awards = normalizeAwards(data.awards);
    normalised.volunteerExperience = normalizeVolunteer(data.volunteerExperience);
    normalised.professionalMemberships = normalizeMemberships(data.professionalMemberships);
    normalised.courses = normalizeCourses(data.courses);
    normalised.testScores = normalizeTestScores(data.testScores);
    normalised.references = normalizeReferences(data.references);

    const confidence = calculateConfidence(normalised);
    if (confidence.overall < 0.7) {
      warnings.push('Overall parsing confidence is low — manual review recommended');
    }

    logger.info(
      `Resume postprocessed: confidence=${(confidence.overall * 100).toFixed(1)}%, warnings=${warnings.length}`
    );

    return { data: normalised, confidence, warnings };
  } catch (error) {
    // Postprocess is defensive — never throw out the LLM result over a
    // normaliser bug. Return the raw + a warning, let the user fix
    // anything wrong manually.
    logger.error('Resume postprocessing failed, returning raw extraction:', error);
    return {
      data,
      confidence: { overall: 0.5, fields: {} },
      warnings: [...warnings, 'Postprocessing failed — using raw extraction'],
    };
  }
}

// Re-export normalisers for use by tests / other services
export {
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeSkills,
  normalizeDate,
  normalizeUrl,
};

// ParsedResumeData type still exported from resume-schema; some legacy
// imports point here, so re-export for backward compat.
export type { ParsedResumeData } from './resume-schema';
