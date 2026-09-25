# Imagem de produção do Next.js (saída standalone). Node 22 Alpine.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache --virtual .native-build-deps build-base cmake git python3 openblas-dev lapack-dev && npm ci && apk del .native-build-deps

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=10000 HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data NODE_OPTIONS=--disable-warning=ExperimentalWarning
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/data && chown app:app /app/data
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER app
# Banco, chave mestra e sessão ChatGPT persistem em /app/data.
VOLUME ["/app/data"]
EXPOSE 10000
CMD ["node", "server.js"]
