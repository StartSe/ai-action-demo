// Os literais dos especialistas (US-251, RF-501).
//
// Registro de interface: direto e declarativo, sem travessão e sem fecho de
// efeito (docs/padrao-de-interface.md seção 4).

import { nomeDoFusoNaTela } from '@/copy/fuso'
import type { ProblemaDaFaixa, ProblemaDoBloqueio } from '@/especialistas/agenda'
import type { EstadoDoCartaoDoCalendario } from '@/especialistas/calendario'
import type {
  Modalidade,
  MotivoDeFalhaDaAgenda,
  MotivoDeFalhaDosEspecialistas,
} from '@/especialistas/tipos'
import type { ProblemaDoCadastro } from '@/especialistas/regras'

export const especialistas = {
  titulo: 'Especialistas',
  apoio:
    'Quem atende a reunião que a assistente marca. Toda ligação de descoberta termina encaminhando para um deles.',

  carregando: 'Carregando os especialistas.',
  falha: 'Não foi possível ler os especialistas desta conta. Tente de novo em alguns minutos.',
  tentarDeNovo: 'Tentar de novo',
  semPermissao:
    'Cadastrar especialista é tarefa de quem administra a conta. Peça a quem administra.',

  /** Por que a gravação não aconteceu, motivo a motivo. */
  falhasDaGravacao: {
    'sem-permissao':
      'Cadastrar especialista é tarefa de quem administra a conta. Peça a quem administra.',
    // A RLS filtrou a linha: o banco respondeu sem erro e sem gravar nada.
    recusada:
      'A conta não aceitou a gravação e nada foi alterado. Só quem administra a conta muda especialistas.',
    'sem-conta': 'Seu usuário não pertence a nenhuma conta. Peça um convite a quem administra.',
    'falha-de-comunicacao': 'Não foi possível concluir agora. Tente de novo em alguns minutos.',
  } as Readonly<Record<MotivoDeFalhaDosEspecialistas, string>>,

  /** Quem não administra lê a tela inteira, com os campos travados. */
  leitura: {
    aviso: 'Você vê os especialistas em leitura. Cadastrar e editar é de quem administra a conta.',
    ver: 'Ver',
    fechar: 'Fechar',
  },

  /** Os títulos da tabela. A ordem aqui é a ordem das colunas. */
  colunas: {
    nome: 'Nome',
    area: 'Área',
    modalidades: 'Modalidades',
    duracao: 'Duração',
    teto: 'Teto diário',
    antecedencia: 'Antecedência',
    fuso: 'Fuso',
    calendario: 'Calendário',
    acoes: 'Ações',
  },
  rotuloDaTabela: 'Especialistas da conta',

  duracao: (minutos: number) => `${minutos} min`,
  teto: (quantas: number) => (quantas === 1 ? '1 por dia' : `${quantas} por dia`),
  /** De quanto antes até quanto à frente a assistente pode oferecer horário. */
  antecedencia: (minimoMin: number, maximoDias: number) => {
    const minimo =
      minimoMin === 0
        ? 'na hora'
        : minimoMin % 60 === 0
          ? `${minimoMin / 60} h`
          : `${minimoMin} min`
    return `${minimo} a ${maximoDias} ${maximoDias === 1 ? 'dia' : 'dias'}`
  },

  calendario: {
    desconectado: 'Sem calendário',
    conectado: 'Conectado',
    comFalha: 'Falha na sincronização',
    aguardandoSincronia: 'Aguardando a primeira sincronização',
    sincronizadoEm: (quando: string) => `Sincronizado em ${quando}`,
  },

  /** O cartão do calendário na ficha (US-177, RF-507). */
  cartaoDoCalendario: {
    titulo: 'Calendário',
    /** De onde a ocupação é lida: o endereço iCal é o padrão, o Google é o avançado. */
    fornecedor: (provedor: string | null) =>
      provedor === 'google'
        ? 'Google Agenda, pelo acesso do Google'
        : 'Endereço iCal do Google Agenda, do Outlook ou do Apple',
    estados: {
      conectado: 'Conectado',
      nao_configurado: 'Não conectado',
      erro: 'Com erro',
      indisponivel: 'Indisponível',
      aguardando_google: 'Aguardando aprovação do Google',
      testando: 'Consultando',
    } as Readonly<Record<EstadoDoCartaoDoCalendario, string>>,
    sincronizado: (quando: string) => `Última leitura da agenda: ${quando}.`,
    primeiraLeitura: 'Conectado. A primeira leitura da agenda acontece na próxima passagem da rotina.',
    /** A sincronização parou: não é agenda vazia, e a frase diz desde quando. */
    parou: (desde: string) =>
      `A sincronização parou. A última leitura que deu certo foi ${desde}, e o que entrou na agenda depois disso não é visto.`,
    parouAntesDaPrimeira:
      'A sincronização parou antes da primeira leitura. A ocupação desta pessoa ainda não foi vista nenhuma vez.',
    /** O risco de docs/PRD.md seção 12, dito onde ele acontece. */
    semCalendario:
      'Sem calendário conectado, a assistente pode oferecer um horário em cima de um compromisso que já existe na agenda desta pessoa. Os horários saem só da disponibilidade cadastrada aqui.',
    bloqueiaNaEspera:
      'Até a aprovação sair, o acesso pelo Google não lê esta agenda. O endereço iCal funciona sem aprovação nenhuma: desconecte e cole o endereço.',
    erro: 'Reconecte o calendário para voltar a ler a ocupação.',
    erroDoIcal: 'Cole o endereço de novo para voltar a ler a ocupação.',
    indisponivel: 'Não foi possível consultar a conexão do calendário agora.',
    conectar: 'Conectar pelo acesso do Google',
    reconectar: 'Reconectar pelo Google',
    /** Só aparece quando a instalação tem o aplicativo do Google configurado. */
    oauthExplicacao:
      'Caminho avançado, disponível porque esta instalação tem o aplicativo do Google configurado. Com ele, a reunião também vira evento direto na agenda.',

    /** O caminho padrão: o endereço secreto no formato iCal, sem OAuth. */
    ical: {
      rotulo: 'Endereço secreto no formato iCal',
      exemplo: 'https://calendar.google.com/calendar/ical/.../basic.ics',
      explicacao:
        'O endereço dá leitura da agenda desta pessoa, e fica guardado no cofre da conta. A assistente só lê a ocupação: a reunião chega à agenda pelo convite por e-mail, com o evento anexado.',
      ondeAchar: 'Onde achar o endereço',
      provedores: [
        {
          nome: 'Google Agenda',
          passos:
            'No computador, abra Configurações, escolha a agenda da pessoa em Configurações das minhas agendas e, em Integrar agenda, copie o Endereço secreto no formato iCal.',
        },
        {
          nome: 'Outlook',
          passos:
            'Em Configurações, Calendário, Calendários compartilhados, use Publicar um calendário: escolha a agenda, a permissão Pode ver quando estou ocupado, clique em Publicar e copie o link ICS.',
        },
        {
          nome: 'Apple (iCloud)',
          passos:
            'No app Calendário, abra as informações da agenda, ligue Calendário público e copie o endereço. Ele começa com webcal e pode ser colado assim.',
        },
      ],
      salvar: 'Salvar endereço',
      trocar: 'Trocar endereço',
      gravando: 'Salvando o endereço.',
      gravado:
        'Endereço salvo. A primeira leitura da agenda acontece na próxima passagem da rotina, em até cinco minutos.',
      recusas: {
        vazio: 'Cole o endereço antes de salvar.',
        formato:
          'Este não parece um endereço iCal. Cole o endereço inteiro, que começa com https ou webcal, copiado do calendário.',
      },
    },
    desconectar: 'Desconectar',
    tentarDeNovo: 'Tentar de novo',
    preparando: 'Preparando a conexão com o Google.',
    desconectando: 'Desconectando o calendário.',
    desconectado:
      'Calendário desconectado. Os horários passam a sair só da disponibilidade cadastrada aqui.',
    confirmacao: {
      titulo: 'Desconectar o calendário?',
      explicacao:
        'A ocupação lida da agenda desta pessoa deixa de valer, e os horários que a assistente oferece passam a sair só da disponibilidade cadastrada aqui. Compromissos novos na agenda dela deixam de ser vistos.',
      confirmar: 'Desconectar',
      cancelar: 'Manter conectado',
    },
    leitura: 'Conectar e desconectar o calendário é tarefa de quem administra a conta.',
  },

  vazio: {
    titulo: 'Nenhum especialista cadastrado',
    // O que está em jogo: sem ninguém, o objetivo da ligação não tem destino.
    explicacao:
      'Sem ninguém aqui, a assistente não tem para quem encaminhar quando o lead demonstra interesse, e nenhuma reunião é marcada. Cadastre ao menos uma pessoa.',
  },

  /** O número que responde "a assistente tem para quem encaminhar?". */
  ativos: (quantos: number) =>
    quantos === 0
      ? 'Ninguém ativo: a assistente não tem para quem encaminhar'
      : quantos === 1
        ? '1 pessoa ativa para receber reunião'
        : `${quantos} pessoas ativas para receber reunião`,

  novo: 'Cadastrar especialista',
  inativo: 'Desligado',
  nuncaAtendeu: 'Ainda não recebeu nenhuma reunião',
  ultimoAtendimento: (quando: string) => `Última reunião em ${quando}`,
  semArea: 'sem área',

  modalidades: {
    video: 'Vídeo',
    telefone: 'Telefone',
    presencial: 'Presencial',
  } as Readonly<Record<Modalidade, string>>,

  acoes: {
    editar: 'Editar',
    desligar: 'Desligar',
    religar: 'Religar',
    // Não há excluir: o especialista aparece em reuniões passadas, e apagá-lo
    // deixaria o histórico sem quem atendeu.
    explicacaoDoDesligar: 'Desligar tira do rodízio e mantém o histórico das reuniões.',
  },

  formulario: {
    tituloNovo: 'Novo especialista',
    tituloEdicao: 'Editar especialista',
    nome: 'Nome',
    exemploDoNome: 'Marina Duarte',
    email: 'E-mail',
    exemploDoEmail: 'marina@empresa.com.br',
    apoioDoEmail: 'É para onde o convite da reunião vai. Sem ele a pessoa não fica sabendo.',
    area: 'Área',
    exemploDaArea: 'Frotas pesadas',
    apoioDaArea: 'Só quando a conta roteia por área. Em rodízio, deixe em branco.',
    /** As áreas que já existem, para o mesmo time ter a mesma grafia (D-16). */
    areasCadastradas: (areas: readonly string[]) =>
      `Áreas já cadastradas: ${areas.join(', ')}. Para o mesmo time, escolha uma delas: a assistente só acha o especialista quando a área casa.`,
    fuso: 'Fuso horário',
    apoioDoFuso:
      'A disponibilidade semanal vale neste fuso, e os horários oferecidos ao lead saem dele. Um cadastro novo nasce com o fuso da conta.',
    modalidades: 'Como atende',
    apoioDasModalidades: 'Escolha ao menos uma. É o que a assistente oferece ao marcar.',
    sala: 'Link da sala',
    exemploDaSala: 'https://meet.exemplo.com/marina',
    apoioDaSala: 'Quem só atende presencial pode deixar em branco.',
    duracao: 'Duração da reunião, em minutos',
    teto: 'Máximo de reuniões por dia',
    antecedenciaMinima: 'Antecedência mínima, em minutos',
    apoioDaAntecedenciaMinima: 'Quanto tempo antes a reunião pode ser marcada.',
    antecedenciaMaxima: 'Antecedência máxima, em dias',
    apoioDaAntecedenciaMaxima: 'Até quanto tempo à frente a assistente pode oferecer horário.',
    ativo: 'Recebendo reuniões',
    salvar: 'Salvar',
    salvando: 'Salvando.',
    cancelar: 'Cancelar',
    salvo: 'Especialista salvo.',
  },

  /** O que falta, campo a campo. As frases repetem os checks da tabela. */
  problemas: {
    nome: 'Escreva o nome do especialista.',
    email: 'Escreva um e-mail válido: é para onde o convite da reunião vai.',
    modalidades: 'Escolha ao menos uma forma de atender.',
    duracao: 'A duração vai de 15 a 240 minutos.',
    teto: 'O máximo por dia vai de 1 a 20 reuniões.',
    antecedencia_minima: 'A antecedência mínima vai de 0 minutos a 7 dias.',
    antecedencia_maxima: 'A antecedência máxima vai de 1 a 90 dias.',
  } as Readonly<Record<ProblemaDoCadastro, string>>,

  /** A agenda na ficha do especialista (US-176, RF-502 e RF-503). */
  agenda: {
    carregando: 'Carregando a agenda do especialista.',
    falha: 'Não foi possível ler a agenda deste especialista. Tente de novo em alguns minutos.',
    tentarDeNovo: 'Ler a agenda de novo',
    leitura: 'A agenda está em leitura. Mudar faixas e bloqueios é de quem administra a conta.',

    /** O fuso em que as horas valem (T-21). */
    fuso: (fuso: string) =>
      `As horas desta agenda valem no fuso do especialista, ${nomeDoFusoNaTela(fuso)}.`,
    fusoDaConta: (fusoDaConta: string) =>
      `A conta está no fuso ${nomeDoFusoNaTela(fusoDaConta)}. Cada bloqueio mostra também o horário da conta.`,

    /** 0 é domingo, como em `extract(dow from ...)`. */
    dias: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const,

    disponibilidade: {
      titulo: 'Disponibilidade semanal',
      apoio:
        'As faixas em que a assistente pode oferecer horário. Um dia aceita mais de uma faixa, como manhã e tarde.',
      rotuloDaLista: 'Faixas por dia da semana',
      semFaixa: 'Sem atendimento',
      faixa: (inicio: string, fim: string) => `${inicio} às ${fim}`,
      remover: 'Remover',
      rotuloDoRemover: (dia: string, inicio: string, fim: string) =>
        `Remover a faixa de ${dia}, ${inicio} às ${fim}`,
      novaFaixa: 'Nova faixa',
      dia: 'Dia da semana',
      inicio: 'Início',
      fim: 'Fim',
      acrescentar: 'Acrescentar faixa',
      acrescentada: 'Faixa acrescentada.',
      removida: 'Faixa removida.',
    },

    vazio: {
      titulo: 'Nenhuma faixa definida',
      explicacao:
        'A assistente não vai oferecer horário nenhum para este especialista. Acrescente ao menos uma faixa.',
    },

    bloqueios: {
      titulo: 'Bloqueios',
      apoio: 'Férias, compromissos e ausências. O bloqueio fecha o que a faixa semanal abre.',
      rotuloDaLista: 'Próximos bloqueios',
      nenhum: 'Nenhum bloqueio à frente.',
      passados: (quantos: number) =>
        quantos === 1 ? '1 bloqueio já passou' : `${quantos} bloqueios já passaram`,
      rotuloDosPassados: 'Bloqueios passados',
      intervalo: (inicio: string, fim: string) => `${inicio} a ${fim}`,
      naConta: (fusoDaConta: string, inicio: string, fim: string) =>
        `Na conta (${nomeDoFusoNaTela(fusoDaConta)}): ${inicio} a ${fim}`,
      semMotivo: 'Sem motivo informado',
      remover: 'Remover',
      rotuloDoRemover: (intervalo: string) => `Remover o bloqueio de ${intervalo}`,
      novo: 'Novo bloqueio',
      dataInicio: 'Data de início',
      horaInicio: 'Hora de início',
      dataFim: 'Data de fim',
      horaFim: 'Hora de fim',
      motivo: 'Motivo',
      exemploDoMotivo: 'Férias',
      acrescentar: 'Bloquear',
      acrescentado: 'Bloqueio gravado.',
      removido: 'Bloqueio removido.',
    },

    /** O que impede a faixa antes de mandar. */
    problemasDaFaixa: {
      hora: 'Escreva início e fim da faixa no formato 09:00.',
      ordem: 'O fim da faixa precisa ser depois do início.',
    } as Readonly<Record<ProblemaDaFaixa, string>>,

    problemasDoBloqueio: {
      inicio: 'Escreva a data e a hora de início do bloqueio.',
      fim: 'Escreva a data e a hora de fim do bloqueio.',
      ordem: 'O fim do bloqueio precisa ser depois do início.',
    } as Readonly<Record<ProblemaDoBloqueio, string>>,

    /** Por que a escrita na agenda não aconteceu. */
    falhas: {
      'sem-permissao':
        'Mudar a agenda de um especialista é tarefa de quem administra a conta. Peça a quem administra.',
      recusada:
        'A conta não aceitou a mudança na agenda e nada foi alterado. Só quem administra a conta muda a agenda.',
      'sem-conta': 'Seu usuário não pertence a nenhuma conta. Peça um convite a quem administra.',
      'falha-de-comunicacao': 'Não foi possível mudar a agenda agora. Tente de novo em alguns minutos.',
      'faixa-repetida': 'Já existe uma faixa começando nessa hora nesse dia.',
      'ordem-invertida': 'O banco recusou a faixa porque o fim não vem depois do início.',
      'bloqueio-sobreposto': 'Esse intervalo já está coberto por outro bloqueio.',
    } as Readonly<Record<MotivoDeFalhaDaAgenda | 'bloqueio-sobreposto', string>>,

    /** A recusa da sobreposição, dizendo qual bloqueio já cobre o intervalo. */
    sobreposto: (intervalo: string, motivo: string | null) =>
      `Já existe um bloqueio de ${intervalo}${motivo ? ` (${motivo})` : ''} cobrindo parte desse intervalo. Ajuste as datas ou remova o bloqueio anterior.`,
  },

  desligado: 'Especialista desligado. Ele sai do rodízio e o histórico continua.',
  religado: 'Especialista religado. Ele volta a receber reuniões.',
} as const
