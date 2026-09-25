import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { lista as copy } from '@/copy/conversas'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import { criarServicoDublado } from '@/testes/servico-dublado'
import {
  conversaDeExemplo,
  criarServicoDeWhatsappDublado,
  type RespostasDoWhatsapp,
} from '@/testes/servico-de-whatsapp-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

afterEach(cleanup)

async function abrirConversas(respostas: RespostasDoWhatsapp = {}) {
  const whatsapp = criarServicoDeWhatsappDublado(respostas)
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/conversas',
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
    undefined,
    whatsapp,
  )
  await screen.findByRole('heading', { name: copy.titulo })
  return whatsapp
}

describe('tela de conversas', () => {
  it('mostra o estado vazio quando a conta nunca teve conversa', async () => {
    await abrirConversas()

    expect(await screen.findByText(copy.vazio.titulo)).toBeDefined()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('lista lead ou telefone, a prévia da última mensagem e o status', async () => {
    const conversa = conversaDeExemplo({
      leadNome: 'Marcos Ferreira',
      telefone: '+5548999998888',
      status: 'humano',
      mensagens: [
        {
          id: 'm-1',
          direcao: 'in',
          autor: 'lead',
          corpo: 'Quero saber o preço.',
          midia: null,
          leituraDaMidia: null,
          estadoDaLeitura: null,
          status: 'recebida',
          erro: null,
          criadaEm: '2026-09-10T14:00:00Z',
        },
      ],
    })
    await abrirConversas({ conversas: [conversa] })

    const linha = (await screen.findByText('Marcos Ferreira')).closest('tr')
    expect(linha).not.toBeNull()
    const dentro = within(linha as HTMLElement)
    expect(dentro.getByText('+5548999998888')).toBeDefined()
    expect(dentro.getByText('Quero saber o preço.')).toBeDefined()
    expect(dentro.getByText('Com um atendente')).toBeDefined()
  })

  it('filtra por status', async () => {
    const emAndamento = conversaDeExemplo({ status: 'assistente', leadNome: 'Marcos Ferreira' })
    const encerrada = conversaDeExemplo({ status: 'encerrada', leadNome: 'Ana Souza' })
    await abrirConversas({ conversas: [emAndamento, encerrada] })

    await screen.findByText('Marcos Ferreira')
    expect(screen.getByText('Ana Souza')).toBeDefined()

    fireEvent.change(screen.getByRole('combobox', { name: copy.filtro }), {
      target: { value: 'encerrada' },
    })

    await screen.findByText('Ana Souza')
    expect(screen.queryByText('Marcos Ferreira')).toBeNull()
  })
})
