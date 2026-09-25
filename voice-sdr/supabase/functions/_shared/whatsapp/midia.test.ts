import { describe, expect, test } from 'vitest'

import {
  baixarMidia,
  formatoDoAudio,
  leituraAproveitavel,
  LIMITE_DA_MIDIA_BYTES,
  paraBase64,
  tipoDaImagem,
} from './midia.ts'

describe('o download', () => {
  test('só https, e a recusa não chega a buscar', async () => {
    const buscados: string[] = []
    const buscar = async (url: string) => {
      buscados.push(url)
      return new Response(new Uint8Array([1]))
    }
    expect(await baixarMidia('http://exemplo.com/a.ogg', buscar)).toEqual({ ok: false, motivo: 'endereco_invalido' })
    expect(await baixarMidia('não é url', buscar)).toEqual({ ok: false, motivo: 'endereco_invalido' })
    expect(buscados).toEqual([])
  })

  test('content-length acima do teto recusa e cancela o corpo', async () => {
    let cancelado = false
    const corpo = new ReadableStream<Uint8Array>({
      pull(controle) {
        controle.enqueue(new Uint8Array(1024))
      },
      cancel() {
        cancelado = true
      },
    })
    const buscar = async () => new Response(corpo, { headers: { 'content-length': String(LIMITE_DA_MIDIA_BYTES + 1) } })
    expect(await baixarMidia('https://exemplo.com/a.ogg', buscar)).toEqual({ ok: false, motivo: 'grande_demais' })
    expect(cancelado).toBe(true)
  })

  test('sem content-length, para no pedaço que passa do teto', async () => {
    const buscar = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controle) {
            controle.enqueue(new Uint8Array(6))
            controle.enqueue(new Uint8Array(6))
            controle.close()
          },
        }),
      )
    expect(await baixarMidia('https://exemplo.com/a.ogg', buscar, 10)).toEqual({ ok: false, motivo: 'grande_demais' })
    const cabe = await baixarMidia('https://exemplo.com/a.ogg', async () => new Response(new Uint8Array([1, 2, 3])), 10)
    expect(cabe).toMatchObject({ ok: true })
    expect(cabe.ok && [...cabe.bytes]).toEqual([1, 2, 3])
  })

  test('erro de rede e 404 são falha no download', async () => {
    expect(await baixarMidia('https://exemplo.com/a', async () => Promise.reject(new Error('rede')))).toEqual({
      ok: false,
      motivo: 'falha_no_download',
    })
    expect(await baixarMidia('https://exemplo.com/a', async () => new Response(null, { status: 404 }))).toEqual({
      ok: false,
      motivo: 'falha_no_download',
    })
  })
})

describe('os formatos', () => {
  test('a nota de voz do WhatsApp vai como ogg, e o desconhecido não vai', () => {
    expect(formatoDoAudio('audio/ogg; codecs=opus')).toBe('ogg')
    expect(formatoDoAudio('audio/mpeg')).toBe('mp3')
    expect(formatoDoAudio('audio/mp4')).toBe('m4a')
    expect(formatoDoAudio('application/octet-stream')).toBeNull()
    expect(formatoDoAudio(null)).toBeNull()
  })

  test('imagem só nos tipos que o modelo lê', () => {
    expect(tipoDaImagem('image/jpeg')).toBe('image/jpeg')
    expect(tipoDaImagem('IMAGE/PNG')).toBe('image/png')
    expect(tipoDaImagem('image/heic')).toBeNull()
  })

  test('base64 igual ao de referência, em arquivo maior que um pedaço', () => {
    const bytes = new Uint8Array(70_000).map((_, indice) => indice % 256)
    expect(paraBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
  })

  test('a marca de inaudível e o vazio não são leitura', () => {
    expect(leituraAproveitavel('[inaudivel]')).toBeNull()
    expect(leituraAproveitavel(' [INAUDIVEL]. ')).toBeNull()
    expect(leituraAproveitavel('   ')).toBeNull()
    expect(leituraAproveitavel(' Oi, tudo bem? ')).toBe('Oi, tudo bem?')
  })
})
