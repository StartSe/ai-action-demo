// O tutorial conduz até a primeira ligação de teste (US-255), a etapa do
// assistente de abertura depois do número. O que se prova:
//
// 1. **Sem número de teste, o passo mostra o cadastro**; com ele, o botão de
//    ligar, sem recarregar.
// 2. **Ligar é o serviço do discador**, com o propósito de descoberta e o
//    número de teste, e a recusa aparece com a frase do sistema e o passo que
//    a resolve, quando há um.
// 3. **O estado ao vivo vem da assinatura de `call_live`**, e ao fim o passo
//    mostra a ficha e declara a ligação no progresso.
// 4. **Fora da janela** o passo avisa antes do botão e a recusa aponta
//    Discagem, onde a janela se ajusta, e não um passo do assistente (D-11).

import { JANELA_COMERCIAL } from '@compartilhado/discagem/casos-de-janela.ts'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { configuracaoInicial as copyDaConfiguracao } from '@/copy/configuracao-inicial'
import { textosDoInicio } from '@/copy/inicio'
import {
  aoVivo as copyDoAoVivo,
  discador as copyDoDiscador,
  estimativaDeCusto as copyDaEstimativa,
} from '@/copy/chamadas'
import { discagem as copyDaDiscagem } from '@/copy/discagem'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  NUMERO_DE_TESTE,
  chamadaAoVivo,
  criarServicoDeChamadasDublado,
  type RespostasDeChamadas,
  type ServicoDeChamadasDublado,
} from '@/testes/servico-de-chamadas-dublado'
import {
  criarServicoDeConfiguracaoDublado,
  passosConcluidos,
  type RespostasDaConfiguracao,
  type ServicoDeConfiguracaoDublado,
} from '@/testes/servico-de-configuracao-dublado'
import {
  criarServicoDeDiscagemDublado,
  type ServicoDeDiscagemDublado,
} from '@/testes/servico-de-discagem-dublado'
import {
  criarServicoDeIntegracoesDublado,
  integracoesDeExemplo,
} from '@/testes/servico-de-integracoes-dublado'
import { criarServicoDaSarahDublado } from '@/testes/servico-da-sarah-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const copy = copyDaConfiguracao.ligacao
/** A assistente da conta dos dublês já tem nome, e o tutorial a chama por ele. */
const copyDoInicio = textosDoInicio('Sarah')
const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }
const NUMERO = { id: 't-1', e164: NUMERO_DE_TESTE, rotulo: 'Celular da Renata' }

afterEach(cleanup)

interface Cenario {
  configuracao?: RespostasDaConfiguracao
  chamadas?: RespostasDeChamadas
  numeros?: (typeof NUMERO)[]
}

async function abrir(cenario: Cenario = {}): Promise<{
  configuracao: ServicoDeConfiguracaoDublado
  chamadas: ServicoDeChamadasDublado
  discagem: ServicoDeDiscagemDublado
}> {
  const configuracao = criarServicoDeConfiguracaoDublado(
    cenario.configuracao ?? { passos: passosConcluidos() },
  )
  const chamadas = criarServicoDeChamadasDublado(cenario.chamadas)
  const discagem = criarServicoDeDiscagemDublado({
    numerosDeTeste: cenario.numeros ?? [NUMERO],
  })
  // As três conexões feitas: o assistente abre no que o catálogo diz faltar.
  const integracoes = criarServicoDeIntegracoesDublado({
    integracoes: integracoesDeExemplo().map((item) => ({
      ...item,
      estado: 'conectado' as const,
      configurado: true,
      conectado: true,
      erro: null,
    })),
  })
  const sarah = criarServicoDaSarahDublado({
    modelo: {
      porta: 'openrouter',
      conectadoEm: '2026-09-24T10:00:00.000Z',
      finalDaChave: 'a1b2',
      escolhas: { draft: null, classify: null, review: null, imagem: null, audio: null },
    },
  })
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/configuracao-inicial',
    undefined,
    undefined,
    integracoes,
    configuracao,
    undefined,
    sarah,
    undefined,
    chamadas,
    discagem,
  )
  await screen.findByRole('heading', { level: 1 })
  return { configuracao, chamadas, discagem }
}

function assistente() {
  return within(screen.getByRole('dialog', { name: copyDoInicio.rotulo }))
}

