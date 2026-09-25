// Provas da resolução do modelo (US-246).
//
// O que este arquivo segura:
//
// 1. Conta sem linha nenhuma fala pela plataforma, com o modelo do código. É o
//    estado de toda conta que já existe, e é o que garante que esta fatia não
//    tira a IA de ninguém.
// 2. Nulo quer dizer "o padrão do código", e o padrão é lido da tabela deste
//    módulo — não de uma constante copiada no teste, que passaria mesmo se o
//    módulo mudasse.
// 3. Identificador de uma porta usado na outra é descartado: é a rede embaixo
//    do zerar de `desconectar_modelo_da_conta`.
// 4. O opus redige e o sonnet classifica, nas duas portas.

import { describe, expect, test } from 'vitest'

import { CATALOGO_COM_MODALIDADES } from './openrouter-exemplos.ts'
import { lerCatalogo } from './openrouter.ts'
import {
  aceitaAEntrada,
  MODELO_PADRAO_DE_MIDIA,
  MODELOS_PADRAO,
  modeloDaTarefa,
  lerPorta,
  serveNaPorta,
  TAREFAS,
} from './resolucao.ts'

describe('a porta', () => {
  test('conta sem linha fala pela plataforma', () => {
    for (const tarefa of TAREFAS) {
      const resolvido = modeloDaTarefa(null, tarefa)
      expect(resolvido.porta).toBe('platform')
      expect(resolvido.modelo).toBe(MODELOS_PADRAO.platform[tarefa])
      expect(resolvido.escolhidoPelaConta).toBe(false)
    }
  })

  test('valor desconhecido cai na plataforma, e não levanta', () => {
    expect(lerPorta('groq')).toBe('platform')
    expect(lerPorta(null)).toBe('platform')
    expect(lerPorta(7)).toBe('platform')
  })
})

describe('o modelo', () => {
  test('nulo quer dizer o padrão da porta', () => {
    const resolvido = modeloDaTarefa({ provider: 'openrouter', model: null }, 'review')
    expect(resolvido.porta).toBe('openrouter')
    expect(resolvido.modelo).toBe(MODELOS_PADRAO.openrouter.review)
    expect(resolvido.escolhidoPelaConta).toBe(false)
  })

  test('a escolha da conta vence o padrão', () => {
    const resolvido = modeloDaTarefa(
      { provider: 'openrouter', model: 'google/gemini-3-pro' },
      'review',
    )
    expect(resolvido.modelo).toBe('google/gemini-3-pro')
    expect(resolvido.escolhidoPelaConta).toBe(true)
  })

  test('identificador do OpenRouter não vai para a Anthropic', () => {
    // A conta escolheu na outra porta e voltou para a plataforma. Mandar este
    // nome para a Anthropic seria pedir um modelo que não existe lá.
    const resolvido = modeloDaTarefa(
      { provider: 'platform', model: 'anthropic/claude-opus-5' },
      'draft',
    )
    expect(resolvido.modelo).toBe(MODELOS_PADRAO.platform.draft)
    expect(resolvido.escolhidoPelaConta).toBe(false)
  })

  test('identificador da Anthropic não vai para o OpenRouter', () => {
    const resolvido = modeloDaTarefa({ provider: 'openrouter', model: 'claude-opus-5' }, 'draft')
    expect(resolvido.modelo).toBe(MODELOS_PADRAO.openrouter.draft)
    expect(resolvido.escolhidoPelaConta).toBe(false)
  })

  test('texto em branco é o mesmo que não ter escolhido', () => {
    const resolvido = modeloDaTarefa({ provider: 'openrouter', model: '   ' }, 'classify')
    expect(resolvido.modelo).toBe(MODELOS_PADRAO.openrouter.classify)
  })
})

describe('a régua da porta', () => {
  test('a barra separa as duas famílias de identificador', () => {
    expect(serveNaPorta('anthropic/claude-opus-5', 'openrouter')).toBe(true)
    expect(serveNaPorta('claude-opus-5', 'platform')).toBe(true)
    expect(serveNaPorta('claude-opus-5', 'openrouter')).toBe(false)
    expect(serveNaPorta('anthropic/claude-opus-5', 'platform')).toBe(false)
  })
})

describe('os padrões', () => {
  test('o opus redige e o sonnet classifica, nas duas portas', () => {
    // P-03 e seção 10 do PRD: a classificação cabe nos 60 s da ficha, a
    // redação é o produto e ninguém espera por ela ao vivo.
    expect(MODELOS_PADRAO.platform.draft).toContain('opus')
    expect(MODELOS_PADRAO.platform.review).toContain('opus')
    expect(MODELOS_PADRAO.platform.classify).toContain('sonnet')
    expect(MODELOS_PADRAO.openrouter.draft).toContain('opus')
    expect(MODELOS_PADRAO.openrouter.review).toContain('opus')
    expect(MODELOS_PADRAO.openrouter.classify).toContain('sonnet')
  })

  test('toda tarefa tem padrão nas duas portas', () => {
    for (const tarefa of TAREFAS) {
      expect(MODELOS_PADRAO.platform[tarefa]).toBeTruthy()
      expect(MODELOS_PADRAO.openrouter[tarefa]).toBeTruthy()
    }
  })
})

describe('as tarefas de mídia', () => {
  test('imagem e áudio caem no multimodal barato quando a conta não escolheu', () => {
    for (const tarefa of ['imagem', 'audio'] as const) {
      expect(modeloDaTarefa({ provider: 'openrouter', model: null }, tarefa)).toEqual({
        porta: 'openrouter',
        modelo: MODELO_PADRAO_DE_MIDIA,
        escolhidoPelaConta: false,
      })
    }
    expect(modeloDaTarefa({ provider: 'openrouter', model: 'openai/gpt-audio' }, 'audio')).toMatchObject({
      modelo: 'openai/gpt-audio',
      escolhidoPelaConta: true,
    })
  })

  test('o padrão de mídia aceita imagem e áudio no catálogo', () => {
    const padrao = lerCatalogo(CATALOGO_COM_MODALIDADES).find((modelo) => modelo.id === MODELO_PADRAO_DE_MIDIA)
    expect(padrao).toBeDefined()
    expect(aceitaAEntrada(padrao!.entradas, 'imagem')).toBe(true)
    expect(aceitaAEntrada(padrao!.entradas, 'audio')).toBe(true)
  })

  test('o catálogo filtra por modalidade: texto para todos, mídia só para quem aceita', () => {
    const catalogo = lerCatalogo(CATALOGO_COM_MODALIDADES)
    expect(catalogo.map((modelo) => [modelo.id, modelo.entradas])).toEqual([
      ['z-ai/glm-5.3-prime', ['text']],
      ['deepseek/deepseek-v4.1-flash', ['text', 'image']],
      ['google/gemini-3.1-flash-lite', ['text', 'image', 'video', 'file', 'audio']],
      ['antigo/sem-arquitetura', null],
    ])
    const para = (tarefa: (typeof TAREFAS)[number]) =>
      catalogo.filter((modelo) => aceitaAEntrada(modelo.entradas, tarefa)).map((modelo) => modelo.id)
    expect(para('review')).toHaveLength(4)
    expect(para('imagem')).toEqual(['deepseek/deepseek-v4.1-flash', 'google/gemini-3.1-flash-lite'])
    expect(para('audio')).toEqual(['google/gemini-3.1-flash-lite'])
  })
})
