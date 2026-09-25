// O calendário por endereço iCal, com fixtures no formato que cada provedor
// escreve e o `fetch` dublado. Nenhuma rede.

import { describe, expect, test } from 'vitest'

import { MENSAGENS_DO_CALENDARIO, janelaAbsoluta } from './calendario.ts'
import { criarCalendarioIcal, normalizarEnderecoIcal, ocupacaoDoIcal } from './calendario-ical.ts'
import type { Buscar } from './calendario-google.ts'

const SP = 'America/Sao_Paulo'
/** A janela da passagem: 30 dias a partir de 1º de outubro de 2026. */
const JANELA = janelaAbsoluta('2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z')

function calendario(...eventos: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Teste//PT', ...eventos, 'END:VCALENDAR'].join('\r\n')
}

function evento(...linhas: string[]): string {
  return ['BEGIN:VEVENT', ...linhas, 'END:VEVENT'].join('\r\n')
}

function blocos(texto: string, janela = JANELA, fuso = SP) {
  return ocupacaoDoIcal(texto, janela, fuso).map(({ externalId, inicio, fim }) => `${externalId} ${inicio} ${fim}`)
}

describe('o formato de cada provedor', () => {
  test('Google: UTC, TZID IANA e linha dobrada', () => {
    const texto = calendario(
      evento('UID:a1@google.com', 'DTSTART:20261005T130000Z', 'DTEND:20261005T140000Z', 'SUMMARY:Reunião com'),
      evento(
        'UID:a2@google.com',
        'DTSTART;TZID=America/Sao_Paulo:20261006T090000',
        'DTEND;TZID=America/Sao_Paulo:20261006T093000',
        // A descrição longa chega dobrada; a continuação não vira propriedade.
        'DESCRIPTION:uma linha muito longa que o Google dobra em setenta e cinco',
        '  caracteres e continua aqui',
      ),
    )
    expect(blocos(texto)).toEqual([
      'a1@google.com 2026-10-05T13:00:00Z 2026-10-05T14:00:00Z',
      'a2@google.com 2026-10-06T12:00:00Z 2026-10-06T12:30:00Z',
    ])
  })

  test('Outlook: TZID com o nome do Windows e entre aspas', () => {
    const texto = calendario(
      evento(
        'UID:o1',
        'DTSTART;TZID="E. South America Standard Time":20261007T140000',
        'DTEND;TZID="E. South America Standard Time":20261007T150000',
      ),
      evento('UID:o2', 'DTSTART;TZID=SA Western Standard Time:20261007T100000', 'DURATION:PT45M'),
    )
    expect(blocos(texto)).toEqual(['o1 2026-10-07T17:00:00Z 2026-10-07T18:00:00Z', 'o2 2026-10-07T14:00:00Z 2026-10-07T14:45:00Z'])
  })

  test('Apple: dia inteiro, horário flutuante e alarme dentro do evento', () => {
    const texto = calendario(
      evento('UID:f1', 'DTSTART;VALUE=DATE:20261012', 'DTEND;VALUE=DATE:20261013'),
      evento(
        'UID:f2',
        'DTSTART:20261013T080000',
        'DTEND:20261013T083000',
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'DTSTART:19700101T000000',
        'END:VALARM',
      ),
    )
    expect(blocos(texto)).toEqual(['f1 2026-10-12T03:00:00Z 2026-10-13T03:00:00Z', 'f2 2026-10-13T11:00:00Z 2026-10-13T11:30:00Z'])
  })

  test('cancelado, livre e fora da janela não ocupam; TZID desconhecido vale o fuso do especialista', () => {
    const texto = calendario(
      evento('UID:c', 'STATUS:CANCELLED', 'DTSTART:20261005T130000Z', 'DTEND:20261005T140000Z'),
      evento('UID:t', 'TRANSP:TRANSPARENT', 'DTSTART:20261005T130000Z', 'DTEND:20261005T140000Z'),
      evento('UID:antes', 'DTSTART:20260930T130000Z', 'DTEND:20260930T140000Z'),
      evento('UID:depois', 'DTSTART:20261101T130000Z', 'DTEND:20261101T140000Z'),
      evento('UID:torto', 'DTSTART:2026-10-05', 'DTEND:20261005T140000Z'),
      evento('UID:x', 'DTSTART;TZID=Fuso/Inventado:20261008T090000', 'DTEND;TZID=Fuso/Inventado:20261008T100000'),
    )
    expect(blocos(texto)).toEqual(['x 2026-10-08T12:00:00Z 2026-10-08T13:00:00Z'])
  })
})

