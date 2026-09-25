// O portão da fatia só se abre pela migração da F3 (US-074, US-118, O-02, L-03).
//
// `feature_flags.real_dialing` nasce falso e quem o liga é a migração do
// portão da F3 (`20260925000000_portao_de_lead_real.sql`), que confere antes
// que ensaio, transferência, "não me ligue mais" e fila de exceções estão no
// banco. Uma migração de outra história que o ligasse por descuido abriria a
// discagem para lead real sem passar por essa conferência, e sem nenhum teste
// de banco perceber: os testes semeiam a bandeira à mão. Por isso a varredura
// é estática, sobre o texto das migrações, e cobra que haja **uma** que liga.
//
// A conferência de prontidão só vale no instante em que a migração do portão
// roda. Uma migração posterior que reescrevesse `guard_dial` sem o passo 2
// passaria por fora dela, e por isso a varredura também cobra que nenhuma
// migração depois do portão redefina a guarda sem repetir o passo 2.
//
// O mesmo arquivo cobra que a tabela do portão (`account_test_numbers`) esteja
// dentro das duas varreduras de isolamento: a análise de `check:sql` e o
// cenário de `travessia-entre-contas.test.ts`. Fora delas, uma política
// afrouxada ali deixaria uma conta discar para os números de teste de outra.

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { verificarMigracoes, type Migracao } from '../../scripts/analise-de-migracoes.ts'
import { lerMigracoes } from '../../scripts/migracoes.ts'

const migracoes = await lerMigracoes()

/** Tira comentário de linha e de bloco; os literais ficam, porque é neles que a bandeira se escreve. */
function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

/**
 * Onde uma migração escreve `real_dialing` verdadeiro. Pega as formas que um
 * `update` ou um `default` usariam: `jsonb_set(..., '{real_dialing}', 'true')`,
 * `'{"real_dialing": true}'` e `jsonb_build_object('real_dialing', true)`. A
 * distância curta até o `true`, sem cruzar `;` nem `)`, é o que deixa de fora
 * a leitura da bandeira na guarda (`->> 'real_dialing')::boolean, false)`).
 */
const LIGA_A_BANDEIRA = /real_dialing[^;)]{0,20}?\btrue\b/gi

function quemLigaABandeira(lista: readonly Migracao[]): string[] {
  return lista.flatMap((migracao) =>
    [...semComentarios(migracao.sql).matchAll(LIGA_A_BANDEIRA)].map(
      (achado) => `${migracao.nome}: ${achado[0]}`,
    ),
  )
}

/** A migração da F3 que liga a bandeira, depois de conferir a fatia. */
const MIGRACAO_DO_PORTAO = '20260925000000_portao_de_lead_real.sql'

describe('só a migração do portão da F3 liga real_dialing', () => {
  it('a varredura das migrações reais acha uma, e é a do portão', () => {
    expect(quemLigaABandeira(migracoes)).toEqual([
      `${MIGRACAO_DO_PORTAO}: real_dialing": true`,
      `${MIGRACAO_DO_PORTAO}: real_dialing}', 'true`,
    ])
  })

  it('a migração do portão confere a prontidão antes de ligar', () => {
    const portao = migracoes.find((m) => m.nome === MIGRACAO_DO_PORTAO)
    const sql = semComentarios(portao?.sql ?? '')
    const prontidao = sql.indexOf('raise exception')
    const liga = sql.search(LIGA_A_BANDEIRA)

    expect(prontidao).toBeGreaterThan(-1)
    expect(liga).toBeGreaterThan(prontidao)
  })

  it('nenhuma migração depois do portão redefine guard_dial sem o passo 2', () => {
    const indice = migracoes.findIndex((m) => m.nome === MIGRACAO_DO_PORTAO)
    const depois = migracoes.slice(indice + 1)

    expect(indice).toBeGreaterThan(-1)
    expect(
      depois
        .filter((m) => /function\s+public\.guard_dial\s*\(/i.test(semComentarios(m.sql)))
        .filter((m) => !/v_conta\.first_test_call_ok_at is null/.test(m.sql))
        .map((m) => m.nome),
    ).toEqual([])
  })

  it('a própria varredura está lendo as migrações', () => {
    // Pasta errada ou leitura vazia deixaria o teste de cima verde para sempre.
    expect(migracoes.some((m) => m.nome.endsWith('_operacao_da_conta.sql'))).toBe(true)
    expect(migracoes.some((m) => /real_dialing/.test(m.sql))).toBe(true)
  })

  it.each([
    [`update public.accounts set feature_flags = jsonb_set(feature_flags, '{real_dialing}', 'true'::jsonb);`],
    [`alter table public.accounts alter column feature_flags set default '{"real_dialing": true}'::jsonb;`],
    [`update public.accounts set feature_flags = feature_flags || jsonb_build_object('real_dialing', true);`],
    [`UPDATE public.accounts SET feature_flags = '{"real_dialing":TRUE}';`],
  ])('reprova a forma %s', (sql) => {
    expect(quemLigaABandeira([{ nome: 'sabotagem.sql', sql }])).toHaveLength(1)
  })

  it.each([
    [`alter table public.accounts alter column feature_flags set default '{"real_dialing": false}'::jsonb;`],
    [`select coalesce((a.feature_flags ->> 'real_dialing')::boolean, false) as real_dialing from public.accounts a;`],
    [`-- a F3 fará jsonb_set(feature_flags, '{real_dialing}', 'true')\nselect 1;`],
    [`/* real_dialing = true é da F3 */ select 1;`],
  ])('não reprova %s', (sql) => {
    expect(quemLigaABandeira([{ nome: 'legitima.sql', sql }])).toEqual([])
  })
})

describe('a tabela do portão está nas varreduras de isolamento', () => {
  it('check:sql cobra RLS de account_test_numbers', () => {
    const semRls = migracoes.map((m) => ({
      ...m,
      sql: m.sql.replace(
        /alter table public\.account_test_numbers enable row level security;/g,
        '',
      ),
    }))

    const achados = verificarMigracoes(semRls).filter((a) => a.regra === 'rls')

    expect(achados.map((a) => a.mensagem)).toEqual([
      'public.account_test_numbers não habilita row level security em nenhuma migração',
    ])
  })

  it('check:sql cobra account_id de account_test_numbers', () => {
    const semConta = migracoes.map((m) =>
      m.nome.endsWith('_numeros_de_teste.sql')
        ? {
            ...m,
            sql: m.sql.replace(
              /account_id uuid not null references public\.accounts \(id\) on delete cascade,/,
              'dona uuid not null,',
            ).replace(/unique \(account_id, phone_e164\)/, 'unique (dona, phone_e164)'),
          }
        : m,
    )

    const achados = verificarMigracoes(semConta).filter((a) => a.regra === 'account_id')

    expect(achados.map((a) => a.mensagem)).toContain(
      'public.account_test_numbers é tabela de negócio e não tem coluna account_id',
    )
  })

  it('o cenário da travessia entre contas semeia account_test_numbers nas duas contas', () => {
    const travessia = readFileSync(
      new URL('../banco/travessia-entre-contas.test.ts', import.meta.url),
      'utf8',
    )

    expect(travessia).toMatch(/insert into public\.account_test_numbers \(account_id,/)
  })
})
