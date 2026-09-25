// cron-calendar-sync: a ocupação gravada sem duplicar, o evento cancelado
// removido, a falha de um calendário presa na linha dele e a passagem seguindo
// para os outros.
//
// O dublê guarda `specialist_calendars` e `specialist_busy_blocks` em memória,
// e `gravarOcupacao` é `gravar_ocupacao_do_calendario` ao pé da letra: apaga o
// que sumiu do calendário, faz `on conflict (specialist_id, external_id) do
// update` no resto e só então avança `synced_at`. Cada calendário é um dublê de
// `PortaDeCalendario` com a agenda na mão do teste. A rede do SQL (skip locked,
// teto, a reconciliação no banco) se prova em
// `testes/banco/sincronizacao-do-calendario.test.ts`.

import { describe, expect, test } from 'vitest'

import {
  falhaDoCalendario,
  type EventoDaReuniao,
  type FalhaDoCalendario,
  type JanelaAbsoluta,
  type OcupacaoDoCalendario,
  type PortaDeCalendario,
  type ResultadoDoCalendario,
} from '../_shared/agenda/calendario.ts'
import {
  TETO_DE_TENTATIVAS,
  type FalhaDoEvento,
  type ReuniaoParaEvento,
} from '../_shared/agenda/evento-da-reuniao.ts'
import { TETO_DE_ITENS, type LinhaDeFim, type PortaDeExecucao } from '../_shared/rotinas/execucao.ts'

import {
  atenderRotina,
  blocosDaOcupacao,
  DIAS_DA_JANELA,
  EVENTOS_POR_PASSAGEM,
  FALHA_AO_GRAVAR,
  janelaDaPassagem,
  NOME_DA_ROTINA,
  sincronizarCalendarios,
  type CalendarioParaSincronizar,
  type OcupacaoParaGravar,
  type PortaDaSincronizacao,
} from './sincronizacao.ts'

const AGORA = Date.parse('2026-10-05T12:00:00.000Z')
const MINUTO = 60_000
const DIA = 24 * 60 * MINUTO
const CONTA = 'abcdef00-0000-4000-8000-00000000c0a1'
const SEGREDO = 'segredo-interno-da-instalacao'

function em(ms: number): string {
  return new Date(ms).toISOString()
}

function calendario(n: number): CalendarioParaSincronizar {
  const sufixo = String(n).padStart(4, '0')
  return {
    id: `abcdef00-0000-4000-8000-0000ca1e${sufixo}`,
    account_id: CONTA,
    specialist_id: `abcdef00-0000-4000-8000-0000e5be${sufixo}`,
    provider: 'google',
    external_id: `agenda-${n}@exemplo.test`,
    refresh_secret_id: `abcdef00-0000-4000-8000-00005ec2${sufixo}`,
    timezone: 'America/Sao_Paulo',
  }
}

function evento(id: string, diasAFrente: number, horas = 1): OcupacaoDoCalendario {
  const inicio = AGORA + diasAFrente * DIA
  return { externalId: id, inicio: em(inicio), fim: em(inicio + horas * 60 * MINUTO) }
}

/** A agenda que o dublê do provedor devolve, trocável entre passagens. */
class AgendaDeFora implements PortaDeCalendario {
  eventos: OcupacaoDoCalendario[] = []
  falha: FalhaDoCalendario | 'lança' | null = null
  falhaDoEvento: FalhaDoCalendario | null = null
  falhaDaRemocao: FalhaDoCalendario | null = null
  readonly eventosApagados: string[] = []
  readonly janelas: JanelaAbsoluta[] = []
  readonly eventosCriados: EventoDaReuniao[] = []

