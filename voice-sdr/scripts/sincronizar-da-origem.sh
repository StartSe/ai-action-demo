#!/usr/bin/env bash
# Recopia a Voice SDR do repositório de origem (StartSe/toolkit-sarah-voice-sdr) para esta pasta.
#
# Uso: voice-sdr/scripts/sincronizar-da-origem.sh [caminho-da-origem] [ref]
#   caminho-da-origem  clone local da Voice SDR (padrão: ../toolkit-sarah-voice-sdr, irmão deste repositório)
#   ref                branch, tag ou commit a copiar (padrão: main)
#
# O que entra: só os arquivos versionados no ref (`git archive`), então node_modules, dist, .env,
# .claude, .vitest e worktrees nunca vêm junto. O estado do Ralph (prd*.json, progress.txt) fica de
# fora: é processo da origem, não produto.
#
# O que a suíte mantém e a sincronização não toca (lista PROPRIOS abaixo): Dockerfile, servidor,
# README no formato da suíte, CHANGELOG, render.yaml gerado por scripts/gerar-deploy.mjs, compose,
# ORIGEM.md, este script e o teste que substitui o do Blueprint de site estático. A versão
# (`version` do package.json e do package-lock.json) também é preservada: quem versiona aqui é a suíte.
#
# Atenção: desde a primeira cópia o desenvolvimento pode acontecer nesta pasta (ORIGEM.md). Rodar
# este script depois disso sobrescreve o que mudou aqui fora da lista PROPRIOS. Confira o
# `git diff` antes de commitar.
set -euo pipefail

PASTA="$(cd "$(dirname "$0")/.." && pwd)"
ORIGEM="${1:-$(cd "$PASTA/../.." && pwd)/toolkit-sarah-voice-sdr}"
REF="${2:-main}"

PROPRIOS=(
  "README.md"
  "ORIGEM.md"
  "CHANGELOG.md"
  "Dockerfile"
  ".dockerignore"
  "server.mjs"
  "render.yaml"
  "docker-compose.yml"
  ".env.example"
  "scripts/sincronizar-da-origem.sh"
  "testes/estatica/imagem-da-suite.test.ts"
)

# Da origem, o que a suíte substitui: o Blueprint de site estático (aqui a publicação é por imagem),
# o README (vira docs/desenvolvimento.md) e o teste que conferia aquele Blueprint.
SUBSTITUIDOS=(
  "render.yaml"
  "testes/estatica/blueprint-do-render.test.ts"
)

if ! git -C "$ORIGEM" rev-parse --git-dir > /dev/null 2>&1; then
  echo "Origem não é um repositório git: $ORIGEM" >&2
  exit 1
fi
COMMIT="$(git -C "$ORIGEM" rev-parse --verify "$REF^{commit}")"
echo "Copiando $ORIGEM @ $REF ($COMMIT)"

TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
git -C "$ORIGEM" archive --format=tar "$COMMIT" | tar -x -C "$TEMP"

rm -f "$TEMP"/prd*.json "$TEMP/progress.txt" "$TEMP/.ralph-session"
for caminho in "${SUBSTITUIDOS[@]}"; do rm -f "$TEMP/$caminho"; done
mkdir -p "$TEMP/docs"
mv "$TEMP/README.md" "$TEMP/docs/desenvolvimento.md"

VERSAO=""
if [ -f "$PASTA/package.json" ]; then
  VERSAO="$(node -p 'require(process.argv[1]).version' "$PASTA/package.json")"
fi

EXCLUIR=(--exclude "node_modules/" --exclude "app/dist/" --exclude ".vitest/")
for caminho in "${PROPRIOS[@]}"; do EXCLUIR+=(--exclude "/$caminho"); done
rsync -a --delete "${EXCLUIR[@]}" "$TEMP/" "$PASTA/"

if [ -n "$VERSAO" ]; then
  node -e '
    const fs = require("node:fs");
    const [pasta, versao] = process.argv.slice(1);
    for (const nome of ["package.json", "package-lock.json"]) {
      const arquivo = `${pasta}/${nome}`;
      const json = JSON.parse(fs.readFileSync(arquivo, "utf8"));
      json.version = versao;
      if (json.packages?.[""]) json.packages[""].version = versao;
      fs.writeFileSync(arquivo, JSON.stringify(json, null, 2) + "\n");
    }' "$PASTA" "$VERSAO"
fi

if [ -f "$PASTA/ORIGEM.md" ]; then
  DATA="$(date +%Y-%m-%d)"
  node -e '
    const fs = require("node:fs");
    const [arquivo, commit, ref, data] = process.argv.slice(1);
    const texto = fs.readFileSync(arquivo, "utf8")
      .replace(/^- Commit: .*$/m, `- Commit: \`${commit}\``)
      .replace(/^- Ref: .*$/m, `- Ref: \`${ref}\``)
      .replace(/^- Copiado em: .*$/m, `- Copiado em: ${data}`);
    fs.writeFileSync(arquivo, texto);' "$PASTA/ORIGEM.md" "$COMMIT" "$REF" "$DATA"
fi

echo "Pronto. Versão preservada: ${VERSAO:-nenhuma}. Confira com: git -C \"$PASTA\" status --short ."
