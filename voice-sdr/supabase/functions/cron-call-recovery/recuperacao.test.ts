// cron-call-recovery: os quatro ramos com os números da seção 4.6 (3 min,
// max + 60 s, max + 10 min), a via dupla com e sem o aviso do provedor, o
// disjuntor em N e não em N-1, a classificação com teto e a desistência de
// cada ramo.
//
// O dublê é um `calls` em memória. `reivindicarChamadas` é burra de propósito:
// devolve toda chamada que não desistiu nem terminou de vez, sem o recuo nem os
// limiares — quem decide o ramo tem que ser o módulo, e a rede do SQL se prova
// em `testes/banco/recuperacao-de-chamadas.test.ts`.
//
// **A via dupla usa o `call-finalize` de verdade.** A porta `finalizar` chama
// `finalizarChamada` com uma camada de dados em memória cuja reivindicação é o
// update condicionado ao pé da letra. É ela, e não esta rotina, que garante uma
// finalização só (US-069): o teste do aviso e da varredura no mesmo segundo
// conta as escritas do desfecho, e não o resultado final.

import { LINHAS_DA_SEMENTE } from '../_shared/qualificacao/avaliacao.ts'
import { describe, expect, test } from 'vitest'

import {
  finalizarChamada,
  type DesfechoDaChamada,
  type PortaDaFinalizacao,
} from '../call-finalize/finalizacao.ts'
import type { LinhaDeFim, PortaDeExecucao } from '../_shared/rotinas/execucao.ts'

import {
  atenderRotina,
  AUTOR_DO_DISJUNTOR,
  decisaoDaConsulta,
  disjuntorDispara,
  JANELA_DA_TRANSCRICAO_MS,
  lerEstadoDaConversa,
  MOTIVO_DO_DISJUNTOR,
  NOME_DA_ROTINA,
  ramoDaChamada,
  recuperarChamadas,
  TETO_DE_CLASSIFICACOES,
  TETO_DE_ENCERRAMENTOS,
  type ChamadaEmRecuperacao,
  type ContaDoDisjuntor,
  type EstadoDaConversa,
  type FimDaPerda,
  type FreioDoDisjuntor,
  type LinhaDoDisjuntor,
  type NotaDaRecuperacao,
  type PortaDaRecuperacao,
} from './recuperacao.ts'

const INICIO = Date.parse('2026-09-23T15:00:00.000Z')
const SEGUNDO = 1000
const MINUTO = 60 * SEGUNDO
const MAXIMO_EM_SEGUNDOS = 600
const MAXIMO = MAXIMO_EM_SEGUNDOS * SEGUNDO

const CONTA = 'abcdef00-0000-4000-8000-00000000c0a1'
const CHAMADA = 'abcdef00-0000-4000-8000-0000000ca11a'
const CONVERSA = 'conv_recuperacao_0001'
const SID = 'CA0000000000000000000000000000dead'
const SEGREDO = 'segredo-interno-da-instalacao'

function em(ms: number): string {
  return new Date(ms).toISOString()
}

interface Linha {
  id: string
  account_id: string
  status: ChamadaEmRecuperacao['status']
  provider_call_sid: string | null
  provider_conversation_id: string | null
  started_at: string
  answered_at: string | null
  ended_at: string | null
  end_reason: string | null
  finalized_at: string | null
  finalize_started_at: string | null
  answered_by: string | null
  classification_source: string | null
  recovery_attempts: number
  classify_attempts: number
  recovery_note: string | null
  recovery_gave_up_at: string | null
  classify_gave_up_at: string | null
  max_duration_seconds: number
}

/** Chamada viva, discada às 15h00, com conversa no provedor. */
function viva(ajustes: Partial<Linha> = {}): Linha {
  return {
    id: CHAMADA,
    account_id: CONTA,
    status: 'ringing',
    provider_call_sid: SID,
    provider_conversation_id: CONVERSA,
    started_at: em(INICIO),
    answered_at: null,
    ended_at: null,
    end_reason: null,
    finalized_at: null,
    finalize_started_at: null,
    answered_by: null,
    classification_source: null,
    recovery_attempts: 0,
    classify_attempts: 0,
    recovery_note: null,
    recovery_gave_up_at: null,
    classify_gave_up_at: null,
    max_duration_seconds: MAXIMO_EM_SEGUNDOS,
    ...ajustes,
  }
}

