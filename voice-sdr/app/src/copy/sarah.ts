import {
  ESTADOS_DE_PUBLICACAO,
  type EstadoDePublicacao,
} from '@compartilhado/agente/compilador.ts'
import { MARCADORES_DA_PRIMEIRA_FALA } from '@compartilhado/agente/primeira-fala.ts'

import { nomeOuAssistente } from '@/copy/assistente'
import type { EstadoDoIndicador } from '@/sarah/playbooks'
import type {
  EstadoDaVersao,
  MotivoDeFalhaDaSarah,
  Proposito,
  ResultadoDoProposito,
} from '@/sarah/tipos'

/** Os três estados de RF-311 em português, para o selo e para a lista. */
export const PUBLICACAO_EM_PORTUGUES = {
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  alteracoes_pendentes: 'Alterações pendentes',
} satisfies Record<EstadoDePublicacao, string>

/**
 * O que cada variável da primeira fala vale, para quem escreve a abertura.
 *
 * A lista de variáveis não está aqui: ela vem de
 * `@compartilhado/agente/primeira-fala.ts`, que é quem a publicação e a amostra
 * de voz consultam. Aqui ficam só as explicações, e
 * `VARIAVEIS_DISPONIVEIS` cruza as duas. Variável nova do compilador aparece na
 * tela sozinha; sem explicação escrita ela aparece sem explicação, e é isso que
 * `sarah-identidade.test.tsx` cobra.
 */
const EXPLICACAO_DA_VARIAVEL: Record<string, string> = {
  nome_do_agente: 'O nome que você deu à assistente.',
  empresa: 'O nome da sua empresa.',
  nunca_afirmar: 'A lista do que ela nunca afirma, separada por ponto e vírgula.',
  nome_do_lead: 'O nome de quem atende. Vem do lead no momento da ligação.',
  empresa_do_lead: 'A empresa do lead.',
  cidade_do_lead: 'A cidade do lead.',
  nome_do_especialista: 'O especialista que vai assumir a conversa.',
}

export interface VariavelDaPrimeiraFala {
  chave: string
  /** Como ela se escreve no campo. */
  marcador: string
  explicacao: string
}

export const VARIAVEIS_DISPONIVEIS: readonly VariavelDaPrimeiraFala[] =
  MARCADORES_DA_PRIMEIRA_FALA.map((chave) => ({
    chave,
    marcador: `{${chave}}`,
    explicacao: EXPLICACAO_DA_VARIAVEL[chave] ?? '',
  }))

