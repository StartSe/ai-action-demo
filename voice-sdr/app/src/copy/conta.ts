import { PALAVRA_DE_CONFIRMACAO } from '@reset/respostas.ts'

import type { ModoDeRoteamento, MotivoDeFalhaDoRoteamento } from '@/conta/tipos'

/**
 * /config/conta: o modo de roteamento do especialista e a zona de perigo. O
 * nome da conta, o fuso e o disjuntor chegam depois nesta mesma tela.
 */
export const conta = {
  titulo: 'Conta',
  explicacao: 'Configurações da conta e da instalação.',
  carregando: 'Carregando a conta.',
  falha: 'Não foi possível carregar a conta. Tente de novo em alguns minutos.',

  roteamento: {
    rotulo: 'Roteamento das reuniões',
    titulo: 'Para quem vai a reunião',
    apoio: 'Quando a assistente marca uma reunião, este modo escolhe o especialista que vai atender.',
    carregando: 'Carregando o roteamento.',
    legenda: 'Modo de roteamento',
    modos: {
      area: {
        rotulo: 'Por área',
        efeito:
          'A reunião vai para um especialista ativo da mesma área do lead. Lead sem área, ou área sem ninguém ativo, fica sem horário até alguém cobrir.',
      },
      round_robin: {
        rotulo: 'Rodízio entre disponíveis',
        efeito:
          'A reunião vai para quem está há mais tempo sem receber uma, entre os ativos com horário livre. A área do lead não conta.',
      },
      fixed: {
        rotulo: 'Especialista fixo',
        efeito:
          'Todas as reuniões vão para a mesma pessoa. Se ela ficar sem horário, a assistente não oferece outro especialista.',
      },
    } satisfies Record<ModoDeRoteamento, { rotulo: string; efeito: string }>,
    /** As áreas que o modo por área consegue casar hoje (D-16). */
    areas: {
      titulo: 'Áreas cadastradas',
      apoio:
        'A assistente só acha especialista quando a área do lead casa com uma destas. Para mudar a lista, edite a área de cada um em Especialistas.',
      nenhuma:
        'Nenhum especialista ativo tem área cadastrada. Neste modo ninguém recebe reunião até alguém ganhar uma área em Especialistas.',
    },
    especialista: 'Quem recebe as reuniões',
    escolha: 'Escolha um especialista',
    semAtivos: 'Nenhum especialista ativo. Cadastre ou reative alguém em Especialistas para usar este modo.',
    inativo: (nome: string) => `${nome} (inativo)`,
    alcance: 'A troca vale para as próximas ligações. As reuniões já marcadas continuam com o especialista que as recebeu.',
    salvar: 'Salvar o modo',
    salvando: 'Salvando…',
    salvo: 'Modo salvo e registrado na auditoria. Vale a partir da próxima ligação.',
    vazio: {
      titulo: 'Sem configuração de roteamento',
      explicacao: 'A conta ainda não tem a linha de configuração. Recarregue a página; se continuar assim, fale com o suporte.',
    },
    leitura: {
      aviso: 'Trocar o modo de roteamento é de quem administra a conta. Seu papel vê o modo em uso.',
      pedirAcesso: 'Peça a troca a quem administra a conta:',
      semAdministrador: 'A conta não tem ninguém com papel de administrador.',
    },
    falhas: {
      'sem-permissao': 'Sua sessão não tem permissão para trocar o roteamento. Peça a quem administra a conta.',
      'sem-conta': 'Sua sessão não está ligada a nenhuma conta.',
      'falha-de-comunicacao': 'Não foi possível falar com o servidor. Tente de novo em alguns minutos.',
      'fixo-sem-especialista': 'O modo fixo precisa de um especialista. Escolha quem recebe as reuniões.',
      'especialista-inativo':
        'Este especialista está inativo e não recebe reuniões. Escolha alguém ativo ou reative a pessoa em Especialistas.',
      'especialista-de-outra-conta': 'Este especialista não é desta conta. Recarregue a página e escolha de novo.',
    } satisfies Record<MotivoDeFalhaDoRoteamento, string>,
  },

  zerar: {
    rotulo: 'Zona de perigo',
    titulo: 'Zerar o ambiente',
    apoio: 'Para recomeçar um ambiente de teste do zero, desde a criação da conta.',
    apaga: 'Apaga',
    itensQueSaem: [
      'Todas as contas e todos os usuários, inclusive o seu',
      'As chaves de ElevenLabs, Twilio e OpenRouter',
      'Leads, chamadas, gravações, playbooks e a base de conhecimento',
      'Os agentes da assistente publicados na ElevenLabs',
    ],
    mantem: 'Mantém',
    itensQueFicam: ['A estrutura do banco', 'A configuração das rotinas agendadas'],
    semVolta: 'Não tem volta. Depois, você cai na criação da conta.',
    confirmacao: {
      rotulo: `Digite ${PALAVRA_DE_CONFIRMACAO} para confirmar`,
      exemplo: PALAVRA_DE_CONFIRMACAO,
    },
    acao: 'Zerar o ambiente',
    acaoEmCurso: 'Zerando…',
    dialogo: {
      titulo: 'Zerar o ambiente agora?',
      explicacao: 'Tudo o que está listado sai de vez, e você sai da sessão.',
      cancelar: 'Cancelar',
      confirmar: 'Zerar tudo',
    },
    soODono: 'Só o dono da conta pode zerar o ambiente.',
    falhou: 'Não foi possível zerar o ambiente agora.',
  },
} as const
