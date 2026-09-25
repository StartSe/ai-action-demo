import { describe, expect, it } from 'vitest'

import {
  PAPEIS,
  podeAcionarFreio,
  podeAdministrarEquipe,
  podeAjustarCanalDoWhatsapp,
  podeAtribuir,
  podeDefinirPoliticaDeDiscagem,
  podeDiscar,
  podeAjustarLimiaresDaFila,
  podeConfigurarEtapas,
  podeCorrigirClassificacao,
  podeMoverNoFunil,
  podeOperarBloqueios,
  podeOperarConversas,
  podeOperarLeads,
  podeResolverExcecoes,
  quemConcedeAcesso,
} from '@/equipe/papeis'
import type { Membro, Papel } from '@/equipe/tipos'

function membro(papel: Papel): Membro {
  return {
    usuarioId: papel,
    nome: papel,
    email: `${papel}@transportes.com.br`,
    papel,
    ultimoAcesso: null,
  }
}

describe('papéis da equipe', () => {
  it('só dono e administrador administram a equipe', () => {
    expect(PAPEIS.filter(podeAdministrarEquipe)).toEqual(['owner', 'admin'])
  })

  it('atribuir o papel de dono é privilégio do dono', () => {
    expect(podeAtribuir('owner', 'owner')).toBe(true)
    expect(podeAtribuir('admin', 'owner')).toBe(false)
    expect(podeAtribuir('admin', 'admin')).toBe(true)
  })

  it('quem não administra não atribui papel nenhum', () => {
    for (const alvo of PAPEIS) {
      expect(podeAtribuir('operator', alvo)).toBe(false)
      expect(podeAtribuir('viewer', alvo)).toBe(false)
    }
  })

  it('a política de discagem é de quem configura a máquina', () => {
    expect(PAPEIS.filter(podeDefinirPoliticaDeDiscagem)).toEqual([
      'owner',
      'admin',
    ])
  })

  it('agir sobre lead é de quem opera o funil; o viewer só acompanha', () => {
    expect(PAPEIS.filter(podeOperarLeads)).toEqual([
      'owner',
      'admin',
      'operator',
    ])
  })

  it('mexer na lista de bloqueio é de quem opera; o viewer só lê', () => {
    expect(PAPEIS.filter(podeOperarBloqueios)).toEqual(['owner', 'admin', 'operator'])
  })

  it('resolver item da fila é de quem opera; o viewer só lê', () => {
    expect(PAPEIS.filter(podeResolverExcecoes)).toEqual(['owner', 'admin', 'operator'])
  })

  it('discar é de quem opera; o viewer acompanha as chamadas', () => {
    expect(PAPEIS.filter(podeDiscar)).toEqual(['owner', 'admin', 'operator'])
  })

  it('configurar as etapas do funil é de quem administra', () => {
    expect(PAPEIS.filter(podeConfigurarEtapas)).toEqual(['owner', 'admin'])
  })

  it('ajustar os limiares da fila é de admin, a política de account_settings', () => {
    expect(PAPEIS.filter(podeAjustarLimiaresDaFila)).toEqual(['owner', 'admin'])
  })

  it('mover lead no funil é de quem opera; o viewer vê o quadro em leitura', () => {
    expect(PAPEIS.filter(podeMoverNoFunil)).toEqual(['owner', 'admin', 'operator'])
  })

  it('corrigir a classificação é de quem opera, a régua de corrigir_classificacao', () => {
    expect(PAPEIS.filter(podeCorrigirClassificacao)).toEqual(['owner', 'admin', 'operator'])
  })

  it('o freio de emergência é de quem responde pela máquina, não de quem opera', () => {
    expect(PAPEIS.filter(podeAcionarFreio)).toEqual(['owner', 'admin'])
  })

  it('ajustar o canal de WhatsApp é de admin, a mesma política de account_settings', () => {
    expect(PAPEIS.filter(podeAjustarCanalDoWhatsapp)).toEqual(['owner', 'admin'])
  })

  it('operar conversas de WhatsApp é de quem opera; o viewer só lê', () => {
    expect(PAPEIS.filter(podeOperarConversas)).toEqual(['owner', 'admin', 'operator'])
  })

  it('a quem pedir acesso é a lista de donos e administradores', () => {
    const membros = PAPEIS.map(membro)

    expect(quemConcedeAcesso(membros).map((m) => m.papel)).toEqual([
      'owner',
      'admin',
    ])
  })
})
