import { bigqueryClient } from '../config/bigquery';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import logger from '../config/logger';
import { isFeatureEnabled } from '../config/feature-flags';

const DATASET_ID = 'hire_adda_analytics';

function getDataset() {
  if (!bigqueryClient) return null;
  return bigqueryClient.dataset(DATASET_ID);
}

// ── Prisma fallback helpers (used when BigQuery is not configured) ──

async function fallbackUserGrowth(startDate: string, endDate: string) {
  const rows = await prisma.$queryRawUnsafe<{ date: string; registrations: bigint }[]>(
    `SELECT DATE("createdAt") as date, COUNT(*) as registrations
     FROM "User"
     WHERE "createdAt" >= $1::timestamp AND "createdAt" <= $2::timestamp
     GROUP BY DATE("createdAt")
     ORDER BY date`,
    startDate,
    endDate
  );
  return rows.map((r) => ({ date: String(r.date), registrations: Number(r.registrations) }));
}

async function fallbackApplicationFunnel(startDate: string, endDate: string) {
  const rows = await prisma.$queryRawUnsafe<{ status: string; count: bigint }[]>(
    `SELECT status, COUNT(*) as count
     FROM "JobApplication"
     WHERE "createdAt" >= $1::timestamp AND "createdAt" <= $2::timestamp
     GROUP BY status
     ORDER BY count DESC`,
    startDate,
    endDate
  );
  return rows.map((r) => ({ status: r.status, count: Number(r.count) }));
}

async function fallbackPopularSkills(limit: number) {
  const rows = await prisma.$queryRawUnsafe<{ skill: string; demand_count: bigint }[]>(
    `SELECT skill, COUNT(*) as demand_count
     FROM (SELECT unnest("skillsRequired") as skill FROM "JobPost" WHERE status = 'OPEN') sub
     GROUP BY skill
     ORDER BY demand_count DESC
     LIMIT $1`,
    limit
  );
  return rows.map((r) => ({ skill: r.skill, demand_count: Number(r.demand_count) }));
}

async function fallbackSalaryTrends(industry?: string, location?: string) {
  let where = 'WHERE "salaryMin" IS NOT NULL AND "salaryMax" IS NOT NULL';
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (industry) {
    where += ` AND industry = $${paramIndex++}`;
    params.push(industry);
  }
  if (location) {
    where += ` AND location = $${paramIndex++}`;
    params.push(location);
  }

  const rows = await prisma.$queryRawUnsafe<
    {
      month: Date;
      avg_min_salary: number;
      avg_max_salary: number;
      job_count: bigint;
    }[]
  >(
    `SELECT DATE_TRUNC('month', "createdAt") as month,
            AVG("salaryMin") as avg_min_salary,
            AVG("salaryMax") as avg_max_salary,
            COUNT(*) as job_count
     FROM "JobPost"
     ${where}
     GROUP BY month
     ORDER BY month`,
    ...params
  );
  return rows.map((r) => ({
    month:
      r.month instanceof Date ? r.month.toISOString().slice(0, 7) : String(r.month).slice(0, 7),
    avg_min_salary: Number(r.avg_min_salary),
    avg_max_salary: Number(r.avg_max_salary),
    job_count: Number(r.job_count),
  }));
}

async function fallbackJobPostingTrends(startDate: string, endDate: string) {
  const rows = await prisma.$queryRawUnsafe<{ date: string; jobs_posted: bigint }[]>(
    `SELECT DATE("createdAt") as date, COUNT(*) as jobs_posted
     FROM "JobPost"
     WHERE "createdAt" >= $1::timestamp AND "createdAt" <= $2::timestamp
     GROUP BY DATE("createdAt")
     ORDER BY date`,
    startDate,
    endDate
  );
  return rows.map((r) => ({ date: String(r.date), jobs_posted: Number(r.jobs_posted) }));
}

// ── BigQuery service ──

