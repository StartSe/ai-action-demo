import { describe, expect, it } from 'vitest'

import {
  bloqueioAntesDeDiscar,
  destinoDoLead,
  destinosDoDiscador,
  formatarDuracao,
  segundosDesde,
} from '@/chamadas/discador'
import type { Discador } from '@/chamadas/tipos'

const TESTE = '+5511999990001'

function discador(aberto: boolean, mudanca: Partial<Discador> = {}): Discador {
  return {
    portao: {
      realDialing: aberto,
      primeiraChamadaDeTesteEm: aberto ? '2026-09-20T12:00:00Z' : null,
      numerosDeTeste: [TESTE],
    },
    numerosDeTeste: [{ telefone: TESTE, rotulo: 'Celular da Renata' }],
    leads: [
      { id: 'lead-1', nome: 'Paula Siqueira', telefone: '+5511988887777' },
      { id: 'lead-2', nome: 'Renata Alves', telefone: '(11) 99999-0001' },
    ],
    linhas: [],
    ...mudanca,
  }
}

describe('o que o discador oferece', () => {
  it('com o portão fechado, só a lista de teste, e nenhum lead fora dela', () => {
    const destinos = destinosDoDiscador(discador(false))

    expect(destinos.map((destino) => destino.telefone)).toEqual([TESTE])
    expect(destinos.map((destino) => destino.leadId)).toEqual([null])
  })

  it('com o portão aberto, a lista de teste e os leads', () => {
    const destinos = destinosDoDiscador(discador(true))

    expect(destinos.map((destino) => destino.chave)).toEqual(['teste:+5511999990001', 'lead:lead-1'])
  })

  it('o lead que tem o número de teste não aparece duas vezes, nem escrito de outro jeito', () => {
    const telefones = destinosDoDiscador(discador(true)).map((destino) => destino.telefone)

    expect(new Set(telefones).size).toBe(telefones.length)
  })

  it('número que nem é telefone não vira destino, com o portão aberto', () => {
    const destinos = destinosDoDiscador(
      discador(true, { leads: [{ id: 'lead-3', nome: 'Torto', telefone: '123' }] }),
    )

    expect(destinos.map((destino) => destino.chave)).toEqual(['teste:+5511999990001'])
  })

  it('o lead da ficha fora da lista de teste não é destino enquanto o portão estiver fechado', () => {
    const lead = { id: 'lead-1', nome: 'Paula Siqueira', telefone: '+5511988887777' }

    expect(destinoDoLead(lead, discador(false))).toBeNull()
    expect(destinoDoLead(lead, discador(true))?.telefone).toBe('+5511988887777')
  })

  it('o lead da ficha com número de teste é destino com o portão fechado', () => {
    const lead = { id: 'lead-2', nome: 'Renata Alves', telefone: '(11) 99999-0001' }

    expect(destinoDoLead(lead, discador(false))).toMatchObject({ telefone: TESTE, deTeste: true })
  })
})

describe('quando a tela nem chama o servidor', () => {
  const puxado = { em: '2026-09-23T12:00:00Z', por: 'Renata Alves', motivo: 'Teste' }

  it('com o freio puxado ninguém liga, nem o dono', () => {
    expect(bloqueioAntesDeDiscar(puxado, 'owner')).toBe('freio_puxado')
    expect(bloqueioAntesDeDiscar(puxado, 'viewer')).toBe('freio_puxado')
  })

  it('o viewer não liga, e sem papel conhecido a tela também não', () => {
    expect(bloqueioAntesDeDiscar(null, 'viewer')).toBe('papel_sem_discagem')
    expect(bloqueioAntesDeDiscar(null, null)).toBe('papel_sem_discagem')
  })

  it('operador com o freio solto passa para o servidor decidir', () => {
    expect(bloqueioAntesDeDiscar(null, 'operator')).toBeNull()
  })
})

describe('a duração que corre', () => {
  it('conta segundos inteiros e nunca volta para trás do início', () => {
    const inicio = '2026-09-23T12:00:00.000Z'

    expect(segundosDesde(inicio, Date.parse(inicio) + 65_900)).toBe(65)
    expect(segundosDesde(inicio, Date.parse(inicio) - 5_000)).toBe(0)
    expect(segundosDesde('não é data', Date.now())).toBe(0)
  })

  it.each([
    [0, '0:00'],
    [7, '0:07'],
    [247, '4:07'],
    [3729, '1:02:09'],
  ])('%i segundos aparecem como %s', (segundos, esperado) => {
    expect(formatarDuracao(segundos)).toBe(esperado)
  })
})
