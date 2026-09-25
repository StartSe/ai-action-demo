// O convite da reunião por e-mail, para o lead e para o especialista (RF-509).
//
// Quem envia é `tool-book-meeting`, na mesma requisição do agendamento, depois
// do evento no calendário; quem tenta de novo é `cron-meeting-invite`. As duas
// bordas falam com este módulo, e é por isso que a regra da nova tentativa
// existe uma vez só. Os textos moram em `_shared/speech/convite.ts`.
//
// Cinco regras seguram o arquivo:
//
// 1. **O convite não desfaz a reunião.** Falha de um lado grava a frase na
//    coluna dele, soma a tentativa e agenda a próxima; nada aqui levanta pelo
//    provedor. Só a escrita no banco pode levantar, e quem chama decide.
// 2. **`sent_at` só depois de 2xx** (R-05). A porta de e-mail devolve `ok` só
//    com 2xx, e é só aí que `gravarEnvio` é chamado. Marcar antes é perder
//    convite sem ninguém saber.
// 3. **Por destinatário.** Os dois lados andam separados: o que já saiu não
//    sai de novo quando o outro tenta de novo, e o lead sem e-mail não segura
//    o convite do especialista.
// 4. **Idempotente** (RNF-06). Lado com `sent_at` não vai ao provedor; a
//    reivindicação da rotina tira a reunião da fila por quatro minutos; e a
//    chave de idempotência da mensagem é derivada da reunião, do lado e do
//    número da tentativa, para a ferramenta e a rotina que se cruzassem na
//    mesma tentativa serem o mesmo envio para o provedor.
// 5. **Recuo com teto**, pela mesma regra de R-05: até `TETO_DE_TENTATIVAS`
//    envios; na última falha a próxima fica nula e o convite é o que desistiu,
//    que a tela de reuniões mostra marcado. Lead sem e-mail não conta
//    tentativa (não houve envio) e volta a ser olhado de hora em hora, para o
//    convite sair sozinho quando alguém cadastrar o e-mail. O mesmo vale para
//    a conta sem e-mail configurado (chave ou remetente em Integrações,
//    `MOTIVOS_DE_CONFIGURACAO`): não houve envio, a tentativa não conta, e o
//    convite sai sozinho na primeira passagem depois da configuração.
//
// O horário sai no fuso de cada destinatário: `leads.timezone` para o lead (e
// o da conta só quando o lead não tem fuso, como na fala da confirmação) e
// `specialists.timezone` para o especialista. O anexo em iCalendar leva o
// mesmo início e fim do evento no calendário, em UTC, e o mesmo UID para os
// dois lados.
//
// Portável: sem Deno, sem rede, sem banco.

import {
  MENSAGENS_DO_EMAIL,
  MOTIVOS_DE_CONFIGURACAO,
  falhaDoEmail,
  type FalhaDoEmail,
  type MensagemDeEmail,
  type PortaDeEmail,
} from '../email/email.ts'
import {
  textoDoConviteDoEspecialista,
  textoDoConviteDoLead,
  type DadosDoConvite,
  type ModalidadeDoConvite,
} from '../speech/convite.ts'

import { textoDoResumo } from './evento-da-reuniao.ts'

export type LadoDoConvite = 'lead' | 'especialista'

/** Espera, em minutos, depois da 1ª, 2ª, 3ª e 4ª falha. */
export const RECUO_EM_MINUTOS: readonly number[] = [1, 5, 15, 60]

/** Na 5ª falha a rotina desiste, e o convite aparece pendente na tela (R-05). */
export const TETO_DE_TENTATIVAS = RECUO_EM_MINUTOS.length + 1

/** De quanto em quanto tempo o convite do lead sem e-mail volta a ser olhado. */
export const ESPERA_SEM_EMAIL_EM_MINUTOS = 60

/**
 * O motivo do convite do lead pendente por falta de endereço. Registro de
 * interface: a tela de reuniões mostra esta frase, e ela diz o que fazer.
 */
