// O que quem ensaia lê quando a sessão não abre ou não fecha (US-247).
//
// Registro de interface: direto e declarativo (docs/padrao-de-interface.md
// seção 4). Quem lê é quem administra a conta, na tela de ensaio.

export type MotivoDoEnsaio =
  | 'metodo_invalido'
  | 'conta_ausente'
  | 'acao_invalida'
  | 'proposito_invalido'
  | 'modo_invalido'
  | 'perfil_invalido'
  | 'ensaio_ausente'
  | 'ensaio_inexistente'
  | 'ensaio_encerrado'
  | 'sem_agente'
  | 'sem_publicacao'
  | 'sem_credencial_de_voz'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'sem_acesso'
  | 'papel_insuficiente'
  | 'provedor_indisponivel'
  | 'resposta_ilegivel'
  | 'falha_interna'

export const MENSAGENS: Record<MotivoDoEnsaio, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  conta_ausente: 'O pedido veio sem a conta.',
  acao_invalida: 'O pedido veio sem um passo conhecido do ensaio.',
  proposito_invalido: 'Escolha o propósito do ensaio: descoberta, lembrete, resgate ou acompanhamento.',
  modo_invalido: 'Escolha como conversar: por voz ou por texto.',
  perfil_invalido: 'Escolha com quem a assistente vai conversar no ensaio.',
  ensaio_ausente: 'O pedido veio sem o ensaio.',
  ensaio_inexistente: 'Este ensaio não existe nesta conta.',
  ensaio_encerrado: 'Este ensaio já foi encerrado.',
  // Ensaia-se contra o que vai ao ar (T-16). Sem publicação não há contra o
  // que ensaiar, e a frase manda para onde se publica.
  sem_agente: 'Esta conta ainda não tem uma assistente montada. Configure a identidade dela, publique e volte para ensaiar.',
  sem_publicacao:
    'A assistente ainda não foi publicada neste propósito. Publique o playbook em Playbooks e volte para ensaiar.',
  sem_credencial_de_voz:
    'Nenhuma chave cadastrada para o provedor de voz. Cadastre a chave em Integrações e volte para ensaiar.',
  sem_sessao: 'Entre na sua conta para ensaiar.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo para ensaiar.',
  sem_acesso: 'Você não tem acesso a esta conta.',
  papel_insuficiente:
    'Ensaiar com a assistente é tarefa de quem administra a conta. Peça o ensaio a quem administra.',
  provedor_indisponivel: 'Não foi possível abrir a conversa agora. Tente de novo em alguns minutos.',
  resposta_ilegivel: 'O provedor respondeu fora do formato esperado e a conversa não foi aberta.',
  falha_interna: 'Não foi possível continuar o ensaio agora. Tente de novo em alguns minutos.',
}

export const STATUS: Record<MotivoDoEnsaio, number> = {
  metodo_invalido: 405,
  conta_ausente: 400,
  acao_invalida: 400,
  proposito_invalido: 400,
  modo_invalido: 400,
  perfil_invalido: 400,
  ensaio_ausente: 400,
  ensaio_inexistente: 404,
  ensaio_encerrado: 409,
  // 428: falta um passo antes deste, e o passo é da conta.
  sem_publicacao: 428,
  sem_agente: 428,
  sem_credencial_de_voz: 409,
  sem_sessao: 401,
  sessao_invalida: 401,
  sem_acesso: 403,
  papel_insuficiente: 403,
  provedor_indisponivel: 503,
  resposta_ilegivel: 502,
  falha_interna: 500,
}

/** Para onde a tela manda quem recebeu a recusa, quando há para onde. */
export const CAMINHO_DA_RECUSA: Readonly<Partial<Record<MotivoDoEnsaio, string>>> = {
  sem_publicacao: '/sarah/playbooks',
  sem_agente: '/sarah/identidade',
  sem_credencial_de_voz: '/config/integracoes',
}
