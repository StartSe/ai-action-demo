// whatsapp-inbound com o canal em memória e o modelo dublado: endereço,
// idempotência, descadastro, rajada e os silêncios da assistente.

import { describe, expect, test } from 'vitest'

import type { RespostaDaRodada } from '../_shared/modelo/conversa-com-ferramentas.ts'
import { FALAS_DO_WHATSAPP, INSTRUCAO_DA_DESCRICAO, INSTRUCAO_DA_TRANSCRICAO } from '../_shared/speech/whatsapp.ts'
import { LIMITE_DA_MIDIA_BYTES } from '../_shared/whatsapp/midia.ts'
import { enderecoDoWebhookDoWhatsapp } from '../_shared/whatsapp/endereco.ts'
import { responderConversa, type AgenteDaConta } from '../_shared/whatsapp/resposta.ts'
import {
  DE_GRUPO,
  ENVIADA_POR_MIM,
  RECEBIDA_DE_AUDIO,
  RECEBIDA_DE_DOCUMENTO,
  RECEBIDA_DE_FIGURINHA,
  RECEBIDA_DE_IMAGEM_COM_LEGENDA,
  RECEBIDA_DE_IMAGEM_SEM_LEGENDA,
  RECEBIDA_DE_TEXTO,
  RECEBIDA_DE_VIDEO,
  STATUS_LIDA,
} from '../_shared/whatsapp/zapi-exemplos.ts'

import { receberWebhook, type RespostaDoWebhook } from './entrada.ts'
import { criarCanalEmMemoria, type CanalEmMemoria } from './porta-em-memoria.ts'
import { RECUSA_DO_ENDERECO } from './respostas.ts'

const CHAVE = 'chave-do-servidor'
const CONTA = '11111111-2222-4333-8444-555555555555'
const BASE = 'https://projeto.supabase.co/functions/v1'
const ENDERECO = await enderecoDoWebhookDoWhatsapp(BASE, CHAVE, CONTA)
const AMBIENTE = { chaves: { vigente: CHAVE }, log: () => {} }

const AGENTE: AgenteDaConta = {
  identidade: { nome: 'Ana', empresa: 'Fluxo Cargo', oferta: null, nuncaAfirmar: [] },
  playbook: { playbookVersionId: '11111111-1111-4111-8111-111111111111', versao: 1, camadaDois: 'Descubra a dor.', camadaTres: '' },
  politica: { duracaoMaximaSegundos: 600, gravacaoLigada: false, avisoDeGravacao: null, retencaoDias: 90 },
  criterios: [],
}

function canalQueResponde(texto = 'Oi! Como posso ajudar?'): CanalEmMemoria & { rodadas: number } {
  const canal = criarCanalEmMemoria({ agente: AGENTE }) as CanalEmMemoria & { rodadas: number }
  canal.rodadas = 0
  canal.motor = {
    ferramentas: new Map(),
    async rodada(): Promise<RespostaDaRodada> {
      canal.rodadas += 1
      return { ok: true, texto, chamadas: [] }
    },
  }
  return canal
}

function receber(canal: CanalEmMemoria, corpo: unknown, endereco = ENDERECO) {
  return receberWebhook({ metodo: 'POST', endereco, corpo: JSON.stringify(corpo) }, canal.porta, AMBIENTE)
}

/** Roda o `depois` como o `index.ts` roda, sem esperar a janela. */
async function depois(canal: CanalEmMemoria, resposta: RespostaDoWebhook): Promise<string[] | null> {
  if (!resposta.depois) return null
  return (await resposta.depois((conta, conversa) => responderConversa({ contaId: conta, conversaId: conversa }, canal.porta, { esperar: async () => {} }))) as string[] | null
}

