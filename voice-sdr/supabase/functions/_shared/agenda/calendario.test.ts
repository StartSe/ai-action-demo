// A porta do calendário, dublada. Nada aqui toca rede: o adaptador do Google
// recebe um `buscar` em memória que responde como a API responderia.
//
// O que se prova: os quatro estados da conexão, a tradução dos códigos do
// provedor (sem o código em lugar nenhum do que sai), a normalização de fuso
// na borda da porta e a idempotência da criação do evento.

import { describe, expect, test } from 'vitest'

import { conferirQueNaoVazou } from '../provedor/vazamento.ts'
import { criarCofreDeCredenciais, type PortaDeCredenciais } from '../secrets.ts'
import {
  MENSAGENS_DO_CALENDARIO,
  estadoDaConexao,
  falhaDoCalendario,
  janelaAbsoluta,
  normalizarHorarioDoProvedor,
  protegerPorta,
  resolverTokenDoCalendario,
  traduzirErroDoCalendario,
  type MotivoDoCalendario,
  type PortaDeCalendario,
} from './calendario.ts'
import { criarCalendarioDoGoogle, idDoEvento, type Buscar, type PedidoHttp } from './calendario-google.ts'

// Tradução -----------------------------------------------------------------------

const CODIGOS: ReadonlyArray<readonly [string, number | null, MotivoDoCalendario]> = [
  ['invalid_grant', 400, 'conexao_expirada'],
  ['Token has been expired or revoked.', 400, 'conexao_expirada'],
  ['UNAUTHENTICATED', 401, 'conexao_expirada'],
  ['insufficientPermissions', 403, 'sem_permissao_de_calendario'],
  ['ACCESS_TOKEN_SCOPE_INSUFFICIENT', 403, 'sem_permissao_de_calendario'],
  ['insufficient_scope', 403, 'sem_permissao_de_calendario'],
  ['access_denied', 400, 'sem_permissao_de_calendario'],
  ['PERMISSION_DENIED', 403, 'sem_permissao_de_calendario'],
  ['rateLimitExceeded', 403, 'limite_de_taxa'],
  ['userRateLimitExceeded', 403, 'limite_de_taxa'],
  ['notFound', 404, 'agenda_nao_encontrada'],
  ['backendError', 500, 'provedor_indisponivel'],
  ['UNAVAILABLE', 503, 'provedor_indisponivel'],
  ['ETIMEDOUT', null, 'sem_resposta'],
  ['ERR_XYZ', 418, 'falha_do_calendario'],
]

describe('tradução do erro do provedor', () => {
  test.each(CODIGOS)('%s (%s) vira %s', (codigo, status, motivo) => {
    expect(traduzirErroDoCalendario(codigo, status).motivo).toBe(motivo)
  })

  test('invalid_grant e a recusa de escopo dizem as frases do critério', () => {
    expect(traduzirErroDoCalendario('invalid_grant', 400).mensagem.toLowerCase()).toContain(
      'a conexão com o calendário expirou, reconecte',
    )
    expect(traduzirErroDoCalendario('insufficient_scope', 403).mensagem.toLowerCase()).toContain(
      'o aplicativo ainda não tem permissão de calendário',
    )
  })

  test('nenhuma frase contém o código que a gerou, e o corpo serializado também não', () => {
    for (const [codigo, status] of CODIGOS) {
      const falha = traduzirErroDoCalendario(codigo, status)
      expect(falha.mensagem).not.toContain(codigo)
      expect(JSON.stringify(falha).toLowerCase()).not.toContain(codigo.toLowerCase())
    }
  })

  test('sem código, o status decide', () => {
    expect(traduzirErroDoCalendario(null, 401).motivo).toBe('conexao_expirada')
    expect(traduzirErroDoCalendario(null, 403).motivo).toBe('sem_permissao_de_calendario')
    expect(traduzirErroDoCalendario(null, 404).motivo).toBe('agenda_nao_encontrada')
    expect(traduzirErroDoCalendario('', 502).motivo).toBe('provedor_indisponivel')
  })

  test('toda frase é de interface: diz o que fazer e não tem travessão', () => {
    for (const mensagem of Object.values(MENSAGENS_DO_CALENDARIO)) {
      expect(mensagem.length).toBeGreaterThan(40)
      expect(mensagem).not.toContain('—')
    }
  })
})

