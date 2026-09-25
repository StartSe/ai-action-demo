// A avaliação automática da finalização, com o modelo dublado: o juízo entra
// como o que `call-classify` gravou em `calls.evaluation.criterios`. Sem rede e
// sem banco; a porta é um `Proxy` que registra todo membro tocado.

import { describe, expect, test } from 'vitest'

import {
  LINHAS_DA_SEMENTE,
  type ItemDaAvaliacao,
  type LinhaDeCriterio,
} from '../_shared/qualificacao/avaliacao.ts'
import { FALAS_DE_TODO_PROPOSITO } from '../_shared/speech/todos-os-propositos.ts'

import {
  aplicarAvaliacao,
  avisoDeGravacaoEm,
  criteriosAplicados,
  itensRegistrados,
  turnosParaAvaliacao,
  type PortaDaAvaliacaoAutomatica,
} from './avaliacao-automatica.ts'
import { trechoDoAviso } from './consentimento.ts'

const CHAMADA = { id: '22222222-2222-4222-8222-222222222222', account_id: '11111111-1111-4111-8111-111111111111' }
const INICIO = Date.parse('2026-03-20T10:00:00.000Z')
const instante = (segundo: number) => new Date(INICIO + segundo * 1000).toISOString()

const CONVERSA = turnosParaAvaliacao(
  [
    { quem: 'agent', texto: 'Oi, Marcos! Aqui é a Sarah, da Fluxo Cargo.', segundo: 1 },
    { quem: 'agent', texto: 'Antes da gente começar: essa ligação é gravada, tudo bem?', segundo: 3 },
    { quem: 'lead', texto: 'Pode falar.', segundo: 5 },
  ],
  instante,
)

function bancada(evaluation: unknown, falha = false) {
  const tocados: string[] = []
  const gravadas: { itens: readonly ItemDaAvaliacao[]; nota: number | null }[] = []
  const real: PortaDaAvaliacaoAutomatica = {
    async criteriosDaConta() {
      return LINHAS_DA_SEMENTE
    },
    async lerResultadoDaChamada() {
      if (falha) throw new Error('banco fora do ar')
      return { classification_source: 'backfill', classification: {}, sentiment: null, evaluation }
    },
    async registrarAvaliacaoAutomatica(_conta, _chamada, itens, nota) {
      gravadas.push({ itens, nota })
    },
  }
  const porta = new Proxy(real, {
    get(alvo, membro, receptor) {
      tocados.push(String(membro))
      return Reflect.get(alvo, membro, receptor) as unknown
    },
  })
  return { porta, tocados, gravadas }
}

function juizo(respostas: Record<string, boolean>) {
  return {
    criterios: Object.fromEntries(
      Object.entries(respostas).map(([chave, aprovado]) => [chave, { aprovado, justificativa: 'dublado' }]),
    ),
    modelo: 'dublado',
  }
}

const APLICADOS = criteriosAplicados('discovery', LINHAS_DA_SEMENTE, { ligada: true, aviso: null })

