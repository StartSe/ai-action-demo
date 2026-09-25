import { describe, expect, test } from 'vitest'

import type { RespostaDaRodada } from '../_shared/modelo/conversa-com-ferramentas.ts'
import type { AgenteDaConta } from '../_shared/whatsapp/resposta.ts'
import { criarCanalEmMemoria, type CanalEmMemoria } from '../whatsapp-inbound/porta-em-memoria.ts'

import { atenderEnvio, type PortaDoEnvio } from './envio.ts'
import { MENSAGENS_DO_ENVIO } from './respostas.ts'

const CONTA = '11111111-2222-4333-8444-555555555555'
const USUARIO = 'usuario-1'

const AGENTE: AgenteDaConta = {
  identidade: { nome: 'Ana', empresa: 'Fluxo Cargo', oferta: null, nuncaAfirmar: [] },
  playbook: { playbookVersionId: '11111111-1111-4111-8111-111111111111', versao: 1, camadaDois: 'Descubra a dor.', camadaTres: '' },
  politica: { duracaoMaximaSegundos: 600, gravacaoLigada: false, avisoDeGravacao: null, retencaoDias: 90 },
  criterios: [],
}

function montar(
  papel: string | null = 'operator',
  modelo: RespostaDaRodada = { ok: true, texto: 'Oi, Joana! Aqui é a Ana.', chamadas: [] },
  agente: AgenteDaConta | null = AGENTE,
) {
  const canal = criarCanalEmMemoria({ agente })
  canal.motor = { ferramentas: new Map(), rodada: async () => modelo }
  const porta: PortaDoEnvio = {
    ...canal.porta,
    lerConversa: canal.porta.lerConversa,
    usuarioDaSessao: async (jwt) => (jwt === 'jwt-valido' ? { id: USUARIO } : null),
    papelNaConta: async () => papel,
  }
  return { canal, porta }
}

async function lead(canal: CanalEmMemoria): Promise<string> {
  const id = await canal.porta.registrarLead(CONTA, {
    name: 'Joana',
    phone_e164: '+5548999998888',
    city: null,
    state: null,
    timezone: null,
    source: 'manual',
    source_ref: null,
  })
  return id
}

function pedir(porta: PortaDoEnvio, corpo: Record<string, unknown>, autorizacao = 'Bearer jwt-valido') {
  return atenderEnvio({ metodo: 'POST', autorizacao, corpo: { account_id: CONTA, ...corpo } }, porta)
}

describe('quem pode', () => {
  test('sem sessão, sessão inválida e papel sem acesso são recusados antes de agir', async () => {
    const { porta, canal } = montar('viewer')
    expect((await pedir(porta, { acao: 'assumir' }, '')).status).toBe(401)
    expect((await pedir(porta, { acao: 'assumir' }, 'Bearer outro')).status).toBe(401)
    const semPapel = await pedir(porta, { acao: 'assumir', conversation_id: '99999999-2222-4333-8444-555555555555' })
    expect(semPapel).toMatchObject({ status: 403, corpo: { motivo: 'sem_acesso', mensagem: MENSAGENS_DO_ENVIO.sem_acesso } })
    const naoMembro = await pedir(montar(null).porta, { acao: 'assumir' })
    expect(naoMembro.corpo).toEqual(semPapel.corpo)
    expect(canal.envios).toEqual([])
  })

  test('pedido sem conta ou com ação desconhecida é 400', async () => {
    const { porta } = montar()
    expect((await atenderEnvio({ metodo: 'POST', autorizacao: 'Bearer jwt-valido', corpo: {} }, porta)).status).toBe(400)
    expect((await pedir(porta, { acao: 'apagar' })).status).toBe(400)
  })
})

