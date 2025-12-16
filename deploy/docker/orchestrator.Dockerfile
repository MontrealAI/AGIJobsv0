# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS build
WORKDIR /srv/app

# Increase npm network resiliency to avoid transient registry outages during CI.
ENV \
    NPM_CONFIG_FETCH_RETRIES=10 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=300000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000

RUN apk add --no-cache python3 make g++
COPY package*.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm \
    set -eu; \
    npm ci --no-progress --registry=https://registry.npmjs.org/ \
    || (echo "npm ci failed once, retrying after short backoff" && sleep 5 && npm ci --no-progress --registry=https://registry.npmjs.org/)
COPY . .
RUN npx tsc -p apps/orchestrator/tsconfig.json

FROM node:20-alpine
WORKDIR /srv/app
ENV NODE_ENV=production

# Reuse npm network configuration in the runtime image as well.
ENV \
    NPM_CONFIG_FETCH_RETRIES=10 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=300000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000

RUN apk add --no-cache python3 make g++
COPY package*.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm \
    set -eu; \
    npm ci --omit=dev --no-progress --registry=https://registry.npmjs.org/ \
    || (echo "npm ci --omit=dev failed once, retrying after short backoff" && sleep 5 && npm ci --omit=dev --no-progress --registry=https://registry.npmjs.org/)
COPY --from=build /srv/app/apps/orchestrator/dist ./apps/orchestrator/dist
COPY --from=build /srv/app/apps/orchestrator/*.json ./apps/orchestrator/
CMD ["node", "apps/orchestrator/dist/main.js"]
