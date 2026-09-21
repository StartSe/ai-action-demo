# `toolkit-dash-builder` — documentos de produto

Pasta de trabalho da recriação, dentro da suíte **IA para Executivos**, do produto "AI Dash Builder"
(prompt → painel de indicadores gerado pela IA) originalmente feito no Lovable.

Nesta fase existe **só documentação**: nenhuma linha de código do app foi escrita ainda.

## Índice

| Documento | O que é | Estado |
|---|---|---|
| [`00-analise-projeto-original.md`](00-analise-projeto-original.md) | Análise do repositório de origem: stack, 17 funcionalidades, fluxo de dados, tipos TypeScript, os quatro prompts na íntegra, esquema do banco, 24 sacadas de produto, 23 pontos de dívida do Lovable, o padrão do `ai-action-demo` e as 24 diferenças a resolver. É a base de evidências de tudo o que vem depois. | pronto |
| [`02-funcionalidades-e-core.md`](02-funcionalidades-e-core.md) | O recorte: tabela das 41 funcionalidades da origem com veredito (core / útil / descartar), as 15 "sacadas" validadas com a justificativa de produto de cada uma, o que não vem e por quê, a estratégia da recriação como app da suíte e 14 riscos numerados com a decisão recomendada. | pronto |
| [`01-prd.md`](01-prd.md) | O PRD da v1: visão, público, métricas, personas e jornadas, 20 requisitos funcionais com critérios de aceite, a especificação de tipos do painel, os quatro prompts completos em PT-BR, a arquitetura no padrão da suíte (árvore de arquivos, rotas, modelo de dados, MCP, impressão, `/setup`), UI/UX e cor de acento, deploy e entrada de catálogo, plano de implementação em 10 etapas verificáveis e as perguntas em aberto. | pronto |
| `03-validacao.md` | Validação do PRD contra o padrão da suíte e contra o código real do `pdi-time`: o que foi conferido arquivo a arquivo, o que não bate e o que precisa mudar antes de começar a implementar. | a fazer |
| `04-refinamento.md` | Refinamento do PRD depois da validação: correções, decisões fechadas e o plano final de implementação. | a fazer |

## Fluxo

```
00 análise  →  02 funcionalidades e core  →  01 PRD  →  03 validação  →  04 refinamento  →  implementação
(o que existe)   (o que vale a pena)         (o que    (bate com o     (a versão que
                                              vamos     padrão?)         vai virar código)
                                              fazer)
```

A numeração dos arquivos é a ordem de **leitura de referência** (o PRD é o documento 01 porque é o
principal), não a ordem em que foram escritos. Para entender o raciocínio do começo, leia na ordem
do fluxo acima: **00 → 02 → 01**.

## Referências obrigatórias fora desta pasta

- [`../../PADRAO.md`](../../PADRAO.md) — o padrão da suíte (stack, visual, `/setup`, conta, MCP, deploy, verificação).
- [`../../pdi-time/`](../../pdi-time/) — o app de referência: a estrutura é copiada dele.
- [`../../pdi-time/CLAUDE.md`](../../pdi-time/CLAUDE.md) — cerca de 60 armadilhas já pagas por outra pessoa. Leitura obrigatória antes de escrever a tela.
- [`../../catalogo.json`](../../catalogo.json) e [`../../tasks/paleta-segmentos.json`](../../tasks/paleta-segmentos.json) — fontes únicas de porta, textos e cor de acento.
- [`../../financas-ia/components/`](../../financas-ia/components/) — `GraficoMeses.tsx` e `GraficoCategorias.tsx`, o jeito da suíte de fazer gráfico sem biblioteca.
