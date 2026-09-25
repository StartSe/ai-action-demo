// O evento da reunião com a porta do calendário e a escrita dubladas: criado e
// id gravado, falha mantendo a reunião com recuo e teto, nova tentativa sem
// duplicar evento e cancelamento apagando o evento.

import { describe, expect, test } from 'vitest'

import { falhaDoCalendario, type EventoDaReuniao, type PortaDeCalendario } from './calendario.ts'
import {
  RECUO_EM_MINUTOS,
  TETO_DE_TENTATIVAS,
  apagarEventoDaReuniao,
  criarEventoDaReuniao,
  eventoDesistiu,
  falhaDepoisDe,
  lerReuniaoParaEvento,
  montarEventoDaReuniao,
  textoDoResumo,
  type FalhaDoEvento,
  type PortaDoEventoDaReuniao,
  type ReuniaoParaEvento,
} from './evento-da-reuniao.ts'

const CONTA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const REUNIAO = 'deadbeef-0000-4000-8000-000000000001'
const AGORA = Date.UTC(2026, 9, 5, 13, 0, 0)

function reuniao(extras: Partial<ReuniaoParaEvento> = {}): ReuniaoParaEvento {
  return {
    id: REUNIAO,
    account_id: CONTA,
    specialist_id: 'a0a0a0a0-1111-4111-8111-111111111111',
    starts_at: '2026-10-06T12:30:00Z',
    ends_at: '2026-10-06T13:00:00Z',
    modality: 'video',
    notes: 'quer ver a integração',
    handoff_summary: null,
    external_event_id: null,
    event_attempts: 0,
    nomeDoLead: 'Marcos Lima',
    salaDoEspecialista: 'https://meet.exemplo.com/ana',
    ...extras,
  }
}

type Resposta = 'ok' | 'expirada' | 'sem_resposta' | 'levanta'

function montar(respostas: Resposta[] = ['ok']) {
  const estado = {
    criados: [] as EventoDaReuniao[],
    apagados: [] as string[],
    gravados: [] as [string, string, string][],
    falhas: [] as FalhaDoEvento[],
    esquecidos: [] as string[],
    /** Os eventos que existem no calendário, pelo id derivado da reunião: é o que prova "sem duplicar". */
    noCalendario: new Map<string, EventoDaReuniao>(),
  }
  let ida = 0
  const proxima = (): Resposta => respostas[Math.min(ida++, respostas.length - 1)] ?? 'ok'

  const calendario: PortaDeCalendario = {
    async lerOcupacao() {
      throw new Error('o evento não lê ocupação')
    },
    async conferirHorario() {
      throw new Error('o evento não confere horário')
    },
    async criarEvento(evento) {
      estado.criados.push(evento)
      const resposta = proxima()
      if (resposta === 'levanta') throw new Error('fetch failed: https://www.googleapis.com/... invalid_grant')
      if (resposta === 'expirada') return falhaDoCalendario('conexao_expirada')
      if (resposta === 'sem_resposta') return falhaDoCalendario('sem_resposta')
      const id = `sarah${evento.reuniaoId.replaceAll('-', '')}`
      estado.noCalendario.set(id, evento)
      return { ok: true, valor: { externalEventId: id } }
    },
    async apagarEvento(id) {
      estado.apagados.push(id)
      if (proxima() === 'sem_resposta') return falhaDoCalendario('sem_resposta')
      estado.noCalendario.delete(id)
      return { ok: true, valor: { apagado: true } }
    },
  }

  const porta: PortaDoEventoDaReuniao = {
    async gravarEvento(contaId, reuniaoId, externalEventId) {
      estado.gravados.push([contaId, reuniaoId, externalEventId])
    },
    async registrarFalhaDoEvento(_contaId, _reuniaoId, falha) {
      estado.falhas.push(falha)
    },
    async esquecerEvento(_contaId, reuniaoId) {
      estado.esquecidos.push(reuniaoId)
    },
  }

  return { estado, calendario, porta }
}

