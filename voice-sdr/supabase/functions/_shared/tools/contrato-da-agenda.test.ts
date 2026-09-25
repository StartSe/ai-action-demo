// A suíte de contrato das duas ferramentas de agenda, em processo: os oito
// casos da seção 9.2 do PRD de implementação para `tool-availability` e
// `tool-book-meeting`, sobre um mundo dublado que as duas compartilham — a
// tabela `call_slot_offers` que uma grava é a que a outra lê, como no banco.
//
// É contrato de forma e de regra, não de rede: as portas são dubladas e nada
// sai do processo, por isso a suíte roda em `test:unit` e é portão de todo
// envio (o `check` do degrau de baixo). A mesma lista de casos contra as
// funções implantadas é `scripts/contrato-das-ferramentas.ts`, no degrau 3.
//
// O QUE ESTA SUÍTE NÃO MEDE: o prazo de 5 s (`response_timeout_secs`) e a meta
// de 2 s no p95 (P-01, RNF-03). Os dois exigem a função fria no isolado do
// Deno, rede até o banco e ao calendário, e medição em 20 chamadas, que é do CI
// com as funções no ar e do ambiente. Aqui o prazo só aparece como forma: o
// executor que não volta dentro do orçamento responde a frase de contorno.
//
// Cada caso se declara por `contrato(ferramenta, caso, ...)`, e o último bloco
// cobra que as duas ferramentas têm os oito. Toda resposta passa por `vista`,
// que confere `{ ok, data, speech }`, e fica guardada para a varredura final
// atrás de SQLSTATE, nome de tabela, nome de coluna e código de provedor. As
// falhas desta suíte são provocadas com exatamente essas mensagens, para a
// varredura ter o que achar se alguma vazasse.

import { readFileSync, readdirSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { falhaDoCalendario, type PortaDeCalendario } from '../agenda/calendario.ts'
import { CATALOGO_DE_FERRAMENTAS } from '../agente/compilador.ts'
import { PROPOSITOS } from '../playbook/camada-um.ts'
import { FALAS_DA_AGENDA, falarConfirmacao, falarOferta } from '../speech/agenda.ts'
import { FALAS_DAS_FERRAMENTAS } from '../speech/ferramentas.ts'
import { criarToolAvailability, type EspecialistaDaConta, type PortaDeDisponibilidade, type ReuniaoDoPeriodo } from '../../tool-availability/disponibilidade.ts'
import { criarToolBookMeeting, type EscritaDoAgendamento, type PortaDeAgendamento, type ResultadoDoRpc } from '../../tool-book-meeting/agendamento.ts'

import type {
  AmbienteDaFerramenta,
  ChamadaDaFerramenta,
  InvocacaoParaRegistro,
  RespostaDaFerramenta,
} from './esqueleto.ts'
import { derivarSegredo } from './segredo.ts'

const CONTA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const OUTRA_CONTA = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
const CHAMADA_ID = 'cafecafe-dead-4bee-8fed-abcdefabcdef'
const LEAD = 'facefeed-beef-4abc-8def-fedcbafedcba'
const ANA = 'a0a0a0a0-1111-4111-8111-111111111111'
const REUNIAO = 'deadbeef-0000-4000-8000-000000000001'
const CONVERSA = 'conv_vexo_marcos_05'
const CONVERSA_DA_OUTRA_CONTA = 'conv_outra_conta_01'
const CHAVE = 'chave-do-servidor-de-teste'

/** Segunda-feira, 5 de outubro de 2026, 10h em São Paulo. */
const AGORA = Date.UTC(2026, 9, 5, 13, 0, 0)
/**
 * `account_settings.max_duration_seconds`: o gatilho de `call_slot_offers`
 * grava `expires_at` como o instante da consulta mais a duração máxima da
 * chamada, que é o fim dela no pior caso.
 */
const DURACAO_MAXIMA_MS = 3_600_000
const FIM_DA_CHAMADA = AGORA + DURACAO_MAXIMA_MS

/** Os quatro primeiros horários de terça, 6 de outubro, em UTC. */
const TERCA = ['2026-10-06T12:00:00Z', '2026-10-06T12:30:00Z', '2026-10-06T13:00:00Z', '2026-10-06T13:30:00Z']

type Ferramenta = 'tool-availability' | 'tool-book-meeting'

/** Os oito casos da seção 9.2, na ordem do PRD. */
const CASOS = [
  'carga válida',
  'campo faltante',
  'segredo inválido',
  'conversa inexistente',
  'propósito errado',
  'oferta expirada',
  '23P01',
  'modo ensaio',
] as const
type Caso = (typeof CASOS)[number]

const cobertos: Record<Ferramenta, Set<Caso>> = {
  'tool-availability': new Set(),
  'tool-book-meeting': new Set(),
}

/** Um caso do contrato: registra a cobertura e declara o teste. */
function contrato(ferramenta: Ferramenta, caso: Caso, titulo: string, corpo: () => Promise<void>): void {
  cobertos[ferramenta].add(caso)
  test(`${ferramenta} · ${caso}: ${titulo}`, corpo)
}

/** Toda resposta da suíte, para a varredura do fim. */
const vistas: { ferramenta: Ferramenta; resposta: RespostaDaFerramenta }[] = []

/** As frases de contorno que uma recusa pode dizer: as das ferramentas e as da agenda. */
const FALAS_DE_CONTORNO: ReadonlySet<string> = new Set([
  ...Object.values(FALAS_DAS_FERRAMENTAS),
  ...Object.values(FALAS_DA_AGENDA),
])

function vista(ferramenta: Ferramenta, resposta: RespostaDaFerramenta): RespostaDaFerramenta {
  expect(Object.keys(resposta.corpo).sort()).toEqual(['data', 'ok', 'speech'])
  expect(typeof resposta.corpo.ok).toBe('boolean')
  expect(typeof resposta.corpo.speech).toBe('string')
  expect(resposta.corpo.speech.trim()).not.toBe('')
  if (!resposta.corpo.ok) expect(FALAS_DE_CONTORNO).toContain(resposta.corpo.speech)
  vistas.push({ ferramenta, resposta })
  return resposta
}

/** Sem caixa, sem acento, sem pontuação: "exatamente a frase" do PRD, lida em voz alta. */
function falada(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z ]/g, '')
    .trim()
}

