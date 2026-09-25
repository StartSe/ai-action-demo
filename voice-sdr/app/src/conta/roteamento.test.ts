import { describe, expect, it } from 'vitest'

import {
  classificarFalhaDoRoteamento,
  especialistasEscolhiveis,
  normalizarRoteamento,
  roteamentoMudou,
  validarRoteamento,
} from '@/conta/roteamento'
import type { EspecialistaDoRoteamento, RoteamentoDaConta } from '@/conta/tipos'

const ESPECIALISTAS: EspecialistaDoRoteamento[] = [
  { id: 'esp-ana', nome: 'Ana', area: 'Frota', ativo: true },
  { id: 'esp-davi', nome: 'Davi', area: 'Frota', ativo: false },
]

const AREA: RoteamentoDaConta = { modo: 'area', especialistaFixoId: null }

describe('validarRoteamento', () => {
  it('área e rodízio passam, e o destino que sobrou do rascunho não conta', () => {
    expect(validarRoteamento(AREA, { modo: 'round_robin', especialistaFixoId: 'esp-davi' }, ESPECIALISTAS)).toBeNull()
    expect(validarRoteamento(AREA, AREA, ESPECIALISTAS)).toBeNull()
  })

  it('fixo sem especialista é recusado', () => {
    expect(validarRoteamento(AREA, { modo: 'fixed', especialistaFixoId: null }, ESPECIALISTAS)).toBe(
      'fixo-sem-especialista',
    )
    expect(validarRoteamento(AREA, { modo: 'fixed', especialistaFixoId: '' }, ESPECIALISTAS)).toBe(
      'fixo-sem-especialista',
    )
  })

  it('fixo para ativo passa; para inativo é recusado', () => {
    expect(validarRoteamento(AREA, { modo: 'fixed', especialistaFixoId: 'esp-ana' }, ESPECIALISTAS)).toBeNull()
    expect(validarRoteamento(AREA, { modo: 'fixed', especialistaFixoId: 'esp-davi' }, ESPECIALISTAS)).toBe(
      'especialista-inativo',
    )
  })

  it('trocar um fixo por outro inativo é recusado; manter o inativo que já era destino, não', () => {
    const fixoNaAna: RoteamentoDaConta = { modo: 'fixed', especialistaFixoId: 'esp-ana' }
    expect(validarRoteamento(fixoNaAna, { modo: 'fixed', especialistaFixoId: 'esp-davi' }, ESPECIALISTAS)).toBe(
      'especialista-inativo',
    )
    const fixoNoDavi: RoteamentoDaConta = { modo: 'fixed', especialistaFixoId: 'esp-davi' }
    expect(validarRoteamento(fixoNoDavi, fixoNoDavi, ESPECIALISTAS)).toBeNull()
  })

  it('destino que não está na lista da conta é recusado', () => {
    expect(validarRoteamento(AREA, { modo: 'fixed', especialistaFixoId: 'esp-vizinha' }, ESPECIALISTAS)).toBe(
      'especialista-de-outra-conta',
    )
  })
})

it('só os ativos são escolhíveis', () => {
  expect(especialistasEscolhiveis(ESPECIALISTAS).map((item) => item.id)).toEqual(['esp-ana'])
})

it('fora do modo fixo o destino vai nulo, e a mudança compara o normalizado', () => {
  expect(normalizarRoteamento({ modo: 'round_robin', especialistaFixoId: 'esp-ana' })).toEqual({
    modo: 'round_robin',
    especialistaFixoId: null,
  })
  expect(roteamentoMudou(AREA, { modo: 'area', especialistaFixoId: 'esp-ana' })).toBe(false)
  expect(roteamentoMudou(AREA, { modo: 'fixed', especialistaFixoId: null })).toBe(true)
})

describe('classificarFalhaDoRoteamento', () => {
  it.each([
    [
      { code: '23514', message: 'especialista_inativo: o destino do modo fixo precisa ser especialista ativo' },
      'especialista-inativo',
    ],
    [
      { code: '23514', message: 'especialista_de_outra_conta: o destino do modo fixo precisa ser especialista desta conta' },
      'especialista-de-outra-conta',
    ],
    [
      {
        code: '23514',
        message: 'new row for relation "account_settings" violates check constraint "account_settings_destino_do_modo"',
      },
      'fixo-sem-especialista',
    ],
    [{ code: '42501', message: 'permission denied' }, 'sem-permissao'],
    [{ code: 'PGRST', message: 'new row violates row-level security policy' }, 'sem-permissao'],
    [{ code: '23514', message: 'violates check constraint "outra"' }, 'falha-de-comunicacao'],
    [null, 'falha-de-comunicacao'],
  ] as const)('%o vira %s', (erro, motivo) => {
    expect(classificarFalhaDoRoteamento(erro)).toBe(motivo)
  })
})
