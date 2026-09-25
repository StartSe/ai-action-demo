// O que quem pediu o rascunho lê quando ele não foi gravado, e com que status
// HTTP.
//
// Registro de interface: direto e declarativo, dizendo o que aconteceu e o que
// fazer em seguida (docs/padrao-de-interface.md seção 4). Quem lê é quem
// administra a conta, na tela de playbooks — nenhuma destas frases é fala da
// Sarah.

/** Por que o rascunho não foi gravado. */
export type MotivoDoRascunho =
  | 'metodo_invalido'
  | 'conta_ausente'
  | 'proposito_invalido'
  | 'descricao_curta'
  | 'descricao_longa'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'sem_acesso'
  | 'papel_insuficiente'
  | 'modelo_nao_conectado'
  | 'modelo_indisponivel'
  | 'resposta_ilegivel'
  | 'promete_horario'
  | 'falha_interna'

export const MENSAGENS: Record<MotivoDoRascunho, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  conta_ausente: 'O pedido veio sem a conta do roteiro.',
  proposito_invalido: 'Escolha o propósito do roteiro: descoberta, lembrete, resgate ou acompanhamento.',
  descricao_curta: 'Descreva o negócio com um pouco mais de detalhe: o que vende, para quem e qual problema resolve.',
  descricao_longa: 'A descrição passou do tamanho aceito. Resuma o negócio e peça o rascunho de novo.',
  sem_sessao: 'Entre na sua conta para pedir um rascunho de roteiro.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo para pedir o rascunho.',
  sem_acesso: 'Você não tem acesso a esta conta.',
  // A frase de quem concede acesso, como em agent-publish: o roteiro é
  // configuração, e a pessoa precisa saber a quem pedir.
  papel_insuficiente:
    'Escrever o roteiro é tarefa de quem administra a conta. Peça o rascunho a quem administra.',
  // Não é falha: é configuração que falta, e a frase diz onde resolver.
  modelo_nao_conectado:
    'Para a assistente escrever o roteiro, a conta precisa de um provedor de modelo conectado. Conecte em Integrações e volte aqui.',
  modelo_indisponivel: 'O rascunho não pôde ser escrito agora. Tente de novo em alguns minutos.',
  resposta_ilegivel: 'O rascunho voltou fora do formato esperado e não foi gravado. Peça de novo.',
  // O texto voltou, e é ele que não pode ir para o banco: a Sarah ofereceria
  // um horário que nenhuma ferramenta cumpre (O-06).
  promete_horario:
    'O rascunho oferecia horário, e a assistente ainda não tem agenda neste propósito. Nada foi gravado. Peça de novo ou escreva o roteiro à mão.',
  falha_interna: 'Não foi possível gravar o rascunho agora. Tente de novo em alguns minutos.',
}

export const STATUS: Record<MotivoDoRascunho, number> = {
  metodo_invalido: 405,
  conta_ausente: 400,
  proposito_invalido: 400,
  descricao_curta: 400,
  descricao_longa: 400,
  sem_sessao: 401,
  sessao_invalida: 401,
  sem_acesso: 403,
  papel_insuficiente: 403,
  // 428: falta um passo antes deste, e o passo é da conta.
  modelo_nao_conectado: 428,
  modelo_indisponivel: 503,
  // 502: o pedido estava certo, e quem respondeu mal foi o serviço de trás.
  resposta_ilegivel: 502,
  promete_horario: 502,
  falha_interna: 500,
}

/** Para onde a tela manda quem recebeu a recusa, quando há para onde. */
export const CAMINHO_DA_RECUSA: Readonly<Partial<Record<MotivoDoRascunho, string>>> = {
  modelo_nao_conectado: '/config/integracoes',
}

/**
 * A nota da versão que o rascunho grava (`playbook_versions.change_note`). É o
 * que o histórico mostra ao lado do número, e diz de onde o texto veio: meses
 * depois, "por que a Sarah disse isso?" começa por saber que a primeira versão
 * foi escrita pelo modelo.
 */
export const NOTA_DO_RASCUNHO = 'Rascunho escrito pelo modelo a partir da descrição do negócio.'
