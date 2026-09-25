// A pergunta ao modelo só sai com a credencial da conta.
//
// O que este arquivo segura: a conta sem modelo conectado (`platform`) recebe
// `sem_credencial` **sem pedido nenhum à rede**, e o mesmo vale para a conta
// que ligou o OpenRouter e perdeu a chave. `fetch` é dublado e contado: é o
// único jeito de "nunca chama modelo com chave da instalação" virar
// conferência em vez de promessa.

import { afterEach, describe, expect, test, vi } from 'vitest'

import { URL_DA_CONVERSA } from './openrouter.ts'
import { perguntarAoModelo, type PerguntaAoModelo, type PortaDaPergunta } from './pergunta.ts'
import { modeloDaTarefa } from './resolucao.ts'

const CONTA = '11111111-1111-4111-8111-111111111111'

const PERGUNTA: PerguntaAoModelo = {
  modelo: 'anthropic/claude-sonnet-5',
  sistema: 'sistema',
  mensagem: 'mensagem',
  esquema: { type: 'object' },
  maxTokens: 100,
}

function portaCom(chave: string | null): PortaDaPergunta & { lidas: string[] } {
  const lidas: string[] = []
  return {
    lidas,
    async chaveDoOpenRouter(contaId) {
      lidas.push(contaId)
      return chave
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('conta sem modelo conectado', () => {
  test('recebe sem_credencial e não vai à rede', async () => {
    const rede = vi.fn()
    vi.stubGlobal('fetch', rede)
    const porta = portaCom('chave-que-nao-deveria-ser-lida')

    const resposta = await perguntarAoModelo(
      CONTA,
      modeloDaTarefa(null, 'classify'),
      PERGUNTA,
      porta,
    )

    expect(resposta.ok).toBe(false)
    expect(resposta.codigo).toBe('sem_credencial')
    expect(rede).not.toHaveBeenCalled()
    // Nem o cofre é lido: `platform` é conta que nunca conectou.
    expect(porta.lidas).toEqual([])
  })

  test('OpenRouter ligado sem chave no cofre também é sem_credencial', async () => {
    const rede = vi.fn()
    vi.stubGlobal('fetch', rede)

    const resposta = await perguntarAoModelo(
      CONTA,
      modeloDaTarefa({ provider: 'openrouter', model: null }, 'classify'),
      PERGUNTA,
      portaCom(null),
    )

    expect(resposta.codigo).toBe('sem_credencial')
    expect(rede).not.toHaveBeenCalled()
  })
})

test('com o OpenRouter da conta, a pergunta leva a chave dela', async () => {
  const rede = vi.fn(async () =>
    Response.json({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    }),
  )
  vi.stubGlobal('fetch', rede)

  const resposta = await perguntarAoModelo(
    CONTA,
    modeloDaTarefa({ provider: 'openrouter', model: null }, 'classify'),
    PERGUNTA,
    portaCom('chave-da-conta'),
  )

  expect(resposta.ok).toBe(true)
  expect(resposta.texto).toBe('{"ok":true}')
  expect(rede).toHaveBeenCalledTimes(1)
  const [endereco, pedido] = rede.mock.calls[0] as unknown as [string, RequestInit]
  expect(endereco).toBe(URL_DA_CONVERSA)
  expect(JSON.stringify(pedido.headers)).toContain('chave-da-conta')
})
