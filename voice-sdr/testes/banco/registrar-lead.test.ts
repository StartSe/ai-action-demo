// `registrar_lead` é o caminho único de gravação de lead: importação de
// planilha, endereço público de entrada e cadastro manual passam todos por
// aqui. O que se prova neste arquivo é que os três chegam à mesma regra.
//
// Quatro coisas, e nenhuma delas é sobre o que a função guarda:
//
// 1. O resultado é código — `criado`, `ignorado`, `atualizado` — e a segunda
//    chamada com a mesma linha não cria segunda linha. É a metade de banco do
//    segundo critério de aceite da F1: o mesmo arquivo importado duas vezes não
//    duplica lead.
// 2. `atualizar` preenche vazio e nunca apaga. O teste de preservação é o que
//    cai se alguém trocar a ordem do `coalesce`.
// 3. O papel é conferido quando há sessão e dispensado quando não há — porque
//    quem chega sem sessão é a borda com a chave de serviço, que é o endereço
//    público de entrada, onde não existe usuário para ter papel.
// 4. Lead e evento vivem ou morrem juntos. Um evento que não pode ser escrito
//    derruba o lead com ele.
//
// Referência: migração 20260921120000_registrar_lead.sql, docs/PRD.md RF-101 a
// RF-109, docs/PRD-implementacao.md seções 3.2, 4.4 e 4.5.

import { afterAll, beforeAll, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  UUID,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly donoId: string
  readonly operadorId: string
  readonly observadorId: string
}

