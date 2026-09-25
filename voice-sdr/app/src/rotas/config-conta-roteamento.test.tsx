// /config/conta: o modo de roteamento do especialista. O dublê da conta
// implementa as duas linhas do banco à parte da tela (o check do destino e o
// gatilho de especialista inativo), e é assim que a recusa do banco chega aqui
// sem passar pela validação da tela.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import type { ModoDeRoteamento } from '@/conta/tipos'
import { conta as copy } from '@/copy/conta'
import type { Equipe, Papel } from '@/equipe/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDaContaDublado,
  type RespostasDaConta,
} from '@/testes/servico-da-conta-dublado'
import { criarServicoDeEquipeDublado, equipeDeExemplo } from '@/testes/servico-de-equipe-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

afterEach(cleanup)

const texto = copy.roteamento

function equipeCom(papel: Papel): Equipe {
  const equipe = equipeDeExemplo(papel)
  return {
    ...equipe,
    membros: [
      ...equipe.membros,
      {
        usuarioId: 'u-9',
        nome: 'Helena Prado',
        email: 'helena@aurora.com.br',
        papel: 'admin',
        ultimoAcesso: null,
      },
    ],
  }
}

async function abrir(papel: Papel, respostas: RespostasDaConta = {}) {
  const conta = criarServicoDaContaDublado({ papel, ...respostas })
  await montarAplicacao(
    criarServicoDublado({ sessao: { usuarioId: 'u-1', email: 'renata@aurora.com.br' } }),
    '/config/conta',
    criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: equipeCom(papel) } }),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    conta,
  )
  const painel = within(await screen.findByRole('region', { name: texto.rotulo }))
  return { conta, painel }
}

function radio(painel: ReturnType<typeof within>, modo: ModoDeRoteamento) {
  return painel.getByLabelText(texto.modos[modo].rotulo) as HTMLInputElement
}

function botaoSalvar(painel: ReturnType<typeof within>) {
  return painel.getByRole('button', { name: texto.salvar }) as HTMLButtonElement
}

it('os três modos, cada um com a frase do que faz com as reuniões', async () => {
  const { painel } = await abrir('admin')
  await painel.findByLabelText(texto.modos.area.rotulo)

  for (const modo of ['area', 'round_robin', 'fixed'] as const) {
    const opcao = radio(painel, modo)
    const descricao = document.getElementById(opcao.getAttribute('aria-describedby') ?? '')
    expect(descricao?.textContent).toBe(texto.modos[modo].efeito)
  }
  expect(radio(painel, 'area').checked).toBe(true)
  expect(painel.getByText(texto.alcance)).toBeDefined()
  expect(botaoSalvar(painel).disabled).toBe(true)
})

it('trocar para rodízio grava, entra na trilha e diz que vale para as próximas ligações', async () => {
  const { conta, painel } = await abrir('admin')
  fireEvent.click(await painel.findByLabelText(texto.modos.round_robin.rotulo))
  fireEvent.click(botaoSalvar(painel))

  expect((await painel.findByRole('status')).textContent).toBe(texto.salvo)
  expect(conta.pedidosDeRoteamento).toEqual([{ modo: 'round_robin', especialistaFixoId: null }])
  expect(conta.trilhaDoRoteamento).toEqual([
    {
      antes: { modo: 'area', especialistaFixoId: null },
      depois: { modo: 'round_robin', especialistaFixoId: null },
    },
  ])
  await waitFor(() => expect(botaoSalvar(painel).disabled).toBe(true))
})

it('o modo fixo só lista os ativos, e grava o escolhido', async () => {
  const { conta, painel } = await abrir('admin')
  fireEvent.click(await painel.findByLabelText(texto.modos.fixed.rotulo))

  const campo = painel.getByLabelText(texto.especialista) as HTMLSelectElement
  const opcoes = [...campo.options].map((opcao) => opcao.value)
  expect(opcoes).toEqual(['', 'esp-ana', 'esp-bruno', 'esp-carla'])
  expect(painel.queryByText(/Davi Lopes/)).toBeNull()

  fireEvent.change(campo, { target: { value: 'esp-bruno' } })
  fireEvent.click(botaoSalvar(painel))

  expect((await painel.findByRole('status')).textContent).toBe(texto.salvo)
  expect(conta.pedidosDeRoteamento).toEqual([{ modo: 'fixed', especialistaFixoId: 'esp-bruno' }])
})

it('fixo sem especialista é recusado na tela, sem pedido ao banco', async () => {
  const { conta, painel } = await abrir('admin')
  fireEvent.click(await painel.findByLabelText(texto.modos.fixed.rotulo))
  fireEvent.click(botaoSalvar(painel))

  expect(painel.getByRole('alert').textContent).toBe(texto.falhas['fixo-sem-especialista'])
  expect(conta.pedidosDeRoteamento).toEqual([])
  expect(conta.trilhaDoRoteamento).toEqual([])
})