// Estados ------------------------------------------------------------------------

describe('os quatro estados da conexão', () => {
  test('conectado quando a ida deu certo', () => {
    expect(estadoDaConexao({ ok: true, valor: [] })).toBe('conectado')
  })

  test('nao_configurado sem calendário, ou sem token', () => {
    expect(estadoDaConexao(null)).toBe('nao_configurado')
    expect(estadoDaConexao(falhaDoCalendario('nao_conectado'))).toBe('nao_configurado')
  })

  test('erro quando a credencial foi recusada: pede ação de quem administra', () => {
    for (const motivo of ['conexao_expirada', 'sem_permissao_de_calendario', 'agenda_nao_encontrada', 'falha_do_calendario'] as const) {
      expect(estadoDaConexao(falhaDoCalendario(motivo)), motivo).toBe('erro')
    }
  })

  test('indisponivel quando o provedor não respondeu: pede só que se tente de novo', () => {
    for (const motivo of ['sem_resposta', 'provedor_indisponivel', 'limite_de_taxa'] as const) {
      expect(estadoDaConexao(falhaDoCalendario(motivo)), motivo).toBe('indisponivel')
    }
  })

  test('erro e indisponivel nunca dividem a mesma frase', () => {
    const doErro = new Set(['conexao_expirada', 'sem_permissao_de_calendario'].map((m) => MENSAGENS_DO_CALENDARIO[m as MotivoDoCalendario]))
    for (const motivo of ['sem_resposta', 'provedor_indisponivel'] as const) {
      expect(doErro.has(MENSAGENS_DO_CALENDARIO[motivo])).toBe(false)
    }
  })
})

// Token ---------------------------------------------------------------------------

function cofreCom(valor: string | null) {
  const pedidos: Array<{ tipo: string; id: string; provedor: string; chave: string }> = []
  const porta: PortaDeCredenciais = {
    segredoDaConta: () => Promise.resolve(null),
    segredoDoRecurso: (recurso, provedor, chave) => {
      pedidos.push({ ...recurso, provedor, chave })
      return Promise.resolve(valor)
    },
    segredoDaPlataforma: () => null,
    modoDeCredencial: () => Promise.resolve('account'),
  }
  return { cofre: criarCofreDeCredenciais({ porta, ambiente: 'producao' }), pedidos }
}

describe('o token de renovação', () => {
  test('desce a cascata de secrets.ts com a linha de specialist_calendars como recurso', async () => {
    const { cofre, pedidos } = cofreCom('1//token-de-renovacao-do-especialista')
    const resolvido = await resolverTokenDoCalendario(cofre, { id: 'cal-1', contaId: 'conta-1' })
    expect(resolvido).toEqual({ ok: true, token: '1//token-de-renovacao-do-especialista' })
    expect(pedidos).toEqual([
      { tipo: 'specialist_calendars', id: 'cal-1', provedor: 'google_calendar', chave: 'refresh_token' },
    ])
  })

  test('sem valor, o calendário está nao_configurado', async () => {
    const { cofre } = cofreCom(null)
    const resolvido = await resolverTokenDoCalendario(cofre, { id: 'cal-1', contaId: 'conta-1' })
    expect(resolvido.ok).toBe(false)
    if (!resolvido.ok) expect(estadoDaConexao(resolvido)).toBe('nao_configurado')
  })
})

// Fuso -----------------------------------------------------------------------------

