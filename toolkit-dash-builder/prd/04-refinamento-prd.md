# Fase 5 — Refinamento do PRD `toolkit-dash-builder` (v1 → v1.1)

| | |
|---|---|
| Documento refinado | [`01-prd.md`](01-prd.md), agora **v1.1 — refinado após validação (2026-09-21)**, 2.426 linhas (era 2.002) |
| Ordem de trabalho | [`03-validacao-prd.md`](03-validacao-prd.md): 21 achados (3 bloqueantes, 5 altos, 9 médios, 4 baixos) + respostas recomendadas para P1–P6 |
| Modelo | Claude Fable 5.1 |
| Data | 2026-09-21 |
| Método | Cada achado foi **reconferido contra o arquivo de referência** antes de ser aplicado (`pdi-time/lib/ilustracao.ts`, `scripts/verificar-padrao.sh`, `pdi-time/components/ui.tsx`, `pdi-time/lib/ai.ts`, `pdi-time/lib/historico.ts`, `pdi-time/lib/formato.ts`, `pdi-time/lib/ferramentas.ts`, `pdi-time/Dockerfile`, `pdi-time/app/globals.css`, `PADRAO.md`, `catalogo.json`, `tasks/paleta-segmentos.json`, `.github/workflows/publicar.yml`). O que estava certo foi aplicado em edições pontuais, sem renumerar seções; o que estava errado ficou de fora, com o motivo abaixo |

**Resultado:** 20 achados aplicados por inteiro, 1 aplicado parcialmente (achado 20: um sub-item
estava errado). Por severidade: bloqueantes 3/3 · altos 5/5 · médios 9/9 · baixos 4/4 (um deles com
um sub-item recusado). Nenhum achado inteiro foi recusado.

---

## Achado a achado

Formato: nº · severidade · **decisão** · seções do PRD alteradas.

