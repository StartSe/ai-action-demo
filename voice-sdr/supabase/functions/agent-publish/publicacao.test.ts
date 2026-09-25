// Provas da publicação dos quatro propósitos. Ambiente node, sem rede e sem
// banco: o provedor e a camada de dados são dublados, e o dublê do provedor
// **conta as chamadas**, que é o único jeito de a idempotência ser verificável.
//
// O que este arquivo segura, e por que prosa não seguraria nenhuma:
//
// 1. **Publicar duas vezes seguidas faz quatro idas ao provedor e depois
//    nenhuma.** Sem a contagem, uma versão que republicasse tudo a cada clique
//    passaria verde em qualquer asserção sobre o resultado final.
// 2. **Falha parcial não mente.** Três publicados e um em falha é exatamente o
//    que a resposta diz, e o `estado` do agente inteiro é
//    `alteracoes_pendentes`.
// 3. **Republicação que falha não derruba o que está no ar.** O propósito que
//    já estava publicado não recebe escrita nenhuma: marcá-lo como `falha`
//    tiraria a linha do índice parcial de `call-place`, e republicar viraria
//    parar de discar.
// 4. **Sem roteiro publicado, aquele propósito não vai ao provedor.** Um agente
//    sem camada 2 atenderia a ligação com as regras travadas e mais nada.
// 5. **Nenhum segredo no corpo serializado.** A chave do provedor, a chave do
//    servidor e o segredo derivado são procurados no JSON da resposta.

import { LINHAS_DA_SEMENTE, type LinhaDeCriterio } from '../_shared/qualificacao/avaliacao.ts'
import { criteriosAplicados } from '../call-finalize/avaliacao-automatica.ts'
import { describe, expect, test } from 'vitest'

import {
  CATALOGO_DE_FERRAMENTAS,
  DESTINO_DA_TRANSFERENCIA,
  FATIA_PUBLICADA,
  VALOR_INICIAL_DA_VARIAVEL,
  compilarPublicacao,
  type Fatia,
} from '../_shared/agente/compilador.ts'
import { PROPOSITOS, type Proposito } from '../_shared/playbook/camada-um.ts'
import { derivarSegredoDeFerramenta } from '../_shared/segredo-de-ferramenta.ts'

import { derivarSegredoDoInicio } from '../_shared/provedor/webhooks-da-conta.ts'

import {
  CAMINHO_DA_CONFIGURACAO_DE_CONVERSA,
  CAMINHO_DOS_WEBHOOKS,
  type CorpoDoProvedor,
} from './formato-do-provedor.ts'
import { MENSAGENS_DOS_WEBHOOKS } from './respostas.ts'
import { criarWorkspaceDublado, idasCom, portaDoWorkspace, type WorkspaceDublado } from './workspace-dublado.ts'
import {
  atenderPublicacao,
  classificarFalha,
  propositosComGravacaoPendente,
  type AgenteDaConta,
  type CorpoDaPublicacao,
  type CorpoDeRecusa,
  type EventoDeIntegracao,
  type LinhaDePublicacao,
  type PedidoAoProvedor,
  type PoliticaLida,
  type PortaDePublicacao,
  type PublicacaoNoBanco,
  type RespostaDaPublicacao,
  type RespostaDoProvedor,
  type RoteiroPublicado,
} from './publicacao.ts'
import { MENSAGENS } from './respostas.ts'

const CONTA = '11111111-1111-4111-8111-111111111111'
const AGENTE = '22222222-2222-4222-8222-222222222222'
const USUARIO = '33333333-3333-4333-8333-333333333333'
const AUTORIZACAO = 'Bearer jwt-de-quem-publica'
const CHAVE_DA_VOZ = 'chave-do-provedor-de-voz-que-nao-pode-sair'
const CHAVE_DO_SERVIDOR = 'chave-do-servidor-de-ferramentas-desta-instalacao'
const ENDERECO = 'https://projeto.supabase.co/functions/v1'
const INSTANTE = '2026-09-22T12:00:00.000Z'

const AGENTE_COMPLETO: AgenteDaConta = {
  id: AGENTE,
  name: 'Sarah',
  company_name: 'Fábrica de Parafusos',
  offer_line: 'linha de parafusos sob medida',
  never_claim: ['prazo de entrega'],
  voice_id: 'voz-pt-br-1',
  voice_settings: { estabilidade: 0.6 },
  first_message: 'Oi, {nome_do_lead}? Aqui é a {nome_do_agente}, da {empresa}.',
}

const POLITICA: PoliticaLida = {
  max_duration_seconds: 600,
  recording_enabled: true,
  recording_notice_text: null,
  retention_days: 90,
}

function roteiro(proposito: Proposito): RoteiroPublicado {
  return {
    purpose: proposito,
    playbook_version_id: `44444444-4444-4444-8444-${proposito.padEnd(12, '0').slice(0, 12)}`,
    version: 2,
    body_script: `Roteiro de ${proposito}.`,
    body_house: '',
  }
}

const ROTEIROS = PROPOSITOS.map(roteiro)

interface AjustesDaPorta {
  readonly papel?: string | null
  readonly usuario?: { readonly id: string } | null
  readonly agente?: AgenteDaConta | null
  readonly politica?: PoliticaLida | null
  readonly criterios?: readonly LinhaDeCriterio[]
  readonly roteiros?: readonly RoteiroPublicado[]
  readonly publicacoes?: readonly PublicacaoNoBanco[]
  readonly credencial?: 'ok' | 'ausente' | 'plataforma_bloqueada'
  readonly chaveDoServidor?: string | null
  /** O que o provedor responde, por propósito. O padrão aceita tudo. */
  readonly provedor?: (pedido: PedidoAoProvedor) => RespostaDoProvedor | Error
  readonly gravacaoFalha?: (linha: LinhaDePublicacao) => boolean
  readonly eventoFalha?: boolean
  /** O workspace da ElevenLabs. Passar o mesmo em duas bancadas é publicar duas vezes na mesma conta. */
  readonly workspace?: WorkspaceDublado
  readonly origem?: 'conta' | 'plataforma'
}

interface Bancada {
  readonly porta: PortaDePublicacao
  readonly chamadas: PedidoAoProvedor[]
  readonly gravadas: LinhaDePublicacao[]
  readonly retratos: Parameters<PortaDePublicacao['gravarRetrato']>[0][]
  readonly eventos: EventoDeIntegracao[]
  readonly workspace: WorkspaceDublado
}

/** Os eventos das idas de agente, sem os do passo de webhooks. */
function eventosDosPropositos(banca: Bancada): EventoDeIntegracao[] {
  return banca.eventos.filter((evento) => 'proposito' in evento.request)
}

