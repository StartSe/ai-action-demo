// Rotinas agendadas: a conferência de pg_cron e pg_net, a configuração da
// instalação que o job lê e o que foi agendado com que cadência.
//
// O que este arquivo prova:
//
// 1. **A migração recusa um banco sem pg_cron ou sem pg_net**, com a razão
//    escrita. As duas são da plataforma e não se criam aqui (T-26, P-09); o
//    banco sobe até a migração anterior, perde a função de mentira do
//    preâmbulo e a retomada tem que cair na conferência.
// 2. `app_config` tem RLS ligada e nenhuma política: cliente nenhum lê, nem o
//    dono de conta alguma, nem a sessão anônima.
// 3. **Os jobs agendados têm a cadência da seção 4.6**, lida do próprio
//    documento: a cadência não pode ter duas verdades. O comando de cada job é
//    só a chamada a `disparar_rotina`, sem endereço e sem segredo.
// 4. `disparar_rotina` lê endereço e segredo na hora do disparo e manda o
//    segredo no cabeçalho; sem endereço, levanta exceção em vez de mandar a
//    rotina para lugar nenhum. E nenhum papel de cliente a executa.
//
// Agendar de verdade, a granularidade de um minuto e a sobreposição de jobs
// (P-09) são do degrau 3: o pg_cron e o pg_net daqui são de mentira, e
// registram em `espionagem.chamadas` o que seria feito.
//
// Referência: migração 20260923130000_rotinas_agendadas.sql,
// docs/PRD-implementacao.md seção 4.6, docs/revisao-tecnica.md T-26 e P-09.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

const MIGRACAO = '20260923130000'

/**
 * As rotinas agendadas até aqui: as da F2, `cron-calendar-sync`, da F5
 * (20260930130000_sincronizacao_do_calendario.sql), `cron-meeting-invite`
 * (20260930160000_convite_da_reuniao.sql), `cron-meeting-reminder`, da F6
 * (20261010130000_agendamento_do_lembrete.sql) e `cron-meeting-rescue`
 * (20261010190000_agendamento_do_resgate.sql). As demais da seção 4.6
 * entram com as fases delas.
 */
const ROTINAS_AGENDADAS = [
  'cron-calendar-sync',
  'cron-call-recovery',
  'cron-cost-sync',
  'cron-credit-watch',
  'cron-dial',
  'cron-meeting-invite',
  'cron-meeting-reminder',
  'cron-meeting-rescue',
  'cron-retention',
  'cron-speed-to-lead',
]

let banco: BancoDeTeste
let usuarioId: string

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Tornearia Agendada') returning id`,
  )
  usuarioId = await banco.criarUsuario('dono@rotinas.test', 'Dono')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner')`,
    [rows[0]!.id, usuarioId],
  )
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query(`delete from public.app_config where key = 'rotinas.url_base'`)
  await banco.sql.query(`delete from vault.secrets where name = 'sarah_internal_secret'`)
  await banco.sql.query(`delete from espionagem.chamadas where funcao = 'net.http_post'`)
})

// Conferência da plataforma ----------------------------------------------------

async function retomarSem(funcao: string): Promise<unknown> {
  const anterior = await criarBancoDeTeste({ pararAntesDe: MIGRACAO })
  try {
    await anterior.sql.query(`drop function ${funcao}`)
    await anterior.retomarMigracoes()
    return null
  } catch (erro) {
    return erro
  } finally {
    // A retomada que falha já fecha o banco; fechar de novo não é assunto aqui.
    await anterior.encerrar().catch(() => undefined)
  }
}

test('sem pg_cron a migração recusa com a razão escrita', async () => {
  const erro = await retomarSem('cron.schedule(text, text, text)')
  expect(String(erro)).toMatch(/dependem do pg_cron/)
}, 60_000)

test('sem pg_net a migração recusa com a razão escrita', async () => {
  const erro = await retomarSem('net.http_post(text, jsonb, jsonb, jsonb, integer)')
  expect(String(erro)).toMatch(/dependem do pg_net/)
}, 60_000)

// app_config -----------------------------------------------------------------

