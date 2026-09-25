import { describe, expect, test } from 'vitest'

import { corpoDaLeitura, lerMidiaComModelo, SUPOSICOES_DA_LEITURA_DE_MIDIA } from './leitura-de-midia.ts'
import { RECUSA_DE_ENTRADA, VOLTA_DA_TRANSCRICAO } from './openrouter-exemplos.ts'
import { URL_DA_CONVERSA } from './openrouter.ts'

const CONECTADA = { porta: 'openrouter', modelo: 'google/gemini-3.1-flash-lite', escolhidoPelaConta: false } as const
const CHAVE = { chaveDoOpenRouter: async () => 'sk-or-v1-teste' }
const AUDIO = {
  modelo: 'google/gemini-3.1-flash-lite',
  instrucao: 'Transcreva.',
  conteudo: { tipo: 'audio', base64: 'T2dnUw==', formato: 'ogg' },
  maxTokens: 1200,
} as const

describe('o corpo', () => {
  test('áudio vai como input_audio em base64 com o formato (M2)', () => {
    expect(corpoDaLeitura(AUDIO)).toEqual({
      model: 'google/gemini-3.1-flash-lite',
      max_tokens: 1200,
      messages: [
        { role: 'system', content: 'Transcreva.' },
        { role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'T2dnUw==', format: 'ogg' } }] },
      ],
    })
  })

  test('imagem vai como image_url com data URI (M1)', () => {
    const corpo = corpoDaLeitura({ ...AUDIO, conteudo: { tipo: 'imagem', dataUri: 'data:image/jpeg;base64,/9j/' } })
    expect((corpo.messages as unknown[])[1]).toEqual({
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/' } }],
    })
  })

  test('as suposições estão escritas', () => {
    expect(SUPOSICOES_DA_LEITURA_DE_MIDIA.map((item) => item.slice(0, 2))).toEqual(['M1', 'M2', 'M3', 'M4'])
  })
})

describe('a ida', () => {
  test('lê a transcrição e os tokens da volta', async () => {
    const pedidos: { url: string; corpo: unknown; autorizacao: string | undefined }[] = []
    const resposta = await lerMidiaComModelo('conta', CONECTADA, AUDIO, CHAVE, {
      buscar: async (url, init) => {
        pedidos.push({
          url,
          corpo: JSON.parse(String(init.body)),
          autorizacao: (init.headers as Record<string, string>).authorization,
        })
        return new Response(JSON.stringify(VOLTA_DA_TRANSCRICAO), { status: 200 })
      },
    })
    expect(resposta).toMatchObject({
      ok: true,
      texto: VOLTA_DA_TRANSCRICAO.choices[0].message.content,
      tokensDeEntrada: 412,
      tokensDeSaida: 18,
    })
    expect(pedidos).toEqual([{ url: URL_DA_CONVERSA, corpo: corpoDaLeitura(AUDIO), autorizacao: 'Bearer sk-or-v1-teste' }])
  })

  test('sem modelo conectado, ou sem chave, não vai à rede', async () => {
    const buscar = async (): Promise<Response> => {
      throw new Error('não devia buscar')
    }
    expect(await lerMidiaComModelo('conta', { ...CONECTADA, porta: 'platform' }, AUDIO, CHAVE, { buscar })).toMatchObject({
      ok: false,
      codigo: 'sem_credencial',
    })
    expect(
      await lerMidiaComModelo('conta', CONECTADA, AUDIO, { chaveDoOpenRouter: async () => null }, { buscar }),
    ).toMatchObject({ ok: false, codigo: 'sem_credencial' })
  })

  test('a recusa do provedor e a falha de rede são ok falso, sem levantar', async () => {
    const recusa = await lerMidiaComModelo('conta', CONECTADA, AUDIO, CHAVE, {
      buscar: async () => new Response(JSON.stringify(RECUSA_DE_ENTRADA), { status: 400 }),
    })
    expect(recusa).toMatchObject({ ok: false, codigo: '400', status: 400 })
    const rede = await lerMidiaComModelo('conta', CONECTADA, AUDIO, CHAVE, {
      buscar: async () => Promise.reject(new TypeError('x')),
    })
    expect(rede).toMatchObject({ ok: false, codigo: 'TypeError', status: null })
  })
})
