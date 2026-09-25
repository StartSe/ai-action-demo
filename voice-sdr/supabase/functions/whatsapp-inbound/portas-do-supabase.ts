// As portas do canal de WhatsApp sobre o cliente do Supabase, escritas uma vez.
//
// Três adaptadores Deno precisam delas: `whatsapp-inbound`, `whatsapp-send` e
// `cron-dial` (pré-contato). Com uma cópia em cada `index.ts` a consulta da
// conversa, o RPC da mensagem e a leitura do agente divergiriam no primeiro
// ajuste. O cliente entra por parâmetro, tipado pelo recorte que as portas
// usam (`ClienteDoCanal`), como em `_shared/tools/porta-do-supabase.ts`: o
// `SupabaseClient` não se compara com o recorte pelo compilador (TS2589), e o
// `index.ts` o entrega convertido.
//
// O que fica de fora de propósito:
//
// - **Calendário ao vivo e convite na marcação.** A marcação pelo WhatsApp
//   não confere o horário no Google nem cria evento e convite na mesma
//   requisição: `calendarioDoEspecialista` e as leituras do evento e do
//   convite devolvem nulo, e quem cria evento e convite é a segunda via de
//   sempre (`cron-calendar-sync` e `cron-meeting-invite`), que pega reunião sem
//   evento. A oferta já saiu da ocupação sincronizada, e a restrição de
//   exclusão segura as reuniões nossas.
// - **O modelo** da conversa é o da tarefa `classify` da conta
//   (`resolver_modelo_da_conta`): a conversa é leitura curta com vocabulário
//   de ferramenta, a mesma natureza da classificação. Áudio e imagem são lidos
//   pelos modelos das tarefas `audio` e `imagem` (`lerMidiaComModelo`, do
//   `index.ts`).
//
// Módulo portável: sem Deno. O `fetch`, o cofre e o modelo entram pelo
// ambiente.

import { COLUNAS_DO_CRITERIO, lerLinhaDeCriterio } from '../_shared/qualificacao/avaliacao.ts'
import type { EtapaDoCatalogo } from '../_shared/qualificacao/etapa.ts'
import { REGUA_DE_EXEMPLO } from '../_shared/qualificacao/pontuacao.ts'
import type { PedidoDaRodada, RespostaDaRodada } from '../_shared/modelo/conversa-com-ferramentas.ts'
import { lerRetrato } from '../_shared/agente/retrato-da-publicacao.ts'
import type { Proposito } from '../_shared/playbook/camada-um.ts'
import type { MensagemDoHistorico, PortaDoMotor } from '../_shared/whatsapp/conversa.ts'
import type { PortaDoPreContato } from '../_shared/whatsapp/pre-contato.ts'
import { enviarTexto, type Buscar } from '../_shared/whatsapp/envio.ts'
import type {
  AgenteDaConta,
  ConversaGravada,
  ItemDaConversaNaFila,
  LeadDaConversa,
  OfertaGravada,
  PortaDaResposta,
} from '../_shared/whatsapp/resposta.ts'
import {
  lerMidiaDaMensagem,
  VALIDADE_DA_LEITURA_PENDENTE_MS,
  type Buscar as MidiaBuscar,
  type PortaDaMidia,
} from '../_shared/whatsapp/midia.ts'
import { lerModoDoWhatsapp, modoAtendeONumero } from '../_shared/whatsapp/modo.ts'
import { CHAVES_DA_ZAPI, PROVEDOR_DO_WHATSAPP, type CredenciaisDaZapi } from '../_shared/whatsapp/zapi.ts'
import type {
  AgendaDoEspecialista,
  EspecialistaDaConta,
  PortaDeDisponibilidade,
} from '../tool-availability/disponibilidade.ts'
import type { EscritaDoAgendamento, PortaDeAgendamento } from '../tool-book-meeting/agendamento.ts'
import { MOTIVO_GRAVADO } from '../tool-dnc/bloqueio.ts'

import { MOTIVO_DO_DESCADASTRO, type PortaDaEntrada } from './entrada.ts'
import { ferramentasDaConversa, ofertaNaPosicao, ofertasParaAConversa, type PortasDasFerramentas } from './ferramentas.ts'

// O recorte do cliente -----------------------------------------------------------

export interface RespostaDoBanco {
  readonly data: unknown
  readonly error: { readonly message: string } | null
}