test('app_config tem RLS ligada e nenhuma política', async () => {
  const { rows: rls } = await banco.sql.query<{ relrowsecurity: boolean }>(
    `select relrowsecurity from pg_class where oid = 'public.app_config'::regclass`,
  )
  expect(rls[0]?.relrowsecurity).toBe(true)

  const { rows: politicas } = await banco.sql.query<{ policyname: string }>(
    `select policyname from pg_policies
      where schemaname = 'public' and tablename = 'app_config'`,
  )
  expect(politicas).toEqual([])
})

test('nenhum cliente lê app_config, nem o dono de uma conta', async () => {
  const { rows: semeadas } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.app_config',
  )
  expect(semeadas[0]?.total, 'sem linha, a leitura vazia não prova nada').toBeGreaterThan(0)

  for (const entrar of [() => banco.comoUsuario(usuarioId), () => banco.comoAnonimo()]) {
    await entrar()
    const { rows } = await banco.sql.query<{ total: number }>(
      'select count(*)::int as total from public.app_config',
    )
    expect(rows[0]?.total).toBe(0)
  }
})

test('o dono de uma conta não escreve em app_config', async () => {
  await banco.comoUsuario(usuarioId)
  await expect(
    banco.sql.query(
      `insert into public.app_config (key, value) values ('rotinas.url_base', 'desvio')`,
    ),
  ).rejects.toThrow(/row-level security/i)
})

// Agendamento ----------------------------------------------------------------

/** Cadência da seção 4.6 por rotina, lida da tabela do documento. */
async function cadenciasDoDocumento(): Promise<Map<string, string>> {
  const texto = await readFile(
    fileURLToPath(new URL('../../docs/PRD-implementacao.md', import.meta.url)),
    'utf8',
  )
  const inicio = texto.indexOf('### 4.6 Rotinas agendadas')
  const fim = texto.indexOf('\n---', inicio)
  expect(inicio, 'a seção 4.6 sumiu do documento').toBeGreaterThan(-1)

  const cadencias = new Map<string, string>()
  for (const linha of texto.slice(inicio, fim).split('\n')) {
    const casada = /^\|\s*`(cron-[a-z-]+)`\s*\|\s*([^|]+?)\s*\|/.exec(linha)
    if (casada) cadencias.set(casada[1]!, casada[2]!)
  }
  return cadencias
}

/** A expressão do pg_cron que a cadência escrita no documento pede. */
function expressaoDa(cadencia: string): RegExp {
  if (cadencia === '1 min') return /^\* \* \* \* \*$/
  const minutos = /^(\d+) min$/.exec(cadencia)
  if (minutos) return new RegExp(`^\\*/${minutos[1]} \\* \\* \\* \\*$`)
  if (cadencia === '1 h') return /^\d{1,2} \* \* \* \*$/
  if (cadencia === 'diária') return /^\d{1,2} \d{1,2} \* \* \*$/
  throw new Error(`cadência ${cadencia} sem tradução para o pg_cron`)
}

test('os jobs agendados são as rotinas declaradas', async () => {
  const { rows } = await banco.sql.query<{ jobname: string }>(
    'select jobname from cron.job order by jobname',
  )
  expect(rows.map((linha) => linha.jobname)).toEqual(ROTINAS_AGENDADAS)
})

test('cada job tem a cadência da tabela da seção 4.6', async () => {
  const cadencias = await cadenciasDoDocumento()
  const { rows } = await banco.sql.query<{ jobname: string; schedule: string }>(
    'select jobname, schedule from cron.job order by jobname',
  )
  expect(rows.length).toBeGreaterThan(0)

  for (const job of rows) {
    const cadencia = cadencias.get(job.jobname)
    expect(cadencia, `${job.jobname} não está na tabela da seção 4.6`).toBeDefined()
    expect(
      { rotina: job.jobname, schedule: job.schedule },
    ).toEqual({ rotina: job.jobname, schedule: expect.stringMatching(expressaoDa(cadencia!)) })
  }
})

