#!/usr/bin/env bash
# Compara os arquivos compartilhados de cada app com a fonte da verdade (pdi-time) e lista o que diverge.
# Uso: scripts/verificar-padrao.sh [app-id]
# Saída: código 1 e lista das divergências; código 0 quando todos os apps estão iguais a pdi-time.
#
# A lista de apps vem de catalogo.json (fonte única da suíte): um app novo entra aqui assim que ganha a
# sua entrada no catálogo, sem precisar editar este script.
#
# O que conta como divergência: um arquivo compartilhado ausente no app ou com conteúdo diferente do de
# pdi-time. Arquivos a mais dentro de uma pasta compartilhada (ex.: app/api/setup/oauth/google no
# custos-ia, app/api/setup/oauth/trello no agente-kanban) são acréscimos próprios do app e não contam.
# Divergências que um app precisa ter de propósito ficam registradas, com o motivo, em
# scripts/padrao-excecoes.json ({ "<app>": { "<caminho>": "<motivo>" } }) e são listadas como aceitas.
#
# Dois níveis de comparação, porque nem todo arquivo compartilhado é infraestrutura:
#   INFRA           conta, banco, IA, MCP, rotinas, formulários, proxy, assets. Vale para TODO app,
#                   sempre, inclusive os independentes: é o que mantém a suíte consertável em um lugar só.
#   CAMADA_PRODUTO  a camada visual e de navegação (components/ui.tsx, components/setup.tsx,
#                   components/conta.tsx, lib/navegacao.ts, lib/ilustracao.ts, app/globals.css). Um app
#                   com "independente": true no catalogo.json passa a ser dono dela — telas próprias
#                   demais para caber no molde de tela única do pdi-time — e estes arquivos deixam de
#                   ser comparados NELE (continuam comparados em todos os outros).
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
FONTE="pdi-time"
EXCECOES="$RAIZ/scripts/padrao-excecoes.json"

# Apps com "padrao": "proprio" no catálogo (ex.: automl-pocket, web + worker Python) não seguem o padrão e ficam de fora.
APPS=($(node -e 'console.log(require(process.argv[1]).apps.filter((a) => a.padrao !== "proprio").map((a) => a.id).filter((id) => id !== process.argv[2]).join("\n"))' "$RAIZ/catalogo.json" "$FONTE"))
if [ "${1:-}" != "" ]; then
  APPS=("$1")
fi

# Apps com "independente": true no catálogo: donos da própria camada visual (ver o cabeçalho).
INDEPENDENTES=" $(node -e 'console.log(require(process.argv[1]).apps.filter((a) => a.independente).map((a) => a.id).join(" "))' "$RAIZ/catalogo.json") "