// As mensagens técnicas que as falhas provocadas levantam. Cada uma carrega o
// que a varredura procura: SQLSTATE, tabela, coluna ou código de provedor.
const ERRO_DA_CONFIGURACAO = 'relation "public.accounts" does not exist (SQLSTATE 42P01)'
const ERRO_DAS_OFERTAS =
  'duplicate key value violates unique constraint "call_slot_offers_call_id_position_key" (SQLSTATE 23505)'
const ERRO_DO_RPC =
  'conflicting key value violates exclusion constraint "meetings_sem_sobreposicao" (SQLSTATE 23P01): specialist_id, starts_at'
const ERRO_DO_CALENDARIO = 'invalid_grant: Token has been expired or revoked. (HTTP 401, UNAUTHENTICATED)'
const ERRO_DA_LEITURA = 'column leads.timezone does not exist (SQLSTATE 42703)'

// O mundo ---------------------------------------------------------------------

interface LinhaDeOferta {
  readonly account_id: string
  readonly call_id: string
  readonly position: number
  readonly specialist_id: string
  readonly starts_at: string
  readonly ends_at: string
  readonly expires_at: string
}

type Falha =
  | 'configuracao'
  | 'ofertas'
  | 'rpc'
  | 'calendario'
  | 'fuso'
  | 'evento'
  | 'convite'
  | 'pendura'

interface Opcoes {
  chamada?: ChamadaDaFerramenta
  rpc?: ResultadoDoRpc
  falhas?: readonly Falha[]
  /** O especialista tem calendário conectado, e ele responde livre. */
  comCalendario?: boolean
}

function especialista(): EspecialistaDaConta {
  return {
    id: ANA,
    area: 'vendas',
    ativo: true,
    fuso: 'America/Sao_Paulo',
    duracaoPadraoMin: 30,
    tetoDiario: 6,
    antecedenciaMinimaMin: 120,
    antecedenciaMaximaDias: 30,
    ultimaAtribuicaoEm: null,
    disponibilidade: [{ diaDaSemana: 2, inicio: '09:00', fim: '12:00' }],
  }
}

const CHAMADA: ChamadaDaFerramenta = {
  id: CHAMADA_ID,
  account_id: CONTA,
  purpose: 'discovery',
  direction: 'outbound',
  lead_id: LEAD,
}

