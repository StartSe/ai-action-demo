// O limite de taxa é a única barreira que responde na hora quando a chave de um
// cliente vaza, e o dano que ele contém é fatura, não lista suja. Quatro coisas
// o sustentam, e cada uma tem teste aqui.
//
// 1. O teto vale: 60 passam, o 61º não.
// 2. A janela desliza: ela não zera de uma vez na virada do minuto.
// 3. É por conta: uma conta em excesso não cala as outras.
// 4. O recusado não conta. Sem isso, um formulário com laço de retentativa
//    ficaria fora do ar pelo tempo que insistisse — o limite viraria bloqueio.
//
// O relógio entra por parâmetro, então o teste avança sessenta segundos sem
// timer falso e sem esperar.

import { describe, expect, test } from 'vitest'

import {
  criarLimiteDeTaxa,
  JANELA_EM_MS,
  PEDIDOS_POR_JANELA,
  type DecisaoDoLimite,
} from './limite-de-taxa.ts'

/** Relógio de mentira, com avanço explícito. */
function relogio(inicio = 1_700_000_000_000) {
  let momento = inicio
  return {
    agora: () => momento,
    avancar(ms: number) {
      momento += ms
    },
  }
}

function esperaDe(decisao: DecisaoDoLimite): number {
  return decisao.permitido ? 0 : decisao.esperarSegundos
}

test('o teto de L-02 é 60 pedidos por minuto', () => {
  expect(PEDIDOS_POR_JANELA).toBe(60)
  expect(JANELA_EM_MS).toBe(60_000)
})

test('os 60 primeiros passam e o 61º é recusado', () => {
  const tempo = relogio()
  const limite = criarLimiteDeTaxa({ agora: tempo.agora })

  for (let pedido = 1; pedido <= 60; pedido += 1) {
    expect(limite.registrar('conta-alfa').permitido).toBe(true)
  }

  expect(limite.registrar('conta-alfa').permitido).toBe(false)
})

test('o 429 diz quantos segundos esperar, e nunca zero', () => {
  const tempo = relogio()
  const limite = criarLimiteDeTaxa({ agora: tempo.agora })

  for (let pedido = 1; pedido <= 60; pedido += 1) limite.registrar('conta-alfa')

  // Nada avançou: o mais antigo dos 60 sai da janela em 60 s.
  expect(esperaDe(limite.registrar('conta-alfa'))).toBe(60)

  // Quase um minuto depois, falta menos de um segundo — e o cabeçalho é em
  // segundos inteiros, então arredondar para baixo daria zero e convidaria o
  // cliente a tentar de novo na mesma hora.
  tempo.avancar(59_900)
  expect(esperaDe(limite.registrar('conta-alfa'))).toBe(1)
})

test('passada a janela, a conta volta a ser aceita', () => {
  const tempo = relogio()
  const limite = criarLimiteDeTaxa({ agora: tempo.agora })

  for (let pedido = 1; pedido <= 60; pedido += 1) limite.registrar('conta-alfa')
  expect(limite.registrar('conta-alfa').permitido).toBe(false)

  tempo.avancar(JANELA_EM_MS + 1)
  expect(limite.registrar('conta-alfa').permitido).toBe(true)
})

test('a janela desliza: ela não libera os 60 de uma vez na virada', () => {
  // Um pedido por segundo, durante 60 s: a conta gastou a cota inteira, mas
  // espalhada. No segundo 61 só o primeiro pedido saiu da janela, então cabe
  // exatamente um a mais — e não sessenta, como um balde por minuto daria.
  const tempo = relogio()
  const limite = criarLimiteDeTaxa({ agora: tempo.agora })

  for (let segundo = 0; segundo < 60; segundo += 1) {
    expect(limite.registrar('conta-alfa').permitido).toBe(true)
    tempo.avancar(1_000)
  }

  expect(limite.registrar('conta-alfa').permitido).toBe(true)
  expect(limite.registrar('conta-alfa').permitido).toBe(false)
})

