// O portão de lead real: a F2 não liga para lead real, e a F3 abre a porta
// (US-074, US-118, L-03, O-02, RF-912).
//
// O que este arquivo prova, em PGlite com as migrações do zero:
//
// 1. **As quatro combinações** das duas condições do passo 2 de `guard_dial`:
//    sem bandeira e sem ligação de teste recusa; com bandeira e sem ligação de
//    teste recusa; sem bandeira e com ligação de teste recusa; só com as duas o
//    lead real passa. Trocar o E por OU no passo 2 derruba os dois casos do
//    meio. O número da lista de teste passa nas quatro.
// 2. **O portão não tem bypass.** Os nove motivos da seção 6 no array de
//    bypass, mais os dois nomes que o portão tem fora do SQL, e os passos 0, 2,
//    3 e 4 continuam recusando.
// 3. **A frase da recusa** sai de `guarda.ts` com a porta ligada a este banco:
//    diz o que falta e onde cadastrar número de teste.
// 4. **`registrar_primeira_chamada_de_teste`**, o RPC que `call-finalize` chama:
//    preenche `first_test_call_ok_at` na primeira chamada de teste que termina
//    com fala na transcrição, e não preenche para chamada sem transcrição, que
//    caiu, para número que não é de teste nem na segunda vez. Só
//    `service_role` executa.
// 5. **A migração que liga a bandeira** (US-118,
//    20260925000000_portao_de_lead_real.sql): confere a prontidão da F3 e
//    recusa, com a razão escrita, quando falta cada um dos objetos da fatia —
//    inclusive o passo 2 da guarda. Liga a bandeira na conta que já existia e
//    na que nasce depois, e o portão continua fechado para quem não fez a
//    ligação de teste. Com a bandeira desligada, nem o dono da conta liga para
//    número fora da lista, e a tentativa fica em `call_attempts` com o motivo.
//
// NOME DO MOTIVO. O critério da história chama a recusa de `portao_lead_real`.
// O código no SQL continua `real_dialing_gate` (código em inglês no banco, pela
// convenção de `call_attempts.outcome`), e o motivo que a borda devolve
// continua `portao_de_lead_real`, o nome que a US-059 fixou e que
// `call-place`, na frente de borda da F2, já lê. Renomear aqui quebraria aquela
// frente no merge sem mudar comportamento nenhum. `portao_lead_real` entra no
// array de bypass do item 2 para provar que o nome, qualquer que seja, não
// desliga nada.
//
// Referência: migrações 20260922110000_guarda_de_discagem.sql e
// 20260922120000_portao_da_fatia.sql, docs/PRD-implementacao.md seção 6,
// docs/revisao-tecnica.md L-03 e O-02.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'
import {
  guardarDiscagem,
  type DecisaoDaGuarda,
  type PortaDeGuarda,
  type RespostaDaGuarda,
} from '../../supabase/functions/_shared/discagem/guarda.ts'

/** Quarta-feira, 14h em São Paulo: dentro da janela padrão. */
const QUARTA_14H = '2026-09-23T17:00:00Z'
/** A mesma quarta, 22h em São Paulo: fora da janela. */
const QUARTA_22H = '2026-09-24T01:00:00Z'
const SAO_PAULO = 'America/Sao_Paulo'

/** Número da lista de teste. */
const NUMERO_DE_TESTE = '+5511999990001'
/** Número de lead real: fora da lista de teste. */
const LEAD_REAL = '+5511988887777'

/** Os nove motivos da seção 6, e os dois nomes do portão fora do SQL. */
const TUDO_NO_BYPASS = [
  'dialing_paused',
  'real_dialing_gate',
  'dnc_active',
  'outside_window',
  'min_interval',
  'daily_per_number',
  'daily_per_account',
  'daily_spend_cap',
  'no_phone_line',
  'portao_lead_real',
  'portao_de_lead_real',
]

interface Decisao {
  allowed: boolean
  reason: string
  dados: Record<string, unknown>
}

