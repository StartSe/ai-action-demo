// A borda da guarda, com a porta dublada. Sem rede, sem banco e sem relógio: o
// que `guard_dial` decide se prova em `testes/banco/guarda-de-discagem.test.ts`,
// e o que se prova aqui é a tradução da decisão.
//
// O que este arquivo prova:
//
// 1. Um caso por motivo, com a frase e a alternativa que RF-407 exige.
// 2. O código do SQL não sai na resposta. A varredura é sobre o corpo
//    serializado, e não sobre a mensagem, porque o código vaza por qualquer
//    campo — é a regra que a US-013 fixou para código de provedor.
// 3. Falha da guarda é recusa, e nunca liberação: porta que levanta, motivo que
//    o mapa não conhece e liberação sem linha caem todos em
//    `guarda_indisponivel`.
// 4. A frase da janela vem de `janela.ts`, e não de uma segunda escrita dela.
// 5. O módulo não reimplementa contagem, teto nem janela: a varredura do fonte
//    procura comparação e contagem, que é a forma que um teto reescrito tem.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { JANELA_COMERCIAL, MANAUS, SAO_PAULO } from './casos-de-janela.ts'
import { fraseDaJanela } from './janela.ts'
import {
  guardarDiscagem,
  type ChamadaDaGuarda,
  type DecisaoDaGuarda,
  type DiscagemRecusada,
  type MotivoDaGuarda,
  type PedidoDeDiscagem,
  type PortaDeGuarda,
  type RespostaDaGuarda,
} from './guarda.ts'

/** Os dez códigos de `call_attempts.outcome`, como o SQL os escreve. */
const CODIGOS_DO_SQL = [
  'placed',
  'dialing_paused',
  'real_dialing_gate',
  'dnc_active',
  'outside_window',
  'min_interval',
  'daily_per_number',
  'daily_per_account',
  'daily_spend_cap',
  'no_phone_line',
] as const

const TERCA_AS_19H = '2026-10-06T22:00:00Z'

function pedido(ajustes: Partial<PedidoDeDiscagem> = {}): PedidoDeDiscagem {
  return {
    contaId: '11111111-1111-4111-8111-111111111111',
    telefone: '(11) 99999-8888',
    leadId: '22222222-2222-4222-8222-222222222222',
    ator: 'user',
    atorId: '33333333-3333-4333-8333-333333333333',
    fonte: 'manual',
    instante: TERCA_AS_19H,
    fusoDaConta: SAO_PAULO,
    ...ajustes,
  }
}

function resposta(ajustes: Partial<RespostaDaGuarda> = {}): RespostaDaGuarda {
  return {
    allowed: false,
    reason: 'no_phone_line',
    dados: { phone_e164: '+5511999998888' },
    phone_line_id: null,
    ...ajustes,
  }
}

function dublar(devolve: RespostaDaGuarda | Error): {
  porta: PortaDeGuarda
  chamadas: ChamadaDaGuarda[]
} {
  const chamadas: ChamadaDaGuarda[] = []
  const porta: PortaDeGuarda = {
    guardDial: (chamada) => {
      chamadas.push(chamada)
      if (devolve instanceof Error) return Promise.reject(devolve)
      return Promise.resolve(devolve)
    },
  }
  return { porta, chamadas }
}

/** Porta que reprova qualquer toque: é assim que "não chamou" vira prova. */
function portaIntocavel(): PortaDeGuarda {
  return new Proxy({} as PortaDeGuarda, {
    get(_alvo, membro) {
      throw new Error(`a guarda não devia ter sido chamada, e tocou em ${String(membro)}`)
    },
  })
}

function recusada(decisao: DecisaoDaGuarda): DiscagemRecusada {
  if (decisao.ok) throw new Error('era para recusar, e liberou')
  return decisao
}

// A liberação --------------------------------------------------------------------

