// A fila de exceções entra na publicação de tempo real (US-117).
//
// O PGlite não traz a publicação `supabase_realtime`, e o banco comum dos testes
// aplica a migração pelo ramo que não faz nada. Quem prova o outro ramo é um
// banco parado antes da migração, onde o teste cria a publicação como o
// Supabase a entrega, e retoma: sem isto, apagar o `alter publication` não
// derruba teste nenhum.
//
// Referência: migração 20260924230000_fila_em_tempo_real.sql,
// docs/PRD-implementacao.md seção 7.

import { expect, test } from 'vitest'

import { criarBancoDeTeste } from '../auxiliares/banco-de-teste.ts'

const MIGRACAO = '20260924230000_fila_em_tempo_real'

async function tabelasPublicadas(sql: {
  query<T>(consulta: string): Promise<{ rows: T[] }>
}): Promise<string[]> {
  const { rows } = await sql.query<{ tabela: string }>(
    `select schemaname || '.' || tablename as tabela
       from pg_publication_tables
      where pubname = 'supabase_realtime'
      order by 1`,
  )
  return rows.map((linha) => linha.tabela)
}

test('onde a publicação existe, exception_items entra nela', async () => {
  const banco = await criarBancoDeTeste({ pararAntesDe: MIGRACAO })
  try {
    await banco.sql.exec('create publication supabase_realtime')
    expect(await tabelasPublicadas(banco.sql)).toEqual([])

    expect(await banco.retomarMigracoes()).toContain(`${MIGRACAO}.sql`)

    expect(await tabelasPublicadas(banco.sql)).toContain('public.exception_items')
  } finally {
    await banco.encerrar()
  }
})

test('onde a publicação não existe, a migração segue sem criá-la', async () => {
  const banco = await criarBancoDeTeste()
  try {
    expect(banco.migracoesAplicadas).toContain(`${MIGRACAO}.sql`)
    const { rows } = await banco.sql.query<{ total: number }>(
      `select count(*)::int as total from pg_publication where pubname = 'supabase_realtime'`,
    )
    expect(rows[0]?.total).toBe(0)
  } finally {
    await banco.encerrar()
  }
})