export const MENSAGEM_SEM_EMAIL =
  'O lead não tem e-mail cadastrado. Cadastre o e-mail na ficha do lead e o convite sai na próxima passagem.'

/** As quatro colunas de entrega de um lado, como a linha as traz. */
export interface EntregaDoConvite {
  readonly enviadoEm: string | null
  readonly tentativas: number
  readonly erro: string | null
  readonly proximaTentativa: string | null
}

/** O que a borda lê do banco para montar os dois convites de uma reunião. */
export interface ReuniaoParaConvite {
  readonly id: string
  readonly account_id: string
  readonly starts_at: string
  readonly ends_at: string
  readonly modality: ModalidadeDoConvite
  readonly notes: string | null
  readonly handoff_summary: unknown
  readonly empresa: string
  /** `agents.name` da conta: o nome com que a assistente se apresentou. */
  readonly assistente: string | null
  readonly fusoDaConta: string
  readonly lead: {
    readonly nome: string | null
    readonly email: string | null
    readonly telefone: string | null
    readonly fuso: string | null
    readonly empresa: string | null
    readonly cidade: string | null
    readonly estado: string | null
    readonly origem: string | null
    readonly temperatura: string | null
    readonly entrouEm: string | null
    readonly ultimaAtividade: string | null
  }
  readonly especialista: {
    readonly nome: string
    readonly email: string
    readonly fuso: string
    readonly sala: string | null
  }
  readonly entregaDoLead: EntregaDoConvite
  readonly entregaDoEspecialista: EntregaDoConvite
}

/**
 * O `select` do PostgREST que traz a reunião com o lead, o especialista e a
 * conta. As duas bordas o usam com `lerReuniaoParaConvite`, para a leitura não
 * existir em duas versões.
 */
export const SELECAO_DA_REUNIAO_PARA_CONVITE =
  'id, account_id, starts_at, ends_at, modality, notes, handoff_summary, ' +
  'lead_invite_sent_at, lead_invite_attempts, lead_invite_error, lead_invite_retry_at, ' +
  'specialist_invite_sent_at, specialist_invite_attempts, specialist_invite_error, specialist_invite_retry_at, ' +
  'leads(name, email, phone_e164, timezone, company, city, state, source, temperature, created_at, last_activity_at), ' +
  'specialists(name, email, timezone, room_url), accounts(name, timezone, agents(name))'

/** A linha do PostgREST, com os embutidos, como `ReuniaoParaConvite`. */
export function lerReuniaoParaConvite(linha: Readonly<Record<string, unknown>>): ReuniaoParaConvite {
  const embutido = (chave: string): Record<string, unknown> => {
    const valor = linha[chave]
    const objeto = Array.isArray(valor) ? valor[0] : valor
    return objeto && typeof objeto === 'object' ? (objeto as Record<string, unknown>) : {}
  }
  const texto = (origem: Readonly<Record<string, unknown>>, chave: string): string | null => {
    const valor = origem[chave]
    return typeof valor === 'string' && valor.trim() !== '' ? valor : null
  }
  const numero = (chave: string): number => (typeof linha[chave] === 'number' ? (linha[chave] as number) : 0)
  const entrega = (lado: LadoDoConvite): EntregaDoConvite => {
    const colunas = colunasDoConvite(lado)
    return {
      enviadoEm: texto(linha, colunas.enviadoEm),
      tentativas: numero(colunas.tentativas),
      erro: texto(linha, colunas.erro),
      proximaTentativa: texto(linha, colunas.proximaTentativa),
    }
  }

  const lead = embutido('leads')
  const especialista = embutido('specialists')
  const conta = embutido('accounts')
  const agentes = conta.agents
  const agente = (Array.isArray(agentes) ? agentes[0] : agentes) as Record<string, unknown> | null | undefined
  return {
    id: String(linha.id),
    account_id: String(linha.account_id),
    starts_at: String(linha.starts_at),
    ends_at: String(linha.ends_at),
    modality: linha.modality as ModalidadeDoConvite,
    notes: texto(linha, 'notes'),
    handoff_summary: linha.handoff_summary ?? null,
    empresa: texto(conta, 'name') ?? '',
    assistente: agente && typeof agente === 'object' ? texto(agente, 'name') : null,
    fusoDaConta: texto(conta, 'timezone') ?? 'America/Sao_Paulo',
    lead: {
      nome: texto(lead, 'name'),
      email: texto(lead, 'email'),
      telefone: texto(lead, 'phone_e164'),
      fuso: texto(lead, 'timezone'),
      empresa: texto(lead, 'company'),
      cidade: texto(lead, 'city'),
      estado: texto(lead, 'state'),
      origem: texto(lead, 'source'),
      temperatura: texto(lead, 'temperature'),
      entrouEm: texto(lead, 'created_at'),
      ultimaAtividade: texto(lead, 'last_activity_at'),
    },
    especialista: {
      nome: texto(especialista, 'name') ?? 'Especialista',
      email: texto(especialista, 'email') ?? '',
      fuso: texto(especialista, 'timezone') ?? texto(conta, 'timezone') ?? 'America/Sao_Paulo',
      sala: texto(especialista, 'room_url'),
    },
    entregaDoLead: entrega('lead'),
    entregaDoEspecialista: entrega('especialista'),
  }
}

