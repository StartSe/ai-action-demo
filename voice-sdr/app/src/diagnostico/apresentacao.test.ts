import { describe, expect, it } from 'vitest'

import { ALVOS } from '@diagnostico/propostas.ts'

import { diagnostico as copy, rotuloDoAlvo } from '@/copy/diagnostico'
import { comoPublicar, textoDoValor, tipoDaConfirmacao, tomDaSeveridade } from '@/diagnostico/apresentacao'
import { mensagemDaRecusa } from '@/diagnostico/servico-supabase'

describe('a apresentação do diagnóstico', () => {
  it('cada severidade tem tom próprio', () => {
    expect([tomDaSeveridade('erro'), tomDaSeveridade('aviso'), tomDaSeveridade('info')]).toEqual([
      'perigo',
      'atencao',
      'informacao',
    ])
  })

  it('o valor de cada forma vira texto, e a ausência vira nulo', () => {
    expect(textoDoValor('politica.duracao_maxima', 900)).toBe('900 s')
    expect(textoDoValor('politica.teto_diario', 1200)).toBe('1.200')
    expect(textoDoValor('identidade.nunca_afirmar', ['preço', 'prazo'])).toBe('preço; prazo')
    expect(textoDoValor('voz.ajustes', { stability: 0.7, speed: 0.9, style: 1 })).toBe('estabilidade 0,7 · velocidade 0,9')
    expect(textoDoValor('privacidade.aviso_de_gravacao', null)).toBeNull()
    expect(textoDoValor('identidade.nunca_afirmar', [])).toBeNull()
    expect(textoDoValor('roteiro.discovery', '  ')).toBeNull()
  })

  it('roteiro e jeito da casa publicam pelo playbook do propósito; o resto republica a Sarah', () => {
    expect(comoPublicar({ alvo: 'roteiro.rescue' })).toEqual({ tipo: 'playbook', proposito: 'rescue' })
    expect(comoPublicar({ alvo: 'jeito_da_casa.followup' })).toEqual({ tipo: 'playbook', proposito: 'followup' })
    expect(comoPublicar({ alvo: 'voz.ajustes' })).toEqual({ tipo: 'sarah' })
    expect(comoPublicar({ alvo: 'republicar' })).toEqual({ tipo: 'sarah' })
    expect(tipoDaConfirmacao('republicar')).toBe('publicacao')
    expect(tipoDaConfirmacao('jeito_da_casa.discovery')).toBe('roteiro')
    expect(tipoDaConfirmacao('politica.simultaneidade')).toBe('nivel')
  })

  it('todo alvo da lista fechada tem nome em português, sem repetir', () => {
    const nomes = ALVOS.map(rotuloDoAlvo)
    expect(new Set(nomes).size).toBe(ALVOS.length)
    for (const nome of nomes) expect(nome).not.toMatch(/[._]/)
  })

  it('a recusa do banco vira a frase pelo SQLSTATE, e o desconhecido vira a genérica', () => {
    expect(mensagemDaRecusa({ code: 'SD001' })).toBe(copy.recusas.SD001)
    expect(mensagemDaRecusa({ code: '42501' })).toBe(copy.recusas['42501'])
    expect(mensagemDaRecusa({ code: 'XX000' })).toBe(copy.falhaGenerica)
    expect(mensagemDaRecusa(null)).toBe(copy.falhaGenerica)
  })
})
