// O funil tem uma promessa só, e ela é sobre nomes: a automação cita a chave,
// a tela mostra o rótulo, e renomear o rótulo não pode quebrar nada (RF-203).
// O que se prova aqui:
//
// 1. A conta nasce com o funil padrão e as seis etapas, na ordem, com o
//    desfecho na etapa certa.
// 2. A chave não muda, nem para quem tem permissão de escrever.
// 3. Classe Configuração: membro lê, administrador escreve, operador não.
// 4. A conta vizinha recebe zero linha.
//
// Referência: migração 20260921090000_funil.sql, docs/PRD-implementacao.md
// seções 3.2 e 3.9.

import { afterAll, beforeAll, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly donoId: string
  readonly operadorId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

async function criarConta(nome: string, dominio: string): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id

  const donoId = await banco.criarUsuario(`dono@${dominio}`, 'Dono')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')

  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'operator')`,
    [id, donoId, operadorId],
  )

  return { id, donoId, operadorId }
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.test')
  contaB = await criarConta('Cooperativa Sul', 'sul.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

test('a conta nasce com o funil padrão e as seis etapas na ordem', async () => {
  await banco.comoServico()

  const { rows } = await banco.sql.query<{
    key: string
    label: string
    position: number
    is_won: boolean
    is_lost: boolean
  }>(
    `select s.key, s.label, s.position, s.is_won, s.is_lost
       from public.pipeline_stages as s
       join public.pipelines as p on p.id = s.pipeline_id
      where s.account_id = $1 and p.is_default
      order by s.position`,
    [contaA.id],
  )

  expect(rows.map((linha) => linha.key)).toEqual([
    'new',
    'contacted',
    'qualified',
    'meeting_booked',
    'won',
    'lost',
  ])
  expect(rows.map((linha) => linha.label)).toEqual([
    'Novo',
    'Contatado',
    'Qualificado',
    'Reunião marcada',
    'Ganho',
    'Perdido',
  ])
  // Desfecho só nas duas etapas de desfecho, e uma de cada.
  expect(rows.filter((linha) => linha.is_won).map((l) => l.key)).toEqual(['won'])
  expect(rows.filter((linha) => linha.is_lost).map((l) => l.key)).toEqual([
    'lost',
  ])
})

test('a conta tem um só funil padrão', async () => {
  await banco.comoServico()

  await expect(
    banco.sql.query(
      `insert into public.pipelines (account_id, name, is_default)
       values ($1, 'Outro padrão', true)`,
      [contaA.id],
    ),
  ).rejects.toThrow(/pipelines_um_padrao_por_conta/i)
})

test('renomear o rótulo é permitido ao administrador', async () => {
  await banco.comoUsuario(contaA.donoId)

  const { rows } = await banco.sql.query<{ key: string; label: string }>(
    `update public.pipeline_stages
        set label = 'Tem fit'
      where account_id = $1 and key = 'qualified'
      returning key, label`,
    [contaA.id],
  )

  expect(rows).toEqual([{ key: 'qualified', label: 'Tem fit' }])
})

test('a chave da etapa não muda, nem para o dono', async () => {
  await banco.comoUsuario(contaA.donoId)

  await expect(
    banco.sql.query(
      `update public.pipeline_stages
          set key = 'tem_fit'
        where account_id = $1 and key = 'qualified'`,
      [contaA.id],
    ),
  ).rejects.toThrow(/a chave da etapa não muda/i)
})

test('o operador lê o funil e não escreve nele', async () => {
  await banco.comoUsuario(contaA.operadorId)

  const { rows: lidas } = await banco.sql.query(
    'select id from public.pipeline_stages',
  )
  expect(lidas).toHaveLength(6)

  // RLS que não casa não levanta erro: simplesmente não afeta linha.
  const { rows: escritas } = await banco.sql.query(
    `update public.pipeline_stages
        set label = 'Mexido pelo operador'
      where account_id = $1 and key = 'new'
      returning id`,
    [contaA.id],
  )
  expect(escritas).toEqual([])
})

test('a conta vizinha não aparece para quem lê', async () => {
  await banco.comoUsuario(contaA.donoId)

  const { rows: funis } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.pipelines',
  )
  const { rows: etapas } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.pipeline_stages',
  )

  expect(funis.every((linha) => linha.account_id === contaA.id)).toBe(true)
  expect(etapas.every((linha) => linha.account_id === contaA.id)).toBe(true)
  expect(
    [...funis, ...etapas].some((linha) => linha.account_id === contaB.id),
  ).toBe(false)
})

test('a sessão anônima não alcança funil nenhum', async () => {
  await banco.comoAnonimo()

  const { rows } = await banco.sql.query('select id from public.pipeline_stages')

  expect(rows).toEqual([])
})

// Etapas configuráveis (US-127, 20260929110000_etapas_configuraveis.sql) ------

interface Etapa {
  id: string
  key: string
  label: string
  position: number
  color: string | null
}

async function funilPadrao(conta: Conta): Promise<string> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    'select id from public.pipelines where account_id = $1 and is_default',
    [conta.id],
  )
  return rows[0]!.id
}

async function etapas(conta: Conta): Promise<Etapa[]> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<Etapa>(
    `select s.id, s.key, s.label, s.position, s.color
       from public.pipeline_stages as s
       join public.pipelines as p on p.id = s.pipeline_id and p.is_default
      where s.account_id = $1 order by s.position`,
    [conta.id],
  )
  return rows
}

async function configurar(usuario: string, funil: string, lista: unknown): Promise<string> {
  await banco.comoUsuario(usuario)
  const { rows } = await banco.sql.query<{ r: string }>(
    'select public.configurar_etapas($1, $2::jsonb) as r',
    [funil, JSON.stringify(lista)],
  )
  return rows[0]!.r
}

test('renomear pelo RPC muda o rótulo e a cor, e não muda a chave', async () => {
  const funil = await funilPadrao(contaA)
  const qualificado = (await etapas(contaA)).find((e) => e.key === 'qualified')!
  const resultado = await configurar(contaA.donoId, funil, [
    { id: qualificado.id, label: 'Tem fit', position: qualificado.position, color: 'verde' },
  ])
  expect(resultado).toBe('ok')
  const depois = (await etapas(contaA)).find((e) => e.id === qualificado.id)!
  expect(depois).toMatchObject({ key: 'qualified', label: 'Tem fit', color: 'verde' })
})

test('o RPC recusa trocar a chave de etapa existente', async () => {
  const funil = await funilPadrao(contaA)
  const novo = (await etapas(contaA)).find((e) => e.key === 'new')!
  expect(
    await configurar(contaA.donoId, funil, [
      { id: novo.id, key: 'entrada', label: 'Entrada', position: novo.position },
    ]),
  ).toBe('chave_invalida')
  expect((await etapas(contaA)).find((e) => e.id === novo.id)?.key).toBe('new')
})

test('o gatilho de imutabilidade da chave continua de pé', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query(
    `select 1 from pg_trigger where tgname = 'pipeline_stages_chave_imutavel' and not tgisinternal`,
  )
  expect(rows).toHaveLength(1)
})

test('etapa própria em slug entra, e slug inválido é recusado', async () => {
  const funil = await funilPadrao(contaA)
  expect(
    await configurar(contaA.donoId, funil, [{ key: 'Tem Fit!', label: 'Tem fit', position: 20 }]),
  ).toBe('chave_invalida')
  expect(
    await configurar(contaA.donoId, funil, [{ key: 'ab', label: 'Curta', position: 20 }]),
  ).toBe('chave_invalida')
  expect(
    await configurar(contaA.donoId, funil, [{ key: 'qualified', label: 'De novo', position: 20 }]),
  ).toBe('etapa_canonica')
  expect(
    await configurar(contaA.donoId, funil, [
      { key: 'proposta_enviada', label: 'Proposta enviada', position: 20 },
    ]),
  ).toBe('ok')
  expect((await etapas(contaA)).map((e) => e.key)).toContain('proposta_enviada')

  await banco.comoServico()
  await expect(
    banco.sql.query(
      `insert into public.pipeline_stages (account_id, pipeline_id, key, label, position)
       values ($1, $2, 'Maiúscula', 'x', 30)`,
      [contaA.id, funil],
    ),
  ).rejects.toThrow(/pipeline_stages_chave_valida/)
})

test('etapa canônica não se apaga, e a própria só se apaga vazia', async () => {
  await banco.comoServico()
  const lista = await etapas(contaA)
  const ganho = lista.find((e) => e.key === 'won')!
  await expect(
    banco.sql.query('delete from public.pipeline_stages where id = $1', [ganho.id]),
  ).rejects.toThrow(/etapa_canonica/)

  const propria = lista.find((e) => e.key === 'proposta_enviada')!
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, stage_id)
     values ($1, 'Lead na proposta', '+5548999990001', $2) returning id`,
    [contaA.id, propria.id],
  )
  let hint: string | undefined
  let mensagem = ''
  try {
    await banco.sql.query('delete from public.pipeline_stages where id = $1', [propria.id])
  } catch (erro) {
    mensagem = String((erro as Error).message)
    hint = (erro as { hint?: string }).hint
  }
  expect(mensagem).toMatch(/etapa_com_leads/)
  expect(hint).toBe('1')

  await banco.sql.query('delete from public.leads where id = $1', [rows[0]!.id])
  await banco.sql.query('delete from public.pipeline_stages where id = $1', [propria.id])
  expect((await etapas(contaA)).map((e) => e.key)).not.toContain('proposta_enviada')
})

