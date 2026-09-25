// Configuração inicial: o que a conta já tem, o que falta e o que cada falta
// impede. A promessa da história é uma só — a pendência é medida no dado, não
// declarada por quem preenche o checklist — e é ela que estes testes cercam:
//
// 1. Toda conta nasce com estado, no primeiro passo.
// 2. `onboarding_health` devolve um passo por linha, dizendo se está pendente
//    e o que ele bloqueia. Sem número não há ligação; sem especialista não há
//    agendamento.
// 3. Marcar o passo não apaga a pendência, e o cliente não escreve o retrato.
//
// Referência: docs/PRD.md RF-911 e docs/PRD-implementacao.md seções 3.8 e 4.5.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** Erro que a RLS levanta quando o `with check` recusa a linha. */
const RECUSA_DE_RLS = /row-level security/i

interface Conta {
  readonly id: string
  readonly donoId: string
  readonly operadorId: string
}

interface LinhaDeSaude {
  passo: string
  ordem: number
  pendente: boolean
  marcado: boolean
  disponivel: boolean
  bloqueia: string[]
  aprovacao_externa: boolean
  estado: 'pendente' | 'aguardando_aprovacao' | 'concluido'
}

interface Retrato {
  calculado_em: string
  pendentes: number
  aguardando: number
  bloqueado: string[]
  passos: { passo: string; pendente: boolean; estado: string }[]
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await montarConta('A')
  contaB = await montarConta('B')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.audit_log')
  // Cada teste parte do estado recém-criado: o que um teste escreve não
  // decide o resultado do seguinte.
  await banco.sql.query(
    `update public.onboarding_state
        set current_step = 'credenciais',
            completed_steps = array[]::text[],
            dismissed_at = null,
            test_call_id = null`,
  )
  await banco.sql.query('delete from public.account_secrets')
  await limparRetrato()
})

/**
 * Zera a coluna `health`. Precisa abrir o portão da sessão porque o gatilho
 * descarta escrita que não venha do refresh — inclusive a do superusuário, que
 * é justamente o que se quer provar. O portão fecha na linha seguinte.
 */
async function limparRetrato(): Promise<void> {
  await banco.sql.query(
    "select set_config('app.onboarding_retrato', 'on', false)",
  )
  await banco.sql.query(
    "update public.onboarding_state set health = '{}'::jsonb",
  )
  await banco.sql.query("select set_config('app.onboarding_retrato', '', false)")
}

