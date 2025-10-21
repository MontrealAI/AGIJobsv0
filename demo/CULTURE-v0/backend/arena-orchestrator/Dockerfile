FROM node:20.18.1
WORKDIR /app
COPY demo/CULTURE-v0/backend/arena-orchestrator/package.json ./package.json
COPY demo/CULTURE-v0/backend/arena-orchestrator/tsconfig.json ./tsconfig.json
RUN npm install --legacy-peer-deps
COPY demo/CULTURE-v0/backend/arena-orchestrator/src ./src
RUN npm run build
CMD ["node", "dist/index.js"]
