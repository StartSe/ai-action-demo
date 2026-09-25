import { describe, expect, it } from 'vitest'

import {
  compararTextos,
  estadoDoIndicador,
  rascunhoPublicavel,
  textoInicial,
  versaoEmEdicao,
} from '@/sarah/playbooks'
import type { PlaybookDoProposito, VersaoDoPlaybook } from '@/sarah/tipos'

function versao(parcial: Partial<VersaoDoPlaybook> & Pick<VersaoDoPlaybook, 'versao' | 'estado'>): VersaoDoPlaybook {
  return {
    id: `v-${parcial.versao}`,
    roteiro: '',
    jeitoDaCasa: '',
    nota: null,
    publicadaEm: null,
    criadaEm: '2026-09-01T12:00:00.000Z',
    ...parcial,
  }
}

function playbook(versoes: VersaoDoPlaybook[]): PlaybookDoProposito {
  return { proposito: 'discovery', versoes }
}

describe('estadoDoIndicador', () => {
  it('divergência do provedor vence o estado do hash', () => {
    expect(estadoDoIndicador('publicado', ['discovery'])).toBe('alterado_fora_da_plataforma')
  })

  it('sem divergência, o estado é o da US-060', () => {
    for (const estado of ['rascunho', 'publicado', 'alteracoes_pendentes'] as const) {
      expect(estadoDoIndicador(estado, [])).toBe(estado)
    }
  })
})

describe('rascunho e versão no ar', () => {
  const noAr = versao({ versao: 1, estado: 'published', roteiro: 'Pergunte a dor.' })

  it('o rascunho é a versão mais nova quando ainda é draft', () => {
    const rascunho = versao({ versao: 2, estado: 'draft', roteiro: 'Pergunte a dor.\nConfirme.' })
    expect(versaoEmEdicao(playbook([rascunho, noAr]))).toBe(rascunho)
    expect(versaoEmEdicao(playbook([noAr]))).toBeNull()
  })

  it('o editor abre do rascunho, senão da versão no ar', () => {
    expect(textoInicial(playbook([noAr])).roteiro).toBe('Pergunte a dor.')
    expect(textoInicial(playbook([])).roteiro).toBe('')
  })

  it('rascunho vazio ou igual ao publicado não é publicável', () => {
    const vazio = versao({ versao: 2, estado: 'draft', roteiro: '  ' })
    const igual = versao({ versao: 2, estado: 'draft', roteiro: 'Pergunte a dor.' })
    const novo = versao({ versao: 2, estado: 'draft', roteiro: 'Outra coisa.' })
    expect(rascunhoPublicavel(playbook([vazio, noAr]))).toBeNull()
    expect(rascunhoPublicavel(playbook([igual, noAr]))).toBeNull()
    expect(rascunhoPublicavel(playbook([novo, noAr]))).toBe(novo)
    expect(rascunhoPublicavel(playbook([noAr]))).toBeNull()
  })
})

describe('compararTextos', () => {
  it('marca a linha trocada como removida e acrescentada, e mantém as iguais', () => {
    expect(compararTextos('a\nb\nc', 'a\nx\nc')).toEqual([
      { tipo: 'igual', texto: 'a' },
      { tipo: 'removida', texto: 'b' },
      { tipo: 'acrescentada', texto: 'x' },
      { tipo: 'igual', texto: 'c' },
    ])
  })

  it('texto vazio de um lado é tudo acrescentado ou tudo removido', () => {
    expect(compararTextos('', 'a\nb').map((linha) => linha.tipo)).toEqual([
      'acrescentada',
      'acrescentada',
    ])
    expect(compararTextos('a', '').map((linha) => linha.tipo)).toEqual(['removida'])
  })

  it('textos iguais não têm diferença', () => {
    expect(compararTextos('a\nb', 'a\nb').every((linha) => linha.tipo === 'igual')).toBe(true)
  })
})
