import type { SupabaseClient } from '@supabase/supabase-js'

import {
  COLUNA_DO_LIMIAR,
  limiaresDaLinha,
  linhaDosLimiares,
  type LimiaresDaFila,
} from '@/conta/limiares'
import type {
  CargaDosLimiares,
  GravacaoDosLimiares,
  MotivoDeFalhaDosLimiares,
} from '@/conta/tipos'

const COLUNAS = Object.values(COLUNA_DO_LIMIAR).join(', ')
const PRIVILEGIO_INSUFICIENTE = '42501'
/** `check` recusado, valor que não converte e número largo demais para a coluna. */
const FORA_DO_DOMINIO = new Set(['23514', '22P02', '22003'])

function classificar(erro: { code?: string } | null): MotivoDeFalhaDosLimiares {
  if (erro?.code === PRIVILEGIO_INSUFICIENTE) return 'sem-permissao'
  if (erro?.code && FORA_DO_DOMINIO.has(erro.code)) return 'fora-do-dominio'
  return 'falha-de-comunicacao'
}

async function contaDaSessao(
  cliente: SupabaseClient,
): Promise<{ conta: string } | { motivo: MotivoDeFalhaDosLimiares }> {
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
  if (error) return { motivo: 'falha-de-comunicacao' }
  return data ? { conta: data.account_id as string } : { motivo: 'sem-conta' }
}

export async function carregarLimiares(cliente: SupabaseClient): Promise<CargaDosLimiares> {
  const sessao = await contaDaSessao(cliente)
  if ('motivo' in sessao) return { ok: false, motivo: sessao.motivo }

  const { data, error } = await cliente
    .from('account_settings')
    .select(COLUNAS)
    .eq('account_id', sessao.conta)
    .maybeSingle()
  if (error) return { ok: false, motivo: classificar(error) }
  return { ok: true, limiares: data ? limiaresDaLinha(data as unknown as Record<string, unknown>) : null }
}

export async function definirLimiares(
  cliente: SupabaseClient,
  limiares: LimiaresDaFila,
): Promise<GravacaoDosLimiares> {
  const sessao = await contaDaSessao(cliente)
  if ('motivo' in sessao) return { ok: false, motivo: sessao.motivo }

  // `update` direto: a política `account_settings_alteracao_de_admin` decide
  // quem grava, e o gatilho `account_settings_auditoria` escreve a trilha. Sem
  // `.select()` a recusa da RLS voltaria como sucesso com zero linha.
  const { data, error } = await cliente
    .from('account_settings')
    .update(linhaDosLimiares(limiares))
    .eq('account_id', sessao.conta)
    .select(COLUNAS)

  if (error) return { ok: false, motivo: classificar(error) }
  const linha = (data as unknown as Record<string, unknown>[] | null)?.[0]
  if (!linha) return { ok: false, motivo: 'sem-permissao' }
  return { ok: true, limiares: limiaresDaLinha(linha) }
}
