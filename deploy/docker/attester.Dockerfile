FROM node:22.23.3-alpine3.23
WORKDIR /srv/app
RUN apk upgrade --no-cache && apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev
COPY deploy/docker/entrypoints/attester.mjs ./entrypoint.mjs
EXPOSE 7000
CMD ["node", "entrypoint.mjs"]
