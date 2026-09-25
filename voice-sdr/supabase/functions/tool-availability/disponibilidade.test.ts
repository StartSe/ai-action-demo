// tool-availability sobre o esqueleto, com a leitura e a escrita dubladas em
// memória: a oferta feliz, o fuso do lead, a ocupação vinda do banco, a
// substituição na segunda chamada, a agenda cheia, o ensaio, o registro e as
// recusas de segredo e de conversa.

import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { FALAS_DA_AGENDA, falarHorario, falarOferta } from '../_shared/speech/agenda.ts'
import { FALAS_DAS_FERRAMENTAS } from '../_shared/speech/ferramentas.ts'
import type {
  AmbienteDaFerramenta,
  ChamadaDaFerramenta,
  InvocacaoParaRegistro,
  RespostaDaFerramenta,
} from '../_shared/tools/esqueleto.ts'
import { derivarSegredo } from '../_shared/tools/segredo.ts'

import {
  STATUS_QUE_OCUPAM,
  criarToolAvailability,
  lerPedido,
  type AgendaDoEspecialista,
  type ConfiguracaoDaAgenda,
  type EscritaDaDisponibilidade,
  type EspecialistaDaConta,
  type OfertaParaGravar,
  type PortaDeDisponibilidade,
} from './disponibilidade.ts'

const CONTA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CHAMADA_ID = 'cafecafe-dead-4bee-8fed-abcdefabcdef'
const LEAD = 'facefeed-beef-4abc-8def-fedcbafedcba'
const ANA = 'a0a0a0a0-1111-4111-8111-111111111111'
const BRUNO = 'b0b0b0b0-2222-4222-8222-222222222222'
const CAIO = 'c0c0c0c0-3333-4333-8333-333333333333'
const CONVERSA = 'conv_vexo_marcos_05'
const CHAVE = 'chave-do-servidor-de-teste'

/** Segunda-feira, 5 de outubro de 2026, 10h em São Paulo. */
const AGORA = Date.UTC(2026, 9, 5, 13, 0, 0)

const CHAMADA: ChamadaDaFerramenta = {
  id: CHAMADA_ID,
  account_id: CONTA,
  purpose: 'discovery',
  direction: 'outbound',
  lead_id: LEAD,
}

/** Terça das 9h às 12h, em São Paulo: amanhã, a partir das 9h. */
function especialista(id: string, extras: Partial<EspecialistaDaConta> = {}): EspecialistaDaConta {
  return {
    id,
    area: 'vendas',
    ativo: true,
    fuso: 'America/Sao_Paulo',
    duracaoPadraoMin: 30,
    tetoDiario: 6,
    antecedenciaMinimaMin: 120,
    antecedenciaMaximaDias: 30,
    ultimaAtribuicaoEm: null,
    disponibilidade: [{ diaDaSemana: 2, inicio: '09:00', fim: '12:00' }],
    ...extras,
  }
}

/** Os quatro primeiros horários de terça, 6 de outubro, em UTC. */
const TERCA = ['2026-10-06T12:00:00Z', '2026-10-06T12:30:00Z', '2026-10-06T13:00:00Z', '2026-10-06T13:30:00Z']

interface Opcoes {
  chamada?: ChamadaDaFerramenta
  configuracao?: Partial<ConfiguracaoDaAgenda>
  fusoDoLead?: string | null
  especialistas?: EspecialistaDaConta[]
  agendas?: AgendaDoEspecialista[]
  leituraFalha?: boolean
  chaves?: AmbienteDaFerramenta['chaves']
}

interface LinhaDeOferta extends OfertaParaGravar {
  readonly account_id: string
  readonly call_id: string
}

