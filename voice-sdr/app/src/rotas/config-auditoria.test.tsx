import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { RegistroDeAuditoria } from '@/auditoria/tipos'
import {
  ACAO_EM_PORTUGUES,
  ALVO_EM_PORTUGUES,
  AUTOR_SEM_PESSOA,
  auditoria as copy,
} from '@/copy/auditoria'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeAuditoriaDublado,
  registrosDeExemplo,
  type RespostasDeAuditoria,
} from '@/testes/servico-de-auditoria-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'
import { formatarInstante } from '@/utilidades/datas'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

afterEach(cleanup)

async function abrirAuditoria(respostas: RespostasDeAuditoria = {}) {
  const servico = criarServicoDeAuditoriaDublado(respostas)
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/config/auditoria',
    undefined,
    servico,
  )
  await screen.findByRole('heading', { name: copy.titulo })
  return servico
}

/** As linhas da tabela, sem o cabeçalho. */
function linhas() {
  const tabela = screen.getByRole('table', { name: copy.tabela.rotulo })
  return within(tabela).getAllByRole('row').slice(1)
}

describe('tela de auditoria', () => {
  it('mostra ação em português, alvo e instante de cada registro', async () => {
    const [primeiro] = registrosDeExemplo() as [RegistroDeAuditoria, ...RegistroDeAuditoria[]]
    await abrirAuditoria()

    await waitFor(() => expect(linhas()).toHaveLength(3))

    const linha = within(linhas()[0]!)
    expect(linha.getByText('Renata Alves')).toBeDefined()
    expect(linha.getByText(ACAO_EM_PORTUGUES.update)).toBeDefined()
    expect(linha.getByText(ALVO_EM_PORTUGUES.account_members!)).toBeDefined()

    // O instante é dado, e dado se lê na fonte de valor.
    const quando = linha.getByText(formatarInstante(primeiro.instante))
    expect(quando.className).toContain('val')
  })

  it('nomeia o autor sem pessoa em vez de deixar a coluna vazia', async () => {
    await abrirAuditoria()

    await waitFor(() => expect(linhas()).toHaveLength(3))
    expect(
      within(linhas()[2]!).getByText(AUTOR_SEM_PESSOA.system),
    ).toBeDefined()
  })

  it('filtra por autor e pede ao serviço o recorte escolhido', async () => {
    const servico = await abrirAuditoria()
    await waitFor(() => expect(linhas()).toHaveLength(3))

    fireEvent.change(screen.getByLabelText(copy.filtros.autor), {
      target: { value: 'u-2' },
    })

    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(within(linhas()[0]!).getByText('Caio Moreira')).toBeDefined()
    expect(servico.consultas.at(-1)?.autor).toBe('u-2')
  })

  it('filtra por tipo de ação', async () => {
    const servico = await abrirAuditoria()
    await waitFor(() => expect(linhas()).toHaveLength(3))

    fireEvent.change(screen.getByLabelText(copy.filtros.acao), {
      target: { value: 'delete' },
    })

    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(within(linhas()[0]!).getByText(ACAO_EM_PORTUGUES.delete)).toBeDefined()
    expect(servico.consultas.at(-1)?.acao).toBe('delete')
  })

  it('filtra por período', async () => {
    const servico = await abrirAuditoria()
    await waitFor(() => expect(linhas()).toHaveLength(3))

    fireEvent.change(screen.getByLabelText(copy.filtros.periodo), {
      target: { value: '24h' },
    })

    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(servico.consultas.at(-1)?.periodo).toBe('24h')

    fireEvent.change(screen.getByLabelText(copy.filtros.periodo), {
      target: { value: '7d' },
    })

    await waitFor(() => expect(linhas()).toHaveLength(2))
  })

  it('limpa os filtros e volta a listar tudo', async () => {
    await abrirAuditoria()
    await waitFor(() => expect(linhas()).toHaveLength(3))

    fireEvent.change(screen.getByLabelText(copy.filtros.acao), {
      target: { value: 'delete' },
    })
    await waitFor(() => expect(linhas()).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: copy.filtros.limpar }))

    await waitFor(() => expect(linhas()).toHaveLength(3))
  })

  it('explica que ainda não houve ação quando a conta não registrou nada', async () => {
    await abrirAuditoria({ registros: [] })

    expect(await screen.findByText(copy.vazio.titulo)).toBeDefined()
    expect(screen.getByText(copy.vazio.explicacao)).toBeDefined()
  })

  it('distingue o vazio do recorte do vazio da conta', async () => {
    await abrirAuditoria()
    await waitFor(() => expect(linhas()).toHaveLength(3))

    fireEvent.change(screen.getByLabelText(copy.filtros.acao), {
      target: { value: 'insert' },
    })

    expect(await screen.findByText(copy.vazioComFiltro.titulo)).toBeDefined()
    expect(screen.queryByText(copy.vazio.titulo)).toBeNull()
  })

  it('avisa quando a consulta bateu no teto', async () => {
    await abrirAuditoria({ truncada: true })

    expect(await screen.findByText(copy.truncada)).toBeDefined()
  })

  it('mostra o motivo da falha em vez da tabela', async () => {
    await abrirAuditoria({ consultar: { ok: false, motivo: 'sem-permissao' } })

    expect(
      await screen.findByText(copy.falhas['sem-permissao']),
    ).toBeDefined()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
