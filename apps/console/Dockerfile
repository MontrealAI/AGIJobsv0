FROM node:22.23.3-alpine3.23 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev

FROM deps AS build
COPY . .
RUN npm run build

FROM nginx:1.30.5-alpine3.24 AS runner
# Refresh the cached package layer and require the CVE-2026-88806 fix.
RUN apk upgrade --no-cache && apk add --no-cache 'libx11>=1.8.14-r0'
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
