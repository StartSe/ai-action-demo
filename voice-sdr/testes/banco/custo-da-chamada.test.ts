// O custo da chamada, separado por componente e aceitando preço que chega tarde
// (seção 3.5, T-20, L-05).
//
// O que este arquivo prova:
//
// 1. **A soma materializada é recálculo, e não delta.** Três componentes somam
//    em `calls.cost_cents`; regravar o mesmo componente com outro preço muda a
//    soma para o novo valor em vez de acrescentá-lo ao anterior; apagar uma
//    parcela reduz a soma. É o teste do meio que separa as duas
//    implementações: com delta, o update deixaria a soma inflada e ninguém
//    perceberia até a conciliação do mês.
// 2. **O único de (call_id, component, source)**, que é o que torna
//    `cron-cost-sync` idempotente: a segunda passagem da rotina bate na
//    restrição e escreve `on conflict ... do update`, em vez de acrescentar uma
//    segunda linha do mesmo componente.
// 3. A lista fechada dos quatro componentes, e a régua de `amount_cents`.
// 4. Classe Servidor da seção 3.9: o membro lê, e ninguém do cliente insere,
//    altera nem apaga — nem o dono da conta.
// 5. A atribuição que o teto de gasto usa: a soma do dia de uma conta não
//    inclui nenhuma linha da vizinha, mesmo com as duas tendo chamada no mesmo
//    instante.
//
// Referência: migração 20260922060000_custo_da_chamada.sql,
// docs/PRD-implementacao.md seções 3.5, 3.9 e 6, docs/revisao-tecnica.md T-20,
// T-06 e L-05, docs/PRD.md RNF-12.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly donoId: string
  readonly operadorId: string
  readonly leadId: string
  readonly sufixo: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

async function criarConta(
  nome: string,
  dominio: string,
  sufixo: string,
): Promise<Conta> {
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

  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, $2, $3, 'cenario')
     returning id`,
    [id, `Lead de ${nome}`, `+55119900000${sufixo}`],
  )

  return { id, donoId, operadorId, leadId: leads[0]!.id, sufixo }
}

/**
 * Chamada mínima pela sessão de serviço, que é o único caminho que `calls` tem:
 * a tabela é da classe Servidor e não tem política de escrita de cliente.
 */
async function semearChamada(conta: Conta, chave: string): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls
       (account_id, lead_id, purpose, direction, idempotency_key)
     values ($1, $2, 'discovery', 'outbound', $3)
     returning id`,
    [conta.id, conta.leadId, chave],
  )
  return rows[0]!.id
}

/**
 * Parcela de custo pela sessão de serviço, pelo mesmo motivo: quem grava de
 * verdade é `call-finalize` e `cron-cost-sync` (US-072).
 */
