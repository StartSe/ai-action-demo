// O que o candidato pede à entrevistadora, no meio da conversa, sem que isso seja uma resposta.
//
// Duas coisas que qualquer pessoa diz numa entrevista falada e que não podem ser tratadas como
// resposta à pergunta: "pode repetir?" e "espera, não terminei". As duas são reconhecidas AQUI, por
// regra, e nunca pelo modelo — o pedido tem de funcionar quando o modelo está lento, quando a
// transcrição chega sem pontuação ("pode repetir a pergunta" em vez de "Pode repetir a pergunta?")
// e quando a pessoa começa com um "desculpa" ou um "ahn".
//
// O que estas funções decidem é ouvido por uma pessoa de verdade: um falso positivo faz a
// entrevistadora repetir a pergunta a quem acabou de respondê-la; um falso negativo faz ela pedir
// "um exemplo concreto" de "não entendi". Por isso as duas exigem que o pedido seja a fala inteira
// (ou quase): "Eu tive que repetir o treinamento" não é um pedido, "Deixa eu pensar, foi em 2019
// quando..." é o começo de uma resposta.

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** As interjeições com que a gente começa um pedido; nenhuma delas muda o que está sendo pedido. */
const PREFIXO =
  /^(?:(?:ah|ahn|eh|hum|hmm|oi|opa|olha|entao|ai|desculpa|desculpe|perdao|foi mal|perai|pera|espera|calma|nossa|poxa|e que|so que|so|assim|bom|bem|na verdade)\s+)*/;

/** O que pode vir depois do pedido sem mudá-lo. */
const SUFIXO =
  /(?:\s+(?:por favor|por gentileza|pra mim|para mim|de novo|outra vez|mais uma vez|a pergunta|essa pergunta|a ultima pergunta|a sua pergunta|o que voce (?:disse|falou|perguntou)|direito|bem|muito bem|nada|a resposta|minha resposta|o que eu estava (?:dizendo|falando)|aqui|ai|um pouco|um pouquinho|mais um pouco|melhor|so isso|rapidinho))*$/;

const REPETICAO = [
  // "pode repetir", "você poderia repetir a pergunta", "dá pra falar de novo", "tem como refazer"
  /^(?:voce |vc |a senhora |o senhor )?(?:pode(?:ria)?|consegue|da pra|da para|tem como|sera que (?:pode|da)|eu queria que voce)\s+(?:repetir|refazer|reformular|explicar|falar|dizer|perguntar)(?:\s+(?:melhor|de novo|outra vez|mais uma vez|mais devagar|mais alto|isso|a pergunta|essa pergunta|a ultima pergunta))*/,
  // "repete", "repita a pergunta", "repetir por favor", "fala de novo", "diz de novo"
  /^(?:repete|repita|repetir|reformula|reformule|refaz|refaca|fala de novo|fale de novo|diz de novo|diga de novo|fala outra vez|de novo|outra vez|mais uma vez)\b/,
  // "não ouvi", "não entendi a pergunta", "não consegui escutar direito" — só quando é a fala inteira
  /^(?:eu )?nao (?:ouvi|escutei|entendi|peguei|compreendi|consegui (?:ouvir|escutar|entender|acompanhar))(?:\s+(?:bem|direito|nada|muito bem|a pergunta|essa pergunta|a sua pergunta|voce|o que voce (?:disse|falou|perguntou)|o final|o comeco|a ultima parte))*$/,
  // "não entendi, pode repetir" — a negativa seguida do pedido
  /^(?:eu )?nao (?:ouvi|escutei|entendi|peguei|compreendi|consegui (?:ouvir|escutar|entender))\b.*\b(?:repet\w*|de novo|outra vez|mais uma vez|a pergunta|reformul\w*)\b/,
  // "qual era a pergunta", "como é a pergunta mesmo", "qual foi mesmo a pergunta"
  /^(?:qual|como|o que)(?:\s+(?:e|era|foi|que e|que era|que foi|mesmo|era mesmo|foi mesmo|voce perguntou|voce disse|voce falou))*\s+(?:a pergunta|a sua pergunta|a questao|mesmo a pergunta)/,
  // "a pergunta de novo, por favor"
  /^(?:a pergunta|a sua pergunta|essa pergunta)\s+(?:de novo|outra vez|mais uma vez|por favor)/,
  // "hã?", "oi?", "como?", "o quê?", "como assim?" — a confusão sem verbo
  /^(?:ha|han|hein|oi|como|que|o que|como assim|como e|oi como|ah como)$/,
  // "cortou", "o áudio falhou", "travou aqui", "não deu pra ouvir"
  /^(?:(?:o |a )?(?:audio|som|voz|video|ligacao|conexao|internet)\s+)?(?:cortou|falhou|travou|picotou|ficou (?:cortando|picotando|travando)|deu uma falha|deu uma travada)\b/,
  /^(?:nao deu (?:pra|para) (?:ouvir|escutar|entender)|nao (?:ta|esta|tava|estava) dando (?:pra|para) (?:ouvir|escutar))\b/,
];

