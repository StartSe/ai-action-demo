// As tabelas da agenda nas classes da matriz de isolamento, conferidas no
// catálogo. A travessia (`travessia-entre-contas.test.ts`) prova pelo dado que
// nenhuma conta lê a outra; este arquivo prova quem escreve o quê, que é o que
// a travessia não mede:
//
// 1. As sete têm `account_id` próprio, obrigatório, e nenhuma está isenta em
//    `SEM_ACCOUNT_ID`: a política lê a conta pela coluna, não pelo especialista.
// 2. Classe Servidor (`specialist_busy_blocks`, `call_slot_offers`): uma
//    política só, de leitura por `is_member`. Nenhum cliente escreve, nem admin.
// 3. Classe Operação (`meetings`): escrita por `has_role(..., 'operator')`.
// 4. Classe Configuração (as quatro de especialista mais `account_settings`):
//    escrita por `has_role(..., 'admin')`.
// 5. Quem tem `updated_at` tem gatilho de trilha. As duas da classe Servidor
//    não têm a coluna, e é isso que as tira da varredura de auditoria.
//
// Que `refresh_secret_id` não leva ao valor se prova em
// `calendario-do-especialista.test.ts`: `authenticated` com o uuid em mãos
// recebe permission denied em `vault.decrypted_secrets`.
//
// Referência: docs/PRD-implementacao.md seção 3.9.

