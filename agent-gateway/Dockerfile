# syntax=docker/dockerfile:1

ARG NODE_VERSION=20.18.1
ARG NPM_VERSION=10.8.2

FROM node:${NODE_VERSION}-alpine3.20 AS base-build
WORKDIR /app
RUN apk add --no-cache python3 make g++ jq \
    && apk upgrade --no-cache libssl3 libcrypto3 \
    && npm install -g npm@${NPM_VERSION} \
    && ln -sf python3 /usr/bin/python
ENV PYTHON=/usr/bin/python3 \
    CYPRESS_INSTALL_BINARY=0 \
    npm_config_cypress_skip_binary_download=1 \
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
COPY .nvmrc package.json package-lock.json .npmrc ./
COPY scripts/ci/npm-ci.sh scripts/ci/npm-ci.sh
RUN chmod +x scripts/ci/npm-ci.sh
RUN --mount=type=cache,target=/root/.npm npm-ci-retry.sh
COPY . .
RUN npm run build:gateway \
    && npm prune --omit=dev \
    && npm cache clean --force

FROM node:${NODE_VERSION}-alpine3.20 AS runner
ENV NODE_ENV=production \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/agent-gateway/dist ./agent-gateway/dist
COPY --from=builder /app/scripts/start-telemetry.sh ./scripts/start-telemetry.sh
RUN apk upgrade --no-cache libssl3 libcrypto3 \
    && chmod +x ./scripts/start-telemetry.sh \
    && mkdir -p /app/storage /app/logs \
    && chown -R node:node /app
USER node
CMD ["node", "agent-gateway/dist/agent-gateway/operator.js"]
