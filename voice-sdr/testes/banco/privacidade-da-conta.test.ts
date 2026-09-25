// A privacidade da conta: `definir_privacidade`, a guarda do dono e
// `chamadas_fora_do_prazo`. O que se prova aqui:
//
// 1. O dono grava, e a trilha leva o autor da sessão **e** o motivo (RF-008).
// 2. Admin é recusado pelo RPC **e** pelo `update` direto, que a política de
//    admin de `account_settings` deixaria passar sem o gatilho. É a classe
//    Dono da matriz 3.9.
// 3. Motivo em branco e chave fora da privacidade são recusados; chave ausente
//    é "não mexi"; aviso nulo volta à frase da camada 1.
// 4. O servidor (sem sessão) continua podendo escrever.
// 5. A contagem de fora do prazo: 89 dias fica, 91 sai; chamada em curso e
//    chamada sem conteúdo não contam; a conta vizinha não vê a contagem desta.
//
// Referência: migração 20260923120000_privacidade_da_conta.sql.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** SQLSTATE de quem não é dono: insufficient_privilege. */
const SEM_PRIVILEGIO = '42501'
/** SQLSTATE de argumento fora do domínio: invalid_parameter_value. */
const PARAMETRO_INVALIDO = '22023'

interface Conta {
  readonly id: string
  readonly donoId: string
  readonly adminId: string
  readonly leadId: string
}

interface Privacidade {
  recording_enabled: boolean
  recording_notice_text: string | null
  retention_days: number
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

async function criarConta(nome: string, dominio: string, sufixo: string): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id
  const donoId = await banco.criarUsuario(`dono@${dominio}`, 'Dono')
  const adminId = await banco.criarUsuario(`admin@${dominio}`, 'Admin')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'admin')`,
    [id, donoId, adminId],
  )
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, $2, $3, 'cenario') returning id`,
    [id, `Lead de ${nome}`, `+55119800000${sufixo}`],
  )
  return { id, donoId, adminId, leadId: leads[0]!.id }
}

async function erroDe(manobra: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await manobra
  } catch (erro) {
    const bruto = erro as { code?: string; message?: string }
    return { code: bruto.code, message: String(bruto.message) }
  }
  throw new Error('a manobra deveria ter sido recusada, e passou')
}

function definir(contaId: string, privacidade: unknown, motivo: string | null) {
  return banco.sql.query<{ definir_privacidade: Privacidade }>(
    'select public.definir_privacidade($1, $2::jsonb, $3)',
    [contaId, JSON.stringify(privacidade), motivo],
  )
}

async function lerPrivacidade(contaId: string): Promise<Privacidade> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<Privacidade>(
    `select recording_enabled, recording_notice_text, retention_days
       from public.account_settings where account_id = $1`,
    [contaId],
  )
  return rows[0]!
}

async function trilha(contaId: string) {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    actor_id: string | null
    reason: string | null
    payload: { campos: string[] }
  }>(
    `select actor_id, reason, payload from public.audit_log
      where account_id = $1 and target_type = 'account_settings'
      order by created_at`,
    [contaId],
  )
  return rows
}

/** Chamada pela sessão de serviço, com o fim `dias` atrás. */
async function semearChamada(
  conta: Conta,
  chave: string,
  opcoes: { dias: number; status?: string; conteudo?: 'audio' | 'transcricao' | 'nenhum' },
) {
  await banco.comoServico()
  const conteudo = opcoes.conteudo ?? 'audio'
  await banco.sql.query(
    `insert into public.calls
       (account_id, lead_id, purpose, direction, idempotency_key, status,
        started_at, ended_at, recording_path, transcript)
     values ($1, $2, 'discovery', 'outbound', $3, $4,
             now() - make_interval(days => $5::int, mins => 5),
             case when $4 in ('ended', 'failed') then now() - make_interval(days => $5::int) end,
             $6, $7::jsonb)`,
    [
      conta.id,
      conta.leadId,
      chave,
      opcoes.status ?? 'ended',
      opcoes.dias,
      conteudo === 'audio' ? `gravacoes/${chave}.mp3` : null,
      conteudo === 'transcricao'
        ? JSON.stringify({ turns: [{ role: 'agent', text: 'Oi', at: 0 }] })
        : '{}',
    ],
  )
}

async function foraDoPrazo(contaId: string, dias: number): Promise<number> {
  const { rows } = await banco.sql.query<{ chamadas_fora_do_prazo: number }>(
    'select public.chamadas_fora_do_prazo($1, $2)',
    [contaId, dias],
  )
  return rows[0]!.chamadas_fora_do_prazo
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test', '1')
  contaB = await criarConta('Cooperativa Sul', 'sul.test', '2')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query(
    `update public.account_settings
        set recording_enabled = default, recording_notice_text = default,
            retention_days = default`,
  )
  await banco.sql.query(`delete from public.audit_log where target_type = 'account_settings'`)
  await banco.sql.query('delete from public.calls')
})

