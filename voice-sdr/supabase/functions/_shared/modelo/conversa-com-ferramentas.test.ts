import { afterEach, expect, test, vi } from 'vitest'

import { conversarComFerramentas, corpoDaRodada, lerRodada, type PedidoDaRodada } from './conversa-com-ferramentas.ts'
import { URL_DA_CONVERSA } from './openrouter.ts'

const CONTA = '11111111-1111-4111-8111-111111111111'

const PEDIDO: PedidoDaRodada = {
  modelo: 'anthropic/claude-sonnet-5',
  mensagens: [
    { role: 'system', content: 'sistema' },
    { role: 'user', content: 'oi' },
  ],
  ferramentas: [{ nome: 'tool-qualify', descricao: 'qualifica', parametros: { type: 'object', properties: {} } }],
  maxTokens: 500,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('sem modelo conectado não há pedido à rede', async () => {
  const buscar = vi.fn()
  vi.stubGlobal('fetch', buscar)
  const plataforma = await conversarComFerramentas(
    CONTA,
    { porta: 'platform', modelo: 'x', escolhidoPelaConta: false },
    PEDIDO,
    { chaveDoOpenRouter: async () => 'sk-or' },
  )
  const semChave = await conversarComFerramentas(
    CONTA,
    { porta: 'openrouter', modelo: 'x/y', escolhidoPelaConta: false },
    PEDIDO,
    { chaveDoOpenRouter: async () => null },
  )
  expect(plataforma.codigo).toBe('sem_credencial')
  expect(semChave.codigo).toBe('sem_credencial')
  expect(buscar).not.toHaveBeenCalled()
})

test('a ida leva as ferramentas no formato da OpenAI e a volta traz as chamadas', async () => {
  const buscar = vi.fn(async () =>
    Response.json({
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            content: null,
            tool_calls: [{ id: 'c1', type: 'function', function: { name: 'tool-qualify', arguments: '{"stage_key":"qualified"}' } }],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  )
  vi.stubGlobal('fetch', buscar)
  const resposta = await conversarComFerramentas(
    CONTA,
    { porta: 'openrouter', modelo: 'anthropic/claude-sonnet-5', escolhidoPelaConta: false },
    PEDIDO,
    { chaveDoOpenRouter: async () => 'sk-or-da-conta' },
  )
  expect(buscar).toHaveBeenCalledTimes(1)
  const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe(URL_DA_CONVERSA)
  expect(init.headers).toMatchObject({ authorization: 'Bearer sk-or-da-conta' })
  const corpo = JSON.parse(String(init.body))
  expect(corpo.tools[0]).toEqual({
    type: 'function',
    function: { name: 'tool-qualify', description: 'qualifica', parameters: { type: 'object', properties: {} } },
  })
  expect(resposta.ok).toBe(true)
  expect(resposta.chamadas).toEqual([
    { id: 'c1', type: 'function', function: { name: 'tool-qualify', arguments: '{"stage_key":"qualified"}' } },
  ])
})

test('sem ferramentas o corpo não leva tools, e resposta cortada não é sucesso', async () => {
  expect(corpoDaRodada({ ...PEDIDO, ferramentas: [] })).not.toHaveProperty('tools')
  vi.stubGlobal('fetch', async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: 'Oi, tudo' } }] }))
  const resposta = await conversarComFerramentas(
    CONTA,
    { porta: 'openrouter', modelo: 'a/b', escolhidoPelaConta: false },
    PEDIDO,
    { chaveDoOpenRouter: async () => 'k' },
  )
  expect(resposta.ok).toBe(false)
})

test('a leitura descarta chamada sem nome e aceita argumento em objeto', () => {
  const lida = lerRodada({
    choices: [
      {
        message: {
          content: '',
          tool_calls: [{ function: { name: '' } }, { function: { name: 'tool-dnc', arguments: { reason: 'lead_request' } } }],
        },
      },
    ],
  })
  expect(lida.texto).toBeNull()
  expect(lida.chamadas).toEqual([
    { id: 'chamada_1', type: 'function', function: { name: 'tool-dnc', arguments: '{"reason":"lead_request"}' } },
  ])
})
