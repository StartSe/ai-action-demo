import type { SupabaseClient } from '@supabase/supabase-js'

import { carregarLimiares, definirLimiares } from '@/conta/limiares-supabase'
import { classificarFalhaDoRoteamento } from '@/conta/roteamento'
import type {
  CargaDoRoteamento,
  GravacaoDoRoteamento,
  ModoDeRoteamento,
  ResultadoDoReset,
  RoteamentoDaConta,
  ServicoDaConta,
} from '@/conta/tipos'

/** A borda que zera o ambiente. Desligada fora dos ambientes de teste. */
const FUNCAO_DO_RESET = 'environment-reset'

/** O corpo da recusa vem dentro do erro da função, como nas outras bordas. */
async function corpoDoErro(erro: unknown): Promise<unknown> {
  const contexto = (erro as { context?: { json?: () => Promise<unknown> } } | null)?.context
  try {
    return contexto?.json ? await contexto.json() : null
  } catch {
    return null
  }
}

function paraRoteamento(linha: Record<string, unknown>): RoteamentoDaConta {
  return {
    modo: linha.routing_mode as ModoDeRoteamento,
    especialistaFixoId:
      typeof linha.fixed_specialist_id === 'string' ? linha.fixed_specialist_id : null,
  }
}

export function criarServicoDaConta(cliente: SupabaseClient): ServicoDaConta {
  async function contaAtual(): Promise<string | 'sem-permissao' | 'sem-conta'> {
    const { data: autenticado } = await cliente.auth.getUser()
    const usuarioId = autenticado.user?.id
    if (!usuarioId) return 'sem-permissao'
    const { data } = await cliente
      .from('account_members')
      .select('account_id')
      .eq('user_id', usuarioId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    return data ? (data.account_id as string) : 'sem-conta'
  }

  return {
    carregarLimiares: () => carregarLimiares(cliente),
    definirLimiares: (limiares) => definirLimiares(cliente, limiares),

    async carregarRoteamento(): Promise<CargaDoRoteamento> {
      const conta = await contaAtual()
      if (conta === 'sem-permissao' || conta === 'sem-conta') return { ok: false, motivo: conta }

      const [configuracao, especialistas] = await Promise.all([
        cliente
          .from('account_settings')
          .select('routing_mode, fixed_specialist_id')
          .eq('account_id', conta)
          .maybeSingle(),
        cliente
          .from('specialists')
          .select('id, name, area, active')
          .eq('account_id', conta)
          .order('name', { ascending: true }),
      ])
      if (configuracao.error || especialistas.error) {
        return { ok: false, motivo: classificarFalhaDoRoteamento(configuracao.error ?? especialistas.error) }
      }
      return {
        ok: true,
        roteamento: configuracao.data ? paraRoteamento(configuracao.data as Record<string, unknown>) : null,
        especialistas: (especialistas.data ?? []).map((linha: Record<string, unknown>) => ({
          id: String(linha.id),
          nome: String(linha.name),
          area: typeof linha.area === 'string' ? linha.area : null,
          ativo: linha.active === true,
        })),
      }
    },

    async definirRoteamento(roteamento): Promise<GravacaoDoRoteamento> {
      const conta = await contaAtual()
      if (conta === 'sem-permissao' || conta === 'sem-conta') return { ok: false, motivo: conta }

      // `update` direto: a política de admin o permite, e a trilha vem do
      // gatilho de auditoria. Sem `.select()` a recusa da RLS voltaria como
      // sucesso com zero linha.
      const { data, error } = await cliente
        .from('account_settings')
        .update({
          routing_mode: roteamento.modo,
          fixed_specialist_id: roteamento.especialistaFixoId,
        })
        .eq('account_id', conta)
        .select('routing_mode, fixed_specialist_id')

      if (error) return { ok: false, motivo: classificarFalhaDoRoteamento(error) }
      const linha = data?.[0]
      if (!linha) return { ok: false, motivo: 'sem-permissao' }
      return { ok: true, roteamento: paraRoteamento(linha as Record<string, unknown>) }
    },

    async carregarNomeDaConta(): Promise<string | null> {
      const conta = await contaAtual()
      if (conta === 'sem-permissao' || conta === 'sem-conta') return null
      const { data, error } = await cliente.from('accounts').select('name').eq('id', conta).maybeSingle()
      if (error || typeof data?.name !== 'string') return null
      const nome = data.name.trim()
      return nome === '' ? null : nome
    },

    async zerarAmbiente(confirmacao): Promise<ResultadoDoReset> {
      const { data: autenticado } = await cliente.auth.getUser()
      const usuarioId = autenticado.user?.id
      if (!usuarioId) return { ok: false, mensagem: null }

      const { data: membro } = await cliente
        .from('account_members')
        .select('account_id')
        .eq('user_id', usuarioId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (!membro) return { ok: false, mensagem: null }

      const { data, error } = await cliente.functions.invoke(FUNCAO_DO_RESET, {
        body: { account_id: membro.account_id as string, confirmacao },
      })
      const corpo = (error ? await corpoDoErro(error) : data) as Record<string, unknown> | null
      if (corpo?.ok === true) {
        return {
          ok: true,
          agentesApagados: typeof corpo.agentesApagados === 'number' ? corpo.agentesApagados : 0,
          agentesQueFicaram: typeof corpo.agentesQueFicaram === 'number' ? corpo.agentesQueFicaram : 0,
        }
      }
      return { ok: false, mensagem: typeof corpo?.mensagem === 'string' ? corpo.mensagem : null }
    },
  }
}
