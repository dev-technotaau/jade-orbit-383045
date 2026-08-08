import { JobServiceClient, CompanyServiceClient } from '@google-cloud/talent';
import { env } from './env';
import logger from './logger';

let jobClient: JobServiceClient | null = null;
let companyClient: CompanyServiceClient | null = null;

try {
  if (env.GOOGLE_CLOUD_PROJECT_ID && env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    const credentials = {
      client_email: serviceAccount.client_email,
      private_key: serviceAccount.private_key,
    };

    jobClient = new JobServiceClient({ credentials, projectId: env.GOOGLE_CLOUD_PROJECT_ID });
    companyClient = new CompanyServiceClient({
      credentials,
      projectId: env.GOOGLE_CLOUD_PROJECT_ID,
    });

    if (env.CLOUD_TALENT_TENANT_ID) {
      logger.info('🤝 Google Cloud Talent Solution initialized');
    } else {
      logger.warn(
        '🤝 Cloud Talent client created but CLOUD_TALENT_TENANT_ID missing — API calls will use fallback tenant'
      );
    }
  } else {
    logger.warn('⚠️ Google Cloud credentials missing — Talent Solution disabled');
  }
} catch (error) {
  logger.error('❌ Talent Solution initialization failed:', error);
}

/** In-memory cache: externalId → Cloud Talent company resource name */
const companyNameCache = new Map<string, string>();

/**
 * Ensure a company exists in Cloud Talent. Returns the full resource name
 * (e.g. projects/.../tenants/.../companies/uuid). Creates if not found.
 */
async function ensureTalentCompany(
  tenantName: string,
  externalId: string,
  displayName: string
): Promise<string | null> {
  if (!companyClient) return null;

  // Check cache first
  const cached = companyNameCache.get(externalId);
  if (cached) return cached;

  try {
    // Try to find existing company by listing with filter
    const [companies] = await companyClient.listCompanies({
      parent: tenantName,
    });

    const existing = companies.find((c) => c.externalId === externalId);
    if (existing?.name) {
      companyNameCache.set(externalId, existing.name);
      return existing.name;
    }

    // Create new company
    const [company] = await companyClient.createCompany({
      parent: tenantName,
      company: {
        externalId,
        displayName,
      },
    });

    if (company.name) {
      companyNameCache.set(externalId, company.name);
      logger.debug(`Cloud Talent company created: ${displayName} (${company.name})`);
      return company.name;
    }

    return null;
  } catch (error: any) {
    // If ALREADY_EXISTS, try to find it
    if (error?.code === 6 || error?.message?.includes('ALREADY_EXISTS')) {
      try {
        const [companies] = await companyClient.listCompanies({ parent: tenantName });
        const found = companies.find((c) => c.externalId === externalId);
        if (found?.name) {
          companyNameCache.set(externalId, found.name);
          return found.name;
        }
      } catch {
        // fall through
      }
    }
    logger.debug(`Cloud Talent company lookup failed for ${externalId}: ${error?.message}`);
    return null;
  }
}

export { jobClient, companyClient, ensureTalentCompany };
