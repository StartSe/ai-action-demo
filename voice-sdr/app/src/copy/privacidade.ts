// Textos de /config/privacidade (RF-806, RF-807, L-18, P-10).
//
// O QUE ESTA TELA NÃO FAZ, e por quê. Exclusão dos dados de um lead sob
// solicitação (RF-808, L-10) e exportação dos dados de um lead para ele mesmo
// (RF-809) são de fatia seguinte: dependem de `lead-erase`, que apaga a
// conversa também no provedor de voz, e ela ainda não existe. Nenhum botão
// delas aparece aqui, nem desabilitado: controle que não faz nada promete um
// direito que o produto ainda não entrega.

import type { MotivoDaRetencao } from '@/privacidade/privacidade'
import type {
  CampoDaPrivacidade,
  MotivoDeFalhaDaPrivacidade,
  PrivacidadeDaConta,
} from '@/privacidade/tipos'

const INTEIRO = new Intl.NumberFormat('pt-BR')

const ROTULOS: Readonly<Record<CampoDaPrivacidade, string>> = {
  gravacaoLigada: 'Gravação das ligações',
  avisoDeGravacao: 'Aviso de gravação',
  retencaoDias: 'Prazo de retenção',
}

function dias(numero: number): string {
  return numero === 1 ? '1 dia' : `${INTEIRO.format(numero)} dias`
}

function chamadas(numero: number): string {
  return numero === 1 ? '1 chamada' : `${INTEIRO.format(numero)} chamadas`
}

function valorDoCampo(campo: CampoDaPrivacidade, privacidade: PrivacidadeDaConta): string {
  switch (campo) {
    case 'gravacaoLigada':
      return privacidade.gravacaoLigada ? 'ligada' : 'desligada'
    case 'avisoDeGravacao':
      return privacidade.avisoDeGravacao === null ? 'frase padrão' : 'texto da conta'
    case 'retencaoDias':
      return dias(privacidade.retencaoDias)
  }
}

export const privacidade = {
  titulo: 'Privacidade',
  explicacao:
    'Gravação das ligações, o aviso que a assistente dá no começo de cada uma e por quanto tempo gravação e transcrição ficam guardadas.',

  carregando: 'Carregando a privacidade da conta.',

  leitura: {
    aviso:
      'Você vê a privacidade da conta em leitura. Gravação, aviso e retenção são definidos pelo dono da conta, porque mudam o que a conta guarda sobre cada lead.',
    pedirAcesso: 'Para mudar, fale com o dono da conta:',
    semDono: 'Esta conta não tem dono registrado. Fale com o suporte.',
  },

  falhas: {
    'sem-permissao':
      'Sua sessão não tem permissão para alterar a privacidade desta conta. Só o dono altera.',
    'sem-conta': 'Sua sessão não está ligada a nenhuma conta.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Confira a conexão e tente de novo.',
    'valor-recusado':
      'O servidor recusou um dos valores. Confira os campos e tente de novo.',
  } satisfies Record<MotivoDeFalhaDaPrivacidade, string>,

  vazio: {
    titulo: 'Esta conta ainda não tem configuração de privacidade',
    explicacao:
      'A configuração nasce junto com a conta. Fale com o suporte para criá-la.',
  },

  rotulos: ROTULOS,

  gravacao: {
    ligar: 'Gravar as ligações desta conta',
    ligada: 'Gravação ligada. O áudio de cada ligação fica guardado pelo prazo de retenção.',
    desligada: 'Gravação desligada. Nem aqui nem no provedor de voz o áudio fica guardado.',
    noPainel: {
      titulo: 'Desligada aqui, ainda gravando no provedor',
      explicacao:
        'A gravação só para no provedor de voz depois de republicar a assistente. Até lá, as ligações continuam gravadas lá.',
      propositos: (quantos: number) =>
        quantos === 1
          ? '1 propósito está no ar com a configuração anterior.'
          : `${quantos} propósitos estão no ar com a configuração anterior.`,
    },
    exigeRepublicar:
      'Desligar a gravação exige republicar a assistente. Salvar muda só esta conta; o provedor continua gravando até a republicação.',
    republicar: 'Republicar a assistente',
    republicando: 'Republicando',
    republicada: 'Assistente republicada.',
    falhaAoRepublicar: 'Não foi possível republicar agora. Tente de novo em instantes.',
  },

  aviso: {
    explicacao:
      'A primeira coisa que a assistente diz em toda ligação gravada. Em branco, vale a frase padrão.',
    exemplo: 'Oi, {nome_do_lead}? Aqui é a {nome_do_agente}, da {empresa}. Esta ligação é gravada, tudo bem?',
    marcadores: 'Pode usar {nome_do_lead}, {nome_do_agente} e {empresa}.',
    previa: 'Como a ligação começa',
    previaComLead: 'Com o lead de exemplo, a assistente abre assim:',
    semAviso: 'Com a gravação desligada, a assistente não fala de gravação.',
  },

  retencao: {
    unidade: 'dias',
    padrao: 'O padrão é 90 dias.',
    explicacao:
      'Depois do prazo, gravação e transcrição são apagadas na execução diária do expurgo, no nosso armazenamento e no provedor de voz. O expurgo é irreversível. A chamada continua na lista com duração, custo e classificação.',
    erros: {
      'nao-numero': 'Escreva o prazo em dias, só números.',
      'fora-da-faixa': 'O prazo vai de 1 a 3.650 dias.',
    } satisfies Record<MotivoDaRetencao, string>,
    contando: 'Contando as chamadas que o prazo novo alcança.',
    foraDoPrazo: (quantas: number, prazo: number) =>
      quantas === 0
        ? `Nenhuma chamada passa do prazo de ${dias(prazo)}. Nada será expurgado por causa desta mudança.`
        : `${chamadas(quantas)} ${quantas === 1 ? 'passa' : 'passam'} do prazo de ${dias(prazo)} e ${quantas === 1 ? 'será expurgada' : 'serão expurgadas'} na próxima execução diária.`,
    falhaAoContar:
      'Não foi possível contar as chamadas alcançadas pelo prazo novo. Tente de novo antes de salvar.',
    confirmar: 'Entendo que o expurgo é irreversível',
  },

  motivo: {
    rotulo: 'Motivo da mudança',
    exemplo: 'pedido do jurídico',
    explicacao: 'O motivo vai para a auditoria junto com o seu nome.',
    faltando: 'Escreva o motivo antes de salvar.',
  },

  salvar: 'Salvar privacidade',
  salvando: 'Salvando',
  nadaMudou: 'Nada mudou em relação ao que está gravado.',
  confirmarExpurgo: 'Confirme que entende o expurgo antes de salvar o prazo menor.',

  confirmacao: {
    titulo: 'Privacidade gravada. O que mudou:',
    linha: (campo: CampoDaPrivacidade, antes: PrivacidadeDaConta, depois: PrivacidadeDaConta) =>
      `${ROTULOS[campo]}: ${valorDoCampo(campo, antes)} → ${valorDoCampo(campo, depois)}`,
    valor: valorDoCampo,
  },
} as const