| Nº | Sev. | Decisão | Seções alteradas | Nota |
|---|---|---|---|---|
| 1 | bloqueante | **aplicado** | 7.1 (árvore: `app/api/setup/**`), 10 Etapa 1 | Reconferido: `verificar-padrao.sh:66` lista `app/api/setup` inteira como INFRA e `:151-154` devolve "ausente" antes das exceções. As três pastas `oauth/*` ficam. |
| 2 | bloqueante | **aplicado** | 7.1 (`package.json`), 10 Etapa 1 | Reconferido: `pdi-time/lib/notificacoes.ts:105` faz `await import("nodemailer")`; `package.json` só troca o `name`. |
| 3 | bloqueante | **aplicado** | cabeçalho, 7.1 (`setup/page.tsx`), 7.9, 8.1 (`Hero`), 8.4 (parágrafo novo), 10 Etapas 1/6/10, 11 (P3, H15) | Reconferido: `Segmento` em `lib/ilustracao.ts:6-14` não tem "Dados"; precedente `agente-kanban`/`reunioes-ia` com `segmento="Gestão"`. "Dados" fica só na paleta. |
| 4 | alta | **aplicado** | 2 (M3, M4), RF-05 a2, RF-06 a4, 6 (nota `askJSON`), 7.2 (`gerarPainel` com código), 7.5, 10 Etapa 5, 11 (H17) | Reconferido: `lib/ai.ts:225-242` só repete no erro de *parse*. Segunda tentativa própria abaixo de 5 componentes; erro só abaixo de 3. |
| 5 | alta | **aplicado** | RF-14 a2/a4/a5, 7.1 (componentes), 7.8 (CSS + tabela de impressão), 8.2 (tabela e regras comuns), 10 Etapas 3/9, 11 (H19) | Reconferido: `globals.css:84-93` não tem `print-color-adjust`; `DataTable` usa `max-md:hidden` na `<table>`. Barras e meta como `<rect>` SVG; `<table>` próprio em modo impressão, largura total. |
| 6 | alta | **aplicado** | RF-02 (os oito textos, a1–a4), RF-03 (texto, a4, a5), RF-04 a8, 10 Etapas 6/7 | Reconferido: `publicar.yml:110-121` captura `/?exemplo=1&captura=1` com `--force-prefers-reduced-motion` e `--virtual-time-budget=8000`. Os oito textos propostos entraram palavra por palavra; `?exemplo=1` não passa pelo gate; fluxo de captura descrito de forma determinística. |
| 7 | alta | **aplicado** | 2 (M9), 3 (jornada 10), RF-05 a3/a7, RF-12 a5/a6, RF-13 a2, 5.1 (`refinadoEm?`), 7.1, 7.2 (`forcar`, refinar), 7.3, 8.1, 10 Etapas 5/8, 11 (H18) | Reconferido: `historico.ts:75-78` sobrescreve só `saida`. "Gerar outra versão" com `forcar: true`; painel refinado excluído do cache por `refinadoEm`. |
| 8 | alta | **aplicado** | 5.3 (quatro linhas novas), RF-09 a10, RF-11 a6, 6.3, 7.2 (refinar, observações, esclarecer, resumo), 11 (H17) | `maxTokens` 8.000 / 8.000 / 1.200 / 600. Nota de medir tokens reais na Etapa 5 incluída. |
| 9 | média | **aplicado** | 3 (jornada 10), RF-10 a4, RF-13 (texto, a1, a2), RF-18 a1, 7.1 (`[id]/route.ts`), 7.2 (`PUT /api/painel/[id]`), 7.5 (snippet), 7.6, 7.8, 10 Etapa 8, 11 (H14) | Salvar sempre na geração (padrão `pdi-time`, `SENSIVEL = false`); `guardar` só no MCP; Desfazer persiste por `PUT`. |
| 10 | média | **aplicado** | RF-04 (texto, a1, a2, a8), 6.3 (heurística reescrita), 10 Etapa 7 | Radicais distintos com fronteira de palavra; radicais de até 3 letras (`rh`, `nps`, `dia`, `mes`) casam só a palavra inteira ou o plural, para "mesa"/"diante" não contarem. Regra "< 30 caracteres ou < 3 radicais → IA". |
| 11 | média | **aplicado** | 5.1 (`TipoComponente`, `componentesAlterados`), 6.1 ("SETE", exemplo de `linha` com 6 pontos), 6.2 (regra 8, exemplo), RF-08 a1, 7.4, 10 Etapa 4 | "Sete tipos, seis renderizadores"; `"NOVO"` apagado; exemplo Jan–Jun; destino do indicador acrescentado definido. |
| 12 | média | **aplicado** | RF-06 a6, RF-09 a1/a2/a6, 6.2 (`validarRefinamento` reescrito, `igual`, `ordenarChaves`, `semIdentidade`, `moviveis`), 10 Etapa 8 | `igual` definida; renome de id desfeito; sumidos reinseridos no índice original; reempacotamento só de declarados/novos. |
| 13 | média | **aplicado** | RF-16 a2, RF-20 a4, 10 Etapa 6 | Reconferido: `grep DemoNotice pdi-time/components/ui.tsx` → nada; `Topbar` tem `resumo` (`ui.tsx:60,115-123`). PRD agora diz explicitamente para não criar um `DemoNotice`. |
| 14 | média | **aplicado** | RF-08 a7, 8.2 (`TabelaPainel`), 8.3 (`formatarData`), 10 Etapas 2/9 | Reconferido: `formato.ts:10` faz `new Date(string)`. `T00:00:00` para hora local; valor fora do formato sai como texto. |
| 15 | média | **aplicado** | 8.2 (`GraficoSerie`, regras comuns), 7.1 | SVG só com geometria (`preserveAspectRatio="none"`, `vector-effect="non-scaling-stroke"`), texto em HTML, sem `<circle>` por ponto; funciona em Server Component. |
| 16 | média | **aplicado** | 5.1, 5.3, RF-06 a7, 6.1, 7.1, 7.4, 8.2 (`GraficoRosca`), 10 Etapas 2/4, 11 (P5, H16) | 6 fatias no máximo (excedente em "Outros"), degraus 100/88/76/64/52/40, legenda com valor e percentual. |
| 17 | média | **aplicado** | 3 (jornada 6), 5.3, RF-05 a6, RF-07 a1/a4, RF-09 a9, RF-11 a6, RF-20 a4, 7.5, 10 Etapa 6 | `AbortController` no cliente (120/90/45 s) com a mensagem proposta; quarta etapa do `Loading` é a frase de espera longa; a primeira faz sentido sozinha (reduced motion). |
| 18 | baixa | **aplicado** | 7.1 (`Rotinas.tsx`, `notificacoes-do-app.ts`), 7.7 | Reconferido: `videos-campanha` não tem `components/Rotinas.tsx`; só arquivos próprios do `pdi-time` importam `notificacoes-do-app`. |
| 19 | baixa | **aplicado** | 5.2 (`LARGURA_CLASSE`), 10 Etapa 2 | Mapa estático de classes de largura. |
| 20 | baixa | **aplicado parcialmente** | 2 (M4), RF-05 a3/a5, 5.2 (linhas acrescentadas), 7.5 ("Tentar de novo", itálico acima), 7.6 (esqueleto de `FERRAMENTAS`, filtro `tipo === "painel"`), RF-18 a3, RF-07 a4 (`Loading` e reduced motion), 8.1 (`Passos` com `apoio`, "Tentar de novo"), 10 Etapa 1 (`verificar-padrao.sh` é bash) | **Não aplicado o sub-item das citações:** o achado pede trocar `PADRAO.md:79` → `:78` e `PADRAO.md:35` → `:34`, mas no arquivo real (`git log` não mostra alteração recente) a regra do MCP "Por app" **está** na linha 79 e a fórmula do `acento2` **está** na linha 35 (`grep -n "Por app\|é derivado do" PADRAO.md`). As citações do PRD já estavam corretas e ficaram como estavam. Todos os outros nove sub-itens foram aplicados. |
| 21 | baixa | **aplicado** | 7.1 (`Dockerfile`, `.env.example`, `docker-compose.yml`), 9.5, 10 Etapa 1 | Reconferido: `pdi-time/Dockerfile:19-22` tem os quatro `ARG`; `email-envio.ts:31` lê `GOOGLE_CLIENT_ID_APP` e sem valor esconde os botões. `Dockerfile` e `.env.example` idênticos. |

