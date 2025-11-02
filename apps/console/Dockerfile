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
COPY apps/console/package.json ./package.json
COPY apps/console/package-lock.json ./package-lock.json
RUN --mount=type=cache,target=/root/.npm scripts/ci/npm-ci.sh

FROM deps AS build
COPY apps/console/ ./
RUN npm run build

FROM nginx:1.27-alpine AS runner
RUN apk upgrade --no-cache \
    libexpat \
    libxml2
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