describe('o endereço', () => {
  test('tudo errado é o mesmo 401, sem tocar na porta', async () => {
    const canal = criarCanalEmMemoria()
    const url = new URL(ENDERECO)
    const casos = [
      `${BASE}/whatsapp-inbound`,
      `${BASE}/whatsapp-inbound?conta=${CONTA}&chave=${'0'.repeat(64)}`,
      `${BASE}/whatsapp-inbound?conta=99999999-2222-4333-8444-555555555555&chave=${url.searchParams.get('chave')}`,
    ]
    const corpos = new Set<string>()
    for (const endereco of casos) {
      const resposta = await receber(canal, RECEBIDA_DE_TEXTO, endereco)
      expect(resposta.status).toBe(401)
      corpos.add(JSON.stringify(resposta.corpo))
    }
    expect([...corpos]).toEqual([JSON.stringify(RECUSA_DO_ENDERECO.corpo)])
    expect(canal.tocados).toEqual([])
  })

  test('corpo ilegível depois do endereço certo é 200 sem gravar', async () => {
    const canal = criarCanalEmMemoria()
    const resposta = await receberWebhook({ metodo: 'POST', endereco: ENDERECO, corpo: '{' }, canal.porta, AMBIENTE)
    expect(resposta).toMatchObject({ status: 200, depois: null })
    expect(canal.tocados).toEqual([])
  })
})

describe('o que chega', () => {
  test('mensagem nova grava lead, conversa e mensagem, e a resposta fica para depois', async () => {
    const canal = canalQueResponde()
    const resposta = await receber(canal, RECEBIDA_DE_TEXTO)
    expect(resposta.status).toBe(200)
    expect(canal.envios).toEqual([])
    expect([...canal.leads.values()]).toMatchObject([
      { phone_e164: '+5548999998888', name: 'Joana Lima', source: 'whatsapp', state: 'SC', timezone: 'America/Sao_Paulo' },
    ])
    expect(canal.mensagens).toHaveLength(1)

    expect(await depois(canal, resposta)).toEqual(['respondida'])
    expect(canal.envios).toEqual([{ telefone: '+5548999998888', texto: 'Oi! Como posso ajudar?' }])
    expect(canal.mensagens.at(-1)).toMatchObject({ direcao: 'out', autor: 'assistente', status: 'enviada' })
  })

  test('o webhook repetido não grava nem responde duas vezes', async () => {
    const canal = canalQueResponde()
    await depois(canal, await receber(canal, RECEBIDA_DE_TEXTO))
    const repetida = await receber(canal, RECEBIDA_DE_TEXTO)
    expect(repetida.corpo).toMatchObject({ duplicada: true })
    expect(await depois(canal, repetida)).toEqual(['nada_a_responder'])
    expect(canal.mensagens.filter((m) => m.direcao === 'in')).toHaveLength(1)
    expect(canal.envios).toHaveLength(1)
  })

  test('mensagem minha, de grupo e status não viram conversa', async () => {
    const canal = canalQueResponde()
    for (const corpo of [ENVIADA_POR_MIM, DE_GRUPO]) {
      expect(await receber(canal, corpo)).toMatchObject({ status: 200, depois: null })
    }
    expect(canal.conversas.size).toBe(0)
    await receber(canal, STATUS_LIDA)
    expect(canal.leads.size).toBe(0)
  })

  test('o status de entrega atualiza a mensagem enviada', async () => {
    const canal = canalQueResponde()
    await depois(canal, await receber(canal, RECEBIDA_DE_TEXTO))
    const enviada = canal.mensagens.at(-1)!
    await receber(canal, { ...STATUS_LIDA, ids: [enviada.idDoProvedor] })
    expect(canal.mensagens.at(-1)!.status).toBe('lida')
  })

  test('falha nossa é 503, para a Z-API reenviar', async () => {
    const canal = canalQueResponde()
    canal.porta.registrarLead = async () => {
      throw new Error('banco fora')
    }
    expect((await receber(canal, RECEBIDA_DE_TEXTO)).status).toBe(503)
  })
})

