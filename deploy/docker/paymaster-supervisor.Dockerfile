ARG NODE_VERSION=20.18.1
ARG NPM_VERSION=10.8.2

FROM node:${NODE_VERSION}-alpine3.20
WORKDIR /srv/app

ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

RUN apk add --no-cache python3 make g++ jq \
    && npm install -g npm@${NPM_VERSION}

COPY .nvmrc package.json package-lock.json .npmrc ./
COPY scripts/ci/npm-ci.sh scripts/ci/npm-ci.sh
RUN chmod +x scripts/ci/npm-ci.sh

RUN --mount=type=cache,target=/root/.npm scripts/ci/npm-ci.sh --omit=dev

COPY deploy/docker/entrypoints/paymaster-supervisor.mjs ./entrypoint.mjs

EXPOSE 4000
CMD ["node", "entrypoint.mjs"]
