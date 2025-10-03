FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY services/notifications ./services/notifications

ENV NODE_ENV=production
EXPOSE 8075
CMD ["node", "services/notifications/server.js"]
