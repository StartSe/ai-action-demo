// O balde em que `call-finalize` guarda o áudio e de onde `call-audio` o lê
// existe depois das migrações, e é privado. Sem ele, toda finalização perdia a
// gravação em silêncio: o upload falhava e o desfecho virava "falhou".
//
// O nome vem da constante da borda, e não de um literal daqui: se alguém
// renomear o balde em `call-finalize`, este teste cai em vez de conferir um
// balde que ninguém usa.

import { afterAll, beforeAll, expect, test } from 'vitest'

import { BALDE_DAS_GRAVACOES } from '../../supabase/functions/call-finalize/finalizacao.ts'
import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste

beforeAll(async () => {
  banco = await criarBancoDeTeste()
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

test('o balde das gravações existe, com o nome que call-finalize usa', async () => {
  const { rows } = await banco.sql.query<{ id: string; public: boolean }>(
    'select id, public from storage.buckets where id = $1',
    [BALDE_DAS_GRAVACOES],
  )

  expect(rows, `nenhuma migração cria o balde "${BALDE_DAS_GRAVACOES}"`).toHaveLength(1)
})

test('o balde é privado: o áudio só sai por call-audio', async () => {
  const { rows } = await banco.sql.query<{ public: boolean }>(
    'select public from storage.buckets where id = $1',
    [BALDE_DAS_GRAVACOES],
  )

  expect(rows[0]?.public).toBe(false)
})

test('o limite de tamanho cobre a chamada mais longa', async () => {
  const { rows } = await banco.sql.query<{ file_size_limit: string | null }>(
    'select file_size_limit from storage.buckets where id = $1',
    [BALDE_DAS_GRAVACOES],
  )

  // Dez minutos em mp3 ficam perto de 10 MB; abaixo de 20 MB a folga acaba.
  expect(Number(rows[0]?.file_size_limit)).toBeGreaterThanOrEqual(20 * 1024 * 1024)
})