/** Uma consulta encadeável do PostgREST, no recorte que as portas usam. */
export interface ConsultaDoCanal extends PromiseLike<RespostaDoBanco> {
  select(colunas?: string): ConsultaDoCanal
  eq(coluna: string, valor: unknown): ConsultaDoCanal
  neq(coluna: string, valor: unknown): ConsultaDoCanal
  in(coluna: string, valores: readonly unknown[]): ConsultaDoCanal
  is(coluna: string, valor: null): ConsultaDoCanal
  lt(coluna: string, valor: string): ConsultaDoCanal
  gt(coluna: string, valor: string): ConsultaDoCanal
  order(coluna: string, opcoes?: { readonly ascending?: boolean }): ConsultaDoCanal
  limit(quantos: number): ConsultaDoCanal
  update(valores: object): ConsultaDoCanal
  insert(valores: object): ConsultaDoCanal
  delete(): ConsultaDoCanal
  maybeSingle(): PromiseLike<RespostaDoBanco>
}

export interface ClienteDoCanal {
  from(tabela: string): ConsultaDoCanal
  rpc(funcao: string, parametros?: object): PromiseLike<RespostaDoBanco>
}

export interface AmbienteDasPortas {
  readonly cliente: ClienteDoCanal
  /** A credencial pela cascata de `_shared/secrets.ts`; nula quando não há. */
  segredo(contaId: string, provedor: string, chave: string): Promise<string | null>
  readonly buscar: Buscar
  /** Uma ida ao modelo da conta, já resolvido (`conversarComFerramentas`). */
  rodada(contaId: string, pedido: Omit<PedidoDaRodada, 'modelo'>): Promise<RespostaDaRodada>
  /**
   * O download da mídia recebida (`_shared/whatsapp/midia.ts`), com o tempo de
   * `LIMITE_DO_DOWNLOAD_MS`. Ausente: a leitura de mídia falha, e a assistente
   * pede para escrever (é o caso de `cron-dial`, que não recebe mensagem).
   */
  readonly buscarMidia?: MidiaBuscar
  /** A leitura pelo modelo da tarefa `audio` ou `imagem` da conta, já resolvido. */
  lerMidiaComModelo?: PortaDaMidia['lerComModelo']
  readonly agora?: () => number
}

function falhou(resposta: RespostaDoBanco): unknown {
  if (resposta.error) throw new Error(resposta.error.message)
  return resposta.data
}

function linhas(resposta: RespostaDoBanco): Record<string, unknown>[] {
  const dado = falhou(resposta)
  return Array.isArray(dado) ? (dado as Record<string, unknown>[]) : []
}

function primeira(resposta: RespostaDoBanco): Record<string, unknown> | null {
  const dado = falhou(resposta)
  if (Array.isArray(dado)) return (dado[0] as Record<string, unknown> | undefined) ?? null
  return dado !== null && typeof dado === 'object' ? (dado as Record<string, unknown>) : null
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null
}

const COLUNAS_DA_CONVERSA = 'id, account_id, lead_id, phone_e164, status, purpose, slot_offers'

function lerConversaDaLinha(linha: Record<string, unknown> | null): ConversaGravada | null {
  if (linha === null) return null
  return {
    id: String(linha.id),
    account_id: String(linha.account_id),
    lead_id: textoOuNulo(linha.lead_id),
    phone_e164: String(linha.phone_e164),
    status: linha.status as ConversaGravada['status'],
    purpose: linha.purpose as Proposito,
    slot_offers: Array.isArray(linha.slot_offers) ? (linha.slot_offers as OfertaGravada[]) : [],
  }
}

/**
 * `media_status` como a resposta o lê: a pendente mais velha que a validade é
 * de uma execução que morreu, e vale como falha (a assistente pede para
 * repetir em vez de esperar para sempre).
 */
export function estadoDaLeitura(
  valor: unknown,
  criadaEm: unknown,
  agoraMs: number,
): 'pendente' | 'lida' | 'falhou' | null {
  if (valor === 'lida' || valor === 'falhou') return valor
  if (valor !== 'pendente') return null
  const instante = typeof criadaEm === 'string' ? Date.parse(criadaEm) : Number.NaN
  return Number.isFinite(instante) && agoraMs - instante > VALIDADE_DA_LEITURA_PENDENTE_MS ? 'falhou' : 'pendente'
}

/** O briefing do lead em uma linha, para o bloco de dados do sistema. */
export function contextoDoBriefing(briefing: unknown): string | null {
  if (briefing === null || typeof briefing !== 'object' || Array.isArray(briefing)) return null
  const partes = Object.entries(briefing as Record<string, unknown>)
    .filter(([, valor]) => typeof valor === 'string' && valor.trim() !== '')
    .map(([chave, valor]) => `${chave}: ${String(valor).trim()}`)
  return partes.length === 0 ? null : partes.join('; ').slice(0, 600)
}

