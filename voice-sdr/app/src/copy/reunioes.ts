// Literais de `/reunioes`: a agenda da semana por especialista e a lista
// filtrável (US-179, RF-510).
//
// O desfecho (realizada, falta, cancelada) se marca na ficha e na lista
// (US-181), em `desfecho`. A reunião que ninguém apurou aparece como não
// apurada, e nunca como falta (RF-516).
//
// A ficha da reunião (`/reunioes/:id`, US-180) fica em `ficha`, no fim. A
// linha da lista liga para ela pelo nome do lead e para a ficha da chamada em
// que a assistente marcou pela origem.

import type { Modalidade } from '@/especialistas/tipos'
import type { PeriodoDasReunioes, VisaoDasReunioes } from '@/reunioes/consulta'
import type { MarcaDaReuniao } from '@/reunioes/marcas'
import type { EstadoDoConvite, EstadoDoEvento, TipoDoPasso } from '@/reunioes/ficha'
import type { CampoDoResumo } from '@/reunioes/resumo-de-passagem'
import type {
  ApuracaoDaReuniao,
  DesfechoManual,
  EstadoDaReuniao,
  MotivoDeFalhaDaFicha,
  MotivoDeFalhaDasReunioes,
  MotivoDeRecusaDoDesfecho,
} from '@/reunioes/tipos'
import { nomeDoFuso } from '@compartilhado/discagem/janela.ts'

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

function dois(numero: number): string {
  return String(numero).padStart(2, '0')
}

/** O relógio que as funções de horário recebem, lido de `relogioEm`. */
interface Relogio {
  dia: number
  mes: number
  diaDaSemana: number
  hora: number
  minuto: number
}

