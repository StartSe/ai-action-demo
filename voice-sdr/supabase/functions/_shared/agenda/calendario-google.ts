// O adaptador do Google para `PortaDeCalendario`.
//
// É o único lugar do produto com os endereços e os nomes de campo da API de
// calendário do Google, como `agent-publish/formato-do-provedor.ts` é o único
// com os do provedor de voz. Quem o monta é o `index.ts` de quem o usa
// (`cron-calendar-sync`, `tool-book-meeting`): ele resolve o token de renovação
// por `resolverTokenDoCalendario` a partir de `specialist_calendars.refresh_secret_id`,
// lê o par do aplicativo OAuth do ambiente e passa o `fetch` do runtime em
// `buscar`. A regra (o que é ocupado, o que é livre, qual id tem o evento, como
// o erro vira frase) fica aqui, portável e testada sem rede; no `index.ts`
// sobra a fiação.
//
// O token nunca sai daqui: vai no corpo da troca por token de acesso, e o de
// acesso vai no cabeçalho. Nenhuma falha devolvida carrega corpo, URL ou
// mensagem do Google, só o motivo traduzido.
//
// Portável: sem Deno, sem SDK, sem import de rede.

import {
  falhaDoCalendario,
  normalizarHorarioDoProvedor,
  protegerPorta,
  sobrepoe,
  traduzirErroDoCalendario,
  type EventoDaReuniao,
  type FalhaDoCalendario,
  type OcupacaoDoCalendario,
  type PortaDeCalendario,
  type ResultadoDoCalendario,
} from './calendario.ts'

const ENDERECO_DO_TOKEN = 'https://oauth2.googleapis.com/token'
const BASE_DA_API = 'https://www.googleapis.com/calendar/v3'

/** Prazo de cada ida. A checagem ao vivo roda dentro dos 4 s da ferramenta. */
export const PRAZO_PADRAO_MS = 3_000

/** Páginas de 250 eventos: 30 dias de agenda cabem com folga, e o laço tem teto. */
export const TETO_DE_PAGINAS = 20

/** A resposta que o adaptador lê. O `Response` do `fetch` serve como está. */
export interface RespostaHttp {
  readonly status: number
  text(): Promise<string>
}

export interface PedidoHttp {
  readonly method: 'GET' | 'POST' | 'DELETE'
  readonly headers: Record<string, string>
  readonly body?: string
  readonly signal?: AbortSignal
}

export type Buscar = (url: string, pedido: PedidoHttp) => Promise<RespostaHttp>

export interface OpcoesDoGoogle {
  readonly buscar: Buscar
  /** Par do aplicativo OAuth, da instalação. */
  readonly clienteId: string
  readonly clienteSegredo: string
  /** Token de renovação do especialista, resolvido por `secrets.ts`. */
  readonly tokenDeAtualizacao: string
  /** `specialist_calendars.external_id`: em qual agenda ler e escrever. */
  readonly agendaId: string
  /** Fuso para ler o que o Google devolver em data local. É o do especialista. */
  readonly fuso: string
  readonly prazoMs?: number
  readonly agora?: () => number
}

/**
 * O id do evento derivado da reunião. O Google aceita id escolhido por quem
 * cria (base32hex, de 5 a 1024 caracteres), e o hexadecimal do uuid cabe nesse
 * alfabeto. Criar duas vezes a mesma reunião devolve 409 na segunda, e o 409
 * vira o mesmo id: a idempotência é do provedor, sem leitura antes.
 */
export function idDoEvento(reuniaoId: string): string {
  const hex = reuniaoId.toLowerCase().replace(/-/g, '')
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error(`id de reunião não é uuid: ${reuniaoId}`)
  return `sarah${hex}`
}