function recorte(linha: Linha): ChamadaEmRecuperacao {
  return {
    id: linha.id,
    account_id: linha.account_id,
    status: linha.status,
    provider_call_sid: linha.provider_call_sid,
    provider_conversation_id: linha.provider_conversation_id,
    started_at: linha.started_at,
    answered_at: linha.answered_at,
    ended_at: linha.ended_at,
    end_reason: linha.end_reason,
    finalized_at: linha.finalized_at,
    answered_by: linha.answered_by,
    classification_source: linha.classification_source,
    recovery_attempts: linha.recovery_attempts,
    classify_attempts: linha.classify_attempts,
    max_duration_seconds: linha.max_duration_seconds,
  }
}

/** A conversa como o provedor a devolve depois do fim. */
function conversaPronta(duracao = 90): Record<string, unknown> {
  return {
    conversation_id: CONVERSA,
    status: 'done',
    has_audio: false,
    transcript: [
      { role: 'agent', message: 'Oi, aqui é a Sarah.', time_in_call_secs: 1 },
      { role: 'user', message: 'Oi, pode falar.', time_in_call_secs: 4 },
      {
        role: 'agent',
        message: 'Obrigada, até mais!',
        time_in_call_secs: duracao - 2,
        tool_calls: [{ tool_name: 'end_call', params_as_json: '{}' }],
      },
    ],
    metadata: { start_time_unix_secs: INICIO / 1000, call_duration_secs: duracao },
  }
}

interface Bancada {
  readonly linha: Linha
  readonly porta: PortaDaRecuperacao
  readonly execucao: PortaDeExecucao
  readonly tocados: string[]
  readonly desfechos: DesfechoDaChamada[]
  readonly fechamentos: FimDaPerda[]
  readonly reprogramacoes: string[]
  readonly encerramentos: string[]
  readonly classificacoes: string[]
  readonly finalizacoes: number[]
  readonly freios: FreioDoDisjuntor[]
  readonly registrosDoDisjuntor: LinhaDoDisjuntor[]
  readonly execucoes: LinhaDeFim[]
  /** Aciona `call-finalize` como o aviso do provedor aciona, com o relógio dado. */
  avisoDoProvedor(agora: number): ReturnType<typeof finalizarChamada>
  estado: EstadoDaConversa
  /** O que `call-finalize` responde ao buscar a conversa. */
  provedorDeVozFora: boolean
  telefoniaRecusa: boolean
  respostaDaClassificacao: number
  contas: ContaDoDisjuntor[]
  contaParada: boolean
  /** O relógio que `call-finalize` recebe, o mesmo da passagem. */
  readonly relogio: { agora: string }
}

