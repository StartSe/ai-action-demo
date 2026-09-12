#!/usr/bin/env bash
# Fallback manual: constrói e publica as imagens dos 10 apps no GHCR a partir desta máquina.
# No dia a dia isso é feito pelo GitHub Actions (.github/workflows/publicar.yml) a cada push na main.
# Uso: ./build-and-push.sh [registro] [tag]      ex.: ./build-and-push.sh ghcr.io/startse latest
# Requer: docker login ghcr.io (token do GitHub com escopo write:packages).
set -euo pipefail
REGISTRO="${1:-ghcr.io/startse}"
TAG="${2:-latest}"
cd "$(dirname "$0")"
for app in $(node -e 'console.log(require("./catalogo.json").apps.map(a=>a.id).join(" "))'); do
  echo "==> $app"
  docker build --platform linux/amd64 -t "$REGISTRO/$app:$TAG" "./$app"
  docker push "$REGISTRO/$app:$TAG"
  docker builder prune -f >/dev/null   # evita esgotar o disco entre builds
done
echo "Imagens publicadas em $REGISTRO/<app>:$TAG"