async function montarConta(rotulo: string): Promise<Conta> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [`Conta ${rotulo}`],
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`Não foi possível criar a conta ${rotulo}`)

  const donoId = await banco.criarUsuario(
    `dono.${rotulo.toLowerCase()}@configuracao.test`,
    `Dono ${rotulo}`,
  )
  const operadorId = await banco.criarUsuario(
    `operador.${rotulo.toLowerCase()}@configuracao.test`,
    `Operador ${rotulo}`,
  )
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'operator')`,
    [id, donoId, operadorId],
  )

  return { id, donoId, operadorId }
}

/** A medição como o usuário a enxerga, já indexada por passo. */
async function saudeDe(
  conta: Conta,
  usuarioId: string,
): Promise<Map<string, LinhaDeSaude>> {
  await banco.comoUsuario(usuarioId)
  const { rows } = await banco.sql.query<LinhaDeSaude>(
    'select * from public.onboarding_health($1) order by ordem',
    [conta.id],
  )
  return new Map(rows.map((linha) => [linha.passo, linha]))
}

async function passo(
  conta: Conta,
  usuarioId: string,
  nome: string,
): Promise<LinhaDeSaude> {
  const linha = (await saudeDe(conta, usuarioId)).get(nome)
  if (!linha) throw new Error(`o catálogo não tem o passo ${nome}`)
  return linha
}

/** Roda a manobra e desfaz tudo o que ela fizer, inclusive o DDL. */
async function descartando(manobra: () => Promise<void>): Promise<void> {
  await banco.sql.query('begin')
  try {
    await manobra()
  } finally {
    await banco.comoServico()
    await banco.sql.query('rollback')
  }
}

// O estado --------------------------------------------------------------------

test('toda conta nasce com estado de configuração, no primeiro passo', async () => {
  const { rows } = await banco.sql.query<{
    current_step: string | null
    completed_steps: string[]
    dismissed_at: string | null
    health: Record<string, unknown>
  }>(
    `select current_step, completed_steps, dismissed_at, health
       from public.onboarding_state
      where account_id = $1`,
    [contaA.id],
  )

  expect(rows).toHaveLength(1)
  expect(rows[0]?.current_step).toBe('credenciais')
  expect(rows[0]?.completed_steps).toEqual([])
  expect(rows[0]?.dismissed_at).toBeNull()
  expect(rows[0]?.health).toEqual({})
})

test('passo fora do catálogo não entra em completed_steps nem em current_step', async () => {
  await expect(
    banco.sql.query(
      `update public.onboarding_state
          set completed_steps = array['numero', 'teletransporte']
        where account_id = $1`,
      [contaA.id],
    ),
  ).rejects.toThrow(/passos_conhecidos|check/i)

  await expect(
    banco.sql.query(
      `update public.onboarding_state set current_step = 'teletransporte'
        where account_id = $1`,
      [contaA.id],
    ),
  ).rejects.toThrow(/passos_conhecidos|check/i)
})

test('o catálogo tem os oito passos do assistente, em ordem, sem repetir', async () => {
  const { rows } = await banco.sql.query<{ passo: string; ordem: number }>(
    'select passo, ordem from public.passos_de_configuracao() order by ordem',
  )

  expect(rows.map((linha) => linha.passo)).toEqual([
    'credenciais',
    'agente',
    'roteiro',
    'numero',
    'especialista',
    'agenda',
    'leads',
    'equipe',
  ])
  expect(rows.map((linha) => linha.ordem)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
})

// A medição -------------------------------------------------------------------

test('a conta nova tem tudo pendente, menos o que o próprio cenário já resolveu', async () => {
  const saude = await saudeDe(contaA, contaA.donoId)

  expect(saude.size).toBe(8)
  for (const [nome, linha] of saude) {
    // A conta tem dono e operador, e é isso que resolve o passo da equipe:
    // a medição olha o dado, e o dado está lá.
    expect(linha.pendente, `${nome} está do lado errado da medição`).toBe(
      nome !== 'equipe',
    )
    expect(linha.marcado).toBe(false)
  }
})

test('sem número não há ligação; sem especialista não há agendamento', async () => {
  const numero = await passo(contaA, contaA.donoId, 'numero')
  expect(numero.pendente).toBe(true)
  expect(numero.bloqueia).toContain('ligacao')

  const especialista = await passo(contaA, contaA.donoId, 'especialista')
  expect(especialista.pendente).toBe(true)
  expect(especialista.bloqueia).toContain('agendamento')

  // O passo opcional é o que não bloqueia nada, e a lista vazia é a resposta.
  const equipe = await passo(contaA, contaA.donoId, 'equipe')
  expect(equipe.bloqueia).toEqual([])
})

test('todo passo do catálogo já tem tabela onde ser medido', async () => {
  const saude = await saudeDe(contaA, contaA.donoId)

  // `phone_lines` era a última tabela do catálogo que faltava, e a F2 a criou:
  // nenhum passo devolve mais "pendente e ainda sem onde resolver". A lista
  // encolheu uma fatia por vez — `leads` na F1, `especialista` na F5, `agente`
  // e `roteiro` no começo da F2, `numero` agora. Passo novo do catálogo que
  // apontar para tabela de fatia futura volta a aparecer aqui.
  for (const [nome, linha] of saude) {
    expect(linha.disponivel, `${nome} ficou sem tabela onde medir`).toBe(true)
  }
  expect(saude.get('numero')?.pendente).toBe(true)
  expect(saude.get('leads')?.pendente).toBe(true)
})

test('cadastrar o primeiro lead resolve o passo dos leads', async () => {
  await descartando(async () => {
    await banco.comoServico()
    await banco.sql.query(
      `insert into public.leads (account_id, phone_e164, name)
       values ($1, '+5548999997777', 'Primeiro lead')`,
      [contaA.id],
    )

    expect((await passo(contaA, contaA.donoId, 'leads')).pendente).toBe(false)
    // A conta vizinha não herda o lead de ninguém.
    expect((await passo(contaB, contaB.donoId, 'leads')).pendente).toBe(true)
  })
})

test('a assistente só com nome não resolve o passo do agente; com a empresa, resolve', async () => {
  await descartando(async () => {
    await banco.comoServico()
    // O tutorial grava o nome logo depois das boas-vindas, e a empresa só
    // chega na conversa sobre o negócio.
    const { rows } = await banco.sql.query<{ id: string }>(
      `insert into public.agents (account_id, name) values ($1, 'Ana') returning id`,
      [contaA.id],
    )
    expect((await passo(contaA, contaA.donoId, 'agente')).pendente).toBe(true)

    await banco.comoServico()
    await banco.sql.query(`update public.agents set company_name = 'Aurora Energia' where id = $1`, [
      rows[0]?.id,
    ])
    expect((await passo(contaA, contaA.donoId, 'agente')).pendente).toBe(false)
    expect((await passo(contaB, contaB.donoId, 'agente')).pendente).toBe(true)
  })
})

test('cadastrar a linha telefônica resolve o passo do número', async () => {
  await descartando(async () => {
    const vazia = await passo(contaA, contaA.donoId, 'numero')
    expect(vazia.disponivel).toBe(true)
    expect(vazia.pendente).toBe(true)

    await banco.comoServico()
    await banco.sql.query(
      `insert into public.phone_lines (account_id, e164, label)
       values ($1, '+5511940000001', 'linha comercial')`,
      [contaA.id],
    )

    const comLinha = await passo(contaA, contaA.donoId, 'numero')
    expect(comLinha.pendente).toBe(false)
    // A conta vizinha não herda o número de ninguém.
    expect((await passo(contaB, contaB.donoId, 'numero')).pendente).toBe(true)
  })
})

test('a linha desligada não resolve o passo do número', async () => {
  await descartando(async () => {
    await banco.comoServico()
    await banco.sql.query(
      `insert into public.phone_lines (account_id, e164, label, enabled)
       values ($1, '+5511940000002', 'linha desligada', false)`,
      [contaA.id],
    )

    // Linha desligada é o mesmo que linha inexistente para quem disca, e a
    // condição do catálogo (`enabled`) é o que diz isso à medição.
    expect((await passo(contaA, contaA.donoId, 'numero')).pendente).toBe(true)
  })
})

test('o passo fica sem onde resolver quando a tabela da fase não existe', async () => {
  await descartando(async () => {
    // Nenhum passo do catálogo aponta mais para tabela de fatia futura, então
    // o mecanismo se exercita ao contrário: some com a tabela e o passo volta
    // a ser "pendente e ainda sem onde resolver". O rollback de `descartando`
    // a traz de volta — DDL no Postgres é transacional.
    await banco.sql.query('drop table public.phone_lines cascade')

    const semTabela = await passo(contaA, contaA.donoId, 'numero')
    expect(semTabela.disponivel).toBe(false)
    expect(semTabela.pendente).toBe(true)
  })
})

test('cadastrar a chave de voz resolve o passo das credenciais', async () => {
  await banco.comoServico()
  await banco.sql.query(
    `insert into public.account_secrets (account_id, provider, key_name, secret_id)
     values ($1, 'voz', 'api_key', vault.create_secret('chave-de-teste', $2))`,
    [contaA.id, `configuracao:${contaA.id}:voz`],
  )

  expect((await passo(contaA, contaA.donoId, 'credenciais')).pendente).toBe(false)
  // A chave de outro provedor não conta pelo provedor de voz.
  expect((await passo(contaB, contaB.donoId, 'credenciais')).pendente).toBe(true)
})

test('marcar o passo não apaga a pendência: o dado é que decide', async () => {
  await banco.comoServico()
  await banco.sql.query(
    `update public.onboarding_state set completed_steps = array['numero']
      where account_id = $1`,
    [contaA.id],
  )

  const numero = await passo(contaA, contaA.donoId, 'numero')
  expect(numero.marcado).toBe(true)
  expect(numero.pendente).toBe(true)
  expect(numero.bloqueia).toContain('ligacao')
})

test('a medição da conta vizinha está fora do alcance', async () => {
  await banco.comoUsuario(contaA.donoId)
  await expect(
    banco.sql.query('select * from public.onboarding_health($1)', [contaB.id]),
  ).rejects.toThrow(/conta de que se participa/i)

  await banco.comoAnonimo()
  await expect(
    banco.sql.query('select * from public.onboarding_health($1)', [contaA.id]),
  ).rejects.toThrow(/permission denied|conta de que se participa/i)
})

// A espera externa -------------------------------------------------------------
// Dois passos não se resolvem por quem administra a conta: o número espera a
// operadora e a agenda espera a verificação do aplicativo OAuth do Google para
// escopo sensível de calendário (docs/revisao-tecnica.md P-04 e O-03). Mostrar
// "pendente" nos dois manda agir sobre o que não depende de ninguém daqui, e é
// por isso que o passo tem um terceiro estado.

/** A tabela onde a evidência de um passo mora já existe neste banco? */
async function tabelaExiste(nome: string): Promise<boolean> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ existe: boolean }>(
    "select to_regclass('public.' || $1) is not null as existe",
    [nome],
  )
  return rows[0]?.existe === true
}

/**
 * Roda a manobra com uma tabela de evidência mínima no lugar da real, e desfaz
 * tudo depois. A prova é sobre a regra de estado, não sobre o esquema que a
 * fase de agenda vai desenhar: quando `specialist_calendars` chegar de verdade,
 * o substituto toma o lugar dela dentro da transação descartada e a prova
 * continua sendo a mesma.
 */
async function comEvidenciaDe(
  tabela: string,
  manobra: () => Promise<void>,
): Promise<void> {
  await descartando(async () => {
    await banco.comoServico()
    await banco.sql.query(`drop table if exists public.${tabela} cascade`)
    await banco.sql.query(
      `create table public.${tabela} (
         id uuid primary key default gen_random_uuid(),
         account_id uuid not null references public.accounts (id) on delete cascade
       )`,
    )
    await manobra()
  })
}

test('o catálogo separa o que a conta resolve do que ela espera de terceiro', async () => {
  const { rows } = await banco.sql.query<{
    passo: string
    tabela: string
    bloqueia: string[]
    aprovacao_externa: boolean
  }>(
    `select passo, tabela, bloqueia, aprovacao_externa
       from public.passos_de_configuracao()
      order by ordem`,
  )

  const agenda = rows.find((linha) => linha.passo === 'agenda')
  expect(agenda?.tabela).toBe('specialist_calendars')
  expect(agenda?.bloqueia).toEqual(['agendamento'])
  // A agenda deixou de esperar o Google (20261012110000): o endereço iCal se
  // cola na hora.
  expect(agenda?.aprovacao_externa).toBe(false)

  // Só o número espera alguém de fora. O resto se resolve com o que a conta
  // tem em mãos, e prometer espera onde não há mandaria ninguém agir onde a
  // ação resolve.
  expect(
    rows.filter((linha) => linha.aprovacao_externa).map((linha) => linha.passo),
  ).toEqual(['numero'])
})

test('o passo da agenda não espera ninguém de fora: marcar não o põe em espera, e o calendário o fecha', async () => {
  expect((await passo(contaA, contaA.donoId, 'agenda')).estado).toBe('pendente')

  await banco.comoServico()
  await banco.sql.query(
    `update public.onboarding_state set completed_steps = array['agenda']
      where account_id = $1`,
    [contaA.id],
  )
  const marcado = await passo(contaA, contaA.donoId, 'agenda')
  expect(marcado.estado).not.toBe('aguardando_aprovacao')
  expect(marcado.aprovacao_externa).toBe(false)

  // O calendário conectado é o dado que fecha o passo.
  await comEvidenciaDe('specialist_calendars', async () => {
    await banco.sql.query(
      'insert into public.specialist_calendars (account_id) values ($1)',
      [contaA.id],
    )
    const concluido = await passo(contaA, contaA.donoId, 'agenda')
    expect(concluido.estado).toBe('concluido')
    expect(concluido.pendente).toBe(false)
  })
})

test('marcar um passo que não espera ninguém de fora não o põe em espera', async () => {
  await banco.comoServico()
  await banco.sql.query(
    `update public.onboarding_state set completed_steps = array['especialista']
      where account_id = $1`,
    [contaA.id],
  )

  const especialista = await passo(contaA, contaA.donoId, 'especialista')
  expect(especialista.marcado).toBe(true)
  expect(especialista.estado).toBe('pendente')
})

test('a agenda fica sem onde resolver enquanto o calendário não existir, e sem exceção', async () => {
  // A medição segue o catálogo, não o calendário: hoje a tabela não existe e
  // `disponivel` é falso; quando a migração da agenda chegar, passa a ser
  // verdadeiro sozinha. O que não pode acontecer em nenhum dos dois casos é a
  // medição levantar exceção e derrubar o checklist inteiro.
  const existe = await tabelaExiste('specialist_calendars')
  const agenda = await passo(contaA, contaA.donoId, 'agenda')

  expect(agenda.disponivel).toBe(existe)
  expect(agenda.pendente).toBe(true)
})

test('a espera declarada por uma conta não aparece na outra', async () => {
  await banco.comoServico()
  await banco.sql.query(
    `update public.onboarding_state set completed_steps = array['numero']
      where account_id = $1`,
    [contaA.id],
  )

  expect((await passo(contaA, contaA.donoId, 'numero')).estado).toBe(
    'aguardando_aprovacao',
  )
  // A vizinha lê a própria configuração, e nela o número nem foi pedido.
  const vizinha = await passo(contaB, contaB.donoId, 'numero')
  expect(vizinha.marcado).toBe(false)
  expect(vizinha.estado).toBe('pendente')
})

// O retrato -------------------------------------------------------------------

test('o retrato grava a medição na conta e resume o que está bloqueado', async () => {
  await banco.comoUsuario(contaA.donoId)
  const { rows } = await banco.sql.query<{ retrato: Retrato }>(
    'select public.onboarding_health_refresh($1) as retrato',
    [contaA.id],
  )
  const retrato = rows[0]?.retrato
  if (!retrato) throw new Error('o retrato não voltou')

  // Sete pendências: a equipe já está montada no cenário.
  expect(retrato.passos).toHaveLength(8)
  expect(retrato.pendentes).toBe(7)
  // Ninguém declarou espera neste cenário, e o retrato não inventa uma.
  expect(retrato.aguardando).toBe(0)
  expect(
    retrato.passos.find((item) => item.passo === 'equipe')?.estado,
  ).toBe('concluido')
  expect([...retrato.bloqueado].sort()).toEqual([
    'agendamento',
    'campanha',
    'ligacao',
  ])

  const guardado = await banco.sql.query<{ health: Retrato }>(
    'select health from public.onboarding_state where account_id = $1',
    [contaA.id],
  )
  expect(guardado.rows[0]?.health.pendentes).toBe(7)
  // O estado viaja no retrato: a tela abre pelo cache, e sem ele mostraria
  // "pendente" onde a medição diz "aguardando aprovação".
  expect(
    retrato.passos.every((item) => typeof item.estado === 'string'),
  ).toBe(true)
})

test('o cliente não escreve o retrato, nem quando administra a conta', async () => {
  await banco.comoUsuario(contaA.donoId)
  const { rows } = await banco.sql.query<{ current_step: string | null }>(
    `update public.onboarding_state
        set health = '{"pendentes": 0}'::jsonb,
            current_step = 'numero'
      where account_id = $1
      returning current_step`,
    [contaA.id],
  )

  // O progresso anda; o retrato fica onde o servidor o deixou.
  expect(rows[0]?.current_step).toBe('numero')
  await banco.comoServico()
  const guardado = await banco.sql.query<{ health: Record<string, unknown> }>(
    'select health from public.onboarding_state where account_id = $1',
    [contaA.id],
  )
  expect(guardado.rows[0]?.health).toEqual({})
})

// Alcance ---------------------------------------------------------------------

test('avançar o assistente exige admin: operator lê e não muda', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const leitura = await banco.sql.query<{ current_step: string | null }>(
    'select current_step from public.onboarding_state where account_id = $1',
    [contaA.id],
  )
  expect(leitura.rows).toHaveLength(1)

  const escrita = await banco.sql.query(
    `update public.onboarding_state set current_step = 'numero'
      where account_id = $1
      returning id`,
    [contaA.id],
  )
  expect(escrita.rows).toHaveLength(0)
})

test('ninguém insere nem apaga estado de configuração pelo cliente', async () => {
  await banco.comoUsuario(contaA.donoId)
  await expect(
    banco.sql.query(
      'insert into public.onboarding_state (account_id) values ($1)',
      [contaB.id],
    ),
  ).rejects.toThrow(RECUSA_DE_RLS)

  const apagadas = await banco.sql.query(
    'delete from public.onboarding_state where account_id = $1 returning id',
    [contaA.id],
  )
  expect(apagadas.rows).toHaveLength(0)
})

// Trilha ----------------------------------------------------------------------

test('dispensar o assistente entra na trilha; recalcular o retrato não', async () => {
  await banco.comoUsuario(contaA.donoId)
  await banco.sql.query(
    'select public.onboarding_health_refresh($1)',
    [contaA.id],
  )

  await banco.comoServico()
  const depoisDoRetrato = await banco.sql.query<{ total: number }>(
    `select count(*)::int as total from public.audit_log
      where target_type = 'onboarding_state'`,
  )
  expect(depoisDoRetrato.rows[0]?.total).toBe(0)

  await banco.comoUsuario(contaA.donoId)
  await banco.sql.query(
    'update public.onboarding_state set dismissed_at = now() where account_id = $1',
    [contaA.id],
  )

  await banco.comoServico()
  const registros = await banco.sql.query<{
    actor_id: string
    payload: { campos?: string[] }
  }>(
    `select actor_id, payload from public.audit_log
      where target_type = 'onboarding_state'`,
  )
  expect(registros.rows).toHaveLength(1)
  expect(registros.rows[0]?.actor_id).toBe(contaA.donoId)
  expect(registros.rows[0]?.payload.campos).toEqual(['dismissed_at'])
})

// A primeira ligação de teste (US-255) ------------------------------------------

test('a primeira ligação de teste se declara pela chamada, e só por quem administra', async () => {
  await descartando(async () => {
    await banco.comoServico()
    const { rows: nova } = await banco.sql.query<{ test_call_id: string | null }>(
      'select test_call_id from public.onboarding_state where account_id = $1',
      [contaA.id],
    )
    expect(nova[0]?.test_call_id).toBeNull()

    const { rows: chamada } = await banco.sql.query<{ id: string }>(
      `insert into public.calls (account_id, purpose, direction, idempotency_key)
       values ($1, 'discovery', 'outbound', 'primeira-de-teste')
       returning id`,
      [contaA.id],
    )
    const chamadaId = chamada[0]?.id

    // O operador lê o progresso, mas não o escreve.
    await banco.comoUsuario(contaA.operadorId)
    const { rows: doOperador } = await banco.sql.query(
      `update public.onboarding_state set test_call_id = $2
        where account_id = $1 returning account_id`,
      [contaA.id, chamadaId],
    )
    expect(doOperador).toHaveLength(0)

    await banco.comoUsuario(contaA.donoId)
    const { rows: doDono } = await banco.sql.query(
      `update public.onboarding_state set test_call_id = $2
        where account_id = $1 returning account_id`,
      [contaA.id, chamadaId],
    )
    expect(doDono).toHaveLength(1)
  })

  // Id que não é chamada nenhuma não entra: o link da ficha não aponta para o
  // vazio. Fora da transação, porque o erro a aborta.
  await banco.comoServico()
  await expect(
    banco.sql.query(
      `update public.onboarding_state set test_call_id = gen_random_uuid()
        where account_id = $1`,
      [contaA.id],
    ),
  ).rejects.toThrow(/foreign key|test_call_id/i)
})
