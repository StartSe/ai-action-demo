import { describe, expect, test } from 'vitest'

import {
  avaliarChamada,
  CRITERIOS_MINIMOS,
  notaDosItens,
  type CriterioObjetivo,
  type PortaDeAvaliacao,
  type TurnoDaConversa,
} from './avaliacao.ts'

const CONVERSA: readonly TurnoDaConversa[] = [
  { papel: 'sarah', texto: 'Oi, Marcos! Aqui é a Sarah, da Fluxo Cargo.', instante: '2026-09-24T12:00:01Z' },
  { papel: 'sarah', texto: 'Antes de tudo: esta ligação é gravada, tudo bem?', instante: '2026-09-24T12:00:04Z' },
  { papel: 'interlocutor', texto: 'Tudo bem, ligação é gravada, pode falar.', instante: '2026-09-24T12:00:07Z' },
]

function porta(resposta: string | Error): PortaDeAvaliacao & { chamadas: number } {
  const duble = {
    chamadas: 0,
    async julgar() {
      duble.chamadas += 1
      if (resposta instanceof Error) throw resposta
      return resposta
    },
  }
  return duble
}

const SO_TRECHO = CRITERIOS_MINIMOS.filter((c) => c.como === 'trecho')

describe('critérios por trecho', () => {
  test('decidem sem chamar a porta nenhuma vez', async () => {
    const p = porta('{}')
    const r = await avaliarChamada(CONVERSA, SO_TRECHO, p)
    expect(p.chamadas).toBe(0)
    expect(r.itens.map((i) => [i.criterio, i.aprovado])).toEqual([
      ['aviso_gravacao', true],
      ['identificacao_honesta', true],
    ])
    expect(r.nota).toBe(10)
    expect(r.reprovados()).toEqual([])
  })

  test('o aviso de gravação devolve o instante do turno em que apareceu', async () => {
    const r = await avaliarChamada(CONVERSA, SO_TRECHO, porta('{}'))
    expect(r.avisoDeGravacaoEm).toBe('2026-09-24T12:00:04Z')
    expect(r.itens[0]!.evidencia).toMatch(/gravada/)
  })

  test('só a fala da Sarah conta: o lead repetir a frase não aprova', async () => {
    const semAviso = CONVERSA.filter((_, i) => i !== 1)
    const r = await avaliarChamada(semAviso, SO_TRECHO, porta('{}'))
    expect(r.itens[0]).toEqual({ criterio: 'aviso_gravacao', aprovado: false, evidencia: null })
    expect(r.avisoDeGravacaoEm).toBeNull()
  })

  test('obrigatório reprovado derruba a nota para zero e aparece em reprovados', async () => {
    const r = await avaliarChamada([CONVERSA[0]!], SO_TRECHO, porta('{}'))
    expect(r.nota).toBe(0)
    expect(r.reprovados()).toEqual(['aviso_gravacao'])
  })
})

describe('critérios por modelo, com a porta dublada', () => {
  const resposta = JSON.stringify({
    criterios: { nada_fora_da_base: { aprovado: true, evidencia: 'Só citou o que está na base.' } },
  })

  test('a forma da resposta e a nota agregada', async () => {
    const p = porta(resposta)
    const r = await avaliarChamada(CONVERSA, CRITERIOS_MINIMOS, p)
    expect(p.chamadas).toBe(1)
    expect(r.itens).toHaveLength(3)
    expect(r.itens[2]).toEqual({
      criterio: 'nada_fora_da_base',
      aprovado: true,
      evidencia: 'Só citou o que está na base.',
    })
    expect(r.nota).toBe(10)
  })

  test('não obrigatório reprovado pesa proporcionalmente', async () => {
    const r = await avaliarChamada(
      CONVERSA,
      CRITERIOS_MINIMOS,
      porta(JSON.stringify({ nada_fora_da_base: { aprovado: false, evidencia: 'Prometeu desconto.' } })),
    )
    expect(r.nota).toBe(6.7)
    expect(r.reprovados()).toEqual(['nada_fora_da_base'])
  })

  test('campo faltando fica sem decisão, e não conta', async () => {
    const r = await avaliarChamada(CONVERSA, CRITERIOS_MINIMOS, porta('{"criterios":{}}'))
    expect(r.itens[2]).toMatchObject({ aprovado: null, motivo: 'nao_informado' })
    expect(r.nota).toBe(10)
    expect(r.reprovados()).toEqual([])
  })

  test('texto no lugar de JSON fica sem decisão', async () => {
    const r = await avaliarChamada(CONVERSA, CRITERIOS_MINIMOS, porta('A Sarah foi ótima!'))
    expect(r.itens[2]).toMatchObject({ aprovado: null, motivo: 'resposta_ilegivel' })
  })

  test('tipo inválido fica sem decisão', async () => {
    const r = await avaliarChamada(
      CONVERSA,
      CRITERIOS_MINIMOS,
      porta(JSON.stringify({ nada_fora_da_base: { aprovado: 'sim' } })),
    )
    expect(r.itens[2]).toMatchObject({ aprovado: null, motivo: 'tipo_invalido' })
  })

  test('critério desconhecido e nota fora da faixa do modelo são ignorados', async () => {
    const r = await avaliarChamada(
      CONVERSA,
      CRITERIOS_MINIMOS,
      porta(
        JSON.stringify({
          nota: 42,
          criterios: { inventado: { aprovado: false }, nada_fora_da_base: { aprovado: true } },
        }),
      ),
    )
    expect(r.itens.map((i) => i.criterio)).toEqual(['aviso_gravacao', 'identificacao_honesta', 'nada_fora_da_base'])
    expect(r.nota).toBe(10)
  })

  test('porta que levanta não derruba a avaliação', async () => {
    const r = await avaliarChamada(CONVERSA, CRITERIOS_MINIMOS, porta(new Error('fora do ar')))
    expect(r.itens[2]).toMatchObject({ aprovado: null, motivo: 'resposta_ilegivel' })
    expect(r.nota).toBe(10)
  })
})

describe('notaDosItens', () => {
  const criterios: CriterioObjetivo[] = [
    { key: 'a', rotulo: 'A', obrigatorio: false, como: 'modelo' },
    { key: 'b', rotulo: 'B', obrigatorio: false, como: 'modelo' },
    { key: 'c', rotulo: 'C', obrigatorio: false, como: 'modelo' },
    { key: 'd', rotulo: 'D', obrigatorio: false, como: 'modelo' },
  ]
  test('metade aprovada é 5', () => {
    expect(
      notaDosItens(
        [
          { criterio: 'a', aprovado: true, evidencia: null },
          { criterio: 'b', aprovado: false, evidencia: null },
          { criterio: 'c', aprovado: true, evidencia: null },
          { criterio: 'd', aprovado: false, evidencia: null },
        ],
        criterios,
      ),
    ).toBe(5)
  })
  test('nenhuma decisão é zero', () => {
    expect(notaDosItens([{ criterio: 'a', aprovado: null, evidencia: null }], criterios)).toBe(0)
  })
})
