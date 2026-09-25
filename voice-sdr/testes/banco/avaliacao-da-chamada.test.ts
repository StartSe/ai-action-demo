// A avaliação automática aplicada ao fim de cada chamada (US-142, RF-313,
// RF-314, RF-909, L-23). `finalizarChamada` roda de verdade com a porta sobre o
// PGlite (`testes/auxiliares/porta-da-finalizacao.ts`).
//
// O que este arquivo prova:
//
// 1. **Os critérios nascem com a conta**, e a semente é `LINHAS_DA_SEMENTE`
//    linha a linha: mudar um lado sem o outro reprova aqui.
// 2. **Classe Configuração**: o admin edita, o operador não, a chave não muda
//    nem para o admin, e a edição entra na trilha com o autor.
// 3. **Cada conta vê só os próprios critérios.**
// 4. **A nota e os itens ficam na chamada**, com o juízo que a retaguarda
//    gravou, e `consent_notice_at` é o instante do turno do aviso aprovado.
// 5. **Critério obrigatório reprovado vira item de fila**, pela chave
//    `avaliacao:<call_id>`.
// 6. **Avaliação não é classificação**: reprovar não move etapa nem muda score.
// 7. **`registrar_avaliacao_automatica` é só de `service_role`.**
//
// Referência: migração 20260929190000_criterios_de_avaliacao.sql.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { finalizarChamada, type PortaDaFinalizacao } from '../../supabase/functions/call-finalize/finalizacao.ts'
import { INICIO_DAS_TRANSCRICOES_EM_SEGUNDOS } from '../../supabase/functions/call-finalize/transcricoes-de-exemplo.ts'
import { LINHAS_DA_SEMENTE } from '../../supabase/functions/_shared/qualificacao/avaliacao.ts'
import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'
import { portaDaFinalizacaoSobreOBanco, type AjustesDaPorta } from '../auxiliares/porta-da-finalizacao.ts'

const SEGREDO = 'segredo-interno-do-teste'
const INICIO_MS = INICIO_DAS_TRANSCRICOES_EM_SEGUNDOS * 1000
const AGORA = new Date(INICIO_MS + 5 * 60 * 1000).toISOString()

interface Conta {
  readonly id: string
  readonly adminId: string
  readonly operadorId: string
  readonly leadId: string
}

let banco: BancoDeTeste
let contaA: Conta
let contaB: Conta
let sequencia = 0

async function criarConta(nome: string, dominio: string, telefone: string): Promise<Conta> {
  const { rows } = await banco.sql.query<{ id: string }>('insert into public.accounts (name) values ($1) returning id', [
    nome,
  ])
  const id = rows[0]!.id
  const adminId = await banco.criarUsuario(`admin@${dominio}`, 'Admin')
  const operadorId = await banco.criarUsuario(`operador@${dominio}`, 'Operador')
  await banco.sql.query(
    `insert into public.account_members (account_id, user_id, role)
     values ($1, $2, 'admin'), ($1, $3, 'operator')`,
    [id, adminId, operadorId],
  )
  const { rows: leads } = await banco.sql.query<{ id: string }>(
    `insert into public.leads (account_id, name, phone_e164, source, score)
     values ($1, 'Marcos Ferreira', $2, 'cenario', 40) returning id`,
    [id, telefone],
  )
  return { id, adminId, operadorId, leadId: leads[0]!.id }
}

async function criteriosDe(conta: Conta) {
  const { rows } = await banco.sql.query<{
    key: string
    label: string
    obrigatorio: boolean
    como: string
    trechos: string[]
    position: number
  }>(
    `select key, label, obrigatorio, como, trechos, position
       from public.evaluation_criteria where account_id = $1 order by position`,
    [conta.id],
  )
  return rows
}

/** A conversa no formato do provedor, com um turno por fala. */
function conversa(falas: readonly { quem: 'agent' | 'user'; texto: string; segundo: number }[]) {
  return {
    conversation_id: 'conv',
    status: 'done',
    has_audio: false,
    transcript: falas.map((f) => ({ role: f.quem, message: f.texto, time_in_call_secs: f.segundo })),
    metadata: { start_time_unix_secs: INICIO_DAS_TRANSCRICOES_EM_SEGUNDOS, call_duration_secs: 60 },
  }
}

