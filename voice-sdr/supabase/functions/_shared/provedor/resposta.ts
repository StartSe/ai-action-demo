// O envelope de uma ida ao provedor, numa forma só.
//
// Três bordas já respondem à mesma pergunta — deu certo, qual foi o código,
// qual o status, quanto demorou, qual caminho foi chamado e o que veio no corpo
// — e as três escreviam o mesmo tipo com nomes próprios (`agent-publish`,
// `phone-register` e, agora, `call-place`). A terceira cópia é onde a regra sai
// para `_shared/`: o que muda entre elas é só o identificador que cada uma traz
// de volta, e esse fica na interface de cada função, estendendo esta.
//
// Duas decisões do envelope, e as duas valem para quem o estender:
//
// 1. **Nunca levanta.** Falha de rede e recusa do provedor chegam como
//    `ok: false` com código, porque quem chamou precisa decidir o que fazer e
//    não tratar exceção no meio de um discador.
// 2. **`codigo` é lido e descartado.** Ele vira motivo por
//    `_shared/provedor/erros.ts` e não sai no corpo da resposta: código bruto
//    de terceiro na tela é ruído para quem opera e pista para quem sonda.
//
// Módulo portável: sem Deno, sem rede, sem banco.

/** O que o provedor respondeu. Nunca levanta: falha vem como `ok: false`. */
export interface EnvelopeDoProvedor {
  readonly ok: boolean
  /** Código do provedor. Lido por quem chama e descartado: não sai no corpo. */
  readonly codigo?: string | null
  readonly status?: number | null
  readonly latenciaMs?: number | null
  /** O corpo da resposta, para o registro de integração. */
  readonly corpo?: Readonly<Record<string, unknown>> | null
  /** O caminho chamado, sem o endereço do provedor. Quem o conhece é o adaptador. */
  readonly endpoint?: string | null
}
