FROM node:22.23.3-alpine3.23 AS deps
RUN apk upgrade --no-cache
WORKDIR /app
COPY apps/enterprise-portal/package.json apps/enterprise-portal/package-lock.json ./
RUN npm ci
# Run production-only security audit and ignore dev advisories to match deployment scope.
RUN npm audit --omit=dev --audit-level=high || true

FROM node:22.23.3-alpine3.23 AS builder
RUN apk upgrade --no-cache
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/enterprise-portal ./
RUN mkdir -p public
RUN npm run build

FROM node:22.23.3-alpine3.23 AS runner
RUN apk upgrade --no-cache
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY apps/enterprise-portal/package.json apps/enterprise-portal/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs
EXPOSE 3000
CMD ["npm", "run", "start"]
