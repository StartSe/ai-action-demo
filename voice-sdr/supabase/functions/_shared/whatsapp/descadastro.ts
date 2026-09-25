// O pedido de descadastro por mensagem, reconhecido sem modelo.
//
// "Parar", "sair", "não quero mais receber" têm que funcionar mesmo com o
// modelo fora do ar, sem modelo conectado ou com a conversa nas mãos de
// alguém do time: é pedido legal (RF-805), e a resposta dele não pode depender
// de um terceiro. O reconhecimento é conservador de propósito:
//
// - **Palavra solta só vale sozinha.** "Sair" como mensagem inteira é
//   descadastro; "quero sair da planilha e usar um sistema" não é.
// - **Frase vale no meio da mensagem** quando ela só serve para isso ("não
//   quero mais receber", "me tira da lista", "descadastrar").
//
// O que ficar de fora ainda chega ao modelo, que tem `tool-dnc` e a regra
// travada de não perturbe da camada 1.
//
// Módulo portável.

/** A mensagem inteira, sozinha, que é pedido de descadastro. */
const SOZINHAS = new Set([
  'parar',
  'pare',
  'para',
  'sair',
  'stop',
  'cancelar',
  'descadastrar',
  'descadastre',
  'nao quero',
  'nao quero mais',
  'remover',
  'bloquear',
])

/** Frases que, em qualquer lugar da mensagem, só servem para pedir descadastro. */
const FRASES: readonly RegExp[] = [
  /\bdescadastr/,
  /\bnao quero (mais )?(receber|mensage|contato|que (me )?(mande|envie|chame|ligue))/,
  /\bpar[ae] de (me )?(mandar|enviar)/,
  /\b(me )?(tira|tire|remove|remova|exclui|exclua)( meu (numero|contato))? da (sua |de )?(lista|base)/,
  /\bnao (me )?(mande|envie|mandem|enviem) mais/,
  /\bnao entre(m)? mais em contato/,
]

export function normalizarParaDescadastro(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function ePedidoDeDescadastro(texto: string | null | undefined): boolean {
  const limpo = normalizarParaDescadastro(texto ?? '')
  if (limpo === '') return false
  if (SOZINHAS.has(limpo)) return true
  return FRASES.some((frase) => frase.test(limpo))
}
