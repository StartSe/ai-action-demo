// Provas da leitura das ferramentas de sistema sobre fixtures de transcrição
// (US-107). Sem rede e sem banco: cada fixture escolhe o adaptador pelo formato
// que declara, e a leitura conclui as linhas e o fim.
//
// O que este arquivo segura:
//
// 1. **Toda fixture tem adaptador**, e todo adaptador tem fixture: formato novo
//    sem exemplo, ou exemplo de formato que ninguém lê, reprova.
// 2. **As linhas e o fim de cada fixture**, com o instante em milissegundos.
// 3. **A ordem é a do instante**, e não a da lista: a transcrição fora de ordem
//    sai ordenada, e o empate de segundo sai estritamente crescente.
// 4. **A mesma transcrição dá os mesmos instantes** em toda leitura, que é o
//    que mantém a idempotência pelo único `(call_id, tool, at)`.
// 5. **Transcrição sem invocação** é lista vazia, e não erro.

import { describe, expect, test } from 'vitest'

import {
  ADAPTADORES_DE_CONVERSA,
  FORMATO_DA_CONVERSA,
  lerConversa,
  type ConversaDoProvedor,
} from './formato-do-provedor.ts'
import { instantesDasInvocacoes, lerFim, linhasDeInvocacao } from './leitura-da-transcricao.ts'
import {
  INICIO_DAS_TRANSCRICOES_EM_SEGUNDOS,
  TRANSCRICOES_DE_EXEMPLO,
  type TranscricaoDeExemplo,
} from './transcricoes-de-exemplo.ts'

const CHAMADA = { account_id: '11111111-1111-4111-8111-111111111111', id: '22222222-2222-4222-8222-222222222222' }
const INICIO_MS = INICIO_DAS_TRANSCRICOES_EM_SEGUNDOS * 1000

function ler(fixture: TranscricaoDeExemplo): ConversaDoProvedor {
  const conversa = lerConversa(fixture.corpo, fixture.formato)
  if (!conversa) throw new Error(`a fixture ${fixture.nome} não foi lida`)
  return conversa
}

describe('os formatos', () => {
  test('toda fixture declara um formato com adaptador, e todo adaptador tem fixture', () => {
    const declarados = new Set(TRANSCRICOES_DE_EXEMPLO.map((fixture) => fixture.formato))
    expect([...declarados].sort()).toEqual([...ADAPTADORES_DE_CONVERSA.keys()].sort())
  })

  test('o formato em uso tem adaptador, e formato desconhecido levanta em vez de ler como vazio', () => {
    expect(ADAPTADORES_DE_CONVERSA.has(FORMATO_DA_CONVERSA)).toBe(true)
    expect(() => lerConversa({}, 'outro.provedor.v9')).toThrow(/sem adaptador/)
    expect(() => lerConversa({}, 'constructor')).toThrow(/sem adaptador/)
  })
})

describe.each(TRANSCRICOES_DE_EXEMPLO.map((fixture) => [fixture.nome, fixture] as const))(
  'a fixture "%s"',
  (_nome, fixture) => {
    test('as linhas saem na ordem do instante, com o prefixo e o erro', () => {
      const linhas = linhasDeInvocacao(CHAMADA, ler(fixture).invocacoes, INICIO_MS)
      expect(
        linhas.map((linha) => ({ tool: linha.tool, ms: Date.parse(linha.at) - INICIO_MS, error: linha.error })),
      ).toEqual(fixture.esperado.linhas)
      for (const linha of linhas) {
        expect(linha).toMatchObject({ account_id: CHAMADA.account_id, call_id: CHAMADA.id, latency_ms: null })
      }
    })

    test('o fim sai das ferramentas de sistema que deram certo', () => {
      expect(lerFim(ler(fixture), 600)).toEqual({
        motivo: fixture.esperado.motivo,
        atendidaPor: fixture.esperado.atendidaPor,
      })
    })

    test('duas leituras dão os mesmos instantes', () => {
      const primeira = linhasDeInvocacao(CHAMADA, ler(fixture).invocacoes, INICIO_MS)
      const segunda = linhasDeInvocacao(CHAMADA, ler(fixture).invocacoes, INICIO_MS)
      expect(segunda).toEqual(primeira)
    })
  },
)

describe('o instante', () => {
  test('estritamente crescente, sem colisão entre duas da mesma ferramenta no mesmo turno', () => {
    const fixture = TRANSCRICOES_DE_EXEMPLO.find((f) => f.nome.startsWith('pessoa errada'))!
    const linhas = linhasDeInvocacao(CHAMADA, ler(fixture).invocacoes, INICIO_MS)
    const chaves = new Set(linhas.map((linha) => `${linha.tool} ${linha.at}`))
    expect(chaves.size).toBe(linhas.length)
    const instantes = linhas.map((linha) => Date.parse(linha.at))
    expect(instantes).toEqual([...instantes].sort((a, b) => a - b))
    expect(new Set(instantes).size).toBe(instantes.length)
  })

  test('a lista fora de ordem sai pela ordem do instante, e o empate pela ordem da transcrição', () => {
    const ordem = instantesDasInvocacoes(
      [
        { nome: 'end_call', segundo: 9, parametros: {}, erro: null },
        { nome: 'a', segundo: 2, parametros: {}, erro: null },
        { nome: 'b', segundo: 2, parametros: {}, erro: null },
        { nome: 'c', segundo: 2.0005, parametros: {}, erro: null },
      ],
      0,
    )
    expect(ordem.map(({ invocacao, ms }) => [invocacao.nome, ms])).toEqual([
      ['a', 2000],
      ['b', 2001],
      ['c', 2002],
      ['end_call', 9000],
    ])
  })

  test('transcrição sem invocação é lista vazia', () => {
    expect(linhasDeInvocacao(CHAMADA, [], INICIO_MS)).toEqual([])
  })
})