export const identidadeDaSarah = {
  titulo: 'Identidade',
  /** Com o nome gravado, a frase o usa; antes dele, "a assistente". */
  explicacao: (nome: string | null) =>
    `Quem a ${nomeOuAssistente(nome)} diz que é nos primeiros dez segundos: nome, empresa, o que você oferece, o que ela nunca afirma e a abertura da ligação.`,

  carregando: 'Carregando a identidade da assistente.',

  falhas: {
    'sem-permissao': 'Você não tem permissão para esta ação nesta conta.',
    'sem-conta': 'Seu acesso ainda não está ligado a nenhuma conta.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Tente de novo em alguns minutos.',
  } satisfies Record<MotivoDeFalhaDaSarah, string>,

  vazio: {
    titulo: 'A assistente desta conta ainda não tem identidade',
    explicacao:
      'Escreva o nome, a empresa e a abertura. É o que o lead ouve antes de decidir se continua na linha.',
    montar: 'Escrever a identidade',
    assistente: 'Prefere começar pelo começo?',
    irParaAssistente: 'Abrir a configuração inicial',
  },

  secoes: {
    quemEla: 'Quem ela é',
    limites: 'O que ela nunca afirma',
    abertura: 'A primeira fala',
    porCanal: 'Por canal',
  },

  /**
   * A mesma assistente na ligação e no WhatsApp, com o que muda entre os dois.
   * O que está aqui vai ao ar na publicação, nos dois canais juntos.
   */
  porCanal: {
    explicacao:
      'A assistente é uma só na ligação e no WhatsApp: nome, empresa, roteiro e restrições valem nos dois canais. Aqui fica o que muda entre eles. Tudo vai ao ar quando você publica, e até lá os dois canais seguem com a versão publicada.',
    aberturaDoWhatsapp: 'Abertura no WhatsApp',
    aberturaDoWhatsappExplicacao:
      'A primeira mensagem quando a assistente inicia a conversa. No aviso antes da ligação, ela vem seguida de "Estou te ligando agora, tudo bem?", a menos que a conta tenha escrito um aviso próprio. Aceita as mesmas variáveis da abertura da ligação. Em branco, vale a abertura padrão.',
    previaDoWhatsapp: 'Como o lead lê',
    jeitoNaVoz: 'Jeito na ligação',
    jeitoNaVozExemplo: 'Fale devagar ao dizer números e confirme o e-mail soletrando.',
    jeitoNaVozExplicacao:
      'Somado ao jeito da casa do roteiro, só na ligação. Em branco, vale só o jeito da casa.',
    jeitoNoWhatsapp: 'Jeito no WhatsApp',
    jeitoNoWhatsappExemplo: 'Mensagens de até duas frases, sem emoji.',
    jeitoNoWhatsappExplicacao:
      'Somado ao jeito da casa do roteiro, só nas mensagens. Em branco, vale só o jeito da casa.',
  },

  campos: {
    nome: 'Nome da assistente',
    nomeExemplo: 'Ana',
    empresa: 'Empresa',
    empresaExemplo: 'Vexo Tecnologia',
    oferta: 'O que você oferece',
    ofertaExemplo: 'roteirização para transportadoras de 20 a 200 veículos',
    ofertaExplicacao:
      'Uma frase que diz o que o produto faz. Entra no roteiro das quatro publicações.',
    destino: 'Para quem transferir',
    destinoExemplo: '+55 11 3030-1020',
    destinoExplicacao:
      'Para onde a ligação vai quando o lead pede uma pessoa. Sem destino, o pedido vira item em Precisam de você, com o trecho da conversa, para alguém retornar.',
    primeiraFala: 'Abertura da ligação',
    primeiraFalaExplicacao:
      'Escreva como se fala. As variáveis entre chaves são trocadas pelo valor real no momento da ligação.',
  },

  nuncaAfirmar: {
    explicacao:
      'Cada item vira uma restrição explícita no roteiro das quatro publicações. Vazia é o padrão.',
    lista: 'O que a assistente nunca afirma',
    vazia: 'Nenhuma restrição registrada.',
    campo: 'Nova restrição',
    exemplo: 'garantia de resultado',
    acrescentar: 'Acrescentar',
    remover: (item: string) => `Remover ${item}`,
  },

  previa: {
    titulo: 'Como o lead ouve',
    vazia: 'Escreva a abertura para ver a prévia.',
    explicacao:
      'Prévia com o lead de exemplo Marcos Ferreira, da Fluxo Cargo. Na ligação os valores são os do lead.',
  },

  variaveis: {
    titulo: 'Variáveis disponíveis',
    explicacao: 'Escreva a variável entre chaves, como no exemplo.',
  },

  recusa: {
    variavelDesconhecida: (desconhecidas: readonly string[]) =>
      `${desconhecidas.length === 1 ? 'A variável' : 'As variáveis'} ${desconhecidas
        .map((item) => `{${item}}`)
        .join(', ')} não ${
        desconhecidas.length === 1 ? 'existe' : 'existem'
      }. Disponíveis: ${VARIAVEIS_DISPONIVEIS.map((item) => item.marcador).join(', ')}.`,
  },

  publicacao: {
    rotulo: 'Estado da publicação',
    publicar: 'Ir para a publicação',
    rascunho:
      'A assistente ainda não foi publicada. Nenhuma ligação usa o que está escrito aqui.',
    publicado:
      'O que está no ar é o que está gravado aqui. A próxima ligação usa esta configuração.',
    alteracoes_pendentes:
      'O que está gravado aqui é mais novo do que o que está no ar. Publique para a mudança chegar à próxima ligação.',
  } satisfies Record<EstadoDePublicacao | 'rotulo' | 'publicar', string>,

  // Só o aviso de abertura: "peça acesso a" e "esta conta não tem
  // administrador" são as mesmas em toda tela em leitura, e moram em
  // `copy/comum.ts`, que é o que `NegativaPorPapel` lê.
  leitura: {
    aviso:
      'Você vê a identidade da assistente em leitura. Nome, empresa, oferta, restrições e abertura são definidos por quem administra a conta.',
  },

  gravar: 'Salvar identidade',
  gravando: 'Salvando',
  salvo: 'Identidade salva.',
} as const

