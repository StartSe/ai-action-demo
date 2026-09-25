// /config/conta: zerar o ambiente pela zona de perigo. O dublê da conta passa
// o pedido por `atenderReset`, o código da borda, então as travas que a tela
// mostra são as do sistema.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { MENSAGENS, PALAVRA_DE_CONFIRMACAO } from '@reset/respostas.ts'

import { conta as copy } from '@/copy/conta'
import type { Papel } from '@/equipe/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDaContaDublado,
  type RespostasDaConta,
} from '@/testes/servico-da-conta-dublado'
import { criarServicoDeEquipeDublado, equipeDeExemplo } from '@/testes/servico-de-equipe-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

afterEach(cleanup)

async function abrir(papel: Papel, respostas: RespostasDaConta = {}) {
  const conta = criarServicoDaContaDublado(respostas)
  const { roteador } = await montarAplicacao(
    criarServicoDublado({ sessao: { usuarioId: 'u-1', email: 'dona@aurora.com.br' } }),
    '/config/conta',
    criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: equipeDeExemplo(papel) } }),
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
  const zona = within(await screen.findByRole('region', { name: copy.zerar.rotulo }))
  return { conta, roteador, zona }
}

it('o dono vê o que sai e o que fica, e o botão só liga com a palavra exata', async () => {
  const { zona } = await abrir('owner')

  for (const item of copy.zerar.itensQueSaem) expect(zona.getByText(item)).toBeDefined()
  for (const item of copy.zerar.itensQueFicam) expect(zona.getByText(item)).toBeDefined()

  const botao = zona.getByRole('button', { name: copy.zerar.acao }) as HTMLButtonElement
  expect(botao.disabled).toBe(true)
  const campo = zona.getByLabelText(copy.zerar.confirmacao.rotulo)
  fireEvent.change(campo, { target: { value: 'zerar' } })
  expect(botao.disabled).toBe(true)
  fireEvent.change(campo, { target: { value: PALAVRA_DE_CONFIRMACAO } })
  expect(botao.disabled).toBe(false)
})

it('zerar pergunta antes, e confirmado apaga, sai da sessão e vai para a entrada', async () => {
  const { conta, roteador, zona } = await abrir('owner')

  fireEvent.change(zona.getByLabelText(copy.zerar.confirmacao.rotulo), {
    target: { value: PALAVRA_DE_CONFIRMACAO },
  })
  fireEvent.click(zona.getByRole('button', { name: copy.zerar.acao }))

  const dialogo = within(screen.getByRole('dialog', { name: copy.zerar.dialogo.titulo }))
  expect(conta.zerados()).toBe(0)
  fireEvent.click(dialogo.getByRole('button', { name: copy.zerar.dialogo.confirmar }))

  await waitFor(() => expect(roteador.state.location.pathname).toBe('/entrar'))
  expect(conta.pedidosDeReset).toEqual([PALAVRA_DE_CONFIRMACAO])
  expect(conta.zerados()).toBe(1)
})

it('cancelar o diálogo não apaga nada', async () => {
  const { conta, zona } = await abrir('owner')
  fireEvent.change(zona.getByLabelText(copy.zerar.confirmacao.rotulo), {
    target: { value: PALAVRA_DE_CONFIRMACAO },
  })
  fireEvent.click(zona.getByRole('button', { name: copy.zerar.acao }))
  fireEvent.click(
    within(screen.getByRole('dialog', { name: copy.zerar.dialogo.titulo })).getByRole('button', {
      name: copy.zerar.dialogo.cancelar,
    }),
  )

  expect(screen.queryByRole('dialog', { name: copy.zerar.dialogo.titulo })).toBeNull()
  expect(conta.pedidosDeReset).toEqual([])
})

it('admin não vê o botão: só o dono zera', async () => {
  const { zona } = await abrir('admin')
  expect(zona.getByRole('alert').textContent).toBe(copy.zerar.soODono)
  expect(zona.queryByRole('button', { name: copy.zerar.acao })).toBeNull()
})

it('instalação com o reset desligado mostra a recusa da borda, e nada é apagado', async () => {
  const { conta, zona } = await abrir('owner', { permissao: 'nao' })
  fireEvent.change(zona.getByLabelText(copy.zerar.confirmacao.rotulo), {
    target: { value: PALAVRA_DE_CONFIRMACAO },
  })
  fireEvent.click(zona.getByRole('button', { name: copy.zerar.acao }))
  fireEvent.click(
    within(screen.getByRole('dialog', { name: copy.zerar.dialogo.titulo })).getByRole('button', {
      name: copy.zerar.dialogo.confirmar,
    }),
  )

  expect(await zona.findByText(MENSAGENS.desligado)).toBeDefined()
  expect(conta.zerados()).toBe(0)
})

it('sem a variável, numa instalação de uma conta só, o dono zera (D-12)', async () => {
  const { conta, zona } = await abrir('owner', { permissao: 'sem_variavel', contasDaInstalacao: 1 })
  fireEvent.change(zona.getByLabelText(copy.zerar.confirmacao.rotulo), {
    target: { value: PALAVRA_DE_CONFIRMACAO },
  })
  fireEvent.click(zona.getByRole('button', { name: copy.zerar.acao }))
  fireEvent.click(
    within(screen.getByRole('dialog', { name: copy.zerar.dialogo.titulo })).getByRole('button', {
      name: copy.zerar.dialogo.confirmar,
    }),
  )

  await waitFor(() => expect(conta.zerados()).toBe(1))
})

it('sem a variável, com mais de uma conta, a recusa diz onde ligar (D-12)', async () => {
  const { conta, zona } = await abrir('owner', { permissao: 'sem_variavel', contasDaInstalacao: 2 })
  fireEvent.change(zona.getByLabelText(copy.zerar.confirmacao.rotulo), {
    target: { value: PALAVRA_DE_CONFIRMACAO },
  })
  fireEvent.click(zona.getByRole('button', { name: copy.zerar.acao }))
  fireEvent.click(
    within(screen.getByRole('dialog', { name: copy.zerar.dialogo.titulo })).getByRole('button', {
      name: copy.zerar.dialogo.confirmar,
    }),
  )

  expect(await zona.findByText(MENSAGENS.varias_contas)).toBeDefined()
  expect(conta.zerados()).toBe(0)
})
