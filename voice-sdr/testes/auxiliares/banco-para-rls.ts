// Escolhe contra qual banco os testes de isolamento rodam.
//
// Sem variável de ambiente: PGlite em memória, que é o caminho do laço local e
// de `npm run check`. Com SUPABASE_DB_URL definida: o Postgres apontado por ela,
// que é como o CI reexecuta os mesmos testes depois de `supabase db reset`.
// O teste não sabe a diferença — é sempre o mesmo contrato BancoDeTeste.

import { criarBancoDeTeste, type BancoDeTeste } from './banco-de-teste.ts'

/** Variável que o CI define para apontar o Postgres real. */
export const VARIAVEL_DE_CONEXAO = 'SUPABASE_DB_URL'

/** Como chamar o banco em mensagem de teste e no relato do CI. */
export function descreverBancoParaRls(): string {
  const url = process.env[VARIAVEL_DE_CONEXAO]
  return url ? `Postgres real (${VARIAVEL_DE_CONEXAO})` : 'PGlite em memória'
}

/**
 * Abre o banco dos testes de isolamento. O import do adaptador de Postgres é
 * dinâmico de propósito: no laço local o cliente `pg` nunca chega a ser
 * carregado, e o teste não passa perto de porta de rede.
 */
export async function abrirBancoParaRls(): Promise<BancoDeTeste> {
  const url = process.env[VARIAVEL_DE_CONEXAO]
  if (!url) return criarBancoDeTeste()

  const { criarBancoPostgresReal } = await import('./postgres-real.ts')
  return criarBancoPostgresReal(url)
}
