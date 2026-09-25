// O freio de emergência visto pelo banco: o efeito cruzado entre o que
// `emergency-stop` grava e o que `guard_dial` recusa (RF-011, L-04).
//
// Não há migração do freio — as colunas são de `20260922000000_operacao_da_conta.sql`
// e a recusa é o passo 0 de `20260922110000_guarda_de_discagem.sql`. O que este
// arquivo prova é a ponte entre as duas, com o update que o adaptador da borda
// escreve (`supabase/functions/emergency-stop/index.ts`), e é por isso que ele
// não mora no arquivo de nenhuma das duas migrações:
//
// 1. **Com `dialing_paused_at` preenchido, a guarda recusa com
//    `dialing_paused` num cenário em que todo o resto libera**: número de
//    teste, dentro da janela, sem bloqueio e sem tentativa. É o cenário que
//    prova que a recusa vem só do freio.
// 2. **A gravação é condicionada**: o segundo acionamento não move o carimbo.
// 3. **A retomada limpa os três campos juntos**, e a guarda volta a liberar.
//    Limpar só um deles é recusado pelo `check` `accounts_freio_completo`.
// 4. **A fila não é tocada**: item `queued` continua `queued` com a conta
//    parada e depois dela.
//
// Referência: docs/PRD-implementacao.md seções 4.3 e 6, docs/revisao-tecnica.md
// L-04, docs/PRD.md RF-011.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

/** Quarta-feira, 14h em São Paulo: dentro da janela padrão. */
const QUARTA_14H = '2026-09-23T17:00:00Z'
const DESTINO = '+5511999990002'
const MOTIVO = 'Roteiro com erro de preço'

let banco: BancoDeTeste
let contaId: string
let leadId: string
let adminId: string

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  await banco.comoServico()

  const { rows: contas } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name, timezone) values ('Freio', 'America/Sao_Paulo') returning id`,
  )
  contaId = contas[0]!.id

  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Lead do freio', $2, 'cenario') returning id`,
    [contaId, DESTINO],
  )
  leadId = leads[0]!.id

  await banco.sql.query(
    `insert into public.phone_lines (account_id, e164, label)
     values ($1, '+5511400000002', 'Linha do freio')`,
    [contaId],
  )
  await banco.sql.query(
    `insert into public.account_test_numbers (account_id, phone_e164, label)
     values ($1, $2, 'Número de teste')`,
    [contaId, DESTINO],
  )

  adminId = await banco.criarUsuario('admin@freio.test', 'Administradora')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'admin')`,
    [contaId, adminId],
  )
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.call_attempts where account_id = $1', [contaId])
  await banco.sql.query('delete from public.dial_queue where account_id = $1', [contaId])
  await banco.sql.query(
    `update public.accounts
        set dialing_paused_at = null, dialing_paused_by = null, dialing_paused_reason = null
      where id = $1`,
    [contaId],
  )
})

/** O update de `puxarFreio` em `emergency-stop/index.ts`: condicionado a não estar parada. */
async function puxarFreio(em: string): Promise<string | null> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ dialing_paused_at: Date }>(
    `update public.accounts
        set dialing_paused_at = $2, dialing_paused_by = $3, dialing_paused_reason = $4
      where id = $1 and dialing_paused_at is null
      returning dialing_paused_at`,
    [contaId, em, adminId, MOTIVO],
  )
  return rows[0] ? rows[0].dialing_paused_at.toISOString() : null
}

/** O update de `soltarFreio`: os três campos juntos, condicionado a estar parada. */
async function soltarFreio(): Promise<number> {
  await banco.comoServico()
  const { rows } = await banco.sql.query(
    `update public.accounts
        set dialing_paused_at = null, dialing_paused_by = null, dialing_paused_reason = null
      where id = $1 and dialing_paused_at is not null
      returning id`,
    [contaId],
  )
  return rows.length
}

async function guarda(): Promise<{ allowed: boolean; reason: string }> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ allowed: boolean; reason: string }>(
    `select allowed, reason
       from public.guard_dial(
         p_account_id => $1::uuid,
         p_phone_e164 => $2::text,
         p_lead_id => $3::uuid,
         p_actor => 'system',
         p_actor_id => null,
         p_source => 'manual',
         p_campaign_id => null,
         p_bypass => '{}'::text[],
         p_instante => $4::timestamptz
       )`,
    [contaId, DESTINO, leadId, QUARTA_14H],
  )
  return rows[0]!
}

test('o cenário libera sem o freio: número de teste, dentro da janela, sem bloqueio', async () => {
  expect(await guarda()).toMatchObject({ allowed: true })
})

test('com o freio puxado a guarda recusa com dialing_paused, mesmo para número de teste', async () => {
  expect(await puxarFreio('2026-09-23T16:59:00Z')).toBe('2026-09-23T16:59:00.000Z')

  expect(await guarda()).toEqual({ allowed: false, reason: 'dialing_paused' })

  // E a recusa vira linha em `call_attempts`, como toda decisão da guarda.
  const { rows } = await banco.sql.query<{ outcome: string }>(
    'select outcome from public.call_attempts where account_id = $1',
    [contaId],
  )
  expect(rows.map((r) => r.outcome)).toEqual(['dialing_paused'])
})

test('o segundo acionamento não move o carimbo', async () => {
  await puxarFreio('2026-09-23T16:59:00Z')
  expect(await puxarFreio('2026-09-23T17:10:00Z')).toBeNull()

  const { rows } = await banco.sql.query<{ dialing_paused_at: Date }>(
    'select dialing_paused_at from public.accounts where id = $1',
    [contaId],
  )
  expect(rows[0]?.dialing_paused_at.toISOString()).toBe('2026-09-23T16:59:00.000Z')
})

test('retomar limpa os três campos juntos, e a guarda volta a liberar', async () => {
  await puxarFreio('2026-09-23T16:59:00Z')
  expect(await soltarFreio()).toBe(1)
  expect(await soltarFreio()).toBe(0)

  const { rows } = await banco.sql.query(
    'select dialing_paused_at, dialing_paused_by, dialing_paused_reason from public.accounts where id = $1',
    [contaId],
  )
  expect(rows[0]).toEqual({ dialing_paused_at: null, dialing_paused_by: null, dialing_paused_reason: null })
  expect(await guarda()).toMatchObject({ allowed: true })
})

test('soltar só o carimbo é recusado pelo check dos três campos', async () => {
  await puxarFreio('2026-09-23T16:59:00Z')

  await expect(
    banco.sql.query('update public.accounts set dialing_paused_at = null where id = $1', [contaId]),
  ).rejects.toMatchObject({ code: '23514' })
})

test('a fila não é tocada: o item queued continua queued com a conta parada e depois dela', async () => {
  await banco.comoServico()
  const { rows: itens } = await banco.sql.query<{ id: string }>(
    `insert into public.dial_queue (account_id, lead_id, purpose, source, source_ref, attempt, run_at)
     values ($1, $2, 'discovery', 'stl', $4, 1, $3)
     returning id`,
    [contaId, leadId, QUARTA_14H, `lead:${leadId}`],
  )

  await puxarFreio('2026-09-23T16:59:00Z')
  await soltarFreio()

  const { rows } = await banco.sql.query<{ status: string }>(
    'select status from public.dial_queue where id = $1',
    [itens[0]!.id],
  )
  expect(rows[0]?.status).toBe('queued')
})
