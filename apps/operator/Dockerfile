ARG NODE_VERSION=20.18.1
ARG NPM_VERSION=10.8.2

FROM node:${NODE_VERSION}-bookworm-slim AS base

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends jq \
  && npm install -g npm@${NPM_VERSION} \
  && rm -rf /var/lib/apt/lists/*

COPY .nvmrc .nvmrc
COPY .npmrc .npmrc
COPY scripts/ci/npm-ci.sh scripts/ci/npm-ci.sh
RUN chmod +x scripts/ci/npm-ci.sh
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm scripts/ci/npm-ci.sh

COPY apps ./apps

RUN npx tsc -p apps/operator/tsconfig.json \
  && npm prune --omit=dev

FROM node:${NODE_VERSION}-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/apps/operator/dist ./apps/operator/dist
COPY apps/operator/telemetry.ts ./apps/operator/telemetry.ts
COPY apps/operator/tsconfig.json ./apps/operator/tsconfig.json

VOLUME ["/data/logs", "/data/state"]
ENV ENERGY_LOG_DIR=/data/logs
ENV TELEMETRY_STATE_FILE=/data/state/operator-telemetry-state.json

CMD ["node", "apps/operator/dist/telemetry.js"]
