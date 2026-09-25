// Provas do caminho único de discagem. Ambiente node, sem rede e sem banco: a
// guarda, o provedor e a camada de dados são dublados, e os dublês **contam as
// chamadas** — sem a contagem, uma versão que discasse na recusa passaria verde
// em qualquer asserção sobre o corpo da resposta.
//
// O que este arquivo segura:
//
// 1. **Os dois portões de T-04**, e as duas travessias entre eles. Sessão de
//    usuário só disca `manual`; segredo interno só disca o que não é `manual`.
//    Sem as duas recusas, o caminho único existiria no nome e não no efeito.
// 2. **Recusa da guarda não consome crédito.** É a metade de borda do quarto
//    critério de aceite da F2, e a prova é o dublê do provedor não ter sido
//    chamado nenhuma vez — asserção sobre o 409 passaria igual numa versão que
//    discasse antes de olhar a decisão.
// 3. **Só `call_id` viaja** (T-25). O lead do cenário tem nome, e o nome é
//    procurado no pedido serializado: é ele que uma segunda fonte de contexto
//    levaria junto.
// 4. **A linha sobrevive à falha do provedor** (T-07). A chamada fica gravada,
//    `queued` e sem identificador do provedor, e é isso que dá a
//    `cron-call-recovery` o que fechar.

import { describe, expect, test } from 'vitest'

import type { ResolucaoDeSegredo } from '../_shared/secrets.ts'
import { VALOR_INICIAL_DA_VARIAVEL, VARIAVEIS_DA_CHAMADA } from '../_shared/agente/compilador.ts'
import { chaveDeDiscagem } from '../_shared/chamada/idempotencia.ts'
import type { ChamadaDaGuarda, RespostaDaGuarda } from '../_shared/discagem/guarda.ts'

import {
  CHAVE_DO_PROVEDOR_DE_VOZ,
  PROVEDOR_DE_VOZ,
  VARIAVEIS_DINAMICAS,
  colocarChamada,
  montarChave,
  type CorpoDaDiscagem,
  type CorpoDeRecusa,
  type EventoDeIntegracao,
  type LinhaDeAuditoria,
  type LinhaDeChamada,
  type PedidoDaBorda,
  type PedidoDeDisparo,
  type PortaDaDiscagem,
  type RespostaDaDiscagem,
} from './discagem.ts'
import { MENSAGENS } from './respostas.ts'

const CONTA = '11111111-1111-4111-8111-111111111111'
const USUARIO = '22222222-2222-4222-8222-222222222222'
const LEAD = '33333333-3333-4333-8333-333333333333'
const LINHA = '44444444-4444-4444-8444-444444444444'
const PUBLICACAO = '55555555-5555-4555-8555-555555555555'
const VERSAO = '66666666-6666-4666-8666-666666666666'
const CHAMADA = '77777777-7777-4777-8777-777777777777'
const UUID_DO_CLIENTE = '88888888-8888-4888-8888-888888888888'
const REUNIAO = '99999999-9999-4999-8999-999999999999'

const AUTORIZACAO = 'Bearer jwt-de-quem-disca'
const SEGREDO_INTERNO = 'segredo-interno-desta-instalacao'
const CHAVE_DA_VOZ = 'chave-do-provedor-de-voz-que-nao-pode-sair'
const NUMERO_NA_VOZ = 'phnum_0001'
const SID_DA_CHAMADA = 'CA0000000000000000000000000000001'

const NOME_DO_LEAD = 'Marina Quintanilha'
const TELEFONE_DO_LEAD = '+5548999990001'
const NUMERO_DE_ORIGEM = '+554832000000'
const AGORA = '2026-09-22T14:00:00.000Z'

/** Os quatro identificadores de publicação, um por propósito (T-01). */
const PUBLICACAO_POR_PROPOSITO: Readonly<Record<string, string>> = {
  discovery: 'pub-discovery',
  reminder: 'pub-reminder',
  rescue: 'pub-rescue',
  followup: 'pub-followup',
}

interface AjustesDaBancada {
  /** Os números da lista de teste da conta. */
  readonly numerosDeTeste?: readonly string[]
  readonly papel?: string | null
  readonly usuario?: { readonly id: string } | null
  readonly conta?: { readonly id: string; readonly timezone: string } | null
  readonly lead?: { readonly id: string; readonly phone_e164: string | null; readonly name: string | null } | null
  readonly publicacao?: { readonly id: string; readonly provider_agent_id: string } | null
  readonly versao?: { readonly id: string } | null
  readonly linha?: { readonly id: string; readonly e164: string; readonly provider_voice_id: string | null } | null
  readonly guarda?: RespostaDaGuarda
  readonly guardaLevanta?: boolean
  readonly credencial?: 'ok' | 'ausente' | 'plataforma_bloqueada'
  /** A chamada já existe: o insert colide com o único de T-07. */
  readonly chamadaExistente?: { readonly id: string; readonly status: string; readonly provider_call_sid: string | null }
  readonly disparoFalha?: { readonly codigo: string | null; readonly status: number | null }
  readonly eventoFalha?: boolean
  readonly identidade?: { readonly nome: string; readonly empresa: string; readonly primeiraFala: string | null } | null
}