interface Resposta {
  readonly lead_id: string
  readonly resultado: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

/** Cada teste escolhe um telefone próprio: o índice é por conta, não por teste. */
let proximoTelefone = 999_880_000

function telefoneNovo(): string {
  proximoTelefone += 1
  return `+5548${proximoTelefone}`
}

async function criarConta(nome: string, dominio: string): Promise<Conta> {
  await banco.comoServico()

  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id

  const donoId = await banco.criarUsuario(`dono@${dominio}`, 'Dono')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  const observadorId = await banco.criarUsuario(
    `observador@${dominio}`,
    'Observador',
  )

  await banco.comoServico()
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'operator'), ($1, $4, 'viewer')`,
    [id, donoId, operadorId, observadorId],
  )

  return { id, donoId, operadorId, observadorId }
}

/** `comoServico()` é `postgres`, que passa por cima de grant; a borda é `service_role`. */
async function comoBorda(): Promise<void> {
  await banco.comoServico()
  await banco.sql.exec('set role service_role')
}

async function registrar(
  conta: Conta,
  lead: Record<string, unknown>,
  aoDuplicar = 'ignorar',
): Promise<Resposta> {
  const { rows } = await banco.sql.query<Resposta>(
    `select lead_id, resultado
       from public.registrar_lead($1::uuid, $2::jsonb, $3::text)`,
    [conta.id, JSON.stringify(lead), aoDuplicar],
  )
  return rows[0]!
}

async function lerLead(id: string): Promise<Record<string, unknown>> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<Record<string, unknown>>(
    'select * from public.leads where id = $1',
    [id],
  )
  return rows[0]!
}

async function eventosDo(id: string): Promise<{ kind: string; actor: string }[]> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ kind: string; actor: string }>(
    `select kind, actor from public.lead_events
      where lead_id = $1 order by created_at`,
    [id],
  )
  return rows
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test')
  contaB = await criarConta('Cooperativa Sul', 'sul.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

// Os três resultados ---------------------------------------------------------

test('lead novo volta criado, com evento lead_created assinado por quem chamou', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const telefone = telefoneNovo()

  const resposta = await registrar(contaA, {
    name: 'Ana Prado',
    phone_e164: telefone,
    company: 'Metalúrgica Prado',
    source: 'import',
  })

  expect(resposta.resultado).toBe('criado')
  expect(resposta.lead_id).toMatch(UUID)

  const lead = await lerLead(resposta.lead_id)
  expect(lead.account_id).toBe(contaA.id)
  expect(lead.name).toBe('Ana Prado')
  expect(lead.phone_e164).toBe(telefone)

  expect(await eventosDo(resposta.lead_id)).toEqual([
    { kind: 'lead_created', actor: 'user' },
  ])
})

test('a mesma linha duas vezes volta criado e depois ignorado, sem segunda linha', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const telefone = telefoneNovo()
  const linha = { name: 'Bruno Sales', phone_e164: telefone }

  const primeira = await registrar(contaA, linha)
  await banco.comoUsuario(contaA.operadorId)
  const segunda = await registrar(contaA, linha)

  expect(primeira.resultado).toBe('criado')
  expect(
    segunda,
    'o mesmo arquivo importado duas vezes não cria lead duplicado — é o ' +
      'segundo critério de aceite da F1',
  ).toEqual({ lead_id: primeira.lead_id, resultado: 'ignorado' })

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ total: number }>(
    `select count(*)::int as total from public.leads
      where account_id = $1 and phone_e164 = $2`,
    [contaA.id, telefone],
  )
  expect(rows[0]?.total).toBe(1)

  expect(
    await eventosDo(primeira.lead_id),
    'ignorar não toca no lead, então não há o que narrar',
  ).toEqual([{ kind: 'lead_created', actor: 'user' }])
})

test('atualizar preenche o que estava vazio e não apaga o que já havia', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const telefone = telefoneNovo()

  const primeira = await registrar(contaA, {
    name: 'Carla Dias',
    phone_e164: telefone,
    company: 'Transportadora Dias',
    briefing: { pain: 'frota parada' },
  })

  await banco.comoUsuario(contaA.operadorId)
  const segunda = await registrar(
    contaA,
    {
      name: 'C. D.',
      phone_e164: telefone,
      email: 'carla@dias.test',
      city: 'Joinville',
      briefing: { pain: 'outra dor', fit: 'alto' },
    },
    'atualizar',
  )

  expect(segunda).toEqual({ lead_id: primeira.lead_id, resultado: 'atualizado' })

  const lead = await lerLead(primeira.lead_id)
  expect(
    lead.name,
    'o que já estava gravado vence o que chegou: atualizar preenche vazio, ' +
      'não sobrescreve',
  ).toBe('Carla Dias')
  expect(lead.company).toBe('Transportadora Dias')
  expect(lead.email).toBe('carla@dias.test')
  expect(lead.city).toBe('Joinville')
  expect(lead.briefing).toEqual({ pain: 'frota parada', fit: 'alto' })

  expect(await eventosDo(primeira.lead_id)).toEqual([
    { kind: 'lead_created', actor: 'user' },
    { kind: 'lead_updated', actor: 'user' },
  ])
})

test('atualizar sem nada a preencher volta ignorado e não escreve evento', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const telefone = telefoneNovo()
  const linha = { name: 'Diego Melo', phone_e164: telefone, company: 'Melo SA' }

  const primeira = await registrar(contaA, linha)
  await banco.comoUsuario(contaA.operadorId)
  const segunda = await registrar(contaA, linha, 'atualizar')

  expect(
    segunda.resultado,
    'reimportar a mesma planilha não pode virar mil lead_updated que não ' +
      'narram mudança nenhuma',
  ).toBe('ignorado')

  expect(await eventosDo(primeira.lead_id)).toEqual([
    { kind: 'lead_created', actor: 'user' },
  ])
})

test('criar sem conflito volta criado, como ignorar', async () => {
  await banco.comoUsuario(contaA.operadorId)

  const resposta = await registrar(
    contaA,
    { name: 'Elisa Rocha', phone_e164: telefoneNovo() },
    'criar',
  )
  expect(resposta.resultado).toBe('criado')
})

// As recusas -----------------------------------------------------------------

test('criar em cima de duplicata é recusado por duplicado_por_telefone', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const telefone = telefoneNovo()
  await registrar(contaA, { name: 'Fábio Luz', phone_e164: telefone })

  await banco.comoUsuario(contaA.operadorId)
  await expect(
    registrar(contaA, { name: 'Fábio L.', phone_e164: telefone }, 'criar'),
  ).rejects.toThrow(/duplicado_por_telefone/)
})

test.each([
  ['sem o mais', '5548999887766'],
  ['com pontuação', '+55 (48) 99988-7766'],
  ['curto demais', '+551'],
  ['vazio', ''],
])('telefone %s é recusado por telefone_invalido', async (_caso, telefone) => {
  await banco.comoUsuario(contaA.operadorId)

  await expect(
    registrar(contaA, { name: 'Gabriel', phone_e164: telefone }),
  ).rejects.toThrow(/telefone_invalido/)
})

test('o viewer não grava lead', async () => {
  await banco.comoUsuario(contaA.observadorId)

  await expect(
    registrar(contaA, { name: 'Helena', phone_e164: telefoneNovo() }),
  ).rejects.toThrow(/sem_permissao/)
})

test('o operador de uma conta não grava lead na outra', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const telefone = telefoneNovo()

  await expect(
    registrar(contaB, { name: 'Ivo', phone_e164: telefone }),
  ).rejects.toThrow(/sem_permissao/)

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ total: number }>(
    'select count(*)::int as total from public.leads where account_id = $1',
    [contaB.id],
  )
  expect(rows[0]?.total).toBe(0)
})

test('opção de duplicata fora das três é recusada', async () => {
  await banco.comoUsuario(contaA.operadorId)

  await expect(
    registrar(contaA, { phone_e164: telefoneNovo() }, 'mesclar'),
  ).rejects.toThrow(/opcao_invalida/)
})

test('etapa de outra conta é recusada por etapa_invalida', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    `select s.id from public.pipeline_stages as s
       join public.pipelines as p on p.id = s.pipeline_id
      where s.account_id = $1 and p.is_default and s.key = 'new'`,
    [contaB.id],
  )
  const etapaDaVizinha = rows[0]!.id

  await banco.comoUsuario(contaA.operadorId)
  await expect(
    registrar(contaA, { phone_e164: telefoneNovo(), stage_id: etapaDaVizinha }),
  ).rejects.toThrow(/etapa_invalida/)
})

// A etapa inicial ------------------------------------------------------------

test('lead sem etapa nasce na etapa new do funil padrão da conta', async () => {
  await banco.comoUsuario(contaA.operadorId)

  const resposta = await registrar(contaA, { phone_e164: telefoneNovo() })
  const lead = await lerLead(resposta.lead_id)

  const { rows } = await banco.sql.query<{ key: string; account_id: string }>(
    `select s.key, s.account_id from public.pipeline_stages as s
      where s.id = $1`,
    [lead.stage_id],
  )
  expect(rows[0]).toEqual({ key: 'new', account_id: contaA.id })
})

// A borda --------------------------------------------------------------------

test('a borda, sem sessão, grava e assina o evento como agent', async () => {
  await comoBorda()

  const resposta = await registrar(contaA, {
    name: 'Joana Farias',
    phone_e164: telefoneNovo(),
    source: 'intake',
    actor: 'agent',
  })

  expect(
    resposta.resultado,
    'quem chega sem sessão é o endereço público, onde não existe usuário ' +
      'para ter papel: a chave da conta é que faz as vezes da credencial',
  ).toBe('criado')

  expect(await eventosDo(resposta.lead_id)).toEqual([
    { kind: 'lead_created', actor: 'agent' },
  ])
})

test('sem actor declarado, a borda registra system', async () => {
  await comoBorda()

  const resposta = await registrar(contaA, { phone_e164: telefoneNovo() })

  expect(
    await eventosDo(resposta.lead_id),
    'actor user exige actor_id, e a borda nem sempre tem um: o padrão é system',
  ).toEqual([{ kind: 'lead_created', actor: 'system' }])
})

// Lead e evento na mesma transação -------------------------------------------

test('evento que não pode ser escrito derruba o lead junto', async () => {
  await comoBorda()
  const telefone = telefoneNovo()

  // `actor = 'user'` sem `actor_id` viola o check de lead_events. O lead já foi
  // inserido quando o evento falha: se as duas escritas não fossem a mesma
  // transação, sobraria um lead sem linha do tempo.
  await expect(
    registrar(contaA, { phone_e164: telefone, actor: 'user' }),
  ).rejects.toThrow(/violates check constraint/i)

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ total: number }>(
    `select count(*)::int as total from public.leads
      where account_id = $1 and phone_e164 = $2`,
    [contaA.id, telefone],
  )
  expect(rows[0]?.total).toBe(0)
})

// Duplicata e mesclagem ------------------------------------------------------

test('telefone de lead mesclado volta a estar livre', async () => {
  await banco.comoUsuario(contaA.operadorId)
  const telefone = telefoneNovo()
  const primeiro = await registrar(contaA, { phone_e164: telefone })

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, phone_e164)
     values ($1, $2) returning id`,
    [contaA.id, telefoneNovo()],
  )
  await banco.sql.query('update public.leads set merged_into_id = $2 where id = $1', [
    primeiro.lead_id,
    rows[0]!.id,
  ])

  await banco.comoUsuario(contaA.operadorId)
  const segundo = await registrar(contaA, { phone_e164: telefone })

  expect(segundo.resultado).toBe('criado')
  expect(segundo.lead_id).not.toBe(primeiro.lead_id)
})

// Grants ---------------------------------------------------------------------

test('só authenticated e service_role executam o RPC', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ grantee: string }>(
    `select grantee
       from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name = 'registrar_lead'
        and privilege_type = 'EXECUTE'`,
  )

  const concedidos = rows.map((linha) => linha.grantee)
  expect(concedidos).toContain('authenticated')
  expect(concedidos).toContain('service_role')
  expect(
    concedidos,
    'PUBLIC alcança qualquer papel presente ou futuro, e quem chega pelo ' +
      'formulário do cliente fala com a função de servidor, não com o banco',
  ).not.toContain('PUBLIC')
  expect(concedidos).not.toContain('anon')
})
