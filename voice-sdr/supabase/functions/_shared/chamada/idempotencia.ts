// A chave de idempotência da discagem, num formato só (T-07, L-14).
//
// `calls.idempotency_key` tem único por `(account_id, idempotency_key)` e
// `dial_queue` tem único por `(account_id, source, source_ref, attempt)`. Os
// dois só valem se as cinco rotinas que enfileiram discagem escreverem a chave
// do mesmo jeito: com cinco formatos, a mesma reunião vira `rem:<id>` numa
// rotina e `reminder-<id>` na outra, e o banco aceita as duas ligações porque,
// para ele, são chaves diferentes.
//
// Três decisões atravessam o arquivo:
//
// 1. **As seis fontes entram agora**, e não uma por fatia. `rem`, `rescue`,
//    `cad` e `camp` são de F5 a F7, mas mudar o formato depois que a F6 já
//    enfileirou significa perder a unicidade justamente nas rotinas que mais
//    repetem — cadência e campanha discam o mesmo alvo muitas vezes, e é a
//    chave que separa a terceira tentativa legítima da terceira duplicata.
//    Os seis nomes são os mesmos do `check` de `dial_queue.source`: lista
//    fechada dos dois lados, porque fonte inventada pela borda é uma discagem
//    que o freio de R-09 não enxerga.
// 2. **A recusa devolve código, nunca frase.** Quem lê uma chave é servidor —
//    `cron-dial`, `call-place`, a varredura de recuperação. A frase em
//    português é da borda que responde a gente, e mora no `copy/` da tela ou
//    no `speech/` da Sarah. Código aqui, frase lá.
// 3. **O gerador é função pura de suas entradas.** Duas chamadas com a mesma
//    entrada devolvem a mesma chave: é a definição de idempotência. Um gerador
//    que embutisse `Date.now()` ou `crypto.randomUUID()` continuaria compilando
//    e passaria a criar uma chave nova por tentativa — o único do banco nunca
//    dispararia e a duplicata sairia em silêncio, pela operadora, com a conta
//    pagando as duas ligações.
//
// Módulo portável (`_shared/`): sem Deno, sem rede, sem banco e sem relógio.

/** As seis fontes de T-07, na mesma lista fechada de `dial_queue.source`. */
export const FONTES_DE_DISCAGEM = ['manual', 'stl', 'rem', 'rescue', 'cad', 'camp'] as const

export type FonteDeDiscagem = (typeof FONTES_DE_DISCAGEM)[number]

/**
 * O que cada fonte precisa para formar a própria chave, em união discriminada
 * por `fonte`. É a união que impede `rescue` sem ordinal: sem ela, o segundo
 * resgate da mesma reunião colidiria com o primeiro.
 *
 * `manual` é a única cujo identificador vem de fora, e a razão é a mesma que
 * justifica a fonte existir: quem clica duas vezes no botão de discar manda o
 * mesmo uuid nas duas requisições, porque a tela o gera uma vez, ao abrir o
 * formulário. É esse uuid repetido que o único do banco recusa — gerá-lo aqui
 * daria uma chave nova por clique e as duas ligações sairiam.
 */
export type PedidoDeChave =
  | { readonly fonte: 'manual'; readonly uuidDoCliente: string }
  | { readonly fonte: 'stl'; readonly leadId: string }
  | { readonly fonte: 'rem'; readonly meetingId: string }
  | { readonly fonte: 'rescue'; readonly meetingId: string; readonly ordinal: number }
  | { readonly fonte: 'cad'; readonly enrollmentId: string; readonly passo: number }
  | { readonly fonte: 'camp'; readonly targetId: string; readonly tentativa: number }

/**
 * Por que uma chave não foi lida.
 *
 * `fonte_desconhecida` e `formato_invalido` são separados de propósito: o
 * primeiro é chave de uma rotina que este código não conhece — versão nova
 * escrevendo numa fila antiga — e o segundo é chave da fonte certa com partes
 * de menos ou de mais, que é defeito de quem a formou.
 */
export type MotivoDaRecusa =
  | 'vazia'
  | 'fonte_desconhecida'
  | 'formato_invalido'
  | 'uuid_invalido'
  | 'ordinal_invalido'

export type LeituraDaChave =
  | { readonly ok: true; readonly pedido: PedidoDeChave }
  | { readonly ok: false; readonly motivo: MotivoDaRecusa }

/**
 * O separador é `:`, e não `-`: o uuid já tem hífen, e uma chave composta
 * separada por hífen seria indecomponível.
 */
const SEPARADOR = ':'

/**
 * A forma canônica do uuid: oito-quatro-quatro-quatro-doze, em minúsculo. A
 * versão não é cobrada — o que a coluna guarda é `gen_random_uuid()`, que é v4,
 * mas recusar por versão faria a chave de um lead semeado por migração ser
 * ilegível. Maiúscula é recusada em vez de normalizada: `STL:<ID>` e
 * `stl:<id>` viram chaves diferentes no único do banco, que compara texto, e
 * normalizar aqui esconderia que o chamador está formando a chave errada.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * A chave que vai para `calls.idempotency_key`, e cujas partes vão para
 * `dial_queue.source` e `dial_queue.source_ref`.
 *
 * Entrada malformada é defeito de quem chama, e não dado de fora: o uuid vem do
 * banco em cinco das seis fontes, e da tela na sexta, onde a borda já o validou.
 * Por isso a recusa aqui é exceção, e não código — quem produz chave inválida
 * precisa parar, não seguir com uma chave que o único do banco não protege.
 */