function montar(opcoes: Opcoes = {}) {
  const chamada = opcoes.chamada ?? CHAMADA
  const falhas = new Set(opcoes.falhas ?? [])
  const estado = {
    agora: AGORA,
    /** `call_slot_offers`, a mesma para as duas ferramentas. */
    ofertas: [] as LinhaDeOferta[],
    /** As reuniões que ocupam a agenda de Ana, como `agendaNoPeriodo` as leria. */
    reunioes: [] as ReuniaoDoPeriodo[],
    registros: [] as InvocacaoParaRegistro[],
    logs: [] as { evento: string; detalhe: Readonly<Record<string, unknown>> }[],
    /** Cada ida a uma porta de dados, na ordem. */
    passos: [] as string[],
    agendadas: [] as string[],
  }
  const levantar = (falha: Falha, mensagem: string) => {
    if (falhas.has(falha)) throw new Error(mensagem)
  }
  const pendurar = <T>(valor: () => Promise<T>): Promise<T> =>
    falhas.has('pendura') ? new Promise<T>(() => undefined) : valor()

  const calendario: PortaDeCalendario = {
    async lerOcupacao() {
      return falhaDoCalendario('falha_do_calendario')
    },
    async conferirHorario() {
      estado.passos.push('calendario.conferirHorario')
      levantar('calendario', ERRO_DO_CALENDARIO)
      return { ok: true, valor: { livre: true } }
    },
    async criarEvento() {
      return { ok: true, valor: { externalEventId: 'evt' } }
    },
    async apagarEvento() {
      return { ok: true, valor: { apagado: true } }
    },
  }

  const leituraDaDisponibilidade: PortaDeDisponibilidade = {
    async configuracaoDaConta() {
      estado.passos.push('configuracaoDaConta')
      levantar('configuracao', ERRO_DA_CONFIGURACAO)
      return pendurar(async () => ({ modo: 'area', especialistaFixo: null, fusoDaConta: 'America/Sao_Paulo' }))
    },
    async fusoDoLead() {
      estado.passos.push('fusoDoLead')
      return 'America/Sao_Paulo'
    },
    async especialistasDaConta() {
      estado.passos.push('especialistasDaConta')
      return [especialista()]
    },
    async agendaNoPeriodo() {
      estado.passos.push('agendaNoPeriodo')
      return [{ especialistaId: ANA, bloqueios: [], ocupacaoExterna: [], reunioes: [...estado.reunioes] }]
    },
  }

  const leituraDoAgendamento: PortaDeAgendamento = {
    async ofertaDaChamada(contaId, chamadaId, posicao) {
      estado.passos.push('ofertaDaChamada')
      return pendurar(async () => {
        const linha = estado.ofertas.find(
          (o) => o.account_id === contaId && o.call_id === chamadaId && o.position === posicao,
        )
        return linha === undefined ? null : { ...linha, fusoDoEspecialista: 'America/Sao_Paulo' }
      })
    },
    async fusoDoLead() {
      estado.passos.push('fusoDoLead')
      levantar('fuso', ERRO_DA_LEITURA)
      return 'America/Sao_Paulo'
    },
    async calendarioDoEspecialista() {
      estado.passos.push('calendarioDoEspecialista')
      return opcoes.comCalendario ? calendario : null
    },
  }

  const escritaDoAgendamento: EscritaDoAgendamento = {
    async agendarReuniao(pedido) {
      estado.passos.push('agendarReuniao')
      levantar('rpc', ERRO_DO_RPC)
      const resultado = opcoes.rpc ?? { resultado: 'agendada', reuniao_id: REUNIAO }
      if (resultado.resultado === 'agendada') {
        estado.agendadas.push(pedido.p_starts_at)
        estado.reunioes.push({ inicio: pedido.p_starts_at, fim: pedido.p_ends_at, status: 'scheduled' })
      }
      return resultado
    },
    async consumirOfertas(contaId, chamadaId) {
      estado.passos.push('consumirOfertas')
      estado.ofertas = estado.ofertas.filter((o) => !(o.account_id === contaId && o.call_id === chamadaId))
    },
    async preencherEmailDoLead() {
      estado.passos.push('preencherEmailDoLead')
    },
    async reuniaoParaEvento() {
      estado.passos.push('reuniaoParaEvento')
      levantar('evento', ERRO_DO_CALENDARIO)
      return null
    },
    async reuniaoParaConvite() {
      estado.passos.push('reuniaoParaConvite')
      levantar('convite', 'Resend API 422 validation_error: "to" must be a valid email')
      return null
    },
    async emailParaConvite() {
      throw new Error('não chega aqui: a reunião relida é nula')
    },
    async gravarEnvioDoConvite() {},
    async registrarPendenciaDoConvite() {},
    async calendarioParaEvento() {
      return null
    },
    async gravarEvento() {},
    async registrarFalhaDoEvento() {},
    async esquecerEvento() {},
    registrarNoLog(evento) {
      estado.logs.push({ evento: 'efeito_engolido', detalhe: evento })
    },
  }

  const porta: AmbienteDaFerramenta['porta'] = {
    async contasCandidatas() {
      return [CONTA, OUTRA_CONTA]
    },
    async chamadaDaConversa(contaId, conversaId) {
      if (conversaId === CONVERSA && contaId === chamada.account_id) return chamada
      if (conversaId === CONVERSA_DA_OUTRA_CONTA && contaId === OUTRA_CONTA) {
        return { ...CHAMADA, id: 'c0c0c0c0-9999-4999-8999-999999999999', account_id: OUTRA_CONTA }
      }
      return null
    },
    async registrarInvocacao(invocacao) {
      estado.registros.push(invocacao)
    },
  }

  const base = {
    porta,
    chaves: { vigente: CHAVE },
    agora: () => estado.agora,
    // O prazo só corre quando alguma porta pendura: aí ele estoura na hora.
    esperar: () => (falhas.has('pendura') ? Promise.resolve() : new Promise<void>(() => undefined)),
    log: (evento: string, detalhe: Readonly<Record<string, unknown>>) => {
      estado.logs.push({ evento, detalhe })
    },
  }

  const disponibilidade = criarToolAvailability(leituraDaDisponibilidade)
  const agendamento = criarToolBookMeeting(leituraDoAgendamento)

  interface Extras {
    segredo?: string
    conversa?: string
  }

  const pedido = async (corpo: unknown, extras: Extras) => ({
    metodo: 'POST',
    segredo: extras.segredo ?? (await derivarSegredo(CHAVE, CONTA)),
    conversa: extras.conversa ?? CONVERSA,
    corpo,
  })

  const ofertar = async (corpo: unknown = { area: 'vendas' }, extras: Extras = {}) =>
    vista(
      'tool-availability',
      await disponibilidade(await pedido(corpo, extras), {
        ...base,
        escrita: {
          async substituirOfertas(contaId, chamadaId, novas) {
            estado.passos.push('substituirOfertas')
            levantar('ofertas', ERRO_DAS_OFERTAS)
            estado.ofertas = estado.ofertas.filter((o) => o.call_id !== chamadaId)
            // `expires_at` é do gatilho: a consulta mais a duração máxima da chamada.
            for (const oferta of novas) {
              estado.ofertas.push({
                ...oferta,
                account_id: contaId,
                call_id: chamadaId,
                expires_at: new Date(estado.agora + DURACAO_MAXIMA_MS).toISOString(),
              })
            }
          },
        },
      }),
    )

  const marcar = async (
    corpo: unknown = { slot_position: 2, modality: 'video', email: 'marcos@fluxocargo.com.br' },
    extras: Extras = {},
  ) =>
    vista(
      'tool-book-meeting',
      await agendamento(await pedido(corpo, extras), { ...base, escrita: escritaDoAgendamento }),
    )

  return { estado, ofertar, marcar }
}