function montar(opcoes: Opcoes = {}) {
  const chamada = opcoes.chamada ?? CHAMADA
  const estado = {
    /** A tabela `call_slot_offers` em memória. */
    ofertas: [] as LinhaDeOferta[],
    registros: [] as InvocacaoParaRegistro[],
    logs: [] as string[],
    tocados: [] as string[],
    escritas: 0,
    agendas: opcoes.agendas ?? [],
    periodos: [] as { ids: readonly string[]; de: string; ate: string }[],
  }

  const real: PortaDeDisponibilidade = {
    async configuracaoDaConta(contaId) {
      if (opcoes.leituraFalha) throw new Error('banco indisponível')
      expect(contaId).toBe(CONTA)
      return { modo: 'area', especialistaFixo: null, fusoDaConta: 'America/Sao_Paulo', ...opcoes.configuracao }
    },
    async fusoDoLead(contaId, leadId) {
      expect([contaId, leadId]).toEqual([CONTA, LEAD])
      return opcoes.fusoDoLead === undefined ? 'America/Sao_Paulo' : opcoes.fusoDoLead
    },
    async especialistasDaConta() {
      return opcoes.especialistas ?? [especialista(ANA)]
    },
    async agendaNoPeriodo(_contaId, ids, periodo) {
      estado.periodos.push({ ids, ...periodo })
      return estado.agendas.filter((agenda) => ids.includes(agenda.especialistaId))
    },
  }
  // Toda leitura passa por aqui: é o registro que prova que a ferramenta só lê
  // o banco, e só pelos métodos desta porta.
  const leitura = new Proxy(real, {
    get(alvo, membro, receptor) {
      estado.tocados.push(String(membro))
      return Reflect.get(alvo, membro, receptor)
    },
  })

  const escrita: EscritaDaDisponibilidade = {
    async substituirOfertas(contaId, chamadaId, ofertas) {
      estado.escritas += 1
      // O que o `index.ts` faz: apaga as da chamada e insere as novas.
      estado.ofertas = estado.ofertas.filter((linha) => linha.call_id !== chamadaId)
      for (const oferta of ofertas) estado.ofertas.push({ ...oferta, account_id: contaId, call_id: chamadaId })
    },
  }

  const ambiente: AmbienteDaFerramenta<EscritaDaDisponibilidade> = {
    escrita,
    chaves: opcoes.chaves ?? { vigente: CHAVE },
    agora: () => AGORA,
    esperar: () => new Promise<void>(() => undefined),
    log: (evento) => {
      estado.logs.push(evento)
    },
    porta: {
      async contasCandidatas() {
        return [CONTA]
      },
      async chamadaDaConversa(contaId, conversaId) {
        return conversaId === CONVERSA && contaId === chamada.account_id ? chamada : null
      },
      async registrarInvocacao(invocacao) {
        estado.registros.push(invocacao)
      },
    },
  }

  const tratar = criarToolAvailability(leitura)
  const chamar = async (
    corpo: unknown = {},
    extras: { conversa?: string; segredo?: string } = {},
  ): Promise<RespostaDaFerramenta> =>
    tratar(
      {
        metodo: 'POST',
        segredo: extras.segredo ?? (await derivarSegredo(CHAVE, CONTA)),
        conversa: extras.conversa ?? CONVERSA,
        corpo,
      },
      ambiente,
    )

  /** "A segunda opção", resolvida como `tool-book-meeting` vai resolver: pela chamada e pela posição. */
  const resolver = (posicao: number) =>
    estado.ofertas.find((linha) => linha.call_id === CHAMADA_ID && linha.position === posicao) ?? null

  return { estado, chamar, resolver }
}

function ofertasDe(resposta: RespostaDaFerramenta) {
  return (resposta.corpo.data?.offers ?? []) as { position: number; starts_at: string; ends_at: string; label: string }[]
}