  async lerOcupacao(janela: JanelaAbsoluta): Promise<ResultadoDoCalendario<OcupacaoDoCalendario[]>> {
    this.janelas.push(janela)
    if (this.falha === 'lança') throw new Error('rede caiu com corpo do provedor: invalid_grant')
    if (this.falha) return this.falha
    return { ok: true, valor: [...this.eventos] }
  }
  async conferirHorario(): Promise<never> {
    throw new Error('a rotina não confere horário')
  }
  async criarEvento(evento: EventoDaReuniao): Promise<ResultadoDoCalendario<{ externalEventId: string }>> {
    this.eventosCriados.push(evento)
    if (this.falhaDoEvento) return this.falhaDoEvento
    return { ok: true, valor: { externalEventId: `evt-${evento.reuniaoId}` } }
  }
  async apagarEvento(externalEventId: string): Promise<ResultadoDoCalendario<{ readonly apagado: true }>> {
    this.eventosApagados.push(externalEventId)
    if (this.falhaDaRemocao) return this.falhaDaRemocao
    return { ok: true, valor: { apagado: true } }
  }
}

interface Bloco {
  specialist_id: string
  calendar_id: string
  external_id: string
  starts_at: string
  ends_at: string
  synced_at: string
}

interface Linha {
  synced_at: string | null
  sync_error: string | null
}

/** Uma linha de `meetings` com as colunas do evento, como o dublê a guarda. */
type Reuniao = ReuniaoParaEvento & { status: string; event_error: string | null; event_retry_at: string | null }

class Duble implements PortaDaSincronizacao {
  readonly calendarios: CalendarioParaSincronizar[] = []
  readonly linhas = new Map<string, Linha>()
  readonly agendas = new Map<string, AgendaDeFora | FalhaDoCalendario>()
  readonly blocos: Bloco[] = []
  readonly gravacoes: OcupacaoParaGravar[] = []
  readonly log: Readonly<Record<string, unknown>>[] = []
  readonly limites: number[] = []
  recusarGravacaoDe: string | null = null
  recusarAnotacao = false
  readonly reunioes: Reuniao[] = []
  readonly filtros: { instante: string; teto: number; limite: number }[] = []
  /** Reunião cuja gravação do evento levanta: banco fora no meio da passagem. */
  recusarEventoDe: string | null = null
  /** Quantos calendários a reivindicação devolve além do pedido: a rede do envelope. */
  excesso = 0

  conectar(n: number, synced_at: string | null = null): { cal: CalendarioParaSincronizar; agenda: AgendaDeFora } {
    const cal = calendario(n)
    const agenda = new AgendaDeFora()
    this.calendarios.push(cal)
    this.linhas.set(cal.id, { synced_at, sync_error: null })
    this.agendas.set(cal.id, agenda)
    return { cal, agenda }
  }

  async reivindicarCalendarios(limite: number) {
    this.limites.push(limite)
    return this.calendarios.slice(0, limite + this.excesso)
  }

  async abrirCalendario(cal: CalendarioParaSincronizar) {
    const agenda = this.agendas.get(cal.id)
    if (!agenda) throw new Error(`calendário sem dublê: ${cal.id}`)
    return agenda
  }

  async gravarOcupacao(ocupacao: OcupacaoParaGravar) {
    this.gravacoes.push(ocupacao)
    if (ocupacao.calendarioId === this.recusarGravacaoDe) {
      throw new Error('duplicate key value violates unique constraint "specialist_busy_blocks_pkey"')
    }
    const cal = this.calendarios.find((c) => c.id === ocupacao.calendarioId)!
    const lidos = new Set(ocupacao.blocos.map((b) => b.external_id))
    for (let i = this.blocos.length - 1; i >= 0; i -= 1) {
      const b = this.blocos[i]!
      if (b.calendar_id === cal.id && !lidos.has(b.external_id)) this.blocos.splice(i, 1)
    }
    for (const b of ocupacao.blocos) {
      const existente = this.blocos.find((x) => x.specialist_id === cal.specialist_id && x.external_id === b.external_id)
      if (existente) {
        Object.assign(existente, { starts_at: b.starts_at, ends_at: b.ends_at, synced_at: ocupacao.instante })
      } else {
        this.blocos.push({ ...b, specialist_id: cal.specialist_id, calendar_id: cal.id, synced_at: ocupacao.instante })
      }
    }
    this.linhas.set(cal.id, { synced_at: ocupacao.instante, sync_error: null })
  }

