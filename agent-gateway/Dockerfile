# syntax=docker/dockerfile:1

# Builder stage with toolchain support for native module compilation.
FROM node:20-bookworm-slim AS builder
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
COPY package.json package-lock.json ./
RUN npm-ci-retry.sh
COPY . .
RUN npm run build:gateway
RUN npm prune --omit=dev \
    && npm cache clean --force

# Minimal runtime image hardened for production use.
FROM cgr.dev/chainguard/node:20 AS runner
WORKDIR /app
ENV NODE_ENV=production
# Copy the pruned production dependencies and compiled sources.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/agent-gateway/dist ./agent-gateway/dist
COPY --from=builder /app/scripts/start-telemetry.sh ./scripts/start-telemetry.sh
RUN chmod +x ./scripts/start-telemetry.sh \
    && mkdir -p /app/storage /app/logs \
    && chown -R nonroot:nonroot /app
USER nonroot
CMD ["node", "agent-gateway/dist/agent-gateway/operator.js"]
