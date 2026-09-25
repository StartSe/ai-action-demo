import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { detalhe as copy } from '@/copy/conversas'
import type { Papel } from '@/equipe/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import { criarServicoDeEquipeDublado, equipeDeExemplo } from '@/testes/servico-de-equipe-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'
import {
  conversaDeExemplo,
  criarServicoDeWhatsappDublado,
  mensagemDeExemplo,
  type RespostasDoWhatsapp,
} from '@/testes/servico-de-whatsapp-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

afterEach(cleanup)

function equipeCom(papel: Papel) {
  return criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: equipeDeExemplo(papel) } })
}

async function abrirConversa(
  conversaId: string,
  respostas: RespostasDoWhatsapp = {},
  papel: Papel = 'operator',
) {
  const whatsapp = criarServicoDeWhatsappDublado(respostas)
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    `/conversas/${conversaId}`,
    equipeCom(papel),
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
  return whatsapp
}

describe('tela da conversa', () => {
  it('mostra "não encontrada" para uma conversa que não existe nesta conta', async () => {
    await abrirConversa('w-inexistente')
    expect(await screen.findByText(copy.naoEncontrada.titulo)).toBeDefined()
  })

  it('desenha o histórico em balões e o status de quem está atendendo', async () => {
    const conversa = conversaDeExemplo({
      id: 'w-1',
      leadNome: 'Marcos Ferreira',
      status: 'assistente',
      mensagens: [
        mensagemDeExemplo({ id: 'm-1', direcao: 'in', autor: 'lead', corpo: 'Quero saber o preço.' }),
        mensagemDeExemplo({ id: 'm-2', direcao: 'out', autor: 'assistente', corpo: 'Claro, um instante.' }),
      ],
    })
    await abrirConversa('w-1', { conversas: [conversa] })

    expect(await screen.findByRole('heading', { name: 'Marcos Ferreira' })).toBeDefined()
    expect(screen.getByText('Quero saber o preço.')).toBeDefined()
    expect(screen.getByText('Claro, um instante.')).toBeDefined()
    expect(screen.getByText('Com a assistente')).toBeDefined()
  })

  it('áudio mostra a transcrição, e imagem a descrição e a legenda', async () => {
    const conversa = conversaDeExemplo({
      id: 'w-midia',
      mensagens: [
        mensagemDeExemplo({
          id: 'm-a',
          corpo: '',
          midia: 'audio',
          estadoDaLeitura: 'lida',
          leituraDaMidia: 'Queria saber o frete para Curitiba.',
        }),
        mensagemDeExemplo({
          id: 'm-i',
          corpo: 'Esse é o nosso galpão',
          midia: 'imagem',
          estadoDaLeitura: 'lida',
          leituraDaMidia: 'Um galpão com prateleiras de paletes.',
        }),
        mensagemDeExemplo({ id: 'm-p', corpo: '', midia: 'audio', estadoDaLeitura: 'pendente' }),
        mensagemDeExemplo({ id: 'm-f', corpo: '', midia: 'imagem', estadoDaLeitura: 'falhou' }),
        mensagemDeExemplo({ id: 'm-v', corpo: 'Olha o vídeo', midia: 'video' }),
      ],
    })
    await abrirConversa('w-midia', { conversas: [conversa] })

    const historico = within(await screen.findByRole('log', { name: copy.mensagens }))
    expect(historico.getByText(copy.midiaLida.audio)).toBeDefined()
    expect(historico.getByText('Queria saber o frete para Curitiba.')).toBeDefined()
    expect(historico.getByText(copy.midiaLida.imagem)).toBeDefined()
    expect(historico.getByText('Um galpão com prateleiras de paletes.')).toBeDefined()
    expect(historico.getByText(copy.legenda('Esse é o nosso galpão'))).toBeDefined()
    expect(historico.getByText(copy.leituraPendente.audio)).toBeDefined()
    expect(historico.getByText(copy.leituraFalhou.imagem)).toBeDefined()
    expect(historico.getByText(copy.legenda('Olha o vídeo'))).toBeDefined()
  })

  it('assumir muda o status e libera devolver e encerrar', async () => {
    const conversa = conversaDeExemplo({ id: 'w-2', status: 'assistente' })
    const whatsapp = await abrirConversa('w-2', { conversas: [conversa] })

    await screen.findByRole('heading', { name: copy.acoes.titulo })
    fireEvent.click(screen.getByRole('button', { name: copy.acoes.assumir }))

    await waitFor(() => expect(screen.getByText('Com um atendente')).toBeDefined())
    expect(whatsapp.acoes).toEqual([{ conversaId: 'w-2', acao: 'assumir', texto: undefined }])
    expect(screen.getByRole('button', { name: copy.acoes.devolver })).toBeDefined()
  })

  it('escrever uma mensagem chama agir com o texto e some do campo', async () => {
    const conversa = conversaDeExemplo({ id: 'w-3', status: 'humano', mensagens: [] })
    const whatsapp = await abrirConversa('w-3', { conversas: [conversa] })

    await screen.findByRole('heading', { name: copy.acoes.titulo })
    const campo = screen.getByLabelText(copy.campo.rotulo) as HTMLTextAreaElement
    fireEvent.change(campo, { target: { value: 'Já te retorno.' } })
    fireEvent.click(screen.getByRole('button', { name: copy.campo.enviar }))

    await waitFor(() => expect(whatsapp.acoes).toHaveLength(1))
    expect(whatsapp.acoes[0]).toEqual({ conversaId: 'w-3', acao: 'mensagem', texto: 'Já te retorno.' })
    await waitFor(() => expect((screen.getByLabelText(copy.campo.rotulo) as HTMLTextAreaElement).value).toBe(''))
  })

  it('encerrar pede confirmação antes de agir', async () => {
    const conversa = conversaDeExemplo({ id: 'w-4', status: 'humano' })
    const whatsapp = await abrirConversa('w-4', { conversas: [conversa] })

    await screen.findByRole('heading', { name: copy.acoes.titulo })
    fireEvent.click(screen.getByRole('button', { name: copy.acoes.encerrar }))

    const dialogo = within(await screen.findByRole('dialog'))
    expect(whatsapp.acoes).toEqual([])
    fireEvent.click(dialogo.getByRole('button', { name: copy.acoes.encerrar }))

    await waitFor(() => expect(whatsapp.acoes).toEqual([{ conversaId: 'w-4', acao: 'encerrar', texto: undefined }]))
  })

  it('quem só lê vê a negativa e não vê os botões de ação', async () => {
    const conversa = conversaDeExemplo({ id: 'w-5', status: 'assistente' })
    await abrirConversa('w-5', { conversas: [conversa] }, 'viewer')

    expect(await screen.findByText(copy.acoes.soLeitura)).toBeDefined()
    expect(screen.queryByRole('button', { name: copy.acoes.assumir })).toBeNull()
  })
})