  async registrarFalha(calendarioId: string, mensagem: string) {
    if (this.recusarAnotacao) throw new Error('o banco caiu')
    const linha = this.linhas.get(calendarioId)!
    this.linhas.set(calendarioId, { ...linha, sync_error: mensagem })
  }

  registrarNoLog(evento: Readonly<Record<string, unknown>>) {
    this.log.push(evento)
  }

  /** O mesmo recorte que `index.ts` pede ao PostgREST. */
  async reunioesSemEvento(
    cal: CalendarioParaSincronizar,
    filtro: { instante: string; teto: number; limite: number },
  ): Promise<ReuniaoParaEvento[]> {
    this.filtros.push(filtro)
    const agora = Date.parse(filtro.instante)
    return this.reunioes
      .filter(
        (r) =>
          r.account_id === cal.account_id &&
          r.specialist_id === cal.specialist_id &&
          r.external_event_id === null &&
          ['scheduled', 'confirmed'].includes(r.status) &&
          Date.parse(r.starts_at) > agora &&
          r.event_attempts < filtro.teto &&
          (r.event_retry_at === null || Date.parse(r.event_retry_at) <= agora),
      )
      .slice(0, filtro.limite)
      .map((r) => ({ ...r }))
  }

  async gravarEvento(contaId: string, reuniaoId: string, externalEventId: string) {
    if (reuniaoId === this.recusarEventoDe) throw new Error('connection terminated unexpectedly')
    const r = this.reunioes.find((x) => x.id === reuniaoId && x.account_id === contaId)
    if (r && r.external_event_id === null) {
      Object.assign(r, { external_event_id: externalEventId, event_error: null, event_retry_at: null })
    }
  }

  async registrarFalhaDoEvento(contaId: string, reuniaoId: string, falha: FalhaDoEvento) {
    const r = this.reunioes.find((x) => x.id === reuniaoId && x.account_id === contaId)!
    Object.assign(r, { event_attempts: falha.tentativas, event_error: falha.erro, event_retry_at: falha.proximaTentativa })
  }

  /** O mesmo recorte que `index.ts` pede ao PostgREST. */
  async reunioesCanceladasComEvento(cal: CalendarioParaSincronizar, filtro: { limite: number }) {
    return this.reunioes
      .filter(
        (r) =>
          r.account_id === cal.account_id &&
          r.specialist_id === cal.specialist_id &&
          r.status === 'canceled' &&
          r.external_event_id !== null,
      )
      .slice(0, filtro.limite)
      .map((r) => ({ id: r.id, account_id: r.account_id, external_event_id: r.external_event_id! }))
  }

  async esquecerEvento(contaId: string, reuniaoId: string) {
    const r = this.reunioes.find((x) => x.id === reuniaoId && x.account_id === contaId)!
    Object.assign(r, { external_event_id: null })
  }

  marcar(cal: CalendarioParaSincronizar, n: number, extras: Partial<Reuniao> = {}): Reuniao {
    const inicio = AGORA + DIA + n * 60 * MINUTO
    const reuniao: Reuniao = {
      id: `abcdef00-0000-4000-8000-00000ee7${String(n).padStart(4, '0')}`,
      account_id: cal.account_id,
      specialist_id: cal.specialist_id,
      starts_at: em(inicio),
      ends_at: em(inicio + 30 * MINUTO),
      modality: 'video',
      notes: null,
      handoff_summary: null,
      external_event_id: null,
      event_attempts: 0,
      nomeDoLead: 'Marcos Lima',
      salaDoEspecialista: null,
      status: 'scheduled',
      event_error: null,
      event_retry_at: null,
      ...extras,
    }
    this.reunioes.push(reuniao)
    return reuniao
  }

  blocosDe(cal: CalendarioParaSincronizar): Bloco[] {
    return this.blocos.filter((b) => b.calendar_id === cal.id)
  }
}

/** O bloco sem `synced_at`, que avança a cada passagem por desenho. */
function semCarimbo(bloco: Bloco) {
  const { specialist_id, calendar_id, external_id, starts_at, ends_at } = bloco
  return { specialist_id, calendar_id, external_id, starts_at, ends_at }
}

