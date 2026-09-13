@AGENTS.md

## Notas específicas deste app

- `components/ui.tsx`/`lib/ai.ts`/`lib/formato.ts`/`lib/historico.ts`/`instrumentation.ts`/`components/setup.tsx`/`lib/setup-comum.ts` são cópias literais de `pdi-time`. `lib/sensivel.ts` (`SENSIVEL = false` — este app não está na lista de apps sensíveis do PRD), `app/r/[id]/page.tsx`, `app/imprimir/[id]/page.tsx` e os `not-found.tsx` são próprios daqui, porque dependem do tipo salvo (`tipo: "voz-do-cliente"`, `entrada = EntradaAnalise { contexto }`, `saida = SaidaAnalise { analise, totalEnviado, totalAnalisado, truncado }`). O histórico não guarda os comentários brutos enviados, só o contexto informado.
- `Destaque` é o "dado que decide" deste app: NPS (`analise.nps`, calculado sempre no servidor a partir das notas recebidas, nunca pela IA) quando há notas; senão o percentual de comentários positivos. Ver `destaqueDoResultado()` em `app/page.tsx`.
- `CampoArquivo.tsx` (nome mantido) agora usa o `Dropzone` compartilhado por baixo, mantendo só a lógica própria de escolher a coluna do comentário e da nota NPS quando o arquivo é um CSV (`lib/parse.ts`, pré-existente).
- `DataTable` de "Temas mais citados" declara papéis: `tema` → `titulo` (24%), `sentimento` → `chip` (112px, via `<Chip nivel={t.sentimento_dominante} />`), `exemplo` e `acao` → `detalhe` (atrás de "Ver mais" no celular).
- `Entregar` tem o extra "Exportar CSV" (`exportarCSV(analise.temas)`), mesmo padrão de `prospeccao-ia`.
- `BarraSentimento`/`MatrizPrioridade` (componentes próprios deste app, sem equivalente em `ui.tsx`) continuam usando a cor de acento (não `ok`/verde) no quadrante "Comece por aqui" da matriz — fica para a US-045 (refinamentos específicos de Voz do Cliente) trocar isso e tornar a barra de sentimento legível sem depender só de cor.
