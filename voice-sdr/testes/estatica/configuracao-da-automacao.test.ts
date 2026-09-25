// Nenhum número da automação da F6 fica literal no código (US-190).
//
// A janela do lembrete, os tetos, os recuos e os limiares são colunas de
// `account_settings`, e a rotina e o módulo puro recebem o valor lido da conta.
// O único lugar onde esses números moram no TypeScript é o arquivo de padrões
// declarado (`_shared/automacao/padroes.ts`), que o teste de banco compara com
// o `default` das colunas. Esta varredura lê os módulos de
// `_shared/automacao/` e as rotinas da F6 sem comentários nem textos, e
// reprova nome de minuto, teto, limiar, recuo, janela ou tentativa recebendo
// número literal. Constante de unidade (`MINUTO_MS`) não é regra da conta e
// passa, pelo sufixo.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

const RAIZ = join(import.meta.dirname, '..', '..')
const AUTOMACAO = join(RAIZ, 'supabase', 'functions', '_shared', 'automacao')

/** O arquivo de padrões declarado, e as tabelas de casos, que são dado de teste. */
const DECLARADOS = new Set(['padroes.ts'])

const ROTINAS_DA_F6 = [
  join(RAIZ, 'supabase', 'functions', 'cron-meeting-reminder', 'rotina.ts'),
  join(RAIZ, 'supabase', 'functions', 'cron-meeting-rescue', 'rotina.ts'),
]

function arquivosVarridos(): string[] {
  const doModulo = readdirSync(AUTOMACAO)
    .filter((nome) => nome.endsWith('.ts') && !nome.endsWith('.test.ts'))
    .filter((nome) => !DECLARADOS.has(nome) && !nome.startsWith('casos-'))
    .map((nome) => join(AUTOMACAO, nome))
  return [...doModulo, ...ROTINAS_DA_F6]
}

/** O código sem comentários e sem o conteúdo dos textos. */
function semComentariosNemTextos(fonte: string): string {
  return fonte.replace(
    /('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (_trecho, literal: string | undefined) => (literal ? "''" : ''),
  )
}

const NOME_DE_REGRA = /\b([\w$]*(?:minuto|teto|limiar|recuo|janela|tentativa)[\w$]*)\s*[:=]\s*-?\d/gi

/** Os nomes de regra que recebem número literal, menos as constantes de unidade. */
function literaisDeRegra(fonte: string): string[] {
  const achados: string[] = []
  for (const encontro of semComentariosNemTextos(fonte).matchAll(NOME_DE_REGRA)) {
    const nome = encontro[1]!
    if (/_MS$/.test(nome)) continue
    achados.push(nome)
  }
  return achados
}

describe('a automação sem número literal de regra', () => {
  test('a varredura alcança os módulos e as duas rotinas', () => {
    const nomes = arquivosVarridos().map((caminho) => caminho.slice(RAIZ.length + 1))
    expect(nomes).toEqual(
      expect.arrayContaining([
        'supabase/functions/_shared/automacao/politica-de-retentativa.ts',
        'supabase/functions/_shared/automacao/lembrete-de-reuniao.ts',
        'supabase/functions/cron-meeting-reminder/rotina.ts',
        'supabase/functions/cron-meeting-rescue/rotina.ts',
      ]),
    )
  })

  test.each(arquivosVarridos().map((caminho) => [caminho.slice(RAIZ.length + 1), caminho]))(
    '%s não traz minuto, teto, recuo ou limiar literal',
    (_nome, caminho) => {
      expect(literaisDeRegra(readFileSync(caminho, 'utf8'))).toEqual([])
    },
  )

  test('a varredura tem dente, e deixa passar comentário, texto e unidade', () => {
    expect(literaisDeRegra('const tetoDeResgate = 3')).toEqual(['tetoDeResgate'])
    expect(literaisDeRegra('const politica = { recuoOcupadoEmMinutos: 15 }')).toEqual(['recuoOcupadoEmMinutos'])
    expect(literaisDeRegra('const inicioDaJanela = 5')).toEqual(['inicioDaJanela'])
    expect(literaisDeRegra('// tetoDeResgate = 3\nconst frase = "teto: 3"')).toEqual([])
    expect(literaisDeRegra('const MINUTO_MS = 60_000')).toEqual([])
  })
})
