// Os literais da conexão do provedor de modelo, na tela de integrações
// (US-246).
//
// Registro de interface: direto e declarativo, sem travessão e sem fecho de
// efeito (docs/padrao-de-interface.md seção 4).
//
// As recusas da borda não estão aqui: chegam prontas de
// `model-connect/respostas.ts`. Uma segunda tradução divergiria da primeira.

import type { Tarefa } from '@compartilhado/modelo/resolucao.ts'

export const modelo = {
  titulo: 'Modelo de IA',
  apoio:
    'Quem lê as conversas e escreve as sugestões no painel. Não é o mesmo que atende a ligação: durante a chamada quem fala é o agente publicado no provedor de voz.',

  carregando: 'Carregando o provedor de modelo.',

  /**
   * Quando a leitura do estado falha. Diz o que deixou de funcionar e o que
   * continua funcionando: a ligação não depende deste cartão, e quem lê
   * precisa saber disso antes de se preocupar.
   */
  falha:
    'Não foi possível ler o provedor de modelo desta conta. As ligações não são afetadas; o que fica indisponível é a análise das conversas no painel.',

  estados: {
    naoConectado: 'Modelo não conectado',
    conectado: 'OpenRouter conectado',
  },

  /**
   * A conta sem modelo. Não há modelo da instalação para cair: o modelo é
   * sempre o da conta, pago por ela, e sem ele a retaguarda fica parada.
   */
  naoConectado: {
    explicacao:
      'A conta ainda não tem modelo. Sem ele a assistente não lê as conversas, não classifica as chamadas e não escreve sugestões. Conecte o OpenRouter com a sua conta, que paga o uso e escolhe o modelo de cada tarefa.',
  },

  conectado: {
    // Só os últimos caracteres: o suficiente para reconhecer qual chave é, e
    // insuficiente para usá-la.
    chave: (final: string) => `Chave terminada em ${final}`,
    desde: (data: string) => `Conectado em ${data}`,
  },

  conectar: 'Conectar o OpenRouter',
  conectando: 'Abrindo o provedor para você autorizar.',
  /**
   * A volta trouxe o código mas não a marca da autorização, e nem o navegador
   * a tinha guardado. Sem ela não dá para saber de qual conta é o código, e
   * adivinhar aceitaria a autorização aberta em outra aba.
   */
  voltaSemMarca:
    'A autorização voltou incompleta do provedor. Clique em Conectar o OpenRouter e conclua sem trocar de aba.',
  concluindo: 'Concluindo a conexão.',
  conectado_agora: 'OpenRouter conectado. Agora escolha o modelo de cada tarefa.',
  desconectar: 'Desconectar',
  desconectando: 'Desconectando.',
  desconectado: 'OpenRouter desconectado. A conta fica sem modelo até conectar de novo.',

  /** O que cada tarefa faz, na voz de quem escolhe o modelo dela. */
  tarefas: {
    review: 'Ler a ligação e sugerir melhorias',
    draft: 'Escrever o primeiro roteiro',
    classify: 'Classificar a chamada depois que ela termina',
    audio: 'Transcrever o áudio que o lead manda pelo WhatsApp',
    imagem: 'Descrever a imagem que o lead manda pelo WhatsApp',
  } as Readonly<Record<Tarefa, string>>,

  /** Por que a escolha importa em cada tarefa. */
  explicacaoDaTarefa: {
    review: 'O texto que ela escreve é o que a assistente vai falar. Vale um modelo forte.',
    draft: 'Mesma coisa: é redação, e ninguém espera por ela ao vivo.',
    classify: 'Roda logo depois da ligação e precisa ser rápida. Um modelo menor costuma bastar.',
    audio:
      'O texto transcrito entra na conversa como se o lead tivesse escrito. A lista mostra só modelos que aceitam áudio.',
    imagem:
      'A descrição entra na conversa para a assistente responder ao que a imagem mostra. A lista mostra só modelos que aceitam imagem.',
  } as Readonly<Record<Tarefa, string>>,

  escolherModelo: 'Modelo',
  /**
   * A opção de não escolher. Ela nomeia o modelo que vale hoje em vez de dizer
   * só "o padrão": quem abre esta tela quer saber com qual modelo a conta está
   * falando, e uma frase genérica esconde justamente isso.
   *
   * O valor continua sendo nulo no banco, e é essa a diferença: a conta que
   * não escolhe acompanha a troca de padrão, enquanto a que escolhe o mesmo
   * modelo à mão fica nele quando o padrão mudar.
   */
  padrao: (nome: string) => `${nome} · padrão`,
  /** Enquanto o catálogo não chegou, o identificador basta para nomear. */
  padraoSemNome: (id: string) => `${id} · padrão`,
  /** A ordem dos dois preços, dita uma vez abaixo do seletor. */
  legendaDoPreco: 'Preços por milhão de tokens, entrada / saída.',
  carregandoCatalogo: 'Carregando os modelos do provedor.',
  salvandoEscolha: 'Salvando a escolha.',
  escolhaSalva: 'Escolha salva.',

  contextoDoModelo: (tokens: number) => `${Math.round(tokens / 1000)}k de contexto`,
} as const