/** Os estados que o selo sabe desenhar. Existe para o teste varrer os três. */
export const ESTADOS_DA_PUBLICACAO = ESTADOS_DE_PUBLICACAO

/**
 * `/sarah/voz` (RF-302, RF-303, RF-304).
 *
 * Os quatro estados do servidor têm frase e saída próprias de propósito.
 * `erro` é "a chave foi recusada" e manda conferir a chave; `indisponivel` é
 * "o provedor não respondeu" e manda tentar de novo. Fundir os dois num
 * "deu problema" faria metade das pessoas mexer numa chave que está boa e a
 * outra metade esperar por um provedor que já respondeu.
 */
export const vozDaSarah = {
  titulo: 'Voz',
  explicacao:
    'A voz que o lead ouve. Escute a sua abertura em cada voz, ajuste a velocidade e a estabilidade, e escolha ouvindo — não lendo um nome de catálogo.',

  carregando: 'Carregando as vozes em português do provedor.',

  falhas: {
    'sem-permissao': 'Você não tem permissão para esta ação nesta conta.',
    'sem-conta': 'Seu acesso ainda não está ligado a nenhuma conta.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Tente de novo em alguns minutos.',
  } satisfies Record<MotivoDeFalhaDaSarah, string>,

  semIdentidade: {
    titulo: 'A assistente desta conta ainda não tem identidade',
    explicacao:
      'A amostra é a abertura que você escreveu, dita pela voz escolhida. Sem identidade não há abertura, e não há onde gravar a voz.',
    acao: 'Escrever a identidade',
    endereco: '/sarah/identidade',
  },

  naoConfigurado: {
    titulo: 'Nenhuma chave cadastrada para o provedor de voz',
    explicacao:
      'O catálogo de vozes é a biblioteca da sua conta no provedor. Cadastre a chave em Integrações para vê-la.',
    acao: 'Cadastrar a chave',
    endereco: '/config/integracoes',
  },

  erro: {
    titulo: 'O provedor de voz recusou a chave desta conta',
    explicacao:
      'A chave cadastrada não foi aceita. Confira o valor em Integrações: tentar de novo com a mesma chave devolve a mesma recusa.',
    acao: 'Conferir a chave',
    endereco: '/config/integracoes',
  },

  indisponivel: {
    titulo: 'O provedor de voz não respondeu',
    explicacao:
      'A chave está cadastrada e nada aponta para ela. É o provedor que está fora do ar ou lento agora.',
    acao: 'Tentar de novo',
  },

  lista: {
    titulo: 'Vozes em português',
    rotulo: 'Vozes em português',
    vazia: {
      titulo: 'Nenhuma voz em português na biblioteca desta conta',
      explicacao:
        'O provedor respondeu, e nenhuma das vozes da sua conta declara português. Acrescente uma voz em português na conta do provedor.',
    },
    ignoradas: (quantas: number) =>
      quantas === 1
        ? '1 voz do provedor ficou de fora por não declarar português.'
        : `${quantas} vozes do provedor ficaram de fora por não declarar português.`,
    escolhida: 'Voz em uso',
  },

  voz: {
    ouvir: (nome: string) => `Ouvir ${nome}`,
    /** O texto à vista no botão; o nome inteiro vai no rótulo acessível. */
    ouvirCurto: 'Ouvir',
    gerando: 'Gerando a amostra',
    semGenero: 'gênero não declarado',
    generos: {
      feminina: 'feminina',
      masculina: 'masculina',
      neutra: 'neutra',
    },
  },

  amostra: {
    titulo: 'Como o lead ouve',
    promessa:
      'Você vai ouvir a sua abertura, não uma frase de catálogo. A amostra é a primeira fala desta conta, com o lead de exemplo no lugar das variáveis.',
    audio: 'Amostra da primeira fala',
    convite: 'Escolha uma voz e clique em ouvir para escutar a sua abertura.',
    falha:
      'Não foi possível pedir a amostra ao servidor. Tente de novo em alguns minutos.',
  },

  ajustes: {
    titulo: 'Ajustes desta voz',
    explicacao:
      'Mexer num controle refaz a amostra: ajuste que não é audível não é ajuste.',
    valor: (valor: number) => valor.toFixed(2).replace('.', ','),
  },

  escolher: {
    acao: 'Usar esta voz',
    gravando: 'Salvando',
    salvo: 'Voz salva. Publique para ela valer na próxima ligação.',
  },

  leitura: {
    aviso:
      'Você vê a voz da assistente em leitura. Ouvir as amostras é livre; escolher a voz é de quem administra a conta.',
  },
} as const

