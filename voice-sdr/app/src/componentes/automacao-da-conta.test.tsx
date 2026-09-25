// A seção de automação de /config/discagem (US-190): os quatro estados, a
// gravação só do que mudou com o motivo, a recusa do que o check recusaria, e a
// negativa do operador, que nem chega a ver a seção.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AutomacaoDaConta } from '@/componentes/automacao-da-conta'
import { automacao as copy } from '@/copy/automacao'
import { discagem as copyDaDiscagem } from '@/copy/discagem'
import type { Papel } from '@/equipe/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeAutomacaoDublado,
  type RespostasDeAutomacao,
} from '@/testes/servico-de-automacao-dublado'
import { criarServicoDeDiscagemDublado } from '@/testes/servico-de-discagem-dublado'
import { criarServicoDeEquipeDublado, equipeDeExemplo } from '@/testes/servico-de-equipe-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

afterEach(cleanup)

function montar(respostas: RespostasDeAutomacao = {}) {
  const servico = criarServicoDeAutomacaoDublado(respostas)
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={cliente}>
      <AutomacaoDaConta servico={servico} />
    </QueryClientProvider>,
  )
  return servico
}

function campo(rotulo: string): HTMLInputElement {
  return screen.getByRole('textbox', { name: rotulo }) as HTMLInputElement
}

describe('os quatro estados', () => {
  it('carregando', () => {
    montar({ carregar: () => new Promise(() => undefined) })
    expect(screen.getByText(copy.carregando)).toBeTruthy()
  })

  it('com erro', async () => {
    montar({ carregar: { ok: false, motivo: 'falha-de-comunicacao' } })
    expect(await screen.findByText(copy.falhas['falha-de-comunicacao'])).toBeTruthy()
  })

  it('vazio', async () => {
    montar({ carregar: { ok: true, automacao: null } })
    expect(await screen.findByText(copy.vazio.titulo)).toBeTruthy()
  })

  it('com dado: os padrões da conta, cada campo com a consequência escrita', async () => {
    montar()
    expect((await screen.findByRole('textbox', { name: copy.campos.lembreteFimMinutos.rotulo }) as HTMLInputElement).value).toBe('20')
    expect(campo(copy.campos.lembreteInicioMinutos.rotulo).value).toBe('5')
    expect(campo(copy.campos.retentativaRecuosMinutos.rotulo).value).toBe('60, 180, 1440')
    expect(campo(copy.campos.resgateTeto.rotulo).value).toBe('2')
    expect((screen.getByLabelText(copy.campos.turnos.rotulo) as HTMLTextAreaElement).value).toBe(
      'manha 09:00-12:00\ntarde 12:00-15:00\nfim_de_tarde 15:00-18:00',
    )
    for (const { consequencia } of Object.values(copy.campos)) expect(screen.getByText(consequencia)).toBeTruthy()
  })
})

describe('a gravação', () => {
  it('manda só o que mudou, com o motivo, e confirma', async () => {
    const servico = montar()
    fireEvent.change(await screen.findByRole('textbox', { name: copy.campos.lembreteFimMinutos.rotulo }), {
      target: { value: '30' },
    })
    fireEvent.change(campo(copy.campos.resgateTeto.rotulo), { target: { value: '0' } })
    fireEvent.change(campo(copy.motivo.rotulo), { target: { value: 'o time prefere meia hora' } })
    fireEvent.click(screen.getByRole('button', { name: copy.salvar }))
    expect(await screen.findByRole('status')).toBeTruthy()
    expect(servico.gravacoes).toEqual([
      { mudancas: { lembreteFimMinutos: 30, resgateTeto: 0 }, motivo: 'o time prefere meia hora' },
    ])
  })

  it('sem motivo não grava, e nada mudou não grava', async () => {
    const servico = montar()
    fireEvent.click(await screen.findByRole('button', { name: copy.salvar }))
    expect(await screen.findByText(copy.nadaMudou)).toBeTruthy()
    fireEvent.change(campo(copy.campos.retentativaTeto.rotulo), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: copy.salvar }))
    expect(await screen.findByText(copy.motivo.faltando)).toBeTruthy()
    expect(servico.gravacoes).toEqual([])
  })

  it('recusa na tela o que o check recusaria: janela negativa, invertida, teto negativo e turno torto', async () => {
    const servico = montar()
    fireEvent.change(await screen.findByRole('textbox', { name: copy.campos.lembreteInicioMinutos.rotulo }), {
      target: { value: '-1' },
    })
    fireEvent.change(campo(copy.campos.resgateTeto.rotulo), { target: { value: '-2' } })
    fireEvent.change(screen.getByLabelText(copy.campos.turnos.rotulo), {
      target: { value: 'manha 09:00-12:00\ntarde 11:00-15:00' },
    })
    fireEvent.change(campo(copy.motivo.rotulo), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: copy.salvar }))
    expect(await screen.findByText(copy.camposComErro)).toBeTruthy()
    expect(screen.getByText(copy.errosDoCampo.formato)).toBeTruthy()
    expect(screen.getAllByText(/Valor fora da faixa aceita/)).toHaveLength(2)

    fireEvent.change(campo(copy.campos.lembreteInicioMinutos.rotulo), { target: { value: '25' } })
    fireEvent.change(campo(copy.campos.resgateTeto.rotulo), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(copy.campos.turnos.rotulo), { target: { value: 'dia 09:00-18:00' } })
    fireEvent.click(screen.getByRole('button', { name: copy.salvar }))
    expect(await screen.findByText(copy.errosDoCampo['janela-invertida'])).toBeTruthy()
    expect(servico.gravacoes).toEqual([])
  })

  it('a recusa do servidor vira a frase do motivo', async () => {
    montar({ salvar: { ok: false, motivo: 'sem-permissao' } })
    fireEvent.change(await screen.findByRole('textbox', { name: copy.campos.retentativaTeto.rotulo }), {
      target: { value: '5' },
    })
    fireEvent.change(campo(copy.motivo.rotulo), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: copy.salvar }))
    expect(await screen.findByText(copy.falhas['sem-permissao'])).toBeTruthy()
  })
})

describe('em /config/discagem', () => {
  async function abrir(papel: Papel) {
    const discagem = criarServicoDeDiscagemDublado({ automacao: criarServicoDeAutomacaoDublado() })
    const equipe = criarServicoDeEquipeDublado({
      carregar: {
        ok: true,
        equipe: {
          ...equipeDeExemplo(),
          papelDoUsuario: papel,
          membros: [
            { usuarioId: 'u-1', nome: 'Renata Alves', email: 'renata@aurora.com.br', papel, ultimoAcesso: null },
            { usuarioId: 'u-9', nome: 'Selma Dias', email: 'selma@aurora.com.br', papel: 'owner', ultimoAcesso: null },
          ],
        },
      },
    })
    await montarAplicacao(
      criarServicoDublado({ sessao: { usuarioId: 'u-1', email: 'renata@aurora.com.br' } }),
      '/config/discagem',
      equipe,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      discagem,
    )
  }

  it('quem administra vê a seção de automação', async () => {
    await abrir('admin')
    const secao = await screen.findByRole('region', { name: copy.titulo })
    await waitFor(() => expect(within(secao).getByRole('button', { name: copy.salvar })).toBeTruthy())
  })

  it('o operador recebe a negativa explícita e não vê a seção', async () => {
    await abrir('operator')
    expect(await screen.findByText(copyDaDiscagem.negativa.aviso)).toBeTruthy()
    expect(screen.queryByRole('region', { name: copy.titulo })).toBeNull()
  })
})
