// Falas da Sarah que valem em todo propósito.
//
// Quem emite estas frases é o servidor: elas entram na configuração publicada
// no provedor de voz e nas respostas das ferramentas, nunca na interface. Por
// isso moram aqui e não em `app/src/copy/` (`CLAUDE.md`, "Convenções").
//
// O registro é o da seção 4 de `docs/padrao-de-interface.md`: fala, não
// interface. Frase curta, contração natural, e a razão dita em voz alta quando
// ela existe. Texto de interface nasce sem travessão e sem fecho de efeito;
// fala nasce falada, e é de propósito que estas soem diferentes dos rótulos da
// tela.
//
// **Marcadores.** O que varia por conta, por lead ou por chamada aparece como
// `{chave}` e é substituído por quem compila a publicação (US-060). Este módulo
// não substitui nada: ele é constante portável, sem `Deno` e sem import de
// rede, e é o que o teste da camada 1 varre.
//
// Os marcadores em uso aqui:
//
// | Marcador | De onde vem |
// |---|---|
// | `{nome_do_agente}` | `agents.name` |
// | `{nome_do_lead}` | `leads.name` no contexto da chamada |
// | `{empresa}` | `agents.company_name` |
//
// O aviso de gravação tem um segundo caminho: `account_settings.recording_notice_text`
// (RF-806, US-045) sobrescreve a frase abaixo quando a conta escreve a sua. A
// daqui é o padrão, e é o que vale enquanto a coluna estiver vazia.

/**
 * Falas travadas, iguais nos quatro propósitos. A camada 1 as cita.
 *
 * As das três regras da F3 (não perturbe, pedido de humano, pessoa errada)
 * moram em `regras-travadas.ts`, que a interface não importa. Estas ficam
 * aqui porque a tela de privacidade lê o aviso de gravação padrão.
 */
export const FALAS_DE_TODO_PROPOSITO = {
  /**
   * Primeira fala de toda chamada (RF-420, RF-810). O aviso vem antes de
   * qualquer pergunta: consentimento dado depois da conversa não é
   * consentimento.
   */
  avisoDeGravacao:
    'Oi, {nome_do_lead}? Aqui é a {nome_do_agente}, da {empresa}. Antes da gente começar: essa ligação é gravada, tudo bem?',

  /**
   * A mesma abertura, sem o nome do lead.
   *
   * A ligação **recebida** de número que ainda não é lead não tem nome nenhum a
   * dizer (RF-108): o lead nasce naquele instante, com telefone e mais nada.
   * Interpolar `{nome_do_lead}` vazio na frase acima daria "Oi, ? Aqui é a
   * Sarah" lido em voz alta — marcador que some deixa buraco, e buraco no meio
   * de uma frase não se remenda com expressão regular. Por isso são frases
   * inteiras, e não uma frase com pedaço opcional.
   */
  avisoDeGravacaoSemNome:
    'Oi! Aqui é a {nome_do_agente}, da {empresa}. Antes da gente começar: essa ligação é gravada, tudo bem?',

  /**
   * A abertura com a gravação desligada na conta (`recording_enabled` falso,
   * RF-806).
   *
   * Existe porque `avisoDeGravacao` é uma frase inteira, saudação e aviso
   * juntos: com a gravação desligada, usá-la faria a Sarah prometer uma
   * gravação que não vai acontecer, e recortar o pedaço final dela por
   * expressão regular deixaria a frase capenga no ar. Quem escolhe entre as
   * quatro é `call-init`, que é quem sabe da política da conta e do lead no
   * momento da chamada.
   *
   * Ela não substitui `agents.first_message`: é o padrão de quem ainda não
   * escreveu a própria primeira fala.
   */
  aberturaSemGravacao: 'Oi, {nome_do_lead}? Aqui é a {nome_do_agente}, da {empresa}. Tudo bem?',

  /** Gravação desligada e lead sem nome: a quarta combinação das duas acima. */
  aberturaSemGravacaoESemNome: 'Oi! Aqui é a {nome_do_agente}, da {empresa}. Tudo bem?',

  /**
   * O que a conta lista em `never_claim` (RF-301). A Sarah não nega saber, ela
   * diz por que não arrisca, que é o que mantém a conversa de pé.
   */
  recusaDeAfirmar: [
    'Isso eu não arrisco te falar, pra não te passar informação errada.',
    'Quem fecha esse número é o especialista, e ele te fala certinho.',
  ],
} as const
