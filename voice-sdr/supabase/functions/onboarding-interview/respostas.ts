// O que quem pediu a entrevista lê quando ela não abriu ou não fechou, e com
// que status HTTP. Registro de interface (docs/padrao-de-interface.md seção 4).
// As recusas do modelo, depois da conversa, são as de `onboarding-suggest`.

export type MotivoDaEntrevista =
  | 'metodo_invalido'
  | 'conta_ausente'
  | 'acao_invalida'
  | 'conversa_ausente'
  | 'agente_ausente'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'sem_acesso'
  | 'papel_insuficiente'
  | 'voz_nao_conectada'
  | 'voz_indisponivel'
  | 'voz_fora_da_conta'
  | 'transcricao_pendente'
  | 'conversa_curta'
  | 'falha_interna'

export const MENSAGENS: Record<MotivoDaEntrevista, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  conta_ausente: 'O pedido veio sem a conta.',
  acao_invalida: 'Ação desconhecida. Use abrir ou encerrar.',
  conversa_ausente: 'O pedido veio sem a conversa.',
  agente_ausente: 'O pedido veio sem o agente da entrevista.',
  sem_sessao: 'Entre na sua conta para conversar com a assistente.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo.',
  sem_acesso: 'Você não tem acesso a esta conta.',
  papel_insuficiente:
    'Configurar a assistente é tarefa de quem administra a conta. Peça a quem administra.',
  voz_nao_conectada: 'Conecte a ElevenLabs no passo da voz. É por ela que a assistente fala.',
  voz_indisponivel: 'A ElevenLabs não respondeu agora. Tente de novo em alguns minutos.',
  voz_fora_da_conta:
    'A voz escolhida não está na sua conta da ElevenLabs e não foi possível adicioná-la. Volte ao passo da voz e escolha outra.',
  transcricao_pendente:
    'A conversa ainda está sendo processada pela ElevenLabs. Tente de novo em alguns segundos.',
  conversa_curta:
    'A conversa foi curta demais para sugerir alguma coisa. Converse mais um pouco ou escreva o negócio.',
  falha_interna: 'Não foi possível concluir agora. Tente de novo em alguns minutos.',
}

export const STATUS: Record<MotivoDaEntrevista, number> = {
  metodo_invalido: 405,
  conta_ausente: 400,
  acao_invalida: 400,
  conversa_ausente: 400,
  agente_ausente: 400,
  sem_sessao: 401,
  sessao_invalida: 401,
  sem_acesso: 403,
  papel_insuficiente: 403,
  voz_nao_conectada: 428,
  voz_indisponivel: 503,
  // 409: o pedido é válido, e a voz escolhida não serve nesta conta.
  voz_fora_da_conta: 409,
  // 409: a conversa existe, e ainda não está pronta. Repetir é o certo.
  transcricao_pendente: 409,
  conversa_curta: 422,
  falha_interna: 500,
}
