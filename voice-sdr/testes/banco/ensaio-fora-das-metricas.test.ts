// O ensaio fora das métricas e das listagens de operação (US-099, T-16).
//
// O que este arquivo prova:
//
// 1. `chamadas_reais` devolve a chamada real e não o ensaio, e a contagem das
//    tentativas do dia por ela não conta o ensaio.
// 2. A chamada de ensaio continua acessível por id em `calls`: a ficha existe.
// 3. `security_invoker = on`: a RLS de `calls` vale para quem consulta a visão,
//    e cada conta vê só as próprias chamadas.
// 4. O ensaio não passa pela guarda: abrir e encerrar não gravam
//    `call_attempts`, e a borda `rehearsal-session` não cita a guarda.
// 5. O ensaio não ocupa vaga de discagem na fila.
// 6. Custo real continua: `call_costs` recebe o ensaio e a soma chega em
//    `calls.cost_cents`.
// 7. Varredura estrutural: visão ou função que lê `calls` cita `direction`
//    (ou lê de `chamadas_reais`) ou está em `ISENTAS`, com a razão.
//
// Referência: migração 20260924170000_ensaio_fora_das_metricas.sql.

import { readdirSync, readFileSync } from 'node:fs'

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

/**
 * Função que lê `calls` sem citar `direction` e sem passar por
 * `chamadas_reais`. Cada uma diz por que o ensaio pode entrar nela; sair da
 * lista é passar a filtrar. Função nova que agregue `calls` e esqueça o
 * ensaio reprova na varredura até entrar aqui ou filtrar.
 */
const ISENTAS: Record<string, string> = {
  chamadas_fora_do_prazo:
    'régua do expurgo (RF-807), não métrica: o ensaio tem transcrição e ' +
    'áudio como qualquer chamada, e o prazo de retenção vale para ele igual.',
  reivindicar_expurgo:
    'expurgo de conteúdo (RF-807): apaga áudio e transcrição vencidos, e o ' +
    'ensaio guarda os dois. Deixá-lo de fora seria reter conversa além do prazo.',
  reivindicar_recuperacao:
    'manutenção de linha, não contagem: o ensaio que perdeu a finalização ' +
    'porque a aba fechou precisa ser fechado pela varredura como qualquer outro.',
  reivindicar_precos_tardios:
    'custo real (T-20): o ensaio por voz gasta crédito do provedor, e o preço ' +
    'que chega tarde precisa ser gravado nele como em qualquer chamada.',
  gravar_preco_tardio:
    'custo real (T-20), pela razão de reivindicar_precos_tardios.',
  corrigir_classificacao:
    'ficha por id, não métrica (US-130): corrige uma chamada que a pessoa abriu, ' +
    'e o ensaio também pode ter a classificação corrigida na ficha dele.',
  reuniao_em_jogo:
    'chamada por id, não métrica (US-194): resolve a reunião da ligação do ' +
    'cabeçalho, e o ensaio do lembrete precisa ler a mesma reunião que a ligação leria.',
  confirmar_reuniao:
    'chamada por id, não métrica (US-195): a ferramenta nunca chega aqui no ' +
    'ensaio, porque o esqueleto pula o efeito (T-16); lê calls só para conferir a conta.',
  remarcar_reuniao:
    'chamada por id, não métrica (US-196), pela razão de confirmar_reuniao.',
  cancelar_reuniao_na_ligacao:
    'chamada por id, não métrica (US-196), pela razão de confirmar_reuniao.',
}

let banco: BancoDeTeste
let contaA: string
let donoA: string
let contaB: string
let donoB: string
const publicacoes = new Map<string, string>()

async function criarConta(nome: string, email: string): Promise<{ id: string; donoId: string }> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id
  const donoId = await banco.criarUsuario(email, nome)
  await banco.sql.query(
    "insert into public.account_members (account_id, user_id, role) values ($1, $2, 'owner')",
    [id, donoId],
  )
  const { rows: agentes } = await banco.sql.query<{ id: string }>(
    "insert into public.agents (account_id, name, company_name) values ($1, 'Sarah', $2) returning id",
    [id, nome],
  )
  const { rows: pubs } = await banco.sql.query<{ id: string }>(
    `insert into public.agent_publications (account_id, agent_id, purpose)
     values ($1, $2, 'discovery') returning id`,
    [id, agentes[0]!.id],
  )
  publicacoes.set(id, pubs[0]!.id)
  return { id, donoId }
}

