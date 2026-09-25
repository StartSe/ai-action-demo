// Falas que `tool-transfer` devolve, depois da ponte da regra travada de
// pedido de humano (`regras-travadas.ts`, `pedidoDeHumano`).
//
// A camada 1 manda a Sarah ler a frase que a ferramenta devolver do jeito que
// veio, e por isso são duas, uma para cada verdade que só a ferramenta
// conhece: há destino configurado, e a ferramenta de sistema
// `transfer_to_number` vai mover a chamada; ou não há, e o pedido virou item na
// fila para alguém do time retornar.
//
// Nenhuma das duas afirma que a transferência aconteceu. Quem transfere é
// `transfer_to_number`, encadeada depois desta resposta (T-02), e um webhook
// devolve JSON, não move chamada: dizer "te passei" antes disso é prometer o
// que pode não acontecer. E nenhuma promete prazo, porque nada no sistema
// cumpre "em cinco minutos".
//
// Registro de fala (docs/padrao-de-interface.md seção 4): frase curta,
// contração natural. Mora fora de `regras-travadas.ts` porque não é regra da
// camada 1: é resposta de ferramenta, e mudar uma delas não muda o texto
// publicado nem a versão da camada.

export const FALAS_DA_TRANSFERENCIA = {
  /**
   * Há destino configurado. Sai como resposta da ferramenta e antecede a
   * chamada de `transfer_to_number`: a Sarah avisa o que vai fazer, não o que
   * já fez.
   */
  emCurso: 'Beleza, vou te passar pra uma pessoa do time. Fica na linha, tá?',

  /**
   * Não há destino, e o pedido virou item na fila. A Sarah diz que alguém
   * procura o interlocutor depois, sem dizer quando.
   */
  retorno: 'Anotei o seu pedido aqui, e alguém do time te procura pra conversar. Obrigada pela paciência, viu?',
} as const
