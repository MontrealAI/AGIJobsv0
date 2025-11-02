ARG NODE_VERSION=20.18.1
ARG NPM_VERSION=10.8.2

FROM node:${NODE_VERSION}-alpine3.20 AS deps
WORKDIR /app

RUN apk add --no-cache jq \
    && npm install -g npm@${NPM_VERSION}

COPY .nvmrc .nvmrc
COPY .npmrc .npmrc
COPY scripts/ci/npm-ci.sh scripts/ci/npm-ci.sh
RUN chmod +x scripts/ci/npm-ci.sh
COPY apps/validator-ui/package.json ./package.json
COPY apps/validator-ui/package-lock.json ./package-lock.json
RUN --mount=type=cache,target=/root/.npm scripts/ci/npm-ci.sh

FROM node:${NODE_VERSION}-alpine3.20 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/validator-ui ./
RUN mkdir -p public
RUN npm run build

FROM node:${NODE_VERSION}-alpine3.20 AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["npm", "run", "start"]
