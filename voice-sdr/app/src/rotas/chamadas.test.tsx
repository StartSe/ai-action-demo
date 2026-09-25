// O que esta tela precisa provar (RF-413): as colunas da lista, os filtros que
// a fatia alcança pedidos ao serviço e aplicados, a ordenação, o aviso do
// teto, a chamada em curso com a duração correndo e os dois estados vazios.
//
// Duas asserções justificam o arquivo. O ensaio não aparece (T-16): a F3 grava
// o ensaio em `calls`, e quem o tira da lista é o recorte, que o dublê aplica
// com o mesmo módulo. E nenhum controle morto: campanha e especialista não têm
// dado em F2, e um seletor para eles seria configuração que não filtra nada.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ChamadaDaLista } from '@/chamadas/tipos'
import { aoVivo, lista as copy, MOTIVO_DO_FIM } from '@/copy/chamadas'
import { PROPOSITO_EM_PORTUGUES } from '@/copy/sarah'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  chamadaDaLista,
  criarServicoDeChamadasDublado,
  LEAD_REAL,
  type RespostasDeChamadas,
  type ServicoDeChamadasDublado,
} from '@/testes/servico-de-chamadas-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

async function abrir(
  respostas: RespostasDeChamadas = {},
  caminho = '/chamadas',
): Promise<ServicoDeChamadasDublado> {
  const chamadas = criarServicoDeChamadasDublado(respostas)
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    caminho,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    chamadas,
  )
  return chamadas
}

/** Três chamadas encerradas e distintas em tudo o que a lista filtra. */
function tresChamadas(): ChamadaDaLista[] {
  return [
    chamadaDaLista(10, { id: 'c-descoberta' }),
    chamadaDaLista(60 * 30, {
      id: 'c-lembrete',
      proposito: 'reminder',
      leadNome: 'Marcos Ferreira',
      numero: '+5521977776666',
      duracaoSeg: 40,
      motivoDoFim: 'voicemail',
      nota: 8.5,
    }),
    chamadaDaLista(60 * 24 * 10, {
      id: 'c-resgate',
      proposito: 'rescue',
      leadNome: 'Joana Prado',
      numero: '+5531966665555',
      duracaoSeg: 400,
      motivoDoFim: 'no_answer',
    }),
  ]
}

async function tabela(): Promise<HTMLElement> {
  return screen.findByRole('table', { name: copy.tabela.rotulo })
}

/** A primeira célula de cada linha do corpo, na ordem em que aparecem. */
function leadsNaTabela(): string[] {
  const corpo = screen.getByRole('table', { name: copy.tabela.rotulo }).querySelector('tbody')
  return [...(corpo?.querySelectorAll('tr') ?? [])].map(
    (linha) => linha.querySelector('td a')?.textContent ?? '',
  )
}

function filtros(): HTMLElement {
  return screen.getByRole('region', { name: copy.filtros.titulo })
}

