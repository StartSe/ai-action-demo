// O que a tela lê quando puxa ou solta o freio, e com que status HTTP.
//
// Registro de interface, não fala da Sarah: direto e declarativo
// (docs/padrao-de-interface.md seção 4).
//
// **Puxar o freio de uma conta já parada não é erro**, nem soltar o de uma
// conta que já opera: 200 com o estado atual, porque o que quem clicou queria já
// é verdade. Erro faria a tela pedir para tentar de novo uma coisa que não tem
// mais o que fazer — e, no freio, faria alguém clicar de novo num momento em que
// a única coisa que importa é saber que a conta parou.

/** Por que o pedido não foi atendido. */
export type MotivoDoFreio =
  | 'metodo_invalido'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'acao_invalida'
  | 'conta_invalida'
  | 'motivo_obrigatorio'
  | 'conta_desconhecida'
  | 'papel_insuficiente'
  | 'falha_interna'

export const MENSAGENS: Record<MotivoDoFreio, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  sem_sessao: 'Entre na sua conta para usar a parada de emergência.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo para usar a parada de emergência.',
  acao_invalida: 'O pedido precisa dizer se a conta para ou volta a discar.',
  conta_invalida: 'O pedido precisa trazer a conta.',
  motivo_obrigatorio: 'Escreva o motivo. Ele fica registrado junto com o seu nome.',
  conta_desconhecida: 'Conta não encontrada.',
  papel_insuficiente: 'A parada de emergência exige o papel de administrador ou dono da conta.',
  falha_interna: 'Não foi possível concluir agora. Tente de novo em alguns segundos.',
}

export const STATUS: Record<MotivoDoFreio, number> = {
  metodo_invalido: 405,
  sem_sessao: 401,
  sessao_invalida: 401,
  acao_invalida: 400,
  conta_invalida: 400,
  motivo_obrigatorio: 400,
  // Também é a resposta de quem não é membro da conta: a diferença contaria a
  // quem sonda que o identificador existe.
  conta_desconhecida: 404,
  papel_insuficiente: 403,
  falha_interna: 500,
}

/** O que aconteceu, quando o pedido foi atendido. */
export type EstadoDoFreio = 'parada' | 'ja_parada' | 'retomada' | 'ja_operando'

export const MENSAGENS_DO_ESTADO: Record<EstadoDoFreio, string> = {
  parada: 'Discagem parada. Nenhuma ligação nova sai desta conta até alguém retomar.',
  ja_parada: 'A discagem desta conta já estava parada.',
  retomada: 'Discagem retomada. A fila volta a ser consumida no próximo minuto.',
  ja_operando: 'A discagem desta conta já estava ativa.',
}

/** Por que uma chamada em curso não foi encerrada. Vai por chamada no corpo. */
export type FalhaDoEncerramento = 'credencial_indisponivel' | 'provedor_nao_encerrou' | 'falha_interna'

export const FRASES_DAS_FALHAS: Record<FalhaDoEncerramento, string> = {
  credencial_indisponivel:
    'A credencial da telefonia não está disponível. A chamada termina sozinha ou pela varredura de recuperação.',
  provedor_nao_encerrou:
    'A telefonia não confirmou o encerramento. A chamada termina sozinha ou pela varredura de recuperação.',
  falha_interna:
    'Não foi possível pedir o encerramento. A chamada termina sozinha ou pela varredura de recuperação.',
}
