import { describe, expect, test } from 'vitest'

import {
  agente,
  configuracaoDasConversas,
  conversa,
  CONVERSA_BOA,
  ERRO_DO_MODELO,
  FERRAMENTA_RECUSADA,
  PODE_SIM_E_DESLIGA,
  WEBHOOK_DE_INICIO_FALHO,
} from './conversas-de-exemplo.ts'
import {
  lerAgenteDoProvedor,
  lerConfiguracaoDasConversas,
  lerConversaDoProvedor,
  sentidoDoMotivo,
} from './formato-do-provedor.ts'
import { REGRAS, verificar, type CodigoDoAchado, type FatosDoDiagnostico } from './regras.ts'

function fatos(sobre: {
  conversa?: unknown
  agente?: unknown
  configuracao?: unknown
  chamada?: Partial<FatosDoDiagnostico['chamada']>
  publicacao?: FatosDoDiagnostico['publicacao']
  esperado?: Partial<FatosDoDiagnostico['esperado']>
  falhaDaConversa?: FatosDoDiagnostico['falhaDaConversa']
} = {}): FatosDoDiagnostico {
  const lidaConversa = sobre.conversa === null ? null : lerConversaDoProvedor(sobre.conversa ?? CONVERSA_BOA)
  const lidoAgente = sobre.agente === null ? null : lerAgenteDoProvedor(sobre.agente ?? agente())
  return {
    chamada: {
      id: 'c-1',
      status: 'ended',
      motivoDoFim: 'completed',
      direcao: 'outbound',
      duracaoSeg: 95,
      proposito: 'discovery',
      ...sobre.chamada,
    },
    publicacao: sobre.publicacao === undefined ? { agenteNoProvedor: 'agent_01jexemplo', status: 'publicado' } : sobre.publicacao,
    conversa: lidaConversa,
    falhaDaConversa: lidaConversa ? null : (sobre.falhaDaConversa ?? 'indisponivel'),
    agente: lidoAgente,
    falhaDoAgente: lidoAgente ? null : 'indisponivel',
    configuracaoDasConversas:
      sobre.configuracao === null ? null : lerConfiguracaoDasConversas(sobre.configuracao ?? configuracaoDasConversas()),
    esperado: { vozId: 'voz_marina', duracaoMaximaSeg: 600, ...sobre.esperado },
  }
}

function codigos(dados: FatosDoDiagnostico): CodigoDoAchado[] {
  return verificar(dados).map((achado) => achado.codigo)
}

/** Um caso positivo por regra: a tabela inteira tem prova. */
const CASOS: Record<(typeof REGRAS)[number]['codigo'], () => FatosDoDiagnostico> = {
  sem_publicacao: () => fatos({ publicacao: null }),
  conversa_indisponivel: () => fatos({ conversa: null }),
  agente_indisponivel: () => fatos({ agente: null }),
  conversa_falhou: () => fatos({ conversa: ERRO_DO_MODELO }),
  chamada_sem_fechamento: () => fatos({ chamada: { status: 'in_progress' } }),
  conversa_no_ar: () => fatos({ conversa: conversa({ status: 'in-progress' }) }),
  encerrada_por_erro_do_modelo: () => fatos({ conversa: ERRO_DO_MODELO }),
  falha_no_webhook_de_inicio: () => fatos({ conversa: WEBHOOK_DE_INICIO_FALHO }),
  encerrada_por_end_call_cedo: () => fatos({ conversa: PODE_SIM_E_DESLIGA }),
  encerrada_por_silencio: () => fatos({ conversa: conversa({ metadata: { termination_reason: 'Silence timeout reached' } }) }),
  encerrada_por_duracao_maxima: () => fatos({ conversa: conversa({ metadata: { termination_reason: 'Max duration exceeded' } }) }),
  desligada_pelo_lead: () => fatos(),
  ferramenta_com_erro: () => fatos({ conversa: FERRAMENTA_RECUSADA }),
  ferramenta_inexistente: () =>
    fatos({
      conversa: PODE_SIM_E_DESLIGA,
      agente: agente({ tools: [{ type: 'webhook', name: 'tool-dnc' }] }),
    }),
  marcador_cru_na_primeira_fala: () => fatos({ agente: agente({ firstMessage: 'Oi, {nome_do_lead}! Aqui é a Sarah.' }) }),
  marcador_cru_na_fala: () => fatos({ conversa: WEBHOOK_DE_INICIO_FALHO }),
  variavel_sem_valor: () => fatos({ agente: agente({ prompt: 'Chame o lead de {{nome_do_lead}}.' }) }),
  idioma_diferente_de_pt: () => fatos({ agente: agente({ language: 'en' }) }),
  conversa_curta_encerrada_pela_sarah: () => fatos({ conversa: PODE_SIM_E_DESLIGA }),
  tempo_de_turno_curto: () => fatos({ agente: agente({ turn: { turn_timeout: 1 } }) }),
  silencio_encerra_cedo: () => fatos({ agente: agente({ turn: { silence_end_call_timeout: 5 } }) }),
  configuracao_viva_divergente: () => fatos({ esperado: { vozId: 'voz_outra' } }),
  webhooks_ausentes: () => fatos({ configuracao: configuracaoDasConversas({ inicioUrl: null }) }),
}

