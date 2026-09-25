// As colunas que as funções pedem ao PostgREST existem no banco.
//
// Este teste existe por causa de um defeito real: `rehearsal-session` pedia
// `playbook_version_id` a `agent_publications`, e essa coluna nunca existiu —
// a publicação guarda o hash do que foi compilado, e quem sabe a versão no ar
// é `playbooks.current_version_id`. O PostgREST recusou, a porta levantou, e a
// tela mostrou "não foi possível continuar o ensaio agora", que é a frase de
// falha interna. Uma tarde de trabalho, uma função publicada, e o erro só
// apareceu quando um humano clicou.
//
// Por que nada pegou isso antes: o typecheck não conhece o esquema do banco
// (o cliente do Supabase tipa `select` como string solta); o teste de contrato
// exercita o módulo portável, que não tem consulta nenhuma; o teste de banco
// fala SQL direto, e SQL com coluna errada falha na hora — mas nenhum teste de
// banco passa pelos adaptadores. É a mesma família das junções embutidas
// ambíguas e do CORS incompleto: erro que só o ambiente real mostrava.
//
// O que se mede: cada `.from('tabela').select('a, b, c')` dos `index.ts`, com
// as colunas cruzadas contra o `create table` da migração daquela tabela, mais
// o que migrações posteriores acrescentaram por `alter table ... add column`.
//
// **O que este teste NÃO pega**, e continua sendo do degrau 3: consulta cuja
// tabela ou colunas sejam montadas em tempo de execução, junção embutida com
// caminho ambíguo (que é de `juncoes-embutidas`), e política de RLS que
// esconda a linha. Aqui só se mede que a coluna pedida existe.

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url))

/**
 * Tabelas que não são do nosso esquema e por isso não têm `create table` nas
 * migrações. Consulta a elas passa sem conferência, com a razão escrita.
 */
const FORA_DO_NOSSO_ESQUEMA: Record<string, string> = {
  'auth.users': 'do Supabase: o esquema é deles, e a migração só lê.',
}

/** Um `select` encontrado num adaptador. */
interface Consulta {
  readonly arquivo: string
  readonly tabela: string
  readonly colunas: readonly string[]
}

async function pastasDeFuncao(): Promise<string[]> {
  const entradas = await readdir(new URL('supabase/functions/', new URL(RAIZ, 'file:')), {
    withFileTypes: true,
  })
  return entradas
    .filter((entrada) => entrada.isDirectory() && entrada.name !== '_shared')
    .map((entrada) => entrada.name)
}

/**
 * As colunas de cada tabela, lidas das migrações.
 *
 * O `create table` dá o conjunto inicial; `alter table ... add column`
 * acrescenta. Coluna removida por `drop column` sai — sem isso, uma coluna
 * apagada continuaria "existindo" para este teste justamente depois de deixar
 * de existir no banco.
 */