interface Bancada {
  readonly porta: PortaDaDiscagem
  readonly guardas: ChamadaDaGuarda[]
  readonly gravadas: LinhaDeChamada[]
  readonly disparos: PedidoDeDisparo[]
  readonly trilha: LinhaDeAuditoria[]
  readonly eventos: EventoDeIntegracao[]
  readonly disparosGravados: { chamadaId: string; providerCallSid: string }[]
  readonly propositosConsultados: string[]
}

const GUARDA_LIBERADA: RespostaDaGuarda = {
  allowed: true,
  reason: 'placed',
  dados: { from_number: NUMERO_DE_ORIGEM, phone_e164: TELEFONE_DO_LEAD },
  phone_line_id: LINHA,
}

function bancada(ajustes: AjustesDaBancada = {}): Bancada {
  const guardas: ChamadaDaGuarda[] = []
  const gravadas: LinhaDeChamada[] = []
  const disparos: PedidoDeDisparo[] = []
  const trilha: LinhaDeAuditoria[] = []
  const eventos: EventoDeIntegracao[] = []
  const disparosGravados: { chamadaId: string; providerCallSid: string }[] = []
  const propositosConsultados: string[] = []

  const porta: PortaDaDiscagem = {
    async usuarioDaSessao() {
      return ajustes.usuario === undefined ? { id: USUARIO } : ajustes.usuario
    },

    async papelNaConta() {
      return ajustes.papel === undefined ? 'operator' : ajustes.papel
    },

    async contaDaDiscagem() {
      return ajustes.conta === undefined
        ? { id: CONTA, timezone: 'America/Sao_Paulo' }
        : ajustes.conta
    },

    async leadDaConta() {
      return ajustes.lead === undefined
        ? { id: LEAD, phone_e164: TELEFONE_DO_LEAD, name: NOME_DO_LEAD }
        : ajustes.lead
    },

    async identidadeDaConta() {
      return ajustes.identidade === undefined
        ? { nome: 'Sarah', empresa: 'Fábrica de Parafusos', primeiraFala: null }
        : ajustes.identidade
    },

    async politicaDaConta() {
      return { gravacaoLigada: true, avisoDeGravacao: null }
    },

    async publicacaoDoProposito(_contaId, proposito) {
      propositosConsultados.push(proposito)
      if (ajustes.publicacao !== undefined) return ajustes.publicacao
      const providerAgentId = PUBLICACAO_POR_PROPOSITO[proposito]
      return providerAgentId ? { id: PUBLICACAO, provider_agent_id: providerAgentId } : null
    },

    async versaoPublicadaDoPlaybook() {
      return ajustes.versao === undefined ? { id: VERSAO } : ajustes.versao
    },

    async linhaTelefonica() {
      return ajustes.linha === undefined
        ? { id: LINHA, e164: NUMERO_DE_ORIGEM, provider_voice_id: NUMERO_NA_VOZ }
        : ajustes.linha
    },

    async ehNumeroDeTeste(_contaId, telefone) {
      return (ajustes.numerosDeTeste ?? []).includes(telefone)
    },

    async guardDial(chamada) {
      guardas.push(chamada)
      if (ajustes.guardaLevanta) throw new Error('guard_dial fora do ar')
      return ajustes.guarda ?? GUARDA_LIBERADA
    },

    async gravarChamada(linha) {
      if (ajustes.chamadaExistente) {
        return { criada: false, chamada: ajustes.chamadaExistente }
      }
      gravadas.push(linha)
      return {
        criada: true,
        chamada: { id: CHAMADA, status: 'queued', provider_call_sid: null },
      }
    },

    async registrarAuditoria(linha) {
      trilha.push(linha)
    },

    async credencial(): Promise<ResolucaoDeSegredo> {
      if (ajustes.credencial === 'ausente') return { ok: false, motivo: 'ausente' }
      if (ajustes.credencial === 'plataforma_bloqueada') {
        return { ok: false, motivo: 'plataforma_bloqueada' }
      }
      return { ok: true, valor: CHAVE_DA_VOZ, origem: 'conta' }
    },

    async dispararNoProvedor(pedido) {
      disparos.push(pedido)
      if (ajustes.disparoFalha) {
        return {
          ok: false,
          codigo: ajustes.disparoFalha.codigo,
          status: ajustes.disparoFalha.status,
          latenciaMs: 12,
          endpoint: 'convai/twilio/outbound-call',
        }
      }
      return {
        ok: true,
        providerCallSid: SID_DA_CHAMADA,
        providerConversationId: 'conv_0001',
        status: 200,
        latenciaMs: 12,
        corpo: { success: true },
        endpoint: 'convai/twilio/outbound-call',
      }
    },

    async gravarDisparo(disparo) {
      disparosGravados.push({
        chamadaId: disparo.chamadaId,
        providerCallSid: disparo.providerCallSid,
      })
    },

    async registrarEventoDeIntegracao(evento) {
      if (ajustes.eventoFalha) throw new Error('integration_events fora do ar')
      eventos.push(evento)
    },
  }

  return { porta, guardas, gravadas, disparos, trilha, eventos, disparosGravados, propositosConsultados }
}

