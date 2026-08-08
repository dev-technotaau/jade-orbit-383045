import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

const isEnabled = process.env.OTEL_ENABLED === 'true';

let sdk: NodeSDK | undefined;

export const initTelemetry = () => {
  if (!isEnabled) {
    console.log('OpenTelemetry is disabled. Set OTEL_ENABLED=true to enable.');
    return;
  }

  const exporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
      ? JSON.parse(
          JSON.stringify(
            process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',').reduce(
              (acc, curr) => {
                const [key, value] = curr.split('=');
                if (key && value) acc[key.trim()] = value.trim();
                return acc;
              },
              {} as Record<string, string>
            )
          )
        )
      : {},
  });

  sdk = new NodeSDK({
    // Resource attributes are set via environment variables in newer versions
    // OTEL_RESOURCE_ATTRIBUTES=service.name=hire-adda-api
    serviceName: process.env.OTEL_SERVICE_NAME || 'hire-adda-api',
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable fs instrumentation to reduce noise
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  console.log('OpenTelemetry initialized');

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk
      ?.shutdown()
      .then(() => console.log('OpenTelemetry terminated'))
      .catch((error) => console.error('Error terminating OpenTelemetry', error))
      .finally(() => process.exit(0));
  });
};

// Export semantic convention constants for use elsewhere
export const SemanticAttributes = {
  SERVICE_NAME: SEMRESATTRS_SERVICE_NAME,
  SERVICE_VERSION: SEMRESATTRS_SERVICE_VERSION,
  DEPLOYMENT_ENVIRONMENT: SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
};

export default initTelemetry;
