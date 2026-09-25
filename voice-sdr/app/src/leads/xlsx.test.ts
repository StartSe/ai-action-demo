// A leitura da planilha do Excel (D-08), sobre `.xlsx` montados no teste por
// `planilhaDoExcel`: entradas comprimidas e guardadas, textos compartilhados,
// número na célula, coluna pulada, linha em branco e a primeira aba só.

import { describe, expect, it } from 'vitest'

import { lerArquivoDePlanilha, TETO_DE_LINHAS } from '@/leads/planilha'
import { lerXlsx, pareceXlsAntigo, pareceXlsx } from '@/leads/xlsx'
import { planilhaDoExcel } from '@/testes/planilha-do-excel'

const LINHAS = [
  ['Nome', 'Telefone', 'Cidade'],
  ['Marina Castro', 5548999998888, 'Florianópolis'],
  [],
  ['João & Filhos <Ltda>', '(11) 98888-7777', null],
  ['Rui', null, 'Recife'],
]

describe('lerXlsx', () => {
  it.each([
    ['comprimida', false],
    ['guardada', true],
  ])('entrada %s: lê a primeira aba, com o número de linha do Excel', async (_nome, guardada) => {
    const lida = await lerXlsx(await planilhaDoExcel(LINHAS, { guardada }))
    expect(lida).toEqual({
      ok: true,
      registros: [
        { numero: 1, celulas: ['Nome', 'Telefone', 'Cidade'] },
        { numero: 2, celulas: ['Marina Castro', '5548999998888', 'Florianópolis'] },
        // A linha em branco some, e a numeração continua a do Excel.
        { numero: 4, celulas: ['João & Filhos <Ltda>', '(11) 98888-7777'] },
        // A coluna pulada vira célula vazia na posição dela.
        { numero: 5, celulas: ['Rui', '', 'Recife'] },
      ],
    })
  })

  it('aceita elemento com prefixo de espaço de nomes', async () => {
    const lida = await lerXlsx(await planilhaDoExcel([['Nome'], ['Ana']], { prefixo: 'x' }))
    expect(lida.ok && lida.registros.map((registro) => registro.celulas)).toEqual([['Nome'], ['Ana']])
  })

  it('zip quebrado é recusa com motivo, nunca planilha pela metade', async () => {
    const inteira = await planilhaDoExcel(LINHAS)
    expect(await lerXlsx(inteira.subarray(0, inteira.length - 30))).toEqual({
      ok: false,
      motivo: 'xlsx-ilegivel',
    })
    expect(await lerXlsx(new TextEncoder().encode('PK\u0003\u0004 não é zip'))).toEqual({
      ok: false,
      motivo: 'xlsx-ilegivel',
    })
  })

  it('reconhece o formato pela assinatura', async () => {
    expect(pareceXlsx(await planilhaDoExcel(LINHAS))).toBe(true)
    expect(pareceXlsx(new TextEncoder().encode('Nome,Telefone'))).toBe(false)
    expect(pareceXlsAntigo(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1]))).toBe(true)
  })
})

describe('lerArquivoDePlanilha', () => {
  it('a planilha do Excel sai no mesmo formato do CSV, sem separador', async () => {
    const leitura = await lerArquivoDePlanilha(await planilhaDoExcel(LINHAS))
    expect(leitura).toEqual({
      ok: true,
      separador: null,
      planilha: {
        colunas: ['Nome', 'Telefone', 'Cidade'],
        linhas: [
          { numero: 2, celulas: { Nome: 'Marina Castro', Telefone: '5548999998888', Cidade: 'Florianópolis' } },
          { numero: 4, celulas: { Nome: 'João & Filhos <Ltda>', Telefone: '(11) 98888-7777', Cidade: '' } },
          { numero: 5, celulas: { Nome: 'Rui', Telefone: '', Cidade: 'Recife' } },
        ],
      },
    })
  })

  it('o CSV continua entrando pelo mesmo caminho', async () => {
    const leitura = await lerArquivoDePlanilha(new TextEncoder().encode('﻿Nome;Telefone\nAna;48999998888\n'))
    expect(leitura.ok && leitura.separador).toBe(';')
    expect(leitura.ok && leitura.planilha.linhas).toEqual([
      { numero: 2, celulas: { Nome: 'Ana', Telefone: '48999998888' } },
    ])
  })

  it('valem as regras do CSV: cabeçalho na primeira linha, colunas únicas, teto de linhas', async () => {
    expect(await lerArquivoDePlanilha(await planilhaDoExcel([['Nome'], ['Ana']], { primeiraLinha: 3 }))).toEqual({
      ok: false,
      motivo: 'cabecalho-vazio',
    })
    expect(await lerArquivoDePlanilha(await planilhaDoExcel([['Nome', 'Nome'], ['Ana', 'Bia']]))).toEqual({
      ok: false,
      motivo: 'colunas-repetidas',
    })
    expect(await lerArquivoDePlanilha(await planilhaDoExcel([['Nome']]))).toEqual({
      ok: false,
      motivo: 'sem-linhas',
    })
    const grande = [['Telefone'], ...Array.from({ length: TETO_DE_LINHAS + 1 }, (_, i) => [5548990000000 + i])]
    expect(await lerArquivoDePlanilha(await planilhaDoExcel(grande))).toEqual({
      ok: false,
      motivo: 'linhas-demais',
    })
  })

  it('o .xls antigo é recusado com o motivo próprio', async () => {
    expect(await lerArquivoDePlanilha(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]))).toEqual({
      ok: false,
      motivo: 'xls-antigo',
    })
  })
})
