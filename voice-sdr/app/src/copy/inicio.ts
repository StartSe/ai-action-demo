import type { Etapa } from '@sugestoes/sugestoes.ts'

import type { EstadoDaParte, ParteDoResumo } from '@/configuracao-inicial/aplicacao-das-sugestoes'
import type { EtapaDoInicio } from '@/configuracao-inicial/inicio'
import { nomeOuAssistente, nomeOuAssistenteNoInicio } from '@/copy/assistente'

/**
 * O assistente de abertura: o tutorial inteiro, das conexões à primeira
 * ligação de teste. Pouco texto de propósito: o título é uma palavra e a frase
 * de cada etapa cabe numa linha; o que precisa de contexto ganha um bloco
 * próprio dentro da etapa.
 *
 * O texto é função do nome da assistente: a primeira pergunta do tutorial é o
 * nome, e daí em diante ele aparece onde ela é citada. Sem nome gravado, o
 * texto diz "a assistente".
 */
export function textosDoInicio(nomeGravado: string | null) {
  const a = nomeOuAssistente(nomeGravado)
  return {
  rotulo: 'Primeiros passos',
  carregando: 'Conferindo o que já está conectado.',
  contagem: (atual: number, total: number) => `${atual} de ${total}`,
  pular: 'Pular por agora',
  voltar: 'Voltar',
  seguir: 'Seguir',

  etapas: {
    boasVindas: {
      titulo: 'Boas-vindas',
      frase: 'A sua SDR por voz, com IA.',
    },
    nome: {
      titulo: 'Nome',
      frase: 'Como a assistente se apresenta ao lead.',
    },
    plano: {
      titulo: 'Plano',
      frase: 'Três partes, uns quinze minutos. Dá para parar e voltar de onde parou.',
    },
    modelo: {
      titulo: 'Modelo',
      frase: 'Quem escreve as sugestões e revisa as ligações.',
    },
    voz: {
      titulo: 'Voz',
      frase: `Conecte a ElevenLabs e escolha como a ${a} soa.`,
    },
    telefonia: {
      titulo: 'Telefonia',
      frase: `A Twilio é a linha por onde a ${a} liga.`,
    },
    whatsapp: {
      titulo: 'WhatsApp',
      frase: `Opcional. Conecte a Z-API para a ${a} também atender pelo WhatsApp.`,
    },
    negocio: {
      titulo: 'Negócio',
      frase: `A ${a} quer conhecer o seu negócio para sugerir o resto.`,
    },
    sugestoes: {
      titulo: 'Sugestões',
      frase: 'Revise o que a IA propôs e responda o que faltou.',
    },
    resumo: {
      titulo: 'Aplicado',
      frase: 'O que foi gravado em cada parte. Nada disso está no ar ainda.',
    },
    publicar: {
      titulo: 'Publicar',
      frase: `Coloque a ${a} no ar para ela poder ligar.`,
    },
    numero: {
      titulo: 'Número',
      frase: 'O número da Twilio que aparece para o lead.',
    },
    ligacao: {
      titulo: 'Primeira ligação',
      frase: `Ligue para o seu celular e ouça a ${a} antes do primeiro lead.`,
    },
    pronto: {
      titulo: 'Pronto',
      frase: `A ${a} está configurada e já pode ligar.`,
    },
  } satisfies Record<EtapaDoInicio, { titulo: string; frase: string }>,

  boasVindas: {
    potencial:
      `A ${a} liga para cada lead em minutos, conversa como uma SDR, qualifica e marca a reunião com o seu especialista. Você acompanha cada ligação, com gravação e transcrição.`,
    destaques: [
      'Liga em minutos depois que o lead chega',
      'Qualifica com o roteiro da sua empresa',
      'Marca a reunião com quem vende',
    ],
    comecar: 'Começar',
  },

  /** A primeira pergunta: o nome com que ela se apresenta. */
  nome: {
    porQue:
      'É o nome que ela diz ao lead logo que ele atende, e o nome com que o resto da configuração fala dela. Dá para trocar depois na tela de identidade.',
    rotulo: 'Nome da assistente',
    exemplo: 'Ex.: Ana',
    salvar: 'Salvar e seguir',
    salvando: 'Salvando…',
    falta: 'Escreva o nome antes de seguir.',
    falha: 'Não foi possível gravar o nome. Tente de novo.',
    semPermissao: 'Só quem administra a conta define o nome da assistente.',
  },

  plano: {
    itens: [
      {
        titulo: 'Conectar',
        frase: 'OpenRouter para o modelo, ElevenLabs para a voz e Twilio para a linha.',
      },
      {
        titulo: 'Conhecer o negócio',
        frase: `A ${a} conversa com você e sugere a identidade, o roteiro e o resto. Você revisa.`,
      },
      {
        titulo: 'Colocar no ar',
        frase: 'Publicar, ligar o número e fazer a primeira ligação de teste para o seu celular.',
      },
    ],
  },

  modelo: {
    openrouter: 'OpenRouter',
    openrouterApoio: 'Use a sua conta. Você escolhe o modelo.',
    conectar: 'Conectar',
    conectando: 'Abrindo o OpenRouter…',
    concluindo: 'Concluindo a conexão…',
    conectado: 'Conectado',
    chatgpt: 'Assinatura do ChatGPT',
    chatgptApoio: 'Usar o plano que você já paga.',
    emBreve: 'Em breve',
    voltaSemMarca: 'A conexão voltou incompleta. Conecte de novo.',
  },

  vozes: {
    titulo: 'Escolha a voz',
    femininas: 'Femininas',
    masculinas: 'Masculinas',
    ouvir: 'Ouvir',
    parar: 'Parar',
    escolher: 'Escolher',
    escolhida: 'Escolhida',
    semAmostra: 'Sem amostra',
    aviso:
      'Seis vozes naturais em português. Na tela de voz você escolhe qualquer voz da ElevenLabs e ajusta velocidade e estabilidade.',
    abrirVoz: 'Abrir a tela de voz',
    outra: 'Outra voz',
    fecharOutras: 'Voltar às sugeridas',
    buscar: 'Buscar voz pelo nome',
    buscarExemplo: 'Ex.: Yasmin',
    carregandoCatalogo: 'Buscando as vozes da sua ElevenLabs…',
    semCatalogo: 'Não foi possível listar as vozes agora. Tente de novo ou escolha uma das sugeridas.',
    semResultado: 'Nenhuma voz com esse nome.',
    semPrevia: 'Sem prévia',
    daConta: 'Das suas vozes',
  },

  chave: {
    /** O painel de cada provedor, na página em que a chave aparece. */
    ondeAcharEndereco: {
      voz: 'https://elevenlabs.io/app/settings/api-keys',
      telefonia: 'https://console.twilio.com',
      whatsapp: 'https://app.z-api.io',
    },
    salvar: 'Salvar e testar',
    salvando: 'Testando…',
    conectado: 'Conectado',
    recusada: 'A chave não passou no teste. Confira e salve de novo.',
    ondeAchar: 'Onde achar',
    /** O título da lista de permissões, abaixo do campo da chave da ElevenLabs. */
    permissoesDaVoz: 'Permissões que a chave precisa ter',
    falha: 'Não foi possível falar com o servidor. Tente de novo.',
  },

  /** O passo opcional do canal de WhatsApp, depois da telefonia. */
  whatsappOpcional: {
    aviso: 'Este passo é opcional. Você pode seguir sem conectar agora, e configurar depois em Integrações.',
    modoDeTeste: `O canal começa em modo de teste: a ${a} só responde aos números de teste da conta. Para atender todos, mude na tela Conta da configuração.`,
    conectando: 'Registrando o canal na Z-API…',
    conectado: 'Canal conectado.',
    falhaAoConectar:
      'A chave foi salva, mas não foi possível registrar o canal agora. Você pode tentar de novo em Integrações.',
  },

  /** A entrevista por voz, a primeira escolha da etapa do negócio. */
  entrevista: {
    conversar: `Conversar com a ${a}`,
    conversarApoio: 'Ela pergunta, você responde. Uns três minutos, pelo microfone.',
    escrever: 'Prefiro escrever',
    escreverApoio: 'Três respostas curtas no lugar da conversa.',
    antes: 'O navegador vai pedir o microfone. Fale como falaria com uma pessoa.',
    comecar: 'Começar a conversa',
    abrindo: `Chamando a ${a}…`,
    falando: `${nomeOuAssistenteNoInicio(nomeGravado)} falando`,
    ouvindo: 'Sua vez',
    conectando: 'Conectando…',
    encerrar: 'Encerrar e gerar sugestões',
    digitar: `Escrever para a ${a}`,
    digitarExemplo: 'Se preferir, digite aqui',
    enviar: 'Enviar',
    tentarDeNovo: 'Tentar de novo',
    caiu: 'A conversa caiu. Se já deu tempo de responder, dá para gerar as sugestões mesmo assim.',
    semMicrofone: 'Não foi possível abrir o microfone. Confira a permissão do navegador ou escreva o negócio.',
  },

  negocio: {
    empresa: { rotulo: 'Nome da empresa', exemplo: 'Aurora Energia' },
    descricao: {
      rotulo: 'O que vende e para quem',
      exemplo: 'Usinas solares por assinatura para indústrias de médio porte no Sul.',
    },
    bomCliente: {
      rotulo: 'O que faz alguém ser um bom cliente',
      exemplo: 'Conta de luz acima de R$ 30 mil por mês e telhado próprio.',
    },
    gerar: 'Gerar sugestões',
    curta: (faltam: number) =>
      faltam === 1 ? 'Falta 1 caractere na descrição.' : `Faltam ${faltam} caracteres na descrição.`,
  },

  /** A espera, que troca de frase enquanto o modelo escreve. */
  gerando: [
    'Lendo o seu negócio…',
    'Escrevendo a primeira fala…',
    'Montando o roteiro de descoberta…',
    'Separando o que ainda falta perguntar…',
  ],

  sugestoes: {
    etapas: {
      identidade: 'Identidade',
      roteiro: 'Roteiro',
      especialista: 'Especialista',
      leads: 'Leads',
    } satisfies Record<Etapa, string>,
    campos: {
      empresa: 'Empresa',
      nome_do_agente: 'Nome da assistente',
      oferta: 'Oferta em uma frase',
      primeira_fala: 'Primeira fala',
      nunca_afirmar: 'Nunca afirmar',
      roteiro_de_descoberta: 'Roteiro de descoberta',
      modalidade: 'Modalidade da reunião',
      duracao_em_minutos: 'Duração em minutos',
      perfil_do_lead: 'Perfil do lead',
    } as Record<string, string>,
    perguntas: 'Para completar',
    obrigatorio: `Obrigatório para a ${a} ir ao ar.`,
    falta: (campos: readonly string[]) => `Preencha antes de aplicar: ${campos.join(', ')}.`,
    refazer: 'Gerar de novo',
    concluir: 'Aplicar as sugestões',
    vazio: 'A IA não devolveu sugestão para esta etapa.',
  },

  resumo: {
    aplicando: {
      identidade: 'Gravando a identidade…',
      voz: 'Gravando a voz…',
      roteiro: 'Salvando o roteiro como rascunho…',
      conhecimento: 'Guardando as respostas na base de conhecimento…',
      especialista: 'Separando o que fica para o especialista…',
      leads: 'Separando o que fica para os leads…',
    } satisfies Record<ParteDoResumo, string>,
    partes: {
      identidade: 'Identidade',
      voz: 'Voz',
      roteiro: 'Roteiro de descoberta',
      conhecimento: 'Base de conhecimento',
      especialista: 'Especialista',
      leads: 'Leads',
    } satisfies Record<ParteDoResumo, string>,
    estados: {
      aplicado: 'Aplicado',
      rascunho: 'Salvo como rascunho',
      para_fazer: 'Para você fazer',
      nada: 'Sem sugestão',
      falhou: 'Não aplicado',
    } satisfies Record<EstadoDaParte, string>,
    /** A linha que diz o que o estado significa naquela parte. */
    explicacao: (parte: ParteDoResumo, estado: EstadoDaParte): string => {
      if (estado === 'falhou') return 'O serviço recusou. Abra a parte e salve à mão.'
      if (estado === 'nada') return 'A IA não sugeriu nada aqui.'
      if (parte === 'identidade') return `A ${a} já se apresenta assim.`
      if (parte === 'voz') return `A ${a} fala com esta voz. Troque por qualquer outra na tela de voz.`
      if (parte === 'roteiro') return `Vai ao ar no próximo passo, quando você publicar a ${a}.`
      if (parte === 'conhecimento') return `A ${a} consulta estas respostas durante a ligação.`
      if (parte === 'especialista')
        return 'Cadastre quem atende as reuniões. A sugestão fica como referência.'
      return 'Importe a planilha de contatos. A sugestão fica como referência.'
    },
    campos: {
      empresa: 'Empresa',
      voz: 'Voz',
    } as Record<string, string>,
    alterar: 'Alterar',
    abrirConhecimento: 'Abrir a base',
    concluir: 'Seguir para publicar',
    travado: (partes: readonly string[]) =>
      `Não foi possível gravar: ${partes.join(', ')}. Sem isso a ${a} não vai ao ar. Volte à revisão, confira os campos e aplique de novo.`,
    revisar: 'Voltar à revisão',
  },

  publicar: {
    porQue:
      `Tudo até aqui foi salvo, e nada foi ao ar. Publicar monta a ${a} na ElevenLabs com a identidade, a voz e o roteiro. Sem publicar, ela não liga.`,
    rascunho: 'Roteiro de descoberta',
    semRoteiro:
      `Ainda não há roteiro para publicar. Conte o negócio à ${a} e ela escreve o roteiro junto com o resto, ou escreva na tela de roteiros.`,
    voltarAoNegocio: 'Voltar ao negócio',
    abrirRoteiros: 'Abrir a tela de roteiros',
    publicar: `Publicar a ${a}`,
    publicando: 'Publicando…',
    nota: 'Configuração inicial',
    foraDoAr:
      `O roteiro está publicado, mas a ${a} ainda não foi montada na ElevenLabs com ele. Publique para ela poder ligar.`,
    faltaTitulo: 'Antes de publicar, falta:',
    faltas: {
      identidade: `A identidade da ${a} (empresa, nome e oferta) não foi gravada.`,
      voz: `Escolher a voz da ${a}.`,
      primeiraFala: 'Escrever a primeira fala, o que o lead ouve ao atender.',
    },
    voltarARevisao: 'Voltar à revisão',
    escolherVoz: 'Escolher a voz',
    abrirIdentidade: 'Abrir a identidade',
    noAr: 'No ar',
    noArExplicacao: `A ${a} está publicada com o roteiro de descoberta. Mudanças depois se publicam na tela de roteiros.`,
    naoPublicou: 'Não foi possível publicar agora. Tente de novo em alguns minutos.',
    outrosPropositos:
      'Os outros roteiros (lembrete, reativação e retorno) ficam para depois. A primeira ligação usa só o de descoberta.',
    carregando: 'Conferindo o roteiro.',
  },

  numero: {
    porQue:
      `A ${a} liga por um número da sua Twilio. Escolha qual, e como ele atende quando alguém liga de volta.`,
    aguardando:
      'O número espera a aprovação da operadora. Você pode seguir e voltar aqui quando ela responder; a primeira ligação só sai depois.',
    ligado: 'Número ligado',
  },

  ligacao: {
    porQue:
      `A ${a} liga para o seu celular com o roteiro de descoberta. Atenda como se fosse um lead. Depois, a ficha mostra a gravação e a transcrição.`,
    irPara: (etapa: string) => `Resolver em ${etapa}`,
  },

  pronto: {
    feito: [
      'Modelo, voz e telefonia conectados',
      'Identidade e roteiro publicados',
      'Número ligado e primeira ligação feita',
    ],
    depoisTitulo: 'Quando quiser',
    depois: `Nada disto impede a ${a} de ligar. Fica também no checklist da barra lateral.`,
    semPendencias: `Não falta nada. A ${a} está completa.`,
    abrir: 'Abrir',
    concluir: 'Ir para o painel',
    revisar: 'Revisar a configuração',
  },
  } as const
}

/** O texto de quem ainda não escolheu o nome, e das frases que não o citam. */
export const inicio = textosDoInicio(null)
