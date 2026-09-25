// Limite de taxa por conta, em janela deslizante (L-02).
//
// O endereço público de entrada é o único lugar do produto em que alguém de
// fora escreve sem sessão, e o que ele escreve custa dinheiro: lead recebido
// vira ligação na F2 (RF-610). Chave vazada sem limite não é lead falso na
// lista, é fatura. Por isso o limite é por conta e não por IP — quem tem a
// chave troca de IP, e o que precisa ser contido é o consumo da conta.
//
// **Janela deslizante e não balde por minuto.** Balde de minuto cheio permite
// 60 no último segundo de um minuto e 60 no primeiro do seguinte: 120 em dois
// segundos, que é o dobro do limite justamente no instante em que ele importa.
// A janela guarda os instantes e conta os que ainda estão dentro dela.
//
// **O pedido recusado não entra na janela.** Se entrasse, quem estourasse o
// limite e continuasse tentando renovaria a janela a cada tentativa e ficaria
// fora pelo tempo que insistisse — o limite viraria bloqueio, e um formulário
// com laço de retentativa mal escrito derrubaria a entrada de leads do cliente
// por horas. Recusar e não contar devolve a conta ao ar no fim da janela.
//
// **A janela vive na memória do isolado.** Não há Redis nesta fase, e a função
// de borda do Supabase roda em mais de um isolado quando há carga: o limite
// efetivo é 60 por isolado ativo, não 60 no total. O teto que segura o custo de
// verdade é o teto diário de ligações (RF-010), que é do banco e é da F2; este
// limite é a primeira barreira, a que responde na hora e não deixa um laço de
// retentativa virar mil pedidos. O contador compartilhado está na tabela de
// dívidas do degrau 3, em docs/PRD-implementacao.md seção 9.1.
//
// Módulo portável: sem `Deno`, sem import de rede, e sem relógio próprio — o
// tempo entra por parâmetro, e por isso o teste avança sessenta segundos sem
// timer falso e sem esperar.

/** Pedidos por conta e por janela. 60 por minuto é o que L-02 fixa. */
export const PEDIDOS_POR_JANELA = 60

/** Tamanho da janela, em milissegundos. */
export const JANELA_EM_MS = 60_000

/**
 * Quantas chaves a janela guarda antes de varrer as vencidas. A varredura é
 * O(n) e não pode rodar a cada pedido; sem varredura nenhuma, uma conta que
 * mandou um lead e nunca volta fica na memória do isolado para sempre.
 */
const CHAVES_ANTES_DA_VARREDURA = 1_000

export interface LimitePermitido {
  readonly permitido: true
}

export interface LimiteExcedido {
  readonly permitido: false
  /** Segundos até a janela abrir, para o cabeçalho Retry-After. Nunca zero. */
  readonly esperarSegundos: number
}

export type DecisaoDoLimite = LimitePermitido | LimiteExcedido

export interface LimiteDeTaxa {
  /**
   * Conta este pedido e diz se ele passa. Chamar é registrar: uma chamada por
   * pedido, e o resultado não se consulta duas vezes.
   */
  registrar(chave: string): DecisaoDoLimite
  /**
   * Quantas chaves a janela guarda agora. Existe para o teste medir a varredura
   * — sem ela, "a memória não cresce" não teria como cair — e serve de métrica
   * de quantas contas usaram o endereço no último minuto.
   */
  chavesGuardadas(): number
}

export interface OpcoesDoLimite {
  /** Relógio. Entra por parâmetro para o teste avançar o tempo à mão. */
  readonly agora?: () => number
  readonly pedidosPorJanela?: number
  readonly janelaEmMs?: number
}

export function criarLimiteDeTaxa(opcoes: OpcoesDoLimite = {}): LimiteDeTaxa {
  const agora = opcoes.agora ?? Date.now
  const teto = opcoes.pedidosPorJanela ?? PEDIDOS_POR_JANELA
  const janela = opcoes.janelaEmMs ?? JANELA_EM_MS
  const instantes = new Map<string, number[]>()

  return {
    registrar(chave) {
      const momento = agora()
      const inicioDaJanela = momento - janela

      if (instantes.size > CHAVES_ANTES_DA_VARREDURA) {
        varrer(instantes, inicioDaJanela)
      }

      const guardados = instantes.get(chave) ?? []
      const dentro = guardados.filter((instante) => instante > inicioDaJanela)

      if (dentro.length >= teto) {
        // A janela abre quando o mais antigo dos que estão dentro dela sair.
        // O `filter` preserva a ordem de inserção, então ele é o primeiro.
        const maisAntigo = dentro[0] ?? momento
        instantes.set(chave, dentro)
        return {
          permitido: false,
          esperarSegundos: Math.max(1, Math.ceil((maisAntigo + janela - momento) / 1_000)),
        }
      }

      dentro.push(momento)
      instantes.set(chave, dentro)
      return { permitido: true }
    },

    chavesGuardadas() {
      return instantes.size
    },
  }
}

/** Tira da memória as chaves sem nenhum instante dentro da janela. */
function varrer(instantes: Map<string, number[]>, inicioDaJanela: number): void {
  for (const [chave, guardados] of instantes) {
    const dentro = guardados.filter((instante) => instante > inicioDaJanela)
    if (dentro.length === 0) instantes.delete(chave)
    else instantes.set(chave, dentro)
  }
}
