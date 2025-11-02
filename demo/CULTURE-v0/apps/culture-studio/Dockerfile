# syntax=docker/dockerfile:1.7

FROM node:20.19.0-slim AS build
WORKDIR /app
ENV NODE_ENV=development

ARG VITE_ORCHESTRATOR_URL=http://localhost:4005
ARG VITE_INDEXER_URL=http://localhost:4100/graphql
ARG VITE_IPFS_GATEWAY=http://localhost:8080
ENV VITE_ORCHESTRATOR_URL=$VITE_ORCHESTRATOR_URL \
    VITE_INDEXER_URL=$VITE_INDEXER_URL \
    VITE_IPFS_GATEWAY=$VITE_IPFS_GATEWAY

COPY demo/CULTURE-v0/.npmrc .npmrc
COPY .npmrc /app/.npmrc.root
COPY demo/CULTURE-v0/apps/culture-studio/package.json \
     demo/CULTURE-v0/apps/culture-studio/package-lock.json ./
RUN npm ci

COPY demo/CULTURE-v0/apps/culture-studio/tsconfig.json ./tsconfig.json
COPY demo/CULTURE-v0/apps/culture-studio/vite.config.ts ./vite.config.ts
COPY demo/CULTURE-v0/apps/culture-studio/index.html ./index.html
COPY demo/CULTURE-v0/apps/culture-studio/src ./src
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY demo/CULTURE-v0/apps/culture-studio/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

USER nginx
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD wget -q -O- http://127.0.0.1:4173/healthz > /dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
