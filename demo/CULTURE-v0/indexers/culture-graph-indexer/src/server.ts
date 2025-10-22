import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ApolloServer } from '@apollo/server';
import fastifyApollo, { fastifyApolloDrainPlugin } from '@as-integrations/fastify';
import type { PrismaClient } from '@prisma/client';
import { collectDefaultMetrics, Registry } from 'prom-client';
import { typeDefs } from './graphql/schema.js';
import { contextFactory, resolvers } from './graphql/resolvers.js';
import type { IntegrityStatusSnapshot } from './services/data-integrity-service.js';
import type { InfluenceValidationReport } from './services/networkx-validator.js';

export interface ServerOptions {
  readonly rateLimitMax?: number;
  readonly rateLimitWindow?: string;
  readonly integrityStatusProvider?: () => IntegrityStatusSnapshot;
  readonly validationStatusProvider?: () => InfluenceValidationReport | null;
}

const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

export async function createServer(prisma: PrismaClient, options: ServerOptions = {}) {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  await app.register(rateLimit, {
    max: options.rateLimitMax ?? 200,
    timeWindow: options.rateLimitWindow ?? '1 minute',
  });

  const apollo = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [fastifyApolloDrainPlugin(app)],
  });

  await apollo.start();

  await app.register(fastifyApollo(apollo), {
    context: contextFactory(prisma),
  });

  app.get('/healthz', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    integrity: options.integrityStatusProvider?.(),
    influenceValidation: serializeValidation(options.validationStatusProvider?.()),
  }));

  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });

  return { app, apollo };
}

function serializeValidation(report: InfluenceValidationReport | null | undefined) {
  if (!report) {
    return null;
  }

  return {
    ok: report.ok,
    skipped: report.skipped,
    engine: report.engine,
    maxDelta: report.maxDelta,
    error: report.error ?? null,
  };
}