class Execucoes implements PortaDeExecucao {
  readonly fins: LinhaDeFim[] = []
  async inserirExecucao() {
    return `execucao-${this.fins.length + 1}`
  }
  async concluirExecucao(_: string, linha: LinhaDeFim) {
    this.fins.push(linha)
  }
  async itensDasUltimasExecucoes() {
    return []
  }
}

function passar(duble: Duble, execucoes = new Execucoes(), agora = AGORA) {
  return sincronizarCalendarios({ porta: duble, execucao: execucoes, agora: () => agora })
}

describe('a janela', () => {
  test('vai do instante da passagem até trinta dias depois, em UTC', () => {
    const janela = janelaDaPassagem(em(AGORA))
    expect(janela.inicio).toBe('2026-10-05T12:00:00Z')
    expect(Date.parse(janela.fim) - Date.parse(janela.inicio)).toBe(DIAS_DA_JANELA * DIA)
  })

  test('é a janela que chega ao calendário', async () => {
    const duble = new Duble()
    const { agenda } = duble.conectar(1)
    await passar(duble)
    expect(agenda.janelas).toEqual([janelaDaPassagem(em(AGORA))])
  })
})

describe('a ocupação no banco', () => {
  test('grava os eventos da janela como blocos do especialista e avança synced_at', async () => {
    const duble = new Duble()
    const { cal, agenda } = duble.conectar(1)
    agenda.eventos = [evento('ev-a', 1), evento('ev-b', 3, 2)]

    const resultado = await passar(duble)

    expect(resultado.ok).toBe(true)
    expect(duble.blocosDe(cal).map((b) => [b.external_id, b.specialist_id])).toEqual([
      ['ev-a', cal.specialist_id],
      ['ev-b', cal.specialist_id],
    ])
    expect(duble.linhas.get(cal.id)).toEqual({ synced_at: em(AGORA), sync_error: null })
  })

  test('rodar duas vezes seguidas sobre a mesma agenda não duplica bloco nem muda a contagem', async () => {
    const duble = new Duble()
    const { cal, agenda } = duble.conectar(1)
    agenda.eventos = [evento('ev-a', 1), evento('ev-b', 2), evento('ev-c', 29)]

    await passar(duble)
    const depoisDaPrimeira = duble.blocosDe(cal).map(semCarimbo)
    await passar(duble, new Execucoes(), AGORA + 5 * MINUTO)
    const depoisDaSegunda = duble.blocosDe(cal).map(semCarimbo)

    expect(depoisDaPrimeira).toHaveLength(3)
    expect(depoisDaSegunda).toEqual(depoisDaPrimeira)
    expect(duble.blocos).toHaveLength(3)
  })

  test('evento que sumiu do calendário é removido, e o que mudou de horário é atualizado', async () => {
    const duble = new Duble()
    const { cal, agenda } = duble.conectar(1)
    agenda.eventos = [evento('ev-fica', 1), evento('ev-cancelado', 2), evento('ev-muda', 4)]
    await passar(duble)

    agenda.eventos = [evento('ev-fica', 1), evento('ev-muda', 5)]
    await passar(duble, new Execucoes(), AGORA + 5 * MINUTO)

    const blocos = duble.blocosDe(cal)
    expect(blocos.map((b) => b.external_id).sort()).toEqual(['ev-fica', 'ev-muda'])
    expect(blocos.find((b) => b.external_id === 'ev-muda')!.starts_at).toBe(evento('ev-muda', 5).inicio)
  })

  test('agenda que esvaziou apaga todos os blocos do calendário: lista vazia também grava', async () => {
    const duble = new Duble()
    const { cal, agenda } = duble.conectar(1)
    agenda.eventos = [evento('ev-a', 1)]
    await passar(duble)

    agenda.eventos = []
    await passar(duble, new Execucoes(), AGORA + 5 * MINUTO)

    expect(duble.blocosDe(cal)).toEqual([])
    expect(duble.linhas.get(cal.id)!.synced_at).toBe(em(AGORA + 5 * MINUTO))
  })

  test('evento sem duração e evento repetido não chegam ao banco', () => {
    const torto: OcupacaoDoCalendario = { externalId: 'ev-torto', inicio: em(AGORA), fim: em(AGORA) }
    const blocos = blocosDaOcupacao([evento('ev-a', 1), torto, evento('ev-a', 2), { ...evento('x', 1), externalId: '  ' }])
    expect(blocos).toEqual([{ external_id: 'ev-a', starts_at: evento('ev-a', 1).inicio, ends_at: evento('ev-a', 1).fim }])
  })
})

