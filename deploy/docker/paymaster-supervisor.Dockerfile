FROM node:22.23.3-alpine
WORKDIR /srv/app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
COPY vendor/braces/braces-3.0.4-agi.1.tgz ./vendor/braces/braces-3.0.4-agi.1.tgz
RUN npm ci --omit=dev
COPY deploy/docker/entrypoints/paymaster-supervisor.mjs ./entrypoint.mjs
EXPOSE 4000
CMD ["node", "entrypoint.mjs"]
