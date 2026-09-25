// Literais das telas de chamadas: o discador, o acompanhamento ao vivo, o
// freio de emergência, a lista (`/chamadas`) e a ficha da chamada
// (`/chamadas/:id`).
//
// O que a lista NÃO filtra em F2, e por quê:
//
// - **Campanha.** RF-413 pede o filtro, mas `campaigns` só existe na F7. Até
//   lá nenhuma chamada tem campanha, e um seletor sem opção nenhuma seria
//   controle morto.
// - **Especialista.** Mesma razão: `specialists` e a transferência para eles
//   chegam na F5. Nenhum dos dois aparece na tela, nem desabilitado; entram
//   com as fases que dão dado para eles filtrarem.
//
// O que a ficha NÃO mostra em F2, e por quê:
//
// - **Ferramenta sem tradução.** Os nomes das dez ferramentas moram em
//   `copy/ferramentas.ts`, a mesma tabela do ensaio. O que o provedor executar
//   fora dela aparece com o nome cru em vez de sumir com o registro.
// - **Corrigir a classificação à mão** (RF-415). É da F4, com a trilha que a
//   correção exige; nenhum controle dela aparece aqui, nem desabilitado.

import { nomeDaFerramenta } from '@/copy/ferramentas'
import type { PeriodoDaLista, Resultado } from '@/chamadas/consulta'
import type { BloqueioDaTela } from '@/chamadas/discador'
import type {
  ComponenteDeCusto,
  MotivoDeFalhaDaFicha,
  MotivoDeFalhaDaLista,
  MotivoDeFalhaDeChamadas,
  OrdenacaoDeChamadas,
} from '@/chamadas/tipos'
import type { FaixaDoSentimento } from '@/chamadas/ficha'
import type { FaltaNoPortao } from '@compartilhado/discagem/portao.ts'

const FALHAS: Record<MotivoDeFalhaDeChamadas, string> = {
  'sem-permissao': 'Seu acesso a esta conta não permite ver as ligações.',
  'sem-conta': 'Você ainda não pertence a nenhuma conta.',
  'falha-de-comunicacao':
    'Não foi possível falar com o servidor agora. Tente de novo em alguns instantes.',
}

/** O que falta para o portão abrir, dito a quem está com o discador aberto. */
const FALTA_NO_PORTAO: Record<FaltaNoPortao, string> = {
  liberacao_da_fase: 'A discagem para lead real ainda não foi liberada nesta instalação. Fale com quem instalou.',
  primeira_chamada_de_teste:
    'Falta uma ligação de teste desta conta que termine com transcrição.',
}

/**
 * O discador manual (RF-401, RF-407) e o portão da fatia (US-074).
 *
 * A recusa da guarda NÃO é escrita aqui: ela chega pronta de `call-place`, com
 * a frase e a alternativa montadas por `_shared/discagem/guarda.ts`. As duas
 * recusas abaixo são as que a tela dá antes de chamar o servidor.
 */
export const discador = {
  titulo: 'Discador',
  apoio: 'Escolha para quem ligar, o propósito da ligação e a linha de origem.',
  carregando: 'Carregando o discador.',
  falhas: FALHAS,

  destino: 'Para quem ligar',
  proposito: 'Propósito',
  origem: 'Número de origem',
  rodizio: 'Rodízio da conta',
  deTeste: (rotulo: string) => `${rotulo} (número de teste)`,
  discar: 'Ligar',
  discando: 'Ligando',

  portaoFechado: {
    titulo: 'Por enquanto o discador só liga para números de teste',
    explicacao:
      'Até a primeira ligação de teste terminar com a conversa transcrita, toda ligação para número fora da lista de teste é recusada. É a prova de que linha, voz e roteiro funcionam antes do primeiro lead.',
    falta: FALTA_NO_PORTAO,
    cadastrar: 'Cadastrar número de teste',
    telefoneInvalido: 'O telefone deste lead não é um número válido no Brasil. Corrija o cadastro do lead para ligar.',
    leadForaDaLista:
      'Este lead não está na lista de teste. A ligação para ele sai depois da primeira ligação de teste completa.',
  },

  vazio: {
    titulo: 'Nenhum número para ligar',
    explicacao:
      'A conta não tem número de teste cadastrado. Cadastre um em Discagem para fazer a primeira ligação.',
    acao: 'Cadastrar número de teste',
  },

  /** As recusas que a tela dá sem chamar o servidor. */
  bloqueio: {
    freio_puxado: {
      mensagem: 'A discagem desta conta está pausada pelo freio de emergência.',
      alternativa:
        'Nenhuma ligação sai enquanto o freio estiver puxado. Quem administra a conta retoma a discagem pelo aviso no topo da tela.',
    },
    papel_sem_discagem: {
      mensagem: 'Seu papel acompanha as ligações, mas não liga.',
      alternativa: 'Peça a quem administra a conta o papel de operador.',
    },
  } satisfies Record<BloqueioDaTela, { mensagem: string; alternativa: string }>,

  negativa:
    'Você acompanha as ligações desta conta em leitura. Ligar é trabalho de quem opera o funil; seu papel não inclui discar.',

  destinoRotulo: (rotulo: string, telefone: string) => `${rotulo} · ${telefone}`,
  recusaTitulo: 'A ligação não saiu',
  fecharRecusa: 'Entendi',
  semResposta: 'O servidor não respondeu. Nenhuma ligação saiu; tente de novo.',
} as const

