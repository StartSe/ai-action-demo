/**
 * O que a tela de ensaio lê do banco além da sessão (US-114): as ferramentas
 * que a Sarah chamou na chamada de ensaio, de `call_tool_invocations`.
 *
 * Abrir e encerrar o ensaio continuam em `ServicoDaSarah` (US-247), porque
 * falam com a borda `rehearsal-session`. Este serviço é só leitura pela RLS de
 * membro, e existe à parte para a tela mostrar o que o provedor fez sem
 * depender do que ela própria viu chegar.
 */

/** Uma linha de `call_tool_invocations`, no que o ensaio mostra dela. */
export interface FerramentaDoEnsaio {
  /** `tool-dnc`, `system:end_call`, ... */
  ferramenta: string
  /** `at` da linha, em ISO-8601. É dele que sai a ordem. */
  em: string
  /** `error` da linha: nulo é o caso normal. */
  erro: string | null
}

export type CargaDasFerramentas =
  | { ok: true; ferramentas: readonly FerramentaDoEnsaio[] }
  | { ok: false }

export interface ServicoDoEnsaio {
  /** As ferramentas acionadas na chamada do ensaio, em ordem do instante. */
  carregarFerramentas(chamadaId: string): Promise<CargaDasFerramentas>
}
