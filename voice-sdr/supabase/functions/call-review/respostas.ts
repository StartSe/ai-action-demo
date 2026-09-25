// O que quem conduz o ciclo de evolução lê quando um passo não acontece, e com
// que status HTTP (US-245).
//
// Registro de interface: direto e declarativo, dizendo o que aconteceu e o que
// fazer em seguida (docs/padrao-de-interface.md seção 4). Quem lê é quem
// administra a conta, na ficha da chamada — nenhuma destas frases é fala da
// Sarah.

/** Por que o passo do ciclo não aconteceu. */
export type MotivoDaRevisao =
  | 'metodo_invalido'
  | 'conta_ausente'
  | 'acao_invalida'
  | 'chamada_ausente'
  | 'chamada_inexistente'
  | 'chamada_em_andamento'
  | 'sem_conversa'
  | 'revisao_ausente'
  | 'revisao_inexistente'
  | 'revisao_encerrada'
  | 'etapa_errada'
  | 'ja_existe_revisao'
  | 'respostas_incompletas'
  | 'mudanca_inexistente'
  | 'questionamento_curto'
  | 'nada_aceito'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'sem_acesso'
  | 'papel_insuficiente'
  | 'modelo_nao_conectado'
  | 'modelo_indisponivel'
  | 'resposta_ilegivel'
  | 'falha_interna'

export const MENSAGENS: Record<MotivoDaRevisao, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  conta_ausente: 'O pedido veio sem a conta da chamada.',
  acao_invalida: 'O pedido veio sem um passo conhecido do ciclo.',
  chamada_ausente: 'O pedido veio sem a chamada a revisar.',
  chamada_inexistente: 'Esta chamada não existe nesta conta.',
  chamada_em_andamento: 'A ligação ainda não terminou. Espere ela fechar para pedir a revisão.',
  // A revisão lê a conversa; sem fala do interlocutor não há conversa para ler,
  // e um questionário sobre o silêncio seria perguntar o que ninguém sabe.
  sem_conversa:
    'Esta ligação não teve conversa: o interlocutor não chegou a falar. Revise uma ligação em que houve diálogo.',
  revisao_ausente: 'O pedido veio sem a revisão.',
  revisao_inexistente: 'Esta revisão não existe nesta conta.',
  revisao_encerrada: 'Esta revisão já foi encerrada. Abra uma nova a partir da ficha da chamada.',
  etapa_errada: 'Este passo não é o próximo do ciclo. Recarregue a ficha para ver onde a revisão está.',
  ja_existe_revisao: 'Já existe uma revisão aberta para esta chamada. Termine ou descarte aquela antes de abrir outra.',
  respostas_incompletas: 'Responda todas as perguntas antes de pedir as sugestões.',
  mudanca_inexistente: 'Esta sugestão não faz parte desta revisão.',
  questionamento_curto: 'Diga o que você quer diferente nesta sugestão, com um pouco mais de detalhe.',
  nada_aceito: 'Nenhuma sugestão foi aceita, então não há o que aplicar. Aceite ao menos uma, ou descarte a revisão.',
  sem_sessao: 'Entre na sua conta para revisar a ligação.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo para continuar a revisão.',
  sem_acesso: 'Você não tem acesso a esta conta.',
  // A frase de quem concede acesso, como em playbook-draft: o ciclo escreve
  // roteiro, e roteiro é configuração.
  papel_insuficiente:
    'Revisar a ligação muda o roteiro da assistente, e isso é tarefa de quem administra a conta. Peça a revisão a quem administra.',
  // Não é falha: é configuração que falta. A frase diz o que fazer, e a
  // recusa carrega o caminho — a tela oferece o botão em vez de mandar a
  // pessoa procurar onde se conecta um provedor de modelo.
  modelo_nao_conectado:
    'Para a assistente ler a conversa e sugerir melhorias, a conta precisa de um provedor de modelo conectado. Conecte em Integrações e volte aqui.',
  modelo_indisponivel: 'Não foi possível ler a conversa agora. Tente de novo em alguns minutos.',
  resposta_ilegivel: 'A leitura da conversa voltou fora do formato esperado e nada foi gravado. Peça de novo.',
  falha_interna: 'Não foi possível continuar a revisão agora. Tente de novo em alguns minutos.',
}

export const STATUS: Record<MotivoDaRevisao, number> = {
  metodo_invalido: 405,
  conta_ausente: 400,
  acao_invalida: 400,
  chamada_ausente: 400,
  chamada_inexistente: 404,
  chamada_em_andamento: 409,
  sem_conversa: 422,
  revisao_ausente: 400,
  revisao_inexistente: 404,
  revisao_encerrada: 409,
  etapa_errada: 409,
  ja_existe_revisao: 409,
  respostas_incompletas: 400,
  mudanca_inexistente: 404,
  questionamento_curto: 400,
  nada_aceito: 400,
  sem_sessao: 401,
  sessao_invalida: 401,
  sem_acesso: 403,
  papel_insuficiente: 403,
  // 428: falta um passo antes deste, e o passo é da conta, não do servidor.
  modelo_nao_conectado: 428,
  modelo_indisponivel: 503,
  // 502: o pedido estava certo, e quem respondeu mal foi o serviço de trás.
  resposta_ilegivel: 502,
  falha_interna: 500,
}

/**
 * Para onde a tela manda quem recebeu a recusa, quando há para onde mandar.
 * Motivo sem caminho não tem entrada aqui: nem toda recusa tem conserto numa
 * tela, e inventar um destino mandaria a pessoa a um lugar que não resolve.
 */
export const CAMINHO_DA_RECUSA: Readonly<Partial<Record<MotivoDaRevisao, string>>> = {
  modelo_nao_conectado: '/config/integracoes',
}

/**
 * A nota da versão que o ciclo grava (`playbook_versions.change_note`). Leva o
 * título da sugestão aceita: meses depois, "por que a Sarah mudou de texto?"
 * começa por saber que a mudança veio da revisão de uma ligação, e de qual.
 */
export function notaDaVersao(titulo: string): string {
  return `Revisão de ligação: ${titulo}`
}