let banco: BancoDeTeste
let contaId: string
let operadorId: string

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  await banco.comoServico()

  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.accounts (name, timezone) values ('Portão', $1) returning id`,
    [SAO_PAULO],
  )
  contaId = rows[0]!.id

  await banco.sql.query(
    `insert into public.phone_lines (account_id, e164, label)
     values ($1, '+5511400000001', 'Linha do portão')`,
    [contaId],
  )

  operadorId = await banco.criarUsuario('owner@portao.test', 'Dona')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'owner')`,
    [contaId, operadorId],
  )
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

/** O estado da F2: portão fechado, um número de teste, nada gravado. */
beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.call_attempts where account_id = $1', [contaId])
  await banco.sql.query('delete from public.calls where account_id = $1', [contaId])
  await banco.sql.query('delete from public.dnc_entries where account_id = $1', [contaId])
  await banco.sql.query('delete from public.account_test_numbers where account_id = $1', [contaId])
  await banco.sql.query(
    `update public.accounts
        set dialing_paused_at = null, dialing_paused_by = null, dialing_paused_reason = null
      where id = $1`,
    [contaId],
  )
  await definirPortao({ bandeira: false, primeiraLigacao: null })
  await banco.sql.query(
    `insert into public.account_test_numbers (account_id, phone_e164, label)
     values ($1, $2, 'Celular da dona')`,
    [contaId, NUMERO_DE_TESTE],
  )
})

/**
 * Escreve as duas metades do portão. A marca da primeira ligação só se escreve
 * com o parâmetro de sessão de `call-finalize`, e o `true` do `set_config` a
 * derruba no fim da transação.
 */
async function definirPortao(estado: { bandeira: boolean; primeiraLigacao: string | null }) {
  await banco.comoServico()
  await banco.sql.exec(`
    begin;
    select set_config('app.primeira_chamada_de_teste', 'on', true);
    update public.accounts
       set first_test_call_ok_at = ${estado.primeiraLigacao ? `'${estado.primeiraLigacao}'` : 'null'},
           feature_flags = jsonb_set(feature_flags, '{real_dialing}', '${estado.bandeira}'::jsonb)
     where id = '${contaId}';
    commit;
  `)
}

async function primeiraLigacaoDaConta(): Promise<string | null> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ marca: Date | null }>(
    'select first_test_call_ok_at as marca from public.accounts where id = $1',
    [contaId],
  )
  const marca = rows[0]!.marca
  return marca ? new Date(marca).toISOString() : null
}

async function guarda(
  telefone: string,
  opcoes: { bypass?: string[]; instante?: string } = {},
): Promise<Decisao> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<Decisao>(
    `select allowed, reason, dados
       from public.guard_dial(
         p_account_id => $1::uuid,
         p_phone_e164 => $2::text,
         p_bypass => $3::text[],
         p_instante => $4::timestamptz
       )`,
    [contaId, telefone, opcoes.bypass ?? [], opcoes.instante ?? QUARTA_14H],
  )
  return rows[0]!
}

// 1. As quatro combinações ------------------------------------------------------

describe('as duas condições são E, e não OU', () => {
  const LIGACAO = '2026-09-22T15:00:00Z'
  const casos = [
    ['sem bandeira e sem ligação de teste', false, null, false],
    ['com bandeira e sem ligação de teste', true, null, false],
    ['sem bandeira e com ligação de teste', false, LIGACAO, false],
    ['com as duas', true, LIGACAO, true],
  ] as const

  test.each(casos)('%s', async (_nome, bandeira, primeiraLigacao, leadRealPassa) => {
    await definirPortao({ bandeira, primeiraLigacao })

    const leadReal = await guarda(LEAD_REAL)
    expect({ allowed: leadReal.allowed, reason: leadReal.reason }).toEqual(
      leadRealPassa
        ? { allowed: true, reason: 'placed' }
        : { allowed: false, reason: 'real_dialing_gate' },
    )

    // O número de teste passa em todas: o portão fechado restringe, não para.
    const deTeste = await guarda(NUMERO_DE_TESTE)
    expect(deTeste.reason).toBe('placed')
  })
})

test('a recusa do portão carrega as duas metades, para a borda dizer o que falta', async () => {
  const decisao = await guarda(LEAD_REAL)

  expect(decisao.dados['real_dialing']).toBe(false)
  expect(decisao.dados['first_test_call_ok_at']).toBeNull()
})

