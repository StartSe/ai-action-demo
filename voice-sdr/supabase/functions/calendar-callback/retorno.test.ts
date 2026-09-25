// Provas da volta do OAuth do calendário (US-170). Sem rede e sem banco: o
// Google é um `buscar` dublado e a camada de dados é uma porta em memória que
// registra cada operação na ordem.
//
// O que este arquivo segura:
//
// 1. **O `state` vem antes de tudo.** Ausente, vencido, com a assinatura trocada
//    ou de outra conta: nenhuma ida ao Google e nenhuma escrita.
// 2. **A ordem da volta feliz**: especialista, papel, troca, gravação,
//    invalidação do cache. Empilhada e comparada inteira.
// 3. **Reconectar reaproveita o segredo** e diz isso na página.
// 4. **Troca recusada pelo provedor não grava nada.**
// 5. **O código e o token não saem**: nem na página, nem no log, nem quando o
//    Google os ecoa no corpo do erro.
// 6. **A resposta é página em português**, não JSON.

import { describe, expect, test } from 'vitest'

import { SEGREDO_DO_CALENDARIO } from '../_shared/agenda/calendario.ts'
import type { Buscar, PedidoHttp } from '../_shared/agenda/calendario-google.ts'
import { emitirEstadoDaConexao, VALIDADE_DO_ESTADO_MS } from '../_shared/agenda/estado-da-conexao.ts'

import {
  atenderVoltaDoCalendario,
  FRASE_CONECTADO,
  FRASE_RECONECTADO,
  FRASES_DA_VOLTA,
  type CalendarioParaGravar,
  type ConfiguracaoDaVolta,
  type EventoDaVolta,
  type PedidoDaVolta,
  type PortaDaVolta,
} from './retorno.ts'
import { escaparHtml } from './pagina.ts'

const CONTA = '11111111-1111-4111-8111-111111111111'
const OUTRA_CONTA = '99999999-9999-4999-8999-999999999999'
const ESPECIALISTA = '22222222-2222-4222-8222-222222222222'
const USUARIO = '33333333-3333-4333-8333-333333333333'
const CHAVE = 'chave-do-servidor-para-teste'
const AGORA = 1_790_000_000_000
const VOLTA = 'https://projeto.supabase.co/functions/v1/calendar-callback'

/** Valores improváveis e presentes, para a busca por vazamento achar se vazar. */
const CODIGO = '4/0AcodigoDeAutorizacaoJabuticabaDeSabara9931'
const TOKEN = '1//0gTokenDeRenovacaoCaramujoDePiracicaba5518'
const TOKEN_DE_ACESSO = 'ya29.acessoPitangaDoCerrado7710'

interface Cenario {
  readonly daConta?: boolean
  readonly papel?: string | null
  readonly reaproveitado?: boolean
  readonly gravacaoFalha?: boolean
  readonly google?: { readonly status: number; readonly corpo: unknown } | 'sem_rede'
}

interface Dubla {
  readonly porta: PortaDaVolta
  readonly buscar: Buscar
  readonly passos: string[]
  readonly gravados: CalendarioParaGravar[]
  readonly idasAoGoogle: { url: string; pedido: PedidoHttp }[]
  readonly log: EventoDaVolta[]
}

