import { describe, expect, test } from 'vitest'

import { agente, AGENTE_DE_EXEMPLO, CONVERSA_DE_EXEMPLO, ERRO_DO_MODELO } from './conversas-de-exemplo.ts'
import { atenderDiagnostico, type CorpoDoDiagnostico, type PedidoDaBorda } from './diagnostico.ts'
import { caminhoDaConversa, caminhoDoAgente } from './formato-do-provedor.ts'
import {
  CHAVE_DA_VOZ_DE_EXEMPLO,
  criarPortaEmMemoria,
  provedorDeExemplo,
  USUARIO_DE_EXEMPLO,
  type OpcoesDaPortaEmMemoria,
} from './porta-em-memoria.ts'
import { AVISOS_DO_MODELO, MENSAGENS } from './respostas.ts'

const PEDIDO: PedidoDaBorda = {
  metodo: 'POST',
  autorizacao: 'Bearer jwt-do-admin',
  contaId: 'conta-a',
  chamadaId: 'chamada-1',
}

async function analisar(opcoes: OpcoesDaPortaEmMemoria = {}, pedido: Partial<PedidoDaBorda> = {}) {
  const memoria = criarPortaEmMemoria(opcoes)
  const resposta = await atenderDiagnostico({ ...PEDIDO, ...pedido }, memoria.porta)
  return { ...memoria, resposta }
}

function diagnosticoDe(corpo: CorpoDoDiagnostico) {
  if (!corpo.ok) throw new Error(`recusado: ${corpo.motivo}`)
  return corpo.diagnostico
}

describe('a ligação do "pode sim"', () => {
  test('lê os três lados da ElevenLabs com a chave da conta e grava o diagnóstico', async () => {
    const { resposta, consultas, gravados } = await analisar()
    expect(resposta.status).toBe(201)
    expect(consultas).toEqual([
      caminhoDaConversa(CONVERSA_DE_EXEMPLO),
      caminhoDoAgente(AGENTE_DE_EXEMPLO),
      'convai/settings',
    ])

    const diagnostico = diagnosticoDe(resposta.corpo)
    expect(diagnostico.achados.map((achado) => achado.codigo)).toContain('encerrada_por_end_call_cedo')
    expect(diagnostico.causaProvavel).toContain('pode sim')
    expect(diagnostico.estadoDoModelo).toBe('ok')
    expect(diagnostico.resumo).toMatchObject({
      conversa_id: CONVERSA_DE_EXEMPLO,
      agente_id: AGENTE_DE_EXEMPLO,
      motivo_do_fim: 'end_call tool was called.',
    })

    expect(gravados).toHaveLength(1)
    expect(gravados[0]).toMatchObject({ account_id: 'conta-a', call_id: 'chamada-1', created_by: USUARIO_DE_EXEMPLO })
  })

  test('a proposta válida do modelo fica, com o antes do banco; a inventada vira achado sem proposta', async () => {
    const diagnostico = diagnosticoDe((await analisar()).resposta.corpo)
    expect(diagnostico.propostas).toHaveLength(1)
    expect(diagnostico.propostas[0]).toMatchObject({
      alvo: 'roteiro.discovery',
      antes: '1. Cumprimente.\n2. Pergunte pela frota.\n3. Encerre quando o lead aceitar.',
      estado: 'pendente',
      origem: 'modelo',
    })
    const recusada = diagnostico.achados.find((achado) => achado.codigo === 'proposta_recusada')
    expect(recusada?.titulo).toContain('Alvo inventado')
    expect(recusada?.alvo).toBeNull()
  })

  test('o pedido ao modelo leva os fatos, e o registro o guarda só sob prompt', async () => {
    const { pedidosAoModelo, eventos } = await analisar()
    expect(pedidosAoModelo[0]?.mensagem).toContain('Pode sim.')
    expect(pedidosAoModelo[0]?.mensagem).toContain('end_call tool was called.')

    const doModelo = eventos.find((evento) => evento.provider === 'modelo')
    expect(doModelo?.request.prompt).toBe(pedidosAoModelo[0]?.mensagem)
    const semPrompt = { ...doModelo?.request, prompt: undefined }
    expect(JSON.stringify(semPrompt)).not.toContain('Pode sim')

    // As idas à ElevenLabs entram no rastro pelo resumo, com a chamada como correlação.
    const daVoz = eventos.filter((evento) => evento.provider === 'voz')
    expect(daVoz).toHaveLength(3)
    expect(daVoz.every((evento) => evento.correlation_id === 'chamada-1')).toBe(true)
    expect(JSON.stringify(eventos)).not.toContain(CHAVE_DA_VOZ_DE_EXEMPLO)
  })
})

describe('sem modelo, o diagnóstico sai assim mesmo', () => {
  test.each([
    ['sem_credencial', 'nao_conectado'],
    [null, 'indisponivel'],
    ['isto não é json', 'ilegivel'],
  ] as const)('modelo %s grava os achados com model_status %s', async (modelo, estado) => {
    const { resposta, gravados } = await analisar({ modelo })
    const diagnostico = diagnosticoDe(resposta.corpo)
    expect(resposta.status).toBe(201)
    expect(diagnostico.estadoDoModelo).toBe(estado)
    expect(diagnostico.avisoDoModelo).toBe(AVISOS_DO_MODELO[estado])
    expect(diagnostico.diagnostico).toBeNull()
    expect(diagnostico.achados.length).toBeGreaterThan(0)
    expect(gravados[0]?.model_status).toBe(estado)
  })

  test('sem modelo conectado, o aviso aponta para Integrações', async () => {
    const diagnostico = diagnosticoDe((await analisar({ modelo: 'sem_credencial' })).resposta.corpo)
    expect(diagnostico.caminhoDoAviso).toBe('/config/integracoes')
  })
})

