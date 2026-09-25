// O discador manual e o acompanhamento das chamadas, no painel (US-090).
//
// O dublê de chamadas decide pela guarda de verdade: `guardarDiscagem`, o
// módulo que `call-place` usa, com a camada de dados em memória. É o que faz
// as duas recusas que o critério cobra por nome (22h no fuso do lead e número
// bloqueado) serem a frase do sistema, e não um texto escrito para o teste.
//
// Três asserções justificam o arquivo:
//
// - **A recusa fica.** Passam dez minutos de relógio e ela continua em
//   `role="alert"`; só some quando a pessoa a fecha ou tenta de novo.
// - **Portão fechado não tem contorno pela tela.** O lead real não é oferecido,
//   e o pedido para ele feito direto ao serviço volta recusado pela guarda.
// - **Dois cliques, uma ligação.** Os dois cliques no mesmo quadro mandam um
//   pedido só, e a chave de idempotência é um uuid gerado no cliente.

import { fraseDaJanela, fraseDaProximaAbertura } from '@compartilhado/discagem/janela.ts'
import { JANELA_COMERCIAL } from '@compartilhado/discagem/casos-de-janela.ts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProvedorDeChamadas } from '@/chamadas/provedor'
import { Discador } from '@/componentes/discador'
import {
  aoVivo as copyAoVivo,
  discador as copy,
  estimativaDeCusto as copyDaEstimativa,
} from '@/copy/chamadas'
import { ProvedorDeEquipe } from '@/equipe/provedor'
import type { Papel } from '@/equipe/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  chamadaAoVivo,
  criarServicoDeChamadasDublado,
  FUSO_DA_CONTA,
  LEAD_REAL,
  NUMERO_DE_TESTE,
  type RespostasDeChamadas,
  type ServicoDeChamadasDublado,
} from '@/testes/servico-de-chamadas-dublado'
import {
  criarServicoDeEquipeDublado,
  equipeDeExemplo,
} from '@/testes/servico-de-equipe-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Terça, 6 de outubro de 2026, às 22h em Manaus (23h em São Paulo). */
const TERCA_AS_22H_EM_MANAUS = '2026-10-07T02:00:00.000Z'

function equipeCom(papel: Papel) {
  return criarServicoDeEquipeDublado({
    carregar: { ok: true, equipe: equipeDeExemplo(papel) },
  })
}