export function criarCalendarioDoGoogle(opcoes: OpcoesDoGoogle): PortaDeCalendario {
  const prazoMs = opcoes.prazoMs ?? PRAZO_PADRAO_MS
  const agora = opcoes.agora ?? Date.now
  const agenda = encodeURIComponent(opcoes.agendaId)
  let acesso: { readonly token: string; readonly expiraEm: number } | null = null

  async function ir(url: string, pedido: Omit<PedidoHttp, 'signal'>): Promise<{ status: number; corpo: unknown }> {
    const resposta = await opcoes.buscar(url, { ...pedido, signal: AbortSignal.timeout(prazoMs) })
    const texto = await resposta.text()
    return { status: resposta.status, corpo: lerJson(texto) }
  }

  async function tokenDeAcesso(): Promise<{ ok: true; token: string } | FalhaDoCalendario> {
    if (acesso && acesso.expiraEm > agora()) return { ok: true, token: acesso.token }
    const { status, corpo } = await ir(ENDERECO_DO_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: opcoes.clienteId,
        client_secret: opcoes.clienteSegredo,
        refresh_token: opcoes.tokenDeAtualizacao,
        grant_type: 'refresh_token',
      }).toString(),
    })
    const token = texto(campo(corpo, 'access_token'))
    if (status !== 200 || !token) return traduzirErroDoCalendario(codigoDoErro(corpo), status)
    const validadeS = numero(campo(corpo, 'expires_in')) ?? 3600
    // Um minuto de folga: token que vence no meio da ida volta 401.
    acesso = { token, expiraEm: agora() + Math.max(0, validadeS - 60) * 1000 }
    return { ok: true, token }
  }

  async function comAcesso<T>(
    ida: (cabecalhos: Record<string, string>) => Promise<ResultadoDoCalendario<T>>,
  ): Promise<ResultadoDoCalendario<T>> {
    const credencial = await tokenDeAcesso()
    if (!credencial.ok) return credencial
    return ida({ authorization: `Bearer ${credencial.token}`, 'content-type': 'application/json' })
  }

  const porta: PortaDeCalendario = {
    lerOcupacao: (janela) =>
      comAcesso(async (headers) => {
        const ocupacao: OcupacaoDoCalendario[] = []
        let pagina: string | null = null
        for (let volta = 0; volta < TETO_DE_PAGINAS; volta++) {
          const consulta = new URLSearchParams({
            timeMin: janela.inicio,
            timeMax: janela.fim,
            singleEvents: 'true',
            showDeleted: 'false',
            maxResults: '250',
          })
          if (pagina) consulta.set('pageToken', pagina)
          const { status, corpo } = await ir(`${BASE_DA_API}/calendars/${agenda}/events?${consulta}`, {
            method: 'GET',
            headers,
          })
          if (status !== 200) return traduzirErroDoCalendario(codigoDoErro(corpo), status)
          const fusoDaAgenda = texto(campo(corpo, 'timeZone')) ?? opcoes.fuso
          const itens = campo(corpo, 'items')
          for (const item of Array.isArray(itens) ? itens : []) {
            const lido = ocupacaoDe(item, fusoDaAgenda)
            if (lido && sobrepoe(lido, janela)) ocupacao.push(lido)
          }
          pagina = texto(campo(corpo, 'nextPageToken'))
          if (!pagina) return { ok: true, valor: ocupacao }
        }
        // Teto de páginas cheio: entregar a janela pela metade faria horário
        // ocupado parecer livre. Melhor falhar e manter o retrato anterior.
        return falhaDoCalendario('falha_do_calendario')
      }),

    conferirHorario: (inicio, fim) =>
      comAcesso(async (headers) => {
        const janela = { inicio, fim }
        const { status, corpo } = await ir(`${BASE_DA_API}/freeBusy`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ timeMin: janela.inicio, timeMax: janela.fim, items: [{ id: opcoes.agendaId }] }),
        })
        if (status !== 200) return traduzirErroDoCalendario(codigoDoErro(corpo), status)
        const daAgenda = campo(campo(corpo, 'calendars'), opcoes.agendaId)
        const erros = campo(daAgenda, 'errors')
        if (Array.isArray(erros) && erros.length > 0) {
          return traduzirErroDoCalendario(texto(campo(erros[0], 'reason')), null)
        }
        const ocupado = campo(daAgenda, 'busy')
        if (!Array.isArray(ocupado)) return falhaDoCalendario('falha_do_calendario')
        const livre = !ocupado.some((trecho) => {
          const de = normalizarHorarioDoProvedor({ instante: texto(campo(trecho, 'start')) }, opcoes.fuso)
          const ate = normalizarHorarioDoProvedor({ instante: texto(campo(trecho, 'end')) }, opcoes.fuso)
          // Trecho ilegível conta como ocupado: na dúvida, não marcar em cima.
          return !de || !ate || sobrepoe({ inicio: de, fim: ate }, janela)
        })
        return { ok: true, valor: { livre } }
      }),

    criarEvento: (reuniao) =>
      comAcesso(async (headers) => {
        const id = idDoEvento(reuniao.reuniaoId)
        const { status, corpo } = await ir(`${BASE_DA_API}/calendars/${agenda}/events?sendUpdates=none`, {
          method: 'POST',
          headers,
          body: JSON.stringify(corpoDoEvento(id, reuniao)),
        })
        // 409 é o evento desta reunião já criado por uma tentativa anterior.
        if (status === 200 || status === 409) return { ok: true, valor: { externalEventId: id } }
        return traduzirErroDoCalendario(codigoDoErro(corpo), status)
      }),

    apagarEvento: (externalEventId) =>
      comAcesso(async (headers) => {
        const { status, corpo } = await ir(
          `${BASE_DA_API}/calendars/${agenda}/events/${encodeURIComponent(externalEventId)}?sendUpdates=none`,
          { method: 'DELETE', headers },
        )
        // 404 e 410: o evento já não está lá, que é o que se queria.
        if (status === 204 || status === 200 || status === 404 || status === 410) {
          return { ok: true, valor: { apagado: true } }
        }
        return traduzirErroDoCalendario(codigoDoErro(corpo), status)
      }),
  }

  // A proteção confere a janela antes de cada ida: o que chega às funções
  // acima já está em UTC e tem duração.
  return protegerPorta(porta)
}

