// O que quem manda discar lê, e com que status HTTP.
//
// Três famílias, e a separação é o desenho desta função:
//
// 1. **`MotivoLocal`** — o pedido não vira discagem, e nada foi tocado: falta
//    conta, falta propósito, a sessão não serve, o segredo interno não confere,
//    o propósito não tem publicação. Nenhuma linha em `calls`, nenhuma ida ao
//    provedor.
// 2. **A recusa da guarda** — que não mora aqui. Ela vem de
//    `_shared/discagem/guarda.ts`, já traduzida em mensagem e alternativa
//    (RF-407), e sai com 409. Reescrevê-la aqui daria duas versões da mesma
//    frase, e a segunda envelheceria calada.
// 3. **A recusa do provedor** — que também não mora aqui, e vem de
//    `_shared/provedor/erros.ts`. É a única família que deixa rastro: a linha
//    de `calls` já existe quando o provedor recusa, e continua `queued`.
//
// Registro de interface: direto e declarativo, dizendo o que aconteceu e o que
// fazer em seguida (docs/padrao-de-interface.md seção 4). Nenhuma destas frases
// é fala da Sarah — o que a Sarah diz está em `_shared/speech/`.

/** Recusas do pedido inteiro, antes da guarda e antes do provedor. */
export type MotivoLocal =
  | 'metodo_invalido'
  | 'conta_ausente'
  | 'proposito_invalido'
  | 'fonte_invalida'
  | 'referencia_invalida'
  | 'destino_ausente'
  | 'pulo_invalido'
  | 'pulo_sem_rotina'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'segredo_interno_invalido'
  | 'fonte_de_rotina'
  | 'fonte_de_gente'
  | 'sem_acesso'
  | 'papel_insuficiente'
  | 'conta_desconhecida'
  | 'lead_desconhecido'
  | 'sem_publicacao'
  | 'sem_playbook'
  | 'linha_sem_registro'
  | 'sem_credencial_de_voz'
  | 'voz_bloqueada'
  | 'falha_ao_gravar'
  | 'falha_interna'

export const MENSAGENS: Record<MotivoLocal, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  conta_ausente: 'O pedido veio sem a conta que vai ligar.',
  proposito_invalido:
    'O pedido veio sem um propósito válido. A ligação sai por descoberta, lembrete, resgate ou acompanhamento.',
  fonte_invalida: 'O pedido veio sem uma fonte de discagem conhecida.',
  referencia_invalida:
    'O pedido veio sem a referência que forma a chave desta discagem, ou com ela fora de forma.',
  destino_ausente: 'O pedido veio sem o número a discar e sem o lead de onde tirá-lo.',
  // Passo pulável é lista fechada dos dois lados (`_shared/discagem/guarda.ts`
  // e `guard_dial`). Nome que nenhum dos dois conhece não é ignorado aqui: a
  // campanha que o escrevesse acharia que pulou um passo que continuou valendo.
  pulo_invalido: 'O pedido pediu para pular um passo da guarda que não existe.',
  pulo_sem_rotina:
    'Pular passo da guarda é da rotina que a conta configurou, e não de quem disca da tela.',
  sem_sessao: 'Entre na sua conta para ligar.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo para ligar.',
  // A frase é curta de propósito: quem a lê é servidor, e detalhar o que falhou
  // na conferência do segredo ajudaria só quem está tentando adivinhá-lo.
  segredo_interno_invalido: 'Credencial interna inválida.',
  // As duas travessias de T-04, uma em cada sentido. Elas existem porque o
  // caminho único só vale se cada lado puder discar apenas o que é dele: gente
  // não dispara cadência, e rotina não assina uma discagem manual com o nome de
  // ninguém.
  fonte_de_rotina:
    'Esta fonte de discagem é das rotinas do servidor. Da tela, a ligação sai como discagem manual.',
  fonte_de_gente:
    'A discagem manual é de quem clica, e precisa de sessão. Rotina disca pela própria fonte.',
  sem_acesso: 'Você não tem acesso a esta conta.',
  papel_insuficiente:
    'Ligar é trabalho de quem opera o funil. Peça a quem administra a conta o papel de operador.',
  conta_desconhecida: 'Esta conta não existe.',
  lead_desconhecido: 'Este lead não existe nesta conta.',
  // A ordem importa e a frase a diz: sem agente publicado não há o que atender
  // do outro lado, e discar assim mesmo daria uma ligação muda.
  sem_publicacao:
    'A assistente ainda não foi publicada para este propósito. Publique o agente antes de ligar.',
  sem_playbook:
    'Este propósito ainda não tem roteiro publicado. Publique uma versão do roteiro antes de ligar.',
  linha_sem_registro:
    'A linha telefônica escolhida ainda não está registrada no provedor de voz. Registre o número em Números antes de ligar.',
  sem_credencial_de_voz:
    'Falta a chave do provedor de voz desta conta. Cadastre a chave em Integrações para a assistente ligar.',
  voz_bloqueada:
    'Existe uma chave do provedor de voz da plataforma, mas esta conta precisa usar a própria. Cadastre a chave desta conta em Integrações.',
  falha_ao_gravar: 'Não foi possível registrar a ligação agora. Tente de novo em alguns minutos.',
  falha_interna: 'Não foi possível ligar agora. Tente de novo em alguns minutos.',
}

