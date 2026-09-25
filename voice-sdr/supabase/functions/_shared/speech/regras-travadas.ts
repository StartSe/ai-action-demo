// Falas das três regras travadas da F3: pedido de não perturbe, pedido de
// humano e pessoa errada.
//
// Quem as emite é o servidor, dentro da camada 1 publicada no provedor de voz
// (`_shared/playbook/camada-um.ts`). Por isso moram aqui e não em
// `app/src/copy/` (`CLAUDE.md`, "Convenções"), e **a interface não importa
// este módulo**: `testes/estatica/falas-fora-da-interface.test.ts` reprova
// import direto dele a partir de `app/`. A tela de playbooks mostra estas falas
// pelo texto compilado da camada 1, que é o que foi ao ar, e nunca por uma
// segunda leitura da constante.
//
// O registro é o de fala da seção 4 de `docs/padrao-de-interface.md`: frase
// curta, contração natural, a razão dita em voz alta quando ela existe. Cada
// fala leva a anotação da situação em que sai, porque a mesma frase dita no
// momento errado é a falha que a regra existe para impedir.
//
// Nenhuma fala cita identificador nem promete prazo: quem pede humano não ouve
// "em cinco minutos", porque nada no sistema cumpre cinco minutos.

export const FALAS_DAS_REGRAS_TRAVADAS = {
  /**
   * O interlocutor pediu para não ser mais procurado (RF-805). A Sarah promete
   * o bloqueio em voz alta e encerra.
   *
   * A promessa vale **mesmo que `tool-dnc` falhe**, e por isso estas falas não
   * dependem da resposta da ferramenta: `call-finalize` reaplica o bloqueio que
   * não chegou ao banco lendo a transcrição (R-02, US-108). É isso que torna a
   * promessa honesta em vez de otimista.
   */
  naoPerturbe: [
    // Sai logo depois do pedido, enquanto `tool-dnc` roda ou depois que ela
    // voltou, com ou sem erro.
    'Entendi, sem problema nenhum. Já tô tirando o seu número da nossa lista.',
    // Sai em seguida, como última fala antes de `end_call`.
    'Não te ligo mais. Obrigada, e desculpa o incômodo.',
  ],

  /**
   * O interlocutor pediu para falar com uma pessoa, ou a conversa entrou em
   * tema sensível (seção 9 do PRD: o agente nunca improvisa em tema sensível).
   *
   * É uma fala só, de ponte: o que a Sarah diz depois é a frase que
   * `tool-transfer` devolve, lida como veio. Com destino configurado ela
   * anuncia a transferência; sem destino ela diz que alguém do time retorna.
   * Quem sabe qual das duas é verdade é a ferramenta, e não a Sarah.
   */
  pedidoDeHumano: [
    // Sai logo depois do pedido, antes de chamar `tool-transfer`, para a linha
    // não ficar em silêncio enquanto a ferramenta decide.
    'Claro, deixa eu ver aqui quem pode falar com você.',
  ],

  /**
   * Pessoa errada ou terceiro (RF-422). São duas falas e acabou: insistir aqui
   * é o caminho mais curto para reclamação. Entre as duas, `tool-dnc` com
   * `reason='wrong_number'`; depois da segunda, `end_call`.
   */
  pessoaErrada: [
    // Sai no instante em que o engano fica claro, antes de qualquer outra coisa.
    'Ah, então eu falei com a pessoa errada. Me desculpa o incômodo!',
    // Sai depois de `tool-dnc`, como última fala antes de `end_call`.
    'Vou corrigir aqui pra não te ligar de novo. Obrigada pela paciência, viu? Até mais.',
  ],
} as const