const ID_DO_EVENTO = `sarah${REUNIAO.replaceAll('-', '')}`

describe('evento criado', () => {
  test('cria o evento pela porta e grava o id devolvido na reunião', async () => {
    const { estado, calendario, porta } = montar()

    const desfecho = await criarEventoDaReuniao({ reuniao: reuniao(), calendario, porta, agora: () => AGORA })

    expect(desfecho).toEqual({ situacao: 'criado', externalEventId: ID_DO_EVENTO })
    expect(estado.criados).toHaveLength(1)
    expect(estado.gravados).toEqual([[CONTA, REUNIAO, ID_DO_EVENTO]])
    expect(estado.falhas).toEqual([])
  })

  test('o evento carrega horário, modalidade, sala, nome do lead, resumo de passagem e notas', () => {
    const evento = montarEventoDaReuniao(reuniao({ handoff_summary: { resumo: 'Tem fit: 40 caminhões, quer rota.' } }))

    expect(evento).toEqual({
      reuniaoId: REUNIAO,
      inicio: '2026-10-06T12:30:00Z',
      fim: '2026-10-06T13:00:00Z',
      titulo: 'Reunião com Marcos Lima',
      local: 'https://meet.exemplo.com/ana',
      descricao: [
        'Modalidade: Vídeo',
        'Sala: https://meet.exemplo.com/ana',
        '',
        'Resumo de passagem:',
        'Tem fit: 40 caminhões, quer rota.',
        '',
        'Notas da marcação:',
        'quer ver a integração',
        '',
        'Marcada pela assistente.',
      ].join('\n'),
    })
  })

  test('sem sala, sem resumo e sem notas, o evento leva só a modalidade', () => {
    const evento = montarEventoDaReuniao(
      reuniao({ modality: 'presencial', salaDoEspecialista: null, notes: '  ', nomeDoLead: null }),
    )

    expect(evento.titulo).toBe('Reunião com lead sem nome')
    expect(evento.local).toBeNull()
    expect(evento.descricao).toBe('Modalidade: Presencial\n\nMarcada pela assistente.')
  })

  test('nada de dado sensível: o evento não leva telefone, e-mail nem JSON cru do resumo', () => {
    const evento = montarEventoDaReuniao(
      reuniao({ handoff_summary: { telefone: '+5511999998888', email: 'marcos@fluxo.com.br' } }),
    )
    const tudo = JSON.stringify(evento)

    expect(tudo).not.toContain('+5511')
    expect(tudo).not.toContain('@fluxo')
    expect(evento.descricao).not.toContain('{')
  })

  test('o resumo de passagem aceita texto, { resumo } e { texto }, e ignora o resto', () => {
    expect(textoDoResumo('  direto  ')).toBe('direto')
    expect(textoDoResumo({ texto: 'pelo campo' })).toBe('pelo campo')
    expect(textoDoResumo({ outra: 'coisa' })).toBeNull()
    expect(textoDoResumo(null)).toBeNull()
  })

  test('especialista sem calendário conectado: nada a criar e nada registrado', async () => {
    const { estado, porta } = montar()

    const desfecho = await criarEventoDaReuniao({ reuniao: reuniao(), calendario: null, porta, agora: () => AGORA })

    expect(desfecho).toEqual({ situacao: 'sem_calendario' })
    expect(estado.gravados).toEqual([])
    expect(estado.falhas).toEqual([])
  })
})