test('o dono grava, e a trilha leva o autor e o motivo', async () => {
  await banco.comoUsuario(contaA.donoId)
  const { rows } = await definir(
    contaA.id,
    { recording_enabled: false, retention_days: 30 },
    'pedido do jurídico',
  )
  expect(rows[0]?.definir_privacidade).toEqual({
    recording_enabled: false,
    recording_notice_text: null,
    retention_days: 30,
  })

  const registros = await trilha(contaA.id)
  expect(registros).toHaveLength(1)
  expect(registros[0]).toMatchObject({ actor_id: contaA.donoId, reason: 'pedido do jurídico' })
  expect([...registros[0]!.payload.campos].sort()).toEqual(['recording_enabled', 'retention_days'])
})

test('admin é recusado pelo RPC, e nada muda', async () => {
  await banco.comoUsuario(contaA.adminId)
  const erro = await erroDe(definir(contaA.id, { recording_enabled: false }, 'tentativa'))
  expect(erro.code).toBe(SEM_PRIVILEGIO)
  expect((await lerPrivacidade(contaA.id)).recording_enabled).toBe(true)
})

test('admin também é recusado pelo update direto, que a política de admin deixaria passar', async () => {
  await banco.comoUsuario(contaA.adminId)
  const erro = await erroDe(
    banco.sql.query(
      'update public.account_settings set retention_days = 7 where account_id = $1',
      [contaA.id],
    ),
  )
  expect(erro.code).toBe(SEM_PRIVILEGIO)
  expect((await lerPrivacidade(contaA.id)).retention_days).toBe(90)
})

test('admin continua mexendo no resto da configuração', async () => {
  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query(
    'update public.account_settings set daily_calls_cap = 321 where account_id = $1 returning 1',
    [contaA.id],
  )
  expect(rows).toHaveLength(1)
})

test('o dono da conta A não grava na conta B', async () => {
  await banco.comoUsuario(contaA.donoId)
  const erro = await erroDe(definir(contaB.id, { retention_days: 5 }, 'engano'))
  expect(erro.code).toBe(SEM_PRIVILEGIO)
  expect((await lerPrivacidade(contaB.id)).retention_days).toBe(90)
})

test('motivo em branco e chave fora da privacidade são recusados', async () => {
  await banco.comoUsuario(contaA.donoId)
  expect((await erroDe(definir(contaA.id, { retention_days: 10 }, '   '))).code).toBe(
    PARAMETRO_INVALIDO,
  )
  const desconhecida = await erroDe(
    definir(contaA.id, { retention_days: 10, max_concurrent: 2 }, 'motivo'),
  )
  expect(desconhecida.code).toBe(PARAMETRO_INVALIDO)
  expect(desconhecida.message).toContain('max_concurrent')
  expect((await lerPrivacidade(contaA.id)).retention_days).toBe(90)
})

test('chave ausente não mexe, e aviso nulo volta à frase da camada 1', async () => {
  await banco.comoUsuario(contaA.donoId)
  await definir(contaA.id, { recording_notice_text: 'Esta ligação é gravada.' }, 'texto novo')
  await banco.comoUsuario(contaA.donoId)
  await definir(contaA.id, { retention_days: 45 }, 'prazo')
  expect(await lerPrivacidade(contaA.id)).toEqual({
    recording_enabled: true,
    recording_notice_text: 'Esta ligação é gravada.',
    retention_days: 45,
  })

  await banco.comoUsuario(contaA.donoId)
  await definir(contaA.id, { recording_notice_text: null }, 'volta ao padrão')
  expect((await lerPrivacidade(contaA.id)).recording_notice_text).toBeNull()
})

test('o servidor, sem sessão, continua escrevendo', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query(
    'update public.account_settings set retention_days = 60 where account_id = $1 returning 1',
    [contaA.id],
  )
  expect(rows).toHaveLength(1)
})

test('89 dias fica dentro do prazo, 91 sai', async () => {
  await semearChamada(contaA, 'p-89', { dias: 89 })
  await semearChamada(contaA, 'p-91', { dias: 91 })
  await semearChamada(contaA, 'p-120-transcricao', { dias: 120, conteudo: 'transcricao' })

  await banco.comoUsuario(contaA.donoId)
  expect(await foraDoPrazo(contaA.id, 90)).toBe(2)
  expect(await foraDoPrazo(contaA.id, 30)).toBe(3)
  expect(await foraDoPrazo(contaA.id, 365)).toBe(0)
})

test('chamada em curso e chamada sem conteúdo não contam', async () => {
  await semearChamada(contaA, 'em-curso', { dias: 200, status: 'in_progress' })
  await semearChamada(contaA, 'expurgada', { dias: 200, conteudo: 'nenhum' })
  await semearChamada(contaA, 'falhou', { dias: 200, status: 'failed' })

  await banco.comoUsuario(contaA.donoId)
  expect(await foraDoPrazo(contaA.id, 90)).toBe(1)
})

test('a conta vizinha não vê a contagem desta', async () => {
  await semearChamada(contaA, 'vizinha', { dias: 200 })

  await banco.comoUsuario(contaB.donoId)
  expect(await foraDoPrazo(contaA.id, 90)).toBe(0)
  await banco.comoUsuario(contaA.adminId)
  expect(await foraDoPrazo(contaA.id, 90)).toBe(1)
})