/** O fuso em que o lead lê o horário. O da conta só quando o lead não tem. */
export function fusoDoLead(reuniao: Pick<ReuniaoParaConvite, 'lead' | 'fusoDaConta'>): string {
  return reuniao.lead.fuso?.trim() || reuniao.fusoDaConta
}

function dadosDoConvite(reuniao: ReuniaoParaConvite): DadosDoConvite {
  return {
    inicio: reuniao.starts_at,
    fim: reuniao.ends_at,
    modalidade: reuniao.modality,
    empresa: reuniao.empresa,
    assistente: reuniao.assistente,
    especialista: {
      nome: reuniao.especialista.nome,
      sala: reuniao.especialista.sala,
      fuso: reuniao.especialista.fuso,
    },
    lead: { ...reuniao.lead, fuso: fusoDoLead(reuniao) },
    resumo: textoDoResumo(reuniao.handoff_summary),
    notas: reuniao.notes?.trim() || null,
  }
}

// iCalendar ----------------------------------------------------------------------

/** Texto de propriedade iCalendar (RFC 5545 3.3.11): barra, ponto e vírgula, vírgula e quebra. */
export function escaparTextoDoIcs(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/**
 * Linha com mais de 75 octetos se dobra (RFC 5545 3.1): quebra CRLF e um
 * espaço. A conta é em bytes de UTF-8, e a quebra nunca cai no meio de um
 * caractere, senão o acento chega partido.
 */
export function dobrarLinhaDoIcs(linha: string): string {
  const codificador = new TextEncoder()
  const partes: string[] = []
  let atual = ''
  let bytes = 0
  for (const caractere of linha) {
    const tamanho = codificador.encode(caractere).length
    const limite = partes.length === 0 ? 75 : 74
    if (bytes + tamanho > limite) {
      partes.push(atual)
      atual = ''
      bytes = 0
    }
    atual += caractere
    bytes += tamanho
  }
  partes.push(atual)
  return partes.join('\r\n ')
}

/** `2026-10-06T17:00:00.000Z` como `20261006T170000Z`. */
export function instanteDoIcs(instante: string): string {
  const ms = Date.parse(instante)
  if (!Number.isFinite(ms)) throw new Error(`instante inválido para o convite: ${instante}`)
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** O UID do anexo: o mesmo para os dois lados, para os dois calendários falarem do mesmo evento. */
export function uidDoConvite(reuniaoId: string): string {
  return `reuniao-${reuniaoId}@sarah`
}

export interface EventoDoIcs {
  readonly reuniaoId: string
  readonly inicio: string
  readonly fim: string
  readonly titulo: string
  readonly descricao: string
  readonly local: string | null
  readonly carimbo: string
}

/**
 * O anexo `.ics`. `METHOD:PUBLISH`, e não `REQUEST`: o convite não pede
 * resposta (quem confirma é a ligação de lembrete), e `REQUEST` exigiria um
 * organizador que recebesse o aceite.
 */
export function montarIcs(evento: EventoDoIcs): string {
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sarah Voice SDR//Convite de reunião//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uidDoConvite(evento.reuniaoId)}`,
    `DTSTAMP:${instanteDoIcs(evento.carimbo)}`,
    `DTSTART:${instanteDoIcs(evento.inicio)}`,
    `DTEND:${instanteDoIcs(evento.fim)}`,
    `SUMMARY:${escaparTextoDoIcs(evento.titulo)}`,
    `DESCRIPTION:${escaparTextoDoIcs(evento.descricao)}`,
    ...(evento.local ? [`LOCATION:${escaparTextoDoIcs(evento.local)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return linhas.map(dobrarLinhaDoIcs).join('\r\n') + '\r\n'
}

// As duas mensagens ---------------------------------------------------------------

/** A chave de idempotência de um envio: reunião, lado e número da tentativa. */
export function chaveDoConvite(reuniaoId: string, lado: LadoDoConvite, tentativa: number): string {
  return `convite-${reuniaoId}-${lado}-${tentativa}`
}

/** A mensagem de um lado, pronta para a porta. `para` vem de quem chama. */
export function montarConvite(
  reuniao: ReuniaoParaConvite,
  lado: LadoDoConvite,
  para: string,
  agoraMs: number,
): MensagemDeEmail {
  const dados = dadosDoConvite(reuniao)
  const texto = lado === 'lead' ? textoDoConviteDoLead(dados) : textoDoConviteDoEspecialista(dados)
  const nomeDoLead = reuniao.lead.nome?.trim() || 'lead sem nome'
  const ics = montarIcs({
    reuniaoId: reuniao.id,
    inicio: reuniao.starts_at,
    fim: reuniao.ends_at,
    titulo: lado === 'lead' ? `Conversa com ${reuniao.especialista.nome}` : `Reunião com ${nomeDoLead}`,
    descricao: texto.corpo,
    local: reuniao.especialista.sala,
    carimbo: new Date(agoraMs).toISOString(),
  })
  const entrega = lado === 'lead' ? reuniao.entregaDoLead : reuniao.entregaDoEspecialista
  return {
    para,
    assunto: texto.assunto,
    texto: texto.corpo,
    anexos: [{ nome: 'convite.ics', tipo: 'text/calendar; charset=utf-8; method=PUBLISH', conteudo: ics }],
    chaveDeIdempotencia: chaveDoConvite(reuniao.id, lado, entrega.tentativas + 1),
  }
}

// A regra da nova tentativa --------------------------------------------------------

export interface PendenciaDoConvite {
  readonly tentativas: number
  /** A frase já traduzida, para `*_invite_error`. */
  readonly erro: string
  /** Nula quando as tentativas chegaram ao teto. */
  readonly proximaTentativa: string | null
}

/** A pendência depois de `tentativas` envios sem sucesso, com a próxima pelo recuo. */
export function pendenciaDepoisDe(tentativas: number, erro: string, agoraMs: number): PendenciaDoConvite {
  const espera = tentativas < TETO_DE_TENTATIVAS ? RECUO_EM_MINUTOS[tentativas - 1] : undefined
  return {
    tentativas,
    erro,
    proximaTentativa: espera === undefined ? null : new Date(agoraMs + espera * 60_000).toISOString(),
  }
}

/** O lado que ainda deve ir ao provedor agora: não enviado, abaixo do teto e com a espera vencida. */
export function ladoPendente(entrega: EntregaDoConvite, agoraMs: number): boolean {
  if (entrega.enviadoEm !== null) return false
  if (entrega.tentativas >= TETO_DE_TENTATIVAS) return false
  return entrega.proximaTentativa === null || Date.parse(entrega.proximaTentativa) <= agoraMs
}

/** Convite que chegou ao teto sem sair: o que a tela mostra marcado. */
export function conviteDesistiu(entrega: Pick<EntregaDoConvite, 'enviadoEm' | 'tentativas'>): boolean {
  return entrega.enviadoEm === null && entrega.tentativas >= TETO_DE_TENTATIVAS
}

/**
 * O estado de um lado para a tela (US-179, US-180). `sem_email` só existe do
 * lado do lead, e vem do dado, não da frase gravada.
 */
export type SituacaoDoConvite = 'enviado' | 'sem_email' | 'email_nao_configurado' | 'desistiu' | 'tentando'

/** As frases gravadas quando a conta não tem e-mail configurado. */
const FRASES_DE_CONFIGURACAO: ReadonlySet<string> = new Set(
  [...MOTIVOS_DE_CONFIGURACAO].map((motivo) => MENSAGENS_DO_EMAIL[motivo]),
)

/** A pendência é da configuração da conta, lida pela frase que o envio gravou. */
export function faltaEmailDaConta(entrega: Pick<EntregaDoConvite, 'enviadoEm' | 'erro'>): boolean {
  return entrega.enviadoEm === null && entrega.erro !== null && FRASES_DE_CONFIGURACAO.has(entrega.erro)
}

export function situacaoDoConvite(entrega: EntregaDoConvite, temEmail: boolean): SituacaoDoConvite {
  if (entrega.enviadoEm !== null) return 'enviado'
  if (!temEmail) return 'sem_email'
  if (faltaEmailDaConta(entrega)) return 'email_nao_configurado'
  return conviteDesistiu(entrega) ? 'desistiu' : 'tentando'
}

/**
 * As colunas de `meetings` de cada lado. Os dois `index.ts` escrevem por
 * aqui, para o nome da coluna existir num lugar só e o teste de banco
 * conferi-lo contra a migração.
 */
export function colunasDoConvite(lado: LadoDoConvite) {
  const prefixo = lado === 'lead' ? 'lead' : 'specialist'
  return {
    enviadoEm: `${prefixo}_invite_sent_at`,
    tentativas: `${prefixo}_invite_attempts`,
    erro: `${prefixo}_invite_error`,
    proximaTentativa: `${prefixo}_invite_retry_at`,
  } as const
}

/** O `update` do envio: a marca, e erro e próxima tentativa zerados. Condicionado a `enviadoEm` nulo. */
export function atualizacaoDoEnvio(lado: LadoDoConvite, enviadoEm: string): Record<string, string | null> {
  const colunas = colunasDoConvite(lado)
  return { [colunas.enviadoEm]: enviadoEm, [colunas.erro]: null, [colunas.proximaTentativa]: null }
}

/** O `update` da pendência. Condicionado a `enviadoEm` nulo, para não reabrir o que já saiu. */
export function atualizacaoDaPendencia(
  lado: LadoDoConvite,
  pendencia: PendenciaDoConvite,
): Record<string, string | number | null> {
  const colunas = colunasDoConvite(lado)
  return {
    [colunas.tentativas]: pendencia.tentativas,
    [colunas.erro]: pendencia.erro,
    [colunas.proximaTentativa]: pendencia.proximaTentativa,
  }
}

/** O que o módulo escreve. Implementado no `index.ts` de cada borda. */
export interface PortaDoConviteDaReuniao {
  /** Grava `*_invite_sent_at` só onde ele está nulo, e zera erro e próxima tentativa. */
  gravarEnvioDoConvite(contaId: string, reuniaoId: string, lado: LadoDoConvite, enviadoEm: string): Promise<void>
  /** Grava `*_invite_attempts`, `*_invite_error` e `*_invite_retry_at`, só onde `*_invite_sent_at` está nulo. */
  registrarPendenciaDoConvite(
    contaId: string,
    reuniaoId: string,
    lado: LadoDoConvite,
    pendencia: PendenciaDoConvite,
  ): Promise<void>
}

export type DesfechoDoLado =
  | { readonly situacao: 'ja_enviado' }
  | { readonly situacao: 'aguardando' }
  | { readonly situacao: 'enviado' }
  | { readonly situacao: 'sem_email'; readonly pendencia: PendenciaDoConvite }
  | { readonly situacao: 'email_nao_configurado'; readonly pendencia: PendenciaDoConvite }
  | { readonly situacao: 'falhou'; readonly pendencia: PendenciaDoConvite }

export interface DesfechoDoConvite {
  readonly lead: DesfechoDoLado
  readonly especialista: DesfechoDoLado
}

export interface PedidoDoConvite {
  readonly reuniao: ReuniaoParaConvite
  /** A falha no lugar da porta quando a conta não tem e-mail configurado. */
  readonly email: PortaDeEmail | FalhaDoEmail
  readonly porta: PortaDoConviteDaReuniao
  readonly agora: () => number
}

async function enviarUmLado(
  pedido: PedidoDoConvite,
  lado: LadoDoConvite,
  para: string | null,
  agoraMs: number,
): Promise<DesfechoDoLado> {
  const { reuniao, email, porta } = pedido
  const entrega = lado === 'lead' ? reuniao.entregaDoLead : reuniao.entregaDoEspecialista
  if (entrega.enviadoEm !== null) return { situacao: 'ja_enviado' }
  if (!ladoPendente(entrega, agoraMs)) return { situacao: 'aguardando' }

  if (para === null) {
    const pendencia: PendenciaDoConvite = {
      tentativas: entrega.tentativas,
      erro: MENSAGEM_SEM_EMAIL,
      proximaTentativa: new Date(agoraMs + ESPERA_SEM_EMAIL_EM_MINUTOS * 60_000).toISOString(),
    }
    await porta.registrarPendenciaDoConvite(reuniao.account_id, reuniao.id, lado, pendencia)
    return { situacao: 'sem_email', pendencia }
  }

  // Conta sem e-mail configurado: não houve envio, e a tentativa não conta.
  // O convite volta a ser olhado de hora em hora, como o do lead sem e-mail.
  if ('ok' in email && MOTIVOS_DE_CONFIGURACAO.has(email.motivo)) {
    const pendencia: PendenciaDoConvite = {
      tentativas: entrega.tentativas,
      erro: email.mensagem,
      proximaTentativa: new Date(agoraMs + ESPERA_SEM_EMAIL_EM_MINUTOS * 60_000).toISOString(),
    }
    await porta.registrarPendenciaDoConvite(reuniao.account_id, reuniao.id, lado, pendencia)
    return { situacao: 'email_nao_configurado', pendencia }
  }

  const resultado =
    'ok' in email ? email : await email.enviar(montarConvite(reuniao, lado, para, agoraMs)).catch(() => falhaDoEmail('sem_resposta'))
  if (resultado.ok) {
    await porta.gravarEnvioDoConvite(reuniao.account_id, reuniao.id, lado, new Date(agoraMs).toISOString())
    return { situacao: 'enviado' }
  }

  const pendencia = pendenciaDepoisDe(entrega.tentativas + 1, resultado.mensagem, agoraMs)
  await porta.registrarPendenciaDoConvite(reuniao.account_id, reuniao.id, lado, pendencia)
  return { situacao: 'falhou', pendencia }
}

/**
 * Envia os dois convites da reunião, ou registra por que não enviou. Os dois
 * lados vão juntos, porque dentro da ferramenta o tempo é do orçamento da
 * ligação, e a falha de um não impede o outro: exceção da escrita de um lado
 * espera o outro terminar e só então sobe para quem chamou.
 */
export async function enviarConvitesDaReuniao(pedido: PedidoDoConvite): Promise<DesfechoDoConvite> {
  const agoraMs = pedido.agora()
  const destinatarioDoLead = pedido.reuniao.lead.email?.trim() || null
  const destinatarioDoEspecialista = pedido.reuniao.especialista.email.trim() || null

  const [especialista, lead] = await Promise.allSettled([
    enviarUmLado(pedido, 'especialista', destinatarioDoEspecialista, agoraMs),
    enviarUmLado(pedido, 'lead', destinatarioDoLead, agoraMs),
  ])
  if (especialista.status === 'rejected') throw especialista.reason
  if (lead.status === 'rejected') throw lead.reason
  return { lead: lead.value, especialista: especialista.value }
}
