import { describe, expect, it } from 'vitest'

import {
  ACOES_DE_ESCRITA,
  ACOES_EM_LOTE,
  acaoHabilitada,
  acoesOferecidas,
  alternarSelecao,
  loteInteiro,
  podarSelecao,
  resumoDoLote,
  rotuloDoLead,
  tudoSelecionado,
} from '@/leads/acoes'
import type { LeadDaLista } from '@/leads/tipos'

function lead(id: string, nome = `Lead ${id}`): LeadDaLista {
  return {
    id,
    nome,
    telefone: `+55489999900${id}`,
    empresa: '',
    cidade: '',
    estado: '',
    etapa: null,
    temperatura: null,
    ultimaAtividade: null,
    bloqueado: false,
  }
}

describe('ações em lote', () => {
  it('não oferece ação de cadência nem de campanha, que são de fatias seguintes', () => {
    // A lista é fechada de propósito: `cadences` e `campaigns` não existem
    // neste banco, e botão que grava em tabela inexistente é botão morto.
    expect([...ACOES_EM_LOTE]).toEqual([
      'bloquear',
      'desbloquear',
      'exportar',
      'excluir',
      'mesclar',
    ])
  })

  it('exportar é a única que não escreve', () => {
    expect(
      ACOES_EM_LOTE.filter((acao) => !ACOES_DE_ESCRITA.includes(acao)),
    ).toEqual(['exportar'])
  })

  it('mesclar só aparece com exatamente dois selecionados', () => {
    expect(acoesOferecidas(0)).not.toContain('mesclar')
    expect(acoesOferecidas(1)).not.toContain('mesclar')
    expect(acoesOferecidas(2)).toContain('mesclar')
    expect(acoesOferecidas(3)).not.toContain('mesclar')
  })

  it('sem seleção, só exportar fica habilitada', () => {
    const habilitadas = ACOES_EM_LOTE.filter((acao) =>
      acaoHabilitada(acao, { selecionados: 0, podeEscrever: true }),
    )

    expect(habilitadas).toEqual(['exportar'])
  })

  it('quem só lê exporta e mais nada', () => {
    for (const acao of ACOES_DE_ESCRITA) {
      expect(
        acaoHabilitada(acao, { selecionados: 2, podeEscrever: false }),
      ).toBe(false)
    }

    // Exportar não é escrita: `registrar_exportacao_de_leads` só cobra
    // `is_member`, e quem acompanha a conta leva a lista para a planilha.
    expect(
      acaoHabilitada('exportar', { selecionados: 0, podeEscrever: false }),
    ).toBe(true)
  })

  it('marcar e desmarcar não mexe no resto da seleção', () => {
    expect(alternarSelecao(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
    expect(alternarSelecao(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('id que saiu da lista sai da seleção', () => {
    // É o que acontece ao trocar um filtro: a barra não pode contar um lead
    // que ninguém está vendo, e a ação não pode alcançá-lo.
    expect(podarSelecao(['a', 'b', 'c'], [lead('a'), lead('c')])).toEqual([
      'a',
      'c',
    ])
  })

  it('lista vazia não conta como tudo selecionado', () => {
    expect(tudoSelecionado([], [])).toBe(false)
    expect(tudoSelecionado(['a'], [lead('a')])).toBe(true)
    expect(tudoSelecionado(['a'], [lead('a'), lead('b')])).toBe(false)
  })

  it('o lead sem nome é identificado pelo telefone', () => {
    expect(rotuloDoLead(lead('1', 'Marina Castro'))).toBe('Marina Castro')
    expect(rotuloDoLead(lead('2', '   '))).toBe('+554899999002')
  })

  it('o resumo do lote fecha a conta do que foi pedido', () => {
    const pedidos = [lead('1'), lead('2'), lead('3')]
    const resumo = resumoDoLote(pedidos, { feitos: ['1', '3'], recusados: ['2'] })

    expect(resumo.total).toBe(3)
    expect(resumo.feitos).toBe(2)
    expect(resumo.recusados).toEqual(['Lead 2'])
    expect(resumo.feitos + resumo.recusados.length).toBe(resumo.total)
  })

  it('o resumo nomeia quem a política recusou, e não só quantos', () => {
    const pedidos = [lead('1', 'Marina Castro'), lead('2', 'Bruno Tavares')]
    const resumo = resumoDoLote(pedidos, { feitos: ['1'], recusados: ['2'] })

    expect(resumo.recusados).toEqual(['Bruno Tavares'])
    expect(loteInteiro(resumo)).toBe(false)
  })

  it('lote inteiro é o que não deixou ninguém para trás', () => {
    const pedidos = [lead('1'), lead('2')]

    expect(
      loteInteiro(resumoDoLote(pedidos, { feitos: ['1', '2'], recusados: [] })),
    ).toBe(true)
  })

  it('o resumo lê o que voltou do banco, não o que o cliente supôs', () => {
    // O serviço devolve `recusados`, mas quem manda é a lista de feitos: id
    // que não voltou do banco é recusa, ainda que ninguém a tenha anunciado.
    const pedidos = [lead('1'), lead('2')]
    const resumo = resumoDoLote(pedidos, { feitos: ['1'], recusados: [] })

    expect(resumo.feitos).toBe(1)
    expect(resumo.recusados).toEqual(['Lead 2'])
  })
})
