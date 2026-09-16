# Imagem de produção do Next.js (saída standalone). Node 22 Alpine.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
# Credenciais OAuth da suíte (US-024 no pdi-time, US-036 aqui): embutidas na imagem pela equipe técnica,
# mesmo espírito de TRELLO_API_KEY_APP (agente-kanban). Com elas, o cartão do Gmail/Outlook em /setup
# mostra só "Conectar o Gmail"/"Conectar o Outlook" e o executivo não cria projeto no Google Cloud nem
# registro no Entra. Sem elas, o cartão cai no passo a passo de "Para a equipe técnica".
ARG GOOGLE_CLIENT_ID_APP
ARG GOOGLE_CLIENT_SECRET_APP
ARG MICROSOFT_CLIENT_ID_APP
ARG MICROSOFT_CLIENT_SECRET_APP
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=10000 HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data NODE_OPTIONS=--disable-warning=ExperimentalWarning \
    GOOGLE_CLIENT_ID_APP=${GOOGLE_CLIENT_ID_APP} GOOGLE_CLIENT_SECRET_APP=${GOOGLE_CLIENT_SECRET_APP} \
    MICROSOFT_CLIENT_ID_APP=${MICROSOFT_CLIENT_ID_APP} MICROSOFT_CLIENT_SECRET_APP=${MICROSOFT_CLIENT_SECRET_APP}
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/data && chown app:app /app/data
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER app
# As chaves configuradas em /setup ficam no SQLite em /app/data. Monte um volume aqui para persistir.
VOLUME ["/app/data"]
EXPOSE 10000
CMD ["node", "server.js"]
