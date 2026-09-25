// O resumo do painel numa consulta só (US-143, L-21, RF-901 a RF-907, RF-518).
//
// O que este arquivo prova, sobre um cenário determinístico em setembro de
// 2026 (datas explícitas, sem relógio):
//
// 1. Os números do período: ligações, atendidas, taxa, duração média, nota
//    média, as três faixas de sentimento, o custo por componente e moeda e as
//    últimas ligações. O que cai fora de `[de, ate)` não entra.
// 2. O ensaio fica fora de toda métrica (T-16): uma chamada de ensaio atendida,
//    avaliada, com sentimento e custo, e um evento de etapa do lead sintético,
//    ambos dentro do período, e nenhum número muda.
// 3. O funil é por key: a taxa de passagem sobrevive ao renomear do rótulo.
// 4. Quem não é membro recebe sem_permissao; anon e service_role não executam.
// 5. As reuniões (D-01): marcadas, confirmadas, realizadas e faltas apuradas,
//    sem desfecho, comparecimento, próximas, custo por reunião realizada por
//    moeda e taxa de apuração, sem desfecho inferido e nulo sem base.
//
// Referência: migrações 20260930200000_resumo_do_painel.sql e
// 20261013100000_reunioes_no_painel.sql.

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

const DE = '2026-09-01T00:00:00Z'
const ATE = '2026-10-01T00:00:00Z'

let banco: BancoDeTeste
let contaA: string
let donoA: string
let donoB: string
const leads = new Map<string, string>()

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
  return { id, donoId }
}

async function criarLead(apelido: string, telefone: string, criadoEm: string): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, created_at)
     values ($1, $2, $3, $4) returning id`,
    [contaA, apelido, telefone, criadoEm],
  )
  leads.set(apelido, rows[0]!.id)
  return rows[0]!.id
}

async function mudancaDeEtapa(leadId: string, para: string, quando: string): Promise<void> {
  await banco.sql.query(
    `insert into public.lead_events (account_id, lead_id, kind, actor, payload, occurred_at)
     values ($1, $2, 'stage_change', 'system',
             jsonb_build_object('para', jsonb_build_object('key', $3::text, 'label', $3::text)), $4)`,
    [contaA, leadId, para, quando],
  )
}

interface Chamada {
  direcao?: 'outbound' | 'inbound' | 'rehearsal'
  lead?: string | null
  iniciada: string
  atendida?: boolean
  duracao?: number | null
  nota?: number | null
  sentimento?: number | null
  custos?: { componente: string; centavos: number; moeda: string }[]
}

async function chamada(c: Chamada): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls
       (account_id, lead_id, purpose, direction, status, idempotency_key,
        started_at, answered_at, duration_sec, evaluation_score, sentiment, end_reason)
     values ($1, $2, 'discovery', $3, 'ended', $4, $5,
             case when $6::boolean then $5::timestamptz else null end,
             $7, $8, $9, case when $6::boolean then 'completed' else 'no_answer' end)
     returning id`,
    [
      contaA,
      c.lead ?? null,
      c.direcao ?? 'outbound',
      crypto.randomUUID(),
      c.iniciada,
      c.atendida ?? false,
      c.duracao ?? null,
      c.nota ?? null,
      c.sentimento ?? null,
    ],
  )
  const id = rows[0]!.id
  for (const custo of c.custos ?? []) {
    await banco.sql.query(
      `insert into public.call_costs (account_id, call_id, component, amount_cents, currency, source)
       values ($1, $2, $3, $4, $5, 'provider_webhook')`,
      [contaA, id, custo.componente, custo.centavos, custo.moeda],
    )
  }
  return id
}

interface EtapaDoFunil {
  key: string
  label: string
  posicao: number
  entraram: number
  taxa_de_passagem: number | null
}

