import { describe, expect, it } from 'vitest'

import {
  aplicarRecorte,
  lerLista,
  linhasLidas,
  preverImportacao,
  remocaoDoBloqueio,
  validarInclusao,
} from '@/bloqueios/lista'
import type { Bloqueio } from '@/bloqueios/tipos'

function bloqueio(extras: Partial<Bloqueio>): Bloqueio {
  return {
    id: 'b-1',
    e164: '+5548999998888',
    motivo: 'pediu para não ser chamado',
    origem: 'manual',
    observacao: null,
    incluidoPor: 'u-1',
    incluidoEm: '2026-09-20T13:00:00.000Z',
    removidoEm: null,
    removidoPor: null,
    motivoDaRemocao: null,
    ...extras,
  }
}

describe('validarInclusao', () => {
  it('normaliza o número digitado antes de gravar', () => {
    expect(
      validarInclusao({ numero: '(48) 99999-8888', motivo: '  pediu por e-mail ' }),
    ).toEqual({ ok: true, dados: { e164: '+5548999998888', motivo: 'pediu por e-mail' } })
  })

  it('recusa número que não se normaliza, com o código da razão', () => {
    expect(validarInclusao({ numero: '(48) 8888-777', motivo: 'x' })).toEqual({
      ok: false,
      recusas: { numero: 'comprimento_invalido' },
    })
  })

  it('recusa motivo em branco', () => {
    expect(validarInclusao({ numero: '48999998888', motivo: '   ' })).toEqual({
      ok: false,
      recusas: { motivo: true },
    })
  })
})

describe('lerLista', () => {
  it('lê a primeira célula, pula linha em branco e o cabeçalho sem dígito', () => {
    expect(lerLista('telefone;nome\n(48) 99999-8888;Ana\n\n11 98888-7777\n')).toEqual([
      { linha: 2, bruto: '(48) 99999-8888' },
      { linha: 4, bruto: '11 98888-7777' },
    ])
  })

  it('só a primeira linha pode ser cabeçalho', () => {
    expect(lerLista('48999998888\nligar depois')).toEqual([
      { linha: 1, bruto: '48999998888' },
      { linha: 2, bruto: 'ligar depois' },
    ])
  })
})

describe('preverImportacao', () => {
  const texto = [
    'telefone',
    '(48) 99999-8888',
    '48 99999-8888',
    '11 98888-7777',
    '1234',
    '+55 21 97777-6666',
  ].join('\n')

  const previa = preverImportacao(texto, ['+5511988887777'])

  it('separa válidos, inválidos e já bloqueados', () => {
    expect(previa.validos).toEqual(['+5548999998888', '+5521977776666'])
    expect(previa.jaBloqueados).toEqual(['+5511988887777'])
    expect(previa.invalidos).toEqual([
      { linha: 5, bruto: '1234', motivo: 'comprimento_invalido' },
    ])
  })

  it('conta a mesma pessoa escrita duas vezes uma vez só', () => {
    expect(previa.repetidos).toBe(1)
  })

  it('as quatro contas fecham o total de linhas lidas', () => {
    expect(linhasLidas(previa)).toBe(lerLista(texto).length)
  })
})

describe('remocaoDoBloqueio', () => {
  it('são as colunas de um update, com o motivo aparado', () => {
    expect(remocaoDoBloqueio(' era engano ', new Date('2026-09-23T12:00:00.000Z'))).toEqual({
      removed_at: '2026-09-23T12:00:00.000Z',
      removal_reason: 'era engano',
    })
  })
})

describe('aplicarRecorte', () => {
  const lista = [
    bloqueio({ id: 'a', origem: 'manual' }),
    bloqueio({ id: 'b', origem: 'wrong_number' }),
    bloqueio({ id: 'c', origem: 'manual', removidoEm: '2026-09-21T10:00:00.000Z' }),
  ]

  it('ativos e removidos são recortes separados', () => {
    expect(aplicarRecorte(lista, { estado: 'ativo', origem: 'todas' }).map((b) => b.id)).toEqual(
      ['a', 'b'],
    )
    expect(
      aplicarRecorte(lista, { estado: 'removido', origem: 'todas' }).map((b) => b.id),
    ).toEqual(['c'])
  })

  it('a origem recorta dentro do estado', () => {
    expect(
      aplicarRecorte(lista, { estado: 'ativo', origem: 'wrong_number' }).map((b) => b.id),
    ).toEqual(['b'])
  })
})
