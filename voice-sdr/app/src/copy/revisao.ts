// Os literais do ciclo de evolução, dentro da ficha da chamada (US-245).
//
// Registro de interface: direto e declarativo, sem travessão e sem fecho de
// efeito (docs/padrao-de-interface.md seção 4). Nada aqui é fala da Sarah — a
// fala dela mora em `supabase/functions/_shared/speech/`.
//
// As frases de recusa do ciclo não estão aqui: elas vêm prontas da borda, em
// `call-review/respostas.ts`, pelo alias `@revisao`. Uma segunda tradução
// divergiria da primeira no dia em que uma frase mudasse.

import type { TipoDeMudanca } from '@compartilhado/agente/revisao-de-chamada.ts'

export const evolucao = {
  titulo: 'Melhorar a assistente com esta ligação',
  apoio:
    'A assistente lê a conversa, pergunta o que só você sabe e propõe as mudanças. Nada vai ao ar sem você publicar.',

  // O convite ------------------------------------------------------------------
  comecar: 'Revisar o roteiro com esta ligação',
  analisando: 'Lendo a conversa e montando as perguntas.',
  semConversa:
    'Esta ligação não teve conversa para analisar.',

  // O questionário -------------------------------------------------------------
  questionario: {
    titulo: 'O que a assistente precisa saber',
    apoio: 'Responda com o que você sabe do negócio. É isto que vira a mudança.',
    porque: 'Por que esta pergunta',
    enviar: 'Ver as sugestões',
    enviando: 'Escrevendo as sugestões.',
    escreverOutra: 'Escrever outra resposta',
    // O campo de escolha sempre deixa escrever: a lista é o que o modelo
    // enxergou, e não o que existe.
    outraResposta: 'Ou escreva a sua resposta',
  },

  // As propostas ---------------------------------------------------------------
  propostas: {
    titulo: 'O que a assistente sugere',
    apoio: 'Aceite o que fizer sentido. O que você aceitar vira rascunho, e você publica depois.',
    aceitar: 'Aceitar',
    aceita: 'Aceita',
    recusar: 'Recusar',
    recusada: 'Recusada',
    questionar: 'Pedir diferente',
    questionando: 'Reescrevendo a sugestão.',
    questionamento: 'O que você quer diferente',
    questionamentoApoio: 'Diga o que não serviu. A assistente reescreve só esta sugestão.',
    enviarQuestionamento: 'Reescrever',
    cancelarQuestionamento: 'Deixar como está',
    reescrita: (vezes: number) =>
      vezes === 1 ? 'Reescrita uma vez' : `Reescrita ${vezes} vezes`,
    verTexto: 'Ver o texto completo',
    esconderTexto: 'Esconder o texto',
    razao: 'Por que',
    aplicar: 'Aplicar o que aceitei',
    aplicando: 'Gravando o rascunho.',
    descartar: 'Descartar esta revisão',
    nadaAceito: 'Aceite ao menos uma sugestão para aplicar.',
  },

  // O fim ----------------------------------------------------------------------
  aplicada: {
    titulo: 'Rascunho gravado',
    comVersao: (versao: number) =>
      `As mudanças de texto viraram a versão ${versao}, em rascunho. Ela só vai ao ar quando você publicar.`,
    semVersao: 'Nenhuma mudança de texto foi aceita, então nenhuma versão foi gravada.',
    irParaPlaybooks: 'Abrir playbooks para publicar',
    encaminhamentos: 'O que ficou para você fazer',
    outraRevisao: 'Revisar esta ligação de novo',
  },
  semMudancas: {
    titulo: 'Nada a mudar com esta ligação',
    explicacao:
      'A conversa não mostrou nada que o roteiro atual e as respostas anteriores já não cubram. Nada foi gravado.',
  },
  descartada: {
    titulo: 'Revisão descartada',
    explicacao: 'Nada foi gravado. Você pode analisar esta ligação de novo quando quiser.',
  },

  // Os tipos de proposta -------------------------------------------------------
  tipos: {
    script: 'Roteiro da ligação',
    house: 'Jeito da casa',
    voice: 'Voz da assistente',
    knowledge: 'Base de conhecimento',
    other: 'Configuração',
  } as Readonly<Record<TipoDeMudanca, string>>,

  /** O que a etiqueta de cada tipo explica quando alguém para o mouse nela. */
  explicacaoDoTipo: {
    script: 'O passo a passo da conversa deste propósito.',
    house: 'O tom, o tratamento e o que a assistente nunca diz.',
    voice: 'A voz que a assistente usa ao falar.',
    knowledge: 'O que a assistente sabe responder sobre o negócio.',
    other: 'Ajuste em alguma tela de configuração.',
  } as Readonly<Record<TipoDeMudanca, string>>,

  /** A marca das propostas que o ciclo não executa. */
  encaminhamento: {
    selo: 'Você faz',
    aplicavel: 'A assistente aplica',
    ondeMexer: 'Onde mexer',
    // A tela de destino ainda não existe (US-085): o endereço aparece como
    // texto, e não como link que morre.
    caminhoIndisponivel: 'Esta tela ainda não existe. O endereço vai ser',
  },

  /** O botão que a recusa com caminho oferece. */
  resolver: 'Resolver agora',

  falhaGenerica: 'Não foi possível continuar a revisão agora. Tente de novo em alguns minutos.',
} as const
