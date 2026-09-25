// Testes de raiz: banco em PGlite e validação estática das migrações.
// Ambiente node, nenhum navegador. Os testes de componente da interface ficam
// no workspace `app`, com ambiente jsdom e configuração própria.

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['testes/**/*.test.ts'],
    // PGlite compila o Postgres em WebAssembly na primeira subida.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Cada arquivo de `testes/banco/` sobe um Postgres inteiro em memória, e o
    // padrão do Vitest é um processo por núcleo — que numa máquina de 8 GB põe
    // mais bancos de pé do que cabem. O sintoma não é erro: é o `beforeAll`
    // estourando o tempo em arquivos sorteados, porque a máquina está paginando
    // em vez de rodando. Quatro é o teto que cabe com folga; o arquivo todo
    // fecha em pouco mais de 20 segundos, que é o que o laço pede.
    maxWorkers: 4,
  },
})