/** O pedido de quem clica no discador. */
function pedidoDeGente(ajustes: Partial<PedidoDaBorda> = {}): PedidoDaBorda {
  return {
    metodo: 'POST',
    contaId: CONTA,
    proposito: 'discovery',
    fonte: 'manual',
    referencia: UUID_DO_CLIENTE,
    ordinal: null,
    telefone: null,
    leadId: LEAD,
    campanhaId: null,
    pular: null,
    motivo: 'primeira ligação de teste',
    autorizacao: AUTORIZACAO,
    segredoInterno: null,
    ...ajustes,
  }
}

/** O pedido de uma rotina, com o segredo interno e a fonte dela. */
function pedidoDeRotina(ajustes: Partial<PedidoDaBorda> = {}): PedidoDaBorda {
  return pedidoDeGente({
    fonte: 'stl',
    referencia: LEAD,
    autorizacao: null,
    segredoInterno: SEGREDO_INTERNO,
    ...ajustes,
  })
}

async function discar(
  pedido: PedidoDaBorda,
  porta: PortaDaDiscagem,
): Promise<RespostaDaDiscagem> {
  return await colocarChamada(pedido, porta, { segredoInterno: SEGREDO_INTERNO, agora: AGORA })
}

function sucesso(resposta: RespostaDaDiscagem): CorpoDaDiscagem {
  expect(resposta.corpo.ok).toBe(true)
  return resposta.corpo as CorpoDaDiscagem
}

function recusa(resposta: RespostaDaDiscagem): CorpoDeRecusa {
  expect(resposta.corpo.ok).toBe(false)
  return resposta.corpo as CorpoDeRecusa
}