describe('um calendário que falha não para os outros', () => {
  test('dois especialistas seguem sincronizados quando o terceiro falha', async () => {
    const duble = new Duble()
    const anterior = em(AGORA - 5 * MINUTO)
    const a = duble.conectar(1, anterior)
    const quebrado = duble.conectar(2, anterior)
    const c = duble.conectar(3, anterior)
    a.agenda.eventos = [evento('ev-a', 1)]
    quebrado.agenda.falha = falhaDoCalendario('conexao_expirada')
    c.agenda.eventos = [evento('ev-c', 2)]

    const resultado = await passar(duble)

    expect(resultado).toMatchObject({ ok: true, itens: 3 })
    expect(duble.linhas.get(a.cal.id)).toEqual({ synced_at: em(AGORA), sync_error: null })
    expect(duble.linhas.get(c.cal.id)).toEqual({ synced_at: em(AGORA), sync_error: null })
    expect(duble.blocosDe(a.cal)).toHaveLength(1)
    expect(duble.blocosDe(c.cal)).toHaveLength(1)
    expect(duble.linhas.get(quebrado.cal.id)).toEqual({
      synced_at: anterior,
      sync_error: falhaDoCalendario('conexao_expirada').mensagem,
    })
  })

  test('a falha deixa a última ocupação conhecida e synced_at intocados', async () => {
    const duble = new Duble()
    const { cal, agenda } = duble.conectar(1)
    agenda.eventos = [evento('ev-a', 1)]
    await passar(duble)

    agenda.falha = falhaDoCalendario('provedor_indisponivel')
    await passar(duble, new Execucoes(), AGORA + 5 * MINUTO)

    expect(duble.blocosDe(cal).map((b) => b.external_id)).toEqual(['ev-a'])
    expect(duble.linhas.get(cal.id)!.synced_at).toBe(em(AGORA))
    expect(duble.linhas.get(cal.id)!.sync_error).toBe(falhaDoCalendario('provedor_indisponivel').mensagem)
  })

  test('calendário sem token (não conectado) grava a frase e não lê nada', async () => {
    const duble = new Duble()
    const { cal } = duble.conectar(1)
    const b = duble.conectar(2)
    b.agenda.eventos = [evento('ev-b', 1)]
    duble.agendas.set(cal.id, falhaDoCalendario('nao_conectado'))

    await passar(duble)

    expect(duble.linhas.get(cal.id)!.sync_error).toBe(falhaDoCalendario('nao_conectado').mensagem)
    expect(duble.linhas.get(cal.id)!.synced_at).toBeNull()
    expect(duble.blocosDe(b.cal)).toHaveLength(1)
  })

  test('exceção ao abrir ou ler o calendário vira frase, sem a mensagem de dentro', async () => {
    const duble = new Duble()
    const lanca = duble.conectar(1)
    lanca.agenda.falha = 'lança'
    const semPorta = duble.conectar(2)
    duble.agendas.delete(semPorta.cal.id)
    const bom = duble.conectar(3)
    bom.agenda.eventos = [evento('ev', 1)]

    const resultado = await passar(duble)

    expect(resultado.ok).toBe(true)
    for (const cal of [lanca.cal, semPorta.cal]) {
      const erro = duble.linhas.get(cal.id)!.sync_error!
      expect(erro).toBe(falhaDoCalendario('sem_resposta').mensagem)
      expect(erro).not.toMatch(/invalid_grant|dublê/)
    }
    expect(duble.blocosDe(bom.cal)).toHaveLength(1)
  })

  test('gravação recusada pelo banco vira frase na linha e a mensagem do banco vai para o log', async () => {
    const duble = new Duble()
    const recusado = duble.conectar(1)
    recusado.agenda.eventos = [evento('ev', 1)]
    const outro = duble.conectar(2)
    outro.agenda.eventos = [evento('ev-2', 1)]
    duble.recusarGravacaoDe = recusado.cal.id

    const resultado = await passar(duble)

    expect(resultado.ok).toBe(true)
    expect(duble.linhas.get(recusado.cal.id)).toEqual({ synced_at: null, sync_error: FALHA_AO_GRAVAR })
    expect(FALHA_AO_GRAVAR).not.toMatch(/duplicate|constraint/)
    expect(JSON.stringify(duble.log)).toContain('duplicate key')
    expect(duble.blocosDe(outro.cal)).toHaveLength(1)
  })

  test('se nem a falha se anota, o banco caiu: a execução termina em erro, com fim gravado', async () => {
    const duble = new Duble()
    const { agenda } = duble.conectar(1)
    agenda.falha = falhaDoCalendario('conexao_expirada')
    duble.recusarAnotacao = true
    const execucoes = new Execucoes()

    const resultado = await passar(duble, execucoes)

    expect(resultado.ok).toBe(false)
    expect(execucoes.fins[0]!.error).toContain('o banco caiu')
  })
})

