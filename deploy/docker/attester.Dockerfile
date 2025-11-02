# syntax=docker/dockerfile:1

FROM node:20.19.0-alpine3.20 AS base-build
WORKDIR /srv/app
RUN apk add --no-cache python3 make g++ \
    && apk upgrade --no-cache libssl3 libcrypto3 \
    && ln -sf python3 /usr/bin/python
ENV PYTHON=/usr/bin/python3 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_PACKAGE_LOCK=true \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=180000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000 \
    NPM_CI_MAX_ATTEMPTS=5 \
    NPM_CI_RETRY_DELAY=10 \
    NPM_CI_PROJECT_ROOT=/srv/app \
    NPM_CI_LOCK_PATH=/srv/app/package-lock.json
COPY scripts/docker/npm-ci-retry.sh /usr/local/bin/npm-ci-retry.sh
RUN chmod +x /usr/local/bin/npm-ci-retry.sh

FROM base-build AS builder
COPY package.json package-lock.json .npmrc ./
RUN npm-ci-retry.sh --omit=dev

FROM node:20.19.0-alpine3.20 AS runner
ENV NODE_ENV=production \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false
WORKDIR /srv/app
COPY --from=builder /srv/app/package.json ./
COPY --from=builder /srv/app/package-lock.json ./
COPY --from=builder /srv/app/node_modules ./node_modules
COPY deploy/docker/entrypoints/attester.mjs ./entrypoint.mjs
RUN apk upgrade --no-cache libssl3 libcrypto3 \
    && chown -R node:node /srv/app
USER node
EXPOSE 7000
CMD ["node", "entrypoint.mjs"]
