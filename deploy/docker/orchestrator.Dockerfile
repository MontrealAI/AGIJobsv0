FROM node:20-alpine AS build
WORKDIR /srv/app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx tsc -p apps/orchestrator/tsconfig.json

FROM node:20-alpine
WORKDIR /srv/app
ENV NODE_ENV=production
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /srv/app/apps/orchestrator/dist ./apps/orchestrator/dist
COPY --from=build /srv/app/apps/orchestrator/*.json ./apps/orchestrator/
CMD ["node", "apps/orchestrator/dist/main.js"]
