// Falas que o esqueleto das ferramentas devolve quando a ferramenta não chega a
// decidir nada: falha, prazo estourado, pedido que não é daquela ligação.
//
// Quem as emite é o servidor, na resposta da ferramenta, e o provedor de voz as
// põe na boca da Sarah no meio da chamada. Por isso moram aqui e não em
// `app/src/copy/` (`CLAUDE.md`, "Convenções"), e o registro é o de fala da
// seção 4 de `docs/padrao-de-interface.md`: frase curta, falada, sem termo
// técnico. Silêncio na linha faz o interlocutor desligar, e "erro 500" dito em
// voz alta é pior do que silêncio.
//
// Nenhuma delas cita identificador. A chamada se identifica por cabeçalho, e o
// esqueleto recusa fala de ferramenta que carregue um (T-09).

export const FALAS_DAS_FERRAMENTAS = {
  /**
   * A frase de contorno da seção 5 do PRD de implementação: falha do executor,
   * prazo estourado, conversa que não se resolve. A Sarah promete voltar ao
   * assunto em vez de expor o que quebrou.
   */
  falha: 'Deixa eu confirmar isso com o time e já te retorno.',

  /**
   * A ferramenta foi chamada num propósito em que ela não existe (T-01). A
   * publicação já tira a ferramenta do agente daquele propósito; esta é a
   * segunda linha, e a Sarah segue a conversa sem prometer o que não vai fazer.
   */
  propositoErrado: 'Isso eu não consigo resolver por aqui agora, mas deixo anotado pro time.',

  /**
   * Faltou um dado que a ferramenta precisa. O modelo lê o campo em `data` e
   * pergunta de novo; a fala só mantém a conversa andando enquanto isso.
   */
  campoFaltando: 'Só um instante, me conta de novo pra eu anotar certinho?',
} as const
