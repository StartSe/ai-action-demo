// O serviço do ensaio sobre o Supabase (US-114): lê `call_tool_invocations`
// da chamada de ensaio pela RLS de membro. Não escreve nada: quem grava são as
// ferramentas, durante a conversa, e `call-finalize`, no fim.
//
// Identificador malformado não vai ao banco, pelo motivo de `carregarFicha`:
// o PostgREST responderia erro de tipo em vez de lista vazia.

import type { SupabaseClient } from '@supabase/supabase-js'

import type { CargaDasFerramentas, ServicoDoEnsaio } from '@/ensaio/tipos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function criarServicoDoEnsaio(cliente: SupabaseClient): ServicoDoEnsaio {
  return {
    async carregarFerramentas(chamadaId): Promise<CargaDasFerramentas> {
      if (!UUID.test(chamadaId)) return { ok: false }

      const { data, error } = await cliente
        .from('call_tool_invocations')
        .select('tool, at, error')
        .eq('call_id', chamadaId)
        .order('at', { ascending: true })

      if (error) return { ok: false }
      return {
        ok: true,
        ferramentas: (data ?? []).map((linha: Record<string, unknown>) => ({
          ferramenta: String(linha.tool),
          em: String(linha.at),
          erro: typeof linha.error === 'string' && linha.error.trim() !== '' ? linha.error : null,
        })),
      }
    },
  }
}