function corpoDoEvento(id: string, reuniao: EventoDaReuniao): Record<string, unknown> {
  return {
    id,
    summary: reuniao.titulo,
    description: reuniao.descricao,
    ...(reuniao.local ? { location: reuniao.local } : {}),
    start: { dateTime: reuniao.inicio },
    end: { dateTime: reuniao.fim },
    // Convite por e-mail é nosso (US-173): o Google não manda nada sozinho.
    guestsCanInviteOthers: false,
    extendedProperties: { private: { sarah_meeting_id: reuniao.reuniaoId } },
  }
}

/**
 * Um evento como ocupação, ou `null`. Cancelado e marcado como "livre"
 * (`transparency: transparent`) não ocupam; evento sem id ou sem horário
 * legível é descartado e os outros seguem.
 */
function ocupacaoDe(item: unknown, fusoDaAgenda: string): OcupacaoDoCalendario | null {
  const externalId = texto(campo(item, 'id'))
  if (!externalId) return null
  if (texto(campo(item, 'status')) === 'cancelled') return null
  if (texto(campo(item, 'transparency')) === 'transparent') return null
  const inicio = normalizarHorarioDoProvedor(horarioDe(campo(item, 'start')), fusoDaAgenda)
  const fim = normalizarHorarioDoProvedor(horarioDe(campo(item, 'end')), fusoDaAgenda)
  if (!inicio || !fim || Date.parse(fim) <= Date.parse(inicio)) return null
  return { externalId, inicio, fim }
}

function horarioDe(valor: unknown): { instante: string | null; data: string | null; fuso: string | null } {
  return {
    instante: texto(campo(valor, 'dateTime')),
    data: texto(campo(valor, 'date')),
    fuso: texto(campo(valor, 'timeZone')),
  }
}

/**
 * O código que o Google deu, onde quer que ele o tenha posto: `error` em texto
 * na troca de token, `error.errors[0].reason` ou `error.status` na API.
 */
function codigoDoErro(corpo: unknown): string | null {
  const erro = campo(corpo, 'error')
  if (typeof erro === 'string') return erro
  const detalhes = campo(erro, 'errors')
  const razao = Array.isArray(detalhes) ? texto(campo(detalhes[0], 'reason')) : null
  return razao ?? texto(campo(erro, 'status'))
}

function lerJson(textoCru: string): unknown {
  if (!textoCru) return null
  try {
    return JSON.parse(textoCru) as unknown
  } catch {
    return null
  }
}

function campo(valor: unknown, nome: string): unknown {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return undefined
  return Object.prototype.hasOwnProperty.call(valor, nome) ? (valor as Record<string, unknown>)[nome] : undefined
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
}

