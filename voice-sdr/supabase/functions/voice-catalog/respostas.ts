// O que quem escolhe a voz lê, e com que status HTTP.
//
// Duas famílias, e a separação é a desta função: o pedido inteiro pode ser
// recusado antes de o provedor ser ouvido (`MotivoLocal`), e a **amostra** pode
// não sair com o catálogo tendo vindo inteiro (`MotivoDaAmostra`). Responder
// "deu errado" nos dois casos esconderia a lista de vozes justamente de quem
// abriu a tela para ver a lista de vozes.
//
// As frases de provedor não estão aqui: elas vêm de `_shared/provedor/erros.ts`,
// que é onde o código bruto morre. Registro de interface — direto e
// declarativo, dizendo o que aconteceu e o que fazer em seguida
// (docs/padrao-de-interface.md seção 4). Nenhuma delas é fala da Sarah.

/** Recusas do pedido inteiro, antes de qualquer voz. */
export type MotivoLocal =
  | 'metodo_invalido'
  | 'conta_ausente'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'sem_acesso'
  | 'falha_interna'

/** Por que a credencial não resolveu. Deixa o catálogo em `nao_configurado`. */
export type MotivoDaAusencia = 'sem_chave' | 'plataforma_bloqueada'

/**
 * Por que não deu para ouvir, com o catálogo tendo vindo.
 *
 * `sem_primeira_fala` é o motivo que esta função existe para dar: a amostra é a
 * abertura real da conta, e sem ela não há o que sintetizar. Devolver uma frase
 * de catálogo no lugar seria audição que não diz nada sobre a ligação (RF-304).
 */
export type MotivoDaAmostra =
  | 'sem_agente'
  | 'sem_primeira_fala'
  | 'voz_desconhecida'
  | 'provedor_recusou'
  | 'provedor_indisponivel'

export const MENSAGENS: Record<MotivoLocal, string> = {
  metodo_invalido: 'Este endereço aceita apenas GET e POST.',
  conta_ausente: 'O pedido veio sem a conta cujas vozes seriam listadas.',
  sem_sessao: 'Entre na sua conta para ouvir as vozes.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo para ouvir as vozes.',
  sem_acesso: 'Você não tem acesso a esta conta.',
  falha_interna: 'Não foi possível listar as vozes agora. Tente de novo em alguns minutos.',
}

export const STATUS: Record<MotivoLocal, number> = {
  metodo_invalido: 405,
  conta_ausente: 400,
  sem_sessao: 401,
  sessao_invalida: 401,
  // 403 e não 404: dizer "não existe" para uma conta que existe não protege
  // ninguém de quem já tem o identificador, e a frase precisa ser verdadeira.
  sem_acesso: 403,
  falha_interna: 500,
}

export const MENSAGENS_DA_AUSENCIA: Record<MotivoDaAusencia, string> = {
  sem_chave:
    'Nenhuma chave cadastrada para o provedor de voz. Cadastre a chave em Integrações para ouvir as vozes.',
  plataforma_bloqueada:
    'Existe uma chave da plataforma, mas esta conta precisa usar a própria. Cadastre a chave desta conta em Integrações.',
}

export const MENSAGENS_DA_AMOSTRA: Record<MotivoDaAmostra, string> = {
  sem_agente:
    'Esta conta ainda não tem uma assistente montada. Configure a identidade dela para ouvir a abertura.',
  // A frase manda escrever a fala em vez de oferecer uma genérica: é a
  // diferença entre ouvir a sua abertura e ouvir uma propaganda do provedor.
  sem_primeira_fala:
    'Escreva a primeira fala da assistente para ouvir como ela vai soar nesta voz. A amostra usa a sua abertura, e não uma frase de catálogo.',
  voz_desconhecida:
    'Esta voz não está mais no catálogo em português do provedor. Escolha uma da lista ao lado.',
  provedor_recusou:
    'O provedor de voz recusou gerar a amostra. Confira a chave em Integrações e tente de novo.',
  provedor_indisponivel:
    'O provedor de voz não respondeu a tempo. A lista continua válida, e a amostra pode ser pedida de novo em alguns minutos.',
}
