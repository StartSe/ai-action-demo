// O descritor de tool-qualify contra a seção 5 de docs/PRD-implementacao.md
// (US-137, T-01, RF-309). A restrição por propósito é estrutural: a ferramenta
// não existe no agente do propósito que não a tem, e esta lista é o que decide
// isso. Acrescentar um propósito aqui sem a tabela da seção 5 dizer o mesmo
// reprova a primeira prova.

import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'vitest'

import {
  CATALOGO_DE_FERRAMENTAS,
  DESCRICOES_DAS_FERRAMENTAS,
  PRAZO_DE_FERRAMENTA_SEGUNDOS,
} from '../agente/compilador.ts'
import type { Proposito } from '../playbook/camada-um.ts'

import { DESCRITOR_DA_QUALIFICACAO } from './tool-qualify.ts'

/**
 * O nome de cada propósito na tabela da seção 5, e o código dele. A
 * pós-reunião ainda não é propósito próprio (L-07): até o PRD de produto
 * decidir, ela é a retomada.
 */
const PROPOSITO_DA_TABELA: Readonly<Record<string, Proposito>> = {
  descoberta: 'discovery',
  lembrete: 'reminder',
  resgate: 'rescue',
  retomada: 'followup',
  'pós-reunião': 'followup',
}

async function propositosDaSecaoCinco(ferramenta: string): Promise<Proposito[]> {
  const documento = await readFile(new URL('../../../../docs/PRD-implementacao.md', import.meta.url), 'utf8')
  const linha = documento.split('\n').find((texto) => texto.startsWith(`| \`${ferramenta}\` |`))
  if (linha === undefined) throw new Error(`${ferramenta} sumiu da tabela da seção 5`)
  const colunas = linha.split('|').map((coluna) => coluna.trim())
  // | nome | entrada | data | propósitos |
  const propositos = colunas[4] ?? ''
  const codigos = propositos.split(',').map((nome) => {
    const codigo = PROPOSITO_DA_TABELA[nome.trim()]
    if (codigo === undefined) throw new Error(`propósito "${nome.trim()}" sem código conhecido`)
    return codigo
  })
  return [...new Set(codigos)].sort()
}

describe('o descritor de tool-qualify', () => {
  test('os propósitos são exatamente os da seção 5, e lembrete fica de fora', async () => {
    expect([...DESCRITOR_DA_QUALIFICACAO.propositos].sort()).toEqual(await propositosDaSecaoCinco('tool-qualify'))
    expect(DESCRITOR_DA_QUALIFICACAO.propositos).not.toContain('reminder')
  })

  test('o catálogo da publicação lê o descritor, sem segunda lista', () => {
    const doCatalogo = CATALOGO_DE_FERRAMENTAS.find((f) => f.nome === 'tool-qualify')
    expect(doCatalogo?.propositos).toBe(DESCRITOR_DA_QUALIFICACAO.propositos)
    expect(doCatalogo?.entraNa).toBe('F4')
    expect(doCatalogo?.dependeDeAgenda).toBe(false)
    expect(DESCRICOES_DAS_FERRAMENTAS.get('tool-qualify')?.campos).toBe(DESCRITOR_DA_QUALIFICACAO.campos)
  })

  test('o prazo de resposta é o de P-01, 5 s', () => {
    expect(DESCRITOR_DA_QUALIFICACAO.prazoDeRespostaSegundos).toBe(5)
    expect(DESCRITOR_DA_QUALIFICACAO.prazoDeRespostaSegundos).toBe(PRAZO_DE_FERRAMENTA_SEGUNDOS)
  })

  test('o esquema traz a entrada da seção 5, e só stage_key é obrigatório', () => {
    const chaves = DESCRITOR_DA_QUALIFICACAO.campos.map((campo) => campo.chave)
    for (const chave of ['stage_key', 'temperature', 'sentiment', 'pain', 'next_action', 'meeting_outcome']) {
      expect(chaves).toContain(chave)
    }
    const obrigatorios = DESCRITOR_DA_QUALIFICACAO.campos.filter((campo) => campo.obrigatorio)
    expect(obrigatorios.map((campo) => campo.chave)).toEqual(['stage_key'])
    const desfecho = DESCRITOR_DA_QUALIFICACAO.campos.find((campo) => campo.chave === 'meeting_outcome')
    expect(desfecho && 'valores' in desfecho ? desfecho.valores : []).toEqual(['attended', 'no_show', 'unknown'])
  })
})