function dublar(cenario: Cenario = {}): Dubla {
  const passos: string[] = []
  const gravados: CalendarioParaGravar[] = []
  const idasAoGoogle: { url: string; pedido: PedidoHttp }[] = []
  const log: EventoDaVolta[] = []

  const porta: PortaDaVolta = {
    async especialistaDaConta(contaId, especialistaId) {
      passos.push('especialista')
      return (cenario.daConta ?? true) && contaId === CONTA && especialistaId === ESPECIALISTA
    },
    async papelNaConta() {
      passos.push('papel')
      return cenario.papel === undefined ? 'admin' : cenario.papel
    },
    async gravarCalendario(calendario) {
      passos.push('gravar')
      if (cenario.gravacaoFalha) throw new Error(`insert falhou com ${calendario.tokenDeAtualizacao}`)
      gravados.push(calendario)
      return { calendarioId: '44444444-4444-4444-8444-444444444444', reaproveitado: cenario.reaproveitado ?? false }
    },
    invalidarCredencial(contaId, provedor, chave) {
      passos.push(`invalidar:${contaId}:${provedor}:${chave}`)
    },
    registrarNoLog(evento) {
      log.push(evento)
    },
  }

  const buscar: Buscar = async (url, pedido) => {
    passos.push('google')
    idasAoGoogle.push({ url, pedido })
    const google = cenario.google ?? {
      status: 200,
      corpo: { access_token: TOKEN_DE_ACESSO, refresh_token: TOKEN, expires_in: 3599, token_type: 'Bearer' },
    }
    if (google === 'sem_rede') throw new Error('fetch failed')
    return { status: google.status, text: async () => JSON.stringify(google.corpo) }
  }

  return { porta, buscar, passos, gravados, idasAoGoogle, log }
}

function configuracao(dubla: Dubla, parcial: Partial<ConfiguracaoDaVolta> = {}): ConfiguracaoDaVolta {
  return {
    buscar: dubla.buscar,
    clienteId: 'cliente-oauth.apps.googleusercontent.com',
    clienteSegredo: 'segredo-do-cliente-oauth-de-teste',
    redirecionamento: VOLTA,
    chaveDoServidor: CHAVE,
    destino: 'https://sarah.exemplo.app/especialistas',
    agora: () => AGORA + 60_000,
    ...parcial,
  }
}

async function estadoValido(parcial: { contaId?: string; chave?: string; emitidoEm?: number } = {}): Promise<string> {
  return emitirEstadoDaConexao(
    { contaId: parcial.contaId ?? CONTA, especialistaId: ESPECIALISTA, usuarioId: USUARIO },
    parcial.chave ?? CHAVE,
    parcial.emitidoEm ?? AGORA,
  )
}

function volta(estado: string | null, parcial: Partial<PedidoDaVolta> = {}): PedidoDaVolta {
  return { metodo: 'GET', estado, codigo: CODIGO, erro: null, ...parcial }
}

describe('a volta feliz', () => {
  test('confere, troca, grava e invalida o cache, nessa ordem', async () => {
    const dubla = dublar()

    const resposta = await atenderVoltaDoCalendario(volta(await estadoValido()), dubla.porta, configuracao(dubla))

    expect(resposta.status).toBe(200)
    expect(dubla.passos).toEqual([
      'especialista',
      'papel',
      'google',
      'gravar',
      `invalidar:${CONTA}:${SEGREDO_DO_CALENDARIO.provedor}:${SEGREDO_DO_CALENDARIO.chave}`,
    ])
    expect(dubla.gravados).toEqual([
      { contaId: CONTA, especialistaId: ESPECIALISTA, provedor: 'google', agendaId: 'primary', tokenDeAtualizacao: TOKEN },
    ])
  })

  test('a troca vai ao Google com o código, o par do aplicativo e o mesmo endereço de volta', async () => {
    const dubla = dublar()

    await atenderVoltaDoCalendario(volta(await estadoValido()), dubla.porta, configuracao(dubla))

    const [ida] = dubla.idasAoGoogle
    expect(ida?.url).toBe('https://oauth2.googleapis.com/token')
    expect(ida?.pedido.method).toBe('POST')
    const corpo = new URLSearchParams(ida?.pedido.body)
    expect(Object.fromEntries(corpo)).toEqual({
      client_id: 'cliente-oauth.apps.googleusercontent.com',
      client_secret: 'segredo-do-cliente-oauth-de-teste',
      code: CODIGO,
      redirect_uri: VOLTA,
      grant_type: 'authorization_code',
    })
  })

  test('responde página em português, com o caminho de volta', async () => {
    const dubla = dublar()

    const resposta = await atenderVoltaDoCalendario(volta(await estadoValido()), dubla.porta, configuracao(dubla))

    expect(resposta.html).toMatch(/^<!doctype html>/)
    expect(resposta.html).toContain('<html lang="pt-BR">')
    expect(resposta.html).toContain(escaparHtml(FRASE_CONECTADO))
    expect(resposta.html).toContain('href="https://sarah.exemplo.app/especialistas"')
    expect(() => JSON.parse(resposta.html)).toThrow()
  })

  test('reconectar reaproveita o segredo e diz que reconectou', async () => {
    const dubla = dublar({ reaproveitado: true })

    const resposta = await atenderVoltaDoCalendario(volta(await estadoValido()), dubla.porta, configuracao(dubla))

    expect(resposta.status).toBe(200)
    expect(resposta.html).toContain(escaparHtml(FRASE_RECONECTADO))
    expect(dubla.passos.at(-1)).toMatch(/^invalidar:/)
    expect(dubla.log).toEqual([
      { evento: 'calendario_conectado', contaId: CONTA, especialistaId: ESPECIALISTA, reaproveitado: true },
    ])
  })
})

