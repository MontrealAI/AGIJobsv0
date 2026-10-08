FROM node:22.23.3-bookworm-slim
WORKDIR /app
ENV CYPRESS_INSTALL_BINARY=0

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build:agi-alpha-node && npm prune --omit=dev

ENV NODE_ENV=production \
    ALPHA_NODE_CONFIG=/config/alpha-node.json \
    PORT=4318 \
    METRICS_PORT=4317

EXPOSE 4317 4318

ENTRYPOINT ["node", "demo/AGI-Alpha-Node-v0/dist/cli.js"]
CMD ["--config", "/config/alpha-node.json"]