describe('instantes absolutos na porta', () => {
  test('a janela recusa data local e relógio sem deslocamento', () => {
    expect(() => janelaAbsoluta('2026-10-08', '2026-10-09')).toThrow(/deslocamento/)
    expect(() => janelaAbsoluta('2026-10-08T09:00:00', '2026-10-08T10:00:00')).toThrow(/deslocamento/)
    expect(() => janelaAbsoluta('2026-10-08T10:00:00Z', '2026-10-08T10:00:00Z')).toThrow(/duração/)
  })

  test('a janela sai em UTC, qualquer que seja o deslocamento de entrada', () => {
    expect(janelaAbsoluta('2026-10-08T09:00:00-03:00', '2026-10-08T10:00:00-04:00')).toEqual({
      inicio: '2026-10-08T12:00:00Z',
      fim: '2026-10-08T14:00:00Z',
    })
  })

  test('a porta protegida recusa janela local antes de ir ao provedor', async () => {
    let idas = 0
    const porta = protegerPorta(portaQueConta(() => idas++))
    await expect(async () => porta.lerOcupacao({ inicio: '2026-10-08', fim: '2026-10-09' })).rejects.toThrow()
    await expect(async () => porta.conferirHorario('2026-10-08T09:00', '2026-10-08T10:00')).rejects.toThrow()
    expect(idas).toBe(0)
  })

  test('exceção do adaptador vira sem_resposta, sem a mensagem dela', async () => {
    const porta = protegerPorta({
      ...portaQueConta(() => undefined),
      lerOcupacao: () => Promise.reject(new Error('GET https://www.googleapis.com/... invalid_grant')),
    })
    const resultado = await porta.lerOcupacao(janelaAbsoluta('2026-10-08T00:00:00Z', '2026-10-09T00:00:00Z'))
    expect(resultado).toEqual(falhaDoCalendario('sem_resposta'))
    expect(JSON.stringify(resultado)).not.toMatch(/googleapis|invalid_grant/)
  })
})

describe('normalização do que o provedor devolve', () => {
  test('instante com deslocamento vira UTC', () => {
    expect(normalizarHorarioDoProvedor({ instante: '2026-10-08T14:00:00-03:00' }, 'America/Manaus')).toBe(
      '2026-10-08T17:00:00Z',
    )
  })

  test('relógio sem deslocamento se lê no fuso do próprio horário, senão no da agenda', () => {
    expect(normalizarHorarioDoProvedor({ instante: '2026-10-08T14:00:00', fuso: 'America/Manaus' }, 'America/Sao_Paulo')).toBe(
      '2026-10-08T18:00:00Z',
    )
    expect(normalizarHorarioDoProvedor({ instante: '2026-10-08T14:00:00' }, 'America/Sao_Paulo')).toBe(
      '2026-10-08T17:00:00Z',
    )
  })

  test('dia inteiro começa à meia-noite do fuso da agenda, não de UTC', () => {
    expect(normalizarHorarioDoProvedor({ data: '2026-10-08' }, 'America/Sao_Paulo')).toBe('2026-10-08T03:00:00Z')
    expect(normalizarHorarioDoProvedor({ data: '2026-10-08' }, 'America/Rio_Branco')).toBe('2026-10-08T05:00:00Z')
    expect(normalizarHorarioDoProvedor({ data: '2026-10-08' }, 'Europe/Lisbon')).toBe('2026-10-07T23:00:00Z')
  })

  test('horário de verão: o mesmo relógio em datas diferentes cai em instantes diferentes', () => {
    expect(normalizarHorarioDoProvedor({ instante: '2026-07-01T09:00:00' }, 'America/New_York')).toBe('2026-07-01T13:00:00Z')
    expect(normalizarHorarioDoProvedor({ instante: '2026-12-01T09:00:00' }, 'America/New_York')).toBe('2026-12-01T14:00:00Z')
  })

  test('o que não se lê é nulo, e não um instante inventado', () => {
    expect(normalizarHorarioDoProvedor({}, 'America/Sao_Paulo')).toBeNull()
    expect(normalizarHorarioDoProvedor({ data: '2026-02-30' }, 'America/Sao_Paulo')).toBeNull()
    expect(normalizarHorarioDoProvedor({ instante: 'amanhã às 9' }, 'America/Sao_Paulo')).toBeNull()
    expect(normalizarHorarioDoProvedor({ instante: '2026-10-08T09:00:00', fuso: 'Marte/Olympus' }, 'America/Sao_Paulo')).toBeNull()
  })
})