export const reunioes = {
  titulo: 'Reuniões',
  apoio: 'O que a assistente marcou com os especialistas, na semana ou em lista.',
  carregando: 'Carregando as reuniões…',

  falhas: {
    'sem-permissao': 'Seu acesso a esta conta não permite ver as reuniões.',
    'sem-conta': 'Você ainda não pertence a nenhuma conta.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor agora. Tente de novo em alguns instantes.',
    'filtro-invalido':
      'O endereço traz um filtro que esta tela não reconhece. Limpe os filtros para ver as reuniões.',
  } satisfies Record<MotivoDeFalhaDasReunioes, string>,

  visoes: {
    rotulo: 'Visão',
    agenda: 'Agenda da semana',
    lista: 'Lista',
  } satisfies Record<VisaoDasReunioes | 'rotulo', string>,

  filtros: {
    titulo: 'Filtros',
    especialista: 'Especialista',
    todosOsEspecialistas: 'Todos os especialistas',
    inativo: (nome: string) => `${nome} (desligado)`,
    periodo: 'Período',
    estado: 'Estado',
    todosOsEstados: 'Todos os estados',
    modalidade: 'Modalidade',
    todasAsModalidades: 'Todas as modalidades',
    limpar: 'Limpar filtros',
  },

  periodos: {
    proximas: 'Próximas',
    hoje: 'Hoje',
    'proximos-7d': 'Próximos 7 dias',
    'ultimos-7d': 'Últimos 7 dias',
    'ultimos-30d': 'Últimos 30 dias',
    tudo: 'Todo o período',
  } satisfies Record<PeriodoDasReunioes, string>,

  estados: {
    scheduled: 'Marcada',
    confirmed: 'Confirmada',
    rescheduled: 'Remarcada',
    canceled: 'Cancelada',
    attended: 'Realizada',
    no_show: 'Falta',
  } satisfies Record<EstadoDaReuniao, string>,

  apuracoes: {
    pending: 'Não apurada',
    attested: 'Apurada',
    unattested: 'Sem apuração',
  } satisfies Record<ApuracaoDaReuniao, string>,

  desfecho: {
    titulo: 'Desfecho',
    naoApurada:
      'Ninguém marcou o desfecho desta reunião. O sistema nunca deduz se ela aconteceu: o estado só muda quando alguém marca.',
    semApuracao: 'Nenhuma fonte apurou esta reunião. O desfecho continua em aberto até alguém marcar.',
    apurada: (desfecho: string) => `Apurada como ${desfecho.toLowerCase()}.`,
    marcar: 'Marcar desfecho',
    somenteLeitura: 'Seu papel permite ver o desfecho, não marcar. Operadores e administradores marcam.',
    historico: 'Marcações',
    marcacao: (desfecho: string, autor: string, quando: string) => `${desfecho}, por ${autor} em ${quando}`,
    autorDoSistema: 'o sistema',
    autorDesconhecido: 'alguém que saiu da equipe',
    motivo: (motivo: string) => `Motivo: ${motivo}`,
    sobrescreveu: 'Trocou o desfecho marcado antes.',

    escolha: {
      titulo: 'Marcar o desfecho',
      explicacao: (lead: string) => `Como terminou a reunião com ${lead}.`,
      rotulo: 'Desfecho',
      opcoes: {
        attended: 'Realizada',
        no_show: 'Falta',
        canceled: 'Cancelada',
      } satisfies Record<DesfechoManual, string>,
      explicacoes: {
        attended: 'O lead e o especialista conversaram.',
        no_show: 'O horário chegou e o lead não apareceu.',
        canceled: 'A reunião não vai acontecer. O horário volta a ficar livre e o evento sai do calendário do especialista.',
      } satisfies Record<DesfechoManual, string>,
      motivo: 'Motivo',
      apoioDoMotivo: 'Obrigatório no cancelamento. Fica no histórico da reunião.',
      exemploDoMotivo: 'O lead pediu para desmarcar',
      confirmar: 'Marcar',
      cancelar: 'Voltar',
    },

    troca: {
      titulo: 'Trocar o desfecho',
      explicacao: (desfecho: string) =>
        `Esta reunião já foi apurada como ${desfecho.toLowerCase()}. A nova marcação troca o desfecho, e as duas ficam no histórico com autor e hora.`,
      confirmar: 'Trocar o desfecho',
      cancelar: 'Manter como está',
    },

    recusas: {
      'ja-apurada': 'Outra pessoa marcou o desfecho enquanto você escolhia. Confira e confirme a troca.',
      'motivo-obrigatorio': 'Escreva o motivo do cancelamento.',
      'sem-papel': 'Seu papel não permite marcar o desfecho. Peça a um operador ou administrador.',
      'nao-encontrada': 'A reunião não foi encontrada nesta conta. Volte à lista e abra de novo.',
      'desfecho-desconhecido': 'Escolha realizada, falta ou cancelada.',
      'falha-de-comunicacao': 'Não foi possível falar com o servidor agora. Tente de novo em alguns instantes.',
    } satisfies Record<MotivoDeRecusaDoDesfecho, string>,
  },

  modalidades: {
    video: 'Vídeo',
    telefone: 'Telefone',
    presencial: 'Presencial',
  } satisfies Record<Modalidade, string>,

  semana: {
    rotulo: 'Semana',
    anterior: 'Semana anterior',
    atual: 'Esta semana',
    proxima: 'Próxima semana',
    intervalo: (inicio: Relogio, fim: Relogio) =>
      `${dois(inicio.dia)}/${dois(inicio.mes)} a ${dois(fim.dia)}/${dois(fim.mes)}`,
  },

  agenda: {
    rotulo: 'Agenda da semana',
    especialista: 'Especialista',
    dia: (relogio: Pick<Relogio, 'dia' | 'mes' | 'diaDaSemana'>) =>
      `${DIAS_CURTOS[relogio.diaDaSemana] ?? ''} ${dois(relogio.dia)}/${dois(relogio.mes)}`,
    diaLivre: 'Livre',
    fusoDoEspecialista: (fuso: string) => `Atende no fuso de ${nomeDoFuso(fuso)}`,
    fusoDaConta: (fuso: string) => `Horários no fuso da conta, ${nomeDoFuso(fuso)}.`,
    semEspecialista: 'Nenhum especialista para mostrar neste recorte.',
  },

  tabela: {
    rotulo: 'Reuniões',
    colunas: {
      horario: 'Horário',
      lead: 'Lead',
      especialista: 'Especialista',
      modalidade: 'Modalidade',
      estado: 'Estado',
      origem: 'Origem',
      pendencias: 'O que falta',
      desfecho: 'Desfecho',
    },
    marcadaNaLigacao: 'Marcada na ligação',
    marcadaManualmente: 'Marcada manualmente',
    semPendencia: 'Nada',
  },

  /** "qui 01/10 14:30" no fuso da conta. */
  horario: (relogio: Relogio) =>
    `${DIAS_CURTOS[relogio.diaDaSemana] ?? ''} ${dois(relogio.dia)}/${dois(relogio.mes)} ${dois(relogio.hora)}:${dois(relogio.minuto)}`,
  hora: (relogio: Pick<Relogio, 'hora' | 'minuto'>) => `${dois(relogio.hora)}:${dois(relogio.minuto)}`,
  /** O horário do especialista ao lado, quando ele está em outro fuso. */
  horaDoEspecialista: (relogio: Pick<Relogio, 'hora' | 'minuto'>, fuso: string) =>
    `${dois(relogio.hora)}:${dois(relogio.minuto)} em ${nomeDoFuso(fuso)}`,

  marcas: {
    'sem-evento': {
      rotulo: 'Sem evento no calendário',
      oQueFazer: 'Conecte o calendário do especialista em Especialistas ou crie o evento à mão.',
    },
    'evento-tentando': {
      rotulo: 'Evento em nova tentativa',
      oQueFazer: 'O sistema tenta de novo sozinho. Se continuar, confira o calendário em Especialistas.',
    },
    'evento-desistiu': {
      rotulo: 'Evento não criado',
      oQueFazer:
        'O calendário recusou todas as tentativas. Crie o evento à mão ou reconecte o calendário em Especialistas.',
    },
    'convite-email-nao-configurado': {
      rotulo: 'Convite não enviado: configure o e-mail em Integrações',
      oQueFazer:
        'Cadastre em Integrações a chave do provedor de e-mail e o remetente num domínio verificado nele. Os convites saem sozinhos depois disso, com o evento anexado.',
    },
    'convite-lead-sem-email': {
      rotulo: 'Lead sem e-mail',
      oQueFazer: 'Cadastre o e-mail do lead. O convite sai sozinho depois disso.',
    },
    'convite-lead-tentando': {
      rotulo: 'Convite do lead em nova tentativa',
      oQueFazer: 'O sistema tenta de novo sozinho. Se continuar, confira o e-mail do lead.',
    },
    'convite-lead-desistiu': {
      rotulo: 'Convite do lead não enviado',
      oQueFazer: 'O e-mail recusou todas as tentativas. Confira o endereço e envie o convite por fora.',
    },
    'convite-especialista-tentando': {
      rotulo: 'Convite do especialista em nova tentativa',
      oQueFazer: 'O sistema tenta de novo sozinho. Se continuar, confira o e-mail do especialista.',
    },
    'convite-especialista-desistiu': {
      rotulo: 'Convite do especialista não enviado',
      oQueFazer:
        'O e-mail recusou todas as tentativas. Confira o endereço em Especialistas e avise o especialista por fora.',
    },
  } satisfies Record<MarcaDaReuniao, { rotulo: string; oQueFazer: string }>,

  teto: (teto: number) =>
    `A consulta mostra só as ${teto} primeiras reuniões deste recorte. Escolha um período mais estreito ou um especialista para ver as demais.`,

  vazio: {
    titulo: 'Nenhuma reunião marcada',
    explicacao:
      'A conta ainda não tem reunião. Elas aparecem aqui quando a assistente marca numa ligação.',
    acao: 'Ver os especialistas',
  },

  vazioComFiltro: {
    titulo: 'O recorte não achou nada',
    explicacao: 'Há reuniões na conta fora deste recorte. Mude a semana, o período ou limpe os filtros.',
  },

  ficha: {
    titulo: 'Reunião',
    apoio: 'O que o especialista precisa saber antes de entrar.',
    carregando: 'Carregando a reunião…',
    voltar: 'Voltar para as reuniões',
    cabecalho: (lead: string, especialista: string) => `${lead} com ${especialista}`,
    leadSemNome: 'Lead sem nome',

    falhas: {
      'sem-permissao': 'Seu acesso a esta conta não permite ver as reuniões.',
      'sem-conta': 'Você ainda não pertence a nenhuma conta.',
      'falha-de-comunicacao':
        'Não foi possível falar com o servidor agora. Tente de novo em alguns instantes.',
    } satisfies Record<Exclude<MotivoDeFalhaDaFicha, 'nao-encontrada'>, string>,

    naoEncontrada: {
      titulo: 'Reunião não encontrada',
      explicacao:
        'O endereço não corresponde a nenhuma reunião desta conta. Volte à lista para ver as reuniões marcadas.',
      acao: 'Ver as reuniões',
    },

    dados: {
      titulo: 'A reunião',
      lead: 'Lead',
      empresa: 'Empresa',
      email: 'E-mail',
      semEmail: 'Sem e-mail cadastrado',
      telefone: 'Telefone',
      especialista: 'Especialista',
      horario: 'Horário',
      /** "qui 01/10, 14:00 a 14:30" no fuso dado. */
      intervalo: (inicio: Relogio, fim: Pick<Relogio, 'hora' | 'minuto'>) =>
        `${DIAS_CURTOS[inicio.diaDaSemana] ?? ''} ${dois(inicio.dia)}/${dois(inicio.mes)}, ${dois(inicio.hora)}:${dois(inicio.minuto)} a ${dois(fim.hora)}:${dois(fim.minuto)}`,
      noFusoDoEspecialista: (fuso: string) => `no fuso do especialista, ${nomeDoFuso(fuso)}`,
      noFusoDoLead: (fuso: string) => `no fuso do lead, ${nomeDoFuso(fuso)}`,
      noFusoDosDois: (fuso: string) => `no fuso do lead e do especialista, ${nomeDoFuso(fuso)}`,
      modalidade: 'Modalidade',
      sala: 'Sala',
      abrirSala: 'Abrir a sala',
      semSala: 'O especialista não tem sala cadastrada. Cadastre o link em Especialistas.',
      estado: 'Estado',
      motivoDoCancelamento: 'Motivo do cancelamento',
      semMotivo: 'Cancelada sem motivo registrado.',
      notas: 'Notas da marcação',
    },

    resumo: {
      titulo: 'Resumo de passagem',
      apoio: 'Escrito a partir da ligação em que a assistente marcou.',
      vazio:
        'A reunião não tem resumo de passagem. Ele é escrito depois da ligação em que a assistente marca, e reunião marcada à mão não tem.',
      campos: {
        resumo: 'Resumo',
        dor: 'Dor',
        contexto: 'Contexto',
        interesse: 'Interesse',
        orcamento: 'Orçamento',
        prazo: 'Prazo',
        decisor: 'Quem decide',
        objecoes: 'Objeções',
        proximosPassos: 'Próximos passos',
      } satisfies Record<CampoDoResumo, string>,
      sim: 'Sim',
      nao: 'Não',
    },

    historico: {
      titulo: 'Histórico',
      passos: {
        'marcada-na-ligacao': 'Marcada na ligação',
        'marcada-manualmente': 'Marcada manualmente',
        'confirmada-na-ligacao': 'Confirmada na ligação',
        'confirmada-manualmente': 'Confirmada manualmente',
      } satisfies Record<TipoDoPasso, string>,
      abrirChamada: 'Abrir a ficha da chamada',
      chamadaIndisponivel: 'A ficha desta ligação não está mais disponível.',
    },

    entregas: {
      titulo: 'Calendário e convites',
      evento: 'Evento no calendário do especialista',
      conviteDoLead: 'Convite por e-mail ao lead',
      conviteDoEspecialista: 'Convite por e-mail ao especialista',
      estadosDoEvento: {
        criado: 'Criado',
        removendo: 'Saindo do calendário',
        'sem-evento': 'Sem evento',
        tentando: 'Em nova tentativa',
        desistiu: 'Não criado',
      } satisfies Record<EstadoDoEvento, string>,
      estadosDoConvite: {
        enviado: 'Enviado',
        'sem-email': 'Lead sem e-mail',
        'email-nao-configurado': 'Não enviado: configure o e-mail em Integrações',
        'na-fila': 'Saindo agora',
        tentando: 'Em nova tentativa',
        desistiu: 'Não enviado',
      } satisfies Record<EstadoDoConvite, string>,
      tentativas: (quantas: number) => (quantas === 1 ? '1 tentativa' : `${quantas} tentativas`),
      enviadoEm: (quando: string) => `Enviado em ${quando}`,
      ultimoErro: (erro: string) => `Último erro: ${erro}`,
      proximaTentativa: (quando: string) => `Próxima tentativa em ${quando}`,
    },
  },
} as const