function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

// O par do OAuth -----------------------------------------------------------------
//
// `calendar-connect` monta o endereço de autorização e `calendar-callback` troca
// o código pelo token de renovação. Os endereços e os nomes de campo moram aqui
// pela mesma razão do resto do arquivo: um lugar só sabe como o Google fala.

const ENDERECO_DE_AUTORIZACAO = 'https://accounts.google.com/o/oauth2/v2/auth'

/**
 * O escopo mínimo para o que o adaptador faz: ler e escrever evento
 * (`events.list`, `events.insert`, `events.delete`) e consultar ocupação
 * (`freeBusy`). Os dois são escopos sensíveis, e é por isso que o aplicativo
 * precisa da verificação do Google (P-04). O escopo amplo `calendar` daria
 * também criar e apagar agendas inteiras, que nada aqui usa.
 */
export const ESCOPOS_DO_CALENDARIO = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
] as const

/**
 * A agenda em que o evento nasce. `primary` é o apelido que o Google dá à agenda
 * principal de quem autorizou, e é ela que o especialista usa para a própria
 * rotina. Escolher outra agenda é decisão de tela, que ainda não existe.
 */
export const AGENDA_PRINCIPAL = 'primary'

export interface PedidoDeAutorizacao {
  readonly clienteId: string
  /** O endereço de `calendar-callback`, idêntico ao cadastrado no aplicativo. */
  readonly redirecionamento: string
  readonly estado: string
}

/**
 * O endereço para onde a tela manda quem administra. `access_type=offline` é o
 * que faz o Google devolver token de renovação, e `prompt=consent` o faz
 * devolvê-lo também na reconexão: sem ele, quem já autorizou uma vez recebe só o
 * token de acesso, que vence em uma hora.
 */
export function montarEnderecoDeAutorizacao(pedido: PedidoDeAutorizacao): string {
  const endereco = new URL(ENDERECO_DE_AUTORIZACAO)
  endereco.searchParams.set('client_id', pedido.clienteId)
  endereco.searchParams.set('redirect_uri', pedido.redirecionamento)
  endereco.searchParams.set('response_type', 'code')
  endereco.searchParams.set('scope', ESCOPOS_DO_CALENDARIO.join(' '))
  endereco.searchParams.set('access_type', 'offline')
  endereco.searchParams.set('prompt', 'consent')
  endereco.searchParams.set('state', pedido.estado)
  return endereco.toString()
}

export interface OpcoesDaTroca {
  readonly buscar: Buscar
  readonly clienteId: string
  readonly clienteSegredo: string
  readonly redirecionamento: string
  readonly codigo: string
  readonly prazoMs?: number
}

/**
 * Troca o código de autorização pelo token de renovação. Nunca levanta: falha
 * de rede, recusa e resposta sem token voltam como `FalhaDoCalendario`, sem
 * corpo nem mensagem do Google. O token de acesso que vem junto é descartado
 * aqui: quem o usa renova pelo de renovação.
 */
export async function trocarCodigoPorToken(
  opcoes: OpcoesDaTroca,
): Promise<ResultadoDoCalendario<{ readonly tokenDeAtualizacao: string }>> {
  let status: number
  let corpo: unknown
  try {
    const resposta = await opcoes.buscar(ENDERECO_DO_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: opcoes.clienteId,
        client_secret: opcoes.clienteSegredo,
        code: opcoes.codigo,
        redirect_uri: opcoes.redirecionamento,
        grant_type: 'authorization_code',
      }).toString(),
      signal: AbortSignal.timeout(opcoes.prazoMs ?? PRAZO_PADRAO_MS),
    })
    status = resposta.status
    corpo = lerJson(await resposta.text())
  } catch {
    return falhaDoCalendario('sem_resposta')
  }

  if (status !== 200) return traduzirErroDoCalendario(codigoDoErro(corpo), status)
  // 200 sem token de renovação é o Google devolvendo só o de acesso: a conexão
  // valeria uma hora e morreria calada na primeira passagem da rotina.
  const token = texto(campo(corpo, 'refresh_token'))
  if (!token) return falhaDoCalendario('falha_do_calendario')
  return { ok: true, valor: { tokenDeAtualizacao: token } }
}