e_independente() {
  case "$INDEPENDENTES" in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

# Lista de arquivos/pastas comparados entre pdi-time e cada app (pastas são percorridas arquivo a
# arquivo). Estenda aqui quando um novo arquivo compartilhado nascer em pdi-time e precisar ser
# replicado sem alteração nos outros. app/api/setup cobre também app/api/setup/oauth/mcp/** (início e
# retorno do OAuth de servidores MCP, par de lib/mcp-oauth.ts).
# app/api/f/[token]/route.ts fica de fora de propósito: por design (ver o comentário no topo do
# próprio arquivo) cada app pode precisar importar seu próprio módulo ali, então ele nunca é
# idêntico entre todos os apps — só lib/formularios.ts e app/f/** (a UI pública) são compartilhados.
INFRA=(
  "lib/ai.ts"
  "lib/store.ts"
  "lib/conta.ts"
  "lib/conta-comum.ts"
  "lib/modelos.ts"
  "lib/setup-comum.ts"
  "lib/historico.ts"
  "lib/mcp.ts"
  "lib/mcp-cliente.ts"
  "lib/mcp-oauth.ts"
  "lib/formularios.ts"
  "lib/notificacoes.ts"
  "lib/email-envio.ts"
  "lib/rotinas.ts"
  "app/mcp"
  "app/f"
  "app/api/rotinas"
  "app/api/setup"
  "app/api/status"
  "app/api/conta"
  "app/api/historico"
  "proxy.ts"
  "public/ilustracoes/icones"
  "eslint.config.mjs"
)

# A camada visual e de navegação: comparada em todo app, menos nos independentes (ver o cabeçalho).
CAMADA_PRODUTO=(
  "components/ui.tsx"
  "components/setup.tsx"
  "components/conta.tsx"
  "lib/navegacao.ts"
  "lib/ilustracao.ts"
  "app/globals.css"
)

# Estrutura que todo app precisa ter, mas cujo conteúdo é próprio de cada um (renderiza o domínio do
# app: tipo do registro, componente de resultado, título da impressão; em app/conta, app/entrar e
# app/historico, a marca, o nome e a área do app passados a TelaCriarConta/TelaEntrar/Topbar). Só a
# existência é conferida.
ESTRUTURA=(
  "app/conta/page.tsx"
  "app/entrar/page.tsx"
  "app/historico/page.tsx"
  "app/r/[id]/page.tsx"
  "app/r/[id]/not-found.tsx"
  "app/imprimir/[id]/page.tsx"
  "app/imprimir/[id]/not-found.tsx"
)

# app/globals.css só é comparado até esta linha: o que vem depois é específico de cada app.
MARCADOR="/* Específico deste app */"

# Devolve o conteúdo comparável de um arquivo: em app/globals.css, tira o trecho específico do app e as
# quatro cores de acento (a única personalização permitida no @theme, ver PADRAO.md e
# tasks/paleta-segmentos.json).
conteudo_comparavel() {
  local arquivo="$1"
  if [ ! -e "$arquivo" ]; then
    return
  fi
  if grep -qF "$MARCADOR" "$arquivo"; then
    awk -v m="$MARCADOR" 'index($0, m) { exit } { print }' "$arquivo"
  else
    cat "$arquivo"
  fi | grep -v -E '^[[:space:]]*--color-accent(-2|-soft|-ink)?:' || true
}

# Lista "app<TAB>caminho<TAB>motivo" das exceções registradas.
excecoes_lista=""
if [ -f "$EXCECOES" ]; then
  excecoes_lista="$(node -e '
    const ex = require(process.argv[1]);
    for (const [app, arquivos] of Object.entries(ex)) {
      for (const [caminho, motivo] of Object.entries(arquivos)) console.log([app, caminho, motivo].join("\t"));
    }' "$EXCECOES")"
fi

motivo_excecao() {
  local app="$1" relativo="$2"
  printf '%s\n' "$excecoes_lista" | awk -F'\t' -v a="$app" -v c="$relativo" '$1 == a && $2 == c { print $3; exit }'
}

# Compara um único arquivo (caminho relativo à raiz do app). Imprime a divergência e devolve 1 se houver.
comparar_arquivo() {
  local app="$1" relativo="$2"
  local origem="$RAIZ/$FONTE/$relativo"
  local destino="$RAIZ/$app/$relativo"
  local motivo
  motivo="$(motivo_excecao "$app" "$relativo")"

  if [ ! -e "$destino" ]; then
    echo "  ausente: $relativo"
    return 1
  fi

  local iguais=0
  if [ "$relativo" = "app/globals.css" ]; then
    diff -q <(conteudo_comparavel "$origem") <(conteudo_comparavel "$destino") > /dev/null && iguais=1
  else
    cmp -s "$origem" "$destino" && iguais=1
  fi

  if [ "$iguais" = "1" ]; then
    if [ -n "$motivo" ]; then
      echo "  exceção sem uso (o arquivo já é igual; remova de scripts/padrao-excecoes.json): $relativo"
      return 1
    fi
    return 0
  fi
  if [ -n "$motivo" ]; then
    echo "  divergência aceita: $relativo ($motivo)"
    return 0
  fi
  echo "  diverge: $relativo"
  return 1
}

divergiu=0

for app in "${APPS[@]}"; do
  echo "== $app =="
  algum=0
  comparados=("${INFRA[@]}")
  if e_independente "$app"; then
    echo "  independente: camada visual própria (components/ui.tsx, components/setup.tsx, components/conta.tsx, lib/navegacao.ts, lib/ilustracao.ts, app/globals.css não são comparados); INFRA e ESTRUTURA conferidas normalmente"
  else
    comparados+=("${CAMADA_PRODUTO[@]}")
  fi
  for relativo in "${comparados[@]}"; do
    origem="$RAIZ/$FONTE/$relativo"
    if [ ! -e "$origem" ]; then
      echo "  não existe em $FONTE (corrija a lista INFRA/CAMADA_PRODUTO): $relativo"
      divergiu=1
      algum=1
      continue
    fi
    if [ -d "$origem" ]; then
      while IFS= read -r arquivo; do
        rel="${arquivo#"$RAIZ/$FONTE/"}"
        comparar_arquivo "$app" "$rel" || { divergiu=1; algum=1; }
      done < <(find "$origem" -type f | sort)
    else
      comparar_arquivo "$app" "$relativo" || { divergiu=1; algum=1; }
    fi
  done
  for relativo in "${ESTRUTURA[@]}"; do
    if [ ! -e "$RAIZ/$app/$relativo" ]; then
      echo "  ausente (estrutura obrigatória, conteúdo próprio do app): $relativo"
      divergiu=1
      algum=1
    fi
  done
  [ "$algum" = "0" ] && echo "  ok"
done

echo "== paleta =="
if ! node "$RAIZ/scripts/verificar-paleta.mjs"; then
  divergiu=1
fi

exit $divergiu