function bancada(ajustes: AjustesDaPorta = {}): Bancada {
  const chamadas: PedidoAoProvedor[] = []
  const gravadas: LinhaDePublicacao[] = []
  const retratos: Bancada['retratos'] = []
  const eventos: EventoDeIntegracao[] = []
  const workspace = ajustes.workspace ?? criarWorkspaceDublado()

  const porta: PortaDePublicacao = {
    ...portaDoWorkspace(workspace),
    async usuarioDaSessao() {
      return ajustes.usuario === undefined ? { id: USUARIO } : ajustes.usuario
    },
    async papelNaConta() {
      return ajustes.papel === undefined ? 'admin' : ajustes.papel
    },
    async agenteDaConta() {
      return ajustes.agente === undefined ? AGENTE_COMPLETO : ajustes.agente
    },
    async politicaDaConta() {
      return ajustes.politica === undefined ? POLITICA : ajustes.politica
    },
    async criteriosDeAvaliacao() {
      return ajustes.criterios ?? []
    },
    async roteirosPublicados() {
      return ajustes.roteiros ?? ROTEIROS
    },
    async publicacoesRegistradas() {
      return ajustes.publicacoes ?? []
    },
    async credencial() {
      if (ajustes.credencial === 'ausente') return { ok: false, motivo: 'ausente' }
      if (ajustes.credencial === 'plataforma_bloqueada') {
        return { ok: false, motivo: 'plataforma_bloqueada' }
      }
      return { ok: true, valor: CHAVE_DA_VOZ, origem: ajustes.origem ?? 'conta' }
    },
    chaveDoServidorDeFerramentas() {
      return ajustes.chaveDoServidor === undefined ? CHAVE_DO_SERVIDOR : ajustes.chaveDoServidor
    },
    async publicarNoProvedor(pedido) {
      chamadas.push(pedido)
      const resposta = ajustes.provedor?.(pedido) ?? {
        ok: true,
        providerAgentId: `provedor-${pedido.proposito}`,
        status: 200,
        latenciaMs: 120,
        endpoint: 'convai/agents',
      }
      if (resposta instanceof Error) throw resposta
      return resposta
    },
    async gravarPublicacao(linha) {
      if (ajustes.gravacaoFalha?.(linha)) throw new Error('escrita recusada')
      gravadas.push(linha)
    },
    async gravarRetrato(pedido) {
      retratos.push(pedido)
    },
    async registrarEventoDeIntegracao(evento) {
      if (ajustes.eventoFalha) throw new Error('registro recusado')
      eventos.push(evento)
    },
  }

  return { porta, chamadas, gravadas, retratos, eventos, workspace }
}

function publicar(
  banca: Bancada,
  pedido: Partial<{ metodo: string; contaId: unknown; autorizacao: string | null }> = {},
): Promise<RespostaDaPublicacao> {
  return atenderPublicacao(
    {
      metodo: pedido.metodo ?? 'POST',
      contaId: 'contaId' in pedido ? pedido.contaId : CONTA,
      autorizacao: 'autorizacao' in pedido ? (pedido.autorizacao ?? null) : AUTORIZACAO,
    },
    banca.porta,
    { enderecoDasFerramentas: ENDERECO, agora: () => new Date(INSTANTE) },
  )
}

function relatorio(resposta: RespostaDaPublicacao): CorpoDaPublicacao {
  if (!resposta.corpo.ok) throw new Error(`esperava relatório, veio ${resposta.corpo.motivo}`)
  return resposta.corpo
}

function recusa(resposta: RespostaDaPublicacao): CorpoDeRecusa {
  if (resposta.corpo.ok) throw new Error('esperava recusa, veio relatório')
  return resposta.corpo
}

/** As linhas gravadas, na forma em que a leitura seguinte as devolveria. */
function comoNoBanco(gravadas: readonly LinhaDePublicacao[]): PublicacaoNoBanco[] {
  return gravadas.map((linha) => ({
    purpose: linha.proposito,
    status: linha.status,
    published_hash: linha.publishedHash,
    provider_agent_id: linha.providerAgentId,
    channel_snapshot: linha.retrato,
  }))
}

describe('quatro publicações, uma por propósito', () => {
  test('publica os quatro e grava provider_agent_id, hash e data', async () => {
    const banca = bancada()
    const corpo = relatorio(await publicar(banca))

    expect(corpo.propositos.map((item) => item.proposito)).toEqual([...PROPOSITOS])
    expect(corpo.propositos.every((item) => item.estado === 'publicado')).toBe(true)
    expect(corpo.publicados).toBe(4)
    expect(corpo.falhas).toBe(0)
    expect(corpo.completo).toBe(true)
    expect(corpo.estado).toBe('publicado')
    expect(banca.chamadas).toHaveLength(4)

    expect(banca.gravadas).toHaveLength(4)
    for (const linha of banca.gravadas) {
      expect(linha.status).toBe('publicado')
      expect(linha.providerAgentId).toBe(`provedor-${linha.proposito}`)
      expect(linha.publishedHash).toMatch(/^[0-9a-f]{64}$/)
      expect(linha.publishedAt).toBe(INSTANTE)
      expect(linha.contaId).toBe(CONTA)
      expect(linha.agenteId).toBe(AGENTE)
    }
  })

  test('o hash gravado é o do compilador, e não um número inventado aqui', async () => {
    const banca = bancada()
    await publicar(banca)

    const esperado = await compilarPublicacao({
      proposito: 'discovery',
      identidade: {
        nome: AGENTE_COMPLETO.name,
        empresa: AGENTE_COMPLETO.company_name ?? '',
        oferta: AGENTE_COMPLETO.offer_line,
        nuncaAfirmar: AGENTE_COMPLETO.never_claim,
        vozId: 'voz-pt-br-1',
        ajustesDeVoz: AGENTE_COMPLETO.voice_settings,
        primeiraFala: AGENTE_COMPLETO.first_message ?? '',
      },
      playbookPublicado: {
        playbookVersionId: roteiro('discovery').playbook_version_id,
        versao: 2,
        camadaDois: roteiro('discovery').body_script,
        camadaTres: '',
      },
      politica: {
        duracaoMaximaSegundos: POLITICA.max_duration_seconds,
        gravacaoLigada: POLITICA.recording_enabled,
        avisoDeGravacao: POLITICA.recording_notice_text,
        retencaoDias: POLITICA.retention_days,
      },
    })

    const daDescoberta = banca.gravadas.find((linha) => linha.proposito === 'discovery')
    expect(daDescoberta?.publishedHash).toBe(esperado.publishedHash)
  })

  test('cada propósito vai ao provedor com o nome e o conjunto de ferramentas dele', async () => {
    const banca = bancada()
    await publicar(banca)

    for (const chamada of banca.chamadas) {
      expect(chamada.corpo.name).toBe(`Sarah (${chamada.proposito})`)
      expect(nomesDasFerramentas(chamada.corpo)).toEqual(ESPERADAS_POR_PROPOSITO[chamada.proposito])
      expect(chamada.providerAgentId).toBeNull()
    }
  })
})

