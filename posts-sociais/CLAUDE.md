@AGENTS.md

## Notas específicas deste app

- `components/ui.tsx`/`lib/ai.ts`/`lib/formato.ts`/`lib/sensivel.ts`/`lib/historico.ts`/`instrumentation.ts` são cópias literais de `pdi-time` (arquivos genéricos, sem lógica específica do app). Só `app/r/[id]/page.tsx`, `app/imprimir/[id]/page.tsx`/`ConteudoImpresso.tsx` e os `not-found.tsx` são próprios daqui, porque dependem do `Resultado`/tipo de dado deste app (`ResultadoPosts`, com `entrada = DadosPosts`).
- `SENSIVEL = false` (posts de marketing não estão na lista de apps sensíveis do PRD — só Contratos e Financeiro); por isso `OptInGuardar` não é usado aqui, o `POST /api/posts` sempre salva.
- O estado de imagens geradas e de texto reescrito por post (`imagens`, `posts`) mora dentro do próprio componente `Resultado` (em `app/page.tsx`), não em `Page` — assim `Page` fica só com a responsabilidade de formulário/fetch, igual aos outros apps da suíte. Como `/imprimir/[id]/page.tsx` é um Server Component e `ConteudoPosts` também precisa desse estado local, `app/imprimir/[id]/ConteudoImpresso.tsx` é um pequeno wrapper `"use client"` que duplica a mesma lógica de estado (a duplicação é proposital: mais simples que levantar o estado para um hook compartilhado por tão pouca coisa).
- `Chip nivel="neutral"` (com `children` explícito) é usado em `components/PreviaPost.tsx` para o nome da rede (LinkedIn/Instagram/X) — não é um nível semântico do mapa padrão de `Chip`, por isso passa o texto já pronto em vez de deixar o componente inferir o rótulo.
