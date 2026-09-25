// As falas das regras travadas não entram na interface por import (US-103).
//
// `supabase/functions/_shared/speech/regras-travadas.ts` é o que a Sarah diz
// quando pedem bloqueio, quando pedem humano e quando é pessoa errada. Quem o
// emite é a publicação no provedor, e a tela de playbooks mostra essas falas
// pelo texto compilado da camada 1, que é o que foi ao ar. Uma tela que
// importasse a constante direto teria uma segunda leitura dela, e a primeira
// edição que só uma das duas enxergasse faria a tela mostrar uma fala que a
// Sarah não diz. A varredura é por texto do import, sobre `app/src` inteiro.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

const RAIZ_DA_INTERFACE = join(import.meta.dirname, '..', '..', 'app', 'src')

/**
 * Import (com nome, só de efeito ou dinâmico) ou reexportação que alcance o
 * módulo, por alias ou por caminho relativo.
 */
const IMPORTA_AS_FALAS = /(?:from|import)\s*\(?\s*['"][^'"]*speech\/regras-travadas(?:\.ts)?['"]/

function arquivosDaInterface(): string[] {
  return readdirSync(RAIZ_DA_INTERFACE, { recursive: true, encoding: 'utf8' })
    .filter((caminho) => /\.(ts|tsx)$/.test(caminho))
    .map((caminho) => join(RAIZ_DA_INTERFACE, caminho))
}

describe('falas das regras travadas fora da interface', () => {
  test('a varredura enxerga a interface', () => {
    expect(arquivosDaInterface().length).toBeGreaterThan(50)
  })

  test('o crivo pega as formas de import que existem', () => {
    expect(IMPORTA_AS_FALAS.test("import { X } from '@compartilhado/speech/regras-travadas.ts'")).toBe(true)
    expect(IMPORTA_AS_FALAS.test("export { X } from '../../supabase/functions/_shared/speech/regras-travadas'")).toBe(true)
    expect(IMPORTA_AS_FALAS.test("const m = await import('@compartilhado/speech/regras-travadas.ts')")).toBe(true)
    expect(IMPORTA_AS_FALAS.test("import '@compartilhado/speech/regras-travadas.ts'")).toBe(true)
    expect(IMPORTA_AS_FALAS.test("import { X } from '@compartilhado/speech/todos-os-propositos.ts'")).toBe(false)
  })

  test('nenhum arquivo de app/src importa speech/regras-travadas', () => {
    const quemImporta = arquivosDaInterface().filter((arquivo) =>
      IMPORTA_AS_FALAS.test(readFileSync(arquivo, 'utf8')),
    )
    expect(quemImporta).toEqual([])
  })
})
