// O adaptador do Resend com o `buscar` dublado: o pedido montado, 2xx como o
// único sucesso, a tradução do erro e a exceção de rede como tentativa sem
// resposta. A prova contra o Resend de verdade é de CI (O-03).

import { describe, expect, test } from 'vitest'

import { PROVEDORES } from '../../integrations-status/provedores.ts'
import type { CofreDeCredenciais, ResolucaoDeSegredo } from '../secrets.ts'

import {
  REMETENTE_DO_EMAIL,
  SEGREDO_DO_EMAIL,
  abrirEmailDaConta,
  criarEmailDoResend,
  lerRemetente,
  type Buscar,
  type PedidoHttp,
} from './email-resend.ts'
import { MENSAGENS_DO_EMAIL, type MensagemDeEmail } from './email.ts'

const CHAVE = 're_ChaveImprovavel_9f8e7d'
const REMETENTE = 'Sarah <agenda@envio.exemplo.test>'

const MENSAGEM: MensagemDeEmail = {
  para: 'lead@exemplo.test',
  assunto: 'Sua conversa com Ana está marcada',
  texto: 'Oi! Aqui é a Sarah.',
  anexos: [{ nome: 'convite.ics', tipo: 'text/calendar; charset=utf-8', conteudo: 'SUMMARY:Reunião com João' }],
  chaveDeIdempotencia: 'convite-reuniao-lead-1',
}

function montar(status: number, corpo: string | (() => never)) {
  const pedidos: { url: string; pedido: PedidoHttp }[] = []
  const buscar: Buscar = async (url, pedido) => {
    pedidos.push({ url, pedido })
    if (typeof corpo === 'function') corpo()
    return { status, text: async () => corpo as string }
  }
  return { pedidos, porta: criarEmailDoResend({ buscar, chave: CHAVE, remetente: REMETENTE }) }
}

function decodificar(base64: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)))
}

describe('o pedido', () => {
  test('leva a chave no cabeçalho, a chave de idempotência e o anexo em base64 de UTF-8', async () => {
    const { pedidos, porta } = montar(200, JSON.stringify({ id: 'envio-1' }))
    await porta.enviar(MENSAGEM)

    expect(pedidos).toHaveLength(1)
    const { url, pedido } = pedidos[0]!
    expect(url).toBe('https://api.resend.com/emails')
    expect(pedido.method).toBe('POST')
    expect(pedido.headers.authorization).toBe(`Bearer ${CHAVE}`)
    expect(pedido.headers['idempotency-key']).toBe('convite-reuniao-lead-1')

    const corpo = JSON.parse(pedido.body) as Record<string, unknown>
    expect(corpo).toMatchObject({ from: REMETENTE, to: ['lead@exemplo.test'], subject: MENSAGEM.assunto, text: MENSAGEM.texto })
    const [anexo] = corpo.attachments as { filename: string; content: string; content_type: string }[]
    expect(anexo!.filename).toBe('convite.ics')
    expect(decodificar(anexo!.content)).toBe('SUMMARY:Reunião com João')
    // A chave só vai no cabeçalho.
    expect(pedido.body).not.toContain(CHAVE)
  })
})

describe('a resposta', () => {
  test('2xx é envio, com o id do provedor', async () => {
    const { porta } = montar(200, JSON.stringify({ id: 'envio-1' }))
    expect(await porta.enviar(MENSAGEM)).toEqual({ ok: true, idDoEnvio: 'envio-1' })
  })

  test('2xx com corpo ilegível ainda é envio: o provedor já tem a mensagem', async () => {
    const { porta } = montar(202, 'não é json')
    expect(await porta.enviar(MENSAGEM)).toEqual({ ok: true, idDoEnvio: null })
  })

  test.each([
    [401, { name: 'invalid_api_key', message: 'API key is invalid' }, 'chave_invalida'],
    [403, { name: 'validation_error', message: 'The envio.exemplo.test domain is not verified' }, 'sem_permissao'],
    [422, { name: 'invalid_to_address', message: 'Invalid `to` field' }, 'destinatario_recusado'],
    [429, { name: 'rate_limit_exceeded', message: 'Too many requests' }, 'limite_de_taxa'],
    [500, { name: 'internal_server_error', message: 'boom' }, 'provedor_indisponivel'],
    [409, { name: 'concurrent_idempotent_requests', message: 'wait' }, 'falha_do_provedor'],
  ] as const)('%i vira o motivo traduzido, sem o código nem a mensagem do provedor', async (status, corpo, motivo) => {
    const { porta } = montar(status, JSON.stringify(corpo))
    const resultado = await porta.enviar(MENSAGEM)

    expect(resultado).toEqual({ ok: false, motivo, mensagem: MENSAGENS_DO_EMAIL[motivo] })
    const serializado = JSON.stringify(resultado)
    expect(serializado).not.toContain(corpo.name)
    expect(serializado).not.toContain(corpo.message)
  })

  test('exceção de rede é sem resposta, e a mensagem dela fica para trás', async () => {
    const { porta } = montar(0, () => {
      throw new Error(`fetch failed https://api.resend.com/emails ${CHAVE}`)
    })
    const resultado = await porta.enviar(MENSAGEM)

    expect(resultado).toEqual({ ok: false, motivo: 'sem_resposta', mensagem: MENSAGENS_DO_EMAIL.sem_resposta })
    expect(JSON.stringify(resultado)).not.toContain(CHAVE)
  })
})