async function abrir(respostas: RespostasDeChamadas = {}, papel: Papel = 'operator') {
  const chamadas = criarServicoDeChamadasDublado(respostas)
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/',
    equipeCom(papel),
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

function botaoLigar() {
  return screen.getByRole('button', { name: copy.discar }) as HTMLButtonElement
}

function recusa() {
  return screen
    .queryAllByRole('alert')
    .find((alerta) => alerta.textContent?.includes(copy.recusaTitulo))
}

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('/ — o discador manual', () => {
  it('mostra a espera enquanto o discador carrega', async () => {
    await abrir({ discadorPendente: true })

    expect(await screen.findByText(copy.carregando)).toBeTruthy()
  })

  it('diz a falha do servidor quando a carga não volta', async () => {
    await abrir({ carregarDiscador: { ok: false, motivo: 'falha-de-comunicacao' } })

    expect(await screen.findByText(copy.falhas['falha-de-comunicacao'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: copy.discar })).toBeNull()
  })

  it('sem número de teste, o vazio aponta onde cadastrar', async () => {
    await abrir({ discador: { numerosDeTeste: [] } })

    const cadastrar = await screen.findByRole('link', { name: copy.vazio.acao })
    expect(cadastrar.getAttribute('href')).toBe('/config/discagem')
    expect(screen.queryByRole('button', { name: copy.discar })).toBeNull()
  })

  it('com o portão fechado, oferece só a lista de teste, diz por quê e onde cadastrar', async () => {
    await abrir()

    const destino = (await screen.findByLabelText(copy.destino)) as HTMLSelectElement
    const opcoes = [...destino.options].map((opcao) => opcao.textContent)
    expect(opcoes).toEqual([copy.destinoRotulo(copy.deTeste('Celular da Renata'), NUMERO_DE_TESTE)])
    expect(opcoes.join(' ')).not.toContain(LEAD_REAL.nome)

    expect(screen.getByText(copy.portaoFechado.titulo)).toBeTruthy()
    expect(screen.getByText(copy.portaoFechado.falta.liberacao_da_fase)).toBeTruthy()
    expect(screen.getByText(copy.portaoFechado.falta.primeira_chamada_de_teste)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: copy.portaoFechado.cadastrar }).getAttribute('href'),
    ).toBe('/config/discagem')
  })

  it('com o portão aberto, o lead real entra na lista', async () => {
    await abrir({
      discador: {
        portao: {
          realDialing: true,
          primeiraChamadaDeTesteEm: '2026-09-20T12:00:00Z',
          numerosDeTeste: [NUMERO_DE_TESTE],
        },
      },
    })

    const destino = (await screen.findByLabelText(copy.destino)) as HTMLSelectElement
    expect([...destino.options].map((opcao) => opcao.value)).toEqual([
      `teste:${NUMERO_DE_TESTE}`,
      `lead:${LEAD_REAL.id}`,
    ])
    expect(screen.queryByText(copy.portaoFechado.titulo)).toBeNull()
  })

  it('liga com o propósito e a origem escolhidos, e a chave é um uuid do cliente', async () => {
    const chamadas = await abrir()

    fireEvent.change(await screen.findByLabelText(copy.proposito), {
      target: { value: 'reminder' },
    })
    fireEvent.change(screen.getByLabelText(copy.origem), { target: { value: 'l-1' } })
    fireEvent.click(botaoLigar())

    expect(await screen.findByText('A ligação foi para a linha e está discando.')).toBeTruthy()
    expect(chamadas.pedidos).toEqual([
      {
        telefone: NUMERO_DE_TESTE,
        leadId: null,
        proposito: 'reminder',
        linhaId: 'l-1',
        referencia: expect.stringMatching(UUID),
      },
    ])
  })

  it('dois cliques no mesmo quadro fazem uma ligação só', async () => {
    const chamadas = await abrir()
    const ligar = await screen.findByRole('button', { name: copy.discar })

    act(() => {
      ligar.click()
      ligar.click()
    })

    await screen.findByText('A ligação foi para a linha e está discando.')
    expect(chamadas.ligacoes.size).toBe(1)
    expect(new Set(chamadas.pedidos.map((pedido) => pedido.referencia)).size).toBe(1)
  })

  it('enquanto a ligação viaja, o botão fica fora de alcance', async () => {
    const chamadas = await abrir({ segurarDiscagem: true })

    fireEvent.click(await screen.findByRole('button', { name: copy.discar }))
    const esperando = screen.getByRole('button', { name: copy.discando }) as HTMLButtonElement
    expect(esperando.disabled).toBe(true)

    act(() => chamadas.liberarDiscagem())
    await screen.findByText('A ligação foi para a linha e está discando.')
    expect(botaoLigar().disabled).toBe(false)
  })

  it('às 22h no fuso do lead, a recusa cita a janela no fuso dele e a próxima abertura', async () => {
    await abrir({
      janela: JANELA_COMERCIAL,
      fusos: { [NUMERO_DE_TESTE]: 'America/Manaus' },
      agora: () => TERCA_AS_22H_EM_MANAUS,
    })

    fireEvent.click(await screen.findByRole('button', { name: copy.discar }))

    await waitFor(() => expect(recusa()).toBeTruthy())
    const entrada = {
      janela: JANELA_COMERCIAL,
      instante: TERCA_AS_22H_EM_MANAUS,
      fusoDoLead: 'America/Manaus',
      fusoDaConta: FUSO_DA_CONTA,
    }
    const texto = recusa()?.textContent ?? ''
    expect(texto).toContain(`Agora está fora da janela de discagem deste lead: ${fraseDaJanela(entrada)}.`)
    expect(texto).toContain('no horário de')
    expect(texto).toContain(`A janela abre de novo ${fraseDaProximaAbertura(entrada)}.`)
  })

  it('número bloqueado é recusado com o motivo e a alternativa', async () => {
    await abrir({ bloqueados: [NUMERO_DE_TESTE] })

    fireEvent.click(await screen.findByRole('button', { name: copy.discar }))

    await waitFor(() => expect(recusa()).toBeTruthy())
    const texto = recusa()?.textContent ?? ''
    expect(texto).toContain('Este número está na lista de não perturbe desta conta.')
    expect(texto).toContain('tire o número da lista em Bloqueios')
  })

  it('a recusa não desaparece sozinha: dez minutos depois ela continua lá', async () => {
    // O relógio falso entra ANTES do clique: um temporizador agendado no
    // relógio real não anda com `advanceTimersByTime`, e o teste passaria com
    // a recusa programada para sumir. `shouldAdvanceTime` deixa a espera das
    // consultas correr no tempo de verdade até lá.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await abrir({ bloqueados: [NUMERO_DE_TESTE] })
    fireEvent.click(await screen.findByRole('button', { name: copy.discar }))
    await waitFor(() => expect(recusa()).toBeTruthy())

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000)
    })

    expect(recusa()).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: copy.fecharRecusa }))
    expect(recusa()).toBeUndefined()
  })

  it('com o freio puxado, recusa antes de chamar o servidor', async () => {
    const chamadas = await abrir({
      freio: { em: '2026-09-23T12:00:00Z', por: 'Selma Dias', motivo: 'Reclamação de cliente' },
    })

    fireEvent.click(await screen.findByRole('button', { name: copy.discar }))

    await waitFor(() => expect(recusa()).toBeTruthy())
    expect(recusa()?.textContent).toContain(copy.bloqueio.freio_puxado.mensagem)
    expect(chamadas.pedidos).toEqual([])
  })

  it('antes de ligar, estima o custo pelo que a conta mediu, cada moeda separada (D-14)', async () => {
    await abrir({
      estimativa: {
        ok: true,
        estimativa: {
          ligacoesMedidas: 12,
          duracaoMediaSeg: 90,
          porLigacao: [
            { moeda: 'BRL', centavos: 30 },
            { moeda: 'USD', centavos: 23 },
          ],
          porMinuto: [
            { moeda: 'BRL', centavos: 20 },
            { moeda: 'USD', centavos: 15 },
          ],
        },
      },
    })

    const nota = await screen.findByRole('note', { name: copyDaEstimativa.titulo })
    const texto = nota.textContent ?? ''
    expect(texto).toMatch(/Cerca de R\$\s0,30 \+ US\$\s0,23 por ligação, ou R\$\s0,20 \+ US\$\s0,15 por minuto\./)
    expect(texto).toContain('das últimas 12 ligações atendidas desta conta, com 1 min 30 s de conversa')
    expect(texto).toContain(copyDaEstimativa.aviso)
  })

  it('sem ligação medida, diz que a estimativa vem depois da primeira e não inventa preço (D-14)', async () => {
    await abrir()

    const nota = await screen.findByRole('note', { name: copyDaEstimativa.titulo })
    expect(nota.textContent).toContain(copyDaEstimativa.semAmostra)
    expect(nota.textContent).not.toMatch(/R\$|US\$/)
  })

  it('se a estimativa não carrega, o discador liga do mesmo jeito (D-14)', async () => {
    const chamadas = await abrir({ estimativa: { ok: false, motivo: 'falha-de-comunicacao' } })

    fireEvent.click(await screen.findByRole('button', { name: copy.discar }))
    await waitFor(() => expect(chamadas.pedidos).toHaveLength(1))
    expect(screen.queryByRole('note', { name: copyDaEstimativa.titulo })).toBeNull()
  })

  it('o viewer vê o discador em leitura, com a negativa explícita e sem botão', async () => {
    await abrir({}, 'viewer')

    expect(await screen.findByText(copy.negativa)).toBeTruthy()
    expect(screen.queryByRole('button', { name: copy.discar })).toBeNull()
  })
})

