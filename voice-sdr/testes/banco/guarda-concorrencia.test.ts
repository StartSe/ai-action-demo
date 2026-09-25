// O advisory lock da guarda, com duas discagens sobrepostas (T-05).
//
// ESTE ARQUIVO NÃO RODA NO LAÇO LOCAL, E A RAZÃO É ESTRUTURAL: PGlite atende
// uma conexão só. Duas transações sobrepostas são o próprio objeto da prova, e
// numa conexão só a segunda nem começa — não há disputa para observar, nem
// trava para esperar. O teste fica escrito aqui, sob `runIf`, e roda no degrau
// 3, contra o Postgres real que o CI levanta com `supabase db reset`
// (`npm run test:guarda:postgres`). Sem `SUPABASE_DB_URL`, os testes são
// pulados e o arquivo não abre conexão nenhuma.
//
// É a dívida central da US-058, e o que ela cobre é exatamente o defeito que
// `guard_dial` existe para corrigir: duas discagens simultâneas que leem o mesmo
// contador passam as duas, e o teto deixa de ser teto. `guarda-de-discagem.test.ts`
// prova os nove passos um por um, mas prova todos em série — uma guarda que
// contasse certo e não travasse nada passaria naquele arquivo inteiro.
//
// O que este arquivo prova, e que nenhum outro alcança:
//
// 1. **A segunda discagem espera a primeira.** Com a transação da primeira
//    aberta, a segunda esbarra na trava em vez de contar por cima dela. Sem
//    esta metade, o teste de baixo passaria também numa implementação que
//    contasse dentro de uma transação sem travar nada — bastaria a segunda
//    chegar depois do commit da primeira por sorte de agendamento.
// 2. **O teto de um não vira dois.** Com `daily_calls_cap = 1`, duas discagens
//    sobrepostas ao mesmo número devolvem uma `placed` e uma
//    `daily_per_account`, e `call_attempts` fica com exatamente uma linha
//    `placed`.
//
// Referência: migração 20260922110000_guarda_de_discagem.sql,
// docs/PRD-implementacao.md seção 6, docs/revisao-tecnica.md T-05 e T-06,
// docs/PRD.md RF-010.

import { afterAll, beforeAll, expect, test } from 'vitest'

import type { BancoDeTeste } from '../auxiliares/banco-de-teste.ts'
import {
  abrirBancoParaRls,
  VARIAVEL_DE_CONEXAO,
} from '../auxiliares/banco-para-rls.ts'

/**
 * Banco descartável é PGlite, e PGlite não tem concorrência. A decisão é de
 * coleta, e por isso lê a variável de ambiente em vez de `banco.efemero`: o
 * `runIf` do Vitest é avaliado antes do `beforeAll`. O próprio teste confirma
 * `banco.efemero` depois, para o dia em que a variável apontar para um banco
 * que não seja o esperado.
 */
const EFEMERO = process.env[VARIAVEL_DE_CONEXAO] === undefined

/** Marca desta execução: o que ela criar, ela apaga. */
const MARCA = `g${Date.now().toString(36)}`

/** Quarta-feira, 14h em São Paulo: dentro da janela padrão. */
const QUARTA_14H = '2026-09-23T17:00:00Z'

/** O destino, que entra na lista de números de teste da conta. */
const DESTINO = '+5511999997001'

/** A chamada da guarda, com o cenário desta prova. */
const CHAMADA_DA_GUARDA = `
  select allowed, reason
    from public.guard_dial(
      p_account_id => $1::uuid,
      p_phone_e164 => $2::text,
      p_lead_id => null,
      p_actor => 'system',
      p_actor_id => null,
      p_source => 'cenario',
      p_campaign_id => null,
      p_bypass => array['min_interval', 'daily_per_number']::text[],
      p_instante => $3::timestamptz
    )`

/** Duas conexões: uma por discagem simultânea. */
let primeira: BancoDeTeste | undefined
let segunda: BancoDeTeste | undefined
let contaId: string