describe('o e-mail da conta', () => {
  function cofre(valores: Readonly<Record<string, string | null>>, pedidos: string[][]): CofreDeCredenciais {
    return {
      async resolveSecret(contaId, provedor, chave): Promise<ResolucaoDeSegredo> {
        pedidos.push([contaId, provedor, chave])
        const valor = valores[chave] ?? null
        return valor === null ? { ok: false, motivo: 'ausente' } : { ok: true, valor, origem: 'conta' }
      },
      invalidar() {},
      invalidarConta() {},
      limpar() {},
    }
  }

  test('a chave e o remetente são os que a tela de integrações cadastra para o e-mail transacional', () => {
    const provedor = PROVEDORES.find((item) => item.id === SEGREDO_DO_EMAIL.provedor)
    expect(provedor?.chaves).toContain(SEGREDO_DO_EMAIL.chave)
    expect(REMETENTE_DO_EMAIL.provedor).toBe(SEGREDO_DO_EMAIL.provedor)
    expect(provedor?.chaves).toContain(REMETENTE_DO_EMAIL.chave)
  })

  test('com a chave e o remetente da conta no cofre, envia com os dois', async () => {
    const pedidos: string[][] = []
    const idas: { url: string; pedido: PedidoHttp }[] = []
    const buscar: Buscar = async (url, pedido) => {
      idas.push({ url, pedido })
      return { status: 200, text: async () => '{}' }
    }
    const porta = await abrirEmailDaConta(
      cofre({ api_key: CHAVE, remetente: '  Agenda Aurora   <agenda@aurora.com.br> ' }, pedidos),
      'conta-1',
      { buscar },
    )

    expect(pedidos).toEqual([
      ['conta-1', 'email', 'api_key'],
      ['conta-1', 'email', 'remetente'],
    ])
    expect('enviar' in porta).toBe(true)
    if ('enviar' in porta) expect((await porta.enviar(MENSAGEM)).ok).toBe(true)
    expect(idas[0]?.pedido.headers.authorization).toBe(`Bearer ${CHAVE}`)
    expect(JSON.parse(idas[0]!.pedido.body).from).toBe('Agenda Aurora <agenda@aurora.com.br>')
  })

  test('sem chave ou sem remetente da conta é e-mail não configurado, sem ir ao provedor', async () => {
    const buscar: Buscar = async () => {
      throw new Error('não deveria ir ao provedor')
    }
    const semChave = await abrirEmailDaConta(cofre({ remetente: 'agenda@aurora.com.br' }, []), 'conta-1', { buscar })
    const semRemetente = await abrirEmailDaConta(cofre({ api_key: CHAVE }, []), 'conta-1', { buscar })
    const remetenteEmBranco = await abrirEmailDaConta(cofre({ api_key: CHAVE, remetente: '  ' }, []), 'conta-1', { buscar })

    for (const resultado of [semChave, semRemetente, remetenteEmBranco]) {
      expect(resultado).toEqual({ ok: false, motivo: 'nao_configurado', mensagem: MENSAGENS_DO_EMAIL.nao_configurado })
    }
    expect(MENSAGENS_DO_EMAIL.nao_configurado).toMatch(/^Convite não enviado: configure o e-mail em Integrações/)
  })

  test('remetente que não é endereço é recusado com a frase do formato', async () => {
    const buscar: Buscar = async () => {
      throw new Error('não deveria ir ao provedor')
    }
    const resultado = await abrirEmailDaConta(cofre({ api_key: CHAVE, remetente: 'Agenda Aurora' }, []), 'conta-1', { buscar })
    expect(resultado).toEqual({ ok: false, motivo: 'remetente_invalido', mensagem: MENSAGENS_DO_EMAIL.remetente_invalido })
  })

  test.each([
    ['agenda@aurora.com.br', 'agenda@aurora.com.br'],
    ['Agenda Aurora <agenda@aurora.com.br>', 'Agenda Aurora <agenda@aurora.com.br>'],
    ['<agenda@aurora.com.br>', 'agenda@aurora.com.br'],
    ['Agenda Aurora', null],
    ['agenda@aurora', null],
    ['agenda aurora@aurora.com.br', null],
    ['Agenda <agenda@aurora.com.br', null],
    ['a@b.com, c@d.com', null],
  ] as const)('o remetente %j vira %j', (texto, esperado) => {
    expect(lerRemetente(texto)).toBe(esperado)
  })
})