describe('as ações', () => {
  test('mensagem de gente abre conversa pelo lead, grava o autor e tira a assistente', async () => {
    const { porta, canal } = montar()
    const leadId = await lead(canal)
    const resposta = await pedir(porta, { lead_id: leadId, text: '  Oi Joana, aqui é o Pedro.  ' })
    expect(resposta).toMatchObject({ status: 200, corpo: { ok: true, acao: 'mensagem', conversa: { status: 'humano' } } })
    expect(canal.envios).toEqual([{ telefone: '+5548999998888', texto: 'Oi Joana, aqui é o Pedro.' }])
    expect(canal.mensagens.at(-1)).toMatchObject({ autor: 'humano', autorId: USUARIO })
    expect(canal.eventos.map((evento) => evento.acao)).toEqual(['iniciada', 'assumida'])
  })

  test('texto vazio, longo e conversa de outra conta são recusados', async () => {
    const { porta, canal } = montar()
    const leadId = await lead(canal)
    expect((await pedir(porta, { lead_id: leadId, text: '  ' })).corpo).toMatchObject({ motivo: 'texto_vazio' })
    expect((await pedir(porta, { lead_id: leadId, text: 'a'.repeat(4097) })).corpo).toMatchObject({ motivo: 'texto_longo' })
    expect(
      (await pedir(porta, { conversation_id: '99999999-2222-4333-8444-555555555555', text: 'oi' })).corpo,
    ).toMatchObject({ motivo: 'conversa_nao_encontrada' })
  })

  test('número bloqueado e WhatsApp sem chaves não mandam nada', async () => {
    const { porta, canal } = montar()
    const leadId = await lead(canal)
    canal.bloqueados.add('+5548999998888')
    expect((await pedir(porta, { lead_id: leadId, text: 'oi' })).corpo).toMatchObject({ motivo: 'numero_bloqueado' })
    canal.bloqueados.clear()
    canal.credenciais = null
    expect((await pedir(porta, { lead_id: leadId, text: 'oi' })).status).toBe(428)
    expect(canal.envios).toEqual([])
  })

  test('assumir, devolver e encerrar mudam o estado, e repetir não é erro', async () => {
    const { porta, canal } = montar()
    const leadId = await lead(canal)
    const { conversaId } = await canal.porta.abrirConversa(CONTA, '+5548999998888', leadId, 'lead')

    expect((await pedir(porta, { acao: 'assumir', conversation_id: conversaId })).corpo).toMatchObject({ conversa: { status: 'humano' } })
    expect((await pedir(porta, { acao: 'assumir', conversation_id: conversaId })).status).toBe(200)
    const devolvida = await pedir(porta, { acao: 'devolver', conversation_id: conversaId })
    expect(devolvida).toMatchObject({ status: 200, depois: { contaId: CONTA, conversaId } })
    expect((await pedir(porta, { acao: 'encerrar', conversation_id: conversaId })).corpo).toMatchObject({ conversa: { status: 'encerrada' } })
    expect((await pedir(porta, { acao: 'assumir', conversation_id: conversaId })).corpo).toMatchObject({ motivo: 'conversa_encerrada' })
    expect(canal.eventos.map((evento) => evento.acao)).toEqual(['iniciada', 'assumida', 'devolvida', 'encerrada'])
  })

  test('devolver com o canal desligado é recusado', async () => {
    const { porta, canal } = montar()
    const { conversaId } = await canal.porta.abrirConversa(CONTA, '+5548999998888', await lead(canal), 'lead')
    await pedir(porta, { acao: 'assumir', conversation_id: conversaId })
    canal.ligado = false
    expect((await pedir(porta, { acao: 'devolver', conversation_id: conversaId })).corpo).toMatchObject({ motivo: 'canal_desligado' })
  })

  test('iniciar: a assistente abre a conversa com a abertura padrão, sem modelo', async () => {
    let idas = 0
    const { porta, canal } = montar()
    canal.motor = { ferramentas: new Map(), rodada: async () => (idas++, { ok: true, texto: 'não sai', chamadas: [] }) }
    const leadId = await lead(canal)
    const resposta = await pedir(porta, { acao: 'iniciar', lead_id: leadId })
    expect(resposta).toMatchObject({ status: 200, corpo: { acao: 'iniciar', conversa: { status: 'assistente' } } })
    expect(canal.envios).toEqual([
      {
        telefone: '+5548999998888',
        texto: 'Oi, Joana! Aqui é Ana, da Fluxo Cargo. Tudo bem? Posso te fazer umas perguntas rápidas por aqui?',
      },
    ])
    expect(idas).toBe(0)
    expect(canal.mensagens.at(-1)).toMatchObject({ autor: 'assistente' })
    // A segunda abertura acha a conversa aberta.
    expect((await pedir(porta, { acao: 'iniciar', lead_id: leadId })).corpo).toMatchObject({ motivo: 'conversa_ativa' })
  })

  test('iniciar usa a abertura do WhatsApp publicada, com os marcadores do lead', async () => {
    const { porta, canal } = montar('operator', undefined, {
      ...AGENTE,
      aberturaDoWhatsapp: 'Olá {nome_do_lead}, da {empresa_do_lead}! {nome_do_agente} aqui, da {empresa}.',
    })
    await pedir(porta, { acao: 'iniciar', lead_id: await lead(canal) })
    // O lead não tem empresa: a preposição sai com o marcador.
    expect(canal.envios.map((envio) => envio.texto)).toEqual(['Olá Joana! Ana aqui, da Fluxo Cargo.'])
  })

  test('iniciar no modo de teste só vale para número da lista de teste', async () => {
    const { porta, canal } = montar()
    const leadId = await lead(canal)
    canal.modo = 'teste'
    const recusada = await pedir(porta, { acao: 'iniciar', lead_id: leadId })
    expect(recusada).toMatchObject({
      status: 409,
      corpo: { motivo: 'fora_do_modo_de_teste', mensagem: 'No modo de teste, a assistente só conversa com os números de teste da conta.' },
    })
    expect(canal.conversas.size).toBe(0)
    expect(canal.envios).toEqual([])

    canal.numerosDeTeste.add('+5548999998888')
    expect((await pedir(porta, { acao: 'iniciar', lead_id: leadId })).status).toBe(200)
  })

  test('iniciar sem assistente publicada não grava conversa nenhuma e manda publicar', async () => {
    const { porta, canal } = montar('admin', undefined, null)
    const resposta = await pedir(porta, { acao: 'iniciar', lead_id: await lead(canal) })
    expect(resposta).toMatchObject({ status: 409, corpo: { motivo: 'assistente_nao_publicada' } })
    expect(MENSAGENS_DO_ENVIO.assistente_nao_publicada).toMatch(/Publique a assistente/)
    expect(canal.conversas.size).toBe(0)
    expect(canal.envios).toEqual([])
  })

  test('toda frase de recusa diz o que fazer e nenhuma diz Sarah', () => {
    for (const frase of Object.values(MENSAGENS_DO_ENVIO)) {
      expect(frase.length).toBeGreaterThan(20)
      expect(frase).not.toMatch(/Sarah|—/)
    }
  })
})
