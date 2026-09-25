// Leitura das migrações. Um só lugar sabe onde elas moram e em que ordem
// entram: a validação estática e o banco em processo leem pelo mesmo caminho.

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Migracao } from './analise-de-migracoes.ts'

export const PASTA_DE_MIGRACOES = fileURLToPath(
  new URL('../supabase/migrations', import.meta.url),
)

/** Migrações em ordem de nome de arquivo, que é a ordem de aplicação. */
export async function lerMigracoes(
  pasta: string = PASTA_DE_MIGRACOES,
): Promise<Migracao[]> {
  const arquivos = (await readdir(pasta))
    .filter((nome) => nome.endsWith('.sql'))
    .sort()

  return Promise.all(
    arquivos.map(async (nome) => ({
      nome,
      sql: await readFile(join(pasta, nome), 'utf8'),
    })),
  )
}