describe('particularidades por canal e o retrato do que foi ao ar', () => {
  test('cada linha publicada leva o retrato da identidade, do roteiro e do WhatsApp', async () => {
    const banca = bancada({
      agente: { ...AGENTE_COMPLETO, whatsapp_first_message: 'Oi, {nome_do_lead}!', whatsapp_channel_style: 'Frases curtas.' },
    })
    await publicar(banca)
    const daDescoberta = banca.gravadas.find((linha) => linha.proposito === 'discovery')
    expect(daDescoberta?.retrato).toEqual({
      versao: 1,
      identidade: { nome: 'Sarah', empresa: 'Fábrica de Parafusos', oferta: 'linha de parafusos sob medida', nunca_afirmar: ['prazo de entrega'] },
      roteiro: {
        playbook_version_id: roteiro('discovery').playbook_version_id,
        versao: 2,
        camada_dois: 'Roteiro de discovery.',
        camada_tres: '',
      },
      whatsapp: { abertura: 'Oi, {nome_do_lead}!', jeito: 'Frases curtas.' },
    })
  })

  test('a publicação de antes do retrato ganha o dela sem ir ao provedor nem mudar a data', async () => {
    const primeira = bancada()
    await publicar(primeira)
    const semRetrato = comoNoBanco(primeira.gravadas).map((linha) => ({ ...linha, channel_snapshot: null }))

    const segunda = bancada({ publicacoes: semRetrato })
    const corpo = relatorio(await publicar(segunda))
    expect(corpo.inalterados).toBe(4)
    expect(segunda.chamadas).toHaveLength(0)
    expect(segunda.gravadas).toHaveLength(0)
    expect(segunda.retratos.map((item) => item.proposito)).toEqual([...PROPOSITOS])

    // Com o retrato gravado, a terceira passagem não escreve nada.
    const terceira = bancada({ publicacoes: comoNoBanco(primeira.gravadas) })
    await publicar(terceira)
    expect(terceira.retratos).toHaveLength(0)
  })

  test('mudar só o WhatsApp deixa a publicação pendente e republica com o retrato novo', async () => {
    const primeira = bancada()
    await publicar(primeira)

    const segunda = bancada({
      publicacoes: comoNoBanco(primeira.gravadas),
      agente: { ...AGENTE_COMPLETO, whatsapp_channel_style: 'Sem emoji.' },
    })
    const corpo = relatorio(await publicar(segunda))
    expect(corpo.publicados).toBe(4)
    expect(segunda.gravadas.every((linha) => linha.retrato?.whatsapp.jeito === 'Sem emoji.')).toBe(true)
    // O que o provedor de voz recebe não muda: o jeito do WhatsApp não é da ligação.
    expect(JSON.stringify(segunda.chamadas[0]!.corpo)).not.toContain('Sem emoji.')
  })

  test('o jeito da voz entra no prompt publicado, depois do jeito da casa', async () => {
    const banca = bancada({
      agente: { ...AGENTE_COMPLETO, voice_channel_style: 'Fale devagar ao dizer números.' },
      roteiros: ROTEIROS.map((item) => ({ ...item, body_house: 'Tom cordial.' })),
    })
    await publicar(banca)
    const corpo = JSON.stringify(banca.chamadas[0]!.corpo)
    expect(corpo).toContain('Fale devagar ao dizer números.')
    expect(corpo.indexOf('Tom cordial.')).toBeLessThan(corpo.indexOf('Fale devagar ao dizer números.'))
    expect(banca.gravadas[0]!.retrato?.whatsapp.jeito).toBeNull()
  })

  test('sem particularidades escritas, o hash é o de antes delas', async () => {
    const base = {
      proposito: 'discovery' as const,
      identidade: {
        nome: 'Sarah',
        empresa: 'Fábrica',
        oferta: null,
        nuncaAfirmar: [],
        vozId: 'v',
        ajustesDeVoz: {},
        primeiraFala: 'Oi.',
      },
      playbookPublicado: { playbookVersionId: 'p', versao: 1, camadaDois: 'R.', camadaTres: '' },
      politica: { duracaoMaximaSegundos: 600, gravacaoLigada: true, avisoDeGravacao: null, retencaoDias: 90 },
    }
    const antes = await compilarPublicacao(base)
    const vazias = await compilarPublicacao({
      ...base,
      identidade: { ...base.identidade, jeitoDoCanal: '  ' },
      whatsapp: { abertura: null, jeito: '' },
    })
    expect(vazias.publishedHash).toBe(antes.publishedHash)
    const comAbertura = await compilarPublicacao({ ...base, whatsapp: { abertura: 'Oi!', jeito: null } })
    expect(comAbertura.publishedHash).not.toBe(antes.publishedHash)
  })
})

describe('idempotência por hash', () => {
  test('a segunda publicação seguida não chama o provedor nenhuma vez', async () => {
    const primeira = bancada()
    await publicar(primeira)
    expect(primeira.chamadas).toHaveLength(4)

    const segunda = bancada({ publicacoes: comoNoBanco(primeira.gravadas) })
    const corpo = relatorio(await publicar(segunda))

    expect(segunda.chamadas).toHaveLength(0)
    // Nada gravado é `published_at` inalterado: o carimbo mede a última
    // mudança, não o último clique.
    expect(segunda.gravadas).toHaveLength(0)
    expect(corpo.propositos.every((item) => item.estado === 'inalterado')).toBe(true)
    expect(corpo.inalterados).toBe(4)
    expect(corpo.estado).toBe('publicado')
    expect(corpo.completo).toBe(true)
  })

  test('mudar o roteiro de um propósito republica só ele', async () => {
    const primeira = bancada()
    await publicar(primeira)

    const outros = ROTEIROS.filter((item) => item.purpose !== 'rescue')
    const mudado: RoteiroPublicado = { ...roteiro('rescue'), body_script: 'Outro roteiro.' }
    const segunda = bancada({
      publicacoes: comoNoBanco(primeira.gravadas),
      roteiros: [...outros, mudado],
    })
    const corpo = relatorio(await publicar(segunda))

    expect(segunda.chamadas.map((chamada) => chamada.proposito)).toEqual(['rescue'])
    expect(corpo.propositos.filter((item) => item.estado === 'publicado')).toHaveLength(1)
    expect(corpo.inalterados).toBe(3)
  })

  test('hash igual com status de falha republica: aquilo nunca foi ao ar', async () => {
    const primeira = bancada()
    await publicar(primeira)

    const publicacoes = comoNoBanco(primeira.gravadas).map((linha) =>
      linha.purpose === 'reminder' ? { ...linha, status: 'falha' } : linha,
    )
    const segunda = bancada({ publicacoes })
    await publicar(segunda)

    expect(segunda.chamadas.map((chamada) => chamada.proposito)).toEqual(['reminder'])
  })

  test('hash igual sem provider_agent_id republica: não há para onde discar', async () => {
    const primeira = bancada()
    await publicar(primeira)

    const publicacoes = comoNoBanco(primeira.gravadas).map((linha) =>
      linha.purpose === 'followup' ? { ...linha, provider_agent_id: null } : linha,
    )
    const segunda = bancada({ publicacoes })
    await publicar(segunda)

    expect(segunda.chamadas.map((chamada) => chamada.proposito)).toEqual(['followup'])
  })

  test('a republicação manda o identificador que já existe, para atualizar em vez de criar', async () => {
    const primeira = bancada()
    await publicar(primeira)

    const outros = ROTEIROS.filter((item) => item.purpose !== 'discovery')
    const segunda = bancada({
      publicacoes: comoNoBanco(primeira.gravadas),
      roteiros: [...outros, { ...roteiro('discovery'), body_script: 'Outro.' }],
    })
    await publicar(segunda)

    expect(segunda.chamadas[0]?.providerAgentId).toBe('provedor-discovery')
  })
})

