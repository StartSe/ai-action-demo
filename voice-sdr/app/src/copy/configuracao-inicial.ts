import type {
  ClasseDoPasso,
  EstadoDoPasso,
} from '@/configuracao-inicial/progresso'
import type { TelaEmbutida } from '@/configuracao-inicial/telas-do-passo'
import type {
  Bloqueio,
  MotivoDeFalhaDaConfiguracao,
  PassoId,
} from '@/configuracao-inicial/tipos'

/**
 * Os oito passos do assistente (docs/PRD.md seção 5.13). Quem define a lista é
 * o catálogo do banco (`passos_de_configuracao`), porque é ele que mede a
 * pendência; aqui mora o nome de cada um, a frase que explica e onde se
 * resolve.
 *
 * A correspondência com a seção 5.13 não é linha a linha, e a diferença é
 * deliberada: "boas-vindas" e "ensaio" não deixam evidência em tabela nenhuma,
 * então não há como medi-los, e um checklist que se fecha por declaração
 * informa menos do que checklist nenhum. No lugar deles entram os dois passos
 * que a operação exige e que a seção 5.13 diluiu em outros: roteiro publicado
 * e primeiros leads. Empresa, voz e telefonia se juntam nos dois primeiros.
 *
 * Onde se resolve não mora aqui: o passo embute a tela, e quem diz qual é
 * `telasDoPasso`, em `src/configuracao-inicial/telas-do-passo.ts`.
 */
type TextoDoPasso = {
  titulo: string
  explicacao: string
  /**
   * Frase do passo que espera alguém de fora. O pedido já saiu e a resposta
   * não depende de quem configura (docs/revisao-tecnica.md, P-04).
   */
  aprovacao?: string
}

export const PASSOS_EM_PORTUGUES: Record<PassoId, TextoDoPasso> = {
  credenciais: {
    titulo: 'Provedor de voz e telefonia',
    explicacao:
      'Cadastre a chave do provedor de voz e a da telefonia. Elas são o primeiro degrau: sem elas não há agente publicado nem linha para discar.',
  },
  agente: {
    titulo: 'Identidade da assistente',
    explicacao:
      'Dê nome, primeira fala e jeito à assistente. É o que o lead ouve nos primeiros cinco segundos.',
  },
  roteiro: {
    titulo: 'Roteiro de descoberta publicado',
    explicacao:
      'Publique o roteiro que a assistente segue na ligação. Rascunho não vai para chamada.',
  },
  numero: {
    titulo: 'Número da operação',
    explicacao:
      'Compre um número novo ou traga o que a empresa já usa. O pacote regulatório da operadora exige CNPJ, endereço e documento.',
    aprovacao:
      'Pedido enviado à operadora. A liberação do número leva alguns dias e não depende de você.',
  },
  especialista: {
    titulo: 'Especialista cadastrado',
    explicacao:
      'Cadastre pelo menos uma pessoa para receber as reuniões que a assistente marcar.',
  },
  agenda: {
    titulo: 'Agenda do especialista',
    explicacao:
      'Cole o endereço iCal da agenda do especialista, na ficha dele em Especialistas. Com ele, a assistente só oferece horário que está mesmo livre.',
  },
  leads: {
    titulo: 'Primeiros leads',
    explicacao:
      'Importe a lista de quem a assistente vai chamar, com nome, telefone e empresa.',
  },
  equipe: {
    titulo: 'Equipe convidada',
    explicacao:
      'Convide quem vai acompanhar a operação com você. Este passo é opcional e não trava nada.',
  },
}

/**
 * O guia de cada passo, no diálogo do tutorial: por que o passo importa, o que
 * ter em mãos antes de começar, onde achar o que a tela pede e um exemplo
 * pronto quando o campo é de texto livre. É o que deixa a pessoa preencher sem
 * sair do tutorial para procurar.
 *
 * Os endereços de fora apontam para o painel de cada provedor, na página em
 * que a chave aparece. Marcador em exemplo precisa existir na lista do
 * compilador, e o teste do guia confere.
 */