describe('nova tentativa do evento da reunião', () => {
  test('a reunião sem evento ganha o evento no calendário do especialista e o id gravado', async () => {
    const duble = new Duble()
    const { cal, agenda } = duble.conectar(1)
    const reuniao = duble.marcar(cal, 1, { event_attempts: 1, event_retry_at: em(AGORA - MINUTO), event_error: 'x' })

    await passar(duble)

    expect(agenda.eventosCriados.map((e) => e.reuniaoId)).toEqual([reuniao.id])
    expect(reuniao).toMatchObject({ external_event_id: `evt-${reuniao.id}`, event_error: null, event_retry_at: null })
    expect(duble.filtros).toEqual([{ instante: em(AGORA), teto: TETO_DE_TENTATIVAS, limite: EVENTOS_POR_PASSAGEM }])
  })

  test('reunião que já tem evento não é tentada de novo: duas passagens, um evento', async () => {
    const duble = new Duble()
    const { cal, agenda } = duble.conectar(1)
    duble.marcar(cal, 1)

    await passar(duble)
    await passar(duble, new Execucoes(), AGORA + 5 * MINUTO)

    expect(agenda.eventosCriados).toHaveLength(1)
  })

  test('antes da hora da próxima tentativa a reunião espera; depois dela, é tentada', async () => {
    const duble = new Duble()
    const { cal, agenda } = duble.conectar(1)
    duble.marcar(cal, 1, { event_attempts: 2, event_retry_at: em(AGORA + 3 * MINUTO) })

    await passar(duble)
    expect(agenda.eventosCriados).toHaveLength(0)

    await passar(duble, new Execucoes(), AGORA + 5 * MINUTO)
    expect(agenda.eventosCriados).toHaveLength(1)
  })

  test('falha na criação soma a tentativa; na quinta, a próxima fica nula e a rotina não tenta mais', async () => {
    const duble = new Duble()
    const { cal, agenda } = duble.conectar(1)
    agenda.falhaDoEvento = falhaDoCalendario('provedor_indisponivel')
    const reuniao = duble.marcar(cal, 1, { event_attempts: TETO_DE_TENTATIVAS - 1 })

    await passar(duble)

    expect(reuniao).toMatchObject({
      external_event_id: null,
      event_attempts: TETO_DE_TENTATIVAS,
      event_error: falhaDoCalendario('provedor_indisponivel').mensagem,
      event_retry_at: null,
    })

    await passar(duble, new Execucoes(), AGORA + DIA / 2)
    expect(agenda.eventosCriados).toHaveLength(1)
  })

  test('calendário que nem abriu conta a tentativa com a frase dele, e a ocupação registra a falha', async () => {
    const duble = new Duble()
    const cal = calendario(1)
    duble.calendarios.push(cal)
    duble.linhas.set(cal.id, { synced_at: null, sync_error: null })
    duble.agendas.set(cal.id, falhaDoCalendario('conexao_expirada'))
    const reuniao = duble.marcar(cal, 1)

    await passar(duble)

    expect(duble.linhas.get(cal.id)?.sync_error).toBe(falhaDoCalendario('conexao_expirada').mensagem)
    expect(reuniao).toMatchObject({
      event_attempts: 1,
      event_error: falhaDoCalendario('conexao_expirada').mensagem,
      event_retry_at: em(AGORA + MINUTO),
    })
  })

  test('banco que levanta numa reunião vai para o log, e a seguinte e a ocupação seguem', async () => {
    const duble = new Duble()
    const { cal, agenda } = duble.conectar(1)
    agenda.eventos = [evento('externo-1', 2)]
    const primeira = duble.marcar(cal, 1)
    const segunda = duble.marcar(cal, 2)
    duble.recusarEventoDe = primeira.id

    const resultado = await passar(duble)

    expect(resultado.ok).toBe(true)
    expect(segunda.external_event_id).toBe(`evt-${segunda.id}`)
    expect(primeira.external_event_id).toBeNull()
    expect(duble.blocosDe(cal)).toHaveLength(1)
    expect(duble.log).toContainEqual(
      expect.objectContaining({ passo: 'evento_da_reuniao', reuniao: primeira.id }),
    )
  })

  test('reunião de outro especialista não entra na passagem deste calendário', async () => {
    const duble = new Duble()
    const { agenda } = duble.conectar(1)
    duble.marcar(calendario(2), 1)

    await passar(duble)

    expect(agenda.eventosCriados).toHaveLength(0)
  })
})

