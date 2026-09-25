// O que quem publica lê, e com que status HTTP.
//
// Duas famílias, e a separação é a que importa nesta função: o pedido inteiro
// pode ser recusado antes de qualquer propósito (`MotivoLocal`), e cada
// propósito pode falhar sozinho (`MotivoDoProposito`). Publicar quatro agentes
// contra um provedor que não tem transação dá **quatro resultados**, e uma
// resposta que só soubesse dizer "deu certo" ou "deu errado" teria que escolher
// entre mentir sobre os três que foram e mentir sobre o que ficou.
//
// Registro de interface: direto e declarativo, dizendo o que aconteceu e o que
// fazer em seguida (docs/padrao-de-interface.md seção 4). Nenhuma destas frases
// é fala da Sarah — quem as lê é quem administra a conta.

/** Recusas do pedido inteiro, antes de o primeiro propósito ser compilado. */
export type MotivoLocal =
  | 'metodo_invalido'
  | 'conta_ausente'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'sem_acesso'
  | 'papel_insuficiente'
  | 'sem_agente'
  | 'agente_incompleto'
  | 'sem_credencial_de_voz'
  | 'credencial_da_plataforma_bloqueada'
  | 'sem_chave_de_ferramentas'
  | 'falha_interna'

/** Por que um propósito não foi publicado, com os outros três seguindo adiante. */
export type MotivoDoProposito =
  | 'sem_roteiro_publicado'
  | 'provedor_recusou'
  | 'provedor_indisponivel'
  | 'falha_ao_gravar'

export const MENSAGENS: Record<MotivoLocal, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  conta_ausente: 'O pedido veio sem a conta em que a assistente seria publicada.',
  sem_sessao: 'Entre na sua conta para publicar a assistente.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo para publicar a assistente.',
  sem_acesso: 'Você não tem acesso a esta conta.',
  // A frase de quem concede acesso: publicar é configuração, e o Operador
  // trabalha o funil dentro dela. Dizer só "sem permissão" deixaria a pessoa
  // sem o próximo passo, que é pedir a quem administra.
  papel_insuficiente:
    'Publicar a assistente é tarefa de quem administra a conta. Peça a publicação a quem administra.',
  sem_agente: 'Esta conta ainda não tem uma assistente montada. Configure a identidade dela e publique.',
  agente_incompleto:
    'Falta informar a empresa, escolher a voz ou escrever a primeira fala da assistente. Complete a identidade dela e publique.',
  sem_credencial_de_voz:
    'Nenhuma chave cadastrada para o provedor de voz. Cadastre a chave em Integrações e publique.',
  credencial_da_plataforma_bloqueada:
    'Existe uma chave da plataforma, mas esta conta precisa usar a própria. Cadastre a chave desta conta em Integrações.',
  // Falha de instalação, não da conta: a variável do servidor não foi
  // configurada. A frase não manda cadastrar nada, porque não há o que
  // cadastrar do lado de quem lê.
  sem_chave_de_ferramentas:
    'A publicação está indisponível por uma configuração do servidor. Avise o suporte técnico.',
  falha_interna: 'Não foi possível publicar agora. Tente de novo em alguns minutos.',
}

export const STATUS: Record<MotivoLocal, number> = {
  metodo_invalido: 405,
  conta_ausente: 400,
  sem_sessao: 401,
  sessao_invalida: 401,
  // 403 e não 404: dizer "não existe" para uma conta que existe não protege
  // ninguém de quem já tem o identificador, e a frase precisa ser verdadeira.
  sem_acesso: 403,
  papel_insuficiente: 403,
  // 409 nos quatro: o pedido está bem formado e quem pediu tem o papel; o que
  // falta é estado da conta. 400 mandaria corrigir o pedido, que está certo.
  sem_agente: 409,
  agente_incompleto: 409,
  sem_credencial_de_voz: 409,
  credencial_da_plataforma_bloqueada: 409,
  sem_chave_de_ferramentas: 500,
  falha_interna: 500,
}

export const MENSAGENS_DO_PROPOSITO: Record<MotivoDoProposito, string> = {
  sem_roteiro_publicado:
    'Este propósito não tem roteiro publicado. Publique uma versão do roteiro e publique a assistente de novo.',
  // A frase do provedor não entra aqui: código dele morre na borda, como em
  // integrations-status. O que quem administra precisa saber é se a ação é
  // dele ou se é só esperar.
  provedor_recusou:
    'O provedor de voz recusou a publicação deste propósito. Confira a chave em Integrações e publique de novo.',
  provedor_indisponivel:
    'O provedor de voz não respondeu a tempo neste propósito. Publique de novo em alguns minutos.',
  falha_ao_gravar:
    'Este propósito foi publicado no provedor, mas o registro não foi gravado. Publique de novo para acertar o registro.',
}

/**
 * Por que os webhooks da ElevenLabs ficaram pendentes. Nenhum derruba a
 * publicação: os agentes já estão no ar, e a próxima publicação tenta de novo.
 */
export type MotivoDosWebhooks =
  | 'configuracao_ilegivel'
  | 'aviso_de_fim_nao_criado'
  | 'segredo_nao_guardado'
  | 'configuracao_recusada'

export const MENSAGENS_DOS_WEBHOOKS: Record<MotivoDosWebhooks, string> = {
  configuracao_ilegivel:
    'A assistente foi publicada, mas não foi possível conferir os avisos de início e de fim de ligação na ElevenLabs. Publique de novo.',
  aviso_de_fim_nao_criado:
    'A assistente foi publicada, mas os avisos de fim de ligação não foram cadastrados na ElevenLabs. Publique de novo.',
  segredo_nao_guardado:
    'A assistente foi publicada, mas o aviso de fim de ligação cadastrado na ElevenLabs não foi guardado nesta conta. Publique de novo.',
  configuracao_recusada:
    'A assistente foi publicada, mas a ElevenLabs não aceitou os avisos de início e de fim de ligação. Publique de novo.',
}

/** A frase da pendência de retenção de áudio (L-18), lida pela tela de privacidade. */
export const MENSAGEM_DA_PENDENCIA_DE_GRAVACAO =
  'A gravação está desligada nesta conta, mas há propósito publicado com a configuração antiga. Publique a assistente de novo para o provedor parar de guardar o áudio.'