async function semearCusto(
  conta: Conta,
  chamadaId: string,
  extras: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const campos: Record<string, unknown> = {
    account_id: conta.id,
    call_id: chamadaId,
    component: 'telephony',
    amount_cents: 100,
    source: 'provider_webhook',
    ...extras,
  }

  const colunas = Object.keys(campos)
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.call_costs (${colunas.join(', ')})
     values (${marcadores.join(', ')})
     returning id`,
    Object.values(campos),
  )
  return rows[0]!.id
}

async function custoDaChamada(chamadaId: string): Promise<number> {
  const { rows } = await banco.sql.query<{ cost_cents: number }>(
    'select cost_cents from public.calls where id = $1',
    [chamadaId],
  )
  return Number(rows[0]?.cost_cents)
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
  await banco.sql.query('delete from public.call_costs')
  await banco.sql.query('delete from public.calls')
})

// A soma materializada (T-20) ---------------------------------------------------------

test('os quatro componentes somam em calls.cost_cents', async () => {
  const chamadaId = await semearChamada(contaA, 'soma-1')
  // A chamada nasce em zero: a coluna é soma de nada até a primeira parcela.
  expect(await custoDaChamada(chamadaId)).toBe(0)

  await semearCusto(contaA, chamadaId, { component: 'telephony', amount_cents: 120 })
  expect(await custoDaChamada(chamadaId)).toBe(120)

  await semearCusto(contaA, chamadaId, { component: 'voice', amount_cents: 340 })
  await semearCusto(contaA, chamadaId, { component: 'model', amount_cents: 57 })
  await semearCusto(contaA, chamadaId, { component: 'infra', amount_cents: 3 })

  expect(await custoDaChamada(chamadaId)).toBe(120 + 340 + 57 + 3)
})

test('regravar o mesmo componente atualiza a soma em vez de acrescentar a ela', async () => {
  // O caso de `cron-cost-sync`: o preço da telefonia chega minutos depois do
  // fim da ligação, e a rotina roda a cada quinze minutos. Com gatilho de
  // delta, esta soma ficaria em 120 + 450 e ninguém perceberia até a
  // conciliação do mês.
  const chamadaId = await semearChamada(contaA, 'soma-2')
  await semearCusto(contaA, chamadaId, { amount_cents: 120 })

  await banco.sql.query(
    `insert into public.call_costs
       (account_id, call_id, component, amount_cents, source)
     values ($1, $2, 'telephony', 450, 'provider_webhook')
     on conflict (call_id, component, source)
       do update set amount_cents = excluded.amount_cents,
                     recorded_at = now()`,
    [contaA.id, chamadaId],
  )

  const { rows } = await banco.sql.query(
    'select id from public.call_costs where call_id = $1',
    [chamadaId],
  )
  // Uma linha, e não duas: é o único que faz a rotina ser idempotente.
  expect(rows).toHaveLength(1)
  expect(await custoDaChamada(chamadaId)).toBe(450)
})

test('apagar uma parcela reduz a soma', async () => {
  const chamadaId = await semearChamada(contaA, 'soma-3')
  await semearCusto(contaA, chamadaId, { component: 'telephony', amount_cents: 120 })
  const vozId = await semearCusto(contaA, chamadaId, {
    component: 'voice',
    amount_cents: 340,
  })
  expect(await custoDaChamada(chamadaId)).toBe(460)

  await banco.sql.query('delete from public.call_costs where id = $1', [vozId])
  expect(await custoDaChamada(chamadaId)).toBe(120)

  await banco.sql.query('delete from public.call_costs where call_id = $1', [
    chamadaId,
  ])
  // Sem parcela nenhuma a soma volta a zero, e não a nulo: `cost_cents` é not
  // null, e o `coalesce` do gatilho é o que sustenta isso.
  expect(await custoDaChamada(chamadaId)).toBe(0)
})

test('mover a parcela de uma chamada para outra recalcula as duas', async () => {
  const origem = await semearChamada(contaA, 'soma-4-origem')
  const destino = await semearChamada(contaA, 'soma-4-destino')
  const parcelaId = await semearCusto(contaA, origem, { amount_cents: 220 })

  expect(await custoDaChamada(origem)).toBe(220)
  expect(await custoDaChamada(destino)).toBe(0)

  await banco.sql.query(
    'update public.call_costs set call_id = $2 where id = $1',
    [parcelaId, destino],
  )

  // Recalcular só a chamada de destino deixaria a de origem com custo de uma
  // parcela que não é mais dela.
  expect(await custoDaChamada(origem)).toBe(0)
  expect(await custoDaChamada(destino)).toBe(220)
})

test('a soma não escapa para a chamada da conta vizinha', async () => {
  const daA = await semearChamada(contaA, 'soma-5-a')
  const daB = await semearChamada(contaB, 'soma-5-b')

  await semearCusto(contaA, daA, { amount_cents: 700 })

  expect(await custoDaChamada(daA)).toBe(700)
  expect(await custoDaChamada(daB)).toBe(0)
})

// A idempotência de cron-cost-sync ------------------------------------------------------

test('duas parcelas do mesmo componente e da mesma fonte colidem', async () => {
  const chamadaId = await semearChamada(contaA, 'unico-1')
  await semearCusto(contaA, chamadaId)

  await expect(semearCusto(contaA, chamadaId)).rejects.toThrow(
    /call_costs_parcela_unica/i,
  )
})

test('fontes diferentes do mesmo componente convivem, porque são duas medidas', async () => {
  // O webhook do provedor e a fatura conciliada medem a mesma telefonia. Uma
  // sobrescrever a outra apagaria a divergência que alguém vai querer explicar.
  const chamadaId = await semearChamada(contaA, 'unico-2')
  await semearCusto(contaA, chamadaId, {
    source: 'provider_webhook',
    amount_cents: 120,
  })
  await semearCusto(contaA, chamadaId, {
    source: 'conciliacao',
    amount_cents: 118,
  })

  expect(await custoDaChamada(chamadaId)).toBe(238)
})

// As réguas da parcela --------------------------------------------------------------------

const COMPONENTES = ['telephony', 'voice', 'model', 'infra']

test('os quatro componentes entram, e a lista do banco é exatamente essa', async () => {
  const chamadaId = await semearChamada(contaA, 'componentes')
  for (const componente of COMPONENTES) {
    const id = await semearCusto(contaA, chamadaId, {
      component: componente,
      amount_cents: 10,
    })
    expect(id).toBeTruthy()
  }

  const { rows } = await banco.sql.query<{ definicao: string }>(
    `select pg_get_constraintdef(c.oid) as definicao
       from pg_constraint as c
      where c.conname = 'call_costs_component_check'`,
  )
  const citados = [
    ...(rows[0]?.definicao ?? '').matchAll(/'([a-z_]+)'/g),
  ].map((achado) => achado[1]!)
  // A asserção do outro lado: componente retirado da migração derruba a
  // varredura acima, e componente acrescentado sem teste derruba esta.
  expect(new Set(citados)).toEqual(new Set(COMPONENTES))
})

test('componente fora dos quatro é recusado', async () => {
  const chamadaId = await semearChamada(contaA, 'componente-torto')
  await expect(
    semearCusto(contaA, chamadaId, { component: 'telefonia' }),
  ).rejects.toThrow(/call_costs_component_check/i)
})

test('preço ausente é ausência de linha, nunca linha com valor nulo (L-05)', async () => {
  const chamadaId = await semearChamada(contaA, 'valor-nulo')
  await expect(
    semearCusto(contaA, chamadaId, { amount_cents: null }),
  ).rejects.toThrow(/amount_cents/i)

  // Negativo derrubaria o check de calls.cost_cents na materialização, com erro
  // que não aponta para a linha que o causou: a correção atualiza a parcela.
  await expect(
    semearCusto(contaA, chamadaId, { amount_cents: -1 }),
  ).rejects.toThrow(/call_costs_amount_cents_check/i)
})

test('a moeda nasce em BRL e só aceita ISO 4217', async () => {
  const chamadaId = await semearChamada(contaA, 'moeda')
  const id = await semearCusto(contaA, chamadaId)

  const { rows } = await banco.sql.query<{ currency: string }>(
    'select currency from public.call_costs where id = $1',
    [id],
  )
  expect(rows[0]?.currency).toBe('BRL')

  // O provedor de voz cobra em dólar, e a conciliação precisa saber o que está
  // somando.
  const emDolar = await semearCusto(contaA, chamadaId, {
    component: 'voice',
    currency: 'USD',
  })
  expect(emDolar).toBeTruthy()

  await expect(
    semearCusto(contaA, chamadaId, { component: 'model', currency: 'real' }),
  ).rejects.toThrow(/call_costs_currency_check/i)
})

test('a fonte do preço não pode ser vazia', async () => {
  const chamadaId = await semearChamada(contaA, 'fonte-vazia')
  await expect(
    semearCusto(contaA, chamadaId, { source: '   ' }),
  ).rejects.toThrow(/call_costs_source_check/i)
})

// As chaves ------------------------------------------------------------------------------

test('parcela sem chamada é recusada', async () => {
  // Custo sem chamada não se atribui nem ao teto de gasto do dia nem ao custo
  // da reunião.
  const chamadaId = await semearChamada(contaA, 'sem-chamada')
  expect(chamadaId).toBeTruthy()
  await expect(
    semearCusto(contaA, chamadaId, { call_id: null }),
  ).rejects.toThrow(/call_id/i)
})

test('parcela da conta B pendurada numa chamada da conta A é recusada', async () => {
  const daA = await semearChamada(contaA, 'chave-composta')

  // Com duas chaves simples esta linha entraria: ela apontaria para uma conta
  // que existe e para uma chamada que existe, e ficaria invisível para quem
  // paga a ligação — somada no teto de gasto da conta errada.
  await expect(semearCusto(contaB, daA)).rejects.toThrow(
    /call_costs_da_chamada_da_conta/i,
  )
})

test('apagar a chamada leva as parcelas junto', async () => {
  const chamadaId = await semearChamada(contaA, 'cascata')
  await semearCusto(contaA, chamadaId)

  await banco.sql.query('delete from public.calls where id = $1', [chamadaId])

  const { rows } = await banco.sql.query(
    'select id from public.call_costs where call_id = $1',
    [chamadaId],
  )
  // Cascata, e não restrição: `calls` já cascateia do lead, e uma restrição
  // aqui travaria o apagamento de RF-808.
  expect(rows).toEqual([])
})

test('apagar o lead leva chamada e custo junto (RF-808)', async () => {
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Lead efêmero', '+5511970000009', 'cenario')
     returning id`,
    [contaA.id],
  )
  const leadId = leads[0]!.id

  const { rows: chamadas } = await banco.sql.query<{ id: string }>(
    `insert into public.calls
       (account_id, lead_id, purpose, direction, idempotency_key)
     values ($1, $2, 'discovery', 'outbound', 'cascata-do-lead')
     returning id`,
    [contaA.id, leadId],
  )
  const chamadaId = chamadas[0]!.id
  await semearCusto(contaA, chamadaId)

  await banco.sql.query('delete from public.leads where id = $1', [leadId])

  const { rows } = await banco.sql.query(
    'select id from public.call_costs where call_id = $1',
    [chamadaId],
  )
  expect(rows).toEqual([])
})

