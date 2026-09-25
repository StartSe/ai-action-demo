// O especialista é quem recebe a reunião, e esta migração existe para que a
// regra de *quando* ele pode recebê-la seja coluna e não constante no código.
// O que se prova aqui:
//
// 1. Os padrões do critério de aceite da F5 nascem da coluna: 30 minutos de
//    duração, teto de 6 por dia, 120 minutos de antecedência mínima e 30 dias
//    de máxima. Se amanhã alguém mudar um deles na ferramenta em vez da coluna,
//    estes testes continuam verdes e o dado é que fica errado — por isso a
//    asserção é sobre o insert mínimo, sem citar número nenhum na chamada.
// 2. O fuso nasce com o da conta (T-21) e quem informa fuso próprio fica com o
//    dele.
// 3. Cada check recusa o valor proibido, um a um. Um check que nunca viu o
//    valor proibido não é restrição, é comentário.
// 4. Classe Configuração: membro lê, administrador escreve, operador não.
// 5. A conta vizinha recebe zero linha, e a sessão anônima também.
// 6. `last_assigned_at` fica fora da trilha de auditoria (L-16): é marca de
//    rodízio escrita pelo servidor a cada agendamento.
//
// Referência: migração 20260921170000_especialistas.sql,
// docs/PRD-implementacao.md seções 3.3 e 3.9, docs/PRD.md RF-501, RF-504 e
// RF-505, docs/revisao-tecnica.md T-21 e L-16.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly fuso: string
  readonly adminId: string
  readonly operadorId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

async function criarConta(
  nome: string,
  dominio: string,
  fuso: string,
): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name, timezone) values ($1, $2) returning id',
    [nome, fuso],
  )
  const id = rows[0]!.id

  const adminId = await banco.criarUsuario(`admin@${dominio}`, 'Admin')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')

  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'admin'), ($1, $3, 'operator')`,
    [id, adminId, operadorId],
  )

  return { id, fuso, adminId, operadorId }
}

/** Insert mínimo: só o que não tem padrão. O resto vem da coluna. */
async function semearEspecialista(
  conta: Conta,
  nome: string,
  extras: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const colunas: string[] = []
  const valores: unknown[] = []
  const marcadores: string[] = []

  // `extras` sobrepõe o mínimo em vez de se somar a ele: sem isso, testar um
  // valor recusado de `modalities` citaria a coluna duas vezes e o erro seria
  // de sintaxe, não da restrição que se quer ver cair.
  const campos: Record<string, unknown> = {
    account_id: conta.id,
    name: nome,
    email: `${nome}@especialistas.test`,
    modalities: ['video'],
    ...extras,
  }

  for (const [coluna, valor] of Object.entries(campos)) {
    colunas.push(coluna)
    valores.push(valor)
    marcadores.push(`$${valores.length}`)
  }

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.specialists (${colunas.join(', ')})
     values (${marcadores.join(', ')})
     returning id`,
    valores,
  )
  return rows[0]!.id
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test', 'America/Bahia')
  contaB = await criarConta('Cooperativa Sul', 'sul.test', 'America/Sao_Paulo')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

// Papel deixado por um teste anterior não contamina o próximo.
beforeEach(async () => {
  await banco.comoServico()
})

test('os padrões do critério de aceite nascem da coluna', async () => {
  const id = await semearEspecialista(contaA, 'padroes')

  const { rows } = await banco.sql.query<{
    default_duration_min: number
    daily_cap: number
    min_notice_min: number
    max_notice_days: number
    active: boolean
    last_assigned_at: string | null
    room_url: string | null
    area: string | null
  }>(
    `select default_duration_min, daily_cap, min_notice_min, max_notice_days,
            active, last_assigned_at, room_url, area
       from public.specialists where id = $1`,
    [id],
  )

  expect(rows[0]).toMatchObject({
    default_duration_min: 30,
    daily_cap: 6,
    min_notice_min: 120,
    max_notice_days: 30,
    active: true,
  })
  // Sem link de sala e sem área é cadastro válido: RF-501 registra que a
  // referência não guardava link, e nem toda conta roteia por área.
  expect(rows[0]?.room_url).toBeNull()
  expect(rows[0]?.area).toBeNull()
  // Ninguém recebeu reunião ainda, então o rodízio não tem marca.
  expect(rows[0]?.last_assigned_at).toBeNull()
})

