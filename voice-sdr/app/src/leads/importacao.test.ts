import { describe, expect, it } from 'vitest'

import {
  agruparPrevia,
  amostraDoMapeamento,
  camposMapeados,
  chaveDoMapeamento,
  hashDoArquivo,
  linhasComErro,
  podeVerPrevia,
} from '@/leads/importacao'
import type { RelatorioDaImportacao } from '@importacao/confirmacao.ts'
import {
  resolverMapeamento,
  type PlanilhaLida,
  type Previa,
} from '@importacao/previa.ts'

const PLANILHA: PlanilhaLida = {
  colunas: ['Nome Completo', 'Telefone', 'Observações'],
  linhas: [
    {
      numero: 2,
      celulas: {
        'Nome Completo': ' Marina Castro ',
        Telefone: '(48) 99999-8888',
        Observações: 'indicada pela Ana',
      },
    },
    {
      numero: 3,
      celulas: { 'Nome Completo': '', Telefone: '11988887777', Observações: '' },
    },
    {
      numero: 4,
      celulas: { 'Nome Completo': 'Bruno', Telefone: '', Observações: '' },
    },
    {
      numero: 5,
      celulas: { 'Nome Completo': 'Célia', Telefone: '2199998888', Observações: '' },
    },
  ],
}

const MAPEAMENTO = resolverMapeamento(PLANILHA.colunas)

describe('hash do arquivo', () => {
  it('é estável para o mesmo conteúdo e muda com qualquer alteração', async () => {
    const um = await hashDoArquivo('nome,telefone\nMarina,4899999888')
    const igual = await hashDoArquivo('nome,telefone\nMarina,4899999888')
    const outro = await hashDoArquivo('nome,telefone\nMarina,4899999889')

    expect(um).toBe(igual)
    expect(um).not.toBe(outro)
    // SHA-256 em hexadecimal: é o que o evento `lead_imported` guarda.
    expect(um).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('mapeamento', () => {
  it('lista só os campos com coluna, na ordem do lead', () => {
    expect(camposMapeados(MAPEAMENTO)).toEqual(['nome', 'telefone'])
    expect(podeVerPrevia(MAPEAMENTO)).toBe(true)
  })

  it('sem coluna de telefone não há prévia a pedir', () => {
    const semTelefone = resolverMapeamento(PLANILHA.colunas, { telefone: null })

    expect(podeVerPrevia(semTelefone)).toBe(false)
  })

  it('a chave de cache muda quando uma coluna troca de destino', () => {
    const trocado = resolverMapeamento(PLANILHA.colunas, { nome: 'Observações' })

    expect(chaveDoMapeamento(MAPEAMENTO)).not.toBe(chaveDoMapeamento(trocado))
    // Mesma escolha, chave igual: o objeto muda de identidade a cada desenho, e
    // a chave não pode mudar com ele.
    expect(chaveDoMapeamento(resolverMapeamento(PLANILHA.colunas))).toBe(
      chaveDoMapeamento(MAPEAMENTO),
    )
  })

  it('a amostra traz as três primeiras linhas, sem espaço em volta', () => {
    const amostra = amostraDoMapeamento(PLANILHA, MAPEAMENTO)

    expect(amostra.map((linha) => linha.numero)).toEqual([2, 3, 4])
    expect(amostra[0]?.valores.nome).toBe('Marina Castro')
    expect(amostra[1]?.valores.nome).toBe('')
    // Coluna sem destino não entra na amostra: ela não vira campo do lead.
    expect(Object.keys(amostra[0]?.valores ?? {})).toEqual(['nome', 'telefone'])
  })
})

describe('leitura da prévia e do relatório', () => {
  const previa = {
    totalDeLinhas: 4,
    validos: 1,
    invalidos: 1,
    duplicados: 2,
    duplicadosNoArquivo: 1,
    duplicadosNaBase: 1,
    mapeamento: MAPEAMENTO,
    colunasSemDestino: ['Observações'],
    linhas: [
      { numero: 2, situacao: 'valido', lead: null, recusa: null, local: null, primeiraOcorrencia: null },
      { numero: 3, situacao: 'invalido', lead: null, recusa: { numero: 3, coluna: 'Telefone', motivo: 'vazio' }, local: null, primeiraOcorrencia: null },
      { numero: 4, situacao: 'duplicado_no_arquivo', lead: null, recusa: null, local: null, primeiraOcorrencia: 2 },
      { numero: 5, situacao: 'duplicado_na_base', lead: null, recusa: null, local: null, primeiraOcorrencia: null },
    ],
  } as const satisfies Previa

  it('os dois tipos de duplicata contam no mesmo grupo da tela', () => {
    const grupos = agruparPrevia(previa)

    expect(grupos.validos.map((linha) => linha.numero)).toEqual([2])
    expect(grupos.invalidos.map((linha) => linha.numero)).toEqual([3])
    expect(grupos.duplicados.map((linha) => linha.numero)).toEqual([4, 5])
  })

  it('a lista de erros traz a frase do motivo, e o código quando não há frase', () => {
    const relatorio = {
      arquivo: { nome: 'leads.csv', hash: 'abc' },
      aoDuplicar: 'ignorar',
      totalDeLinhas: 3,
      criados: 1,
      ignorados: 0,
      atualizados: 0,
      erros: 2,
      semRegistroDeImportacao: [],
      linhas: [
        { numero: 2, resultado: 'criado', leadId: 'l-1', motivo: null },
        { numero: 3, resultado: 'erro', leadId: null, motivo: 'vazio' },
        { numero: 4, resultado: 'erro', leadId: null, motivo: 'falha_ao_gravar' },
      ],
    } as const satisfies RelatorioDaImportacao

    expect(
      linhasComErro(relatorio, { vazio: 'A célula de telefone está em branco.' }),
    ).toEqual([
      ['3', 'A célula de telefone está em branco.'],
      // Código novo no servidor e tela antiga: o arquivo mostra o código, que
      // ao menos se procura, em vez de uma célula vazia.
      ['4', 'falha_ao_gravar'],
    ])
  })
})
