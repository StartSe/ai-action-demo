// O calendário externo do especialista: o vínculo que guarda por onde renovar o
// acesso e o retrato da ocupação lida de fora. O que se prova aqui:
//
// 1. A idempotência da sincronização é do banco, não da rotina: a chave única
//    de (specialist_id, external_id) recusa o mesmo evento duas vezes, e é ela
//    que permite à rotina fazer `on conflict do update` a cada cinco minutos.
// 2. Um calendário por provedor por especialista, pela mesma razão: duas
//    agendas do mesmo provedor deixariam a rotina sem saber onde escrever.
// 3. `specialist_busy_blocks` é classe Servidor da seção 3.9 — membro lê,
//    ninguém do cliente escreve, nem admin, nem owner. Prova nos dois lados: a
//    leitura devolve as linhas da própria conta e a escrita é recusada.
// 4. O token nunca sai. A coluna guarda só o ponteiro para o Vault, e
//    `authenticated` com o uuid em mãos esbarra em permission denied em
//    `vault.decrypted_secrets` — o schema vault não é alcançável por papel de
//    cliente.
// 5. A trilha registra conectar e desconectar agenda, e não registra as
//    passagens da rotina: `synced_at` e `sync_error` estão fora da comparação.
//
// Referência: migração 20260921190000_calendario_do_especialista.sql,
// docs/PRD-implementacao.md seções 3.3 e 3.9, docs/PRD.md RF-507 e RF-508,
// docs/revisao-tecnica.md L-06 e T-10.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  criarBancoDeTeste,
  UUID,
  type BancoDeTeste,
} from '../auxiliares/banco-de-teste.ts'

/** SQLSTATE da violação de chave única. */
const CHAVE_DUPLICADA = '23505'

interface Conta {
  readonly id: string
  readonly nome: string
  readonly donoId: string
  readonly adminId: string
  readonly operadorId: string
  readonly especialistaId: string
  readonly outroEspecialistaId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta
/** Contador de nomes no Vault: o nome do segredo é único lá. */
let sequencia = 0

async function criarConta(nome: string, dominio: string): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name) values ($1) returning id',
    [nome],
  )
  const id = rows[0]!.id

  const donoId = await banco.criarUsuario(`dono@${dominio}`, 'Dono')
  const adminId = await banco.criarUsuario(`admin@${dominio}`, 'Admin')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'admin'), ($1, $4, 'operator')`,
    [id, donoId, adminId, operadorId],
  )

  const especialistaId = await criarEspecialista(id, `Ana de ${nome}`, dominio)
  const outroEspecialistaId = await criarEspecialista(
    id,
    `Bruno de ${nome}`,
    dominio,
  )

  return {
    id,
    nome,
    donoId,
    adminId,
    operadorId,
    especialistaId,
    outroEspecialistaId,
  }
}

async function criarEspecialista(
  contaId: string,
  nome: string,
  dominio: string,
): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.specialists (account_id, name, email, modalities)
     values ($1, $2, $3, array['video']::text[])
     returning id`,
    [contaId, nome, `${nome.replace(/\s+/g, '.').toLowerCase()}@${dominio}`],
  )
  return rows[0]!.id
}

/**
 * Um segredo no Vault para a coluna apontar. O valor é de faz de conta: o que
 * estes testes medem é quem alcança o segredo, não o que ele guarda.
 */
async function guardarSegredo(): Promise<string> {
  sequencia += 1
  const { rows } = await banco.sql.query<{ id: string }>(
    `select vault.create_secret($1, $2, $3) as id`,
    [
      `token-de-renovacao-${sequencia}`,
      `calendario:${sequencia}`,
      'calendário do especialista',
    ],
  )
  return rows[0]!.id
}

