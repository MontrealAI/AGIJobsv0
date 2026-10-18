# syntax=docker/dockerfile:1.6

FROM node:22.23.3-alpine3.23 AS build
WORKDIR /srv/app

# Increase npm network resiliency to avoid transient registry outages during CI.
ENV \
    NPM_CONFIG_FETCH_RETRIES=10 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=300000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000

# Refresh cached dependencies and require the CVE-2026-77214 fix.
RUN apk upgrade --no-cache && apk add --no-cache python3 make g++ 'libexpat>=2.9.0-r0'
COPY package*.json .npmrc ./
COPY vendor/braces/braces-3.0.4-agi.1.tgz ./vendor/braces/braces-3.0.4-agi.1.tgz
RUN --mount=type=cache,target=/root/.npm \
    set -eu; \
    npm ci --no-progress --registry=https://registry.npmjs.org/ \
    || (echo "npm ci failed once, retrying after short backoff" && sleep 5 && npm ci --no-progress --registry=https://registry.npmjs.org/)
COPY . .
RUN npm run build:orchestrator

FROM node:22.23.3-alpine3.23
WORKDIR /srv/app
ENV NODE_ENV=production

# Keep retry settings for dependency installation in the final build stage.
ENV \
    NPM_CONFIG_FETCH_RETRIES=10 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=300000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000

RUN apk upgrade --no-cache && apk add --no-cache python3 make g++ 'libexpat>=2.9.0-r0'
COPY package*.json .npmrc ./
COPY vendor/braces/braces-3.0.4-agi.1.tgz ./vendor/braces/braces-3.0.4-agi.1.tgz
RUN --mount=type=cache,target=/root/.npm \
    set -eu; \
    npm ci --omit=dev --no-progress --registry=https://registry.npmjs.org/ \
    || (echo "npm ci --omit=dev failed once, retrying after short backoff" && sleep 5 && npm ci --omit=dev --no-progress --registry=https://registry.npmjs.org/)
# The service runs directly with Node; package-manager tooling is not required.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm
COPY --from=build /srv/app/apps/orchestrator/dist ./
COPY --from=build /srv/app/apps/orchestrator/*.json ./apps/orchestrator/
CMD ["node", "apps/orchestrator/main.js"]