describe('falha parcial', () => {
  test('três publicados e um em falha é o que a resposta diz', async () => {
    const banca = bancada({
      provedor: (pedido) =>
        pedido.proposito === 'rescue'
          ? { ok: false, codigo: 'invalid_api_key', status: 401, latenciaMs: 80 }
          : {
              ok: true,
              providerAgentId: `provedor-${pedido.proposito}`,
              status: 200,
              latenciaMs: 90,
            },
    })
    const corpo = relatorio(await publicar(banca))

    expect(corpo.publicados).toBe(3)
    expect(corpo.falhas).toBe(1)
    expect(corpo.completo).toBe(false)
    expect(corpo.estado).toBe('alteracoes_pendentes')

    const caiu = corpo.propositos.find((item) => item.proposito === 'rescue')
    expect(caiu?.estado).toBe('falha')
    expect(caiu?.motivo).toBe('provedor_recusou')
    expect(caiu?.mensagem).toMatch(/provedor de voz recusou/i)

    // O propósito que caiu e nunca esteve no ar fica gravado como `falha`: sem
    // isso, ele seria indistinguível de um que ninguém tentou.
    const linha = banca.gravadas.find((item) => item.proposito === 'rescue')
    expect(linha?.status).toBe('falha')
    expect(linha?.publishedHash).toBeNull()
    expect(linha?.publishedAt).toBeNull()
  })

  test('a resposta segue com status 200: o pedido foi atendido e o relatório é o corpo', async () => {
    const banca = bancada({
      provedor: () => ({ ok: false, codigo: 'invalid_api_key', status: 401 }),
    })
    const resposta = await publicar(banca)
    expect(resposta.status).toBe(200)
    expect(relatorio(resposta).falhas).toBe(4)
  })

  test('republicação que falha não derruba a publicação que está no ar', async () => {
    const primeira = bancada()
    await publicar(primeira)

    const outros = ROTEIROS.filter((item) => item.purpose !== 'discovery')
    const segunda = bancada({
      publicacoes: comoNoBanco(primeira.gravadas),
      roteiros: [...outros, { ...roteiro('discovery'), body_script: 'Outro.' }],
      provedor: () => ({ ok: false, codigo: 'server_error', status: 503 }),
    })
    const corpo = relatorio(await publicar(segunda))

    // Nenhuma escrita: a linha continua descrevendo o que o provedor tem, que é
    // a versão anterior. Marcá-la como `falha` tiraria o propósito do índice
    // parcial que `call-place` consulta.
    expect(segunda.gravadas).toHaveLength(0)
    const caiu = corpo.propositos.find((item) => item.proposito === 'discovery')
    expect(caiu?.estado).toBe('falha')
    expect(caiu?.motivo).toBe('provedor_indisponivel')
    expect(caiu?.providerAgentId).toBe('provedor-discovery')
    expect(corpo.estado).toBe('alteracoes_pendentes')
  })

  test('porta do provedor que levanta vira indisponível, e não recusa', async () => {
    const banca = bancada({
      provedor: (pedido) =>
        pedido.proposito === 'followup' ? new Error('conexão recusada') : { ok: true, providerAgentId: 'x' },
    })
    const corpo = relatorio(await publicar(banca))

    const caiu = corpo.propositos.find((item) => item.proposito === 'followup')
    expect(caiu?.motivo).toBe('provedor_indisponivel')
    // Sem ida ao provedor de que se possa dizer algo, não há evento a gravar.
    expect(banca.eventos.map((evento) => evento.request.proposito)).not.toContain('followup')
  })

  test('provedor aceita e o banco recusa: o propósito diz falha_ao_gravar', async () => {
    const banca = bancada({ gravacaoFalha: (linha) => linha.proposito === 'reminder' })
    const corpo = relatorio(await publicar(banca))

    const caiu = corpo.propositos.find((item) => item.proposito === 'reminder')
    expect(caiu?.estado).toBe('falha')
    expect(caiu?.motivo).toBe('falha_ao_gravar')
    expect(caiu?.publishedHash).toBeNull()
    expect(corpo.estado).toBe('alteracoes_pendentes')
  })
})

describe('sem roteiro publicado', () => {
  test('o propósito é recusado com motivo próprio e não vai ao provedor', async () => {
    const banca = bancada({ roteiros: ROTEIROS.filter((item) => item.purpose !== 'followup') })
    const corpo = relatorio(await publicar(banca))

    expect(banca.chamadas.map((chamada) => chamada.proposito)).not.toContain('followup')
    expect(banca.chamadas).toHaveLength(3)

    const recusado = corpo.propositos.find((item) => item.proposito === 'followup')
    expect(recusado?.estado).toBe('falha')
    expect(recusado?.motivo).toBe('sem_roteiro_publicado')
    expect(corpo.publicados).toBe(3)
    expect(corpo.completo).toBe(false)
  })

  test('nenhum roteiro publicado: quatro recusas e nenhuma ida ao provedor', async () => {
    const banca = bancada({ roteiros: [] })
    const corpo = relatorio(await publicar(banca))

    expect(banca.chamadas).toHaveLength(0)
    expect(corpo.falhas).toBe(4)
    expect(corpo.estado).toBe('rascunho')
  })
})

describe('quem pode publicar', () => {
  test('operator recebe negativa com a frase de quem concede acesso', async () => {
    const banca = bancada({ papel: 'operator' })
    const resposta = await publicar(banca)

    expect(resposta.status).toBe(403)
    expect(recusa(resposta).motivo).toBe('papel_insuficiente')
    expect(recusa(resposta).mensagem).toMatch(/quem administra/i)
    expect(banca.chamadas).toHaveLength(0)
  })

  test('viewer também não publica', async () => {
    const banca = bancada({ papel: 'viewer' })
    expect(recusa(await publicar(banca)).motivo).toBe('papel_insuficiente')
  })

  test('owner publica: a hierarquia de has_role alcança quem está acima', async () => {
    const banca = bancada({ papel: 'owner' })
    expect(relatorio(await publicar(banca)).publicados).toBe(4)
  })

  test('quem não é membro recebe sem_acesso, e não papel_insuficiente', async () => {
    const banca = bancada({ papel: null })
    expect(recusa(await publicar(banca)).motivo).toBe('sem_acesso')
  })

  test('sem sessão, com sessão vencida e com outro método', async () => {
    expect(recusa(await publicar(bancada(), { autorizacao: null })).motivo).toBe('sem_sessao')
    expect(recusa(await publicar(bancada({ usuario: null }))).motivo).toBe('sessao_invalida')
    expect(recusa(await publicar(bancada(), { metodo: 'GET' })).motivo).toBe('metodo_invalido')
    expect(recusa(await publicar(bancada(), { contaId: '  ' })).motivo).toBe('conta_ausente')
  })
})

describe('o que falta antes de publicar', () => {
  test('conta sem assistente montada', async () => {
    expect(recusa(await publicar(bancada({ agente: null }))).motivo).toBe('sem_agente')
  })

  test('assistente sem voz, sem primeira fala ou sem empresa', async () => {
    const semVoz = bancada({ agente: { ...AGENTE_COMPLETO, voice_id: null } })
    const semFala = bancada({ agente: { ...AGENTE_COMPLETO, first_message: '   ' } })
    // O nome é gravado no começo do tutorial, antes da empresa: a linha só com
    // o nome existe, e é a publicação quem cobra o resto.
    const semEmpresa = bancada({ agente: { ...AGENTE_COMPLETO, company_name: null } })
    expect(recusa(await publicar(semVoz)).motivo).toBe('agente_incompleto')
    expect(recusa(await publicar(semFala)).motivo).toBe('agente_incompleto')
    const faltaEmpresa = recusa(await publicar(semEmpresa))
    expect(faltaEmpresa.motivo).toBe('agente_incompleto')
    expect(faltaEmpresa.mensagem).toMatch(/empresa/)
  })

  test('sem chave do provedor de voz, e com a chave da plataforma bloqueada', async () => {
    const semChave = bancada({ credencial: 'ausente' })
    const bloqueada = bancada({ credencial: 'plataforma_bloqueada' })
    expect(recusa(await publicar(semChave)).motivo).toBe('sem_credencial_de_voz')
    // As duas frases são diferentes porque o caminho para sair de cada uma é
    // outro: uma manda cadastrar, a outra diz que a da plataforma não vale aqui.
    expect(recusa(await publicar(bloqueada)).motivo).toBe('credencial_da_plataforma_bloqueada')
    expect(MENSAGENS.sem_credencial_de_voz).not.toBe(MENSAGENS.credencial_da_plataforma_bloqueada)
  })

  test('sem a chave do servidor das ferramentas, a publicação nem começa', async () => {
    const banca = bancada({ chaveDoServidor: '  ' })
    const resposta = await publicar(banca)

    expect(resposta.status).toBe(500)
    expect(recusa(resposta).motivo).toBe('sem_chave_de_ferramentas')
    expect(banca.chamadas).toHaveLength(0)
  })

  test('conta sem linha de política vira falha interna, não publicação com padrão inventado', async () => {
    const banca = bancada({ politica: null })
    expect(recusa(await publicar(banca)).motivo).toBe('falha_interna')
    expect(banca.chamadas).toHaveLength(0)
  })
})