**Correções extras encontradas no caminho** (não estavam no 03, mas apareceram ao aplicar os achados):
- RF-11 chamava a rota de `POST /api/painel/insights`; a seção 7.2 e a árvore 7.1 sempre disseram
  `observacoes`. Uniformizado para `POST /api/painel/observacoes`.
- O snippet de 7.5 passava `{ guardar }` para `gerarPainel` na rota HTTP; agora passa `{ forcar }`,
  coerente com o achado 9 (a rota salva sempre) e o 7 (`forcar`).
- Sugestão fora do PRD, herdada do 03 e mantida: `PADRAO.md:25,28,52` ainda cita `DemoNotice`, que
  não existe em `ui.tsx`; e `docker-compose.yml:2` da raiz diz "3001 a 3018". A Etapa 1 do PRD já
  manda corrigir o comentário do compose ao acrescentar o serviço; o `PADRAO.md` fica para a suíte.

---

## Fechamento das perguntas P1–P6

| # | Decisão (registrada na seção 11 do PRD) | Onde mais aparece |
|---|---|---|
| **P1** | Id **`toolkit-dash-builder`** (custo de mudar é alto; não aparece na tela). Nome de exibição **"Painel Pronto"**, no lugar de "Painel em Minutos" — o catálogo já tem "Posts em Minutos" (`catalogo.json:76`) e dois "X em Minutos" soariam como uma família que não existe. `marca="P"` mantida. **É a única decisão humana ainda pendente: Renato confirma o nome antes do primeiro push.** Trocar depois custa só `nome` no catálogo, `metadata.title`, `nome` da `SetupPage`/`Topbar` e `README.md`. | cabeçalho, 7.1, 7.9, 9.2, histórico de revisões |
| **P2** | Áreas **`["Dados", "Gestão"]`** e os textos de 9.2 (ajustados ao nome novo). "Dados" já é área do catálogo (`automl-pocket`). | 9.2 |
| **P3** | Segmento **"Dados" na paleta aprovado** (`verificar-paleta.mjs` não tem lista fixa; ΔE 48,3). Nos componentes, **`segmento="Gestão"`** (tipo `Segmento` de `lib/ilustracao.ts`, sem ilustração de pessoa). Distinção documentada em 8.4 e destinada ao `CLAUDE.md` do app. | cabeçalho, 7.1, 7.9, 8.1, 8.4, H15 |
| **P4** | **Tela única, sem `independente: true`.** `Workspace`/`Panel`/`Stage` em `vazio`, `esclarecendo`, `carregando` e `erro`; `<main>` próprio de largura total em `pronto`. O padrão não compara `app/page.tsx`; precedente em `financas-ia`. | 8.1, Etapa 10 |
| **P5** | **`pizza`/`rosca` ficam na v1**, com máximo de 6 fatias (excedente em "Outros"), degraus de opacidade ≥ 12 pontos e legenda com valor e percentual. Continua o último da ordem de implementação; se cair, cai com o prompt. | 5.1, 5.3, 6.1, 8.2, H16 |
| **P6** | **Plano `free`, sem `persistencia`.** Valor regenerável; demonstração cobre a instância sem chave. Frase padrão do disco efêmero vai para o `README.md` do app. Reavaliar na v2 com dado real. | 9.3 |