function bancada(linha: Linha = viva(), ajustes: { duracaoDaConversa?: number } = {}): Bancada {
  const tocados: string[] = []
  const desfechos: DesfechoDaChamada[] = []
  const fechamentos: FimDaPerda[] = []
  const reprogramacoes: string[] = []
  const encerramentos: string[] = []
  const classificacoes: string[] = []
  const finalizacoes: number[] = []
  const freios: FreioDoDisjuntor[] = []
  const registrosDoDisjuntor: LinhaDoDisjuntor[] = []
  const execucoes: LinhaDeFim[] = []

  // A camada de dados de `call-finalize`, sobre a mesma linha.
  const portaDaFinalizacao: PortaDaFinalizacao = {
    async reivindicar(chamadaId, agora, vencidaAntesDe) {
      // O update condicionado de T-15, num passo só: nada de `await` entre
      // a conferência e a marca.
      if (chamadaId !== linha.id || linha.finalized_at !== null) return null
      const livre =
        linha.finalize_started_at === null || Date.parse(linha.finalize_started_at) < Date.parse(vencidaAntesDe)
      if (!livre) return null
      linha.finalize_started_at = agora
      return {
        id: linha.id,
        account_id: linha.account_id,
        lead_id: null,
        direction: 'outbound',
        purpose: 'discovery',
        provider_conversation_id: linha.provider_conversation_id,
        started_at: linha.started_at,
        classification_source: linha.classification_source,
        end_reason: linha.end_reason,
      }
    },
    async politicaDaConta() {
      return {
        gravacaoLigada: false,
        retencaoEmDias: 90,
        avisoDeGravacao: null,
        duracaoMaximaEmSegundos: linha.max_duration_seconds,
      }
    },
    async credencial() {
      return { ok: true, valor: 'chave-do-provedor-de-voz', origem: 'conta' }
    },
    async buscarConversa(conversaId) {
      if (b.provedorDeVozFora) return { ok: false, status: null, endpoint: `convai/conversations/${conversaId}` }
      return { ok: true, status: 200, conversa: conversaPronta(ajustes.duracaoDaConversa) }
    },
    async baixarAudio() {
      return { ok: false, status: 404 }
    },
    async guardarGravacao() {},
    async gravarDesfecho(_conta, _chamada, desfecho) {
      desfechos.push(desfecho)
      linha.status = desfecho.status
      linha.end_reason = desfecho.end_reason
      linha.answered_by = desfecho.answered_by
      linha.ended_at = desfecho.ended_at
    },
    async gravarCustos() {},
    async gravarInvocacoes() {
      return []
    },
    async registrarConsentimento() {},
    async registrarPrimeiraChamadaDeTeste() {},
    async invocacoesDaChamada() {
      return []
    },
    async acionarClassificacao() {
      throw new Error('modelo fora do ar')
    },
    async criteriosDaConta() {
      return LINHAS_DA_SEMENTE
    },
    async registrarAvaliacaoAutomatica() {},
    async registrarEventoDeIntegracao() {},
    async reprogramarTentativa() {},
    // A conversa destes cenários não tem `tool-dnc`: a reaplicação do
    // bloqueio não chega a tocar a porta.
    async numerosDaChamada() {
      throw new Error('a recuperação não pede bloqueio')
    },
    async bloquearNumero() {
      throw new Error('a recuperação não pede bloqueio')
    },
    async abrirItemDeBloqueio() {
      throw new Error('a recuperação não pede bloqueio')
    },
    async registrarMedicaoDaAvaliacao() {
      throw new Error('a recuperação não tem pessoa errada')
    },
    async lerResultadoDaChamada() {
      return { classification_source: null, classification: null, sentiment: null, evaluation: null }
    },
    async gravarSentimento() {},
    async limiaresDaFila() {
      return {
        limiares: { sentiment_floor: -0.5, consecutive_failures_cap: 3, failed_criteria_cap: 1, credit_alert_cents: null },
        fuso: 'America/Sao_Paulo',
      }
    },
    async falhasConsecutivas() {
      return null
    },
    async registrarItemDeFila() {
      return 'criado'
    },
    async concluirFinalizacao(_conta, _chamada, agora) {
      linha.finalized_at = agora
    },
  }

  const real: PortaDaRecuperacao = {
    async reivindicarChamadas() {
      if (linha.recovery_gave_up_at !== null && linha.finalized_at === null) return []
      if (linha.finalized_at !== null && (linha.classify_gave_up_at !== null || linha.classification_source !== null)) {
        return []
      }
      return [recorte(linha)]
    },
    async contasParaODisjuntor() {
      return b.contaParada ? [] : b.contas
    },
    async estadoDaConversa() {
      return b.estado
    },
    async finalizar(chamadaId) {
      const resposta = await finalizarChamada(
        { metodo: 'POST', chamadaId, segredoInterno: SEGREDO },
        portaDaFinalizacao,
        { segredoInterno: SEGREDO, agora: relogio.agora },
      )
      finalizacoes.push(resposta.status)
      return { status: resposta.status }
    },
    async classificar(chamadaId) {
      classificacoes.push(chamadaId)
      if (b.respostaDaClassificacao === 200) linha.classification_source = 'backfill'
      return { status: b.respostaDaClassificacao }
    },
    async marcarDuracaoMaxima() {
      if (linha.end_reason === null && linha.finalized_at === null) linha.end_reason = 'max_duration'
    },
    async encerrarNaTelefonia(_conta, sid) {
      encerramentos.push(sid)
      if (b.telefoniaRecusa) return false
      // A telefonia desliga, e o provedor de voz passa a dizer que acabou.
      b.estado = 'encerrada'
      return true
    },
    async fecharComoPerdida(chamadaId, fim) {
      fechamentos.push(fim)
      if (chamadaId !== linha.id || linha.finalized_at !== null || !fim.de.includes(linha.status)) return false
      linha.status = fim.status
      linha.end_reason = fim.end_reason
      linha.ended_at = fim.ended_at
      return true
    },
    async reprogramar(chamadaId) {
      reprogramacoes.push(chamadaId)
      return 'chave_sem_tentativa'
    },
    async anotar(_chamadaId, nota: NotaDaRecuperacao) {
      Object.assign(linha, nota)
    },
    async acionarDisjuntor(_conta, freio) {
      if (b.contaParada) return false
      b.contaParada = true
      freios.push(freio)
      return true
    },
    async registrarDisjuntor(linhaDoDisjuntor) {
      registrosDoDisjuntor.push(linhaDoDisjuntor)
    },
  }

  const porta = new Proxy(real, {
    get(alvo, nome, receptor) {
      if (typeof nome === 'string') tocados.push(nome)
      return Reflect.get(alvo, nome, receptor)
    },
  })

  let execucaoN = 0
  const execucao: PortaDeExecucao = {
    async inserirExecucao() {
      execucaoN += 1
      return `execucao-${execucaoN}`
    },
    async concluirExecucao(_id, fim) {
      execucoes.push(fim)
    },
    async itensDasUltimasExecucoes() {
      return []
    },
  }

  const relogio = { agora: em(INICIO) }

  const b: Bancada = {
    linha,
    porta,
    execucao,
    tocados,
    desfechos,
    fechamentos,
    reprogramacoes,
    encerramentos,
    classificacoes,
    finalizacoes,
    freios,
    registrosDoDisjuntor,
    execucoes,
    avisoDoProvedor(agora) {
      return finalizarChamada(
        { metodo: 'POST', chamadaId: linha.id, segredoInterno: SEGREDO },
        portaDaFinalizacao,
        { segredoInterno: SEGREDO, agora: em(agora) },
      )
    },
    estado: 'em_curso',
    provedorDeVozFora: false,
    telefoniaRecusa: false,
    respostaDaClassificacao: 200,
    contas: [],
    contaParada: false,
    relogio,
  }
  return b
}

