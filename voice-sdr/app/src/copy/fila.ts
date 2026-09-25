// Os literais da fila de exceções (`/fila`, Precisam de você).
//
// Registro direto e declarativo (docs/padrao-de-interface.md seção 4): a tela
// diz o que a Sarah deixou para o time e o que acabou de acontecer, sem
// travessão e sem fecho de efeito. A pendência de configuração que
// tool-transfer grava no `context` como código vira frase aqui: a conversa não
// a ouve, e quem opera precisa dela.
//
// O limiar que criou o item vira frase (RF-908): é ela que diz por que o item
// está ali. Os números chegam formatados de quem chama; aqui só a frase.

import type {
  ChaveDoLimiar,
  CodigoDaResolucao,
  ContextoDoItem,
  EstadoDaFila,
  MotivoDeFalhaDaFila,
  Severidade,
  TipoDoItem,
} from '@/fila/tipos'

export const TIPO_DO_ITEM: Record<TipoDoItem, string> = {
  pedido_humano: 'Pedido de humano',
  pedido_bloqueio: 'Pedido de bloqueio',
  sentimento_negativo: 'Sentimento negativo',
  falha_repetida: 'Falha repetida',
  reuniao_sem_especialista: 'Reunião sem especialista',
  avaliacao_reprovada: 'Avaliação reprovada',
  credito_baixo: 'Crédito baixo',
  classificacao_pendente: 'Classificação pendente',
}

const MOTIVO_DA_PENDENCIA: Record<NonNullable<ContextoDoItem['motivo']>, string> = {
  modelo_indisponivel:
    'O modelo de classificação não respondeu. A etapa e a temperatura ficaram sem registro; corrija na ficha da chamada.',
  resposta_ilegivel:
    'O modelo respondeu fora do formato. A etapa e a temperatura ficaram sem registro; corrija na ficha da chamada.',
  // Os três da conversa de WhatsApp em que a assistente calou.
  modelo_nao_conectado:
    'A assistente não respondeu no WhatsApp porque nenhum modelo está conectado. Conecte o modelo em Integrações ou responda à mão.',
  falha_da_assistente: 'A assistente não conseguiu responder no WhatsApp. Responda à mão pela conversa.',
  assistente_nao_publicada:
    'A assistente não respondeu no WhatsApp porque ainda não foi publicada. Publique a assistente para ela responder nos dois canais.',
}

const ANTERIOR_AOS_LIMIARES = 'Aberto antes de a conta ter limiares próprios.'
const PEDIDO_NA_CONVERSA = 'Não nasce de limiar: a assistente abriu este item na conversa, a pedido do lead.'

/** A origem do item que não nasce de limiar. */
const SEM_LIMIAR: Record<TipoDoItem, string> = {
  pedido_humano: PEDIDO_NA_CONVERSA,
  pedido_bloqueio: PEDIDO_NA_CONVERSA,
  classificacao_pendente: 'Não nasce de limiar: o modelo não classificou a chamada.',
  sentimento_negativo: ANTERIOR_AOS_LIMIARES,
  falha_repetida: ANTERIOR_AOS_LIMIARES,
  reuniao_sem_especialista: ANTERIOR_AOS_LIMIARES,
  avaliacao_reprovada: ANTERIOR_AOS_LIMIARES,
  credito_baixo: ANTERIOR_AOS_LIMIARES,
}

function plural(quantidade: number, um: string, varios: string): string {
  return `${quantidade} ${quantidade === 1 ? um : varios}`
}

export const SEVERIDADE_DO_ITEM: Record<Severidade, string> = {
  alta: 'Severidade alta',
  media: 'Severidade média',
  baixa: 'Severidade baixa',
}

export const ESTADO_DA_FILA: Record<EstadoDaFila, string> = {
  aberto: 'Abertos',
  resolvido: 'Resolvidos',
}

const PENDENCIA: Record<NonNullable<ContextoDoItem['pendencia']>, string> = {
  destino_ausente:
    'A conta não tem destino de transferência. Configure um em Identidade para a assistente transferir na hora.',
  destino_invalido:
    'O destino de transferência configurado não é um telefone válido. Corrija em Identidade.',
}

const ORIGEM: Record<NonNullable<ContextoDoItem['origem']>, string> = {
  lead_request: 'O lead pediu para não receber mais ligação. O número já foi bloqueado.',
  wrong_number: 'A pessoa disse que o número não é do lead. O número já foi bloqueado.',
}

