import { describe, expect, test } from 'vitest'

import { lerRespostaDoModelo, ESQUEMA } from './pedido-ao-modelo.ts'
import {
  ALVOS,
  MAXIMO_DE_PROPOSTAS,
  MOTIVOS_DA_RECUSA,
  nivelDoAlvo,
  propositoDoAlvo,
  validarPropostas,
  type EstadoAtual,
  type PropostaCrua,
} from './propostas.ts'

const ESTADO: EstadoAtual = {
  identidade: {
    nome: 'Sarah',
    primeiraFala: 'Oi, {nome_do_lead}! Aqui é a {nome_do_agente}, da {empresa}.',
    oferta: 'Rastreamento de frota.',
    nuncaAfirmar: ['preço fechado'],
  },
  roteiros: {
    discovery: { roteiro: '1. Cumprimente.\n2. Pergunte pela frota.', jeitoDaCasa: 'Fale com calma.' },
  },
  voz: { stability: 0.5, similarity_boost: 0.75, style: 0.1 },
  politica: {
    duracao_maxima: 600,
    intervalo_minimo: 60,
    tentativas_por_numero: 3,
    teto_diario: 200,
    simultaneidade: 2,
  },
  avisoDeGravacao: null,
}

function crua(sobre: PropostaCrua): PropostaCrua {
  return { titulo: 'Título', razao: 'Porque a ligação mostrou.', texto: null, lista: null, numero: null, ajustes: null, ...sobre }
}

function recusaDe(sobre: PropostaCrua, estado: EstadoAtual = ESTADO): string | undefined {
  const { aceitas, recusadas } = validarPropostas([crua(sobre)], estado)
  expect(aceitas).toEqual([])
  return recusadas[0]?.motivo
}

describe('a lista fechada de alvos', () => {
  test('cobre todo nível do agente, os quatro propósitos nas duas camadas e o republicar', () => {
    expect(new Set(ALVOS.map(nivelDoAlvo))).toEqual(
      new Set(['identidade', 'roteiro', 'jeito_da_casa', 'voz', 'politica', 'privacidade', 'republicar']),
    )
    for (const proposito of ['discovery', 'reminder', 'rescue', 'followup']) {
      expect(ALVOS).toContain(`roteiro.${proposito}`)
      expect(ALVOS).toContain(`jeito_da_casa.${proposito}`)
    }
    expect(ALVOS).toContain('politica.duracao_maxima')
    expect(propositoDoAlvo('roteiro.rescue')).toBe('rescue')
    expect(propositoDoAlvo('identidade.nome')).toBeNull()
  })

  test('o esquema do modelo pede o alvo pela mesma lista', () => {
    const itens = (ESQUEMA.properties as Record<string, { items: { properties: { alvo: { enum: string[] } } } }>).propostas
    expect(itens?.items.properties.alvo.enum).toEqual([...ALVOS])
  })

  test('alvo fora da lista vira recusa, não aproximação', () => {
    expect(recusaDe({ alvo: 'identidade.saudacao', texto: 'Oi.' })).toBe(MOTIVOS_DA_RECUSA.alvo_desconhecido)
    expect(recusaDe({ alvo: 'roteiro.vendas', texto: 'Oi.' })).toBe(MOTIVOS_DA_RECUSA.alvo_desconhecido)
  })
})

