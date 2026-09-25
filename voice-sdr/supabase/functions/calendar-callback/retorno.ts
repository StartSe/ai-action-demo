// calendar-callback: a volta do Google com o código de autorização (L-06, RF-507).
//
// É a outra metade de `calendar-connect`. O Google devolve o navegador para cá
// com `code` e `state` na barra de endereço, e esta borda:
//
//   1. confere o `state` antes de qualquer outra coisa: assinatura, validade e
//      propósito. Recusado, nada se lê e nada se grava;
//   2. confere que o especialista do `state` é da conta do `state` e que quem
//      clicou ainda a administra — assinatura válida prova que o `state` nasceu
//      aqui, não que a situação continua a mesma dez minutos depois;
//   3. troca o código pelo token de renovação, de servidor para servidor;
//   4. grava o token no Vault e só o ponteiro em `specialist_calendars`, pelo
//      RPC que reaproveita o `secret_id` quando o calendário já existia;
//   5. invalida o cache de `_shared/secrets.ts` na mesma passagem, para a
//      próxima leitura deste processo não servir o token velho.
//
// **Credencial nenhuma sai daqui.** O código de autorização e o token não
// entram em resposta nem em log: a página leva só a frase, o log leva só o
// motivo, e antes de responder `conferirQueNaoVazou` procura os dois no corpo
// serializado. Achou, a borda responde a falha genérica em vez da página.
//
// **Por que é pública.** Quem chega é um navegador redirecionado pelo Google,
// sem `Authorization` nosso. A credencial é o `state` assinado, conferida aqui
// por conta própria (`verify_jwt = false`, com o motivo em `config.toml`).
//
// Módulo portável: sem Deno, sem banco. A rede entra por `buscar`, que o teste
// dubla: o dublê substitui o Google, não a decisão.

import { MENSAGENS_DO_CALENDARIO, SEGREDO_DO_CALENDARIO, type MotivoDoCalendario } from '../_shared/agenda/calendario.ts'
import { AGENDA_PRINCIPAL, trocarCodigoPorToken, type Buscar } from '../_shared/agenda/calendario-google.ts'
import { lerEstadoDaConexao, type RecusaDoEstado } from '../_shared/agenda/estado-da-conexao.ts'
import { NOME_DO_PRODUTO } from '../_shared/marca.ts'
import { conferirQueNaoVazou } from '../_shared/provedor/vazamento.ts'

import { montarPagina } from './pagina.ts'

/** O único provedor com adaptador. Provedor novo é outra volta, com outro endereço. */
export const PROVEDOR_DO_CALENDARIO = 'google'

/** Os papéis de `has_role(conta, 'admin')`, os mesmos de `calendar-connect`. */
const PAPEIS_QUE_CONECTAM: ReadonlySet<string> = new Set(['owner', 'admin'])

export type MotivoDaVolta =
  | RecusaDoEstado
  | 'metodo_nao_suportado'
  | 'autorizacao_negada'
  | 'codigo_ausente'
  | 'especialista_de_outra_conta'
  | 'sem_permissao'
  | 'aguardando_google'
  | 'troca_recusada'
  | 'falha_ao_gravar'

// Registro de interface: direto e declarativo, sem travessão
// (docs/padrao-de-interface.md seção 4).
export const FRASES_DA_VOLTA: Record<MotivoDaVolta, string> = {
  metodo_nao_suportado: 'Este endereço só recebe a volta da autorização do Google.',
  estado_ausente: 'Este endereço só funciona a partir do botão de conectar na ficha do especialista.',
  estado_malformado: 'O pedido de conexão voltou incompleto. Abra a ficha do especialista e conecte de novo.',
  assinatura_invalida:
    'Não foi possível confirmar que este pedido partiu daqui. Conecte de novo pela ficha do especialista.',
  estado_expirado: 'O pedido de conexão expirou. Abra a ficha do especialista e conecte de novo.',
  autorizacao_negada: 'A autorização foi cancelada no Google. O calendário continua como estava.',
  codigo_ausente: 'O Google não devolveu a autorização. Conecte de novo pela ficha do especialista.',
  especialista_de_outra_conta: 'Este especialista não pertence à conta que pediu a conexão. Nada foi gravado.',
  sem_permissao: 'Só quem administra a conta conecta o calendário de um especialista. Nada foi gravado.',
  aguardando_google: MENSAGENS_DO_CALENDARIO.sem_permissao_de_calendario,
  troca_recusada: 'O Google recusou a autorização. Conecte de novo pela ficha do especialista.',
  falha_ao_gravar: 'A autorização chegou, mas não foi possível gravá-la. Conecte de novo pela ficha do especialista.',
}