describe('a oferta', () => {
  test('até quatro horários, gravados nas posições 1 a 4 e falados por posição', async () => {
    const { estado, chamar } = montar()

    const resposta = await chamar({ area: 'vendas' })

    expect(resposta.status).toBe(200)
    expect(resposta.corpo.ok).toBe(true)
    expect(ofertasDe(resposta).map((o) => [o.position, o.starts_at])).toEqual(TERCA.map((inicio, i) => [i + 1, inicio]))
    expect(estado.ofertas.map((o) => [o.position, o.specialist_id, o.starts_at])).toEqual(
      TERCA.map((inicio, i) => [i + 1, ANA, inicio]),
    )
    const falados = TERCA.map((inicio) => ({
      inicio,
      fusoDoLead: 'America/Sao_Paulo',
      fusoDoEspecialista: 'America/Sao_Paulo',
    }))
    const agora = new Date(AGORA).toISOString()
    expect(resposta.corpo.speech).toBe(falarOferta(falados, agora))
    expect(resposta.corpo.speech).toContain('opção um, amanhã às 9h')
    expect(ofertasDe(resposta)[1]?.label).toBe(falarHorario(falados[1]!, agora))
  })

  test('o fim de cada oferta vem da duração do especialista', async () => {
    const { chamar } = montar()
    const [primeira] = ofertasDe(await chamar({ area: 'vendas' }))
    expect(primeira?.ends_at).toBe('2026-10-06T12:30:00Z')
  })

  test('a fala sai no fuso do lead e diz o do especialista quando o relógio difere', async () => {
    const { estado, chamar } = montar({ fusoDoLead: 'America/Manaus' })

    const resposta = await chamar({ area: 'vendas' })

    expect(resposta.corpo.speech).toContain('amanhã às 8h no seu horário, 9h aqui em São Paulo')
    // O instante gravado é o mesmo: só a frase muda de fuso.
    expect(estado.ofertas.map((o) => o.starts_at)).toEqual(TERCA)
  })

  test('lead sem fuso próprio ouve no fuso da conta', async () => {
    const { chamar } = montar({ fusoDoLead: null, configuracao: { fusoDaConta: 'America/Manaus' } })
    expect((await chamar({ area: 'vendas' })).corpo.speech).toContain('no seu horário')
  })

  test('nenhum identificador vai no corpo: nem o do especialista, nem o da chamada', async () => {
    const { chamar } = montar()
    const corpo = JSON.stringify((await chamar({ area: 'vendas' })).corpo)
    expect(corpo).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })
})

