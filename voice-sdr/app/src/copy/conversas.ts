import type {
  AutorDaMensagem,
  FiltroDeStatus,
  MotivoDaConversa,
  StatusDaConversa,
  StatusDaMensagem,
  TipoDeMidia,
} from '@/whatsapp/tipos'

/** O selo de cada status, na lista e no cabeçalho da conversa aberta. */
export const STATUS_DA_CONVERSA_EM_PORTUGUES: Record<StatusDaConversa, string> = {
  assistente: 'Com a assistente',
  humano: 'Com um atendente',
  encerrada: 'Encerrada',
}

export const FILTRO_DE_STATUS_EM_PORTUGUES: Record<FiltroDeStatus, string> = {
  todas: 'Todas',
  ...STATUS_DA_CONVERSA_EM_PORTUGUES,
}

/** O rótulo genérico no lugar do texto, quando a mensagem é mídia. */
export const TIPO_DE_MIDIA_EM_PORTUGUES: Record<TipoDeMidia, string> = {
  audio: 'Áudio',
  imagem: 'Imagem',
  video: 'Vídeo',
  documento: 'Documento',
  figurinha: 'Figurinha',
  localizacao: 'Localização',
  contato: 'Contato',
  outro: 'Anexo',
}

export const AUTOR_DA_MENSAGEM_EM_PORTUGUES: Record<AutorDaMensagem, string> = {
  lead: 'Lead',
  assistente: 'Assistente',
  humano: 'Atendente',
  sistema: 'Sistema',
}

export const STATUS_DA_MENSAGEM_EM_PORTUGUES: Record<StatusDaMensagem, string> = {
  recebida: 'Recebida',
  enviada: 'Enviada',
  entregue: 'Entregue',
  lida: 'Lida',
  falhou: 'Falhou',
}

export const MOTIVO_DE_FALHA_EM_PORTUGUES = {
  'sem-permissao': 'Você não tem permissão para ver as conversas desta conta.',
  'sem-conta': 'Seu acesso ainda não está ligado a nenhuma conta.',
  'falha-de-comunicacao': 'Não foi possível falar com o servidor. Tente de novo em alguns minutos.',
} as const

export const lista = {
  titulo: 'Conversas',
  explicacao: 'As conversas por WhatsApp, com quem está atendendo cada uma.',
  carregando: 'Carregando as conversas.',
  filtro: 'Status',
  tabela: {
    rotulo: 'Lista de conversas',
    lead: 'Lead',
    telefone: 'Telefone',
    ultimaMensagem: 'Última mensagem',
    status: 'Status',
    quando: 'Quando',
    semLead: 'Sem lead vinculado',
    semMensagem: 'Nenhuma mensagem ainda',
  },
  vazio: {
    titulo: 'Nenhuma conversa ainda',
    explicacao: 'Assim que um lead escrever pelo WhatsApp, ou alguém iniciar pela ficha dele, a conversa aparece aqui.',
  },
  vazioComFiltro: {
    titulo: 'Nenhuma conversa neste status',
    explicacao: 'Troque o filtro para ver as demais conversas.',
  },
}

export const detalhe = {
  titulo: 'Conversa',
  voltar: 'Voltar para as conversas',
  carregando: 'Carregando a conversa.',
  naoEncontrada: {
    titulo: 'Conversa não encontrada',
    explicacao: 'Esta conversa não existe nesta conta. Ela pode ter sido de outra conta ou já ter sido removida.',
    acao: 'Ver as conversas',
  },
  // A tela trata 'nao-encontrada' num estado à parte (`naoEncontrada` acima);
  // esta chave existe só para o tipo fechar, e nunca aparece na tela.
  falhas: { ...MOTIVO_DE_FALHA_EM_PORTUGUES, 'nao-encontrada': '' } satisfies Record<
    MotivoDaConversa,
    string
  >,
  proposito: 'Assunto',
  semProposito: 'Sem assunto registrado',
  mensagens: 'Histórico da conversa',
  semMensagem: 'Nenhuma mensagem nesta conversa ainda.',
  midia: (tipo: TipoDeMidia) => `[${TIPO_DE_MIDIA_EM_PORTUGUES[tipo]}]`,
  /** O rótulo do áudio e da imagem que o modelo leu, acima do texto derivado. */
  midiaLida: { audio: 'Áudio transcrito', imagem: 'Imagem' },
  legenda: (texto: string) => `Legenda: ${texto}`,
  leituraPendente: { audio: 'Transcrevendo o áudio.', imagem: 'Descrevendo a imagem.' },
  leituraFalhou: {
    audio: 'Não foi possível transcrever este áudio.',
    imagem: 'Não foi possível descrever esta imagem.',
  },
  falhouAEnviar: 'Não foi entregue',

  acoes: {
    titulo: 'Ações',
    assumir: 'Assumir a conversa',
    assumindo: 'Assumindo…',
    devolver: 'Devolver para a assistente',
    devolvendo: 'Devolvendo…',
    encerrar: 'Encerrar conversa',
    encerrando: 'Encerrando…',
    cancelar: 'Cancelar',
    confirmarEncerramento: 'Ninguém mais responde por aqui. O lead pode escrever de novo, e uma conversa nova abre com a assistente.',
    soLeitura: 'Seu papel é de leitura. Assumir, devolver, encerrar e responder são de quem opera a conta.',
  },

  campo: {
    rotulo: 'Mensagem',
    exemplo: 'Escreva para o lead',
    enviar: 'Enviar',
    enviando: 'Enviando…',
    encerrada: 'Esta conversa está encerrada. Devolva ou peça para reabrir pelo WhatsApp do lead.',
  },
}