export const TITULO_CONECTADO = 'Calendário conectado'
export const FRASE_CONECTADO =
  `A agenda deste especialista está ligada ao ${NOME_DO_PRODUTO}. A ocupação aparece na próxima leitura, em até cinco minutos.`
export const FRASE_RECONECTADO =
  'A agenda deste especialista foi reconectada. A ocupação aparece na próxima leitura, em até cinco minutos.'
export const TITULO_RECUSADO = 'Calendário não conectado'

const STATUS: Record<MotivoDaVolta, number> = {
  metodo_nao_suportado: 405,
  estado_ausente: 400,
  estado_malformado: 400,
  assinatura_invalida: 400,
  estado_expirado: 400,
  autorizacao_negada: 200,
  codigo_ausente: 400,
  especialista_de_outra_conta: 403,
  sem_permissao: 403,
  aguardando_google: 200,
  troca_recusada: 502,
  falha_ao_gravar: 500,
}

export interface PedidoDaVolta {
  readonly metodo: string
  readonly estado: string | null
  readonly codigo: string | null
  /** `error` da barra de endereço: o Google o manda quando a pessoa nega. */
  readonly erro: string | null
}

export interface CalendarioParaGravar {
  readonly contaId: string
  readonly especialistaId: string
  readonly provedor: string
  readonly agendaId: string
  readonly tokenDeAtualizacao: string
}

export interface EventoDaVolta {
  readonly evento: 'calendario_conectado' | 'volta_recusada'
  readonly motivo?: MotivoDaVolta
  readonly detalhe?: MotivoDoCalendario
  readonly contaId?: string
  readonly especialistaId?: string
  readonly reaproveitado?: boolean
}

export interface PortaDaVolta {
  especialistaDaConta(contaId: string, especialistaId: string): Promise<boolean>
  papelNaConta(contaId: string, usuarioId: string): Promise<string | null>
  /** Grava pelo RPC que reaproveita o `secret_id` do calendário que já existia. */
  gravarCalendario(calendario: CalendarioParaGravar): Promise<{ readonly calendarioId: string; readonly reaproveitado: boolean }>
  /** Descarta o token deste provedor do cache de `secrets.ts` para a conta. */
  invalidarCredencial(contaId: string, provedor: string, chave: string): void
  registrarNoLog(evento: EventoDaVolta): void
}

export interface ConfiguracaoDaVolta {
  readonly buscar: Buscar
  readonly clienteId: string
  readonly clienteSegredo: string
  readonly redirecionamento: string
  readonly chaveDoServidor: string
  /** Endereço da interface para o botão de volta. Vazio, a página pede para fechar a janela. */
  readonly destino?: string | null
  readonly agora?: () => number
  readonly prazoMs?: number
}

export interface RespostaDaVolta {
  readonly status: number
  readonly html: string
}

export async function atenderVoltaDoCalendario(
  pedido: PedidoDaVolta,
  porta: PortaDaVolta,
  configuracao: ConfiguracaoDaVolta,
): Promise<RespostaDaVolta> {
  // Os valores que não podem sair, recolhidos à medida que aparecem.
  const sensiveis: string[] = []
  if (pedido.codigo) sensiveis.push(pedido.codigo)

  const resposta = await decidir(pedido, porta, configuracao, sensiveis)
  try {
    conferirQueNaoVazou(resposta, sensiveis, 'calendar-callback: credencial no corpo da resposta')
    return resposta
  } catch {
    return pagina(STATUS.falha_ao_gravar, TITULO_RECUSADO, FRASES_DA_VOLTA.falha_ao_gravar, configuracao.destino)
  }
}