describe('a linha do banco', () => {
  test('lê a reunião com o nome do lead e a sala dos embutidos, em objeto ou em lista', () => {
    const linha = {
      id: REUNIAO,
      account_id: CONTA,
      specialist_id: 'a0a0a0a0-1111-4111-8111-111111111111',
      starts_at: '2026-10-06T12:30:00+00:00',
      ends_at: '2026-10-06T13:00:00+00:00',
      modality: 'telefone',
      notes: null,
      handoff_summary: { resumo: 'r' },
      external_event_id: null,
      event_attempts: 2,
      leads: { name: 'Marcos Lima' },
      specialists: [{ room_url: 'https://meet.exemplo.com/ana' }],
    }

    expect(lerReuniaoParaEvento(linha)).toEqual({
      id: REUNIAO,
      account_id: CONTA,
      specialist_id: 'a0a0a0a0-1111-4111-8111-111111111111',
      starts_at: '2026-10-06T12:30:00+00:00',
      ends_at: '2026-10-06T13:00:00+00:00',
      modality: 'telefone',
      notes: null,
      handoff_summary: { resumo: 'r' },
      external_event_id: null,
      event_attempts: 2,
      nomeDoLead: 'Marcos Lima',
      salaDoEspecialista: 'https://meet.exemplo.com/ana',
    })
    expect(lerReuniaoParaEvento({ ...linha, leads: null, specialists: null })).toMatchObject({
      nomeDoLead: null,
      salaDoEspecialista: null,
    })
  })
})

describe('falha na criação mantém a reunião', () => {
  test('grava a frase traduzida, soma a tentativa e agenda a próxima pelo recuo', async () => {
    const { estado, calendario, porta } = montar(['expirada'])

    const desfecho = await criarEventoDaReuniao({ reuniao: reuniao(), calendario, porta, agora: () => AGORA })

    const falha = {
      tentativas: 1,
      erro: falhaDoCalendario('conexao_expirada').mensagem,
      proximaTentativa: new Date(AGORA + 60_000).toISOString(),
    }
    expect(desfecho).toEqual({ situacao: 'falhou', falha })
    expect(estado.falhas).toEqual([falha])
    expect(estado.gravados).toEqual([])
  })

  test('exceção do adaptador vira sem_resposta, e a mensagem dela não chega à linha', async () => {
    const { estado, calendario, porta } = montar(['levanta'])

    await criarEventoDaReuniao({ reuniao: reuniao(), calendario, porta, agora: () => AGORA })

    expect(estado.falhas[0]?.erro).toBe(falhaDoCalendario('sem_resposta').mensagem)
    expect(JSON.stringify(estado.falhas)).not.toMatch(/invalid_grant|googleapis/)
  })

  test('calendário que nem abriu (token ausente) conta como tentativa com a frase dele', async () => {
    const { estado, porta } = montar()

    await criarEventoDaReuniao({
      reuniao: reuniao({ event_attempts: 2 }),
      calendario: falhaDoCalendario('nao_conectado'),
      porta,
      agora: () => AGORA,
    })

    expect(estado.falhas).toEqual([
      {
        tentativas: 3,
        erro: falhaDoCalendario('nao_conectado').mensagem,
        proximaTentativa: new Date(AGORA + 15 * 60_000).toISOString(),
      },
    ])
  })

  test('recuo de 1, 5, 15 e 60 minutos; na quinta falha a próxima fica nula e a reunião desistiu', () => {
    const esperas = [1, 2, 3, 4].map((n) => {
      const proxima = falhaDepoisDe(n, 'x', AGORA).proximaTentativa
      return proxima === null ? null : (Date.parse(proxima) - AGORA) / 60_000
    })

    expect(esperas).toEqual([...RECUO_EM_MINUTOS])
    expect(TETO_DE_TENTATIVAS).toBe(5)
    expect(falhaDepoisDe(TETO_DE_TENTATIVAS, 'x', AGORA).proximaTentativa).toBeNull()
    expect(eventoDesistiu({ external_event_id: null, event_attempts: TETO_DE_TENTATIVAS })).toBe(true)
    expect(eventoDesistiu({ external_event_id: null, event_attempts: TETO_DE_TENTATIVAS - 1 })).toBe(false)
    expect(eventoDesistiu({ external_event_id: 'evt', event_attempts: TETO_DE_TENTATIVAS })).toBe(false)
  })

  test('a última tentativa registra a última falha e não agenda outra', async () => {
    const { estado, calendario, porta } = montar(['sem_resposta'])

    await criarEventoDaReuniao({
      reuniao: reuniao({ event_attempts: TETO_DE_TENTATIVAS - 1 }),
      calendario,
      porta,
      agora: () => AGORA,
    })

    expect(estado.falhas).toEqual([
      { tentativas: TETO_DE_TENTATIVAS, erro: falhaDoCalendario('sem_resposta').mensagem, proximaTentativa: null },
    ])
  })
})

