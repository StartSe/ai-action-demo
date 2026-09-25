import type { MotivoDeRecusa } from '@compartilhado/telefone.ts'

import { RECUSA_DO_TELEFONE } from '@/copy/leads'
import type { EstadoDaLinha, RecusaDoCampo } from '@/numeros/linhas'
import type {
  ComportamentoDeEntrada,
  MotivoDeFalhaDeNumeros,
} from '@/numeros/tipos'

/**
 * O comportamento de entrada com a consequência escrita ao lado (RF-409). A
 * escolha é entre três destinos para quem liga, e a frase diz o que essa
 * pessoa vai ouvir: o rótulo sozinho deixa "grava recado" parecer inofensivo.
 */
export const COMPORTAMENTO_DE_ENTRADA: Record<
  ComportamentoDeEntrada,
  { rotulo: string; consequencia: string }
> = {
  agent: {
    rotulo: 'A assistente atende',
    consequencia:
      'Quem ligar para este número conversa com a assistente, com o roteiro publicado.',
  },
  forward: {
    rotulo: 'Encaminha para outro número',
    consequencia:
      'A ligação recebida toca no número de destino. A assistente não atende.',
  },
  voicemail: {
    rotulo: 'Grava recado',
    consequencia:
      'Quem ligar ouve uma mensagem curta e pode deixar recado. Ninguém atende na hora.',
  },
}

const RECUSA_DO_DESTINO: Record<RecusaDoCampo, string> = {
  ...RECUSA_DO_TELEFONE,
  destino_obrigatorio:
    'Escreva o número de destino. Encaminhar sem destino deixa quem ligou no silêncio.',
}

export const numeros = {
  excluir: {
    acao: 'Excluir linha',
    titulo: 'Excluir esta linha?',
    explicacao:
      'A conta deixa de discar por ela na hora, e ligação recebida neste número deixa de ser atendida. As chamadas já registradas continuam na lista.',
    confirmar: 'Excluir',
    cancelar: 'Manter',
    excluindo: 'Excluindo',
    aindaNoProvedor:
      'A linha saiu daqui, mas o número continua apontando para esta instalação no painel da telefonia. Refaça o apontamento lá se for usá-lo em outro lugar.',
    falhas: {
      'sem-permissao':
        'Excluir linha é de quem administra a conta. Peça a quem administra.',
      'falha-de-comunicacao':
        'Não foi possível falar com o servidor. Tente de novo.',
    },
  },

  titulo: 'Números',
  explicacao:
    'As linhas por onde a assistente liga e atende. Cada uma tem o comportamento de entrada, o teto diário e o rodízio.',

  carregando: 'Carregando as linhas telefônicas.',

  falhas: {
    'sem-permissao':
      'Seu papel não permite alterar as linhas. Quem administra a conta pode fazer isso.',
    'sem-conta':
      'Seu usuário não pertence a nenhuma conta. Peça um convite a quem administra.',
    'numero-repetido':
      'Este número já está cadastrado nesta conta. Confira a lista acima.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Confira a conexão e tente de novo.',
  } satisfies Record<MotivoDeFalhaDeNumeros, string>,

  leitura: {
    aviso:
      'Você vê as linhas em leitura. Cadastrar número, trocar o comportamento de entrada e mexer na saída ou no rodízio são decisões de quem administra a conta.',
  },

  vazio: {
    titulo: 'Nenhum número cadastrado',
    explicacao:
      'Sem número, a assistente não liga e ninguém consegue ligar para ela. O número é um dos passos da configuração inicial.',
    irParaConfiguracao: 'Abrir a configuração inicial',
  },

  cadastrar: {
    abrir: 'Cadastrar número',
    titulo: 'Novo número',
    apoio:
      'O número é registrado no provedor assim que você gravar. A linha já aparece na lista enquanto a operadora não libera.',
    numero: 'Número',
    numeroExemplo: '(11) 4000-1234',
    rotulo: 'Nome da linha',
    rotuloExemplo: 'Linha comercial',
    rotuloExplicacao:
      'É como a linha aparece no discador manual. Uma lista de números crus não diz qual escolher.',
    comportamento: 'Quando alguém liga para este número',
    destino: 'Número de destino',
    destinoExemplo: '(11) 99999-8888',
    gravar: 'Cadastrar e registrar',
    gravando: 'Registrando',
    cancelar: 'Cancelar',
    recusas: {
      numero: RECUSA_DO_TELEFONE satisfies Record<MotivoDeRecusa, string>,
      rotulo: 'Dê um nome à linha.',
      destino: RECUSA_DO_DESTINO,
    },
  },

  registro: {
    registrada: 'Número registrado no provedor. A linha já liga e atende.',
    aguardando:
      'Pedido enviado à operadora. A linha fica aguardando a aprovação, e você pode seguir configurando o resto.',
    naoRegistrada:
      'A linha foi gravada, mas o provedor não registrou o número.',
    registrarDeNovo: 'Registrar de novo',
    registrando: 'Registrando',
  },

  estados: {
    ativa: 'Ativa',
    aguardando_operadora: 'Aguardando aprovação da operadora',
    desligada: 'Desligada',
  } satisfies Record<EstadoDaLinha, string>,

  aguardandoExplicacao:
    'É o estado normal de um número novo. O pacote regulatório da operadora leva alguns dias e não depende de você. Enquanto isso, a conta segue configurando o resto.',
  desligadaExplicacao:
    'Linha desligada não disca nem atende. O histórico das chamadas dela continua.',

  cartao: {
    numero: 'Número',
    provedor: 'Provedor',
    entrada: 'Ligação recebida',
    destino: 'Destino',
    teto: 'Teto diário',
    tetoValor: (teto: number) =>
      teto === 1 ? '1 discagem por dia' : `${teto} discagens por dia`,
    saude: 'Saúde',
    saudeExplicacao:
      'Medida pelo servidor a partir da taxa de atendimento das últimas tentativas. Não é editável.',
    semHistorico: 'Ainda sem histórico suficiente',
    saudeValor: (taxa: number, tentativas: number) =>
      `${Math.round(taxa * 100)}% de atendimento em ${tentativas} tentativas`,
    saida: 'Liga para fora',
    saidaLigada:
      'A linha serve de origem para as ligações da assistente.',
    saidaDesligada:
      'A linha só recebe ligações. Nenhuma discagem sai por ela.',
    rodizio: 'No rodízio',
    rodizioLigado:
      'A linha pode ser escolhida como origem na hora de discar.',
    rodizioDesligado:
      'Fora do rodízio, a linha não é escolhida como origem na guarda de discagem.',
    salvando: 'Gravando',
  },
} as const
