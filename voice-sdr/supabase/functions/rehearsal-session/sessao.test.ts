// Provas do ensaio (US-247). Ambiente node, sem rede e sem banco: o provedor e
// a camada de dados são dublados.
//
// O que este arquivo segura:
//
// 1. **Ensaia-se contra o agente publicado** (T-16). O identificador que vai
//    ao provedor é o `provider_agent_id` da publicação daquele propósito, e
//    não um agente criado para a ocasião.
// 2. **Sem publicação não se ensaia**, e a recusa carrega o caminho de onde
//    publicar — em vez de deixar a pessoa procurar.
// 3. **A chamada só nasce depois de a sessão existir.** Falha do provedor não
//    deixa ensaio pendurado que nunca teve conversa.
// 4. **A transcrição vem do provedor**, e não do que o navegador mandou.
// 5. **Encerrar duas vezes grava uma vez**: a RPC é quem decide, e a segunda
//    passagem recebe a recusa.
// 6. **Conversa que o provedor não devolveu não trava o fechamento**: ensaio
//    aberto para sempre é pior do que encerrado sem transcrição.
// 7. **Texto e voz são a mesma publicação** (US-113): muda o `somenteTexto`,
//    o aviso de crédito e nada mais; toda abertura carrega o id da publicação,
//    e `rehearsal-turn` não existe.
// 8. **A chave do provedor nunca vai no corpo**, nem quando o provedor a
//    ecoa: a resposta inteira vira recusa.

import { existsSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { VARIAVEIS_DA_CHAMADA } from '../_shared/agente/compilador.ts'
import { perfilPeloId } from '../_shared/ensaio/perfis-de-lead.ts'
import { PROPOSITOS } from '../_shared/playbook/camada-um.ts'

import {
  atenderEnsaio,
  type ConversaDoProvedor,
  type CorpoDoEnsaio,
  type EnsaioAberto,
  type PedidoDaBorda,
  type PortaDoEnsaio,
  type PublicacaoDoProposito,
  type RecusaDoEnsaio,
  type RespostaDoProvedor,
  MODOS,
  VALIDADE_DA_SESSAO_MS,
} from './sessao.ts'
import { MENSAGENS } from './respostas.ts'

const CONTA = '11111111-1111-4111-8111-111111111111'
const ADMIN = '33333333-3333-4333-8333-333333333333'
const PUBLICACAO = '44444444-4444-4444-8444-444444444444'
const VERSAO = '55555555-5555-4555-8555-555555555555'
const ENSAIO = '66666666-6666-4666-8666-666666666666'
const CHAMADA = '77777777-7777-4777-8777-777777777777'

/** Identificadores improváveis, para a busca por vazamento não achar por acaso. */
const AGENTE_NO_PROVEDOR = 'agent_zarabatana_7742'
const URL_ASSINADA = 'wss://api.elevenlabs.io/v1/convai/conversation?token=itajai-mirim'
/** A chave da conta que o adaptador usou. Nunca pode aparecer no corpo. */
const CHAVE_DA_CONTA = 'sk_chave_da_conta_jabuticaba_9031'
const AGORA = new Date('2026-09-24T12:00:00.000Z')

const CONVERSA: ConversaDoProvedor = {
  turnos: [
    { quem: 'agent', texto: 'Oi, aqui é a Sarah. Esta ligação é gravada.' },
    { quem: 'lead', texto: 'Pode falar.' },
  ],
  duracaoSeg: 42,
}

interface Cenario {
  papel?: string | null
  semAgente?: boolean
  publicacao?: Partial<PublicacaoDoProposito> | null
  sessao?: RespostaDoProvedor
  ensaio?: Partial<EnsaioAberto> | null
  conversa?: ConversaDoProvedor | null
  encerramentoRecusado?: boolean
}

interface Dubla {
  porta: PortaDoEnsaio
  tocados: string[]
  agentesPedidos: string[]
  abertos: { proposito: string; modo: string; publicacaoId: string; persona: { perfil: string } }[]
  encerrados: { ensaioId: string; transcricao: Record<string, unknown>; duracaoSeg: number | null }[]
  conversasLidas: string[]
}

function dublar(cenario: Cenario = {}): Dubla {
  const tocados: string[] = []
  const agentesPedidos: string[] = []
  const abertos: Dubla['abertos'] = []
  const encerrados: Dubla['encerrados'] = []
  const conversasLidas: string[] = []

  const porta: PortaDoEnsaio = {
    async usuarioDaSessao(jwt) {
      tocados.push('usuarioDaSessao')
      return jwt === 'token-bom' ? { id: ADMIN } : null
    },
    async papelNaConta() {
      tocados.push('papelNaConta')
      return cenario.papel === undefined ? 'admin' : cenario.papel
    },
    async contaTemAgente() {
      tocados.push('contaTemAgente')
      return !cenario.semAgente
    },
    async publicacaoDoProposito() {
      tocados.push('publicacaoDoProposito')
      if (cenario.publicacao === null) return null
      return {
        id: PUBLICACAO,
        provider_agent_id: AGENTE_NO_PROVEDOR,
        playbook_version_id: VERSAO,
        ...(cenario.publicacao ?? {}),
      }
    },
    async pedirSessaoAssinada(agenteId) {
      tocados.push('pedirSessaoAssinada')
      agentesPedidos.push(agenteId)
      return (
        cenario.sessao ?? { ok: true, status: 200, urlAssinada: URL_ASSINADA, credencial: CHAVE_DA_CONTA }
      )
    },
    async abrirEnsaio(dados) {
      tocados.push('abrirEnsaio')
      abertos.push({
        proposito: dados.proposito,
        modo: dados.modo,
        publicacaoId: dados.publicacaoId,
        persona: dados.persona,
      })
      return { ensaioId: ENSAIO, chamadaId: CHAMADA }
    },
    async contextoDaAbertura() {
      tocados.push('contextoDaAbertura')
      return {
        identidade: { nome: 'Sarah', empresa: 'Empresa Fictícia', primeiraFala: null },
        politica: { gravacaoLigada: true, avisoDeGravacao: null },
        lead: { nome: 'Pessoa de Ensaio', empresa: 'Negócio de Ensaio', cidade: null },
      }
    },
    async lerEnsaio() {
      tocados.push('lerEnsaio')
      if (cenario.ensaio === null) return null
      return {
        id: ENSAIO,
        call_id: CHAMADA,
        finished_at: null,
        provider_conversation_id: 'conv_do_ensaio',
        ...(cenario.ensaio ?? {}),
      }
    },
    async buscarConversa(conversaId) {
      tocados.push('buscarConversa')
      conversasLidas.push(conversaId)
      return cenario.conversa === undefined ? CONVERSA : cenario.conversa
    },
    async encerrarEnsaio(dados) {
      tocados.push('encerrarEnsaio')
      encerrados.push({
        ensaioId: dados.ensaioId,
        transcricao: dados.transcricao as Record<string, unknown>,
        duracaoSeg: dados.duracaoSeg,
      })
      return !cenario.encerramentoRecusado
    },
  }

  return { porta, tocados, agentesPedidos, abertos, encerrados, conversasLidas }
}

function pedido(parcial: Partial<PedidoDaBorda>): PedidoDaBorda {
  return {
    metodo: 'POST',
    autorizacao: 'Bearer token-bom',
    contaId: CONTA,
    acao: 'abrir',
    proposito: 'discovery',
    modo: 'voice',
    perfil: 'interessado',
    ensaioId: null,
    conversaId: null,
    ...parcial,
  }
}

describe('abrir', () => {
  test('a sessão é assinada contra o agente publicado daquele propósito', async () => {
    const dubla = dublar()
    const resposta = await atenderEnsaio(pedido({}), dubla.porta)

    expect(resposta.status).toBe(201)
    const corpo = resposta.corpo as Extract<CorpoDoEnsaio, { passo: 'aberto' }>
    expect(corpo.urlAssinada).toBe(URL_ASSINADA)
    // T-16: o mesmo agente que atende as ligações, e não um criado para a
    // ocasião. Sabotagem conferida: trocar por outro identificador derruba só
    // esta asserção.
    expect(dubla.agentesPedidos).toEqual([AGENTE_NO_PROVEDOR])
    expect(dubla.abertos[0]?.publicacaoId).toBe(PUBLICACAO)
  })

  test('sem publicação não se ensaia, e a recusa diz onde publicar', async () => {
    const dubla = dublar({ publicacao: { provider_agent_id: null } })
    const resposta = await atenderEnsaio(pedido({}), dubla.porta)

    expect(resposta.status).toBe(428)
    const recusa = resposta.corpo as RecusaDoEnsaio
    expect(recusa.motivo).toBe('sem_publicacao')
    expect(recusa.caminho).toBe('/sarah/playbooks')
    // Criar um agente temporário seria contornar a publicação.
    expect(dubla.tocados).not.toContain('pedirSessaoAssinada')
    expect(dubla.tocados).not.toContain('abrirEnsaio')
  })

  test('falha do provedor não deixa ensaio pendurado', async () => {
    const dubla = dublar({ sessao: { ok: false, status: 503, codigo: 'unavailable' } })
    const resposta = await atenderEnsaio(pedido({}), dubla.porta)

    expect(resposta.status).toBe(503)
    // A chamada só nasce depois de a sessão existir.
    expect(dubla.tocados).not.toContain('abrirEnsaio')
  })

  test('resposta sem URL assinada não abre chamada nenhuma', async () => {
    const dubla = dublar({ sessao: { ok: true, status: 200, urlAssinada: null } })
    const resposta = await atenderEnsaio(pedido({}), dubla.porta)

    expect((resposta.corpo as RecusaDoEnsaio).motivo).toBe('resposta_ilegivel')
    expect(dubla.abertos).toHaveLength(0)
  })

  test('só o id do perfil viaja e fica gravado', async () => {
    const dubla = dublar()
    await atenderEnsaio(pedido({ perfil: 'pede_bloqueio' }), dubla.porta)

    // O contexto do perfil sai de call-init pelo call_id (T-25). Nome ou
    // contexto gravados daqui seriam um segundo caminho de contexto.
    expect(dubla.abertos[0]?.persona).toEqual({ perfil: 'pede_bloqueio' })
  })

  test('perfil fora do catálogo é recusado antes do provedor', async () => {
    const dubla = dublar()
    for (const perfil of ['inventado', null, { nome: 'Paula' }]) {
      const resposta = await atenderEnsaio(pedido({ perfil }), dubla.porta)
      expect(resposta.status).toBe(400)
      expect((resposta.corpo as RecusaDoEnsaio).motivo).toBe('perfil_invalido')
    }
    expect(dubla.tocados).not.toContain('pedirSessaoAssinada')
    expect(dubla.abertos).toHaveLength(0)
  })

  test('propósito e modo desconhecidos não chegam ao provedor', async () => {
    const dubla = dublar()
    expect((await atenderEnsaio(pedido({ proposito: 'bate_papo' }), dubla.porta)).status).toBe(400)
    expect((await atenderEnsaio(pedido({ modo: 'telepatia' }), dubla.porta)).status).toBe(400)
    expect(dubla.tocados).not.toContain('pedirSessaoAssinada')
  })

  test('os dois modos abrem contra o mesmo agente', async () => {
    const dubla = dublar()
    await atenderEnsaio(pedido({ modo: 'voice' }), dubla.porta)
    await atenderEnsaio(pedido({ modo: 'text' }), dubla.porta)

    // Texto e voz são a mesma Sarah: o que muda é o navegador, não o agente.
    expect(dubla.agentesPedidos).toEqual([AGENTE_NO_PROVEDOR, AGENTE_NO_PROVEDOR])
    expect(dubla.abertos.map((item) => item.modo)).toEqual(['voice', 'text'])
  })
})

describe('texto e voz contra a mesma publicação (US-113)', () => {
  const abrirNo = (modo: string) =>
    atenderEnsaio(pedido({ modo }), dublar().porta, { agora: () => AGORA })

  test('texto abre sessão só de texto, sem crédito de voz', async () => {
    const resposta = await abrirNo('text')

    expect(resposta.status).toBe(201)
    const corpo = resposta.corpo as Extract<CorpoDoEnsaio, { passo: 'aberto' }>
    expect(corpo.modo).toBe('text')
    expect(corpo.somenteTexto).toBe(true)
    expect(corpo.consomeCredito).toBe(false)
  })

  test('voz abre sessão de voz e diz que consome crédito', async () => {
    const corpo = (await abrirNo('voice')).corpo as Extract<CorpoDoEnsaio, { passo: 'aberto' }>

    expect(corpo.somenteTexto).toBe(false)
    expect(corpo.consomeCredito).toBe(true)
  })

  test('a sessão é curta e declara quando expira', async () => {
    const corpo = (await abrirNo('text')).corpo as Extract<CorpoDoEnsaio, { passo: 'aberto' }>

    expect(VALIDADE_DA_SESSAO_MS).toBeLessThanOrEqual(15 * 60 * 1000)
    expect(corpo.expiraEm).toBe(new Date(AGORA.getTime() + VALIDADE_DA_SESSAO_MS).toISOString())
  })

  test('toda abertura carrega o agent_publication_id da publicação, em todo propósito e modo', async () => {
    for (const proposito of PROPOSITOS) {
      for (const modo of MODOS) {
        const dubla = dublar()
        const resposta = await atenderEnsaio(pedido({ proposito, modo }), dubla.porta)

        // T-16: a chamada de ensaio nasce pendurada na publicação que ligaria
        // de verdade, e a tela recebe o mesmo id.
        expect(dubla.abertos).toEqual([expect.objectContaining({ proposito, modo, publicacaoId: PUBLICACAO })])
        expect((resposta.corpo as Extract<CorpoDoEnsaio, { passo: 'aberto' }>).publicacaoId).toBe(PUBLICACAO)
        expect(dubla.agentesPedidos).toEqual([AGENTE_NO_PROVEDOR])
      }
    }
  })

  test('rehearsal-turn não existe: nenhum turno do ensaio passa por código nosso', () => {
    expect(existsSync(new URL('../rehearsal-turn', import.meta.url))).toBe(false)
  })

  test('conta sem agente recusa com o caminho da identidade e não cria chamada', async () => {
    const dubla = dublar({ semAgente: true })
    const resposta = await atenderEnsaio(pedido({}), dubla.porta)

    expect(resposta.status).toBe(428)
    const recusa = resposta.corpo as RecusaDoEnsaio
    expect(recusa.motivo).toBe('sem_agente')
    expect(recusa.caminho).toBe('/sarah/identidade')
    expect(dubla.tocados).not.toContain('publicacaoDoProposito')
    expect(dubla.tocados).not.toContain('pedirSessaoAssinada')
    expect(dubla.abertos).toHaveLength(0)
  })

  test('propósito sem publicação nenhuma recusa e não cria chamada', async () => {
    const dubla = dublar({ publicacao: null })
    const resposta = await atenderEnsaio(pedido({ proposito: 'rescue' }), dubla.porta)

    expect((resposta.corpo as RecusaDoEnsaio).motivo).toBe('sem_publicacao')
    expect(dubla.abertos).toHaveLength(0)
  })

  test('falha do provedor vira frase em português, sem o código dele', async () => {
    const dubla = dublar({ sessao: { ok: false, status: 503, codigo: 'service_unavailable' } })
    const resposta = await atenderEnsaio(pedido({}), dubla.porta)

    const recusa = resposta.corpo as RecusaDoEnsaio
    expect(recusa.mensagem).toBe(MENSAGENS.provedor_indisponivel)
    expect(JSON.stringify(recusa)).not.toMatch(/service_unavailable|503/)
  })

  test('conta sem chave de voz recebe o caminho de Integrações', async () => {
    const dubla = dublar({ sessao: { ok: false, status: null, codigo: 'sem_credencial' } })
    const resposta = await atenderEnsaio(pedido({}), dubla.porta)

    const recusa = resposta.corpo as RecusaDoEnsaio
    expect(recusa.motivo).toBe('sem_credencial_de_voz')
    expect(recusa.caminho).toBe('/config/integracoes')
    expect(dubla.abertos).toHaveLength(0)
  })

  test('nenhuma credencial no corpo da abertura', async () => {
    for (const modo of MODOS) {
      const resposta = await atenderEnsaio(pedido({ modo }), dublar().porta)
      expect(resposta.status).toBe(201)
      expect(JSON.stringify(resposta.corpo)).not.toContain(CHAVE_DA_CONTA)
    }
  })

  test('provedor que ecoa a chave na URL tem a resposta inteira recusada, sem chamada', async () => {
    const dubla = dublar({
      sessao: {
        ok: true,
        status: 200,
        urlAssinada: `${URL_ASSINADA}&debug=${CHAVE_DA_CONTA}`,
        credencial: CHAVE_DA_CONTA,
      },
    })
    const resposta = await atenderEnsaio(pedido({}), dubla.porta)

    expect(resposta.status).toBe(500)
    expect((resposta.corpo as RecusaDoEnsaio).motivo).toBe('falha_interna')
    expect(JSON.stringify(resposta.corpo)).not.toContain(CHAVE_DA_CONTA)
    expect(dubla.abertos).toHaveLength(0)
  })

  test('a conferência final cobre o corpo inteiro, e não só a URL', async () => {
    // Credencial que casa com o id do ensaio: só a passagem sobre o corpo
    // montado a acha, e a resposta vira recusa.
    const dubla = dublar({
      sessao: { ok: true, status: 200, urlAssinada: URL_ASSINADA, credencial: ENSAIO },
    })
    const resposta = await atenderEnsaio(pedido({}), dubla.porta)

    expect((resposta.corpo as RecusaDoEnsaio).motivo).toBe('falha_interna')
    expect(JSON.stringify(resposta.corpo)).not.toContain(ENSAIO)
  })
})

describe('as variáveis da sessão', () => {
  test('a sessão leva call_id e toda variável que o prompt cita, com o lead e o perfil', async () => {
    const dubla = dublar()
    const resposta = await atenderEnsaio(pedido({ perfil: 'apressado' }), dubla.porta)

    const corpo = resposta.corpo as Extract<CorpoDoEnsaio, { passo: 'aberto' }>
    expect(corpo.variaveis.call_id).toBe(CHAMADA)
    for (const variavel of VARIAVEIS_DA_CHAMADA) expect(Object.keys(corpo.variaveis)).toContain(variavel)
    expect(corpo.variaveis.nome_do_lead).toBe('Pessoa de Ensaio')
    expect(corpo.variaveis.contexto_do_lead).toBe(perfilPeloId('apressado')?.contexto)
    expect(corpo.primeiraFala).toContain('Pessoa de Ensaio')
    expect(corpo.primeiraFala).not.toMatch(/[{}]/)
  })
})

describe('encerrar', () => {
  test('conversa conduzida por outro agente não vira transcrição deste ensaio', async () => {
    const dubla = dublar({
      ensaio: { provider_agent_id: AGENTE_NO_PROVEDOR },
      conversa: { ...CONVERSA, agenteId: 'agent_de_outra_conta' },
    })
    await atenderEnsaio(pedido({ acao: 'encerrar', ensaioId: ENSAIO }), dubla.porta)

    expect(dubla.encerrados[0]?.transcricao).toEqual({})
  })

  test('o identificador gravado da conversa vence o que o navegador mandou', async () => {
    const dubla = dublar()
    await atenderEnsaio(
      pedido({ acao: 'encerrar', ensaioId: ENSAIO, conversaId: 'conv_velha_de_outra_aba' }),
      dubla.porta,
    )

    expect(dubla.conversasLidas).toEqual(['conv_do_ensaio'])
  })

  test('grava a transcrição que o provedor devolveu, e não a do navegador', async () => {
    const dubla = dublar()
    const resposta = await atenderEnsaio(
      pedido({ acao: 'encerrar', ensaioId: ENSAIO, conversaId: 'conv_do_ensaio' }),
      dubla.porta,
    )

    const corpo = resposta.corpo as Extract<CorpoDoEnsaio, { passo: 'encerrado' }>
    expect(corpo.turnos).toBe(2)
    expect(dubla.encerrados[0]?.transcricao).toEqual({
      turns: [
        { role: 'agent', text: 'Oi, aqui é a Sarah. Esta ligação é gravada.' },
        { role: 'lead', text: 'Pode falar.' },
      ],
    })
    expect(dubla.encerrados[0]?.duracaoSeg).toBe(42)
  })

  test('conversa que o provedor não devolveu não trava o fechamento', async () => {
    const dubla = dublar({ conversa: null })
    const resposta = await atenderEnsaio(
      pedido({ acao: 'encerrar', ensaioId: ENSAIO }),
      dubla.porta,
    )

    // Ensaio aberto para sempre é pior do que encerrado sem transcrição, e a
    // ficha já sabe dizer "sem conversa".
    expect(resposta.status).toBe(200)
    expect(dubla.encerrados[0]?.transcricao).toEqual({})
  })

  test('ensaio já encerrado recebe a recusa', async () => {
    const dubla = dublar({ ensaio: { finished_at: '2026-09-24T12:00:00.000Z' } })
    const resposta = await atenderEnsaio(
      pedido({ acao: 'encerrar', ensaioId: ENSAIO }),
      dubla.porta,
    )

    expect(resposta.status).toBe(409)
    expect(dubla.tocados).not.toContain('encerrarEnsaio')
  })

  test('encerrar duas vezes grava uma vez: quem decide é a RPC', async () => {
    // A corrida que acontece de verdade: o botão clicado enquanto a aba fecha.
    const dubla = dublar({ encerramentoRecusado: true })
    const resposta = await atenderEnsaio(
      pedido({ acao: 'encerrar', ensaioId: ENSAIO }),
      dubla.porta,
    )

    expect((resposta.corpo as RecusaDoEnsaio).motivo).toBe('ensaio_encerrado')
  })

  test('ensaio de outra conta não existe aqui', async () => {
    const dubla = dublar({ ensaio: null })
    const resposta = await atenderEnsaio(
      pedido({ acao: 'encerrar', ensaioId: ENSAIO }),
      dubla.porta,
    )

    expect(resposta.status).toBe(404)
  })
})

describe('as negativas', () => {
  test('quem não administra a conta não chega ao provedor', async () => {
    const dubla = dublar({ papel: 'operator' })
    const resposta = await atenderEnsaio(pedido({}), dubla.porta)

    expect(resposta.status).toBe(403)
    expect((resposta.corpo as RecusaDoEnsaio).mensagem).toBe(MENSAGENS.papel_insuficiente)
    expect(dubla.tocados).not.toContain('publicacaoDoProposito')
  })

  test('só POST, e só com sessão', async () => {
    const dubla = dublar()
    expect((await atenderEnsaio(pedido({ metodo: 'GET' }), dubla.porta)).status).toBe(405)
    expect((await atenderEnsaio(pedido({ autorizacao: null }), dubla.porta)).status).toBe(401)
    expect((await atenderEnsaio(pedido({ acao: 'cantar' }), dubla.porta)).status).toBe(400)
  })
})
