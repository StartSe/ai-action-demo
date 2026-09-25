// O que a marcação do desfecho precisa provar na tela (US-181, RF-512 e
// RF-516): os três desfechos marcados na ficha, o motivo obrigatório no
// cancelamento, a confirmação antes de trocar um desfecho já apurado (e as
// duas marcações no histórico com autor), a leitura do viewer, a reunião que
// ninguém apurou mostrada como não apurada e nunca como falta, e a marcação
// também pela lista.
//
// O dublê de reuniões aplica as regras de `marcar_desfecho_da_reuniao` por
// conta própria, sem a validação da tela: é o que faz "a tela não mandou" e
// "o banco recusou" serem casos diferentes aqui.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { reunioes } from '@/copy/reunioes'
import type { Papel } from '@/equipe/tipos'
import type { FichaDaReuniao, ReuniaoDaLista } from '@/reunioes/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import { criarServicoDeEquipeDublado, equipeDeExemplo } from '@/testes/servico-de-equipe-dublado'
import {
  criarServicoDeReunioesDublado,
  fichaDaReuniao,
  reuniaoDaLista,
  type RespostasDeReunioes,
  type ServicoDeReunioesDublado,
} from '@/testes/servico-de-reunioes-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const copy = reunioes.desfecho
const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

async function abrir(
  respostas: RespostasDeReunioes,
  { caminho = '/reunioes/r-1', papel = 'admin' as Papel } = {},
): Promise<ServicoDeReunioesDublado> {
  const servico = criarServicoDeReunioesDublado(respostas)
  const equipe = criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: equipeDeExemplo(papel) } })
  // Os dezesseis serviços entre a equipe e as reuniões ficam no dublê padrão.
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    caminho,
    equipe,
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
    servico,
  )
  return servico
}

function secao(): HTMLElement {
  return screen.getByRole('region', { name: copy.titulo })
}

function dialogo(): HTMLElement {
  return screen.getByRole('dialog')
}

async function escolher(desfecho: keyof typeof copy.escolha.opcoes, motivo?: string) {
  fireEvent.click(within(secao()).getByRole('button', { name: copy.marcar }))
  fireEvent.click(within(dialogo()).getByRole('radio', { name: new RegExp(copy.escolha.opcoes[desfecho]) }))
  if (motivo !== undefined) {
    fireEvent.change(within(dialogo()).getByLabelText(copy.escolha.motivo), { target: { value: motivo } })
  }
  fireEvent.click(within(dialogo()).getByRole('button', { name: copy.escolha.confirmar }))
}

