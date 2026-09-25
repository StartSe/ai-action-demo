// A assinatura em tempo real carrega só as colunas de `call_live`, e a
// transcrição nunca está entre elas (R-08). O conjunto é cobrado exato, e não
// só pela ausência de `transcript`: coluna nova aqui é decisão sobre o que vai
// para todo navegador aberto, e precisa derrubar um teste para ser tomada.

import { describe, expect, it } from 'vitest'

import { COLUNAS_DE_CALL_LIVE, criarLojaAoVivo, paraChamadaAoVivo } from '@/chamadas/ao-vivo'
import type { EventoAoVivo } from '@/chamadas/tipos'
import { criarServicoDeChamadasDublado } from '@/testes/servico-de-chamadas-dublado'

describe('o que a assinatura carrega', () => {
  it('são exatamente as sete colunas de call_live', () => {
    expect([...COLUNAS_DE_CALL_LIVE].sort()).toEqual(
      ['account_id', 'call_id', 'duration_sec', 'lead_id', 'purpose', 'started_at', 'status'],
    )
  })

  it('a transcrição não está entre elas', () => {
    expect(COLUNAS_DE_CALL_LIVE.some((coluna) => /transcri/i.test(coluna))).toBe(false)
  })

  it('a linha vira chamada sem nada além das colunas, mesmo que o servidor mande mais', () => {
    const chamada = paraChamadaAoVivo({
      call_id: 'ch-1',
      account_id: 'c-1',
      status: 'ringing',
      purpose: 'reminder',
      lead_id: null,
      started_at: '2026-09-23T12:00:00Z',
      duration_sec: null,
      transcript: 'o que não deveria ter vindo',
    })

    expect(JSON.stringify(chamada)).not.toContain('o que não deveria ter vindo')
    expect(chamada).toEqual({
      chamadaId: 'ch-1',
      contaId: 'c-1',
      status: 'ringing',
      proposito: 'reminder',
      leadId: null,
      iniciadaEm: '2026-09-23T12:00:00Z',
      duracaoSeg: null,
    })
  })
})

describe('a loja da assinatura', () => {
  it('abre a assinatura com o primeiro ouvinte e fecha com o último', () => {
    const servico = criarServicoDeChamadasDublado()
    let abertas = 0
    let fechadas = 0
    const contada = {
      ...servico,
      assinarAoVivo(aoReceber: (evento: EventoAoVivo) => void) {
        abertas += 1
        const cancelar = servico.assinarAoVivo(aoReceber)
        return () => {
          fechadas += 1
          cancelar()
        }
      },
    }
    const loja = criarLojaAoVivo(contada)

    const sair1 = loja.assinar(() => {})
    const sair2 = loja.assinar(() => {})
    sair1()
    expect({ abertas, fechadas }).toEqual({ abertas: 1, fechadas: 0 })
    sair2()
    expect({ abertas, fechadas }).toEqual({ abertas: 1, fechadas: 1 })
  })

  it('empurrar pela assinatura muda o que a loja lê', async () => {
    const servico = criarServicoDeChamadasDublado()
    const loja = criarLojaAoVivo(servico)
    const sair = loja.assinar(() => {})

    expect(loja.ler()).toEqual({ fase: 'carregando' })
    await Promise.resolve()
    expect(loja.ler()).toEqual({ fase: 'pronto', chamadas: [] })

    servico.empurrar([
      paraChamadaAoVivo({
        call_id: 'ch-9',
        account_id: 'c-1',
        status: 'queued',
        purpose: 'rescue',
        lead_id: null,
        started_at: '2026-09-23T12:00:00Z',
        duration_sec: null,
      }),
    ])
    const estado = loja.ler()
    expect(estado.fase === 'pronto' ? estado.chamadas.map((c) => c.chamadaId) : []).toEqual(['ch-9'])
    sair()
  })
})