export type GuiaDoPasso = {
  porQue: string
  tenhaEmMaos: readonly string[]
  ondeEncontrar?: readonly { rotulo: string; endereco: string }[]
  exemplo?: { rotulo: string; texto: string }
  dica?: string
}

export const GUIAS_DOS_PASSOS: Record<PassoId | 'ligacao', GuiaDoPasso> = {
  credenciais: {
    porQue:
      'A voz da assistente vem da ElevenLabs e a linha telefônica vem da Twilio. Com as duas chaves gravadas, a assistente passa a ter como falar e como discar.',
    tenhaEmMaos: [
      'A chave de API da ElevenLabs.',
      'O Account SID e o Auth Token da Twilio.',
      'Se o modelo for pelo OpenRouter, a conta do OpenRouter aberta em outra aba.',
    ],
    ondeEncontrar: [
      {
        rotulo: 'Chaves de API da ElevenLabs',
        endereco: 'https://elevenlabs.io/app/settings/api-keys',
      },
      {
        rotulo: 'Account SID e Auth Token da Twilio',
        endereco: 'https://console.twilio.com',
      },
    ],
    dica: 'Crie uma chave da ElevenLabs só para a assistente. Se precisar revogar, nenhum outro uso da conta para.',
  },
  agente: {
    porQue:
      'É o que o lead ouve nos primeiros segundos. Nome, empresa e primeira fala decidem se ele continua na linha.',
    tenhaEmMaos: [
      'O nome que a assistente vai usar.',
      'O nome da empresa como o lead a conhece.',
      'Uma frase que resume a oferta.',
      'O que ela nunca pode prometer, como preço fechado ou prazo.',
    ],
    exemplo: {
      rotulo: 'Primeira fala pronta para adaptar',
      texto:
        'Oi, {nome_do_lead}! Aqui é a {nome_do_agente}, assistente virtual da {empresa}. Vi que você pediu contato pelo nosso site. Tem dois minutinhos?',
    },
    dica: 'Diga logo na primeira fala que é uma assistente virtual. Quem descobre no meio da conversa costuma desligar.',
  },
  roteiro: {
    porQue:
      'O roteiro diz o que a assistente precisa descobrir na ligação. Só a versão publicada vai para chamada.',
    tenhaEmMaos: [
      'As três ou quatro perguntas que qualificam um lead para vocês.',
      'O que caracteriza um lead que não serve.',
      'Para onde a conversa segue quando o lead serve.',
    ],
    dica: 'Use "Gerar um rascunho" para partir de uma primeira versão escrita a partir da descrição do negócio. Revise e publique.',
  },
  numero: {
    porQue:
      'É o número que aparece no celular do lead. Sem ele não há ligação de saída.',
    tenhaEmMaos: [
      'CNPJ da empresa.',
      'Endereço comercial.',
      'Documento do responsável legal.',
    ],
    ondeEncontrar: [
      {
        rotulo: 'Pacotes regulatórios na Twilio',
        endereco:
          'https://console.twilio.com/us1/develop/phone-numbers/regulatory-compliance/bundles',
      },
    ],
    dica: 'A operadora leva alguns dias para liberar um número novo. Enquanto isso, dá para seguir com os outros passos.',
  },
  especialista: {
    porQue:
      'É quem recebe as reuniões que a assistente marca. Sem especialista, a conversa não tem para onde ir.',
    tenhaEmMaos: [
      'Nome e e-mail de quem vai atender as reuniões.',
      'Duração da reunião e se ela é por vídeo, telefone ou presencial.',
    ],
  },
  agenda: {
    porQue:
      'Com o calendário conectado, a assistente só oferece horário que está livre de verdade.',
    tenhaEmMaos: [
      'O endereço secreto no formato iCal da agenda do especialista, copiado do Google Agenda, do Outlook ou do Apple.',
    ],
  },
  leads: {
    porQue: 'É a lista de quem a assistente vai chamar.',
    tenhaEmMaos: [
      'Uma planilha com nome, telefone com DDD e empresa.',
      'A origem dos contatos, para registrar de onde cada um veio.',
    ],
    dica: 'Antes de gravar, a prévia mostra os telefones inválidos e os duplicados. Nada entra sem você confirmar.',
  },
  equipe: {
    porQue:
      'Quem acompanha a operação com você vê as ligações e resolve o que a assistente não resolve.',
    tenhaEmMaos: ['O e-mail de cada pessoa e o papel dela na conta.'],
  },
  ligacao: {
    porQue:
      'É a prova de que tudo está ligado: a assistente liga para você, e a ficha da ligação mostra a conversa.',
    tenhaEmMaos: ['O seu celular por perto, cadastrado como número de teste.'],
    dica: 'Atenda e converse como um lead faria. Tente uma objeção para ver como ela responde.',
  },
}