async function chamadaReal(conta: string, status = 'ended'): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls (account_id, purpose, direction, status, idempotency_key)
     values ($1, 'discovery', 'outbound', $2, $3) returning id`,
    [conta, status, crypto.randomUUID()],
  )
  return rows[0]!.id
}

async function ensaio(conta: string): Promise<{ call_id: string; rehearsal_id: string }> {
  const { rows } = await banco.sql.query<{ call_id: string; rehearsal_id: string }>(
    `select call_id, rehearsal_id
       from public.abrir_ensaio($1, 'discovery', 'voice', '{}'::jsonb, null, $2, null)`,
    [conta, publicacoes.get(conta)],
  )
  return rows[0]!
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  await banco.comoServico()
  const a = await criarConta('Fretes do Vale', 'dono@fretes.test')
  contaA = a.id
  donoA = a.donoId
  const b = await criarConta('Metalúrgica Sul', 'dono@metal.test')
  contaB = b.id
  donoB = b.donoId
}, 120_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.dial_queue where account_id = any($1)', [[contaA, contaB]])
  await banco.sql.query('delete from public.call_attempts where account_id = any($1)', [[contaA, contaB]])
  await banco.sql.query('delete from public.calls where account_id = any($1)', [[contaA, contaB]])
})

// A visão ----------------------------------------------------------------------

test('com uma chamada real e um ensaio na mesma conta, a visão devolve uma', async () => {
  const real = await chamadaReal(contaA)
  await ensaio(contaA)

  const { rows } = await banco.sql.query<{ id: string }>(
    'select id from public.chamadas_reais where account_id = $1',
    [contaA],
  )
  expect(rows.map((linha) => linha.id)).toEqual([real])
})

test('a contagem das tentativas do dia pela visão não conta o ensaio', async () => {
  await chamadaReal(contaA)
  await ensaio(contaA)
  await ensaio(contaA)

  const { rows } = await banco.sql.query<{ total: number }>(
    `select count(*)::integer as total
       from public.chamadas_reais
      where account_id = $1
        and started_at >= date_trunc('day', now())`,
    [contaA],
  )
  expect(rows[0]?.total).toBe(1)
})

test('a chamada de ensaio continua acessível por id, porque a ficha dela existe', async () => {
  const { call_id } = await ensaio(contaA)

  await banco.comoUsuario(donoA)
  const { rows } = await banco.sql.query<{ direction: string }>(
    'select direction from public.calls where id = $1',
    [call_id],
  )
  expect(rows).toEqual([{ direction: 'rehearsal' }])
})

test('security_invoker: pela visão, cada conta vê as próprias chamadas e nenhuma da outra', async () => {
  const deA = await chamadaReal(contaA)
  const deB = await chamadaReal(contaB)

  for (const [dono, propria, alheia] of [
    [donoA, deA, deB],
    [donoB, deB, deA],
  ] as const) {
    await banco.comoUsuario(dono)
    const { rows } = await banco.sql.query<{ id: string }>('select id from public.chamadas_reais')
    const ids = rows.map((linha) => linha.id)
    expect(ids, 'a conta precisa ver a própria chamada').toContain(propria)
    expect(ids, 'a visão não pode furar a RLS de calls').not.toContain(alheia)
  }
})

test('a visão declara security_invoker e o comentário separa custo real de métrica', async () => {
  const { rows } = await banco.sql.query<{ opcoes: string[] | null; comentario: string | null }>(
    `select c.reloptions as opcoes, obj_description(c.oid, 'pg_class') as comentario
       from pg_class as c
      where c.oid = 'public.chamadas_reais'::regclass`,
  )
  expect(rows[0]?.opcoes).toContain('security_invoker=on')
  expect(rows[0]?.comentario).toMatch(/custo real/i)
  expect(rows[0]?.comentario).toMatch(/métrica de operação/i)
})

// A guarda e o teto --------------------------------------------------------------

test('uma sessão de ensaio, aberta e encerrada, não cria linha em call_attempts', async () => {
  const { rehearsal_id } = await ensaio(contaA)
  await banco.sql.query(
    `select public.encerrar_ensaio($1, '{"turns":[]}'::jsonb, 'conv-ensaio', 30)`,
    [rehearsal_id],
  )

  const { rows } = await banco.sql.query<{ total: number }>(
    'select count(*)::integer as total from public.call_attempts where account_id = $1',
    [contaA],
  )
  expect(rows[0]?.total).toBe(0)
})

test('a borda rehearsal-session não chama a guarda de discagem', () => {
  const pasta = new URL('../../supabase/functions/rehearsal-session/', import.meta.url)
  const fontes = readdirSync(pasta).filter((nome) => nome.endsWith('.ts') && !nome.endsWith('.test.ts'))
  expect(fontes.length).toBeGreaterThan(0)
  for (const nome of fontes) {
    const fonte = readFileSync(new URL(nome, pasta), 'utf8')
    expect({ nome, citaAGuarda: /guard_dial|guardarDiscagem|call_attempts/.test(fonte) }).toEqual({
      nome,
      citaAGuarda: false,
    })
  }
})

test('o ensaio em curso não ocupa vaga de discagem na fila', async () => {
  await banco.sql.query('update public.account_settings set max_concurrent = 1 where account_id = $1', [
    contaA,
  ])
  await ensaio(contaA)
  await banco.sql.query(
    `insert into public.dial_queue (account_id, purpose, source, source_ref)
     values ($1, 'discovery', 'manual', $2)`,
    [contaA, crypto.randomUUID()],
  )

  const { rows: situacao } = await banco.sql.query<{ ativas: number }>(
    'select ativas from public.situacao_da_fila(now()) where account_id = $1',
    [contaA],
  )
  expect(situacao[0]?.ativas).toBe(0)

  const { rows: tomados } = await banco.sql.query(
    'select id from public.reivindicar_da_fila($1, 5, now())',
    [contaA],
  )
  expect(tomados, 'com teto 1 e só o ensaio no ar, o item precisa sair').toHaveLength(1)
})

test('custo real continua: call_costs recebe o ensaio e a soma chega na chamada', async () => {
  const { call_id } = await ensaio(contaA)
  await banco.sql.query(
    `insert into public.call_costs (account_id, call_id, component, amount_cents, source)
     values ($1, $2, 'voice', 42, 'provider_webhook')`,
    [contaA, call_id],
  )

  const { rows } = await banco.sql.query<{ cost_cents: number }>(
    'select cost_cents from public.calls where id = $1',
    [call_id],
  )
  expect(rows[0]?.cost_cents).toBe(42)
})

// Varredura estrutural -------------------------------------------------------------

test('toda visão sobre calls cita direction', async () => {
  const { rows } = await banco.sql.query<{ visao: string; definicao: string }>(
    `select distinct v.relname as visao, pg_get_viewdef(v.oid) as definicao
       from pg_depend as d
       join pg_rewrite as r on r.oid = d.objid
       join pg_class as v on v.oid = r.ev_class
      where d.refobjid = 'public.calls'::regclass
        and v.oid <> 'public.calls'::regclass
        and v.relkind in ('v', 'm')`,
  )
  expect(rows.map((linha) => linha.visao)).toContain('chamadas_reais')
  for (const { visao, definicao } of rows) {
    expect({ visao, citaDirection: /direction/.test(definicao) }).toEqual({
      visao,
      citaDirection: true,
    })
  }
})

test('toda função que lê calls cita direction, lê de chamadas_reais, ou está isenta com razão', async () => {
  const { rows } = await banco.sql.query<{ funcao: string; corpo: string }>(
    `select p.proname as funcao, p.prosrc as corpo
       from pg_proc as p
       join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public'`,
  )
  const leitoras = rows.filter(({ corpo }) => /\b(from|join)\s+public\.calls\b/i.test(corpo))
  expect(leitoras.length, 'a varredura precisa achar alguma leitora de calls').toBeGreaterThan(0)

  const semFiltro = leitoras
    .filter(({ corpo }) => !/direction|chamadas_reais/.test(corpo))
    .map(({ funcao }) => funcao)
    .sort()
  const naoDeclaradas = semFiltro.filter((funcao) => !(funcao in ISENTAS))
  expect(
    naoDeclaradas,
    'função nova sobre calls sem direction: filtre por chamadas_reais ou declare em ISENTAS com a razão',
  ).toEqual([])

  const orfas = Object.keys(ISENTAS).filter((funcao) => !semFiltro.includes(funcao))
  expect(orfas, 'isenção de função que já filtra ou que não existe mais').toEqual([])
  for (const [funcao, razao] of Object.entries(ISENTAS)) {
    expect({ funcao, razaoEscrita: razao.trim().length > 40 }).toEqual({ funcao, razaoEscrita: true })
  }
})

test('as contagens de simultaneidade da fila leem de chamadas_reais', async () => {
  const { rows } = await banco.sql.query<{ funcao: string; corpo: string }>(
    `select p.proname as funcao, p.prosrc as corpo
       from pg_proc as p
       join pg_namespace as n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('situacao_da_fila', 'reivindicar_da_fila')
      order by p.proname`,
  )
  expect(rows.map(({ funcao, corpo }) => ({ funcao, viaVisao: /public\.chamadas_reais/.test(corpo) }))).toEqual([
    { funcao: 'reivindicar_da_fila', viaVisao: true },
    { funcao: 'situacao_da_fila', viaVisao: true },
  ])
})