test('o agendamento passou pelo cron.schedule, uma vez por rotina', async () => {
  const { rows } = await banco.sql.query<{ nome: string }>(
    `select argumentos ->> 'job_name' as nome
       from espionagem.chamadas
      where funcao = 'cron.schedule'
      order by nome`,
  )
  expect(rows.map((linha) => linha.nome)).toEqual(ROTINAS_AGENDADAS)
})

test('o comando de cada job é só a chamada a disparar_rotina, sem endereço nem segredo', async () => {
  const { rows } = await banco.sql.query<{ jobname: string; command: string }>(
    'select jobname, command from cron.job',
  )
  for (const job of rows) {
    expect(job.command).toBe(`select public.disparar_rotina('${job.jobname}')`)
  }
})

// disparar_rotina --------------------------------------------------------------

async function configurarDisparo(): Promise<void> {
  await banco.sql.query(
    `insert into public.app_config (key, value) values ('rotinas.url_base', $1)`,
    ['https://projeto.exemplo.test/functions/v1/'],
  )
  await banco.sql.query(`select vault.create_secret('segredo-das-rotinas-7Q', 'sarah_internal_secret')`)
}

test('o disparo manda a rotina ao endereço de app_config com o segredo do Vault no cabeçalho', async () => {
  await configurarDisparo()
  await banco.sql.query(`select public.disparar_rotina('cron-dial')`)

  const { rows } = await banco.sql.query<{ argumentos: Record<string, unknown> }>(
    `select argumentos from espionagem.chamadas where funcao = 'net.http_post'`,
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.argumentos).toMatchObject({
    url: 'https://projeto.exemplo.test/functions/v1/cron-dial',
    body: { rotina: 'cron-dial' },
    headers: { 'x-internal-secret': 'segredo-das-rotinas-7Q' },
  })
})

test('sem o endereço base o disparo levanta exceção e não chama o pg_net', async () => {
  await banco.sql.query(`select vault.create_secret('segredo-das-rotinas-7Q', 'sarah_internal_secret')`)
  await expect(
    banco.sql.query(`select public.disparar_rotina('cron-dial')`),
  ).rejects.toThrow(/rotinas\.url_base/)

  const { rows } = await banco.sql.query(
    `select 1 from espionagem.chamadas where funcao = 'net.http_post'`,
  )
  expect(rows).toEqual([])
})

test('sem o segredo no Vault o disparo levanta exceção em vez de sair sem autenticação', async () => {
  await banco.sql.query(
    `insert into public.app_config (key, value) values ('rotinas.url_base', 'https://projeto.exemplo.test')`,
  )
  await expect(
    banco.sql.query(`select public.disparar_rotina('cron-dial')`),
  ).rejects.toThrow(/sem autenticação/)
})

test('nome de rotina fora da forma é recusado antes de montar o endereço', async () => {
  await configurarDisparo()
  await expect(
    banco.sql.query(`select public.disparar_rotina('../auth/v1/admin')`),
  ).rejects.toThrow(/nome inválido/)
})

test('nenhum papel de cliente executa disparar_rotina', async () => {
  const { rows } = await banco.sql.query<{ grantee: string }>(
    `select grantee from information_schema.routine_privileges
      where routine_schema = 'public' and routine_name = 'disparar_rotina'
        and privilege_type = 'EXECUTE'`,
  )
  const papeis = rows.map((linha) => linha.grantee)
  for (const papel of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
    expect(papeis).not.toContain(papel)
  }

  await banco.comoUsuario(usuarioId)
  await expect(
    banco.sql.query(`select public.disparar_rotina('cron-dial')`),
  ).rejects.toThrow(/permission denied/i)
})

// Alarme de volume em job_runs -------------------------------------------------

test('job_runs não aceita alarme de volume sem a média que o disparou', async () => {
  await expect(
    banco.sql.query(
      `insert into public.job_runs (routine, volume_alert) values ('cron-dial', true)`,
    ),
  ).rejects.toThrow(/job_runs_alarme_com_media/)

  await banco.sql.query(
    `insert into public.job_runs (routine, volume_alert, volume_baseline)
     values ('cron-dial', true, 4)`,
  )
})