export function chaveDeDiscagem(pedido: PedidoDeChave): string {
  switch (pedido.fonte) {
    case 'manual':
      return juntar('manual', uuid(pedido.uuidDoCliente, 'uuidDoCliente'))
    case 'stl':
      return juntar('stl', uuid(pedido.leadId, 'leadId'))
    case 'rem':
      return juntar('rem', uuid(pedido.meetingId, 'meetingId'))
    case 'rescue':
      return juntar(
        'rescue',
        uuid(pedido.meetingId, 'meetingId'),
        ordinal(pedido.ordinal, 'ordinal'),
      )
    case 'cad':
      return juntar('cad', uuid(pedido.enrollmentId, 'enrollmentId'), ordinal(pedido.passo, 'passo'))
    case 'camp':
      return juntar(
        'camp',
        uuid(pedido.targetId, 'targetId'),
        ordinal(pedido.tentativa, 'tentativa'),
      )
  }
}

/**
 * A chave de volta em partes. É o que a tela da fila usa para dizer de onde
 * veio a discagem, e o que a varredura de recuperação usa para reprogramar a
 * tentativa seguinte sem reinventar o formato.
 */
export function lerChave(texto: string): LeituraDaChave {
  if (texto.length === 0) return recusa('vazia')

  const partes = texto.split(SEPARADOR)
  const fonte = partes[0]
  if (fonte === undefined || !ehFonte(fonte)) return recusa('fonte_desconhecida')

  switch (fonte) {
    case 'manual': {
      const id = simples(partes)
      return id === undefined
        ? recusa('formato_invalido')
        : UUID.test(id)
          ? { ok: true, pedido: { fonte: 'manual', uuidDoCliente: id } }
          : recusa('uuid_invalido')
    }
    case 'stl': {
      const id = simples(partes)
      return id === undefined
        ? recusa('formato_invalido')
        : UUID.test(id)
          ? { ok: true, pedido: { fonte: 'stl', leadId: id } }
          : recusa('uuid_invalido')
    }
    case 'rem': {
      const id = simples(partes)
      return id === undefined
        ? recusa('formato_invalido')
        : UUID.test(id)
          ? { ok: true, pedido: { fonte: 'rem', meetingId: id } }
          : recusa('uuid_invalido')
    }
    case 'rescue': {
      const composta = composto(partes)
      if (!composta.ok) return composta
      return { ok: true, pedido: { fonte: 'rescue', meetingId: composta.id, ordinal: composta.n } }
    }
    case 'cad': {
      const composta = composto(partes)
      if (!composta.ok) return composta
      return { ok: true, pedido: { fonte: 'cad', enrollmentId: composta.id, passo: composta.n } }
    }
    case 'camp': {
      const composta = composto(partes)
      if (!composta.ok) return composta
      return { ok: true, pedido: { fonte: 'camp', targetId: composta.id, tentativa: composta.n } }
    }
  }
}

/** Verdadeiro para os seis nomes que `dial_queue.source` aceita. */
export function ehFonte(valor: string): valor is FonteDeDiscagem {
  return (FONTES_DE_DISCAGEM as readonly string[]).includes(valor)
}

function juntar(...partes: readonly string[]): string {
  return partes.join(SEPARADOR)
}

function recusa(motivo: MotivoDaRecusa): LeituraDaChave {
  return { ok: false, motivo }
}

/** A parte única das fontes simples, ou `undefined` quando há partes demais. */
function simples(partes: readonly string[]): string | undefined {
  return partes.length === 2 ? partes[1] : undefined
}

/** As duas partes das fontes compostas, já validadas. */
function composto(
  partes: readonly string[],
): { ok: true; id: string; n: number } | { ok: false; motivo: MotivoDaRecusa } {
  if (partes.length !== 3) return { ok: false, motivo: 'formato_invalido' }
  const id = partes[1]
  const n = partes[2]
  if (id === undefined || !UUID.test(id)) return { ok: false, motivo: 'uuid_invalido' }
  // `/^[1-9][0-9]*$/` e não `Number.parseInt`: este recorta `'2x'` em `2` e
  // aceitaria uma chave que o banco guardou torta. Zero e negativo ficam de
  // fora porque `dial_queue.attempt` começa em 1.
  if (n === undefined || !/^[1-9][0-9]*$/.test(n)) return { ok: false, motivo: 'ordinal_invalido' }
  return { ok: true, id, n: Number(n) }
}

function uuid(valor: string, campo: string): string {
  if (!UUID.test(valor)) throw new Error(`${campo} não é uuid em forma canônica: ${valor}`)
  return valor
}

function ordinal(valor: number, campo: string): string {
  if (!Number.isInteger(valor) || valor < 1) {
    throw new Error(`${campo} precisa ser inteiro a partir de 1: ${valor}`)
  }
  return String(valor)
}

/**
 * A chave de `calls.idempotency_key` para a tentativa `n` da mesma discagem
 * (RF-417, US-189). A primeira tentativa é a chave da fonte, sem mudança; da
 * segunda em diante ganha `#n`. Sem o sufixo, a retentativa de `stl` ou de
 * `rem` teria a mesma chave da primeira, e `call-place` responderia
 * `ja_existia` — uma reprogramação que não disca.
 *
 * `#` e não `:`: `lerChave` lê `source:source_ref` de `dial_queue`, que nunca
 * leva o sufixo, e um terceiro `:` tornaria `stl:<lead>:2` parecido com a chave
 * composta de outra fonte. A tentativa mora em `dial_queue.attempt`; o sufixo
 * só separa as linhas de `calls`.
 */
export function chaveDaTentativa(chave: string, tentativa: number): string {
  if (!Number.isInteger(tentativa) || tentativa < 1) {
    throw new Error(`tentativa precisa ser inteiro a partir de 1: ${tentativa}`)
  }
  return tentativa === 1 ? chave : `${chave}#${tentativa}`
}
