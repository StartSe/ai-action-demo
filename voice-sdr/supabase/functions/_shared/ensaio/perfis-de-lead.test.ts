// O catálogo de perfis do ensaio (US-112).
//
// A cobertura da copy da tela mora em `app/src/sarah/perfis-do-ensaio.test.ts`,
// porque a copy é do workspace `app`. Aqui fica o que o catálogo promete sozinho.

import { expect, test } from 'vitest'

import { PERFIL_PADRAO, PERFIS_DE_LEAD, lerIdDoPerfil, perfilPeloId } from './perfis-de-lead.ts'

test('os ids são únicos', () => {
  const ids = PERFIS_DE_LEAD.map((perfil) => perfil.id)
  expect(new Set(ids).size).toBe(ids.length)
})

test('todo perfil tem rótulo, descrição e contexto', () => {
  for (const perfil of PERFIS_DE_LEAD) {
    expect(perfil.id).toMatch(/^[a-z_]+$/)
    expect(perfil.rotulo.trim(), perfil.id).not.toBe('')
    expect(perfil.descricao.trim(), perfil.id).not.toBe('')
    expect(perfil.contexto.trim(), perfil.id).not.toBe('')
  }
})

test('os cinco perfis da F3 estão no catálogo', () => {
  // Os três últimos são critérios de aceite da fatia: sem eles o ensaio não
  // exercita a transferência, o bloqueio nem o encerramento de pessoa errada.
  expect(PERFIS_DE_LEAD.map((perfil) => perfil.id)).toEqual(
    expect.arrayContaining(['interessado', 'apressado', 'pede_pessoa', 'pede_bloqueio', 'pessoa_errada']),
  )
})

test('o contexto não denuncia o comportamento do perfil', () => {
  // Numa ligação de verdade ninguém avisa a Sarah que o lead vai pedir
  // bloqueio. Contexto que contasse o desfecho faria o ensaio aprovar fácil.
  for (const perfil of PERFIS_DE_LEAD) {
    expect(perfil.contexto, perfil.id).not.toMatch(/bloque|não quer|pessoa errada|atendente|pressa/i)
  }
})

test('o perfil se acha pelo id, e id fora do catálogo é nulo', () => {
  expect(perfilPeloId('pede_bloqueio')?.rotulo).toBe('Lead que pede para não ser chamado')
  expect(perfilPeloId('inventado')).toBeNull()
  expect(perfilPeloId(42)).toBeNull()
  expect(lerIdDoPerfil('pessoa_errada')).toBe('pessoa_errada')
  expect(lerIdDoPerfil(undefined)).toBeNull()
})

test('o perfil padrão está no catálogo', () => {
  expect(perfilPeloId(PERFIL_PADRAO)).not.toBeNull()
})