describe('os dois portões de T-04', () => {
  test('sessão de operador disca como user, com o próprio identificador', async () => {
    const teste = bancada()
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(resposta.status).toBe(200)
    expect(sucesso(resposta).estado).toBe('discando')
    expect(teste.guardas[0]?.p_actor).toBe('user')
    expect(teste.guardas[0]?.p_actor_id).toBe(USUARIO)
    expect(teste.guardas[0]?.p_source).toBe('manual')
    expect(teste.trilha[0]?.actor).toBe('user')
    expect(teste.trilha[0]?.actor_id).toBe(USUARIO)
  })

  test('segredo interno disca como system, sem identificador de gente', async () => {
    const teste = bancada()
    const resposta = await discar(pedidoDeRotina(), teste.porta)

    expect(resposta.status).toBe(200)
    expect(teste.guardas[0]?.p_actor).toBe('system')
    expect(teste.guardas[0]?.p_actor_id).toBeNull()
    // A fonte é o nome da rotina que discou: é o que separa, na auditoria, uma
    // ligação de speed-to-lead de um clique no discador.
    expect(teste.guardas[0]?.p_source).toBe('stl')
    expect(teste.trilha[0]?.actor).toBe('system')
    expect(teste.trilha[0]?.actor_id).toBeNull()
    expect(teste.trilha[0]?.payload.dial_source).toBe('stl')
  })

  test('a rotina não precisa de sessão nenhuma, e a sessão nem é lida', async () => {
    let lidas = 0
    const teste = bancada()
    const porta: PortaDaDiscagem = {
      ...teste.porta,
      async usuarioDaSessao(jwt) {
        lidas += 1
        return await teste.porta.usuarioDaSessao(jwt)
      },
    }

    const resposta = await discar(
      pedidoDeRotina({ autorizacao: 'Bearer jwt-de-alguem-que-passou-junto' }),
      porta,
    )

    expect(resposta.status).toBe(200)
    // Com o cabeçalho interno, o portão é um só: herdar o papel de quem por
    // acaso mandou um JWT junto faria a rotina discar com a autoria errada.
    expect(lidas).toBe(0)
  })

  test('gente não disca fonte de rotina', async () => {
    const teste = bancada()
    const resposta = await discar(pedidoDeGente({ fonte: 'cad', referencia: LEAD, ordinal: 2 }), teste.porta)

    expect(resposta.status).toBe(403)
    expect(recusa(resposta).motivo).toBe('fonte_de_rotina')
    expect(teste.guardas).toHaveLength(0)
    expect(teste.disparos).toHaveLength(0)
  })

  test('rotina não disca como se fosse gente', async () => {
    const teste = bancada()
    const resposta = await discar(
      pedidoDeRotina({ fonte: 'manual', referencia: UUID_DO_CLIENTE }),
      teste.porta,
    )

    expect(resposta.status).toBe(403)
    expect(recusa(resposta).motivo).toBe('fonte_de_gente')
    expect(teste.guardas).toHaveLength(0)
  })

  test('segredo interno errado recusa, e não cai para a sessão', async () => {
    const teste = bancada()
    const resposta = await colocarChamada(
      pedidoDeRotina({ segredoInterno: 'segredo-interno-desta-instalacaO' }),
      teste.porta,
      { segredoInterno: SEGREDO_INTERNO, agora: AGORA },
    )

    expect(resposta.status).toBe(401)
    expect(recusa(resposta).motivo).toBe('segredo_interno_invalido')
    expect(teste.guardas).toHaveLength(0)
  })

  test('instalação sem segredo interno fecha o portão das rotinas, em vez de abrir', async () => {
    const teste = bancada()
    const resposta = await colocarChamada(pedidoDeRotina(), teste.porta, {
      segredoInterno: '',
      agora: AGORA,
    })

    expect(resposta.status).toBe(401)
    expect(recusa(resposta).motivo).toBe('segredo_interno_invalido')
  })

  test('sem sessão e sem segredo, ninguém disca', async () => {
    const teste = bancada()
    const resposta = await discar(pedidoDeGente({ autorizacao: null }), teste.porta)

    expect(resposta.status).toBe(401)
    expect(recusa(resposta).motivo).toBe('sem_sessao')
    expect(teste.guardas).toHaveLength(0)
  })

  test('viewer não disca', async () => {
    const teste = bancada({ papel: 'viewer' })
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(resposta.status).toBe(403)
    expect(recusa(resposta).motivo).toBe('papel_insuficiente')
    expect(recusa(resposta).mensagem).toBe(MENSAGENS.papel_insuficiente)
    expect(teste.guardas).toHaveLength(0)
    expect(teste.disparos).toHaveLength(0)
  })

  test('quem não é da conta recebe sem_acesso, e não papel_insuficiente', async () => {
    const teste = bancada({ papel: null })
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(resposta.status).toBe(403)
    expect(recusa(resposta).motivo).toBe('sem_acesso')
  })

  test('pular passo da guarda é da rotina, não de quem clica', async () => {
    const teste = bancada()
    const daTela = await discar(pedidoDeGente({ pular: ['min_interval'] }), teste.porta)
    expect(daTela.status).toBe(403)
    expect(recusa(daTela).motivo).toBe('pulo_sem_rotina')

    const outra = bancada()
    const daRotina = await discar(
      pedidoDeRotina({ fonte: 'camp', referencia: LEAD, ordinal: 1, pular: ['min_interval'] }),
      outra.porta,
    )
    expect(daRotina.status).toBe(200)
    expect(outra.guardas[0]?.p_bypass).toEqual(['min_interval'])
  })

  test('número de teste da conta, ligado à mão, não espera o intervalo nem o teto por número', async () => {
    const teste = bancada({ numerosDeTeste: [TELEFONE_DO_LEAD] })
    const resposta = await discar(pedidoDeGente({ leadId: null, telefone: TELEFONE_DO_LEAD }), teste.porta)
    expect(resposta.status).toBe(200)
    expect(teste.guardas[0]?.p_bypass).toEqual(['min_interval', 'daily_per_number'])

    // Número fora da lista segue a política inteira.
    const outra = bancada({ numerosDeTeste: ['+5511999990000'] })
    await discar(pedidoDeGente({ leadId: null, telefone: TELEFONE_DO_LEAD }), outra.porta)
    expect(outra.guardas[0]?.p_bypass).toEqual([])
  })

  test('passo pulável que não existe é recusa, e não descarte silencioso', async () => {
    const teste = bancada()
    const resposta = await discar(
      pedidoDeRotina({ fonte: 'camp', referencia: LEAD, ordinal: 1, pular: ['daily_per_acount'] }),
      teste.porta,
    )

    expect(resposta.status).toBe(400)
    expect(recusa(resposta).motivo).toBe('pulo_invalido')
  })
})

