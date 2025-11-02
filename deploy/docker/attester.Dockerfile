FROM node:20-alpine

WORKDIR /srv/app

RUN apk add --no-cache python3 make g++

COPY scripts/docker/npm-ci-retry.sh /usr/local/bin/npm-ci-retry.sh
RUN chmod +x /usr/local/bin/npm-ci-retry.sh

ENV NPM_CI_PROJECT_ROOT=/srv/app \
    NPM_CI_LOCK_PATH=/srv/app/package-lock.json \
    NPM_CI_PACKAGE_JSON_PATH=/srv/app/package.json

COPY package.json package-lock.json .npmrc ./

RUN npm-ci-retry.sh --omit=dev

COPY deploy/docker/entrypoints/attester.mjs ./entrypoint.mjs

EXPOSE 7000

CMD ["node", "entrypoint.mjs"]
