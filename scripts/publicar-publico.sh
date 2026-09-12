#!/usr/bin/env bash
# Publica a pasta publico/ no repositório público: cada subpasta vira um branch com um único commit
# (main = página e Blueprint da suíte; deploy-<app> = Blueprint de um app). Sempre sobrescreve.
# Uso: scripts/publicar-publico.sh <url-do-repo> [mensagem]
#   Local:  scripts/publicar-publico.sh https://github.com/StartSe/ai-action-app-deploy.git
#   Actions: com a variável CHAVE_SSH (chave privada do deploy key) e URL git@github.com:...
set -euo pipefail
REPO="${1:?Informe a URL do repositório público}"
MENSAGEM="${2:-Atualiza a partir de ${GITHUB_REPOSITORY:-local}@${GITHUB_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo manual)}}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
[ -d "$RAIZ/publico" ] || { echo "Rode antes: node scripts/gerar-deploy.mjs"; exit 1; }

if [ -n "${CHAVE_SSH:-}" ]; then
  CHAVE="$(mktemp)"; printf '%s\n' "$CHAVE_SSH" > "$CHAVE"; chmod 600 "$CHAVE"
  export GIT_SSH_COMMAND="ssh -i $CHAVE -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  trap 'rm -f "$CHAVE"' EXIT
fi

for dir in "$RAIZ"/publico/*/; do
  branch="$(basename "$dir")"
  tmp="$(mktemp -d)"
  cp -R "$dir". "$tmp"/
  git -C "$tmp" init -q -b "$branch"
  git -C "$tmp" add -A
  git -C "$tmp" -c user.name="GitHub Actions" -c user.email="actions@github.com" commit -q -m "$MENSAGEM"
  git -C "$tmp" push -q -f "$REPO" "$branch:$branch"
  rm -rf "$tmp"
  echo "publicado: $branch"
done
