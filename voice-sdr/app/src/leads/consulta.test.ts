import { describe, expect, it } from 'vitest'

import {
  bloqueadoDaBusca,
  bloqueioDaBusca,
  bloqueioEscolhido,
  chaveDaBusca,
  estadoDaLista,
  inicioDaAtividade,
  ordenacaoDaBusca,
  padraoDeBusca,
  paraPeriodoDeAtividade,
  recorteDaBusca,
  temRecorte,
  termoDaConsulta,
  textoDaBusca,
} from '@/leads/consulta'

/** 2026-09-21T12:00:00Z, para a conta do recuo ficar legível. */
const AGORA = () => Date.parse('2026-09-21T12:00:00.000Z')

describe('texto da busca', () => {
  it('descarta o que não é texto e o que é só espaço', () => {
    expect(textoDaBusca('quente')).toBe('quente')
    expect(textoDaBusca('  ')).toBeUndefined()
    expect(textoDaBusca(['a'])).toBeUndefined()
    expect(textoDaBusca(undefined)).toBeUndefined()
  })
})

describe('início da atividade', () => {
  it('não recorta nada quando o período é tudo', () => {
    expect(inicioDaAtividade('tudo', AGORA)).toBeUndefined()
  })

  it('recua o relógio pela janela escolhida', () => {
    expect(inicioDaAtividade('24h', AGORA)).toBe('2026-09-20T12:00:00.000Z')
    expect(inicioDaAtividade('7d', AGORA)).toBe('2026-09-14T12:00:00.000Z')
    expect(inicioDaAtividade('30d', AGORA)).toBe('2026-08-22T12:00:00.000Z')
  })

  it('período desconhecido é nulo, e ausente é tudo', () => {
    expect(paraPeriodoDeAtividade(undefined)).toBe('tudo')
    expect(paraPeriodoDeAtividade('7d')).toBe('7d')
    expect(paraPeriodoDeAtividade('ontem')).toBeNull()
  })
})

describe('termo da consulta', () => {
  it('normaliza o que parece telefone, em qualquer escrita', () => {
    expect(termoDaConsulta('(48) 99999-8888')).toBe('+5548999998888')
    expect(termoDaConsulta('48 99999 8888')).toBe('+5548999998888')
    expect(termoDaConsulta('+55 48 99999-8888')).toBe('+5548999998888')
  })

  it('deixa o texto em paz quando não é número', () => {
    expect(termoDaConsulta(' Marina Castro ')).toBe('Marina Castro')
    expect(termoDaConsulta('marina@aurora.com.br')).toBe('marina@aurora.com.br')
  })

  it('mantém o pedaço de número que o módulo recusa', () => {
    // `48 9999` é busca parcial legítima; o `ilike` acha o começo do número.
    expect(termoDaConsulta('48 9999')).toBe('48 9999')
  })
})

describe('recorte da busca', () => {
  it('monta o recorte inteiro, com o instante da atividade', () => {
    const leitura = recorteDaBusca(
      {
        termo: '(48) 99999-8888',
        etapa: 'qualified',
        temperatura: 'quente',
        origem: 'import',
        atividade: '7d',
        bloqueado: 'false',
        ordenacao: 'nome',
      },
      AGORA,
    )

    expect(leitura).toEqual({
      ok: true,
      recorte: {
        termo: '+5548999998888',
        etapa: 'qualified',
        temperatura: 'quente',
        origem: 'import',
        atividadeDesde: '2026-09-14T12:00:00.000Z',
        bloqueado: false,
        ordenacao: 'nome',
      },
    })
  })

  it('a busca vazia é o recorte aberto', () => {
    expect(recorteDaBusca({}, AGORA)).toEqual({ ok: true, recorte: {} })
  })

  it('recusa o que não reconhece, em vez de descartar em silêncio', () => {
    expect(recorteDaBusca({ atividade: 'ontem' }, AGORA)).toEqual({
      ok: false,
      motivo: 'filtro_invalido',
      campo: 'atividade',
    })

    // Quem recusa a ordenação é o módulo compartilhado, o mesmo que a
    // exportação usa: é isso que faz as duas recusarem as mesmas coisas.
    expect(recorteDaBusca({ ordenacao: 'preco' }, AGORA)).toEqual({
      ok: false,
      motivo: 'filtro_invalido',
      campo: 'ordenacao',
    })

    expect(recorteDaBusca({ bloqueado: 'talvez' }, AGORA)).toEqual({
      ok: false,
      motivo: 'filtro_invalido',
      campo: 'bloqueado',
    })
  })
})