/**
 * A estimativa de custo antes de ligar (D-14), no discador e na primeira
 * ligação do tutorial. O número é o que a conta mediu nas últimas ligações;
 * sem ligação medida, a tela não inventa preço.
 */
export const estimativaDeCusto = {
  titulo: 'Estimativa de custo',
  porLigacao: (valores: string, porMinuto: string) =>
    `Cerca de ${valores} por ligação, ou ${porMinuto} por minuto.`,
  base: (ligacoes: number, duracao: string | null) => {
    const quantas = ligacoes === 1 ? 'da última ligação atendida' : `das últimas ${ligacoes} ligações atendidas`
    return duracao
      ? `Média ${quantas} desta conta, com ${duracao} de conversa em média.`
      : `Média ${quantas} desta conta.`
  },
  aviso:
    'É uma estimativa, não uma cotação: voz e linha cobram por minuto, e cada moeda aparece separada. O custo de cada ligação fica na ficha dela, por componente.',
  semAmostra:
    'Ainda não há ligação com custo medido nesta conta, então não há estimativa. Depois da primeira, a ficha mostra quanto ela custou por componente e a estimativa passa a aparecer aqui.',
} as const

/** O acompanhamento das chamadas em curso (RF-416). */
export const aoVivo = {
  titulo: 'Chamadas em andamento',
  apoio: 'Atualiza sozinho enquanto a tela estiver aberta.',
  carregando: 'Conectando ao acompanhamento das chamadas.',
  erro: 'O acompanhamento em tempo real caiu. Recarregue a página para voltar a ver as chamadas em curso.',
  vazio: 'Nenhuma chamada em andamento agora.',
  lista: 'Chamadas em andamento',
  status: {
    queued: 'Na fila',
    ringing: 'Chamando',
    in_progress: 'Em conversa',
  } as Readonly<Record<string, string>>,
  encerrar: 'Encerrar',
  encerrando: 'Encerrando',
  rotuloDoEncerrar: (proposito: string) => `Encerrar a chamada de ${proposito}`,
  duracao: 'Duração',
  semLead: 'Número de teste',
} as const

/** O freio de emergência (RF-011), na casca de toda tela. */
export const freio = {
  acionar: 'Parar toda a discagem',
  soAdmin:
    'O freio de emergência é de quem administra a conta. Parar a operação inteira não é ação de quem só opera.',

  confirmar: {
    titulo: 'Parar toda a discagem desta conta?',
    explicacao:
      'As chamadas em curso são encerradas agora e nenhuma ligação nova sai, nem manual nem automática, até alguém retomar.',
    motivo: 'Motivo',
    motivoApoio: 'Fica registrado junto com o seu nome.',
    acao: 'Parar a discagem',
    cancelar: 'Cancelar',
  },

  pausada: {
    titulo: 'Discagem pausada',
    rotulo: 'Discagem pausada',
    quem: (nome: string | null) => `Pausada por ${nome ?? 'alguém sem nome no perfil'}`,
    quando: (quando: string) => `em ${quando}`,
    motivo: (motivo: string | null) => (motivo ? `Motivo: ${motivo}` : 'Sem motivo registrado.'),
    retomar: 'Retomar a discagem',
    soAdminRetoma: 'Só quem administra a conta retoma a discagem.',
  },

  confirmarRetomada: {
    titulo: 'Retomar a discagem desta conta?',
    explicacao:
      'As ligações voltam a sair, manuais e automáticas. A fila volta a ser consumida no próximo minuto.',
    motivo: 'Motivo',
    acao: 'Retomar a discagem',
    cancelar: 'Cancelar',
  },

  semResposta: 'O servidor não respondeu. Tente de novo em alguns segundos.',
} as const