interface Resumo {
  ligacoes: { total: number; atendidas: number; taxa_de_atendimento: number | null; duracao_media_seg: number | null }
  funil: EtapaDoFunil[]
  avaliacao: { nota_media: number | null; avaliadas: number }
  sentimento: { positivo: number; neutro: number; negativo: number; sem_sentimento: number; piso: number }
  custo: {
    por_componente: { componente: string; moeda: string; centavos: number }[]
    total: { moeda: string; centavos: number }[]
  }
  ultimas_ligacoes: { id: string; lead_nome: string | null }[]
  reunioes: Record<string, number | null>
  custo_por_reuniao_realizada: { moeda: string; centavos: number }[] | null
  proximas_reunioes: number
  apuracao: Record<string, number | boolean | null>
}

async function resumoComoDono(de = DE, ate = ATE): Promise<Resumo> {
  await banco.comoUsuario(donoA)
  try {
    const { rows } = await banco.sql.query<{ resumo: Resumo }>(
      'select public.dashboard_summary($1, $2, $3) as resumo',
      [contaA, de, ate],
    )
    return rows[0]!.resumo
  } finally {
    await banco.comoServico()
  }
}

let ultimaDentro: string
let ensaioId: string

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  await banco.comoServico()
  const a = await criarConta('Fretes do Vale', 'dono@fretes.test')
  contaA = a.id
  donoA = a.donoId
  const b = await criarConta('Metalúrgica Sul', 'dono@metal.test')
  donoB = b.donoId

  // O funil: quatro leads nascem no período, um nasceu antes.
  const l1 = await criarLead('Marcos Ferreira', '+5511990000001', '2026-09-05T10:00:00Z')
  const l2 = await criarLead('Ana Prado', '+5511990000002', '2026-09-05T10:00:00Z')
  const l3 = await criarLead('Rui Torres', '+5511990000003', '2026-09-05T10:00:00Z')
  const l4 = await criarLead('Lia Moura', '+5511990000004', '2026-09-05T10:00:00Z')
  const l5 = await criarLead('Caio Reis', '+5511990000005', '2026-08-01T10:00:00Z')

  await mudancaDeEtapa(l1, 'contacted', '2026-09-06T10:00:00Z')
  await mudancaDeEtapa(l2, 'contacted', '2026-09-06T10:00:00Z')
  await mudancaDeEtapa(l3, 'contacted', '2026-09-06T10:00:00Z')
  await mudancaDeEtapa(l5, 'contacted', '2026-09-07T10:00:00Z')
  await mudancaDeEtapa(l1, 'qualified', '2026-09-08T10:00:00Z')
  await mudancaDeEtapa(l4, 'lost', '2026-09-08T10:00:00Z')
  // Fora do período: não conta.
  await mudancaDeEtapa(l2, 'qualified', '2026-10-05T10:00:00Z')

  // As ligações reais do período.
  await chamada({
    lead: l1, iniciada: '2026-09-10T10:00:00Z', atendida: true, duracao: 120, nota: 8, sentimento: 0.8,
    custos: [
      { componente: 'telephony', centavos: 30, moeda: 'BRL' },
      { componente: 'voice', centavos: 50, moeda: 'USD' },
    ],
  })
  await chamada({
    lead: l2, iniciada: '2026-09-11T10:00:00Z', atendida: true, duracao: 60, nota: 6, sentimento: -0.7,
    custos: [{ componente: 'telephony', centavos: 20, moeda: 'BRL' }],
  })
  await chamada({ lead: l3, iniciada: '2026-09-12T10:00:00Z' })
  ultimaDentro = await chamada({
    direcao: 'inbound', lead: l4, iniciada: '2026-09-13T10:00:00Z', atendida: true, duracao: 90, sentimento: 0.1,
  })

  // Fora do período: não conta.
  await chamada({
    lead: l1, iniciada: '2026-08-15T10:00:00Z', atendida: true, duracao: 999, nota: 1, sentimento: -1,
    custos: [{ componente: 'telephony', centavos: 999, moeda: 'BRL' }],
  })

  // O ensaio, dentro do período, com tudo o que uma métrica poderia contar.
  const { rows: sintetico } = await banco.sql.query<{ id: string }>(
    'select public.lead_de_ensaio($1) as id',
    [contaA],
  )
  await mudancaDeEtapa(sintetico[0]!.id, 'qualified', '2026-09-09T10:00:00Z')
  ensaioId = await chamada({
    direcao: 'rehearsal', lead: sintetico[0]!.id, iniciada: '2026-09-20T10:00:00Z',
    atendida: true, duracao: 300, nota: 10, sentimento: 1,
    custos: [{ componente: 'voice', centavos: 500, moeda: 'BRL' }],
  })
}, 120_000)

