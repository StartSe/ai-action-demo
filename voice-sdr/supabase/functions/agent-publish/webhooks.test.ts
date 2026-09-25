// Provas do passo que garante os webhooks da ElevenLabs. O workspace é dublado
// e conta as idas: é o que prova que a segunda publicação sem mudança não
// recria o webhook de fim, e que a falha vira pendência em vez de exceção.

import { describe, expect, test } from 'vitest'

import { derivarSegredoDoInicio } from '../_shared/provedor/webhooks-da-conta.ts'

import { CAMINHO_DA_CONFIGURACAO_DE_CONVERSA, CAMINHO_DOS_WEBHOOKS } from './formato-do-provedor.ts'
import { MENSAGENS_DOS_WEBHOOKS } from './respostas.ts'
import { garantirWebhooks, type EntradaDosWebhooks } from './webhooks.ts'
import { criarWorkspaceDublado, idasCom, portaDoWorkspace, type WorkspaceDublado } from './workspace-dublado.ts'

const CONTA = '11111111-1111-4111-8111-111111111111'
const BASE = 'https://projeto.supabase.co/functions/v1'
const CHAVE_DO_SERVIDOR = 'chave-do-servidor-desta-instalacao'

async function entrada(ajustes: Partial<EntradaDosWebhooks> = {}): Promise<EntradaDosWebhooks> {
  return {
    contaId: CONTA,
    credencial: 'chave-da-elevenlabs-da-conta',
    origemDaCredencial: 'conta',
    enderecoDasFuncoes: BASE,
    segredoDoInicio: await derivarSegredoDoInicio(CHAVE_DO_SERVIDOR, CONTA),
    ...ajustes,
  }
}

async function garantir(workspace: WorkspaceDublado, ajustes: Partial<EntradaDosWebhooks> = {}) {
  return await garantirWebhooks(await entrada(ajustes), portaDoWorkspace(workspace))
}

const escritas = (workspace: WorkspaceDublado) =>
  workspace.idas.filter((ida) => ida.metodo !== 'GET').map((ida) => `${ida.metodo} ${ida.caminho}`)

describe('a primeira publicação cadastra os dois', () => {
  test('cria o webhook de fim, guarda o segredo e aponta a configuração para os dois endereços da conta', async () => {
    const workspace = criarWorkspaceDublado()
    const desfecho = await garantir(workspace)

    expect(desfecho.resultado).toEqual({ estado: 'cadastrados', motivo: null, mensagem: null })
    expect(escritas(workspace)).toEqual([`POST ${CAMINHO_DOS_WEBHOOKS}`, `PATCH ${CAMINHO_DA_CONFIGURACAO_DE_CONVERSA}`])

    const criacao = workspace.idas.find((ida) => ida.metodo === 'POST')
    expect(criacao?.corpo).toMatchObject({
      settings: { auth_type: 'hmac', webhook_url: `${BASE}/call-events?conta=${CONTA}` },
    })

    const guardado = workspace.cofre.get(CONTA)
    expect(guardado).toMatchObject({ id: 'wh_1', url: `${BASE}/call-events?conta=${CONTA}` })
    expect(guardado?.segredo).toMatch(/^wsec_/)

    expect(workspace.configuracao).toEqual({
      conversation_initiation_client_data_webhook: {
        url: `${BASE}/call-init?conta=${CONTA}`,
        request_headers: { 'x-sarah-webhook-secret': await derivarSegredoDoInicio(CHAVE_DO_SERVIDOR, CONTA) },
      },
      webhooks: { post_call_webhook_id: 'wh_1' },
    })
  })

  test('os segredos que passaram por aqui voltam para a conferência de vazamento', async () => {
    const workspace = criarWorkspaceDublado()
    const desfecho = await garantir(workspace)
    expect(desfecho.segredos).toContain(workspace.cofre.get(CONTA)?.segredo)
    expect(desfecho.segredos).toContain(await derivarSegredoDoInicio(CHAVE_DO_SERVIDOR, CONTA))
    expect(JSON.stringify(desfecho.resultado)).not.toContain('wsec_')
  })
})