async function botaoDeLigar(): Promise<HTMLButtonElement> {
  const botao = await screen.findByRole('button', { name: copy.ligar })
  await waitFor(() => expect((botao as HTMLButtonElement).disabled).toBe(false))
  return botao as HTMLButtonElement
}

describe('primeira ligação de teste no tutorial', () => {
  it('com o resto feito, o assistente abre na primeira ligação, com a razão antes', async () => {
    await abrir()

    expect(
      await screen.findByRole('heading', { name: copyDoInicio.etapas.ligacao.titulo }),
    ).toBeDefined()
    expect(assistente().getByText(copyDoInicio.ligacao.porQue)).toBeDefined()
  })

  it('sem número de teste mostra o cadastro, e o número cadastrado libera o botão', async () => {
    const { discagem } = await abrir({ numeros: [] })

    expect(await screen.findByText(copy.semNumero)).toBeDefined()
    expect(screen.queryByRole('button', { name: copy.ligar })).toBeNull()

    fireEvent.change(
      screen.getByLabelText(copyDaDiscagem.numerosDeTeste.numero.rotulo),
      { target: { value: NUMERO_DE_TESTE } },
    )
    fireEvent.change(
      screen.getByLabelText(copyDaDiscagem.numerosDeTeste.rotuloDoNumero.rotulo),
      { target: { value: 'Meu celular' } },
    )
    fireEvent.click(
      screen.getByRole('button', { name: copyDaDiscagem.numerosDeTeste.acao }),
    )

    await botaoDeLigar()
    expect(discagem.numerosCadastrados.map((numero) => numero.e164)).toEqual([
      NUMERO_DE_TESTE,
    ])
    expect(screen.queryByText(copy.semNumero)).toBeNull()
  })

  it('liga pelo serviço do discador, com descoberta e o número de teste', async () => {
    const { chamadas } = await abrir()

    fireEvent.click(await botaoDeLigar())

    await waitFor(() => expect(chamadas.pedidos).toHaveLength(1))
    expect(chamadas.pedidos[0]).toMatchObject({
      telefone: NUMERO_DE_TESTE,
      leadId: null,
      proposito: 'discovery',
      linhaId: null,
    })
    // A guarda foi consultada: o caminho é o mesmo de `call-place`.
    expect(chamadas.consultasDaGuarda).toHaveLength(1)
  })

  it('mostra o estado ao vivo e, ao fim, a ficha, e declara a ligação', async () => {
    const { chamadas, configuracao } = await abrir()

    fireEvent.click(await botaoDeLigar())
    await waitFor(() => expect(chamadas.pedidos).toHaveLength(1))

    // A primeira lista da assinatura já traz a chamada que `call-place` gravou.
    chamadas.empurrar([
      chamadaAoVivo(5, { chamadaId: 'ch-1', status: 'ringing', leadId: null }),
    ])
    expect(await screen.findByText(copyDoAoVivo.status.ringing ?? '')).toBeDefined()
    expect(screen.getByLabelText(copy.duracao)).toBeDefined()

    chamadas.empurrar([
      chamadaAoVivo(20, { chamadaId: 'ch-1', status: 'in_progress', leadId: null }),
    ])
    expect(await screen.findByText(copyDoAoVivo.status.in_progress ?? '')).toBeDefined()
    expect(configuracao.progressos).toHaveLength(0)

    chamadas.empurrar([])

    const ficha = await screen.findByRole('link', { name: copy.abrirFicha })
    expect(ficha.getAttribute('href')).toBe('/chamadas/ch-1')
    expect(screen.getByText(copy.encerrada)).toBeDefined()

    await waitFor(() => expect(configuracao.progressos).toHaveLength(1))
    expect(configuracao.progressos[0]?.ligacaoDeTeste).toBe('ch-1')

    // A etapa continua aberta, com a ficha, e seguir para o fecho libera.
    const seguir = assistente().getByRole('button', { name: copyDoInicio.seguir }) as HTMLButtonElement
    await waitFor(() => expect(seguir.disabled).toBe(false))
    expect(screen.getAllByRole('link', { name: copy.abrirFicha })).toHaveLength(1)
    // Um desenho a mais não grava a declaração de novo.
    expect(configuracao.progressos).toHaveLength(1)
  })

  it('com a ligação já declarada, o assistente abre no fecho', async () => {
    await abrir({
      configuracao: { passos: passosConcluidos(), ligacaoDeTeste: 'ch-9' },
    })

    expect(
      await screen.findByRole('heading', { name: copyDoInicio.etapas.pronto.titulo }),
    ).toBeDefined()
    expect(assistente().getByRole('button', { name: copyDoInicio.pronto.concluir })).toBeDefined()
  })

  it('com o freio puxado recusa com a frase do discador, sem chamar o servidor', async () => {
    const { chamadas } = await abrir({
      chamadas: { freio: { em: '2026-09-24T12:00:00Z', por: 'Renata', motivo: 'teste' } },
    })

    fireEvent.click(await botaoDeLigar())

    const recusa = await screen.findByText(copyDoDiscador.bloqueio.freio_puxado.mensagem)
    expect(recusa).toBeDefined()
    expect(screen.getByText(copyDoDiscador.recusaTitulo)).toBeDefined()
    expect(chamadas.pedidos).toHaveLength(0)
    // O freio não é passo do assistente.
    expect(screen.queryByText(/Isto se resolve no passo/)).toBeNull()
  })

  it('fora da janela, a recusa diz quando abre e aponta Discagem, nunca o passo do número (D-11)', async () => {
    // O relógio da tela e o da guarda no mesmo instante: domingo às 3h em São
    // Paulo, e a janela comercial não tem domingo. Com o relógio real, o aviso
    // antes do botão apareceria só à noite e o teste mudaria com a hora.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-20T06:00:00.000Z'))
    try {
      await abrir({
        chamadas: { janela: JANELA_COMERCIAL, agora: () => '2026-09-20T06:00:00.000Z' },
      })

      fireEvent.click(await botaoDeLigar())

      expect(await screen.findByText(copyDoDiscador.recusaTitulo)).toBeDefined()
      expect(screen.queryByText(/Isto se resolve no passo/)).toBeNull()
      const recusa = screen.getByRole('alert')
      const ajustar = within(recusa).getByRole('link', { name: copy.foraDaJanela.ajustar })
      expect(ajustar.getAttribute('href')).toBe('/config/discagem')
    } finally {
      vi.useRealTimers()
    }
  })

  it('antes do botão, diz que a ligação de teste respeita a janela e quando ela abre (D-11)', async () => {
    // Domingo às 3h em São Paulo; a política de exemplo liga de segunda a sexta, das 9h às 18h.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-09-20T06:00:00.000Z'))
    try {
      await abrir()
      const aviso = await screen.findByRole('note', { name: copy.foraDaJanela.titulo })
      expect(aviso.textContent).toContain('segunda-feira às 9h')
      expect(within(aviso).getByRole('link', { name: copy.foraDaJanela.ajustar })).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('dentro da janela, não há aviso de janela', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // Terça às 11h em São Paulo.
    vi.setSystemTime(new Date('2026-09-22T14:00:00.000Z'))
    try {
      await abrir()
      await botaoDeLigar()
      expect(screen.queryByRole('note', { name: copy.foraDaJanela.titulo })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('antes da primeira ligação, diz que a estimativa de custo vem depois dela (D-14)', async () => {
    await abrir()
    await botaoDeLigar()

    const nota = await screen.findByRole('note', { name: copyDaEstimativa.titulo })
    expect(nota.textContent).toContain(copyDaEstimativa.semAmostra)
  })

  it('com ligação medida, estima o custo desta antes do botão (D-14)', async () => {
    await abrir({
      chamadas: {
        estimativa: {
          ok: true,
          estimativa: {
            ligacoesMedidas: 1,
            duracaoMediaSeg: 45,
            porLigacao: [{ moeda: 'BRL', centavos: 12 }],
            porMinuto: [{ moeda: 'BRL', centavos: 16 }],
          },
        },
      },
    })

    const nota = await screen.findByRole('note', { name: copyDaEstimativa.titulo })
    expect(nota.textContent).toMatch(/Cerca de R\$\s0,12 por ligação, ou R\$\s0,16 por minuto\./)
    expect(nota.textContent).toContain('da última ligação atendida desta conta, com 45 s de conversa')
  })

  it('recusa sem passo que a resolva mostra só a frase do sistema', async () => {
    await abrir({ chamadas: { bloqueados: [NUMERO_DE_TESTE] } })

    fireEvent.click(await botaoDeLigar())

    expect(
      await screen.findByText('Este número está na lista de não perturbe desta conta.'),
    ).toBeDefined()
    expect(screen.queryByText(/Isto se resolve no passo/)).toBeNull()
  })
})
