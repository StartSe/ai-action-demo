// Os literais da lista de bloqueio (`/config/bloqueios`).
//
// A recusa do telefone é `RECUSA_DO_TELEFONE`, a mesma da lista de leads, do
// cadastro e da importação: frase que aparece em quatro telas não pode ter
// quatro versões.
//
// Registro direto e declarativo (docs/padrao-de-interface.md seção 4): a tela
// diz o que a lista faz com a discagem e o que acabou de acontecer, sem
// travessão e sem fecho de efeito.

import type { MotivoDeRecusa } from '@compartilhado/telefone.ts'

import type {
  EstadoDoBloqueio,
  MotivoDeFalhaDosBloqueios,
  OrigemDoBloqueio,
} from '@/bloqueios/tipos'
import { RECUSA_DO_TELEFONE } from '@/copy/leads'

/**
 * A origem com rótulo em português. `wrong_number` tem rótulo próprio porque é
 * o bloqueio que o interlocutor não pediu: a Sarah falou com a pessoa errada, e
 * a operação precisa distinguir isso de um pedido de não perturbe.
 */
export const ORIGEM_DO_BLOQUEIO: Record<OrigemDoBloqueio, string> = {
  manual: 'Incluído na tela',
  import: 'Importado de lista',
  lead_request: 'Pedido na ligação',
  wrong_number: 'Número errado, marcado na ligação',
}

export const ESTADO_DO_BLOQUEIO: Record<EstadoDoBloqueio, string> = {
  ativo: 'Ativos',
  removido: 'Removidos',
}