describe('retenção de áudio (L-18)', () => {
  test('gravação desligada na conta desliga a retenção no provedor', async () => {
    const banca = bancada({ politica: { ...POLITICA, recording_enabled: false } })
    await publicar(banca)

    for (const chamada of banca.chamadas) {
      expect(chamada.corpo.platform_settings.privacy.record_voice).toBe(false)
      expect(chamada.corpo.platform_settings.privacy.retention_days).toBe(90)
    }
  })

  test('desligar a gravação com publicação antiga no ar vira pendência de republicação', async () => {
    const comGravacao = bancada()
    await publicar(comGravacao)

    // A conta desliga a gravação e o provedor cai: o que está no ar continua
    // guardando áudio, e é isso que a tela de privacidade precisa dizer.
    const depois = bancada({
      politica: { ...POLITICA, recording_enabled: false },
      publicacoes: comoNoBanco(comGravacao.gravadas),
      provedor: () => ({ ok: false, codigo: 'server_error', status: 503 }),
    })
    const corpo = relatorio(await publicar(depois))

    expect(corpo.pendenciaDeGravacao?.motivo).toBe('republicar_para_desligar_gravacao')
    expect(corpo.pendenciaDeGravacao?.propositos).toEqual([...PROPOSITOS])
  })

  test('publicação bem-sucedida com a gravação desligada não deixa pendência', async () => {
    const comGravacao = bancada()
    await publicar(comGravacao)

    const depois = bancada({
      politica: { ...POLITICA, recording_enabled: false },
      publicacoes: comoNoBanco(comGravacao.gravadas),
    })
    const corpo = relatorio(await publicar(depois))

    expect(depois.chamadas).toHaveLength(4)
    expect(corpo.pendenciaDeGravacao).toBeNull()
  })

  test('com a gravação ligada não há pendência: quem fala do atraso é o estado', async () => {
    const banca = bancada({ provedor: () => ({ ok: false, status: 503 }) })
    expect(relatorio(await publicar(banca)).pendenciaDeGravacao).toBeNull()
  })
})

describe('registro das idas ao provedor', () => {
  test('uma linha de integration_events por chamada, com direção, provedor e latência', async () => {
    const banca = bancada()
    await publicar(banca)

    expect(eventosDosPropositos(banca)).toHaveLength(4)
    for (const evento of eventosDosPropositos(banca)) {
      expect(evento.account_id).toBe(CONTA)
      expect(evento.direction).toBe('outbound')
      expect(evento.provider).toBe('voz')
      expect(evento.endpoint).toBe('convai/agents')
      expect(evento.status_code).toBe(200)
      expect(evento.latency_ms).toBe(120)
      // Publicar não nasce de ligação nenhuma.
      expect(evento.correlation_id).toBeNull()
    }
  })

  test('a chamada que falhou também deixa linha, com o código do provedor', async () => {
    const banca = bancada({
      provedor: () => ({ ok: false, codigo: 'invalid_api_key', status: 401, latenciaMs: 30 }),
    })
    await publicar(banca)

    expect(eventosDosPropositos(banca)).toHaveLength(4)
    // O código do provedor entra no registro e não na resposta: quem depura
    // precisa dele, quem administra a conta precisa da frase.
    expect(eventosDosPropositos(banca)[0]?.response.codigo).toBe('invalid_api_key')
  })

  test('evento que não grava não muda o desfecho, mas aparece em semRegistro', async () => {
    const banca = bancada({ eventoFalha: true })
    const corpo = relatorio(await publicar(banca))

    expect(corpo.publicados).toBe(4)
    expect(corpo.semRegistro).toEqual([...PROPOSITOS])
  })
})

describe('nada de segredo no corpo', () => {
  test('a resposta serializada não carrega chave do provedor, chave do servidor nem segredo derivado', async () => {
    const banca = bancada()
    const corpo = relatorio(await publicar(banca))
    const serializado = JSON.stringify(corpo)
    const derivado = await derivarSegredoDeFerramenta(CHAVE_DO_SERVIDOR, CONTA)

    expect(serializado).not.toContain(CHAVE_DA_VOZ)
    expect(serializado).not.toContain(CHAVE_DO_SERVIDOR)
    expect(serializado).not.toContain(derivado)
  })

  test('identificador ecoado com a chave dentro derruba a resposta inteira', async () => {
    // Provedor que devolvesse parte da credencial no identificador furaria a
    // regra em silêncio. A rede de segurança prefere não responder.
    const banca = bancada({
      provedor: () => ({ ok: true, providerAgentId: `agente-${CHAVE_DA_VOZ}`, status: 200 }),
    })
    const resposta = await publicar(banca)

    expect(resposta.status).toBe(500)
    expect(recusa(resposta).motivo).toBe('falha_interna')
  })

  test('o segredo derivado e a conversa viajam no cabeçalho de cada ferramenta nossa', async () => {
    const banca = bancada()
    await publicar(banca)
    const derivado = await derivarSegredoDeFerramenta(CHAVE_DO_SERVIDOR, CONTA)

    for (const chamada of banca.chamadas) {
      const nossas = webhooks(chamada.corpo)
      expect(nossas.length).toBeGreaterThan(0)
      for (const nossa of nossas) {
        expect(nossa.api_schema.request_headers['x-tool-secret']).toBe(derivado)
        // P-11: a conversa desce por cabeçalho, com a variável de sistema do
        // provedor. Sem ela, o esqueleto responde 404 em toda chamada.
        expect(nossa.api_schema.request_headers['x-conversation-id']).toBe('{{system__conversation_id}}')
        expect(nossa.api_schema.url).toBe(`${ENDERECO}/${nossa.name}`)
        // O nome da chave contém `secret`, que é o que faz o gatilho de redação
        // de integration_events escondê-la sozinho.
        expect(Object.keys(nossa.api_schema.request_headers)[0]).toMatch(/secret/)
      }
    }
  })
})

/**
 * O conjunto exato de cada publicação na fatia publicada, em dado (RF-309). É a
 * garantia estrutural de que lembrete não qualifica e resgate não marca reunião
 * nova: a lista é comparada inteira, então ferramenta a mais reprova igual à
 * ferramenta a menos.
 */
