# `toolkit-dash-builder` ("Painel Pronto") — documentos de produto

Pasta de trabalho da recriação, dentro da suíte **IA para Executivos**, do produto "AI Dash Builder"
(prompt → painel de indicadores gerado pela IA) originalmente feito no Lovable.

Nesta fase existe **só documentação**: nenhuma linha de código do app foi escrita ainda. A
documentação está **completa e validada**; a implementação segue o plano em dez etapas da
**seção 10 do PRD** ([`01-prd.md`](01-prd.md#10-plano-de-implementação)).

## Índice

| Documento | O que é | Estado |
|---|---|---|
| [`00-analise-projeto-original.md`](00-analise-projeto-original.md) | Análise do repositório de origem: stack, 17 funcionalidades, fluxo de dados, tipos TypeScript, os quatro prompts na íntegra, esquema do banco, 24 sacadas de produto, 23 pontos de dívida do Lovable, o padrão do `ai-action-demo` e as 24 diferenças a resolver. É a base de evidências de tudo o que vem depois. | pronto |
| [`02-funcionalidades-e-core.md`](02-funcionalidades-e-core.md) | O recorte: tabela das 41 funcionalidades da origem com veredito (core / útil / descartar), as 15 "sacadas" validadas com a justificativa de produto de cada uma, o que não vem e por quê, a estratégia da recriação como app da suíte e 14 riscos numerados com a decisão recomendada. | pronto |
| [`01-prd.md`](01-prd.md) | **O PRD da v1, agora v1.1 (refinado após validação).** Visão, público, métricas, personas e jornadas, 20 requisitos funcionais com critérios de aceite, a especificação de tipos do painel, os quatro prompts completos em PT-BR, a arquitetura no padrão da suíte (árvore de arquivos, rotas, modelo de dados, MCP, impressão, `/setup`), UI/UX e cor de acento, deploy e entrada de catálogo, plano de implementação em 10 etapas verificáveis, as perguntas P1–P6 fechadas e as hipóteses H1–H19. **É o documento que vira código.** | pronto (v1.1) |
| [`03-validacao-prd.md`](03-validacao-prd.md) | Validação independente do PRD v1 contra `PADRAO.md` e o código real do `pdi-time`: 21 achados (3 bloqueantes, 5 altos, 9 médios, 4 baixos), cada um com evidência `caminho:linha` e correção concreta, a lista do que já estava certo, e respostas recomendadas para P1–P6. | pronto |
| [`04-refinamento-prd.md`](04-refinamento-prd.md) | Registro do refinamento (Fase 5): o que foi feito com cada um dos 21 achados (20 aplicados, 1 aplicado parcialmente — o sub-item recusado e o motivo), o fechamento de P1–P6 e a ordem de leitura para quem vai implementar. | pronto |

## Fluxo

```
00 análise  →  02 funcionalidades e core  →  01 PRD  →  03 validação  →  04 refinamento  →  implementação
(o que existe)   (o que vale a pena)         (o que    (bate com o     (a versão que        (seção 10 do PRD,
                                              vamos     padrão?)         vai virar código)     dez etapas)
                                              fazer)
```

A numeração dos arquivos é a ordem de **leitura de referência** (o PRD é o documento 01 porque é o
principal), não a ordem em que foram escritos. Para entender o raciocínio do começo, leia na ordem
do fluxo acima: **00 → 02 → 01 → 03 → 04**. Para **implementar**, comece pela seção 10 do PRD e siga
a ordem de leitura sugerida no fim do `04-refinamento-prd.md`.

**Decisão humana pendente (única):** confirmar o nome de exibição **"Painel Pronto"** com Renato antes
do primeiro push (P1 na seção 11 do PRD). O id `toolkit-dash-builder` está fechado.

## Referências obrigatórias fora desta pasta

- [`../../PADRAO.md`](../../PADRAO.md) — o padrão da suíte (stack, visual, `/setup`, conta, MCP, deploy, verificação).
- [`../../pdi-time/`](../../pdi-time/) — o app de referência: a estrutura é copiada dele.
- [`../../pdi-time/CLAUDE.md`](../../pdi-time/CLAUDE.md) — cerca de 60 armadilhas já pagas por outra pessoa. Leitura obrigatória antes de escrever a tela.
- [`../../scripts/verificar-padrao.sh`](../../scripts/verificar-padrao.sh) — a lista do que é INFRA (cópia byte a byte, inclusive `app/api/setup/oauth/*`) e do que é PRODUTO.
- [`../../catalogo.json`](../../catalogo.json) e [`../../tasks/paleta-segmentos.json`](../../tasks/paleta-segmentos.json) — fontes únicas de porta, textos e cor de acento (alterar os dois juntos).
- [`../../financas-ia/components/`](../../financas-ia/components/) — `GraficoMeses.tsx` e `GraficoCategorias.tsx`, o jeito da suíte de fazer gráfico sem biblioteca.
