// /config/conta: o canal de WhatsApp (RF do canal). A tela grava
// `account_settings` e não decide nada sobre a conversa; o que se cobra aqui é
// o que ela manda ao serviço, o padrão vazio e a negativa de quem não
// administra — o mesmo desenho de `config-conta-limiares.test.tsx`.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { configConta } from '@/copy/config-conta'
import { discagem } from '@/copy/discagem'
import type { Equipe, Papel } from '@/equipe/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import { criarServicoDeEquipeDublado, equipeDeExemplo } from '@/testes/servico-de-equipe-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'
import { criarServicoDeWhatsappDublado, type RespostasDoWhatsapp } from '@/testes/servico-de-whatsapp-dublado'

const copy = configConta.whatsapp

afterEach(cleanup)

function equipeCom(papel: Papel): Equipe {
  const equipe = equipeDeExemplo(papel)
  return {
    ...equipe,
    membros: [
      ...equipe.membros,
      { usuarioId: 'u-3', nome: 'Lia Prado', email: 'lia@aurora.com.br', papel: 'admin', ultimoAcesso: null },
    ],
  }
}

async function abrir(papel: Papel, respostas: RespostasDoWhatsapp = {}) {
  const whatsapp = criarServicoDeWhatsappDublado(respostas)
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
    undefined,
    undefined,
    undefined,
    undefined,
    whatsapp,
  )
  const secao = within(await screen.findByRole('region', { name: copy.rotulo }))
  await waitFor(() => expect(secao.queryByText(copy.carregando)).toBeNull())
  return { whatsapp, secao }
}

/** A caixa de marcar de um campo, pelo texto do título dentro do rótulo. */
function caixa(secao: ReturnType<typeof within>, rotuloDoCampo: string): HTMLInputElement {
  const input = secao.getByText(rotuloDoCampo).closest('label')?.querySelector('input')
  if (!(input instanceof HTMLInputElement)) throw new Error(`caixa não encontrada: ${rotuloDoCampo}`)
  return input
}

describe('canal de WhatsApp em /config/conta', () => {
  it('admin liga o canal, o pré-contato e grava os quatro campos juntos', async () => {
    const { whatsapp, secao } = await abrir('admin', {
      canal: { habilitado: false, modo: 'teste', preContato: false, textoDoPreContato: null },
    })

    expect((secao.getByRole('button', { name: copy.salvar }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(caixa(secao, copy.campos.habilitado.rotulo))
    fireEvent.click(caixa(secao, copy.campos.preContato.rotulo))
    fireEvent.change(secao.getByLabelText(copy.textoDoPreContato.rotulo), {
      target: { value: 'Aqui é a assistente da Aurora, vou te ligar em instantes.' },
    })
    fireEvent.click(secao.getByRole('button', { name: copy.salvar }))

    await waitFor(() =>
      expect(whatsapp.carregarCanal()).resolves.toEqual({
        ok: true,
        canal: {
          habilitado: true,
          modo: 'teste',
          preContato: true,
          textoDoPreContato: 'Aqui é a assistente da Aurora, vou te ligar em instantes.',
        },
      }),
    )
    expect(await secao.findByText(copy.salvo)).toBeDefined()
  })

  it('no modo de teste mostra a lista de números de teste, e passar para todos pede confirmação', async () => {
    const { whatsapp, secao } = await abrir('admin', {
      canal: { habilitado: true, modo: 'teste', preContato: false, textoDoPreContato: null },
    })

    const teste = secao.getByRole('radio', { name: new RegExp(copy.modo.opcoes.teste.rotulo.replace(/[()]/g, '.')) })
    const todos = secao.getByRole('radio', { name: new RegExp(copy.modo.opcoes.todos.rotulo) })
    expect((teste as HTMLInputElement).checked).toBe(true)
    expect(secao.getByText(copy.modo.ondeCadastrar)).toBeDefined()
    expect(secao.getByRole('heading', { name: discagem.numerosDeTeste.titulo })).toBeDefined()

    // Cancelar mantém o teste.
    fireEvent.click(todos)
    const dialogo = within(screen.getByRole('dialog', { name: copy.modo.confirmacao.titulo }))
    expect(dialogo.getByText(copy.modo.confirmacao.explicacao)).toBeDefined()
    fireEvent.click(dialogo.getByRole('button', { name: copy.modo.confirmacao.cancelar }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect((teste as HTMLInputElement).checked).toBe(true)
    expect((secao.getByRole('button', { name: copy.salvar }) as HTMLButtonElement).disabled).toBe(true)

    // Confirmar passa para todos, a lista some, e salvar grava o modo.
    fireEvent.click(todos)
    fireEvent.click(screen.getByRole('button', { name: copy.modo.confirmacao.confirmar }))
    expect((todos as HTMLInputElement).checked).toBe(true)
    expect(secao.queryByRole('heading', { name: discagem.numerosDeTeste.titulo })).toBeNull()
    fireEvent.click(secao.getByRole('button', { name: copy.salvar }))

    await waitFor(() =>
      expect(whatsapp.carregarCanal()).resolves.toMatchObject({ ok: true, canal: { modo: 'todos' } }),
    )

    // Voltar ao teste não pede confirmação.
    fireEvent.click(teste)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect((teste as HTMLInputElement).checked).toBe(true)
  })

  it('texto do pré-contato em branco vira nulo, e some do formulário quando o pré-contato desliga', async () => {
    const { secao } = await abrir('admin', {
      canal: { habilitado: true, modo: 'teste', preContato: true, textoDoPreContato: 'Texto gravado' },
    })

    expect(secao.getByLabelText(copy.textoDoPreContato.rotulo)).toBeDefined()
    fireEvent.click(caixa(secao, copy.campos.preContato.rotulo))

    expect(secao.queryByLabelText(copy.textoDoPreContato.rotulo)).toBeNull()
  })

  it('sem mudança não há o que salvar', async () => {
    const { secao } = await abrir('owner', {
      canal: { habilitado: true, modo: 'teste', preContato: false, textoDoPreContato: null },
    })
    expect((secao.getByRole('button', { name: copy.salvar }) as HTMLButtonElement).disabled).toBe(true)
    expect(secao.getByText(copy.semMudanca)).toBeDefined()
  })

  it('a conta ainda sem linha de configuração mostra o vazio, sem formulário', async () => {
    const { secao } = await abrir('admin', { canal: null })
    expect(await secao.findByText(copy.vazio.titulo)).toBeDefined()
    expect(secao.queryByRole('button', { name: copy.salvar })).toBeNull()
  })

  it.each<Papel>(['operator', 'viewer'])('%s vê o que está ligado, sem campo, com a negativa e quem concede', async (papel) => {
    const { secao } = await abrir(papel, {
      canal: { habilitado: true, modo: 'teste', preContato: false, textoDoPreContato: null },
    })

    const negativa = secao.getByRole('alert')
    expect(within(negativa).getByText(copy.negativa)).toBeDefined()
    expect(within(negativa).getByText('Lia Prado')).toBeDefined()
    expect(secao.queryAllByRole('checkbox')).toEqual([])
    expect(secao.queryAllByRole('radio')).toEqual([])
    expect(secao.getByText(copy.modo.emLeitura.teste)).toBeDefined()
    expect(secao.queryByRole('button', { name: copy.salvar })).toBeNull()
  })
})