describe('o valor proposto, alvo a alvo', () => {
  test('texto: o antes vem do estado, e não do modelo', () => {
    const { aceitas } = validarPropostas(
      [crua({ alvo: 'identidade.primeira_fala', texto: 'Oi, {nome_do_lead}! Tudo bem? Aqui é a Sarah.' })],
      ESTADO,
    )
    expect(aceitas[0]).toMatchObject({
      id: 'p1',
      alvo: 'identidade.primeira_fala',
      antes: ESTADO.identidade?.primeiraFala,
      depois: 'Oi, {nome_do_lead}! Tudo bem? Aqui é a Sarah.',
      origem: 'modelo',
    })
  })

  test('texto com marcador desconhecido ou chaves duplas é recusado', () => {
    expect(recusaDe({ alvo: 'identidade.primeira_fala', texto: 'Oi, {cargo}!' })).toBe(MOTIVOS_DA_RECUSA.marcador_desconhecido)
    expect(recusaDe({ alvo: 'roteiro.discovery', texto: 'Diga {{nome}}.' })).toBe(MOTIVOS_DA_RECUSA.marcador_do_provedor)
    expect(recusaDe({ alvo: 'identidade.nome', texto: 'Sarah {empresa}' })).toBe(MOTIVOS_DA_RECUSA.marcador_desconhecido)
  })

  test('roteiro que promete horário é recusado (O-06)', () => {
    expect(recusaDe({ alvo: 'roteiro.discovery', texto: 'Diga que a especialista liga amanhã às 10h.' })).toBe(
      MOTIVOS_DA_RECUSA.promete_horario,
    )
  })

  test('roteiro de propósito sem versão vigente é recusado', () => {
    expect(recusaDe({ alvo: 'roteiro.rescue', texto: '1. Retome a conversa.' })).toBe(MOTIVOS_DA_RECUSA.nivel_inexistente)
  })

  test('jeito da casa lê a camada 3 da versão vigente', () => {
    const { aceitas } = validarPropostas([crua({ alvo: 'jeito_da_casa.discovery', texto: 'Espere o lead terminar.' })], ESTADO)
    expect(aceitas[0]?.antes).toBe('Fale com calma.')
  })

  test('nunca afirmar: lista completa, sem repetição e sem item em branco', () => {
    const { aceitas } = validarPropostas(
      [crua({ alvo: 'identidade.nunca_afirmar', lista: ['preço fechado', 'prazo de entrega', 'prazo de entrega'] })],
      ESTADO,
    )
    expect(aceitas[0]?.depois).toEqual(['preço fechado', 'prazo de entrega'])
    expect(recusaDe({ alvo: 'identidade.nunca_afirmar', lista: ['ok', ' '] })).toBe(MOTIVOS_DA_RECUSA.lista_invalida)
    expect(recusaDe({ alvo: 'identidade.nunca_afirmar', lista: [] })).toBe(MOTIVOS_DA_RECUSA.lista_invalida)
  })

  test('voz: o depois é a coluna inteira, com o que a proposta não tocou como estava', () => {
    const { aceitas } = validarPropostas(
      [crua({ alvo: 'voz.ajustes', ajustes: { estabilidade: 0.7, similaridade: null, velocidade: null } })],
      ESTADO,
    )
    expect(aceitas[0]?.antes).toEqual(ESTADO.voz)
    expect(aceitas[0]?.depois).toEqual({ stability: 0.7, similarity_boost: 0.75, style: 0.1 })
  })

  test('voz fora da faixa, desconhecida ou vazia é recusada', () => {
    expect(recusaDe({ alvo: 'voz.ajustes', ajustes: { velocidade: 2 } })).toBe(MOTIVOS_DA_RECUSA.ajuste_invalido)
    expect(recusaDe({ alvo: 'voz.ajustes', ajustes: { estilo: 0.3 } })).toBe(MOTIVOS_DA_RECUSA.ajuste_invalido)
    expect(recusaDe({ alvo: 'voz.ajustes', ajustes: { estabilidade: null } })).toBe(MOTIVOS_DA_RECUSA.ajuste_invalido)
  })

  test('política: inteiro dentro da faixa do check da coluna, sem recorte', () => {
    const { aceitas } = validarPropostas([crua({ alvo: 'politica.duracao_maxima', numero: 900 })], ESTADO)
    expect(aceitas[0]).toMatchObject({ antes: 600, depois: 900 })
    expect(recusaDe({ alvo: 'politica.duracao_maxima', numero: 5000 })).toBe(MOTIVOS_DA_RECUSA.numero_fora_da_faixa)
    expect(recusaDe({ alvo: 'politica.simultaneidade', numero: 1.5 })).toBe(MOTIVOS_DA_RECUSA.numero_fora_da_faixa)
    expect(recusaDe({ alvo: 'politica.intervalo_minimo', numero: '30' })).toBe(MOTIVOS_DA_RECUSA.numero_fora_da_faixa)
  })

  test('privacidade: o aviso nulo é o padrão da camada 1, e é um antes válido', () => {
    const { aceitas } = validarPropostas(
      [crua({ alvo: 'privacidade.aviso_de_gravacao', texto: 'Esta ligação é gravada.' })],
      ESTADO,
    )
    expect(aceitas[0]).toMatchObject({ antes: null, depois: 'Esta ligação é gravada.' })
  })

  test('republicar não leva valor', () => {
    const { aceitas } = validarPropostas([crua({ alvo: 'republicar', texto: 'ignorado' })], ESTADO)
    expect(aceitas[0]).toMatchObject({ alvo: 'republicar', antes: null, depois: null })
  })
})

describe('o que o crivo corta', () => {
  test('proposta que repete o valor gravado é recusada', () => {
    expect(recusaDe({ alvo: 'politica.duracao_maxima', numero: 600 })).toBe(MOTIVOS_DA_RECUSA.sem_mudanca)
  })

  test('sem título ou sem razão, sai', () => {
    expect(recusaDe({ alvo: 'republicar', titulo: ' ' })).toBe(MOTIVOS_DA_RECUSA.sem_titulo)
  })

  test('o segundo do mesmo alvo sai, e o primeiro fica', () => {
    const { aceitas, recusadas } = validarPropostas(
      [crua({ alvo: 'politica.duracao_maxima', numero: 900 }), crua({ alvo: 'politica.duracao_maxima', numero: 1200 })],
      ESTADO,
    )
    expect(aceitas.map((proposta) => proposta.depois)).toEqual([900])
    expect(recusadas[0]?.motivo).toBe(MOTIVOS_DA_RECUSA.repetida)
  })

  test(`no máximo ${MAXIMO_DE_PROPOSTAS} propostas`, () => {
    const muitas = ['intervalo_minimo', 'tentativas_por_numero', 'teto_diario', 'simultaneidade', 'duracao_maxima'].map(
      (campo, indice) => crua({ alvo: `politica.${campo}`, numero: 5 + indice }),
    )
    const mais = [
      ...muitas,
      crua({ alvo: 'identidade.oferta', texto: 'Outra oferta.' }),
      crua({ alvo: 'identidade.nome', texto: 'Clara' }),
    ]
    expect(validarPropostas(mais, ESTADO).aceitas).toHaveLength(MAXIMO_DE_PROPOSTAS)
  })

  test('entrada que não é lista não levanta', () => {
    expect(validarPropostas('nada', ESTADO)).toEqual({ aceitas: [], recusadas: [] })
  })
})

describe('a leitura da resposta do modelo', () => {
  test('lê o JSON pedido, inclusive dentro de cerca de código', () => {
    const texto = '```json\n{"causa_provavel":"A Sarah encerrou.","diagnostico":"Leu o sim como fim.","propostas":[]}\n```'
    expect(lerRespostaDoModelo(texto)).toEqual({
      causaProvavel: 'A Sarah encerrou.',
      diagnostico: 'Leu o sim como fim.',
      propostas: [],
    })
  })

  test('sem causa ou sem diagnóstico é ilegível', () => {
    expect(lerRespostaDoModelo('{"causa_provavel":"","diagnostico":"x","propostas":[]}')).toBeNull()
    expect(lerRespostaDoModelo('não é json')).toBeNull()
  })
})
