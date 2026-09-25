// Arquivo de concorrência pulado no laço não pode ficar verde por engano.
//
// Os casos de `testes/concorrencia/` só rodam com `SUPABASE_DB_URL`, no degrau 3.
// No `check` eles aparecem como pulados, e pulado passa por aprovado a quem lê
// o total. O que impede isso de virar esquecimento é esta conferência: o
// arquivo se declara dívida de degrau 3, está na tabela de dívidas de
// docs/PRD-implementacao.md seção 9.1, tem par de scripts e é alcançado por
// `check:full`. Sem ela, tirar o `test:agenda:postgres` do `check:full` deixaria
// a prova de "duas ligações não marcam o mesmo horário" sem rodar em lugar
// nenhum, com a esteira toda verde.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import { comandosAlcancados, lerPacotes } from '../auxiliares/scripts-do-pacote.ts'

interface Divida {
  /** Caminho a partir da raiz. */
  arquivo: string
  /** O script que roda só o arquivo; o par `:postgres` põe a variável na frente. */
  script: string
}

const DIVIDAS: Divida[] = [
  { arquivo: 'testes/concorrencia/agenda-simultanea.test.ts', script: 'test:agenda' },
]

const raizDoRepositorio = (caminho: string) =>
  fileURLToPath(new URL(`../../${caminho}`, import.meta.url))

const pacotes = await lerPacotes()
const scripts = pacotes.raiz.scripts ?? {}
const documento = await readFile(raizDoRepositorio('docs/PRD-implementacao.md'), 'utf8')

test.each(DIVIDAS)('$arquivo se declara dívida de degrau 3 e só roda com a variável', async ({ arquivo }) => {
  const fonte = await readFile(raizDoRepositorio(arquivo), 'utf8')

  expect(fonte).toMatch(/DÍVIDA DE DEGRAU 3/)

  // Todo caso sob o mesmo `runIf`: um `test(` solto rodaria no PGlite e
  // passaria ou cairia sem concorrência nenhuma.
  const casos = fonte.match(/^test[.(]/gm) ?? []
  const condicionados = fonte.match(/^test\.runIf\(!EFEMERO\)\(/gm) ?? []
  expect(casos.length).toBeGreaterThan(0)
  expect(condicionados.length).toBe(casos.length)
  expect(fonte).toMatch(/const EFEMERO = process\.env\[VARIAVEL_DE_CONEXAO\] === undefined/)

  // O pulo diz por quê, e o cenário não se monta no laço.
  expect(fonte).toMatch(/if \(EFEMERO\) \{\s*for \(.*\) \{\s*console\.info\(/)
  expect(fonte).toMatch(/beforeAll\(async \(\) => \{\s*if \(EFEMERO\) return/)

  // O cliente `pg` só entra pelo import dinâmico de banco-para-rls.ts.
  expect(fonte).not.toMatch(/from '(?:pg|[^']*postgres-real\.ts)'/)
  expect(fonte).toMatch(/abrirBancoParaRls/)
})

test.each(DIVIDAS)('$arquivo está na tabela de dívidas do degrau 3', ({ arquivo }) => {
  const secao = documento.slice(documento.indexOf('**Dívidas do degrau 3.**'))
  expect(secao.length, 'a tabela de dívidas saiu de docs/PRD-implementacao.md').toBeLessThan(documento.length)

  const linha = secao.split('\n').find((texto) => texto.startsWith('|') && texto.includes(`\`${arquivo}\``))
  expect(linha, `${arquivo} sem linha na tabela de dívidas`).toBeDefined()
})

test.each(DIVIDAS)('$arquivo é alcançado por check:full e não pelo check', ({ arquivo, script }) => {
  expect(scripts[script]).toBe(`vitest run ${arquivo}`)
  expect(scripts[`${script}:postgres`]).toMatch(new RegExp(`^SUPABASE_DB_URL=\\S+ npm run ${script}$`))

  // A expansão perde o prefixo da variável, então o par se cobra no texto.
  expect(scripts['check:full']).toMatch(new RegExp(`npm run ${script}:postgres(?: |$)`))
  expect(comandosAlcancados('check:full', pacotes).join(' | ')).toContain(arquivo)

  // No laço ele entra só pelo `vitest run` geral de test:db, onde é pulado.
  expect(comandosAlcancados('check', pacotes).join(' | ')).not.toContain(`${script}:postgres`)
})