/** Os quatro propósitos em português. A chave é a do dado, em inglês. */
export const PROPOSITO_EM_PORTUGUES = {
  discovery: 'Descoberta',
  reminder: 'Lembrete',
  rescue: 'Resgate',
  followup: 'Retomada',
} satisfies Record<Proposito, string>

/** Os três estados de `playbook_versions.status`. */
export const VERSAO_EM_PORTUGUES = {
  draft: 'Rascunho',
  published: 'No ar',
  archived: 'Arquivada',
} satisfies Record<EstadoDaVersao, string>

/**
 * `/sarah/playbooks` (RF-306, RF-307, RF-311, R-06, O-06).
 *
 * Salvar e publicar têm frases separadas de propósito: salvar grava um
 * rascunho que nenhuma ligação usa, e publicar é o ato que muda o que a Sarah
 * fala. Uma frase só para os dois é como a pessoa descobre que publicou sem
 * querer, ou que não publicou achando que sim.
 */
export const playbooksDaSarah = {
  titulo: 'Playbooks',
  explicacao: (nome: string | null) =>
    `O roteiro de cada propósito, em três camadas. Salvar grava um rascunho; só publicar muda o que a ${nomeOuAssistente(nome)} diz na próxima ligação.`,

  carregando: 'Carregando os roteiros da assistente.',

  falhas: {
    'sem-permissao': 'Você não tem permissão para esta ação nesta conta.',
    'sem-conta': 'Seu acesso ainda não está ligado a nenhuma conta.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Tente de novo em alguns minutos.',
  } satisfies Record<MotivoDeFalhaDaSarah, string>,

  seletor: 'Propósito',

  indicador: {
    rotulo: 'Estado da publicação',
    selos: {
      ...PUBLICACAO_EM_PORTUGUES,
      alterado_fora_da_plataforma: 'Alterado fora da plataforma',
    },
    rascunho:
      'A assistente ainda não foi publicada. Nenhuma ligação usa estes roteiros.',
    publicado:
      'O que está no ar é o que está publicado aqui nos quatro propósitos.',
    alteracoes_pendentes:
      'O que está no ar não é o que está publicado aqui. Republique para a próxima ligação usar a configuração atual.',
    alterado_fora_da_plataforma:
      'Alguém mudou a assistente direto no painel do provedor de voz. A ligação usa essa configuração, e não a daqui, até você republicar.',
    propositosAlterados: (nomes: readonly string[]) =>
      `${nomes.length === 1 ? 'Propósito alterado' : 'Propósitos alterados'}: ${nomes.join(', ')}.`,
    republicar: 'Republicar a assistente',
    republicando: 'Republicando',
  } satisfies Record<
    EstadoDoIndicador | 'rotulo' | 'selos' | 'propositosAlterados' | 'republicar' | 'republicando',
    unknown
  >,

  semAgenda: {
    titulo: 'Sem agenda ligada, a assistente não marca reunião',
    texto:
      'A agenda ainda não está ligada à assistente nesta conta. A assistente levanta a dor e pergunta o melhor horário para o especialista procurar; ela não oferece horário nem marca reunião. Não escreva no roteiro uma promessa de agendamento, porque nada a cumpre.',
  },

  vazio: {
    titulo: 'Nenhuma versão publicada neste propósito',
    explicacao:
      'Escreva o roteiro abaixo e publique, ou gere um rascunho a partir da descrição do seu negócio e revise antes de publicar.',
    campoDeDescricao: 'Descrição do negócio (opcional)',
    apoioDoCampoDeDescricao:
      'O que vende, para quem e qual problema resolve. Em branco, o modelo lê o que já está em Identidade.',
    gerar: 'Gerar um rascunho',
    gerando: 'Gerando o rascunho',
    gerado: 'Rascunho gerado no campo do roteiro. Revise e salve.',
  },

  camadaUm: {
    titulo: 'Camada 1: regras da casa',
    selo: 'Travada',
    versao: (versao: number) => `Versão ${versao}`,
    explicacao:
      'Valem para toda assistente, de toda conta: aviso de gravação, o que ela nunca afirma, pessoa errada e pedido de bloqueio. Não se editam aqui porque uma conta que pudesse apagar o aviso de gravação não teria aviso de gravação.',
    rotulo: 'Texto da camada 1',
  },

  camadaDois: {
    titulo: 'Camada 2: roteiro do propósito',
    explicacao:
      'O que a assistente faz nesta ligação: como conduz, o que pergunta e como fecha. Publicar exige roteiro escrito.',
    campo: 'Roteiro do propósito',
  },

  camadaTres: {
    titulo: 'Camada 3: jeito da casa',
    explicacao:
      'Livre: tom, palavras que a sua empresa usa e evita, como tratar quem atende. Vazia é normal.',
    campo: 'Jeito da casa',
  },

  salvar: 'Salvar rascunho',
  salvando: 'Salvando',
  salvo: (versao: number) =>
    `Rascunho da versão ${versao} salvo. Ele ainda não está no ar.`,
  rascunhoPendente: (versao: number) =>
    `Há um rascunho salvo na versão ${versao} que ainda não foi publicado.`,
  salveAntes: 'Salve o rascunho antes de publicar.',

  publicar: {
    acao: (versao: number) => `Publicar versão ${versao}`,
    titulo: (versao: number) => `Publicar a versão ${versao}`,
    explicacao:
      'A versão vai ao ar no banco e a assistente é publicada no provedor de voz nos quatro propósitos. A próxima ligação usa o que estiver no ar.',
    nota: 'Por que esta versão existe',
    notaExplicacao:
      'Obrigatória. É o que alguém lê no histórico meses depois, em vez de comparar dois textos longos.',
    confirmar: 'Publicar',
    publicando: 'Publicando',
    cancelar: 'Cancelar',
  },

  relatorio: {
    titulo: 'Resultado da publicação',
    rotulo: 'Resultado por propósito',
    versao: (versao: number) => `Versão ${versao} publicada no banco.`,
    resumo: (publicados: number, total: number) =>
      `${publicados} de ${total} propósitos no ar com a configuração atual.`,
    estados: {
      publicado: 'Publicado',
      inalterado: 'Já estava no ar',
      falha: 'Falhou',
    } satisfies Record<ResultadoDoProposito['estado'], string>,
    recusa: 'O provedor de voz não recebeu nada:',
  },

  historico: {
    titulo: 'Histórico de versões',
    rotulo: 'Versões deste propósito',
    colunas: {
      versao: 'Versão',
      estado: 'Estado',
      nota: 'Nota',
      publicadaEm: 'Publicada em',
    },
    semNota: 'Sem nota',
    nuncaPublicada: 'Não publicada',
    versao: (versao: number) => `v${versao}`,
  },

  comparacao: {
    titulo: 'Comparar versões',
    de: 'De',
    para: 'Para',
    rotulo: 'Diferença entre as versões',
    semDiferenca: 'As duas versões têm o mesmo texto.',
    poucasVersoes: 'A comparação aparece quando o propósito tiver duas versões.',
    camadaDois: 'Roteiro do propósito',
    camadaTres: 'Jeito da casa',
    removida: 'Removida',
    acrescentada: 'Acrescentada',
  },

  leitura: {
    aviso:
      'Você vê os roteiros e o histórico em leitura. Editar e publicar é de quem administra a conta.',
  },
} as const
