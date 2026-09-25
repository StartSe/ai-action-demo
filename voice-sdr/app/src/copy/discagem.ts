import type { MotivoDoCampo, QuemLimita } from '@/discagem/politica'
import type {
  CampoDaPolitica,
  FaltaNoPortao,
  MotivoDeFalhaDaDiscagem,
  PoliticaDeDiscagem,
} from '@/discagem/tipos'

const NOME_DO_DIA: Readonly<Record<string, string>> = {
  '0': 'Domingo',
  '1': 'Segunda-feira',
  '2': 'Terça-feira',
  '3': 'Quarta-feira',
  '4': 'Quinta-feira',
  '5': 'Sexta-feira',
  '6': 'Sábado',
}

const DIA_CURTO: Readonly<Record<string, string>> = {
  '0': 'dom',
  '1': 'seg',
  '2': 'ter',
  '3': 'qua',
  '4': 'qui',
  '5': 'sex',
  '6': 'sáb',
}

const INTEIRO = new Intl.NumberFormat('pt-BR')
const DATA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' })

/**
 * As duas condições do portão, cada uma com o que diz quando está cumprida,
 * quando falta e o caminho para resolver. Separadas de propósito: uma frase só
 * dizendo "não liberado" esconderia qual das duas falta.
 */
const CONDICOES_DO_PORTAO: Readonly<
  Record<FaltaNoPortao, { rotulo: string; pendente: string; caminho: string }>
> = {
  liberacao_da_fase: {
    rotulo: 'Liberação da instalação',
    pendente: 'A instalação ainda não liberou a discagem para lead real nesta conta.',
    caminho:
      'Esta liberação não depende de você. Se a conta continuar restrita depois da ligação de teste, fale com quem fez a instalação ou com o suporte.',
  },
  primeira_chamada_de_teste: {
    rotulo: 'Ligação de teste',
    pendente: 'A conta ainda não fez uma ligação de teste que termine com transcrição.',
    caminho:
      'Cadastre seu número na lista de teste e ligue para ele pelo discador do painel. Atenda e converse com a assistente: a ligação conta quando termina com fala na transcrição.',
  },
}
const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Rótulo, unidade e consequência de cada campo. A consequência é o que
 * acontece quando o limite é atingido, em uma linha: limite sem consequência
 * escrita é número que ninguém sabe escolher.
 */
const CAMPOS: Readonly<
  Record<CampoDaPolitica, { rotulo: string; unidade?: string; consequencia: string }>
> = {
  janela: {
    rotulo: 'Janela de discagem',
    consequencia:
      'Fora da faixa a assistente não liga, e a ligação espera a próxima abertura. Sempre no horário do lead, não no seu.',
  },
  intervaloMinimoMinutos: {
    rotulo: 'Intervalo mínimo entre tentativas',
    unidade: 'minutos',
    consequencia:
      'Antes do intervalo, uma nova tentativa ao mesmo número é recusada e espera o horário em que ele libera.',
  },
  tentativasPorNumero: {
    rotulo: 'Tentativas por dia ao mesmo número',
    unidade: 'tentativas',
    consequencia:
      'No limite, o número não recebe outra ligação até o dia seguinte. Caixa postal e não atendida contam.',
  },
  tetoDiarioDeLigacoes: {
    rotulo: 'Teto diário de ligações da conta',
    unidade: 'ligações',
    consequencia: 'Atingido, a discagem da conta fica bloqueada até o dia seguinte.',
  },
  tetoDeGastoCentavos: {
    rotulo: 'Teto de gasto do dia',
    unidade: 'reais',
    consequencia:
      'Atingido, a conta para de ligar até o dia seguinte. Em branco, a conta fica sem teto de gasto.',
  },
  duracaoMaximaSegundos: {
    rotulo: 'Duração máxima da chamada',
    unidade: 'segundos',
    consequencia: 'Atingida, a chamada em curso é encerrada e o custo dela para de correr.',
  },
  simultaneidade: {
    rotulo: 'Chamadas simultâneas',
    unidade: 'chamadas',
    consequencia: 'No limite, a próxima ligação espera uma das chamadas em curso terminar.',
  },
}

function resumoDaJanela(janela: PoliticaDeDiscagem['janela']): string {
  const dias = ['1', '2', '3', '4', '5', '6', '0'].filter((dia) => janela[dia])
  if (dias.length === 0) return 'nenhum dia'
  return dias
    .map((dia) => `${DIA_CURTO[dia]} ${janela[dia]!.start} às ${janela[dia]!.end}`)
    .join(', ')
}

