import { describe, expect, it } from 'vitest'

import { podeDiscarPara, type ContaNoPortao } from '@/chamadas/portao'

const NUMERO_DE_TESTE = '+5511999990001'
const LEAD_REAL = '(11) 98888-7777'
const LIGACAO_DE_TESTE = '2026-09-23T17:03:00Z'

function conta(ajustes: Partial<ContaNoPortao> = {}): ContaNoPortao {
  return {
    realDialing: false,
    primeiraChamadaDeTesteEm: null,
    numerosDeTeste: [NUMERO_DE_TESTE],
    ...ajustes,
  }
}

describe('podeDiscarPara', () => {
  it('com o portão fechado, oferece o número de teste escrito de qualquer jeito', () => {
    expect(podeDiscarPara('(11) 99999-0001', conta())).toEqual({
      ok: true,
      telefone: NUMERO_DE_TESTE,
      porque: 'numero_de_teste',
    })
  })

  it.each([
    [
      'sem bandeira e sem ligação de teste',
      conta(),
      ['liberacao_da_fase', 'primeira_chamada_de_teste'],
    ],
    [
      'com bandeira e sem ligação de teste',
      conta({ realDialing: true }),
      ['primeira_chamada_de_teste'],
    ],
    [
      'sem bandeira e com ligação de teste',
      conta({ primeiraChamadaDeTesteEm: LIGACAO_DE_TESTE }),
      ['liberacao_da_fase'],
    ],
  ] as const)('%s: recusa lead real e diz o que falta', (_nome, estado, falta) => {
    expect(podeDiscarPara(LEAD_REAL, estado)).toEqual({ ok: false, motivo: 'portao_fechado', falta })
  })

  it('só com as duas condições o lead real passa', () => {
    expect(
      podeDiscarPara(
        LEAD_REAL,
        conta({ realDialing: true, primeiraChamadaDeTesteEm: LIGACAO_DE_TESTE }),
      ),
    ).toEqual({ ok: true, telefone: '+5511988887777', porque: 'portao_aberto' })
  })

  it('lista de teste vazia com o portão fechado não oferece nada', () => {
    expect(podeDiscarPara(NUMERO_DE_TESTE, conta({ numerosDeTeste: [] }))).toMatchObject({
      ok: false,
      motivo: 'portao_fechado',
    })
  })

  it('telefone que não normaliza é recusado antes do portão', () => {
    expect(podeDiscarPara('(11) 8888-7777', conta())).toEqual({
      ok: false,
      motivo: 'telefone_invalido',
    })
  })
})