/** Reunião que já passou, que ninguém apurou. */
function passada(extras: Partial<FichaDaReuniao> = {}): FichaDaReuniao {
  return fichaDaReuniao({ inicio: '2026-09-29T17:00:00Z', fim: '2026-09-29T17:30:00Z', ...extras })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('/reunioes/:id, o desfecho', () => {
  it('reunião que ninguém apurou diz "não apurada", e nunca falta, mesmo depois do horário', async () => {
    await abrir({ fichas: [passada()] })

    await screen.findByRole('region', { name: copy.titulo })
    expect(within(secao()).getByText(reunioes.apuracoes.pending)).toBeTruthy()
    expect(within(secao()).getByText(copy.naoApurada)).toBeTruthy()
    expect(within(secao()).queryByText(reunioes.estados.no_show)).toBeNull()
    expect(within(secao()).queryByRole('list', { name: copy.historico })).toBeNull()
  })

  it.each([
    ['attended', undefined, null],
    ['no_show', undefined, null],
    ['canceled', 'O lead pediu para desmarcar.', 'O lead pediu para desmarcar.'],
  ] as const)('marca %s, e a ficha relida mostra o desfecho apurado e a marcação', async (desfecho, motivo, gravado) => {
    const servico = await abrir({ fichas: [passada()] })
    await screen.findByRole('region', { name: copy.titulo })

    await escolher(desfecho, motivo)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(servico.desfechosPedidos).toEqual([
      { reuniaoId: 'r-1', desfecho, motivo: gravado, sobrescrever: false },
    ])
    await within(secao()).findByText(copy.apurada(reunioes.estados[desfecho]))
    const historico = within(secao()).getByRole('list', { name: copy.historico })
    expect(within(historico).getByText(new RegExp(`^${reunioes.estados[desfecho]}, por Renata Alves em `))).toBeTruthy()
    // A ficha foi lida de novo depois da marcação.
    expect(servico.fichasPedidas).toEqual(['r-1', 'r-1'])
  })

  it('cancelar sem motivo não vai ao banco e diz o que falta', async () => {
    const servico = await abrir({ fichas: [passada()] })
    await screen.findByRole('region', { name: copy.titulo })

    await escolher('canceled', '   ')

    expect(within(dialogo()).getByText(copy.recusas['motivo-obrigatorio'])).toBeTruthy()
    expect(servico.desfechosPedidos).toEqual([])

    fireEvent.change(within(dialogo()).getByLabelText(copy.escolha.motivo), { target: { value: 'Especialista doente.' } })
    fireEvent.click(within(dialogo()).getByRole('button', { name: copy.escolha.confirmar }))
    await waitFor(() => expect(servico.desfechosPedidos).toHaveLength(1))
    expect(servico.desfechosPedidos[0]).toMatchObject({ desfecho: 'canceled', motivo: 'Especialista doente.' })
  })

  it('reunião já apurada pede confirmação antes de trocar, e as duas marcações ficam com autor', async () => {
    const apurada = passada({
      estado: 'no_show',
      apuracao: 'attested',
      marcacoes: [
        { instante: '2026-09-29T18:00:00Z', autorId: 'u-2', desfecho: 'no_show', motivo: null, sobrescreveu: false },
      ],
    })
    const servico = await abrir({ fichas: [apurada] })
    await screen.findByRole('region', { name: copy.titulo })

    // Manter como está não muda nada.
    fireEvent.click(within(secao()).getByRole('button', { name: copy.marcar }))
    expect(within(dialogo()).getByText(copy.troca.explicacao(reunioes.estados.no_show))).toBeTruthy()
    fireEvent.click(within(dialogo()).getByRole('button', { name: copy.troca.cancelar }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(servico.desfechosPedidos).toEqual([])

    fireEvent.click(within(secao()).getByRole('button', { name: copy.marcar }))
    fireEvent.click(within(dialogo()).getByRole('button', { name: copy.troca.confirmar }))
    fireEvent.click(within(dialogo()).getByRole('radio', { name: new RegExp(copy.escolha.opcoes.attended) }))
    fireEvent.click(within(dialogo()).getByRole('button', { name: copy.escolha.confirmar }))

    await waitFor(() => expect(servico.desfechosPedidos).toHaveLength(1))
    expect(servico.desfechosPedidos[0]).toMatchObject({ desfecho: 'attended', sobrescrever: true })
    await within(secao()).findByText(copy.apurada(reunioes.estados.attended))
    const itens = within(within(secao()).getByRole('list', { name: copy.historico })).getAllByRole('listitem')
    expect(itens.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^Falta, por Caio Moreira em /),
      expect.stringMatching(new RegExp(`^Realizada, por Renata Alves em .*${copy.sobrescreveu}$`)),
    ])
  })

  it('outra pessoa apurou no meio: o banco devolve ja-apurada e a tela volta à confirmação', async () => {
    const servico = await abrir({ fichas: [passada()], marcarDesfecho: { ok: false, motivo: 'ja-apurada' } })
    await screen.findByRole('region', { name: copy.titulo })

    await escolher('attended')

    // O diálogo da escolha sai e entra o da troca: a busca é na tela inteira.
    await screen.findByText(copy.recusas['ja-apurada'])
    expect(within(dialogo()).getByRole('button', { name: copy.troca.confirmar })).toBeTruthy()
    expect(servico.desfechosPedidos).toEqual([
      { reuniaoId: 'r-1', desfecho: 'attended', motivo: null, sobrescrever: false },
    ])
  })

  it('recusa do banco aparece no diálogo com a frase dela', async () => {
    await abrir({ fichas: [passada()], marcarDesfecho: { ok: false, motivo: 'sem-papel' } })
    await screen.findByRole('region', { name: copy.titulo })

    await escolher('no_show')

    expect((await within(dialogo()).findByRole('alert')).textContent).toBe(copy.recusas['sem-papel'])
  })

  it('o viewer vê o desfecho e o histórico, sem o botão de marcar', async () => {
    const apurada = passada({
      estado: 'attended',
      apuracao: 'attested',
      marcacoes: [
        { instante: '2026-09-29T18:00:00Z', autorId: 'u-2', desfecho: 'attended', motivo: null, sobrescreveu: false },
      ],
    })
    await abrir({ fichas: [apurada] }, { papel: 'viewer' })

    await screen.findByRole('region', { name: copy.titulo })
    await within(secao()).findByText(copy.somenteLeitura)
    expect(within(secao()).queryByRole('button', { name: copy.marcar })).toBeNull()
    expect(within(secao()).getByRole('list', { name: copy.historico })).toBeTruthy()
  })

  it('marcação de quem saiu da equipe e de rotina têm autor escrito', async () => {
    const ficha = passada({
      estado: 'attended',
      apuracao: 'attested',
      marcacoes: [
        { instante: '2026-09-29T18:00:00Z', autorId: 'u-antigo', desfecho: 'no_show', motivo: null, sobrescreveu: false },
        { instante: '2026-09-29T19:00:00Z', autorId: null, desfecho: 'attended', motivo: 'Veio atrasado.', sobrescreveu: true },
      ],
    })
    await abrir({ fichas: [ficha] })

    await screen.findByRole('region', { name: copy.titulo })
    const historico = within(secao()).getByRole('list', { name: copy.historico })
    expect(within(historico).getByText(new RegExp(`por ${copy.autorDesconhecido} em`))).toBeTruthy()
    expect(within(historico).getByText(new RegExp(`por ${copy.autorDoSistema} em`))).toBeTruthy()
    expect(within(historico).getByText(copy.motivo('Veio atrasado.'))).toBeTruthy()
  })
})

describe('/reunioes, o desfecho na lista', () => {
  // Quinta, 1º de outubro de 2026, meio-dia em São Paulo. Só `Date` é falso.
  function naQuinta() {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T15:00:00Z'))
  }

  function daLista(): ReuniaoDaLista[] {
    return [
      // Terça, já passou, ninguém apurou.
      reuniaoDaLista({ id: 'r-passada', inicio: '2026-09-29T17:00:00Z', fim: '2026-09-29T17:30:00Z' }),
      // Sexta, ainda vai acontecer.
      reuniaoDaLista({
        id: 'r-futura',
        inicio: '2026-10-02T17:00:00Z',
        fim: '2026-10-02T17:30:00Z',
        lead: { id: 'l-2', nome: 'Diego Prates', temEmail: true },
      }),
    ]
  }

  function linhaDe(nome: string): HTMLElement {
    const tabela = screen.getByRole('table', { name: reunioes.tabela.rotulo })
    return within(tabela).getByText(nome).closest('tr') as HTMLElement
  }

  it('a passada sem marcação diz não apurada; a futura, nada; e a marcação sai da linha', async () => {
    naQuinta()
    const servico = await abrir({ reunioes: daLista() }, { caminho: '/reunioes?vista=lista&periodo=tudo' })

    await screen.findByRole('table', { name: reunioes.tabela.rotulo })
    expect(within(linhaDe('Carla Menezes')).getByText(reunioes.apuracoes.pending)).toBeTruthy()
    expect(within(linhaDe('Diego Prates')).queryByText(reunioes.apuracoes.pending)).toBeNull()

    fireEvent.click(within(linhaDe('Carla Menezes')).getByRole('button', { name: copy.marcar }))
    fireEvent.click(within(dialogo()).getByRole('radio', { name: new RegExp(copy.escolha.opcoes.no_show) }))
    fireEvent.click(within(dialogo()).getByRole('button', { name: copy.escolha.confirmar }))

    await waitFor(() => expect(servico.desfechosPedidos).toEqual([
      { reuniaoId: 'r-passada', desfecho: 'no_show', motivo: null, sobrescrever: false },
    ]))
    await waitFor(() => expect(within(linhaDe('Carla Menezes')).getByText(reunioes.apuracoes.attested)).toBeTruthy())
    expect(within(linhaDe('Carla Menezes')).getByText(reunioes.estados.no_show)).toBeTruthy()
  })

  it('o viewer vê a lista sem o botão de marcar', async () => {
    naQuinta()
    await abrir({ reunioes: daLista() }, { caminho: '/reunioes?vista=lista&periodo=tudo', papel: 'viewer' })

    await screen.findByRole('table', { name: reunioes.tabela.rotulo })
    expect(screen.queryAllByRole('button', { name: copy.marcar })).toEqual([])
    expect(within(linhaDe('Carla Menezes')).getByText(reunioes.apuracoes.pending)).toBeTruthy()
  })
})
