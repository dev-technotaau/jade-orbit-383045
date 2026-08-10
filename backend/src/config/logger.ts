import winston from 'winston';
import path from 'path';

const logDir = path.join(process.cwd(), 'logs');
const isProduction = process.env.NODE_ENV === 'production';

// PII redaction format — strips passwords, emails, phone numbers from log messages
const piiRedact = winston.format((info) => {
  const redactString = (str: string): string =>
    str
      .replace(/password["'\s:=]+["']?[^\s,}"']+/gi, 'password=[REDACTED]')
      // Bearer / OAuth authorization tokens (e.g. "Authorization: Bearer <jwt>")
      .replace(/\b(Bearer|OAuth)\s+[A-Za-z0-9._-]{6,}/gi, '$1 [REDACTED]')
      // Secret-bearing key=value / query params (access_token=…, app_secret=…)
      .replace(
        /\b(access_token|client_secret|app_secret|api[_-]?key|secret|token)["'\s:=]+["']?[A-Za-z0-9._-]{6,}/gi,
        '$1=[REDACTED]'
      )
      // Meta long-lived access-token shape (EAA…)
      .replace(/\bEAA[A-Za-z0-9]{20,}/g, '[TOKEN_REDACTED]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]')
      .replace(
        /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        '[PHONE_REDACTED]'
      );

  if (typeof info.message === 'string') {
    info.message = redactString(info.message);
  }
  return info;
});

// Human-readable format for development console
const devFormat = winston.format.combine(
  piiRedact(),
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} ${level}: ${stack || message}`;
  })
);

// Structured JSON format for production (ELK / CloudWatch / Datadog compatible)
const prodFormat = winston.format.combine(
  piiRedact(),
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// File format — always JSON for parsing
const fileFormat = winston.format.combine(
  piiRedact(),
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  defaultMeta: { service: 'whatsapp-module-api' },
  transports: [
    // Console — human-readable in dev, JSON in prod
    new winston.transports.Console({
      format: isProduction ? prodFormat : devFormat,
    }),
    // Error logs — JSON, max 20MB, 14 day rotation
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 20 * 1024 * 1024,
      maxFiles: 14,
    }),
    // Combined logs — JSON, max 20MB, 30 day rotation
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: fileFormat,
      maxsize: 20 * 1024 * 1024,
      maxFiles: 30,
    }),
  ],
  // Don't exit on uncaught errors — let the process handler deal with it
  exitOnError: false,
});

// Centralized log aggregation — HTTP transport (e.g., Datadog, Logstash, Loki)
const logAggregationUrl = process.env.LOG_AGGREGATION_URL;
if (logAggregationUrl) {
  try {
    const url = new URL(logAggregationUrl);
    logger.add(
      new winston.transports.Http({
        host: url.hostname,
        port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        ssl: url.protocol === 'https:',
        format: prodFormat,
        headers: process.env.LOG_AGGREGATION_TOKEN
          ? { Authorization: `Bearer ${process.env.LOG_AGGREGATION_TOKEN}` }
          : undefined,
      })
    );
  } catch {
    // Invalid URL — skip
  }
}

export default logger;