test('dois is_won no mesmo funil são recusados, e a marca de won não sai', async () => {
  const funil = await funilPadrao(contaA)
  await expect(
    banco.sql.query(
      `insert into public.pipeline_stages (account_id, pipeline_id, key, label, position, is_won)
       values ($1, $2, 'ganho_extra', 'Ganho extra', 40, true)`,
      [contaA.id, funil],
    ),
  ).rejects.toThrow()
  await expect(
    banco.sql.query(
      `update public.pipeline_stages set is_won = false where pipeline_id = $1 and key = 'won'`,
      [funil],
    ),
  ).rejects.toThrow()
})

test('reordenar regrava a lista inteira sem colidir, e posição duplicada é recusada', async () => {
  const funil = await funilPadrao(contaA)
  const lista = await etapas(contaA)
  const invertida = lista.map((e, i) => ({
    id: e.id,
    label: e.label,
    position: lista.length - 1 - i,
  }))
  expect(await configurar(contaA.donoId, funil, invertida)).toBe('ok')
  expect((await etapas(contaA)).map((e) => e.key)).toEqual(lista.map((e) => e.key).reverse())

  const [a, b] = await etapas(contaA)
  expect(
    await configurar(contaA.donoId, funil, [
      { id: a!.id, label: a!.label, position: 7 },
      { id: b!.id, label: b!.label, position: 7 },
    ]),
  ).toBe('posicao_duplicada')

  // Colidir com etapa que ficou de fora da lista também é duplicada.
  expect(
    await configurar(contaA.donoId, funil, [{ id: a!.id, label: a!.label, position: b!.position }]),
  ).toBe('posicao_duplicada')

  // Volta à ordem original, para o resto do arquivo.
  expect(
    await configurar(
      contaA.donoId,
      funil,
      lista.map((e) => ({ id: e.id, label: e.label, position: e.position })),
    ),
  ).toBe('ok')
  expect((await etapas(contaA)).map((e) => e.key)).toEqual(lista.map((e) => e.key))
})

