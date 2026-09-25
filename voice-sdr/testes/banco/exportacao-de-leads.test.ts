// O registro da exportação da base de contatos: a única escrita de `audit_log`
// que não vem de gatilho.
//
// Exportar contatos tira o dado de dentro do produto — depois do download, não
// há política nem exclusão que alcance aquelas linhas. O que sobra é o
// registro, e é dele que este arquivo trata. Quatro perguntas:
//
// 1. Alguém consegue registrar exportação de conta de que não participa?
// 2. Alguém consegue assinar o registro com o nome de outro?
// 3. O registro guarda mesmo a quantidade e o recorte, ou só diz que houve
//    exportação?
// 4. A ausência de política de escrita em `audit_log` continua de pé depois de
//    existir um caminho de escrita pelo cliente?
//
// Referência: migração 20260921140000_exportacao_de_leads.sql, docs/PRD.md
// RF-008 e RF-115, docs/PRD-implementacao.md seções 3.1 e 3.9.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  UUID,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

interface Conta {
  readonly id: string
  readonly donoId: string
  readonly operadorId: string
  readonly observadorId: string
}

interface RegistroDeExportacao {
  readonly actor: string
  readonly actor_id: string | null
  readonly source: string
  readonly action: string
  readonly target_type: string
  readonly reason: string | null
  readonly payload: { quantidade?: number; recorte?: Record<string, unknown> }
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta

async function criarConta(nome: string, dominio: string): Promise<Conta> {
  await banco.comoServico()

  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id

  const donoId = await banco.criarUsuario(`dono@${dominio}`, 'Dono')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  const observadorId = await banco.criarUsuario(`observador@${dominio}`, 'Observador')

  await banco.comoServico()
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'operator'), ($1, $4, 'viewer')`,
    [id, donoId, operadorId, observadorId],
  )

  return { id, donoId, operadorId, observadorId }
}

/** Chama o RPC na sessão em curso e devolve o id do registro. */
async function registrarExportacao(
  contaId: string,
  quantidade: number,
  recorte: Record<string, unknown> = {},
): Promise<string> {
  const { rows } = await banco.sql.query<{ registrar_exportacao_de_leads: string }>(
    'select public.registrar_exportacao_de_leads($1, $2, $3)',
    [contaId, quantidade, JSON.stringify(recorte)],
  )
  return rows[0]!.registrar_exportacao_de_leads
}

async function registrosDa(contaId: string): Promise<RegistroDeExportacao[]> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<RegistroDeExportacao>(
    `select actor, actor_id, source, action, target_type, reason, payload
       from public.audit_log
      where account_id = $1 and action = 'leads_exported'
      order by created_at`,
    [contaId],
  )
  return rows
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora.export.test')
  contaB = await criarConta('Cooperativa Sul', 'sul.export.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.audit_log')
})

// O registro ------------------------------------------------------------------

test('o registro guarda a quantidade e o recorte usado', async () => {
  const recorte = { etapa: 'qualified', temperatura: 'quente', ordenacao: 'nome' }
  await banco.comoUsuario(contaA.operadorId)

  const id = await registrarExportacao(contaA.id, 1_240, recorte)

  expect(id).toMatch(UUID)
  const registros = await registrosDa(contaA.id)
  expect(registros).toHaveLength(1)
  expect(registros[0]?.payload).toEqual({ quantidade: 1_240, recorte })
  expect(registros[0]?.action).toBe('leads_exported')
  expect(registros[0]?.target_type).toBe('leads')
  // A porta por onde a exportação entrou, que é diferente da tabela que ela leu.
  expect(registros[0]?.source).toBe('edge:lead-export')
  expect(registros[0]?.reason).toBe('exportação da base de contatos')
})

test('o autor é auth.uid(), e o RPC não tem como receber outro', async () => {
  await banco.comoUsuario(contaA.observadorId)

  await registrarExportacao(contaA.id, 3)

  const registros = await registrosDa(contaA.id)
  expect(registros[0]?.actor).toBe('user')
  expect(registros[0]?.actor_id).toBe(contaA.observadorId)
})

test('exportação de recorte vazio ainda assim é registrável', async () => {
  // Quem chama é quem decide se registra; o RPC não recusa zero. Quem decide
  // não registrar a exportação sem linha é a borda, e o motivo está lá.
  await banco.comoUsuario(contaA.donoId)

  await registrarExportacao(contaA.id, 0)

  expect(await registrosDa(contaA.id)).toHaveLength(1)
})

// As recusas --------------------------------------------------------------------

test('membro de outra conta não registra exportação aqui', async () => {
  await banco.comoUsuario(contaB.donoId)

  await expect(
    registrarExportacao(contaA.id, 500),
    'registro de exportação em conta de que quem chama não participa',
  ).rejects.toThrow(/sem_permissao/)

  expect(await registrosDa(contaA.id)).toEqual([])
})

test('sessão anônima não registra exportação nenhuma', async () => {
  await banco.comoAnonimo()

  await expect(registrarExportacao(contaA.id, 10)).rejects.toThrow(
    /sem_sessao|permission denied/i,
  )
})

test('a chave de serviço também é recusada, porque não tem sessão', async () => {
  // A exportação acontece sob a sessão de quem pediu. Registro assinado por
  // ninguém seria exatamente o que a trilha existe para impedir.
  await banco.comoServico()

  await expect(registrarExportacao(contaA.id, 10)).rejects.toThrow(/sem_sessao/)
})

test('quantidade negativa é recusada', async () => {
  await banco.comoUsuario(contaA.operadorId)

  await expect(registrarExportacao(contaA.id, -1)).rejects.toThrow(/quantidade_invalida/)
})

test('recorte que não é objeto é recusado', async () => {
  await banco.comoUsuario(contaA.operadorId)

  await expect(
    banco.sql.query('select public.registrar_exportacao_de_leads($1, $2, $3::jsonb)', [
      contaA.id,
      7,
      '[1,2]',
    ]),
  ).rejects.toThrow(/recorte_invalido/)
})

// A fronteira continua de pé ------------------------------------------------------

test('audit_log continua sem política de escrita', async () => {
  const { rows } = await banco.sql.query<{ cmd: string }>(
    `select cmd from pg_policies
      where schemaname = 'public' and tablename = 'audit_log'`,
  )

  expect(
    rows.map((linha) => linha.cmd).sort(),
    'existir um RPC de escrita não abre a tabela: a fronteira é a ausência de política',
  ).toEqual(['SELECT'])
})

test('o cliente não insere em audit_log por fora do RPC', async () => {
  await banco.comoUsuario(contaA.donoId)

  await expect(
    banco.sql.query(
      `insert into public.audit_log (account_id, actor, actor_id, source, action, target_type)
       values ($1, 'user', $2, 'edge:lead-export', 'leads_exported', 'leads')`,
      [contaA.id, contaA.donoId],
    ),
  ).rejects.toThrow(/row-level security/i)
})

test('o membro lê a trilha da própria conta e não a da vizinha', async () => {
  await banco.comoUsuario(contaA.operadorId)
  await registrarExportacao(contaA.id, 12)
  await banco.comoUsuario(contaB.operadorId)
  await registrarExportacao(contaB.id, 34)

  await banco.comoUsuario(contaA.donoId)
  const { rows } = await banco.sql.query<{ account_id: string; payload: { quantidade: number } }>(
    `select account_id, payload from public.audit_log where action = 'leads_exported'`,
  )

  expect(rows).toHaveLength(1)
  expect(rows[0]?.account_id).toBe(contaA.id)
  expect(rows[0]?.payload.quantidade).toBe(12)
})

// O grant -------------------------------------------------------------------------

test('a execução do RPC é de authenticated, e não de public', async () => {
  const { rows } = await banco.sql.query<{ grantee: string }>(
    `select grantee
       from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name = 'registrar_exportacao_de_leads'
        and privilege_type = 'EXECUTE'`,
  )

  const quem = rows.map((linha) => linha.grantee).sort()
  expect(quem, 'grant a public alcança qualquer papel presente ou futuro').not.toContain(
    'PUBLIC',
  )
  expect(quem).toContain('authenticated')
  expect(quem).not.toContain('anon')
})