import { afterAll, beforeAll, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'
import { SEM_ACCOUNT_ID } from '../../scripts/analise-de-migracoes.ts'

const CLASSE_SERVIDOR = ['specialist_busy_blocks', 'call_slot_offers']
const CLASSE_OPERACAO = ['meetings']
const CLASSE_CONFIGURACAO = [
  'specialists',
  'specialist_availability',
  'specialist_blocks',
  'specialist_calendars',
  'account_settings',
]

/** As sete que a F5 cria; `account_settings` é da F2 e ganhou o roteamento na F5. */
const TABELAS_DA_F5 = [
  ...CLASSE_CONFIGURACAO.filter((nome) => nome !== 'account_settings'),
  ...CLASSE_OPERACAO,
  ...CLASSE_SERVIDOR,
]

interface Politica {
  readonly tablename: string
  readonly policyname: string
  readonly cmd: string
  readonly qual: string | null
  readonly with_check: string | null
}

let banco: BancoDeTeste

beforeAll(async () => {
  banco = await criarBancoDeTeste()
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

async function politicasDe(tabela: string): Promise<Politica[]> {
  const { rows } = await banco.sql.query<Politica>(
    `select tablename, policyname, cmd, qual, with_check
       from pg_policies
      where schemaname = 'public'
        and tablename = $1
      order by policyname`,
    [tabela],
  )
  return rows
}

/** O texto que decide a escrita: `using` de update e delete, `with check` do resto. */
function expressoesDeEscrita(politica: Politica): string[] {
  return [politica.qual, politica.with_check].filter(
    (expressao): expressao is string => expressao !== null,
  )
}

test('as sete tabelas da F5 têm account_id obrigatório e RLS ligada', async () => {
  expect(TABELAS_DA_F5).toHaveLength(7)

  const { rows } = await banco.sql.query<{
    nome: string
    rls: boolean
    account_id_obrigatorio: boolean | null
  }>(
    `select c.relname as nome,
            c.relrowsecurity as rls,
            (select a.attnotnull
               from pg_attribute as a
              where a.attrelid = c.oid
                and a.attname = 'account_id'
                and not a.attisdropped) as account_id_obrigatorio
       from pg_class as c
       join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relname = any($1)
      order by c.relname`,
    [TABELAS_DA_F5],
  )

  expect(rows.map((linha) => linha.nome).sort()).toEqual(
    [...TABELAS_DA_F5].sort(),
  )
  for (const linha of rows) {
    expect(linha.rls, `${linha.nome} sem row level security`).toBe(true)
    expect(
      linha.account_id_obrigatorio,
      `${linha.nome} sem account_id not null: a política lê a conta pela coluna`,
    ).toBe(true)
    expect(
      SEM_ACCOUNT_ID.has(linha.nome),
      `${linha.nome} entrou em SEM_ACCOUNT_ID: a conta viria pelo especialista, ` +
        'e a política precisaria de junção para achá-la',
    ).toBe(false)
  }
})

test('toda tabela da agenda lê por is_member, numa política só de leitura', async () => {
  for (const tabela of [...TABELAS_DA_F5, 'account_settings']) {
    const leitura = (await politicasDe(tabela)).filter(
      (politica) => politica.cmd === 'SELECT' || politica.cmd === 'ALL',
    )
    expect(
      leitura.map((politica) => politica.cmd),
      `${tabela}: a leitura é uma política de select, sem política all`,
    ).toEqual(['SELECT'])
    expect(leitura[0]?.qual ?? '', `${tabela} lê sem is_member`).toMatch(
      /is_member\((\w+\.)?account_id\)/,
    )
  }
})

test('as duas da classe Servidor não têm política de insert, update nem delete', async () => {
  for (const tabela of CLASSE_SERVIDOR) {
    const comandos = (await politicasDe(tabela)).map((politica) => politica.cmd)
    expect(
      comandos,
      `${tabela} é classe Servidor: só o servidor escreve, e o mecanismo é a ` +
        'ausência de política de escrita',
    ).toEqual(['SELECT'])
  }
})

test('meetings é classe Operação: toda escrita exige has_role operator', async () => {
  for (const tabela of CLASSE_OPERACAO) {
    const escrita = (await politicasDe(tabela)).filter(
      (politica) => politica.cmd !== 'SELECT',
    )
    expect(escrita.map((politica) => politica.cmd).sort()).toEqual([
      'DELETE',
      'INSERT',
      'UPDATE',
    ])
    for (const politica of escrita) {
      for (const expressao of expressoesDeEscrita(politica)) {
        expect(
          expressao,
          `${tabela}.${politica.policyname} escreve sem has_role operator`,
        ).toMatch(/has_role\((\w+\.)?account_id, 'operator'::\w+\)/)
      }
    }
  }
})

test('as cinco da classe Configuração só se escrevem com has_role admin', async () => {
  for (const tabela of CLASSE_CONFIGURACAO) {
    const escrita = (await politicasDe(tabela)).filter(
      (politica) => politica.cmd !== 'SELECT',
    )
    expect(escrita.length, `${tabela} sem política de escrita`).toBeGreaterThan(0)
    for (const politica of escrita) {
      for (const expressao of expressoesDeEscrita(politica)) {
        expect(
          expressao,
          `${tabela}.${politica.policyname} escreve sem has_role admin`,
        ).toMatch(/has_role\((\w+\.)?account_id, 'admin'::\w+\)/)
      }
    }
  }
})

test('quem tem updated_at tem trilha; as duas da classe Servidor não têm a coluna', async () => {
  const { rows } = await banco.sql.query<{
    nome: string
    tem_updated_at: boolean
    auditada: boolean
  }>(
    `select c.relname as nome,
            exists (
              select 1
                from pg_attribute as a
               where a.attrelid = c.oid
                 and a.attname = 'updated_at'
                 and not a.attisdropped
            ) as tem_updated_at,
            exists (
              select 1
                from pg_trigger as t
               where t.tgrelid = c.oid
                 and not t.tgisinternal
                 and t.tgfoid = 'public.registrar_auditoria()'::regprocedure
            ) as auditada
       from pg_class as c
       join pg_namespace as n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = any($1)
      order by c.relname`,
    [[...TABELAS_DA_F5, 'account_settings']],
  )

  expect(rows).toHaveLength(8)
  for (const linha of rows) {
    if (CLASSE_SERVIDOR.includes(linha.nome)) {
      expect(
        linha.tem_updated_at,
        `${linha.nome} ganhou updated_at: passa a exigir trilha ou razão em SEM_AUDITORIA`,
      ).toBe(false)
      continue
    }
    expect(linha.tem_updated_at, `${linha.nome} perdeu updated_at`).toBe(true)
    expect(linha.auditada, `${linha.nome} tem updated_at e não tem trilha`).toBe(
      true,
    )
  }
})
