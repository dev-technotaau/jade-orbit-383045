import logger from './logger';

export type ServiceStatus =
  | 'connected'
  | 'disconnected'
  | 'disabled'
  | 'error'
  | 'not_configured'
  | 'ready';

interface ServiceInfo {
  name: string;
  status: ServiceStatus;
  message?: string;
}

// All services that can be tracked
const services: Map<string, ServiceInfo> = new Map();

// Service categories for the startup display. Only names that are actually
// registered by service-init.ts can appear; the host platform listed ~50 more
// (Elasticsearch, Kafka, Passport/OAuth, Firebase, Twilio, Google Cloud Talent,
// BigQuery, and 17 job-board queues) that no longer exist here.
const SERVICE_CATEGORIES: Record<string, string[]> = {
  core: ['Express Server', 'Socket.IO', 'Compression', 'Cookie Parser'],
  database: ['PostgreSQL (Prisma)', 'Redis', 'BullMQ Job Queue'],
  security: [
    'Helmet',
    'CORS',
    'CSRF Protection',
    'HPP Protection',
    'XSS Sanitization',
    'Rate Limiting',
    'DDoS Protection',
    'WAF (Web App Firewall)',
    'Request Timeout',
  ],
  storage: ['Cloudflare R2'],
  notifications: ['WhatsApp (Meta)'],
  monitoring: [
    'Winston Logger',
    'Request ID Correlation',
    'Swagger API Docs',
  ],
};

/**
 * Register a service status
 */
export const registerService = (name: string, status: ServiceStatus, message?: string): void => {
  services.set(name, { name, status, message });
};

/**
 * Update a service status
 */
export const updateService = (name: string, status: ServiceStatus, message?: string): void => {
  const existing = services.get(name);
  if (existing) {
    existing.status = status;
    existing.message = message;
  } else {
    registerService(name, status, message);
  }
};

/**
 * Get status icon based on service status
 */
const getStatusIcon = (status: ServiceStatus): string => {
  switch (status) {
    case 'connected':
    case 'ready':
      return '✅';
    case 'disconnected':
      return '❌';
    case 'disabled':
      return '⏸️';
    case 'error':
      return '🔴';
    case 'not_configured':
      return '⚠️';
    default:
      return '❓';
  }
};

/**
 * Display all service statuses on startup
 */
export const displayStartupStatus = (): void => {
  console.log('\n' + '═'.repeat(55));
  console.log('           SERVICE STATUS DASHBOARD');
  console.log('═'.repeat(55));

  // Group services by category
  const categorized = new Map<string, ServiceInfo[]>();
  const uncategorized: ServiceInfo[] = [];

  services.forEach((service) => {
    let found = false;
    for (const [category, serviceNames] of Object.entries(SERVICE_CATEGORIES)) {
      if (serviceNames.includes(service.name)) {
        if (!categorized.has(category)) {
          categorized.set(category, []);
        }
        categorized.get(category)!.push(service);
        found = true;
        break;
      }
    }
    if (!found) {
      uncategorized.push(service);
    }
  });

  // Display by category
  const categoryLabels: Record<string, string> = {
    core: '🖥️  Core',
    database: '📦 Database',
    cache: '🗄️  Cache & Queue',
    search: '🔍 Search',
    auth: '🔐 Authentication',
    messaging: '📨 Messaging',
    storage: '💾 Storage',
    email: '📧 Email',
    notifications: '📱 Notifications',
    cloud: '☁️  Cloud Services',
    monitoring: '📊 Monitoring',
    security: '🔒 Security',
    features: '⚙️  Features',
    infrastructure: '🏗️  Infrastructure',
  };

  for (const [category, label] of Object.entries(categoryLabels)) {
    const categoryServices = categorized.get(category);
    if (categoryServices && categoryServices.length > 0) {
      console.log(`\n${label}:`);
      categoryServices.forEach((s) => {
        const icon = getStatusIcon(s.status);
        const msg = s.message ? ` (${s.message})` : '';
        console.log(`  ${icon} ${s.name}: ${s.status}${msg}`);
      });
    }
  }

  if (uncategorized.length > 0) {
    console.log('\n🔧 Other:');
    uncategorized.forEach((s) => {
      const icon = getStatusIcon(s.status);
      const msg = s.message ? ` (${s.message})` : '';
      console.log(`  ${icon} ${s.name}: ${s.status}${msg}`);
    });
  }

  console.log('\n' + '═'.repeat(55));

  // Summary
  const connected = Array.from(services.values()).filter(
    (s) => s.status === 'connected' || s.status === 'ready'
  ).length;
  const notConfigured = Array.from(services.values()).filter(
    (s) => s.status === 'not_configured'
  ).length;
  const disabled = Array.from(services.values()).filter((s) => s.status === 'disabled').length;
  const errors = Array.from(services.values()).filter((s) => s.status === 'error').length;
  const total = services.size;

  console.log(
    `📈 Summary: ${connected}/${total} active | ${notConfigured} not configured | ${disabled} disabled | ${errors} errors`
  );
  console.log('═'.repeat(55) + '\n');
};

/**
 * Display shutdown status
 */
export const displayShutdownStatus = (): void => {
  logger.info('─'.repeat(45));
  logger.info('Shutting down services...');
};

/**
 * Log service disconnection during shutdown
 */
export const logServiceShutdown = (name: string): void => {
  logger.info(`  ✓ ${name} disconnected`);
  updateService(name, 'disconnected');
};

/**
 * Get all services (for health check endpoint)
 */
export const getAllServices = (): ServiceInfo[] => {
  return Array.from(services.values());
};

export default {
  registerService,
  updateService,
  displayStartupStatus,
  displayShutdownStatus,
  logServiceShutdown,
  getAllServices,
};
