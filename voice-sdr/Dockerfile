# Imagem da Voice SDR para a suíte IA para Executivos: só a tela. O banco e as funções moram no
# projeto Supabase do cliente, instalados pelo painel da StartSe (docs/instalacao.md).
#
# O build é do workspace `app` (Vite), mas o contexto é a pasta inteira: os aliases do
# app/vite.config.ts leem código de supabase/functions/ (a parte portável das funções).
# O runner não tem node_modules: server.mjs usa só `node:*`.

# --- build ------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY app/package.json app/
# Só as dependências do workspace app: as da raiz (PGlite, rolldown, pg) são dos testes e do pacote
# de instalação, não da tela.
RUN npm ci --workspace app --include-workspace-root=false --no-audit --no-fund
COPY app/ app/
COPY supabase/functions/ supabase/functions/
# Opcional: fixa o projeto Supabase na tela. Sem os dois, a tela abre em "Conectar ao seu Supabase" e
# recebe o projeto pelo link do instalador ou pelo formulário. As variáveis VITE_ entram no build.
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
RUN VITE_SUPABASE_URL="$VITE_SUPABASE_URL" VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
    npm run build --workspace app \
    && mkdir -p /app/marcas \
    && if [ -n "$VITE_SUPABASE_URL" ] && [ -n "$VITE_SUPABASE_ANON_KEY" ]; then touch /app/marcas/.projeto-no-build; fi

# --- runner -----------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=10000 \
    HOSTNAME=0.0.0.0 \
    DIST=/app/dist
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/app/dist ./dist
# O marcador diz ao /api/status se o projeto foi fixado no build (a pasta pode estar vazia).
COPY --from=build /app/marcas/ ./
COPY package.json server.mjs ./
USER app
EXPOSE 10000
CMD ["node", "server.mjs"]
