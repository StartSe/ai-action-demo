import { describe, expect, test } from 'vitest'

import {
  compilarPublicacao,
  ferramentasDoProposito,
  ferramentasPrevistasDoProposito,
  type PedidoDeCompilacao,
} from '../agente/compilador.ts'
import type { Proposito } from './camada-um.ts'
import { ROTEIRO_DE_LEMBRETE_PROVISORIO, ROTEIRO_DE_RESGATE_PROVISORIO } from './roteiros-de-lembrete-e-resgate.ts'

const ROTEIROS: ReadonlyArray<readonly [Proposito, string]> = [
  ['reminder', ROTEIRO_DE_LEMBRETE_PROVISORIO],
  ['rescue', ROTEIRO_DE_RESGATE_PROVISORIO],
]

function pedido(proposito: Proposito, camadaDois: string): PedidoDeCompilacao {
  return {
    proposito,
    fatia: 'F6',
    identidade: {
      nome: 'Lia',
      empresa: 'Fábrica de Parafusos',
      oferta: 'linha de parafusos sob medida',
      nuncaAfirmar: [],
      vozId: 'voz-pt-br-1',
      ajustesDeVoz: { estabilidade: 0.6, velocidade: 1 },
      primeiraFala: 'Oi, {nome_do_lead}? Aqui é a {nome_do_agente}, da {empresa}.',
    },
    playbookPublicado: {
      playbookVersionId: '11111111-1111-4111-8111-111111111111',
      versao: 1,
      camadaDois,
      camadaTres: 'A casa trata todo mundo por você.',
    },
    politica: { duracaoMaximaSegundos: 600, gravacaoLigada: true, avisoDeGravacao: null, retencaoDias: 90 },
  }
}

describe('os roteiros de lembrete e de resgate (US-194)', () => {
  test('na F6, o lembrete leva confirmar e remarcar, e o resgate leva remarcar e qualificar', () => {
    expect(ferramentasDoProposito('reminder', 'F6')).toEqual([
      'tool-transfer',
      'tool-dnc',
      'tool-availability',
      'tool-confirm-meeting',
      'tool-reschedule',
    ])
    expect(ferramentasDoProposito('rescue', 'F6')).toEqual([
      'tool-transfer',
      'tool-dnc',
      'tool-qualify',
      'tool-availability',
      'tool-reschedule',
    ])
  })

  test.each(ROTEIROS)('%s compila na F6 com o roteiro como camada 2 e as ferramentas do propósito', async (proposito, roteiro) => {
    const { configuracao } = await compilarPublicacao(pedido(proposito, roteiro))
    expect(configuracao.playbook.prompt).toContain('# Roteiro do propósito (camada 2)')
    expect(configuracao.playbook.prompt).toContain(roteiro)
    expect(configuracao.ferramentas.nossas.map((f) => f.nome)).toEqual(ferramentasDoProposito(proposito, 'F6'))
  })

  test.each(ROTEIROS)('%s cita só ferramentas que o propósito tem', (proposito, roteiro) => {
    const citadas = new Set(roteiro.match(/tool-[a-z-]+/g) ?? [])
    expect(citadas.size).toBeGreaterThan(0)
    const previstas = new Set(ferramentasPrevistasDoProposito(proposito))
    for (const ferramenta of citadas) expect({ ferramenta, prevista: previstas.has(ferramenta) }).toEqual({ ferramenta, prevista: true })
  })

  test('o resgate não usa confirmar presença, e o lembrete não marca reunião nova', () => {
    expect(ROTEIRO_DE_RESGATE_PROVISORIO).not.toContain('tool-confirm-meeting')
    expect(ROTEIRO_DE_LEMBRETE_PROVISORIO).not.toContain('tool-book-meeting')
  })

  test('nenhum roteiro manda dizer ou pedir identificador', () => {
    for (const [, roteiro] of ROTEIROS) expect(roteiro).not.toMatch(/meeting_id|call_id|lead_id|\bid\b/)
  })
})
