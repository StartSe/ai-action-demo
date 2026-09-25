// O serviço do painel sobre o Supabase: uma chamada ao RPC `dashboard_summary`
// (US-143) por período, e nada somado aqui. O RPC é `security definer` e
// recusa com `sem_permissao` (42501) quem não é membro da conta.

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import { lerResumo } from '@/painel/leitura'
import type { CargaDoPainel, MotivoDeFalhaDoPainel, ServicoDoPainel } from '@/painel/tipos'

const PRIVILEGIO_INSUFICIENTE = '42501'

function classificar(erro: PostgrestError | null): MotivoDeFalhaDoPainel {
  return erro?.code === PRIVILEGIO_INSUFICIENTE ? 'sem-permissao' : 'falha-de-comunicacao'
}

export function criarServicoDoPainel(cliente: SupabaseClient): ServicoDoPainel {
  async function contaAtual(): Promise<{ id: string } | MotivoDeFalhaDoPainel> {
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

  return {
    async carregarResumo(intervalo): Promise<CargaDoPainel> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente.rpc('dashboard_summary', {
        p_account_id: conta.id,
        p_de: intervalo.de,
        p_ate: intervalo.ate,
      })
      if (error) return { ok: false, motivo: classificar(error) }

      const resumo = lerResumo(data)
      return resumo ? { ok: true, resumo } : { ok: false, motivo: 'falha-de-comunicacao' }
    },
  }
}
