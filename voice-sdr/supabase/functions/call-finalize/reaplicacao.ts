// A reaplicação do que falhou durante a ligação (R-02).
//
// Uma ferramenta nossa chamada pelo provedor pode voltar com erro no meio da
// conversa: rede, prazo de resposta estourado, banco fora do ar. A Sarah segue
// a conversa, mas o efeito — o bloqueio gravado, a transferência decidida, a
// qualificação que move o funil — não aconteceu. A transcrição guarda o fato
// (`is_error`), e a finalização é o único momento em que alguém a lê inteira.
// É aqui que o efeito se refaz.
//
// **O REGISTRO É POR FERRAMENTA, E CONTINUA VAZIO NA F3.** `tool-dnc` não
// entra aqui: a falha que importa para ela (banco fora do ar durante a
// ligação) chega ao provedor como resposta `ok: false`, e não como `is_error`,
// então este registro nunca a veria. O bloqueio tem caminho próprio, em
// `reaplicacao-do-bloqueio.ts`, que lê toda invocação de `tool-dnc`.
// `tool-transfer` não tem efeito a refazer depois da ligação (a transferência
// não volta no tempo, e o item da fila ela mesma abre). `tool-qualify` entra
// na F4, as de agenda na F5 e na F6: a que tiver efeito refazível acrescenta a
// entrada.
//
// **NÃO RODA DUAS VEZES PARA A MESMA INVOCAÇÃO**, e quem garante é o banco: só
// se reaplica o que `gravarInvocacoes` acabou de inserir, e o único em
// `(call_id, tool, at)` faz a releitura da mesma transcrição não inserir nada.
// O preço, escrito para quem acrescentar a primeira entrada: se o processo cair
// entre o insert e o reaplicador, a invocação fica gravada com erro e sem
// reaplicação — no máximo uma vez, e nunca duas. Por isso cada reaplicador
// também deve ser idempotente pelo próprio efeito (o bloqueio tem único por
// telefone), e não depender desta garantia sozinho.
//
// **FALHA DO REAPLICADOR NÃO DERRUBA A FINALIZAÇÃO.** A transcrição, o áudio e
// o custo já estão gravados; a falha fica contada no corpo da resposta, e o
// erro original continua na linha da invocação para quem investigar.
//
// Módulo portável: sem Deno, sem rede, sem banco.

/** A invocação que voltou com erro, como a finalização a gravou. */
export interface InvocacaoParaReaplicar {
  readonly account_id: string
  readonly call_id: string
  readonly lead_id: string | null
  readonly tool: string
  readonly request: Readonly<Record<string, unknown>>
  readonly error: string
  readonly at: string
}

/** Refaz o efeito de uma ferramenta. Levanta quando não conseguiu. */
export type Reaplicador = (invocacao: InvocacaoParaReaplicar) => Promise<void>

/** Por nome de ferramenta, com o nome da coluna `call_tool_invocations.tool`. */
export type RegistroDeReaplicadores = ReadonlyMap<string, Reaplicador>

/**
 * O registro da produção. Vazio — ver o cabeçalho. `Map`, e não objeto
 * literal: o nome vem da transcrição, e num objeto `constructor` acharia a
 * função da cadeia de protótipos.
 */
export const REAPLICADORES: RegistroDeReaplicadores = new Map<string, Reaplicador>()

/** A chave que o banco devolve do que acabou de inserir. */
export interface ChaveDeInvocacao {
  readonly tool: string
  readonly at: string
}

export interface ResultadoDaReaplicacao {
  readonly feitas: number
  readonly falharam: number
}

/**
 * Reaplica as invocações com erro que acabaram de ser inseridas e que têm
 * reaplicador. O instante se compara por valor, e não por texto: o banco
 * devolve `+00:00` onde a finalização escreveu `Z`.
 */
export async function reaplicarFalhas(
  comErro: readonly InvocacaoParaReaplicar[],
  inseridas: readonly ChaveDeInvocacao[],
  registro: RegistroDeReaplicadores,
): Promise<ResultadoDaReaplicacao> {
  const novas = new Set(inseridas.map((chave) => chaveDe(chave.tool, chave.at)))
  let feitas = 0
  let falharam = 0

  for (const invocacao of comErro) {
    const reaplicador = registro.get(invocacao.tool)
    if (!reaplicador || !novas.has(chaveDe(invocacao.tool, invocacao.at))) continue
    try {
      await reaplicador(invocacao)
      feitas += 1
    } catch {
      falharam += 1
    }
  }
  return { feitas, falharam }
}

function chaveDe(ferramenta: string, instante: string): string {
  return `${ferramenta}\u0000${Date.parse(instante)}`
}