/** O mundo com as quatro ofertas de terça já gravadas, como depois de `tool-availability`. */
async function montarComOfertas(opcoes: Opcoes = {}) {
  const mundo = montar({ ...opcoes, falhas: [] })
  await mundo.ofertar()
  const comFalhas = montar(opcoes)
  comFalhas.estado.ofertas = mundo.estado.ofertas
  return comFalhas
}

const SEGREDO_ERRADO = 'f'.repeat(64)

// Os casos --------------------------------------------------------------------

describe('tool-availability', () => {
  contrato('tool-availability', 'carga válida', '200, até quatro ofertas gravadas e a fala por posição', async () => {
    const { estado, ofertar } = montar()

    const resposta = await ofertar({ area: 'vendas', duration_min: 30, days_ahead: 7 })

    expect(resposta.status).toBe(200)
    expect(resposta.corpo.ok).toBe(true)
    expect(resposta.corpo.speech).toBe(
      falarOferta(
        TERCA.map((inicio) => ({ inicio, fusoDoLead: 'America/Sao_Paulo', fusoDoEspecialista: 'America/Sao_Paulo' })),
        new Date(AGORA).toISOString(),
      ),
    )
    expect(estado.ofertas.map((o) => [o.position, o.starts_at])).toEqual(TERCA.map((inicio, i) => [i + 1, inicio]))
    expect(estado.registros).toHaveLength(1)
    expect(estado.registros[0]?.error).toBeNull()
  })

  contrato('tool-availability', 'campo faltante', 'nenhum campo é obrigatório: nunca 400, e o que falta vira padrão ou agenda vazia', async () => {
    // Campo fora da forma cai no padrão do especialista.
    for (const corpo of [{ area: 'vendas', duration_min: 'meia hora', days_ahead: -3 }, { area: 'vendas', specialist_id: '' }]) {
      const { estado, ofertar } = montar()

      const resposta = await ofertar(corpo)

      expect(resposta.status, JSON.stringify(corpo)).toBe(200)
      expect(resposta.corpo.ok).toBe(true)
      expect(estado.ofertas.map((o) => o.starts_at), JSON.stringify(corpo)).toEqual(TERCA)
    }
    // Sem área no modo por área, e corpo que nem é objeto: 200, agenda cheia e o motivo em código.
    for (const corpo of [{}, null, 'texto']) {
      const { estado, ofertar } = montar()

      const resposta = await ofertar(corpo)

      expect(resposta.status, JSON.stringify(corpo)).toBe(200)
      expect(resposta.corpo.ok).toBe(true)
      expect(resposta.corpo.speech).toBe(FALAS_DA_AGENDA.agendaCheia)
      expect(resposta.corpo.data?.offers).toEqual([])
      expect(typeof resposta.corpo.data?.reason).toBe('string')
      expect(estado.ofertas).toEqual([])
      expect(estado.registros[0]?.error).toBeNull()
    }
  })

  contrato('tool-availability', 'segredo inválido', '401, sem ler nada, e o motivo só no log', async () => {
    const { estado, ofertar } = montar()

    const resposta = await ofertar(undefined, { segredo: SEGREDO_ERRADO })

    expect(resposta.status).toBe(401)
    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(estado.passos).toEqual([])
    expect(estado.logs.map((l) => l.evento)).toEqual(['segredo_recusado'])
  })

  contrato('tool-availability', 'conversa inexistente', '404 igual para conversa de lugar nenhum e de outra conta', async () => {
    for (const conversa of ['conv_que_nao_existe', CONVERSA_DA_OUTRA_CONTA, '']) {
      const { estado, ofertar } = montar()

      const resposta = await ofertar(undefined, { conversa })

      expect(resposta.status).toBe(404)
      expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
      expect(estado.passos).toEqual([])
      expect(estado.registros).toEqual([])
    }
  })

  contrato('tool-availability', 'propósito errado', 'está nos quatro propósitos; fora do catálogo, 409 sem ler', async () => {
    expect(CATALOGO_DE_FERRAMENTAS.find((f) => f.nome === 'tool-availability')?.propositos).toEqual([...PROPOSITOS])
    const { estado, ofertar } = montar({ chamada: { ...CHAMADA, purpose: 'post_meeting' } })

    const resposta = await ofertar()

    expect(resposta.status).toBe(409)
    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.propositoErrado })
    expect(estado.passos).toEqual([])
    expect(estado.ofertas).toEqual([])
    expect(estado.registros[0]?.error).toBe('proposito_errado: post_meeting')
  })

  contrato('tool-availability', 'oferta expirada', 'a oferta vence no fim da chamada e a consulta seguinte a substitui', async () => {
    const { estado, ofertar } = montar()
    await ofertar()
    expect(estado.ofertas.every((o) => o.expires_at === new Date(FIM_DA_CHAMADA).toISOString())).toBe(true)

    // Passou da validade; a Sarah consulta de novo, agora só para a terça às 10h em diante.
    estado.agora = FIM_DA_CHAMADA + 60_000
    estado.reunioes.push({ inicio: TERCA[0]!, fim: TERCA[1]!, status: 'scheduled' })
    const resposta = await ofertar()

    expect(resposta.corpo.ok).toBe(true)
    expect(estado.ofertas.map((o) => o.position)).toEqual([1, 2, 3, 4])
    expect(estado.ofertas.map((o) => o.starts_at)).not.toContain(TERCA[0])
  })

  contrato('tool-availability', '23P01', 'depois do horário tomado, a nova consulta não oferece o mesmo horário', async () => {
    // O 23P01 é de quem insere (`tool-book-meeting`). O que cabe a esta
    // ferramenta é o passo seguinte do roteiro (T-08): chamada de novo, ela lê
    // a reunião de quem ganhou a corrida e não repete o horário perdido.
    const { estado, ofertar, marcar } = await montarComOfertas({ rpc: { resultado: 'horario_ocupado', reuniao_id: null } })
    const perdida = estado.ofertas.find((o) => o.position === 2)!.starts_at

    const recusa = await marcar()
    expect(recusa.corpo.speech).toBe(FALAS_DA_AGENDA.horarioTomado)
    estado.reunioes.push({ inicio: perdida, fim: TERCA[2]!, status: 'scheduled' })

    const resposta = await ofertar()

    expect(resposta.corpo.ok).toBe(true)
    expect(estado.ofertas.map((o) => o.starts_at)).not.toContain(perdida)
    expect(estado.ofertas).toHaveLength(4)
  })

  contrato('tool-availability', 'modo ensaio', 'a mesma resposta da ligação, com as ofertas gravadas para a marcação', async () => {
    const real = montar()
    const ensaio = montar({ chamada: { ...CHAMADA, direction: 'rehearsal' } })

    const daLigacao = await real.ofertar()
    const doEnsaio = await ensaio.ofertar()

    expect(doEnsaio).toEqual(daLigacao)
    expect(ensaio.estado.ofertas).toEqual(real.estado.ofertas)
    expect(ensaio.estado.registros[0]?.response).toEqual(real.estado.registros[0]?.response)
  })
})

