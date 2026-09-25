import { describe, expect, test } from 'vitest'

import {
  lerEstadoDaInstancia,
  lerIdDoEnvio,
  lerMensagemRecebida,
  lerStatusDeMensagens,
  pedidoDeEnvioDeTexto,
  pedidosDosWebhooks,
  SUPOSICOES_DA_ZAPI,
} from './zapi.ts'
import {
  DE_GRUPO,
  ENVIADA_POR_MIM,
  INSTANCIA_CONECTADA,
  INSTANCIA_DESCONECTADA,
  RECEBIDA_DE_AUDIO,
  RECEBIDA_DE_DOCUMENTO,
  RECEBIDA_DE_FIGURINHA,
  RECEBIDA_DE_IMAGEM_COM_LEGENDA,
  RECEBIDA_DE_IMAGEM_SEM_LEGENDA,
  RECEBIDA_DE_TEXTO,
  RECEBIDA_DE_VIDEO,
  RESPOSTA_DO_ENVIO,
  STATUS_LIDA,
} from './zapi-exemplos.ts'

const CREDENCIAIS = { instance_id: 'INST123', token: 'TOK456', client_token: 'SEG789' }

describe('o que chega da Z-API', () => {
  test('texto recebido vira mensagem com o telefone em E.164', () => {
    expect(lerMensagemRecebida(RECEBIDA_DE_TEXTO)).toEqual({
      tipo: 'mensagem',
      telefone: '+5548999998888',
      idDoProvedor: RECEBIDA_DE_TEXTO.messageId,
      nomeDoRemetente: 'Joana Lima',
      texto: RECEBIDA_DE_TEXTO.text.message,
      midia: null,
      anexo: null,
      instante: new Date(RECEBIDA_DE_TEXTO.momment).toISOString(),
    })
  })

  test('áudio vira mídia sem texto, e imagem guarda a legenda', () => {
    expect(lerMensagemRecebida(RECEBIDA_DE_AUDIO)).toMatchObject({ tipo: 'mensagem', midia: 'audio', texto: '' })
    expect(lerMensagemRecebida(RECEBIDA_DE_IMAGEM_COM_LEGENDA)).toMatchObject({
      tipo: 'mensagem',
      midia: 'imagem',
      texto: 'Esse é o nosso galpão',
    })
  })

  test('cada mídia traz a URL e o tipo do arquivo (Z9)', () => {
    expect(lerMensagemRecebida(RECEBIDA_DE_AUDIO)).toMatchObject({
      anexo: { url: RECEBIDA_DE_AUDIO.audio.audioUrl, mime: 'audio/ogg; codecs=opus' },
    })
    expect(lerMensagemRecebida(RECEBIDA_DE_IMAGEM_COM_LEGENDA)).toMatchObject({
      anexo: { url: RECEBIDA_DE_IMAGEM_COM_LEGENDA.image.imageUrl, mime: 'image/jpeg' },
    })
    expect(lerMensagemRecebida(RECEBIDA_DE_IMAGEM_SEM_LEGENDA)).toMatchObject({ midia: 'imagem', texto: '' })
    expect(lerMensagemRecebida(RECEBIDA_DE_VIDEO)).toMatchObject({ midia: 'video', anexo: { mime: 'video/mp4' } })
    expect(lerMensagemRecebida(RECEBIDA_DE_DOCUMENTO)).toMatchObject({ midia: 'documento', anexo: { mime: 'application/pdf' } })
    expect(lerMensagemRecebida(RECEBIDA_DE_FIGURINHA)).toMatchObject({ midia: 'figurinha', anexo: { mime: 'image/webp' } })
    expect(lerMensagemRecebida({ ...RECEBIDA_DE_AUDIO, audio: { ptt: true } })).toMatchObject({ midia: 'audio', anexo: null })
  })

  test('o que é meu, de grupo, sem id ou de outro tipo é ignorado', () => {
    expect(lerMensagemRecebida(ENVIADA_POR_MIM)).toEqual({ tipo: 'ignorar', motivo: 'de_mim' })
    expect(lerMensagemRecebida(DE_GRUPO)).toEqual({ tipo: 'ignorar', motivo: 'grupo' })
    expect(lerMensagemRecebida({ ...RECEBIDA_DE_TEXTO, messageId: '' })).toEqual({ tipo: 'ignorar', motivo: 'sem_id' })
    expect(lerMensagemRecebida(STATUS_LIDA)).toEqual({ tipo: 'ignorar', motivo: 'nao_e_mensagem' })
    expect(lerMensagemRecebida('lixo')).toEqual({ tipo: 'ignorar', motivo: 'nao_e_mensagem' })
    expect(lerMensagemRecebida({ ...RECEBIDA_DE_TEXTO, phone: '123' })).toEqual({
      tipo: 'ignorar',
      motivo: 'telefone_invalido',
    })
  })

  test('conteúdo que não é texto nem mídia conhecida vira outro', () => {
    const enquete = { ...RECEBIDA_DE_TEXTO, text: undefined, poll: { question: 'Qual?' } }
    expect(lerMensagemRecebida(enquete)).toMatchObject({ tipo: 'mensagem', midia: 'outro' })
    expect(lerMensagemRecebida({ ...RECEBIDA_DE_TEXTO, text: undefined })).toEqual({ tipo: 'ignorar', motivo: 'vazia' })
  })

  test('status de leitura vira lida com os ids', () => {
    expect(lerStatusDeMensagens(STATUS_LIDA)).toEqual({ estado: 'lida', ids: STATUS_LIDA.ids })
    expect(lerStatusDeMensagens({ ...STATUS_LIDA, status: 'READ_BY_ME' })).toBeNull()
    expect(lerStatusDeMensagens(RECEBIDA_DE_TEXTO)).toBeNull()
  })
})

