FROM node:20.18.1
WORKDIR /app
COPY demo/CULTURE-v0/indexers/culture-graph-indexer/package.json ./package.json
COPY demo/CULTURE-v0/indexers/culture-graph-indexer/package-lock.json ./package-lock.json
RUN npm ci --legacy-peer-deps
COPY demo/CULTURE-v0/indexers/culture-graph-indexer/prisma ./prisma
RUN npx prisma generate
COPY demo/CULTURE-v0/indexers/culture-graph-indexer/tsconfig.json ./tsconfig.json
COPY demo/CULTURE-v0/indexers/culture-graph-indexer/src ./src
RUN npm run build
CMD ["node", "dist/index.js"]
