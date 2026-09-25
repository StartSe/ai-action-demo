// Provas das falas das regras travadas da F3. Ambiente node, sem rede e sem
// banco: o que se mede é o texto.
//
// O registro é o de fala (docs/padrao-de-interface.md seção 4), e a varredura
// cobra o que dá para cobrar sem ouvido: sem travessão, frase curta, pelo menos
// uma contração por grupo, nenhum identificador e nenhum prazo prometido.

import { describe, expect, test } from 'vitest'

import { FALAS_DAS_REGRAS_TRAVADAS } from './regras-travadas.ts'

const TODAS = Object.entries(FALAS_DAS_REGRAS_TRAVADAS).flatMap(([grupo, falas]) =>
  falas.map((fala) => [grupo, fala] as const),
)

/** Contração e marca de fala que um texto de interface não usaria. */
const CONTRACAO = /(?<![\p{L}\d])(pra|tô|te|tá|viu|aqui)(?![\p{L}\d])/iu

/** Prazo que nada no sistema cumpre. */
const PRAZO = /\d|minuto|hora|hoje|amanhã|já já|logo mais|em breve/i

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-/i

/** Palavras por frase. Fala longa se perde no telefone. */
const MAXIMO_DE_PALAVRAS_POR_FRASE = 12

describe('falas das regras travadas', () => {
  test('os três grupos existem e nenhum está vazio', () => {
    expect(Object.keys(FALAS_DAS_REGRAS_TRAVADAS).sort()).toEqual(
      ['naoPerturbe', 'pedidoDeHumano', 'pessoaErrada'].sort(),
    )
    for (const falas of Object.values(FALAS_DAS_REGRAS_TRAVADAS)) {
      expect(falas.length).toBeGreaterThan(0)
    }
  })

  test.each(TODAS)('%s: sem travessão, sem identificador e sem prazo: %s', (_grupo, fala) => {
    expect(fala).not.toMatch(/[—–]/)
    expect(fala).not.toMatch(UUID)
    expect(fala).not.toMatch(PRAZO)
    expect(fala).not.toMatch(/\{[^}]+\}/)
  })

  test.each(TODAS)('%s: frase curta: %s', (_grupo, fala) => {
    for (const frase of fala.split(/[.!?]+/).filter((pedaco) => pedaco.trim() !== '')) {
      expect(frase.trim().split(/\s+/).length).toBeLessThanOrEqual(MAXIMO_DE_PALAVRAS_POR_FRASE)
    }
  })

  test.each(Object.entries(FALAS_DAS_REGRAS_TRAVADAS))(
    '%s soa falado: pelo menos uma contração no grupo',
    (_grupo, falas) => {
      expect(falas.some((fala) => CONTRACAO.test(fala))).toBe(true)
    },
  )

  test('pessoa errada são duas falas no máximo (RF-422)', () => {
    expect(FALAS_DAS_REGRAS_TRAVADAS.pessoaErrada.length).toBeLessThanOrEqual(2)
  })

  test('não perturbe promete o bloqueio sem depender da ferramenta', () => {
    // A promessa sai mesmo com tool-dnc em falha (R-02): nenhuma fala pode
    // condicionar o bloqueio a uma confirmação que talvez não chegue.
    const texto = FALAS_DAS_REGRAS_TRAVADAS.naoPerturbe.join(' ')
    expect(texto).toMatch(/lista/i)
    expect(texto).toMatch(/não te ligo mais/i)
    expect(texto).not.toMatch(/se der certo|vou confirmar|assim que|tentar/i)
  })

  test('pedido de humano não afirma que alguém já vai atender', () => {
    // Quem sabe se há destino é tool-transfer. A ponte não pode prometer o que
    // só a resposta da ferramenta sabe.
    for (const fala of FALAS_DAS_REGRAS_TRAVADAS.pedidoDeHumano) {
      expect(fala).not.toMatch(/transferi|vou te passar|já vai te atender|vai te ligar/i)
    }
  })
})
