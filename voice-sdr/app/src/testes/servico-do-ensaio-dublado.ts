import type { CargaDasFerramentas, FerramentaDoEnsaio, ServicoDoEnsaio } from '@/ensaio/tipos'

export interface ServicoDoEnsaioDublado extends ServicoDoEnsaio {
  /**
   * O que `call_tool_invocations` tem, por chamada. O teste empurra linhas
   * aqui no meio da conversa, como as ferramentas gravariam, e na ordem que
   * quiser: a tela é que ordena pelo instante.
   */
  readonly invocacoes: Map<string, FerramentaDoEnsaio[]>
  /** Cada leitura pedida, com a chamada. */
  readonly leituras: string[]
  /** Quando verdadeiro, a leitura falha. */
  falhar: boolean
}

export function criarServicoDoEnsaioDublado(
  invocacoes: Record<string, FerramentaDoEnsaio[]> = {},
): ServicoDoEnsaioDublado {
  const dublado: ServicoDoEnsaioDublado = {
    invocacoes: new Map(Object.entries(invocacoes)),
    leituras: [],
    falhar: false,
    async carregarFerramentas(chamadaId): Promise<CargaDasFerramentas> {
      dublado.leituras.push(chamadaId)
      if (dublado.falhar) return { ok: false }
      // Cópia: a tela não pode segurar a lista que o teste vai mexer depois.
      return { ok: true, ferramentas: [...(dublado.invocacoes.get(chamadaId) ?? [])] }
    },
  }
  return dublado
}
