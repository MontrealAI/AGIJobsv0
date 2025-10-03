FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY services/alpha-bridge ./services/alpha-bridge

ENV NODE_ENV=production
EXPOSE 50052
CMD ["node", "services/alpha-bridge/src/server.js"]
