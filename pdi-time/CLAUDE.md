@AGENTS.md

## Notas específicas deste app

- Constantes que precisam ser lidas tanto por um Client Component (`app/page.tsx`) quanto por um módulo Server-only com `node:sqlite`/`node:fs` (`lib/historico.ts`, `lib/store.ts`) devem morar num arquivo à parte sem imports `node:*` (ex.: `lib/sensivel.ts`, `lib/formato.ts`), reexportado pelo módulo Server-only. Importar direto de um módulo com `node:sqlite` a partir de um `"use client"` quebra o bundle do cliente.
- `eslint-plugin-react-hooks@7` (a versão usada por `eslint-config-next` aqui) não analisa estabilidade de forma transitiva: uma função do componente (ex.: `gerar`) que chama outra função também do componente (ex.: `carregarHistorico`) passa a ser tratada como "instável" pelo `react-hooks/exhaustive-deps`, mesmo que ambas só usem setters de `useState`/`fetch`. Se isso acontecer num `useEffect` com array de dependências vazio, prefira inline a chamada em vez de extrair para uma função irmã (este projeto não usa `useCallback`).
