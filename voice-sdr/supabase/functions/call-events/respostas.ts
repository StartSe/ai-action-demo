// O que o provedor de voz lê quando `call-events` recusa o aviso, e com que
// status HTTP.
//
// Quem lê é servidor, e não gente, pela mesma razão de
// `call-init/respostas.ts`: não é fala da Sarah nem rótulo de tela, e por isso
// não mora em `_shared/speech/` nem em `app/src/copy/`.
//
// **Só a recusa tem motivo.** Conversa desconhecida não está aqui porque não é
// recusa: sai com 200, pela razão escrita em `eventos.ts`.

/** Por que o aviso foi recusado. */
export type MotivoDoFim =
  | 'metodo_invalido'
  | 'assinatura_invalida'
  | 'corpo_invalido'
  | 'finalizacao_indisponivel'
  | 'falha_interna'

export const MENSAGENS: Record<MotivoDoFim, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  // Sem contorno escrito, de propósito: é a mesma frase para ausente,
  // malformada, fora da janela e inválida.
  assinatura_invalida: 'Assinatura inválida.',
  corpo_invalido: 'O webhook chegou sem um corpo JSON legível.',
  finalizacao_indisponivel:
    'A finalização desta ligação não pôde ser acionada agora. Reenvie o aviso.',
  falha_interna: 'Não foi possível processar este aviso agora. Reenvie o aviso.',
}

export const STATUS: Record<MotivoDoFim, number> = {
  metodo_invalido: 405,
  assinatura_invalida: 401,
  corpo_invalido: 400,
  // 503 e não 500: o provedor reenvia o que não recebeu 2xx, e reenviar é
  // exatamente o que se quer quando a finalização não atendeu. A reivindicação
  // de `call-finalize` garante que o reenvio não finalize duas vezes.
  finalizacao_indisponivel: 503,
  falha_interna: 503,
}