/** As portas do canal inteiro. */
/** O que whatsapp-send e o pré-contato leem além do que a entrada e a resposta leem. */
export interface PortasExtrasDoCanal {
  telefoneDoLead(contaId: string, leadId: string): Promise<string | null>
  /** Assumir, devolver, encerrar ou o que for, com o autor gravado. */
  mudarEstado(
    contaId: string,
    conversaId: string,
    de: readonly string[],
    para: 'assistente' | 'humano' | 'encerrada',
    acao: string,
    autorId: string | null,
  ): Promise<string>
}

export function criarPortasDoCanal(ambiente: AmbienteDasPortas): PortaDaEntrada & PortaDaResposta & PortasExtrasDoCanal {
  const { cliente } = ambiente
  const agora = ambiente.agora ?? Date.now

  const lerConversa = async (contaId: string, conversaId: string) =>
    lerConversaDaLinha(
      primeira(
        await cliente.from('whatsapp_conversations').select(COLUNAS_DA_CONVERSA).eq('account_id', contaId).eq('id', conversaId).maybeSingle(),
      ),
    )

  const mudarEstado = async (
    contaId: string,
    conversaId: string,
    de: readonly string[],
    para: string,
    acao: string,
    motivo: string | null,
    autorId: string | null = null,
  ): Promise<string> =>
    String(
      falhou(
        await cliente.rpc('mudar_estado_da_conversa_do_whatsapp', {
          p_account_id: contaId,
          p_conversation_id: conversaId,
          p_de: de,
          p_para: para,
          p_acao: acao,
          p_actor: autorId === null ? 'agent' : 'user',
          p_actor_id: autorId,
          p_motivo: motivo,
        }),
      ),
    )

  const registrarItem = async (
    contaId: string,
    chave: string,
    severidade: string,
    leadId: string | null,
    tipo: string,
    contexto: Record<string, unknown>,
  ) => {
    const resultado = falhou(
      await cliente.rpc('registrar_item_de_fila', {
        p_account_id: contaId,
        p_kind: tipo,
        p_severity: severidade,
        p_deduplicacao_key: chave,
        p_context: contexto,
        p_threshold_snapshot: null,
        p_lead_id: leadId,
        p_call_id: null,
      }),
    )
    if (resultado !== 'criado' && resultado !== 'ja_aberto') throw new Error(String(resultado))
  }

  const bloquearNumero = async (contaId: string, telefone: string, origem: 'lead_request' | 'wrong_number', motivo: string, notas: string | null) => {
    const linha = primeira(
      await cliente.rpc('bloquear_numero_pela_ferramenta', {
        p_account_id: contaId,
        p_phone_e164: telefone,
        p_source: origem,
        p_reason: motivo,
        p_notes: notas,
        p_blocked_at: new Date(agora()).toISOString(),
      }),
    )
    return { criado: linha?.criado === true }
  }

  const credenciais = async (contaId: string): Promise<CredenciaisDaZapi | null> => {
    const valores = await Promise.all(CHAVES_DA_ZAPI.map((chave) => ambiente.segredo(contaId, PROVEDOR_DO_WHATSAPP, chave)))
    if (valores.some((valor) => !valor)) return null
    const [instance_id, token, client_token] = valores as string[]
    return { instance_id: instance_id!, token: token!, client_token: client_token! }
  }

  const atendeONumero = async (contaId: string, telefone: string): Promise<boolean> => {
    const [configuracao, numero] = await Promise.all([
      cliente.from('account_settings').select('whatsapp_mode').eq('account_id', contaId).maybeSingle(),
      cliente.from('account_test_numbers').select('phone_e164').eq('account_id', contaId).eq('phone_e164', telefone).maybeSingle(),
    ])
    const modo = lerModoDoWhatsapp(primeira(configuracao)?.whatsapp_mode)
    const lista = primeira(numero)
    return modoAtendeONumero(modo, lista === null ? [] : [String(lista.phone_e164)], telefone)
  }

  const portasDasFerramentas = (): PortasDasFerramentas => ({
    agora,
    qualificacao: {
      leitura: {
        async catalogoDeEtapas(contaId) {
          return linhas(
            await cliente
              .from('pipeline_stages')
              .select('key, label, is_won, is_lost, pipelines!inner(is_default)')
              .eq('account_id', contaId)
              .eq('pipelines.is_default', true)
              .order('position'),
          ).map((linha): EtapaDoCatalogo => ({
            key: String(linha.key),
            label: String(linha.label),
            is_won: linha.is_won === true,
            is_lost: linha.is_lost === true,
          }))
        },
        async reguaDaConta() {
          return REGUA_DE_EXEMPLO
        },
      },
      escrita: {
        async gravarLead(gravacao) {
          const atual = primeira(
            await cliente.from('leads').select('briefing').eq('account_id', gravacao.contaId).eq('id', gravacao.leadId).maybeSingle(),
          )
          if (!atual) throw new Error('lead_ausente')
          const briefing = { ...((atual.briefing as Record<string, unknown> | null) ?? {}), ...gravacao.briefing }
          falhou(
            await cliente
              .from('leads')
              .update({
                briefing,
                score: gravacao.score,
                temperature: gravacao.temperatura,
                ...(gravacao.sentimento === null ? {} : { last_sentiment: gravacao.sentimento }),
              })
              .eq('account_id', gravacao.contaId)
              .eq('id', gravacao.leadId),
          )
        },
        async moverEtapa(leadId, stageKey) {
          const linha = primeira(
            await cliente.rpc('mover_lead_de_etapa', { p_lead_id: leadId, p_stage_key: stageKey, p_actor: 'agent', p_actor_id: null }),
          )
          const resultado = String(linha?.resultado ?? 'sem_resultado')
          if (resultado !== 'movido' && resultado !== 'mesma_etapa') throw new Error(resultado)
        },
      },
    },
    disponibilidade: {
      leitura: leituraDaDisponibilidade(cliente),
      escrita: {
        async substituirOfertas(contaId, conversaId, ofertas) {
          falhou(
            await cliente
              .from('whatsapp_conversations')
              .update({ slot_offers: ofertasParaAConversa(ofertas, agora()) })
              .eq('account_id', contaId)
              .eq('id', conversaId),
          )
        },
      },
    },
    agendamento: {
      leitura: leituraDoAgendamento(cliente, lerConversa),
      escrita: escritaDoAgendamento(cliente),
    },
    canal: {
      async bloquear(contaId, telefone, origem, notas) {
        return bloquearNumero(contaId, telefone, origem, MOTIVO_GRAVADO[origem].replace('durante a ligação', 'pelo WhatsApp'), notas)
      },
      async encerrar(contaId, conversaId, motivo) {
        await mudarEstado(contaId, conversaId, ['assistente', 'humano'], 'encerrada', 'encerrada', motivo)
      },
      async pedirHumano(alvo, motivo) {
        await mudarEstado(alvo.account_id, alvo.id, ['assistente'], 'humano', 'pedido_humano', 'pedido_do_lead')
        await registrarItem(alvo.account_id, `whatsapp:humano:${alvo.id}`, 'alta', alvo.lead_id, 'pedido_humano', {
          canal: 'whatsapp',
          conversation_id: alvo.id,
          motivo: 'pedido_do_lead',
          recorte: motivo,
        })
      },
    },
  })

  return {
    lerConversa,

    async telefoneDoLead(contaId, leadId) {
      const linha = primeira(
        await cliente.from('leads').select('phone_e164').eq('account_id', contaId).eq('id', leadId).is('merged_into_id', null).maybeSingle(),
      )
      return textoOuNulo(linha?.phone_e164)
    },

    mudarEstado(contaId, conversaId, de, para, acao, autorId) {
      return mudarEstado(contaId, conversaId, de, para, acao, null, autorId)
    },

    async atualizarEntregas(contaId, ids, estado) {
      // A entrega não volta atrás: lida não vira entregue por aviso atrasado.
      const anteriores = estado === 'lida' ? ['enviada', 'entregue'] : estado === 'entregue' ? ['enviada'] : []
      if (anteriores.length === 0) return
      falhou(
        await cliente
          .from('whatsapp_messages')
          .update({ status: estado })
          .eq('account_id', contaId)
          .in('provider_message_id', [...ids])
          .in('status', anteriores),
      )
    },

    async mensagemExistente(contaId, idDoProvedor) {
      const linha = primeira(
        await cliente
          .from('whatsapp_messages')
          .select('conversation_id')
          .eq('account_id', contaId)
          .eq('provider_message_id', idDoProvedor)
          .maybeSingle(),
      )
      return linha ? { conversaId: String(linha.conversation_id) } : null
    },

    async registrarLead(contaId, lead) {
      const linha = primeira(await cliente.rpc('registrar_lead', { p_account_id: contaId, p_lead: lead, p_ao_duplicar: 'ignorar' }))
      if (!linha?.lead_id) throw new Error('registrar_lead não devolveu linha')
      return String(linha.lead_id)
    },

    async abrirConversa(contaId, telefone, leadId, iniciadaPor) {
      const linha = primeira(
        await cliente.rpc('abrir_conversa_do_whatsapp', {
          p_account_id: contaId,
          p_phone_e164: telefone,
          p_lead_id: leadId,
          p_purpose: 'discovery',
          p_started_by: iniciadaPor,
        }),
      )
      if (!linha?.conversation_id) throw new Error('abrir_conversa_do_whatsapp não devolveu linha')
      return { conversaId: String(linha.conversation_id), criada: linha.criada === true }
    },

    async registrarEntrada(contaId, conversaId, mensagem) {
      const linha = primeira(
        await cliente.rpc('registrar_mensagem_do_whatsapp', {
          p_account_id: contaId,
          p_conversation_id: conversaId,
          p_direction: 'in',
          p_author: 'lead',
          p_author_id: null,
          p_body: mensagem.texto,
          p_media_kind: mensagem.midia,
          p_provider_message_id: mensagem.idDoProvedor,
          p_status: 'recebida',
        }),
      )
      const mensagemId = String(linha?.message_id ?? '')
      const nova = linha?.nova === true
      // A leitura pendente fica fora do RPC para não trocar a assinatura dele.
      // Falhar aqui é 503 e a Z-API reenvia; a repetida sai sem leitura, e a
      // assistente pede para escrever.
      if (nova && mensagem.leitura !== null) {
        falhou(
          await cliente
            .from('whatsapp_messages')
            .update({ media_status: mensagem.leitura })
            .eq('account_id', contaId)
            .eq('id', mensagemId),
        )
      }
      return { mensagemId, nova }
    },

    async lerMidia(contaId, mensagemId, midia, anexo) {
      const semModelo: PortaDaMidia['lerComModelo'] = async () => ({
        ok: false,
        codigo: 'sem_credencial',
        status: null,
        modelo: '',
      })
      return await lerMidiaDaMensagem(
        { contaId, mensagemId, midia, anexo },
        {
          buscar: ambiente.buscarMidia ?? (async () => new Response(null, { status: 503 })),
          lerComModelo: ambiente.lerMidiaComModelo ?? semModelo,
          async gravarLeitura(conta, id, estado, texto) {
            falhou(
              await cliente
                .from('whatsapp_messages')
                .update({ media_status: estado, media_text: texto })
                .eq('account_id', conta)
                .eq('id', id),
            )
          },
          async registrarEvento(evento) {
            falhou(await cliente.from('integration_events').insert(evento))
          },
        },
      )
    },

    async bloquear(contaId, telefone, notas) {
      return bloquearNumero(contaId, telefone, 'lead_request', MOTIVO_DO_DESCADASTRO, notas)
    },

    async encerrarPorDescadastro(contaId, conversaId) {
      return mudarEstado(contaId, conversaId, ['assistente', 'humano'], 'encerrada', 'encerrada', 'descadastro')
    },

    async abrirItemDeBloqueio(contaId, conversa, recorte) {
      await registrarItem(contaId, `whatsapp:bloqueio:${conversa.id}`, 'baixa', conversa.lead_id, 'pedido_bloqueio', {
        canal: 'whatsapp',
        conversation_id: conversa.id,
        origem: 'lead_request',
        recorte,
      })
    },

    async canalLigado(contaId) {
      const linha = primeira(await cliente.from('account_settings').select('whatsapp_enabled').eq('account_id', contaId).maybeSingle())
      return linha?.whatsapp_enabled === true
    },

    atendeONumero,

    credenciais,

    enviar(credenciaisDaConta, telefone, texto) {
      return enviarTexto(credenciaisDaConta, telefone, texto, ambiente.buscar)
    },

    async registrarSaida(saida) {
      const linha = primeira(
        await cliente.rpc('registrar_mensagem_do_whatsapp', {
          p_account_id: saida.contaId,
          p_conversation_id: saida.conversaId,
          p_direction: 'out',
          p_author: saida.autor,
          p_author_id: saida.autorId,
          p_body: saida.texto,
          p_media_kind: null,
          p_provider_message_id: saida.envio.idDoProvedor ?? null,
          p_status: saida.envio.ok ? 'enviada' : 'falhou',
          // Só o código: a frase de erro é da tela, e o código não é segredo.
          p_error: saida.envio.ok ? null : String(saida.envio.codigo ?? saida.envio.status ?? 'falha'),
        }),
      )
      return textoOuNulo(linha?.message_id)
    },

    async reivindicar(contaId, conversaId) {
      const dado = falhou(await cliente.rpc('reivindicar_resposta_do_whatsapp', { p_account_id: contaId, p_conversation_id: conversaId }))
      const valor = Array.isArray(dado) ? dado[0] : dado
      return typeof valor === 'string' && valor !== '' ? valor : null
    },

    async soltar(contaId, conversaId, corte) {
      return (
        falhou(
          await cliente.rpc('soltar_resposta_do_whatsapp', { p_account_id: contaId, p_conversation_id: conversaId, p_corte: corte }),
        ) === true
      )
    },

    async numeroBloqueado(contaId, telefone) {
      const linha = primeira(
        await cliente
          .from('dnc_entries')
          .select('id')
          .eq('account_id', contaId)
          .eq('phone_e164', telefone)
          .is('removed_at', null)
          .maybeSingle(),
      )
      return linha !== null
    },

    async abrirItemNaFila(item: ItemDaConversaNaFila) {
      await registrarItem(item.contaId, `whatsapp:${item.motivo}:${item.conversaId}`, item.motivo === 'pedido_do_lead' ? 'alta' : 'media', item.leadId, 'pedido_humano', {
        canal: 'whatsapp',
        conversation_id: item.conversaId,
        motivo: item.motivo,
        recorte: item.recorte,
      })
    },

    async agente(contaId, proposito): Promise<AgenteDaConta | null> {
      // A assistente é a que está no ar: o retrato que a publicação gravou
      // para o propósito, nunca a linha em edição de `agents`.
      const [publicacao, politica, criterios] = await Promise.all([
        cliente
          .from('agent_publications')
          .select('channel_snapshot')
          .eq('account_id', contaId)
          .eq('purpose', proposito)
          .eq('status', 'publicado')
          .maybeSingle(),
        cliente
          .from('account_settings')
          .select('max_duration_seconds, recording_enabled, recording_notice_text, retention_days')
          .eq('account_id', contaId)
          .maybeSingle(),
        cliente.from('evaluation_criteria').select(COLUNAS_DO_CRITERIO).eq('account_id', contaId).order('position'),
      ])
      const publicada = lerRetrato(primeira(publicacao)?.channel_snapshot)
      const linhaDaPolitica = primeira(politica)
      if (publicada === null || linhaDaPolitica === null) return null
      return {
        identidade: { ...publicada.identidade, jeito: publicada.jeitoDoWhatsapp },
        playbook: publicada.playbook,
        aberturaDoWhatsapp: publicada.aberturaDoWhatsapp,
        politica: {
          duracaoMaximaSegundos: Number(linhaDaPolitica.max_duration_seconds),
          gravacaoLigada: linhaDaPolitica.recording_enabled !== false,
          avisoDeGravacao: textoOuNulo(linhaDaPolitica.recording_notice_text),
          retencaoDias: Number(linhaDaPolitica.retention_days),
        },
        criterios: linhas(criterios).map((linha) => lerLinhaDeCriterio(linha as never)),
      }
    },

    async lead(contaId, leadId): Promise<LeadDaConversa | null> {
      const linha = primeira(
        await cliente.from('leads').select('name, company, city, timezone, briefing').eq('account_id', contaId).eq('id', leadId).maybeSingle(),
      )
      if (linha === null) return null
      return {
        nome: textoOuNulo(linha.name),
        empresa: textoOuNulo(linha.company),
        cidade: textoOuNulo(linha.city),
        contexto: contextoDoBriefing(linha.briefing),
        fuso: textoOuNulo(linha.timezone),
      }
    },

    async fusoDaConta(contaId) {
      const linha = primeira(await cliente.from('accounts').select('timezone').eq('id', contaId).maybeSingle())
      return textoOuNulo(linha?.timezone) ?? 'America/Sao_Paulo'
    },

    async historico(contaId, conversaId, limite): Promise<MensagemDoHistorico[]> {
      return linhas(
        await cliente
          .from('whatsapp_messages')
          .select('direction, author, body, media_kind, media_text, media_status, created_at')
          .eq('account_id', contaId)
          .eq('conversation_id', conversaId)
          .order('created_at', { ascending: false })
          .limit(limite),
      )
        .reverse()
        .map((linha) => ({
          direcao: linha.direction === 'in' ? 'in' : 'out',
          autor: linha.author as MensagemDoHistorico['autor'],
          texto: String(linha.body ?? ''),
          midia: textoOuNulo(linha.media_kind),
          leitura: textoOuNulo(linha.media_text),
          estadoDaLeitura: estadoDaLeitura(linha.media_status, linha.created_at, agora()),
        }))
    },

    async motor(conversa): Promise<PortaDoMotor> {
      return {
        ferramentas: ferramentasDaConversa(conversa, portasDasFerramentas()),
        rodada: (pedido) => ambiente.rodada(conversa.account_id, pedido),
      }
    },
  }
}