describe('a recorrência', () => {
  test('semanal por dia da semana, com COUNT contando desde o início e EXDATE tirando uma', () => {
    const texto = calendario(
      evento(
        'UID:r1',
        'DTSTART;TZID=America/Sao_Paulo:20260928T090000',
        'DTEND;TZID=America/Sao_Paulo:20260928T100000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6',
        'EXDATE;TZID=America/Sao_Paulo:20261005T090000',
      ),
    )
    // 28/9 (seg) e 30/9 (qua) contam e ficam antes da janela. Seguem 5/10
    // (excluída, mas contada), 7/10, 12/10 e 14/10, a sexta e última.
    expect(blocos(texto)).toEqual([
      'r1:2026-10-07T12:00:00Z 2026-10-07T12:00:00Z 2026-10-07T13:00:00Z',
      'r1:2026-10-12T12:00:00Z 2026-10-12T12:00:00Z 2026-10-12T13:00:00Z',
      'r1:2026-10-14T12:00:00Z 2026-10-14T12:00:00Z 2026-10-14T13:00:00Z',
    ])
  })

  test('diária com intervalo e UNTIL em data inteira, que inclui o dia', () => {
    const texto = calendario(
      evento('UID:d', 'DTSTART:20261001T200000Z', 'DTEND:20261001T203000Z', 'RRULE:FREQ=DAILY;INTERVAL=3;UNTIL=20261010'),
    )
    expect(ocupacaoDoIcal(texto, JANELA, SP).map((item) => item.inicio)).toEqual([
      '2026-10-01T20:00:00Z',
      '2026-10-04T20:00:00Z',
      '2026-10-07T20:00:00Z',
      '2026-10-10T20:00:00Z',
    ])
  })

  test('mensal no dia do mês, na ordem do dia da semana e anual', () => {
    const janela = janelaAbsoluta('2026-10-01T00:00:00Z', '2027-02-01T00:00:00Z')
    const texto = calendario(
      evento('UID:m1', 'DTSTART:20260131T150000Z', 'DURATION:PT1H', 'RRULE:FREQ=MONTHLY'),
      evento('UID:m2', 'DTSTART:20260904T150000Z', 'DURATION:PT1H', 'RRULE:FREQ=MONTHLY;BYDAY=1FR'),
      evento('UID:m3', 'DTSTART:20250910T150000Z', 'DURATION:PT1H', 'RRULE:FREQ=MONTHLY;BYDAY=-1TU;COUNT=15'),
      evento('UID:y', 'DTSTART;VALUE=DATE:20201225', 'RRULE:FREQ=YEARLY'),
    )
    const inicios = (uid: string) =>
      ocupacaoDoIcal(texto, janela, SP)
        .filter((item) => item.externalId.startsWith(`${uid}:`))
        .map((item) => item.inicio.slice(0, 10))
    // O dia 31 só existe em outubro, dezembro e janeiro.
    expect(inicios('m1')).toEqual(['2026-10-31', '2026-12-31', '2027-01-31'])
    expect(inicios('m2')).toEqual(['2026-10-02', '2026-11-06', '2026-12-04', '2027-01-01'])
    // De setembro de 2025, 15 ocorrências terminam em novembro de 2026.
    expect(inicios('m3')).toEqual(['2026-10-27', '2026-11-24'])
    expect(inicios('y')).toEqual(['2026-12-25'])
  })

  test('RECURRENCE-ID troca uma ocorrência, e a trocada cancelada libera o horário', () => {
    const texto = calendario(
      evento('UID:s', 'DTSTART:20261005T120000Z', 'DTEND:20261005T130000Z', 'RRULE:FREQ=WEEKLY;COUNT=3'),
      evento('UID:s', 'RECURRENCE-ID:20261012T120000Z', 'DTSTART:20261013T180000Z', 'DTEND:20261013T190000Z'),
      evento('UID:s', 'RECURRENCE-ID:20261019T120000Z', 'STATUS:CANCELLED', 'DTSTART:20261019T120000Z', 'DTEND:20261019T130000Z'),
    )
    expect(blocos(texto)).toEqual([
      's:2026-10-05T12:00:00Z 2026-10-05T12:00:00Z 2026-10-05T13:00:00Z',
      // A trocada guarda a chave da original: é a mesma ocorrência, movida.
      's:2026-10-12T12:00:00Z 2026-10-13T18:00:00Z 2026-10-13T19:00:00Z',
    ])
  })

  test('a série anda no relógio de parede: 9h continua 9h depois do horário de verão', () => {
    const janela = janelaAbsoluta('2026-10-26T00:00:00Z', '2026-11-10T00:00:00Z')
    const texto = calendario(
      evento(
        'UID:ny',
        'DTSTART;TZID=America/New_York:20261026T090000',
        'DTEND;TZID=America/New_York:20261026T100000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO',
      ),
    )
    // Nova York sai do horário de verão em 1º de novembro de 2026.
    expect(ocupacaoDoIcal(texto, janela, SP).map((item) => item.inicio)).toEqual([
      '2026-10-26T13:00:00Z',
      '2026-11-02T14:00:00Z',
      '2026-11-09T14:00:00Z',
    ])
  })

  test('regra sem fim tem teto, e regra desconhecida ocupa só a primeira', () => {
    const longa = janelaAbsoluta('2026-10-01T00:00:00Z', '2046-10-01T00:00:00Z')
    const diaria = calendario(evento('UID:sem-fim', 'DTSTART:20261001T120000Z', 'DURATION:PT30M', 'RRULE:FREQ=DAILY'))
    expect(ocupacaoDoIcal(diaria, longa, SP).length).toBeLessThanOrEqual(5_000)

    const desconhecida = calendario(evento('UID:h', 'DTSTART:20261002T120000Z', 'DURATION:PT30M', 'RRULE:FREQ=HOURLY'))
    expect(blocos(desconhecida)).toEqual(['h 2026-10-02T12:00:00Z 2026-10-02T12:30:00Z'])
  })
})