describe('a recusa da guarda', () => {
  test('sai com a frase e a alternativa, e não consome crédito', async () => {
    const teste = bancada({
      guarda: {
        allowed: false,
        reason: 'dialing_paused',
        dados: { paused_at: AGORA },
        phone_line_id: null,
      },
    })
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(resposta.status).toBe(409)
    const corpo = recusa(resposta)
    expect(corpo.motivo).toBe('freio_puxado')
    expect(corpo.mensagem).toContain('freio de emergência')
    expect(corpo.alternativa).not.toBe('')
    // A prova do quarto critério de aceite da F2, na borda: o provedor não foi
    // chamado nenhuma vez, e nenhuma linha de `calls` nasceu.
    expect(teste.disparos).toHaveLength(0)
    expect(teste.gravadas).toHaveLength(0)
    expect(teste.trilha).toHaveLength(0)
  })

  test('o portão de lead real recusa antes do provedor', async () => {
    const teste = bancada({
      guarda: {
        allowed: false,
        reason: 'real_dialing_gate',
        dados: { real_dialing: false },
        phone_line_id: null,
      },
    })
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(resposta.status).toBe(409)
    expect(recusa(resposta).motivo).toBe('portao_de_lead_real')
    expect(teste.disparos).toHaveLength(0)
  })

  test('guarda fora do ar é recusa, e não liberação', async () => {
    const teste = bancada({ guardaLevanta: true })
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(resposta.status).toBe(409)
    expect(recusa(resposta).motivo).toBe('guarda_indisponivel')
    expect(teste.disparos).toHaveLength(0)
    expect(teste.gravadas).toHaveLength(0)
  })
})

describe('a publicação do propósito (T-01)', () => {
  test('cada propósito disca com a publicação dele', async () => {
    for (const proposito of ['discovery', 'reminder', 'rescue', 'followup'] as const) {
      const teste = bancada()
      const resposta = await discar(pedidoDeGente({ proposito }), teste.porta)

      expect(resposta.status).toBe(200)
      expect(teste.propositosConsultados).toEqual([proposito])
      expect(teste.disparos[0]?.providerAgentId).toBe(PUBLICACAO_POR_PROPOSITO[proposito])
      expect(teste.gravadas[0]?.purpose).toBe(proposito)
    }
  })

  test('propósito sem publicação é recusa nossa, antes de qualquer chamada externa', async () => {
    const teste = bancada({ publicacao: null })
    const resposta = await discar(pedidoDeGente({ proposito: 'followup' }), teste.porta)

    expect(resposta.status).toBe(409)
    expect(recusa(resposta).motivo).toBe('sem_publicacao')
    expect(teste.disparos).toHaveLength(0)
    // E sem linha `queued` para alguém limpar depois: a recusa vem antes do
    // insert, que é a divergência declarada no cabeçalho de discagem.ts.
    expect(teste.gravadas).toHaveLength(0)
    expect(teste.guardas).toHaveLength(0)
  })

  test('propósito fora dos quatro nem chega à camada de dados', async () => {
    const teste = bancada()
    const resposta = await discar(pedidoDeGente({ proposito: 'cobranca' }), teste.porta)

    expect(resposta.status).toBe(400)
    expect(recusa(resposta).motivo).toBe('proposito_invalido')
    expect(teste.propositosConsultados).toHaveLength(0)
  })

  test('sem roteiro publicado a ligação não sai', async () => {
    const teste = bancada({ versao: null })
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(resposta.status).toBe(409)
    expect(recusa(resposta).motivo).toBe('sem_playbook')
    expect(teste.disparos).toHaveLength(0)
  })

  test('a chamada carimba a publicação e a versão do roteiro', async () => {
    const teste = bancada()
    await discar(pedidoDeGente(), teste.porta)

    expect(teste.gravadas[0]?.agent_publication_id).toBe(PUBLICACAO)
    expect(teste.gravadas[0]?.playbook_version_id).toBe(VERSAO)
  })
})