it('a recusa do banco vira frase: o especialista foi desativado depois de a tela abrir', async () => {
  const { conta, painel } = await abrir('admin')
  fireEvent.click(await painel.findByLabelText(texto.modos.fixed.rotulo))
  fireEvent.change(painel.getByLabelText(texto.especialista), { target: { value: 'esp-ana' } })

  // Outra pessoa desativa a Ana enquanto esta tela está aberta.
  conta.especialistas.find((item) => item.id === 'esp-ana')!.ativo = false
  fireEvent.click(botaoSalvar(painel))

  expect((await painel.findByRole('alert')).textContent).toBe(texto.falhas['especialista-inativo'])
  expect(conta.pedidosDeRoteamento).toEqual([{ modo: 'fixed', especialistaFixoId: 'esp-ana' }])
  expect(conta.trilhaDoRoteamento).toEqual([])
  expect(painel.queryByRole('status')).toBeNull()
})

it('destino fixo que ficou inativo aparece como inativo, e sair dele para outro modo passa', async () => {
  const { conta, painel } = await abrir('admin', {
    roteamento: { modo: 'fixed', especialistaFixoId: 'esp-davi' },
  })
  const campo = (await painel.findByLabelText(texto.especialista)) as HTMLSelectElement
  expect(campo.value).toBe('esp-davi')
  expect(campo.selectedOptions[0]?.textContent).toBe(texto.inativo('Davi Lopes'))

  fireEvent.click(radio(painel, 'area'))
  fireEvent.click(botaoSalvar(painel))
  expect((await painel.findByRole('status')).textContent).toBe(texto.salvo)
  expect(conta.pedidosDeRoteamento).toEqual([{ modo: 'area', especialistaFixoId: null }])
})

it('sem nenhum especialista ativo, o modo fixo diz onde cadastrar', async () => {
  const { painel } = await abrir('admin', {
    especialistas: [{ id: 'esp-davi', nome: 'Davi Lopes', area: null, ativo: false }],
  })
  fireEvent.click(await painel.findByLabelText(texto.modos.fixed.rotulo))
  expect(painel.getByText(texto.semAtivos)).toBeDefined()
  expect(painel.queryByLabelText(texto.especialista)).toBeNull()
})

it('o operador vê o modo em leitura e a quem pedir acesso', async () => {
  const { conta, painel } = await abrir('operator', {
    roteamento: { modo: 'round_robin', especialistaFixoId: null },
  })
  await painel.findByLabelText(texto.modos.area.rotulo)

  const aviso = painel.getByRole('alert')
  expect(within(aviso).getByText(texto.leitura.aviso)).toBeDefined()
  const pedir = within(aviso).getByRole('list', { name: texto.leitura.pedirAcesso })
  expect(within(pedir).getByText('Helena Prado')).toBeDefined()
  expect(within(pedir).queryByText('Renata Alves')).toBeNull()

  expect(radio(painel, 'round_robin').checked).toBe(true)
  for (const modo of ['area', 'round_robin', 'fixed'] as const) {
    expect(radio(painel, modo).matches(':disabled')).toBe(true)
  }
  expect(painel.queryByRole('button', { name: texto.salvar })).toBeNull()
  expect(conta.pedidosDeRoteamento).toEqual([])
})

it('falha ao carregar vira frase', async () => {
  const { painel } = await abrir('admin', { falhaNaCarga: 'falha-de-comunicacao' })
  expect((await painel.findByRole('alert')).textContent).toBe(texto.falhas['falha-de-comunicacao'])
})

it('conta sem linha de configuração mostra o estado vazio', async () => {
  const { painel } = await abrir('admin', { roteamento: null })
  expect(await painel.findByText(texto.vazio.titulo)).toBeDefined()
  expect(painel.queryByRole('button', { name: texto.salvar })).toBeNull()
})

it('enquanto carrega, diz que está carregando', async () => {
  const { painel } = await abrir('admin', { cargaPendente: true })
  expect(painel.getByText(texto.carregando)).toBeDefined()
  expect(painel.queryByLabelText(texto.modos.area.rotulo)).toBeNull()
})

it('no modo por área, lista as áreas dos ativos, uma por grafia (D-16)', async () => {
  const { painel } = await abrir('admin')
  await painel.findByLabelText(texto.modos.area.rotulo)

  // Ana e Davi são Frota, mas Davi está inativo; Carla não tem área.
  const lista = painel.getByRole('list', { name: texto.areas.titulo })
  expect(within(lista).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Frota',
    'Seguros',
  ])
  expect(painel.getByText(texto.areas.apoio)).toBeDefined()

  // Fora do modo por área, a lista não é dele.
  fireEvent.click(radio(painel, 'round_robin'))
  expect(painel.queryByRole('list', { name: texto.areas.titulo })).toBeNull()
})

it('sem área cadastrada, o modo por área diz que ninguém recebe reunião (D-16)', async () => {
  const { painel } = await abrir('admin', {
    especialistas: [{ id: 'esp-carla', nome: 'Carla Menezes', area: null, ativo: true }],
  })
  expect(await painel.findByText(texto.areas.nenhuma)).toBeDefined()
})
