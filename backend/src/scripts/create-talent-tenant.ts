/**
 * One-time script: Create the default tenant in Google Cloud Talent Solution.
 * Must be run before syncing any jobs.
 *
 * Usage: npx dotenv -- ts-node src/scripts/create-talent-tenant.ts
 */

import { TenantServiceClient } from '@google-cloud/talent';
import { env } from '../config/env';

const TENANT_EXTERNAL_ID = 'default-tenant';

async function createTenant() {
  if (!env.GOOGLE_CLOUD_PROJECT_ID || !env.FIREBASE_SERVICE_ACCOUNT) {
    console.error('Missing GOOGLE_CLOUD_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT env vars.');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const client = new TenantServiceClient({
    credentials: {
      client_email: serviceAccount.client_email,
      private_key: serviceAccount.private_key,
    },
  });

  const parent = `projects/${env.GOOGLE_CLOUD_PROJECT_ID}`;
  console.log(`Creating tenant "${TENANT_EXTERNAL_ID}" in ${parent}...`);

  try {
    const [tenant] = await client.createTenant({
      parent,
      tenant: { externalId: TENANT_EXTERNAL_ID },
    });
    console.log(`Tenant created: ${tenant.name}`);
  } catch (error: any) {
    if (error?.code === 6 || error?.message?.includes('ALREADY_EXISTS')) {
      console.log('Tenant already exists — no action needed.');
    } else {
      console.error('Failed:', error?.message || error);
      process.exit(1);
    }
  }
}

createTenant();
