// O `for update skip locked` da fila de discagem, com duas passagens de
// `cron-dial` sobrepostas (L-14).
//
// ESTE ARQUIVO NÃO RODA NO LAÇO LOCAL, E A RAZÃO É ESTRUTURAL: PGlite atende
// uma conexão só. Duas transações sobrepostas são o próprio objeto da prova, e
// numa conexão só a segunda nem começa — não há concorrência para observar,
// nem bloqueio para pular. O teste fica escrito aqui, sob `runIf`, e roda no
// degrau 3, contra o Postgres real que o CI levanta com `supabase db reset`
// (`npm run test:fila:postgres`). Sem `SUPABASE_DB_URL`, os testes são pulados
// e o arquivo não abre conexão nenhuma.
//
// O que ele prova, e que nenhum outro teste alcança:
//
// 1. **Duas passagens simultâneas tomam itens diferentes.** É o contrato de
//    `cron-dial` (L-14): a rotina roda a cada minuto e pode se sobrepor à
//    anterior, e sem `skip locked` duas passagens disputariam a mesma linha —
//    ou discariam duas vezes, ou uma esperaria a outra segurando o minuto.
// 2. **As linhas tomadas estão de fato travadas.** A mesma consulta sem `skip
//    locked` esbarra no bloqueio em vez de passar por cima dele. Sem esta
//    metade, o primeiro teste passaria também numa implementação que não trava
//    nada — bastaria cada passagem pegar um pedaço diferente por sorte de
//    ordenação.
// 3. **`reivindicar_da_fila`, a tomada de `cron-dial`, não entrega o mesmo
//    item a duas passagens** (US-076): a segunda espera a trava da conta, conta
//    o que a primeira tomou e sai com o resto.
//
// Referência: migrações 20260922080000_fila_de_discagem.sql e
// 20260923140000_despacho_da_fila.sql,
// docs/PRD-implementacao.md seções 3.7 e 4.6, docs/revisao-tecnica.md L-14.

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
const MARCA = `f${Date.now().toString(36)}`

/** Quantos itens o cenário enfileira, e quantos cada passagem toma. */
const ITENS = 4
const LOTE = 2

/** A consulta do minuto, com e sem o `skip locked` que está em prova. */
function consultaDaFila(pular: boolean): string {
  return `select id from public.dial_queue
           where account_id = $1 and status = 'queued' and run_at <= now()
           order by run_at, id
           for update${pular ? ' skip locked' : ''}
           limit ${LOTE}`
}

/** Duas conexões: uma por passagem de cron-dial. */
let primeira: BancoDeTeste | undefined
let segunda: BancoDeTeste | undefined
let contaId: string

beforeAll(async () => {
  if (EFEMERO) return

  primeira = await abrirBancoParaRls()
  segunda = await abrirBancoParaRls()

  await primeira.comoServico()
  const { rows } = await primeira.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [`${MARCA} Concorrência`],
  )
  contaId = rows[0]!.id

  // Sem lead de propósito: o que está em prova é a tomada da linha, e
  // `lead_id` nulo é o caso do discador manual para número de teste (L-03).
  for (let indice = 1; indice <= ITENS; indice += 1) {
    await primeira.sql.query(
      `insert into public.dial_queue
         (account_id, purpose, source, source_ref)
       values ($1, 'discovery', 'manual', $2)`,
      [contaId, `${MARCA}-${indice}`],
    )
  }

  await segunda.comoServico()
}, 60_000)

afterAll(async () => {
  if (primeira) {
    await primeira.sql.exec('rollback').catch(() => undefined)
    await primeira.comoServico()
    await primeira.sql.query('delete from public.accounts where id = $1', [
      contaId,
    ])
    await primeira.encerrar()
  }
  if (segunda) {
    await segunda.sql.exec('rollback').catch(() => undefined)
    await segunda.encerrar()
  }
})

