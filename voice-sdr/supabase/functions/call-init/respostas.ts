// O que o provedor de voz lê quando `call-init` não tem contexto a dar, e com
// que status HTTP.
//
// **Quem lê estas frases é servidor, não gente**, e por isso elas não estão em
// `_shared/speech/` nem em `app/src/copy/`: não são fala da Sarah e não são
// rótulo de tela. São o que aparece no registro do provedor e em
// `integration_events` quando alguém for descobrir por que uma ligação começou
// sem contexto. Ainda assim são frases em português e dizem o contorno — "erro
// 404" sozinho manda quem investiga ler código.
//
// A recusa de assinatura é a única sem contorno escrito, e é de propósito: ela
// é a mesma para ausente, malformada, fora da janela e inválida, e detalhar
// qual das quatro aconteceu contaria a quem tenta que uma delas chegou perto.

/** Por que não houve contexto. */
export type MotivoDoInicio =
  | 'metodo_invalido'
  | 'assinatura_invalida'
  | 'corpo_invalido'
  | 'conversa_ausente'
  | 'chamada_desconhecida'
  | 'linha_desconhecida'
  | 'conta_sem_agente'
  | 'falha_interna'

export const MENSAGENS: Record<MotivoDoInicio, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  assinatura_invalida: 'Assinatura inválida.',
  corpo_invalido: 'O webhook chegou sem um corpo JSON legível.',
  // Sem o identificador da conversa não há como a ligação recebida virar linha
  // em `calls`: é ele que as sete ferramentas usam para achar a chamada, e uma
  // linha sem ele nasceria invisível para todas elas.
  conversa_ausente:
    'O webhook de entrada chegou sem o identificador da conversa. Sem ele a ligação não pode ser registrada.',
  chamada_desconhecida:
    'Nenhuma ligação desta instalação corresponde a este identificador. Confira se o agente publicado é o desta instalação.',
  linha_desconhecida:
    'Nenhuma linha telefônica desta instalação atende este número. Registre o número em Números antes de recebê-lo.',
  conta_sem_agente:
    'Esta conta ainda não montou a assistente. Configure nome e empresa do agente antes de receber ligações.',
  falha_interna: 'Não foi possível montar o contexto desta ligação agora.',
}

export const STATUS: Record<MotivoDoInicio, number> = {
  metodo_invalido: 405,
  assinatura_invalida: 401,
  corpo_invalido: 400,
  conversa_ausente: 400,
  // Os dois 404 do critério de aceite: sem linha em `calls` e sem número
  // reconhecido. É 404 e não 500 porque o pedido está bem formado e assinado —
  // o que não existe é o que ele aponta.
  chamada_desconhecida: 404,
  linha_desconhecida: 404,
  // 409 e não 404: a conta existe, o que falta é configuração dela.
  conta_sem_agente: 409,
  falha_interna: 500,
}
