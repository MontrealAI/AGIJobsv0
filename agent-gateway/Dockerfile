# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && ln -sf python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*
ENV PYTHON=/usr/bin/python3 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=180000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000 \
    NPM_CI_MAX_ATTEMPTS=5 \
    NPM_CI_RETRY_DELAY=10
COPY scripts/docker/npm-ci-retry.sh /usr/local/bin/npm-ci-retry.sh
RUN chmod +x /usr/local/bin/npm-ci-retry.sh

FROM base AS builder
COPY package.json package-lock.json ./
RUN npm-ci-retry.sh
COPY . .
RUN npm run build:gateway

FROM base AS runner
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm-ci-retry.sh --omit=dev
COPY --from=builder /app/agent-gateway/dist ./agent-gateway/dist
COPY --from=builder /app/scripts/start-telemetry.sh ./scripts/start-telemetry.sh
RUN chmod +x ./scripts/start-telemetry.sh
# Directories for persistent state can be mounted at runtime.
RUN mkdir -p /app/storage /app/logs
CMD ["node", "agent-gateway/dist/agent-gateway/operator.js"]