// O índice do teto de gasto ----------------------------------------------------------------

test('o índice do gasto da conta existe com as colunas na ordem declarada', async () => {
  // Direto do catálogo, e não do texto do `indexdef`: é a ordem das colunas que
  // faz a soma do dia ser uma faixa lida de ponta a ponta, com a trava da
  // guarda na mão.
  const { rows } = await banco.sql.query<{ coluna: string }>(
    `select a.attname as coluna
       from pg_index as i
       join pg_class as idx on idx.oid = i.indexrelid
      cross join lateral unnest(string_to_array(i.indkey::text, ' ')::smallint[])
            with ordinality as posicao(atributo, ordem)
       join pg_attribute as a
         on a.attrelid = i.indrelid and a.attnum = posicao.atributo
      where idx.relname = 'call_costs_gasto_da_conta'
      order by posicao.ordem`,
  )
  expect(rows.map((linha) => linha.coluna)).toEqual([
    'account_id',
    'recorded_at',
  ])
})

// A atribuição que o teto de gasto usa ------------------------------------------------------

test('a soma do dia de uma conta não inclui nenhuma linha da vizinha', async () => {
  // As duas contas ligam no mesmo instante, que é o caso em que uma soma
  // recortada só por tempo devolveria o dinheiro das duas.
  const instante = '2026-09-22T14:00:00Z'
  const daA = await semearChamada(contaA, 'gasto-a')
  const daB = await semearChamada(contaB, 'gasto-b')

  await semearCusto(contaA, daA, { amount_cents: 700, recorded_at: instante })
  await semearCusto(contaA, daA, {
    component: 'voice',
    amount_cents: 300,
    recorded_at: instante,
  })
  await semearCusto(contaB, daB, { amount_cents: 5_000, recorded_at: instante })

  const { rows } = await banco.sql.query<{ total: number | string }>(
    `select coalesce(sum(amount_cents), 0) as total
       from public.call_costs
      where account_id = $1
        and recorded_at >= $2::timestamptz
        and recorded_at < $2::timestamptz + interval '1 day'`,
    [contaA.id, '2026-09-22T00:00:00Z'],
  )
  // É esta soma que o passo 7 da guarda compara com daily_spend_cap_cents: um
  // centavo da vizinha aqui recusaria discagem que a conta tinha direito de
  // fazer, ou liberaria a que ela não tinha.
  expect(Number(rows[0]?.total)).toBe(1_000)
})