function plural(quantidade: number, singular: string, varios: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : varios}`
}

export const bloqueios = {
  titulo: 'Bloqueios',
  explicacao:
    'Os números para os quais a assistente não liga. Cada bloqueio tem motivo e origem, e a remoção fica registrada.',

  efeito:
    'Número na lista é recusado pela guarda de discagem antes de qualquer consumo de crédito. Vale para a próxima discagem, sem publicar nada.',

  carregando: 'Carregando a lista de bloqueio.',

  falhas: {
    'sem-permissao':
      'Seu papel não permite mudar a lista de bloqueio. Quem opera a conta pode fazer isso.',
    'sem-conta':
      'Seu usuário não pertence a nenhuma conta. Peça um convite a quem administra.',
    'ja-bloqueado': 'Este número já está bloqueado. Confira a lista de ativos.',
    'valor-recusado':
      'O servidor recusou o que foi escrito. Confira o número e o motivo.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Confira a conexão e tente de novo.',
  } satisfies Record<MotivoDeFalhaDosBloqueios, string>,

  leitura: {
    aviso:
      'Você vê a lista em leitura. Incluir, importar e remover números é trabalho de quem opera a conta.',
  },

  filtros: {
    estado: 'Estado',
    origem: 'Origem',
    todas: 'Todas as origens',
    limpar: 'Limpar filtros',
  },

  vazio: {
    titulo: 'Nenhum número bloqueado',
    explicacao:
      'A lista está vazia. Quando alguém pedir para não receber ligação, o número entra aqui, pela tela, por importação ou pela própria assistente na ligação.',
  },

  semResultado: {
    titulo: 'Nenhum bloqueio neste recorte',
    explicacao: 'Troque o estado ou a origem para ver outros bloqueios.',
  },

  tabela: {
    rotulo: 'Lista de bloqueio',
    numero: 'Número',
    motivo: 'Motivo',
    origem: 'Origem',
    incluidoPor: 'Quem incluiu',
    incluidoEm: 'Quando',
    removidoEm: 'Removido em',
    removidoPor: 'Quem removeu',
    motivoDaRemocao: 'Motivo da remoção',
    acao: 'Ação',
    remover: 'Remover',
    removerRotulo: (e164: string) => `Remover o bloqueio de ${e164}`,
    /** Bloqueio sem autor nasce no servidor, durante a ligação. */
    sarah: 'A assistente, na ligação',
    exMembro: 'Pessoa que saiu da conta',
  },

  incluir: {
    abrir: 'Incluir número',
    titulo: 'Incluir número',
    apoio:
      'O número é gravado no formato internacional, qualquer que seja a forma digitada.',
    numero: 'Número',
    numeroExemplo: '(48) 99999-8888',
    motivo: 'Motivo',
    motivoExemplo: 'Pediu por e-mail para não receber ligação',
    gravar: 'Bloquear número',
    gravando: 'Bloqueando',
    cancelar: 'Cancelar',
    feito: (e164: string) => `${e164} bloqueado. A próxima discagem para ele é recusada.`,
    recusas: {
      numero: RECUSA_DO_TELEFONE satisfies Record<MotivoDeRecusa, string>,
      motivo: 'Escreva o motivo. É o que a lista mostra quando perguntarem por quê.',
    },
  },

  importar: {
    abrir: 'Importar lista',
    titulo: 'Importar lista',
    apoio:
      'Cole um número por linha ou escolha um arquivo CSV ou de texto. Vale a primeira coluna, e a primeira linha sem número é tratada como cabeçalho.',
    lista: 'Números',
    listaExemplo: '(48) 99999-8888',
    arquivo: 'Arquivo da lista',
    motivo: 'Motivo',
    motivoExemplo: 'Lista de não perturbe enviada pelo jurídico',
    motivoApoio: 'O mesmo motivo vale para todos os números importados.',
    prever: 'Conferir a lista',
    conferindo: 'Conferindo',
    cancelar: 'Cancelar',
    listaVazia: 'Cole ao menos um número ou escolha um arquivo.',
    semMotivo: 'Escreva o motivo da importação.',
    linhasDemais: (teto: number) =>
      `A lista passa de ${teto.toLocaleString('pt-BR')} linhas. Divida em partes.`,
    previa: {
      titulo: 'Prévia da importação',
      apoio: 'Nada foi gravado. Confira os números e confirme.',
      lidas: (quantidade: number) => plural(quantidade, 'linha lida', 'linhas lidas'),
      validos: (quantidade: number) =>
        plural(quantidade, 'número entra na lista', 'números entram na lista'),
      invalidos: (quantidade: number) =>
        plural(quantidade, 'linha não é número válido', 'linhas não são número válido'),
      jaBloqueados: (quantidade: number) =>
        plural(quantidade, 'número já está bloqueado', 'números já estão bloqueados'),
      repetidos: (quantidade: number) =>
        plural(
          quantidade,
          'linha repete um número da própria lista',
          'linhas repetem um número da própria lista',
        ),
      rotuloDosInvalidos: 'Linhas recusadas',
      linha: (linha: number) => `Linha ${linha}`,
      rotuloDosJaBloqueados: 'Já bloqueados',
      confirmar: (quantidade: number) =>
        quantidade === 1 ? 'Bloquear 1 número' : `Bloquear ${quantidade} números`,
      gravando: 'Bloqueando',
      nadaAGravar: 'Nenhum número novo para bloquear.',
      voltar: 'Voltar à lista',
    },
    feito: (gravados: number) =>
      gravados === 1
        ? '1 número importado para a lista de bloqueio.'
        : `${gravados} números importados para a lista de bloqueio.`,
  },

  remover: {
    titulo: 'Remover o bloqueio',
    explicacao: (e164: string) =>
      `${e164} volta a poder receber ligação da assistente. O bloqueio continua na lista de removidos, com quem removeu e o motivo.`,
    motivo: 'Motivo da remoção',
    motivoExemplo: 'O cliente pediu para voltar a ser contatado',
    confirmar: 'Remover o bloqueio',
    removendo: 'Removendo',
    cancelar: 'Cancelar',
    semMotivo: 'Escreva o motivo. Devolver um número à discagem precisa de justificativa.',
    feito: (e164: string) => `Bloqueio de ${e164} removido.`,
  },
} as const
