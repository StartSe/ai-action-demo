// O `x-tool-secret` de uma conta, derivado e não sorteado.
//
// Toda ferramenta que a Sarah chama durante a ligação chega por um endereço
// nosso com o cabeçalho `x-tool-secret` (seção 5 do PRD de implementação). O
// valor é `HMAC(chave_do_servidor, account_id)`: uma chave só na instalação, um
// segredo diferente por conta, e nenhuma linha nova no banco para guardá-lo.
//
// Duas consequências, e as duas são de propósito:
//
// 1. **Quem recebe a ferramenta recalcula em vez de consultar.** Com o segredo
//    sorteado e gravado, cada invocação de ferramenta pagaria uma leitura antes
//    de decidir se o pedido é legítimo; derivado, o mesmo teste é uma conta de
//    microssegundos. É o que T-18 pede.
// 2. **O segredo sai da instalação.** Ele vai gravado na configuração do agente
//    no provedor de voz, porque é o provedor quem chama nossas ferramentas. A
//    seção 8 declara isso em vez de esconder: "o valor nunca sai" vale para o
//    navegador, não para o provedor. Trocar a chave do servidor, portanto, é
//    republicar os quatro agentes de todas as contas — e R-07 é a resposta a
//    isso, aceitando dois segredos por 24 h do lado de quem recebe.
//
// Módulo portável: `crypto.subtle` é Web Crypto e existe no Deno da borda e no
// Node dos testes. Sem Deno, sem rede, sem banco.

import { hashesIguais } from './hash-de-segredo.ts'

const SEGREDO_HEXADECIMAL = /^[0-9a-f]{64}$/

/**
 * O segredo daquela conta, em hexadecimal minúsculo de 64 caracteres — a mesma
 * forma dos hashes do produto, para a comparação em tempo constante de
 * `hash-de-segredo.ts` valer também aqui.
 *
 * Levanta quando a chave do servidor ou a conta chegam vazias: derivar de uma
 * chave em branco daria um segredo perfeitamente válido, igual em todas as
 * instalações que também esqueceram a variável, e o defeito só apareceria como
 * ferramenta de uma conta aceitando pedido de outra instalação.
 */
export async function derivarSegredoDeFerramenta(
  chaveDoServidor: string,
  contaId: string,
): Promise<string> {
  const chave = chaveDoServidor.trim()
  const conta = contaId.trim()
  if (chave === '') throw new Error('chave do servidor ausente')
  if (conta === '') throw new Error('conta ausente')

  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(chave),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const assinatura = await crypto.subtle.sign('HMAC', material, new TextEncoder().encode(conta))
  return [...new Uint8Array(assinatura)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** Verdadeiro para o formato que o cabeçalho carrega. */
export function pareceSegredoDeFerramenta(valor: string): boolean {
  return SEGREDO_HEXADECIMAL.test(valor)
}

/**
 * O que a ferramenta compara. É `hashesIguais` por baixo — comparação em tempo
 * que não depende de onde os dois valores divergem —, e existe com nome próprio
 * para quem escrever a primeira ferramenta não ser tentado a usar `===`.
 */
export function segredosDeFerramentaConferem(recebido: string, esperado: string): boolean {
  return hashesIguais(recebido.trim(), esperado)
}
