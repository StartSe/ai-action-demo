// O que a tela lê quando pede para cancelar, e com que status HTTP.
//
// Registro de interface, não fala da Sarah: direto e declarativo
// (docs/padrao-de-interface.md seção 4).
//
// **Cancelar o que já acabou não é erro.** Chamada encerrada, item já retirado
// da fila: 200 com o estado atual, porque o que quem clicou queria — que a
// ligação não aconteça ou pare — já é verdade. Erro faria a tela pedir para
// tentar de novo uma coisa que não tem mais o que fazer.

/** Por que o cancelamento não aconteceu. */
export type MotivoDoCancelamento =
  | 'metodo_invalido'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'alvo_invalido'
  | 'alvo_desconhecido'
  | 'papel_insuficiente'
  | 'em_discagem'
  | 'em_transicao'
  | 'sem_identificador_no_provedor'
  | 'credencial_indisponivel'
  | 'provedor_nao_encerrou'
  | 'falha_interna'

export const MENSAGENS: Record<MotivoDoCancelamento, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  sem_sessao: 'Entre na sua conta para cancelar a chamada.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo para cancelar a chamada.',
  alvo_invalido: 'O pedido precisa trazer a chamada ou o item da fila, e só um dos dois.',
  alvo_desconhecido: 'Chamada não encontrada.',
  papel_insuficiente: 'Cancelar chamada exige o papel de operador, administrador ou dono da conta.',
  em_discagem:
    'A discagem deste item já começou. Aguarde alguns segundos e cancele a chamada que ela abriu.',
  em_transicao: 'A chamada mudou de estado durante o pedido. Tente cancelar de novo.',
  sem_identificador_no_provedor:
    'Esta chamada não tem identificador na telefonia, e por isso não pode ser encerrada daqui.',
  credencial_indisponivel:
    'A credencial da telefonia desta conta não está disponível. Confira em Integrações.',
  provedor_nao_encerrou:
    'A telefonia não confirmou o encerramento. A chamada continua em curso; tente cancelar de novo.',
  falha_interna: 'Não foi possível cancelar agora. Tente de novo em alguns segundos.',
}

export const STATUS: Record<MotivoDoCancelamento, number> = {
  metodo_invalido: 405,
  sem_sessao: 401,
  sessao_invalida: 401,
  alvo_invalido: 400,
  // Também é a resposta de quem não é membro da conta do alvo: a diferença
  // contaria a quem sonda que o identificador existe.
  alvo_desconhecido: 404,
  papel_insuficiente: 403,
  em_discagem: 409,
  em_transicao: 409,
  sem_identificador_no_provedor: 422,
  credencial_indisponivel: 503,
  provedor_nao_encerrou: 502,
  falha_interna: 500,
}

/** O que aconteceu, quando o pedido foi atendido. */
export type EstadoDoCancelamento =
  | 'retirado_da_fila'
  | 'cancelada_antes_de_discar'
  | 'encerrando'
  | 'ja_retirado'
  | 'ja_cancelada'
  | 'ja_encerrada'

export const MENSAGENS_DO_ESTADO: Record<EstadoDoCancelamento, string> = {
  retirado_da_fila: 'Discagem retirada da fila. A assistente não vai ligar.',
  cancelada_antes_de_discar: 'Chamada cancelada antes de discar.',
  encerrando: 'Chamada sendo encerrada. A ficha é atualizada quando a telefonia confirmar o fim.',
  ja_retirado: 'Esta discagem já tinha saído da fila.',
  ja_cancelada: 'Esta chamada já estava cancelada.',
  ja_encerrada: 'Esta chamada já tinha terminado.',
}
