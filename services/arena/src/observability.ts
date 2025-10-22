import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const tracerSingletonKey = Symbol.for('arena.tracer');

type TracerCache = {
  provider?: NodeTracerProvider;
};

const globalScope = globalThis as typeof globalThis & {
  [tracerSingletonKey]?: TracerCache;
};

function getCache(): TracerCache {
  if (!globalScope[tracerSingletonKey]) {
    globalScope[tracerSingletonKey] = {};
  }
  return globalScope[tracerSingletonKey]!;
}

export function initObservability(serviceName = 'arena-service') {
  const cache = getCache();
  if (cache.provider) {
    return cache.provider;
  }

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName
    })
  });

  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    provider.addSpanProcessor(
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
        })
      )
    );
  }

  provider.register();
  cache.provider = provider;
  return provider;
}