// O pré-contato de cron-dial -------------------------------------------------------

export function criarPortaDoPreContato(ambiente: AmbienteDasPortas): PortaDoPreContato {
  const { cliente } = ambiente
  const canal = criarPortasDoCanal(ambiente)
  return {
    async configuracao(contaId) {
      const linha = primeira(
        await cliente
          .from('account_settings')
          .select('whatsapp_pre_contact, whatsapp_pre_contact_text')
          .eq('account_id', contaId)
          .maybeSingle(),
      )
      return { ligado: linha?.whatsapp_pre_contact === true, texto: textoOuNulo(linha?.whatsapp_pre_contact_text) }
    },
    async identidade(contaId) {
      // A publicada, como a voz que vai tocar em seguida. A identidade é da
      // conta e sai igual nos quatro propósitos; vale a publicação mais nova.
      const publicacoes = linhas(
        await cliente
          .from('agent_publications')
          .select('channel_snapshot')
          .eq('account_id', contaId)
          .eq('status', 'publicado')
          .order('published_at', { ascending: false })
          .limit(4),
      )
      for (const linha of publicacoes) {
        const publicada = lerRetrato(linha.channel_snapshot)
        if (publicada !== null) {
          return { nome: publicada.identidade.nome, empresa: publicada.identidade.empresa, abertura: publicada.aberturaDoWhatsapp }
        }
      }
      return null
    },
    async lead(contaId, leadId) {
      const linha = primeira(
        await cliente.from('leads').select('name, phone_e164, company, city').eq('account_id', contaId).eq('id', leadId).maybeSingle(),
      )
      const telefone = textoOuNulo(linha?.phone_e164)
      return telefone === null
        ? null
        : { nome: textoOuNulo(linha?.name), telefone, empresa: textoOuNulo(linha?.company), cidade: textoOuNulo(linha?.city) }
    },
    numeroBloqueado: canal.numeroBloqueado,
    atendeONumero: canal.atendeONumero,
    credenciais: canal.credenciais,
    async mensagemNossaDesde(contaId, telefone, desde) {
      const conversas = linhas(
        await cliente.from('whatsapp_conversations').select('id').eq('account_id', contaId).eq('phone_e164', telefone),
      ).map((linha) => String(linha.id))
      if (conversas.length === 0) return false
      const mensagens = linhas(
        await cliente
          .from('whatsapp_messages')
          .select('id')
          .eq('account_id', contaId)
          .in('conversation_id', conversas)
          .eq('direction', 'out')
          .gt('created_at', desde)
          .limit(1),
      )
      return mensagens.length > 0
    },
    abrirConversa: (contaId, telefone, leadId, iniciadaPor) => canal.abrirConversa(contaId, telefone, leadId, iniciadaPor),
    enviar: canal.enviar,
    registrarSaida: canal.registrarSaida,
    async narrar(_contaId, leadId, conversaId) {
      falhou(
        await cliente.rpc('registrar_evento_de_lead', {
          p_lead_id: leadId,
          p_kind: 'whatsapp',
          p_actor: 'agent',
          p_actor_id: null,
          p_summary: null,
          p_payload: { acao: 'pre_contato', conversation_id: conversaId },
        }),
      )
    },
  }
}

