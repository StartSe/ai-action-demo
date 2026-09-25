// O que a Z-API lê quando `whatsapp-inbound` responde, e com que status.
//
// Quem lê é servidor, não gente: não é fala da assistente nem rótulo de tela.
//
// **Quase tudo é 200.** A Z-API reenvia o que não recebeu 2xx, e mensagem
// ignorada (nossa, de grupo, repetida, ilegível) nunca vai passar a ser
// processável: reenviar seria ruído. Só a falha nossa é 503, porque aí o
// reenvio é o que se quer, e a idempotência por `messageId` garante que ele não
// responda duas vezes.

export type MotivoDaRecusa = 'metodo_invalido' | 'endereco_invalido' | 'falha_interna'

export const MENSAGENS: Record<MotivoDaRecusa, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  // A mesma frase para conta ausente, malformada, chave errada e chave de
  // outra conta, e ela não diz qual.
  endereco_invalido: 'Endereço de webhook inválido.',
  falha_interna: 'Não foi possível gravar esta mensagem agora. Reenvie o aviso.',
}

export const STATUS: Record<MotivoDaRecusa, number> = {
  metodo_invalido: 405,
  endereco_invalido: 401,
  falha_interna: 503,
}

/** A recusa do endereço, uma constante só, para a igualdade ser estrutural. */
export const RECUSA_DO_ENDERECO = Object.freeze({
  status: STATUS.endereco_invalido,
  corpo: Object.freeze({ ok: false, motivo: 'endereco_invalido', mensagem: MENSAGENS.endereco_invalido }),
})