describe('descadastro', () => {
  test('parar bloqueia, encerra, abre o item e confirma uma vez, sem modelo', async () => {
    const canal = canalQueResponde()
    await depois(canal, await receber(canal, RECEBIDA_DE_TEXTO))
    const pedido = { ...RECEBIDA_DE_TEXTO, messageId: 'PARAR-1', text: { message: 'Parar' } }
    const resposta = await receber(canal, pedido)
    await depois(canal, resposta)

    expect(canal.bloqueados.has('+5548999998888')).toBe(true)
    expect([...canal.conversas.values()][0]!.status).toBe('encerrada')
    expect(canal.fila).toEqual([{ tipo: 'bloqueio', conversaId: [...canal.conversas.keys()][0] }])
    expect(canal.envios.at(-1)).toEqual({ telefone: '+5548999998888', texto: FALAS_DO_WHATSAPP.descadastro })
    expect(canal.rodadas).toBe(1)

    // O reenvio do mesmo aviso refaz o bloqueio e não confirma de novo.
    const envios = canal.envios.length
    expect((await receber(canal, pedido)).corpo).toMatchObject({ duplicada: true, descadastro: true })
    expect(canal.envios).toHaveLength(envios)
  })

  test('vale com a conversa nas mãos do time e com o canal desligado', async () => {
    const canal = canalQueResponde()
    canal.ligado = false
    await receber(canal, RECEBIDA_DE_TEXTO)
    const conversa = [...canal.conversas.values()][0]!
    canal.conversas.set(conversa.id, { ...conversa, status: 'humano', replyingAt: null })
    await depois(canal, await receber(canal, { ...RECEBIDA_DE_TEXTO, messageId: 'SAIR-1', text: { message: 'sair' } }))
    expect(canal.bloqueados.size).toBe(1)
    expect(canal.envios.map((envio) => envio.texto)).toEqual([FALAS_DO_WHATSAPP.descadastro])
  })
})

describe('modo de teste', () => {
  const TELEFONE = '+5548999998888'
  const GRAVACOES = ['mensagemExistente', 'registrarLead', 'abrirConversa', 'registrarEntrada', 'bloquear', 'encerrarPorDescadastro']

  test('número fora da lista é ignorado por inteiro: nada gravado, nada respondido', async () => {
    const canal = canalQueResponde()
    canal.modo = 'teste'
    canal.numerosDeTeste.add('+5511988887777')
    const resposta = await receber(canal, RECEBIDA_DE_TEXTO)
    expect(resposta).toMatchObject({ status: 200, corpo: { ignorada: 'fora_do_modo_de_teste' }, depois: null })
    expect(canal.leads.size).toBe(0)
    expect(canal.conversas.size).toBe(0)
    expect(canal.mensagens).toEqual([])
    expect(canal.tocados.filter((membro) => GRAVACOES.includes(membro))).toEqual([])
    expect(canal.rodadas).toBe(0)
  })

  test('descadastro de número fora da lista também é ignorado', async () => {
    const canal = canalQueResponde()
    canal.modo = 'teste'
    const resposta = await receber(canal, { ...RECEBIDA_DE_TEXTO, messageId: 'PARAR-FORA', text: { message: 'parar' } })
    expect(resposta).toMatchObject({ status: 200, corpo: { ignorada: 'fora_do_modo_de_teste' }, depois: null })
    expect(canal.bloqueados.size).toBe(0)
    expect(canal.fila).toEqual([])
    expect(canal.envios).toEqual([])
  })

  test('vale com o canal desligado: o número fora da lista não vira lead', async () => {
    const canal = canalQueResponde()
    canal.modo = 'teste'
    canal.ligado = false
    expect((await receber(canal, RECEBIDA_DE_TEXTO)).corpo).toMatchObject({ ignorada: 'fora_do_modo_de_teste' })
    expect(canal.leads.size).toBe(0)
  })

  test('número da lista conversa como sempre', async () => {
    const canal = canalQueResponde()
    canal.modo = 'teste'
    canal.numerosDeTeste.add(TELEFONE)
    const resposta = await receber(canal, RECEBIDA_DE_TEXTO)
    expect(resposta.corpo).toMatchObject({ gravada: true })
    expect(await depois(canal, resposta)).toEqual(['respondida'])
    expect(canal.envios).toEqual([{ telefone: TELEFONE, texto: 'Oi! Como posso ajudar?' }])
  })

  test('descadastro de número da lista bloqueia como sempre', async () => {
    const canal = canalQueResponde()
    canal.modo = 'teste'
    canal.numerosDeTeste.add(TELEFONE)
    await receber(canal, { ...RECEBIDA_DE_TEXTO, messageId: 'PARAR-DENTRO', text: { message: 'parar' } })
    expect(canal.bloqueados.has(TELEFONE)).toBe(true)
  })

  test('no modo todos, qualquer número conversa', async () => {
    const canal = canalQueResponde()
    canal.modo = 'todos'
    expect((await receber(canal, RECEBIDA_DE_TEXTO)).corpo).toMatchObject({ gravada: true })
  })

  test('conversa aberta antes de voltar ao modo de teste não recebe resposta', async () => {
    const canal = canalQueResponde()
    const resposta = await receber(canal, RECEBIDA_DE_TEXTO)
    canal.modo = 'teste'
    expect(await depois(canal, resposta)).toEqual(['fora_do_modo_de_teste'])
    expect(canal.envios).toEqual([])
  })
})

