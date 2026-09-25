import { describe, expect, it } from 'vitest'

import {
  faseDaLigacao,
  foraDaJanelaDoTeste,
  passoQueResolve,
} from '@/configuracao-inicial/primeira-ligacao'
import { chamadaAoVivo } from '@/testes/servico-de-chamadas-dublado'

describe('passo que resolve a recusa', () => {
  it('manda a política e a lista de teste para o número, e a publicação para o roteiro', () => {
    expect(passoQueResolve('portao_de_lead_real')).toBe('numero')
    expect(passoQueResolve('teto_de_gasto')).toBe('numero')
    expect(passoQueResolve('sem_linha_disponivel')).toBe('numero')
    expect(passoQueResolve('sem_publicacao')).toBe('roteiro')
    expect(passoQueResolve('sem_credencial_de_voz')).toBe('credenciais')
  })

  it('fora da janela não manda para o passo do número (D-11)', () => {
    expect(passoQueResolve('fora_da_janela')).toBeNull()
  })

  it('não inventa passo para o que o assistente não resolve', () => {
    expect(passoQueResolve('freio_puxado')).toBeNull()
    expect(passoQueResolve('numero_bloqueado')).toBeNull()
    expect(passoQueResolve('guarda_indisponivel')).toBeNull()
    expect(passoQueResolve('sem_resposta')).toBeNull()
    // Motivo vindo do servidor não pode achar nada na cadeia de protótipos.
    expect(passoQueResolve('constructor')).toBeNull()
  })
})

describe('a ligação de teste fora da janela (D-11)', () => {
  const COMERCIAL = { '1': { start: '09:00', end: '18:00' }, '2': { start: '09:00', end: '18:00' } }

  it('às 20h30 de segunda em São Paulo diz a janela e que abre terça-feira às 9h', () => {
    expect(
      foraDaJanelaDoTeste(COMERCIAL, 'America/Sao_Paulo', '2026-09-28T23:30:00Z'),
    ).toEqual({ janela: 'das 9h às 18h', abre: 'terça-feira às 9h' })
  })

  it('dentro da janela, ou com a janela ilegível, não diz nada', () => {
    expect(foraDaJanelaDoTeste(COMERCIAL, 'America/Sao_Paulo', '2026-09-28T15:00:00Z')).toBeNull()
    expect(foraDaJanelaDoTeste('quebrada', 'America/Sao_Paulo', '2026-09-28T15:00:00Z')).toBeNull()
  })
})

describe('fase da ligação', () => {
  it('lê a assinatura: conectando, em curso, encerrada quando sai da lista', () => {
    const chamada = chamadaAoVivo(3, { chamadaId: 'ch-1' })

    expect(faseDaLigacao({ fase: 'carregando' }, 'ch-1')).toEqual({ fase: 'conectando' })
    expect(faseDaLigacao({ fase: 'erro' }, 'ch-1')).toEqual({ fase: 'erro' })
    expect(faseDaLigacao({ fase: 'pronto', chamadas: [chamada] }, 'ch-1')).toEqual({
      fase: 'em-curso',
      chamada,
    })
    // Outra chamada da conta em curso não é a nossa.
    expect(
      faseDaLigacao({ fase: 'pronto', chamadas: [{ ...chamada, chamadaId: 'ch-2' }] }, 'ch-1'),
    ).toEqual({ fase: 'encerrada' })
    expect(faseDaLigacao({ fase: 'pronto', chamadas: [] }, 'ch-1')).toEqual({ fase: 'encerrada' })
  })
})
