FROM node:20.18.1-bullseye
WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build:agi-alpha-node

ENV NODE_ENV=production \
    ALPHA_NODE_CONFIG=/config/alpha-node.json \
    PORT=4318 \
    METRICS_PORT=4317

EXPOSE 4317 4318

ENTRYPOINT ["node", "demo/AGI-Alpha-Node-v0/dist/cli.js"]
CMD ["--config", "/config/alpha-node.json"]