describe('só o banco', () => {
  test('a leitura toca exatamente os quatro métodos da porta, sem calendário externo', async () => {
    const { estado, chamar } = montar()

    await chamar({ area: 'vendas' })

    expect([...new Set(estado.tocados)].sort()).toEqual(
      ['agendaNoPeriodo', 'configuracaoDaConta', 'especialistasDaConta', 'fusoDoLead'].sort(),
    )
  })

  test('o módulo não faz requisição de rede', () => {
    const fonte = readFileSync(new URL('./disponibilidade.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(fonte).not.toMatch(/fetch\(|googleapis|XMLHttpRequest/)
  })

  test('bloqueio, ocupação externa e reunião marcada cortam o horário; reunião cancelada não', async () => {
    const intervalo = (inicio: string, fim: string) => ({ inicio, fim })
    const { chamar } = montar({
      agendas: [
        {
          especialistaId: ANA,
          bloqueios: [intervalo(TERCA[0]!, TERCA[1]!)],
          ocupacaoExterna: [intervalo(TERCA[1]!, TERCA[2]!)],
          reunioes: [
            { ...intervalo(TERCA[2]!, TERCA[3]!), status: 'scheduled' },
            { ...intervalo(TERCA[3]!, '2026-10-06T14:00:00Z'), status: 'canceled' },
          ],
        },
      ],
    })

    const inicios = ofertasDe(await chamar({ area: 'vendas' })).map((o) => o.starts_at)

    expect(inicios[0]).toBe(TERCA[3])
    expect(inicios).not.toContain(TERCA[0])
    expect(inicios).not.toContain(TERCA[1])
    expect(inicios).not.toContain(TERCA[2])
  })

  test('ocupam horário os mesmos status do predicado da restrição de exclusão', () => {
    expect([...STATUS_QUE_OCUPAM].sort()).toEqual(['confirmed', 'scheduled'])
  })

  test('o período lido cobre o dia inteiro de hoje e o horizonte do especialista', async () => {
    const { estado, chamar } = montar()

    await chamar({ area: 'vendas' })

    expect(estado.periodos).toEqual([
      { ids: [ANA], de: '2026-10-04T13:00:00.000Z', ate: '2026-11-05T13:00:00.000Z' },
    ])
  })
})

describe('segunda chamada na mesma conversa', () => {
  test('substitui as ofertas: posições continuam 1 a 4 e a oferta velha deixa de resolver', async () => {
    const { estado, chamar, resolver } = montar()

    await chamar({ area: 'vendas' })
    expect(resolver(2)?.starts_at).toBe(TERCA[1])

    // Entre uma consulta e outra, o horário da segunda opção foi marcado.
    estado.agendas = [
      {
        especialistaId: ANA,
        bloqueios: [],
        ocupacaoExterna: [],
        reunioes: [{ inicio: TERCA[1]!, fim: TERCA[2]!, status: 'confirmed' }],
      },
    ]
    await chamar({ area: 'vendas' })

    expect(estado.ofertas.map((o) => o.position)).toEqual([1, 2, 3, 4])
    expect(estado.ofertas.map((o) => o.starts_at)).not.toContain(TERCA[1])
    expect(resolver(2)?.starts_at).toBe(TERCA[2])
  })

  test('sem horário na segunda, as ofertas da primeira somem', async () => {
    const { estado, chamar, resolver } = montar()

    await chamar({ area: 'vendas' })
    estado.agendas = [
      {
        especialistaId: ANA,
        bloqueios: [{ inicio: '2026-10-01T00:00:00Z', fim: '2026-12-01T00:00:00Z' }],
        ocupacaoExterna: [],
        reunioes: [],
      },
    ]
    const resposta = await chamar({ area: 'vendas' })

    expect(ofertasDe(resposta)).toEqual([])
    expect(estado.ofertas).toEqual([])
    expect(resolver(1)).toBeNull()
  })
})

describe('agenda cheia', () => {
  test('sem horário é ok com lista vazia e a fala de agenda cheia, nunca erro', async () => {
    const { estado, chamar } = montar({ especialistas: [especialista(ANA, { disponibilidade: [] })] })

    const resposta = await chamar({ area: 'vendas' })

    expect(resposta.status).toBe(200)
    expect(resposta.corpo.ok).toBe(true)
    expect(resposta.corpo.speech).toBe(FALAS_DA_AGENDA.agendaCheia)
    expect(ofertasDe(resposta)).toEqual([])
    expect(estado.registros[0]?.error).toBeNull()
  })

  test('com gente apta e nenhuma hora livre, o motivo é sem_horario', async () => {
    const { chamar } = montar({
      agendas: [
        {
          especialistaId: ANA,
          bloqueios: [{ inicio: '2026-10-01T00:00:00Z', fim: '2026-12-01T00:00:00Z' }],
          ocupacaoExterna: [],
          reunioes: [],
        },
      ],
    })
    expect((await chamar({ area: 'vendas' })).corpo.data).toEqual({ offers: [], reason: 'sem_horario' })
  })

  test('área que ninguém atende é agenda cheia com o motivo do roteamento, e nenhuma agenda é lida', async () => {
    const { estado, chamar } = montar()

    const resposta = await chamar({ area: 'jurídico' })

    expect(resposta.corpo).toEqual({
      ok: true,
      data: { offers: [], reason: 'sem_especialista_na_area' },
      speech: FALAS_DA_AGENDA.agendaCheia,
    })
    expect(estado.tocados).not.toContain('agendaNoPeriodo')
  })
})

describe('o pedido', () => {
  test('duration_min muda a duração de cada oferta', async () => {
    const { chamar } = montar()
    const ofertas = ofertasDe(await chamar({ area: 'vendas', duration_min: 60 }))
    expect(ofertas.map((o) => [o.starts_at, o.ends_at])).toEqual([
      ['2026-10-06T12:00:00Z', '2026-10-06T13:00:00Z'],
      ['2026-10-06T13:00:00Z', '2026-10-06T14:00:00Z'],
      ['2026-10-06T14:00:00Z', '2026-10-06T15:00:00Z'],
      ['2026-10-13T12:00:00Z', '2026-10-13T13:00:00Z'],
    ])
  })

  test('days_ahead encurta o horizonte, e hoje sem faixa deixa a agenda vazia', async () => {
    const { chamar } = montar({
      especialistas: [especialista(ANA, { disponibilidade: [{ diaDaSemana: 4, inicio: '09:00', fim: '12:00' }] })],
    })
    // Quinta fica a três dias: com um à frente ela não entra, com quatro entra inteira.
    expect(ofertasDe(await chamar({ area: 'vendas', days_ahead: 1 }))).toEqual([])
    expect(ofertasDe(await chamar({ area: 'vendas', days_ahead: '4' }))).toHaveLength(4)
  })

  test('valor fora da forma fica com o padrão do especialista', () => {
    expect(lerPedido({ duration_min: 5, days_ahead: '2x', area: '  ', specialist_id: 7 })).toEqual({
      area: null,
      especialistaId: null,
      duracaoMin: null,
      diasAFrente: null,
    })
    expect(lerPedido({ duration_min: '45', days_ahead: 7 })).toMatchObject({ duracaoMin: 45, diasAFrente: 7 })
  })

  test('days_ahead nunca estica além da antecedência máxima do especialista', async () => {
    const { estado, chamar } = montar({ especialistas: [especialista(ANA, { antecedenciaMaximaDias: 2 })] })
    await chamar({ area: 'vendas', days_ahead: 60 })
    expect(estado.periodos[0]?.ate).toBe('2026-10-08T13:00:00.000Z')
  })
})

describe('roteamento', () => {
  test('rodízio: a oferta é de um só, o que esperou mais', async () => {
    const { estado, chamar } = montar({
      configuracao: { modo: 'round_robin' },
      especialistas: [
        especialista(ANA, { ultimaAtribuicaoEm: '2026-10-02T12:00:00Z' }),
        especialista(BRUNO, { ultimaAtribuicaoEm: '2026-09-30T12:00:00Z' }),
      ],
    })

    await chamar()

    expect(new Set(estado.ofertas.map((o) => o.specialist_id))).toEqual(new Set([BRUNO]))
  })

  test('rodízio: quem esperou mais sem hora livre passa a vez ao seguinte', async () => {
    const { estado, chamar } = montar({
      configuracao: { modo: 'round_robin' },
      especialistas: [
        especialista(ANA, { ultimaAtribuicaoEm: '2026-10-02T12:00:00Z' }),
        especialista(BRUNO, { ultimaAtribuicaoEm: '2026-09-30T12:00:00Z' }),
      ],
      agendas: [
        {
          especialistaId: BRUNO,
          bloqueios: [{ inicio: '2026-10-01T00:00:00Z', fim: '2026-12-01T00:00:00Z' }],
          ocupacaoExterna: [],
          reunioes: [],
        },
      ],
    })

    await chamar()

    expect(new Set(estado.ofertas.map((o) => o.specialist_id))).toEqual(new Set([ANA]))
  })

  test('área: junta as agendas em ordem de tempo, um horário por instante', async () => {
    const { estado, chamar } = montar({
      especialistas: [
        especialista(ANA),
        especialista(BRUNO, { disponibilidade: [{ diaDaSemana: 2, inicio: '09:15', fim: '10:15' }] }),
      ],
    })

    const resposta = await chamar({ area: 'Vendas' })

    expect(estado.ofertas.map((o) => [o.starts_at, o.specialist_id])).toEqual([
      ['2026-10-06T12:00:00Z', ANA],
      ['2026-10-06T12:15:00Z', BRUNO],
      ['2026-10-06T12:30:00Z', ANA],
      ['2026-10-06T12:45:00Z', BRUNO],
    ])
    expect(new Set(ofertasDe(resposta).map((o) => o.starts_at)).size).toBe(4)
  })

  test('área: o mesmo instante em dois especialistas vira uma oferta só', async () => {
    const { estado, chamar } = montar({ especialistas: [especialista(BRUNO), especialista(ANA)] })

    await chamar({ area: 'vendas' })

    expect(estado.ofertas.map((o) => o.starts_at)).toEqual(TERCA)
  })

  test('fixo: só o especialista configurado', async () => {
    const { estado, chamar } = montar({
      configuracao: { modo: 'fixed', especialistaFixo: CAIO },
      especialistas: [especialista(ANA), especialista(CAIO, { area: null })],
    })

    await chamar()

    expect(new Set(estado.ofertas.map((o) => o.specialist_id))).toEqual(new Set([CAIO]))
  })

  test('specialist_id na entrada troca o modo da conta pelo fixo nele', async () => {
    const { estado, chamar } = montar({ especialistas: [especialista(ANA), especialista(BRUNO)] })

    await chamar({ specialist_id: BRUNO })

    expect(new Set(estado.ofertas.map((o) => o.specialist_id))).toEqual(new Set([BRUNO]))
  })

  test('specialist_id que não é da conta é agenda cheia, e não oferta de outra pessoa', async () => {
    const { estado, chamar } = montar()

    const resposta = await chamar({ specialist_id: CAIO })

    expect(resposta.corpo.data).toEqual({ offers: [], reason: 'especialista_fixo_inativo' })
    expect(estado.ofertas).toEqual([])
  })

  test('modo gravado desconhecido é falha, com a frase de contorno', async () => {
    const { estado, chamar } = montar({ configuracao: { modo: 'weighted' } })

    const resposta = await chamar({ area: 'vendas' })

    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(estado.registros[0]?.error).toMatch(/routing_mode desconhecido/)
  })
})

describe('ensaio', () => {
  test('lê tudo de verdade, responde igual e grava as ofertas, que são memória da conversa', async () => {
    const real = montar()
    const ensaio = montar({ chamada: { ...CHAMADA, direction: 'rehearsal' } })

    const daLigacao = await real.chamar({ area: 'vendas' })
    const doEnsaio = await ensaio.chamar({ area: 'vendas' })

    expect(doEnsaio.corpo).toEqual(daLigacao.corpo)
    expect(ensaio.estado.tocados).toContain('agendaNoPeriodo')
    // Sem a oferta gravada, tool-book-meeting do ensaio não teria o que marcar
    // (T-16 lista o que o ensaio pula, e a oferta não está lá).
    expect(ensaio.estado.ofertas).toEqual(real.estado.ofertas)
    expect(ensaio.estado.escritas).toBe(1)
  })
})

describe('registro e recusas', () => {
  test('a invocação da chamada identificada vai para call_tool_invocations', async () => {
    const { estado, chamar } = montar()

    const resposta = await chamar({ area: 'vendas' })

    expect(estado.registros).toHaveLength(1)
    expect(estado.registros[0]).toMatchObject({
      tool: 'tool-availability',
      account_id: CONTA,
      call_id: CHAMADA_ID,
      request: { area: 'vendas' },
      response: { ...resposta.corpo },
      error: null,
    })
  })

  test('falha da leitura é a frase de contorno, registrada com o erro', async () => {
    const { estado, chamar } = montar({ leituraFalha: true })

    const resposta = await chamar({ area: 'vendas' })

    expect(resposta.corpo).toEqual({ ok: false, data: null, speech: FALAS_DAS_FERRAMENTAS.falha })
    expect(estado.registros[0]?.error).toMatch(/banco indisponível/)
    expect(estado.escritas).toBe(0)
  })

  // A tabela exige `call_id` e `account_id`: segredo que não prova conta e
  // conversa que não existe não têm onde virar linha, e o esqueleto os manda
  // para o `log` (esqueleto.ts, "O que não vira linha").
  test('segredo inválido é 401 antes de qualquer leitura, e vai para o log', async () => {
    const { estado, chamar } = montar()

    const resposta = await chamar({ area: 'vendas' }, { segredo: 'f'.repeat(64) })

    expect(resposta.status).toBe(401)
    expect(estado.tocados).toEqual([])
    expect(estado.registros).toEqual([])
    expect(estado.logs).toEqual(['segredo_recusado'])
  })

  test('conversa inexistente é 404, sem leitura da agenda, e vai para o log', async () => {
    const { estado, chamar } = montar()

    const resposta = await chamar({ area: 'vendas' }, { conversa: 'conv_de_ninguem' })

    expect(resposta.status).toBe(404)
    expect(estado.tocados).toEqual([])
    expect(estado.logs).toEqual(['conversa_nao_encontrada'])
  })

  test('dois segredos valem por 24 h depois da rotação', async () => {
    const NOVA = 'chave-nova-do-servidor'
    const rotacionadaEm = AGORA - 23 * 3_600_000
    const { chamar } = montar({ chaves: { vigente: NOVA, anterior: CHAVE, rotacionadaEm } })

    expect((await chamar({ area: 'vendas' })).status).toBe(200)
    expect((await chamar({ area: 'vendas' }, { segredo: await derivarSegredo(NOVA, CONTA) })).status).toBe(200)

    const vencida = montar({ chaves: { vigente: NOVA, anterior: CHAVE, rotacionadaEm: AGORA - 25 * 3_600_000 } })
    expect((await vencida.chamar({ area: 'vendas' })).status).toBe(401)
  })
})