// As leituras da agenda ------------------------------------------------------------
// As mesmas consultas de `tool-availability/index.ts`, sobre o recorte do cliente.

function leituraDaDisponibilidade(cliente: ClienteDoCanal): PortaDeDisponibilidade {
  return {
    async configuracaoDaConta(contaId) {
      const [configuracao, conta] = await Promise.all([
        cliente.from('account_settings').select('routing_mode, fixed_specialist_id').eq('account_id', contaId).maybeSingle(),
        cliente.from('accounts').select('timezone').eq('id', contaId).maybeSingle(),
      ])
      const linhaDaConfiguracao = primeira(configuracao)
      const linhaDaConta = primeira(conta)
      if (!linhaDaConfiguracao || !linhaDaConta) throw new Error('conta sem configuração')
      return {
        modo: String(linhaDaConfiguracao.routing_mode),
        especialistaFixo: textoOuNulo(linhaDaConfiguracao.fixed_specialist_id),
        fusoDaConta: String(linhaDaConta.timezone),
      }
    },

    async fusoDoLead(contaId, leadId) {
      const linha = primeira(await cliente.from('leads').select('timezone').eq('account_id', contaId).eq('id', leadId).maybeSingle())
      return textoOuNulo(linha?.timezone)
    },

    async especialistasDaConta(contaId) {
      const [especialistas, faixas] = await Promise.all([
        cliente
          .from('specialists')
          .select('id, area, active, timezone, default_duration_min, daily_cap, min_notice_min, max_notice_days, last_assigned_at')
          .eq('account_id', contaId),
        cliente.from('specialist_availability').select('specialist_id, weekday, start_time, end_time').eq('account_id', contaId),
      ])
      const faixasDe = new Map<string, Record<string, unknown>[]>()
      for (const faixa of linhas(faixas)) {
        const id = String(faixa.specialist_id)
        faixasDe.set(id, [...(faixasDe.get(id) ?? []), faixa])
      }
      return linhas(especialistas).map(
        (linha): EspecialistaDaConta => ({
          id: String(linha.id),
          area: textoOuNulo(linha.area),
          ativo: linha.active === true,
          fuso: String(linha.timezone),
          duracaoPadraoMin: Number(linha.default_duration_min),
          tetoDiario: Number(linha.daily_cap),
          antecedenciaMinimaMin: Number(linha.min_notice_min),
          antecedenciaMaximaDias: Number(linha.max_notice_days),
          ultimaAtribuicaoEm: textoOuNulo(linha.last_assigned_at),
          disponibilidade: (faixasDe.get(String(linha.id)) ?? []).map((faixa) => ({
            diaDaSemana: Number(faixa.weekday),
            inicio: String(faixa.start_time),
            fim: String(faixa.end_time),
          })),
        }),
      )
    },

    async agendaNoPeriodo(contaId, especialistaIds, periodo) {
      const noPeriodo = (tabela: string, colunas: string) =>
        cliente
          .from(tabela)
          .select(colunas)
          .eq('account_id', contaId)
          .in('specialist_id', [...especialistaIds])
          .lt('starts_at', periodo.ate)
          .gt('ends_at', periodo.de)
      const [bloqueios, ocupacao, reunioes] = await Promise.all([
        noPeriodo('specialist_blocks', 'specialist_id, starts_at, ends_at'),
        noPeriodo('specialist_busy_blocks', 'specialist_id, starts_at, ends_at'),
        noPeriodo('meetings', 'specialist_id, starts_at, ends_at, status'),
      ])
      const intervalo = (linha: Record<string, unknown>) => ({ inicio: String(linha.starts_at), fim: String(linha.ends_at) })
      const de = (resposta: RespostaDoBanco, id: string) => linhas(resposta).filter((linha) => linha.specialist_id === id)
      return especialistaIds.map(
        (id): AgendaDoEspecialista => ({
          especialistaId: id,
          bloqueios: de(bloqueios, id).map(intervalo),
          ocupacaoExterna: de(ocupacao, id).map(intervalo),
          reunioes: de(reunioes, id).map((linha) => ({ ...intervalo(linha), status: String(linha.status) })),
        }),
      )
    },
  }
}

