FROM node:22.23.3-alpine

WORKDIR /app

COPY package.json package-lock.json ./
# The root lockfile includes native modules without Alpine prebuilt binaries.
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --omit=dev \
    && apk del .build-deps

COPY services/alpha-bridge ./services/alpha-bridge

ENV NODE_ENV=production
EXPOSE 50052
CMD ["node", "services/alpha-bridge/src/server.js"]
