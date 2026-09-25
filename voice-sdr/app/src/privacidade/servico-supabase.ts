// O serviço de privacidade sobre o Supabase: lê as três colunas de
// `account_settings`, mede o que está no ar e grava por `definir_privacidade`.
//
// A medição é a mesma do estado de publicação da Sarah
// (`medirPublicacaoDaConta`) e a regra que a lê é a mesma que `agent-publish`
// usa para a pendência de gravação (`propositosComGravacaoPendente`). Deduzir
// "desliguei, logo está desligado" é exatamente o erro que L-18 descreve.
//
// A escrita não é `update` direto: o motivo (RF-008) só chega à trilha por
// parâmetro de sessão, e o RPC confere que quem grava é o dono.

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import { propositosComGravacaoPendente } from '@publicacao/publicacao.ts'

import type {
  CargaDaPrivacidade,
  ContagemForaDoPrazo,
  GravacaoDaPrivacidade,
  MotivoDeFalhaDaPrivacidade,
  PrivacidadeDaConta,
  ServicoDePrivacidade,
} from '@/privacidade/tipos'
import { lerAgenteDaConta, medirPublicacaoDaConta } from '@/sarah/servico-supabase'

/** `has_role(..., 'owner')` disse não, no gatilho ou no corpo do RPC. */
const PRIVILEGIO_INSUFICIENTE = '42501'

/** Argumento fora do domínio, violação de check e texto que não vira número. */
const VALOR_RECUSADO = new Set(['22023', '23514', '22P02', '23502'])

const COLUNAS = 'recording_enabled, recording_notice_text, retention_days'

/** Nome da coluna para cada campo; é também a chave que o RPC aceita. */
const COLUNA_DO_CAMPO: Record<keyof PrivacidadeDaConta, string> = {
  gravacaoLigada: 'recording_enabled',
  avisoDeGravacao: 'recording_notice_text',
  retencaoDias: 'retention_days',
}

function paraPrivacidade(linha: Record<string, unknown>): PrivacidadeDaConta {
  const aviso = linha.recording_notice_text
  return {
    gravacaoLigada: linha.recording_enabled !== false,
    avisoDeGravacao: typeof aviso === 'string' ? aviso : null,
    retencaoDias: Number(linha.retention_days),
  }
}

function paraColunas(mudancas: Partial<PrivacidadeDaConta>): Record<string, unknown> {
  const colunas: Record<string, unknown> = {}
  for (const [campo, valor] of Object.entries(mudancas)) {
    colunas[COLUNA_DO_CAMPO[campo as keyof PrivacidadeDaConta]] = valor
  }
  return colunas
}

function classificar(erro: PostgrestError | null): MotivoDeFalhaDaPrivacidade {
  if (erro?.code === PRIVILEGIO_INSUFICIENTE) return 'sem-permissao'
  if (erro?.code && VALOR_RECUSADO.has(erro.code)) return 'valor-recusado'
  return 'falha-de-comunicacao'
}

export function criarServicoDePrivacidade(cliente: SupabaseClient): ServicoDePrivacidade {
  async function contaAtual(): Promise<string | { motivo: MotivoDeFalhaDaPrivacidade }> {
    const { data: autenticado } = await cliente.auth.getUser()
    const usuarioId = autenticado.user?.id
    if (!usuarioId) return { motivo: 'sem-permissao' }

    const { data, error } = await cliente
      .from('account_members')
      .select('account_id')
      .eq('user_id', usuarioId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) return { motivo: classificar(error) }
    if (!data) return { motivo: 'sem-conta' }
    return data.account_id as string
  }

  return {
    async carregar(): Promise<CargaDaPrivacidade> {
      const conta = await contaAtual()
      if (typeof conta !== 'string') return { ok: false, motivo: conta.motivo }

      const [{ data, error }, agente] = await Promise.all([
        cliente.from('account_settings').select(COLUNAS).eq('account_id', conta).maybeSingle(),
        lerAgenteDaConta(cliente, conta),
      ])

      if (error) return { ok: false, motivo: classificar(error) }
      if (!data) return { ok: true, privacidade: null }

      const privacidade = paraPrivacidade(data as Record<string, unknown>)

      // Sem agente não há nada no ar, e portanto nada gravando lá fora.
      if (agente === null || typeof agente === 'string') {
        return {
          ok: true,
          privacidade,
          noProvedor: { propositosPendentes: [] },
          identidade: null,
        }
      }

      const medicao = await medirPublicacaoDaConta(cliente, conta, agente)
      return {
        ok: true,
        privacidade,
        noProvedor: {
          propositosPendentes: propositosComGravacaoPendente(
            privacidade.gravacaoLigada,
            medicao.hashCompilado,
            medicao.registradas,
          ),
        },
        identidade: { nome: agente.name, empresa: agente.company_name },
      }
    },

    async contarForaDoPrazo(dias): Promise<ContagemForaDoPrazo> {
      const conta = await contaAtual()
      if (typeof conta !== 'string') return { ok: false, motivo: conta.motivo }

      const { data, error } = await cliente.rpc('chamadas_fora_do_prazo', {
        p_account_id: conta,
        p_dias: dias,
      })

      if (error) return { ok: false, motivo: classificar(error) }
      return { ok: true, chamadas: Number(data ?? 0) }
    },

    async salvar(mudancas, motivo): Promise<GravacaoDaPrivacidade> {
      const conta = await contaAtual()
      if (typeof conta !== 'string') return { ok: false, motivo: conta.motivo }

      const { data, error } = await cliente.rpc('definir_privacidade', {
        p_account_id: conta,
        p_privacidade: paraColunas(mudancas),
        p_motivo: motivo,
      })

      if (error) return { ok: false, motivo: classificar(error) }
      return { ok: true, privacidade: paraPrivacidade(data as Record<string, unknown>) }
    },
  }
}
