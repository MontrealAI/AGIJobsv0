FROM node:22.23.3-alpine3.23 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev

FROM deps AS build
COPY . .
RUN npm run build

FROM nginx:1.30.6-alpine3.24@sha256:47928bf67eb62a1863cb08d9ecb52d3e704304ba614eaee17884204677702951 AS runner
# Refresh packages and require the libX11 and nginx security fixes.
RUN apk upgrade --no-cache && apk add --no-cache 'libx11>=1.8.14-r0' 'nginx>=1.30.6-r0'
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN nginx -t && test -s /usr/share/nginx/html/index.html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