const CONTINUACAO = [
  // "espera", "só um momento", "um minuto", "peraí", "calma aí"
  /^(?:espera|espera ai|espere|perai|pera|pera ai|calma|calma ai|so um momento|so um minuto|so um minutinho|so um segundo|so um instante|um momento|um minuto|um minutinho|um segundo|um instante|me da um momento|me da um minuto|me da um segundo|rapidinho)$/,
  // "deixa eu pensar", "preciso pensar um pouco", "posso pensar um pouco"
  /^(?:deixa eu pensar|deixe me pensar|deixa eu lembrar|deixa eu organizar (?:as ideias|o pensamento|a ideia)|preciso pensar|preciso de um momento|preciso de um minuto|posso pensar|so pensando|estou pensando|to pensando|deixa eu ver|deixe me ver)$/,
  // "não terminei", "ainda não acabei", "eu não tinha terminado"
  /^(?:eu )?(?:ainda )?nao (?:terminei|acabei|conclui|tinha terminado|tinha acabado|havia terminado|terminei de (?:falar|responder)|acabei de (?:falar|responder))$/,
  // "deixa eu terminar", "deixa eu completar", "posso continuar", "queria completar"
  /^(?:deixa eu|deixe me|deixa so eu|me deixa|posso|poderia|pode deixar eu|queria|quero|gostaria de|so pra|so para|eu ainda queria)\s+(?:terminar|completar|complementar|continuar|concluir|acrescentar|finalizar|fechar (?:a ideia|o raciocinio|a resposta)|terminar de (?:falar|responder)|falar mais uma coisa|dizer mais uma coisa)$/,
  // "só completando", "complementando", "só mais uma coisa"
  /^(?:so completando|completando|so complementando|complementando|so acrescentando|acrescentando|so mais uma coisa|mais uma coisa|so uma coisa|so pra completar|so pra complementar|so para completar|so para complementar)$/,
];

function encaixa(texto: string, regras: RegExp[], maximoDePalavras: number): boolean {
  const limpo = normalizar(texto);
  if (!limpo) return false;
  if (limpo.split(" ").length > maximoDePalavras) return false;
  // Com e sem as interjeições do começo, com e sem o "por favor" do fim: "Desculpa, não ouvi direito"
  // e "Espera" são o mesmo pedido de formas diferentes.
  const semPrefixo = limpo.replace(PREFIXO, "");
  const candidatos = new Set([limpo, limpo.replace(SUFIXO, ""), semPrefixo, semPrefixo.replace(SUFIXO, "")]);
  candidatos.delete("");
  return regras.some((regra) => [...candidatos].some((c) => regra.test(c)));
}

/**
 * A pessoa quer ouvir a última fala de novo: não ouviu, não entendeu, o áudio cortou, pediu para
 * repetir. A entrevistadora repete o que disse por último e a conversa fica no mesmo lugar.
 */
export function pedeRepeticao(texto: string): boolean {
  return encaixa(texto, REPETICAO, 14);
}

/**
 * A pessoa ainda está respondendo: pediu um momento para pensar ou avisou que não terminou. A
 * entrevistadora devolve a palavra e a conversa fica no mesmo lugar — e se ela tinha acabado de
 * fazer outra pergunta, essa pergunta volta a ficar pendente (ver `posicaoNoRoteiro`).
 */
export function pedeContinuar(texto: string): boolean {
  return encaixa(texto, CONTINUACAO, 10);
}