export const fila = {
  titulo: 'Precisam de você',
  explicacao:
    'O que a assistente não resolve sozinha fica aqui, com o recorte da conversa. Resolver registra quem resolveu e quando.',

  carregando: 'Carregando a fila.',

  falhas: {
    'sem-conta': 'Seu usuário não pertence a nenhuma conta. Peça um convite a quem administra.',
    'sem-permissao': 'Seu usuário não tem acesso à fila desta conta.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Confira a conexão e tente de novo.',
  } satisfies Record<MotivoDeFalhaDaFila, string>,

  leitura: {
    aviso:
      'Você vê a fila em leitura. Resolver itens é trabalho de quem opera a conta.',
  },

  filtro: 'Estado',

  filtroDeTipo: 'Tipo',
  todosOsTipos: 'Todos os tipos',

  recarga: (segundos: number) =>
    `O tempo real não está disponível agora. A fila é relida a cada ${segundos} segundos.`,

  lista: 'Itens da fila',

  nuncaPreenchida: {
    titulo: 'A assistente ainda não deixou nada para o time',
    explicacao:
      'O que ela não resolver sozinha aparece aqui, sem recarregar a tela: pedido de humano, pedido de bloqueio, sentimento negativo, falha repetida, avaliação reprovada e crédito baixo.',
  },

  semDoTipo: {
    titulo: (tipo: TipoDoItem) => `Nenhum item de ${TIPO_DO_ITEM[tipo].toLowerCase()}`,
    explicacao: 'Outros tipos podem ter itens neste estado.',
    mostrarTodos: 'Mostrar todos os tipos',
  },

  vazio: {
    titulo: 'A fila está limpa',
    explicacao:
      'Nenhum item espera por você. Quando a assistente não puder resolver sozinha, o item aparece aqui sem recarregar a tela.',
  },

  semResolvidos: {
    titulo: 'Nenhum item resolvido',
    explicacao: 'Os itens resolvidos aparecem aqui, com quem resolveu e quando.',
  },

  item: {
    rotulo: (tipo: TipoDoItem, lead: string) => `${TIPO_DO_ITEM[tipo]} de ${lead}`,
    semLead: 'Lead removido',
    semNome: 'Lead sem nome',
    recorte: 'Recorte da conversa',
    semRecorte: 'A conversa não deixou recorte para este item.',
    urgente: 'Pediu com urgência.',
    pendencia: (pendencia: NonNullable<ContextoDoItem['pendencia']>) => PENDENCIA[pendencia],
    origem: (origem: NonNullable<ContextoDoItem['origem']>) => ORIGEM[origem],
    tentativas: (quantidade: number, telefone: string | null) =>
      `${quantidade} ${quantidade === 1 ? 'tentativa seguida' : 'tentativas seguidas'} sem ninguém atender${telefone ? ` no ${telefone}` : ''}.`,
    abrirChamada: 'Abrir a chamada',
    semGravacao: 'Esta chamada não tem gravação.',
    expurgada: 'A gravação desta chamada já foi expurgada pelo prazo de retenção.',
    resolvidoPor: (nome: string, instante: string) => `Resolvido por ${nome} em ${instante}.`,
    exMembro: 'alguém que saiu da equipe',
    criterios: (chaves: readonly string[]) => `Critérios reprovados: ${chaves.join(', ')}.`,
    pendenciaDaClassificacao: (motivo: NonNullable<ContextoDoItem['motivo']>) =>
      MOTIVO_DA_PENDENCIA[motivo],
    semLimiar: (tipo: TipoDoItem) => SEM_LIMIAR[tipo],
  },

  limiar: {
    titulo: 'Por que está aqui',
    sentiment_floor: (piso: string, conversa: string | null) =>
      `Entrou pelo piso de sentimento da conta, ${piso}.${conversa ? ` Esta conversa ficou em ${conversa}.` : ''}`,
    failed_criteria_cap: (limite: number, reprovados: number) =>
      `Entrou pelo limite de ${plural(limite, 'critério reprovado', 'critérios reprovados')}.${reprovados > 0 ? ` Esta chamada reprovou ${reprovados}.` : ''}`,
    consecutive_failures_cap: (limite: number) =>
      `Entrou pelo limite de ${plural(limite, 'tentativa seguida', 'tentativas seguidas')} sem atender.`,
    credit_alert_cents: (limite: string, saldo: string | null, provedor: string | null) =>
      `Entrou pelo aviso de crédito da conta, abaixo de ${limite}.${saldo ? ` O saldo lido${provedor ? ` em ${provedor}` : ''} foi ${saldo}.` : ''}`,
  } satisfies Record<ChaveDoLimiar, unknown> & { titulo: string },

  acao: {
    ligar: (lead: string) => `Ligar para ${lead}`,
    confirmarBloqueio: 'Confirmar o bloqueio',
    confirmando: 'Confirmando',
    /** A resolução gravada quando o bloqueio é confirmado. */
    textoDoBloqueio: 'Bloqueio confirmado na fila.',
    bloqueioConfirmado: 'Bloqueio confirmado. O número segue fora das ligações e o item saiu da lista.',
    abrirChamada: 'Abrir a ficha da chamada',
    abrirAvaliacao: 'Abrir a avaliação da chamada',
    abrirLead: 'Abrir o lead',
    abrirIntegracoes: 'Abrir as integrações',
    semPermissaoDeBloqueio:
      'Seu papel não permite bloquear números. O item continua aberto; quem opera a conta pode confirmar.',
  },

  resolver: {
    campo: 'Resolução',
    exemplo: 'Opcional',
    sugestao: 'Liguei de volta e marquei para quinta.',
    botao: 'Resolver',
    enviando: 'Resolvendo',
    rotulo: (item: string) => `Resolver ${item}`,
    /** Vai ao banco quando o campo fica em branco: a resolução exige texto. */
    padrao: 'Resolvido na fila, sem observação.',
    feito: 'Item resolvido. Ele saiu da lista de abertos.',
  },

  codigos: {
    jaResolvido: (nome: string, instante: string) =>
      `Outra pessoa resolveu este item enquanto a tela estava aberta: ${nome}, em ${instante}. A resolução dela foi mantida.`,
    jaResolvidoSemAutor:
      'Outra pessoa resolveu este item enquanto a tela estava aberta. A resolução dela foi mantida.',
    sem_permissao: 'Seu papel não permite resolver itens da fila. Quem opera a conta pode fazer isso.',
    inexistente: 'Este item não existe mais nesta conta. A lista foi atualizada.',
    resolucao_vazia: 'O servidor recusou a resolução em branco. Escreva o que foi feito.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. O item continua aberto; tente de novo.',
  } satisfies Record<Exclude<CodigoDaResolucao, 'resolvido' | 'ja_resolvido'>, string> & {
    jaResolvido: unknown
    jaResolvidoSemAutor: string
  },
}
