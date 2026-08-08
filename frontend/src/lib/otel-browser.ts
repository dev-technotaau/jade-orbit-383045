import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { resourceFromAttributes, defaultResource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-web';
import { trace, SpanKind } from '@opentelemetry/api';

let initialized = false;

/** Backends our fetch / XHR instrumentations are allowed to propagate
 *  W3C trace-context to (Same-origin or our own API host). */
const TRACE_PROPAGATION_TARGETS = [/https?:\/\/(api\.)?hireadda\.in/, /https?:\/\/localhost/];

export function initBrowserOtel() {
  if (initialized) return;
  initialized = true;

  const isProduction = process.env.NODE_ENV === 'production';
  const collectorUrl =
    process.env.NEXT_PUBLIC_OTEL_COLLECTOR_URL ||
    (isProduction ? 'https://hireadda.in/otel/v1/traces' : 'http://localhost:4318/v1/traces');

  const provider = new WebTracerProvider({
    resource: defaultResource().merge(
      resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'hire-adda-frontend-browser',
      }),
    ),
    sampler: new TraceIdRatioBasedSampler(isProduction ? 0.1 : 1.0),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: collectorUrl,
        }),
      ),
    ],
  });

  provider.register({
    contextManager: new ZoneContextManager(),
  });

  registerInstrumentations({
    instrumentations: [
      // Fetch — auto-traces SPA AJAX. CORS-propagation list keeps the
      // trace header off third-party hosts (avoids extra preflights).
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: TRACE_PROPAGATION_TARGETS,
      }),
      // XHR — covers legacy XHR call paths (Razorpay checkout SDK,
      // some third-party widgets). Same propagation policy as fetch.
      new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls: TRACE_PROPAGATION_TARGETS,
      }),
      // User interactions — emits spans for click / submit / keydown /
      // change events so we can correlate "user clicked X" with the
      // fetch/XHR that immediately follows. Critical for INP analysis.
      new UserInteractionInstrumentation({
        eventNames: ['click', 'submit', 'keydown', 'change'],
      }),
      // Document load — captures Navigation Timing + initial resource
      // timing as a span tree on the first page render.
      new DocumentLoadInstrumentation(),
    ],
  });

  // Post-load resource-timing observer — emits a brief OTel span for
  // every resource (image / CSS / JS / font / XHR) loaded AFTER the
  // initial document-load tree closes. Filters to entries > 200 ms so
  // span volume stays bounded (typical page = 50-200 fast resources,
  // 5-15 slow ones worth investigating).
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const tracer = trace.getTracer('hire-adda-frontend-browser-resources');
      const SLOW_RESOURCE_THRESHOLD_MS = 200;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
          if (entry.duration < SLOW_RESOURCE_THRESHOLD_MS) continue;
          const startTime = performance.timeOrigin + entry.startTime;
          const span = tracer.startSpan(`resource ${entry.initiatorType || 'other'}`, {
            startTime,
            kind: SpanKind.CLIENT,
            attributes: {
              'resource.url': entry.name,
              'resource.type': entry.initiatorType,
              'resource.duration_ms': Math.round(entry.duration),
              'resource.transfer_size': entry.transferSize ?? 0,
              'resource.encoded_size': entry.encodedBodySize ?? 0,
              'resource.decoded_size': entry.decodedBodySize ?? 0,
              'resource.protocol': entry.nextHopProtocol ?? 'unknown',
              'resource.dns_ms': Math.round(entry.domainLookupEnd - entry.domainLookupStart),
              'resource.tcp_ms': Math.round(entry.connectEnd - entry.connectStart),
              'resource.ttfb_ms': Math.round(entry.responseStart - entry.requestStart),
            },
          });
          span.end(startTime + entry.duration);
        }
      });
      observer.observe({ type: 'resource', buffered: true });
    } catch {
      /* PerformanceObserver not supported — silent fallback */
    }
  }
}