test('o fuso nasce com o da conta e o informado prevalece', async () => {
  const herdado = await semearEspecialista(contaA, 'herda-o-fuso')
  const proprio = await semearEspecialista(contaA, 'fuso-proprio', {
    timezone: 'Europe/Lisbon',
  })

  const { rows } = await banco.sql.query<{ id: string; timezone: string }>(
    'select id, timezone from public.specialists where id = any($1)',
    [[herdado, proprio]],
  )
  const fusos = new Map(rows.map((linha) => [linha.id, linha.timezone]))

  expect(fusos.get(herdado)).toBe(contaA.fuso)
  expect(fusos.get(proprio)).toBe('Europe/Lisbon')
})

const VALORES_RECUSADOS: {
  caso: string
  coluna: string
  valor: unknown
  restricao: RegExp
}[] = [
  {
    caso: 'modalidade que a Sarah não sabe oferecer',
    coluna: 'modalities',
    valor: ['video', 'telepatia'],
    restricao: /specialists_modalidades_conhecidas/i,
  },
  {
    caso: 'nenhuma modalidade',
    coluna: 'modalities',
    valor: [],
    restricao: /specialists_modalidades_conhecidas/i,
  },
  {
    caso: 'reunião curta demais para acontecer',
    coluna: 'default_duration_min',
    valor: 10,
    restricao: /specialists_duracao_util/i,
  },
  {
    caso: 'reunião de um dia inteiro',
    coluna: 'default_duration_min',
    valor: 300,
    restricao: /specialists_duracao_util/i,
  },
  {
    caso: 'teto diário zerado, que é o mesmo que desativar sem dizer',
    coluna: 'daily_cap',
    valor: 0,
    restricao: /specialists_teto_util/i,
  },
  {
    caso: 'teto diário de agenda impossível',
    coluna: 'daily_cap',
    valor: 21,
    restricao: /specialists_teto_util/i,
  },
  {
    caso: 'antecedência mínima negativa',
    coluna: 'min_notice_min',
    valor: -1,
    restricao: /specialists_antecedencia_minima/i,
  },
  {
    caso: 'antecedência mínima maior que uma semana',
    coluna: 'min_notice_min',
    valor: 10_081,
    restricao: /specialists_antecedencia_minima/i,
  },
  {
    caso: 'antecedência máxima de zero dia',
    coluna: 'max_notice_days',
    valor: 0,
    restricao: /specialists_antecedencia_maxima/i,
  },
  {
    caso: 'antecedência máxima de mais de três meses',
    coluna: 'max_notice_days',
    valor: 91,
    restricao: /specialists_antecedencia_maxima/i,
  },
  {
    caso: 'fuso em branco',
    coluna: 'timezone',
    valor: '   ',
    restricao: /timezone_check|specialists/i,
  },
  {
    caso: 'área com nome em branco',
    coluna: 'area',
    valor: ' ',
    restricao: /area_check|specialists/i,
  },
  {
    caso: 'link de sala em branco',
    coluna: 'room_url',
    valor: '',
    restricao: /room_url_check|specialists/i,
  },
]

test.each(VALORES_RECUSADOS)(
  'o banco recusa $caso',
  async ({ caso, coluna, valor, restricao }) => {
    await expect(
      semearEspecialista(contaA, `recusado-${coluna}-${caso.length}`, {
        [coluna]: valor,
      }),
    ).rejects.toThrow(restricao)
  },
)

test('o e-mail sem arroba é recusado, e o e-mail é obrigatório', async () => {
  await expect(
    banco.sql.query(
      `insert into public.specialists (account_id, name, email, modalities)
       values ($1, 'sem arroba', 'contato.exemplo.test', array['video']::text[])`,
      [contaA.id],
    ),
  ).rejects.toThrow(/email_check|specialists/i)

  await expect(
    banco.sql.query(
      `insert into public.specialists (account_id, name, modalities)
       values ($1, 'sem e-mail', array['video']::text[])`,
      [contaA.id],
    ),
  ).rejects.toThrow(/null value in column "email"/i)
})

