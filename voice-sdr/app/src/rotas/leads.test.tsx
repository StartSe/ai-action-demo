import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { leads as copy, TEMPERATURA_EM_PORTUGUES } from '@/copy/leads'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeLeadsDublado,
  leadsDeExemplo,
  type RespostasDeLeads,
} from '@/testes/servico-de-leads-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

afterEach(cleanup)

async function abrirLeads(
  respostas: RespostasDeLeads = {},
  caminho = '/leads',
) {
  const servico = criarServicoDeLeadsDublado(respostas)
  const { roteador } = await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    caminho,
    undefined,
    undefined,
    undefined,
    undefined,
    servico,
  )
  await screen.findByRole('heading', { name: copy.titulo })
  return { servico, roteador }
}

/** As linhas da tabela, sem o cabeçalho. */
function linhas() {
  const tabela = screen.getByRole('table', { name: copy.tabela.rotulo })
  return within(tabela).getAllByRole('row').slice(1)
}

function buscar(texto: string) {
  const campo = screen.getByLabelText(copy.filtros.termo)
  fireEvent.change(campo, { target: { value: texto } })
  fireEvent.submit(campo.closest('form') as HTMLFormElement)
}

describe('lista de leads', () => {
  it('mostra nome, empresa, cidade, etapa, temperatura e atividade de cada lead', async () => {
    await abrirLeads()

    await waitFor(() => expect(linhas()).toHaveLength(4))

    const linha = within(linhas()[0]!)
    expect(linha.getByText('Marina Castro')).toBeDefined()
    expect(linha.getByText('Aurora Logística')).toBeDefined()
    expect(linha.getByText('Florianópolis, SC')).toBeDefined()
    expect(linha.getByText('Qualificado')).toBeDefined()
    expect(linha.getByText(TEMPERATURA_EM_PORTUGUES.quente)).toBeDefined()
  })

  it('escreve o telefone na fonte de valor', async () => {
    await abrirLeads()
    await waitFor(() => expect(linhas()).toHaveLength(4))

    const telefone = within(linhas()[0]!).getByText('+5548999998888')
    expect(telefone.className).toContain('val')
  })

  it('nomeia quem chegou sem nome e diz quem nunca teve contato', async () => {
    await abrirLeads()
    await waitFor(() => expect(linhas()).toHaveLength(4))

    // O terceiro lead de exemplo é o que veio da planilha só com telefone.
    const semNome = linhas().find((linha) =>
      within(linha).queryByText(copy.tabela.semNome),
    )
    expect(semNome).toBeDefined()
    expect(within(semNome!).getByText(copy.tabela.semAtividade)).toBeDefined()
  })

  it('marca o lead bloqueado na própria linha', async () => {
    await abrirLeads()
    await waitFor(() => expect(linhas()).toHaveLength(4))

    const bloqueada = linhas().find((linha) =>
      within(linha).queryByText(copy.tabela.bloqueado),
    )
    expect(bloqueada).toBeDefined()
    expect(within(bloqueada!).getByText('Célia Prado')).toBeDefined()
  })

  it('normaliza o termo que parece telefone antes de consultar', async () => {
    const { servico } = await abrirLeads()
    await waitFor(() => expect(linhas()).toHaveLength(4))

    buscar('(48) 99999-8888')

    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(servico.recortes.at(-1)?.termo).toBe('+5548999998888')
    expect(within(linhas()[0]!).getByText('Marina Castro')).toBeDefined()
  })

  it('busca por nome e por e-mail sem mexer no que foi digitado', async () => {
    const { servico } = await abrirLeads()
    await waitFor(() => expect(linhas()).toHaveLength(4))

    buscar('bruno@pilar.com.br')

    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(servico.recortes.at(-1)?.termo).toBe('bruno@pilar.com.br')
    expect(within(linhas()[0]!).getByText('Bruno Tavares')).toBeDefined()
  })

  it('filtra por etapa do funil, pela chave e não pelo rótulo', async () => {
    const { servico } = await abrirLeads()
    await waitFor(() => expect(linhas()).toHaveLength(4))

    fireEvent.change(screen.getByLabelText(copy.filtros.etapa), {
      target: { value: 'lost' },
    })

    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(servico.recortes.at(-1)?.etapa).toBe('lost')
  })

  it('filtra por temperatura', async () => {
    const { servico } = await abrirLeads()
    await waitFor(() => expect(linhas()).toHaveLength(4))

    fireEvent.change(screen.getByLabelText(copy.filtros.temperatura), {
      target: { value: 'quente' },
    })

    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(servico.recortes.at(-1)?.temperatura).toBe('quente')
  })

  it('filtra por origem', async () => {
    const { servico } = await abrirLeads()
    await waitFor(() => expect(linhas()).toHaveLength(4))

    fireEvent.change(screen.getByLabelText(copy.filtros.origem), {
      target: { value: 'intake' },
    })

    await waitFor(() => expect(servico.recortes.at(-1)?.origem).toBe('intake'))
  })

  it('filtra por última atividade, mandando o instante e não o período', async () => {
    const { servico } = await abrirLeads()
    await waitFor(() => expect(linhas()).toHaveLength(4))

    fireEvent.change(screen.getByLabelText(copy.filtros.atividade), {
      target: { value: '24h' },
    })

    await waitFor(() => expect(linhas()).toHaveLength(1))
    const desde = servico.recortes.at(-1)?.atividadeDesde
    expect(desde).toBeDefined()
    expect(Date.parse(desde!)).toBeLessThan(Date.now())
  })

  it('filtra por bloqueio nos dois sentidos', async () => {
    const { servico } = await abrirLeads()
    await waitFor(() => expect(linhas()).toHaveLength(4))

    fireEvent.change(screen.getByLabelText(copy.filtros.bloqueio), {
      target: { value: 'bloqueados' },
    })

    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(servico.recortes.at(-1)?.bloqueado).toBe(true)

    fireEvent.change(screen.getByLabelText(copy.filtros.bloqueio), {
      target: { value: 'liberados' },
    })

    await waitFor(() => expect(linhas()).toHaveLength(3))
    expect(servico.recortes.at(-1)?.bloqueado).toBe(false)
  })

  it('ordena por nome sem mudar o conjunto', async () => {
    const { servico } = await abrirLeads()
    await waitFor(() => expect(linhas()).toHaveLength(4))

    fireEvent.change(screen.getByLabelText(copy.filtros.ordenacao), {
      target: { value: 'nome' },
    })

    await waitFor(() => expect(servico.recortes.at(-1)?.ordenacao).toBe('nome'))
    await waitFor(() => expect(linhas()).toHaveLength(4))
    // O lead sem nome vem primeiro, e depois a ordem do alfabeto.
    expect(within(linhas()[1]!).getByText('Bruno Tavares')).toBeDefined()
    expect(screen.getByLabelText(copy.filtros.ordenacao)).toHaveProperty(
      'value',
      'nome',
    )
  })

  it('o recorte inteiro viaja na busca da rota', async () => {
    const { roteador } = await abrirLeads()
    await waitFor(() => expect(linhas()).toHaveLength(4))

    buscar('marina')
    fireEvent.change(screen.getByLabelText(copy.filtros.etapa), {
      target: { value: 'qualified' },
    })

    await waitFor(() =>
      expect(roteador.state.location.search).toMatchObject({
        termo: 'marina',
        etapa: 'qualified',
      }),
    )
  })

  it('abre já filtrada pelo que veio na barra de endereço', async () => {
    const { servico } = await abrirLeads({}, '/leads?etapa=lost')

    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(servico.recortes.at(-1)?.etapa).toBe('lost')
    expect(screen.getByLabelText(copy.filtros.etapa)).toHaveProperty(
      'value',
      'lost',
    )
  })

  it('limpar filtros esvazia a busca e o campo de texto', async () => {
    const { roteador } = await abrirLeads({}, '/leads?etapa=lost&termo=celia')
    await waitFor(() => expect(linhas()).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: copy.filtros.limpar }))

    await waitFor(() => expect(linhas()).toHaveLength(4))
    expect(screen.getByLabelText(copy.filtros.termo)).toHaveProperty('value', '')
    expect(roteador.state.location.search).toEqual({})
  })

  it('recusa o filtro que não reconhece em vez de mostrar a conta inteira', async () => {
    const { servico } = await abrirLeads({}, '/leads?ordenacao=preco')

    expect(
      await screen.findByText(copy.falhas['filtro-invalido']),
    ).toBeDefined()
    expect(screen.queryByRole('table')).toBeNull()
    // Recorte que a tela não entende não vira consulta: mostrar a lista inteira
    // a quem pediu um recorte é o engano que ninguém percebe.
    expect(servico.recortes).toHaveLength(0)
  })

  it('oferece a importação quando a conta não tem lead nenhum', async () => {
    await abrirLeads({ leads: [] })

    expect(await screen.findByText(copy.vazio.titulo)).toBeDefined()
    const acao = screen.getByRole('link', { name: copy.vazio.acao })
    expect(acao.getAttribute('href')).toBe('/leads/importar')
  })

  it('distingue o vazio do recorte do vazio da conta', async () => {
    await abrirLeads({}, '/leads?termo=ninguem')

    expect(await screen.findByText(copy.vazioComFiltro.titulo)).toBeDefined()
    expect(screen.queryByText(copy.vazio.titulo)).toBeNull()
  })

  it('avisa quando a consulta bateu no teto', async () => {
    await abrirLeads({ truncada: true })

    expect(await screen.findByText(copy.truncada)).toBeDefined()
  })

  it('mostra o motivo da falha em vez da tabela', async () => {
    await abrirLeads({ listar: { ok: false, motivo: 'sem-permissao' } })

    expect(await screen.findByText(copy.falhas['sem-permissao'])).toBeDefined()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('não oferece filtro de campanha nem de reunião, que são de fatias seguintes', async () => {
    await abrirLeads()
    await waitFor(() => expect(linhas()).toHaveLength(4))

    const filtros = within(
      screen.getByRole('region', { name: copy.filtros.titulo }),
    )
    expect(filtros.queryByLabelText(/campanha/i)).toBeNull()
    expect(filtros.queryByLabelText(/reuni/i)).toBeNull()
  })

  it('o dado de exemplo cobre os dois extremos da ordenação por atividade', () => {
    const exemplos = leadsDeExemplo()
    expect(exemplos.some((lead) => lead.ultimaAtividade === null)).toBe(true)
    expect(exemplos.some((lead) => lead.bloqueado)).toBe(true)
  })
})
