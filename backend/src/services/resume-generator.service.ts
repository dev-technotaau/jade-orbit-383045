import puppeteer from 'puppeteer';
import handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import logger from '../config/logger';
import { AppError } from '../exceptions';
import {
  RESUME_TEMPLATES,
  DEFAULT_RESUME_TEMPLATE_ID,
  getResumeTemplate,
  type ResumeTemplateConfig,
} from '../config/resume-templates';

export interface ResumeData {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  headline?: string;
  linkedin?: string;
  portfolio?: string;
  github?: string;
  summary?: string;
  experience?: Array<{
    title: string;
    company: string;
    location?: string;
    startDate: string;
    endDate: string;
    description: string;
    highlights?: string[];
  }>;
  education?: Array<{
    institution: string;
    degree: string;
    field?: string;
    year: string;
    grade?: string;
  }>;
  skills?: string[];
  certifications?: Array<{
    name: string;
    issuer: string;
    date?: string;
    credentialId?: string;
    url?: string;
  }>;
  projects?: Array<{
    name: string;
    description?: string;
    technologies?: string[];
    url?: string;
    role?: string;
  }>;
  awards?: Array<{
    title: string;
    issuer?: string;
    date?: string;
    description?: string;
  }>;
  languages?: Array<{
    language: string;
    proficiency: string;
  }>;
}

export interface ResumeReadinessItem {
  field: string;
  message: string;
  section: string;
}

export interface ResumeReadiness {
  canGenerate: boolean;
  errors: ResumeReadinessItem[];
  warnings: ResumeReadinessItem[];
  suggestions: ResumeReadinessItem[];
}

export interface GenerateResumeOptions {
  /**
   * Template id from `RESUME_TEMPLATES`. Falls back to the free default
   * (`classic`) when omitted.
   */
  templateId?: string;
  /**
   * Caller's user id — used to verify the candidate-Premium entitlement
   * when a paid template is requested. Required for paid templates,
   * optional for the free default.
   */
  userId?: string;
}

export class ResumeGeneratorService {
  private static instance: ResumeGeneratorService;
  private readonly templateDir = path.join(__dirname, '../templates/resume');
  private compiledCache = new Map<string, HandlebarsTemplateDelegate>();

  private constructor() {}

  public static getInstance(): ResumeGeneratorService {
    if (!ResumeGeneratorService.instance) {
      ResumeGeneratorService.instance = new ResumeGeneratorService();
    }
    return ResumeGeneratorService.instance;
  }

  /** All available templates (used by the picker UI on the candidate profile). */
  public listTemplates(): ResumeTemplateConfig[] {
    return RESUME_TEMPLATES;
  }

  private async assertCanUseTemplate(
    template: ResumeTemplateConfig,
    userId: string | undefined
  ): Promise<void> {
    if (!template.requiresPremium) return;
    if (!userId) {
      throw new AppError(
        `Template "${template.name}" requires the Candidate Premium plan`,
        402,
        'PAYMENT_REQUIRED'
      );
    }
    // Lazy import to avoid circular dependency (entitlement.service ↔ this).
    const { getActiveEntitlementsForUser } = await import('./entitlement.service');
    const snapshot = await getActiveEntitlementsForUser(userId);
    if (!snapshot.features['feature.candidate_ai_resume_premium']) {
      throw new AppError(
        `Template "${template.name}" requires the Candidate Premium plan (₹199/mo).`,
        402,
        'PAYMENT_REQUIRED'
      );
    }
  }

  private getCompiledTemplate(template: ResumeTemplateConfig): HandlebarsTemplateDelegate {
    const cached = this.compiledCache.get(template.id);
    if (cached) return cached;
    const filePath = path.join(this.templateDir, `${template.file}.hbs`);
    const html = fs.readFileSync(filePath, 'utf8');
    const compiled = handlebars.compile(html);
    this.compiledCache.set(template.id, compiled);
    return compiled;
  }

