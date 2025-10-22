# syntax=docker/dockerfile:1.7

FROM node:20.18.1-slim AS base
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS build
ENV NODE_ENV=development

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential python3 pkg-config \
  && rm -rf /var/lib/apt/lists/*

COPY demo/CULTURE-v0/.npmrc .npmrc
COPY .npmrc /app/.npmrc.root
COPY demo/CULTURE-v0/indexers/culture-graph-indexer/package.json \
     demo/CULTURE-v0/indexers/culture-graph-indexer/package-lock.json ./
RUN npm ci

COPY demo/CULTURE-v0/indexers/culture-graph-indexer/tsconfig.json ./
COPY demo/CULTURE-v0/indexers/culture-graph-indexer/prisma ./prisma
RUN npm run prisma:generate
COPY demo/CULTURE-v0/indexers/culture-graph-indexer/src ./src
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production

COPY demo/CULTURE-v0/.npmrc .npmrc
COPY .npmrc /app/.npmrc.root
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY demo/CULTURE-v0/indexers/culture-graph-indexer/package.json ./package.json
COPY demo/CULTURE-v0/indexers/culture-graph-indexer/package-lock.json ./package-lock.json
COPY demo/CULTURE-v0/indexers/culture-graph-indexer/prisma ./prisma
COPY demo/CULTURE-v0/indexers/culture-graph-indexer/scripts ./scripts

RUN npm prune --omit=dev

RUN groupadd --system app \
  && useradd --system --create-home --gid app app \
  && chown -R app:app /app
USER app
EXPOSE 4100

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD node scripts/healthcheck.mjs || exit 1

CMD ["node", "dist/index.js"]