test('o operador não configura, e etapa de outra conta é recusada', async () => {
  const funilA = await funilPadrao(contaA)
  const funilB = await funilPadrao(contaB)
  const etapaA = (await etapas(contaA))[0]!
  const etapaB = (await etapas(contaB))[0]!
  expect(
    await configurar(contaA.operadorId, funilA, [
      { id: etapaA.id, label: 'Mexido', position: etapaA.position },
    ]),
  ).toBe('sem_permissao')
  expect(
    await configurar(contaA.donoId, funilB, [
      { id: etapaB.id, label: 'Alheio', position: etapaB.position },
    ]),
  ).toBe('sem_permissao')
  expect(
    await configurar(contaA.donoId, funilA, [{ id: etapaB.id, label: 'Alheio', position: 30 }]),
  ).toBe('etapa_de_outra_conta')
  expect((await etapas(contaB))[0]!.label).toBe(etapaB.label)
})

test('apagar a conta leva as etapas canônicas junto', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name) values ('Conta de apagar') returning id`,
  )
  await banco.sql.query('delete from public.accounts where id = $1', [rows[0]!.id])
  const { rows: sobras } = await banco.sql.query(
    'select 1 from public.pipeline_stages where account_id = $1',
    [rows[0]!.id],
  )
  expect(sobras).toHaveLength(0)
})
