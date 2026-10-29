FROM node:22.23.3-alpine3.23
WORKDIR /srv/app
RUN apk upgrade --no-cache && apk add --no-cache 'python3>=3.12.16-r0' make g++
COPY package*.json ./
COPY vendor/braces/braces-3.0.4-agi.1.tgz ./vendor/braces/braces-3.0.4-agi.1.tgz
RUN npm ci --omit=dev \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm
COPY deploy/docker/entrypoints/attester.mjs ./entrypoint.mjs
EXPOSE 7000
CMD ["node", "entrypoint.mjs"]