// 2. O portão não tem bypass -------------------------------------------------------

describe('o bypass não desliga os passos 0, 2, 3 e 4', () => {
  test('passo 2: o portão recusa com tudo no bypass', async () => {
    const decisao = await guarda(LEAD_REAL, { bypass: TUDO_NO_BYPASS })

    expect(decisao.reason).toBe('real_dialing_gate')
  })

  test('passo 0: o freio recusa com tudo no bypass', async () => {
    await banco.comoServico()
    await banco.sql.query(
      `update public.accounts
          set dialing_paused_at = now(), dialing_paused_by = $2,
              dialing_paused_reason = 'Teste do portão'
        where id = $1`,
      [contaId, operadorId],
    )

    const decisao = await guarda(NUMERO_DE_TESTE, { bypass: TUDO_NO_BYPASS })

    expect(decisao.reason).toBe('dialing_paused')
  })

  test('passo 3: o bloqueio recusa com tudo no bypass', async () => {
    await banco.comoServico()
    await banco.sql.query(
      `insert into public.dnc_entries (account_id, phone_e164, reason, source)
       values ($1, $2, 'Pediu para não ligar', 'lead_request')`,
      [contaId, NUMERO_DE_TESTE],
    )

    const decisao = await guarda(NUMERO_DE_TESTE, { bypass: TUDO_NO_BYPASS })

    expect(decisao.reason).toBe('dnc_active')
  })

  test('passo 4: a janela recusa com tudo no bypass', async () => {
    // Sobre lead real, e com o portão aberto para a decisão chegar ao passo 4:
    // a janela não se aplica a número da lista de teste (US-248), porque não
    // há lead do outro lado para proteger. O que este teste cobra é outra
    // coisa — que `p_bypass` não alcança a janela de quem é lead de verdade.
    await banco.comoServico()
    await banco.sql.query(
      `update public.accounts
          set feature_flags = jsonb_set(feature_flags, '{real_dialing}', 'true'::jsonb)
        where id = $1`,
      [contaId],
    )
    await banco.sql.exec(`
      begin;
      select set_config('app.primeira_chamada_de_teste', 'on', true);
      update public.accounts set first_test_call_ok_at = now()
       where id = '${contaId}';
      commit;
    `)

    const decisao = await guarda(LEAD_REAL, {
      bypass: TUDO_NO_BYPASS,
      instante: QUARTA_22H,
    })

    expect(decisao.reason).toBe('outside_window')
  })

  test('passo 4: número da lista de teste liga fora da janela (US-248)', async () => {
    const decisao = await guarda(NUMERO_DE_TESTE, { instante: QUARTA_22H })

    expect(decisao.allowed).toBe(true)
    expect(decisao.reason).toBe('placed')
  })
})

// 3. A frase da recusa ---------------------------------------------------------

/** A porta de `guarda.ts` ligada a este banco, com a chave de serviço. */
const portaNoBanco: PortaDeGuarda = {
  async guardDial(chamada) {
    await banco.comoServico()
    const { rows } = await banco.sql.query<RespostaDaGuarda>(
      `select allowed, reason, dados, phone_line_id
         from public.guard_dial(
           p_account_id => $1::uuid,
           p_phone_e164 => $2::text,
           p_lead_id => $3::uuid,
           p_actor => $4::text,
           p_actor_id => $5::uuid,
           p_source => $6::text,
           p_campaign_id => $7::uuid,
           p_bypass => $8::text[],
           p_instante => $9::timestamptz
         )`,
      [
        chamada.p_account_id,
        chamada.p_phone_e164,
        chamada.p_lead_id,
        chamada.p_actor,
        chamada.p_actor_id,
        chamada.p_source,
        chamada.p_campaign_id,
        [...chamada.p_bypass],
        chamada.p_instante,
      ],
    )
    return rows[0]!
  },
}

async function discarPelaBorda(telefone: string): Promise<DecisaoDaGuarda> {
  return guardarDiscagem(
    {
      contaId,
      telefone,
      ator: 'system',
      fonte: 'manual',
      pular: ['min_interval', 'daily_per_number'],
      instante: QUARTA_14H,
      fusoDaConta: SAO_PAULO,
    },
    portaNoBanco,
  )
}

