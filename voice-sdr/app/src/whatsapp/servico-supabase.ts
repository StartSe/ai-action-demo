import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import { lerModoDoWhatsapp } from '@compartilhado/whatsapp/modo.ts'

import {
  ordenarConversas,
  paraConversaDaLista,
  paraConversaDetalhe,
  paraMensagem,
  ultimaMensagemPorConversa,
  type LinhaDaConversa,
  type LinhaDaMensagem,
} from '@/whatsapp/leitura'
import type {
  CanalDoWhatsapp,
  CargaDaConversa,
  CargaDaConversaDoLead,
  CargaDeConversas,
  CargaDoCanal,
  ConversaDaLista,
  EstadoDaConexao,
  FiltroDeStatus,
  GravacaoDoCanal,
  MotivoDeFalhaDoWhatsapp,
  PedidoDaAcao,
  ResultadoDaAcao,
  ResultadoDaConexao,
  ServicoDeWhatsapp,
  StatusDaConversa,
} from '@/whatsapp/tipos'

/** As bordas que a interface chama: nunca escreve as tabelas direto. */
const FUNCAO_DE_ENVIO = 'whatsapp-send'
const FUNCAO_DE_CONEXAO = 'whatsapp-connect'

const PRIVILEGIO_INSUFICIENTE = '42501'

/** Teto de conversas por leitura. A lista é para trabalhar, não para folhear. */
const TETO_DA_LISTA = 200
/** Teto de mensagens por conversa aberta. */
const TETO_DAS_MENSAGENS = 500

const COLUNAS_DA_CONVERSA =
  'id, lead_id, phone_e164, status, purpose, started_by, last_message_at, created_at, leads(name)'
const COLUNAS_DA_MENSAGEM =
  'id, direction, author, body, media_kind, media_text, media_status, status, error, created_at'

function classificar(erro: PostgrestError | null): MotivoDeFalhaDoWhatsapp {
  return erro?.code === PRIVILEGIO_INSUFICIENTE ? 'sem-permissao' : 'falha-de-comunicacao'
}

/**
 * O corpo da recusa vem dentro do erro da função, como em `whatsapp-send` e
 * `whatsapp-connect`: as duas devolvem `{ ok: false, motivo, mensagem }` no
 * corpo, mesmo em 4xx e 5xx, e o cliente do Supabase esconde esse corpo dentro
 * do erro.
 */
async function corpoDoErro(erro: unknown): Promise<{ motivo?: unknown; mensagem?: unknown } | null> {
  const contexto = (erro as { context?: unknown } | null)?.context
  if (!(contexto instanceof Response)) return null
  try {
    return (await contexto.json()) as { motivo?: unknown; mensagem?: unknown }
  } catch {
    return null
  }
}

const FALHA_DE_COMUNICACAO = 'Não foi possível falar com o servidor. Tente de novo em alguns minutos.'

async function falhaDaFuncao(erro: unknown): Promise<{ motivo: string; mensagem: string }> {
  const corpo = await corpoDoErro(erro)
  const motivo = typeof corpo?.motivo === 'string' ? corpo.motivo : 'falha_de_comunicacao'
  const mensagem = typeof corpo?.mensagem === 'string' ? corpo.mensagem : FALHA_DE_COMUNICACAO
  return { motivo, mensagem }
}

function paraCanal(linha: Record<string, unknown>): CanalDoWhatsapp {
  return {
    habilitado: linha.whatsapp_enabled === true,
    modo: lerModoDoWhatsapp(linha.whatsapp_mode),
    preContato: linha.whatsapp_pre_contact === true,
    textoDoPreContato:
      typeof linha.whatsapp_pre_contact_text === 'string' && linha.whatsapp_pre_contact_text.trim() !== ''
        ? linha.whatsapp_pre_contact_text
        : null,
  }
}