/** O nome de cada tela embutida, acima do formulário dela. */
export const TELAS_EMBUTIDAS_EM_PORTUGUES: Record<TelaEmbutida, string> = {
  integracoes: 'Integrações',
  identidade: 'Identidade',
  voz: 'Voz',
  playbooks: 'Playbooks',
  numeros: 'Números',
  especialistas: 'Especialistas',
  importacao: 'Importação de leads',
  equipe: 'Equipe',
  discagem: 'Política de discagem',
  privacidade: 'Privacidade',
}

export const ESTADO_DO_PASSO_EM_PORTUGUES: Record<EstadoDoPasso, string> = {
  concluido: 'Concluído',
  aguardando: 'Aguardando aprovação',
  indisponivel: 'Ainda não disponível',
  pendente: 'Pendente',
}

/**
 * O selo que separa o que trava a primeira ligação do que pode esperar, e a
 * linha que diz o que pular custa. O passo que trava não leva linha: a frase
 * do bloqueio já diz o que acontece.
 */
export const CLASSE_DO_PASSO_EM_PORTUGUES: Record<
  ClasseDoPasso,
  { selo: string; texto?: string }
> = {
  'primeira-ligacao': { selo: 'Trava a primeira ligação' },
  'depois-da-ligacao': {
    selo: 'Não trava a primeira ligação',
    texto: 'A assistente já liga sem este passo. Dá para voltar a ele depois.',
  },
  opcional: {
    selo: 'Opcional',
    texto: 'Não trava nada. Fica para quando quiser.',
  },
}

/** O que cada pendência impede. Os códigos vêm do catálogo do banco. */
export const BLOQUEIO_EM_PORTUGUES: Record<Bloqueio, string> = {
  ligacao: 'A assistente não liga nem atende.',
  agendamento: 'A conversa não vira reunião marcada.',
  campanha: 'Não há para quem ligar em lote.',
}

