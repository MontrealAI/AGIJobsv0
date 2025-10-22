# syntax=docker/dockerfile:1.7

FROM node:20.18.1-slim AS base
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY demo/CULTURE-v0/.npmrc .npmrc
COPY .npmrc /app/.npmrc.root
COPY demo/CULTURE-v0/backend/arena-orchestrator/package.json \
     demo/CULTURE-v0/backend/arena-orchestrator/package-lock.json ./
RUN npm ci --ignore-scripts

FROM deps AS build
COPY demo/CULTURE-v0/backend/arena-orchestrator/tsconfig.json ./
COPY demo/CULTURE-v0/backend/arena-orchestrator/src ./src
RUN npm run build

FROM base AS runtime
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY demo/CULTURE-v0/backend/arena-orchestrator/package.json ./package.json
COPY demo/CULTURE-v0/backend/arena-orchestrator/package-lock.json ./package-lock.json
COPY demo/CULTURE-v0/backend/arena-orchestrator/healthcheck.js ./healthcheck.js
COPY demo/CULTURE-v0/backend/arena-orchestrator/scripts ./scripts

RUN npm prune --omit=dev

RUN groupadd --system app \
  && useradd --system --create-home --gid app app \
  && chown -R app:app /app
USER app
EXPOSE 4005

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD node healthcheck.js || exit 1

CMD ["node", "dist/index.js"]
