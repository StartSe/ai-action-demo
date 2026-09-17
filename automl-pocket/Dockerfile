# Imagem única do AutoML para publicação no Render (e para o catálogo IA para Executivos):
# Redis + web (Next standalone) + worker (Python) no mesmo contêiner, orquestrados por start.sh.
# Motivo: no Render um disco pertence a um só serviço, e web e worker precisam do mesmo /app/data
# (SQLite + uploads + modelos). Para desenvolvimento com serviços separados, use o docker-compose.yml.
#
# Tudo é Debian bookworm (glibc): o build do web NÃO pode ser em Alpine, porque o @libsql/client
# traz o binário nativo da plataforma em que foi instalado (musl x gnu).

# --- web-deps ---------------------------------------------------------------
FROM node:22-bookworm-slim AS web-deps
WORKDIR /app/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

# --- web-build --------------------------------------------------------------
FROM node:22-bookworm-slim AS web-build
WORKDIR /app/web
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=web-deps /app/web/node_modules ./node_modules
COPY apps/web/ .
RUN npm run build

# --- worker-build -----------------------------------------------------------
# O venv fica em /app/worker/.venv e é copiado para o MESMO caminho no runner: pyvenv.cfg e os
# shebangs guardam caminhos absolutos, e a base python:3.12 do runner tem o interpretador no mesmo lugar.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS worker-build
WORKDIR /app/worker
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY apps/worker/pyproject.toml ./
RUN uv sync --no-dev --no-install-project
COPY apps/worker/ .
RUN uv sync --no-dev

# --- runner -----------------------------------------------------------------
FROM python:3.12-slim-bookworm AS runner
WORKDIR /app

# redis-server: fila BullMQ local; libgomp1: OpenMP do xgboost; libstdc++6: exigido pelo binário do Node.
RUN apt-get update \
    && apt-get install -y --no-install-recommends redis-server libgomp1 libstdc++6 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node:22-bookworm-slim /usr/local/bin/node /usr/local/bin/node

# web: servidor standalone + estáticos + migrations + dataset de exemplo (mesmo conjunto do apps/web/Dockerfile)
COPY --from=web-build /app/web/.next/standalone ./web/
COPY --from=web-build /app/web/.next/static ./web/.next/static
COPY --from=web-build /app/web/public ./web/public
COPY --from=web-build /app/web/drizzle ./web/drizzle
COPY --from=web-build /app/web/scripts/migrate.mjs ./web/scripts/migrate.mjs
COPY --from=web-build /app/web/seed-assets ./web/seed-assets

# worker: código + venv pronto
COPY --from=worker-build /app/worker ./worker

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Convenções da suíte: porta 10000 e estado em /app/data (um único diretório para montar o disco).
# Um contêiner com 1 vCPU: um treino por vez, um núcleo por treino. Tudo pode ser sobrescrito por env.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data \
    TRAINING_CONCURRENCY=1 \
    MODEL_N_JOBS=1 \
    OMP_NUM_THREADS=1

VOLUME ["/app/data"]
EXPOSE 10000

CMD ["/app/start.sh"]
