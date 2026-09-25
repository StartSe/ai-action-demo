// Testes das funções de servidor. Ambiente node, sem banco e sem rede: o que
// roda aqui é a parte portável de cada função, com a camada de dados dublada.
//
// Projeto separado do `vitest.config.ts` da raiz de propósito. Lá ficam os
// testes que sobem Postgres em memória, com timeout largo para a compilação do
// WebAssembly; aqui nada sobe, e um teste lento é sinal de que alguma coisa
// saiu do dublê.

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['supabase/functions/**/*.test.ts'],
    testTimeout: 5_000,
  },
})
