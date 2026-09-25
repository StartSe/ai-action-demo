// Roteamento do especialista, à exaustão. Nenhum banco, nenhuma rede e nenhum
// relógio: `agora` é sempre um instante escrito no caso.
//
// As datas são fixas de propósito. 2026-10-05 é uma segunda-feira, 2026-10-06
// uma terça e 2026-10-07 uma quarta.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  escolherEspecialista,
  type EntradaDeRoteamento,
  type EspecialistaCandidato,
  type ModoDeRoteamento,
  type ResultadoDeRoteamento,
} from './roteamento.ts'

const SAO_PAULO = 'America/Sao_Paulo'
const LISBOA = 'Europe/Lisbon'

const DOMINGO = 0
const SEGUNDA = 1
const TERCA = 2
const QUARTA = 3

/** Segunda-feira, 08h00 em São Paulo. */
const AGORA = '2026-10-05T11:00:00Z'

/** Atende todo dia da semana: quem não é sobre disponibilidade não tropeça nela. */
const TODA_SEMANA = [0, 1, 2, 3, 4, 5, 6].map((diaDaSemana) => ({
  diaDaSemana,
  inicio: '09:00',
  fim: '18:00',
}))

function candidato(ajustes: Partial<EspecialistaCandidato> = {}): EspecialistaCandidato {
  return {
    id: 'aaaa',
    area: 'vendas',
    ativo: true,
    fuso: SAO_PAULO,
    antecedenciaMaximaDias: 30,
    disponibilidade: TODA_SEMANA,
    ultimaAtribuicaoEm: null,
    ...ajustes,
  }
}

function entrada(ajustes: Partial<EntradaDeRoteamento> = {}): EntradaDeRoteamento {
  return {
    modo: 'round_robin',
    candidatos: [candidato()],
    agora: AGORA,
    ...ajustes,
  }
}

function idsDe(resultado: ResultadoDeRoteamento): string[] {
  if (!resultado.roteou) throw new Error(`esperava roteamento, veio ${resultado.motivo}`)
  return resultado.escolhidos.map((escolhido) => escolhido.id)
}

function motivoDe(resultado: ResultadoDeRoteamento): string {
  if (resultado.roteou) throw new Error(`esperava recusa, veio ${idsDe(resultado).join(', ')}`)
  return resultado.motivo
}

/** Os três modos, para a regra que vale nos três ser cobrada nos três. */
const MODOS: readonly ModoDeRoteamento[] = ['area', 'round_robin', 'fixed']

/** Os argumentos que cada modo exige, para o mesmo caso rodar nos três. */
function ajustesDoModo(modo: ModoDeRoteamento, idFixo: string): Partial<EntradaDeRoteamento> {
  if (modo === 'fixed') return { modo, especialistaFixo: idFixo }
  if (modo === 'area') return { modo, areaPedida: 'vendas' }
  return { modo }
}

