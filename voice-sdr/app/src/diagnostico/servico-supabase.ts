import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import { paraTela, type DiagnosticoNaTela } from '@diagnostico/diagnostico.ts'

import { diagnostico as copy } from '@/copy/diagnostico'
import type {
  CargaDoDiagnostico,
  ResultadoDaAnalise,
  ResultadoDaDecisao,
  ServicoDeDiagnostico,
} from '@/diagnostico/tipos'

/** A função de borda que analisa a ligação. */
export const FUNCAO_DO_DIAGNOSTICO = 'call-diagnose'

/** As colunas que `paraTela` lê. As mesmas que a borda grava. */
export const COLUNAS_DO_DIAGNOSTICO =
  'id, call_id, purpose, created_at, findings, cause, diagnosis, model_status, proposals, provider_summary'

/**
 * O corpo de uma função de borda que respondeu fora de 2xx. O cliente do
 * Supabase entrega esse caso como erro, com a resposta em `context`.
 */
async function corpoDoErro(erro: unknown): Promise<unknown> {
  const contexto = (erro as { context?: unknown } | null)?.context
  if (!(contexto instanceof Response)) return null
  try {
    return await contexto.json()
  } catch {
    return null
  }
}

/** A frase de uma recusa do banco ao decidir, pelo SQLSTATE. */
export function mensagemDaRecusa(erro: Pick<PostgrestError, 'code'> | null): string {
  const codigo = erro?.code ?? ''
  return Object.hasOwn(copy.recusas, codigo) ? (copy.recusas[codigo] ?? copy.falhaGenerica) : copy.falhaGenerica
}

export function criarServicoDeDiagnostico(cliente: SupabaseClient): ServicoDeDiagnostico {
  async function contaAtual(): Promise<string | null> {
    const { data: autenticado } = await cliente.auth.getUser()
    const usuarioId = autenticado.user?.id
    if (!usuarioId) return null
    const { data } = await cliente
      .from('account_members')
      .select('account_id')
      .eq('user_id', usuarioId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    return (data?.account_id as string | undefined) ?? null
  }

  async function decidir(
    funcao: 'aplicar_proposta_do_diagnostico' | 'descartar_proposta_do_diagnostico',
    diagnosticoId: string,
    propostaId: string,
  ): Promise<ResultadoDaDecisao> {
    const { data, error } = await cliente.rpc(funcao, {
      p_diagnosis_id: diagnosticoId,
      p_proposal_id: propostaId,
    })
    if (error) return { ok: false, mensagem: mensagemDaRecusa(error) }
    const corpo = (data ?? {}) as Record<string, unknown>
    return {
      ok: true,
      versaoId: typeof corpo.versao_id === 'string' ? corpo.versao_id : null,
      versao: typeof corpo.versao === 'number' ? corpo.versao : null,
    }
  }

  return {
    async carregar(chamadaId): Promise<CargaDoDiagnostico> {
      // A RLS de `call_diagnoses` é quem recorta a conta: membro lê o dele.
      const { data, error } = await cliente
        .from('call_diagnoses')
        .select(COLUNAS_DO_DIAGNOSTICO)
        .eq('call_id', chamadaId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) return { ok: false, mensagem: copy.falhaDaCarga }
      return { ok: true, diagnostico: data ? paraTela(data as Parameters<typeof paraTela>[0]) : null }
    },

    async analisar(chamadaId): Promise<ResultadoDaAnalise> {
      const conta = await contaAtual()
      if (!conta) return { ok: false, mensagem: copy.falhaGenerica }
      const { data, error } = await cliente.functions.invoke(FUNCAO_DO_DIAGNOSTICO, {
        body: { account_id: conta, call_id: chamadaId },
      })
      const corpo = (error ? await corpoDoErro(error) : data) as
        | { ok?: boolean; diagnostico?: DiagnosticoNaTela; mensagem?: unknown }
        | null
      if (corpo?.ok === true && corpo.diagnostico) return { ok: true, diagnostico: corpo.diagnostico }
      // A recusa chega pronta da borda; só a falha sem corpo ganha frase daqui.
      return {
        ok: false,
        mensagem: typeof corpo?.mensagem === 'string' ? corpo.mensagem : copy.falhaGenerica,
      }
    },

    aplicar: (diagnosticoId, propostaId) => decidir('aplicar_proposta_do_diagnostico', diagnosticoId, propostaId),
    descartar: (diagnosticoId, propostaId) => decidir('descartar_proposta_do_diagnostico', diagnosticoId, propostaId),
  }
}