describe('o portão fechado não tem contorno pela tela', () => {
  function renderizarComLead(chamadas: ServicoDeChamadasDublado) {
    const clienteDeConsulta = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <ProvedorDeEquipe servico={equipeCom('operator')}>
        <ProvedorDeChamadas servico={chamadas}>
          <QueryClientProvider client={clienteDeConsulta}>
            <Discador lead={LEAD_REAL} />
          </QueryClientProvider>
        </ProvedorDeChamadas>
      </ProvedorDeEquipe>,
    )
  }

  it('na ficha de um lead real, o discador diz por que não liga e não oferece o botão', async () => {
    renderizarComLead(criarServicoDeChamadasDublado())

    expect(await screen.findByText(copy.portaoFechado.leadForaDaLista)).toBeTruthy()
    expect(screen.queryByRole('button', { name: copy.discar })).toBeNull()
  })

  it('o pedido para o lead real feito direto ao serviço volta recusado pela guarda', async () => {
    const chamadas = criarServicoDeChamadasDublado()

    const resultado = await chamadas.discar({
      telefone: LEAD_REAL.telefone,
      leadId: LEAD_REAL.id,
      proposito: 'discovery',
      linhaId: null,
      referencia: crypto.randomUUID(),
    })

    expect(resultado).toMatchObject({ ok: false, motivo: 'portao_de_lead_real' })
    expect(resultado.ok ? '' : resultado.mensagem).toContain(
      'Por enquanto a assistente só liga para os números de teste da conta.',
    )
    // A guarda foi consultada e não liberou: a recusa é do sistema.
    expect(chamadas.consultasDaGuarda.map((consulta) => consulta.p_phone_e164)).toEqual([
      LEAD_REAL.telefone,
    ])
    expect(chamadas.ligacoes.size).toBe(0)
  })

  it('na ficha de um lead com número de teste, o discador liga para ele', async () => {
    const chamadas = criarServicoDeChamadasDublado()
    const clienteDeConsulta = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <ProvedorDeEquipe servico={equipeCom('operator')}>
        <ProvedorDeChamadas servico={chamadas}>
          <QueryClientProvider client={clienteDeConsulta}>
            <Discador lead={{ id: 'lead-9', nome: 'Renata Alves', telefone: '(11) 99999-0001' }} />
          </QueryClientProvider>
        </ProvedorDeChamadas>
      </ProvedorDeEquipe>,
    )

    fireEvent.click(await screen.findByRole('button', { name: copy.discar }))

    await screen.findByText('A ligação foi para a linha e está discando.')
    expect(chamadas.pedidos.map((pedido) => [pedido.telefone, pedido.leadId])).toEqual([
      [NUMERO_DE_TESTE, 'lead-9'],
    ])
  })
})