describe('escolherEspecialista', () => {
  describe('determinismo e fronteira', () => {
    it('a mesma entrada devolve a mesma saída', () => {
      const dado = entrada({
        candidatos: [
          candidato({ id: 'c', ultimaAtribuicaoEm: '2026-10-01T00:00:00Z' }),
          candidato({ id: 'a', ultimaAtribuicaoEm: '2026-10-01T00:00:00Z' }),
          candidato({ id: 'b', ultimaAtribuicaoEm: null }),
          candidato({ id: 'd', ativo: false }),
        ],
      })

      expect(escolherEspecialista(dado)).toEqual(escolherEspecialista(dado))
    })

    it('o módulo não lê relógio nem sorteia', () => {
      const fonte = readFileSync(new URL('./roteamento.ts', import.meta.url), 'utf8')

      expect(fonte).not.toMatch(/Date\.now/)
      expect(fonte).not.toMatch(/Math\.random/)
      expect(fonte).not.toMatch(/new Date/)
    })

    it('não escreve a marca do rodízio: quem grava last_assigned_at é agendar_reuniao', () => {
      // A fronteira é declarada aqui para que ninguém a resolva com um efeito
      // colateral: congelada, a entrada derruba qualquer tentativa de avançar a
      // marca durante a decisão.
      const candidatos: EspecialistaCandidato[] = [
        candidato({ id: 'a', ultimaAtribuicaoEm: '2026-10-01T00:00:00Z' }),
        candidato({ id: 'b', ultimaAtribuicaoEm: null }),
      ].map((c) => Object.freeze(c))
      const antes = structuredClone(candidatos)

      const resultado = escolherEspecialista(entrada({ candidatos }))

      expect(idsDe(resultado)).toEqual(['b', 'a'])
      expect(candidatos).toEqual(antes)
      expect(candidatos.map((c) => c.ultimaAtribuicaoEm)).toEqual(['2026-10-01T00:00:00Z', null])
    })

    it('devolve os próprios objetos que entraram, sem cópia', () => {
      const unico = candidato({ id: 'a' })

      const resultado = escolherEspecialista(entrada({ candidatos: [unico] }))

      if (!resultado.roteou) throw new Error('esperava roteamento')
      expect(resultado.escolhidos[0]).toBe(unico)
    })
  })

  describe('rodízio', () => {
    it('ordena por last_assigned_at, mais antigo primeiro', () => {
      const resultado = escolherEspecialista(
        entrada({
          candidatos: [
            candidato({ id: 'recente', ultimaAtribuicaoEm: '2026-10-05T10:00:00Z' }),
            candidato({ id: 'antigo', ultimaAtribuicaoEm: '2026-09-01T10:00:00Z' }),
            candidato({ id: 'meio', ultimaAtribuicaoEm: '2026-10-01T10:00:00Z' }),
          ],
        }),
      )

      expect(idsDe(resultado)).toEqual(['antigo', 'meio', 'recente'])
    })

    it('põe quem nunca recebeu antes de todos', () => {
      const resultado = escolherEspecialista(
        entrada({
          candidatos: [
            candidato({ id: 'antigo', ultimaAtribuicaoEm: '2020-01-01T00:00:00Z' }),
            candidato({ id: 'novo', ultimaAtribuicaoEm: null }),
          ],
        }),
      )

      expect(idsDe(resultado)).toEqual(['novo', 'antigo'])
    })

    it('desempata pelo id, em ordem estável, e não pela ordem de chegada', () => {
      const mesmaMarca = '2026-10-01T10:00:00Z'
      const chegada = ['ze', 'ana', 'bia']

      const resultado = escolherEspecialista(
        entrada({
          candidatos: chegada.map((id) => candidato({ id, ultimaAtribuicaoEm: mesmaMarca })),
        }),
      )

      expect(idsDe(resultado)).toEqual(['ana', 'bia', 'ze'])
    })

    it('desempata nulos pelo id também', () => {
      const resultado = escolherEspecialista(
        entrada({
          candidatos: [
            candidato({ id: 'ze', ultimaAtribuicaoEm: null }),
            candidato({ id: 'ana', ultimaAtribuicaoEm: null }),
          ],
        }),
      )

      expect(idsDe(resultado)).toEqual(['ana', 'ze'])
    })

    it('três chamadas seguidas escolhem na ordem prevista, com a marca avançando fora daqui', () => {
      // A marca avança entre as chamadas porque quem agenda a escreve. O módulo
      // só a lê — é o que torna o rodízio previsível o bastante para ser
      // auditado: dado o estado, a próxima escolha é uma só.
      const marcas = new Map<string, string | null>([
        ['ana', '2026-10-03T09:00:00Z'],
        ['bia', null],
        ['ze', '2026-10-01T09:00:00Z'],
      ])
      const agendamentos = ['2026-10-05T12:00:00Z', '2026-10-05T13:00:00Z', '2026-10-05T14:00:00Z']

      const escolhidos = agendamentos.map((instante) => {
        const resultado = escolherEspecialista(
          entrada({
            candidatos: [...marcas].map(([id, ultimaAtribuicaoEm]) =>
              candidato({ id, ultimaAtribuicaoEm }),
            ),
          }),
        )
        const primeiro = idsDe(resultado)[0]
        if (!primeiro) throw new Error('o rodízio não escolheu ninguém')
        marcas.set(primeiro, instante)
        return primeiro
      })

      // Nulo primeiro, depois o mais antigo, depois o seguinte: cada um recebe
      // uma vez antes de qualquer um receber duas.
      expect(escolhidos).toEqual(['bia', 'ze', 'ana'])
      // A ordem do mapa é ana, bia, ze; cada um saiu com o instante da rodada
      // em que foi escolhido, e nenhum ficou com a marca antiga.
      expect([...marcas.values()]).toEqual([agendamentos[2], agendamentos[0], agendamentos[1]])
    })

    it('recusa marca que não é instante ISO-8601', () => {
      expect(() =>
        escolherEspecialista(
          entrada({ candidatos: [candidato({ ultimaAtribuicaoEm: 'ontem de manhã' })] }),
        ),
      ).toThrow(/ultimaAtribuicaoEm/)
    })
  })

  describe('modo area', () => {
    it('devolve todos os aptos da área pedida', () => {
      const resultado = escolherEspecialista(
        entrada({
          modo: 'area',
          areaPedida: 'seguros',
          candidatos: [
            candidato({ id: 'b', area: 'seguros' }),
            candidato({ id: 'a', area: 'seguros' }),
            candidato({ id: 'c', area: 'vendas' }),
          ],
        }),
      )

      expect(idsDe(resultado)).toEqual(['a', 'b'])
    })

    it('compara a área sem caixa e sem borda, como o unique de specialists compara nome', () => {
      const resultado = escolherEspecialista(
        entrada({
          modo: 'area',
          areaPedida: '  Seguros ',
          candidatos: [candidato({ id: 'a', area: 'SEGUROS' })],
        }),
      )

      expect(idsDe(resultado)).toEqual(['a'])
    })

    it('recusa quando ninguém atende a área pedida', () => {
      const resultado = escolherEspecialista(
        entrada({ modo: 'area', areaPedida: 'seguros', candidatos: [candidato({ area: 'vendas' })] }),
      )

      expect(motivoDe(resultado)).toBe('sem_especialista_na_area')
    })

    it('lead sem área não casa com área nenhuma, em vez de cair no rodízio', () => {
      const resultado = escolherEspecialista(
        entrada({
          modo: 'area',
          areaPedida: null,
          candidatos: [candidato({ id: 'a', area: 'vendas' }), candidato({ id: 'b', area: null })],
        }),
      )

      expect(motivoDe(resultado)).toBe('sem_especialista_na_area')
    })

    it('especialista sem área não entra pela área do lead', () => {
      const resultado = escolherEspecialista(
        entrada({ modo: 'area', areaPedida: 'vendas', candidatos: [candidato({ area: null })] }),
      )

      expect(motivoDe(resultado)).toBe('sem_especialista_na_area')
    })
  })

  describe('modo fixed', () => {
    it('devolve só o especialista configurado', () => {
      const resultado = escolherEspecialista(
        entrada({
          modo: 'fixed',
          especialistaFixo: 'b',
          candidatos: [
            candidato({ id: 'a', ultimaAtribuicaoEm: null }),
            candidato({ id: 'b', ultimaAtribuicaoEm: '2026-10-04T09:00:00Z' }),
          ],
        }),
      )

      expect(idsDe(resultado)).toEqual(['b'])
    })

    it('recusa quando o configurado está desligado, sem cair de volta no rodízio', () => {
      const resultado = escolherEspecialista(
        entrada({
          modo: 'fixed',
          especialistaFixo: 'b',
          candidatos: [candidato({ id: 'a' }), candidato({ id: 'b', ativo: false })],
        }),
      )

      expect(motivoDe(resultado)).toBe('especialista_fixo_inativo')
      expect(resultado.descartados).toEqual([{ id: 'b', motivo: 'inativo' }])
    })

    it('recusa quando o configurado nem está entre os candidatos', () => {
      const resultado = escolherEspecialista(
        entrada({ modo: 'fixed', especialistaFixo: 'sumiu', candidatos: [candidato({ id: 'a' })] }),
      )

      expect(motivoDe(resultado)).toBe('especialista_fixo_inativo')
    })

    it('recusa a configuração que o banco também recusa: fixed sem destino', () => {
      expect(() => escolherEspecialista(entrada({ modo: 'fixed' }))).toThrow(/destino do modo/)
    })

    it('recusa destino em modo que não o honra', () => {
      expect(() =>
        escolherEspecialista(entrada({ modo: 'round_robin', especialistaFixo: 'a' })),
      ).toThrow(/destino que ninguém honra/)
      expect(() =>
        escolherEspecialista(entrada({ modo: 'area', areaPedida: 'vendas', especialistaFixo: 'a' })),
      ).toThrow(/destino que ninguém honra/)
    })
  })

  describe('exclusão antes do modo', () => {
    it.each([...MODOS])('o inativo sai dos candidatos no modo %s', (modo) => {
      const resultado = escolherEspecialista(
        entrada({
          ...ajustesDoModo(modo, 'a'),
          candidatos: [candidato({ id: 'a' }), candidato({ id: 'b', ativo: false })],
        }),
      )

      expect(idsDe(resultado)).toEqual(['a'])
      expect(resultado.descartados).toEqual([{ id: 'b', motivo: 'inativo' }])
    })

    it.each([...MODOS])('quem não tem faixa no período sai dos candidatos no modo %s', (modo) => {
      const resultado = escolherEspecialista(
        entrada({
          ...ajustesDoModo(modo, 'a'),
          candidatos: [
            candidato({ id: 'a' }),
            candidato({ id: 'b', disponibilidade: [] }),
          ],
        }),
      )

      expect(idsDe(resultado)).toEqual(['a'])
      expect(resultado.descartados).toEqual([{ id: 'b', motivo: 'sem_disponibilidade' }])
    })

    it.each([...MODOS])('sem nenhum apto, o motivo é sem_disponibilidade no modo %s', (modo) => {
      const resultado = escolherEspecialista(
        entrada({
          ...ajustesDoModo(modo, 'a'),
          candidatos: [candidato({ id: 'a', disponibilidade: [] })],
        }),
      )

      expect(motivoDe(resultado)).toBe('sem_disponibilidade')
    })

    it.each([...MODOS])('lista de candidatos vazia é sem_disponibilidade no modo %s', (modo) => {
      const resultado = escolherEspecialista(entrada({ ...ajustesDoModo(modo, 'a'), candidatos: [] }))

      expect(motivoDe(resultado)).toBe('sem_disponibilidade')
      expect(resultado.descartados).toEqual([])
    })

    it('inativo ganha de sem_disponibilidade: a ação é religar a pessoa', () => {
      const resultado = escolherEspecialista(
        entrada({ candidatos: [candidato({ id: 'a', ativo: false, disponibilidade: [] })] }),
      )

      expect(resultado.descartados).toEqual([{ id: 'a', motivo: 'inativo' }])
    })
  })

  describe('o período do especialista', () => {
    it('quem só atende num dia fora do horizonte dele sai dos candidatos', () => {
      // Segunda-feira, horizonte de dois dias: segunda, terça e quarta. Quem só
      // atende domingo não é candidato hoje.
      const resultado = escolherEspecialista(
        entrada({
          candidatos: [
            candidato({
              id: 'domingueiro',
              antecedenciaMaximaDias: 2,
              disponibilidade: [{ diaDaSemana: DOMINGO, inicio: '09:00', fim: '12:00' }],
            }),
            candidato({
              id: 'quartista',
              antecedenciaMaximaDias: 2,
              disponibilidade: [{ diaDaSemana: QUARTA, inicio: '09:00', fim: '12:00' }],
            }),
          ],
        }),
      )

      expect(idsDe(resultado)).toEqual(['quartista'])
      expect(resultado.descartados).toEqual([{ id: 'domingueiro', motivo: 'sem_disponibilidade' }])
    })

    it('com horizonte de uma semana o dia da faixa deixa de excluir ninguém', () => {
      const resultado = escolherEspecialista(
        entrada({
          candidatos: [
            candidato({
              id: 'domingueiro',
              antecedenciaMaximaDias: 7,
              disponibilidade: [{ diaDaSemana: DOMINGO, inicio: '09:00', fim: '12:00' }],
            }),
          ],
        }),
      )

      expect(idsDe(resultado)).toEqual(['domingueiro'])
    })

    it('o horizonte é o de cada um, não o da conta', () => {
      const soNaTerca = [{ diaDaSemana: TERCA, inicio: '09:00', fim: '12:00' }]

      const resultado = escolherEspecialista(
        entrada({
          candidatos: [
            candidato({ id: 'hoje', antecedenciaMaximaDias: 0, disponibilidade: soNaTerca }),
            candidato({ id: 'amanha', antecedenciaMaximaDias: 1, disponibilidade: soNaTerca }),
          ],
        }),
      )

      expect(idsDe(resultado)).toEqual(['amanha'])
    })

    it('o dia da semana é o do fuso do especialista, não o de UTC', () => {
      // 2026-10-06T02:00:00Z é 23h de segunda em São Paulo e 03h de terça em
      // Lisboa. Com horizonte de zero dias, quem só atende na segunda ainda é
      // candidato aqui e já não é lá.
      const soNaSegunda = [{ diaDaSemana: SEGUNDA, inicio: '09:00', fim: '12:00' }]
      const comFuso = (fuso: string): ResultadoDeRoteamento =>
        escolherEspecialista(
          entrada({
            agora: '2026-10-06T02:00:00Z',
            candidatos: [
              candidato({ id: 'a', fuso, antecedenciaMaximaDias: 0, disponibilidade: soNaSegunda }),
            ],
          }),
        )

      expect(idsDe(comFuso(SAO_PAULO))).toEqual(['a'])
      expect(motivoDe(comFuso(LISBOA))).toBe('sem_disponibilidade')
    })

    it('recusa dia da semana fora de 0..6', () => {
      expect(() =>
        escolherEspecialista(
          entrada({
            candidatos: [
              candidato({ disponibilidade: [{ diaDaSemana: 7, inicio: '09:00', fim: '12:00' }] }),
            ],
          }),
        ),
      ).toThrow(/dia da semana/)
    })

    it('recusa fuso que não existe', () => {
      expect(() =>
        escolherEspecialista(entrada({ candidatos: [candidato({ fuso: 'America/Nenhures' })] })),
      ).toThrow()
    })

    it('recusa agora que não é instante ISO-8601', () => {
      expect(() => escolherEspecialista(entrada({ agora: 'ontem de manhã' }))).toThrow(/agora/)
    })
  })

  it('recusa modo desconhecido', () => {
    expect(() =>
      escolherEspecialista(entrada({ modo: 'sorteio' as ModoDeRoteamento })),
    ).toThrow(/modo de roteamento desconhecido/)
  })
})