---

## Estado do PRD

O `01-prd.md` v1.1 está pronto para virar código: nenhuma instrução nele quebra o `npm run build`
nem o `scripts/verificar-padrao.sh` (os três bloqueantes caíram), e os cinco riscos de demonstração
(retry inexistente, impressão em branco, prévia do catálogo com questionário, cache que devolve
painel refinado, refinamento sem `maxTokens`) têm agora aceite e desenho próprios. A única coisa que
não depende do implementador é a confirmação do nome "Painel Pronto" (P1) — e ela não bloqueia nada
antes do primeiro push.

**Ordem de leitura para quem vai implementar:**

1. **`01-prd.md` seção 10** (plano em dez etapas) — é o roteiro; cada etapa diz o que fazer e como
   verificar, e agora incorpora as correções (Etapa 1 é a mais alterada: o que **não** remover).
2. **`01-prd.md` seção 7.1** (árvore de arquivos) — a lista do que copiar, o que reescrever e o que
   apagar, com o motivo por linha. Ler junto com `scripts/verificar-padrao.sh` (INFRA/PRODUTO).
3. **`01-prd.md` seções 5 e 6** (esquema e prompts) — o coração do produto; `lib/types.ts`,
   `lib/validar-painel.ts`, `lib/painel.ts` e `lib/esclarecer.ts` saem daqui quase literalmente.
4. **`01-prd.md` seção 4.1** (RF-01 a RF-20) — os critérios de aceite, para saber quando cada etapa
   está pronta.
5. **`01-prd.md` seções 7.2–7.9 e 8** — rotas, dados, impressão, `/setup`, componentes de gráfico e
   textos, na hora de escrever cada peça.
6. **`../../pdi-time/CLAUDE.md`** e **`../../PADRAO.md`** — antes de escrever a tela (as armadilhas
   citadas no PRD estão lá com o contexto completo).
7. **`03-validacao-prd.md`** só se quiser a evidência (`caminho:linha`) por trás de cada correção;
   este documento (`04`) diz o que mudou e por quê.

`00-analise-projeto-original.md` e `02-funcionalidades-e-core.md` são contexto de produto: leitura
recomendada, não obrigatória, para implementar.