afterAll(async () => {
  await banco?.encerrar()
})

// Os números do período -----------------------------------------------------------

test('ligações do período: total, atendidas, taxa e duração média', async () => {
  const resumo = await resumoComoDono()
  expect(resumo.ligacoes).toEqual({
    total: 4,
    atendidas: 3,
    taxa_de_atendimento: 0.75,
    duracao_media_seg: 90,
  })
})

test('nota média da avaliação e distribuição de sentimento pela régua da fila', async () => {
  const resumo = await resumoComoDono()
  expect(resumo.avaliacao).toEqual({ nota_media: 7, avaliadas: 2 })
  expect(resumo.sentimento).toEqual({
    positivo: 1,
    neutro: 1,
    negativo: 1,
    sem_sentimento: 1,
    piso: -0.5,
  })
})

test('custo do período somado de call_costs por componente, sem misturar moeda', async () => {
  const resumo = await resumoComoDono()
  expect(resumo.custo).toEqual({
    por_componente: [
      { componente: 'telephony', moeda: 'BRL', centavos: 50 },
      { componente: 'voice', moeda: 'USD', centavos: 50 },
    ],
    total: [
      { moeda: 'BRL', centavos: 50 },
      { moeda: 'USD', centavos: 50 },
    ],
  })
})

test('últimas ligações do período, da mais recente para a mais antiga', async () => {
  const resumo = await resumoComoDono()
  expect(resumo.ultimas_ligacoes).toHaveLength(4)
  expect(resumo.ultimas_ligacoes[0]!.id).toBe(ultimaDentro)
  expect(resumo.ultimas_ligacoes.map((l) => l.lead_nome)).toEqual([
    'Lia Moura',
    'Rui Torres',
    'Ana Prado',
    'Marcos Ferreira',
  ])
})

test('funil do período por key, com a taxa de passagem entre etapas', async () => {
  const resumo = await resumoComoDono()
  expect(resumo.funil.map(({ key, entraram, taxa_de_passagem }) => ({ key, entraram, taxa_de_passagem }))).toEqual([
    { key: 'new', entraram: 4, taxa_de_passagem: null },
    { key: 'contacted', entraram: 4, taxa_de_passagem: 1 },
    { key: 'qualified', entraram: 1, taxa_de_passagem: 0.25 },
    { key: 'meeting_booked', entraram: 0, taxa_de_passagem: 0 },
    { key: 'won', entraram: 0, taxa_de_passagem: null },
    { key: 'lost', entraram: 1, taxa_de_passagem: null },
  ])
})

// O ensaio fica de fora (T-16) ----------------------------------------------------

test('a chamada de ensaio do período não aparece em número nenhum nem na lista', async () => {
  const resumo = await resumoComoDono()
  // O ensaio atendido, de 300 s, nota 10, sentimento 1 e 500 centavos em BRL
  // mudaria cada um destes se entrasse.
  expect(resumo.ligacoes.total).toBe(4)
  expect(resumo.ligacoes.atendidas).toBe(3)
  expect(resumo.avaliacao.avaliadas).toBe(2)
  expect(resumo.sentimento.positivo).toBe(1)
  expect(resumo.custo.total).toContainEqual({ moeda: 'BRL', centavos: 50 })
  expect(resumo.ultimas_ligacoes.map((l) => l.id)).not.toContain(ensaioId)
  // E o lead sintético, que chegou a qualified no período, não entra no funil.
  expect(resumo.funil.find((e) => e.key === 'qualified')!.entraram).toBe(1)
})

// A key sobrevive ao rótulo --------------------------------------------------------

