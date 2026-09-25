// O que quem sincroniza a base lê, e com que status HTTP.
//
// Três famílias, pela mesma razão de agent-publish: o pedido inteiro pode ser
// recusado antes da primeira entrada (`MotivoLocal`); cada entrada pode falhar
// sozinha (`MotivoDaEntrada`), com as outras seguindo adiante; e cada uma das
// quatro publicações pode não receber os documentos (`MotivoDaPublicacao`).
// Uma entrada com erro no meio de vinte precisa ser encontrável, e um "deu
// certo" global mentiria sobre ela.
//
// Registro de interface: direto e declarativo, dizendo o que aconteceu e o que
// fazer em seguida (docs/padrao-de-interface.md seção 4). Quem lê é quem
// administra a conta; nenhuma destas frases é fala da Sarah.

/** Recusas do pedido inteiro, antes da primeira entrada. */
export type MotivoLocal =
  | 'metodo_invalido'
  | 'conta_ausente'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'sem_acesso'
  | 'papel_insuficiente'
  | 'sem_credencial_de_voz'
  | 'credencial_da_plataforma_bloqueada'
  | 'falha_interna'

/**
 * Por que uma entrada não sincronizou. É também o código que vai para
 * `knowledge_entries.sync_error`, e por isso fica em `[a-z_]+`, que é o check
 * da coluna.
 */
export type MotivoDaEntrada =
  | 'envio_recusado'
  | 'envio_indisponivel'
  | 'remocao_recusada'
  | 'remocao_indisponivel'
  | 'falha_ao_gravar'

/** Por que uma publicação não recebeu os documentos. */
export type MotivoDaPublicacao = 'anexo_recusado' | 'anexo_indisponivel'

export const MENSAGENS: Record<MotivoLocal, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  conta_ausente: 'O pedido veio sem a conta da base de conhecimento.',
  sem_sessao: 'Entre na sua conta para sincronizar a base de conhecimento.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo para sincronizar a base.',
  sem_acesso: 'Você não tem acesso a esta conta.',
  papel_insuficiente:
    'Sincronizar a base de conhecimento é tarefa de quem administra a conta. Peça a sincronização a quem administra.',
  sem_credencial_de_voz:
    'Nenhuma chave cadastrada para o provedor de voz. Cadastre a chave em Integrações e sincronize.',
  credencial_da_plataforma_bloqueada:
    'Existe uma chave da plataforma, mas esta conta precisa usar a própria. Cadastre a chave desta conta em Integrações.',
  falha_interna: 'Não foi possível sincronizar a base agora. Tente de novo em alguns minutos.',
}

export const STATUS: Record<MotivoLocal, number> = {
  metodo_invalido: 405,
  conta_ausente: 400,
  sem_sessao: 401,
  sessao_invalida: 401,
  sem_acesso: 403,
  papel_insuficiente: 403,
  // 409: o pedido está certo e quem pediu tem o papel; falta estado da conta.
  sem_credencial_de_voz: 409,
  credencial_da_plataforma_bloqueada: 409,
  falha_interna: 500,
}

export const MENSAGENS_DA_ENTRADA: Record<MotivoDaEntrada, string> = {
  envio_recusado:
    'O provedor de voz recusou esta entrada. Confira a chave em Integrações e sincronize de novo.',
  envio_indisponivel:
    'O provedor de voz não respondeu a tempo para esta entrada. Sincronize de novo em alguns minutos.',
  // A entrada continua na lista, marcada: sumir com ela deixaria o documento
  // no provedor e a Sarah respondendo com o que a conta mandou tirar.
  remocao_recusada:
    'O provedor de voz recusou a remoção. A entrada continua marcada para sair e a assistente ainda pode usá-la. Sincronize de novo.',
  remocao_indisponivel:
    'O provedor de voz não respondeu à remoção. A entrada continua marcada para sair e a assistente ainda pode usá-la. Sincronize de novo em alguns minutos.',
  falha_ao_gravar:
    'O provedor respondeu, mas o registro desta entrada não foi gravado. Sincronize de novo para acertar o registro.',
}

export const MENSAGENS_DA_PUBLICACAO: Record<MotivoDaPublicacao, string> = {
  anexo_recusado:
    'O provedor de voz recusou os documentos neste propósito. Confira a chave em Integrações e sincronize de novo.',
  anexo_indisponivel:
    'O provedor de voz não respondeu a tempo neste propósito. Sincronize de novo em alguns minutos.',
}
