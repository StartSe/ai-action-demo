import { describe, expect, it, vi } from 'vitest'

import {
  remedirDepoisDeGravar,
  telasDoPasso,
  type PassoDoAssistente,
} from '@/configuracao-inicial/telas-do-passo'
import type { PassoId } from '@/configuracao-inicial/tipos'
import { passosDeExemplo } from '@/testes/servico-de-configuracao-dublado'

/**
 * Todo `PassoId`, como chave de um `Record`: passo novo no tipo sem entrada
 * aqui não tipa, e a varredura abaixo passa a cobri-lo no mesmo gesto.
 */
const TODO_PASSO: Record<PassoId, true> = {
  credenciais: true,
  agente: true,
  roteiro: true,
  numero: true,
  especialista: true,
  agenda: true,
  leads: true,
  equipe: true,
}

describe('telasDoPasso', () => {
  it('liga cada passo à tela que o resolve', () => {
    const mapa = Object.fromEntries(
      (
        [
          'credenciais',
          'agente',
          'roteiro',
          'numero',
          'especialista',
          'agenda',
          'leads',
          'equipe',
          'concluida',
        ] satisfies PassoDoAssistente[]
      ).map((passo) => [passo, telasDoPasso(passo)]),
    )

    expect(mapa).toEqual({
      credenciais: ['integracoes'],
      agente: ['identidade', 'voz'],
      roteiro: ['playbooks', 'privacidade'],
      numero: ['numeros', 'discagem'],
      especialista: ['especialistas'],
      agenda: ['especialistas'],
      leads: ['importacao'],
      equipe: ['equipe'],
      concluida: [],
    })
  })

  it('todo PassoId tem tela, e só a concluída fica vazia', () => {
    const semTela = (Object.keys(TODO_PASSO) as PassoId[]).filter(
      (passo) => telasDoPasso(passo).length === 0,
    )

    expect(semTela).toEqual([])
    expect(telasDoPasso('concluida')).toEqual([])
  })

  it('nenhum passo do catálogo de exemplo fica sem tela', () => {
    for (const { passo } of passosDeExemplo()) {
      expect(telasDoPasso(passo).length, passo).toBeGreaterThan(0)
    }
  })
})

describe('remedirDepoisDeGravar', () => {
  function servicoDeExemplo() {
    return {
      prefixo: 'gravado:',
      carregar: vi.fn(() => Promise.resolve('carga')),
      salvar(valor: string) {
        return Promise.resolve(`${this.prefixo}${valor}`)
      },
      recusar: () => Promise.reject(new Error('recusa')),
    }
  }

  it('mede de novo depois da escrita, e não antes de ela voltar', async () => {
    const aoGravar = vi.fn()
    const servico = remedirDepoisDeGravar(servicoDeExemplo(), ['carregar'], aoGravar)

    const pedido = servico.salvar('x')
    expect(aoGravar).not.toHaveBeenCalled()

    // O `this` do método é o serviço original.
    await expect(pedido).resolves.toBe('gravado:x')
    expect(aoGravar).toHaveBeenCalledTimes(1)
  })

  it('leitura não mede de novo', async () => {
    const aoGravar = vi.fn()
    const original = servicoDeExemplo()
    const servico = remedirDepoisDeGravar(original, ['carregar'], aoGravar)

    await expect(servico.carregar()).resolves.toBe('carga')
    expect(original.carregar).toHaveBeenCalledTimes(1)
    expect(aoGravar).not.toHaveBeenCalled()
  })

  it('escrita recusada também mede, e a recusa chega a quem chamou', async () => {
    // O servidor pode ter gravado parte antes de recusar; medir de novo é
    // barato, e a tela continua recebendo o erro dela.
    const aoGravar = vi.fn()
    const servico = remedirDepoisDeGravar(servicoDeExemplo(), ['carregar'], aoGravar)

    await expect(servico.recusar()).rejects.toThrow('recusa')
    expect(aoGravar).toHaveBeenCalledTimes(1)
    expect(aoGravar).toHaveBeenCalledWith(false)
  })

  it('diz se a escrita foi aceita, pela forma de recusa dos serviços', async () => {
    const aoGravar = vi.fn()
    const servico = remedirDepoisDeGravar(
      {
        aceitar: () => Promise.resolve({ ok: true as const }),
        negar: () => Promise.resolve({ ok: false as const, motivo: 'sem-permissao' }),
      },
      [],
      aoGravar,
    )

    await servico.aceitar()
    await servico.negar()
    expect(aoGravar.mock.calls).toEqual([[true], [false]])
  })

  it('o que não é método passa sem mudança', () => {
    const servico = remedirDepoisDeGravar(servicoDeExemplo(), [], vi.fn())
    expect(servico.prefixo).toBe('gravado:')
  })
})