describe('áudio e imagem', () => {
  const OGG = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3, 4])
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 5, 6])

  /** O canal com o download e o modelo de mídia dublados. */
  function canalComMidia(
    arquivo: Uint8Array | null,
    volta: string | null = 'Oi, eu queria saber o preço do frete para Curitiba.',
  ) {
    const canal = canalQueResponde('Claro! Para Curitiba, qual o peso da carga?')
    const pedidos: { tarefa: string; conteudo: unknown; instrucao: string }[] = []
    const baixados: string[] = []
    canal.buscarMidia = async (url) => {
      baixados.push(url)
      return arquivo === null ? new Response(null, { status: 404 }) : new Response(arquivo, { status: 200 })
    }
    canal.modeloDaMidia = async (_conta, tarefa, pedido) => {
      pedidos.push({ tarefa, conteudo: pedido.conteudo, instrucao: pedido.instrucao })
      return volta === null
        ? { ok: false, codigo: '400', status: 400, modelo: 'google/gemini-3.1-flash-lite', endpoint: 'api/v1/chat/completions' }
        : {
            ok: true,
            codigo: 'stop',
            status: 200,
            texto: volta,
            tokensDeEntrada: 412,
            tokensDeSaida: 18,
            modelo: 'google/gemini-3.1-flash-lite',
            endpoint: 'api/v1/chat/completions',
          }
    }
    return Object.assign(canal, { pedidos, baixados })
  }

  test('áudio: transcreve pelo modelo da tarefa audio, grava e responde como se fosse texto', async () => {
    const canal = canalComMidia(OGG)
    const resposta = await receber(canal, RECEBIDA_DE_AUDIO)
    expect(resposta.corpo).toMatchObject({ leitura: 'pendente' })
    expect(canal.mensagens[0]).toMatchObject({ midia: 'audio', estadoDaLeitura: 'pendente', texto: '' })

    expect(await depois(canal, resposta)).toEqual(['respondida'])
    expect(canal.baixados).toEqual([RECEBIDA_DE_AUDIO.audio.audioUrl])
    expect(canal.pedidos).toEqual([
      { tarefa: 'audio', conteudo: { tipo: 'audio', base64: btoa('OggS\x01\x02\x03\x04'), formato: 'ogg' }, instrucao: INSTRUCAO_DA_TRANSCRICAO },
    ])
    expect(canal.mensagens[0]).toMatchObject({
      estadoDaLeitura: 'lida',
      leitura: 'Oi, eu queria saber o preço do frete para Curitiba.',
    })
    expect(canal.envios.map((envio) => envio.texto)).toEqual(['Claro! Para Curitiba, qual o peso da carga?'])
  })

  test('o motor recebe a transcrição marcada, e a imagem com a descrição e a legenda', async () => {
    const vistas: unknown[] = []
    const canal = canalComMidia(JPEG, 'Um galpão com prateleiras de paletes.')
    canal.motor = {
      ferramentas: new Map(),
      async rodada(pedido): Promise<RespostaDaRodada> {
        vistas.push(pedido.mensagens.at(-1))
        return { ok: true, texto: 'Que galpão bonito!', chamadas: [] }
      },
    }
    await depois(canal, await receber(canal, RECEBIDA_DE_IMAGEM_COM_LEGENDA))
    expect(canal.pedidos[0]).toMatchObject({ tarefa: 'imagem', instrucao: INSTRUCAO_DA_DESCRICAO })
    expect((canal.pedidos[0]!.conteudo as { dataUri: string }).dataUri).toMatch(/^data:image\/jpeg;base64,/)
    expect(vistas).toEqual([
      { role: 'user', content: '[a pessoa mandou uma imagem. O que ela mostra: Um galpão com prateleiras de paletes.] Esse é o nosso galpão' },
    ])
  })

  test('o registro de integração leva a instrução sob prompt, e nem a mídia nem a transcrição', async () => {
    const canal = canalComMidia(OGG)
    await depois(canal, await receber(canal, RECEBIDA_DE_AUDIO))
    expect(canal.eventosDeIntegracao).toHaveLength(1)
    const [evento] = canal.eventosDeIntegracao
    expect(evento).toMatchObject({
      account_id: CONTA,
      provider: 'modelo',
      request: { model: 'google/gemini-3.1-flash-lite', tarefa: 'audio', mime: 'audio/ogg', bytes: OGG.byteLength, prompt: INSTRUCAO_DA_TRANSCRICAO },
      response: { ok: true, tokens_de_entrada: 412, tokens_de_saida: 18 },
    })
    const gravado = JSON.stringify(evento)
    expect(gravado).not.toContain('Curitiba')
    expect(gravado).not.toContain(btoa('OggS\x01\x02\x03\x04'))
  })

  test('arquivo acima do limite não vai ao modelo, e ela pede para repetir', async () => {
    const canal = canalComMidia(new Uint8Array(LIMITE_DA_MIDIA_BYTES + 1))
    await depois(canal, await receber(canal, RECEBIDA_DE_AUDIO))
    expect(canal.pedidos).toEqual([])
    expect(canal.mensagens[0]).toMatchObject({ estadoDaLeitura: 'falhou', leitura: null })
    expect(canal.envios.map((envio) => envio.texto)).toEqual([FALAS_DO_WHATSAPP.audioNaoOuvido])
    expect(canal.rodadas).toBe(0)
  })

  test('falha do modelo e áudio que ele não entendeu não inventam nada', async () => {
    for (const volta of [null, '[inaudivel]']) {
      const canal = canalComMidia(OGG, volta)
      await depois(canal, await receber(canal, RECEBIDA_DE_AUDIO))
      expect(canal.mensagens[0]).toMatchObject({ estadoDaLeitura: 'falhou', leitura: null })
      expect(canal.envios.map((envio) => envio.texto)).toEqual([FALAS_DO_WHATSAPP.audioNaoOuvido])
      expect(canal.rodadas).toBe(0)
    }
    const imagem = canalComMidia(null)
    await depois(imagem, await receber(imagem, RECEBIDA_DE_IMAGEM_SEM_LEGENDA))
    expect(imagem.envios.map((envio) => envio.texto)).toEqual([FALAS_DO_WHATSAPP.imagemNaoVista])
  })

  test('imagem que falhou mas veio com legenda segue para o motor com o aviso', async () => {
    const vistas: unknown[] = []
    const canal = canalComMidia(null)
    canal.motor = {
      ferramentas: new Map(),
      async rodada(pedido): Promise<RespostaDaRodada> {
        vistas.push(pedido.mensagens.at(-1))
        return { ok: true, texto: 'Entendi.', chamadas: [] }
      },
    }
    await depois(canal, await receber(canal, RECEBIDA_DE_IMAGEM_COM_LEGENDA))
    expect(vistas).toEqual([{ role: 'user', content: '[a pessoa mandou uma imagem que não deu para abrir] Esse é o nosso galpão' }])
  })

  test('com a leitura pendente, a resposta espera', async () => {
    const canal = canalComMidia(OGG)
    await receber(canal, RECEBIDA_DE_AUDIO)
    const conversa = [...canal.conversas.keys()][0]!
    expect(await responderConversa({ contaId: CONTA, conversaId: conversa }, canal.porta, { esperar: async () => {} })).toEqual([
      'midia_pendente',
    ])
    expect(canal.envios).toEqual([])
  })

  test('com o canal desligado a mídia não vai ao modelo', async () => {
    const canal = canalComMidia(OGG)
    canal.ligado = false
    const resposta = await receber(canal, RECEBIDA_DE_AUDIO)
    expect(resposta.depois).toBeNull()
    expect(canal.mensagens[0]).toMatchObject({ estadoDaLeitura: null })
    expect(canal.pedidos).toEqual([])
  })
})

