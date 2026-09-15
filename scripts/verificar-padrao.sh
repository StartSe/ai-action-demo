#!/usr/bin/env bash
# Compara os arquivos compartilhados de cada app com a fonte da verdade (pdi-time) e lista o que diverge.
# Uso: scripts/verificar-padrao.sh
# Saída: código 1 e lista das divergências: código 0 quando todos os apps estão iguais a pdi-time.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
FONTE="pdi-time"
APPS=(agente-kanban contratos-ia entrevista-ia financas-ia posts-sociais prospeccao-ia reunioes-ia voz-do-cliente whatsapp-atendente radar-sinais bussola-ia simulador-vendas custos-ia clone-site prospeccao-linkedin)

# Lista de arquivos/pastas comparados entre pdi-time e cada app. Estenda aqui quando um novo
# arquivo compartilhado nascer em pdi-time e precisar ser replicado sem alteração nos outros.
# app/api/f/[token]/route.ts fica de fora de propósito: por design (ver o comentário no topo do
# próprio arquivo) cada app pode precisar importar seu próprio módulo ali, então ele nunca é
# idêntico entre todos os apps — só lib/formularios.ts e app/f/** (a UI pública) são compartilhados.
ARQUIVOS=(
  "components/ui.tsx"
  "components/setup.tsx"
  "lib/ai.ts"
  "lib/store.ts"
  "lib/setup-comum.ts"
  "lib/historico.ts"
  "lib/mcp.ts"
  "lib/mcp-cliente.ts"
  "lib/mcp-oauth.ts"
  "lib/formularios.ts"
  "lib/notificacoes.ts"
  "lib/rotinas.ts"
  "app/mcp"
  "app/f"
  "app/api/rotinas"
  "app/api/setup"
  "app/r"
  "app/imprimir"
  "app/globals.css"
  "proxy.ts"
)

# app/globals.css só é comparado até esta linha: o que vem depois é específico de cada app.
MARCADOR="/* Específico deste app */"

conteudo_comparavel() {
  local arquivo="$1"
  if [ ! -e "$arquivo" ]; then
    return
  fi
  if grep -qF "$MARCADOR" "$arquivo"; then
    awk -v m="$MARCADOR" 'index($0, m) { exit } { print }' "$arquivo"
  else
    cat "$arquivo"
  fi
}

divergiu=0

for app in "${APPS[@]}"; do
  echo "== $app =="
  algum=0
  for relativo in "${ARQUIVOS[@]}"; do
    origem="$RAIZ/$FONTE/$relativo"
    destino="$RAIZ/$app/$relativo"

    if [ ! -e "$origem" ] && [ ! -e "$destino" ]; then
      continue
    fi

    if [ "$relativo" = "app/globals.css" ]; then
      if ! diff -q <(conteudo_comparavel "$origem") <(conteudo_comparavel "$destino") > /dev/null; then
        echo "  diverge: $relativo"
        divergiu=1
        algum=1
      fi
    elif [ ! -e "$destino" ]; then
      echo "  ausente: $relativo"
      divergiu=1
      algum=1
    elif ! diff -rq "$origem" "$destino" > /dev/null 2>&1; then
      echo "  diverge: $relativo"
      divergiu=1
      algum=1
    fi
  done
  [ "$algum" = "0" ] && echo "  ok"
done

exit $divergiu
