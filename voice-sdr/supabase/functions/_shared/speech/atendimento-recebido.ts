// Falas da Sarah na ligação que **chega** e que o agente não atende.
//
// A linha da conta tem três comportamentos de entrada (`phone_lines.inbound_behavior`,
// T-14, RF-409). Em `agent`, quem fala é o agente publicado no provedor de voz
// e nada aqui é usado. Em `forward` e `voicemail`, quem atende é a telefonia,
// pelo documento que `inbound-twiml` monta — e o texto desse documento é fala
// da Sarah como qualquer outra, emitida pelo servidor, e por isso mora aqui e
// não dentro da função (`CLAUDE.md`, "Convenções").
//
// O registro é o da seção 4 de `docs/padrao-de-interface.md`: fala, não
// interface. Frase curta, contração natural, e a razão dita em voz alta.
//
// **`voicemail` dá o recado, não grava recado.** O nome do comportamento vem da
// telefonia, e é o que confunde. Gravar o que quem ligou falasse criaria áudio
// de terceiro fora de `calls`: sem chamada a que pertencer, fora da retenção da
// conta (L-18) e fora do expurgo do lead (RF-808) — dado pessoal que ninguém
// governa e que ninguém escuta. O que a linha faz é dizer que ninguém pode
// atender agora e que a gente retorna, e encerrar.
//
// **A apresentação é uma frase inteira, e não um pedaço de outra.** É o que
// permite trocá-la por `apresentacaoSemIdentidade` quando a conta ainda não
// montou a Sarah. A alternativa seria limpar os marcadores vazios de dentro de
// uma frase só, e o resultado ("Oi! Aqui é a, da.") sairia lido em voz alta
// numa ligação já no ar — marcador que some deixa buraco, e buraco no meio de
// uma frase não se remenda com expressão regular.
//
// Marcadores, na convenção de `todos-os-propositos.ts`:
//
// | Marcador | De onde vem |
// |---|---|
// | `{nome_do_agente}` | `agents.name` |
// | `{empresa}` | `agents.company_name` |

/** Falas do atendimento da ligação recebida que não vai ao agente. */
export const FALAS_DE_ATENDIMENTO_RECEBIDO = {
  /** Quem está falando. Só entra quando a conta tem nome e empresa. */
  apresentacao: 'Oi! Aqui é a {nome_do_agente}, da {empresa}.',

  /**
   * A conta ainda não montou a Sarah, ou a linha não foi reconhecida. Sem nome
   * e sem empresa não há o que apresentar, e inventar um nome é pior do que
   * cumprimentar e seguir.
   */
  apresentacaoSemIdentidade: 'Oi!',

  /**
   * Antes de transferir (`forward`). Existe porque encaminhamento mudo soa como
   * queda de ligação: quem ligou ouve o silêncio da discagem e desliga achando
   * que caiu.
   */
  avisoDeEncaminhamento: 'Só um instante que eu vou te passar pra pessoa certa.',

  /**
   * O recado de `voicemail`. Diz o que aconteceu, o que vai acontecer e
   * encerra. Não pede para deixar mensagem: não há onde guardá-la, e pedir o
   * que não se cumpre é pior do que não pedir.
   */
  recadoDaLinha: [
    'Ninguém consegue atender agora.',
    'Mas a gente vê que você ligou e te retorna. Obrigada, e até logo!',
  ],

  /**
   * A linha não foi reconhecida, ou o comportamento dela é `agent` e a ligação
   * chegou aqui mesmo assim — configuração que divergiu do que `phone-register`
   * deixou no provedor.
   *
   * Quem ligou não tem nada com isso, e por isso ouve uma frase em português e
   * não o tom de erro da operadora. A frase não promete retorno: sem linha
   * reconhecida não há conta que possa retornar coisa nenhuma, e prometer aqui
   * seria a única mentira do arquivo.
   */
  linhaNaoAtende: 'Essa ligação não pôde ser completada. Desculpa, e até logo.',
} as const