// Adaptador do Google, com o buscar dublado ---------------------------------------

const SEGREDOS = {
  clienteId: 'cliente-id-do-aplicativo.apps',
  clienteSegredo: 'segredo-do-aplicativo-oauth',
  tokenDeAtualizacao: '1//token-de-renovacao-do-especialista',
}
const AGENDA = 'especialista@exemplo.com.br'
const REUNIAO = '4f0c2a1e-9b8d-4c7a-8e6f-0123456789ab'

interface Ida {
  readonly url: string
  readonly pedido: PedidoHttp
}

type Roteiro = (ida: Ida) => { status: number; corpo?: unknown } | Promise<{ status: number; corpo?: unknown }>

function googleDublado(roteiro: Roteiro, extra: { agora?: () => number } = {}) {
  const idas: Ida[] = []
  const buscar: Buscar = async (url, pedido) => {
    const ida = { url, pedido }
    idas.push(ida)
    const resposta = await roteiro(ida)
    return responder(resposta.status, resposta.corpo)
  }
  const porta = criarCalendarioDoGoogle({ buscar, agendaId: AGENDA, fuso: 'America/Sao_Paulo', ...SEGREDOS, ...extra })
  return { porta, idas }
}

function responder(status: number, corpo: unknown) {
  return { status, text: () => Promise.resolve(corpo === undefined ? '' : JSON.stringify(corpo)) }
}

const TOKEN_OK = { status: 200, corpo: { access_token: 'ya29.acesso-de-teste', expires_in: 3599 } }

function comToken(api: Roteiro): Roteiro {
  return (ida) => (ida.url.startsWith('https://oauth2.googleapis.com/token') ? TOKEN_OK : api(ida))
}

const JANELA = janelaAbsoluta('2026-10-08T00:00:00-03:00', '2026-10-10T00:00:00-03:00')

function varrerSegredos(corpo: unknown) {
  conferirQueNaoVazou(corpo, [...Object.values(SEGREDOS), 'ya29.acesso-de-teste'], 'segredo no corpo')
}