describe('a tabela de regras', () => {
  test('toda regra tem código único, título, sugestão e severidade conhecida', () => {
    const vistos = new Set<string>()
    for (const regra of REGRAS) {
      expect(vistos.has(regra.codigo), regra.codigo).toBe(false)
      vistos.add(regra.codigo)
      expect(regra.titulo.trim()).not.toBe('')
      expect(regra.sugestao.trim()).not.toBe('')
      expect(['erro', 'aviso', 'info']).toContain(regra.severidade)
      // Registro de interface: sem travessão (docs/padrao-de-interface.md seção 4).
      expect(`${regra.titulo} ${regra.sugestao}`).not.toMatch(/—/)
    }
  })

  test.each(REGRAS.map((regra) => regra.codigo))('%s tem um caso que a dispara', (codigo) => {
    const achado = verificar(CASOS[codigo]()).find((item) => item.codigo === codigo)
    expect(achado, codigo).toBeDefined()
    expect(achado?.evidencia.trim()).not.toBe('')
  })

  test('a conversa boa, com agente e avisos em ordem, não acusa erro nem aviso', () => {
    const graves = verificar(fatos()).filter((achado) => achado.severidade !== 'info')
    expect(graves).toEqual([])
  })

  test('os achados saem do mais grave para o mais leve', () => {
    const achados = verificar(fatos({ conversa: PODE_SIM_E_DESLIGA, agente: agente({ turn: { turn_timeout: 1 } }) }))
    const pesos = achados.map((achado) => ({ erro: 0, aviso: 1, info: 2 })[achado.severidade])
    expect(pesos).toEqual([...pesos].sort((a, b) => a - b))
  })
})

describe('a ligação do "pode sim"', () => {
  test('acusa end_call cedo com a fala do lead, a razão e o motivo do provedor na evidência', () => {
    const achado = verificar(fatos({ conversa: PODE_SIM_E_DESLIGA })).find(
      (item) => item.codigo === 'encerrada_por_end_call_cedo',
    )
    expect(achado?.severidade).toBe('erro')
    expect(achado?.evidencia).toContain('"Pode sim."')
    expect(achado?.evidencia).toContain('O lead confirmou.')
    expect(achado?.evidencia).toContain('end_call tool was called.')
  })

  test('não acusa end_call cedo quando o lead falou mais de duas vezes', () => {
    const longa = conversa({
      transcript: [
        { role: 'agent', message: 'Oi!', time_in_call_secs: 0 },
        { role: 'user', message: 'Oi.', time_in_call_secs: 2 },
        { role: 'user', message: 'Pode falar.', time_in_call_secs: 4 },
        { role: 'user', message: 'Não tenho interesse.', time_in_call_secs: 6 },
        { role: 'agent', message: '', time_in_call_secs: 8, tool_calls: [{ tool_name: 'end_call' }] },
      ],
      metadata: { termination_reason: 'end_call tool was called.' },
    })
    expect(codigos(fatos({ conversa: longa }))).not.toContain('encerrada_por_end_call_cedo')
  })
})