/** Uma passagem da rotina no instante dado. */
async function passagem(b: Bancada, agora: number) {
  b.relogio.agora = em(agora)
  return recuperarChamadas({ porta: b.porta, execucao: b.execucao, agora: () => agora })
}

describe('os limiares, em função pura', () => {
  test('a órfã: 3 min sem provider_call_sid não é órfã; 3 min e 1 s é', () => {
    const queued = recorte(viva({ status: 'queued', provider_call_sid: null, provider_conversation_id: null }))
    expect(ramoDaChamada(queued, INICIO + 3 * MINUTO)).toEqual({ ramo: 'nenhum' })
    expect(ramoDaChamada(queued, INICIO + 3 * MINUTO + SEGUNDO)).toEqual({ ramo: 'orfa' })

    const tocando = recorte(viva({ status: 'ringing', provider_call_sid: null, provider_conversation_id: null }))
    expect(ramoDaChamada(tocando, INICIO + 3 * MINUTO + SEGUNDO)).toEqual({ ramo: 'orfa' })

    // Com o identificador da telefonia, a linha chegou ao provedor: não é órfã.
    expect(ramoDaChamada(recorte(viva({ status: 'queued' })), INICIO + 30 * MINUTO)).toEqual({ ramo: 'consultar' })
  })

  test('o vigia: em curso em max + 60 s aguarda; em max + 61 s encerra', () => {
    const chamada = recorte(viva())
    expect(decisaoDaConsulta(chamada, 'em_curso', INICIO + MAXIMO + 60 * SEGUNDO)).toEqual({ decisao: 'aguardar' })
    expect(decisaoDaConsulta(chamada, 'em_curso', INICIO + MAXIMO + 61 * SEGUNDO)).toEqual({
      decisao: 'encerrar_por_duracao',
    })
  })

  test('o vigia conta do atendimento quando ele está gravado', () => {
    const chamada = recorte(viva({ answered_at: em(INICIO + 5 * MINUTO) }))
    expect(decisaoDaConsulta(chamada, 'em_curso', INICIO + MAXIMO + 2 * MINUTO)).toEqual({ decisao: 'aguardar' })
    expect(decisaoDaConsulta(chamada, 'em_curso', INICIO + 5 * MINUTO + MAXIMO + 61 * SEGUNDO)).toEqual({
      decisao: 'encerrar_por_duracao',
    })
  })

  test('a idade máxima: sem resposta em max + 10 min aguarda; em max + 10 min e 1 s está perdida', () => {
    const chamada = recorte(viva({ status: 'in_progress' }))
    expect(decisaoDaConsulta(chamada, 'sem_resposta', INICIO + MAXIMO + 10 * MINUTO)).toEqual({ decisao: 'aguardar' })
    expect(decisaoDaConsulta(chamada, 'sem_resposta', INICIO + MAXIMO + 10 * MINUTO + SEGUNDO)).toEqual({
      decisao: 'perdida',
    })
  })

  test('conversa encerrada no provedor vai para a finalização, a qualquer tempo', () => {
    expect(decisaoDaConsulta(recorte(viva()), 'encerrada', INICIO + MINUTO)).toEqual({ decisao: 'finalizar' })
  })

  test('chamada encerrada sem finalized_at vai direto para a finalização', () => {
    const perdida = recorte(viva({ status: 'ended', end_reason: 'provider_lost', ended_at: em(INICIO) }))
    expect(ramoDaChamada(perdida, INICIO + MINUTO)).toEqual({ ramo: 'finalizar' })
  })

  test('finalizada por gente sem classificação vai para a classificação; por máquina, não', () => {
    const finalizada = { finalized_at: em(INICIO), status: 'ended' as const }
    expect(ramoDaChamada(recorte(viva({ ...finalizada, answered_by: 'human' })), INICIO)).toEqual({
      ramo: 'classificar',
    })
    expect(ramoDaChamada(recorte(viva({ ...finalizada, answered_by: 'machine' })), INICIO)).toEqual({ ramo: 'nenhum' })
    expect(
      ramoDaChamada(recorte(viva({ ...finalizada, answered_by: 'human', classification_source: 'backfill' })), INICIO),
    ).toEqual({ ramo: 'nenhum' })
  })

  test('o estado da conversa lido do corpo do provedor', () => {
    expect(lerEstadoDaConversa({ status: 'in-progress' })).toBe('em_curso')
    expect(lerEstadoDaConversa({ status: 'initiated' })).toBe('em_curso')
    expect(lerEstadoDaConversa({ status: 'processing' })).toBe('encerrada')
    expect(lerEstadoDaConversa({ status: 'done' })).toBe('encerrada')
    expect(lerEstadoDaConversa({ status: 'failed' })).toBe('encerrada')
    // Situação desconhecida espera: o vigia ainda a alcança.
    expect(lerEstadoDaConversa({ status: 'novidade' })).toBe('em_curso')
    expect(lerEstadoDaConversa(null)).toBe('sem_resposta')
  })
})

