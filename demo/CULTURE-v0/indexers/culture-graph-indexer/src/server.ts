import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ApolloServer } from '@apollo/server';
import fastifyApollo, { fastifyApolloDrainPlugin } from '@as-integrations/fastify';
import type { PrismaClient } from '@prisma/client';
import { typeDefs } from './graphql/schema.js';
import { contextFactory, resolvers } from './graphql/resolvers.js';

export async function createServer(prisma: PrismaClient) {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  const apollo = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [fastifyApolloDrainPlugin(app)],
  });

  await apollo.start();

  await app.register(fastifyApollo(apollo), {
    context: contextFactory(prisma),
  });

  app.get('/healthz', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  return { app, apollo };
}
