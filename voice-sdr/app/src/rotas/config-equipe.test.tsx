import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { equipe as copy, PAPEL_EM_PORTUGUES } from '@/copy/equipe'
import type { Equipe } from '@/equipe/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeEquipeDublado,
  equipeDeExemplo,
  type RespostasDeEquipe,
} from '@/testes/servico-de-equipe-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

/** A sessão é da primeira pessoa da equipe de exemplo. */
const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

const copiados: string[] = []

beforeEach(() => {
  copiados.length = 0
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (texto: string) => {
        copiados.push(texto)
        return Promise.resolve()
      },
    },
  })
})

afterEach(cleanup)

async function abrirEquipe(respostas: RespostasDeEquipe = {}) {
  const equipe = criarServicoDeEquipeDublado(respostas)
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/config/equipe',
    equipe,
  )
  await screen.findByRole('heading', { name: copy.membros.titulo })
  return equipe
}

function comEquipe(alteracoes: Partial<Equipe>): RespostasDeEquipe {
  return { carregar: { ok: true, equipe: { ...equipeDeExemplo(), ...alteracoes } } }
}

describe('tela de equipe', () => {
  it('lista cada membro com o papel e o último acesso', async () => {
    await abrirEquipe()

    expect(screen.getByText('Renata Alves')).toBeDefined()
    expect(screen.getByText('Caio Moreira')).toBeDefined()

    const papelDeCaio = screen.getByLabelText<HTMLSelectElement>(
      `${copy.membros.colunas.papel}: Caio Moreira`,
    )
    expect(papelDeCaio.value).toBe('operator')

    // Data formatada para quem já entrou, frase para quem nunca entrou.
    const tabela = within(screen.getByRole('table'))
    expect(tabela.getByText(/\d{2}\/\d{2}\/\d{4}/)).toBeDefined()
    expect(tabela.getByText(copy.membros.nuncaAcessou)).toBeDefined()
  })

  it('convidar gera o link e o copia para a área de transferência', async () => {
    const equipe = await abrirEquipe()

    fireEvent.change(screen.getByLabelText(copy.convite.email.rotulo), {
      target: { value: 'novo@aurora.com.br' },
    })
    fireEvent.change(screen.getByLabelText(copy.convite.papel), {
      target: { value: 'admin' },
    })
    fireEvent.click(screen.getByRole('button', { name: copy.convite.acao }))

    expect(await screen.findByText(copy.convite.linkPronto)).toBeDefined()
    expect(equipe.convidados).toEqual([
      { email: 'novo@aurora.com.br', papel: 'admin' },
    ])

    const link = 'http://localhost:5173/convite/token-de-teste'
    expect(copiados).toEqual([link])
    // O link aparece na tela também: copiar pode falhar por permissão.
    expect(screen.getByLabelText(copy.convite.rotuloDoLink).textContent).toBe(link)
  })

  it('convite sem e-mail reprova antes de chamar o serviço', async () => {
    const equipe = await abrirEquipe()

    fireEvent.click(screen.getByRole('button', { name: copy.convite.acao }))

    expect(await screen.findByText(copy.convite.emailObrigatorio)).toBeDefined()
    expect(equipe.convidados).toEqual([])
  })

  it('trocar o papel de um membro chama o serviço com o papel novo', async () => {
    const equipe = await abrirEquipe()

    fireEvent.change(
      screen.getByLabelText(`${copy.membros.colunas.papel}: Caio Moreira`),
      { target: { value: 'admin' } },
    )

    await waitFor(() => {
      expect(equipe.papeisTrocados).toEqual([
        { usuarioId: 'u-2', papel: 'admin' },
      ])
    })
  })

  it('remover um membro chama o serviço', async () => {
    const equipe = await abrirEquipe()

    const remover = screen.getAllByRole('button', { name: copy.membros.remover })
    // A própria linha não tem botão ativo: o primeiro habilitado é o de Caio.
    fireEvent.click(remover[1] as HTMLButtonElement)

    await waitFor(() => {
      expect(equipe.removidos).toEqual(['u-2'])
    })
  })

  it('a própria linha não pode ser rebaixada nem removida', async () => {
    await abrirEquipe()

    const papelProprio = screen.getByLabelText<HTMLSelectElement>(
      `${copy.membros.colunas.papel}: Renata Alves`,
    )
    const remover = screen.getAllByRole<HTMLButtonElement>('button', {
      name: copy.membros.remover,
    })

    expect(papelProprio.disabled).toBe(true)
    expect(remover[0]?.disabled).toBe(true)
    expect(remover[1]?.disabled).toBe(false)
  })

  it('cancelar um convite pendente chama o serviço', async () => {
    const equipe = await abrirEquipe()

    expect(screen.getByText('bruna@aurora.com.br')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: copy.pendentes.revogar }))

    await waitFor(() => {
      expect(equipe.convitesRevogados).toEqual(['i-1'])
    })
  })

  it('sem convite pendente, a seção mostra o estado vazio', async () => {
    await abrirEquipe(comEquipe({ convites: [] }))

    expect(screen.getByText(copy.pendentes.vazio.titulo)).toBeDefined()
  })

  it('o operador vê a tela em leitura, com os campos desabilitados', async () => {
    await abrirEquipe(
      comEquipe({
        papelDoUsuario: 'operator',
        membros: [
          {
            usuarioId: 'u-1',
            nome: 'Renata Alves',
            email: 'renata@aurora.com.br',
            papel: 'operator',
            ultimoAcesso: null,
          },
          {
            usuarioId: 'u-9',
            nome: 'Selma Dias',
            email: 'selma@aurora.com.br',
            papel: 'owner',
            ultimoAcesso: null,
          },
        ],
      }),
    )

    const email = screen.getByLabelText<HTMLInputElement>(
      copy.convite.email.rotulo,
    )
    const gerar = screen.getByRole<HTMLButtonElement>('button', {
      name: copy.convite.acao,
    })
    const papelDeSelma = screen.getByLabelText<HTMLSelectElement>(
      `${copy.membros.colunas.papel}: Selma Dias`,
    )

    expect(email.disabled).toBe(true)
    expect(gerar.disabled).toBe(true)
    expect(papelDeSelma.disabled).toBe(true)
    for (const botao of screen.getAllByRole<HTMLButtonElement>('button', {
      name: copy.membros.remover,
    })) {
      expect(botao.disabled).toBe(true)
    }
  })

  it('o operador vê a quem pedir acesso', async () => {
    await abrirEquipe(
      comEquipe({
        papelDoUsuario: 'operator',
        membros: [
          {
            usuarioId: 'u-9',
            nome: 'Selma Dias',
            email: 'selma@aurora.com.br',
            papel: 'owner',
            ultimoAcesso: null,
          },
          {
            usuarioId: 'u-2',
            nome: 'Caio Moreira',
            email: 'caio@aurora.com.br',
            papel: 'operator',
            ultimoAcesso: null,
          },
        ],
      }),
    )

    expect(screen.getByText(copy.leitura.aviso)).toBeDefined()
    expect(screen.getByText(copy.leitura.pedirAcesso)).toBeDefined()

    const lista = within(
      screen.getByRole('list', { name: copy.leitura.pedirAcesso }),
    )
    expect(lista.getByText('selma@aurora.com.br')).toBeDefined()
    // Quem não concede acesso não entra na lista de quem pedir.
    expect(lista.queryByText('caio@aurora.com.br')).toBeNull()
  })

  it('recusa da política vira frase, e não silêncio', async () => {
    await abrirEquipe({ remover: { ok: false, motivo: 'sem-permissao' } })

    const remover = screen.getAllByRole('button', { name: copy.membros.remover })
    fireEvent.click(remover[1] as HTMLButtonElement)

    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.getByText(copy.falhas['sem-permissao'])).toBeDefined()
  })

  it('acesso sem conta nenhuma explica o que aconteceu', async () => {
    const equipe = criarServicoDeEquipeDublado({
      carregar: { ok: false, motivo: 'sem-conta' },
    })
    await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      '/config/equipe',
      equipe,
    )

    expect(await screen.findByRole('alert')).toBeDefined()
    expect(screen.getByText(copy.falhas['sem-conta'])).toBeDefined()
  })

  it('sem sessão, a rota desvia para a entrada', async () => {
    const { roteador } = await montarAplicacao(
      criarServicoDublado(),
      '/config/equipe',
    )

    expect(roteador.state.location.pathname).toBe('/entrar')
  })

  it('o papel de dono só aparece habilitado para quem já é dono', async () => {
    await abrirEquipe()

    const opcoes = screen.getAllByRole<HTMLOptionElement>('option', {
      name: PAPEL_EM_PORTUGUES.owner,
    })

    // O usuário de exemplo é admin: nenhuma opção de dono fica selecionável.
    expect(opcoes.every((opcao) => opcao.disabled)).toBe(true)
  })
})
