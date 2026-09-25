// O painel (`/`) lê `dashboard_summary` e desenha o período.
//
// **A MÉTRICA NORTE CONTA SÓ O QUE TEM DESFECHO.** Reunião realizada é a que
// alguém marcou como realizada em Reuniões (RF-512); a que passou sem
// desfecho aparece ao lado, como pendência, e nunca é somada nem vira falta
// (RF-516). Com menos de 70% das reuniões do período apuradas, o cartão avisa
// que o número pode estar abaixo do real (RF-518).
//
// Instalação que ainda não recebeu a migração 20261013100000 devolve
// `indisponivel_nesta_fase` nos campos de reunião; a frase disso é de cliente,
// sem falar de etapa de construção.
//
// Quem decide o estado de cada cartão é `app/src/painel/cartoes.ts`; aqui
// ficam só as frases.

import type { CartaoDeLigacoes, CartaoDeReuniao, Periodo } from '@/painel/cartoes'
import type { MotivoDeFalhaDoPainel } from '@/painel/tipos'

const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

function contagem(quantidade: number, singular: string, plural: string): string {
  return `${inteiro.format(quantidade)} ${quantidade === 1 ? singular : plural}`
}

export const painel = {
  indoParaOTutorial: 'Abrindo a configuração de onde você parou.',
  titulo: 'Painel',

  periodo: {
    rotulo: 'Período',
    opcoes: {
      hoje: 'Hoje',
      'sete-dias': 'Últimos 7 dias',
      'trinta-dias': 'Últimos 30 dias',
      mes: 'Este mês',
    } satisfies Record<Periodo, string>,
  },

  carregando: 'Carregando os números do período.',
  falhas: {
    'sem-conta': 'Esta sessão não pertence a nenhuma conta. Peça um convite ao dono da conta.',
    'sem-permissao': 'Sua sessão não tem acesso ao painel desta conta. Entre de novo.',
    'falha-de-comunicacao':
      'Os números do período não chegaram. Confira a conexão e recarregue a página.',
  } satisfies Record<MotivoDeFalhaDoPainel, string>,

  vazio: {
    titulo: 'Nenhuma ligação neste período',
    explicacao:
      'Os números aparecem depois da primeira ligação. O discador, acima, liga para os números de teste da conta.',
    acao: 'Ir para o discador',
  },

  norte: {
    rotulo: 'Métrica norte',
    titulo: 'Reuniões realizadas',
    apoio: 'A reunião que aconteceu de fato, com o desfecho marcado em Reuniões.',
    semApuracao: (quantidade: number): string =>
      quantidade === 1
        ? '1 reunião do período já passou e está sem desfecho. Marque em Reuniões para ela contar aqui.'
        : `${inteiro.format(quantidade)} reuniões do período já passaram e estão sem desfecho. Marque em Reuniões para elas contarem aqui.`,
    degradada:
      'Menos de 70% das reuniões do período têm desfecho marcado. O número pode estar abaixo do real.',
  },

  indisponivel: {
    selo: 'Ainda não aparece',
    // A mesma frase para toda fatia que a instalação antiga citar.
    explicacao: 'Este número aparece depois que a instalação receber a atualização mais recente.',
  },

  ligacoes: {
    titulo: 'Ligações',
    cartoes: {
      total: 'Ligações',
      atendidas: 'Atendidas',
      taxaDeAtendimento: 'Taxa de atendimento',
      duracaoMedia: 'Duração média',
    } satisfies Record<CartaoDeLigacoes, string>,
    semBase: {
      total: 'Nenhuma ligação no período.',
      atendidas: 'Nenhuma ligação no período.',
      taxaDeAtendimento: 'Sem ligação no período para calcular a taxa.',
      duracaoMedia: 'Nenhuma ligação atendida no período.',
    } satisfies Record<CartaoDeLigacoes, string>,
    apoioDaDuracao: 'Das ligações atendidas.',
  },

  qualidade: {
    titulo: 'Qualidade das conversas',
    nota: 'Nota média da avaliação',
    notaDe: 'de 10',
    avaliadas: (quantidade: number) =>
      contagem(quantidade, 'chamada avaliada', 'chamadas avaliadas'),
    notaSemBase: 'Nenhuma chamada avaliada no período.',
    sentimento: 'Sentimento das chamadas',
    faixas: {
      positivo: 'Positivo',
      neutro: 'Neutro',
      negativo: 'Negativo',
      semSentimento: 'Sem leitura',
    },
    apoioDoSentimento: 'Negativo é o que a fila de exceções também chama de negativo.',
  },

  funil: {
    titulo: 'Funil do período',
    apoio: 'Leads que chegaram a cada etapa no período.',
    etapa: 'Etapa',
    entraram: 'Entraram',
    passagem: 'Passagem',
    semPassagem: 'Não se aplica',
    semEtapa: 'O funil desta conta ainda não tem etapas.',
  },

  custo: {
    titulo: 'Custo do período',
    apoio: 'Cada moeda somada à parte. O provedor de voz cobra em dólar.',
    componente: 'Componente',
    valor: 'Valor',
    total: (moeda: string) => `Total em ${moeda}`,
    componentes: {
      telephony: 'Telefonia',
      voice: 'Voz',
      model: 'Modelo',
      infra: 'Infraestrutura',
    } as Partial<Record<string, string>>,
    semCusto: 'Nenhum preço chegou para as ligações do período.',
  },

  reunioes: {
    titulo: 'Reuniões',
    apoio: 'Realizadas e faltas contam só as reuniões com desfecho marcado. Próximas reuniões contam a partir de agora.',
    cartoes: {
      marcadas: 'Reuniões marcadas',
      confirmadas: 'Reuniões confirmadas',
      faltas: 'Faltas',
      taxaDeComparecimento: 'Taxa de comparecimento',
      semApuracao: 'Sem desfecho marcado',
      proximasReunioes: 'Próximas reuniões',
      taxaDeApuracao: 'Taxa de apuração',
    } satisfies Record<CartaoDeReuniao, string>,
    semBase: 'Sem dado no período.',
    semBaseDoCartao: {
      taxaDeComparecimento: 'Nenhuma reunião do período com desfecho marcado.',
      taxaDeApuracao: 'Nenhuma reunião do período passou do horário.',
    } as Partial<Record<CartaoDeReuniao, string>>,
    custo: {
      rotulo: 'Custo por reunião realizada',
      semBase: 'Nenhuma reunião realizada no período, ou as ligações dela ainda sem preço.',
      apoio: 'Ligações do lead até a reunião, cada moeda à parte.',
    },
  },
} as const
