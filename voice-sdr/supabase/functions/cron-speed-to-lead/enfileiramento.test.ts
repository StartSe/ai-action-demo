// cron-speed-to-lead: o enfileiramento dentro da janela, a conta desligada, o
// lead fora da janela registrado, os três casos de lead inelegível, a segunda
// passagem barrada pelo único da fila e o teto de 25.
//
// O dublê é um `dial_queue` e um `speed_to_lead_skips` em memória. `enfileirar`
// implementa o único de R-09 (conta, fonte, referência, tentativa), como
// `dial_queue_unica_por_fonte`, e é por ele que a segunda passagem não cria
// segundo item. `candidatos` tem dois modos: `comoOBanco` filtra como a função
// SQL (conta ligada, sem item `stl`, sem registro de ignorado); o modo ingênuo
// devolve tudo, e é o que simula duas passagens sobrepostas que leram antes de
// qualquer uma escrever. A consulta de verdade se prova em
// `testes/banco/fala-rapido.test.ts`.

import { describe, expect, test } from 'vitest'

import type { LinhaDeFim, PortaDeExecucao } from '../_shared/rotinas/execucao.ts'
import {
  atenderRotina,
  decidirLead,
  enfileirarLeadsNovos,
  type LeadCandidato,
  type LinhaDaFila,
  type LinhaIgnorada,
  type PortaDoFalaRapido,
} from './enfileiramento.ts'

const AGORA = Date.parse('2026-09-23T15:00:00.000Z')
const INSTANTE = new Date(AGORA).toISOString()
const MINUTO = 60_000

