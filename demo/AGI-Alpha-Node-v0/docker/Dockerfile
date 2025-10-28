FROM node:20.12-bullseye-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .
RUN npm run build

FROM node:20.12-bullseye-slim
WORKDIR /node
ENV NODE_ENV=production
COPY --from=base /app /node
EXPOSE 8443 9464 7443 9443
ENTRYPOINT ["node", "dist/index.js"]
