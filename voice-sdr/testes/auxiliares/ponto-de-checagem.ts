// O molde dos pontos de checagem por fase. Cada fase tem um arquivo próprio em
// `testes/estatica/` que declara a tabela de provas; o que é igual entre elas —
// ler os critérios de `docs/PRD.md`, casar critério com prova nos dois sentidos,
// conferir que a prova existe e cai numa suíte de `npm run check` — mora aqui.
//
// Duas cópias da mesma leitura divergiriam na primeira correção, e aí uma fase
// passaria a medir uma coisa diferente da outra.

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

const RAIZ = new URL('../../', import.meta.url)

export interface Prova {
  /** Trecho que identifica a linha do critério em docs/PRD.md. */
  criterio: string
  /** Arquivos de teste que fecham o critério dentro de `npm run check`. */
  arquivos: string[]
  /**
   * O que este critério ainda deve ao degrau 3, e por quê. `null` quando o que
   * roda em processo já é a prova inteira.
   */
  faltaNoCi: string | null
}

/** Cada suíte de `npm run check` e o que ela alcança. */
const SUITES: readonly { prefixo: string; sufixos: string[]; script: string }[] = [
  { prefixo: 'app/src/', sufixos: ['.test.ts', '.test.tsx'], script: 'test:unit' },
  { prefixo: 'supabase/functions/', sufixos: ['.test.ts'], script: 'test:funcoes' },
  { prefixo: 'testes/', sufixos: ['.test.ts'], script: 'test:db' },
]

/** A suíte de `npm run check` que roda este arquivo, ou `undefined` se nenhuma. */
export function suiteQueAlcanca(arquivo: string) {
  return SUITES.find(
    (suite) =>
      arquivo.startsWith(suite.prefixo) &&
      suite.sufixos.some((sufixo) => arquivo.endsWith(sufixo)),
  )
}

/** O caminho existe no repositório? */
export function existeNoRepositorio(caminho: string): boolean {
  return existsSync(fileURLToPath(new URL(caminho, RAIZ)))
}

/** Os critérios de aceite de uma fase, na ordem em que o PRD de produto os lista. */
export async function lerCriteriosDaFase(fase: string): Promise<string[]> {
  const prd = await readFile(fileURLToPath(new URL('docs/PRD.md', RAIZ)), 'utf8')

  const bloco = prd.split(new RegExp(`^### ${fase}\\. `, 'm'))[1]
  if (!bloco) throw new Error(`docs/PRD.md não tem mais a seção "### ${fase}."`)

  const criterios = bloco.split(/^\*\*Critérios de aceite\*\*$/m)[1]
  if (!criterios) {
    throw new Error(`A ${fase} não tem mais bloco "**Critérios de aceite**"`)
  }

  return [...criterios.split(/^---$/m)[0]!.matchAll(/^- \[[ x]\] (.+)$/gm)].map(
    (casada) => casada[1]!,
  )
}

/**
 * Declara o bloco de testes comum a todo ponto de checagem: o PRD ainda lista
 * critérios para a fase, cada critério tem uma prova e só uma, nenhuma prova
 * sobrou de um critério que saiu, cada arquivo declarado existe e cai numa
 * suíte de `npm run check`, e o que ficou para o degrau 3 vem com razão escrita.
 */
export function verificarPontoDeChecagem(ponto: {
  /** `F0`, `F1`… como o PRD de produto escreve no cabeçalho da seção. */
  fase: string
  /** O arquivo que declara as provas, citado nas mensagens de falha. */
  arquivo: string
  criterios: readonly string[]
  provas: readonly Prova[]
}): void {
  const { fase, arquivo, criterios, provas } = ponto

  describe(`critérios de aceite da ${fase}`, () => {
    test(`o PRD de produto ainda lista critérios para a ${fase}`, () => {
      expect(criterios.length).toBeGreaterThan(0)
    })

    test('cada critério do PRD tem uma prova declarada, e só uma', () => {
      for (const criterio of criterios) {
        const casadas = provas.filter((prova) => criterio.includes(prova.criterio))

        expect(
          casadas.length,
          `Critério da ${fase} sem prova declarada (ou com mais de uma) em ${arquivo}: "${criterio}"`,
        ).toBe(1)
      }
    })

    test('nenhuma prova declarada sobrou de um critério que saiu do PRD', () => {
      for (const prova of provas) {
        const casados = criterios.filter((criterio) =>
          criterio.includes(prova.criterio),
        )

        expect(
          casados.length,
          `Prova declarada para critério que o PRD não lista mais: "${prova.criterio}"`,
        ).toBe(1)
      }
    })

    test.each(provas.flatMap((prova) => prova.arquivos))(
      '%s existe e é alcançado por npm run check',
      (caminho) => {
        expect(
          existeNoRepositorio(caminho),
          `Prova declarada que não existe no disco: ${caminho}`,
        ).toBe(true)
        expect(
          suiteQueAlcanca(caminho)?.script,
          `Prova fora das suítes de npm run check: ${caminho}`,
        ).toBeDefined()
      },
    )

    test('o que ficou para o degrau 3 vem com a razão escrita', () => {
      for (const prova of provas) {
        if (prova.faltaNoCi === null) continue

        expect(
          prova.faltaNoCi.length,
          `Razão vazia em "${prova.criterio}": ou a prova em processo fecha o critério (faltaNoCi: null), ou o que falta se escreve.`,
        ).toBeGreaterThan(40)
      }
    })
  })
}