describe('ramo 1: a via dupla', () => {
  test('com o aviso do provedor desligado, a varredura finaliza na primeira passagem depois do fim', async () => {
    const b = bancada()

    // Um minuto de conversa: ainda no ar, a varredura só pergunta.
    await passagem(b, INICIO + MINUTO)
    expect(b.finalizacoes).toEqual([])
    expect(b.linha.finalized_at).toBeNull()

    // A conversa termina aos 90 s; a passagem seguinte, dois minutos depois
    // da primeira, finaliza. O aviso nunca chegou.
    b.estado = 'encerrada'
    await passagem(b, INICIO + 3 * MINUTO)
    expect(b.finalizacoes).toEqual([200])
    expect(b.desfechos).toHaveLength(1)
    expect(b.linha.finalized_at).toBe(em(INICIO + 3 * MINUTO))
    expect(b.linha).toMatchObject({ status: 'ended', end_reason: 'completed', recovery_attempts: 0 })
  })

  test('o aviso e a varredura no mesmo segundo produzem um desfecho só', async () => {
    const b = bancada()
    b.estado = 'encerrada'
    const mesmoSegundo = INICIO + 3 * MINUTO

    const [aviso] = await Promise.all([b.avisoDoProvedor(mesmoSegundo), passagem(b, mesmoSegundo)])

    expect(b.desfechos).toHaveLength(1)
    // Um dos dois venceu a reivindicação; o outro leu 409.
    const statuses = [aviso.status, ...b.finalizacoes].toSorted()
    expect(statuses).toEqual([200, 409])
    // 409 é resposta certa: a varredura não conta tentativa nem desiste.
    expect(b.linha).toMatchObject({ recovery_attempts: 0, recovery_gave_up_at: null })
  })

  test('a varredura depois do aviso não finaliza de novo', async () => {
    const b = bancada()
    b.estado = 'encerrada'
    expect((await b.avisoDoProvedor(INICIO + 2 * MINUTO)).status).toBe(200)

    await passagem(b, INICIO + 4 * MINUTO)
    expect(b.desfechos).toHaveLength(1)
  })
})

describe('ramo 2: a linha órfã', () => {
  test('queued sem provider_call_sid há 3 min e 1 s vira failed com dial_lost e é reprogramada', async () => {
    const b = bancada(viva({ status: 'queued', provider_call_sid: null, provider_conversation_id: null }))

    await passagem(b, INICIO + 3 * MINUTO)
    expect(b.fechamentos).toEqual([])

    await passagem(b, INICIO + 3 * MINUTO + SEGUNDO)
    expect(b.linha).toMatchObject({ status: 'failed', end_reason: 'dial_lost', ended_at: em(INICIO + 3 * MINUTO + SEGUNDO) })
    expect(b.fechamentos[0]?.de).toEqual(['queued', 'ringing'])
    expect(b.reprogramacoes).toEqual([CHAMADA])
    expect(b.linha.recovery_note).toBe('dial_lost; reprogramação: chave_sem_tentativa')
    // Não houve conversa: nada a finalizar.
    expect(b.finalizacoes).toEqual([])
  })

  test('quem perde o update condicionado não reprograma', async () => {
    const b = bancada(viva({ status: 'queued', provider_call_sid: null, provider_conversation_id: null }))
    // Outro caminho fechou a linha entre a reivindicação e o update.
    ;(b.porta as { fecharComoPerdida: PortaDaRecuperacao['fecharComoPerdida'] }).fecharComoPerdida = async () =>
      false

    await passagem(b, INICIO + 10 * MINUTO)
    expect(b.reprogramacoes).toEqual([])
  })
})

