FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev

FROM deps AS build
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runner
RUN apk upgrade --no-cache \
    libexpat \
    libxml2
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
