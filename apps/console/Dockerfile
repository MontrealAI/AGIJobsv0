FROM node:22.23.3-alpine3.23 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev

FROM deps AS build
COPY . .
RUN npm run build

FROM nginx:1.30.5-alpine3.24 AS runner
RUN apk upgrade --no-cache
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