test('renomear o rótulo da etapa não muda a contagem nem a taxa de passagem', async () => {
  await banco.sql.query(
    `update public.pipeline_stages set label = 'Tem fit'
      where account_id = $1 and key = 'qualified'`,
    [contaA],
  )
  try {
    const resumo = await resumoComoDono()
    expect(resumo.funil.find((e) => e.key === 'qualified')).toEqual({
      key: 'qualified',
      label: 'Tem fit',
      posicao: 2,
      entraram: 1,
      taxa_de_passagem: 0.25,
    })
  } finally {
    await banco.sql.query(
      `update public.pipeline_stages set label = 'Qualificado'
        where account_id = $1 and key = 'qualified'`,
      [contaA],
    )
  }
})

// Quem pede ------------------------------------------------------------------------

test('quem não é membro da conta recebe sem_permissao', async () => {
  await banco.comoUsuario(donoB)
  try {
    await expect(
      banco.sql.query('select public.dashboard_summary($1, $2, $3)', [contaA, DE, ATE]),
    ).rejects.toMatchObject({ message: 'sem_permissao', code: '42501' })
  } finally {
    await banco.comoServico()
  }
})

test('período vazio ou invertido é recusado com periodo_invalido', async () => {
  await expect(resumoComoDono(ATE, DE)).rejects.toMatchObject({ message: 'periodo_invalido' })
})

test('execução só para authenticated: public, anon e service_role ficam de fora', async () => {
  const { rows } = await banco.sql.query<{ grantee: string }>(
    `select grantee from information_schema.routine_privileges
      where routine_schema = 'public' and routine_name = 'dashboard_summary'
        and privilege_type = 'EXECUTE'
      order by grantee`,
  )
  const papeis = rows.map((r) => r.grantee)
  expect(papeis).toContain('authenticated')
  expect(papeis).not.toContain('PUBLIC')
  expect(papeis).not.toContain('anon')
  expect(papeis).not.toContain('service_role')
})

// As reuniões (D-01, migração 20261013100000) --------------------------------------
//
// O cenário das reuniões mora em torno de agora, porque "horário já passou" e
// "próxima" são lidos contra `now()` do banco. Cada reunião tem o seu lead,
// para o custo por reunião realizada só ver a ligação do lead dela.

const DIA = 86_400_000
const antes = (dias: number) => new Date(Date.now() - dias * DIA).toISOString()
const depois = (dias: number) => new Date(Date.now() + dias * DIA).toISOString()

async function reuniao(r: {
  lead: string
  especialista: string
  inicio: string
  criada: string
  status?: string
  apurada?: boolean
  confirmada?: string | null
  motivo?: string | null
}): Promise<void> {
  const fim = new Date(Date.parse(r.inicio) + 30 * 60_000).toISOString()
  await banco.sql.query(
    `insert into public.meetings
       (account_id, lead_id, specialist_id, starts_at, ends_at, modality, status,
        attestation_status, attested_at, attested_source, confirmed_at, cancel_reason, created_at)
     values ($1, $2, $3, $4, $5, 'video', $6,
             case when $7::boolean then 'attested' else 'pending' end,
             case when $7::boolean then now() end,
             case when $7::boolean then 'manual' end,
             $8, $9, $10)`,
    [contaA, r.lead, r.especialista, r.inicio, fim, r.status ?? 'scheduled', r.apurada ?? false,
     r.confirmada ?? null, r.motivo ?? null, r.criada],
  )
}

async function resumoDasReunioes(): Promise<Record<string, unknown>> {
  return (await resumoComoDono(antes(30), depois(30))) as unknown as Record<string, unknown>
}