describe('nova tentativa sem duplicar evento', () => {
  test('reunião que já tem evento não vai ao calendário', async () => {
    const { estado, calendario, porta } = montar()

    const desfecho = await criarEventoDaReuniao({
      reuniao: reuniao({ external_event_id: ID_DO_EVENTO, event_attempts: 2 }),
      calendario,
      porta,
      agora: () => AGORA,
    })

    expect(desfecho).toEqual({ situacao: 'ja_existia', externalEventId: ID_DO_EVENTO })
    expect(estado.criados).toEqual([])
    expect(estado.gravados).toEqual([])
    expect(estado.falhas).toEqual([])
  })

  test('falha, nova tentativa que cria e uma terceira que não cria de novo: um evento só no calendário', async () => {
    const { estado, calendario, porta } = montar(['sem_resposta', 'ok'])

    const primeira = await criarEventoDaReuniao({ reuniao: reuniao(), calendario, porta, agora: () => AGORA })
    expect(primeira.situacao).toBe('falhou')

    const segunda = await criarEventoDaReuniao({
      reuniao: reuniao({ event_attempts: 1 }),
      calendario,
      porta,
      agora: () => AGORA + 60_000,
    })
    expect(segunda).toEqual({ situacao: 'criado', externalEventId: ID_DO_EVENTO })

    // A linha relida depois da segunda já tem o id gravado.
    await criarEventoDaReuniao({
      reuniao: reuniao({ event_attempts: 1, external_event_id: ID_DO_EVENTO }),
      calendario,
      porta,
      agora: () => AGORA + 120_000,
    })

    expect(estado.criados).toHaveLength(2)
    expect(estado.noCalendario.size).toBe(1)
    expect(estado.gravados).toEqual([[CONTA, REUNIAO, ID_DO_EVENTO]])
  })
})

describe('cancelamento apaga o evento', () => {
  test('apaga pelo external_event_id e esquece o id na reunião', async () => {
    const { estado, calendario, porta } = montar()

    const desfecho = await apagarEventoDaReuniao({
      reuniao: reuniao({ external_event_id: ID_DO_EVENTO }),
      calendario,
      porta,
    })

    expect(desfecho).toEqual({ ok: true, situacao: 'apagado' })
    expect(estado.apagados).toEqual([ID_DO_EVENTO])
    expect(estado.esquecidos).toEqual([REUNIAO])
  })

  test('reunião sem evento: nada a apagar', async () => {
    const { estado, calendario, porta } = montar()

    const desfecho = await apagarEventoDaReuniao({ reuniao: reuniao(), calendario, porta })

    expect(desfecho).toEqual({ ok: true, situacao: 'sem_evento' })
    expect(estado.apagados).toEqual([])
    expect(estado.esquecidos).toEqual([])
  })

  test('calendário que falha devolve a falha e a reunião continua com o id', async () => {
    const { estado, calendario, porta } = montar(['sem_resposta'])

    const desfecho = await apagarEventoDaReuniao({
      reuniao: reuniao({ external_event_id: ID_DO_EVENTO }),
      calendario,
      porta,
    })

    expect(desfecho).toEqual(falhaDoCalendario('sem_resposta'))
    expect(estado.esquecidos).toEqual([])
  })

  test('especialista sem calendário: não conectado, sem apagar nada', async () => {
    const { estado, porta } = montar()

    const desfecho = await apagarEventoDaReuniao({
      reuniao: reuniao({ external_event_id: ID_DO_EVENTO }),
      calendario: null,
      porta,
    })

    expect(desfecho).toEqual(falhaDoCalendario('nao_conectado'))
    expect(estado.esquecidos).toEqual([])
  })
})