const ESPERADAS_POR_PROPOSITO: Readonly<Record<Proposito, readonly string[]>> = {
  discovery: ['tool-transfer', 'tool-dnc', 'end_call', 'transfer_to_number', 'voicemail_detection'],
  reminder: ['tool-transfer', 'tool-dnc', 'end_call', 'transfer_to_number', 'voicemail_detection'],
  rescue: ['tool-transfer', 'tool-dnc', 'end_call', 'transfer_to_number', 'voicemail_detection'],
  followup: ['tool-transfer', 'tool-dnc', 'end_call', 'transfer_to_number', 'voicemail_detection'],
}

/**
 * As ferramentas nossas que ainda não vão ao ar, com a fatia que as traz. A
 * qualificação é da F4 e a agenda é da F5 e da F6; cada uma sai daqui para
 * `ESPERADAS_POR_PROPOSITO` no dia em que a fatia dela subir.
 */
const AINDA_FORA_DA_PUBLICACAO: ReadonlyMap<string, Fatia> = new Map([
  ['tool-qualify', 'F4'],
  ['tool-availability', 'F5'],
  ['tool-book-meeting', 'F5'],
  ['tool-confirm-meeting', 'F6'],
  ['tool-reschedule', 'F6'],
])

function nomesDasFerramentas(corpo: CorpoDoProvedor): string[] {
  return corpo.conversation_config.agent.prompt.tools.map((ferramenta) => ferramenta.name)
}

function webhooks(corpo: CorpoDoProvedor) {
  return corpo.conversation_config.agent.prompt.tools.flatMap((ferramenta) =>
    ferramenta.type === 'webhook' ? [ferramenta] : [],
  )
}

function deSistema(corpo: CorpoDoProvedor, nome: string) {
  return corpo.conversation_config.agent.prompt.tools.find(
    (ferramenta) => ferramenta.type === 'system' && ferramenta.name === nome,
  )
}

describe('as ferramentas de cada publicação (RF-309, T-02)', () => {
  test('a lista esperada é a da fatia publicada', () => {
    // Subir a fatia sem mexer nas listas deste arquivo derruba esta linha, que
    // é onde a mudança do conjunto precisa ser consciente.
    expect(FATIA_PUBLICADA).toBe('F3')
  })

  test('as que ainda não entram são as do catálogo, com a fatia do catálogo', () => {
    const doCatalogo = new Map(CATALOGO_DE_FERRAMENTAS.map((f) => [f.nome, f.entraNa]))
    for (const [nome, fatia] of AINDA_FORA_DA_PUBLICACAO) expect({ nome, fatia: doCatalogo.get(nome) }).toEqual({ nome, fatia })
    // Toda ferramenta do catálogo está numa das duas listas, e só numa.
    const publicadas = new Set(Object.values(ESPERADAS_POR_PROPOSITO).flat())
    for (const { nome } of CATALOGO_DE_FERRAMENTAS) {
      expect({ nome, emUmaSo: publicadas.has(nome) !== AINDA_FORA_DA_PUBLICACAO.has(nome) }).toEqual({
        nome,
        emUmaSo: true,
      })
    }
  })

  test.each([...PROPOSITOS])('%s vai ao ar com exatamente as ferramentas esperadas', async (proposito) => {
    const banca = bancada()
    await publicar(banca)

    const chamada = banca.chamadas.find((item) => item.proposito === proposito)
    expect(chamada).toBeDefined()
    if (chamada === undefined) return
    expect(nomesDasFerramentas(chamada.corpo)).toEqual(ESPERADAS_POR_PROPOSITO[proposito])
    const serializado = JSON.stringify(chamada.corpo)
    for (const nome of AINDA_FORA_DA_PUBLICACAO.keys()) expect(serializado).not.toContain(nome)
  })

  test('transfer_to_number vai sem número fixo, com o destino escrito pela resposta de tool-transfer', async () => {
    const banca = bancada()
    await publicar(banca)

    for (const chamada of banca.chamadas) {
      const transferencia = deSistema(chamada.corpo, 'transfer_to_number')
      const destinos =
        transferencia?.type === 'system' ? (transferencia.params?.transfers ?? []) : []
      expect(destinos).toHaveLength(1)
      for (const destino of destinos) {
        expect(destino.transfer_destination).toEqual({
          type: 'phone_dynamic_variable',
          phone_number: DESTINO_DA_TRANSFERENCIA.variavel,
        })
      }
      // Nenhum telefone no corpo: o destino é o do dia, lido por tool-transfer.
      expect(JSON.stringify(chamada.corpo.conversation_config.agent.prompt.tools)).not.toMatch(/\+?\d{10,}/)

      const nossa = webhooks(chamada.corpo).find((f) => f.name === 'tool-transfer')
      expect(nossa?.assignments).toEqual([
        { source: 'response', dynamic_variable: 'transfer_number', value_path: 'data.transfer_number' },
      ])
      expect(webhooks(chamada.corpo).find((f) => f.name === 'tool-dnc')?.assignments).toEqual([])
      expect(chamada.corpo.conversation_config.agent.dynamic_variables.dynamic_variable_placeholders).toEqual({
        ...VALOR_INICIAL_DA_VARIAVEL,
        transfer_number: '',
      })
    }
  })

  test('voicemail_detection entra nos quatro propósitos (T-03, RF-418)', async () => {
    const banca = bancada()
    await publicar(banca)

    expect(banca.chamadas.map((chamada) => chamada.proposito).sort()).toEqual([...PROPOSITOS].sort())
    for (const chamada of banca.chamadas) {
      expect(deSistema(chamada.corpo, 'voicemail_detection')).toEqual({ type: 'system', name: 'voicemail_detection' })
    }
  })

  test('o corpo de cada ferramenta nossa declara os campos, com os obrigatórios', async () => {
    const banca = bancada()
    await publicar(banca)

    const [chamada] = banca.chamadas
    const porNome = new Map(webhooks(chamada?.corpo as CorpoDoProvedor).map((f) => [f.name, f]))
    expect(porNome.get('tool-dnc')?.api_schema.request_body_schema.required).toEqual(['reason'])
    expect(porNome.get('tool-dnc')?.api_schema.request_body_schema.properties.reason?.enum).toEqual([
      'lead_request',
      'wrong_number',
    ])
    expect(porNome.get('tool-transfer')?.api_schema.request_body_schema.required).toEqual(['reason'])
    for (const ferramenta of porNome.values()) expect(ferramenta.description.trim()).not.toBe('')
  })
})

