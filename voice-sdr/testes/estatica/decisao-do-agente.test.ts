// T-01 é BLOQUEADOR e O-05 diz que ele precisa estar decidido antes da F2.
// A decisão está escrita em `docs/decisao-do-agente.md`: quatro agentes
// publicados no provedor, um por propósito. Este teste guarda as três coisas
// que a fazem valer alguma coisa depois que a atenção sair daqui:
//
//   1. o documento existe e continua nomeando os quatro propósitos;
//   2. nenhuma migração devolve `provider_agent_id` a `agents` — é a
//      consequência da decisão, e desfazê-la em silêncio é o acidente provável;
//   3. a sonda que verifica a suposição existe e é alcançada por `check:full`.
//
// Sem o item 2, a decisão é prosa. Sem o item 3, a suposição nunca vira fato.

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import { lerMigracoes } from '../../scripts/migracoes.ts'
import { comandosAlcancados, lerPacotes } from '../auxiliares/scripts-do-pacote.ts'

const RAIZ = new URL('../../', import.meta.url)

const CAMINHO_DO_DOCUMENTO = 'docs/decisao-do-agente.md'
const CAMINHO_DA_SONDA = 'scripts/sonda-de-publicacao.ts'

/** Os quatro propósitos da F2, em inglês como os `stage_key` da F1. */
const PROPOSITOS = ['discovery', 'reminder', 'rescue', 'followup'] as const

/** Estados que a decisão pode declarar enquanto a sonda não roda. */
const ESTADOS_CONHECIDOS = ['assumida-nao-verificada', 'confirmada', 'derrubada']

const documento = await readFile(
  fileURLToPath(new URL(CAMINHO_DO_DOCUMENTO, RAIZ)),
  'utf8',
)
const sonda = await readFile(fileURLToPath(new URL(CAMINHO_DA_SONDA, RAIZ)), 'utf8')
const pacotes = await lerPacotes()
const migracoes = await lerMigracoes()

describe('a decisão escrita', () => {
  test('nomeia os quatro propósitos', () => {
    for (const proposito of PROPOSITOS) {
      expect(
        new RegExp(`\\b${proposito}\\b`).test(documento),
        `${CAMINHO_DO_DOCUMENTO} não nomeia o propósito "${proposito}". Os quatro são a decisão inteira: um propósito de fora é um conjunto de ferramentas sem dono.`,
      ).toBe(true)
    }
  })

  test('cita T-01 e O-05 pelo código, que é como a revisão é buscada', () => {
    for (const codigo of ['T-01', 'O-05']) {
      expect(documento, `${CAMINHO_DO_DOCUMENTO} não cita ${codigo}.`).toContain(codigo)
    }
  })

  test('declara a decisão como suposição assumida, e não como fato verificado', () => {
    const estado = /\*\*Estado:\*\*\s*`?([\w-]+)`?/.exec(documento)?.[1]

    expect(
      estado,
      `${CAMINHO_DO_DOCUMENTO} precisa de um campo "**Estado:**" no topo, para que a suposição não se confunda com fato.`,
    ).toBeDefined()
    expect(ESTADOS_CONHECIDOS, `Estado desconhecido: "${estado}".`).toContain(estado)
    expect(documento).toMatch(/SUPOSIÇÃO ASSUMIDA/)
    expect(documento).toMatch(/não verificada/i)
  })

  test('registra as três consequências sobre o esquema', () => {
    const secao = /## Consequências sobre o esquema([\s\S]*?)(?=\n## )/.exec(documento)?.[1]
    expect(secao, `${CAMINHO_DO_DOCUMENTO} está sem a seção de consequências.`).toBeDefined()

    for (const rotulo of ['agents', 'agent_publications', 'call-place']) {
      expect(
        secao!.includes(`**${rotulo}:**`),
        `A seção de consequências não fala de "${rotulo}". As três juntas são o que a decisão muda no esquema.`,
      ).toBe(true)
    }

    expect(secao!).toMatch(/published_hash/)
  })

  test('registra o que derruba a suposição', () => {
    const secao = /## O que derruba a suposição([\s\S]*?)(?=\n## )/.exec(documento)?.[1]
    expect(secao, `${CAMINHO_DO_DOCUMENTO} está sem a seção "O que derruba a suposição".`).toBeDefined()

    expect(secao!).toMatch(/MENOR/)
    expect(secao!).toMatch(/uma linha por conta/)
  })
})

