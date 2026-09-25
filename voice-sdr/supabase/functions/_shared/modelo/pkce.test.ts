// Provas do PKCE (US-246). Ambiente node, sem rede: o que se mede é a forma do
// que o módulo produz e o casamento entre verifier e desafio.
//
// O que este arquivo segura:
//
// 1. O verifier tem o tamanho mínimo que a especificação exige, e o check da
//    coluna `code_verifier` o repete no banco.
// 2. `base64url` não deixa passar `+`, `/` nem `=`, que quebrariam a URL.
// 3. O desafio é o SHA-256 do verifier, conferido contra um vetor fixo — e não
//    contra a própria função, que passaria mesmo se ela mudasse de algoritmo.
// 4. Dois pares seguidos não se repetem.

import { describe, expect, test } from 'vitest'

import {
  base64url,
  BYTES_DO_VERIFIER,
  criarEstado,
  criarPar,
  criarVerifier,
  desafioDoVerifier,
  METODO_DO_DESAFIO,
} from './pkce.ts'

describe('o verifier', () => {
  test('tem ao menos os 43 caracteres que a especificação exige', () => {
    const verifier = criarVerifier()
    // 32 bytes viram 43 caracteres em base64url sem preenchimento, que é o
    // mínimo do PKCE e o mínimo do check de `model_auth_states`.
    expect(BYTES_DO_VERIFIER).toBe(32)
    expect(verifier.length).toBeGreaterThanOrEqual(43)
  })

  test('não carrega caractere que a URL trataria de outro jeito', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(criarVerifier()).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(criarEstado()).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  test('não se repete', () => {
    const vistos = new Set<string>()
    for (let i = 0; i < 100; i += 1) vistos.add(criarVerifier())
    expect(vistos.size).toBe(100)
  })
})

describe('base64url', () => {
  test('troca os três caracteres e tira o preenchimento', () => {
    // 0xFB 0xFF 0xFE em base64 comum é "+//+"; em base64url é "-__-".
    expect(base64url(new Uint8Array([0xfb, 0xff, 0xfe]))).toBe('-__-')
    // Um byte só gera preenchimento em base64 comum ("AQ=="), que sai aqui.
    expect(base64url(new Uint8Array([0x01]))).toBe('AQ')
  })
})

describe('o desafio', () => {
  test('é o SHA-256 do verifier, em base64url', async () => {
    // O vetor do RFC 7636, apêndice B: este verifier tem este desafio. Conferir
    // contra a própria função deixaria a prova passar mesmo se o módulo
    // trocasse de algoritmo.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const esperado = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    expect(await desafioDoVerifier(verifier)).toBe(esperado)
  })

  test('o par sai pronto para a ida, com S256', async () => {
    const par = await criarPar()
    expect(METODO_DO_DESAFIO).toBe('S256')
    expect(par.desafio).toBe(await desafioDoVerifier(par.verifier))
    expect(par.estado).not.toBe(par.verifier)
  })
})