test('a recusa diz o que falta e onde cadastrar número de teste', async () => {
  const decisao = await discarPelaBorda(LEAD_REAL)

  if (decisao.ok) throw new Error('era para recusar, e liberou')
  expect(decisao.motivo).toBe('portao_de_lead_real')
  expect(decisao.mensagem).toMatch(/só liga para os números de teste/)
  expect(decisao.mensagem).toMatch(/liberação da discagem para lead real/)
  expect(decisao.mensagem).toMatch(/ligação de teste desta conta que termine com transcrição/)
  expect(decisao.alternativa).toMatch(/lista de teste em Discagem, na administração da conta/)
  expect(JSON.stringify(decisao)).not.toContain('real_dialing_gate')
})

test('com a bandeira ligada, a frase diz que falta só a ligação de teste', async () => {
  await definirPortao({ bandeira: true, primeiraLigacao: null })

  const decisao = await discarPelaBorda(LEAD_REAL)

  if (decisao.ok) throw new Error('era para recusar, e liberou')
  expect(decisao.mensagem).toMatch(/falta uma ligação de teste/)
  expect(decisao.mensagem).not.toMatch(/liberação/)
})

// 4. Quem preenche first_test_call_ok_at ------------------------------------------

interface Chamada {
  para?: string
  status?: 'ended' | 'failed' | 'in_progress'
  direcao?: 'outbound' | 'inbound'
  transcricao?: unknown
  terminouEm?: string
}

const COM_FALA = {
  turns: [
    { role: 'agent', text: 'Oi, aqui é a Sarah.', at: '2026-09-23T17:00:05Z' },
    { role: 'lead', text: 'Oi, pode falar.', at: '2026-09-23T17:00:08Z' },
  ],
}

let sequencia = 0

