FROM node:20.18.1
WORKDIR /app
COPY demo/CULTURE-v0/apps/culture-studio/package.json ./package.json
COPY demo/CULTURE-v0/apps/culture-studio/tsconfig.json ./tsconfig.json
COPY demo/CULTURE-v0/apps/culture-studio/vite.config.ts ./vite.config.ts
COPY demo/CULTURE-v0/apps/culture-studio/index.html ./index.html
RUN npm install --legacy-peer-deps
COPY demo/CULTURE-v0/apps/culture-studio/src ./src
RUN npm run build
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]