describe('ramo 3: o vigia da duração', () => {
  test('além de max + 60 s a telefonia encerra, com max_duration marcado, e a finalização preserva o motivo', async () => {
    // A conversa durou 670 s no provedor, e a Sarah chegou a chamar end_call:
    // mesmo assim o fim é max_duration, porque foi o vigia que a encerrou.
    const b = bancada(viva(), { duracaoDaConversa: MAXIMO_EM_SEGUNDOS + 70 })

    await passagem(b, INICIO + MAXIMO + 60 * SEGUNDO)
    expect(b.encerramentos).toEqual([])

    await passagem(b, INICIO + MAXIMO + 61 * SEGUNDO)
    expect(b.encerramentos).toEqual([SID])
    expect(b.linha.end_reason).toBe('max_duration')

    // O custo para de correr porque a chamada terminou: a passagem seguinte
    // encontra a conversa encerrada e finaliza.
    await passagem(b, INICIO + MAXIMO + 3 * MINUTO)
    expect(b.encerramentos).toEqual([SID])
    expect(b.desfechos).toHaveLength(1)
    expect(b.desfechos[0]).toMatchObject({ status: 'ended', end_reason: 'max_duration' })
  })

  test('a telefonia que recusa conta tentativa, e no teto a varredura desiste com registro', async () => {
    const b = bancada()
    b.telefoniaRecusa = true

    for (let i = 1; i <= TETO_DE_ENCERRAMENTOS; i += 1) {
      await passagem(b, INICIO + MAXIMO + i * 2 * MINUTO)
    }
    expect(b.encerramentos).toHaveLength(TETO_DE_ENCERRAMENTOS)
    expect(b.linha.recovery_attempts).toBe(TETO_DE_ENCERRAMENTOS)
    expect(b.linha.recovery_gave_up_at).not.toBeNull()
    expect(b.linha.recovery_note).toMatch(/desistência: encerramento por duração falhou 5 vezes/)

    // Desistiu: a passagem seguinte não pede de novo.
    await passagem(b, INICIO + MAXIMO + 30 * MINUTO)
    expect(b.encerramentos).toHaveLength(TETO_DE_ENCERRAMENTOS)
  })
})

describe('ramo 4: a idade máxima', () => {
  test('sem resposta além de max + 10 min vira ended com provider_lost e é reprogramada', async () => {
    const b = bancada(viva({ status: 'in_progress' }))
    b.estado = 'sem_resposta'

    await passagem(b, INICIO + MAXIMO + 10 * MINUTO)
    expect(b.fechamentos).toEqual([])

    const perdida = INICIO + MAXIMO + 10 * MINUTO + SEGUNDO
    await passagem(b, perdida)
    expect(b.linha).toMatchObject({ status: 'ended', end_reason: 'provider_lost', ended_at: em(perdida) })
    expect(b.fechamentos[0]?.de).toEqual(['ringing', 'in_progress'])
    expect(b.reprogramacoes).toEqual([CHAMADA])
    // A transcrição fica pendente: sem finalized_at.
    expect(b.linha.finalized_at).toBeNull()
  })

  test('a transcrição é buscada por 24 h e depois a varredura desiste com registro', async () => {
    const perdida = INICIO + 20 * MINUTO
    const b = bancada(viva({ status: 'ended', end_reason: 'provider_lost', ended_at: em(perdida) }))
    b.provedorDeVozFora = true

    await passagem(b, perdida + 2 * MINUTO)
    await passagem(b, perdida + 60 * MINUTO)
    await passagem(b, perdida + JANELA_DA_TRANSCRICAO_MS)
    expect(b.finalizacoes).toEqual([503, 503, 503])
    expect(b.linha.recovery_attempts).toBe(3)
    expect(b.linha.recovery_gave_up_at).toBeNull()

    await passagem(b, perdida + JANELA_DA_TRANSCRICAO_MS + SEGUNDO)
    expect(b.finalizacoes).toHaveLength(3)
    expect(b.linha.recovery_gave_up_at).toBe(em(perdida + JANELA_DA_TRANSCRICAO_MS + SEGUNDO))
    expect(b.linha.recovery_note).toMatch(/desistência: a transcrição não chegou em 24 h/)

    // Desistiu: nada mais toca a finalização.
    await passagem(b, perdida + 2 * JANELA_DA_TRANSCRICAO_MS)
    expect(b.finalizacoes).toHaveLength(3)
  })

  test('a transcrição que chega dentro das 24 h finaliza', async () => {
    const perdida = INICIO + 20 * MINUTO
    const b = bancada(viva({ status: 'ended', end_reason: 'provider_lost', ended_at: em(perdida) }))
    b.provedorDeVozFora = true
    await passagem(b, perdida + 2 * MINUTO)

    b.provedorDeVozFora = false
    await passagem(b, perdida + 6 * 60 * MINUTO)
    expect(b.finalizacoes).toEqual([503, 200])
    expect(b.linha.finalized_at).not.toBeNull()
  })
})