export const STATUS: Record<MotivoLocal, number> = {
  metodo_invalido: 405,
  conta_ausente: 400,
  proposito_invalido: 400,
  fonte_invalida: 400,
  referencia_invalida: 400,
  destino_ausente: 400,
  pulo_invalido: 400,
  pulo_sem_rotina: 403,
  sem_sessao: 401,
  sessao_invalida: 401,
  segredo_interno_invalido: 401,
  fonte_de_rotina: 403,
  fonte_de_gente: 403,
  // 403 e não 404: dizer "não existe" para uma conta que existe não protege
  // ninguém de quem já tem o identificador, e a frase precisa ser verdadeira.
  sem_acesso: 403,
  papel_insuficiente: 403,
  conta_desconhecida: 404,
  lead_desconhecido: 404,
  // 409 e não 400: o pedido está certo, o que falta é configuração da conta.
  sem_publicacao: 409,
  sem_playbook: 409,
  linha_sem_registro: 409,
  sem_credencial_de_voz: 409,
  voz_bloqueada: 409,
  falha_ao_gravar: 500,
  falha_interna: 500,
}

/**
 * O status da recusa da guarda. 409 para todas, e não 403: a política da conta
 * não recusa *quem* pediu, recusa *agora* — freio puxado, janela fechada, teto
 * do dia. A alternativa que sai junto diz o que muda isso.
 */
export const STATUS_DA_GUARDA = 409

/**
 * O que a recusa do provedor vira em status HTTP. `502` quando ele respondeu e
 * recusou, `503` quando ele não respondeu: a primeira pede que alguém confira a
 * configuração, a segunda pede só que se tente de novo.
 */
export const STATUS_DA_FALHA_DO_PROVEDOR = { recusou: 502, indisponivel: 503 } as const

/**
 * O desfecho de uma discagem aceita.
 *
 * `ja_existia` é sucesso, e é a razão de a lista ter dois valores em vez de um
 * (T-07). Quem clica duas vezes no botão manda a mesma chave de idempotência
 * nas duas vezes; a segunda não disca, não gasta crédito e devolve a mesma
 * chamada. Tratar isso como erro faria a tela mostrar falha para uma ligação
 * que está acontecendo.
 */
export type EstadoDaDiscagem = 'discando' | 'ja_existia'

export const MENSAGENS_DO_ESTADO: Record<EstadoDaDiscagem, string> = {
  discando: 'A ligação foi para a linha e está discando.',
  ja_existia: 'Esta ligação já tinha sido pedida. Nenhuma ligação nova saiu.',
}