test.runIf(!EFEMERO)(
  'duas passagens sobrepostas tomam itens diferentes da fila',
  async () => {
    expect(primeira!.efemero, 'concorrência só contra Postgres real').toBe(false)

    try {
      await primeira!.sql.exec('begin')
      const { rows: daPrimeira } = await primeira!.sql.query<{ id: string }>(
        consultaDaFila(true),
        [contaId],
      )

      // A segunda passagem começa com a primeira ainda aberta: é exatamente o
      // que acontece quando a execução do minuto anterior não terminou.
      await segunda!.sql.exec('begin')
      const { rows: daSegunda } = await segunda!.sql.query<{ id: string }>(
        consultaDaFila(true),
        [contaId],
      )

      expect(daPrimeira).toHaveLength(LOTE)
      expect(daSegunda).toHaveLength(LOTE)

      const tomados = new Set([
        ...daPrimeira.map((linha) => linha.id),
        ...daSegunda.map((linha) => linha.id),
      ])
      // Interseção vazia: nenhum item é discado duas vezes, e nenhuma passagem
      // fica esperando a outra segurando o minuto.
      expect(tomados.size).toBe(ITENS)
    } finally {
      await primeira!.sql.exec('rollback').catch(() => undefined)
      await segunda!.sql.exec('rollback').catch(() => undefined)
    }
  },
)

test.runIf(!EFEMERO)(
  'sem skip locked a segunda passagem esbarra no bloqueio da primeira',
  async () => {
    try {
      await primeira!.sql.exec('begin')
      await primeira!.sql.query(consultaDaFila(true), [contaId])

      await segunda!.sql.exec('begin')
      // Sem o tempo limite, a espera seria indefinida e o teste travaria em vez
      // de reprovar. Com ele, o bloqueio vira erro observável: 55P03.
      await segunda!.sql.exec("set local lock_timeout = '250ms'")

      // A mesma consulta sem `skip locked`. Se as linhas não estivessem
      // travadas, ela voltaria com as mesmas duas — e o teste de cima estaria
      // provando sorte de ordenação, não exclusão.
      await expect(
        segunda!.sql.query(consultaDaFila(false), [contaId]),
      ).rejects.toMatchObject({ code: '55P03' })
    } finally {
      await primeira!.sql.exec('rollback').catch(() => undefined)
      await segunda!.sql.exec('rollback').catch(() => undefined)
    }
  },
)

// A reivindicação de verdade, com as duas passagens sobrepostas. Ela trava a
// linha de `account_settings` da conta antes de contar as vagas, então a
// segunda passagem **espera** a primeira terminar a tomada e depois conta o que
// ela tomou — é o que impede duas passagens de lerem as mesmas vagas livres. O
// teste deixa a segunda na espera, confirma a primeira e cobra que a segunda
// volte com os itens que sobraram, e nenhum repetido. Vem por último porque
// confirma a tomada: os itens ficam `claimed` até o `afterAll` apagar a conta.
test.runIf(!EFEMERO)(
  'reivindicar_da_fila com duas passagens sobrepostas não entrega o mesmo item duas vezes',
  async () => {
    await primeira!.sql.query(
      'update public.account_settings set max_concurrent = 10 where account_id = $1',
      [contaId],
    )
    const reivindicar = `select id from public.reivindicar_da_fila($1, ${LOTE}, now())`

    try {
      await primeira!.sql.exec('begin')
      const { rows: daPrimeira } = await primeira!.sql.query<{ id: string }>(reivindicar, [contaId])

      await segunda!.sql.exec('begin')
      const pendente = segunda!.sql.query<{ id: string }>(reivindicar, [contaId])

      await primeira!.sql.exec('commit')
      const { rows: daSegunda } = await pendente
      await segunda!.sql.exec('commit')

      expect(daPrimeira).toHaveLength(LOTE)
      expect(daSegunda).toHaveLength(LOTE)
      const tomados = new Set([...daPrimeira, ...daSegunda].map((linha) => linha.id))
      expect(tomados.size).toBe(ITENS)
    } finally {
      await primeira!.sql.exec('rollback').catch(() => undefined)
      await segunda!.sql.exec('rollback').catch(() => undefined)
    }
  },
)