describe('a classificação pendente', () => {
  function finalizada(): Linha {
    return viva({ status: 'ended', finalized_at: em(INICIO), answered_by: 'human', end_reason: 'completed' })
  }

  test('503 conta tentativa; no teto a varredura desiste com registro', async () => {
    const b = bancada(finalizada())
    b.respostaDaClassificacao = 503

    for (let i = 1; i <= TETO_DE_CLASSIFICACOES + 2; i += 1) {
      await passagem(b, INICIO + i * 10 * MINUTO)
    }
    expect(b.classificacoes).toHaveLength(TETO_DE_CLASSIFICACOES)
    expect(b.linha.classify_attempts).toBe(TETO_DE_CLASSIFICACOES)
    expect(b.linha.classify_gave_up_at).not.toBeNull()
    expect(b.linha.recovery_note).toMatch(/desistência: classificação falhou 5 vezes/)
  })

  test('a quarta falha ainda não desiste', async () => {
    const b = bancada(finalizada())
    b.respostaDaClassificacao = 503
    for (let i = 1; i < TETO_DE_CLASSIFICACOES; i += 1) await passagem(b, INICIO + i * 10 * MINUTO)
    expect(b.linha.classify_attempts).toBe(TETO_DE_CLASSIFICACOES - 1)
    expect(b.linha.classify_gave_up_at).toBeNull()
  })

  test.each([404, 422])('recusa definitiva (%s) desiste na hora, sem contar tentativa', async (status) => {
    const b = bancada(finalizada())
    b.respostaDaClassificacao = status
    await passagem(b, INICIO + 10 * MINUTO)
    expect(b.linha).toMatchObject({ classify_attempts: 0 })
    expect(b.linha.classify_gave_up_at).toBe(em(INICIO + 10 * MINUTO))

    await passagem(b, INICIO + 20 * MINUTO)
    expect(b.classificacoes).toHaveLength(1)
  })

  test('a classificação que dá certo sai da varredura', async () => {
    const b = bancada(finalizada())
    await passagem(b, INICIO + 10 * MINUTO)
    await passagem(b, INICIO + 20 * MINUTO)
    expect(b.classificacoes).toHaveLength(1)
    expect(b.linha.classification_source).toBe('backfill')
  })
})