describe('adaptador do Google: ocupação', () => {
  test('lê os eventos da janela em UTC, descarta cancelado, livre e ilegível', async () => {
    const { porta, idas } = googleDublado(
      comToken(() => ({
        status: 200,
        corpo: {
          timeZone: 'America/Sao_Paulo',
          items: [
            { id: 'a', start: { dateTime: '2026-10-08T09:00:00-03:00' }, end: { dateTime: '2026-10-08T10:00:00-03:00' } },
            { id: 'b', start: { date: '2026-10-09' }, end: { date: '2026-10-10' } },
            { id: 'c', status: 'cancelled', start: { dateTime: '2026-10-08T11:00:00Z' }, end: { dateTime: '2026-10-08T12:00:00Z' } },
            { id: 'd', transparency: 'transparent', start: { dateTime: '2026-10-08T11:00:00Z' }, end: { dateTime: '2026-10-08T12:00:00Z' } },
            { id: 'e', start: { dateTime: 'depois' }, end: { dateTime: 'mais tarde' } },
            { start: { dateTime: '2026-10-08T11:00:00Z' }, end: { dateTime: '2026-10-08T12:00:00Z' } },
            { id: 'f', start: { dateTime: '2026-10-08T15:00:00', timeZone: 'America/Manaus' }, end: { dateTime: '2026-10-08T16:00:00', timeZone: 'America/Manaus' } },
          ],
        },
      })),
    )
    const resultado = await porta.lerOcupacao(JANELA)
    expect(resultado).toEqual({
      ok: true,
      valor: [
        { externalId: 'a', inicio: '2026-10-08T12:00:00Z', fim: '2026-10-08T13:00:00Z' },
        { externalId: 'b', inicio: '2026-10-09T03:00:00Z', fim: '2026-10-10T03:00:00Z' },
        { externalId: 'f', inicio: '2026-10-08T19:00:00Z', fim: '2026-10-08T20:00:00Z' },
      ],
    })
    const consulta = new URL(idas[1]!.url)
    expect(consulta.searchParams.get('timeMin')).toBe('2026-10-08T03:00:00Z')
    expect(consulta.searchParams.get('timeMax')).toBe('2026-10-10T03:00:00Z')
    expect(consulta.searchParams.get('singleEvents')).toBe('true')
    expect(consulta.pathname).toContain(encodeURIComponent(AGENDA))
  })

  test('segue as páginas até o fim', async () => {
    const { porta, idas } = googleDublado(
      comToken((ida) => {
        const pagina = new URL(ida.url).searchParams.get('pageToken')
        const id = pagina ?? 'primeira'
        return {
          status: 200,
          corpo: {
            items: [{ id, start: { dateTime: '2026-10-08T12:00:00Z' }, end: { dateTime: '2026-10-08T13:00:00Z' } }],
            ...(pagina ? {} : { nextPageToken: 'segunda' }),
          },
        }
      }),
    )
    const resultado = await porta.lerOcupacao(JANELA)
    expect(resultado.ok && resultado.valor.map((o) => o.externalId)).toEqual(['primeira', 'segunda'])
    expect(idas.length).toBe(3)
  })

  test('páginas sem fim viram falha, e não meia agenda', async () => {
    const { porta } = googleDublado(comToken(() => ({ status: 200, corpo: { items: [], nextPageToken: 'mais' } })))
    const resultado = await porta.lerOcupacao(JANELA)
    expect(resultado.ok).toBe(false)
  })

  test('o token de acesso se reaproveita até vencer', async () => {
    let agora = 0
    const { porta, idas } = googleDublado(comToken(() => ({ status: 200, corpo: { items: [] } })), { agora: () => agora })
    await porta.lerOcupacao(JANELA)
    await porta.lerOcupacao(JANELA)
    expect(idas.filter((i) => i.url.includes('oauth2')).length).toBe(1)
    agora = 3_600_000
    await porta.lerOcupacao(JANELA)
    expect(idas.filter((i) => i.url.includes('oauth2')).length).toBe(2)
  })
})