describe('o que vai para a Z-API', () => {
  test('o envio usa a instância, o token no caminho e o token de segurança no cabeçalho', () => {
    const pedido = pedidoDeEnvioDeTexto(CREDENCIAIS, '+5548999998888', 'Oi, Joana!')
    expect(pedido.url).toBe('https://api.z-api.io/instances/INST123/token/TOK456/send-text')
    expect(pedido.init.method).toBe('POST')
    expect(pedido.init.headers).toMatchObject({ 'client-token': 'SEG789' })
    expect(JSON.parse(String(pedido.init.body))).toEqual({ phone: '5548999998888', message: 'Oi, Joana!' })
    expect(pedido.endpoint).not.toContain('TOK456')
  })

  test('os dois webhooks são cadastrados com o mesmo endereço', () => {
    const pedidos = pedidosDosWebhooks(CREDENCIAIS, 'https://exemplo.test/functions/v1/whatsapp-inbound?conta=x')
    expect(pedidos.map((pedido) => pedido.endpoint)).toEqual(['update-webhook-received', 'update-webhook-message-status'])
    for (const pedido of pedidos) {
      expect(pedido.init.method).toBe('PUT')
      expect(JSON.parse(String(pedido.init.body))).toEqual({
        value: 'https://exemplo.test/functions/v1/whatsapp-inbound?conta=x',
      })
    }
  })

  test('o id do envio e o estado da instância se leem das fixtures', () => {
    expect(lerIdDoEnvio(RESPOSTA_DO_ENVIO)).toBe(RESPOSTA_DO_ENVIO.messageId)
    expect(lerIdDoEnvio({})).toBeNull()
    expect(lerEstadoDaInstancia(INSTANCIA_CONECTADA)).toEqual({ conectada: true, celularConectado: true })
    expect(lerEstadoDaInstancia(INSTANCIA_DESCONECTADA)).toEqual({ conectada: false, celularConectado: false })
    expect(lerEstadoDaInstancia({})).toBeNull()
  })

  test('toda suposição está numerada', () => {
    SUPOSICOES_DA_ZAPI.forEach((suposicao, indice) => expect(suposicao.startsWith(`Z${indice + 1}:`)).toBe(true))
  })
})