export const configuracaoInicial = {
  titulo: 'Configuração inicial',
  explicacao:
    'Das conexões à primeira ligação de teste. Pode pular e voltar: o progresso fica guardado na conta.',

  carregando: 'Conferindo o que já está configurado.',
  falhas: {
    'sem-permissao':
      'Só quem administra a conta altera a configuração inicial. Você continua vendo o que falta.',
    'sem-conta': 'Seu acesso ainda não está ligado a nenhuma conta.',
    'falha-de-comunicacao':
      'Não foi possível falar com o servidor. Tente de novo em alguns minutos.',
  } satisfies Record<MotivoDeFalhaDaConfiguracao, string>,

  /** O passo aberto no assistente. */
  passo: {
    emCurso: 'Passo em curso',
    posicao: 'Passo',
    de: 'de',
    indisponivel:
      'Esta parte do produto chega em uma fase seguinte. O passo continua na lista para você saber o que ainda falta.',
    marcar: 'Marcar como feito',
    marcado: 'Marcado como feito. A pendência sai da lista quando o dado chegar.',
    pular: 'Pular por enquanto',
    voltar: 'Voltar',
    bloqueia: 'Enquanto estiver assim:',
    salvando: 'Salvando…',
    telaCheia: 'Abrir em tela cheia',
  },

  /** A pergunta antes de sair de um passo com alteração não salva. */
  saida: {
    titulo: 'Alteração não salva',
    explicacao:
      'Este passo tem alteração que ainda não foi salva. Se sair agora, ela se perde.',
    ficar: 'Ficar e salvar',
    descartar: 'Descartar e sair',
  },

  progresso: {
    contagem: 'concluídos',
    lista: 'Os passos do assistente',
  },

  /** O diálogo que ocupa a tela enquanto o tutorial está aberto. */
  tutorial: {
    fechar: 'Fechar o tutorial',
    trilha: 'Configure a assistente',
    apoioDaTrilha:
      'Tudo acontece aqui dentro. Pode fechar e voltar quando quiser: o progresso fica guardado.',
    guia: {
      porQue: 'Por que este passo',
      tenhaEmMaos: 'Tenha em mãos',
      ondeEncontrar: 'Onde encontrar',
      exemplo: 'Exemplo',
      copiar: 'Copiar',
      copiado: 'Copiado',
      dica: 'Dica',
    },
  },

  /** O checklist da barra lateral, visível enquanto houver pendência. */
  checklist: {
    rotulo: 'Configuração inicial pendente',
    titulo: 'Configuração inicial',
    continuar: 'Continuar configuração',
  },

  concluida: {
    titulo: 'Configuração concluída',
    explicacao:
      'Nada pendente por aqui, e a primeira ligação de teste já foi feita. O checklist saiu da barra lateral.',
  },

  /**
   * O passo final, que só existe na interface: ligar para o número de teste e
   * abrir a ficha. As frases da recusa não moram aqui: chegam prontas do
   * servidor, ou das recusas que o discador dá antes de chamá-lo.
   */
  ligacao: {
    titulo: 'Primeira ligação de teste',
    explicacao:
      'A assistente liga para o seu número de teste com o roteiro de descoberta. Atenda e converse como um lead faria.',
    selo: 'Fecha o tutorial',
    carregando: 'Conferindo os números de teste.',
    falhaDosNumeros:
      'Não foi possível ler os números de teste. Tente de novo em alguns minutos.',
    semNumero:
      'Cadastre o número que vai atender a ligação. Até a primeira ligação de teste, a assistente só liga para números de teste.',
    destino: 'Para quem ligar',
    destinoRotulo: (rotulo: string, telefone: string) => `${rotulo} · ${telefone}`,
    ligar: 'Ligar para o número de teste',
    ligando: 'Ligando',
    falta: 'Antes de ligar, falta resolver:',
    irPara: (passo: string) => `Ir para ${passo}`,
    resolveEm: (passo: string) => `Isto se resolve no passo ${passo}.`,
    conectando: 'Conectando ao acompanhamento da ligação.',
    erroAoVivo:
      'O acompanhamento em tempo real caiu. A ligação continua; a ficha dela fica em Chamadas.',
    emCurso: 'Ligação em curso:',
    duracao: 'Duração',
    encerrada: 'Ligação encerrada. A ficha tem a transcrição da conversa.',
    abrirFicha: 'Abrir a ficha da ligação',
    feita: 'Primeira ligação de teste feita.',
    ligarDeNovo: 'Ligar de novo',
    voltar: 'Voltar',
    foraDaJanela: {
      titulo: 'Agora está fora da janela de discagem',
      texto: (janela: string, abre: string | null) =>
        abre
          ? `A ligação de teste também respeita a janela de discagem da conta, que hoje é ${janela}. Ela abre ${abre}. Espere até lá, ou ajuste a janela em Discagem e volte aqui.`
          : `A ligação de teste também respeita a janela de discagem da conta, e nenhum dia da semana está aberto. Ajuste a janela em Discagem e volte aqui.`,
      ajustar: 'Ajustar a janela em Discagem',
    },
  },

  dispensa: {
    fechar: 'Fechar o assistente',
    fechado:
      'Assistente fechado. O checklist continua na barra lateral até a configuração terminar.',
    retomar: 'Retomar o assistente',
  },
} as const