describe('o disjuntor', () => {
  const AGORA = INICIO + 30 * MINUTO

  function conta(falhasSeguidas: number, ajustes: Partial<ContaDoDisjuntor> = {}): ContaDoDisjuntor {
    return {
      account_id: CONTA,
      falhas: 5,
      janela_em_minutos: 10,
      eventos: Array.from({ length: falhasSeguidas }, (_, i) => ({
        at: em(AGORA - (i + 1) * MINUTO),
        status_code: i % 2 === 0 ? null : 503,
      })),
      ...ajustes,
    }
  }

  test('dispara em N falhas consecutivas e não em N-1', () => {
    expect(disjuntorDispara(conta(5), AGORA)).toBe(true)
    expect(disjuntorDispara(conta(4), AGORA)).toBe(false)
  })

  test('um sucesso entre as falhas zera a contagem', () => {
    const eventos = [...conta(5).eventos]
    eventos[2] = { at: eventos[2]?.at ?? em(AGORA), status_code: 200 }
    expect(disjuntorDispara(conta(5, { eventos }), AGORA)).toBe(false)
  })

  test('4xx é pedido nosso, não queda do provedor', () => {
    const eventos = conta(5).eventos.map((evento) => ({ ...evento, status_code: 404 }))
    expect(disjuntorDispara(conta(5, { eventos }), AGORA)).toBe(false)
  })

  test('falha fora da janela de M minutos não conta', () => {
    const eventos = [...conta(4).eventos, { at: em(AGORA - 11 * MINUTO), status_code: null }]
    expect(disjuntorDispara(conta(5, { eventos }), AGORA)).toBe(false)
    expect(disjuntorDispara(conta(5, { eventos, janela_em_minutos: 12 }), AGORA)).toBe(true)
  })

  test('N vem da conta: com N = 3, três falhas bastam', () => {
    expect(disjuntorDispara(conta(3, { falhas: 3 }), AGORA)).toBe(true)
    expect(disjuntorDispara(conta(2, { falhas: 3 }), AGORA)).toBe(false)
  })

  test('na passagem, pausa a conta com o motivo disjuntor e registra em job_runs', async () => {
    const b = bancada(viva({ finalized_at: em(INICIO), status: 'ended', classification_source: 'backfill' }))
    b.contas = [conta(5)]

    await passagem(b, AGORA)
    expect(b.freios).toEqual([
      { dialing_paused_at: em(AGORA), dialing_paused_by: AUTOR_DO_DISJUNTOR, dialing_paused_reason: MOTIVO_DO_DISJUNTOR },
    ])
    expect(b.registrosDoDisjuntor).toEqual([
      expect.objectContaining({ routine: NOME_DA_ROTINA, account_id: CONTA, items: 5 }),
    ])
    expect(b.registrosDoDisjuntor[0]?.error).toMatch(/retomada manual/)
  })

  test('com N-1 falhas, a passagem não pausa nada', async () => {
    const b = bancada(viva({ finalized_at: em(INICIO), status: 'ended', classification_source: 'backfill' }))
    b.contas = [conta(4)]
    await passagem(b, AGORA)
    expect(b.freios).toEqual([])
    expect(b.registrosDoDisjuntor).toEqual([])
  })

  test('conta já parada não ganha segundo registro, e a rotina não tem como soltar o freio', async () => {
    const b = bancada(viva({ finalized_at: em(INICIO), status: 'ended', classification_source: 'backfill' }))
    b.contas = [conta(5)]
    await passagem(b, AGORA)
    // A leitura continua trazendo a conta (a SQL a tiraria); a escrita
    // condicionada é a rede.
    b.contaParada = false
    ;(b.porta as { acionarDisjuntor: PortaDaRecuperacao['acionarDisjuntor'] }).acionarDisjuntor = async () => false
    await passagem(b, AGORA + 2 * MINUTO)
    expect(b.registrosDoDisjuntor).toHaveLength(1)

    // A retomada é manual: nenhum membro da porta solta o freio.
    const membros = Object.keys(b.porta)
    expect(membros.filter((nome) => /retom|solt|religar|despaus/i.test(nome))).toEqual([])
  })
})

describe('o envelope e o portão', () => {
  test('a passagem grava o fim em job_runs com os itens processados', async () => {
    const b = bancada()
    const resultado = await passagem(b, INICIO + MINUTO)
    expect(resultado).toMatchObject({ ok: true, itens: 1 })
    expect(b.execucoes).toEqual([expect.objectContaining({ items: 1, error: null })])
  })

  test('sem o segredo, nenhuma porta é tocada', async () => {
    const b = bancada()
    const resposta = await atenderRotina(
      { metodo: 'POST', segredo: 'outro' },
      { porta: b.porta, execucao: b.execucao, agora: () => INICIO },
      { segredoInterno: SEGREDO },
    )
    expect(resposta.status).toBe(401)
    expect(b.tocados).toEqual([])
    expect(b.execucoes).toEqual([])
  })

  test('segredo interno ausente na instalação fecha o portão', async () => {
    const b = bancada()
    const resposta = await atenderRotina(
      { metodo: 'POST', segredo: '' },
      { porta: b.porta, execucao: b.execucao, agora: () => INICIO },
      { segredoInterno: '' },
    )
    expect(resposta.status).toBe(401)
    expect(b.tocados).toEqual([])
  })

  test('com o segredo, a rotina roda', async () => {
    const b = bancada()
    const resposta = await atenderRotina(
      { metodo: 'POST', segredo: SEGREDO },
      { porta: b.porta, execucao: b.execucao, agora: () => INICIO + MINUTO },
      { segredoInterno: SEGREDO },
    )
    expect(resposta.status).toBe(200)
    expect(b.tocados).toContain('reivindicarChamadas')
  })
})
