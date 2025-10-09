FROM node:20-alpine AS build
WORKDIR /srv/app

# Increase npm network resiliency to avoid transient registry outages during CI.
ENV \
    NPM_CONFIG_FETCH_RETRIES=10 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=300000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000

RUN apk add --no-cache python3 make g++
COPY package*.json .npmrc ./
RUN npm ci
COPY . .
RUN npx tsc -p apps/orchestrator/tsconfig.json

FROM node:20-alpine
WORKDIR /srv/app
ENV NODE_ENV=production

# Reuse npm network configuration in the runtime image as well.
ENV \
    NPM_CONFIG_FETCH_RETRIES=10 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=300000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000

RUN apk add --no-cache python3 make g++
COPY package*.json .npmrc ./
RUN npm ci --omit=dev
COPY --from=build /srv/app/apps/orchestrator/dist ./apps/orchestrator/dist
COPY --from=build /srv/app/apps/orchestrator/*.json ./apps/orchestrator/
CMD ["node", "apps/orchestrator/dist/main.js"]