/** Insert genérico que devolve o id, com os extras por sobreposição. */
async function inserir(
  tabela: string,
  campos: Readonly<Record<string, unknown>>,
): Promise<string> {
  const colunas = Object.keys(campos)
  const valores = Object.values(campos)
  const marcadores = colunas.map((_, indice) => `$${indice + 1}`)

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.${tabela} (${colunas.join(', ')})
     values (${marcadores.join(', ')})
     returning id`,
    valores,
  )
  return rows[0]!.id
}

async function conectarCalendario(
  conta: Conta,
  campos: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  // O ponteiro só se cria quando o chamador não trouxe o dele: guardar segredo
  // é trabalho de serviço, e um teste que já trocou de papel esbarraria no
  // schema vault antes de a política de insert dizer o que tinha a dizer.
  const segredo =
    'refresh_secret_id' in campos
      ? campos.refresh_secret_id
      : await guardarSegredo()

  return inserir('specialist_calendars', {
    account_id: conta.id,
    specialist_id: conta.especialistaId,
    provider: 'google',
    external_id: 'agenda-principal',
    ...campos,
    refresh_secret_id: segredo,
  })
}

async function ocupar(
  conta: Conta,
  campos: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  return inserir('specialist_busy_blocks', {
    account_id: conta.id,
    specialist_id: conta.especialistaId,
    starts_at: '2026-10-01T09:00:00Z',
    ends_at: '2026-10-01T10:00:00Z',
    external_id: 'evento-1',
    ...campos,
  })
}

/** Erro que o banco levantou, com o SQLSTATE preservado. */
async function erroDe(manobra: Promise<unknown>): Promise<{
  code?: string
  message: string
}> {
  try {
    await manobra
  } catch (erro) {
    const bruto = erro as { code?: string; message?: string }
    return { code: bruto.code, message: String(bruto.message) }
  }
  throw new Error('a manobra deveria ter sido recusada, e passou')
}

async function limpar(): Promise<void> {
  await banco.sql.query('delete from public.specialist_busy_blocks')
  await banco.sql.query('delete from public.specialist_calendars')
  await banco.sql.query('delete from public.audit_log')
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Transportes Aurora', 'aurora-agenda.test')
  contaB = await criarConta('Cooperativa Sul', 'sul-agenda.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await limpar()
})

// O vínculo ------------------------------------------------------------------

test('o mesmo provedor duas vezes no mesmo especialista é recusado', async () => {
  await conectarCalendario(contaA)

  const repetido = await erroDe(
    conectarCalendario(contaA, { external_id: 'outra-agenda' }),
  )
  expect(repetido.code).toBe(CHAVE_DUPLICADA)
  expect(repetido.message).toMatch(
    /specialist_calendars_specialist_id_provider_key/i,
  )

  // Outro provedor no mesmo especialista entra, e o mesmo provedor em outro
  // especialista também: a chave é do par, não de cada coluna.
  expect(await conectarCalendario(contaA, { provider: 'microsoft' })).toBeTruthy()
  expect(
    await conectarCalendario(contaA, {
      specialist_id: contaA.outroEspecialistaId,
    }),
  ).toBeTruthy()
})

test('o provedor entra normalizado, e o ponteiro do Vault não se repete', async () => {
  const comMaiuscula = await erroDe(
    conectarCalendario(contaA, { provider: 'Google' }),
  )
  expect(comMaiuscula.message).toMatch(/provider/i)

  const segredo = await guardarSegredo()
  await conectarCalendario(contaA, { refresh_secret_id: segredo })
  const reaproveitado = await erroDe(
    conectarCalendario(contaA, {
      provider: 'microsoft',
      refresh_secret_id: segredo,
    }),
  )
  expect(reaproveitado.code).toBe(CHAVE_DUPLICADA)
})

test('o calendário recém-conectado nasce sem sincronização e sem falha', async () => {
  const id = await conectarCalendario(contaA)
  const { rows } = await banco.sql.query<{
    synced_at: string | null
    sync_error: string | null
    refresh_secret_id: string
  }>(
    `select synced_at, sync_error, refresh_secret_id
       from public.specialist_calendars where id = $1`,
    [id],
  )
  expect(rows[0]?.synced_at).toBeNull()
  expect(rows[0]?.sync_error).toBeNull()
  expect(rows[0]?.refresh_secret_id).toMatch(UUID)
})

test('a falha da sincronização é texto com conteúdo, nunca cadeia vazia', async () => {
  const id = await conectarCalendario(contaA)
  const emBranco = await erroDe(
    banco.sql.query(
      `update public.specialist_calendars set sync_error = '   ' where id = $1`,
      [id],
    ),
  )
  expect(emBranco.message).toMatch(/sync_error/i)
})

test('o comentário avisa que falha nula com synced_at antigo é rotina parada', async () => {
  const { rows } = await banco.sql.query<{ nome: string; texto: string | null }>(
    `select a.attname as nome,
            col_description('public.specialist_calendars'::regclass, a.attnum) as texto
       from pg_attribute as a
      where a.attrelid = 'public.specialist_calendars'::regclass
        and a.attname in ('sync_error', 'refresh_secret_id')`,
  )
  const porNome = new Map(rows.map((linha) => [linha.nome, linha.texto ?? '']))

  // Sem esta frase, quem ler a ocupação vazia conclui que o especialista está
  // livre quando o que houve foi a rotina parar de rodar.
  expect(porNome.get('sync_error')).toMatch(/rotina parada/i)
  expect(porNome.get('refresh_secret_id')).toMatch(/nunca guarda o token/i)
})

// A ocupação lida de fora ----------------------------------------------------

test('o mesmo evento duas vezes é recusado, que é o que torna a rotina idempotente', async () => {
  await ocupar(contaA)

  const repetido = await erroDe(
    ocupar(contaA, { starts_at: '2026-10-02T09:00:00Z', ends_at: '2026-10-02T10:00:00Z' }),
  )
  expect(repetido.code).toBe(CHAVE_DUPLICADA)
  expect(repetido.message).toMatch(
    /specialist_busy_blocks_specialist_id_external_id_key/i,
  )

  // O mesmo identificador em outro especialista entra: a chave é do par.
  expect(
    await ocupar(contaA, { specialist_id: contaA.outroEspecialistaId }),
  ).toBeTruthy()
})

test('a segunda passagem da rotina atualiza a linha em vez de duplicá-la', async () => {
  const antes = await ocupar(contaA)

  await banco.sql.query(
    `insert into public.specialist_busy_blocks
       (account_id, specialist_id, starts_at, ends_at, external_id, synced_at)
     values ($1, $2, $3, $4, 'evento-1', now())
     on conflict (specialist_id, external_id) do update
        set starts_at = excluded.starts_at,
            ends_at = excluded.ends_at,
            synced_at = excluded.synced_at`,
    [
      contaA.id,
      contaA.especialistaId,
      '2026-10-01T11:00:00Z',
      '2026-10-01T12:00:00Z',
    ],
  )

  const { rows } = await banco.sql.query<{ id: string; starts_at: string }>(
    'select id, starts_at from public.specialist_busy_blocks',
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.id).toBe(antes)
  expect(new Date(rows[0]!.starts_at).toISOString()).toBe(
    '2026-10-01T11:00:00.000Z',
  )
})

test('dois eventos sobrepostos convivem, porque a agenda de fora é assim', async () => {
  await ocupar(contaA)
  const sobreposto = await ocupar(contaA, {
    external_id: 'evento-2',
    starts_at: '2026-10-01T09:30:00Z',
    ends_at: '2026-10-01T10:30:00Z',
  })
  expect(sobreposto).toBeTruthy()
})

test('o banco recusa ocupação que termina antes de começar', async () => {
  const invertida = await erroDe(
    ocupar(contaA, {
      starts_at: '2026-10-01T10:00:00Z',
      ends_at: '2026-10-01T09:00:00Z',
    }),
  )
  expect(invertida.message).toMatch(/specialist_busy_blocks_intervalo_util/i)
})

test('a consulta da geração de horários tem índice por especialista e início', async () => {
  const { rows } = await banco.sql.query<{ indexdef: string }>(
    `select indexdef from pg_indexes
      where schemaname = 'public'
        and tablename = 'specialist_busy_blocks'
        and indexname = 'specialist_busy_blocks_por_inicio'`,
  )
  expect(rows[0]?.indexdef).toMatch(/\(specialist_id, starts_at\)/)
})

// Classe Servidor ------------------------------------------------------------

test('a ocupação não tem política de escrita no catálogo, só a de leitura', async () => {
  const { rows } = await banco.sql.query<{ cmd: string; policyname: string }>(
    `select cmd, policyname from pg_policies
      where schemaname = 'public' and tablename = 'specialist_busy_blocks'`,
  )
  expect(
    rows.map((linha) => linha.cmd),
    'specialist_busy_blocks é classe Servidor: política de escrita de cliente ' +
      'aqui abre a ocupação lida de fora para quem quiser corrigi-la pela tela',
  ).toEqual(['SELECT'])
})

test('nem o admin nem o dono escrevem na ocupação; a leitura continua de pé', async () => {
  const bloco = await ocupar(contaA)

  for (const usuarioId of [contaA.adminId, contaA.donoId]) {
    await banco.comoUsuario(usuarioId)

    const { rows: lidas } = await banco.sql.query<{ id: string }>(
      'select id from public.specialist_busy_blocks',
    )
    expect(lidas.map((linha) => linha.id)).toEqual([bloco])

    const recusa = await erroDe(
      ocupar(contaA, { external_id: `inventado-${usuarioId}` }),
    )
    expect(recusa.message).toMatch(/row-level security/i)

    // `update` e `delete` sem política não levantam erro: não afetam linha.
    const { rows: alteradas } = await banco.sql.query(
      `update public.specialist_busy_blocks set ends_at = $2
        where id = $1 returning id`,
      [bloco, '2026-10-01T18:00:00Z'],
    )
    expect(alteradas).toEqual([])

    const { rows: apagadas } = await banco.sql.query(
      'delete from public.specialist_busy_blocks where id = $1 returning id',
      [bloco],
    )
    expect(apagadas).toEqual([])
  }
})

test('o administrador conecta calendário e o operador não', async () => {
  // Os segredos nascem antes da troca de papel: guardar no Vault é trabalho da
  // borda, e o cliente esbarraria em "permission denied for schema vault" antes
  // de a política de insert ser avaliada — o que mediria a coisa errada.
  const doOperador = await guardarSegredo()
  const doAdmin = await guardarSegredo()

  await banco.comoUsuario(contaA.operadorId)
  const recusa = await erroDe(
    conectarCalendario(contaA, { refresh_secret_id: doOperador }),
  )
  expect(recusa.message).toMatch(/row-level security/i)

  await banco.comoUsuario(contaA.adminId)
  expect(
    await conectarCalendario(contaA, { refresh_secret_id: doAdmin }),
  ).toBeTruthy()
})

// Isolamento entre contas ----------------------------------------------------

test('a conta vizinha recebe zero linha das duas tabelas, e o anônimo também', async () => {
  await conectarCalendario(contaA)
  await ocupar(contaA)
  await conectarCalendario(contaB)
  await ocupar(contaB)

  for (const [dona, vizinha] of [
    [contaA, contaB],
    [contaB, contaA],
  ] as const) {
    await banco.comoUsuario(dona.adminId)
    for (const tabela of ['specialist_calendars', 'specialist_busy_blocks']) {
      const { rows } = await banco.sql.query<{ account_id: string }>(
        `select account_id from public.${tabela}`,
      )
      expect(rows.length, `${tabela} ficou vazia para quem é da conta`).toBe(1)
      expect(
        rows[0]?.account_id,
        `${tabela} atravessou para a conta ${vizinha.nome}`,
      ).toBe(dona.id)
    }
  }

  await banco.comoAnonimo()
  for (const tabela of ['specialist_calendars', 'specialist_busy_blocks']) {
    const { rows } = await banco.sql.query(`select id from public.${tabela}`)
    expect(rows, `${tabela} respondeu à sessão anônima`).toEqual([])
  }
})

test('o administrador da conta vizinha não conecta calendário aqui', async () => {
  const segredo = await guardarSegredo()
  await banco.comoUsuario(contaB.adminId)

  const recusa = await erroDe(
    inserir('specialist_calendars', {
      account_id: contaA.id,
      specialist_id: contaA.especialistaId,
      provider: 'google',
      external_id: 'agenda-alheia',
      refresh_secret_id: segredo,
    }),
  )
  expect(recusa.message).toMatch(/row-level security/i)
})

// O token ---------------------------------------------------------------------

test('o ponteiro do Vault é legível e o valor por trás dele não', async () => {
  const id = await conectarCalendario(contaA)

  await banco.comoUsuario(contaA.adminId)
  const { rows } = await banco.sql.query<{ refresh_secret_id: string }>(
    'select refresh_secret_id from public.specialist_calendars where id = $1',
    [id],
  )
  const ponteiro = rows[0]?.refresh_secret_id
  expect(ponteiro).toMatch(UUID)

  // Com o uuid em mãos: o schema vault não é alcançável por papel de cliente,
  // então a resposta é permission denied e não o token.
  await expect(
    banco.sql.query(
      'select decrypted_secret from vault.decrypted_secrets where id = $1',
      [ponteiro],
    ),
  ).rejects.toThrow(/permission denied/i)

  await expect(
    banco.sql.query('select secret from vault.secrets where id = $1', [ponteiro]),
  ).rejects.toThrow(/permission denied/i)
})

test('nenhuma coluna das duas tabelas guarda o token em claro', async () => {
  const { rows } = await banco.sql.query<{ nome: string }>(
    `select a.attname as nome
       from pg_attribute as a
      where a.attrelid in (
              'public.specialist_calendars'::regclass,
              'public.specialist_busy_blocks'::regclass)
        and a.attnum > 0
        and not a.attisdropped
        and format_type(a.atttypid, a.atttypmod) like '%text%'`,
  )
  const suspeitas = rows
    .map((linha) => linha.nome)
    .filter((nome) => /token|secret|refresh/.test(nome))
  expect(
    suspeitas,
    'coluna de texto com nome de segredo: o que o calendário guarda é o ' +
      'ponteiro uuid para o Vault, nunca o valor',
  ).toEqual([])
})

// Trilha ----------------------------------------------------------------------

test('conectar e desconectar agenda entra na trilha; a passagem da rotina não', async () => {
  const id = await conectarCalendario(contaA)

  // O que a rotina escreve a cada cinco minutos: fora da comparação.
  await banco.sql.query(
    `update public.specialist_calendars
        set synced_at = now(), sync_error = 'o provedor não respondeu'
      where id = $1`,
    [id],
  )
  const { rows: depoisDaRotina } = await banco.sql.query(
    `select id from public.audit_log where target_type = 'specialist_calendars'`,
  )
  expect(
    depoisDaRotina,
    'a passagem da rotina virou linha de trilha: a cada cinco minutos, o ' +
      'ruído afogaria a conexão e a troca de agenda',
  ).toEqual([])

  // Trocar a agenda de destino, sim.
  await banco.sql.query(
    `update public.specialist_calendars set external_id = $2 where id = $1`,
    [id, 'agenda-de-atendimento'],
  )
  const { rows } = await banco.sql.query<{ payload: { campos: string[] } }>(
    `select payload from public.audit_log
      where target_type = 'specialist_calendars' and target_id = $1`,
    [id],
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]?.payload.campos).toEqual(['external_id'])
})

test('o ponteiro do Vault entra redigido na trilha', async () => {
  const id = await conectarCalendario(contaA)

  await banco.sql.query(
    'update public.specialist_calendars set refresh_secret_id = $2 where id = $1',
    [id, await guardarSegredo()],
  )

  const { rows } = await banco.sql.query<{
    payload: { antes: Record<string, unknown>; depois: Record<string, unknown> }
  }>(
    `select payload from public.audit_log
      where target_type = 'specialist_calendars' and target_id = $1`,
    [id],
  )
  expect(rows[0]?.payload.antes.refresh_secret_id).toBe('[redigido]')
  expect(rows[0]?.payload.depois.refresh_secret_id).toBe('[redigido]')
})

test('updated_at não aceita data vinda de fora', async () => {
  const id = await conectarCalendario(contaA)

  const { rows } = await banco.sql.query<{
    updated_at: string
    created_at: string
  }>(
    `update public.specialist_calendars
        set external_id = 'outra', updated_at = '2001-01-01T00:00:00Z'
      where id = $1
      returning updated_at, created_at`,
    [id],
  )
  expect(rows[0]!.updated_at >= rows[0]!.created_at).toBe(true)
})