function leituraDoAgendamento(
  cliente: ClienteDoCanal,
  lerConversa: (contaId: string, conversaId: string) => Promise<ConversaGravada | null>,
): PortaDeAgendamento {
  return {
    async ofertaDaChamada(contaId, conversaId, posicao) {
      const conversa = await lerConversa(contaId, conversaId)
      const oferta = conversa === null ? null : ofertaNaPosicao(conversa.slot_offers, posicao)
      if (oferta === null) return null
      const especialista = primeira(
        await cliente.from('specialists').select('timezone').eq('account_id', contaId).eq('id', oferta.specialist_id).maybeSingle(),
      )
      return { ...oferta, fusoDoEspecialista: textoOuNulo(especialista?.timezone) ?? 'America/Sao_Paulo' }
    },
    async fusoDoLead(contaId, leadId) {
      const [lead, conta] = await Promise.all([
        cliente.from('leads').select('timezone').eq('account_id', contaId).eq('id', leadId).maybeSingle(),
        cliente.from('accounts').select('timezone').eq('id', contaId).maybeSingle(),
      ])
      return textoOuNulo(primeira(lead)?.timezone) ?? textoOuNulo(primeira(conta)?.timezone) ?? 'America/Sao_Paulo'
    },
    // Sem conferência ao vivo no calendário: ver o cabeçalho.
    async calendarioDoEspecialista() {
      return null
    },
  }
}

