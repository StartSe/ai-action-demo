// O segredo interno das rotinas (`SARAH_INTERNAL_SECRET`), sem passo manual.
//
// O `pg_cron` manda o segredo no cabeçalho `x-internal-secret`, lendo-o do
// Vault por `disparar_rotina`; as funções conferem o que chega contra o mesmo
// valor. Até a migração 20261005100000 os dois lados dependiam de alguém gravar
// o segredo no Vault **e** a variável nas funções, com o mesmo valor. O
// instalador do painel não grava segredo nenhum (contrato de instalação §6.0),
// então numa instalação nova as rotinas nasciam paradas.
//
// Agora o banco sorteia o segredo no Vault quando ele falta, e as funções o
// leem pelo RPC `segredo_interno_da_instalacao`, que só `service_role` executa.
// Uma fonte, dois leitores: não há como os dois lados discordarem.
//
// **A variável definida continua vencendo**, como em `segredo-da-instalacao.ts`:
// quem já cadastrou `SARAH_INTERNAL_SECRET` não vê mudança nenhuma.
//
// **Falha fecha, nunca abre.** Cofre que não responde devolve vazio, e vazio é o
// que `segredoDaRotinaConfere` recusa. A falha não fica guardada: o pedido
// seguinte tenta de novo.
//
// **Guardado por cinco minutos no isolado.** Uma leitura por pedido custaria
// uma ida ao banco em toda rotina e em toda finalização; guardar para sempre
// faria uma rotação no Vault esperar o isolado morrer.
//
// Módulo portável: sem Deno, sem rede. O cliente entra pela interface mínima.

/** O RPC que devolve o segredo do Vault. Só `service_role` o executa. */
export const RPC_DO_SEGREDO_INTERNO = 'segredo_interno_da_instalacao'

/** Quanto o valor lido do Vault vale no isolado antes de ser lido de novo. */
export const VALIDADE_DO_SEGREDO_MS = 5 * 60_000

/** O pedaço do cliente do Supabase que a leitura usa. */
export interface ClienteDoCofre {
  rpc(nome: string): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export interface OpcoesDoLeitor {
  /** `SARAH_INTERNAL_SECRET`, quando alguém a definiu. */
  readonly definido: string | null | undefined
  /** Lê o segredo do Vault. Devolve nulo quando não há. */
  readonly lerDoCofre: () => Promise<string | null>
  /** Relógio injetável para o teste. */
  readonly agora?: () => number
}

/**
 * Devolve uma função que resolve o segredo: a variável, senão o Vault, senão
 * vazio. Pedidos simultâneos dividem a mesma leitura.
 */
export function leitorDoSegredoInterno(opcoes: OpcoesDoLeitor): () => Promise<string> {
  const definido = opcoes.definido?.trim() ?? ''
  const agora = opcoes.agora ?? Date.now
  let guardado: { valor: string; lidoEm: number } | null = null
  let emCurso: Promise<string> | null = null

  return async () => {
    if (definido !== '') return definido
    if (guardado && agora() - guardado.lidoEm < VALIDADE_DO_SEGREDO_MS) return guardado.valor
    if (emCurso) return emCurso

    emCurso = (async () => {
      try {
        const valor = (await opcoes.lerDoCofre())?.trim() ?? ''
        if (valor !== '') guardado = { valor, lidoEm: agora() }
        return valor
      } catch {
        return ''
      } finally {
        emCurso = null
      }
    })()
    return emCurso
  }
}

/** A leitura do Vault pelo RPC, com o cliente de serviço. */
export async function lerSegredoDoCofre(cliente: ClienteDoCofre): Promise<string | null> {
  const { data, error } = await cliente.rpc(RPC_DO_SEGREDO_INTERNO)
  if (error) throw new Error(error.message)
  return typeof data === 'string' ? data : null
}