describe('marcadores e variáveis', () => {
  test('chaves duplas com valor na conversa não são marcador cru', () => {
    const dados = fatos({
      agente: agente({ firstMessage: 'Oi, {{call_id}}!', prompt: 'Ligação {{call_id}} de {{system__caller_id}}.' }),
    })
    expect(codigos(dados)).not.toContain('marcador_cru_na_primeira_fala')
    expect(codigos(dados)).not.toContain('variavel_sem_valor')
  })

  test('valor inicial declarado no agente cobre a variável', () => {
    const dados = fatos({
      agente: agente({ prompt: 'Transfira para {{numero_de_transferencia}}.', placeholders: { numero_de_transferencia: '' } }),
    })
    expect(codigos(dados)).not.toContain('variavel_sem_valor')
  })

  test('a primeira fala sobreposta pelo início também é conferida', () => {
    const sobreposta = conversa({
      inicio: {
        dynamic_variables: { call_id: 'x' },
        conversation_config_override: { agent: { first_message: 'Oi, {nome_do_lead}!' } },
      },
    })
    const achado = verificar(fatos({ conversa: sobreposta })).find((item) => item.codigo === 'marcador_cru_na_primeira_fala')
    expect(achado?.evidencia).toContain('sobreposta')
    expect(achado?.alvo).toBe('identidade.primeira_fala')
  })
})

describe('o que as regras não sabem, não concluem', () => {
  test('sem o bloco de início, o webhook não é acusado pela falta de call_id', () => {
    expect(codigos(fatos({ conversa: conversa({ inicio: null }) }))).not.toContain('falha_no_webhook_de_inicio')
  })

  test('ferramenta cadastrada por referência sem nome impede a conclusão de inexistente', () => {
    const dados = fatos({
      conversa: PODE_SIM_E_DESLIGA,
      agente: agente({ tools: [], toolIds: ['tool_abc'] }),
    })
    expect(codigos(dados)).not.toContain('ferramenta_inexistente')
  })

  test('sem conversa, nenhuma regra de encerramento fala', () => {
    const lista = codigos(fatos({ conversa: null }))
    expect(lista).toContain('conversa_indisponivel')
    for (const codigo of ['encerrada_por_end_call_cedo', 'encerrada_por_erro_do_modelo', 'desligada_pelo_lead'] as const) {
      expect(lista).not.toContain(codigo)
    }
  })

  test('aviso de início desligado no agente não exige o endereço de call-init', () => {
    const dados = fatos({
      agente: agente({ webhookDeInicio: false }),
      configuracao: configuracaoDasConversas({ inicioUrl: null }),
    })
    expect(codigos(dados)).not.toContain('webhooks_ausentes')
  })

  test('aviso de fim ausente acusa mesmo com o de início em ordem', () => {
    const achado = verificar(fatos({ configuracao: configuracaoDasConversas({ posChamadaId: null }) })).find(
      (item) => item.codigo === 'webhooks_ausentes',
    )
    expect(achado?.evidencia).toContain('aviso de fim')
  })
})

describe('o sentido do motivo do provedor (C3)', () => {
  test.each([
    ['end_call tool was called.', 'end_call'],
    ['LLM error', 'erro_do_modelo'],
    ['Conversation initiation webhook failed', 'webhook_de_inicio'],
    ['Silence timeout reached', 'silencio'],
    ['Max duration exceeded', 'duracao_maxima'],
    ['Call ended by remote party', 'desligado_pelo_lead'],
    ['Client disconnected: 1000', 'desligado_pelo_lead'],
    ['algo que ninguém previu', null],
  ])('"%s" é %s', (motivo, sentido) => {
    expect(sentidoDoMotivo(motivo)).toBe(sentido)
  })
})
