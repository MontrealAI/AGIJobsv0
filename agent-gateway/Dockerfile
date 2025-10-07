# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++ \
    && ln -sf python3 /usr/bin/python
ENV PYTHON=/usr/bin/python3
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:gateway

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache python3 make g++ \
    && ln -sf python3 /usr/bin/python
ENV PYTHON=/usr/bin/python3
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/agent-gateway/dist ./agent-gateway/dist
COPY --from=builder /app/scripts/start-telemetry.sh ./scripts/start-telemetry.sh
RUN chmod +x ./scripts/start-telemetry.sh
# Directories for persistent state can be mounted at runtime.
RUN mkdir -p /app/storage /app/logs
CMD ["node", "agent-gateway/dist/agent-gateway/operator.js"]
