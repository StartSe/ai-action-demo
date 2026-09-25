// O que esta tela precisa provar (US-179, RF-510): as duas vistas, cada
// filtro pedido ao serviço e aplicado, os dois estados vazios, a marca do que
// ficou para alguém resolver, a exclusão do ensaio (T-16) e o aviso do teto.
//
// O relógio fica parado numa quinta-feira, 1º de outubro de 2026, meio-dia em
// São Paulo: a semana corrente vai de 28/09 a 04/10. Só `Date` é falso; os
// temporizadores continuam de verdade, para o `findBy` esperar.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { reunioes as copy } from '@/copy/reunioes'
import { TETO_DA_LISTA } from '@/reunioes/consulta'
import type { ReuniaoDaLista } from '@/reunioes/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  BRUNO,
  criarServicoDeReunioesDublado,
  reuniaoDaLista,
  type RespostasDeReunioes,
  type ServicoDeReunioesDublado,
} from '@/testes/servico-de-reunioes-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }
const QUINTA = new Date('2026-10-01T15:00:00Z')

async function abrir(
  respostas: RespostasDeReunioes = {},
  caminho = '/reunioes',
): Promise<ServicoDeReunioesDublado> {
  const reunioes = criarServicoDeReunioesDublado(respostas)
  // Os dezessete serviços entre o caminho e as reuniões ficam no dublê padrão.
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    caminho,
    undefined, // equipe
    undefined, // auditoria
    undefined, // integrações
    undefined, // configuração inicial
    undefined, // leads
    undefined, // Sarah
    undefined, // números
    undefined, // chamadas
    undefined, // discagem
    undefined, // bloqueios
    undefined, // privacidade
    undefined, // especialistas
    undefined, // ensaio
    undefined, // fila
    undefined, // conta
    undefined, // diagnóstico
    undefined, // painel
    reunioes,
  )
  return reunioes
}

const DO_BRUNO = { id: BRUNO.id, nome: BRUNO.nome, fuso: BRUNO.fuso }

/** Três reuniões desta semana, distintas em tudo o que a tela filtra. */
function daSemana(): ReuniaoDaLista[] {
  return [
    // Quinta, 14h em São Paulo.
    reuniaoDaLista({ id: 'r-carla', inicio: '2026-10-01T17:00:00Z', fim: '2026-10-01T17:30:00Z' }),
    // Sexta, 10h em São Paulo, 9h em Manaus.
    reuniaoDaLista({
      id: 'r-diego',
      inicio: '2026-10-02T13:00:00Z',
      fim: '2026-10-02T13:30:00Z',
      lead: { id: 'l-2', nome: 'Diego Prates', temEmail: true },
      especialista: DO_BRUNO,
      modalidade: 'presencial',
      estado: 'confirmed',
      origem: 'manual',
      chamadaDaMarcacao: null,
    }),
    // Terça, 9h em São Paulo.
    reuniaoDaLista({
      id: 'r-elisa',
      inicio: '2026-09-29T12:00:00Z',
      fim: '2026-09-29T12:30:00Z',
      lead: { id: 'l-3', nome: 'Elisa Kato', temEmail: true },
      modalidade: 'telefone',
      estado: 'canceled',
    }),
  ]
}

function filtros(): HTMLElement {
  return screen.getByRole('region', { name: copy.filtros.titulo })
}

function escolher(rotulo: string, valor: string) {
  fireEvent.change(within(filtros()).getByLabelText(rotulo, { selector: 'select' }), {
    target: { value: valor },
  })
}

/** Os leads da lista, na ordem das linhas. */
function leadsDaLista(): string[] {
  const corpo = screen.getByRole('table', { name: copy.tabela.rotulo }).querySelector('tbody')
  return [...(corpo?.querySelectorAll('tr') ?? [])].map(
    (linha) => linha.querySelectorAll('td')[1]?.textContent ?? '',
  )
}