describe('o contexto viaja no disparo (revisão de T-25)', () => {
  test('o pedido leva call_id e todas as variáveis que o prompt cita, com o lead dentro', async () => {
    const teste = bancada()
    await discar(pedidoDeGente(), teste.porta)

    const disparo = teste.disparos[0]
    expect(disparo?.variaveis.call_id).toBe(CHAMADA)
    for (const variavel of [...VARIAVEIS_DINAMICAS, ...VARIAVEIS_DA_CHAMADA]) {
      expect(Object.keys(disparo?.variaveis ?? {})).toContain(variavel)
    }
    expect(disparo?.variaveis.nome_do_lead).toBe(NOME_DO_LEAD)
    expect(disparo?.primeiraFala).toContain(NOME_DO_LEAD)
    expect(disparo?.primeiraFala).not.toMatch(/\{/)
  })

  test('lead sem nome leva o valor inicial seguro, nunca o nome da variável', async () => {
    const teste = bancada({ lead: { id: LEAD, phone_e164: TELEFONE_DO_LEAD, name: null } })
    await discar(pedidoDeGente(), teste.porta)

    const disparo = teste.disparos[0]
    expect(disparo?.variaveis.nome_do_lead).toBe(VALOR_INICIAL_DA_VARIAVEL.nome_do_lead)
    for (const [chave, valor] of Object.entries(disparo?.variaveis ?? {})) {
      expect(valor).not.toContain(chave)
    }
    expect(disparo?.primeiraFala).toMatch(/^Oi! Aqui é a Sarah/)
  })

  test('conta sem agente legível disca com os valores do lead e a primeira fala publicada', async () => {
    const teste = bancada({ identidade: null })
    await discar(pedidoDeGente(), teste.porta)

    const disparo = teste.disparos[0]
    expect(disparo?.primeiraFala).toBeNull()
    expect(disparo?.variaveis.nome_do_lead).toBe(NOME_DO_LEAD)
  })

  test('o rastro de integração guarda o nome das variáveis, não o dado do lead', async () => {
    const teste = bancada()
    await discar(pedidoDeGente(), teste.porta)

    const serializado = JSON.stringify(teste.eventos.map((evento) => evento.request))
    expect(serializado).not.toContain(NOME_DO_LEAD)
    expect(serializado).toContain('nome_do_lead')
    expect(serializado).toContain(CHAMADA)
  })

  test('a credencial do provedor não sai no corpo da resposta', async () => {
    const teste = bancada()
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(JSON.stringify(resposta.corpo)).not.toContain(CHAVE_DA_VOZ)
  })

  test('sem chave do provedor de voz, a ligação não sai', async () => {
    const teste = bancada({ credencial: 'ausente' })
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(resposta.status).toBe(409)
    expect(recusa(resposta).motivo).toBe('sem_credencial_de_voz')
    expect(teste.disparos).toHaveLength(0)
  })

  test('chave só da plataforma em conta que precisa da própria é recusa própria', async () => {
    const teste = bancada({ credencial: 'plataforma_bloqueada' })
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(resposta.status).toBe(409)
    expect(recusa(resposta).motivo).toBe('voz_bloqueada')
  })
})

describe('a idempotência de T-07', () => {
  test('a chave vai para a linha, no formato do módulo compartilhado', async () => {
    const teste = bancada()
    await discar(pedidoDeGente(), teste.porta)

    expect(teste.gravadas[0]?.idempotency_key).toBe(
      chaveDeDiscagem({ fonte: 'manual', uuidDoCliente: UUID_DO_CLIENTE }),
    )
  })

  test('o segundo clique devolve a chamada que já existe, sem discar e sem erro', async () => {
    const teste = bancada({
      chamadaExistente: { id: CHAMADA, status: 'in_progress', provider_call_sid: SID_DA_CHAMADA },
    })
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(resposta.status).toBe(200)
    const corpo = sucesso(resposta)
    expect(corpo.estado).toBe('ja_existia')
    expect(corpo.chamadaId).toBe(CHAMADA)
    expect(corpo.providerCallSid).toBe(SID_DA_CHAMADA)
    // Nem provedor, nem segunda linha de auditoria: o fato já foi registrado
    // quando a primeira nasceu.
    expect(teste.disparos).toHaveLength(0)
    expect(teste.trilha).toHaveLength(0)
  })

  test('a retentativa da rotina ganha o sufixo da tentativa, e a primeira não (US-189)', async () => {
    const primeira = bancada()
    await discar(pedidoDeRotina({ tentativa: 1 }), primeira.porta)
    const base = chaveDeDiscagem({ fonte: 'stl', leadId: LEAD })
    expect(primeira.gravadas[0]?.idempotency_key).toBe(base)

    const segunda = bancada()
    await discar(pedidoDeRotina({ tentativa: 2 }), segunda.porta)
    expect(segunda.gravadas[0]?.idempotency_key).toBe(`${base}#2`)
  })

  test('tentativa torta é 400, e não chave nova', async () => {
    const teste = bancada()
    const resposta = await discar(pedidoDeRotina({ tentativa: 0 }), teste.porta)
    expect(resposta.status).toBe(400)
    expect(teste.gravadas).toHaveLength(0)
  })

  test('cada fonte forma a própria chave, e a composta exige ordinal', async () => {
    expect(montarChave('rem', REUNIAO, null)).toBe(
      chaveDeDiscagem({ fonte: 'rem', meetingId: REUNIAO }),
    )
    expect(montarChave('rescue', REUNIAO, 2)).toBe(
      chaveDeDiscagem({ fonte: 'rescue', meetingId: REUNIAO, ordinal: 2 }),
    )
    expect(montarChave('rescue', REUNIAO, null)).toBeNull()
    expect(montarChave('manual', 'nao-e-uuid', null)).toBeNull()
  })

  test('referência torta é 400 com frase, e não exceção', async () => {
    const teste = bancada()
    const resposta = await discar(pedidoDeGente({ referencia: 'nao-e-uuid' }), teste.porta)

    expect(resposta.status).toBe(400)
    expect(recusa(resposta).motivo).toBe('referencia_invalida')
    expect(teste.guardas).toHaveLength(0)
  })
})

describe('a linha de calls', () => {
  test('nasce queued, de saída, antes de o provedor ser tocado', async () => {
    const ordem: string[] = []
    const teste = bancada()
    const porta: PortaDaDiscagem = {
      ...teste.porta,
      async gravarChamada(linha) {
        ordem.push('grava')
        return await teste.porta.gravarChamada(linha)
      },
      async dispararNoProvedor(pedido) {
        ordem.push('dispara')
        return await teste.porta.dispararNoProvedor(pedido)
      },
    }

    await discar(pedidoDeGente(), porta)

    expect(ordem).toEqual(['grava', 'dispara'])
    expect(teste.gravadas[0]?.status).toBe('queued')
    expect(teste.gravadas[0]?.direction).toBe('outbound')
    expect(teste.gravadas[0]?.to_number).toBe(TELEFONE_DO_LEAD)
    expect(teste.gravadas[0]?.from_number).toBe(NUMERO_DE_ORIGEM)
    expect(teste.gravadas[0]?.phone_line_id).toBe(LINHA)
  })

  test('a guarda decide antes de a chamada ser gravada', async () => {
    const ordem: string[] = []
    const teste = bancada()
    const porta: PortaDaDiscagem = {
      ...teste.porta,
      async guardDial(chamada) {
        ordem.push('guarda')
        return await teste.porta.guardDial(chamada)
      },
      async gravarChamada(linha) {
        ordem.push('grava')
        return await teste.porta.gravarChamada(linha)
      },
    }

    await discar(pedidoDeGente(), porta)
    expect(ordem).toEqual(['guarda', 'grava'])
  })

  test('falha do provedor deixa a linha queued, sem identificador, e diz qual é', async () => {
    const teste = bancada({ disparoFalha: { codigo: 'agent_not_found', status: 400 } })
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(resposta.status).toBe(502)
    const corpo = recusa(resposta)
    expect(corpo.chamadaId).toBe(CHAMADA)
    // A linha existe e continua `queued`: quem a fecha é cron-call-recovery.
    // Desfazê-la perderia o registro da tentativa e a chave de idempotência
    // junto, e a rotina seguinte discaria uma segunda vez.
    expect(teste.gravadas).toHaveLength(1)
    expect(teste.gravadas[0]?.status).toBe('queued')
    expect(teste.disparosGravados).toHaveLength(0)
  })

  test('provedor sem resposta é 503, e não 502', async () => {
    const teste = bancada({ disparoFalha: { codigo: 'TimeoutError', status: null } })
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(resposta.status).toBe(503)
    expect(recusa(resposta).chamadaId).toBe(CHAMADA)
  })

  test('o código bruto do provedor não sai na resposta', async () => {
    const teste = bancada({ disparoFalha: { codigo: 'agent_not_found_xyz', status: 404 } })
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(JSON.stringify(resposta.corpo)).not.toContain('agent_not_found_xyz')
  })

  test('provedor aceito grava o identificador da chamada', async () => {
    const teste = bancada()
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(sucesso(resposta).providerCallSid).toBe(SID_DA_CHAMADA)
    expect(teste.disparosGravados).toEqual([
      { chamadaId: CHAMADA, providerCallSid: SID_DA_CHAMADA },
    ])
  })

  test('linha telefônica sem registro no provedor de voz não disca', async () => {
    const teste = bancada({ linha: { id: LINHA, e164: NUMERO_DE_ORIGEM, provider_voice_id: null } })
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(resposta.status).toBe(409)
    expect(recusa(resposta).motivo).toBe('linha_sem_registro')
    expect(teste.gravadas).toHaveLength(0)
    expect(teste.disparos).toHaveLength(0)
  })

  test('sem número e sem lead não há o que discar', async () => {
    const teste = bancada({ lead: null })
    const resposta = await discar(
      pedidoDeGente({ leadId: null, telefone: null }),
      teste.porta,
    )

    expect(resposta.status).toBe(400)
    expect(recusa(resposta).motivo).toBe('destino_ausente')
  })

  test('lead de outra conta é recusa, e não ligação para o número errado', async () => {
    const teste = bancada({ lead: null })
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(resposta.status).toBe(404)
    expect(recusa(resposta).motivo).toBe('lead_desconhecido')
    expect(teste.guardas).toHaveLength(0)
  })

  test('o número do pedido tem precedência sobre o do lead', async () => {
    const teste = bancada()
    await discar(pedidoDeGente({ telefone: '+5548999990002' }), teste.porta)

    expect(teste.guardas[0]?.p_phone_e164).toBe('+5548999990002')
  })
})

describe('a trilha e o rastro', () => {
  test('discar grava audit_log com autor, alvo e motivo', async () => {
    const teste = bancada()
    await discar(pedidoDeGente(), teste.porta)

    const linha = teste.trilha[0]
    expect(linha?.action).toBe('call_placed')
    expect(linha?.target_type).toBe('calls')
    expect(linha?.target_id).toBe(CHAMADA)
    // A porta por onde a mudança entrou, no vocabulário de `audit_log.source`.
    expect(linha?.source).toBe('edge:call-place')
    expect(linha?.reason).toBe('primeira ligação de teste')
    expect(linha?.payload.purpose).toBe('discovery')
    expect(linha?.payload.idempotency_key).toBe(
      chaveDeDiscagem({ fonte: 'manual', uuidDoCliente: UUID_DO_CLIENTE }),
    )
    // A hora não é escrita aqui: `audit_log.created_at` tem `default now()`, e
    // escrevê-la daria à trilha o relógio de quem chamou.
    expect(Object.keys(linha ?? {})).not.toContain('created_at')
  })

  test('o rastro de integração usa o identificador da chamada como correlação', async () => {
    const teste = bancada()
    await discar(pedidoDeGente(), teste.porta)

    const evento = teste.eventos[0]
    expect(evento?.correlation_id).toBe(CHAMADA)
    expect(evento?.provider).toBe(PROVEDOR_DE_VOZ)
    expect(evento?.direction).toBe('outbound')
    expect(evento?.status_code).toBe(200)
    // A credencial não entra no rastro, que é o registro mais lido da fatia.
    expect(JSON.stringify(evento)).not.toContain(CHAVE_DA_VOZ)
  })

  test('o rastro é gravado também quando o provedor recusa', async () => {
    const teste = bancada({ disparoFalha: { codigo: 'internal_error', status: 500 } })
    await discar(pedidoDeGente(), teste.porta)

    expect(teste.eventos).toHaveLength(1)
    expect(teste.eventos[0]?.status_code).toBe(500)
    expect(teste.eventos[0]?.correlation_id).toBe(CHAMADA)
  })

  test('rastro que não grava não derruba a ligação, e o corpo diz que faltou', async () => {
    const teste = bancada({ eventoFalha: true })
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(resposta.status).toBe(200)
    expect(sucesso(resposta).semRegistro).toBe(true)
    expect(teste.disparosGravados).toHaveLength(1)
  })

  test('a credencial é pedida ao cofre, e sempre a mesma chave', async () => {
    const pedidas: string[] = []
    const teste = bancada()
    const porta: PortaDaDiscagem = {
      ...teste.porta,
      async credencial(contaId, provedor, chave) {
        pedidas.push(`${provedor}/${chave}`)
        return await teste.porta.credencial(contaId, provedor, chave)
      },
    }

    await discar(pedidoDeGente(), porta)
    expect(pedidas).toEqual([`${PROVEDOR_DE_VOZ}/${CHAVE_DO_PROVEDOR_DE_VOZ}`])
  })
})

describe('o pedido malformado', () => {
  test('GET não disca', async () => {
    const teste = bancada()
    const resposta = await discar(pedidoDeGente({ metodo: 'GET' }), teste.porta)

    expect(resposta.status).toBe(405)
    expect(recusa(resposta).motivo).toBe('metodo_invalido')
  })

  test('sem conta não disca', async () => {
    const teste = bancada()
    const resposta = await discar(pedidoDeGente({ contaId: null }), teste.porta)

    expect(resposta.status).toBe(400)
    expect(recusa(resposta).motivo).toBe('conta_ausente')
  })

  test('fonte que dial_queue não conhece não disca', async () => {
    const teste = bancada()
    const resposta = await discar(pedidoDeGente({ fonte: 'webhook' }), teste.porta)

    expect(resposta.status).toBe(400)
    expect(recusa(resposta).motivo).toBe('fonte_invalida')
  })

  test('conta que não existe é 404, e não 500', async () => {
    const teste = bancada({ conta: null })
    const resposta = await discar(pedidoDeGente(), teste.porta)

    expect(resposta.status).toBe(404)
    expect(recusa(resposta).motivo).toBe('conta_desconhecida')
  })

  test('erro da camada de dados vira falha_interna, e não stack trace', async () => {
    const teste = bancada()
    const porta: PortaDaDiscagem = {
      ...teste.porta,
      async gravarChamada() {
        throw new Error('insert into calls violou nao-sei-o-quê na coluna secreta')
      },
    }

    const resposta = await discar(pedidoDeGente(), porta)
    expect(resposta.status).toBe(500)
    expect(recusa(resposta).motivo).toBe('falha_interna')
    expect(JSON.stringify(resposta.corpo)).not.toContain('coluna secreta')
  })
})

describe('o orçamento de tempo', () => {
  // O primeiro critério de aceite da F2 fala em "toca em até 8 s", e isso NÃO
  // se mede aqui: tocar depende da telefonia, do provedor de voz e de um número
  // real, que o laço não tem. O que se mede é o que é nosso — do pedido até o
  // disparo sair —, com a camada de dados dublada. A medição ponta a ponta em
  // 20 chamadas é do degrau 3, e está declarada em notes.
  const ORCAMENTO_MS = 200

  test(`do pedido ao disparo em menos de ${ORCAMENTO_MS} ms, com a camada dublada`, async () => {
    const teste = bancada()
    const inicio = performance.now()
    const resposta = await discar(pedidoDeGente(), teste.porta)
    const gasto = performance.now() - inicio

    expect(resposta.status).toBe(200)
    expect(teste.disparos).toHaveLength(1)
    expect(gasto).toBeLessThan(ORCAMENTO_MS)
  })
})