function escolher(rotulo: string, valor: string) {
  fireEvent.change(within(filtros()).getByLabelText(rotulo, { selector: 'select' }), {
    target: { value: valor },
  })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('/chamadas — os estados', () => {
  it('carregando', async () => {
    await abrir({ listaPendente: true })
    expect(await screen.findByText(copy.carregando)).toBeTruthy()
  })

  it('falha do servidor vira caixa de erro com a frase', async () => {
    await abrir({ listarChamadas: { ok: false, motivo: 'falha-de-comunicacao' } })
    expect(await screen.findByText(copy.falhas['falha-de-comunicacao'])).toBeTruthy()
  })

  it('filtro escrito à mão que a tela não reconhece é recusado sem consultar', async () => {
    const servico = await abrir({ chamadas: tresChamadas() }, '/chamadas?proposito=venda')
    expect(await screen.findByText(copy.falhas['filtro-invalido'])).toBeTruthy()
    expect(servico.recortesDaLista).toEqual([])
  })

  it('conta que nunca ligou aponta para o discador', async () => {
    await abrir({ chamadas: [] })
    expect(await screen.findByText(copy.vazio.titulo)).toBeTruthy()
    const acao = screen.getByRole('link', { name: copy.vazio.acao })
    expect(acao.getAttribute('href')).toBe('/')
  })

  it('recorte sem resultado é o outro vazio, sem o caminho do discador', async () => {
    await abrir({ chamadas: tresChamadas() }, '/chamadas?resultado=busy')
    expect(await screen.findByText(copy.vazioComFiltro.titulo)).toBeTruthy()
    expect(screen.queryByText(copy.vazio.titulo)).toBeNull()
    expect(screen.queryByRole('link', { name: copy.vazio.acao })).toBeNull()
  })
})

describe('/chamadas — a tabela', () => {
  it('desenha as oito colunas, com número, duração, custo e nota na fonte de valor', async () => {
    await abrir({ chamadas: [chamadaDaLista(10, { nota: 8.5 })] })
    const alvo = await tabela()

    const titulos = [...alvo.querySelectorAll('th')].map((th) => th.textContent)
    expect(titulos).toEqual(Object.values(copy.tabela.colunas))

    const celulas = [...alvo.querySelectorAll('tbody td')]
    const porColuna = new Map(titulos.map((titulo, indice) => [titulo, celulas[indice]]))
    const celula = (titulo: string) => {
      const encontrada = porColuna.get(titulo)
      if (!encontrada) throw new Error(`sem célula: ${titulo}`)
      return encontrada
    }

    const lead = within(celula(copy.tabela.colunas.lead) as HTMLElement).getByRole('link', {
      name: LEAD_REAL.nome,
    })
    expect(lead.getAttribute('href')).toMatch(/^\/chamadas\//)

    expect(celula(copy.tabela.colunas.numero).textContent).toBe(LEAD_REAL.telefone)
    expect(celula(copy.tabela.colunas.proposito).textContent).toBe(PROPOSITO_EM_PORTUGUES.discovery)
    expect(celula(copy.tabela.colunas.resultado).textContent).toBe(MOTIVO_DO_FIM.completed)
    expect(celula(copy.tabela.colunas.duracao).textContent).toBe('02:05')
    expect(celula(copy.tabela.colunas.custo).textContent).toMatch(/^US\$\s0,47$/)
    expect(celula(copy.tabela.colunas.nota).textContent).toBe('8,5')

    for (const titulo of [
      copy.tabela.colunas.numero,
      copy.tabela.colunas.duracao,
      copy.tabela.colunas.custo,
      copy.tabela.colunas.nota,
      copy.tabela.colunas.instante,
    ]) {
      expect({ titulo, val: celula(titulo).classList.contains('val') }).toEqual({ titulo, val: true })
    }
  })

  it('custo que não chegou é dito, e não vira zero', async () => {
    await abrir({ chamadas: [chamadaDaLista(10, { parcelas: [] })] })
    await tabela()
    expect(screen.getByText(copy.tabela.semCusto)).toBeTruthy()
    expect(screen.queryByText(/0,00/)).toBeNull()
  })

  // T-16. Sabotagem conferida: pôr `rehearsal` em `DIRECOES_DA_LISTA` derruba
  // este teste.
  it('o ensaio não aparece na lista, e o recorte nem o pede', async () => {
    const servico = await abrir({
      chamadas: [
        chamadaDaLista(10),
        chamadaDaLista(5, { id: 'c-ensaio', direcao: 'rehearsal', leadNome: 'Persona de ensaio' }),
      ],
    })
    await tabela()
    expect(screen.queryByText('Persona de ensaio')).toBeNull()
    expect(leadsNaTabela()).toEqual([LEAD_REAL.nome])
    expect(servico.recortesDaLista.at(-1)?.direcoes).not.toContain('rehearsal')
  })

  it('chamada em curso mostra o estado e a duração correndo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await abrir({
      chamadas: [
        chamadaDaLista(0, {
          status: 'in_progress',
          iniciadaEm: new Date(Date.now() - 65 * 1000).toISOString(),
          duracaoSeg: null,
          motivoDoFim: null,
          parcelas: [],
        }),
      ],
    })
    const alvo = await tabela()
    expect(within(alvo).getByText(aoVivo.status.in_progress ?? '')).toBeTruthy()

    const duracao = () => {
      const indice = Object.values(copy.tabela.colunas).indexOf(copy.tabela.colunas.duracao)
      return alvo.querySelectorAll('tbody td')[indice]?.textContent ?? ''
    }
    const antes = duracao()
    expect(antes).toMatch(/^01:0\d$/)

    vi.advanceTimersByTime(5000)
    await waitFor(() => expect(duracao()).not.toBe(antes))
    expect(duracao()).toMatch(/^01:\d\d$/)
  })

  it('bate no teto e avisa, pedindo recorte mais estreito', async () => {
    await abrir({ chamadas: tresChamadas(), tetoDaLista: 2 })
    await tabela()
    expect(leadsNaTabela()).toHaveLength(2)
    expect(screen.getByRole('status').textContent).toBe(copy.truncada)
  })

  it('abaixo do teto não avisa nada', async () => {
    await abrir({ chamadas: tresChamadas() })
    await tabela()
    expect(screen.queryByText(copy.truncada)).toBeNull()
  })
})