describe('o evento da reunião cancelada', () => {
  test('sai do calendário pelo external_event_id, e o id sai da linha', async () => {
    const duble = new Duble()
    const { cal, agenda } = duble.conectar(1)
    const cancelada = duble.marcar(cal, 1, { status: 'canceled', external_event_id: 'evt-cancelado' })
    const ativa = duble.marcar(cal, 2, { external_event_id: 'evt-ativo' })

    await passar(duble)

    expect(agenda.eventosApagados).toEqual(['evt-cancelado'])
    expect(cancelada.external_event_id).toBeNull()
    expect(ativa.external_event_id).toBe('evt-ativo')

    await passar(duble, new Execucoes(), AGORA + 5 * MINUTO)
    expect(agenda.eventosApagados).toEqual(['evt-cancelado'])
  })

  test('calendário que recusa deixa o id na linha, e a passagem seguinte tenta de novo', async () => {
    const duble = new Duble()
    const { cal, agenda } = duble.conectar(1)
    agenda.falhaDaRemocao = falhaDoCalendario('provedor_indisponivel')
    const cancelada = duble.marcar(cal, 1, { status: 'canceled', external_event_id: 'evt-cancelado' })

    await passar(duble)
    expect(cancelada.external_event_id).toBe('evt-cancelado')
    expect(duble.log).toContainEqual(expect.objectContaining({ passo: 'apagar_evento', reuniao: cancelada.id }))

    agenda.falhaDaRemocao = null
    await passar(duble, new Execucoes(), AGORA + 5 * MINUTO)
    expect(agenda.eventosApagados).toEqual(['evt-cancelado', 'evt-cancelado'])
    expect(cancelada.external_event_id).toBeNull()
  })

  test('calendário que nem abriu não apaga nada e não perde o id', async () => {
    const duble = new Duble()
    const cal = calendario(1)
    duble.calendarios.push(cal)
    duble.linhas.set(cal.id, { synced_at: null, sync_error: null })
    duble.agendas.set(cal.id, falhaDoCalendario('conexao_expirada'))
    const cancelada = duble.marcar(cal, 1, { status: 'canceled', external_event_id: 'evt-cancelado' })

    const resultado = await passar(duble)

    expect(resultado.ok).toBe(true)
    expect(cancelada.external_event_id).toBe('evt-cancelado')
  })

  test('a cancelada de outro especialista não sai deste calendário', async () => {
    const duble = new Duble()
    const { agenda } = duble.conectar(1)
    duble.marcar(calendario(2), 1, { status: 'canceled', external_event_id: 'evt-de-outro' })

    await passar(duble)

    expect(agenda.eventosApagados).toEqual([])
  })
})

