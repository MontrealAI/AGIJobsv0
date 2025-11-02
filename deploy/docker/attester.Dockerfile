FROM node:20-alpine

ENV NODE_ENV=production \
    npm_config_package_lock=true

WORKDIR /srv/app

RUN apk add --no-cache python3 make g++

COPY deploy/docker/attester.package.json ./package.json
COPY deploy/docker/attester.package-lock.json ./package-lock.json

RUN test -f package-lock.json && test -f package.json
RUN npm ci --omit=dev
COPY deploy/docker/entrypoints/attester.mjs ./entrypoint.mjs
EXPOSE 7000
CMD ["node", "entrypoint.mjs"]