describe('/chamadas — filtros e ordenação', () => {
  it('oferece período, propósito, resultado, número e ordenação, e nada de campanha nem especialista', async () => {
    await abrir({ chamadas: tresChamadas() })
    await tabela()

    const rotulos = [...filtros().querySelectorAll('select')].map((campo) =>
      campo.getAttribute('aria-label'),
    )
    expect(rotulos).toEqual([
      copy.filtros.periodo,
      copy.filtros.proposito,
      copy.filtros.resultado,
      copy.filtros.ordenacao,
    ])
    expect(within(filtros()).getByLabelText(copy.filtros.numero)).toBeTruthy()
    // Só dentro da tela: a barra lateral nomeia Campanhas e Especialistas, e é
    // lá que as fases que os criam vão acendê-los.
    expect(within(filtros()).queryByLabelText(/campanha|especialista/i)).toBeNull()
    expect(within(filtros()).queryByText(/campanha|especialista/i)).toBeNull()
    expect(within(await tabela()).queryByText(/campanha|especialista/i)).toBeNull()
  })

  it('propósito pede o recorte e a lista encolhe', async () => {
    const servico = await abrir({ chamadas: tresChamadas() })
    await tabela()

    escolher(copy.filtros.proposito, 'reminder')

    await waitFor(() => expect(leadsNaTabela()).toEqual(['Marcos Ferreira']))
    expect(servico.recortesDaLista.at(-1)?.proposito).toBe('reminder')
  })

  it('resultado em português pede o end_reason', async () => {
    const servico = await abrir({ chamadas: tresChamadas() })
    await tabela()

    const opcao = within(filtros()).getByRole('option', { name: MOTIVO_DO_FIM.no_answer })
    expect(opcao.getAttribute('value')).toBe('no_answer')
    escolher(copy.filtros.resultado, 'no_answer')

    await waitFor(() => expect(leadsNaTabela()).toEqual(['Joana Prado']))
    expect(servico.recortesDaLista.at(-1)?.resultado).toBe('no_answer')
  })

  it('período recorta pelo instante', async () => {
    const servico = await abrir({ chamadas: tresChamadas() })
    await tabela()

    escolher(copy.filtros.periodo, '7d')

    await waitFor(() => expect(leadsNaTabela()).toEqual([LEAD_REAL.nome, 'Marcos Ferreira']))
    expect(servico.recortesDaLista.at(-1)?.desde).toBeTypeOf('string')
  })

  it('número digitado vira E.164 no recorte e continua escrito no campo', async () => {
    const servico = await abrir({ chamadas: tresChamadas() })
    await tabela()

    const campo = within(filtros()).getByLabelText(copy.filtros.numero) as HTMLInputElement
    fireEvent.change(campo, { target: { value: '(21) 97777-6666' } })
    fireEvent.submit(campo)

    await waitFor(() => expect(leadsNaTabela()).toEqual(['Marcos Ferreira']))
    expect(servico.recortesDaLista.at(-1)?.numero).toBe('+5521977776666')
    expect((within(filtros()).getByLabelText(copy.filtros.numero) as HTMLInputElement).value).toBe(
      '(21) 97777-6666',
    )
  })

  it('ordena por instante, duração e custo', async () => {
    const chamadas = tresChamadas()
    chamadas[2] = { ...chamadas[2]!, parcelas: [{ componente: 'voice', centavos: 99, moeda: 'USD' }] }
    await abrir({ chamadas })
    await tabela()
    expect(leadsNaTabela()).toEqual([LEAD_REAL.nome, 'Marcos Ferreira', 'Joana Prado'])

    escolher(copy.filtros.ordenacao, 'duracao')
    await waitFor(() =>
      expect(leadsNaTabela()).toEqual(['Joana Prado', LEAD_REAL.nome, 'Marcos Ferreira']),
    )

    escolher(copy.filtros.ordenacao, 'custo')
    await waitFor(() => expect(leadsNaTabela()[0]).toBe('Joana Prado'))
  })

  it('limpar filtros volta à lista inteira', async () => {
    await abrir({ chamadas: tresChamadas() }, '/chamadas?proposito=rescue&numero=31')
    await waitFor(() => expect(leadsNaTabela()).toEqual(['Joana Prado']))

    fireEvent.click(within(filtros()).getByRole('button', { name: copy.filtros.limpar }))

    await waitFor(() => expect(leadsNaTabela()).toHaveLength(3))
    expect((within(filtros()).getByLabelText(copy.filtros.numero) as HTMLInputElement).value).toBe('')
  })
})
