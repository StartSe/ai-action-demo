// De qual modelo a conta fala, e por qual porta (US-246).
//
// A porta é por conta, e só uma delas fala com modelo:
//
//   `openrouter`  a credencial da própria conta, no cofre, falando com o
//                 OpenRouter. É o modelo da conta, pago e escolhido por ela.
//   `platform`    o valor de `model_settings.provider` antes de conectar. O
//                 nome ficou do tempo em que havia chave de modelo da
//                 instalação; hoje quer dizer **sem modelo conectado**, e
//                 `pergunta.ts` recusa sem ir à rede. Nenhuma função chama
//                 modelo com chave que não seja da conta.
//
// **O PADRÃO MORA AQUI, NÃO NO BANCO.** `model_settings` guarda nulo quando a
// conta não escolheu, e é esta tabela que diz o que nulo quer dizer. Gravar o
// padrão como texto no banco congelaria a escolha do dia em que a linha nasceu:
// trocar o modelo de redação no código não alcançaria mais nenhuma conta
// existente, e ninguém entenderia por quê.
//
// **A ESCOLHA SÓ VALE NA PORTA EM QUE FOI FEITA.** Desconectar zera as
// escolhas, e o nome sem barra (`claude-opus-5`) nunca vai para o OpenRouter.
//
// **A DECISÃO DE QUAL MODELO USAR É DE UM LUGAR SÓ.** As funções que falam
// com modelo chamam `modeloDaTarefa`, e nenhuma delas repete a regra. Uma
// segunda cópia divergiria no dia em que um padrão mudasse, e o sintoma seria
// uma função usando o modelo antigo sem nada no código dizendo isso.
//
// Módulo portável: sem `Deno`, sem import de rede.

/**
 * As tarefas que falam com modelo. As três de texto e as duas de mídia do
 * WhatsApp (`imagem`, `audio`); a coluna de cada uma em `model_settings` é
 * `model_for_<tarefa>`, com `imagem` em `model_for_image`.
 */
export const TAREFAS = ['draft', 'classify', 'review', 'imagem', 'audio'] as const
export type Tarefa = (typeof TAREFAS)[number]

/**
 * O que a tarefa manda ao modelo, no vocabulário de
 * `architecture.input_modalities` do catálogo do OpenRouter. É por aqui que a
 * tela oferece só os modelos que aceitam a entrada da tarefa.
 */
export type EntradaDoModelo = 'text' | 'image' | 'audio'
export const ENTRADA_DA_TAREFA: Readonly<Record<Tarefa, EntradaDoModelo>> = {
  draft: 'text',
  classify: 'text',
  review: 'text',
  imagem: 'image',
  audio: 'audio',
}

/**
 * O padrão das duas tarefas de mídia: o Gemini 3.1 Flash Lite pelo OpenRouter.
 * Barato (US$ 0,25 por milhão de tokens de entrada no catálogo de 2026-09),
 * aceita imagem e áudio na mesma conversa de chat, sem data de expiração no
 * catálogo, e o Gemini lê ogg, que é o formato da nota de voz do WhatsApp
 * (ogg/opus), sem conversão. O 2.5 Flash Lite, mais barato, sai do catálogo em
 * 2026-10-20. Conferir no degrau 3 (suposição M3 de `leitura-de-midia.ts`).
 */
export const MODELO_PADRAO_DE_MIDIA = 'google/gemini-3.1-flash-lite'

/**
 * As duas portas, as mesmas do check de `model_settings.provider`. `platform`
 * é a conta sem modelo conectado: ver o cabeçalho.
 */
export const PORTAS = ['platform', 'openrouter'] as const
export type Porta = (typeof PORTAS)[number]

/**
 * O modelo padrão de cada tarefa em cada porta.
 *
 * O opus redige e o sonnet classifica: é a decisão de P-03 e da seção 10 do
 * PRD de produto. A classificação acontece dentro dos 60 s da ficha e é leitura
 * contra vocabulário fechado; a redação de roteiro e a revisão de ligação são
 * texto que a Sarah vai falar, e ninguém espera por elas ao vivo.
 */
export const MODELOS_PADRAO: Readonly<Record<Porta, Readonly<Record<Tarefa, string>>>> = {
  platform: {
    draft: 'claude-opus-5',
    classify: 'claude-sonnet-5',
    review: 'claude-opus-5',
    imagem: 'gemini-3.1-flash-lite',
    audio: 'gemini-3.1-flash-lite',
  },
  openrouter: {
    draft: 'anthropic/claude-opus-5',
    classify: 'anthropic/claude-sonnet-5',
    review: 'anthropic/claude-opus-5',
    imagem: MODELO_PADRAO_DE_MIDIA,
    audio: MODELO_PADRAO_DE_MIDIA,
  },
}

/** O que `resolver_modelo_da_conta` devolve, antes de o padrão entrar. */
export interface EscolhaDaConta {
  readonly provider: string
  /** O modelo escolhido, ou nulo quando a conta nunca escolheu. */
  readonly model: string | null
}

export interface ModeloResolvido {
  readonly porta: Porta
  readonly modelo: string
  /** O modelo veio da escolha da conta, e não do padrão do código. */
  readonly escolhidoPelaConta: boolean
}

/** A porta conhecida, ou a da plataforma quando o valor não é uma delas. */
export function lerPorta(valor: unknown): Porta {
  return typeof valor === 'string' && (PORTAS as readonly string[]).includes(valor)
    ? (valor as Porta)
    : 'platform'
}

/**
 * O modelo que atende esta tarefa nesta conta.
 *
 * Escolha de porta errada é descartada: a conta que escolheu
 * `anthropic/claude-opus-5` e depois voltou para a plataforma não pode mandar
 * esse nome para a Anthropic. Na prática `desconectar_modelo_da_conta` já zera
 * as escolhas, e esta guarda é a rede embaixo dela — o dia em que alguém mexer
 * na linha por SQL é o dia em que ela trabalha.
 */
export function modeloDaTarefa(escolha: EscolhaDaConta | null, tarefa: Tarefa): ModeloResolvido {
  const porta = lerPorta(escolha?.provider)
  const padrao = MODELOS_PADRAO[porta][tarefa]

  const escolhido = typeof escolha?.model === 'string' ? escolha.model.trim() : ''
  if (escolhido === '' || !serveNaPorta(escolhido, porta)) {
    return { porta, modelo: padrao, escolhidoPelaConta: false }
  }
  return { porta, modelo: escolhido, escolhidoPelaConta: true }
}

/**
 * O identificador cabe nesta porta. A régua é a barra: o OpenRouter nomeia por
 * `organização/modelo` e a Anthropic não usa barra em nome de modelo nenhum.
 * É régua grosseira de propósito — ela só precisa pegar o identificador de uma
 * porta usado na outra, e não validar que o modelo existe, o que só o provedor
 * sabe responder.
 */
export function serveNaPorta(modelo: string, porta: Porta): boolean {
  return porta === 'openrouter' ? modelo.includes('/') : !modelo.includes('/')
}

/**
 * O modelo aceita a entrada da tarefa. Catálogo sem `input_modalities` é
 * "não sei": serve para texto, que todo modelo de chat lê, e não serve para
 * mídia, porque mandar áudio a quem não ouve é pagar por um erro.
 */
export function aceitaAEntrada(entradas: readonly string[] | null, tarefa: Tarefa): boolean {
  const entrada = ENTRADA_DA_TAREFA[tarefa]
  if (entradas === null) return entrada === 'text'
  return entradas.includes(entrada)
}
