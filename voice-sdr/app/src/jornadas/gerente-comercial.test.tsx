// Jornada da persona 2 (docs/personas.md): Marcos, gerente comercial de uma
// integradora de energia solar, com consultores por segmento e inbound de
// formulário. O caminho do lead pelo banco está em
// testes/jornadas/lead-do-formulario.test.ts; aqui estão as telas em que ele
// trabalha depois que a assistente liga: quem recebe a reunião, a fila do que
// ela não resolveu sozinha, a ficha da reunião que o consultor lê antes de
// entrar e o desfecho que fecha a conta da métrica.
//
// O que ficou de fora e por quê está em docs/validacao-por-persona.md.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { especialistas as copyDosEspecialistas } from '@/copy/especialistas'
import { fila as copyDaFila } from '@/copy/fila'
import { reunioes } from '@/copy/reunioes'
import type { Equipe } from '@/equipe/tipos'
import { lerContexto } from '@/fila/leitura'
import { barraLateral, navegacao } from '@/copy/navegacao'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import { criarServicoDeEquipeDublado, equipeDeExemplo } from '@/testes/servico-de-equipe-dublado'
import { criarServicoDeEspecialistasDublado } from '@/testes/servico-de-especialistas-dublado'
import { criarServicoDaFilaDublado, itemDeExemplo } from '@/testes/servico-da-fila-dublado'
import { criarServicoDeReunioesDublado, fichaDaReuniao, reuniaoDaLista } from '@/testes/servico-de-reunioes-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'marcos@soldovale.com.br' }

afterEach(cleanup)

function equipeDoMarcos(): Equipe {
  return { ...equipeDeExemplo('owner'), papelDoUsuario: 'owner' }
}

describe('Marcos: quem recebe a reunião', () => {
  it('cadastra os dois consultores, cada um com a área que a assistente usa para rotear', async () => {
    const especialistas = criarServicoDeEspecialistasDublado({ fusoDaConta: 'America/Sao_Paulo' })
    await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/especialistas',
      criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: equipeDoMarcos() } }),
      undefined, // auditoria
      undefined, // integrações
      undefined, // configuração inicial
      undefined, // leads
      undefined, // Sarah
      undefined, // números
      undefined, // chamadas
      undefined, // discagem
      undefined, // bloqueios
      undefined, // privacidade
      especialistas,
    )
    const f = copyDosEspecialistas.formulario
    await screen.findByText(copyDosEspecialistas.vazio.titulo)

    const consultores = [
      { nome: 'Helena Costa', email: 'helena@soldovale.com.br', area: 'Comercial e agro' },
      { nome: 'Pedro Luz', email: 'pedro@soldovale.com.br', area: 'Residencial' },
    ]
    for (const consultor of consultores) {
      fireEvent.click(await screen.findByRole('button', { name: copyDosEspecialistas.novo }))
      fireEvent.change(screen.getByLabelText(f.nome), { target: { value: consultor.nome } })
      fireEvent.change(screen.getByLabelText(f.email), { target: { value: consultor.email } })
      fireEvent.change(screen.getByLabelText(f.area), { target: { value: consultor.area } })
      fireEvent.click(screen.getByRole('button', { name: copyDosEspecialistas.modalidades.video }))
      fireEvent.click(screen.getByRole('button', { name: f.salvar }))
      await screen.findByText(f.salvo)
    }

    await waitFor(() => expect(especialistas.gravados).toHaveLength(2))
    expect(especialistas.gravados.map((cada) => [cada.nome, cada.area, cada.fuso])).toEqual([
      ['Helena Costa', 'Comercial e agro', 'America/Sao_Paulo'],
      ['Pedro Luz', 'Residencial', 'America/Sao_Paulo'],
    ])
    const tabela = await screen.findByRole('table', { name: copyDosEspecialistas.rotuloDaTabela })
    expect(within(tabela).getByText('Helena Costa')).toBeDefined()
    expect(within(tabela).getByText('Pedro Luz')).toBeDefined()
  })
})

