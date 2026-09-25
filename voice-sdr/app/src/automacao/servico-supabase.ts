// O serviço da automação da conta sobre o Supabase: lê as colunas de
// `account_settings` e grava por `definir_automacao_da_conta`, que leva o
// motivo à trilha (RF-008). Update direto não levaria o motivo.

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import type {
  AutomacaoDaConta,
  CargaDaAutomacao,
  GravacaoDaAutomacao,
  MotivoDeFalhaDaAutomacao,
  ServicoDeAutomacao,
  TurnoDeRetentativa,
} from '@/automacao/tipos'

const PRIVILEGIO_INSUFICIENTE = '42501'
const VALOR_RECUSADO = new Set(['22023', '23514', '22P02', '23502'])

const COLUNA_DO_CAMPO: Record<keyof AutomacaoDaConta, string> = {
  lembreteInicioMinutos: 'reminder_window_start_minutes',
  lembreteFimMinutos: 'reminder_window_end_minutes',
  retentativaTeto: 'retry_max_attempts',
  retentativaRecuosMinutos: 'retry_backoff_minutes',
  retentativaOcupadoMinutos: 'retry_busy_minutes',
  turnos: 'retry_shifts',
  resgateTeto: 'rescue_max_attempts',
  resgateRecuoMinutos: 'rescue_backoff_minutes',
}

const COLUNAS = Object.values(COLUNA_DO_CAMPO).join(', ')

export function paraAutomacao(linha: Record<string, unknown>): AutomacaoDaConta {
  return {
    lembreteInicioMinutos: Number(linha.reminder_window_start_minutes),
    lembreteFimMinutos: Number(linha.reminder_window_end_minutes),
    retentativaTeto: Number(linha.retry_max_attempts),
    retentativaRecuosMinutos: ((linha.retry_backoff_minutes ?? []) as unknown[]).map(Number),
    retentativaOcupadoMinutos: Number(linha.retry_busy_minutes),
    turnos: (linha.retry_shifts ?? []) as TurnoDeRetentativa[],
    resgateTeto: Number(linha.rescue_max_attempts),
    resgateRecuoMinutos: Number(linha.rescue_backoff_minutes),
  }
}

export function paraColunasDaAutomacao(mudancas: Partial<AutomacaoDaConta>): Record<string, unknown> {
  const colunas: Record<string, unknown> = {}
  for (const [campo, valor] of Object.entries(mudancas)) {
    colunas[COLUNA_DO_CAMPO[campo as keyof AutomacaoDaConta]] = valor
  }
  return colunas
}

function classificar(erro: PostgrestError | null): MotivoDeFalhaDaAutomacao {
  if (erro?.code === PRIVILEGIO_INSUFICIENTE) return 'sem-permissao'
  if (erro?.code && VALOR_RECUSADO.has(erro.code)) return 'valor-recusado'
  return 'falha-de-comunicacao'
}

export function criarServicoDeAutomacao(cliente: SupabaseClient): ServicoDeAutomacao {
  async function contaAtual(): Promise<string | { motivo: MotivoDeFalhaDaAutomacao }> {
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
    async carregar(): Promise<CargaDaAutomacao> {
      const conta = await contaAtual()
      if (typeof conta !== 'string') return { ok: false, motivo: conta.motivo }
      const { data, error } = await cliente.from('account_settings').select(COLUNAS).eq('account_id', conta).maybeSingle()
      if (error) return { ok: false, motivo: classificar(error) }
      return { ok: true, automacao: data ? paraAutomacao(data as unknown as Record<string, unknown>) : null }
    },

    async salvar(mudancas, motivo): Promise<GravacaoDaAutomacao> {
      const conta = await contaAtual()
      if (typeof conta !== 'string') return { ok: false, motivo: conta.motivo }
      const { data, error } = await cliente.rpc('definir_automacao_da_conta', {
        p_account_id: conta,
        p_automacao: paraColunasDaAutomacao(mudancas),
        p_motivo: motivo,
      })
      if (error) return { ok: false, motivo: classificar(error) }
      return { ok: true, automacao: paraAutomacao(data as Record<string, unknown>) }
    },
  }
}
