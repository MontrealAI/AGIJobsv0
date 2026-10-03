FROM node:22.23.3-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY services/notifications ./services/notifications

ENV NODE_ENV=production
EXPOSE 8075
CMD ["node", "services/notifications/server.js"]
