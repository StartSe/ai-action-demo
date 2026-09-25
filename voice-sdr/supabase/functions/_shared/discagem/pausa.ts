// A conta parada e a fila de discagem: o que `cron-dial` faz com o item de uma
// conta cujo freio está puxado (RF-011, L-04).
//
// É a regra que `cron-dial/despacho.ts` aplica antes de reivindicar, e mora
// aqui para ter teste próprio em vez de viver num `if` da rotina.
//
// **O item fica `queued`.** Não vira `failed` nem `canceled`, e não é tomado
// (`claimed`): retomar a discagem não pode exigir reenfileirar tudo, e a
// idempotência da fila vive da linha que já existe
// (`dial_queue(source, source_ref, attempt)`). Tomar o item e devolvê-lo depois
// abriria uma janela em que ele não está em estado nenhum que a varredura olhe.
//
// **Conta parada não é consumida, nem até a guarda.** A guarda recusaria de
// qualquer jeito no passo 0, mas cada recusa é uma linha em `call_attempts` e
// uma ida a `call-place`; com a fila cheia, parar a conta viraria gerar recusa
// por minuto até alguém retomar.
//
// **Estado desconhecido não disca.** Linha lida sem a coluna do freio é leitura
// torta de quem chamou, e a resposta segura é a mesma da conta parada: falha ao
// consultar quem decide é recusa, nunca liberação.
//
// Módulo portável: sem Deno, sem rede, sem banco.

/** O recorte de `accounts` que a decisão lê. */
export interface ContaDaFila {
  readonly dialing_paused_at?: string | null
}

/** O que acontece com os itens `queued` da conta nesta passagem. */
export type ConsumoDaFila =
  | { readonly consumir: true }
  | {
      readonly consumir: false
      readonly motivo: 'conta_parada' | 'estado_desconhecido'
      /** O item não muda de estado. Nunca `failed`: retomar não reenfileira. */
      readonly item: 'queued'
    }

export function consumoDaFila(conta: ContaDaFila | null | undefined): ConsumoDaFila {
  if (!conta || !('dialing_paused_at' in conta) || conta.dialing_paused_at === undefined) {
    return { consumir: false, motivo: 'estado_desconhecido', item: 'queued' }
  }
  if (conta.dialing_paused_at !== null) return { consumir: false, motivo: 'conta_parada', item: 'queued' }
  return { consumir: true }
}