export const bigqueryService = {
  /**
   * Insert an analytics event row (fire-and-forget).
   */
  async insertEvent(table: string, data: Record<string, unknown>): Promise<void> {
    if (!(await isFeatureEnabled('enableBigQuery'))) return;
    const dataset = getDataset();
    if (!dataset) return;

    try {
      await dataset.table(table).insert([
        {
          ...data,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      // Don't fail on insert errors — analytics is best-effort
      logger.debug(`BigQuery insert to ${table} failed: ${(error as Error).message}`);
    }
  },

  /**
   * Query user registration growth over time.
   * Falls back to Prisma/PostgreSQL when BigQuery is not configured.
   */
  async queryUserGrowth(startDate: string, endDate: string): Promise<any[]> {
    if (await isFeatureEnabled('enableBigQuery')) {
      if (bigqueryClient && env.GOOGLE_CLOUD_PROJECT_ID) {
        try {
          const query = `
                SELECT
                    DATE(timestamp) as date,
                    COUNT(*) as registrations
                FROM \`${env.GOOGLE_CLOUD_PROJECT_ID}.${DATASET_ID}.user_events\`
                WHERE event_type = 'sign_up'
                    AND timestamp BETWEEN @startDate AND @endDate
                GROUP BY date
                ORDER BY date
            `;

          const [rows] = await bigqueryClient.query({
            query,
            params: { startDate, endDate },
          });
          if (rows.length > 0) return rows;
        } catch (error) {
          logger.warn(
            `BigQuery user growth query failed (falling back to Prisma): ${(error as Error).message}`
          );
        }
      }
    }

    // Fallback to Prisma
    try {
      return await fallbackUserGrowth(startDate, endDate);
    } catch (error) {
      logger.debug(`Prisma user growth fallback failed: ${(error as Error).message}`);
      return [];
    }
  },

  /**
   * Query application funnel — status transitions.
   * Falls back to Prisma/PostgreSQL when BigQuery is not configured.
   */
  async queryApplicationFunnel(startDate: string, endDate: string): Promise<any[]> {
    if (await isFeatureEnabled('enableBigQuery')) {
      if (bigqueryClient && env.GOOGLE_CLOUD_PROJECT_ID) {
        try {
          const query = `
                SELECT
                    status,
                    COUNT(*) as count
                FROM \`${env.GOOGLE_CLOUD_PROJECT_ID}.${DATASET_ID}.application_events\`
                WHERE timestamp BETWEEN @startDate AND @endDate
                GROUP BY status
                ORDER BY count DESC
            `;

          const [rows] = await bigqueryClient.query({
            query,
            params: { startDate, endDate },
          });
          if (rows.length > 0) return rows;
        } catch (error) {
          logger.warn(
            `BigQuery application funnel query failed (falling back to Prisma): ${(error as Error).message}`
          );
        }
      }
    }

    // Fallback to Prisma
    try {
      return await fallbackApplicationFunnel(startDate, endDate);
    } catch (error) {
      logger.debug(`Prisma application funnel fallback failed: ${(error as Error).message}`);
      return [];
    }
  },

  /**
   * Query most popular/in-demand skills.
   * Falls back to Prisma/PostgreSQL when BigQuery is not configured.
   */
  async queryPopularSkills(limit: number = 20): Promise<any[]> {
    if (await isFeatureEnabled('enableBigQuery')) {
      if (bigqueryClient && env.GOOGLE_CLOUD_PROJECT_ID) {
        try {
          const query = `
                SELECT
                    skill,
                    COUNT(*) as demand_count
                FROM \`${env.GOOGLE_CLOUD_PROJECT_ID}.${DATASET_ID}.job_events\`,
                    UNNEST(skills) as skill
                WHERE event_type = 'job_posted'
                GROUP BY skill
                ORDER BY demand_count DESC
                LIMIT @limit
            `;

          const [rows] = await bigqueryClient.query({
            query,
            params: { limit },
          });
          if (rows.length > 0) return rows;
        } catch (error) {
          logger.warn(
            `BigQuery popular skills query failed (falling back to Prisma): ${(error as Error).message}`
          );
        }
      }
    }

    // Fallback to Prisma
    try {
      return await fallbackPopularSkills(limit);
    } catch (error) {
      logger.debug(`Prisma popular skills fallback failed: ${(error as Error).message}`);
      return [];
    }
  },

  /**
   * Query salary trends by industry/location.
   * Falls back to Prisma/PostgreSQL when BigQuery is not configured.
   */
  async querySalaryTrends(industry?: string, location?: string): Promise<any[]> {
    if (await isFeatureEnabled('enableBigQuery')) {
      if (bigqueryClient && env.GOOGLE_CLOUD_PROJECT_ID) {
        try {
          let where = 'WHERE salary_min IS NOT NULL';
          const params: Record<string, any> = {};

          if (industry) {
            where += ' AND industry = @industry';
            params.industry = industry;
          }
          if (location) {
            where += ' AND location = @location';
            params.location = location;
          }

          const query = `
                SELECT
                    DATE_TRUNC(timestamp, MONTH) as month,
                    AVG(salary_min) as avg_min_salary,
                    AVG(salary_max) as avg_max_salary,
                    COUNT(*) as job_count
                FROM \`${env.GOOGLE_CLOUD_PROJECT_ID}.${DATASET_ID}.job_events\`
                ${where}
                GROUP BY month
                ORDER BY month
            `;

          const [rows] = await bigqueryClient.query({ query, params });
          if (rows.length > 0) return rows;
        } catch (error) {
          logger.warn(
            `BigQuery salary trends query failed (falling back to Prisma): ${(error as Error).message}`
          );
        }
      }
    }

    // Fallback to Prisma
    try {
      return await fallbackSalaryTrends(industry, location);
    } catch (error) {
      logger.debug(`Prisma salary trends fallback failed: ${(error as Error).message}`);
      return [];
    }
  },

  /**
   * Query job posting trends over time.
   * Falls back to Prisma/PostgreSQL when BigQuery is not configured.
   */
  async queryJobPostingTrends(startDate: string, endDate: string): Promise<any[]> {
    if (await isFeatureEnabled('enableBigQuery')) {
      if (bigqueryClient && env.GOOGLE_CLOUD_PROJECT_ID) {
        try {
          const query = `
                SELECT
                    DATE(timestamp) as date,
                    COUNT(*) as jobs_posted
                FROM \`${env.GOOGLE_CLOUD_PROJECT_ID}.${DATASET_ID}.job_events\`
                WHERE event_type = 'job_posted'
                    AND timestamp BETWEEN @startDate AND @endDate
                GROUP BY date
                ORDER BY date
            `;

          const [rows] = await bigqueryClient.query({
            query,
            params: { startDate, endDate },
          });
          if (rows.length > 0) return rows;
        } catch (error) {
          logger.warn(
            `BigQuery job trends query failed (falling back to Prisma): ${(error as Error).message}`
          );
        }
      }
    }

    // Fallback to Prisma
    try {
      return await fallbackJobPostingTrends(startDate, endDate);
    } catch (error) {
      logger.debug(`Prisma job trends fallback failed: ${(error as Error).message}`);
      return [];
    }
  },
};