describe('tool-book-meeting', () => {
  contrato('tool-book-meeting', 'carga válida', '200 com meeting_id e starts_at, a confirmação no fuso do lead, a oferta consumida', async () => {
    const { estado, marcar } = await montarComOfertas()

    const resposta = await marcar()

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({
      ok: true,
      data: { meeting_id: REUNIAO, starts_at: TERCA[1] },
      speech: falarConfirmacao(
        { inicio: TERCA[1]!, fusoDoLead: 'America/Sao_Paulo', fusoDoEspecialista: 'America/Sao_Paulo' },
        new Date(AGORA).toISOString(),
      ),
    })
    expect(estado.agendadas).toEqual([TERCA[1]])
    expect(estado.ofertas).toEqual([])
    expect(estado.registros[0]?.error).toBeNull()
  })

  contrato('tool-book-meeting', 'campo faltante', '400 com o campo nomeado, sem chegar à oferta nem ao RPC', async () => {
    const casos: [Record<string, unknown>, string, string][] = [
      [{ modality: 'video' }, 'slot_position', 'posição do horário'],
      [{ slot_position: 2 }, 'modality', 'modalidade'],
      [{ slot_position: '  ', modality: 'video' }, 'slot_position', 'posição do horário'],
    ]
    for (const [corpo, chave, campo] of casos) {
      const { estado, marcar } = await montarComOfertas()

      const resposta = await marcar(corpo)

      expect(resposta.status).toBe(400)
      expect(resposta.corpo).toEqual({ ok: false, data: { campo, chave }, speech: FALAS_DAS_FERRAMENTAS.campoFaltando })
      expect(estado.passos).toEqual([])
      expect(estado.registros[0]?.error).toBe(`campo_faltando: ${chave}`)
    }
  })

  contrato('tool-book-meeting', 'segredo inválido', '401, sem ler nada, e o motivo só no log', async () => {
    for (const segredo of [SEGREDO_ERRADO, '', 'segredo']) {
      const { estado, marcar } = await montarComOfertas()

      const resposta = await marcar(undefined, { segredo })

      expect(resposta.status).toBe(401)
      expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
      expect(estado.passos).toEqual([])
      expect(estado.registros).toEqual([])
      expect(estado.logs.map((l) => l.evento)).toEqual(['segredo_recusado'])
    }
  })

  contrato('tool-book-meeting', 'conversa inexistente', '404 igual para conversa de lugar nenhum e de outra conta', async () => {
    for (const conversa of ['conv_que_nao_existe', CONVERSA_DA_OUTRA_CONTA]) {
      const { estado, marcar } = await montarComOfertas()

      const resposta = await marcar(undefined, { conversa })

      expect(resposta.status).toBe(404)
      expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
      expect(estado.passos).toEqual([])
      expect(estado.registros).toEqual([])
      expect(estado.logs.map((l) => l.evento)).toEqual(['conversa_nao_encontrada'])
    }
  })

  contrato('tool-book-meeting', 'propósito errado', '409 no lembrete e no resgate, sem ler a oferta', async () => {
    for (const purpose of ['reminder', 'rescue']) {
      const { estado, marcar } = await montarComOfertas({ chamada: { ...CHAMADA, purpose } })

      const resposta = await marcar()

      expect(resposta.status).toBe(409)
      expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.propositoErrado })
      expect(estado.passos).toEqual([])
      expect(estado.registros[0]?.error).toBe(`proposito_errado: ${purpose}`)
    }
  })

  contrato('tool-book-meeting', 'oferta expirada', 'recusa com a fala que pede nova consulta; a consulta seguinte marca', async () => {
    const { estado, ofertar, marcar } = await montarComOfertas()
    estado.agora = FIM_DA_CHAMADA

    const vencida = await marcar()

    expect(vencida.status).toBe(200)
    expect(vencida.corpo).toEqual({
      ok: false,
      data: { reason: 'oferta_expirada' },
      speech: FALAS_DA_AGENDA.ofertaSemValidade,
    })
    expect(estado.passos).not.toContain('agendarReuniao')
    expect(estado.registros.at(-1)?.error).toBe('oferta_expirada')

    // O roteiro chama `tool-availability` de novo, e "a segunda opção" volta a valer.
    await ofertar()
    const marcada = await marcar()
    expect(marcada.corpo.ok).toBe(true)
    expect(estado.agendadas).toHaveLength(1)
  })

  contrato('tool-book-meeting', '23P01', 'resultado esperado: 200, ok false e a frase do PRD, sem consumir as ofertas', async () => {
    const { estado, marcar } = await montarComOfertas({ rpc: { resultado: 'horario_ocupado', reuniao_id: null } })

    const resposta = await marcar()

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({ ok: false, data: { reason: 'horario_ocupado' }, speech: FALAS_DA_AGENDA.horarioTomado })
    expect(falada(resposta.corpo.speech)).toBe('esse horario acabou de ser preenchido deixa eu ver outro')
    expect(estado.ofertas).toHaveLength(4)
    expect(estado.registros[0]?.error).toBe('horario_ocupado')
  })

  contrato('tool-book-meeting', 'modo ensaio', 'a mesma fala da ligação, com meeting_id nulo, sem RPC e sem consumir a oferta', async () => {
    const real = await montarComOfertas()
    const ensaio = await montarComOfertas({ chamada: { ...CHAMADA, direction: 'rehearsal' } })

    const daLigacao = await real.marcar()
    const doEnsaio = await ensaio.marcar()

    expect(doEnsaio.status).toBe(200)
    expect(doEnsaio.corpo).toEqual({ ...daLigacao.corpo, data: { meeting_id: null, starts_at: TERCA[1] } })
    expect(ensaio.estado.passos).not.toContain('agendarReuniao')
    expect(ensaio.estado.passos).not.toContain('consumirOfertas')
    expect(ensaio.estado.ofertas).toHaveLength(4)
    expect(ensaio.estado.agendadas).toEqual([])
  })
})

