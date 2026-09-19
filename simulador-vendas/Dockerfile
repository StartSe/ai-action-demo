# Debian suporta as bibliotecas nativas de áudio do LiveKit.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=10000 HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data NODE_OPTIONS=--disable-warning=ExperimentalWarning
RUN mkdir -p /app/data && chown node:node /app/data
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/agent ./agent
COPY --from=build /app/lib ./lib
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/scripts/iniciar-producao.mjs ./scripts/iniciar-producao.mjs
USER node
VOLUME ["/app/data"]
EXPOSE 10000
CMD ["node", "scripts/iniciar-producao.mjs"]