describe('o state vem antes de tudo', () => {
  test.each([
    ['ausente', async (): Promise<string | null> => null, 'estado_ausente'],
    ['com a assinatura trocada', async (): Promise<string | null> => estadoValido({ chave: 'outra-chave-do-servidor' }), 'assinatura_invalida'],
    ['vencido', async (): Promise<string | null> => estadoValido({ emitidoEm: AGORA + 60_000 - VALIDADE_DO_ESTADO_MS - 1 }), 'estado_expirado'],
    [
      'com a carga de outra conta sob a assinatura desta',
      async (): Promise<string | null> => {
        const [, assinatura] = (await estadoValido()).split('.')
        const [cargaAlheia] = (await estadoValido({ contaId: OUTRA_CONTA })).split('.')
        return `${cargaAlheia}.${assinatura}`
      },
      'assinatura_invalida',
    ],
  ] as const)('state %s é recusado sem ir ao Google e sem gravar', async (_nome, estado, motivo) => {
    const dubla = dublar()

    const resposta = await atenderVoltaDoCalendario(volta(await estado()), dubla.porta, configuracao(dubla))

    expect(resposta.status).toBe(400)
    expect(resposta.html).toContain(escaparHtml(FRASES_DA_VOLTA[motivo]))
    expect(dubla.passos).toEqual([])
    expect(dubla.log).toEqual([{ evento: 'volta_recusada', motivo }])
  })

  test('state de outra conta: o especialista não é da conta assinada, e nada se troca nem se grava', async () => {
    const dubla = dublar()

    const resposta = await atenderVoltaDoCalendario(
      volta(await estadoValido({ contaId: OUTRA_CONTA })),
      dubla.porta,
      configuracao(dubla),
    )

    expect(resposta.status).toBe(403)
    expect(resposta.html).toContain(escaparHtml(FRASES_DA_VOLTA.especialista_de_outra_conta))
    expect(dubla.passos).toEqual(['especialista'])
    expect(dubla.gravados).toEqual([])
  })

  test('quem clicou e deixou de administrar a conta não conecta', async () => {
    const dubla = dublar({ papel: 'operator' })

    const resposta = await atenderVoltaDoCalendario(volta(await estadoValido()), dubla.porta, configuracao(dubla))

    expect(resposta.status).toBe(403)
    expect(dubla.passos).toEqual(['especialista', 'papel'])
  })

  test('quem negou no Google volta sem código e nada muda', async () => {
    const dubla = dublar()

    const resposta = await atenderVoltaDoCalendario(
      volta(await estadoValido(), { codigo: null, erro: 'access_denied' }),
      dubla.porta,
      configuracao(dubla),
    )

    expect(resposta.html).toContain(escaparHtml(FRASES_DA_VOLTA.autorizacao_negada))
    expect(dubla.passos).toEqual([])
  })

  test('POST não é volta do Google', async () => {
    const dubla = dublar()

    const resposta = await atenderVoltaDoCalendario(
      volta(await estadoValido(), { metodo: 'POST' }),
      dubla.porta,
      configuracao(dubla),
    )

    expect(resposta.status).toBe(405)
    expect(dubla.passos).toEqual([])
  })
})

