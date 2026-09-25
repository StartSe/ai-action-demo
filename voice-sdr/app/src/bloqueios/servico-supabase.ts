// O serviço da lista de bloqueio sobre o Supabase: lê e escreve `dnc_entries`
// direto, sob a RLS da classe Operação (US-049).
//
// Três cuidados:
//
// 1. **Remover é `update`.** As colunas saem de `remocaoDoBloqueio`, e o filtro
//    `removed_at is null` impede remover duas vezes a mesma linha. Quem removeu
//    é carimbado pelo gatilho `carimbar_autoria_do_bloqueio`, não daqui.
// 2. **Recusa da RLS é silenciosa.** Insert e update pedem `.select('id')`, e
//    nada de volta é `sem-permissao`.
// 3. **A confirmação da importação recalcula a prévia.** Lê os ativos de novo e
//    passa o texto cru por `preverImportacao`: a lista pode ter mudado desde a
//    prévia, e resultado pronto vindo do navegador é estado velho.

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import { preverImportacao, remocaoDoBloqueio } from '@/bloqueios/lista'
import type {
  Bloqueio,
  CargaDosBloqueios,
  EscritaDoBloqueio,
  MotivoDeFalhaDosBloqueios,
  OrigemDoBloqueio,
  ResultadoDaImportacao,
  ResultadoDaPrevia,
  ServicoDeBloqueios,
} from '@/bloqueios/tipos'

const PRIVILEGIO_INSUFICIENTE = '42501'
/** `dnc_entries_ativo_unico_por_conta`. */
const VIOLACAO_DE_UNICO = '23505'
const VALOR_RECUSADO = new Set(['23514', '22P02', '23502'])

/** O mesmo tamanho de onda de `leads-import`. */
const TAMANHO_DA_ONDA = 100

/** Teto de linhas por leitura; a lista ativa de uma conta cabe folgada. */
const TETO_DA_LEITURA = 1_000

const COLUNAS =
  'id, phone_e164, reason, source, notes, created_by, created_at, removed_at, removed_by, removal_reason'

function paraBloqueio(linha: Record<string, unknown>): Bloqueio {
  return {
    id: linha.id as string,
    e164: linha.phone_e164 as string,
    motivo: linha.reason as string,
    origem: linha.source as OrigemDoBloqueio,
    observacao: (linha.notes as string | null) ?? null,
    incluidoPor: (linha.created_by as string | null) ?? null,
    incluidoEm: linha.created_at as string,
    removidoEm: (linha.removed_at as string | null) ?? null,
    removidoPor: (linha.removed_by as string | null) ?? null,
    motivoDaRemocao: (linha.removal_reason as string | null) ?? null,
  }
}

function classificar(erro: PostgrestError | null): MotivoDeFalhaDosBloqueios {
  if (erro?.code === PRIVILEGIO_INSUFICIENTE) return 'sem-permissao'
  if (erro?.code === VIOLACAO_DE_UNICO) return 'ja-bloqueado'
  if (erro?.code && VALOR_RECUSADO.has(erro.code)) return 'valor-recusado'
  return 'falha-de-comunicacao'
}

export function criarServicoDeBloqueios(cliente: SupabaseClient): ServicoDeBloqueios {
  async function contaAtual(): Promise<string | { motivo: MotivoDeFalhaDosBloqueios }> {
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

  async function ativos(contaId: string): Promise<string[] | MotivoDeFalhaDosBloqueios> {
    const { data, error } = await cliente
      .from('dnc_entries')
      .select('phone_e164')
      .eq('account_id', contaId)
      .is('removed_at', null)

    if (error) return classificar(error)
    return (data ?? []).map((linha) => linha.phone_e164 as string)
  }

  return {
    async carregar(recorte): Promise<CargaDosBloqueios> {
      const conta = await contaAtual()
      if (typeof conta !== 'string') return { ok: false, motivo: conta.motivo }

      let consulta = cliente.from('dnc_entries').select(COLUNAS).eq('account_id', conta)
      consulta =
        recorte.estado === 'ativo'
          ? consulta.is('removed_at', null)
          : consulta.not('removed_at', 'is', null)
      if (recorte.origem !== 'todas') consulta = consulta.eq('source', recorte.origem)

      const { data, error } = await consulta
        .order(recorte.estado === 'ativo' ? 'created_at' : 'removed_at', {
          ascending: false,
        })
        .limit(TETO_DA_LEITURA)

      if (error) return { ok: false, motivo: classificar(error) }
      const bloqueios = (data ?? []).map((linha) =>
        paraBloqueio(linha as Record<string, unknown>),
      )
      if (bloqueios.length) return { ok: true, bloqueios, haBloqueios: true }

      // Recorte vazio: pergunta se a conta tem alguma linha, para a tela dizer
      // "lista vazia" só quando é verdade.
      const contagem = await cliente
        .from('dnc_entries')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', conta)

      if (contagem.error) return { ok: false, motivo: classificar(contagem.error) }
      return { ok: true, bloqueios, haBloqueios: (contagem.count ?? 0) > 0 }
    },

    async incluir(inclusao): Promise<EscritaDoBloqueio> {
      const conta = await contaAtual()
      if (typeof conta !== 'string') return { ok: false, motivo: conta.motivo }

      const { data, error } = await cliente
        .from('dnc_entries')
        .insert({
          account_id: conta,
          phone_e164: inclusao.e164,
          reason: inclusao.motivo,
          source: 'manual',
        })
        .select('id')

      if (error) return { ok: false, motivo: classificar(error) }
      if (!data?.length) return { ok: false, motivo: 'sem-permissao' }
      return { ok: true }
    },

    async preverImportacao(texto): Promise<ResultadoDaPrevia> {
      const conta = await contaAtual()
      if (typeof conta !== 'string') return { ok: false, motivo: conta.motivo }

      const numeros = await ativos(conta)
      if (typeof numeros === 'string') return { ok: false, motivo: numeros }
      return { ok: true, previa: preverImportacao(texto, numeros) }
    },

    async importar(texto, motivo): Promise<ResultadoDaImportacao> {
      const conta = await contaAtual()
      if (typeof conta !== 'string') return { ok: false, motivo: conta.motivo }

      const numeros = await ativos(conta)
      if (typeof numeros === 'string') return { ok: false, motivo: numeros }

      const previa = preverImportacao(texto, numeros)
      let gravados = 0

      for (let inicio = 0; inicio < previa.validos.length; inicio += TAMANHO_DA_ONDA) {
        const onda = previa.validos.slice(inicio, inicio + TAMANHO_DA_ONDA)
        const { data, error } = await cliente
          .from('dnc_entries')
          .insert(
            onda.map((e164) => ({
              account_id: conta,
              phone_e164: e164,
              reason: motivo.trim(),
              source: 'import',
            })),
          )
          .select('id')

        if (error) return { ok: false, motivo: classificar(error) }
        if (!data?.length) return { ok: false, motivo: 'sem-permissao' }
        gravados += data.length
      }

      return { ok: true, gravados, previa }
    },

    async remover(id, motivo): Promise<EscritaDoBloqueio> {
      const { data, error } = await cliente
        .from('dnc_entries')
        .update(remocaoDoBloqueio(motivo, new Date()))
        .eq('id', id)
        .is('removed_at', null)
        .select('id')

      if (error) return { ok: false, motivo: classificar(error) }
      if (!data?.length) return { ok: false, motivo: 'sem-permissao' }
      return { ok: true }
    },
  }
}
