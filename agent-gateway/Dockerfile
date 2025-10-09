# syntax=docker/dockerfile:1

FROM node:20.18.1-alpine3.20 AS base-build
WORKDIR /app
RUN apk add --no-cache python3 make g++ \
    && ln -sf python3 /usr/bin/python
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

FROM base-build AS builder
COPY package.json package-lock.json ./
RUN npm-ci-retry.sh
COPY . .
RUN npm run build:gateway \
    && npm prune --omit=dev \
    && npm cache clean --force

FROM node:20.18.1-alpine3.20 AS runner
ENV NODE_ENV=production \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/agent-gateway/dist ./agent-gateway/dist
COPY --from=builder /app/scripts/start-telemetry.sh ./scripts/start-telemetry.sh
RUN chmod +x ./scripts/start-telemetry.sh \
    && mkdir -p /app/storage /app/logs \
    && chown -R node:node /app
USER node
CMD ["node", "agent-gateway/dist/agent-gateway/operator.js"]
