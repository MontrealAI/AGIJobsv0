FROM node:22.23.3-alpine3.23 AS deps
RUN apk upgrade --no-cache
WORKDIR /app
COPY apps/validator-ui/package.json apps/validator-ui/package-lock.json ./
RUN npm ci

FROM node:22.23.3-alpine3.23 AS builder
RUN apk upgrade --no-cache
WORKDIR /workspace/apps/validator-ui
COPY --from=deps /app/node_modules ./node_modules
COPY apps/validator-ui ./
COPY config/agialpha.json /workspace/config/agialpha.json
COPY shared /workspace/shared
RUN ln -s apps/validator-ui/node_modules /workspace/node_modules
ARG NEXT_PUBLIC_RPC_URL=http://localhost:8545
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL
ARG NEXT_PUBLIC_GATEWAY_URL=http://localhost:8090
ENV NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL
ARG NEXT_PUBLIC_AGIALPHA_ADDRESS=0x0000000000000000000000000000000000000000
ENV NEXT_PUBLIC_AGIALPHA_ADDRESS=$NEXT_PUBLIC_AGIALPHA_ADDRESS
ARG NEXT_PUBLIC_AGIALPHA_DECIMALS=18
ENV NEXT_PUBLIC_AGIALPHA_DECIMALS=$NEXT_PUBLIC_AGIALPHA_DECIMALS
ARG NEXT_PUBLIC_JOB_REGISTRY_ADDRESS=0x0000000000000000000000000000000000000000
ENV NEXT_PUBLIC_JOB_REGISTRY_ADDRESS=$NEXT_PUBLIC_JOB_REGISTRY_ADDRESS
ARG NEXT_PUBLIC_VALIDATION_MODULE_ADDRESS=0x0000000000000000000000000000000000000000
ENV NEXT_PUBLIC_VALIDATION_MODULE_ADDRESS=$NEXT_PUBLIC_VALIDATION_MODULE_ADDRESS
ARG NEXT_PUBLIC_ATTESTATION_ADDRESS=0x0000000000000000000000000000000000000000
ENV NEXT_PUBLIC_ATTESTATION_ADDRESS=$NEXT_PUBLIC_ATTESTATION_ADDRESS
RUN mkdir -p public && npm run build && npm prune --omit=dev

FROM node:22.23.3-alpine3.23 AS runner
RUN apk upgrade --no-cache
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=builder --chown=node:node /workspace/apps/validator-ui/.next ./.next
COPY --from=builder /workspace/apps/validator-ui/node_modules ./node_modules
COPY --from=builder /workspace/apps/validator-ui/package.json ./package.json
COPY --from=builder /workspace/apps/validator-ui/next.config.js ./next.config.js
COPY --from=builder /workspace/apps/validator-ui/public ./public
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