// A falha genérica -------------------------------------------------------------

describe('a falha genérica é a frase de contorno, e o motivo fica no registro', () => {
  const FRASE = 'deixa eu confirmar isso com o time e ja te retorno'

  test('a frase de contorno é exatamente a da seção 5', () => {
    expect(falada(FALAS_DAS_FERRAMENTAS.falha)).toBe(FRASE)
    expect(FALAS_DA_AGENDA.falha).toBe(FALAS_DAS_FERRAMENTAS.falha)
  })

  const DA_DISPONIBILIDADE: [Falha, string][] = [
    ['configuracao', ERRO_DA_CONFIGURACAO],
    ['ofertas', ERRO_DAS_OFERTAS],
    ['pendura', 'prazo_estourado'],
  ]
  test.each(DA_DISPONIBILIDADE)('tool-availability com %s em falha', async (falha, noRegistro) => {
    const { estado, ofertar } = montar({ falhas: [falha] })

    const resposta = await ofertar()

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(falada(resposta.corpo.speech)).toBe(FRASE)
    expect(estado.registros[0]?.error).toContain(noRegistro)
  })

  const DO_AGENDAMENTO: [Falha, string][] = [
    ['rpc', ERRO_DO_RPC],
    ['fuso', ERRO_DA_LEITURA],
    ['calendario', ERRO_DO_CALENDARIO],
    ['pendura', 'prazo_estourado'],
  ]
  test.each(DO_AGENDAMENTO)('tool-book-meeting com %s em falha', async (falha, noRegistro) => {
    const { estado, marcar } = await montarComOfertas({ falhas: [falha], comCalendario: true })

    const resposta = await marcar()

    expect(resposta.status).toBe(200)
    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(estado.registros[0]?.error).toContain(noRegistro)
  })

  test('o 23P01 cru, que escapasse do RPC, também não chega à fala', async () => {
    const { estado, marcar } = await montarComOfertas({ falhas: ['rpc'] })

    const resposta = await marcar()

    expect(resposta.corpo.speech).toBe(FALAS_DAS_FERRAMENTAS.falha)
    expect(estado.registros[0]?.error).toContain('23P01')
  })

  test('evento e convite que falham depois da reunião marcada vão para o log, e a confirmação sai', async () => {
    const { estado, marcar } = await montarComOfertas({ falhas: ['evento', 'convite'] })

    const resposta = await marcar()

    expect(resposta.corpo.ok).toBe(true)
    expect(resposta.corpo.data).toEqual({ meeting_id: REUNIAO, starts_at: TERCA[1] })
    const engolidos = estado.logs.filter((l) => l.evento === 'efeito_engolido').map((l) => String(l.detalhe.erro))
    expect(engolidos).toEqual(expect.arrayContaining([ERRO_DO_CALENDARIO, expect.stringContaining('validation_error')]))
    expect(estado.registros[0]?.error).toBeNull()
  })
})

