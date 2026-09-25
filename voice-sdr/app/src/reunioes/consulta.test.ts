// As decisões puras de /reunioes: a semana no fuso da conta, o recorte de
// cada período, as recusas de filtro escrito à mão, o recorte em memória do
// dublê (com o ensaio de fora) e a distribuição da agenda pelos dias.
//
// Os instantes caem perto da meia-noite de propósito: é onde a semana e o dia
// lidos em UTC divergem dos lidos no fuso da conta.

import { describe, expect, it } from 'vitest'

import {
  aplicarRecorte,
  especialistasDaAgenda,
  ORIGENS_DA_LISTA,
  recorteDaBusca,
  reunioesPorDia,
  semanaDaAgenda,
} from '@/reunioes/consulta'
import type { RecorteDeReunioes } from '@/reunioes/tipos'
import { ANA, BRUNO, reuniaoDaLista } from '@/testes/servico-de-reunioes-dublado'

const SP = 'America/Sao_Paulo'
const MANAUS = 'America/Manaus'
/** Quinta-feira, 1º de outubro de 2026, meio-dia em São Paulo. */
const QUINTA = Date.parse('2026-10-01T15:00:00Z')

describe('semanaDaAgenda', () => {
  it('vai de segunda a segunda, à meia-noite do fuso da conta', () => {
    const semana = semanaDaAgenda(SP, QUINTA, 0)
    expect(semana.desde).toBe('2026-09-28T03:00:00.000Z')
    expect(semana.ate).toBe('2026-10-05T03:00:00.000Z')
    expect(semana.dias).toHaveLength(7)
  })

  it('o fuso é o da conta: em Manaus a semana começa uma hora depois', () => {
    expect(semanaDaAgenda(MANAUS, QUINTA, 0).desde).toBe('2026-09-28T04:00:00.000Z')
  })

  it('domingo às 23h30 em São Paulo ainda é a semana da segunda anterior, embora já seja segunda em UTC', () => {
    const domingoANoite = Date.parse('2026-10-05T02:30:00Z')
    expect(semanaDaAgenda(SP, domingoANoite, 0).desde).toBe('2026-09-28T03:00:00.000Z')
  })

  it('o domingo em si fica na semana que termina nele', () => {
    const domingo = Date.parse('2026-10-04T15:00:00Z')
    expect(semanaDaAgenda(SP, domingo, 0).desde).toBe('2026-09-28T03:00:00.000Z')
  })

  it('desloca de semana em semana', () => {
    expect(semanaDaAgenda(SP, QUINTA, 1).desde).toBe('2026-10-05T03:00:00.000Z')
    expect(semanaDaAgenda(SP, QUINTA, -1).desde).toBe('2026-09-21T03:00:00.000Z')
  })
})

describe('recorteDaBusca', () => {
  const agora = () => QUINTA

  it('sem nada escolhido abre a agenda da semana corrente, sem o ensaio', () => {
    const leitura = recorteDaBusca({}, SP, agora)
    expect(leitura).toMatchObject({
      ok: true,
      visao: 'agenda',
      recorte: {
        desde: '2026-09-28T03:00:00.000Z',
        ate: '2026-10-05T03:00:00.000Z',
        crescente: true,
        origens: ['ligacao', 'manual'],
      },
    })
  })

  it('na agenda o período nomeado não vale: vale a semana', () => {
    const leitura = recorteDaBusca({ periodo: 'ultimos-30d', semana: '1' }, SP, agora)
    expect(leitura.ok && leitura.recorte.desde).toBe('2026-10-05T03:00:00.000Z')
  })

  it.each([
    ['proximas', '2026-10-01T03:00:00.000Z', undefined, true],
    ['hoje', '2026-10-01T03:00:00.000Z', '2026-10-02T03:00:00.000Z', true],
    ['proximos-7d', '2026-10-01T03:00:00.000Z', '2026-10-08T03:00:00.000Z', true],
    ['ultimos-7d', '2026-09-24T03:00:00.000Z', '2026-10-01T03:00:00.000Z', false],
    ['ultimos-30d', '2026-09-01T03:00:00.000Z', '2026-10-01T03:00:00.000Z', false],
    ['tudo', undefined, undefined, false],
  ])('na lista, %s vai de %s a %s', (periodo, desde, ate, crescente) => {
    const leitura = recorteDaBusca({ vista: 'lista', periodo }, SP, agora)
    if (!leitura.ok) throw new Error('recusou')
    expect(leitura.recorte.desde).toBe(desde)
    expect(leitura.recorte.ate).toBe(ate)
    expect(leitura.recorte.crescente).toBe(crescente)
    expect(leitura.semana).toBeNull()
  })

  it('a lista sem período abre nas próximas', () => {
    const leitura = recorteDaBusca({ vista: 'lista' }, SP, agora)
    expect(leitura.ok && leitura.recorte.desde).toBe('2026-10-01T03:00:00.000Z')
  })

  it('especialista, estado e modalidade viajam no recorte', () => {
    const leitura = recorteDaBusca(
      { especialista: ANA.id, estado: 'confirmed', modalidade: 'presencial' },
      SP,
      agora,
    )
    expect(leitura).toMatchObject({
      ok: true,
      recorte: { especialistaId: ANA.id, estado: 'confirmed', modalidade: 'presencial' },
    })
  })

  it.each([
    ['vista', { vista: 'calendario' }],
    ['periodo', { periodo: 'ontem' }],
    ['semana', { semana: 'proxima' }],
    ['especialista', { especialista: 'ana' }],
    ['estado', { estado: 'perdida' }],
    ['modalidade', { modalidade: 'zoom' }],
  ] as const)('%s escrito à mão que a tela não reconhece é recusa', (campo, busca) => {
    expect(recorteDaBusca(busca, SP, agora)).toEqual({ ok: false, campo })
  })
})

