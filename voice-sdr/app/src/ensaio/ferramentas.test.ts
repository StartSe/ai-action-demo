import { expect, test } from 'vitest'

import { emOrdemDoInstante } from '@/ensaio/ferramentas'
import type { FerramentaDoEnsaio } from '@/ensaio/tipos'

const transferencia: FerramentaDoEnsaio = {
  ferramenta: 'tool-transfer',
  em: '2026-09-24T13:00:05.000Z',
  erro: null,
}
const bloqueio: FerramentaDoEnsaio = {
  ferramenta: 'tool-dnc',
  em: '2026-09-24T13:00:02.000Z',
  erro: null,
}
const fim: FerramentaDoEnsaio = {
  ferramenta: 'system:end_call',
  em: '2026-09-24T13:00:09.000Z',
  erro: null,
}

test('a ordem sai do instante, não da ordem em que a leitura trouxe', () => {
  expect(emOrdemDoInstante([fim, transferencia, bloqueio])).toEqual([bloqueio, transferencia, fim])
})

test('instante com fuso diferente se compara pelo instante absoluto', () => {
  const mesmoInstanteEmSaoPaulo = { ...bloqueio, em: '2026-09-24T10:00:03.000-03:00' }
  expect(emOrdemDoInstante([mesmoInstanteEmSaoPaulo, bloqueio])).toEqual([
    bloqueio,
    mesmoInstanteEmSaoPaulo,
  ])
})

test('empate e instante ilegível mantêm a ordem recebida, o ilegível no fim', () => {
  const empatada = { ...transferencia, ferramenta: 'tool-qualify' }
  const ilegivel = { ...bloqueio, em: 'ontem' }
  expect(emOrdemDoInstante([ilegivel, empatada, transferencia])).toEqual([
    empatada,
    transferencia,
    ilegivel,
  ])
})

test('não mexe na lista recebida', () => {
  const lista = [transferencia, bloqueio]
  emOrdemDoInstante(lista)
  expect(lista).toEqual([transferencia, bloqueio])
})