function valorDoCampo(campo: CampoDaPolitica, politica: PoliticaDeDiscagem): string {
  switch (campo) {
    case 'janela':
      return resumoDaJanela(politica.janela)
    case 'intervaloMinimoMinutos':
      return `${INTEIRO.format(politica.intervaloMinimoMinutos)} min`
    case 'tentativasPorNumero':
      return `${INTEIRO.format(politica.tentativasPorNumero)} por dia`
    case 'tetoDiarioDeLigacoes':
      return `${INTEIRO.format(politica.tetoDiarioDeLigacoes)} ligações`
    case 'tetoDeGastoCentavos':
      return politica.tetoDeGastoCentavos === null
        ? 'sem teto'
        : MOEDA.format(politica.tetoDeGastoCentavos / 100)
    case 'duracaoMaximaSegundos':
      return `${INTEIRO.format(politica.duracaoMaximaSegundos)} s`
    case 'simultaneidade':
      return `${INTEIRO.format(politica.simultaneidade)} chamadas`
  }
}

const NOME_DO_LIMITE: Record<Exclude<QuemLimita, 'coluna' | 'ambos'>, string> = {
  voz: 'as sessões simultâneas do provedor de voz',
  telefonia: 'os canais da telefonia',
}

export const discagem = {
  portao: {
    titulo: 'Discagem para lead real',
    carregando: 'Conferindo se a discagem para lead real está liberada.',
    liberado: 'Liberado',
    liberadoExplicacao:
      'As duas condições estão cumpridas. A assistente liga para lead real dentro da política de discagem da conta.',
    restrito: 'Restrito aos números de teste',
    restritoExplicacao:
      'Enquanto faltar uma das condições abaixo, a guarda recusa todo número fora da lista de teste.',
    cumprida: 'Cumprida',
    pendente: 'Pendente',
    condicoes: CONDICOES_DO_PORTAO,
    faseLiberada: 'A instalação liberou a discagem para lead real nesta conta.',
    ligacaoFeita: (quando: string | null) =>
      quando
        ? `A primeira ligação de teste terminou com transcrição em ${DATA.format(new Date(quando))}.`
        : 'A primeira ligação de teste terminou com transcrição.',
    abrirDiscador: 'Abrir o discador',
    falhas: {
      'sem-permissao': 'Sua sessão não tem permissão para ver a liberação da discagem desta conta.',
      'sem-conta': 'Sua sessão não está ligada a nenhuma conta.',
      'falha-de-comunicacao':
        'Não foi possível conferir a liberação da discagem com o servidor. Recarregue a página para tentar de novo.',
      'valor-recusado':
        'Não foi possível conferir a liberação da discagem com o servidor. Recarregue a página para tentar de novo.',
    } satisfies Record<MotivoDeFalhaDaDiscagem, string>,
  },

  numerosDeTeste: {
    titulo: 'Números de teste',
    explicacao:
      'Enquanto a discagem para lead real não estiver liberada, a assistente só liga para os números desta lista. É por aqui que se faz a primeira ligação.',
    numero: { rotulo: 'Telefone', exemplo: '(11) 99999-0001' },
    rotuloDoNumero: { rotulo: 'De quem é', exemplo: 'Meu celular' },
    acao: 'Cadastrar número de teste',
    acaoEmCurso: 'Cadastrando',
    remover: 'Tirar da lista',
    removendo: 'Tirando',
    vazio: 'Nenhum número cadastrado. Cadastre o seu para fazer a primeira ligação.',
    carregando: 'Carregando os números de teste',
    somenteLeitura:
      'Incluir e tirar números da lista é de quem administra a conta. Seu papel vê a lista.',
    falhas: {
      'numero-invalido':
        'Telefone em formato que não dá para discar. Use DDD e número, como (11) 99999-0001.',
      'rotulo-obrigatorio': 'Diga de quem é o número, para a lista fazer sentido depois.',
      'ja-cadastrado': 'Este número já está na lista.',
      'teto-atingido':
        'A lista chegou ao limite. Tire um número antes de acrescentar outro.',
      'sem-permissao':
        'Cadastrar número de teste é de quem administra a conta. Peça a quem administra.',
      'falha-de-comunicacao':
        'Não foi possível falar com o servidor. Tente de novo.',
    },
  },

  titulo: 'Política de discagem',
  explicacao:
    'A janela permitida por dia, o intervalo mínimo entre tentativas, os tetos e a duração da chamada. Vale para toda ligação que sai desta conta.',

  carregando: 'Carregando a política de discagem.',

  negativa: {
    aviso:
      'Você não tem acesso à política de discagem. Janela, intervalo e teto são definidos por quem administra a conta; seu papel permite trabalhar o funil dentro dessa política, não alterá-la.',
    pedirAcesso: 'Peça acesso a quem administra a conta:',
    semAdministrador:
      'Esta conta não tem administrador registrado. Fale com o suporte.',
  },

  falhas: {
    'sem-permissao':
      'Sua sessão não tem permissão para alterar a política desta conta. Peça a quem administra a conta.',
    'sem-conta': 'Sua sessão não está ligada a nenhuma conta.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Confira a conexão e tente de novo.',
    'valor-recusado':
      'O servidor recusou um dos valores. Confira os campos marcados e tente de novo.',
  } satisfies Record<MotivoDeFalhaDaDiscagem, string>,

  vazio: {
    titulo: 'Esta conta ainda não tem política de discagem',
    explicacao:
      'A política nasce junto com a conta. Sem ela nenhuma ligação sai daqui. Fale com o suporte para criá-la.',
  },

  campos: CAMPOS,
  /** O valor do campo como se lê, o mesmo do resumo do que mudou. */
  valor: valorDoCampo,
  dia: (dia: string) => NOME_DO_DIA[dia] ?? dia,
  inicioDe: (dia: string) => `Início de ${(NOME_DO_DIA[dia] ?? dia).toLowerCase()}`,
  fimDe: (dia: string) => `Fim de ${(NOME_DO_DIA[dia] ?? dia).toLowerCase()}`,
  exemploDeHora: '09:00',

  errosDoCampo: {
    'nao-e-numero': 'Escreva só números.',
    'fora-da-faixa': 'Valor fora do que a conta aceita para este campo.',
    'acima-do-provedor': 'Acima do limite do provedor. Reduza o valor ou amplie o contrato.',
    'hora-invalida': 'Escreva a hora como 09:00. O fim do dia é 24:00.',
    'faixa-sem-duracao': 'O fim precisa vir depois do início.',
  } satisfies Record<MotivoDoCampo, string>,

  faixaDoCampo: (minimo: number, maximo: number) =>
    `De ${INTEIRO.format(minimo)} a ${INTEIRO.format(maximo)}.`,
  diasComErro: (dias: string[]) =>
    `Confira ${dias.map((dia) => (NOME_DO_DIA[dia] ?? dia).toLowerCase()).join(', ')}.`,

  previa: {
    titulo: 'Como a janela fica para o lead',
    explicacao:
      'A janela vale no fuso de quem atende. Para um lead em Manaus, a mesma faixa começa uma hora depois no seu relógio.',
    leadEm: (fuso: string) =>
      fuso === 'America/Manaus' ? 'Lead em Manaus' : 'Lead em São Paulo',
    semDias: 'Nenhum dia marcado. Com a janela vazia, esta conta não liga.',
  },

  simultaneidade: {
    conferindo: 'Conferindo o limite do provedor.',
    manda: (quem: QuemLimita, teto: number) => {
      if (quem === 'coluna') return `O teto é ${teto}, o máximo que a conta aceita.`
      if (quem === 'ambos') {
        return `O teto é ${teto}: as sessões do provedor de voz e os canais da telefonia têm o mesmo limite.`
      }
      return `O teto é ${teto}, e quem manda são ${NOME_DO_LIMITE[quem]}.`
    },
    semConferencia:
      'Não foi possível conferir com o provedor. O campo aceita até o máximo da conta; confira o contrato antes de subir o número.',
    semLimiteDe: (provedor: 'voz' | 'telefonia') =>
      provedor === 'voz'
        ? 'O limite do provedor de voz não pôde ser lido e ficou fora da conta.'
        : 'O limite da telefonia não pôde ser lido e ficou fora da conta.',
  },

  duracao: {
    republicacao:
      'A duração nova só chega ao agente depois de republicar a assistente. Até lá, vale a que está no ar.',
    republicar: 'Republicar a assistente',
    republicando: 'Republicando',
    salveAntes: 'Salve a política no fim da página antes de republicar.',
    republicada: 'Assistente republicada. A duração gravada vale a partir da próxima ligação.',
    falhaAoRepublicar: 'Não foi possível republicar agora. Tente de novo em instantes.',
  },

  motivo: {
    rotulo: 'Motivo da mudança',
    exemplo: 'campanha de fim de mês',
    explicacao: 'O motivo vai para a auditoria junto com o seu nome.',
    faltando: 'Escreva o motivo antes de salvar.',
  },

  salvar: 'Salvar política',
  salvando: 'Salvando',
  nadaMudou: 'Nada mudou em relação à política gravada.',
  camposComErro: 'Há campos a corrigir antes de salvar.',

  confirmacao: {
    titulo: 'Política gravada. O que mudou:',
    linha: (campo: CampoDaPolitica, antes: PoliticaDeDiscagem, depois: PoliticaDeDiscagem) =>
      `${CAMPOS[campo].rotulo}: ${valorDoCampo(campo, antes)} → ${valorDoCampo(campo, depois)}`,
    lembreteDeRepublicar:
      'A duração máxima mudou. Republique a assistente para ela valer nas próximas ligações.',
  },
} as const