/** A célula da agenda na linha do especialista e na coluna do dia. */
function celula(especialista: string, dia: string): HTMLElement {
  const tabela = screen.getByRole('table', { name: copy.agenda.rotulo })
  const titulos = [...tabela.querySelectorAll('thead th')].map((th) => th.textContent)
  const coluna = titulos.indexOf(dia)
  expect(coluna, `coluna ${dia} em ${titulos.join(' | ')}`).toBeGreaterThan(0)
  const linha = [...tabela.querySelectorAll('tbody tr')].find((tr) =>
    tr.querySelector('td')?.textContent?.startsWith(especialista),
  )
  const alvo = linha?.querySelectorAll('td')[coluna]
  if (!alvo) throw new Error(`sem célula para ${especialista} em ${dia}`)
  return alvo as HTMLElement
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(QUINTA)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('/reunioes — os estados', () => {
  it('carregando', async () => {
    await abrir({ listaPendente: true })
    expect(await screen.findByText(copy.carregando)).toBeTruthy()
  })

  it('falha do contexto vira caixa de erro com a frase', async () => {
    await abrir({ contexto: { ok: false, motivo: 'falha-de-comunicacao' } })
    expect(await screen.findByText(copy.falhas['falha-de-comunicacao'])).toBeTruthy()
  })

  it('falha da lista vira caixa de erro com a frase', async () => {
    await abrir({ listarReunioes: { ok: false, motivo: 'sem-permissao' } })
    expect(await screen.findByText(copy.falhas['sem-permissao'])).toBeTruthy()
  })

  it('filtro escrito à mão que a tela não reconhece é recusado sem consultar', async () => {
    const servico = await abrir({ reunioes: daSemana() }, '/reunioes?estado=perdida')
    expect(await screen.findByText(copy.falhas['filtro-invalido'])).toBeTruthy()
    expect(servico.recortes).toEqual([])
  })

  it('conta sem reunião nenhuma: nenhuma reunião marcada, com o caminho', async () => {
    await abrir({ reunioes: [] })
    expect(await screen.findByText(copy.vazio.titulo)).toBeTruthy()
    expect(screen.queryByText(copy.vazioComFiltro.titulo)).toBeNull()
    expect(screen.getByRole('link', { name: copy.vazio.acao }).getAttribute('href')).toBe('/especialistas')
  })

  it('conta com reunião fora do recorte: o recorte não achou nada', async () => {
    await abrir({ reunioes: daSemana() }, '/reunioes?semana=3')
    expect(await screen.findByText(copy.vazioComFiltro.titulo)).toBeTruthy()
    expect(screen.queryByText(copy.vazio.titulo)).toBeNull()
  })
})

describe('/reunioes — a agenda da semana', () => {
  it('abre na agenda da semana corrente, com um dia por coluna e um especialista por linha', async () => {
    const servico = await abrir({ reunioes: daSemana() })
    const tabela = await screen.findByRole('table', { name: copy.agenda.rotulo })

    const titulos = [...tabela.querySelectorAll('thead th')].map((th) => th.textContent)
    expect(titulos).toEqual([
      copy.agenda.especialista,
      'seg 28/09',
      'ter 29/09',
      'qua 30/09',
      'qui 01/10',
      'sex 02/10',
      'sáb 03/10',
      'dom 04/10',
    ])
    expect(servico.recortes[0]).toMatchObject({
      desde: '2026-09-28T03:00:00.000Z',
      ate: '2026-10-05T03:00:00.000Z',
    })
    expect(within(celula('Ana Ribeiro', 'qui 01/10')).getByText('14:00')).toBeTruthy()
    expect(within(celula('Ana Ribeiro', 'qui 01/10')).getByText('Carla Menezes')).toBeTruthy()
    expect(within(celula('Ana Ribeiro', 'seg 28/09')).getByText(copy.agenda.diaLivre)).toBeTruthy()
    expect(screen.getByText(copy.agenda.fusoDaConta('America/Sao_Paulo'))).toBeTruthy()
  })

  it('o horário é o da conta, e o especialista em outro fuso tem o dele ao lado', async () => {
    await abrir({ reunioes: daSemana() })
    await screen.findByRole('table', { name: copy.agenda.rotulo })

    const doBruno = celula('Bruno Tavares', 'sex 02/10')
    expect(within(doBruno).getByText('10:00')).toBeTruthy()
    expect(within(doBruno).getByText('(09:00 em Manaus)')).toBeTruthy()
    expect(screen.getByText(copy.agenda.fusoDoEspecialista('America/Manaus'))).toBeTruthy()
    // Quem está no fuso da conta não ganha a segunda hora.
    expect(within(celula('Ana Ribeiro', 'qui 01/10')).queryByText(/em São Paulo/)).toBeNull()
  })

  it('a semana seguinte e a anterior se pedem ao serviço', async () => {
    const proxima = reuniaoDaLista({ id: 'r-proxima', inicio: '2026-10-06T13:00:00Z' })
    const anterior = reuniaoDaLista({ id: 'r-anterior', inicio: '2026-09-22T13:00:00Z' })
    const servico = await abrir({ reunioes: [...daSemana(), proxima, anterior] })
    await screen.findByRole('table', { name: copy.agenda.rotulo })

    fireEvent.click(within(filtros()).getByRole('button', { name: copy.semana.proxima }))
    expect(await screen.findByText('ter 06/10')).toBeTruthy()
    expect(servico.recortes.at(-1)).toMatchObject({ desde: '2026-10-05T03:00:00.000Z' })
    expect(within(celula('Ana Ribeiro', 'ter 06/10')).getByText('10:00')).toBeTruthy()

    fireEvent.click(within(filtros()).getByRole('button', { name: copy.semana.atual }))
    fireEvent.click(within(filtros()).getByRole('button', { name: copy.semana.anterior }))
    expect(await screen.findByText('seg 21/09')).toBeTruthy()
    expect(servico.recortes.at(-1)).toMatchObject({ desde: '2026-09-21T03:00:00.000Z' })
  })

  it('o filtro de especialista deixa só a linha dele', async () => {
    const servico = await abrir({ reunioes: daSemana() })
    await screen.findByRole('table', { name: copy.agenda.rotulo })

    escolher(copy.filtros.especialista, BRUNO.id)
    await waitFor(() => expect(servico.recortes.at(-1)?.especialistaId).toBe(BRUNO.id))
    const tabela = await screen.findByRole('table', { name: copy.agenda.rotulo })
    await waitFor(() => expect(tabela.querySelectorAll('tbody tr')).toHaveLength(1))
    expect(within(tabela).queryByText('Ana Ribeiro')).toBeNull()
  })
})

describe('/reunioes — a lista', () => {
  async function abrirLista(respostas: RespostasDeReunioes, busca = '') {
    const servico = await abrir(respostas, `/reunioes?vista=lista${busca}`)
    await screen.findByRole('table', { name: copy.tabela.rotulo })
    return servico
  }

  it('trocar de vista leva à lista, com as colunas em ordem', async () => {
    await abrir({ reunioes: daSemana() })
    await screen.findByRole('table', { name: copy.agenda.rotulo })
    fireEvent.click(screen.getByRole('button', { name: copy.visoes.lista }))

    const tabela = await screen.findByRole('table', { name: copy.tabela.rotulo })
    const titulos = [...tabela.querySelectorAll('thead th')].map((th) => th.textContent)
    expect(titulos).toEqual(Object.values(copy.tabela.colunas))
    expect(screen.getByRole('button', { name: copy.visoes.lista }).getAttribute('aria-pressed')).toBe('true')
  })

  it('horário em .val, origem com link para a ficha da chamada, e a marcada à mão sem link', async () => {
    await abrirLista({ reunioes: daSemana() })

    expect(leadsDaLista()).toEqual(['Carla Menezes', 'Diego Prates'])
    const horario = screen.getByText('qui 01/10 14:00')
    expect(horario.classList.contains('val')).toBe(true)
    const link = screen.getByRole('link', { name: copy.tabela.marcadaNaLigacao })
    expect(link.getAttribute('href')).toBe('/chamadas/c-1')
    expect(screen.getByText(copy.tabela.marcadaManualmente)).toBeTruthy()
    const tabela = screen.getByRole('table', { name: copy.tabela.rotulo })
    expect(within(tabela).getByText(copy.estados.confirmed)).toBeTruthy()
    expect(within(tabela).getByText(copy.modalidades.presencial)).toBeTruthy()
  })

  it('o período pede outro intervalo e traz o passado do mais recente para trás', async () => {
    const servico = await abrirLista({ reunioes: daSemana() })

    escolher(copy.filtros.periodo, 'ultimos-7d')
    await waitFor(() => expect(leadsDaLista()).toEqual(['Elisa Kato']))
    expect(servico.recortes.at(-1)).toMatchObject({
      desde: '2026-09-24T03:00:00.000Z',
      ate: '2026-10-01T03:00:00.000Z',
      crescente: false,
    })
  })

  it.each([
    ['especialista', copy.filtros.especialista, BRUNO.id, { especialistaId: BRUNO.id }, ['Diego Prates']],
    ['estado', copy.filtros.estado, 'confirmed', { estado: 'confirmed' }, ['Diego Prates']],
    ['modalidade', copy.filtros.modalidade, 'video', { modalidade: 'video' }, ['Carla Menezes']],
  ])('o filtro de %s vai ao serviço e encolhe a lista', async (_nome, rotulo, valor, recorte, leads) => {
    const servico = await abrirLista({ reunioes: daSemana() })

    escolher(rotulo, valor)
    await waitFor(() => expect(leadsDaLista()).toEqual(leads))
    expect(servico.recortes.at(-1)).toMatchObject(recorte)
  })

  it('limpar os filtros apaga as chaves da busca e mantém a vista', async () => {
    const servico = await abrirLista({ reunioes: daSemana() }, '&estado=confirmed&modalidade=presencial')
    expect(leadsDaLista()).toEqual(['Diego Prates'])

    fireEvent.click(within(filtros()).getByRole('button', { name: copy.filtros.limpar }))
    await waitFor(() => expect(leadsDaLista()).toEqual(['Carla Menezes', 'Diego Prates']))
    const ultimo = servico.recortes.at(-1)
    expect(ultimo?.estado).toBeUndefined()
    expect(ultimo?.modalidade).toBeUndefined()
  })

  it('a rota devolve toda chave, e a em branco herdada da raiz é apagada em vez de virar filtro', async () => {
    // Sem a atribuição de cada chave em `validateSearch`, o `estado` cru da
    // barra de endereço passaria da raiz para a tela e recusaria a lista.
    const servico = await abrirLista({ reunioes: daSemana() }, '&estado=%20&modalidade=%20')
    expect(leadsDaLista()).toEqual(['Carla Menezes', 'Diego Prates'])
    expect(servico.recortes[0]?.estado).toBeUndefined()
    expect(servico.recortes[0]?.modalidade).toBeUndefined()
  })

  it('reunião sem evento e com convite pendente aparece marcada, com o que fazer', async () => {
    const pendente = reuniaoDaLista({
      id: 'r-pendente',
      lead: { id: 'l-9', nome: 'Fábio Nunes', temEmail: false },
      evento: { externoId: null, tentativas: 5 },
      conviteDoLead: { enviadoEm: null, tentativas: 0, erro: null, proximaTentativa: null },
      conviteDoEspecialista: { enviadoEm: null, tentativas: 5, erro: 'recusado', proximaTentativa: null },
    })
    await abrirLista({ reunioes: [pendente] })

    for (const marca of ['evento-desistiu', 'convite-lead-sem-email', 'convite-especialista-desistiu'] as const) {
      expect(screen.getByText(copy.marcas[marca].rotulo)).toBeTruthy()
      expect(screen.getByText(copy.marcas[marca].oQueFazer)).toBeTruthy()
    }
  })

  it('reunião em ordem não tem marca', async () => {
    await abrirLista({ reunioes: [reuniaoDaLista()] })
    expect(screen.getByText(copy.tabela.semPendencia)).toBeTruthy()
  })

  it('a reunião de ensaio nunca aparece, nem sozinha ela conta como reunião da conta', async () => {
    const ensaio = reuniaoDaLista({
      id: 'r-ensaio',
      origem: 'ensaio',
      lead: { id: 'l-e', nome: 'Lead do Ensaio', temEmail: true },
    })
    const servico = await abrirLista({ reunioes: [reuniaoDaLista(), ensaio] })
    expect(leadsDaLista()).toEqual(['Carla Menezes'])
    expect(screen.queryByText('Lead do Ensaio')).toBeNull()
    expect(servico.recortes[0]?.origens).not.toContain('ensaio')

    cleanup()
    await abrir({ reunioes: [ensaio] }, '/reunioes?vista=lista')
    expect(await screen.findByText(copy.vazio.titulo)).toBeTruthy()
  })

  it('acima do teto a lista avisa e pede período mais estreito', async () => {
    const muitas = [1, 2, 3].map((n) =>
      reuniaoDaLista({ id: `r-${n}`, inicio: `2026-10-0${n + 1}T13:00:00Z`, lead: { id: `l-${n}`, nome: `Lead ${n}`, temEmail: true } }),
    )
    await abrirLista({ reunioes: muitas, teto: 2 })
    expect(leadsDaLista()).toHaveLength(2)
    expect(screen.getByRole('status').textContent).toBe(copy.teto(TETO_DA_LISTA))
  })

  it('dentro do teto não há aviso', async () => {
    await abrirLista({ reunioes: daSemana() })
    expect(screen.queryByText(copy.teto(TETO_DA_LISTA))).toBeNull()
  })
})

describe('/reunioes — no menu', () => {
  it('o item Reuniões é um link para a tela', async () => {
    await abrir({ reunioes: [] })
    const navegacao = screen.getAllByRole('link', { name: 'Reuniões' })
    expect(navegacao.some((link) => link.getAttribute('href') === '/reunioes')).toBe(true)
  })
})