describe('filtro de bloqueio', () => {
  it('vai e volta entre o seletor e a busca', () => {
    expect(bloqueioDaBusca(undefined)).toBe('todos')
    expect(bloqueioDaBusca('true')).toBe('bloqueados')
    expect(bloqueioDaBusca('false')).toBe('liberados')

    expect(bloqueadoDaBusca('todos')).toBeUndefined()
    expect(bloqueadoDaBusca('bloqueados')).toBe('true')
    expect(bloqueadoDaBusca('liberados')).toBe('false')
  })

  it('valor fora da lista cai em os dois', () => {
    expect(bloqueioEscolhido('bloqueados')).toBe('bloqueados')
    expect(bloqueioEscolhido('sumidos')).toBe('todos')
  })
})

describe('ordenação', () => {
  it('cai na última atividade quando a busca não diz nada conhecido', () => {
    expect(ordenacaoDaBusca(undefined)).toBe('atividade')
    expect(ordenacaoDaBusca('nome')).toBe('nome')
    expect(ordenacaoDaBusca('criacao')).toBe('criacao')
    expect(ordenacaoDaBusca('preco')).toBe('atividade')
  })
})

describe('tem recorte', () => {
  it('é falso na busca vazia e no período tudo', () => {
    expect(temRecorte({})).toBe(false)
    expect(temRecorte({ atividade: 'tudo' })).toBe(false)
  })

  it('a ordenação sozinha não é recorte: ela muda a ordem, não o conjunto', () => {
    expect(temRecorte({ ordenacao: 'nome' })).toBe(false)
  })

  it('é verdadeiro para cada filtro, um a um', () => {
    expect(temRecorte({ termo: 'marina' })).toBe(true)
    expect(temRecorte({ etapa: 'won' })).toBe(true)
    expect(temRecorte({ temperatura: 'quente' })).toBe(true)
    expect(temRecorte({ origem: 'import' })).toBe(true)
    expect(temRecorte({ atividade: '7d' })).toBe(true)
    expect(temRecorte({ bloqueado: 'true' })).toBe(true)
  })
})

describe('estado da lista', () => {
  it('distingue a conta sem lead do recorte sem resultado', () => {
    expect(estadoDaLista(0, {})).toBe('conta-sem-lead')
    expect(estadoDaLista(0, { etapa: 'won' })).toBe('recorte-sem-resultado')
    expect(estadoDaLista(3, { etapa: 'won' })).toBe('lista')
  })
})

describe('padrão de busca', () => {
  it('cita o valor para a vírgula não fechar a condição do PostgREST', () => {
    expect(padraoDeBusca('marina')).toBe('"%marina%"')
    expect(padraoDeBusca('aurora, ltda')).toBe('"%aurora, ltda%"')
  })

  it('escapa aspa e contrabarra dentro do valor citado', () => {
    expect(padraoDeBusca('a"b')).toBe('"%a\\"b%"')
    expect(padraoDeBusca('a\\b')).toBe('"%a\\\\b%"')
  })
})

describe('chave da consulta', () => {
  it('é estável entre duas leituras da mesma busca', () => {
    // O recorte carrega o instante da atividade e mudaria a cada relógio lido;
    // a chave sai da busca justamente para não disparar consulta a cada desenho.
    const busca = { atividade: '7d' }
    expect(chaveDaBusca(busca)).toEqual(chaveDaBusca(busca))
  })

  it('muda quando o recorte muda', () => {
    expect(chaveDaBusca({ etapa: 'won' })).not.toEqual(
      chaveDaBusca({ etapa: 'lost' }),
    )
  })
})
