// A janela de discagem lida pelo banco. O outro lado da mesma tabela de casos
// está em `supabase/functions/_shared/discagem/janela.test.ts`, contra o módulo
// portável.
//
// O que este arquivo prova:
//
// 1. **Os casos de `casos-de-janela.ts`, um por um**, contra
//    `dentro_da_janela_de_discagem` e `proxima_abertura_de_discagem`. Como o
//    módulo é cobrado pela mesma tabela em `test:unit`, divergência entre as
//    duas implementações da mesma regra reprova de um lado ou do outro.
// 2. **Janela malformada não chega à guarda**: o gatilho de `account_settings`
//    recusa cada um dos casos inválidos na escrita, e a função, se recebesse um
//    deles mesmo assim, não discaria.
// 3. **Lead sem fuso cai no fuso da conta**, que é a forma
//    `coalesce(leads.timezone, accounts.timezone)` que a guarda vai usar —
//    nunca UTC, que deslocaria a janela em três horas.
// 4. As três funções são da borda de serviço: `authenticated` e `anon` não as
//    executam.
//
// Referência: migração 20260922100000_janela_de_discagem.sql,
// docs/PRD-implementacao.md seção 6 passo 4, docs/revisao-tecnica.md R-10 e
// T-21, docs/PRD.md RF-801.

import { afterAll, beforeAll, expect, test } from 'vitest'

import {
  CASOS_INVALIDOS,
  CASOS_VALIDOS,
  JANELA_COMERCIAL,
  MANAUS,
  SAO_PAULO,
} from '../../supabase/functions/_shared/discagem/casos-de-janela.ts'
import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** SQLSTATE que o gatilho da janela levanta: invalid_parameter_value. */
const PARAMETRO_INVALIDO = '22023'