describe('os critérios que a chamada aplica', () => {
  test('a camada 1 primeiro, depois os da conta, e a chave em comum uma vez só', () => {
    const chaves = APLICADOS.map((c) => c.key)
    expect(chaves.slice(0, 5)).toEqual(['aviso_gravacao', 'nunca_afirmar', 'bloqueio_atendido', 'humano_atendido', 'pessoa_errada'])
    expect(chaves).toContain('identificacao_honesta')
    expect(chaves).toContain('nada_fora_da_base')
    expect(chaves.filter((c) => c === 'aviso_gravacao')).toHaveLength(1)
  })

  test('o aviso é por trecho, com o do aviso da conta entre os trechos', () => {
    const proprio = 'Oi {nome_do_lead}, aviso que esta conversa fica registrada para qualidade.'
    const aviso = criteriosAplicados('discovery', LINHAS_DA_SEMENTE, { ligada: true, aviso: proprio }).find(
      (c) => c.key === 'aviso_gravacao',
    )
    expect(aviso?.como).toBe('trecho')
    expect(aviso?.obrigatorio).toBe(true)
    expect(aviso?.trechos).toContain(trechoDoAviso(proprio))
    expect(aviso?.trechos).toContain('estou gravando')
  })

  test('sem a linha da conta, o aviso continua decidido pelo turno, e não pelo modelo', () => {
    const aviso = criteriosAplicados('discovery', [], { ligada: true, aviso: null }).find((c) => c.key === 'aviso_gravacao')
    expect(aviso?.como).toBe('trecho')
    expect(aviso?.trechos).toEqual([trechoDoAviso(FALAS_DE_TODO_PROPOSITO.avisoDeGravacao)])
  })

  test('com a gravação desligada, o aviso não se aplica', () => {
    const criterios = criteriosAplicados('discovery', LINHAS_DA_SEMENTE, { ligada: false, aviso: null })
    expect(criterios.find((c) => c.key === 'aviso_gravacao')?.como).toBe('registro')
    const itens = itensRegistrados(criterios, { purpose: 'discovery', direction: 'outbound', answered_at: instante(0) }, [])
    expect(itens).toEqual([{ criterio: 'aviso_gravacao', aprovado: null, evidencia: null, motivo: 'nao_se_aplica' }])
  })

  test('o critério da conta entra depois, pela ordem da coluna position', () => {
    const daConta: LinhaDeCriterio[] = [
      { key: 'segundo', label: 'Segundo', obrigatorio: false, como: 'modelo', trechos: [], position: 9 },
      { key: 'primeiro', label: 'Primeiro', obrigatorio: false, como: 'modelo', trechos: [], position: 4 },
    ]
    const chaves = criteriosAplicados('reminder', daConta, { ligada: true, aviso: null }).map((c) => c.key)
    expect(chaves.slice(-2)).toEqual(['primeiro', 'segundo'])
  })

  test('propósito desconhecido não tem critério', () => {
    expect(criteriosAplicados('outro', LINHAS_DA_SEMENTE, { ligada: true, aviso: null })).toEqual([])
  })
})

describe('o instante do aviso', () => {
  test('é o do turno em que a frase aparece', async () => {
    expect(await avisoDeGravacaoEm(CONVERSA, APLICADOS)).toBe(instante(3))
  })

  test('sem a frase, é nulo', async () => {
    expect(await avisoDeGravacaoEm(CONVERSA.slice(0, 1), APLICADOS)).toBeNull()
  })
})

describe('aplicar e gravar', () => {
  const contexto = { aplica: true, turnos: CONVERSA, criterios: APLICADOS, registrados: [] }

  test('com o juízo gravado: itens de todos os critérios e a nota', async () => {
    const b = bancada(juizo({ nada_fora_da_base: true, nunca_afirmar: false }))
    const desfecho = await aplicarAvaliacao(CHAMADA, contexto, b.porta)

    expect(desfecho).toEqual({ situacao: 'avaliada', nota: 7.5, reprovados: ['nunca_afirmar'] })
    expect(b.gravadas).toHaveLength(1)
    expect(b.gravadas[0]!.itens.map((i) => i.criterio)).toEqual(APLICADOS.map((c) => c.key))
    expect(b.gravadas[0]!.nota).toBe(7.5)
  })

  test('sem juízo, os itens são gravados e a nota fica nula para call-classify completar', async () => {
    const b = bancada({})
    const desfecho = await aplicarAvaliacao(CHAMADA, contexto, b.porta)
    expect(desfecho).toEqual({ situacao: 'avaliada', nota: null, reprovados: [] })
    expect(b.gravadas[0]!.itens.find((i) => i.criterio === 'aviso_gravacao')?.aprovado).toBe(true)
  })

  test('nada decidido, nada escrito', async () => {
    const b = bancada({})
    const desfecho = await aplicarAvaliacao(
      CHAMADA,
      { ...contexto, criterios: criteriosAplicados('discovery', [], { ligada: false, aviso: null }) },
      b.porta,
    )
    expect(desfecho).toEqual({ situacao: 'sem_decisao' })
    expect(b.gravadas).toEqual([])
  })

  test('avaliação não é classificação: a porta tocada só lê a chamada e grava a avaliação', async () => {
    const b = bancada(juizo({ nada_fora_da_base: false }))
    await aplicarAvaliacao(CHAMADA, contexto, b.porta)
    expect([...new Set(b.tocados)].sort()).toEqual(['lerResultadoDaChamada', 'registrarAvaliacaoAutomatica'])
  })

  test('não se aplica: a porta não é tocada', async () => {
    const b = bancada({})
    expect(await aplicarAvaliacao(CHAMADA, { ...contexto, aplica: false }, b.porta)).toEqual({ situacao: 'nao_se_aplica' })
    expect(b.tocados).toEqual([])
  })

  test('falha da porta não levanta', async () => {
    const b = bancada({}, true)
    expect(await aplicarAvaliacao(CHAMADA, contexto, b.porta)).toEqual({ situacao: 'falhou' })
  })
})
