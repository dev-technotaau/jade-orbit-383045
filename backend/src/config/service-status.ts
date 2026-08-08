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

// Service categories for organized display
const SERVICE_CATEGORIES = {
  core: ['Express Server', 'Socket.IO', 'Compression', 'Request ID Tracking', 'Request Timeout'],
  database: ['PostgreSQL (Prisma)'],
  cache: [
    'Redis',
    'BullMQ Workers',
    'BullMQ Job Queue',
    'SMS Queue',
    'WhatsApp Queue',
    'FCM Queue',
    'In-App Queue',
    'Web Push Queue',
    'Scheduler Queue',
    'Backup Queue',
    'Data Export Queue',
    'Geocoding Queue',
    'Job Expiration Queue',
    'Matching Queue',
    'Profile Reminder Queue',
    'Resume Parse Queue',
    'Scheduled Publish Queue',
    'SLA Check Queue',
    'Token Cleanup Queue',
    'Weekly Digest Queue',
  ],
  search: ['Elasticsearch'],
  auth: ['JWT Auth', 'Passport.js', 'Google OAuth', 'LinkedIn OAuth'],
  messaging: [
    'Kafka',
    'Kafka Consumer',
    'Kafka Events',
    'Firebase FCM',
    'Firebase Realtime DB',
    'Firebase Auth',
  ],
  storage: ['Cloudflare R2', 'Cloudinary'],
  email: ['SMTP (Nodemailer)'],
  notifications: ['Twilio SMS', 'WhatsApp (Meta)', 'Web Push (VAPID)', 'Job Alerts'],
  cloud: ['Google Cloud Talent', 'Google Document AI', 'BigQuery', 'Geocoding', 'Nominatim (OSM)'],
  monitoring: [
    'Sentry',
    'OpenTelemetry',
    'Winston Logger',
    'Google Analytics',
    'Morgan HTTP Logger',
    'Request ID Correlation',
    'Grafana Loki',
  ],
  security: [
    'Cloudflare Turnstile',
    'Rate Limiting',
    'CORS',
    'Helmet',
    'CSRF Protection',
    'XSS Sanitization',
    'HPP Protection',
    'MFA (TOTP)',
    'WebAuthn (Passkeys)',
    'HIBP Breach Detection',
    'Cookie Parser',
    'OTP Service',
    'Session Management',
    'HTML Sanitization',
    'WAF (Web App Firewall)',
    'DDoS Protection',
    'CSP (Content Security Policy)',
    'Field Encryption',
    'Data Anonymization',
    'Device Security',
    'Maintenance Mode',
  ],
  features: [
    'Feature Flags',
    'Audit Logging',
    'Swagger API Docs',
    'PDF/Resume Generation',
    'Excel Reports',
    'Webhooks',
    'AI Matching Engine',
    'Resume Parsing',
    'Content Moderation',
    'Consent Management',
    'Support Tickets',
    'File Uploads',
    'Identity Verification',
    'GDPR Data Export',
    'User Presence',
    'QR Code Generation',
    'Email Service',
    'Contact Service',
    'Draft Service',
    'Saved Search',
    'Saved Candidates',
    'Profile Views',
    'Job Templates',
    'Report Generation',
    'Admin Service',
    'Super Admin Service',
    'Candidate Analytics',
    'Employer Analytics',
    'Talent Matching',
  ],
  infrastructure: ['Docker', 'Nginx', 'Husky Git Hooks', 'Prisma ORM'],
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