/** Uuid com letras, para a conferência da chave não passar à toa. */
function uuid(n: number): string {
  return `abcdef00-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
}

const CONTA = uuid(1)

function lead(n: number, extras: Partial<LeadCandidato> = {}): LeadCandidato {
  return {
    lead_id: uuid(100 + n),
    account_id: CONTA,
    phone_e164: '+5511990000001',
    created_at: new Date(AGORA - 2 * MINUTO).toISOString(),
    bloqueado: false,
    mesclado: false,
    speed_to_lead_enabled: true,
    speed_to_lead_minutes: 5,
    ...extras,
  }
}

function criarCenario(opcoes: { comoOBanco?: boolean } = {}) {
  const comoOBanco = opcoes.comoOBanco ?? true
  const leads: LeadCandidato[] = []
  const fila: LinhaDaFila[] = []
  const ignorados: LinhaIgnorada[] = []
  const pedidosDeCandidatos: { instante: string; limite: number }[] = []
  const respostasDaFila: ('criado' | 'ja_existia')[] = []
  let tocados = 0

  const porta: PortaDoFalaRapido = {
    async candidatos(instante, limite) {
      tocados += 1
      pedidosDeCandidatos.push({ instante, limite })
      return leads
        .filter(
          (l) =>
            !comoOBanco ||
            (l.speed_to_lead_enabled &&
              !fila.some((f) => f.source_ref === l.lead_id) &&
              !ignorados.some((i) => i.lead_id === l.lead_id)),
        )
        .sort((a, b) => (a.created_at > b.created_at ? -1 : a.created_at < b.created_at ? 1 : 0))
        .slice(0, limite)
    },
    async enfileirar(linha) {
      tocados += 1
      const repetida = fila.some(
        (f) =>
          f.account_id === linha.account_id &&
          f.source === linha.source &&
          f.source_ref === linha.source_ref &&
          f.attempt === linha.attempt,
      )
      const resposta = repetida ? 'ja_existia' : 'criado'
      if (!repetida) fila.push(linha)
      respostasDaFila.push(resposta)
      return resposta
    },
    async registrarIgnorado(linha) {
      tocados += 1
      if (!ignorados.some((i) => i.lead_id === linha.lead_id)) ignorados.push(linha)
    },
  }

  const execucoes: LinhaDeFim[] = []
  const execucao: PortaDeExecucao = {
    async inserirExecucao() {
      tocados += 1
      return `execucao-${execucoes.length + 1}`
    },
    async concluirExecucao(_id, fim) {
      execucoes.push(fim)
    },
    async itensDasUltimasExecucoes() {
      return []
    },
  }

  return {
    leads,
    fila,
    ignorados,
    pedidosDeCandidatos,
    respostasDaFila,
    execucoes,
    porta,
    execucao,
    tocados: () => tocados,
    rodar(agora = AGORA) {
      return enfileirarLeadsNovos({ porta, execucao, agora: () => agora })
    },
  }
}

describe('dentro da janela', () => {
  test('o lead novo vira item de fila com discovery, stl e o lead como referência', async () => {
    const cenario = criarCenario()
    const novo = lead(1)
    cenario.leads.push(novo)

    const resultado = await cenario.rodar()

    expect(resultado).toMatchObject({ ok: true, itens: 1 })
    expect(cenario.fila).toEqual([
      {
        account_id: CONTA,
        lead_id: novo.lead_id,
        purpose: 'discovery',
        source: 'stl',
        source_ref: novo.lead_id,
        attempt: 1,
      },
    ])
    expect(cenario.ignorados).toEqual([])
  })

  test('no último instante do prazo ainda enfileira, e um milissegundo depois não', () => {
    const criado = new Date(AGORA - 5 * MINUTO).toISOString()
    const noLimite = lead(1, { created_at: criado })
    expect(decidirLead(noLimite, INSTANTE).tipo).toBe('enfileirar')
    expect(decidirLead(noLimite, new Date(AGORA + 1).toISOString())).toMatchObject({
      tipo: 'ignorar',
      motivo: 'fora_da_janela',
    })
  })

  test('a janela é a da conta: 30 minutos depois entra com janela de 60 e fica de fora com a de 5', () => {
    const criado = new Date(AGORA - 30 * MINUTO).toISOString()
    expect(decidirLead(lead(1, { created_at: criado, speed_to_lead_minutes: 60 }), INSTANTE).tipo).toBe(
      'enfileirar',
    )
    expect(decidirLead(lead(1, { created_at: criado, speed_to_lead_minutes: 5 }), INSTANTE).tipo).toBe(
      'ignorar',
    )
  })
})

describe('só quando a conta pede', () => {
  test('conta com o fala-rápido desligado não enfileira nem registra, mesmo que o lead chegue à rotina', async () => {
    // Modo ingênuo: a consulta deixa passar a conta desligada, e é o módulo
    // que tem de recusar.
    const cenario = criarCenario({ comoOBanco: false })
    cenario.leads.push(lead(1, { speed_to_lead_enabled: false }))

    const resultado = await cenario.rodar()

    expect(resultado.ok).toBe(true)
    expect(cenario.fila).toEqual([])
    expect(cenario.ignorados).toEqual([])
    expect(cenario.respostasDaFila).toEqual([])
  })
})

describe('fora da janela', () => {
  test('passado o prazo, o lead é registrado com a razão e não entra na fila', async () => {
    const cenario = criarCenario()
    const atrasado = lead(1, { created_at: new Date(AGORA - 120 * MINUTO).toISOString() })
    cenario.leads.push(atrasado)

    await cenario.rodar()

    expect(cenario.fila).toEqual([])
    expect(cenario.ignorados).toEqual([
      {
        lead_id: atrasado.lead_id,
        account_id: CONTA,
        reason: 'outside_window',
        detail: 'examinado 120 min depois de chegar, com janela de resposta de 5 min',
      },
    ])
  })

  test('o registro tira o lead da passagem seguinte: nada é enfileirado depois, nem registrado duas vezes', async () => {
    const cenario = criarCenario()
    cenario.leads.push(lead(1, { created_at: new Date(AGORA - 120 * MINUTO).toISOString() }))

    await cenario.rodar()
    const segunda = await cenario.rodar(AGORA + MINUTO)

    expect(segunda).toMatchObject({ ok: true, itens: 0 })
    expect(cenario.ignorados).toHaveLength(1)
    expect(cenario.fila).toEqual([])
  })
})

describe('lead inelegível', () => {
  test.each([
    ['mesclado', { mesclado: true }, 'merged'],
    ['bloqueado', { bloqueado: true }, 'blocked'],
    ['sem telefone válido', { phone_e164: '+14155550100' }, 'invalid_phone'],
    ['com DDD que não existe', { phone_e164: '+5520990000001' }, 'invalid_phone'],
  ] as const)('lead %s não entra na fila e fica registrado com a razão', async (_nome, extras, codigo) => {
    const cenario = criarCenario()
    const inelegivel = lead(1, extras)
    cenario.leads.push(inelegivel)

    await cenario.rodar()

    expect(cenario.fila).toEqual([])
    expect(cenario.respostasDaFila).toEqual([])
    expect(cenario.ignorados).toHaveLength(1)
    expect(cenario.ignorados[0]).toMatchObject({ lead_id: inelegivel.lead_id, account_id: CONTA, reason: codigo })
    expect(cenario.ignorados[0]!.detail).not.toBe('')
  })

  test('a razão de inelegibilidade vence a janela: bloqueado e atrasado é registrado como bloqueado', () => {
    const ambos = lead(1, { bloqueado: true, created_at: new Date(AGORA - 120 * MINUTO).toISOString() })
    expect(decidirLead(ambos, INSTANTE)).toMatchObject({ tipo: 'ignorar', motivo: 'bloqueado' })
  })

  test('a precedência é mesclado, bloqueado, telefone', () => {
    const tudo = lead(1, { mesclado: true, bloqueado: true, phone_e164: '+14155550100' })
    expect(decidirLead(tudo, INSTANTE)).toMatchObject({ motivo: 'mesclado' })
    expect(decidirLead({ ...tudo, mesclado: false }, INSTANTE)).toMatchObject({ motivo: 'bloqueado' })
    expect(decidirLead({ ...tudo, mesclado: false, bloqueado: false }, INSTANTE)).toMatchObject({
      motivo: 'telefone_invalido',
    })
  })
})

describe('idempotência', () => {
  test('a segunda passagem que lê o mesmo lead não cria segundo item: o único da fila barra', async () => {
    // Modo ingênuo: a segunda passagem vê o lead de novo, como duas passagens
    // sobrepostas que leram antes de qualquer uma escrever. Quem impede a
    // segunda ligação é o único, e a prova é a ida à fila contada.
    const cenario = criarCenario({ comoOBanco: false })
    cenario.leads.push(lead(1))

    await cenario.rodar()
    await cenario.rodar(AGORA + MINUTO)

    expect(cenario.respostasDaFila).toEqual(['criado', 'ja_existia'])
    expect(cenario.fila).toHaveLength(1)
  })

  test('com a consulta do banco, a passagem seguinte nem chega a pedir a fila', async () => {
    const cenario = criarCenario()
    cenario.leads.push(lead(1))

    await cenario.rodar()
    await cenario.rodar(AGORA + MINUTO)

    expect(cenario.respostasDaFila).toEqual(['criado'])
  })

  test('decidir não altera o candidato', () => {
    const candidato = Object.freeze(lead(1))
    const antes = structuredClone(candidato)
    decidirLead(candidato, INSTANTE)
    expect(candidato).toEqual(antes)
  })
})

describe('teto de 25', () => {
  test('com 30 leads novos, a passagem pede 25, enfileira 25 e a seguinte leva os 5 restantes', async () => {
    const cenario = criarCenario()
    for (let n = 0; n < 30; n += 1) {
      cenario.leads.push(
        lead(n, { phone_e164: `+55119900${String(n).padStart(5, '0')}`, created_at: new Date(AGORA - MINUTO - n).toISOString() }),
      )
    }

    const primeira = await cenario.rodar()
    expect(cenario.pedidosDeCandidatos[0]).toEqual({ instante: INSTANTE, limite: 25 })
    expect(primeira).toMatchObject({ ok: true, itens: 25 })
    expect(cenario.fila).toHaveLength(25)
    // O mais novo primeiro: lead que acabou de chegar não espera atrás do atrasado.
    expect(cenario.fila[0]!.lead_id).toBe(uuid(100))

    const segunda = await cenario.rodar(AGORA + MINUTO)
    expect(segunda).toMatchObject({ ok: true, itens: 5 })
    expect(cenario.fila).toHaveLength(30)
  })
})

describe('não disca', () => {
  test('a porta não tem operação de discagem', () => {
    const cenario = criarCenario()
    expect(Object.keys(cenario.porta).sort()).toEqual(['candidatos', 'enfileirar', 'registrarIgnorado'])
  })
})

describe('a borda', () => {
  const SEGREDO = 'segredo-interno-de-teste'

  test.each([
    ['ausente', null],
    ['errado', 'outro-segredo'],
  ])('segredo %s responde 401 sem tocar em porta nenhuma', async (_nome, segredo) => {
    const cenario = criarCenario()
    cenario.leads.push(lead(1))
    const resposta = await atenderRotina(
      { metodo: 'POST', segredo },
      { porta: cenario.porta, execucao: cenario.execucao },
      { segredoInterno: SEGREDO },
    )
    expect(resposta.status).toBe(401)
    expect(cenario.tocados()).toBe(0)
  })

  test('segredo interno vazio fecha o portão', async () => {
    const cenario = criarCenario()
    const resposta = await atenderRotina(
      { metodo: 'POST', segredo: '' },
      { porta: cenario.porta, execucao: cenario.execucao },
      { segredoInterno: '' },
    )
    expect(resposta.status).toBe(401)
    expect(cenario.tocados()).toBe(0)
  })

  test('com o segredo certo, roda a passagem', async () => {
    const cenario = criarCenario()
    cenario.leads.push(lead(1))
    const resposta = await atenderRotina(
      { metodo: 'POST', segredo: SEGREDO },
      { porta: cenario.porta, execucao: cenario.execucao, agora: () => AGORA },
      { segredoInterno: SEGREDO },
    )
    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toMatchObject({ ok: true, itens: 1 })
    expect(cenario.fila).toHaveLength(1)
  })

  test('método que não é POST responde 405', async () => {
    const cenario = criarCenario()
    const resposta = await atenderRotina(
      { metodo: 'GET', segredo: SEGREDO },
      { porta: cenario.porta, execucao: cenario.execucao },
      { segredoInterno: SEGREDO },
    )
    expect(resposta.status).toBe(405)
    expect(cenario.tocados()).toBe(0)
  })

  test('a porta que falha encerra a execução com o erro gravado', async () => {
    const cenario = criarCenario()
    cenario.leads.push(lead(1))
    cenario.porta.enfileirar = async () => {
      throw new Error('fila fora do ar')
    }
    const resultado = await cenario.rodar()
    expect(resultado).toMatchObject({ ok: false, erro: 'fila fora do ar' })
    expect(cenario.execucoes[0]).toMatchObject({ error: 'fila fora do ar' })
  })
})
