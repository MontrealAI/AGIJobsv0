FROM node:20-bookworm-slim AS base

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY apps ./apps

RUN npx tsc -p apps/operator/tsconfig.json \
  && npm prune --omit=dev

FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/apps/operator/dist ./apps/operator/dist
COPY apps/operator/telemetry.ts ./apps/operator/telemetry.ts
COPY apps/operator/tsconfig.json ./apps/operator/tsconfig.json

VOLUME ["/data/logs", "/data/state"]
ENV ENERGY_LOG_DIR=/data/logs
ENV TELEMETRY_STATE_FILE=/data/state/operator-telemetry-state.json

CMD ["node", "apps/operator/dist/telemetry.js"]