describe('a discagem liberada', () => {
  it('devolve a linha escolhida e o número já em E.164', async () => {
    const dublê = dublar(
      resposta({
        allowed: true,
        reason: 'placed',
        phone_line_id: '44444444-4444-4444-8444-444444444444',
        dados: { from_number: '+551130000000', phone_e164: '+5511999998888' },
      }),
    )

    const decisao = await guardarDiscagem(pedido(), dublê.porta)

    expect(decisao).toEqual({
      ok: true,
      telefone: '+5511999998888',
      linhaTelefonicaId: '44444444-4444-4444-8444-444444444444',
      numeroDeOrigem: '+551130000000',
    })
  })

  it('manda para a guarda as chaves do RPC, com o número normalizado', async () => {
    const dublê = dublar(resposta({ allowed: true, reason: 'placed', phone_line_id: 'linha' }))

    await guardarDiscagem(
      pedido({ telefone: '11 99999 8888', fonte: 'camp', campanhaId: 'campanha', pular: ['min_interval'] }),
      dublê.porta,
    )

    expect(dublê.chamadas).toEqual([
      {
        p_account_id: '11111111-1111-4111-8111-111111111111',
        p_phone_e164: '+5511999998888',
        p_lead_id: '22222222-2222-4222-8222-222222222222',
        p_actor: 'user',
        p_actor_id: '33333333-3333-4333-8333-333333333333',
        p_source: 'camp',
        p_campaign_id: 'campanha',
        p_bypass: ['min_interval'],
        p_instante: TERCA_AS_19H,
      },
    ])
  })
})

// Um caso por motivo --------------------------------------------------------------

describe('cada recusa tem motivo e alternativa', () => {
  const casos: ReadonlyArray<
    readonly [string, MotivoDaGuarda, Partial<RespostaDaGuarda>, RegExp]
  > = [
    [
      'freio de emergência',
      'freio_puxado',
      { reason: 'dialing_paused', dados: { paused_at: '2026-10-06T21:00:00Z' } },
      /freio de emergência/,
    ],
    [
      'portão de lead real',
      'portao_de_lead_real',
      { reason: 'real_dialing_gate', dados: { real_dialing: false, first_test_call_ok_at: null } },
      /números de teste/,
    ],
    [
      'lista de bloqueio',
      'numero_bloqueado',
      { reason: 'dnc_active', dados: { dnc_reason: 'pedido do contato', dnc_source: 'manual' } },
      /não perturbe/,
    ],
    [
      'teto por número',
      'teto_por_numero',
      { reason: 'daily_per_number', dados: { cap: 3, count: 3 } },
      /as 3 ligações/,
    ],
    [
      'teto da conta',
      'teto_da_conta',
      { reason: 'daily_per_account', dados: { cap: 200, count: 200 } },
      /as 200 ligações/,
    ],
    [
      'teto de gasto',
      'teto_de_gasto',
      { reason: 'daily_spend_cap', dados: { cap_cents: 4000, spent_cents: 4100 } },
      /R\$\s40,00/,
    ],
    [
      'sem linha disponível',
      'sem_linha_disponivel',
      { reason: 'no_phone_line', dados: { lines_in_rotation: 0 } },
      /linha telefônica/,
    ],
  ]

  it.each(casos)('recusa por %s', async (_nome, motivo, ajustes, naMensagem) => {
    const dublê = dublar(resposta(ajustes))

    const decisao = recusada(await guardarDiscagem(pedido(), dublê.porta))

    expect(decisao.motivo).toBe(motivo)
    expect(decisao.mensagem).toMatch(naMensagem)
    expect(decisao.alternativa.length).toBeGreaterThan(20)
    expect(decisao.telefone).toBe('+5511999998888')
  })

  it('recusa telefone que não é número brasileiro, sem chegar à guarda', async () => {
    const decisao = recusada(
      await guardarDiscagem(pedido({ telefone: '(11) 8888-7777' }), portaIntocavel()),
    )

    expect(decisao.motivo).toBe('telefone_invalido')
    expect(decisao.telefone).toBeNull()
    expect(decisao.alternativa).toMatch(/nove dígitos/)
  })

  it('diz a janela e quando ela abre, com a frase do módulo da janela', async () => {
    const dublê = dublar(
      resposta({
        reason: 'outside_window',
        dados: {
          timezone: SAO_PAULO,
          window: JANELA_COMERCIAL,
          next_open_at: '2026-10-07T12:00:00Z',
        },
      }),
    )

    const decisao = recusada(await guardarDiscagem(pedido(), dublê.porta))

    expect(decisao.motivo).toBe('fora_da_janela')
    expect(decisao.mensagem).toBe(
      'Agora está fora da janela de discagem deste lead: das 9h às 18h.',
    )
    expect(decisao.alternativa).toBe('A janela abre de novo quarta-feira às 9h.')
  })

  it('repete o horário no fuso de quem lê quando o lead está em outro (T-21)', async () => {
    const dublê = dublar(
      resposta({
        reason: 'outside_window',
        dados: { timezone: MANAUS, window: JANELA_COMERCIAL },
      }),
    )

    const decisao = recusada(await guardarDiscagem(pedido(), dublê.porta))

    const doModulo = fraseDaJanela({
      janela: JANELA_COMERCIAL,
      instante: TERCA_AS_19H,
      fusoDoLead: MANAUS,
      fusoDaConta: SAO_PAULO,
    })
    expect(decisao.mensagem).toContain(doModulo)
    expect(decisao.mensagem).toMatch(/no horário de Manaus, que é 10h às 19h aqui/)
  })

  it('diz o intervalo e o horário em que o número libera', async () => {
    const dublê = dublar(
      resposta({
        reason: 'min_interval',
        dados: {
          min_interval_minutes: 30,
          last_attempt_at: '2026-10-06T21:50:00Z',
          next_allowed_at: '2026-10-06T22:20:00Z',
        },
      }),
    )

    const decisao = recusada(await guardarDiscagem(pedido(), dublê.porta))

    expect(decisao.motivo).toBe('intervalo_minimo')
    expect(decisao.mensagem).toMatch(/espera 30 minutos/)
    expect(decisao.alternativa).toMatch(/libera às 19h20/)
  })

  it('não imprime buraco quando o banco não manda os números', async () => {
    for (const reason of ['outside_window', 'min_interval', 'daily_per_number', 'daily_spend_cap']) {
      const dublê = dublar(resposta({ reason, dados: null }))

      const decisao = recusada(await guardarDiscagem(pedido(), dublê.porta))

      expect(decisao.mensagem, reason).not.toMatch(/undefined|null|NaN/)
      expect(decisao.alternativa, reason).not.toMatch(/undefined|null|NaN/)
    }
  })
})

