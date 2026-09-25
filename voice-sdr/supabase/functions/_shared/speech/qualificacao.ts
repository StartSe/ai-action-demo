// As falas da resposta de tool-qualify (US-136). Moram aqui, e não em
// app/src/copy/, porque quem as emite é o servidor, na resposta da ferramenta.
// Registro conversacional da seção 4 de docs/padrao-de-interface.md.
//
// A fala não repete nada do que o lead disse: campo não confirmado vai vazio, e
// uma fala que resumisse a dor inventaria texto que não veio da entrada.

export const FALAS_DA_QUALIFICACAO = {
  /** Qualificação registrada. A Sarah segue a conversa. */
  registrada: 'Anotado, obrigada por me contar.',

  /**
   * Ponte antes de chamar tool-qualify, em descoberta (US-138). A camada 1 a
   * cita na regra da qualificação. Não promete dia, hora nem retorno com data:
   * da F2 à F4 não existe ferramenta de agenda (O-06), e quem combina o retorno
   * é o fechamento sem agenda, pelo canal e pelo período do dia.
   */
  antesDeEncerrar: [
    'Deixa eu só anotar aqui o que você me contou, pra passar certinho pro especialista.',
  ],
} as const