function escritaDoAgendamento(cliente: ClienteDoCanal): EscritaDoAgendamento {
  const escrita = {
    async agendarReuniao(pedido: Parameters<EscritaDoAgendamento['agendarReuniao']>[0]) {
      const linha = primeira(await cliente.rpc('agendar_reuniao', pedido))
      if (!linha) throw new Error('agendar_reuniao não devolveu linha')
      return { resultado: String(linha.resultado), reuniao_id: textoOuNulo(linha.reuniao_id) }
    },
    async consumirOfertas(contaId: string, conversaId: string) {
      falhou(await cliente.from('whatsapp_conversations').update({ slot_offers: [] }).eq('account_id', contaId).eq('id', conversaId))
    },
    async preencherEmailDoLead(contaId: string, leadId: string, email: string) {
      falhou(await cliente.from('leads').update({ email }).eq('account_id', contaId).eq('id', leadId).is('email', null))
    },
    // Evento e convite ficam com a segunda via: ver o cabeçalho.
    async reuniaoParaEvento() {
      return null
    },
    async calendarioParaEvento() {
      return null
    },
    async reuniaoParaConvite() {
      return null
    },
    async emailParaConvite() {
      return { ok: false, motivo: 'nao_configurado', mensagem: '' }
    },
  }
  // As escritas do evento e do convite nunca são alcançadas: as leituras acima
  // devolvem nulo antes. A conversão declara isso ao compilador.
  return escrita as unknown as EscritaDoAgendamento
}