describe('Marcos: o que a assistente não resolveu sozinha', () => {
  async function abrirFila() {
    const fila = criarServicoDaFilaDublado({ usuarioId: 'u-1', itens: [] })
    await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/fila',
      criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: equipeDoMarcos() } }),
      undefined, // auditoria
      undefined, // integrações
      undefined, // configuração inicial
      undefined, // leads
      undefined, // Sarah
      undefined, // números
      undefined, // chamadas
      undefined, // discagem
      undefined, // bloqueios
      undefined, // privacidade
      undefined, // especialistas
      undefined, // ensaio
      fila,
    )
    await screen.findByText(copyDaFila.nuncaPreenchida.titulo)
    return fila
  }

  it('o lead que pediu gente chega sem recarregar, com o trecho da conversa e o telefone para retornar', async () => {
    const fila = await abrirFila()

    fila.chegar(
      itemDeExemplo({
        id: 'joana',
        tipo: 'pedido_humano',
        lead: { id: 'l-joana', nome: 'Joana Prado', telefone: '+5548999123456' },
        contexto: lerContexto({ recorte: 'Prefiro falar com um consultor de verdade.' }),
      }),
    )

    const rotulo = copyDaFila.item.rotulo('pedido_humano', 'Joana Prado')
    const artigo = await screen.findByRole('article', { name: rotulo })
    expect(within(artigo).getByText('Prefiro falar com um consultor de verdade.')).toBeDefined()
    expect(
      within(artigo).getByRole('link', { name: copyDaFila.acao.ligar('Joana Prado') }).getAttribute('href'),
    ).toBe('tel:+5548999123456')

    fireEvent.change(within(artigo).getByLabelText(copyDaFila.resolver.campo), {
      target: { value: 'Liguei de volta e marquei com a Helena na quinta.' },
    })
    fireEvent.click(within(artigo).getByRole('button', { name: copyDaFila.resolver.rotulo(rotulo) }))

    expect(await screen.findByText(copyDaFila.resolver.feito)).toBeDefined()
    expect(fila.resolucoes).toEqual([{ id: 'joana', texto: 'Liguei de volta e marquei com a Helena na quinta.' }])
    expect(screen.queryByRole('article', { name: rotulo })).toBeNull()
  })

  /** O elo "Precisam de você" da barra lateral, com os itens abertos dados. */
  async function itemDaFilaNaBarra(
    itens = [
      itemDeExemplo({ id: 'a', tipo: 'pedido_humano' }),
      itemDeExemplo({ id: 'b', tipo: 'sentimento_negativo' }),
    ],
  ) {
    const fila = criarServicoDaFilaDublado({ usuarioId: 'u-1', itens })
    await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/leads',
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      fila,
    )
    const rotulo = navegacao.trilhas[0]?.itens[1]?.rotulo ?? ''
    return { elo: await screen.findByRole('link', { name: new RegExp(`^${rotulo}`) }), fila, rotulo }
  }

  it('D-06: a barra lateral mostra quantos itens esperam na fila', async () => {
    // A especificação (5.2) pede contagem visível na navegação: a fila é a
    // segunda tela mais visitada, e quem está no funil não sabe que alguém
    // pediu para falar com gente. Corrigido: a casca lê a fila aberta.
    const { elo } = await itemDaFilaNaBarra()
    await waitFor(() => expect(elo.textContent).toContain('2'))
    expect(elo.textContent).toContain(barraLateral.esperando(2))
  })

  it('com a fila vazia, o item da fila é só o rótulo', async () => {
    const { elo, rotulo } = await itemDaFilaNaBarra([])
    await new Promise((resolver) => setTimeout(resolver, 20))
    expect((elo.textContent ?? '').trim()).toBe(rotulo)
  })
})

describe('Marcos: a reunião que o consultor lê antes de entrar', () => {
  const REUNIAO = fichaDaReuniao({
    lead: {
      ...reuniaoDaLista().lead,
      nome: 'Joana Prado',
      email: 'joana@padariaprado.com.br',
      telefone: '+5548999123456',
      empresa: 'Padaria Prado',
    },
    fusoDoLead: 'America/Sao_Paulo',
    resumoDePassagem: {
      resumo: 'Dona de padaria, conta de luz de R$ 900 e telhado próprio.',
      dor: 'O forno elétrico dobrou a conta no inverno.',
      objecoes: ['Prazo de retorno do investimento', 'Quer ver uma instalação na região'],
    },
    inicio: '2026-09-29T17:00:00Z',
    fim: '2026-09-29T17:30:00Z',
  })

  async function abrirReuniao() {
    const servico = criarServicoDeReunioesDublado({ fichas: [REUNIAO] })
    await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/reunioes/r-1',
      criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: equipeDoMarcos() } }),
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined,
      servico,
    )
    return servico
  }

  it('o resumo de passagem traz a dor e as objeções em blocos, sem nada de JSON', async () => {
    await abrirReuniao()

    const resumo = await screen.findByRole('region', { name: reunioes.ficha.resumo.titulo })
    expect(within(resumo).getByText('O forno elétrico dobrou a conta no inverno.')).toBeDefined()
    expect(within(resumo).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Prazo de retorno do investimento',
      'Quer ver uma instalação na região',
    ])
    expect(resumo.textContent).not.toMatch(/[{}[\]"]/)
  })

  it('depois do horário, o Marcos marca a reunião como realizada, e a ficha mostra quem apurou', async () => {
    const servico = await abrirReuniao()
    const copy = reunioes.desfecho
    const secao = await screen.findByRole('region', { name: copy.titulo })

    fireEvent.click(within(secao).getByRole('button', { name: copy.marcar }))
    const dialogo = screen.getByRole('dialog')
    fireEvent.click(within(dialogo).getByRole('radio', { name: new RegExp(copy.escolha.opcoes.attended) }))
    fireEvent.click(within(dialogo).getByRole('button', { name: copy.escolha.confirmar }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(servico.desfechosPedidos).toEqual([
      { reuniaoId: 'r-1', desfecho: 'attended', motivo: null, sobrescrever: false },
    ])
    expect(
      await within(screen.getByRole('region', { name: copy.titulo })).findByText(
        copy.apurada(reunioes.estados.attended),
      ),
    ).toBeDefined()
  })
})
