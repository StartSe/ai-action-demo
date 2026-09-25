// Lint das ferramentas de validação (scripts/, testes/) e da parte portável das
// funções de servidor (supabase/functions/). O código da interface tem regras
// próprias, em app/eslint.config.js: aqui é Node, não navegador, e nada de
// React.
//
// O `index.ts` de cada função fica de fora: é o adaptador Deno, com `Deno.serve`
// e import `npm:`, que este parser não resolve. Tudo o que decide algo mora nos
// outros arquivos da função, e esses são lintados.

import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'app',
      // As worktrees dos agentes moram aqui dentro, cada uma com o próprio tsconfig.
      '.claude',
      'dist',
      'node_modules',
      'supabase/migrations',
      // Gerado por scripts/pacote-de-instalacao.ts: o código de verdade é o de supabase/.
      'instalacao',
      'supabase/functions/**/index.ts',
    ],
  },
  {
    files: [
      'scripts/**/*.ts',
      'testes/**/*.ts',
      'supabase/functions/**/*.ts',
      'vitest.config.ts',
      'vitest.funcoes.config.ts',
    ],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      // `crypto`, `TextEncoder` e `btoa` são globais nos dois lados: no Node
      // dos testes e no Deno das funções de borda.
      globals: { ...globals.node, ...globals.browser },
    },
  },
)
