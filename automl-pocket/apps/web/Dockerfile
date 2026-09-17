# Build multi-stage do web: produção serve o output standalone do Next
# (só os arquivos traçados pelo build — sem node_modules completo).

# --- deps: instala dependências com cache de camada próprio -----------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build: compila o Next (output: "standalone" no next.config.ts) ---------
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runner: imagem final mínima --------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Servidor standalone + assets estáticos (o server.js serve ambos)
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Migrations do Drizzle + runner (roda antes do servidor). A conta única NÃO é
# criada aqui: com a tabela users vazia, a primeira visita cai em /setup e a
# Server Action completeSetup cria a conta.
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
# Dataset de exemplo, lido em runtime pelo seed do /setup e pelo backfill do
# boot (src/instrumentation.ts) — fora do trace do standalone
COPY --from=build /app/seed-assets ./seed-assets

# Sem USER não-root: o volume de uploads é compartilhado com o worker (root) e
# a exclusão de projetos precisa apagar artefatos criados por ele.

EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
