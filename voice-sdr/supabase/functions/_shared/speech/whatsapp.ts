// Falas e instruções do canal de WhatsApp.
//
// Quem as emite é o servidor: `whatsapp-inbound` manda as falas prontas (pedido
// de texto, confirmação de descadastro) sem passar pelo modelo, e o motor
// (`_shared/whatsapp/conversa.ts`) põe a instrução do canal no sistema. Por
// isso moram aqui e não em `app/src/copy/`.
//
// O registro das falas é o de fala da seção 4 de `docs/padrao-de-interface.md`,
// levado ao texto curto de mensagem: frase curta, direta, sem markdown e sem
// prometer ligação que ninguém pediu. A instrução ao modelo, que não é fala,
// fica em `INSTRUCAO_DO_CANAL`, separada, para a varredura ler uma sem a outra.
//
// Nenhuma fala diz "Sarah": a assistente se chama como a conta escolheu.

export const FALAS_DO_WHATSAPP = {
  /** O lead mandou áudio, imagem ou outro conteúdo que a assistente não lê. */
  pedirTexto: 'Por aqui eu só consigo ler mensagem escrita. Pode me mandar em texto?',

  /** O áudio não baixou, passou do limite ou o modelo não entendeu. Nada é inventado. */
  audioNaoOuvido: 'Não consegui ouvir o seu áudio. Pode repetir ou me mandar por escrito?',

  /** A imagem não baixou, passou do limite ou o modelo não conseguiu ver. */
  imagemNaoVista: 'Não consegui abrir a sua imagem. Pode mandar de novo ou me contar por escrito?',

  /**
   * O lead pediu para não receber mais mensagens. Sai uma vez, e a conversa é
   * encerrada em seguida: nada mais é enviado para este número.
   */
  descadastro: 'Tudo bem, tirei o seu número da nossa lista. Você não vai receber mais mensagens nossas. Desculpa o incômodo.',

  /**
   * O pré-contato padrão, quando a conta não escreveu o dela
   * (`account_settings.whatsapp_pre_contact_text`). Sai logo depois que a
   * guarda libera a ligação, então a promessa de ligar é verdadeira.
   */
  preContato: 'Oi, {nome_do_lead}! Aqui é {nome_do_agente}, da {empresa}. Estou te ligando agora, tudo bem?',

  /** O mesmo pré-contato para a conta que ainda não deu nome à assistente. */
  preContatoSemIdentidade: 'Oi, {nome_do_lead}! Estou te ligando agora, tudo bem?',

  /**
   * A abertura padrão, quando a conta não escreveu a dela
   * (`agents.whatsapp_first_message`). Sai quando a assistente inicia a
   * conversa (`whatsapp-send`, ação `iniciar`), com os marcadores da primeira
   * fala preenchidos pelo lead e pela identidade publicada.
   */
  abertura: 'Oi, {nome_do_lead}! Aqui é {nome_do_agente}, da {empresa}. Tudo bem? Posso te fazer umas perguntas rápidas por aqui?',

  /**
   * O que segue a abertura escrita pela conta no pré-contato: a abertura diz
   * quem fala, e esta frase diz que a ligação está saindo.
   */
  avisoDaLigacao: 'Estou te ligando agora, tudo bem?',
} as const

/**
 * O bloco que diz ao modelo que a conversa é por texto. Entra no fim do
 * sistema, depois das três camadas, e vence o que nelas for de voz: a camada 1
 * foi escrita para a ligação e cita ferramentas de sistema do provedor de voz
 * que aqui não existem.
 */
export const INSTRUCAO_DO_CANAL = [
  '# Canal: WhatsApp, por texto',
  'Esta conversa é por mensagem de WhatsApp, não por ligação. Vale o que as camadas acima dizem sobre quem você é, o propósito e as regras travadas, com estas diferenças:',
  '- Escreva mensagens curtas, de uma a três frases, como gente escreve no WhatsApp.',
  '- Faça uma pergunta por vez.',
  '- Sem markdown: nada de asterisco, cerquilha, lista ou link inventado.',
  '- Não prometa ligação que a pessoa não pediu. Se ela pedir para ser chamada por telefone, diga que o time vai retornar.',
  '- Não fale de gravação: nesta conversa não há áudio gravado.',
  '- As ferramentas de ligação (end_call, transfer_to_number, voicemail_detection) não existem aqui. Para passar a conversa a alguém do time, chame tool-transfer; depois disso, só avise que alguém do time vai responder.',
  '- Horário, só os que tool-availability devolver, com o dia e a hora que ela disser. Nunca invente horário.',
  '- Nunca escreva o nome de um campo nem um marcador entre chaves.',
].join('\n')

/** O que o motor diz ao modelo quando a assistente abre a conversa. */
export const INSTRUCAO_DE_ABERTURA =
  'A conversa ainda não começou: você está escrevendo a primeira mensagem para esta pessoa, pelo propósito acima. Apresente-se e diga por que está escrevendo, numa mensagem curta.'

/** A mensagem de usuário que acompanha a abertura, porque o modelo precisa de uma. */
export const GATILHO_DE_ABERTURA = '(início da conversa)'

/**
 * A instrução ao modelo da tarefa `audio` (`_shared/whatsapp/midia.ts`). Pede a
 * transcrição fiel e a marca `[inaudivel]` quando não der para entender: a
 * assistente responde ao que foi dito, e palpite sobre áudio ruim viraria
 * resposta a algo que o lead não disse.
 */
export const INSTRUCAO_DA_TRANSCRICAO = [
  'Transcreva fielmente, em português, o áudio que a pessoa mandou pelo WhatsApp.',
  'Escreva só o que foi dito, com pontuação, sem resumir, sem comentar e sem responder.',
  'Não invente palavras. Trecho que não der para entender vira [trecho inaudível].',
  'Se não der para entender nada, ou se não houver fala, responda apenas: [inaudivel]',
].join('\n')

/**
 * A instrução ao modelo da tarefa `imagem`. Descrição objetiva e o texto que
 * aparece na imagem; nada de identificar pessoas.
 */
export const INSTRUCAO_DA_DESCRICAO = [
  'Descreva de forma objetiva, em português e em até cinco frases, o que a imagem que a pessoa mandou pelo WhatsApp mostra.',
  'Se houver texto escrito na imagem, transcreva-o entre aspas.',
  'Não identifique pessoas: não diga quem são, nem nome, idade, etnia ou qualquer traço que as identifique. Diga só que há uma pessoa, se houver.',
  'Não responda à pessoa e não faça suposições além do que se vê.',
].join('\n')