async function colunasPorTabela(): Promise<Map<string, Set<string>>> {
  const pasta = new URL('supabase/migrations/', new URL(RAIZ, 'file:'))
  const arquivos = (await readdir(pasta)).filter((nome) => nome.endsWith('.sql')).sort()

  const tabelas = new Map<string, Set<string>>()

  for (const nome of arquivos) {
    const sql = await readFile(new URL(nome, pasta), 'utf8')
    const semComentarios = sql.replace(/--[^\n]*/g, '')

    for (const criacao of semComentarios.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(([\s\S]*?)\n\);/gi,
    )) {
      const tabela = criacao[1]!
      const corpo = criacao[2]!
      const colunas = new Set<string>()
      for (const linha of corpo.split('\n')) {
        // Coluna é linha que começa com um identificador seguido de tipo.
        // Restrição de tabela começa com `constraint`, `check`, `unique`,
        // `primary` ou `foreign`, e fica de fora.
        const achado = /^\s{2}(\w+)\s+[a-z]/i.exec(linha)
        if (!achado) continue
        const candidata = achado[1]!.toLowerCase()
        if (['constraint', 'check', 'unique', 'primary', 'foreign', 'exclude'].includes(candidata)) {
          continue
        }
        colunas.add(candidata)
      }
      tabelas.set(tabela, colunas)
    }

    // Um `alter table` leva vários `add column` separados por vírgula, e foi
    // assim que metade das colunas da conta nasceram. Ler só o primeiro de
    // cada bloco — que era a primeira versão deste arquivo — dava vinte e seis
    // falsos positivos sobre colunas que existem e funcionam.
    for (const bloco of semComentarios.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?public\.(\w+)\b([\s\S]*?);/gi,
    )) {
      const tabela = tabelas.get(bloco[1]!)
      if (!tabela) continue
      const corpo = bloco[2]!

      for (const adicao of corpo.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi)) {
        tabela.add(adicao[1]!.toLowerCase())
      }
      for (const remocao of corpo.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?(\w+)/gi)) {
        tabela.delete(remocao[1]!.toLowerCase())
      }
    }
  }

  return tabelas
}

/**
 * Os `select` de cada adaptador.
 *
 * Só a forma literal `.from('x').select('a, b')` é lida: é a que todos os
 * adaptadores usam, e a única em que as colunas dá para conferir sem executar.
 * Consulta montada em tempo de execução fica de fora, e fica de propósito —
 * adivinhá-la produziria falso positivo.
 */
async function consultasDosAdaptadores(): Promise<Consulta[]> {
  const consultas: Consulta[] = []

  for (const funcao of await pastasDeFuncao()) {
    const caminho = `supabase/functions/${funcao}/index.ts`
    let fonte: string
    try {
      fonte = await readFile(new URL(caminho, new URL(RAIZ, 'file:')), 'utf8')
    } catch {
      continue
    }

    for (const achado of fonte.matchAll(
      /\.from\(\s*'(\w+)'\s*\)\s*\n?\s*\.select\(\s*'([^']*)'/g,
    )) {
      const colunas = achado[2]!
        .split(',')
        .map((coluna) => coluna.trim())
        // Junção embutida (`linha:tabela(a,b)`) e agregado ficam de fora: o
        // que este teste mede é coluna simples.
        .filter((coluna) => coluna !== '' && !coluna.includes('(') && !coluna.includes(':'))
        .map((coluna) => coluna.toLowerCase())

      consultas.push({ arquivo: caminho, tabela: achado[1]!, colunas })
    }
  }

  return consultas
}

describe('as colunas que os adaptadores pedem', () => {
  test('a varredura encontra as consultas, em vez de passar por vazio', async () => {
    const consultas = await consultasDosAdaptadores()
    // Sem esta guarda, um erro na expressão faria o teste seguinte passar
    // verde medindo lista nenhuma — que é a pior forma de teste verde.
    expect(consultas.length).toBeGreaterThan(20)
  })

  test('toda coluna pedida existe na tabela', async () => {
    const tabelas = await colunasPorTabela()
    const consultas = await consultasDosAdaptadores()

    const achados: string[] = []
    for (const consulta of consultas) {
      if (consulta.tabela in FORA_DO_NOSSO_ESQUEMA) continue

      const colunas = tabelas.get(consulta.tabela)
      if (!colunas) {
        achados.push(
          `${consulta.arquivo}: tabela '${consulta.tabela}' não tem create table em nenhuma migração`,
        )
        continue
      }

      for (const coluna of consulta.colunas) {
        if (coluna === '*') continue
        if (!colunas.has(coluna)) {
          achados.push(`${consulta.arquivo}: ${consulta.tabela} não tem a coluna '${coluna}'`)
        }
      }
    }

    expect(
      achados,
      'coluna pedida ao PostgREST que não existe no banco: a consulta falha em ' +
        'ambiente real e a borda responde falha interna',
    ).toEqual([])
  })
})
