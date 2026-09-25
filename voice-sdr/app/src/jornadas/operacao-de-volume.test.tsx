// Jornada da persona 3 (docs/personas.md): Juliana, coordenadora de pré-vendas
// de uma escola de cursos técnicos, com base de milhares de contatos antigos e
// três turnos de operação. O que ela precisa antes de confiar: ver o que entra
// antes de gravar, parar tudo num clique quando a lista está errada, e poder
// zerar o piloto sem pedir a ninguém.
//
// Campanha e cadência ainda não existem nesta versão (F7 e F6, em outras
// frentes): a jornada prova que a barra lateral as anuncia sem link, para
// quem apresenta não prometer o que não está lá. O WhatsApp em modo de teste
// está em testes/jornadas/whatsapp-em-modo-de-teste.test.ts.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PALAVRA_DE_CONFIRMACAO } from '@reset/respostas.ts'
import { gerarPlanilhaDeLeads } from '@importacao/planilha-de-exemplo.ts'

import { discador as copyDoDiscador, freio as copyDoFreio } from '@/copy/chamadas'
import { conta as copyDaConta } from '@/copy/conta'
import { importacaoDeLeads as copyDaImportacao } from '@/copy/leads-importar'
import { navegacao } from '@/copy/navegacao'
import { escreverCsv, TETO_DE_LINHAS } from '@/leads/planilha'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import { criarServicoDeChamadasDublado } from '@/testes/servico-de-chamadas-dublado'
import { criarServicoDaContaDublado } from '@/testes/servico-da-conta-dublado'
import { criarServicoDeEquipeDublado, equipeDeExemplo } from '@/testes/servico-de-equipe-dublado'
import { criarServicoDeLeadsDublado } from '@/testes/servico-de-leads-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'juliana@horizonte.edu.br' }

afterEach(cleanup)

function equipe(papel: 'owner' | 'admin' = 'owner') {
  return criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: equipeDeExemplo(papel) } })
}

/** A base de reativação: mil contatos, 30 telefones quebrados, 50 repetidos. */
function baseDeReativacao(): string {
  const { planilha } = gerarPlanilhaDeLeads({})
  return escreverCsv(
    planilha.colunas,
    planilha.linhas.map((linha) => planilha.colunas.map((coluna) => linha.celulas[coluna] ?? '')),
  )
}

describe('Juliana: a base antiga entra sem surpresa', () => {
  it('mil linhas mostram na prévia o que entra, o que está quebrado e o que repete, e nada grava antes de confirmar', async () => {
    const leads = criarServicoDeLeadsDublado({ leads: [] })
    await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/leads/importar',
      equipe(),
      undefined,
      undefined,
      undefined,
      leads,
    )
    const campo = (await screen.findByLabelText(copyDaImportacao.arquivo.campo)) as HTMLInputElement
    await waitFor(() => expect(campo.disabled).toBe(false))
    // O Excel entra direto, e o teto aparece antes de ela escolher o arquivo (D-08).
    expect(screen.getByText(copyDaImportacao.arquivo.formatos(TETO_DE_LINHAS))).toBeDefined()

    fireEvent.change(campo, {
      target: { files: [new File([baseDeReativacao()], 'reativacao-2025.csv', { type: 'text/csv' })] },
    })
    await screen.findByText('reativacao-2025.csv')
    fireEvent.click(screen.getByRole('button', { name: copyDaImportacao.arquivo.seguir }))
    fireEvent.click(screen.getByRole('button', { name: copyDaImportacao.mapeamento.seguir }))

    const numeroDo = (grupo: string) =>
      within(screen.getByRole('region', { name: grupo })).getByText(/^\d+$/).textContent
    await screen.findByRole('region', { name: copyDaImportacao.previa.validos })
    expect(numeroDo(copyDaImportacao.previa.validos)).toBe('920')
    expect(numeroDo(copyDaImportacao.previa.invalidos)).toBe('30')
    expect(numeroDo(copyDaImportacao.previa.duplicados)).toBe('50')
    expect(screen.getByText(copyDaImportacao.previa.semGravar)).toBeDefined()
    expect(leads.importacoes).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: copyDaImportacao.previa.confirmar }))
    await screen.findByText(copyDaImportacao.relatorio.titulo)
    expect(leads.importacoes).toHaveLength(1)
    const resumo = screen.getByRole('status')
    expect(resumo.textContent).toContain(`${copyDaImportacao.relatorio.criados} 920`)
    expect(resumo.textContent).toContain(`${copyDaImportacao.relatorio.erros} 30`)
  })
})