describe('adaptador do Google: os quatro estados e as traduções', () => {
  test('conectado', async () => {
    const { porta } = googleDublado(comToken(() => ({ status: 200, corpo: { items: [] } })))
    expect(estadoDaConexao(await porta.lerOcupacao(JANELA))).toBe('conectado')
  })

  test('invalid_grant na renovação: erro, com a frase de reconectar e sem o código', async () => {
    const { porta, idas } = googleDublado(() => ({
      status: 400,
      corpo: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' },
    }))
    const resultado = await porta.lerOcupacao(JANELA)
    expect(estadoDaConexao(resultado)).toBe('erro')
    expect(resultado.ok || resultado.motivo).toBe('conexao_expirada')
    expect(JSON.stringify(resultado)).not.toMatch(/invalid_grant|expired or revoked/i)
    varrerSegredos(resultado)
    // Sem token de acesso, a API nem é chamada.
    expect(idas.length).toBe(1)
  })

  test('recusa de escopo: o estado normal enquanto a verificação do Google não sai', async () => {
    const { porta } = googleDublado(
      comToken(() => ({
        status: 403,
        corpo: { error: { code: 403, status: 'PERMISSION_DENIED', errors: [{ reason: 'insufficientPermissions' }] } },
      })),
    )
    const resultado = await porta.lerOcupacao(JANELA)
    expect(resultado.ok || resultado.motivo).toBe('sem_permissao_de_calendario')
    expect(JSON.stringify(resultado)).not.toMatch(/insufficientPermissions|PERMISSION_DENIED/)
  })

  test('provedor fora do ar: indisponivel', async () => {
    const { porta } = googleDublado(comToken(() => ({ status: 503, corpo: { error: { code: 503, status: 'UNAVAILABLE' } } })))
    expect(estadoDaConexao(await porta.lerOcupacao(JANELA))).toBe('indisponivel')
  })

  test('rede caída ou prazo estourado: indisponivel, sem a mensagem da exceção', async () => {
    const { porta } = googleDublado(() => Promise.reject(new Error('connect ECONNREFUSED oauth2.googleapis.com')))
    const resultado = await porta.lerOcupacao(JANELA)
    expect(estadoDaConexao(resultado)).toBe('indisponivel')
    expect(JSON.stringify(resultado)).not.toMatch(/ECONNREFUSED|googleapis/)
  })

  test('o pedido leva prazo', async () => {
    const { porta, idas } = googleDublado(comToken(() => ({ status: 200, corpo: { items: [] } })))
    await porta.lerOcupacao(JANELA)
    for (const ida of idas) expect(ida.pedido.signal).toBeInstanceOf(AbortSignal)
  })

  test('os segredos vão só para onde precisam, e nenhuma falha os devolve', async () => {
    const { porta, idas } = googleDublado(comToken(() => ({ status: 500, corpo: { error: { status: 'INTERNAL' } } })))
    const resultado = await porta.lerOcupacao(JANELA)
    varrerSegredos(resultado)
    const [troca, api] = idas
    expect(troca!.pedido.body).toContain(encodeURIComponent(SEGREDOS.tokenDeAtualizacao))
    expect(api!.url).not.toContain(SEGREDOS.tokenDeAtualizacao)
    expect(api!.pedido.headers.authorization).toBe('Bearer ya29.acesso-de-teste')
  })
})

describe('adaptador do Google: checagem ao vivo', () => {
  test('livre quando o horário não cruza ocupação, e o encostado não conta', async () => {
    const { porta, idas } = googleDublado(
      comToken(() => ({
        status: 200,
        corpo: { calendars: { [AGENDA]: { busy: [{ start: '2026-10-08T13:00:00Z', end: '2026-10-08T14:00:00Z' }] } } },
      })),
    )
    expect(await porta.conferirHorario('2026-10-08T11:00:00-03:00', '2026-10-08T15:00:00Z')).toEqual({
      ok: true,
      valor: { livre: true },
    })
    const corpo = JSON.parse(idas[1]!.pedido.body ?? '{}') as { timeMin: string; items: Array<{ id: string }> }
    expect(corpo.timeMin).toBe('2026-10-08T14:00:00Z')
    expect(corpo.items).toEqual([{ id: AGENDA }])
  })

  test('tomado quando cruza', async () => {
    const { porta } = googleDublado(
      comToken(() => ({
        status: 200,
        corpo: { calendars: { [AGENDA]: { busy: [{ start: '2026-10-08T13:30:00Z', end: '2026-10-08T14:00:00Z' }] } } },
      })),
    )
    expect(await porta.conferirHorario('2026-10-08T13:00:00Z', '2026-10-08T14:00:00Z')).toEqual({
      ok: true,
      valor: { livre: false },
    })
  })

  test('erro por agenda vira falha traduzida, e não horário livre', async () => {
    const { porta } = googleDublado(
      comToken(() => ({ status: 200, corpo: { calendars: { [AGENDA]: { errors: [{ domain: 'global', reason: 'notFound' }] } } } })),
    )
    const resultado = await porta.conferirHorario('2026-10-08T13:00:00Z', '2026-10-08T14:00:00Z')
    expect(resultado.ok || resultado.motivo).toBe('agenda_nao_encontrada')
  })
})