/** `calls.end_reason` em português, na lista fechada da coluna. */
export const MOTIVO_DO_FIM = {
  completed: 'Encerrada normalmente',
  voicemail: 'Caixa postal',
  max_duration: 'Duração máxima atingida',
  dial_lost: 'Perdida na discagem',
  provider_lost: 'Provedor caiu',
  canceled: 'Cancelada',
  no_answer: 'Não atendeu',
  busy: 'Ocupado',
  invalid_number: 'Número inválido',
  transferred: 'Transferida',
} satisfies Record<Resultado, string>

const FALHAS_DA_FICHA: Record<MotivoDeFalhaDaFicha, string> = {
  ...FALHAS,
  'nao-encontrada': 'Chamada não encontrada nesta conta.',
}

/** A ficha da chamada (RF-414). */
export const ficha = {
  titulo: 'Chamada',
  apoio: 'Gravação, transcrição, custo e resultado desta ligação.',
  carregando: 'Carregando a ficha da chamada.',
  falhas: FALHAS_DA_FICHA,
  naoEncontrada: {
    titulo: 'Chamada não encontrada',
    explicacao:
      'O endereço não corresponde a nenhuma chamada desta conta. Volte ao painel para ver as ligações recentes.',
    acao: 'Ir para o painel',
  },
  voltar: 'Voltar ao painel',

  cabecalho: (proposito: string, quem: string) => `${proposito} com ${quem}`,
  semLead: 'número sem cadastro',
  direcao: {
    outbound: 'Ligação feita',
    inbound: 'Ligação recebida',
    rehearsal: 'Ensaio',
  } as Readonly<Record<string, string>>,
  emAndamento: 'Em andamento',

  resumo: 'Resumo',
  duracao: 'Duração',
  semDuracao: 'Sem duração medida',
  resultado: 'Resultado',
  semResultado: 'Ainda sem resultado',
  atendidaPor: 'Quem atendeu',
  atendentes: {
    human: 'Uma pessoa',
    machine: 'Caixa postal',
    unknown: 'Não identificado',
  } as Readonly<Record<string, string>>,
  inicio: 'Início',
  origem: 'Número de origem',
  destino: 'Número de destino',

  custo: {
    titulo: 'Custo',
    total: 'Custo total',
    aguardandoPreco: 'aguardando preço',
    parcial: (faltam: number) =>
      faltam === 1
        ? 'Parcial: falta o preço de um componente.'
        : `Parcial: falta o preço de ${faltam} componentes.`,
    semCusto: 'Nenhum preço chegou ainda.',
    componentes: {
      telephony: 'Telefonia',
      voice: 'Voz',
      model: 'Modelo',
      infra: 'Infraestrutura',
    } satisfies Record<ComponenteDeCusto, string>,
    explicacao:
      'A telefonia é cobrada pela operadora e o preço chega alguns minutos depois do fim da ligação.',
  },

  gravacao: {
    titulo: 'Gravação',
    ouvir: 'Ouvir a gravação',
    abrindo: 'Abrindo a gravação',
    reprodutor: 'Gravação da chamada',
    expurgada: (data: string) =>
      `Gravação expurgada em ${data}, pelo prazo de retenção da conta.`,
    semGravacao:
      'Esta chamada não tem gravação. A gravação estava desligada, ou a chamada ainda não foi finalizada.',
    enderecoVencido: 'O endereço da gravação venceu. Toque em ouvir para abrir de novo.',
    semResposta: 'O servidor não respondeu. Tente abrir a gravação de novo.',
  },

  aviso: {
    titulo: 'Aviso de gravação',
    /** O instante vai entre as duas metades, na classe `.val`. */
    dadoAntes: 'Dado aos ',
    dadoDepois: ' da conversa.',
    naoLocalizado: 'Não localizado na transcrição.',
  },

  transcricao: {
    titulo: 'Transcrição',
    lista: 'Transcrição da chamada',
    sarah: 'Assistente',
    lead: 'Lead',
    desconhecido: 'Não identificado',
    vazia: 'Sem transcrição: não houve conversa nesta chamada.',
    emAndamento: 'A transcrição aparece quando a chamada terminar.',
  },

  ferramentas: {
    titulo: 'O que a assistente fez',
    nenhuma: 'Nenhuma ação registrada nesta chamada.',
    nome: nomeDaFerramenta,
    falhou: 'falhou',
  },

  classificacao: {
    titulo: 'Classificação',
    processando:
      'A classificação está sendo feita. Duração, custo e transcrição já estão nesta ficha.',
    aguardando: 'Aguardando a classificação.',
    emAndamento: 'A classificação é feita quando a chamada terminar.',
    semConversa: 'Sem conversa, sem classificação.',
    etapa: 'Etapa sugerida',
    resumo: 'Resumo',
    sentimento: 'Sentimento',
    faixas: {
      negativo: 'Negativo',
      neutro: 'Neutro',
      positivo: 'Positivo',
    } satisfies Record<FaixaDoSentimento, string>,
  },

  avaliacao: {
    titulo: 'Avaliação',
    nota: 'Nota',
    semNota: 'Esta chamada ainda não foi avaliada.',
  },
} as const

