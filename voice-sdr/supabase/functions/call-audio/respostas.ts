// O que a ficha da chamada lê quando pede o áudio e não recebe, e com que
// status HTTP.
//
// Registro de interface, não fala da Sarah: direto e declarativo
// (docs/padrao-de-interface.md seção 4). A frase da gravação expurgada leva o
// prazo da conta, e por isso é função.
//
// **404 serve a dois casos, de propósito.** Chamada que não existe e chamada de
// outra conta respondem igual, com o mesmo corpo: frase diferente contaria a
// quem sonda identificadores que aquele existe em algum lugar.

/** Por que a URL não saiu. */
export type MotivoDoAudio =
  | 'metodo_invalido'
  | 'sem_sessao'
  | 'sessao_invalida'
  | 'chamada_invalida'
  | 'chamada_desconhecida'
  | 'sem_gravacao'
  | 'gravacao_expurgada'
  | 'armazenamento_indisponivel'
  | 'falha_interna'

export const MENSAGENS: Record<Exclude<MotivoDoAudio, 'gravacao_expurgada'>, string> = {
  metodo_invalido: 'Este endereço aceita apenas POST.',
  sem_sessao: 'Entre na sua conta para ouvir a gravação.',
  sessao_invalida: 'Sua sessão expirou. Entre de novo para ouvir a gravação.',
  chamada_invalida: 'O pedido precisa trazer o identificador da chamada.',
  chamada_desconhecida: 'Chamada não encontrada.',
  sem_gravacao:
    'Esta chamada não tem gravação. A gravação estava desligada, ou a chamada ainda não foi finalizada.',
  armazenamento_indisponivel:
    'O armazenamento das gravações não respondeu. Tente de novo em alguns minutos.',
  falha_interna: 'Não foi possível abrir a gravação agora. Tente de novo em alguns minutos.',
}

/** A frase do expurgo, com o prazo que valia para a conta (RF-807). */
export function mensagemDoExpurgo(retencaoEmDias: number): string {
  const dias = retencaoEmDias === 1 ? '1 dia' : `${retencaoEmDias} dias`
  return `Esta gravação foi expurgada pelo prazo de retenção de ${dias}.`
}

export const STATUS: Record<MotivoDoAudio, number> = {
  metodo_invalido: 405,
  sem_sessao: 401,
  sessao_invalida: 401,
  chamada_invalida: 400,
  chamada_desconhecida: 404,
  sem_gravacao: 404,
  // 410 e não 404: o recurso existiu e não volta. A tela troca o reprodutor
  // pela frase em vez de mostrar um reprodutor quebrado.
  gravacao_expurgada: 410,
  armazenamento_indisponivel: 503,
  falha_interna: 500,
}
