// O que é só do WhatsApp na assistente única: a abertura, o jeito do canal e o
// pré-contato montado a partir deles. A leitura do retrato publicado está em
// `_shared/agente/retrato-da-publicacao.test.ts`.

import { describe, expect, test } from 'vitest'

import { MARCADORES_DA_PRIMEIRA_FALA } from '../agente/primeira-fala.ts'
import { FALAS_DO_WHATSAPP, INSTRUCAO_DO_CANAL } from '../speech/whatsapp.ts'

import { MARCADOR_CRU, textoDaAbertura, valoresDaAbertura } from './abertura.ts'
import { montarSistema, type ContextoDaConversa } from './conversa.ts'
import { textoDoPreContato } from './pre-contato.ts'

const IDENTIDADE = { nome: 'Ana', empresa: 'Fluxo Cargo' }
const LEAD = { nome: 'Joana', empresa: 'Transportes Lima', cidade: 'Joinville' }

describe('a abertura do WhatsApp', () => {
  test('sem texto da conta, sai a padrão do servidor com o lead e a identidade', () => {
    expect(textoDaAbertura(null, IDENTIDADE, LEAD)).toBe(
      'Oi, Joana! Aqui é Ana, da Fluxo Cargo. Tudo bem? Posso te fazer umas perguntas rápidas por aqui?',
    )
    expect(textoDaAbertura('   ', IDENTIDADE, LEAD)).toBe(textoDaAbertura(null, IDENTIDADE, LEAD))
  })

  test('o texto da conta usa os marcadores da primeira fala, e o que falta some', () => {
    expect(textoDaAbertura('Oi {nome_do_lead}, da {empresa_do_lead} em {cidade_do_lead}! Sou {nome_do_agente}.', IDENTIDADE, LEAD)).toBe(
      'Oi Joana, da Transportes Lima em Joinville! Sou Ana.',
    )
    expect(textoDaAbertura('Oi, {nome_do_lead}! Aqui é {nome_do_agente}.', IDENTIDADE, null)).toBe('Oi! Aqui é Ana.')
  })

  test('todo marcador aceito pela tela tem valor aqui, e nenhum sobra cru', () => {
    const valores = valoresDaAbertura(IDENTIDADE, LEAD)
    for (const marcador of MARCADORES_DA_PRIMEIRA_FALA) expect(valores).toHaveProperty(marcador)
    const todos = MARCADORES_DA_PRIMEIRA_FALA.map((marcador) => `{${marcador}}`).join(' ')
    expect(MARCADOR_CRU.test(textoDaAbertura(todos, IDENTIDADE, LEAD))).toBe(false)
  })

  test('a fala padrão não diz o nome do produto', () => {
    expect(FALAS_DO_WHATSAPP.abertura).not.toMatch(/Sarah/)
    expect(FALAS_DO_WHATSAPP.avisoDaLigacao).not.toMatch(/Sarah/)
  })
})

describe('o pré-contato', () => {
  test('o texto do pré-contato da conta vence a abertura', () => {
    expect(textoDoPreContato('Ligo já, {nome_do_lead}.', { ...IDENTIDADE, abertura: 'Oi!' }, LEAD)).toBe('Ligo já, Joana.')
  })

  test('sem ele, a abertura escrita pela conta vem com o aviso da ligação', () => {
    expect(textoDoPreContato(null, { ...IDENTIDADE, abertura: 'Oi, {nome_do_lead}! {nome_do_agente}, da {empresa}.' }, LEAD)).toBe(
      'Oi, Joana! Ana, da Fluxo Cargo. Estou te ligando agora, tudo bem?',
    )
  })

  test('sem as duas, a fala padrão de sempre', () => {
    expect(textoDoPreContato(null, { ...IDENTIDADE, abertura: null }, 'Joana')).toBe(
      'Oi, Joana! Aqui é Ana, da Fluxo Cargo. Estou te ligando agora, tudo bem?',
    )
  })
})

describe('o jeito do canal no sistema do motor', () => {
  const CONTEXTO: ContextoDaConversa = {
    proposito: 'discovery',
    identidade: { nome: 'Ana', empresa: 'Fluxo Cargo', oferta: null, nuncaAfirmar: [], jeito: 'Use no máximo duas frases.' },
    playbook: { playbookVersionId: '11111111-1111-4111-8111-111111111111', versao: 1, camadaDois: 'Descubra a dor.', camadaTres: 'Tom cordial.' },
    politica: { duracaoMaximaSegundos: 600, gravacaoLigada: true, avisoDeGravacao: null, retencaoDias: 90 },
    lead: null,
    historico: [],
    ofertas: [],
    fusoDoLead: 'America/Sao_Paulo',
    agora: '2026-10-12T12:00:00.000Z',
  }

  test('entra depois do jeito da casa e antes da instrução do canal', async () => {
    const sistema = await montarSistema(CONTEXTO, [])
    const casa = sistema.indexOf('Tom cordial.')
    const canal = sistema.indexOf('Use no máximo duas frases.')
    expect(casa).toBeGreaterThan(-1)
    expect(canal).toBeGreaterThan(casa)
    expect(sistema.indexOf(INSTRUCAO_DO_CANAL)).toBeGreaterThan(canal)
  })

  test('sem jeito do canal, o bloco não aparece', async () => {
    const sistema = await montarSistema({ ...CONTEXTO, identidade: { ...CONTEXTO.identidade, jeito: null } }, [])
    expect(sistema).not.toContain('neste canal')
  })
})