describe('agents sem provider_agent_id', () => {
  /** Comentário não é DDL: o documento pode citar a coluna, a migração não. */
  function semComentarios(sql: string): string {
    return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
  }

  /** O corpo entre parênteses de cada `create table agents (...)`. */
  function corposDeCreateTable(sql: string, tabela: string): string[] {
    const abertura = new RegExp(
      `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${tabela}\\s*\\(`,
      'gi',
    )
    const corpos: string[] = []

    for (const casada of sql.matchAll(abertura)) {
      let profundidade = 1
      let i = casada.index + casada[0].length
      const comeco = i
      while (i < sql.length && profundidade > 0) {
        const caractere = sql[i]
        if (caractere === '(') profundidade += 1
        else if (caractere === ')') profundidade -= 1
        i += 1
      }
      corpos.push(sql.slice(comeco, i - 1))
    }
    return corpos
  }

  /** Cada `alter table agents ...;` inteiro. */
  function comandosDeAlterTable(sql: string, tabela: string): string[] {
    const padrao = new RegExp(
      `alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(?:public\\.)?${tabela}\\b[^;]*;`,
      'gi',
    )
    return [...sql.matchAll(padrao)].map((casada) => casada[0])
  }

  test('nenhuma migração cria a coluna em agents', () => {
    for (const migracao of migracoes) {
      const sql = semComentarios(migracao.sql)
      const trechos = [
        ...corposDeCreateTable(sql, 'agents'),
        ...comandosDeAlterTable(sql, 'agents'),
      ]

      for (const trecho of trechos) {
        expect(
          /\bprovider_agent_id\b/i.test(trecho),
          `${migracao.nome} dá provider_agent_id a agents. A decisão de T-01 (${CAMINHO_DO_DOCUMENTO}) põe essa coluna em agent_publications, uma linha por propósito; em agents ela devolve a restrição de ferramentas ao roteiro.`,
        ).toBe(false)
      }
    }
  })

  test('a varredura enxerga as migrações do repositório', () => {
    // Sem esta conferência, um erro de caminho faria o teste acima passar por
    // não ter lido nada.
    expect(migracoes.length).toBeGreaterThan(0)
  })
})

describe('a sonda que verifica a suposição', () => {
  test('existe e é nomeada pelo documento', () => {
    expect(
      existsSync(fileURLToPath(new URL(CAMINHO_DA_SONDA, RAIZ))),
      `${CAMINHO_DA_SONDA} não existe. Sem ela, a suposição de T-01 nunca vira fato.`,
    ).toBe(true)
    expect(documento).toContain(CAMINHO_DA_SONDA)
  })

  test('é alcançada por check:full, e não por check', () => {
    const completo = comandosAlcancados('check:full', pacotes).join(' | ')
    expect(
      completo,
      'A sonda precisa ser passo próprio do degrau 3; fora dele ninguém a roda.',
    ).toMatch(/sonda-de-publicacao/)

    const laco = comandosAlcancados('check', pacotes).join(' | ')
    expect(
      laco,
      'A sonda pede credencial, rede e número real: dentro de npm run check ela trava o laço.',
    ).not.toMatch(/sonda-de-publicacao/)
  })

  test('sai com zero quando falta a credencial, e diz por quê', () => {
    expect(sonda).toMatch(/SARAH_ELEVENLABS_API_KEY/)
    expect(sonda).toMatch(/process\.exit\(0\)/)
    expect(
      sonda.slice(0, sonda.indexOf('import ')),
      'A razão de a sonda não rodar no laço vai no topo do arquivo, senão alguém a põe no check por não saber.',
    ).toMatch(/NÃO RODA NO LAÇO/)
  })

  test('mede as três premissas frágeis que vencem na F2', () => {
    for (const premissa of ['P-01', 'P-02', 'P-11']) {
      expect(sonda, `A sonda não diz o que mede de ${premissa}.`).toContain(premissa)
    }

    expect(sonda, 'P-01 pede response_timeout_secs explícito em 5 s.').toMatch(
      /response_timeout_secs/,
    )
    expect(sonda).toMatch(/TEMPO_LIMITE_DE_FERRAMENTA_S = 5\b/)
    expect(sonda, 'P-01 pede p95 e p99 em 20 chamadas.').toMatch(/CHAMADAS_PADRAO = 20\b/)
    expect(sonda).toMatch(/percentil\(duracoes, 0\.95\)/)
    expect(sonda).toMatch(/percentil\(duracoes, 0\.99\)/)
    expect(sonda, 'P-11 é o cabeçalho x-conversation-id.').toMatch(/x-conversation-id/)
  })
})
