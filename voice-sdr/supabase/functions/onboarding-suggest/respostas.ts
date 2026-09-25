// O que quem pediu as sugestões lê quando elas não vieram, e com que status
// HTTP. Registro de interface (docs/padrao-de-interface.md seção 4): quem lê é
// quem configura a conta, no assistente de abertura.

export type MotivoDaSugestao =
  | 'metodo_invalido'
  | 'conta_ausente'
  | 'contexto_curto'
  | 'contexto_longo'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'sem_acesso'
  | 'papel_insuficiente'
  | 'modelo_nao_conectado'
  | 'modelo_indisponivel'
  | 'resposta_ilegivel'
  | 'falha_interna'

export const MENSAGENS: Record<MotivoDaSugestao, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  conta_ausente: 'O pedido veio sem a conta.',
  contexto_curto:
    'Conte um pouco mais do negócio: o que vende, para quem e o que faz alguém ser um bom cliente.',
  contexto_longo: 'O texto passou do tamanho aceito. Resuma e peça de novo.',
  sem_sessao: 'Entre na sua conta para pedir as sugestões.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo para pedir as sugestões.',
  sem_acesso: 'Você não tem acesso a esta conta.',
  papel_insuficiente:
    'Configurar a assistente é tarefa de quem administra a conta. Peça a quem administra.',
  modelo_nao_conectado:
    'Conecte o provedor de modelo no primeiro passo. É ele que escreve as sugestões.',
  modelo_indisponivel: 'As sugestões não puderam ser escritas agora. Tente de novo em alguns minutos.',
  resposta_ilegivel: 'As sugestões voltaram fora do formato esperado. Peça de novo.',
  falha_interna: 'Não foi possível escrever as sugestões agora. Tente de novo em alguns minutos.',
}

export const STATUS: Record<MotivoDaSugestao, number> = {
  metodo_invalido: 405,
  conta_ausente: 400,
  contexto_curto: 400,
  contexto_longo: 400,
  sem_sessao: 401,
  sessao_invalida: 401,
  sem_acesso: 403,
  papel_insuficiente: 403,
  // 428: falta um passo antes deste, e o passo é da conta.
  modelo_nao_conectado: 428,
  modelo_indisponivel: 503,
  resposta_ilegivel: 502,
  falha_interna: 500,
}
