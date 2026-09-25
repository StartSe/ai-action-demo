// A rediscagem recusada: o bloqueio que nasce dentro da chamada fecha a
// discagem seguinte (RF-805, RF-422, passo 3 da seção 6).
//
// O bloqueio dentro da chamada é metade do critério. A outra metade é a
// próxima discagem para o mesmo número não sair, e é essa que a referência
// não cumpre para a pessoa errada: lá `wrong_number` existe no mapeamento de
// resultado e não impede nova discagem. Este arquivo percorre o caminho
// inteiro, sem atalho em nenhuma das pontas:
//
// 1. **A ferramenta de verdade grava.** `criarToolDnc` roda sobre o esqueleto,
//    com leitura e escrita implementadas sobre o PGlite pelas mesmas consultas
//    e RPCs de `tool-dnc/index.ts` (`bloquear_numero_pela_ferramenta`,
//    `criar_excecao`). Inserir a linha de `dnc_entries` à mão provaria a
//    guarda, e não que o que a ferramenta escreve é o que a guarda lê.
// 2. **A guarda de verdade recusa.** `guardarDiscagem`, o módulo que
//    `call-place` usa, chama `guard_dial` por uma porta sobre o PGlite. A
//    frase e a alternativa saem dele, e o teste varre as duas atrás do código
//    que as gerou.
// 3. **A recusa vira linha em `call_attempts`** com `dnc_active` (RF-406).
// 4. **Os dois lados.** Bloqueio removido volta a liberar, e bloqueio de outra
//    conta não recusa nesta. Sem o primeiro, "recusa" passaria valendo para
//    todo número e a asserção não teria dente; sem o segundo, o bloqueio seria
//    global.
//
// A guarda é da F2 e esta história não a reescreve. O primeiro teste confere
// que `guard_dial` existe no esquema; se um dia ela sumir, é ele que cai com o
// nome certo, antes dos casos que dependem dela.
//
// Referência: migrações 20260924130000_janela_e_numero_de_teste.sql (a versão
// vigente de `guard_dial`) e 20260924180000_bloqueio_pela_ferramenta.sql,
// docs/PRD-implementacao.md seções 4.3, 5 e 6, docs/PRD.md RF-406, RF-422 e
// RF-805.

import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'

import {
  guardarDiscagem,
  type DecisaoDaGuarda,
  type DiscagemRecusada,
  type PortaDeGuarda,
  type RespostaDaGuarda,
} from '../../supabase/functions/_shared/discagem/guarda.ts'
import type {
  AmbienteDaFerramenta,
  ChamadaDaFerramenta,
  RespostaDaFerramenta,
} from '../../supabase/functions/_shared/tools/esqueleto.ts'
import { derivarSegredo } from '../../supabase/functions/_shared/tools/segredo.ts'
import {
  criarToolDnc,
  type EscritaDoDnc,
  type LeituraDoDnc,
} from '../../supabase/functions/tool-dnc/bloqueio.ts'
import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

const SAO_PAULO = 'America/Sao_Paulo'
const CHAVE = 'chave-de-ferramentas-da-rediscagem'
/** Quarta, 11h em São Paulo: a ferramenta grava neste instante. */
const DURANTE_A_CHAMADA = Date.UTC(2026, 8, 23, 14, 0, 0)
/** A mesma quarta, 15h em São Paulo: a rediscagem, bem depois do intervalo mínimo. */
const REDISCAGEM = '2026-09-23T18:00:00.000Z'

/** O número de quem atendeu, o mesmo nas duas contas. */
const DESTINO = '+5511977770123'

/**
 * Códigos que existem só do lado de quem programa. Nenhum deles pode aparecer
 * na frase ou na alternativa que a tela mostra.
 */
const CODIGOS_TECNICOS = [
  'dnc_active',
  'dnc_entries',
  'guard_dial',
  'call_attempts',
  'numero_bloqueado',
  'wrong_number',
  'lead_request',
  'tool-dnc',
]