async function decidir(
  pedido: PedidoDaVolta,
  porta: PortaDaVolta,
  configuracao: ConfiguracaoDaVolta,
  sensiveis: string[],
): Promise<RespostaDaVolta> {
  const recusar = (motivo: MotivoDaVolta, detalhe?: MotivoDoCalendario, contexto: Partial<EventoDaVolta> = {}) => {
    porta.registrarNoLog({ evento: 'volta_recusada', motivo, ...(detalhe ? { detalhe } : {}), ...contexto })
    return pagina(STATUS[motivo], TITULO_RECUSADO, FRASES_DA_VOLTA[motivo], configuracao.destino)
  }

  if (pedido.metodo !== 'GET') return recusar('metodo_nao_suportado')

  // 1. O `state`, antes de qualquer porta.
  const agora = configuracao.agora?.() ?? Date.now()
  const leitura = await lerEstadoDaConexao(pedido.estado, configuracao.chaveDoServidor, agora)
  if (!leitura.ok) return recusar(leitura.motivo)
  const { contaId, especialistaId, usuarioId } = leitura.estado
  const contexto = { contaId, especialistaId }

  // Quem negou no Google volta com `error` e sem código: nada a trocar.
  if (pedido.erro) return recusar('autorizacao_negada', undefined, contexto)
  const codigo = pedido.codigo?.trim() ?? ''
  if (!codigo) return recusar('codigo_ausente', undefined, contexto)

  // 2. A situação de agora, não a de quando o `state` foi emitido.
  try {
    if (!(await porta.especialistaDaConta(contaId, especialistaId))) {
      return recusar('especialista_de_outra_conta', undefined, contexto)
    }
    const papel = await porta.papelNaConta(contaId, usuarioId)
    if (!papel || !PAPEIS_QUE_CONECTAM.has(papel)) return recusar('sem_permissao', undefined, contexto)
  } catch {
    return recusar('falha_ao_gravar', undefined, contexto)
  }

  if (!configuracao.clienteId || !configuracao.clienteSegredo || !configuracao.redirecionamento) {
    return recusar('aguardando_google', undefined, contexto)
  }

  // 3. A troca, de servidor para servidor.
  const troca = await trocarCodigoPorToken({
    buscar: configuracao.buscar,
    clienteId: configuracao.clienteId,
    clienteSegredo: configuracao.clienteSegredo,
    redirecionamento: configuracao.redirecionamento,
    codigo,
    ...(configuracao.prazoMs ? { prazoMs: configuracao.prazoMs } : {}),
  })
  if (!troca.ok) {
    const motivo = troca.motivo === 'sem_permissao_de_calendario' ? 'aguardando_google' : 'troca_recusada'
    return recusar(motivo, troca.motivo, contexto)
  }
  const token = troca.valor.tokenDeAtualizacao
  sensiveis.push(token)

  // 4. O Vault, e 5. o cache, na mesma passagem.
  let gravado: { readonly calendarioId: string; readonly reaproveitado: boolean }
  try {
    gravado = await porta.gravarCalendario({
      contaId,
      especialistaId,
      provedor: PROVEDOR_DO_CALENDARIO,
      agendaId: AGENDA_PRINCIPAL,
      tokenDeAtualizacao: token,
    })
  } catch {
    return recusar('falha_ao_gravar', undefined, contexto)
  }
  porta.invalidarCredencial(contaId, SEGREDO_DO_CALENDARIO.provedor, SEGREDO_DO_CALENDARIO.chave)

  porta.registrarNoLog({ evento: 'calendario_conectado', ...contexto, reaproveitado: gravado.reaproveitado })
  return pagina(
    200,
    TITULO_CONECTADO,
    gravado.reaproveitado ? FRASE_RECONECTADO : FRASE_CONECTADO,
    configuracao.destino,
  )
}

function pagina(status: number, titulo: string, frase: string, destino: string | null | undefined): RespostaDaVolta {
  return { status, html: montarPagina({ titulo, frase, destino: destino || null }) }
}