/** Abertura com identificação e aviso, no segundo 3. */
const COM_AVISO = conversa([
  { quem: 'agent', texto: 'Oi, Marcos! Aqui é a Sarah, da Fluxo Cargo.', segundo: 1 },
  { quem: 'agent', texto: 'Antes da gente começar: essa ligação é gravada, tudo bem?', segundo: 3 },
  { quem: 'user', texto: 'Tudo bem, pode falar.', segundo: 6 },
  { quem: 'agent', texto: 'Obrigada pelo seu tempo. Até mais!', segundo: 40 },
])

/** A mesma conversa sem o aviso de gravação. */
const SEM_AVISO = conversa([
  { quem: 'agent', texto: 'Oi, Marcos! Aqui é a Sarah, da Fluxo Cargo.', segundo: 1 },
  { quem: 'user', texto: 'Oi, pode falar.', segundo: 6 },
  { quem: 'agent', texto: 'Obrigada pelo seu tempo. Até mais!', segundo: 40 },
])

async function semearChamada(conta: Conta): Promise<string> {
  sequencia += 1
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls
       (account_id, lead_id, purpose, direction, status, provider_conversation_id, idempotency_key, started_at)
     values ($1, $2, 'discovery', 'outbound', 'ringing', $3, $4, $5)
     returning id`,
    [conta.id, conta.leadId, `conv_avaliacao_${sequencia}`, `avaliacao-${sequencia}`, new Date(INICIO_MS).toISOString()],
  )
  return rows[0]!.id
}

/** O que `call-classify` grava quando a finalização o aciona e espera: o juízo do modelo, dublado. */
function retaguarda(juizo: Record<string, boolean>): AjustesDaPorta['acionarClassificacao'] {
  return async (id: string) => {
    const criterios = Object.fromEntries(
      Object.entries(juizo).map(([chave, aprovado]) => [chave, { aprovado, justificativa: 'dublado' }]),
    )
    await banco.sql.query(
      `update public.calls
          set classification = '{"stage_key": null}'::jsonb, classification_source = 'backfill',
              classification_confidence = 0.6, sentiment = 0.2,
              evaluation = $2::jsonb
        where id = $1`,
      [id, JSON.stringify({ criterios, modelo: 'dublado' })],
    )
  }
}

function finalizar(chamadaId: string, porta: PortaDaFinalizacao) {
  return finalizarChamada({ metodo: 'POST', chamadaId, segredoInterno: SEGREDO }, porta, {
    segredoInterno: SEGREDO,
    agora: AGORA,
  })
}

async function chamadaGravada(chamadaId: string) {
  const { rows } = await banco.sql.query<{
    evaluation: { itens?: { criterio: string; aprovado: boolean | null; evidencia: string | null }[] }
    evaluation_score: number | null
    consent_notice_at: string | null
  }>(
    `select evaluation, evaluation_score::float8 as evaluation_score,
            to_json(consent_notice_at) #>> '{}' as consent_notice_at
       from public.calls where id = $1`,
    [chamadaId],
  )
  return rows[0]!
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  contaA = await criarConta('Fluxo Cargo', 'fluxo.test', '+5511990000301')
  contaB = await criarConta('Rota Norte', 'rota.test', '+5511990000302')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.exception_items')
  await banco.sql.query('delete from public.calls')
  // A semente de volta, pelo mesmo caminho do gatilho.
  await banco.sql.query('delete from public.evaluation_criteria')
  for (const conta of [contaA, contaB]) {
    await banco.sql.query('select public.semear_criterios_de_avaliacao_para($1)', [conta.id])
  }
})

describe('os critérios da conta', () => {
  test('nascem com a conta, e a semente é LINHAS_DA_SEMENTE linha a linha', async () => {
    const nova = await criarConta('Conta Nova', 'nova.test', '+5511990000303')
    expect(await criteriosDe(nova)).toEqual(LINHAS_DA_SEMENTE.map((linha) => ({ ...linha, trechos: [...linha.trechos] })))
  })

  test('a semente está marcada como provisória, com a pergunta 1 citada', async () => {
    const { rows } = await banco.sql.query<{ comentario: string }>(
      "select obj_description('public.evaluation_criteria'::regclass, 'pg_class') as comentario",
    )
    expect(rows[0]!.comentario).toMatch(/provisória/)
    expect(rows[0]!.comentario).toMatch(/pergunta 1/)
  })

  test('o admin edita o rótulo, e a edição entra na trilha com o autor', async () => {
    await banco.comoUsuario(contaA.adminId)
    const { rows } = await banco.sql.query(
      `update public.evaluation_criteria set label = 'Disse que grava a ligação'
        where account_id = $1 and key = 'aviso_gravacao' returning 1`,
      [contaA.id],
    )
    expect(rows).toHaveLength(1)

    await banco.comoServico()
    const { rows: trilha } = await banco.sql.query<{ actor_id: string; target_type: string }>(
      `select actor_id, target_type from public.audit_log
        where account_id = $1 and target_type = 'evaluation_criteria' order by created_at desc limit 1`,
      [contaA.id],
    )
    expect(trilha).toEqual([{ actor_id: contaA.adminId, target_type: 'evaluation_criteria' }])
  })

  test('o operador não edita nem cria critério', async () => {
    await banco.comoUsuario(contaA.operadorId)
    const { rows } = await banco.sql.query(
      `update public.evaluation_criteria set obrigatorio = false
        where account_id = $1 and key = 'aviso_gravacao' returning 1`,
      [contaA.id],
    )
    expect(rows).toHaveLength(0)
    await expect(
      banco.sql.query(
        `insert into public.evaluation_criteria (account_id, key, label, como, position)
         values ($1, 'novo', 'Novo', 'modelo', 9)`,
        [contaA.id],
      ),
    ).rejects.toThrow(/row-level security/i)
    await banco.comoServico()
    expect((await criteriosDe(contaA)).find((c) => c.key === 'aviso_gravacao')?.obrigatorio).toBe(true)
  })

  test('a chave não muda, nem para o admin', async () => {
    await banco.comoUsuario(contaA.adminId)
    await expect(
      banco.sql.query(
        `update public.evaluation_criteria set key = 'aviso' where account_id = $1 and key = 'aviso_gravacao'`,
        [contaA.id],
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await banco.comoServico()
  })

  test('critério por trecho sem trecho é recusado', async () => {
    await expect(
      banco.sql.query(
        `insert into public.evaluation_criteria (account_id, key, label, como, position)
         values ($1, 'sem_trecho', 'Sem trecho', 'trecho', 9)`,
        [contaA.id],
      ),
    ).rejects.toThrow(/evaluation_criteria_trecho_com_trechos/)
  })

  test('cada conta vê os próprios critérios e nenhum da outra', async () => {
    await banco.comoUsuario(contaA.operadorId)
    const { rows } = await banco.sql.query<{ account_id: string }>(
      'select distinct account_id from public.evaluation_criteria',
    )
    expect(rows).toEqual([{ account_id: contaA.id }])

    await banco.comoUsuario(contaB.adminId)
    const { rows: deB } = await banco.sql.query<{ account_id: string }>(
      'select distinct account_id from public.evaluation_criteria',
    )
    expect(deB).toEqual([{ account_id: contaB.id }])
    await banco.comoServico()
  })
})

describe('a avaliação na finalização', () => {
  test('a nota e os itens ficam na chamada, e consent_notice_at é o turno do aviso aprovado', async () => {
    const chamadaId = await semearChamada(contaA)
    const resposta = await finalizar(
      chamadaId,
      portaDaFinalizacaoSobreOBanco(banco.sql, COM_AVISO, {
        acionarClassificacao: retaguarda({ nada_fora_da_base: true, nunca_afirmar: true }),
      }),
    )
    expect(resposta.status).toBe(200)

    const gravada = await chamadaGravada(chamadaId)
    const porCriterio = new Map((gravada.evaluation.itens ?? []).map((item) => [item.criterio, item.aprovado]))
    expect(porCriterio.get('aviso_gravacao')).toBe(true)
    expect(porCriterio.get('identificacao_honesta')).toBe(true)
    expect(porCriterio.get('nada_fora_da_base')).toBe(true)
    expect(porCriterio.get('nunca_afirmar')).toBe(true)
    expect(gravada.evaluation_score).toBe(10)
    expect(new Date(gravada.consent_notice_at!).toISOString()).toBe(new Date(INICIO_MS + 3_000).toISOString())
    // O juízo do modelo continua lá: a avaliação mescla, não troca a coluna.
    expect(gravada.evaluation).toHaveProperty('criterios')
    expect(await itensDaFila(contaA)).toEqual([])
  })

  test('obrigatório reprovado zera a nota e vira item de fila, sem mover etapa nem mudar score', async () => {
    const chamadaId = await semearChamada(contaA)
    const antes = await leadDe(contaA)

    const resposta = await finalizar(
      chamadaId,
      portaDaFinalizacaoSobreOBanco(banco.sql, SEM_AVISO, {
        acionarClassificacao: retaguarda({ nada_fora_da_base: true }),
      }),
    )
    expect(resposta.status).toBe(200)

    const gravada = await chamadaGravada(chamadaId)
    expect(gravada.evaluation.itens?.find((i) => i.criterio === 'aviso_gravacao')?.aprovado).toBe(false)
    expect(gravada.evaluation_score).toBe(0)
    expect(gravada.consent_notice_at).toBeNull()
    expect(await itensDaFila(contaA)).toEqual([{ kind: 'avaliacao_reprovada', deduplicacao_key: `avaliacao:${chamadaId}` }])

    // Avaliação não é classificação: a retaguarda dublada não escreve no lead,
    // e a avaliação também não.
    expect(await leadDe(contaA)).toEqual(antes)
  })

  test('a conta que desliga a obrigatoriedade do aviso não zera a nota', async () => {
    await banco.sql.query(
      "update public.evaluation_criteria set obrigatorio = false where account_id = $1 and key = 'aviso_gravacao'",
      [contaA.id],
    )
    const chamadaId = await semearChamada(contaA)
    await finalizar(
      chamadaId,
      portaDaFinalizacaoSobreOBanco(banco.sql, SEM_AVISO, {
        acionarClassificacao: retaguarda({ nada_fora_da_base: true }),
      }),
    )
    // Dois aprovados (identificação e base) de três decididos.
    expect((await chamadaGravada(chamadaId)).evaluation_score).toBe(6.7)
  })

  test('cada conta é avaliada pelos próprios critérios', async () => {
    await banco.sql.query(
      `insert into public.evaluation_criteria (account_id, key, label, obrigatorio, como, trechos, position)
       values ($1, 'falou_da_planilha', 'Falou da planilha', false, 'trecho', array['planilha'], 5)`,
      [contaB.id],
    )
    const naA = await semearChamada(contaA)
    const naB = await semearChamada(contaB)
    for (const id of [naA, naB]) {
      await finalizar(
        id,
        portaDaFinalizacaoSobreOBanco(banco.sql, COM_AVISO, {
          acionarClassificacao: retaguarda({ nada_fora_da_base: true }),
        }),
      )
    }
    const chaves = async (id: string) => (await chamadaGravada(id)).evaluation.itens?.map((i) => i.criterio) ?? []
    expect(await chaves(naA)).not.toContain('falou_da_planilha')
    expect(await chaves(naB)).toContain('falou_da_planilha')
  })
})

describe('registrar_avaliacao_automatica', () => {
  test('só service_role executa', async () => {
    const { rows } = await banco.sql.query<{ grantee: string }>(
      `select grantee from information_schema.routine_privileges
        where routine_schema = 'public' and routine_name = 'registrar_avaliacao_automatica' order by grantee`,
    )
    expect(rows.map((r) => r.grantee).filter((g) => g !== 'postgres')).toEqual(['service_role'])
  })

  test('nota nula não apaga a gravada, e os itens mesclam sem apagar as medições', async () => {
    const chamadaId = await semearChamada(contaA)
    await banco.sql.query(
      `update public.calls set evaluation = '{"medicoes": {"x": {"falas": 3}}}'::jsonb, evaluation_score = 7
        where id = $1`,
      [chamadaId],
    )
    await banco.sql.query('select public.registrar_avaliacao_automatica($1, $2, $3::jsonb, null)', [
      contaA.id,
      chamadaId,
      JSON.stringify([{ criterio: 'aviso_gravacao', aprovado: true, evidencia: 'gravada' }]),
    ])
    const gravada = await chamadaGravada(chamadaId)
    expect(gravada.evaluation_score).toBe(7)
    expect(gravada.evaluation).toEqual({
      medicoes: { x: { falas: 3 } },
      itens: [{ criterio: 'aviso_gravacao', aprovado: true, evidencia: 'gravada' }],
    })
  })

  test('chamada de outra conta não é escrita', async () => {
    const chamadaId = await semearChamada(contaA)
    const { rows } = await banco.sql.query<{ escrita: boolean }>(
      "select public.registrar_avaliacao_automatica($1, $2, '[]'::jsonb, 5) as escrita",
      [contaB.id, chamadaId],
    )
    expect(rows[0]!.escrita).toBe(false)
  })
})

async function itensDaFila(conta: Conta) {
  const { rows } = await banco.sql.query<{ kind: string; deduplicacao_key: string }>(
    'select kind, deduplicacao_key from public.exception_items where account_id = $1 order by kind',
    [conta.id],
  )
  return rows
}

async function leadDe(conta: Conta) {
  const { rows } = await banco.sql.query<{ score: number | null; stage_id: string | null }>(
    'select score, stage_id from public.leads where id = $1',
    [conta.leadId],
  )
  return rows[0]!
}