test('o limite é por conta: uma em excesso não cala as outras', () => {
  const tempo = relogio()
  const limite = criarLimiteDeTaxa({ agora: tempo.agora })

  for (let pedido = 1; pedido <= 61; pedido += 1) limite.registrar('conta-alfa')

  expect(limite.registrar('conta-alfa').permitido).toBe(false)
  expect(limite.registrar('conta-beta').permitido).toBe(true)
})

describe('o pedido recusado não entra na janela', () => {
  // A discriminação só aparece **depois** de os aceitos saírem da janela. Antes
  // disso, a espera é ditada pelo mais antigo dos aceitos nos dois desenhos, e
  // um teste que a medisse passaria contando ou não contando a recusa. Por isso
  // o teto aqui é 3: dez recusas são muito mais que o teto, então elas sozinhas
  // fechariam a janela se contassem.
  test('a conta que insistiu volta ao ar no fim da janela dos aceitos', () => {
    const tempo = relogio()
    const limite = criarLimiteDeTaxa({
      agora: tempo.agora,
      pedidosPorJanela: 3,
      janelaEmMs: JANELA_EM_MS,
    })

    for (let pedido = 1; pedido <= 3; pedido += 1) {
      expect(limite.registrar('conta-alfa').permitido).toBe(true)
    }

    tempo.avancar(30_000)
    for (let tentativa = 0; tentativa < 10; tentativa += 1) {
      expect(limite.registrar('conta-alfa').permitido).toBe(false)
      tempo.avancar(1_000)
    }

    // Os três aceitos saíram da janela. As dez recusas, se contassem, a
    // manteriam fechada por mais trinta segundos — e um formulário com laço de
    // retentativa mal escrito derrubaria a entrada de leads do cliente.
    tempo.avancar(JANELA_EM_MS - 40_000 + 1)
    expect(limite.registrar('conta-alfa').permitido).toBe(true)
  })

  test('a espera encurta como um relógio enquanto a janela corre', () => {
    const tempo = relogio()
    const limite = criarLimiteDeTaxa({ agora: tempo.agora, pedidosPorJanela: 3 })

    for (let pedido = 1; pedido <= 3; pedido += 1) limite.registrar('conta-alfa')

    tempo.avancar(30_000)
    expect(esperaDe(limite.registrar('conta-alfa'))).toBe(30)
    tempo.avancar(29_000)
    expect(esperaDe(limite.registrar('conta-alfa'))).toBe(1)
  })
})

test('a memória não cresce com conta que mandou um lead e nunca voltou', () => {
  // Duas mil contas, uma cada, e depois a janela passa. A varredura tira as
  // vencidas; sem ela, o isolado guardaria as duas mil para sempre.
  const tempo = relogio()
  const limite = criarLimiteDeTaxa({ agora: tempo.agora })

  for (let conta = 0; conta < 2_000; conta += 1) {
    limite.registrar(`conta-${conta}`)
  }

  expect(limite.chavesGuardadas()).toBe(2_000)

  tempo.avancar(JANELA_EM_MS + 1)
  // A varredura roda quando a chave nova chega com o mapa grande. Depois dela
  // só a chave que a provocou sobrou, e cada uma das duas mil contas tem a cota
  // inteira de novo.
  limite.registrar('conta-que-provoca-a-varredura')

  expect(limite.chavesGuardadas()).toBe(1)
  for (let pedido = 1; pedido <= 60; pedido += 1) {
    expect(limite.registrar('conta-0').permitido).toBe(true)
  }
})

test('teto e janela se ajustam por parâmetro, para o teste de borda não gastar 60 chamadas', () => {
  const tempo = relogio()
  const limite = criarLimiteDeTaxa({ agora: tempo.agora, pedidosPorJanela: 2, janelaEmMs: 10_000 })

  expect(limite.registrar('conta-alfa').permitido).toBe(true)
  expect(limite.registrar('conta-alfa').permitido).toBe(true)
  expect(esperaDe(limite.registrar('conta-alfa'))).toBe(10)

  tempo.avancar(10_001)
  expect(limite.registrar('conta-alfa').permitido).toBe(true)
})
