// Os literais do funil (US-250, US-145, US-146, RF-201, RF-202, RF-205, RF-206,
// RF-207).
//
// Registro de interface: direto e declarativo, sem travessão e sem fecho de
// efeito (docs/padrao-de-interface.md seção 4).
//
// Filtro de campanha fica de fora do quadro: `campaigns` é tabela da F7, e um
// seletor sem tabela por trás seria controle morto. Os filtros desta fatia são
// período da última atividade e origem (RF-206).

import type { CorDaEtapa } from '@/funil/etapas'
import type {
  MotivoDaConfiguracao,
  MotivoDaExclusaoDeEtapa,
  MotivoDaMudancaDeEtapa,
} from '@/leads/tipos'

export const funil = {
  titulo: 'Funil',
  apoio: 'Onde cada lead está. As etapas vêm do funil padrão da conta.',

  carregando: 'Carregando o funil.',
  falha: 'Não foi possível ler o funil desta conta. Tente de novo em alguns minutos.',

  vazio: {
    titulo: 'Nenhum lead no funil ainda',
    explicacao:
      'Importe uma planilha para acompanhar por onde os leads andam. A assistente move a etapa conforme o que apura nas ligações.',
    acao: 'Importar planilha',
  },

  filtros: {
    rotulo: 'Filtros do funil',
    atividade: 'Última atividade',
    origem: 'Origem',
    todasAsOrigens: 'Qualquer origem',
    limpar: 'Limpar filtros',
  },
  /** O recorte não alcança lead nenhum; a conta tem leads, este filtro não. */
  recorteVazio: 'Nenhum lead neste recorte. Limpe os filtros para ver o funil inteiro.',

  total: (quantos: number) => (quantos === 1 ? '1 lead no funil' : `${quantos} leads no funil`),

  /**
   * Quem não tem etapa não é coluna: ele não está no funil, e pô-lo numa
   * coluna fingiria que está. A tela o conta à parte e leva à lista.
   */
  semEtapa: (quantos: number) =>
    quantos === 1
      ? '1 lead ainda sem etapa, fora do funil'
      : `${quantos} leads ainda sem etapa, fora do funil`,
  verSemEtapa: 'Ver quem está fora',

  coluna: {
    vazia: 'Nenhum lead aqui',
    // A coluna é um cartão de leitura rápida; a lista inteira se vê em /leads.
    truncada: (total: number) =>
      `Mostrando os mais recentes de ${total}. Use um filtro mais estreito para ver os outros.`,
    verTodos: 'Ver todos desta etapa',
    semNome: 'sem nome',
  },

  cartao: {
    temperatura: 'Temperatura',
    semTemperatura: 'Sem temperatura',
    pontuacao: 'Pontuação',
    semPontuacao: 'Sem pontuação',
    atividade: 'Última atividade',
    semAtividade: 'Ainda sem contato',
    /** O sinal de RF-205: a última mudança de etapa foi da Sarah. */
    movidoPelaSarah: 'Movido pela assistente',
    mover: (nome: string) => `Mover ${nome} para`,
    moverPlaceholder: 'Mover para',
  },

  bloqueado: 'Bloqueado',

  movimento: {
    movido: (nome: string, etapa: string) => `${nome} foi para ${etapa}.`,
    mesmaEtapa: (nome: string, etapa: string) => `${nome} já estava em ${etapa}.`,
    falhas: {
      'sem-permissao':
        'O lead não mudou de etapa. Seu papel nesta conta não permite mover leads no funil.',
      'lead-inexistente': 'O lead não mudou de etapa. Ele não está mais nesta conta.',
      'etapa-inexistente':
        'O lead não mudou de etapa. Esta etapa não existe mais no funil da conta.',
      'falha-de-comunicacao':
        'O lead não mudou de etapa. Não foi possível falar com o servidor; tente de novo.',
    } satisfies Record<MotivoDaMudancaDeEtapa, string>,
  },

  negativa: {
    aviso:
      'Você vê o funil em leitura. Mover lead entre etapas é de quem opera a conta; seu papel permite acompanhar o quadro, não alterá-lo.',
    pedirAcesso: 'Peça acesso a quem administra a conta:',
    semAdministrador: 'Esta conta não tem administrador registrado. Fale com o suporte.',
  },

  /**
   * A configuração das etapas (US-146, RF-207). A frase da chave é o que evita
   * alguém renomear achando que muda o que a Sarah faz.
   */
  etapas: {
    abrir: 'Configurar etapas',
    fechar: 'Fechar configuração',
    titulo: 'Etapas do funil',
    chaveExplicada:
      'A automação usa a chave de cada etapa, nunca o rótulo. Renomear muda só o que a tela mostra.',
    carregando: 'Carregando as etapas.',
    falha: 'Não foi possível ler as etapas desta conta. Tente de novo em alguns minutos.',
    vazio: 'Este funil ainda não tem etapas.',
    vazioEmLeitura: 'Este funil ainda não tem etapas. Quem administra a conta as cria aqui.',

    lista: 'Etapas, na ordem do funil',
    chave: 'Chave',
    leads: (quantos: number) => (quantos === 1 ? '1 lead' : `${quantos} leads`),

    rotulo: (etapa: string) => `Rótulo de ${etapa}`,
    renomear: 'Renomear',
    cor: (etapa: string) => `Cor de ${etapa}`,
    subir: (etapa: string) => `Subir ${etapa}`,
    descer: (etapa: string) => `Descer ${etapa}`,
    // O nome acessível dos dois botões é o `subir`/`descer`; a seta é o desenho.
    setaSubir: '↑',
    setaDescer: '↓',
    apagar: (etapa: string) => `Apagar ${etapa}`,
    canonica:
      'Etapa canônica. A automação a cita pela chave, por isso ela não se apaga; renomeie o rótulo.',

    nova: {
      titulo: 'Nova etapa',
      rotulo: 'Rótulo da nova etapa',
      exemplo: 'Proposta enviada',
      chave: 'Chave gerada',
      semChave: 'O rótulo precisa começar por letra e ter ao menos três letras ou dígitos.',
      cor: 'Cor da nova etapa',
      criar: 'Criar etapa',
    },

    rotuloVazio: 'O rótulo não pode ficar vazio.',

    confirmacao: {
      titulo: (etapa: string) => `Apagar a etapa ${etapa}?`,
      vazia: 'Nenhum lead está nesta etapa. Apagar é irreversível: a chave some junto e não volta.',
      comLeads: (quantos: number) =>
        `${quantos === 1 ? '1 lead está' : `${quantos} leads estão`} nesta etapa. Apagar é irreversível, e o banco só apaga etapa vazia: mova esses leads antes.`,
      confirmar: 'Apagar etapa',
      cancelar: 'Cancelar',
    },

    feito: {
      renomeada: (etapa: string) => `Etapa renomeada para ${etapa}.`,
      colorida: (etapa: string) => `Cor de ${etapa} trocada.`,
      reordenada: 'Ordem das etapas gravada.',
      criada: (etapa: string) => `Etapa ${etapa} criada.`,
      apagada: (etapa: string) => `Etapa ${etapa} apagada.`,
    },

    falhas: {
      'sem-permissao':
        'Nada foi gravado. Seu papel nesta conta não permite configurar as etapas.',
      'etapa-de-outra-conta':
        'Nada foi gravado. Esta etapa não pertence mais ao funil da conta; a lista foi relida.',
      'chave-invalida':
        'Nada foi gravado. A chave já existe neste funil ou não está no formato aceito.',
      'posicao-duplicada':
        'Nada foi gravado. Duas etapas ficariam na mesma posição; a lista mostra a ordem que está no banco.',
      'etapa-canonica': 'Nada foi gravado. Esta chave é de uma etapa canônica.',
      'falha-de-comunicacao':
        'Nada foi gravado. Não foi possível falar com o servidor; tente de novo.',
    } satisfies Record<MotivoDaConfiguracao, string>,

    falhasDaExclusao: {
      'sem-permissao':
        'A etapa não foi apagada. Seu papel nesta conta não permite configurar as etapas.',
      'etapa-canonica': 'A etapa não foi apagada. Etapa canônica não se apaga.',
      'etapa-com-leads':
        'A etapa não foi apagada. Ela tem leads; mova-os para outra etapa antes.',
      'falha-de-comunicacao':
        'A etapa não foi apagada. Não foi possível falar com o servidor; tente de novo.',
    } satisfies Record<MotivoDaExclusaoDeEtapa, string>,

    negativa:
      'Você vê as etapas em leitura. Criar, renomear, reordenar e colorir etapas é de quem administra a conta, porque muda o funil de todo mundo.',
  },

  /** O nome de cada cor da paleta, como o seletor a oferece. */
  cores: {
    informacao: 'Ciano',
    atencao: 'Âmbar',
    menta: 'Menta',
    'menta-2': 'Menta clara',
    carmim: 'Carmim',
    perigo: 'Rosa',
    'texto-desativado': 'Cinza',
  } satisfies Record<CorDaEtapa, string>,
} as const