describe('a agenda nas publicações da F5 (US-174, T-01, RF-309)', () => {
  // A publicação de verdade contra o provedor de voz exige rede e chave, e é do
  // CI e da verificação manual (`scripts/sonda-de-publicacao.ts`). Aqui se
  // prova o que vai no corpo de cada propósito, com o provedor dublado, na
  // fatia que ainda não subiu.
  function publicarNa(banca: Bancada, fatia: Fatia): Promise<RespostaDaPublicacao> {
    return atenderPublicacao(
      { metodo: 'POST', contaId: CONTA, autorizacao: AUTORIZACAO },
      banca.porta,
      { enderecoDasFerramentas: ENDERECO, agora: () => new Date(INSTANTE), fatia },
    )
  }

  const DE_SISTEMA = ['end_call', 'transfer_to_number', 'voicemail_detection']

  /** A lista inteira de cada publicação na F5: a mais reprova igual à de menos. */
  const NA_F5: Readonly<Record<Proposito, readonly string[]>> = {
    discovery: ['tool-transfer', 'tool-dnc', 'tool-qualify', 'tool-availability', 'tool-book-meeting', ...DE_SISTEMA],
    reminder: ['tool-transfer', 'tool-dnc', ...DE_SISTEMA],
    rescue: ['tool-transfer', 'tool-dnc', 'tool-qualify', ...DE_SISTEMA],
    followup: ['tool-transfer', 'tool-dnc', 'tool-qualify', 'tool-availability', 'tool-book-meeting', ...DE_SISTEMA],
  }

  const AGENDA = CATALOGO_DE_FERRAMENTAS.filter((f) => f.dependeDeAgenda).map((f) => f.nome)

  test.each([...PROPOSITOS])('%s vai ao ar na F5 com exatamente a lista esperada', async (proposito) => {
    const banca = bancada()
    await publicarNa(banca, 'F5')

    const chamada = banca.chamadas.find((item) => item.proposito === proposito)
    expect(chamada).toBeDefined()
    if (chamada === undefined) return
    expect(nomesDasFerramentas(chamada.corpo)).toEqual(NA_F5[proposito])
  })

  test.each(['reminder', 'rescue'] as const)(
    '%s não leva nenhuma ferramenta de agenda: o nome nem aparece no corpo',
    async (proposito) => {
      const banca = bancada()
      await publicarNa(banca, 'F5')

      const serializado = JSON.stringify(banca.chamadas.find((item) => item.proposito === proposito)?.corpo)
      expect(AGENDA).toEqual(['tool-availability', 'tool-book-meeting', 'tool-confirm-meeting', 'tool-reschedule'])
      for (const nome of AGENDA) expect(serializado).not.toContain(nome)
    },
  )

  test.each(['discovery', 'followup'] as const)(
    '%s leva as duas de agenda com prazo de 5 s escrito, endereço e segredo',
    async (proposito) => {
      const banca = bancada()
      await publicarNa(banca, 'F5')
      const derivado = await derivarSegredoDeFerramenta(CHAVE_DO_SERVIDOR, CONTA)

      const chamada = banca.chamadas.find((item) => item.proposito === proposito)
      const porNome = new Map(webhooks(chamada!.corpo).map((f) => [f.name, f]))
      for (const nome of ['tool-availability', 'tool-book-meeting']) {
        const ferramenta = porNome.get(nome)
        // P-01: o corte é nosso e viaja escrito. Sem a chave, vale o padrão do
        // provedor, que é maior que o orçamento do esqueleto.
        expect(Object.hasOwn(ferramenta ?? {}, 'response_timeout_secs')).toBe(true)
        expect(ferramenta?.response_timeout_secs).toBe(5)
        expect(ferramenta?.api_schema.url).toBe(`${ENDERECO}/${nome}`)
        expect(ferramenta?.api_schema.request_headers['x-tool-secret']).toBe(derivado)
        expect(ferramenta?.description.trim()).not.toBe('')
      }
      const marcacao = porNome.get('tool-book-meeting')?.api_schema.request_body_schema
      expect(marcacao?.required).toEqual(['slot_position', 'modality'])
      expect(marcacao?.properties.modality?.enum).toEqual(['video', 'telefone', 'presencial'])
      expect(porNome.get('tool-availability')?.api_schema.request_body_schema.required).toEqual([])
    },
  )

  test('a descoberta volta a oferecer horário: o fechamento sem agenda sai do prompt (O-06)', async () => {
    const banca = bancada()
    await publicarNa(banca, 'F5')

    const prompt = banca.chamadas.find((item) => item.proposito === 'discovery')?.corpo.conversation_config.agent
      .prompt.prompt
    expect(prompt).toContain('fechamento_de_descoberta_com_agenda')
    expect(prompt).not.toContain('fechamento_de_descoberta_sem_agenda')
  })

  test('acrescentar as ferramentas muda o hash de descoberta e retomada, e não o de lembrete e resgate (RF-313)', async () => {
    const naF4 = bancada()
    await publicarNa(naF4, 'F4')
    const naF5 = bancada()
    await publicarNa(naF5, 'F5')

    const hashDe = (gravadas: readonly LinhaDePublicacao[], proposito: Proposito) =>
      gravadas.find((linha) => linha.proposito === proposito)?.publishedHash
    const mudou = Object.fromEntries(
      PROPOSITOS.map((proposito) => [proposito, hashDe(naF4.gravadas, proposito) !== hashDe(naF5.gravadas, proposito)]),
    )
    expect(mudou).toEqual({ discovery: true, reminder: false, rescue: false, followup: true })
  })

  test('republicar na F5 o que foi ao ar na F4 vai ao provedor só por descoberta e retomada', async () => {
    const naF4 = bancada()
    await publicarNa(naF4, 'F4')

    // Idempotência por hash: lembrete e resgate não mudaram, e o dublê conta.
    const naF5 = bancada({ publicacoes: comoNoBanco(naF4.gravadas) })
    const corpo = relatorio(await publicarNa(naF5, 'F5'))

    expect(naF5.chamadas.map((chamada) => chamada.proposito).sort()).toEqual(['discovery', 'followup'])
    expect(naF5.gravadas.map((linha) => linha.proposito).sort()).toEqual(['discovery', 'followup'])
    expect(corpo.estado).toBe('publicado')
  })
})

describe('classificarFalha', () => {
  test('separa o que pede ação de quem administra do que pede só esperar', () => {
    expect(classificarFalha({ ok: false, status: 401, codigo: 'invalid_api_key' })).toBe(
      'provedor_recusou',
    )
    expect(classificarFalha({ ok: false, status: 400 })).toBe('provedor_recusou')
    expect(classificarFalha({ ok: false, status: 429 })).toBe('provedor_indisponivel')
    expect(classificarFalha({ ok: false, status: 503 })).toBe('provedor_indisponivel')
    expect(classificarFalha({ ok: false, status: null, codigo: 'TimeoutError' })).toBe(
      'provedor_indisponivel',
    )
  })
})

describe('propositosComGravacaoPendente (a régua da tela de privacidade)', () => {
  const hashes = { discovery: 'a', reminder: 'b', rescue: 'c', followup: 'd' }

  test('com a gravação ligada não há pendência', () => {
    const noAr = [{ purpose: 'discovery', status: 'publicado', published_hash: 'velho' }]
    expect(propositosComGravacaoPendente(true, hashes, noAr)).toEqual([])
  })

  test('desligada, conta só o que está no ar com hash diferente', () => {
    const noAr = [
      { purpose: 'discovery', status: 'publicado', published_hash: 'velho' },
      { purpose: 'reminder', status: 'publicado', published_hash: 'b' },
      // Linha de falha nunca foi ao ar: não há o que gravar lá fora por ela.
      { purpose: 'rescue', status: 'falha', published_hash: 'velho' },
    ]
    expect(propositosComGravacaoPendente(false, hashes, noAr)).toEqual(['discovery'])
  })
})

