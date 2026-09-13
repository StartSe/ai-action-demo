@AGENTS.md

## Notas específicas deste app

- `components/ui.tsx`/`lib/ai.ts`/`lib/formato.ts`/`lib/sensivel.ts`/`lib/historico.ts`/`instrumentation.ts`/`components/setup.tsx`/`lib/setup-comum.ts` são cópias literais de `pdi-time` (arquivos genéricos, sem lógica específica do app). Só `app/r/[id]/page.tsx`, `app/imprimir/[id]/page.tsx` e os `not-found.tsx` são próprios daqui, porque dependem do `Resultado`/tipo de dado deste app (`tipo: "ata"`, `entrada = EntradaAta`).
