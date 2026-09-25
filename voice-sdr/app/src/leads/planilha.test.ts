import { describe, expect, it } from 'vitest'

import {
  escreverCsv,
  lerPlanilha,
  separadorDe,
  TETO_DE_LINHAS,
} from '@/leads/planilha'

/** A planilha de três colunas que quase todo cenário aqui usa. */
const CABECALHO = 'Nome,Telefone,E-Mail'

describe('leitura da planilha', () => {
  it('lê cabeçalho e linhas, numerando pela linha do arquivo', () => {
    const leitura = lerPlanilha(
      `${CABECALHO}\nMarina,(48) 99999-8888,marina@aurora.com.br\nBruno,11988887777,`,
    )

    expect(leitura.ok).toBe(true)
    if (!leitura.ok) return

    expect(leitura.planilha.colunas).toEqual(['Nome', 'Telefone', 'E-Mail'])
    expect(leitura.planilha.linhas.map((linha) => linha.numero)).toEqual([2, 3])
    expect(leitura.planilha.linhas[0]?.celulas).toEqual({
      Nome: 'Marina',
      Telefone: '(48) 99999-8888',
      'E-Mail': 'marina@aurora.com.br',
    })
    expect(leitura.planilha.linhas[1]?.celulas['E-Mail']).toBe('')
  })

  it('reconhece tabulação e ponto e vírgula pelo cabeçalho', () => {
    expect(separadorDe('Nome\tTelefone\tE-Mail')).toBe('\t')
    expect(separadorDe('Nome;Telefone;E-Mail')).toBe(';')
    expect(separadorDe(CABECALHO)).toBe(',')

    const tsv = lerPlanilha('Nome\tTelefone\nMarina\t(48) 99999-8888')
    expect(tsv.ok && tsv.separador).toBe('\t')
    expect(tsv.ok && tsv.planilha.linhas[0]?.celulas.Telefone).toBe(
      '(48) 99999-8888',
    )
  })

  it('a vírgula dentro de aspas fica no campo e não abre coluna', () => {
    const leitura = lerPlanilha(
      `Nome,Empresa,Telefone\nMarina,"Aurora, Logística e Transportes",4899999888`,
    )

    expect(leitura.ok && leitura.planilha.linhas[0]?.celulas.Empresa).toBe(
      'Aurora, Logística e Transportes',
    )
  })

  it('a aspa dobrada vira uma aspa só', () => {
    const leitura = lerPlanilha(`Nome,Apelido\nMarina,"a ""chefe"" do time"`)

    expect(leitura.ok && leitura.planilha.linhas[0]?.celulas.Apelido).toBe(
      'a "chefe" do time',
    )
  })

  /**
   * O caso que o comentário de `LinhaLida` descreve: a quebra dentro de aspas
   * adianta a linha física, e o registro seguinte não está na linha que o
   * índice sugere. Errar aqui manda o operador procurar o defeito na linha
   * errada, que é o oposto do que o relatório existe para fazer (RF-105).
   */
  it('quebra de linha dentro de aspas não confunde a numeração', () => {
    const leitura = lerPlanilha(
      `Nome,Observação,Telefone\nMarina,"mudou de cargo\nem março",4899999888\nBruno,sem nota,1198888777`,
    )

    expect(leitura.ok).toBe(true)
    if (!leitura.ok) return

    expect(leitura.planilha.linhas[0]?.celulas.Observação).toBe(
      'mudou de cargo\nem março',
    )
    expect(leitura.planilha.linhas.map((linha) => linha.numero)).toEqual([2, 4])
  })

  it('atravessa fim de linha do Windows e a marca de bytes do Excel', () => {
    const leitura = lerPlanilha(`\ufeffNome,Telefone\r\nMarina,4899999888\r\n`)

    expect(leitura.ok && leitura.planilha.colunas).toEqual(['Nome', 'Telefone'])
    expect(leitura.ok && leitura.planilha.linhas.length).toBe(1)
  })

  it('linha em branco no fim do arquivo não vira linha de dados', () => {
    const leitura = lerPlanilha(`${CABECALHO}\nMarina,4899999888,\n\n\n`)

    expect(leitura.ok && leitura.planilha.linhas.length).toBe(1)
  })

  it('arquivo sem nada, só com cabeçalho, ou com coluna repetida é recusado', () => {
    expect(lerPlanilha('   \n  ')).toEqual({ ok: false, motivo: 'arquivo-vazio' })
    expect(lerPlanilha(CABECALHO)).toEqual({ ok: false, motivo: 'sem-linhas' })
    expect(lerPlanilha(',,\nMarina,,')).toEqual({
      ok: false,
      motivo: 'cabecalho-vazio',
    })
    expect(lerPlanilha('Telefone,Telefone\n4899999888,1198888777')).toEqual({
      ok: false,
      motivo: 'colunas-repetidas',
    })
  })

  it('planilha acima do teto é recusada antes de viajar', () => {
    const linhas = Array.from(
      { length: TETO_DE_LINHAS + 1 },
      (_, indice) => `Lead ${String(indice)},4899999888,`,
    )

    expect(lerPlanilha(`${CABECALHO}\n${linhas.join('\n')}`)).toEqual({
      ok: false,
      motivo: 'linhas-demais',
    })
  })
})

describe('escrita de CSV', () => {
  it('escapa só o que precisa e volta inteiro na leitura', () => {
    const csv = escreverCsv(
      ['Linha', 'Motivo'],
      [
        ['12', 'telefone vazio'],
        ['13', 'nota com "aspas", vírgula e\nquebra'],
      ],
    )

    expect(csv.split('\n')[0]).toBe('Linha,Motivo')
    expect(csv).toContain('"nota com ""aspas"", vírgula e\nquebra"')

    const leitura = lerPlanilha(csv)
    expect(leitura.ok && leitura.planilha.linhas[1]?.celulas.Motivo).toBe(
      'nota com "aspas", vírgula e\nquebra',
    )
  })
})
