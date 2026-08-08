import { jobClient, ensureTalentCompany } from '../config/talent';
import { env } from '../config/env';
import logger from '../config/logger';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import elasticClient from '../config/elasticsearch';
import prisma from '../config/prisma';
import { ELASTIC_INDICES } from '../constants';
import { isFeatureEnabled } from '../config/feature-flags';

const tracer = trace.getTracer('talent-matching-service');

function getTenantName(): string {
  const tenantId = env.CLOUD_TALENT_TENANT_ID || 'default-tenant';
  return `projects/${env.GOOGLE_CLOUD_PROJECT_ID}/tenants/${tenantId}`;
}

/** Calculate skill overlap match score (0-100) */
function skillOverlapScore(candidateSkills: string[], targetSkills: string[]): number {
  if (targetSkills.length === 0) return 0;
  const targetSet = new Set(targetSkills.map((s) => s.toLowerCase()));
  const matches = candidateSkills.filter((s) => targetSet.has(s.toLowerCase())).length;
  return Math.round((matches / targetSet.size) * 100);
}

export const talentMatchingService = {
  /**
   * Mirror a job to Cloud Talent index (fire-and-forget, best-effort).
   */
  async syncJobToTalent(jobPost: {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    company: { id?: string; companyName: string } | null;
    skills: string[];
    jobType: string;
    workMode?: string | null;
    experienceLevel?: string | null;
    industry?: string | null;
    salaryMin?: number | null;
    salaryMax?: number | null;
    currency?: string;
  }): Promise<void> {
    if (!(await isFeatureEnabled('enableCloudTalent'))) return;
    if (!jobClient || !env.GOOGLE_CLOUD_PROJECT_ID) return;

    await tracer.startActiveSpan('cloudtalent.syncJob', async (span) => {
      span.setAttribute('cloud.service', 'cloud-talent');
      span.setAttribute('cloud.operation', 'createJob');
      span.setAttribute('job.id', jobPost.id);
      try {
        const parent = getTenantName();

        // Resolve or create company in Cloud Talent
        const companyExternalId = jobPost.company?.id || 'default-company';
        const companyDisplayName = jobPost.company?.companyName || 'Unknown Company';
        const companyName = await ensureTalentCompany(
          parent,
          companyExternalId,
          companyDisplayName
        );
        if (!companyName) {
          logger.debug(
            `Cloud Talent sync skipped for job ${jobPost.id}: could not resolve company`
          );
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Company resolution failed' });
          span.end();
          return;
        }

        // Map job type to Cloud Talent employment type
        const employmentTypeMap: Record<string, string> = {
          FULL_TIME: 'FULL_TIME',
          PART_TIME: 'PART_TIME',
          CONTRACT: 'CONTRACTOR',
          INTERNSHIP: 'INTERN',
          FREELANCE: 'CONTRACTOR',
        };

        const customAttributes: Record<string, { stringValues: string[]; filterable: boolean }> = {
          skills: { stringValues: jobPost.skills, filterable: true },
        };
        if (jobPost.workMode) {
          customAttributes.workMode = { stringValues: [jobPost.workMode], filterable: true };
        }
        if (jobPost.experienceLevel) {
          customAttributes.experienceLevel = {
            stringValues: [jobPost.experienceLevel],
            filterable: true,
          };
        }
        if (jobPost.industry) {
          customAttributes.industry = { stringValues: [jobPost.industry], filterable: true };
        }

        const job: any = {
          company: companyName,
          requisitionId: jobPost.id,
          title: jobPost.title,
          description: jobPost.description || jobPost.title,
          addresses: jobPost.location ? [jobPost.location] : [],
          customAttributes,
        };

        if (jobPost.jobType && employmentTypeMap[jobPost.jobType]) {
          job.employmentTypes = [employmentTypeMap[jobPost.jobType]];
        }

        if (jobPost.salaryMin || jobPost.salaryMax) {
          job.compensationInfo = {
            entries: [
              {
                type: 'BASE',
                unit: 'YEARLY',
                range: {
                  minCompensation: jobPost.salaryMin
                    ? {
                        currencyCode: jobPost.currency || 'INR',
                        units: Math.round(Number(jobPost.salaryMin)),
                      }
                    : undefined,
                  maxCompensation: jobPost.salaryMax
                    ? {
                        currencyCode: jobPost.currency || 'INR',
                        units: Math.round(Number(jobPost.salaryMax)),
                      }
                    : undefined,
                },
              },
            ],
          };
        }

        await jobClient!.createJob({ parent, job });
        logger.debug(`Job ${jobPost.id} synced to Cloud Talent`);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        logger.debug(`Cloud Talent sync failed for job ${jobPost.id}: ${(error as Error).message}`);
      } finally {
        span.end();
      }
    });
  },

  /**
   * Remove a job from Cloud Talent index.
   */
  async deleteJobFromTalent(jobId: string): Promise<void> {
    if (!(await isFeatureEnabled('enableCloudTalent'))) return;
    if (!jobClient || !env.GOOGLE_CLOUD_PROJECT_ID) return;

    try {
      const parent = getTenantName();
      const [jobs] = await jobClient.listJobs({
        parent,
        filter: `requisitionId="${jobId}"`,
      });

      for (const job of jobs) {
        if (job.name) {
          await jobClient.deleteJob({ name: job.name });
        }
      }
      logger.debug(`Job ${jobId} removed from Cloud Talent`);
    } catch (error) {
      logger.debug(`Cloud Talent delete failed for job ${jobId}: ${(error as Error).message}`);
    }
  },

  // ─── Job Recommendations (for candidates) ──────────────────────────
  // Cascade: Cloud Talent → Elasticsearch → PostgreSQL

  /**
   * Get AI-recommended jobs for a candidate.
   * Tries Cloud Talent first, falls back to Elasticsearch, then PostgreSQL.
   */
  async getAIRecommendedJobs(candidateProfile: {
    skills: string[];
    currentRole: string | null;
    currentLocation: string | null;
    experienceYears: number;
    preferredWorkMode?: string[];
    preferredIndustries?: string[];
    preferredJobType?: string[];
    experienceLevel?: string | null;
    highestEducationLevel?: string | null;
    noticePeriod?: string | null;
    expectedSalaryMin?: number | null;
    expectedSalaryMax?: number | null;
  }): Promise<Array<{ jobId: string; matchScore: number }>> {
    // 1. Try Cloud Talent (if flag enabled)
    if ((await isFeatureEnabled('enableCloudTalent')) && jobClient && env.GOOGLE_CLOUD_PROJECT_ID) {
      const results = await this._recommendJobsCloudTalent(candidateProfile);
      if (results.length > 0) return results;
    }

    // 2. Try Elasticsearch (if flag enabled)
    if (await isFeatureEnabled('enableElasticsearch')) {
      const esResults = await this._recommendJobsElastic(candidateProfile);
      if (esResults.length > 0) return esResults;
    }

    // 3. Fallback to PostgreSQL
    return this._recommendJobsPrisma(candidateProfile);
  },

  /** Cloud Talent job recommendation */
  async _recommendJobsCloudTalent(candidateProfile: {
    skills: string[];
    currentRole: string | null;
    currentLocation: string | null;
  }): Promise<Array<{ jobId: string; matchScore: number }>> {
    return tracer.startActiveSpan('cloudtalent.recommendJobs', async (span) => {
      span.setAttribute('cloud.service', 'cloud-talent');
      span.setAttribute('cloud.operation', 'searchJobs');
      try {
        const parent = getTenantName();

        const query: string[] = [];
        if (candidateProfile.currentRole) {
          query.push(candidateProfile.currentRole);
        }
        if (candidateProfile.skills.length > 0) {
          query.push(...candidateProfile.skills.slice(0, 5));
        }

        if (query.length === 0) {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return [];
        }

        const [response] = await jobClient!.searchJobs({
          parent,
          searchMode: 'JOB_SEARCH',
          requestMetadata: {
            userId: 'recommendation-engine',
            sessionId: `rec-${Date.now()}`,
            domain: 'hireadda.in',
          },
          jobQuery: {
            query: query.join(' '),
            locationFilters: candidateProfile.currentLocation
              ? [{ address: candidateProfile.currentLocation }]
              : [],
          },
          maxPageSize: 20,
        });

        const matchingJobs = response.matchingJobs || [];
        const results = matchingJobs
          .map((match) => ({
            jobId: match.job?.requisitionId || '',
            matchScore: match.jobTitleSnippet ? 90 : 70,
          }))
          .filter((j) => j.jobId);
        span.setAttribute('cloud.results_count', results.length);
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return results;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        span.end();
        logger.debug(`Cloud Talent job recommendation failed: ${(error as Error).message}`);
        return [];
      }
    });
  },

  /** Elasticsearch job recommendation */
  async _recommendJobsElastic(candidateProfile: {
    skills: string[];
    currentRole: string | null;
    currentLocation: string | null;
    experienceYears: number;
    preferredWorkMode?: string[];
    preferredIndustries?: string[];
    preferredJobType?: string[];
    experienceLevel?: string | null;
    highestEducationLevel?: string | null;
    noticePeriod?: string | null;
    expectedSalaryMin?: number | null;
    expectedSalaryMax?: number | null;
  }): Promise<Array<{ jobId: string; matchScore: number }>> {
    return tracer.startActiveSpan('elasticsearch.recommendJobs', async (span) => {
      span.setAttribute('db.system', 'elasticsearch');
      span.setAttribute('db.operation', 'search');
      span.setAttribute('db.elasticsearch.index', ELASTIC_INDICES.JOBS);
      try {
        const should: any[] = [];

        if (candidateProfile.currentRole) {
          should.push({
            multi_match: {
              query: candidateProfile.currentRole,
              fields: ['title^3', 'description'],
              fuzziness: 'AUTO',
              prefix_length: 1,
            },
          });
        }
        if (candidateProfile.skills.length > 0) {
          should.push({ terms: { skills: candidateProfile.skills, boost: 5 } });
          should.push({
            multi_match: {
              query: candidateProfile.skills.slice(0, 5).join(' '),
              fields: ['skills.text^2'],
              operator: 'or',
            },
          });
        }
        if (candidateProfile.currentLocation) {
          should.push({
            bool: {
              should: [
                {
                  term: {
                    'location.keyword': { value: candidateProfile.currentLocation, boost: 2 },
                  },
                },
                { match: { location: { query: candidateProfile.currentLocation, boost: 1 } } },
              ],
            },
          });
        }

        if (should.length === 0) {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return [];
        }

        const filter: any[] = [{ term: { status: 'OPEN' } }];

        const functions: any[] = [];
        if (candidateProfile.skills.length > 0) {
          functions.push({ filter: { terms: { skills: candidateProfile.skills } }, weight: 10 });
        }
        if (candidateProfile.currentLocation) {
          functions.push({
            filter: {
              bool: {
                should: [{ term: { 'location.keyword': candidateProfile.currentLocation } }],
              },
            },
            weight: 3,
          });
        }
        // Boost jobs matching experience range
        functions.push({
          filter: { range: { experienceMin: { lte: candidateProfile.experienceYears } } },
          weight: 2,
        });
        // Boost jobs matching preferred work mode
        if (candidateProfile.preferredWorkMode && candidateProfile.preferredWorkMode.length > 0) {
          functions.push({
            filter: { terms: { workMode: candidateProfile.preferredWorkMode } },
            weight: 3,
          });
        }
        // Boost jobs matching preferred industries
        if (
          candidateProfile.preferredIndustries &&
          candidateProfile.preferredIndustries.length > 0
        ) {
          functions.push({
            filter: { terms: { industry: candidateProfile.preferredIndustries } },
            weight: 3,
          });
        }
        // Boost jobs matching preferred job type
        if (candidateProfile.preferredJobType && candidateProfile.preferredJobType.length > 0) {
          functions.push({
            filter: { terms: { type: candidateProfile.preferredJobType } },
            weight: 2,
          });
        }
        // Boost jobs matching experience level
        if (candidateProfile.experienceLevel) {
          functions.push({
            filter: { term: { experienceLevel: candidateProfile.experienceLevel } },
            weight: 2,
          });
        }
        // Boost jobs within salary range
        if (candidateProfile.expectedSalaryMin) {
          functions.push({
            filter: { range: { salaryMax: { gte: Number(candidateProfile.expectedSalaryMin) } } },
            weight: 2,
          });
        }

        const searchQuery =
          functions.length > 0
            ? {
                function_score: {
                  query: { bool: { should, filter, minimum_should_match: 1 } },
                  functions,
                  score_mode: 'sum',
                  boost_mode: 'multiply',
                },
              }
            : { bool: { should, filter, minimum_should_match: 1 } };

        const result = await (elasticClient.search as any)({
          index: ELASTIC_INDICES.JOBS,
          query: searchQuery,
          size: 20,
          _source: ['id'],
        });

        const hits = result.hits?.hits || [];
        if (hits.length === 0) {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return [];
        }

        const maxScore = result.hits.max_score || 1;
        const results = hits
          .map((hit: any) => ({
            jobId: hit._source.id as string,
            matchScore: Math.round((hit._score / maxScore) * 100),
          }))
          .filter((r: { jobId: string }) => r.jobId);

        span.setAttribute('db.elasticsearch.hits', results.length);
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return results;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        span.end();
        logger.debug(`Elasticsearch job recommendation failed: ${(error as Error).message}`);
        return [];
      }
    });
  },

  /** PostgreSQL job recommendation (final fallback) */
  async _recommendJobsPrisma(candidateProfile: {
    skills: string[];
    currentRole: string | null;
    currentLocation: string | null;
    experienceYears: number;
  }): Promise<Array<{ jobId: string; matchScore: number }>> {
    try {
      const where: any = { status: 'OPEN' };

      // Filter: skills overlap OR title/location match
      const orConditions: any[] = [];
      if (candidateProfile.skills.length > 0) {
        orConditions.push({ skillsRequired: { hasSome: candidateProfile.skills } });
      }
      if (candidateProfile.currentRole) {
        orConditions.push({
          title: { contains: candidateProfile.currentRole, mode: 'insensitive' },
        });
      }
      if (candidateProfile.currentLocation) {
        orConditions.push({
          location: { contains: candidateProfile.currentLocation, mode: 'insensitive' },
        });
      }

      if (orConditions.length === 0) return [];
      where.OR = orConditions;

      // Experience range match
      where.experienceMin = { lte: Math.round(candidateProfile.experienceYears) };

      const jobs = await prisma.jobPost.findMany({
        where,
        select: { id: true, skillsRequired: true },
        take: 20,
        orderBy: { createdAt: 'desc' },
      });

      return jobs
        .map((job) => ({
          jobId: job.id,
          matchScore: Math.max(skillOverlapScore(candidateProfile.skills, job.skillsRequired), 30),
        }))
        .sort((a, b) => b.matchScore - a.matchScore);
    } catch (error) {
      logger.debug(`Prisma job recommendation failed: ${(error as Error).message}`);
      return [];
    }
  },

  // ─── Candidate Recommendations (for employers) ─────────────────────
  // Cascade: Elasticsearch → PostgreSQL

  /**
   * Get AI-recommended candidates for a job.
   * Tries Elasticsearch first, falls back to PostgreSQL.
   */
  async getAIRecommendedCandidates(jobPost: {
    title: string;
    skills: string[];
    location: string | null;
    experienceMin?: number;
    experienceMax?: number | null;
    industry?: string | null;
    workMode?: string | null;
    experienceLevel?: string | null;
    educationRequired?: string | null;
    type?: string;
  }): Promise<Array<{ candidateId: string; matchScore: number }>> {
    // 1. Try Elasticsearch (if flag enabled)
    if (await isFeatureEnabled('enableElasticsearch')) {
      const esResults = await this._recommendCandidatesElastic(jobPost);
      if (esResults.length > 0) return esResults;
    }

    // 2. Fallback to PostgreSQL
    return this._recommendCandidatesPrisma(jobPost);
  },

  /** Elasticsearch candidate recommendation */
  async _recommendCandidatesElastic(jobPost: {
    title: string;
    skills: string[];
    location: string | null;
    experienceMin?: number;
    experienceMax?: number | null;
    industry?: string | null;
    workMode?: string | null;
    experienceLevel?: string | null;
    educationRequired?: string | null;
    type?: string;
  }): Promise<Array<{ candidateId: string; matchScore: number }>> {
    return tracer.startActiveSpan('elasticsearch.recommendCandidates', async (span) => {
      span.setAttribute('db.system', 'elasticsearch');
      span.setAttribute('db.operation', 'search');
      span.setAttribute('db.elasticsearch.index', ELASTIC_INDICES.CANDIDATES);
      try {
        const should: any[] = [];

        if (jobPost.title) {
          should.push({
            multi_match: {
              query: jobPost.title,
              fields: ['currentRole^3', 'headline^2'],
              fuzziness: 'AUTO',
              prefix_length: 1,
            },
          });
        }
        if (jobPost.skills.length > 0) {
          should.push({ terms: { skills: jobPost.skills, boost: 5 } });
          should.push({
            multi_match: {
              query: jobPost.skills.slice(0, 5).join(' '),
              fields: ['skills.text^2'],
              operator: 'or',
            },
          });
        }
        if (jobPost.location) {
          should.push({
            bool: {
              should: [
                { term: { 'currentLocation.keyword': { value: jobPost.location, boost: 2 } } },
                { term: { preferredLocations: { value: jobPost.location, boost: 1.5 } } },
                { match: { currentLocation: { query: jobPost.location, boost: 1 } } },
              ],
            },
          });
        }

        if (should.length === 0) {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return [];
        }

        const functions: any[] = [];
        if (jobPost.skills.length > 0) {
          functions.push({ filter: { terms: { skills: jobPost.skills } }, weight: 10 });
        }
        if (jobPost.location) {
          functions.push({
            filter: {
              bool: {
                should: [
                  { term: { 'currentLocation.keyword': jobPost.location } },
                  { term: { preferredLocations: jobPost.location } },
                ],
              },
            },
            weight: 3,
          });
        }
        // Boost candidates matching experience range
        if (jobPost.experienceMin !== undefined || jobPost.experienceMax) {
          const expRange: any = {};
          if (jobPost.experienceMin !== undefined) expRange.gte = jobPost.experienceMin;
          if (jobPost.experienceMax) expRange.lte = jobPost.experienceMax;
          functions.push({ filter: { range: { experienceYears: expRange } }, weight: 3 });
        }
        // Boost candidates matching industry
        if (jobPost.industry) {
          functions.push({ filter: { term: { currentIndustry: jobPost.industry } }, weight: 2 });
        }
        // Boost candidates matching work mode
        if (jobPost.workMode) {
          functions.push({ filter: { term: { preferredWorkMode: jobPost.workMode } }, weight: 2 });
        }
        // Boost candidates matching experience level
        if (jobPost.experienceLevel) {
          functions.push({
            filter: { term: { experienceLevel: jobPost.experienceLevel } },
            weight: 2,
          });
        }
        // Boost candidates matching job type preference
        if (jobPost.type) {
          functions.push({ filter: { term: { preferredJobType: jobPost.type } }, weight: 1 });
        }

        const searchQuery =
          functions.length > 0
            ? {
                function_score: {
                  query: { bool: { should, minimum_should_match: 1 } },
                  functions,
                  score_mode: 'sum',
                  boost_mode: 'multiply',
                },
              }
            : { bool: { should, minimum_should_match: 1 } };

        const result = await (elasticClient.search as any)({
          index: ELASTIC_INDICES.CANDIDATES,
          query: searchQuery,
          size: 20,
          _source: ['id', 'userId'],
        });

        const hits = result.hits?.hits || [];
        if (hits.length === 0) {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return [];
        }

        const maxScore = result.hits.max_score || 1;
        const results = hits
          .map((hit: any) => ({
            candidateId: hit._source.id as string,
            matchScore: Math.round((hit._score / maxScore) * 100),
          }))
          .filter((r: { candidateId: string }) => r.candidateId);

        span.setAttribute('db.elasticsearch.hits', results.length);
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return results;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        span.end();
        logger.debug(`Elasticsearch candidate recommendation failed: ${(error as Error).message}`);
        return [];
      }
    });
  },

  /** PostgreSQL candidate recommendation (final fallback) */
  async _recommendCandidatesPrisma(jobPost: {
    title: string;
    skills: string[];
    location: string | null;
  }): Promise<Array<{ candidateId: string; matchScore: number }>> {
    try {
      const where: any = {};

      const orConditions: any[] = [];
      if (jobPost.skills.length > 0) {
        orConditions.push({ skills: { hasSome: jobPost.skills } });
      }
      if (jobPost.title) {
        orConditions.push({ currentRole: { contains: jobPost.title, mode: 'insensitive' } });
      }
      if (jobPost.location) {
        orConditions.push({ currentLocation: { contains: jobPost.location, mode: 'insensitive' } });
        orConditions.push({ preferredLocations: { has: jobPost.location } });
      }

      if (orConditions.length === 0) return [];
      where.OR = orConditions;

      const candidates = await prisma.candidateProfile.findMany({
        where,
        select: { id: true, skills: true },
        take: 20,
        orderBy: { updatedAt: 'desc' },
      });

      return candidates
        .map((c) => ({
          candidateId: c.id,
          matchScore: Math.max(skillOverlapScore(c.skills, jobPost.skills), 30),
        }))
        .sort((a, b) => b.matchScore - a.matchScore);
    } catch (error) {
      logger.debug(`Prisma candidate recommendation failed: ${(error as Error).message}`);
      return [];
    }
  },
};