// O oráculo ----------------------------------------------------------------------

describe('segredo inválido e conversa inexistente não viram oráculo', () => {
  test('sem o segredo, a conversa que existe e a que não existe dão a mesma resposta', async () => {
    const respostas = []
    for (const conversa of [CONVERSA, 'conv_que_nao_existe', CONVERSA_DA_OUTRA_CONTA]) {
      respostas.push(await montar().ofertar(undefined, { segredo: SEGREDO_ERRADO, conversa }))
      respostas.push(await (await montarComOfertas()).marcar(undefined, { segredo: SEGREDO_ERRADO, conversa }))
    }
    expect(new Set(respostas.map((r) => JSON.stringify(r))).size).toBe(1)
  })

  test('401 e 404 têm o mesmo corpo, e o motivo do segredo recusado só aparece no log', async () => {
    const semSegredo = montar()
    const semConversa = montar()

    const r401 = await semSegredo.ofertar(undefined, { segredo: 'curto' })
    const r404 = await semConversa.ofertar(undefined, { conversa: 'conv_que_nao_existe' })

    expect(r401.corpo).toEqual(r404.corpo)
    const motivo = semSegredo.estado.logs[0]?.detalhe.motivo
    expect(typeof motivo).toBe('string')
    expect(JSON.stringify(r401)).not.toContain(String(motivo))
  })

  test('a recusa com chamada conhecida grava o motivo em call_tool_invocations, e só lá', async () => {
    const { estado, marcar } = await montarComOfertas({ falhas: ['rpc'] })

    const resposta = await marcar()

    expect(estado.registros[0]?.error).toContain('meetings_sem_sobreposicao')
    expect(estado.registros[0]?.response).toEqual({ ...resposta.corpo })
    expect(JSON.stringify(resposta)).not.toContain('meetings_sem_sobreposicao')
  })
})