describe('adaptador do Google: evento da reunião', () => {
  const evento = {
    reuniaoId: REUNIAO,
    inicio: '2026-10-08T14:00:00-03:00',
    fim: '2026-10-08T14:30:00-03:00',
    titulo: 'Conversa com Marcos Ferreira',
    descricao: 'Resumo de passagem',
    local: 'https://sala.exemplo.com.br/especialista',
  }

  test('o id do evento sai da reunião, no alfabeto que o Google aceita', () => {
    expect(idDoEvento(REUNIAO)).toMatch(/^[0-9a-v]{5,1024}$/)
    expect(idDoEvento(REUNIAO.toUpperCase())).toBe(idDoEvento(REUNIAO))
    expect(() => idDoEvento('nao-e-uuid')).toThrow()
  })

  test('cria com o id derivado, em UTC e sem mandar convite pelo Google', async () => {
    const { porta, idas } = googleDublado(comToken(() => ({ status: 200, corpo: { id: idDoEvento(REUNIAO) } })))
    expect(await porta.criarEvento(evento)).toEqual({ ok: true, valor: { externalEventId: idDoEvento(REUNIAO) } })
    const ida = idas[1]!
    expect(ida.url).toContain('sendUpdates=none')
    const corpo = JSON.parse(ida.pedido.body ?? '{}') as Record<string, { dateTime?: string } | string>
    expect(corpo.id).toBe(idDoEvento(REUNIAO))
    expect(corpo.start).toEqual({ dateTime: '2026-10-08T17:00:00Z' })
    expect(corpo.location).toBe(evento.local)
  })

  test('criar de novo a mesma reunião devolve o mesmo evento (409), e não um segundo', async () => {
    const { porta } = googleDublado(comToken(() => ({ status: 409, corpo: { error: { code: 409, errors: [{ reason: 'duplicate' }] } } })))
    expect(await porta.criarEvento(evento)).toEqual({ ok: true, valor: { externalEventId: idDoEvento(REUNIAO) } })
  })

  test('falha na criação volta traduzida', async () => {
    const { porta } = googleDublado(comToken(() => ({ status: 503, corpo: { error: { status: 'UNAVAILABLE' } } })))
    const resultado = await porta.criarEvento(evento)
    expect(estadoDaConexao(resultado)).toBe('indisponivel')
  })

  test('apagar o que já não existe conta como apagado', async () => {
    for (const status of [204, 404, 410]) {
      const { porta, idas } = googleDublado(comToken(() => ({ status })))
      expect(await porta.apagarEvento('evento/1')).toEqual({ ok: true, valor: { apagado: true } })
      expect(idas[1]!.pedido.method).toBe('DELETE')
      expect(idas[1]!.url).toContain('/events/evento%2F1?')
    }
  })

  test('apagar recusado volta traduzido', async () => {
    const { porta } = googleDublado(comToken(() => ({ status: 403, corpo: { error: { errors: [{ reason: 'forbidden' }] } } })))
    const resultado = await porta.apagarEvento('evento-1')
    expect(resultado.ok || resultado.motivo).toBe('sem_permissao_de_calendario')
  })
})

// Uma porta mínima que só conta idas, para provar o que acontece antes delas.
function portaQueConta(contar: () => void): PortaDeCalendario {
  const vazio = <T>(valor: T) => {
    contar()
    return Promise.resolve({ ok: true as const, valor })
  }
  return {
    lerOcupacao: () => vazio([]),
    conferirHorario: () => vazio({ livre: true }),
    criarEvento: () => vazio({ externalEventId: 'x' }),
    apagarEvento: () => vazio({ apagado: true as const }),
  }
}