describe('idempotência', () => {
  test('a segunda publicação sem mudança só lê: nenhum webhook novo, nenhuma escrita', async () => {
    const workspace = criarWorkspaceDublado()
    await garantir(workspace)
    const idasDaPrimeira = workspace.idas.length

    const segunda = await garantir(workspace)
    expect(segunda.resultado.estado).toBe('em_dia')
    expect(workspace.idas.slice(idasDaPrimeira).map((ida) => `${ida.metodo} ${ida.caminho}`)).toEqual([
      `GET ${CAMINHO_DA_CONFIGURACAO_DE_CONVERSA}`,
    ])
    expect(idasCom(workspace, 'POST', CAMINHO_DOS_WEBHOOKS)).toBe(1)
    expect(workspace.webhooks).toHaveLength(1)
  })

  test('configuração apontada para outro lugar com o webhook guardado vivo: reaponta, sem recriar', async () => {
    const workspace = criarWorkspaceDublado()
    await garantir(workspace)
    workspace.configuracao = { webhooks: { post_call_webhook_id: 'wh_de_outro' } }

    const desfecho = await garantir(workspace)
    expect(desfecho.resultado.estado).toBe('cadastrados')
    expect(idasCom(workspace, 'POST', CAMINHO_DOS_WEBHOOKS)).toBe(1)
    expect(idasCom(workspace, 'GET', CAMINHO_DOS_WEBHOOKS)).toBe(1)
    expect(workspace.configuracao).toMatchObject({ webhooks: { post_call_webhook_id: 'wh_1' } })
  })

  test('só o início fora do lugar: reaplica a configuração com o mesmo webhook de fim', async () => {
    const workspace = criarWorkspaceDublado()
    await garantir(workspace)
    workspace.configuracao = { ...workspace.configuracao, conversation_initiation_client_data_webhook: null }

    await garantir(workspace)
    expect(idasCom(workspace, 'POST', CAMINHO_DOS_WEBHOOKS)).toBe(1)
    expect(idasCom(workspace, 'PATCH', CAMINHO_DA_CONFIGURACAO_DE_CONVERSA)).toBe(2)
  })

  test('webhook guardado que sumiu do workspace: cria outro e troca o segredo guardado', async () => {
    const workspace = criarWorkspaceDublado()
    await garantir(workspace)
    const segredoAntigo = workspace.cofre.get(CONTA)?.segredo
    workspace.webhooks.splice(0)
    workspace.configuracao = {}

    await garantir(workspace)
    expect(idasCom(workspace, 'POST', CAMINHO_DOS_WEBHOOKS)).toBe(2)
    expect(workspace.cofre.get(CONTA)?.segredo).not.toBe(segredoAntigo)
    expect(workspace.configuracao).toMatchObject({ webhooks: { post_call_webhook_id: 'wh_1' } })
  })

  test('webhook guardado para outro endereço (projeto trocou de URL) não é reaproveitado', async () => {
    const workspace = criarWorkspaceDublado()
    await garantir(workspace, { enderecoDasFuncoes: 'https://antigo.supabase.co/functions/v1' })
    await garantir(workspace)
    expect(idasCom(workspace, 'POST', CAMINHO_DOS_WEBHOOKS)).toBe(2)
    expect(workspace.cofre.get(CONTA)?.url).toBe(`${BASE}/call-events?conta=${CONTA}`)
  })
})

describe('falha vira pendência, nunca exceção', () => {
  test.each([
    ['GET convai/settings', 'configuracao_ilegivel'],
    ['POST workspace/webhooks', 'aviso_de_fim_nao_criado'],
    ['PATCH convai/settings', 'configuracao_recusada'],
  ] as const)('%s falhou: %s', async (ida, motivo) => {
    const workspace = criarWorkspaceDublado()
    workspace.falhas.add(ida)
    const desfecho = await garantir(workspace)
    expect(desfecho.resultado).toEqual({ estado: 'falha', motivo, mensagem: MENSAGENS_DOS_WEBHOOKS[motivo] })
  })

  test('segredo que não foi guardado não é apontado na configuração', async () => {
    const workspace = criarWorkspaceDublado()
    workspace.cofreFalha = true
    const desfecho = await garantir(workspace)
    expect(desfecho.resultado.motivo).toBe('segredo_nao_guardado')
    expect(idasCom(workspace, 'PATCH', CAMINHO_DA_CONFIGURACAO_DE_CONVERSA)).toBe(0)
  })

  test('listagem ilegível não recria: é pendência', async () => {
    const workspace = criarWorkspaceDublado()
    await garantir(workspace)
    workspace.configuracao = {}
    workspace.falhas.add('GET workspace/webhooks')
    const desfecho = await garantir(workspace)
    expect(desfecho.resultado.estado).toBe('falha')
    expect(idasCom(workspace, 'POST', CAMINHO_DOS_WEBHOOKS)).toBe(1)
  })

  test('a frase é a do pedido do dono, e nenhuma cita código', () => {
    expect(MENSAGENS_DOS_WEBHOOKS.aviso_de_fim_nao_criado).toBe(
      'A assistente foi publicada, mas os avisos de fim de ligação não foram cadastrados na ElevenLabs. Publique de novo.',
    )
    for (const [motivo, frase] of Object.entries(MENSAGENS_DOS_WEBHOOKS)) {
      expect(frase).not.toContain(motivo)
      expect(frase).not.toMatch(/—/)
    }
  })
})

describe('chave da plataforma', () => {
  test('o workspace é da instalação: nada é lido nem escrito', async () => {
    const workspace = criarWorkspaceDublado()
    const desfecho = await garantir(workspace, { origemDaCredencial: 'plataforma' })
    expect(desfecho.resultado).toEqual({ estado: 'da_instalacao', motivo: null, mensagem: null })
    expect(workspace.idas).toEqual([])
  })
})