describe('o envelope', () => {
  test('pede no máximo 25 calendários e grava início, fim e itens', async () => {
    const duble = new Duble()
    for (let n = 1; n <= 30; n += 1) duble.conectar(n)
    const execucoes = new Execucoes()

    const resultado = await passar(duble, execucoes)

    expect(duble.limites).toEqual([TETO_DE_ITENS])
    expect(resultado).toMatchObject({ ok: true, itens: 25 })
    expect(execucoes.fins).toEqual([expect.objectContaining({ items: 25, error: null })])
  })

  test('reivindicação que devolve mais que o teto não processa nenhum', async () => {
    const duble = new Duble()
    for (let n = 1; n <= 30; n += 1) duble.conectar(n)
    duble.excesso = 1

    const resultado = await passar(duble)

    expect(resultado.ok).toBe(false)
    expect(duble.gravacoes).toEqual([])
  })
})

describe('a borda', () => {
  test('sem o segredo interno nenhuma porta é tocada', async () => {
    const tocados: string[] = []
    const vigia = <T extends object>(alvo: T) =>
      new Proxy(alvo, {
        get(obj, nome, receptor) {
          tocados.push(String(nome))
          return Reflect.get(obj, nome, receptor)
        },
      })
    const resposta = await atenderRotina(
      { metodo: 'POST', segredo: 'errado' },
      { porta: vigia(new Duble()), execucao: vigia(new Execucoes()) },
      { segredoInterno: SEGREDO },
    )
    expect(resposta.status).toBe(401)
    expect(tocados).toEqual([])
  })

  test('com o segredo roda a passagem e responde 200; método diferente de POST é 405', async () => {
    const duble = new Duble()
    duble.conectar(1)
    const ok = await atenderRotina(
      { metodo: 'POST', segredo: SEGREDO },
      { porta: duble, execucao: new Execucoes(), agora: () => AGORA },
      { segredoInterno: SEGREDO },
    )
    expect(ok.status).toBe(200)
    expect(ok.corpo).toMatchObject({ ok: true, itens: 1 })

    const get = await atenderRotina(
      { metodo: 'GET', segredo: SEGREDO },
      { porta: duble, execucao: new Execucoes() },
      { segredoInterno: SEGREDO },
    )
    expect(get.status).toBe(405)
  })

  test('o nome da rotina é o da seção 4.6', () => {
    expect(NOME_DA_ROTINA).toBe('cron-calendar-sync')
  })
})

describe('o calendário por endereço iCal', () => {
  test('a ocupação é lida e gravada, e as etapas do evento ficam de fora', async () => {
    const duble = new Duble()
    const { cal, agenda } = duble.conectar(1)
    const ical = { ...cal, provider: 'ical', external_id: 'endereco_ical' }
    duble.calendarios[0] = ical
    agenda.eventos = [evento('ocupado@ical', 1)]
    const pendente = duble.marcar(ical, 2)
    const cancelada = duble.marcar(ical, 3, { status: 'canceled', external_event_id: 'evt-antigo' })

    await passar(duble)

    expect(duble.blocosDe(ical).map((bloco) => bloco.external_id)).toEqual(['ocupado@ical'])
    expect(duble.linhas.get(ical.id)?.sync_error).toBeNull()
    // Nada de evento nem de desistência: a reunião chega pelo convite por e-mail.
    expect(duble.filtros).toEqual([])
    expect(agenda.eventosCriados).toEqual([])
    expect(agenda.eventosApagados).toEqual([])
    expect(pendente).toMatchObject({ event_attempts: 0, event_error: null })
    expect(cancelada.external_event_id).toBe('evt-antigo')
  })
})