// Isolamento (classe Servidor) ---------------------------------------------------------------

test('o membro lê e o dono não insere, não altera e não apaga', async () => {
  const chamadaId = await semearChamada(contaA, 'isolamento-1')
  const id = await semearCusto(contaA, chamadaId, { amount_cents: 900 })

  await banco.comoUsuario(contaA.donoId)

  const { rows: lidos } = await banco.sql.query(
    'select id from public.call_costs where id = $1',
    [id],
  )
  // Ler é de todo membro: é por estas linhas que a ficha explica de que o preço
  // da ligação é feito.
  expect(lidos).toHaveLength(1)

  // Escrever o próprio custo é desligar o teto de gasto por dentro.
  await expect(
    banco.sql.query(
      `insert into public.call_costs
         (account_id, call_id, component, amount_cents, source)
       values ($1, $2, 'infra', 1, 'inventada')`,
      [contaA.id, chamadaId],
    ),
  ).rejects.toThrow(/row-level security/i)

  // RLS que não casa não levanta erro: simplesmente não afeta linha.
  const { rows: alterados } = await banco.sql.query(
    'update public.call_costs set amount_cents = 1 where id = $1 returning id',
    [id],
  )
  expect(alterados).toEqual([])

  // Apagar é devolver orçamento já gasto.
  const { rows: apagados } = await banco.sql.query(
    'delete from public.call_costs where id = $1 returning id',
    [id],
  )
  expect(apagados).toEqual([])

  await banco.comoServico()
  // E a soma continua de pé, porque nenhuma das três escritas aconteceu.
  expect(await custoDaChamada(chamadaId)).toBe(900)
})