test('o mesmo nome não entra duas vezes na conta, nem com outra caixa', async () => {
  await semearEspecialista(contaA, 'Marina Duarte')

  await expect(
    banco.sql.query(
      `insert into public.specialists (account_id, name, email, modalities)
       values ($1, '  marina duarte ', 'outra@aurora.test', array['video']::text[])`,
      [contaA.id],
    ),
  ).rejects.toThrow(/specialists_nome_por_conta/i)

  // O mesmo nome na conta vizinha é outra pessoa, e entra.
  const naVizinha = await semearEspecialista(contaB, 'Marina Duarte')
  expect(naVizinha).toBeTruthy()
})

test('o administrador cadastra especialista e o operador não', async () => {
  await banco.comoUsuario(contaA.operadorId)
  await expect(
    banco.sql.query(
      `insert into public.specialists (account_id, name, email, modalities)
       values ($1, 'cadastrado pelo operador', 'op@aurora.test', array['video']::text[])`,
      [contaA.id],
    ),
  ).rejects.toThrow(/row-level security/i)

  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ id: string; timezone: string }>(
    `insert into public.specialists (account_id, name, email, modalities)
       values ($1, 'cadastrado pelo admin', 'adm@aurora.test', array['telefone']::text[])
     returning id, timezone`,
    [contaA.id],
  )
  expect(rows).toHaveLength(1)
  // O gatilho do fuso é `security definer` e continua valendo sob RLS.
  expect(rows[0]?.timezone).toBe(contaA.fuso)
})

test('o operador lê os especialistas e não muda o teto de ninguém', async () => {
  const id = await semearEspecialista(contaA, 'teto-do-operador')

  await banco.comoUsuario(contaA.operadorId)

  const { rows: lidas } = await banco.sql.query(
    'select id from public.specialists where id = $1',
    [id],
  )
  expect(lidas).toHaveLength(1)

  // RLS que não casa não levanta erro: simplesmente não afeta linha.
  const { rows: escritas } = await banco.sql.query(
    'update public.specialists set daily_cap = 20 where id = $1 returning id',
    [id],
  )
  expect(escritas).toEqual([])
})

test('a conta vizinha não aparece para quem lê, e o anônimo não lê nada', async () => {
  await semearEspecialista(contaA, 'visivel-na-aurora')
  await semearEspecialista(contaB, 'visivel-na-sul')

  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.specialists',
  )
  expect(rows.length).toBeGreaterThan(0)
  expect(rows.every((linha) => linha.account_id === contaA.id)).toBe(true)
  expect(rows.some((linha) => linha.account_id === contaB.id)).toBe(false)

  await banco.comoAnonimo()
  const { rows: anonimas } = await banco.sql.query(
    'select id from public.specialists',
  )
  expect(anonimas).toEqual([])
})

test('a marca do rodízio não entra na trilha, mas o teto entra', async () => {
  const id = await semearEspecialista(contaA, 'marca-de-rodizio')

  await banco.sql.query(
    'update public.specialists set last_assigned_at = now() where id = $1',
    [id],
  )
  const { rows: semTrilha } = await banco.sql.query(
    `select id from public.audit_log
      where target_type = 'specialists' and target_id = $1`,
    [id],
  )
  expect(semTrilha).toEqual([])

  await banco.sql.query(
    'update public.specialists set daily_cap = 4 where id = $1',
    [id],
  )
  const { rows: comTrilha } = await banco.sql.query<{ payload: { campos: string[] } }>(
    `select payload from public.audit_log
      where target_type = 'specialists' and target_id = $1`,
    [id],
  )
  expect(comTrilha).toHaveLength(1)
  expect(comTrilha[0]?.payload.campos).toEqual(['daily_cap'])
})

test('updated_at não aceita data vinda de fora', async () => {
  const id = await semearEspecialista(contaA, 'carimbo-do-servidor')

  const { rows } = await banco.sql.query<{
    updated_at: string
    created_at: string
  }>(
    `update public.specialists
        set daily_cap = 5, updated_at = '2001-01-01T00:00:00Z'
      where id = $1
      returning updated_at, created_at`,
    [id],
  )

  expect(rows[0]!.updated_at >= rows[0]!.created_at).toBe(true)
})