const FALHAS_DA_LISTA: Record<MotivoDeFalhaDaLista, string> = {
  ...FALHAS,
  'filtro-invalido':
    'O endereço traz um filtro que esta tela não reconhece. Limpe os filtros para ver a lista.',
}

/** A lista de chamadas (RF-413). */
export const lista = {
  titulo: 'Chamadas',
  apoio: 'Todas as ligações da conta, das mais recentes para as mais antigas.',
  carregando: 'Carregando as chamadas.',
  falhas: FALHAS_DA_LISTA,

  filtros: {
    titulo: 'Filtros',
    periodo: 'Período',
    proposito: 'Propósito',
    todosOsPropositos: 'Todos os propósitos',
    resultado: 'Resultado',
    todosOsResultados: 'Todos os resultados',
    numero: 'Número',
    numeroExemplo: 'Ex.: (11) 99999-0001',
    ordenacao: 'Ordenar por',
    limpar: 'Limpar filtros',
  },

  periodos: {
    tudo: 'Todo o histórico',
    '24h': 'Últimas 24 horas',
    '7d': 'Últimos 7 dias',
    '30d': 'Últimos 30 dias',
  } satisfies Record<PeriodoDaLista, string>,

  ordenacoes: {
    instante: 'Mais recentes',
    duracao: 'Mais longas',
    custo: 'Mais caras',
  } satisfies Record<OrdenacaoDeChamadas, string>,

  tabela: {
    rotulo: 'Chamadas da conta',
    colunas: {
      lead: 'Lead',
      numero: 'Número',
      proposito: 'Propósito',
      resultado: 'Resultado',
      duracao: 'Duração',
      custo: 'Custo',
      nota: 'Nota',
      instante: 'Início',
    },
    semLead: 'Número sem cadastro',
    semNumero: 'Sem número',
    semResultado: 'Sem resultado',
    semDuracao: 'Não medida',
    semCusto: 'Aguardando preço',
    semNota: 'Sem nota',
    recebida: 'recebida',
  },

  truncada:
    'Mostrando as chamadas mais recentes deste recorte. Estreite o período ou os filtros para ver o resto.',

  vazio: {
    titulo: 'Nenhuma ligação ainda',
    explicacao:
      'Esta conta ainda não fez nem recebeu ligação. A primeira sai pelo discador do painel.',
    acao: 'Abrir o discador',
  },

  vazioComFiltro: {
    titulo: 'Nenhuma chamada neste recorte',
    explicacao: 'Amplie o período ou limpe os filtros para ver outras ligações.',
  },
} as const
