// A `PortaDeFerramentas` sobre o cliente do Supabase, escrita uma vez.
//
// `tool-dnc/index.ts` montou a primeira e `tool-transfer/index.ts` a copiou; a
// terceira ferramenta (`tool-availability`) a tirou daqui de dentro, antes que
// as três divergissem no primeiro ajuste — o filtro pela conta provada em
// `chamadaDaConversa` é a linha que não pode faltar em nenhuma delas.
//
// `_shared/` não importa `npm:` (a interface lê esta pasta), então o cliente
// entra por parâmetro, tipado pelo recorte que a porta usa: `from`, `select`,
// `eq`, `maybeSingle` e `insert`. O `SupabaseClient` não se compara com esse
// recorte pelo compilador — os genéricos do PostgREST estouram a profundidade
// de instanciação (TS2589) —, então o `index.ts` o entrega convertido
// (`as unknown as ClienteDasFerramentas`). Quem prova as consultas é o teste
// deste módulo, com um cliente em memória que registra tabela e filtros.
//
// O cache das contas vale 60 s por isolado. É o que deixa o cabeçalho
// autenticar sem uma leitura por invocação (T-18), e é aproximação: conta
// criada há menos de um minuto recebe 401 até o cache virar.

import type { ChamadaDaFerramenta, PortaDeFerramentas } from './esqueleto.ts'

/** O que toda consulta do PostgREST devolve. */
export interface RespostaDoCliente<T> {
  readonly data: T | null
  readonly error: { readonly message: string } | null
}

/** Uma consulta encadeável: filtra por igualdade, e se lê esperando ou por `maybeSingle`. */
export interface ConsultaDoCliente<T> extends PromiseLike<RespostaDoCliente<T>> {
  eq(coluna: string, valor: string): ConsultaDoCliente<T>
  maybeSingle(): PromiseLike<RespostaDoCliente<unknown>>
}

/** O recorte do cliente do Supabase que a porta usa. */
export interface ClienteDasFerramentas {
  from(tabela: string): {
    select(colunas: string): ConsultaDoCliente<unknown[]>
    insert(linha: object): PromiseLike<RespostaDoCliente<unknown>>
  }
}

export const VALIDADE_DAS_CONTAS_MS = 60_000

/** Monta a porta sobre o cliente dado. `agora` tem padrão e o teste passa o seu. */
export function criarPortaDeFerramentas(
  cliente: ClienteDasFerramentas,
  agora: () => number = Date.now,
): PortaDeFerramentas {
  let contasEmCache: { lidasEm: number; ids: string[] } | null = null

  return {
    async contasCandidatas() {
      const instante = agora()
      if (contasEmCache && instante - contasEmCache.lidasEm < VALIDADE_DAS_CONTAS_MS) {
        return contasEmCache.ids
      }
      const { data, error } = await cliente.from('accounts').select('id')
      if (error) throw new Error(error.message)
      const ids = (data ?? []).map((linha) => (linha as { id: string }).id)
      contasEmCache = { lidasEm: instante, ids }
      return ids
    },

    async chamadaDaConversa(contaId, conversaId): Promise<ChamadaDaFerramenta | null> {
      const { data, error } = await cliente
        .from('calls')
        .select('id, account_id, purpose, direction, lead_id')
        .eq('account_id', contaId)
        .eq('provider_conversation_id', conversaId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return (data as ChamadaDaFerramenta | null) ?? null
    },

    async registrarInvocacao(invocacao) {
      const { error } = await cliente.from('call_tool_invocations').insert(invocacao)
      if (error) throw new Error(error.message)
    },
  }
}