describe('as regras propõem publicar quando é isso que corrige', () => {
  test('erro do modelo do agente vira proposta de republicar, de origem regra', async () => {
    const provedor = provedorDeExemplo({ [caminhoDaConversa(CONVERSA_DE_EXEMPLO)]: ERRO_DO_MODELO })
    const diagnostico = diagnosticoDe((await analisar({ provedor, modelo: 'sem_credencial' })).resposta.corpo)
    expect(diagnostico.propostas).toEqual([
      expect.objectContaining({ alvo: 'republicar', origem: 'regra', antes: null, depois: null }),
    ])
  })

  test('agente no ar em inglês pede publicação', async () => {
    const provedor = provedorDeExemplo({ [caminhoDoAgente(AGENTE_DE_EXEMPLO)]: agente({ language: 'en' }) })
    const diagnostico = diagnosticoDe((await analisar({ provedor, modelo: 'sem_credencial' })).resposta.corpo)
    expect(diagnostico.achados.map((achado) => achado.codigo)).toContain('idioma_diferente_de_pt')
    expect(diagnostico.propostas.map((proposta) => proposta.alvo)).toEqual(['republicar'])
  })
})

describe('o que falta do provedor vira achado, não recusa', () => {
  test('sem chave da ElevenLabs, nada é consultado e o achado diz por quê', async () => {
    const { resposta, consultas } = await analisar({ semChave: true, modelo: 'sem_credencial' })
    const diagnostico = diagnosticoDe(resposta.corpo)
    expect(consultas).toEqual([])
    const achado = diagnostico.achados.find((item) => item.codigo === 'conversa_indisponivel')
    expect(achado?.evidencia).toContain('chave da ElevenLabs')
  })

  test('chave recusada pelo provedor', async () => {
    const provedor = provedorDeExemplo({ [caminhoDaConversa(CONVERSA_DE_EXEMPLO)]: 401 })
    const diagnostico = diagnosticoDe((await analisar({ provedor })).resposta.corpo)
    expect(diagnostico.achados.find((item) => item.codigo === 'conversa_indisponivel')?.evidencia).toContain('recusou')
  })

  test('sem identificador da conversa, o agente é lido pela publicação', async () => {
    const { consultas } = await analisar({ chamada: { provider_conversation_id: null } })
    expect(consultas).toEqual([caminhoDoAgente(AGENTE_DE_EXEMPLO), 'convai/settings'])
  })

  test('o agente consultado é o da conversa, e não o da publicação de hoje', async () => {
    const { consultas } = await analisar({ publicacao: { provider_agent_id: 'agent_novo', status: 'publicado' } })
    expect(consultas).toContain(caminhoDoAgente(AGENTE_DE_EXEMPLO))
    expect(consultas).not.toContain(caminhoDoAgente('agent_novo'))
  })

  test('registro de integração que falha não derruba a análise', async () => {
    const { resposta } = await analisar({ registroFalha: true })
    expect(resposta.status).toBe(201)
    expect(resposta.corpo.ok && resposta.corpo.semRegistro).toBe(true)
  })
})

describe('quem pode pedir', () => {
  test.each([
    [{ metodo: 'GET' }, {}, 405, 'metodo_invalido'],
    [{ contaId: '' }, {}, 400, 'conta_ausente'],
    [{ autorizacao: null }, {}, 401, 'sem_sessao'],
    [{ chamadaId: ' ' }, {}, 400, 'chamada_ausente'],
    [{ autorizacao: 'Bearer invalido' }, {}, 401, 'sessao_invalida'],
    [{}, { papel: null }, 403, 'sem_acesso'],
    [{}, { papel: 'operator' }, 403, 'papel_insuficiente'],
    [{}, { chamada: null }, 404, 'chamada_inexistente'],
  ] as const)('%o com %o é %i %s', async (pedido, opcoes, status, motivo) => {
    const { resposta, consultas, gravados } = await analisar(opcoes as OpcoesDaPortaEmMemoria, pedido)
    expect(resposta.status).toBe(status)
    expect(resposta.corpo).toEqual({ ok: false, motivo, mensagem: MENSAGENS[motivo] })
    expect(consultas).toEqual([])
    expect(gravados).toEqual([])
  })

  test('a chave que o provedor ecoar no corpo derruba a resposta em vez de vazar', async () => {
    const provedor = provedorDeExemplo({
      [caminhoDaConversa(CONVERSA_DE_EXEMPLO)]: {
        status: 'done',
        agent_id: AGENTE_DE_EXEMPLO,
        metadata: { termination_reason: `chave ${CHAVE_DA_VOZ_DE_EXEMPLO} recusada` },
        transcript: [],
      },
    })
    const { resposta, gravados } = await analisar({ provedor, modelo: 'sem_credencial' })
    expect(resposta.status).toBe(500)
    expect(gravados).toEqual([])
    expect(JSON.stringify(resposta.corpo)).not.toContain(CHAVE_DA_VOZ_DE_EXEMPLO)
  })
})
