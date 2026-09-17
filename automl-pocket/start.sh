#!/usr/bin/env bash
# Sobe Redis, migrations, web e worker no mesmo contêiner. Se qualquer processo morrer, derruba os
# outros e sai com erro, para o orquestrador (Render, Docker) reiniciar o contêiner inteiro.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/app/data}"
mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/redis"

export SQLITE_PATH="${SQLITE_PATH:-$DATA_DIR/pocket.db}"
export UPLOAD_DIR="${UPLOAD_DIR:-$DATA_DIR/uploads}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
export PORT="${PORT:-10000}"
# Não reaproveita HOSTNAME: o Docker o preenche com o id do contêiner, e o Next escutaria só nesse IP.
export HOSTNAME="${WEB_BIND:-0.0.0.0}"

# AUTH_SECRET: vem do ambiente (Render gera no Blueprint) ou nasce aqui na primeira subida e fica
# em /app/data, para que um `docker run` sem variável nenhuma funcione e as sessões sobrevivam a reinícios.
if [ -z "${AUTH_SECRET:-}" ]; then
  if [ ! -s "$DATA_DIR/auth-secret" ]; then
    umask 077
    head -c 32 /dev/urandom | base64 | tr -d '\n' > "$DATA_DIR/auth-secret"
    umask 022
  fi
  AUTH_SECRET="$(cat "$DATA_DIR/auth-secret")"
  export AUTH_SECRET
fi

# BETTER_AUTH_URL: URL pública. No Render vem pronta em RENDER_EXTERNAL_URL.
if [ -z "${BETTER_AUTH_URL:-}" ]; then
  export BETTER_AUTH_URL="${RENDER_EXTERNAL_URL:-http://localhost:$PORT}"
fi

pids=()
encerrar() {
  trap - TERM INT
  for pid in "${pids[@]}"; do kill -TERM "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap encerrar TERM INT

# Redis local só quando REDIS_URL aponta para o próprio contêiner (um Redis externo continua possível).
case "$REDIS_URL" in
  redis://127.0.0.1*|redis://localhost*)
    redis-server --bind 127.0.0.1 --port 6379 --appendonly yes --dir "$DATA_DIR/redis" \
      --maxmemory-policy noeviction --save "" --daemonize no --loglevel warning &
    pids+=("$!")
    for _ in $(seq 1 60); do
      redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1 && break
      sleep 0.5
    done
    redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1 || { echo "start.sh: redis não respondeu" >&2; exit 1; }
    ;;
esac

# Migrations antes de qualquer processo abrir o SQLite (o worker nunca migra; ver apps/worker/main.py).
cd /app/web
node scripts/migrate.mjs

node server.js &
pids+=("$!")

( cd /app/worker && exec /app/worker/.venv/bin/python main.py ) &
pids+=("$!")

# Primeiro processo a terminar encerra os demais; o código de saída é o dele.
set +e
wait -n "${pids[@]}"
codigo=$?
set -e
echo "start.sh: um processo terminou (código $codigo); encerrando os demais" >&2
encerrar
exit "$codigo"
