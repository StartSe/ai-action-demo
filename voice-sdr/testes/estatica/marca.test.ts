// A marca do produto e o nome da assistente.
//
// Duas decisões do dono cercadas aqui:
//
// 1. O produto se chama `NOME_DO_PRODUTO` (`supabase/functions/_shared/marca.ts`),
//    num lugar só. O título da página em `app/index.html` é HTML estático, fora
//    do alcance do import, e por isso é conferido contra a constante.
// 2. A assistente não se chama Sarah na interface: quem configura escolhe o
//    nome, e antes disso o texto diz "a assistente". A varredura lê os
//    literais de texto de `app/src/copy/` e as frases de recusa que as bordas
//    devolvem à tela (`supabase/functions/*/respostas.ts`). Identificador de
//    código (`identidadeDaSarah`, `/sarah/voz`) não é texto e fica de fora,
//    porque a varredura só olha o que está entre aspas.
//
// Exceção se declara em `EXCECOES`, com a razão. Hoje não há nenhuma: o único
// "Sarah" que sobra no produto é o nome padrão da entrevista de configuração
// para a conta que ainda não escolheu o da assistente
// (`_shared/speech/entrevista.ts`), que é fala do servidor e não interface.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { NOME_DO_PRODUTO } from '../../supabase/functions/_shared/marca.ts'

const RAIZ = join(import.meta.dirname, '..', '..')
const COPY = join(RAIZ, 'app', 'src', 'copy')
const FUNCOES = join(RAIZ, 'supabase', 'functions')

/** Caminho relativo à raiz → por que o literal pode dizer "Sarah". */
const EXCECOES: Readonly<Record<string, string>> = {}

/** O texto sem comentários de linha e de bloco, preservando as strings. */
function semComentarios(fonte: string): string {
  return fonte.replace(
    /('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (_trecho, literal: string | undefined) => literal ?? '',
  )
}

/** Os literais de texto de um arquivo TypeScript: aspas simples, duplas e crase. */
function literaisDeTexto(fonte: string): string[] {
  const achados: string[] = []
  for (const casamento of semComentarios(fonte).matchAll(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g)) {
    achados.push(casamento[0])
  }
  return achados
}

function arquivosDaCopy(): string[] {
  return readdirSync(COPY)
    .filter((nome) => nome.endsWith('.ts'))
    .map((nome) => join(COPY, nome))
}

function respostasDasBordas(): string[] {
  return readdirSync(FUNCOES, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory() && !entrada.name.startsWith('_'))
    .map((entrada) => join(FUNCOES, entrada.name, 'respostas.ts'))
    .filter((caminho) => {
      try {
        readFileSync(caminho)
        return true
      } catch {
        return false
      }
    })
}

function citacoesDaSarah(arquivos: readonly string[]): string[] {
  return arquivos.flatMap((arquivo) => {
    const relativo = arquivo.slice(RAIZ.length + 1)
    if (relativo in EXCECOES) return []
    return literaisDeTexto(readFileSync(arquivo, 'utf8'))
      .filter((literal) => /\bSarah\b/.test(literal))
      .map((literal) => `${relativo}: ${literal}`)
  })
}

describe('a marca do produto', () => {
  test('o nome do produto não carrega mais o nome de uma assistente', () => {
    expect(NOME_DO_PRODUTO).toBe('Voice SDR')
  })

  test('o título da página é a constante da marca', () => {
    const html = readFileSync(join(RAIZ, 'app', 'index.html'), 'utf8')
    expect(html).toContain(`<title>${NOME_DO_PRODUTO}</title>`)
  })
})

describe('a assistente não se chama Sarah na interface', () => {
  test('a varredura enxerga a copy e as respostas das bordas', () => {
    expect(arquivosDaCopy().length).toBeGreaterThan(20)
    expect(respostasDasBordas().length).toBeGreaterThan(10)
  })

  test('o crivo lê literal e ignora comentário e identificador', () => {
    const fonte = [
      "// a Sarah no comentário não conta",
      '/* nem aqui, Sarah */',
      "export const identidadeDaSarah = { titulo: 'Oi, Sarah' }",
      'const falando = `${nome} falando`',
    ].join('\n')
    expect(literaisDeTexto(fonte).filter((literal) => /\bSarah\b/.test(literal))).toEqual(["'Oi, Sarah'"])
  })

  test('nenhum literal de app/src/copy cita a Sarah', () => {
    expect(citacoesDaSarah(arquivosDaCopy())).toEqual([])
  })

  test('nenhuma frase de recusa que a tela mostra cita a Sarah', () => {
    expect(citacoesDaSarah(respostasDasBordas())).toEqual([])
  })

  test('toda exceção declarada ainda existe', () => {
    for (const caminho of Object.keys(EXCECOES)) {
      expect(() => readFileSync(join(RAIZ, caminho))).not.toThrow()
    }
  })
})