async function criarChamada(chamada: Chamada = {}): Promise<string> {
  await banco.comoServico()
  sequencia += 1
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls
       (account_id, purpose, direction, status, to_number, transcript, ended_at, idempotency_key)
     values ($1, 'discovery', $2, $3, $4, $5::jsonb, $6, $7)
     returning id`,
    [
      contaId,
      chamada.direcao ?? 'outbound',
      chamada.status ?? 'ended',
      chamada.para ?? NUMERO_DE_TESTE,
      JSON.stringify(chamada.transcricao ?? COM_FALA),
      chamada.terminouEm ?? '2026-09-23T17:03:00Z',
      `portao-${sequencia}`,
    ],
  )
  return rows[0]!.id
}

async function registrar(chamadaId: string): Promise<string> {
  await banco.comoServico()
  await banco.sql.exec('set role service_role')
  try {
    const { rows } = await banco.sql.query<{ desfecho: string }>(
      'select public.registrar_primeira_chamada_de_teste($1) as desfecho',
      [chamadaId],
    )
    return rows[0]!.desfecho
  } finally {
    await banco.sql.exec('reset role')
  }
}

describe('registrar_primeira_chamada_de_teste', () => {
  test('a primeira chamada de teste com transcrição preenche a marca com o fim dela', async () => {
    const chamada = await criarChamada({ terminouEm: '2026-09-23T17:03:00Z' })

    expect(await registrar(chamada)).toBe('registrada')
    expect(await primeiraLigacaoDaConta()).toBe('2026-09-23T17:03:00.000Z')
  })

  test('chamada sem transcrição não preenche: a ligação que caiu não prova nada', async () => {
    const vazia = await criarChamada({ transcricao: {} })
    const semFala = await criarChamada({
      transcricao: { turns: [{ role: 'agent', text: '   ', at: '2026-09-23T17:00:05Z' }] },
    })

    expect(await registrar(vazia)).toBe('sem_transcricao')
    expect(await registrar(semFala)).toBe('sem_transcricao')
    expect(await primeiraLigacaoDaConta()).toBeNull()
  })

  test('chamada que falhou ou que não é de saída não preenche', async () => {
    const falhou = await criarChamada({ status: 'failed' })
    const recebida = await criarChamada({ direcao: 'inbound' })

    expect(await registrar(falhou)).toBe('nao_terminou')
    expect(await registrar(recebida)).toBe('nao_terminou')
    expect(await primeiraLigacaoDaConta()).toBeNull()
  })

  test('chamada para número fora da lista de teste não preenche', async () => {
    const chamada = await criarChamada({ para: LEAD_REAL })

    expect(await registrar(chamada)).toBe('nao_e_numero_de_teste')
    expect(await primeiraLigacaoDaConta()).toBeNull()
  })

  test('a segunda chamada de teste não reescreve a primeira', async () => {
    await registrar(await criarChamada({ terminouEm: '2026-09-23T17:03:00Z' }))

    const segunda = await criarChamada({ terminouEm: '2026-09-23T18:30:00Z' })

    expect(await registrar(segunda)).toBe('ja_registrada')
    expect(await primeiraLigacaoDaConta()).toBe('2026-09-23T17:03:00.000Z')
  })

  test('o parâmetro de sessão cai antes de o RPC devolver', async () => {
    const chamada = await criarChamada()
    await banco.comoServico()
    await banco.sql.exec('begin')
    try {
      await banco.sql.query('select public.registrar_primeira_chamada_de_teste($1)', [chamada])
      await banco.sql.query(
        `update public.accounts set first_test_call_ok_at = '2020-01-01T00:00:00Z' where id = $1`,
        [contaId],
      )
    } finally {
      await banco.sql.exec('commit')
    }

    expect(await primeiraLigacaoDaConta()).toBe('2026-09-23T17:03:00.000Z')
  })

  test('com a bandeira ligada, a ligação de teste registrada abre o portão para lead real', async () => {
    await definirPortao({ bandeira: true, primeiraLigacao: null })
    expect((await guarda(LEAD_REAL)).reason).toBe('real_dialing_gate')

    await registrar(await criarChamada())

    expect((await guarda(LEAD_REAL)).reason).toBe('placed')
  })

  test('só service_role executa: a conta não abre a própria metade do portão', async () => {
    const chamada = await criarChamada()

    await banco.comoUsuario(operadorId)
    await expect(
      banco.sql.query('select public.registrar_primeira_chamada_de_teste($1)', [chamada]),
    ).rejects.toMatchObject({ code: '42501' })

    await banco.comoAnonimo()
    await expect(
      banco.sql.query('select public.registrar_primeira_chamada_de_teste($1)', [chamada]),
    ).rejects.toMatchObject({ code: '42501' })

    expect(await primeiraLigacaoDaConta()).toBeNull()
  })

  test('chamada que não existe é erro de quem chamou', async () => {
    await expect(registrar('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({
      code: 'P0002',
    })
  })
})

// 5. A migração que liga a bandeira --------------------------------------------

/** A migração da US-118, pelo começo do nome de arquivo. */
const MIGRACAO_DO_PORTAO = '20260925000000_portao_de_lead_real'

/** Mensagem e detalhe do erro da retomada, onde o bloco de prontidão escreve a razão. */
function razaoDoErro(erro: unknown): string {
  const causa = (erro as { cause?: { message?: string; detail?: string } } | null)?.cause
  return `${String(erro)} ${causa?.detail ?? ''}`
}

/**
 * Sobe o banco parado antes da migração do portão, aplica a sabotagem e
 * retoma. Devolve a razão da recusa, ou `null` se a migração passou.
 */
async function retomarCom(sabotagem: (banco: BancoDeTeste) => Promise<void>): Promise<string | null> {
  const anterior = await criarBancoDeTeste({ pararAntesDe: MIGRACAO_DO_PORTAO })
  try {
    await sabotagem(anterior)
    await anterior.retomarMigracoes()
    return null
  } catch (erro) {
    return razaoDoErro(erro)
  } finally {
    // A retomada que falha já fecha o banco; fechar de novo não é assunto aqui.
    await anterior.encerrar().catch(() => undefined)
  }
}

/** O corpo vigente de `guard_dial`, sem o bloco do passo 2. */
async function guardaSemOPasso2(anterior: BancoDeTeste): Promise<void> {
  const { rows } = await anterior.sql.query<{ definicao: string }>(
    `select pg_get_functiondef(
       'public.guard_dial(uuid, text, uuid, text, uuid, text, uuid, text[], timestamptz)'::regprocedure
     ) as definicao`,
  )
  const definicao = rows[0]!.definicao
  const semPasso2 = definicao.replace(
    /if v_motivo is null\s+and \(not v_conta\.real_dialing[\s\S]*?end if;/,
    '',
  )
  // Se a expressão deixasse de casar, a "sabotagem" recriaria a guarda
  // inteira e o teste passaria a medir nada.
  expect(semPasso2).not.toBe(definicao)
  expect(semPasso2).not.toContain('real_dialing_gate')
  await anterior.sql.exec(semPasso2)
}

describe('a migração do portão confere a prontidão da F3 antes de ligar', () => {
  const FALTAS: [string, (anterior: BancoDeTeste) => Promise<void>, RegExp][] = [
    [
      'dnc_entries sem a origem wrong_number',
      async (anterior) => {
        await anterior.sql.exec(`
          alter table public.dnc_entries drop constraint dnc_entries_origem_conhecida;
          alter table public.dnc_entries add constraint dnc_entries_origem_conhecida
            check (source in ('manual', 'import', 'lead_request'));
        `)
      },
      /dnc_entries não aceita a origem wrong_number/,
    ],
    [
      'exception_items sem um dos três gêneros',
      async (anterior) => {
        await anterior.sql.exec(`
          alter table public.exception_items drop constraint exception_items_genero_conhecido;
          alter table public.exception_items add constraint exception_items_genero_conhecido
            check (kind in ('human_requested', 'dnc_requested'));
        `)
      },
      /exception_items não existe com os três gêneros/,
    ],
    [
      'rehearsals ausente',
      async (anterior) => {
        await anterior.sql.exec('drop table public.rehearsals cascade')
      },
      /rehearsals não existe/,
    ],
    [
      'o RPC de criação da fila ausente',
      async (anterior) => {
        await anterior.sql.exec(
          'drop function public.criar_excecao(uuid, text, text, uuid, uuid, jsonb) cascade',
        )
      },
      /RPC de criação da fila \(criar_excecao\) não existe/,
    ],
    [
      'o RPC de resolução da fila ausente',
      async (anterior) => {
        await anterior.sql.exec('drop function public.resolver_excecao(uuid, text)')
      },
      /RPC de resolução da fila \(resolver_excecao\) não existe/,
    ],
    ['a guarda sem o passo 2', guardaSemOPasso2, /guard_dial não tem o passo 2/],
  ]

  test.each(FALTAS)(
    'com %s, a migração recusa com a razão escrita',
    async (_caso, sabotagem, razao) => {
      const recusa = await retomarCom(sabotagem)

      expect(recusa).toMatch(/o portão de lead real não liga: a F3 não está completa/)
      expect(recusa).toMatch(razao)
    },
    60_000,
  )

  test('com a fatia inteira, a migração passa', async () => {
    expect(await retomarCom(async () => undefined)).toBeNull()
  }, 60_000)
})

describe('a bandeira liga na conta antiga e na nova', () => {
  test('conta de antes e conta de depois terminam no mesmo estado: bandeira ligada, portão fechado', async () => {
    const anterior = await criarBancoDeTeste({ pararAntesDe: MIGRACAO_DO_PORTAO })
    try {
      const { rows: antiga } = await anterior.sql.query<{ id: string }>(
        `insert into public.accounts (name) values ('Conta de antes') returning id`,
      )
      const { rows: antes } = await anterior.sql.query<{ feature_flags: unknown }>(
        'select feature_flags from public.accounts where id = $1',
        [antiga[0]!.id],
      )
      expect(antes[0]?.feature_flags).toEqual({ real_dialing: false })

      expect(await anterior.retomarMigracoes()).toContain(`${MIGRACAO_DO_PORTAO}.sql`)

      const { rows: nova } = await anterior.sql.query<{ id: string }>(
        `insert into public.accounts (name) values ('Conta de depois') returning id`,
      )
      const { rows: estados } = await anterior.sql.query<{
        id: string
        feature_flags: unknown
        first_test_call_ok_at: Date | null
      }>(
        `select id, feature_flags, first_test_call_ok_at
           from public.accounts where id = any($1::uuid[])`,
        [[antiga[0]!.id, nova[0]!.id]],
      )

      expect(estados).toHaveLength(2)
      for (const estado of estados) {
        expect({ id: estado.id, feature_flags: estado.feature_flags }).toEqual({
          id: estado.id,
          feature_flags: { real_dialing: true },
        })
        // Ligar a bandeira não libera sozinho: nenhuma das duas fez a ligação.
        expect(estado.first_test_call_ok_at).toBeNull()
      }
    } finally {
      await anterior.encerrar()
    }
  }, 60_000)

  test('neste banco, a conta do cenário nasceu com a bandeira ligada e o portão fechado', async () => {
    await banco.comoServico()
    const { rows } = await banco.sql.query<{ id: string }>(
      `insert into public.accounts (name, timezone) values ('Recém-chegada', $1) returning id`,
      [SAO_PAULO],
    )
    const { rows: estado } = await banco.sql.query<{
      feature_flags: unknown
      first_test_call_ok_at: Date | null
    }>('select feature_flags, first_test_call_ok_at from public.accounts where id = $1', [
      rows[0]!.id,
    ])

    expect(estado[0]).toEqual({ feature_flags: { real_dialing: true }, first_test_call_ok_at: null })
  })
})

describe('com a bandeira desligada, o portão fecha de verdade', () => {
  const FORA_DA_LISTA = ['+5511988887777', '+5521977776666', '+5531966665555']

  test('nem o dono da conta liga para número fora da lista, e cada tentativa fica registrada', async () => {
    // A ligação de teste já feita: só a bandeira segura o portão.
    await definirPortao({ bandeira: false, primeiraLigacao: '2026-09-22T15:00:00Z' })

    for (const telefone of FORA_DA_LISTA) {
      await banco.comoServico()
      const { rows } = await banco.sql.query<Decisao>(
        `select allowed, reason, dados
           from public.guard_dial(
             p_account_id => $1::uuid,
             p_phone_e164 => $2::text,
             p_actor => 'user',
             p_actor_id => $3::uuid,
             p_source => 'manual',
             p_bypass => $4::text[],
             p_instante => $5::timestamptz
           )`,
        [contaId, telefone, operadorId, TUDO_NO_BYPASS, QUARTA_14H],
      )
      expect({ telefone, allowed: rows[0]!.allowed, reason: rows[0]!.reason }).toEqual({
        telefone,
        allowed: false,
        reason: 'real_dialing_gate',
      })
    }

    await banco.comoServico()
    const { rows: tentativas } = await banco.sql.query<{
      phone_e164: string
      outcome: string
      actor: string
      actor_id: string
      call_id: string | null
    }>(
      `select phone_e164, outcome, actor, actor_id, call_id
         from public.call_attempts where account_id = $1 order by phone_e164`,
      [contaId],
    )
    expect(tentativas).toEqual(
      [...FORA_DA_LISTA].sort().map((telefone) => ({
        phone_e164: telefone,
        outcome: 'real_dialing_gate',
        actor: 'user',
        actor_id: operadorId,
        call_id: null,
      })),
    )
  })

  test('a recusa pela borda diz em português o que falta, e oferece o número de teste', async () => {
    await definirPortao({ bandeira: false, primeiraLigacao: '2026-09-22T15:00:00Z' })

    const decisao = await discarPelaBorda(LEAD_REAL)

    if (decisao.ok) throw new Error('era para recusar, e liberou')
    expect(decisao.mensagem).toMatch(/falta a liberação da discagem para lead real/)
    expect(decisao.alternativa).toMatch(/Cadastre este número na lista de teste/)
    expect(decisao.mensagem).not.toMatch(/não permitid/i)
  })

  test('com a bandeira ligada e sem ligação de teste, a alternativa manda fazer a ligação', async () => {
    await definirPortao({ bandeira: true, primeiraLigacao: null })

    const decisao = await discarPelaBorda(LEAD_REAL)

    if (decisao.ok) throw new Error('era para recusar, e liberou')
    expect(decisao.alternativa).toMatch(/Cadastre este número na lista de teste/)
    expect(decisao.alternativa).toMatch(/ou faça uma ligação de teste/)
  })
})