describe('a resposta', () => {
  test('vídeo, documento e figurinha recebem o pedido de texto, sem modelo', async () => {
    for (const corpo of [RECEBIDA_DE_VIDEO, RECEBIDA_DE_DOCUMENTO, RECEBIDA_DE_FIGURINHA]) {
      const canal = canalQueResponde()
      const resposta = await receber(canal, corpo)
      expect(canal.mensagens[0]).toMatchObject({ estadoDaLeitura: null })
      await depois(canal, resposta)
      expect(canal.envios.map((envio) => envio.texto)).toEqual([FALAS_DO_WHATSAPP.pedirTexto])
      expect(canal.rodadas).toBe(0)
      expect(canal.eventosDeIntegracao).toEqual([])
    }
  })

  test('a rajada recebe uma resposta só', async () => {
    const canal = canalQueResponde()
    const primeira = await receber(canal, RECEBIDA_DE_TEXTO)
    const segunda = await receber(canal, { ...RECEBIDA_DE_TEXTO, messageId: 'RAJADA-2', text: { message: 'é sobre frete' } })
    const [a, b] = await Promise.all([depois(canal, primeira), depois(canal, segunda)])
    // Uma execução toma a conversa e responde às duas; a outra sai ocupada.
    expect([...(a ?? []), ...(b ?? [])].sort()).toEqual(['ocupada', 'respondida'])
    expect(canal.envios).toHaveLength(1)
    expect(canal.rodadas).toBe(1)
  })

  test('mensagem que chega durante a resposta ganha outra rodada', async () => {
    const canal = canalQueResponde()
    const primeira = await receber(canal, RECEBIDA_DE_TEXTO)
    const rodadaOriginal = canal.motor.rodada
    let chegou = false
    canal.motor = {
      ...canal.motor,
      async rodada(pedido) {
        if (!chegou) {
          chegou = true
          await receber(canal, { ...RECEBIDA_DE_TEXTO, messageId: 'NO-MEIO', text: { message: 'e outra coisa' } })
        }
        return rodadaOriginal(pedido)
      },
    }
    // A primeira resposta não considerava a mensagem do meio: é descartada, e
    // a rodada seguinte responde às duas de uma vez.
    expect(await depois(canal, primeira)).toEqual(['refeita', 'respondida'])
    expect(canal.envios).toHaveLength(1)
  })

  test('com gente, canal desligado ou número bloqueado, a assistente cala', async () => {
    const humano = canalQueResponde()
    await receber(humano, RECEBIDA_DE_TEXTO)
    const conversa = [...humano.conversas.values()][0]!
    humano.conversas.set(conversa.id, { ...conversa, status: 'humano', replyingAt: null })
    expect(await responderConversa({ contaId: CONTA, conversaId: conversa.id }, humano.porta, { esperar: async () => {} })).toEqual(['ocupada'])

    const desligado = canalQueResponde()
    desligado.ligado = false
    expect((await receber(desligado, RECEBIDA_DE_TEXTO)).depois).toBeNull()

    const bloqueado = canalQueResponde()
    bloqueado.bloqueados.add('+5548999998888')
    expect(await depois(bloqueado, await receber(bloqueado, RECEBIDA_DE_TEXTO))).toEqual(['numero_bloqueado'])
    for (const canal of [humano, desligado, bloqueado]) expect(canal.envios).toEqual([])
  })

  test('sem modelo conectado, cala e abre o item na fila', async () => {
    const canal = criarCanalEmMemoria({ agente: AGENTE })
    expect(await depois(canal, await receber(canal, RECEBIDA_DE_TEXTO))).toEqual(['modelo_nao_conectado'])
    expect(canal.envios).toEqual([])
    expect(canal.fila).toMatchObject([{ motivo: 'modelo_nao_conectado', recorte: RECEBIDA_DE_TEXTO.text.message }])
  })

  test('sem playbook publicado, cala e abre o item na fila', async () => {
    const canal = canalQueResponde()
    canal.agente = { ...AGENTE, playbook: null }
    expect(await depois(canal, await receber(canal, RECEBIDA_DE_TEXTO))).toEqual(['assistente_nao_publicada'])
    expect(canal.envios).toEqual([])
  })

  test('envio que falha fica gravado como falhou', async () => {
    const canal = canalQueResponde()
    canal.envioFalha = true
    expect(await depois(canal, await receber(canal, RECEBIDA_DE_TEXTO))).toEqual(['envio_falhou'])
    expect(canal.mensagens.at(-1)).toMatchObject({ direcao: 'out', status: 'falhou' })
  })
})