describe('reuniões no painel', () => {
  beforeAll(async () => {
    await banco.comoServico()
    const { rows } = await banco.sql.query<{ id: string }>(
      `insert into public.specialists (account_id, name, email, modalities, timezone, active)
       values ($1, 'Helena Costa', 'helena@fretes.test', array['video']::text[], 'America/Sao_Paulo', true)
       returning id`,
      [contaA],
    )
    const helena = rows[0]!.id
    const realizada = await criarLead('Reunião realizada', '+5511990000011', antes(20))
    const falta = await criarLead('Reunião com falta', '+5511990000012', antes(20))
    const semApuracao = await criarLead('Reunião sem desfecho', '+5511990000013', antes(20))
    const proxima = await criarLead('Reunião futura', '+5511990000014', antes(20))
    const cancelada = await criarLead('Reunião cancelada', '+5511990000015', antes(20))

    // A ligação que marcou a reunião realizada, com preço nas duas moedas.
    await chamada({
      lead: realizada, iniciada: antes(10), atendida: true, duracao: 200,
      custos: [
        { componente: 'telephony', centavos: 40, moeda: 'BRL' },
        { componente: 'voice', centavos: 10, moeda: 'USD' },
      ],
    })
    // A ligação depois da reunião não é custo dela.
    await chamada({
      lead: realizada, iniciada: antes(1), atendida: true, duracao: 60,
      custos: [{ componente: 'telephony', centavos: 999, moeda: 'BRL' }],
    })

    await reuniao({ lead: realizada, especialista: helena, inicio: antes(5), criada: antes(10), status: 'attended', apurada: true })
    await reuniao({ lead: falta, especialista: helena, inicio: antes(4), criada: antes(9), status: 'no_show', apurada: true })
    await reuniao({ lead: semApuracao, especialista: helena, inicio: antes(3), criada: antes(8), confirmada: antes(7) })
    await reuniao({ lead: proxima, especialista: helena, inicio: depois(3), criada: antes(1) })
    await reuniao({
      lead: cancelada, especialista: helena, inicio: antes(2), criada: antes(2),
      status: 'canceled', apurada: true, motivo: 'O lead desistiu.',
    })
  })

  test('marcadas, confirmadas, realizadas, faltas e sem desfecho saem do dado', async () => {
    const resumo = await resumoDasReunioes()
    expect(resumo.reunioes).toEqual({
      marcadas: 5,
      confirmadas: 1,
      realizadas: 1,
      faltas: 1,
      taxa_de_comparecimento: 0.5,
      sem_apuracao: 1,
    })
  })

  test('a reunião sem desfecho não vira falta nem realizada (RF-516)', async () => {
    const resumo = await resumoDasReunioes()
    const reunioes = resumo.reunioes as Record<string, number>
    expect((reunioes.realizadas ?? 0) + (reunioes.faltas ?? 0)).toBe(2)
    expect(reunioes.sem_apuracao).toBe(1)
  })

  test('próximas reuniões conta as ativas daqui em diante', async () => {
    expect((await resumoDasReunioes()).proximas_reunioes).toBe(1)
  })

  test('custo por reunião realizada por moeda, só com as ligações antes da reunião', async () => {
    expect((await resumoDasReunioes()).custo_por_reuniao_realizada).toEqual([
      { moeda: 'BRL', centavos: 40 },
      { moeda: 'USD', centavos: 10 },
    ])
  })

  test('taxa de apuração das reuniões passadas e a degradação abaixo de 70%', async () => {
    // Passadas e não canceladas: a realizada, a falta e a sem desfecho. Duas apuradas.
    expect((await resumoDasReunioes()).apuracao).toEqual({
      taxa_de_apuracao: 0.6667,
      degradacao_da_metrica_norte: true,
    })
  })

  test('sem reunião realizada no período, o custo por reunião é nulo, nunca zero', async () => {
    const resumo = (await resumoComoDono(depois(60), depois(90))) as unknown as Record<string, unknown>
    expect(resumo.custo_por_reuniao_realizada).toBeNull()
    expect((resumo.reunioes as Record<string, unknown>).taxa_de_comparecimento).toBeNull()
    expect((resumo.apuracao as Record<string, unknown>).taxa_de_apuracao).toBeNull()
  })

  test('nenhum campo devolve mais indisponivel_nesta_fase', async () => {
    expect(JSON.stringify(await resumoDasReunioes())).not.toContain('indisponivel_nesta_fase')
  })
})
