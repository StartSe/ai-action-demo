// `lead_merge` junta dois cadastros da mesma pessoa. O que se prova aqui é que
// juntar não perde nada e não inventa nada.
//
// Cinco coisas:
//
// 1. A linha do tempo da origem passa a ser do destino, e cada um dos dois
//    ganha um evento `merged` com o id do outro. Nenhum evento some no caminho.
// 2. O destino só recebe o que lhe faltava. O teste de preservação é o que cai
//    se alguém trocar a direção do preenchimento.
// 3. A origem vira lápide: `merged_into_id` preenchido a tira do índice único
//    parcial, e o telefone dela volta a poder ser cadastrado.
// 4. As cinco recusas são código, e a segunda mesclagem do mesmo par é uma
//    delas — `ja_mesclado` — sem segundo evento.
// 5. `security definer` desliga a RLS, então a conferência de papel dentro da
//    função é a única barreira: o operador da conta vizinha não mescla lead
//    alheio. Quem mede essa barreira sozinha é o teste da borda sem sessão —
//    o da conta vizinha tem `registrar_evento_de_lead` atrás dele, que também
//    recusa quem não é membro, e por isso continuaria passando se a
//    conferência de `lead_merge` sumisse.
//
// Referência: migração 20260921150000_lead_merge.sql, docs/revisao-tecnica.md
// L-11, docs/PRD.md RF-114.

import { afterAll, beforeAll, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly operadorId: string
  readonly observadorId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

/** Cada teste escolhe telefone próprio: o índice único é por conta, não por teste. */
let proximoTelefone = 999_770_000

function telefoneNovo(): string {
  proximoTelefone += 1
  return `+5551${proximoTelefone}`
}

async function criarConta(nome: string, dominio: string): Promise<Conta> {
  await banco.comoServico()

  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id

  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  const observadorId = await banco.criarUsuario(
    `observador@${dominio}`,
    'Observador',
  )

  await banco.comoServico()
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'operator'), ($1, $3, 'viewer')`,
    [id, operadorId, observadorId],
  )

  return { id, operadorId, observadorId }
}

/** Insere direto, como serviço: preparar dado não é o que este arquivo mede. */
async function criarLead(
  conta: Conta,
  colunas: Record<string, unknown> = {},
): Promise<string> {
  await banco.comoServico()

  const valores: Record<string, unknown> = {
    account_id: conta.id,
    phone_e164: telefoneNovo(),
    ...colunas,
  }
  const nomes = Object.keys(valores)
  const marcadores = nomes.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (${nomes.join(', ')})
     values (${marcadores.join(', ')}) returning id`,
    nomes.map((nome) => valores[nome]),
  )
  return rows[0]!.id
}

/** `comoServico()` é `postgres`, que passa por cima de grant; a borda é `service_role`. */
async function comoBorda(): Promise<void> {
  await banco.comoServico()
  await banco.sql.exec('set role service_role')
}

async function mesclar(origem: string, destino: string): Promise<string> {
  const { rows } = await banco.sql.query<{ resultado: string }>(
    'select resultado from public.lead_merge($1::uuid, $2::uuid)',
    [origem, destino],
  )
  return rows[0]!.resultado
}

async function lerLead(id: string): Promise<Record<string, unknown>> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<Record<string, unknown>>(
    'select * from public.leads where id = $1',
    [id],
  )
  return rows[0]!
}

async function eventosDo(id: string): Promise<{ kind: string; payload: Record<string, unknown> }[]> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    kind: string
    payload: Record<string, unknown>
  }>(
    `select kind, payload from public.lead_events
      where lead_id = $1 order by created_at, kind`,
    [id],
  )
  return rows
}