beforeAll(async () => {
  if (EFEMERO) return

  primeira = await abrirBancoParaRls()
  segunda = await abrirBancoParaRls()

  await primeira.comoServico()
  const { rows } = await primeira.sql.query<{ id: string }>(
    `insert into public.accounts (name, timezone)
     values ($1, 'America/Sao_Paulo') returning id`,
    [`${MARCA} Concorrência da guarda`],
  )
  contaId = rows[0]!.id

  // O portão da fatia está fechado (L-03), então o destino precisa ser número
  // de teste da conta — é o caminho real do discador manual na F2.
  await primeira.sql.query(
    `insert into public.account_test_numbers (account_id, phone_e164, label)
     values ($1, $2, $3)`,
    [contaId, DESTINO, `${MARCA} destino`],
  )
  await primeira.sql.query(
    `insert into public.phone_lines (account_id, e164, label)
     values ($1, $2, $3)`,
    [contaId, '+5511400009001', `${MARCA} linha`],
  )
  // Teto de uma ligação por dia: é o número que torna a disputa visível.
  await primeira.sql.query(
    'update public.account_settings set daily_calls_cap = 1 where account_id = $1',
    [contaId],
  )

  await segunda.comoServico()
}, 60_000)

afterAll(async () => {
  if (primeira) {
    await primeira.sql.exec('rollback').catch(() => undefined)
    await primeira.comoServico()
    await primeira.sql.query('delete from public.accounts where id = $1', [contaId])
    await primeira.encerrar()
  }
  if (segunda) {
    await segunda.sql.exec('rollback').catch(() => undefined)
    await segunda.encerrar()
  }
})

test.runIf(!EFEMERO)(
  'a segunda discagem espera a trava da primeira em vez de contar por cima',
  async () => {
    expect(primeira!.efemero, 'concorrência só contra Postgres real').toBe(false)

    try {
      await primeira!.sql.exec('begin')
      await primeira!.sql.query(CHAMADA_DA_GUARDA, [contaId, DESTINO, QUARTA_14H])

      await segunda!.sql.exec('begin')
      // Sem o tempo limite, a espera seria indefinida e o teste travaria em vez
      // de reprovar. Com ele, a trava vira erro observável: 55P03.
      await segunda!.sql.exec("set local lock_timeout = '250ms'")

      await expect(
        segunda!.sql.query(CHAMADA_DA_GUARDA, [contaId, DESTINO, QUARTA_14H]),
      ).rejects.toMatchObject({ code: '55P03' })
    } finally {
      await primeira!.sql.exec('rollback').catch(() => undefined)
      await segunda!.sql.exec('rollback').catch(() => undefined)
    }
  },
)

test.runIf(!EFEMERO)(
  'duas discagens simultâneas não passam do teto de uma',
  async () => {
    try {
      await primeira!.sql.exec('begin')
      const { rows: daPrimeira } = await primeira!.sql.query<{
        allowed: boolean
        reason: string
      }>(CHAMADA_DA_GUARDA, [contaId, DESTINO, QUARTA_14H])

      // A segunda chega com a primeira ainda aberta: é o caso de duas passagens
      // de `cron-dial` sobrepostas, ou de dois operadores clicando junto. Ela
      // fica esperando a trava, e só responde depois do commit da primeira —
      // quando a tentativa da primeira já está gravada e a contagem a enxerga.
      const promessaDaSegunda = segunda!.sql
        .exec('begin')
        .then(() =>
          segunda!.sql.query<{ allowed: boolean; reason: string }>(
            CHAMADA_DA_GUARDA,
            [contaId, DESTINO, QUARTA_14H],
          ),
        )

      await primeira!.sql.exec('commit')
      const { rows: daSegunda } = await promessaDaSegunda
      await segunda!.sql.exec('commit')

      expect(daPrimeira[0]!.allowed).toBe(true)
      expect(daPrimeira[0]!.reason).toBe('placed')

      // Sem a trava, esta seria a segunda `placed` do dia numa conta de teto 1.
      expect(daSegunda[0]!.allowed).toBe(false)
      expect(daSegunda[0]!.reason).toBe('daily_per_account')

      await primeira!.comoServico()
      const { rows: gravadas } = await primeira!.sql.query<{ outcome: string }>(
        `select outcome from public.call_attempts
          where account_id = $1 order by outcome`,
        [contaId],
      )
      expect(gravadas.map((linha) => linha.outcome)).toEqual([
        'daily_per_account',
        'placed',
      ])
    } finally {
      await primeira!.sql.exec('rollback').catch(() => undefined)
      await segunda!.sql.exec('rollback').catch(() => undefined)
      await primeira!.comoServico()
      await primeira!.sql
        .query('delete from public.call_attempts where account_id = $1', [contaId])
        .catch(() => undefined)
    }
  },
)