describe('o endereço', () => {
  test('webcal vira https, e o que não é https com host é recusado', () => {
    expect(normalizarEnderecoIcal('  webcal://p01-caldav.icloud.com/published/2/abc  ')).toEqual({
      ok: true,
      endereco: 'https://p01-caldav.icloud.com/published/2/abc',
    })
    expect(normalizarEnderecoIcal('https://calendar.google.com/calendar/ical/x%40gmail.com/private-1/basic.ics')).toMatchObject({ ok: true })
    expect(normalizarEnderecoIcal('')).toEqual({ ok: false, motivo: 'vazio' })
    for (const errado of ['http://inseguro.example/cal.ics', 'calendar.google.com/basic.ics', 'https://a b.ics', 'https://usuario:senha@host/cal.ics', 'ftp://host/cal.ics']) {
      expect(normalizarEnderecoIcal(errado)).toMatchObject({ ok: false, motivo: 'formato' })
    }
  })
})

describe('a porta', () => {
  const ENDERECO = 'https://calendario.example/private-segredo-do-especialista/basic.ics'

  function porta(status: number, corpo: string) {
    const idas: { url: string; metodo: string }[] = []
    const buscar: Buscar = async (url, pedido) => {
      idas.push({ url, metodo: pedido.method })
      return { status, text: async () => corpo }
    }
    return { idas, calendario: criarCalendarioIcal({ buscar, endereco: ENDERECO, fuso: SP }) }
  }

  test('lê a ocupação por GET no endereço, e confere um horário pela mesma leitura', async () => {
    const texto = calendario(evento('UID:a', 'DTSTART:20261005T130000Z', 'DTEND:20261005T140000Z'))
    const { idas, calendario: porta200 } = porta(200, `\uFEFF${texto}`)
    expect(await porta200.lerOcupacao(JANELA)).toEqual({
      ok: true,
      valor: [{ externalId: 'a', inicio: '2026-10-05T13:00:00Z', fim: '2026-10-05T14:00:00Z' }],
    })
    expect(await porta200.conferirHorario('2026-10-05T13:30:00Z', '2026-10-05T14:30:00Z')).toEqual({ ok: true, valor: { livre: false } })
    expect(await porta200.conferirHorario('2026-10-05T14:00:00Z', '2026-10-05T15:00:00Z')).toEqual({ ok: true, valor: { livre: true } })
    expect(idas.every((ida) => ida.url === ENDERECO && ida.metodo === 'GET')).toBe(true)
  })

  test.each([
    [404, 'endereco_ical_recusado', 'erro'],
    [401, 'endereco_ical_recusado', 'erro'],
    [410, 'endereco_ical_recusado', 'erro'],
    [429, 'limite_de_taxa', 'indisponivel'],
    [503, 'provedor_indisponivel', 'indisponivel'],
    [302, 'falha_do_calendario', 'erro'],
  ] as const)('status %i vira %s, sem o endereço na falha', async (status, motivo, estado) => {
    const resultado = await porta(status, 'corpo do servidor').calendario.lerOcupacao(JANELA)
    expect(resultado).toEqual({ ok: false, motivo, estado, mensagem: MENSAGENS_DO_CALENDARIO[motivo] })
    expect(JSON.stringify(resultado)).not.toContain('segredo')
  })

  test('resposta que não é iCal é recusada com a frase de copiar de novo', async () => {
    const resultado = await porta(200, '<html>entre na sua conta</html>').calendario.lerOcupacao(JANELA)
    expect(resultado).toMatchObject({ ok: false, motivo: 'ical_invalido', estado: 'erro' })
  })

  test('o calendário por endereço não escreve evento', async () => {
    const { idas, calendario: soLeitura } = porta(200, calendario())
    const criado = await soLeitura.criarEvento({
      reuniaoId: '11111111-1111-4111-8111-111111111111',
      inicio: '2026-10-05T13:00:00Z',
      fim: '2026-10-05T14:00:00Z',
      titulo: 'Reunião',
      descricao: '',
      local: null,
    })
    expect(criado).toMatchObject({ ok: false, motivo: 'calendario_so_de_leitura' })
    expect(await soLeitura.apagarEvento('evento')).toMatchObject({ ok: false, motivo: 'calendario_so_de_leitura' })
    expect(idas).toEqual([])
  })

  test('nenhuma frase nova diz o nome do produto nem usa travessão', () => {
    for (const motivo of ['endereco_ical_recusado', 'ical_invalido', 'calendario_so_de_leitura'] as const) {
      expect(MENSAGENS_DO_CALENDARIO[motivo]).not.toMatch(/Sarah|—/)
    }
  })
})
