FROM node:20-alpine AS deps
WORKDIR /app
COPY apps/console/package*.json ./
RUN npm ci --omit=dev

FROM deps AS build
COPY apps/console .
RUN npm run build

FROM nginx:1.27-alpine AS runner
COPY apps/console/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