let banco: BancoDeTeste
let contaId: string

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name, timezone) values ($1, $2) returning id`,
    ['Janela', SAO_PAULO],
  )
  contaId = rows[0]!.id
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

/** A decisão do banco, no mesmo formato da tabela de casos. */
async function decisaoDoBanco(
  janela: unknown,
  instante: string,
  fuso: string,
): Promise<{ dentro: boolean; proximaAbertura: string | null }> {
  const { rows } = await banco.sql.query<{
    dentro: boolean
    proxima: string | null
  }>(
    `select public.dentro_da_janela_de_discagem($1::jsonb, $2::timestamptz, $3) as dentro,
            to_char(
              public.proxima_abertura_de_discagem($1::jsonb, $2::timestamptz, $3) at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS"Z"'
            ) as proxima`,
    [JSON.stringify(janela), instante, fuso],
  )
  return { dentro: rows[0]!.dentro, proximaAbertura: rows[0]!.proxima }
}

// Os casos --------------------------------------------------------------------

test.each(CASOS_VALIDOS.map((caso) => [caso.nome, caso] as const))(
  'o banco decide o caso: %s',
  async (_nome, caso) => {
    const decisao = await decisaoDoBanco(caso.janela, caso.instante, caso.fuso)

    expect(decisao.dentro).toBe(caso.dentro)
    expect(decisao.proximaAbertura).toBe(caso.proximaAbertura)
  },
)

test('a tabela de casos chega inteira aos dois lados', () => {
  expect(CASOS_VALIDOS.length).toBeGreaterThanOrEqual(12)
  expect(CASOS_INVALIDOS.length).toBeGreaterThanOrEqual(5)
})

// Configuração quebrada -------------------------------------------------------

test.each(CASOS_INVALIDOS.map((caso) => [caso.nome, caso] as const))(
  'o gatilho recusa na escrita: %s',
  async (_nome, caso) => {
    await banco.comoServico()
    const erro = await banco.sql
      .query(
        `update public.account_settings set dialing_window = $2::jsonb where account_id = $1`,
        [contaId, JSON.stringify(caso.janela)],
      )
      .then(
        () => null,
        (erro: { code?: string }) => erro,
      )

    expect(erro?.code).toBe(PARAMETRO_INVALIDO)

    // E se uma delas chegasse à função assim mesmo, a resposta é não discar: o
    // banco não precisa separar "sem faixa" de "quebrada", e quem separa para a
    // tela é o módulo.
    const decisao = await decisaoDoBanco(caso.janela, caso.instante, caso.fuso)
    expect(decisao.dentro).toBe(false)
    expect(decisao.proximaAbertura).toBeNull()
  },
)

test('a janela guardada na coluna é a que a função lê', async () => {
  await banco.comoServico()
  await banco.sql.query(
    `update public.account_settings set dialing_window = $2::jsonb where account_id = $1`,
    [contaId, JSON.stringify(JANELA_COMERCIAL)],
  )

  const { rows } = await banco.sql.query<{ dentro: boolean }>(
    `select public.dentro_da_janela_de_discagem(
              c.dialing_window, $2::timestamptz, $3
            ) as dentro
       from public.account_settings c
      where c.account_id = $1`,
    [contaId, '2026-10-07T01:00:00Z', SAO_PAULO],
  )

  expect(rows[0]?.dentro).toBe(false)
})

// O fuso do lead --------------------------------------------------------------

test('lead sem fuso cai no fuso da conta, e não em UTC', async () => {
  await banco.comoServico()
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, timezone)
     values ($1, 'Sem fuso', '+5511999990001', null),
            ($1, 'De Manaus', '+5592999990002', $2)
     returning id`,
    [contaId, MANAUS],
  )
  expect(leads).toHaveLength(2)

  // 22h em São Paulo. Para o lead sem fuso, que herda o da conta, é 22h e está
  // fora. Para o de Manaus é 21h, e continua fora — mas em UTC seria 1h da
  // manhã do dia seguinte, que é outro dia da semana e outra decisão.
  const { rows } = await banco.sql.query<{
    nome: string
    fuso: string
    dentro: boolean
  }>(
    `select l.name as nome,
            coalesce(l.timezone, a.timezone) as fuso,
            public.dentro_da_janela_de_discagem(
              c.dialing_window, $2::timestamptz, coalesce(l.timezone, a.timezone)
            ) as dentro
       from public.leads l
       join public.accounts a on a.id = l.account_id
       join public.account_settings c on c.account_id = l.account_id
      where l.account_id = $1
      order by l.name`,
    [contaId, '2026-10-07T01:00:00Z'],
  )

  expect(rows).toEqual([
    { nome: 'De Manaus', fuso: MANAUS, dentro: false },
    { nome: 'Sem fuso', fuso: SAO_PAULO, dentro: false },
  ])
})

test('o fuso da conta é obrigatório, e é isso que faz o coalesce ter fundo', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ nulavel: string }>(
    `select is_nullable as nulavel
       from information_schema.columns
      where table_schema = 'public' and table_name = 'accounts' and column_name = 'timezone'`,
  )

  expect(rows[0]?.nulavel).toBe('NO')
})

// Quem executa ----------------------------------------------------------------

test('só a borda de serviço executa as três funções', async () => {
  await banco.comoServico()
  const assinaturas = [
    'public.faixa_do_dia_da_janela(jsonb, integer)',
    'public.dentro_da_janela_de_discagem(jsonb, timestamptz, text)',
    'public.proxima_abertura_de_discagem(jsonb, timestamptz, text)',
  ]

  for (const assinatura of assinaturas) {
    const { rows } = await banco.sql.query<{
      servico: boolean
      autenticado: boolean
      anonimo: boolean
    }>(
      `select has_function_privilege('service_role', $1, 'execute') as servico,
              has_function_privilege('authenticated', $1, 'execute') as autenticado,
              has_function_privilege('anon', $1, 'execute') as anonimo`,
      [assinatura],
    )

    expect(rows[0]).toEqual({ servico: true, autenticado: false, anonimo: false })
  }
})