// Guarda que quebra não libera ------------------------------------------------------

// O portão diz o que falta (US-074) ------------------------------------------------

describe('a recusa do portão diz o que falta e onde cadastrar', () => {
  const LIGACAO_DE_TESTE = '2026-10-01T15:00:00Z'
  const casos: ReadonlyArray<readonly [string, Record<string, unknown>, RegExp, RegExp | null]> = [
    [
      'sem bandeira e sem ligação de teste',
      { real_dialing: false, first_test_call_ok_at: null },
      /falta a liberação da discagem para lead real, .* e uma ligação de teste/,
      null,
    ],
    [
      'com bandeira e sem ligação de teste',
      { real_dialing: true, first_test_call_ok_at: null },
      /falta uma ligação de teste desta conta que termine com transcrição\./,
      /liberação/,
    ],
    [
      'sem bandeira e com ligação de teste',
      { real_dialing: false, first_test_call_ok_at: LIGACAO_DE_TESTE },
      /falta a liberação da discagem para lead real, que quem instalou o produto faz uma vez nesta instalação\./,
      /ligação de teste/,
    ],
  ]

  it.each(casos)('%s', async (_nome, dados, falta, naoDiz) => {
    const dublê = dublar(resposta({ reason: 'real_dialing_gate', dados }))

    const decisao = recusada(await guardarDiscagem(pedido(), dublê.porta))

    expect(decisao.motivo).toBe('portao_de_lead_real')
    expect(decisao.mensagem).toMatch(/só liga para os números de teste/)
    expect(decisao.mensagem).toMatch(falta)
    if (naoDiz) expect(decisao.mensagem).not.toMatch(naoDiz)
    expect(decisao.alternativa).toMatch(/lista de teste em Discagem, na administração da conta/)
    // A recusa é frase de cliente (D-07): nada de etapa de construção.
    expect(`${decisao.mensagem} ${decisao.alternativa}`).not.toMatch(/\bfases?\b|\bfatias?\b|portão/i)
  })

  it('sem o estado do portão, a recusa não fala de fase nem de portão', async () => {
    const dublê = dublar(resposta({ reason: 'real_dialing_gate' }))

    const decisao = recusada(await guardarDiscagem(pedido(), dublê.porta))

    expect(decisao.mensagem).toBe('Por enquanto a assistente só liga para os números de teste da conta.')
    expect(`${decisao.mensagem} ${decisao.alternativa}`).not.toMatch(/\bfases?\b|\bfatias?\b|portão/i)
  })

  it('quando só falta a ligação de teste, a alternativa oferece os dois caminhos', async () => {
    const dublê = dublar(
      resposta({
        reason: 'real_dialing_gate',
        dados: { real_dialing: true, first_test_call_ok_at: null },
      }),
    )

    const decisao = recusada(await guardarDiscagem(pedido(), dublê.porta))

    expect(decisao.alternativa).toMatch(/Cadastre este número na lista de teste/)
    expect(decisao.alternativa).toMatch(/ou faça uma ligação de teste/)
  })

  it('com a liberação da fase faltando, a alternativa não manda fazer a ligação de teste', async () => {
    const dublê = dublar(
      resposta({
        reason: 'real_dialing_gate',
        dados: { real_dialing: false, first_test_call_ok_at: null },
      }),
    )

    const decisao = recusada(await guardarDiscagem(pedido(), dublê.porta))

    expect(decisao.alternativa).not.toMatch(/faça uma ligação de teste/)
  })

  it('sem o estado do portão em dados, cai na frase genérica com o caminho de saída', async () => {
    const dublê = dublar(resposta({ reason: 'real_dialing_gate', dados: null }))

    const decisao = recusada(await guardarDiscagem(pedido(), dublê.porta))

    expect(decisao.mensagem).not.toMatch(/falta/)
    expect(decisao.alternativa).toMatch(/lista de teste em Discagem/)
  })
})