describe('aplicarRecorte', () => {
  const tudo: RecorteDeReunioes = { crescente: true, origens: ORIGENS_DA_LISTA }

  it('a reunião de ensaio nunca entra, com ou sem outro filtro', () => {
    const lista = [
      reuniaoDaLista({ id: 'r-real' }),
      reuniaoDaLista({ id: 'r-ensaio', origem: 'ensaio' }),
      reuniaoDaLista({ id: 'r-manual', origem: 'manual', chamadaDaMarcacao: null }),
    ]
    expect(aplicarRecorte(lista, tudo).reunioes.map((r) => r.id)).toEqual(['r-manual', 'r-real'])
  })

  it('o intervalo inclui o início e exclui o fim', () => {
    const lista = [
      reuniaoDaLista({ id: 'r-no-inicio', inicio: '2026-09-28T03:00:00.000Z' }),
      reuniaoDaLista({ id: 'r-no-fim', inicio: '2026-10-05T03:00:00.000Z' }),
    ]
    const recorte = { ...tudo, desde: '2026-09-28T03:00:00.000Z', ate: '2026-10-05T03:00:00.000Z' }
    expect(aplicarRecorte(lista, recorte).reunioes.map((r) => r.id)).toEqual(['r-no-inicio'])
  })

  it('ordena pelo horário, no sentido do recorte', () => {
    const lista = [
      reuniaoDaLista({ id: 'r-depois', inicio: '2026-10-02T12:00:00Z' }),
      reuniaoDaLista({ id: 'r-antes', inicio: '2026-10-01T12:00:00Z' }),
    ]
    expect(aplicarRecorte(lista, tudo).reunioes.map((r) => r.id)).toEqual(['r-antes', 'r-depois'])
    expect(aplicarRecorte(lista, { ...tudo, crescente: false }).reunioes.map((r) => r.id)).toEqual([
      'r-depois',
      'r-antes',
    ])
  })

  it('corta no teto e diz que cortou', () => {
    const lista = [1, 2, 3].map((n) => reuniaoDaLista({ id: `r-${n}`, inicio: `2026-10-0${n}T12:00:00Z` }))
    expect(aplicarRecorte(lista, tudo, 2)).toMatchObject({ truncada: true })
    expect(aplicarRecorte(lista, tudo, 3)).toMatchObject({ truncada: false })
    expect(aplicarRecorte(lista, tudo, 2).reunioes).toHaveLength(2)
  })
})

describe('a agenda', () => {
  const semana = semanaDaAgenda(SP, QUINTA, 0)

  it('distribui pelo dia do fuso da conta: domingo 23h30 em São Paulo é domingo, não segunda', () => {
    const lista = [
      reuniaoDaLista({ id: 'r-segunda', inicio: '2026-09-28T12:00:00Z' }),
      reuniaoDaLista({ id: 'r-domingo-a-noite', inicio: '2026-10-05T02:30:00Z' }),
    ]
    const dias = reunioesPorDia(lista, ANA.id, semana, SP)
    expect(dias[0]?.map((r) => r.id)).toEqual(['r-segunda'])
    expect(dias[6]?.map((r) => r.id)).toEqual(['r-domingo-a-noite'])
  })

  it('cada linha só tem as reuniões do próprio especialista', () => {
    const lista = [reuniaoDaLista({ especialista: { id: BRUNO.id, nome: BRUNO.nome, fuso: BRUNO.fuso } })]
    expect(reunioesPorDia(lista, ANA.id, semana, SP).flat()).toEqual([])
  })

  it('o desligado só aparece com reunião na semana; o filtro deixa um só', () => {
    const desligada = { id: 'cccccccc-0000-4000-8000-000000000003', nome: 'Clara', fuso: SP, ativo: false }
    const todos = [BRUNO, ANA, desligada]
    expect(especialistasDaAgenda(todos, [], undefined).map((e) => e.nome)).toEqual([
      'Ana Ribeiro',
      'Bruno Tavares',
    ])
    const comReuniao = [reuniaoDaLista({ especialista: { id: desligada.id, nome: 'Clara', fuso: SP } })]
    expect(especialistasDaAgenda(todos, comReuniao, undefined).map((e) => e.nome)).toContain('Clara')
    expect(especialistasDaAgenda(todos, [], BRUNO.id).map((e) => e.nome)).toEqual(['Bruno Tavares'])
  })
})
