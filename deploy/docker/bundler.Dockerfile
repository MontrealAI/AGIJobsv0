FROM node:20-alpine
WORKDIR /srv/app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev
COPY deploy/docker/entrypoints/bundler.mjs ./entrypoint.mjs
EXPOSE 3000
CMD ["node", "entrypoint.mjs"]
