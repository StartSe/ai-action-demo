// A regra que `cron-dial` aplica à conta parada: não consome, e o item fica
// `queued`.

import { expect, test } from 'vitest'

import { consumoDaFila } from './pausa.ts'

test('conta parada não é consumida, e o item fica queued, nunca failed', () => {
  expect(consumoDaFila({ dialing_paused_at: '2026-09-23T17:00:00Z' })).toEqual({
    consumir: false,
    motivo: 'conta_parada',
    item: 'queued',
  })
})

test('conta operando é consumida', () => {
  expect(consumoDaFila({ dialing_paused_at: null })).toEqual({ consumir: true })
})

test.each([
  ['linha nula', null],
  ['linha ausente', undefined],
  ['coluna não lida', {}],
])('estado desconhecido não disca: %s', (_caso, conta) => {
  expect(consumoDaFila(conta)).toEqual({ consumir: false, motivo: 'estado_desconhecido', item: 'queued' })
})