describe('Juliana: a lista estava errada', () => {
  it('puxa o freio com o motivo, o discador do painel recusa sem chamar o servidor, e retomar pede outro motivo', async () => {
    const chamadas = criarServicoDeChamadasDublado()
    const { roteador } = await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/leads',
      equipe('admin'),
      undefined, undefined, undefined, undefined, undefined, undefined,
      chamadas,
    )

    fireEvent.click(await screen.findByRole('button', { name: copyDoFreio.acionar }))
    const dialogo = within(screen.getByRole('dialog'))
    fireEvent.change(dialogo.getByLabelText(copyDoFreio.confirmar.motivo), {
      target: { value: 'Importei a base de ex-alunos no lugar da de interessados' },
    })
    fireEvent.click(dialogo.getByRole('button', { name: copyDoFreio.confirmar.acao }))
    await waitFor(() => expect(chamadas.paradas).toEqual(['Importei a base de ex-alunos no lugar da de interessados']))
    const aviso = await screen.findByRole('status', { name: copyDoFreio.pausada.rotulo })
    expect(aviso.textContent).toContain('ex-alunos')

    // No painel, o discador recusa antes de pedir a ligação.
    await roteador.navigate({ to: '/' })
    fireEvent.click(await screen.findByRole('button', { name: copyDoDiscador.discar }))
    expect(await screen.findByText(copyDoDiscador.bloqueio.freio_puxado.mensagem)).toBeDefined()
    expect(chamadas.pedidos).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: copyDoFreio.pausada.retomar }))
    const retomada = within(screen.getByRole('dialog'))
    fireEvent.change(retomada.getByLabelText(copyDoFreio.confirmarRetomada.motivo), {
      target: { value: 'Base certa importada' },
    })
    fireEvent.click(retomada.getByRole('button', { name: copyDoFreio.confirmarRetomada.acao }))
    await waitFor(() => expect(chamadas.retomadas).toEqual(['Base certa importada']))
    expect(await screen.findByRole('button', { name: copyDoFreio.acionar })).toBeDefined()
  })
})

describe('Juliana: o que ainda não existe não é prometido', () => {
  it('campanhas e cadências aparecem na barra lateral sem link, como "em breve"', async () => {
    await montarAplicacao(criarServicoDublado({ sessao: SESSAO }), '/leads', equipe())
    await screen.findByRole('heading', { level: 1 })

    const maquina = navegacao.trilhas.find((trilha) => trilha.sigla === 'MÁQUINA')
    for (const rotulo of ['Campanhas', 'Cadências']) {
      expect(maquina?.itens.find((item) => item.rotulo === rotulo)?.disponivel).toBe(false)
      expect(screen.queryByRole('link', { name: new RegExp(`^${rotulo}`) })).toBeNull()
      expect(screen.getByText(rotulo)).toBeDefined()
    }
  })
})

describe('Juliana: o piloto acabou', () => {
  it('a dona zera o ambiente com a palavra exata e volta à tela de entrada', async () => {
    const conta = criarServicoDaContaDublado()
    const { roteador } = await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/config/conta',
      equipe('owner'),
      undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined, undefined,
      conta,
    )
    const zona = within(await screen.findByRole('region', { name: copyDaConta.zerar.rotulo }))
    for (const item of copyDaConta.zerar.itensQueSaem) expect(zona.getByText(item)).toBeDefined()

    fireEvent.change(zona.getByLabelText(copyDaConta.zerar.confirmacao.rotulo), {
      target: { value: PALAVRA_DE_CONFIRMACAO },
    })
    fireEvent.click(zona.getByRole('button', { name: copyDaConta.zerar.acao }))
    fireEvent.click(
      within(screen.getByRole('dialog', { name: copyDaConta.zerar.dialogo.titulo })).getByRole('button', {
        name: copyDaConta.zerar.dialogo.confirmar,
      }),
    )

    await waitFor(() => expect(roteador.state.location.pathname).toBe('/entrar'))
    expect(conta.zerados()).toBe(1)
  })
})
