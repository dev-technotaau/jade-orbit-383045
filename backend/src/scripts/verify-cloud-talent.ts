/**
 * Verification script: List companies and jobs in Cloud Talent.
 *
 * Usage: npx dotenv -- ts-node src/scripts/verify-cloud-talent.ts
 */

import { jobClient, companyClient } from '../config/talent';
import { env } from '../config/env';

async function verify() {
  if (!jobClient || !companyClient || !env.GOOGLE_CLOUD_PROJECT_ID) {
    console.error('Cloud Talent clients not initialized.');
    process.exit(1);
  }

  const tenantId = env.CLOUD_TALENT_TENANT_ID || 'default-tenant';
  const parent = `projects/${env.GOOGLE_CLOUD_PROJECT_ID}/tenants/${tenantId}`;

  console.log(`=== Cloud Talent Verification ===`);
  console.log(`Tenant: ${parent}\n`);

  // List companies
  console.log('--- Companies ---');
  const [companies] = await companyClient.listCompanies({ parent });
  if (companies.length === 0) {
    console.log('  (none)');
  } else {
    for (const c of companies) {
      console.log(`  ${c.displayName} (externalId: ${c.externalId})`);
    }
  }

  // List jobs per company (listJobs requires companyName filter)
  console.log('\n--- Jobs ---');
  let totalJobs = 0;
  for (const company of companies) {
    if (!company.name) continue;
    const [jobs] = await jobClient.listJobs({
      parent,
      filter: `companyName = "${company.name}"`,
    });
    for (const j of jobs) {
      console.log(
        `  [${j.requisitionId}] ${j.title} — ${j.addresses?.join(', ') || 'No location'} (${company.displayName})`
      );
      totalJobs++;
    }
  }

  if (totalJobs === 0) {
    console.log('  (none)');
  }

  console.log(`\nTotal: ${companies.length} companies, ${totalJobs} jobs`);
}

verify().catch((error) => {
  console.error('Verification failed:', error.message);
  process.exit(1);
});