interface Conta {
  readonly id: string
  readonly leadId: string
  readonly operadorId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta
/** O que `guard_dial` devolveu na última consulta, antes da tradução. */
let ultimaResposta: RespostaDaGuarda | null = null
let sequenciaDeConversas = 0

async function criarConta(nome: string, dominio: string): Promise<Conta> {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ id: string }>(
    'insert into public.accounts (name, timezone) values ($1, $2) returning id',
    [nome, SAO_PAULO],
  )
  const id = rows[0]!.id
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operadora')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role) values ($1, $2, 'operator')`,
    [id, operadorId],
  )
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source)
     values ($1, 'Lead da rediscagem', $2, 'cenario') returning id`,
    [id, DESTINO],
  )
  await banco.sql.query(
    `insert into public.phone_lines (account_id, e164, label)
     values ($1, $2, 'Linha da rediscagem')`,
    [id, dominio === 'a.test' ? '+5511400000701' : '+5511400000702'],
  )
  return { id, leadId: leads[0]!.id, operadorId }
}

/** Uma chamada feita ao destino, com a conversa que a ferramenta vai citar. */
async function chamadaFeita(conta: Conta): Promise<{ conversa: string; chamada: ChamadaDaFerramenta }> {
  await banco.comoServico()
  sequenciaDeConversas += 1
  const conversa = `conv_rediscagem_${sequenciaDeConversas}`
  const { rows } = await banco.sql.query<ChamadaDaFerramenta>(
    `insert into public.calls
       (account_id, lead_id, purpose, direction, idempotency_key, provider_conversation_id,
        from_number, to_number)
     values ($1, $2, 'discovery', 'outbound', $3, $3, '+5511400000701', $4)
     returning id, account_id, purpose, direction, lead_id`,
    [conta.id, conta.leadId, conversa, DESTINO],
  )
  return { conversa, chamada: rows[0]! }
}

/**
 * `tool-dnc` sobre o PGlite, com as consultas e os RPCs do `index.ts` dela.
 * O esqueleto roda inteiro: segredo, conversa, propósito, leitura e efeitos.
 */
async function sarahBloqueia(conta: Conta, corpo: Record<string, unknown>): Promise<RespostaDaFerramenta> {
  const { conversa } = await chamadaFeita(conta)

  const leitura: LeituraDoDnc = {
    async numerosDaChamada(contaId, chamadaId) {
      const { rows } = await banco.sql.query<{ de: string | null; para: string | null; do_lead: string | null }>(
        `select c.from_number as de, c.to_number as para, l.phone_e164 as do_lead
           from public.calls c
           left join public.leads l on l.id = c.lead_id and l.account_id = c.account_id
          where c.account_id = $1 and c.id = $2`,
        [contaId, chamadaId],
      )
      const linha = rows[0]
      return { de: linha?.de ?? null, para: linha?.para ?? null, doLead: linha?.do_lead ?? null }
    },
    async bloqueioVigente(contaId, telefone) {
      const { rows } = await banco.sql.query<{ created_at: Date }>(
        `select created_at from public.dnc_entries
          where account_id = $1 and phone_e164 = $2 and removed_at is null`,
        [contaId, telefone],
      )
      return rows[0] ? rows[0].created_at.toISOString() : null
    },
  }

  const escrita: EscritaDoDnc = {
    async bloquear(pedido) {
      const { rows } = await banco.sql.query<{ blocked_at: Date; criado: boolean }>(
        `select * from public.bloquear_numero_pela_ferramenta($1, $2, $3, $4, $5, $6)`,
        [pedido.contaId, pedido.telefone, pedido.origem, pedido.motivo, pedido.notas, pedido.instante],
      )
      return { blockedAt: rows[0]!.blocked_at.toISOString(), criado: rows[0]!.criado }
    },
    async abrirItemNaFila(item) {
      await banco.sql.query(
        `select public.criar_excecao($1, 'dnc_requested', 'baixa', $2, $3, $4::jsonb)`,
        [item.contaId, item.chamadaId, item.leadId, JSON.stringify(item.contexto)],
      )
    },
  }

  const ambiente: AmbienteDaFerramenta<EscritaDoDnc> = {
    escrita,
    chaves: { vigente: CHAVE },
    agora: () => DURANTE_A_CHAMADA,
    esperar: () => new Promise<void>(() => undefined),
    log: () => undefined,
    porta: {
      async contasCandidatas() {
        return [conta.id]
      },
      async chamadaDaConversa(contaId, conversaId) {
        const { rows } = await banco.sql.query<ChamadaDaFerramenta>(
          `select id, account_id, purpose, direction, lead_id from public.calls
            where account_id = $1 and provider_conversation_id = $2`,
          [contaId, conversaId],
        )
        return rows[0] ?? null
      },
      async registrarInvocacao() {
        // O registro da invocação não é assunto deste arquivo.
      },
    },
  }

  await banco.comoServico()
  const tratar = criarToolDnc(leitura)
  return tratar(
    { metodo: 'POST', segredo: await derivarSegredo(CHAVE, conta.id), conversa, corpo },
    ambiente,
  )
}

/** A guarda que `call-place` usa, com `guard_dial` por uma porta sobre o PGlite. */
async function rediscar(conta: Conta): Promise<DecisaoDaGuarda> {
  await banco.comoServico()
  const porta: PortaDeGuarda = {
    async guardDial(chamada) {
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
          chamada.p_bypass,
          chamada.p_instante,
        ],
      )
      ultimaResposta = rows[0]!
      return rows[0]!
    },
  }
  return guardarDiscagem(
    {
      contaId: conta.id,
      telefone: DESTINO,
      leadId: conta.leadId,
      ator: 'user',
      atorId: conta.operadorId,
      fonte: 'manual',
      instante: REDISCAGEM,
      fusoDaConta: SAO_PAULO,
    },
    porta,
  )
}

function recusada(decisao: DecisaoDaGuarda): DiscagemRecusada {
  if (decisao.ok) throw new Error('era para recusar, e liberou')
  return decisao
}

async function tentativasDe(conta: Conta) {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ phone_e164: string; outcome: string; attempted_at: Date }>(
    `select phone_e164, outcome, attempted_at from public.call_attempts
      where account_id = $1 order by attempted_at`,
    [conta.id],
  )
  return rows
}

/** A frase e a alternativa não dizem o código técnico que as gerou. */
function semCodigoTecnico(decisao: DiscagemRecusada): void {
  for (const texto of [decisao.mensagem, decisao.alternativa]) {
    expect(texto.trim()).not.toBe('')
    for (const codigo of CODIGOS_TECNICOS) expect(texto).not.toContain(codigo)
    // Qualquer identificador em caixa de cobra (`dnc_since`, `phone_e164`) e
    // qualquer uuid também ficam de fora, e não só os que a lista conhece.
    expect(texto).not.toMatch(/[a-z0-9]+_[a-z0-9_]+/i)
    expect(texto).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i)
  }
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Rediscagem A', 'a.test')
  contaB = await criarConta('Rediscagem B', 'b.test')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

/**
 * Cada teste parte das duas contas no estado da F2: portão fechado com o
 * destino na lista de teste, sem bloqueio, sem tentativa e sem item na fila.
 * Nesse estado a discagem ao destino sai, e é isso que dá dente à recusa.
 */
beforeEach(async () => {
  await banco.comoServico()
  ultimaResposta = null
  for (const conta of [contaA, contaB]) {
    await banco.sql.query('delete from public.exception_items where account_id = $1', [conta.id])
    await banco.sql.query('delete from public.call_attempts where account_id = $1', [conta.id])
    await banco.sql.query('delete from public.calls where account_id = $1', [conta.id])
    await banco.sql.query('delete from public.dnc_entries where account_id = $1', [conta.id])
    await banco.sql.query('delete from public.account_test_numbers where account_id = $1', [conta.id])
    await banco.sql.query(
      `insert into public.account_test_numbers (account_id, phone_e164, label)
       values ($1, $2, 'Número de teste')`,
      [conta.id, DESTINO],
    )
  }
})

// A guarda existe -------------------------------------------------------------------

test('guard_dial existe no esquema: a guarda é da F2 e esta história só a chama', async () => {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ existe: boolean }>(
    `select exists (
       select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'guard_dial'
     ) as existe`,
  )
  expect(rows[0]!.existe).toBe(true)
})

// O ponto de partida ---------------------------------------------------------------

test('sem bloqueio, a discagem ao destino sai: é o estado que a recusa contradiz', async () => {
  const decisao = await rediscar(contaA)

  expect(decisao.ok).toBe(true)
  expect((await tentativasDe(contaA)).map((t) => t.outcome)).toEqual(['placed'])
})

// O pedido do interlocutor ---------------------------------------------------------

test('o bloqueio que tool-dnc grava recusa a rediscagem, com frase e alternativa', async () => {
  const resposta = await sarahBloqueia(contaA, { reason: 'lead_request', notes: 'não quer mais ligação' })
  expect(resposta.status).toBe(200)
  expect(resposta.corpo.ok).toBe(true)

  const decisao = recusada(await rediscar(contaA))

  expect(ultimaResposta).toMatchObject({ allowed: false, reason: 'dnc_active' })
  expect(ultimaResposta!.dados).toMatchObject({ dnc_source: 'lead_request' })
  expect(decisao.motivo).toBe('numero_bloqueado')
  expect(decisao.telefone).toBe(DESTINO)
  expect(decisao.mensagem).toMatch(/não perturbe/)
  expect(decisao.alternativa).toMatch(/Bloqueios/)
  semCodigoTecnico(decisao)
})

test('a tentativa recusada grava call_attempts com o motivo (RF-406)', async () => {
  await sarahBloqueia(contaA, { reason: 'lead_request' })

  await rediscar(contaA)

  const tentativas = await tentativasDe(contaA)
  expect(tentativas).toHaveLength(1)
  expect(tentativas[0]).toMatchObject({ phone_e164: DESTINO, outcome: 'dnc_active' })
  expect(tentativas[0]!.attempted_at.toISOString()).toBe(REDISCAGEM)
})

// A pessoa errada ------------------------------------------------------------------

test('pessoa errada: o bloqueio com source wrong_number recusa a rediscagem (RF-422)', async () => {
  const resposta = await sarahBloqueia(contaA, { reason: 'wrong_number' })
  expect(resposta.corpo.ok).toBe(true)

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ source: string }>(
    'select source from public.dnc_entries where account_id = $1 and removed_at is null',
    [contaA.id],
  )
  expect(rows.map((linha) => linha.source)).toEqual(['wrong_number'])

  const decisao = recusada(await rediscar(contaA))

  expect(ultimaResposta!.reason).toBe('dnc_active')
  expect(ultimaResposta!.dados).toMatchObject({ dnc_source: 'wrong_number' })
  expect(decisao.motivo).toBe('numero_bloqueado')
  semCodigoTecnico(decisao)
  expect((await tentativasDe(contaA)).map((t) => t.outcome)).toEqual(['dnc_active'])
})

test('campanha não pula o bloqueio da pessoa errada: o passo 3 não é pulável', async () => {
  await sarahBloqueia(contaA, { reason: 'wrong_number' })

  await banco.comoServico()
  const { rows } = await banco.sql.query<{ allowed: boolean; reason: string }>(
    `select allowed, reason from public.guard_dial(
       p_account_id => $1::uuid, p_phone_e164 => $2::text, p_lead_id => $3::uuid,
       p_actor => 'system', p_actor_id => null, p_source => 'camp', p_campaign_id => null,
       p_bypass => array['min_interval', 'daily_per_number', 'dnc_active'],
       p_instante => $4::timestamptz)`,
    [contaA.id, DESTINO, contaA.leadId, REDISCAGEM],
  )
  expect(rows[0]).toEqual({ allowed: false, reason: 'dnc_active' })
})

// Os dois lados --------------------------------------------------------------------

test('bloqueio removido volta a permitir a discagem', async () => {
  await sarahBloqueia(contaA, { reason: 'wrong_number' })
  expect((await rediscar(contaA)).ok).toBe(false)

  await banco.comoServico()
  await banco.sql.query(
    `update public.dnc_entries
        set removed_at = now(), removed_by = $2, removal_reason = 'era a pessoa certa, com outro nome'
      where account_id = $1 and removed_at is null`,
    [contaA.id, contaA.operadorId],
  )

  const decisao = await rediscar(contaA)

  expect(decisao.ok).toBe(true)
  expect((await tentativasDe(contaA)).map((t) => t.outcome)).toEqual(['dnc_active', 'placed'])
})

test('número bloqueado em outra conta não recusa nesta: o bloqueio é por conta', async () => {
  await sarahBloqueia(contaB, { reason: 'lead_request' })
  expect(recusada(await rediscar(contaB)).motivo).toBe('numero_bloqueado')

  const decisao = await rediscar(contaA)

  expect(decisao.ok).toBe(true)
  expect((await tentativasDe(contaA)).map((t) => t.outcome)).toEqual(['placed'])
})
