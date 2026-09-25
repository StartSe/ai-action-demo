// Junção embutida do PostgREST, conferida contra o catálogo.
//
// Este teste existe por causa de um defeito que apareceu três vezes na mesma
// sessão, sempre do mesmo jeito: `select('..., outra_tabela(coluna)')` funciona
// enquanto houver **uma** chave estrangeira entre as duas tabelas, e passa a ser
// recusado com `PGRST201` no instante em que nasce a segunda. A segunda costuma
// ser a chave composta que este projeto usa de propósito — `(id, account_id)`,
// que impede uma filha se pendurar em pai de outra conta.
//
// Ou seja: a consulta quebra ao se **melhorar** o isolamento, e quebra em
// produção, longe de quem escreveu a migração. Nada mais pega isso — o dublê dos
// testes de componente responde o que perguntarmos, e o PGlite não fala
// PostgREST. O que dá para conferir sem rede é a condição que causa o erro: há
// mais de um caminho entre as duas tabelas, e a junção não escolheu nenhum.
//
// Como corrigir quando este teste reprovar: nomeie a relação na consulta,
// `outra_tabela!nome_da_constraint(coluna)`, escolhendo a que carrega a conta.

import { afterAll, beforeAll, expect, test } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url))

let banco: BancoDeTeste

beforeAll(async () => {
  banco = await criarBancoDeTeste()
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

/** Uma junção embutida encontrada no código, com onde ela está escrita. */
interface JuncaoEncontrada {
  readonly arquivo: string
  /** A tabela da consulta, de onde a junção parte. */
  readonly base: string
  /** A tabela embutida, como a consulta a nomeia. */
  readonly tabela: string
  /** A consulta declarou qual relação usar (`tabela!constraint(...)`). */
  readonly nomeada: boolean
}

async function arquivosDe(raiz: string): Promise<string[]> {
  const entradas = await readdir(raiz, { withFileTypes: true, recursive: true })
  return entradas
    .filter(
      (e) =>
        e.isFile() &&
        (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) &&
        !e.name.includes('.test.'),
    )
    .map((e) => `${e.parentPath}/${e.name}`)
}

/**
 * Varre a interface e as funções de servidor atrás de junção embutida, e leva
 * junto a tabela da consulta — sem ela, o teste compararia a tabela embutida
 * com o esquema inteiro e acusaria par ambíguo onde a consulta nem passa.
 *
 * O nome das colunas quase nunca está no `select`: costuma vir de uma
 * constante, e por isso a varredura as resolve antes.
 */
async function juncoesNoCodigo(): Promise<JuncaoEncontrada[]> {
  const achadas: JuncaoEncontrada[] = []
  const raizes = [`${RAIZ}app/src/`, `${RAIZ}supabase/functions/`]

  for (const raiz of raizes) {
    for (const caminho of await arquivosDe(raiz)) {
      if (caminho.includes('/testes/')) continue
      const fonte = await readFile(caminho, 'utf8')

      const constantes = new Map<string, string>()
      for (const m of fonte.matchAll(
        /const\s+([A-Z_][A-Z0-9_]*)\s*=\s*\[([^\]]*)\]\s*\.join/g,
      )) {
        constantes.set(m[1] ?? '', m[2] ?? '')
      }
      for (const m of fonte.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*'([^']*)'/g)) {
        constantes.set(m[1] ?? '', m[2] ?? '')
      }

      // `.from('X')` e o que vem depois, até o próximo `.from(` ou o fim.
      for (const m of fonte.matchAll(/\.from\(\s*'([a-z_]+)'\s*\)/g)) {
        const base = m[1] ?? ''
        const trecho = fonte.slice(m.index ?? 0, (m.index ?? 0) + 600)

        const selects: string[] = []
        for (const s of trecho.matchAll(/\.select[^(]*\(\s*(?:'([^']*)'|([A-Z_][A-Z0-9_]*))/g)) {
          const literal = s[1]
          const porConstante = s[2] ? constantes.get(s[2]) : undefined
          if (literal) selects.push(literal)
          else if (porConstante) selects.push(porConstante)
        }

        for (const texto of selects) {
          for (const j of texto.matchAll(
            /(?:^|,\s*)(?:\w+:)?([a-z_]+)((?:![a-z_]+)*)\(/g,
          )) {
            const tabela = j[1] ?? ''
            const marcas = (j[2] ?? '').replace('!inner', '')
            achadas.push({
              arquivo: caminho.slice(RAIZ.length),
              base,
              tabela,
              // `!inner` só diz que a junção é obrigatória; quem desfaz a
              // ambiguidade é o nome da constraint.
              nomeada: /![a-z_]+/.test(marcas),
            })
          }
        }
      }
    }
  }

  return achadas
}

/** Quantos caminhos existem entre duas tabelas, nos dois sentidos. */
async function caminhosEntre(a: string, b: string): Promise<number> {
  const { rows } = await banco.sql.query<{ total: string | number }>(
    `select count(*) as total
       from pg_constraint
      where contype = 'f'
        and (
          (conrelid = to_regclass('public.' || $1) and confrelid = to_regclass('public.' || $2))
          or
          (conrelid = to_regclass('public.' || $2) and confrelid = to_regclass('public.' || $1))
        )`,
    [a, b],
  )
  return Number(rows[0]?.total ?? 0)
}

test('a varredura acha as junções embutidas do código', async () => {
  const juncoes = await juncoesNoCodigo()

  // Se isto cair para zero, a varredura parou de enxergar e o teste seguinte
  // passaria verde sem conferir nada.
  expect(juncoes.length).toBeGreaterThan(0)
})

test('nenhuma junção embutida fica ambígua no catálogo', async () => {
  const juncoes = await juncoesNoCodigo()
  const ambiguas: string[] = []

  for (const juncao of juncoes) {
    if (juncao.nomeada || juncao.base === juncao.tabela) continue

    const { rows } = await banco.sql.query<{ existe: string | null }>(
      "select to_regclass('public.' || $1)::text as existe",
      [juncao.tabela],
    )
    if (!rows[0]?.existe) continue

    const caminhos = await caminhosEntre(juncao.base, juncao.tabela)
    if (caminhos > 1) {
      ambiguas.push(
        `${juncao.arquivo}: from('${juncao.base}') com ${juncao.tabela}(...) — ${caminhos} caminhos`,
      )
    }
  }

  const unicas = [...new Set(ambiguas)]
  expect(
    unicas,
    'o PostgREST recusa com PGRST201; nomeie a relação: tabela!constraint(colunas)\n  ' +
      unicas.join('\n  '),
  ).toEqual([])
})