describe('os webhooks da ElevenLabs na publicação', () => {
  test('a primeira publicação cadastra os dois, e o relatório diz', async () => {
    const banca = bancada()
    const corpo = relatorio(await publicar(banca))

    expect(corpo.webhooks).toEqual({ estado: 'cadastrados', motivo: null, mensagem: null })
    expect(banca.workspace.configuracao).toMatchObject({
      conversation_initiation_client_data_webhook: { url: `${ENDERECO}/call-init?conta=${CONTA}` },
      webhooks: { post_call_webhook_id: 'wh_1' },
    })
    // As duas escritas deixam rastro, sem segredo nenhum dentro.
    const doPasso = banca.eventos.filter((evento) => evento.request.passo === 'webhooks')
    expect(doPasso.map((evento) => evento.endpoint)).toEqual([
      CAMINHO_DOS_WEBHOOKS,
      CAMINHO_DA_CONFIGURACAO_DE_CONVERSA,
    ])
    expect(JSON.stringify(doPasso)).not.toContain('wsec_')
  })

  test('a segunda publicação sem mudança não recria o webhook nem chama os agentes', async () => {
    const primeira = bancada()
    await publicar(primeira)

    const segunda = bancada({ publicacoes: comoNoBanco(primeira.gravadas), workspace: primeira.workspace })
    const corpo = relatorio(await publicar(segunda))

    expect(segunda.chamadas).toHaveLength(0)
    expect(corpo.webhooks.estado).toBe('em_dia')
    expect(idasCom(segunda.workspace, 'POST', CAMINHO_DOS_WEBHOOKS)).toBe(1)
    expect(idasCom(segunda.workspace, 'PATCH', CAMINHO_DA_CONFIGURACAO_DE_CONVERSA)).toBe(1)
  })

  test('falha no cadastro não derruba a publicação: vira pendência com frase', async () => {
    const workspace = criarWorkspaceDublado()
    workspace.falhas.add(`POST ${CAMINHO_DOS_WEBHOOKS}`)
    const corpo = relatorio(await publicar(bancada({ workspace })))

    expect(corpo.publicados).toBe(4)
    expect(corpo.completo).toBe(true)
    expect(corpo.estado).toBe('publicado')
    expect(corpo.webhooks).toEqual({
      estado: 'falha',
      motivo: 'aviso_de_fim_nao_criado',
      mensagem: MENSAGENS_DOS_WEBHOOKS.aviso_de_fim_nao_criado,
    })
  })

  test('com a chave da plataforma o workspace é da instalação, e nada é cadastrado', async () => {
    const banca = bancada({ origem: 'plataforma' })
    const corpo = relatorio(await publicar(banca))
    expect(corpo.webhooks.estado).toBe('da_instalacao')
    expect(banca.workspace.idas).toEqual([])
  })

  test('o segredo do fim e o do início não saem no corpo', async () => {
    const banca = bancada()
    const serializado = JSON.stringify(relatorio(await publicar(banca)))
    expect(serializado).not.toContain(banca.workspace.cofre.get(CONTA)?.segredo ?? 'sem-segredo')
    expect(serializado).not.toContain(await derivarSegredoDoInicio(CHAVE_DO_SERVIDOR, CONTA))
  })

  test('todo agente publicado busca o contexto no webhook de início e aceita a primeira fala dele', async () => {
    const banca = bancada()
    await publicar(banca)
    for (const chamada of banca.chamadas) {
      expect(chamada.corpo.platform_settings.overrides).toEqual({
        enable_conversation_initiation_client_data_from_webhook: true,
        conversation_config_override: { agent: { first_message: true } },
      })
    }
  })
})

describe('tool-qualify na publicação da F4 (US-137, T-01, RF-309)', () => {
  // A publicação de verdade contra o provedor de voz exige rede e chave, e é do
  // CI e da verificação manual (`scripts/sonda-de-publicacao.ts`). Aqui se
  // prova a compilação da lista de ferramentas por propósito, com o provedor
  // dublado, na fatia que ainda não subiu.
  function publicarNaF4(banca: Bancada): Promise<RespostaDaPublicacao> {
    return atenderPublicacao(
      { metodo: 'POST', contaId: CONTA, autorizacao: AUTORIZACAO },
      banca.porta,
      { enderecoDasFerramentas: ENDERECO, agora: () => new Date(INSTANTE), fatia: 'F4' },
    )
  }

  const COM_QUALIFICACAO: ReadonlySet<Proposito> = new Set(['discovery', 'rescue', 'followup'])

  test.each([...PROPOSITOS])('%s leva tool-qualify só se o propósito qualifica', async (proposito) => {
    const banca = bancada()
    await publicarNaF4(banca)

    const chamada = banca.chamadas.find((item) => item.proposito === proposito)
    expect(chamada).toBeDefined()
    if (chamada === undefined) return
    expect(nomesDasFerramentas(chamada.corpo).includes('tool-qualify')).toBe(COM_QUALIFICACAO.has(proposito))
    // Ausência de ferramenta é garantia: o nome nem aparece no corpo do lembrete.
    if (!COM_QUALIFICACAO.has(proposito)) expect(JSON.stringify(chamada.corpo)).not.toContain('tool-qualify')
  })

  test('a ferramenta vai com prazo de 5 s e o esquema do descritor', async () => {
    const banca = bancada()
    await publicarNaF4(banca)

    const descoberta = banca.chamadas.find((item) => item.proposito === 'discovery')
    const ferramenta = webhooks(descoberta!.corpo).find((item) => item.name === 'tool-qualify')
    expect(ferramenta?.response_timeout_secs).toBe(5)
    expect(ferramenta?.api_schema.url).toBe(`${ENDERECO}/tool-qualify`)
    const esquema = ferramenta?.api_schema.request_body_schema
    expect(esquema?.required).toEqual(['stage_key'])
    expect(esquema?.properties.sentiment?.type).toBe('number')
    expect(esquema?.properties.criterios?.type).toBe('object')
    expect(esquema?.properties.meeting_outcome?.enum).toEqual(['attended', 'no_show', 'unknown'])
  })

  test('na fatia publicada nada muda: tool-qualify continua fora', async () => {
    const banca = bancada()
    await publicar(banca)
    for (const chamada of banca.chamadas) expect(nomesDasFerramentas(chamada.corpo)).not.toContain('tool-qualify')
  })
})

// A avaliação que vai ao provedor é a que a finalização aplica (US-142) ------------

describe('os critérios de avaliação saem da mesma fonte que a finalização aplica', () => {
  const DA_CONTA: readonly LinhaDeCriterio[] = [
    ...LINHAS_DA_SEMENTE,
    { key: 'falou_do_frete', label: 'Perguntou pelo frete', obrigatorio: false, como: 'modelo', trechos: [], position: 7 },
  ]

  test.each([...PROPOSITOS])('%s: o provedor recebe exatamente a lista que call-finalize aplica', async (proposito) => {
    const banca = bancada({ criterios: DA_CONTA })
    await publicar(banca)

    const chamada = banca.chamadas.find((item) => item.proposito === proposito)
    expect(chamada).toBeDefined()
    const enviados = chamada!.corpo.platform_settings.evaluation.criteria.map((criterio) => criterio.id)
    const aplicados = criteriosAplicados(proposito, DA_CONTA, { ligada: true, aviso: null }).map((c) => c.key)
    expect(enviados).toEqual(aplicados)
    expect(enviados).toContain('falou_do_frete')
    expect(enviados).toContain('identificacao_honesta')
    // A chave em comum com a camada 1 não vira segundo critério.
    expect(enviados.filter((id) => id === 'aviso_gravacao')).toHaveLength(1)
  })

  test('critério da conta entra no hash: editá-lo pede republicação', async () => {
    const antes = bancada({ criterios: DA_CONTA })
    await publicar(antes)
    const depois = bancada({
      criterios: DA_CONTA.map((linha) => (linha.key === 'falou_do_frete' ? { ...linha, label: 'Falou do frete' } : linha)),
    })
    await publicar(depois)
    expect(depois.gravadas.map((linha) => linha.publishedHash)).not.toEqual(
      antes.gravadas.map((linha) => linha.publishedHash),
    )
  })
})