export function criarServicoDeWhatsapp(cliente: SupabaseClient): ServicoDeWhatsapp {
  async function contaAtual(): Promise<{ id: string } | MotivoDeFalhaDoWhatsapp> {
    const { data: autenticado } = await cliente.auth.getUser()
    const usuarioId = autenticado.user?.id
    if (!usuarioId) return 'sem-permissao'

    const { data, error } = await cliente
      .from('account_members')
      .select('account_id')
      .eq('user_id', usuarioId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) return classificar(error)
    if (!data) return 'sem-conta'
    return { id: data.account_id as string }
  }

  /**
   * As linhas de conversa já lidas, mais a prévia da última mensagem de cada
   * uma — uma segunda consulta, porque "a mais recente por conversa" não é
   * coluna nenhuma e o PostgREST não agrega.
   */
  async function comPrevias(
    linhas: readonly LinhaDaConversa[],
  ): Promise<{ conversas: ConversaDaLista[] } | { erro: PostgrestError }> {
    const conversas = linhas
      .map(paraConversaDaLista)
      .filter((item): item is ConversaDaLista => item !== null)
    if (conversas.length === 0) return { conversas: [] }

    const ids = conversas.map((item) => item.id)
    const mensagens = await cliente
      .from('whatsapp_messages')
      .select('conversation_id, body, media_kind, created_at')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
    if (mensagens.error) return { erro: mensagens.error }

    const previas = ultimaMensagemPorConversa(
      (mensagens.data ?? []) as {
        conversation_id: string
        body: string | null
        media_kind: string | null
        created_at: string
      }[],
    )

    return {
      conversas: conversas.map((item) => ({
        ...item,
        ultimaMensagem: previas.get(item.id) ?? null,
      })),
    }
  }

  return {
    async listarConversas(filtro: FiltroDeStatus = 'todas'): Promise<CargaDeConversas> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      let consulta = cliente
        .from('whatsapp_conversations')
        .select(COLUNAS_DA_CONVERSA)
        .eq('account_id', conta.id)
        .order('last_message_at', { ascending: false })
        .limit(TETO_DA_LISTA)
      if (filtro !== 'todas') consulta = consulta.eq('status', filtro)

      const { data, error } = await consulta
      if (error) return { ok: false, motivo: classificar(error) }

      const resultado = await comPrevias(data as unknown as LinhaDaConversa[])
      if ('erro' in resultado) return { ok: false, motivo: classificar(resultado.erro) }

      return { ok: true, conversas: ordenarConversas(resultado.conversas) }
    },

    async carregarConversa(id): Promise<CargaDaConversa> {
      const conversa = await cliente
        .from('whatsapp_conversations')
        .select(COLUNAS_DA_CONVERSA)
        .eq('id', id)
        .maybeSingle()
      if (conversa.error) return { ok: false, motivo: classificar(conversa.error) }
      // De outra conta e inexistente são o mesmo silêncio da RLS.
      if (!conversa.data) return { ok: false, motivo: 'nao-encontrada' }

      const mensagens = await cliente
        .from('whatsapp_messages')
        .select(COLUNAS_DA_MENSAGEM)
        .eq('conversation_id', id)
        .order('created_at', { ascending: true })
        .limit(TETO_DAS_MENSAGENS)
      if (mensagens.error) return { ok: false, motivo: classificar(mensagens.error) }

      const lidas = (mensagens.data as unknown as LinhaDaMensagem[])
        .map(paraMensagem)
        .filter((item): item is NonNullable<ReturnType<typeof paraMensagem>> => item !== null)

      const detalhe = paraConversaDetalhe(conversa.data as unknown as LinhaDaConversa, lidas)
      if (!detalhe) return { ok: false, motivo: 'nao-encontrada' }
      return { ok: true, conversa: detalhe }
    },

    async carregarConversaDoLead(leadId): Promise<CargaDaConversaDoLead> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('whatsapp_conversations')
        .select(COLUNAS_DA_CONVERSA)
        .eq('account_id', conta.id)
        .eq('lead_id', leadId)
        .order('last_message_at', { ascending: false })
        .limit(1)
      if (error) return { ok: false, motivo: classificar(error) }

      const resultado = await comPrevias(data as unknown as LinhaDaConversa[])
      if ('erro' in resultado) return { ok: false, motivo: classificar(resultado.erro) }

      return { ok: true, conversa: resultado.conversas[0] ?? null }
    },

    async agir(pedido: PedidoDaAcao): Promise<ResultadoDaAcao> {
      const conta = await contaAtual()
      if (typeof conta === 'string') {
        return { ok: false, motivo: 'sem_acesso', mensagem: FALHA_DE_COMUNICACAO }
      }

      const { data, error } = await cliente.functions.invoke(FUNCAO_DE_ENVIO, {
        body: {
          account_id: conta.id,
          conversation_id: pedido.conversaId,
          lead_id: pedido.leadId,
          text: pedido.texto,
          acao: pedido.acao,
        },
      })
      if (error) {
        const falha = await falhaDaFuncao(error)
        return { ok: false, ...falha }
      }

      const corpo = data as {
        ok?: boolean
        conversa?: { id?: string; status?: string }
        motivo?: string
        mensagem?: string
      } | null
      if (corpo?.ok !== true || !corpo.conversa?.id || !corpo.conversa.status) {
        return { ok: false, motivo: 'falha_de_comunicacao', mensagem: FALHA_DE_COMUNICACAO }
      }
      return {
        ok: true,
        conversaId: corpo.conversa.id,
        status: corpo.conversa.status as StatusDaConversa,
      }
    },

    async conectar(): Promise<ResultadoDaConexao> {
      const conta = await contaAtual()
      if (typeof conta === 'string') {
        return { ok: false, motivo: 'sem_acesso', mensagem: FALHA_DE_COMUNICACAO }
      }

      const { data, error } = await cliente.functions.invoke(FUNCAO_DE_CONEXAO, {
        body: { account_id: conta.id },
      })
      if (error) {
        const falha = await falhaDaFuncao(error)
        return { ok: false, ...falha }
      }

      const corpo = data as { ok?: boolean; estado?: string; mensagem?: string } | null
      if (corpo?.ok !== true || typeof corpo.estado !== 'string') {
        return { ok: false, motivo: 'falha_de_comunicacao', mensagem: FALHA_DE_COMUNICACAO }
      }
      return {
        ok: true,
        estado: corpo.estado as EstadoDaConexao,
        mensagem: corpo.mensagem ?? '',
      }
    },

    async carregarCanal(): Promise<CargaDoCanal> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('account_settings')
        .select('whatsapp_enabled, whatsapp_mode, whatsapp_pre_contact, whatsapp_pre_contact_text')
        .eq('account_id', conta.id)
        .maybeSingle()
      if (error) return { ok: false, motivo: classificar(error) }
      return { ok: true, canal: data ? paraCanal(data as Record<string, unknown>) : null }
    },

    async definirCanal(canal): Promise<GravacaoDoCanal> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      // `update` direto, como os demais campos de `account_settings`
      // (`conta/limiares-supabase.ts`, `conta/servico-supabase.ts`): a política
      // `account_settings_alteracao_de_admin` decide quem grava, e o gatilho de
      // auditoria da tabela escreve a trilha. Sem `.select()` a recusa da RLS
      // voltaria como sucesso com zero linha.
      const { data, error } = await cliente
        .from('account_settings')
        .update({
          whatsapp_enabled: canal.habilitado,
          whatsapp_mode: canal.modo,
          whatsapp_pre_contact: canal.preContato,
          whatsapp_pre_contact_text: canal.textoDoPreContato,
        })
        .eq('account_id', conta.id)
        .select('whatsapp_enabled, whatsapp_mode, whatsapp_pre_contact, whatsapp_pre_contact_text')

      if (error) return { ok: false, motivo: classificar(error) }
      const linha = (data as Record<string, unknown>[] | null)?.[0]
      if (!linha) return { ok: false, motivo: 'sem-permissao' }
      return { ok: true, canal: paraCanal(linha) }
    },

    assinar(conversaId, aoMudar) {
      let ativo = true
      const canal = cliente
        .channel(`whatsapp_messages:${conversaId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'whatsapp_messages',
            filter: `conversation_id=eq.${conversaId}`,
          },
          () => {
            if (ativo) aoMudar()
          },
        )
        .subscribe()

      return () => {
        ativo = false
        void cliente.removeChannel(canal)
      }
    },
  }
}