describe('/ — as chamadas em andamento', () => {
  function lista() {
    return screen.getByRole('list', { name: copyAoVivo.lista })
  }

  it('mostra a espera antes da primeira lista chegar', async () => {
    await abrir({ aoVivoPendente: true })

    expect(await screen.findByText(copyAoVivo.carregando)).toBeTruthy()
  })

  it('sem chamada em curso, diz que não há nenhuma', async () => {
    await abrir()

    expect(await screen.findByText(copyAoVivo.vazio)).toBeTruthy()
  })

  it('diz quando a assinatura cai', async () => {
    await abrir({ aoVivoFalha: true })

    expect(await screen.findByText(copyAoVivo.erro)).toBeTruthy()
  })

  it('o que chega pela assinatura aparece, e a lista acompanha cada atualização', async () => {
    const chamadas = await abrir({ aoVivo: [chamadaAoVivo(65)] })

    await screen.findByRole('list', { name: copyAoVivo.lista })
    expect(within(lista()).getByText('Em conversa')).toBeTruthy()
    expect(within(lista()).getByLabelText(copyAoVivo.duracao).textContent).toMatch(/^1:0[5-9]$/)

    act(() =>
      chamadas.empurrar([
        chamadaAoVivo(65),
        chamadaAoVivo(3, { chamadaId: 'ch-2', status: 'ringing', proposito: 'rescue', leadId: null }),
      ]),
    )
    expect(within(lista()).getAllByRole('listitem')).toHaveLength(2)
    expect(within(lista()).getByText('Chamando')).toBeTruthy()

    act(() => chamadas.empurrar([]))
    expect(screen.getByText(copyAoVivo.vazio)).toBeTruthy()
  })

  it('a duração corre sem nova atualização do servidor', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'Date'], now: Date.parse('2026-09-23T12:00:00Z') })
    await abrir({ aoVivo: [chamadaAoVivo(10)] })

    await screen.findByRole('list', { name: copyAoVivo.lista })
    expect(within(lista()).getByLabelText(copyAoVivo.duracao).textContent).toBe('0:10')

    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(within(lista()).getByLabelText(copyAoVivo.duracao).textContent).toBe('0:15')
  })

  it('encerrar uma chamada chama call-cancel para ela e diz o que aconteceu', async () => {
    const chamadas = await abrir({ aoVivo: [chamadaAoVivo(30)] })

    fireEvent.click(
      await screen.findByRole('button', { name: copyAoVivo.rotuloDoEncerrar('Descoberta') }),
    )

    expect(
      await screen.findByText(
        'Chamada sendo encerrada. A ficha é atualizada quando a telefonia confirmar o fim.',
      ),
    ).toBeTruthy()
    expect(chamadas.encerradas).toEqual(['ch-1'])
  })

  it('o viewer acompanha sem o botão de encerrar', async () => {
    await abrir({ aoVivo: [chamadaAoVivo(30)] }, 'viewer')

    await screen.findByRole('list', { name: copyAoVivo.lista })
    expect(
      screen.queryByRole('button', { name: copyAoVivo.rotuloDoEncerrar('Descoberta') }),
    ).toBeNull()
  })
})