test('o operador lê e também não escreve', async () => {
  const chamadaId = await semearChamada(contaA, 'isolamento-2')
  const id = await semearCusto(contaA, chamadaId)

  await banco.comoUsuario(contaA.operadorId)
  const { rows } = await banco.sql.query(
    'select id from public.call_costs where id = $1',
    [id],
  )
  expect(rows).toHaveLength(1)

  const { rows: alterados } = await banco.sql.query(
    `update public.call_costs set source = 'manual' where id = $1 returning id`,
    [id],
  )
  expect(alterados).toEqual([])
})

test('a tabela não tem política de escrita nenhuma no catálogo', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ cmd: string }>(
    `select cmd from pg_policies
      where schemaname = 'public' and tablename = 'call_costs'`,
  )
  // A ausência é o contrato da classe Servidor: política nova de escrita
  // reprova aqui antes de alguém descobrir pelo teto de gasto que parou de
  // valer.
  expect(rows.map((linha) => linha.cmd)).toEqual(['SELECT'])
})

test('a conta vizinha recebe zero linha, e o anônimo também', async () => {
  const daA = await semearChamada(contaA, 'vizinha-a')
  const daB = await semearChamada(contaB, 'vizinha-b')
  await semearCusto(contaA, daA)
  await semearCusto(contaB, daB)

  await banco.comoUsuario(contaA.donoId)
  const { rows } = await banco.sql.query<{ account_id: string }>(
    'select account_id from public.call_costs',
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.account_id).toBe(contaA.id)

  await banco.comoAnonimo()
  const { rows: semNada } = await banco.sql.query(
    'select id from public.call_costs',
  )
  expect(semNada).toEqual([])
})
