// O recorte da lista de leads, lido de um valor que veio de fora.
//
// O caso que importa é o do meio: filtro em formato errado precisa ser
// **recusado**, não descartado. Descartado em silêncio, `temperatura: 42` vira
// "sem filtro de temperatura" e a exportação entrega a conta inteira a quem
// pediu só os quentes — com a planilha parecendo certa.

import { expect, test } from 'vitest'

import {
  ORDENACOES,
  RECORTE_ABERTO,
  lerRecorteDeLeads,
} from './recorte-de-leads.ts'

test('objeto sem chave nenhuma é a conta inteira', () => {
  expect(lerRecorteDeLeads({})).toEqual({ ok: true, recorte: RECORTE_ABERTO })
  expect(lerRecorteDeLeads(undefined)).toEqual({ ok: true, recorte: {} })
  expect(lerRecorteDeLeads(null)).toEqual({ ok: true, recorte: {} })
})

test('os filtros de texto chegam aparados', () => {
  const leitura = lerRecorteDeLeads({
    termo: '  ana  ',
    etapa: 'qualified',
    temperatura: 'quente',
    origem: 'intake',
  })

  expect(leitura).toEqual({
    ok: true,
    recorte: { termo: 'ana', etapa: 'qualified', temperatura: 'quente', origem: 'intake' },
  })
})

test('texto em branco é filtro não preenchido, não filtro vazio', () => {
  // É assim que o campo de busca chega depois de alguém apagar o que digitou.
  expect(lerRecorteDeLeads({ termo: '   ' })).toEqual({ ok: true, recorte: {} })
})

test('chave desconhecida passa, porque a barra de endereço carrega bagagem', () => {
  const leitura = lerRecorteDeLeads({ termo: 'ana', utm_source: 'email', pagina: 3 })

  expect(leitura).toEqual({ ok: true, recorte: { termo: 'ana' } })
})

test('filtro de texto que não é texto é recusado, com o campo culpado', () => {
  for (const campo of ['termo', 'etapa', 'temperatura', 'origem']) {
    expect(lerRecorteDeLeads({ [campo]: 42 })).toEqual({
      ok: false,
      motivo: 'filtro_invalido',
      campo,
    })
  }
})

test('bloqueado aceita booleano e o texto que vem da barra de endereço', () => {
  expect(lerRecorteDeLeads({ bloqueado: true })).toEqual({
    ok: true,
    recorte: { bloqueado: true },
  })
  expect(lerRecorteDeLeads({ bloqueado: 'false' })).toEqual({
    ok: true,
    recorte: { bloqueado: false },
  })
  expect(lerRecorteDeLeads({ bloqueado: 'talvez' })).toEqual({
    ok: false,
    motivo: 'filtro_invalido',
    campo: 'bloqueado',
  })
})

test('bloqueado false não é o mesmo que bloqueado ausente', () => {
  // Um pede os liberados; o outro pede os dois. Confundir os dois exporta os
  // bloqueados junto, que é o oposto do que quem filtrou pediu.
  const so = lerRecorteDeLeads({ bloqueado: false })
  const ambos = lerRecorteDeLeads({})

  expect(so).toEqual({ ok: true, recorte: { bloqueado: false } })
  expect(ambos).toEqual({ ok: true, recorte: {} })
})

test('a data da última atividade precisa ser data', () => {
  expect(lerRecorteDeLeads({ atividadeDesde: '2026-09-01T00:00:00.000Z' })).toEqual({
    ok: true,
    recorte: { atividadeDesde: '2026-09-01T00:00:00.000Z' },
  })
  expect(lerRecorteDeLeads({ atividadeDesde: 'semana passada' })).toEqual({
    ok: false,
    motivo: 'filtro_invalido',
    campo: 'atividadeDesde',
  })
})

test.each([...ORDENACOES])('a ordenação %s é aceita', (ordenacao) => {
  expect(lerRecorteDeLeads({ ordenacao })).toEqual({ ok: true, recorte: { ordenacao } })
})

test('ordenação fora do conjunto é recusada', () => {
  // Aqui a lista fechada é nossa, e não do banco: quem ordena é a consulta que
  // a lista e a exportação montam, e um valor inventado viraria ordem padrão
  // sem ninguém perceber que o pedido foi ignorado.
  expect(lerRecorteDeLeads({ ordenacao: 'preco' })).toEqual({
    ok: false,
    motivo: 'filtro_invalido',
    campo: 'ordenacao',
  })
})

test('o recorte não pode ser lista nem texto', () => {
  for (const valor of [[], 'tudo', 7]) {
    expect(lerRecorteDeLeads(valor)).toEqual({
      ok: false,
      motivo: 'filtro_invalido',
      campo: 'recorte',
    })
  }
})