  /**
   * Validates profile data readiness for resume generation.
   * Returns categorized errors, warnings, and suggestions.
   */
  public validateResumeReadiness(profile: {
    user: { firstName?: string | null; lastName?: string | null; email: string };
    phone?: string | null;
    currentLocation?: string | null;
    bio?: string | null;
    headline?: string | null;
    linkedinProfile?: string | null;
    portfolioUrl?: string | null;
    skills: string[];
    experience?: unknown;
    education?: unknown;
    certifications?: unknown;
    projects?: unknown;
    awards?: unknown;
    languageProficiency?: unknown;
  }): ResumeReadiness {
    const errors: ResumeReadinessItem[] = [];
    const warnings: ResumeReadinessItem[] = [];
    const suggestions: ResumeReadinessItem[] = [];

    // --- Errors (must fix) ---
    if (!profile.user.firstName && !profile.user.lastName) {
      errors.push({ field: 'fullName', message: 'Add your full name', section: 'personal' });
    }
    if (!profile.user.email) {
      errors.push({ field: 'email', message: 'Add your email address', section: 'personal' });
    }
    if (!profile.phone) {
      errors.push({ field: 'phone', message: 'Add your phone number', section: 'personal' });
    }

    const hasExperience = Array.isArray(profile.experience) && profile.experience.length > 0;
    const hasEducation = Array.isArray(profile.education) && profile.education.length > 0;
    const hasSkills = profile.skills && profile.skills.length > 0;

    if (!hasEducation) {
      errors.push({ field: 'education', message: 'Add education details', section: 'education' });
    }
    if (!hasSkills) {
      errors.push({ field: 'skills', message: 'Add your skills', section: 'skills' });
    }

    // --- Warnings (strongly recommended) ---
    if (!profile.currentLocation) {
      warnings.push({
        field: 'location',
        message: 'Add your current location',
        section: 'personal',
      });
    }
    if (!profile.bio) {
      warnings.push({
        field: 'summary',
        message: 'Write a professional summary',
        section: 'personal',
      });
    }
    if (!hasExperience) {
      warnings.push({ field: 'experience', message: 'Add work experience', section: 'experience' });
    }

    // --- Suggestions (nice to have) ---
    if (!profile.headline) {
      suggestions.push({
        field: 'headline',
        message: 'Add a professional headline',
        section: 'personal',
      });
    }
    if (!profile.linkedinProfile) {
      suggestions.push({
        field: 'linkedin',
        message: 'Add your LinkedIn profile',
        section: 'social',
      });
    }
    if (!profile.portfolioUrl) {
      suggestions.push({
        field: 'portfolio',
        message: 'Add your portfolio URL',
        section: 'social',
      });
    }
    if (!profile.certifications || (profile.certifications as unknown[]).length === 0) {
      suggestions.push({
        field: 'certifications',
        message: 'Add certifications',
        section: 'certifications',
      });
    }
    if (!profile.projects || (profile.projects as unknown[]).length === 0) {
      suggestions.push({ field: 'projects', message: 'Add projects', section: 'projects' });
    }
    if (!profile.awards || (profile.awards as unknown[]).length === 0) {
      suggestions.push({
        field: 'awards',
        message: 'Add awards or achievements',
        section: 'awards',
      });
    }
    if (!profile.languageProficiency || (profile.languageProficiency as unknown[]).length === 0) {
      suggestions.push({
        field: 'languages',
        message: 'Add language proficiency',
        section: 'languages',
      });
    }

    return {
      canGenerate: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Generates a PDF resume from the provided data using the requested template.
   *
   * Free template (`classic`) is available to every candidate. Paid templates
   * require an active `feature.candidate_ai_resume_premium` entitlement —
   * verified per-call against the latest snapshot.
   */
  public async generateResume(
    data: ResumeData,
    options: GenerateResumeOptions = {}
  ): Promise<Buffer> {
    const template = getResumeTemplate(options.templateId ?? DEFAULT_RESUME_TEMPLATE_ID);
    await this.assertCanUseTemplate(template, options.userId);

    let browser;
    try {
      const compiled = this.getCompiledTemplate(template);
      const htmlContent = compiled(data);

      browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true,
      });

      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
      });

      return Buffer.from(pdfBuffer);
    } catch (error) {
      // Re-throw plan-gate errors so the controller maps them to 402.
      if (error instanceof AppError) throw error;
      logger.error('Error generating resume PDF:', error);
      throw new Error('Failed to generate resume PDF');
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
}

export const resumeGenerator = ResumeGeneratorService.getInstance();
