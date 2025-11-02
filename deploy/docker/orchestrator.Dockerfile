ARG NODE_VERSION=20.18.1
ARG NPM_VERSION=10.8.2

FROM node:${NODE_VERSION}-alpine3.20 AS deps
WORKDIR /srv/app

ENV \
    NPM_CONFIG_FETCH_RETRIES=10 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=300000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

RUN apk add --no-cache python3 make g++ jq \
    && npm install -g npm@${NPM_VERSION}

COPY .nvmrc package.json package-lock.json .npmrc ./
COPY scripts/ci/npm-ci.sh scripts/ci/npm-ci.sh
RUN chmod +x scripts/ci/npm-ci.sh

RUN --mount=type=cache,target=/root/.npm scripts/ci/npm-ci.sh

FROM deps AS build
COPY . .
RUN npx tsc -p apps/orchestrator/tsconfig.json
RUN npm prune --omit=dev \
    && npm cache clean --force

FROM node:${NODE_VERSION}-alpine3.20 AS runner
WORKDIR /srv/app

ENV NODE_ENV=production \
    NPM_CONFIG_FETCH_RETRIES=10 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=300000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

RUN apk add --no-cache python3

COPY --from=build /srv/app/package.json ./
COPY --from=build /srv/app/package-lock.json ./
COPY --from=build /srv/app/apps/orchestrator/dist ./apps/orchestrator/dist
COPY --from=build /srv/app/apps/orchestrator/*.json ./apps/orchestrator/
COPY --from=build /srv/app/node_modules ./node_modules

CMD ["node", "apps/orchestrator/dist/main.js"]