// A cobertura e a varredura -----------------------------------------------------------

/** Os nomes de tabela e coluna de todas as migrações. */
function nomesDoEsquema(): { tabelas: Set<string>; colunas: Set<string> } {
  const pasta = new URL('../../../migrations/', import.meta.url)
  const tabelas = new Set<string>()
  const colunas = new Set<string>()
  for (const arquivo of readdirSync(pasta).filter((nome) => nome.endsWith('.sql'))) {
    const sql = readFileSync(new URL(arquivo, pasta), 'utf8')
    for (const [, nome] of sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)\s*\(/gi)) tabelas.add(nome!)
    for (const [, corpo] of sql.matchAll(/create table [^(]*\(([\s\S]*?)\n\);/gi)) {
      for (const [, coluna] of corpo!.matchAll(/^\s+(\w+)\s+(?:uuid|text|int|integer|bigint|smallint|boolean|timestamptz|date|time|jsonb|numeric|tstzrange|citext|interval|real)\b/gim)) {
        colunas.add(coluna!)
      }
    }
    for (const [, coluna] of sql.matchAll(/add column (?:if not exists )?(\w+)/gi)) colunas.add(coluna!)
  }
  return { tabelas, colunas }
}

describe('a cobertura e a varredura', () => {
  test('as duas ferramentas têm os oito casos da seção 9.2', () => {
    for (const ferramenta of ['tool-availability', 'tool-book-meeting'] as const) {
      expect([...cobertos[ferramenta]].sort(), ferramenta).toEqual([...CASOS].sort())
    }
  })

  test('o esquema lido tem as tabelas e as colunas da agenda: a varredura não procura no vazio', () => {
    const { tabelas, colunas } = nomesDoEsquema()
    expect([...tabelas]).toEqual(expect.arrayContaining(['meetings', 'call_slot_offers', 'specialists', 'leads', 'calls']))
    expect([...colunas]).toEqual(expect.arrayContaining(['starts_at', 'expires_at', 'specialist_id', 'timezone', 'modality']))
  })

  test('nenhuma fala da suíte carrega SQLSTATE, tabela, coluna ou código de provedor', () => {
    const { tabelas, colunas } = nomesDoEsquema()
    const palavra = (nome: string) =>
      new RegExp(`(?<![\\p{L}\\d_])${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d_])`, 'u')
    const proibidos: [string, RegExp][] = [
      // SQLSTATE: cinco caracteres, dígitos e maiúsculas, começando por dígito (23P01, 42703).
      ['SQLSTATE', /(?<![\p{L}\d])\d[\dA-Z]{4}(?![\p{L}\d])/u],
      ['a palavra SQLSTATE', /sqlstate/i],
      // Identificador em snake_case não é português falado: motivo, código, coluna.
      ['identificador', /[a-z]+_[a-z_]+/i],
      ['código de provedor', /invalid_grant|unauthenticated|validation_error|http\s*\d{3}|\b[45]\d\d\b|resend|google/i],
      ['erro em inglês', /\b(error|exception|constraint|violates|relation|duplicate|timeout|null|undefined)\b/i],
      ...[...tabelas].map((nome): [string, RegExp] => [`tabela ${nome}`, palavra(nome)]),
      ...[...colunas].map((nome): [string, RegExp] => [`coluna ${nome}`, palavra(nome)]),
    ]

    expect(vistas.length).toBeGreaterThan(40)
    expect(vistas.some((v) => v.ferramenta === 'tool-availability' && !v.resposta.corpo.ok)).toBe(true)
    expect(vistas.some((v) => v.ferramenta === 'tool-book-meeting' && !v.resposta.corpo.ok)).toBe(true)
    for (const { ferramenta, resposta } of vistas) {
      for (const [nome, padrao] of proibidos) {
        expect(resposta.corpo.speech, `${ferramenta} disse ${nome}`).not.toMatch(padrao)
      }
    }
  })
})
