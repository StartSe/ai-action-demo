// O que quem registra o número lê, e com que status HTTP.
//
// Duas famílias, e a separação é a desta função: o pedido pode ser recusado
// antes de qualquer provedor ser tocado (`MotivoLocal`), e o registro pode não
// concluir por causa do provedor (`MotivoDoRegistro`). Frase de provedor não
// está aqui — ela vem de `_shared/provedor/erros.ts`, que é onde o código bruto
// morre.
//
// Registro de interface: direto e declarativo, dizendo o que aconteceu e o que
// fazer em seguida (docs/padrao-de-interface.md seção 4). Nenhuma destas frases
// é fala da Sarah; as falas desta fatia estão em
// `_shared/speech/atendimento-recebido.ts`.

/** Recusas do pedido inteiro, antes de o provedor ser chamado. */
export type MotivoLocal =
  | 'metodo_invalido'
  | 'conta_ausente'
  | 'linha_ausente'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'sem_acesso'
  | 'papel_insuficiente'
  | 'linha_desconhecida'
  | 'numero_nao_encontrado'
  | 'sem_credencial_de_telefonia'
  | 'telefonia_bloqueada'
  | 'sem_credencial_de_voz'
  | 'voz_bloqueada'
  | 'sem_publicacao'
  | 'falha_ao_gravar'
  | 'falha_interna'

export const MENSAGENS: Record<MotivoLocal, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  conta_ausente: 'O pedido veio sem a conta cuja linha seria registrada.',
  linha_ausente: 'O pedido veio sem a linha telefônica a registrar.',
  sem_sessao: 'Entre na sua conta para registrar o número.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo para registrar o número.',
  sem_acesso: 'Você não tem acesso a esta conta.',
  papel_insuficiente:
    'Registrar um número é configuração da conta. Peça a quem administra a conta para fazer o registro.',
  linha_desconhecida: 'Esta linha telefônica não existe nesta conta.',
  // A linha existe aqui e não existe lá: alguém cadastrou o número antes de
  // comprá-lo, ou as chaves apontam para outra conta da telefonia. A frase diz
  // as duas coisas porque as duas acontecem.
  numero_nao_encontrado:
    'Este número não está na conta de telefonia desta conta. Confira o número e as chaves da telefonia em Integrações.',
  sem_credencial_de_telefonia:
    'Faltam as chaves da telefonia desta conta. Cadastre o identificador e o token em Integrações para registrar o número.',
  telefonia_bloqueada:
    'Existem chaves de telefonia da plataforma, mas esta conta precisa usar as próprias. Cadastre as chaves desta conta em Integrações.',
  sem_credencial_de_voz:
    'Falta a chave do provedor de voz desta conta. Cadastre a chave em Integrações para o número atender pela assistente.',
  voz_bloqueada:
    'Existe uma chave do provedor de voz da plataforma, mas esta conta precisa usar a própria. Cadastre a chave desta conta em Integrações.',
  // A ordem importa e a frase a diz: número apontado para um agente que não
  // existe atende e fica mudo. Publicar primeiro é a correção, não um detalhe.
  sem_publicacao:
    'A assistente ainda não foi publicada nesta conta. Publique o agente antes de apontar o número para ela.',
  falha_ao_gravar:
    'O número foi configurado no provedor, mas o registro não foi gravado aqui. Peça o registro de novo em alguns minutos.',
  falha_interna: 'Não foi possível registrar o número agora. Tente de novo em alguns minutos.',
}

export const STATUS: Record<MotivoLocal, number> = {
  metodo_invalido: 405,
  conta_ausente: 400,
  linha_ausente: 400,
  sem_sessao: 401,
  sessao_invalida: 401,
  // 403 e não 404: dizer "não existe" para uma conta que existe não protege
  // ninguém de quem já tem o identificador, e a frase precisa ser verdadeira.
  sem_acesso: 403,
  papel_insuficiente: 403,
  linha_desconhecida: 404,
  numero_nao_encontrado: 404,
  // 409 e não 400: o pedido está certo, o que falta é configuração da conta.
  // A tela manda para Integrações, e um 400 diria que o erro é de quem clicou.
  sem_credencial_de_telefonia: 409,
  telefonia_bloqueada: 409,
  sem_credencial_de_voz: 409,
  voz_bloqueada: 409,
  sem_publicacao: 409,
  falha_ao_gravar: 500,
  falha_interna: 500,
}

/**
 * O desfecho do registro.
 *
 * `aguardando_aprovacao` **é sucesso**, e é a razão de a lista ter quatro
 * valores em vez de dois (P-04). Importar um número no Brasil passa por
 * aprovação da operadora, que leva dias: tratar a espera como erro faria a tela
 * de números mandar tentar de novo todo dia, e o checklist da configuração
 * inicial nunca fecharia esse passo. O estado é normal, e é o que se mostra.
 */
export type EstadoDoRegistro = 'registrado' | 'inalterado' | 'aguardando_aprovacao'

export const MENSAGENS_DO_ESTADO: Record<EstadoDoRegistro, string> = {
  registrado: 'O número está registrado e atende conforme o comportamento escolhido.',
  inalterado: 'O número já estava registrado com este comportamento. Nada mudou no provedor.',
  aguardando_aprovacao:
    'O registro foi aberto e está aguardando aprovação da operadora. Isso leva alguns dias, e não é preciso pedir de novo.',
}

/**
 * O que a recusa do provedor vira em status HTTP. `502` quando ele respondeu e
 * recusou, `503` quando ele não respondeu: a primeira pede que alguém confira a
 * configuração, a segunda pede só que se tente de novo — a mesma distinção que
 * `integrations-status` faz entre `erro` e `indisponivel`.
 */
export const STATUS_DA_FALHA_DO_PROVEDOR = { recusou: 502, indisponivel: 503 } as const
