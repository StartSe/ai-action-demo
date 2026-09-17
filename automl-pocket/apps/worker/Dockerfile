# Build multi-stage do worker: o builder resolve as deps de ML com uv e a
# imagem final (python slim, sem uv nem caches) só carrega o venv pronto.
# Builder e runner compartilham a mesma base python (bookworm) — o symlink do
# interpretador dentro do venv continua válido após a cópia.

# --- builder ----------------------------------------------------------------
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder
WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Instala dependências antes de copiar o código para aproveitar o cache de camadas
COPY pyproject.toml ./
RUN uv sync --no-dev --no-install-project

COPY . .
RUN uv sync --no-dev

# --- runner -----------------------------------------------------------------
FROM python:3.12-slim-bookworm AS runner
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

# libgomp1: runtime do OpenMP exigido pelo xgboost (ausente na imagem slim)
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app /app

CMD ["/app/.venv/bin/python", "main.py"]
