// Toda chave do catálogo de provedores tem instrução de preenchimento.
//
// Os campos da configuração inicial e de /config/integracoes nascem de
// `integracao.chaves`, que o servidor tira de `integrations-status/provedores.ts`.
// Chave nova no catálogo ganha campo sozinha; a instrução de onde achar o valor
// mora em `app/src/copy/instrucoes-das-chaves.ts`, e este teste reprova o campo
// que chegar sem ela. Mora aqui, e não no app, porque é o lado de Node que
// alcança os dois arquivos.

import { describe, expect, test } from 'vitest'

import {
  instrucaoDaChave,
  instrucoesDasChaves,
  PERMISSOES_DA_ELEVENLABS,
} from '../../app/src/copy/instrucoes-das-chaves.ts'
import { PROVEDORES } from '../../supabase/functions/integrations-status/provedores.ts'

describe('instrução por chave do catálogo', () => {
  for (const provedor of PROVEDORES) {
    for (const chave of provedor.chaves) {
      test(`${provedor.id}.${chave} diz onde achar e o formato`, () => {
        const instrucao = instrucaoDaChave(provedor.id, chave)
        expect(instrucao, `${provedor.id}.${chave} sem instrução`).not.toBeNull()
        expect(instrucao?.onde.trim().length).toBeGreaterThan(20)
        expect(instrucao?.formato.trim().length).toBeGreaterThan(10)
      })
    }
  }

  test('o mapa não guarda instrução de chave que o catálogo não tem', () => {
    const doCatalogo = new Set(
      PROVEDORES.flatMap((provedor) => provedor.chaves.map((chave) => `${provedor.id}.${chave}`)),
    )
    const doMapa = Object.entries(instrucoesDasChaves).flatMap(([provedor, chaves]) =>
      Object.keys(chaves).map((chave) => `${provedor}.${chave}`),
    )
    for (const chave of doMapa) expect(doCatalogo, chave).toContain(chave)
  })
})

test('os formatos da Twilio são os que a conta confere', () => {
  expect(instrucaoDaChave('telefonia', 'account_sid')?.formato).toMatch(/AC.*34 caracteres/)
  expect(instrucaoDaChave('telefonia', 'auth_token')?.onde).toMatch(/Account Info/)
})

test('a chave da ElevenLabs lista as permissões que as funções usam', () => {
  const lista = PERMISSOES_DA_ELEVENLABS.join('\n')
  for (const permissao of ['Agents', 'Voices', 'Text to Speech', 'User', 'webhooks']) {
    expect(lista).toContain(permissao)
  }
})

test('o texto segue o registro de interface: sem travessão e sem aspas curvas', () => {
  const textos = [
    ...Object.values(instrucoesDasChaves).flatMap((chaves) =>
      Object.values(chaves).flatMap((instrucao) => [instrucao.onde, instrucao.formato]),
    ),
    ...PERMISSOES_DA_ELEVENLABS,
  ]
  for (const texto of textos) expect(texto).not.toMatch(/[—–“”‘’]/)
})