describe('o provedor recusa', () => {
  test('troca recusada pelo provedor não grava nada', async () => {
    const dubla = dublar({ google: { status: 400, corpo: { error: 'invalid_grant', error_description: 'Bad Request' } } })

    const resposta = await atenderVoltaDoCalendario(volta(await estadoValido()), dubla.porta, configuracao(dubla))

    expect(resposta.status).toBe(502)
    expect(resposta.html).toContain(escaparHtml(FRASES_DA_VOLTA.troca_recusada))
    expect(dubla.passos).toEqual(['especialista', 'papel', 'google'])
    expect(dubla.log).toEqual([
      {
        evento: 'volta_recusada',
        motivo: 'troca_recusada',
        detalhe: 'conexao_expirada',
        contaId: CONTA,
        especialistaId: ESPECIALISTA,
      },
    ])
  })

  test('200 sem token de renovação não grava uma conexão que morreria em uma hora', async () => {
    const dubla = dublar({ google: { status: 200, corpo: { access_token: TOKEN_DE_ACESSO, expires_in: 3599 } } })

    const resposta = await atenderVoltaDoCalendario(volta(await estadoValido()), dubla.porta, configuracao(dubla))

    expect(resposta.status).toBe(502)
    expect(dubla.gravados).toEqual([])
  })

  test('aplicativo sem verificação é espera, com a frase do estado normal', async () => {
    const dubla = dublar({ google: { status: 403, corpo: { error: 'access_denied' } } })

    const resposta = await atenderVoltaDoCalendario(volta(await estadoValido()), dubla.porta, configuracao(dubla))

    expect(resposta.status).toBe(200)
    expect(resposta.html).toContain(escaparHtml(FRASES_DA_VOLTA.aguardando_google))
    expect(dubla.gravados).toEqual([])
  })

  test('instalação sem o par OAuth não vai ao Google', async () => {
    const dubla = dublar()

    const resposta = await atenderVoltaDoCalendario(
      volta(await estadoValido()),
      dubla.porta,
      configuracao(dubla, { clienteSegredo: '' }),
    )

    expect(resposta.html).toContain(escaparHtml(FRASES_DA_VOLTA.aguardando_google))
    expect(dubla.passos).toEqual(['especialista', 'papel'])
  })

  test('rede fora do ar não grava nada', async () => {
    const dubla = dublar({ google: 'sem_rede' })

    const resposta = await atenderVoltaDoCalendario(volta(await estadoValido()), dubla.porta, configuracao(dubla))

    expect(resposta.status).toBe(502)
    expect(dubla.gravados).toEqual([])
  })

  test('gravação que falha não invalida o cache nem diz que conectou', async () => {
    const dubla = dublar({ gravacaoFalha: true })

    const resposta = await atenderVoltaDoCalendario(volta(await estadoValido()), dubla.porta, configuracao(dubla))

    expect(resposta.status).toBe(500)
    expect(resposta.html).toContain(escaparHtml(FRASES_DA_VOLTA.falha_ao_gravar))
    expect(dubla.passos.some((passo) => passo.startsWith('invalidar:'))).toBe(false)
  })
})

describe('o código e o token não saem', () => {
  const cenarios: readonly [string, Cenario][] = [
    ['na volta feliz', {}],
    ['na reconexão', { reaproveitado: true }],
    ['quando o Google ecoa o código no erro', { google: { status: 400, corpo: { error: 'invalid_grant', code: CODIGO } } }],
    ['quando a gravação falha com o token na mensagem', { gravacaoFalha: true }],
  ]

  test.each(cenarios)('%s', async (_nome, cenario) => {
    const dubla = dublar(cenario)

    const resposta = await atenderVoltaDoCalendario(volta(await estadoValido()), dubla.porta, configuracao(dubla))

    const serializado = JSON.stringify({ resposta, log: dubla.log })
    for (const valor of [CODIGO, TOKEN, TOKEN_DE_ACESSO]) expect(serializado).not.toContain(valor)
  })
})
