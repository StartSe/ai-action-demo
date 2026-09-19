# Imagem de produção do Next.js (saída standalone). Node 22 Debian para as bibliotecas de áudio do LiveKit.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
# Credenciais OAuth da suíte para o envio de avisos pelo Gmail/Outlook da própria pessoa (US-024):
# embutidas na imagem pela equipe técnica. Sem elas, os botões "Conectar meu Gmail"/"Conectar meu
# Outlook" simplesmente não aparecem em /setup.
ARG GOOGLE_CLIENT_ID_APP
ARG GOOGLE_CLIENT_SECRET_APP
ARG MICROSOFT_CLIENT_ID_APP
ARG MICROSOFT_CLIENT_SECRET_APP
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=10000 HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data NODE_OPTIONS=--disable-warning=ExperimentalWarning \
    GOOGLE_CLIENT_ID_APP=${GOOGLE_CLIENT_ID_APP} GOOGLE_CLIENT_SECRET_APP=${GOOGLE_CLIENT_SECRET_APP} \
    MICROSOFT_CLIENT_ID_APP=${MICROSOFT_CLIENT_ID_APP} MICROSOFT_CLIENT_SECRET_APP=${MICROSOFT_CLIENT_SECRET_APP}
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libgomp1 && rm -rf /var/lib/apt/lists/*
RUN groupadd --system app && useradd --system --gid app --create-home app && mkdir -p /app/data && chown app:app /app/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/agents ./agents
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/lib ./lib
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER app
# As chaves configuradas em /setup ficam no SQLite em /app/data. Monte um volume aqui para persistir.
VOLUME ["/app/data"]
EXPOSE 10000
CMD ["node", "--import", "tsx", "scripts/servico.ts"]
