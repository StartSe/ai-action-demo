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
# Chave pública do Power-Up do Trello desta suíte: com ela o executivo só clica em "Autorizar no
# Trello" e nunca precisa colar uma chave própria (ver lib/integracoes.ts).
ARG TRELLO_API_KEY_APP
# Credenciais OAuth da suíte para o envio de avisos pelo Gmail/Outlook da própria pessoa (US-024):
# embutidas na imagem pela equipe técnica. Sem elas, os botões "Conectar meu Gmail"/"Conectar meu
# Outlook" simplesmente não aparecem em /setup.
ARG GOOGLE_CLIENT_ID_APP
ARG GOOGLE_CLIENT_SECRET_APP
ARG MICROSOFT_CLIENT_ID_APP
ARG MICROSOFT_CLIENT_SECRET_APP
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=10000 HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data NODE_OPTIONS=--disable-warning=ExperimentalWarning \
    TRELLO_API_KEY_APP=${TRELLO_API_KEY_APP} \
    GOOGLE_CLIENT_ID_APP=${GOOGLE_CLIENT_ID_APP} GOOGLE_CLIENT_SECRET_APP=${GOOGLE_CLIENT_SECRET_APP} \
    MICROSOFT_CLIENT_ID_APP=${MICROSOFT_CLIENT_ID_APP} MICROSOFT_CLIENT_SECRET_APP=${MICROSOFT_CLIENT_SECRET_APP}
RUN addgroup -S app && adduser -S app -G app && mkdir -p /app/data && chown app:app /app/data
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/scripts/connect-chatgpt.mjs ./scripts/connect-chatgpt.mjs
USER app
# As chaves configuradas em /setup ficam no SQLite em /app/data. Monte um volume aqui para persistir.
VOLUME ["/app/data"]
EXPOSE 10000
CMD ["node", "server.js"]