async function criarEvento(leadId: string, kind: string): Promise<void> {
  await banco.comoServico()
  await banco.sql.query(
    `insert into public.lead_events (account_id, lead_id, kind, actor)
     select l.account_id, l.id, $2, 'system' from public.leads as l where l.id = $1`,
    [leadId, kind],
  )
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora-merge.test')
  contaB = await criarConta('Cooperativa Sul', 'sul-merge.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

// Caminho feliz --------------------------------------------------------------

test('a linha do tempo da origem vira do destino, e cada um ganha um evento merged', async () => {
  const origem = await criarLead(contaA, { name: 'Ana Prado' })
  const destino = await criarLead(contaA, { name: 'Ana C. Prado' })
  await criarEvento(origem, 'lead_created')
  await criarEvento(origem, 'note')
  await criarEvento(destino, 'lead_created')

  await banco.comoUsuario(contaA.operadorId)
  expect(await mesclar(origem, destino)).toBe('mesclado')

  expect(
    (await eventosDo(origem)).map((evento) => evento.kind),
    'a origem fica só com a lápide: o resto da história foi para o destino',
  ).toEqual(['merged'])

  const doDestino = await eventosDo(destino)
  expect(doDestino.map((evento) => evento.kind).sort()).toEqual([
    'lead_created',
    'lead_created',
    'merged',
    'note',
  ])

  const lapide = (await eventosDo(origem))[0]!
  expect(lapide.payload).toEqual({ papel: 'origem', merged_into_id: destino })

  const marca = doDestino.find((evento) => evento.kind === 'merged')!
  expect(marca.payload).toEqual({ papel: 'destino', merged_from_id: origem })
})

test('a origem vira lápide e devolve o telefone ao acervo', async () => {
  const telefone = telefoneNovo()
  const origem = await criarLead(contaA, { phone_e164: telefone })
  const destino = await criarLead(contaA, {})

  await banco.comoUsuario(contaA.operadorId)
  await mesclar(origem, destino)

  expect((await lerLead(origem)).merged_into_id).toBe(destino)

  // O índice único parcial ignora o lead mesclado, então o número volta a
  // poder ser cadastrado — é para isso que serve o `where` dele.
  await banco.comoServico()
  await expect(
    banco.sql.query(
      'insert into public.leads (account_id, phone_e164) values ($1, $2)',
      [contaA.id, telefone],
    ),
  ).resolves.toBeDefined()
})

test('o destino recebe só o que lhe faltava, e nada do que já tinha é trocado', async () => {
  const origem = await criarLead(contaA, {
    name: 'Bruno Sales',
    company: 'Metalúrgica Sales',
    city: 'Caxias do Sul',
    email: 'bruno@sales.test',
    briefing: JSON.stringify({ pain: 'frota parada', fit: 'alto' }),
  })
  const destino = await criarLead(contaA, {
    name: 'B. Sales',
    email: null,
    briefing: JSON.stringify({ pain: 'sem previsibilidade' }),
  })

  await banco.comoUsuario(contaA.operadorId)
  await mesclar(origem, destino)

  const lead = await lerLead(destino)
  expect(lead.name, 'o que o destino já tinha vence').toBe('B. Sales')
  expect(lead.email, 'o que faltava vem da origem').toBe('bruno@sales.test')
  expect(lead.company).toBe('Metalúrgica Sales')
  expect(lead.city).toBe('Caxias do Sul')
  expect(lead.briefing, 'a chave do destino por cima da da origem').toEqual({
    pain: 'sem previsibilidade',
    fit: 'alto',
  })
})

test('last_activity_at fica com a mais recente das duas', async () => {
  const antiga = '2026-02-01T10:00:00.000Z'
  const recente = '2026-08-20T10:00:00.000Z'

  const origem = await criarLead(contaA, { last_activity_at: recente })
  const destino = await criarLead(contaA, { last_activity_at: antiga })

  await banco.comoUsuario(contaA.operadorId)
  await mesclar(origem, destino)

  expect(new Date(String((await lerLead(destino)).last_activity_at))).toEqual(
    new Date(recente),
  )
})

test('o bloqueio da origem viaja para o destino desbloqueado', async () => {
  const origem = await criarLead(contaA, {
    blocked_at: '2026-05-05T09:00:00.000Z',
    blocked_reason: 'pediu para não ser chamado',
  })
  const destino = await criarLead(contaA, {})

  await banco.comoUsuario(contaA.operadorId)
  await mesclar(origem, destino)

  const lead = await lerLead(destino)
  expect(
    lead.blocked_at,
    'perder o bloqueio na mesclagem é ligar para quem pediu para não ser chamado',
  ).not.toBeNull()
  expect(lead.blocked_reason).toBe('pediu para não ser chamado')
})

test('a mesclagem deixa uma linha de audit_log na mesma transação', async () => {
  const origem = await criarLead(contaA, { company: 'Fundição Oeste' })
  const destino = await criarLead(contaA, {})

  await banco.comoUsuario(contaA.operadorId)
  await mesclar(origem, destino)

  await banco.comoServico()
  const { rows } = await banco.sql.query<{
    actor_id: string
    action: string
    payload: Record<string, unknown>
  }>(
    `select actor_id, action, payload from public.audit_log
      where source = 'rpc:lead_merge' and target_id = $1`,
    [destino],
  )

  expect(rows).toHaveLength(1)
  expect(rows[0]!.action).toBe('merge')
  expect(rows[0]!.actor_id).toBe(contaA.operadorId)
  expect(rows[0]!.payload).toMatchObject({
    origem_id: origem,
    destino_id: destino,
    campos_preenchidos: ['company'],
  })
})

// As recusas -----------------------------------------------------------------

test('mesclar um lead consigo mesmo é mesmo_lead', async () => {
  const lead = await criarLead(contaA, {})

  await banco.comoUsuario(contaA.operadorId)
  await expect(mesclar(lead, lead)).rejects.toThrow(/\bmesmo_lead\b/)
})

test('lead que não existe é lead_inexistente', async () => {
  const lead = await criarLead(contaA, {})
  const fantasma = '00000000-0000-4000-8000-000000000000'

  await banco.comoUsuario(contaA.operadorId)
  await expect(mesclar(fantasma, lead)).rejects.toThrow(/\blead_inexistente\b/)

  await banco.comoUsuario(contaA.operadorId)
  await expect(mesclar(lead, fantasma)).rejects.toThrow(/\blead_inexistente\b/)
})

test('dois leads de contas diferentes é lead_de_outra_conta', async () => {
  const daA = await criarLead(contaA, {})
  const daB = await criarLead(contaB, {})

  await banco.comoUsuario(contaA.operadorId)
  await expect(mesclar(daA, daB)).rejects.toThrow(/\blead_de_outra_conta\b/)
})

test('o viewer não mescla: sem_permissao', async () => {
  const origem = await criarLead(contaA, {})
  const destino = await criarLead(contaA, {})

  await banco.comoUsuario(contaA.observadorId)
  await expect(mesclar(origem, destino)).rejects.toThrow(/\bsem_permissao\b/)

  expect(
    (await lerLead(origem)).merged_into_id,
    'a recusa não deixa meia mesclagem para trás',
  ).toBeNull()
})

test('o operador da conta vizinha não mescla lead alheio: sem_permissao', async () => {
  const origem = await criarLead(contaA, {})
  const destino = await criarLead(contaA, {})

  await banco.comoUsuario(contaB.operadorId)
  await expect(mesclar(origem, destino)).rejects.toThrow(/\bsem_permissao\b/)

  expect((await lerLead(origem)).merged_into_id).toBeNull()
  expect(
    await eventosDo(destino),
    'security definer desliga a RLS: a conferência de papel é a única barreira',
  ).toEqual([])
})

test('sem sessão, nem a chave de serviço mescla: sem_permissao', async () => {
  const origem = await criarLead(contaA, {})
  const destino = await criarLead(contaA, {})

  await comoBorda()
  await expect(mesclar(origem, destino)).rejects.toThrow(/\bsem_permissao\b/)

  expect((await lerLead(origem)).merged_into_id).toBeNull()
})

test('mesclar duas vezes o mesmo par é ja_mesclado, e não duplica evento', async () => {
  const origem = await criarLead(contaA, {})
  const destino = await criarLead(contaA, {})

  await banco.comoUsuario(contaA.operadorId)
  expect(await mesclar(origem, destino)).toBe('mesclado')

  await banco.comoUsuario(contaA.operadorId)
  await expect(mesclar(origem, destino)).rejects.toThrow(/\bja_mesclado\b/)

  expect(await eventosDo(destino)).toHaveLength(1)
  expect(await eventosDo(origem)).toHaveLength(1)
})

test('absorver um cadastro para dentro de uma lápide também é ja_mesclado', async () => {
  const origem = await criarLead(contaA, {})
  const destino = await criarLead(contaA, {})
  const terceiro = await criarLead(contaA, {})

  await banco.comoUsuario(contaA.operadorId)
  await mesclar(origem, destino)

  await banco.comoUsuario(contaA.operadorId)
  await expect(mesclar(terceiro, origem)).rejects.toThrow(/\bja_mesclado\b/)
})