describe('a guarda indisponível', () => {
  it('recusa quando a porta levanta, e não deixa o erro cru vazar', async () => {
    const dublê = dublar(new Error('função guard_dial não existe no schema public'))

    const decisao = recusada(await guardarDiscagem(pedido(), dublê.porta))

    expect(decisao.motivo).toBe('guarda_indisponivel')
    expect(decisao.mensagem).not.toMatch(/guard_dial|schema/)
    expect(decisao.alternativa).toMatch(/de novo/)
  })

  it('recusa motivo que o mapa não conhece, em vez de liberar', async () => {
    const dublê = dublar(resposta({ reason: 'motivo_que_a_f7_inventou' }))

    const decisao = recusada(await guardarDiscagem(pedido(), dublê.porta))

    expect(decisao.motivo).toBe('guarda_indisponivel')
  })

  it('recusa liberação que veio com motivo desconhecido', async () => {
    const dublê = dublar(
      resposta({ allowed: true, reason: 'motivo_que_a_f7_inventou', phone_line_id: 'linha' }),
    )

    const decisao = recusada(await guardarDiscagem(pedido(), dublê.porta))

    expect(decisao.motivo).toBe('guarda_indisponivel')
  })

  it('recusa liberação sem linha telefônica', async () => {
    const dublê = dublar(resposta({ allowed: true, reason: 'placed', phone_line_id: null }))

    const decisao = recusada(await guardarDiscagem(pedido(), dublê.porta))

    expect(decisao.motivo).toBe('guarda_indisponivel')
  })
})

// O código não sai daqui -------------------------------------------------------------

describe('a tradução', () => {
  it('não deixa o código do SQL no corpo da recusa', async () => {
    for (const reason of CODIGOS_DO_SQL) {
      const dublê = dublar(
        resposta({
          reason,
          dados: {
            timezone: SAO_PAULO,
            window: JANELA_COMERCIAL,
            min_interval_minutes: 30,
            next_allowed_at: '2026-10-06T22:20:00Z',
            cap: 3,
            cap_cents: 4000,
          },
        }),
      )

      const decisao = await guardarDiscagem(pedido(), dublê.porta)
      const corpo = JSON.stringify(decisao)

      for (const codigo of CODIGOS_DO_SQL) {
        expect(corpo, `${reason} vaza ${codigo}`).not.toContain(codigo)
      }
    }
  })

  it('escreve frase, e não código, em toda recusa', async () => {
    for (const reason of CODIGOS_DO_SQL) {
      const dublê = dublar(resposta({ reason }))

      const decisao = recusada(await guardarDiscagem(pedido(), dublê.porta))

      for (const frase of [decisao.mensagem, decisao.alternativa]) {
        expect(frase.length, reason).toBeGreaterThan(20)
        expect(frase, reason).toMatch(/\.$/)
        expect(frase, `${reason} vaza código na frase`).not.toContain('_')
      }
    }
  })
})

// O tamanho do módulo -----------------------------------------------------------------

describe('o módulo apenas normaliza e chama', () => {
  it('não reimplementa contagem, teto nem janela', () => {
    const fonte = readFileSync(new URL('./guarda.ts', import.meta.url), 'utf8')

    // Comparação é a forma que um teto reescrito tem. `=>` e os genéricos de
    // TypeScript não têm espaço dos dois lados do sinal, e por isso não casam.
    expect(fonte, 'comparação de limite').not.toMatch(/\s[<>]=?\s/)
    expect(fonte, 'contagem').not.toMatch(/\.length|\.filter\(|\.reduce\(|\.some\(/)
    expect(fonte, 'relógio').not.toMatch(/Date\.now|new Date\(/)
    // Somar minutos à mão seria refazer o passo 5; a janela se lê pelo módulo
    // dela, e nunca por deslocamento de fuso somado aqui.
    expect(fonte, 'aritmética de tempo').not.toMatch(/60_000|3600|86_400|getTimezoneOffset/)
  })
})
