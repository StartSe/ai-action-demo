// O diagnóstico da chamada no banco (call-diagnose).
//
// O que este arquivo prova:
//
// 1. Classe Servidor: membro lê, ninguém escreve pelo cliente — nem o dono. A
//    conta vizinha e a sessão anônima veem zero, e o catálogo só tem SELECT.
// 2. Aplicar grava pelo caminho da tela de cada nível, com o motivo na trilha
//    e quem aprovou dentro da proposta: identidade e voz em agents, roteiro e
//    jeito da casa numa versão nova em rascunho, política pelo RPC de
//    discagem, aviso pelo RPC de privacidade. Nada é publicado.
// 3. Todo alvo da lista fechada de `call-diagnose/propostas.ts` tem caminho de
//    aplicação aqui: alvo novo lá sem ramo aqui reprova.
// 4. O antes é conferido (SD001), a decisão é única (55000), e aplicar exige
//    admin — o aviso de gravação exige dono, pela regra do RPC dele.
// 5. Só `authenticated` executa os dois RPCs.
//
// Referência: migração 20261002100000_diagnostico_da_chamada.sql.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { ALVOS } from '../../supabase/functions/call-diagnose/propostas.ts'
import { criarBancoDeTeste, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'

let banco: BancoDeTeste
let contaId: string
let donoId: string
let adminId: string
let operadorId: string
let outraContaId: string
let outroDonoId: string
let chamadaId: string
let outraChamadaId: string

const PRIMEIRA_FALA = 'Oi, {nome_do_lead}! Aqui é a Sarah.'
const MOTIVO = () => `Aplicado do diagnóstico da chamada ${chamadaId}`

async function criarConta(nome: string, email: string) {
  const { rows } = await banco.sql.query<{ id: string }>('insert into public.accounts (name) values ($1) returning id', [nome])
  const id = rows[0]!.id
  const usuarioId = await banco.criarUsuario(email, nome)
  await banco.sql.query('insert into public.account_members (account_id, user_id, role) values ($1, $2, $3)', [
    id,
    usuarioId,
    'owner',
  ])
  return { id, donoId: usuarioId }
}

async function criarChamada(conta: string, chave: string): Promise<string> {
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.calls (account_id, purpose, direction, idempotency_key, status, end_reason, duration_sec, provider_conversation_id)
     values ($1, 'discovery', 'outbound', $2, 'ended', 'completed', 9, 'conv:' || $2)
     returning id`,
    [conta, chave],
  )
  return rows[0]!.id
}

interface PropostaDeTeste {
  id?: string
  alvo: string
  antes: unknown
  depois: unknown
  estado?: string
}

async function criarDiagnostico(propostas: readonly PropostaDeTeste[], conta = contaId, chamada = chamadaId) {
  await banco.comoServico()
  const lista = propostas.map((proposta, indice) => ({
    id: proposta.id ?? `p${indice + 1}`,
    titulo: `Proposta ${indice + 1}`,
    razao: 'A ligação mostrou.',
    origem: 'modelo',
    estado: proposta.estado ?? 'pendente',
    alvo: proposta.alvo,
    antes: proposta.antes,
    depois: proposta.depois,
  }))
  const { rows } = await banco.sql.query<{ id: string }>(
    `insert into public.call_diagnoses (account_id, call_id, purpose, findings, model_status, proposals, created_by)
     values ($1, $2, 'discovery', $3::jsonb, 'nao_conectado', $4::jsonb, $5)
     returning id`,
    [conta, chamada, JSON.stringify([{ codigo: 'encerrada_por_end_call_cedo' }]), JSON.stringify(lista), donoId],
  )
  return rows[0]!.id
}

async function aplicar(usuario: string, diagnosticoId: string, proposta = 'p1') {
  await banco.comoUsuario(usuario)
  try {
    const { rows } = await banco.sql.query<{ r: Record<string, unknown> }>(
      'select public.aplicar_proposta_do_diagnostico($1, $2) as r',
      [diagnosticoId, proposta],
    )
    return rows[0]!.r
  } finally {
    await banco.comoServico()
  }
}

async function codigoDaRecusa(executar: () => Promise<unknown>): Promise<string | null> {
  try {
    await executar()
    return null
  } catch (erro) {
    await banco.comoServico()
    return (erro as { code?: string }).code ?? String(erro)
  }
}

async function propostaGravada(diagnosticoId: string, proposta = 'p1') {
  const { rows } = await banco.sql.query<{ p: Record<string, unknown> }>(
    `select item as p from public.call_diagnoses, jsonb_array_elements(proposals) as item
      where id = $1 and item ->> 'id' = $2`,
    [diagnosticoId, proposta],
  )
  return rows[0]!.p
}

async function motivosDaTrilha(tipo: string): Promise<string[]> {
  const { rows } = await banco.sql.query<{ reason: string | null }>(
    'select reason from public.audit_log where account_id = $1 and target_type = $2 order by created_at',
    [contaId, tipo],
  )
  return rows.map((linha) => linha.reason ?? '')
}

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  await banco.comoServico()

  const a = await criarConta('Fretes do Vale', 'dono@fretes.test')
  contaId = a.id
  donoId = a.donoId
  adminId = await banco.criarUsuario('admin@fretes.test', 'Admin')
  operadorId = await banco.criarUsuario('operador@fretes.test', 'Operador')
  await banco.sql.query('insert into public.account_members (account_id, user_id, role) values ($1, $2, $3), ($1, $4, $5)', [
    contaId,
    adminId,
    'admin',
    operadorId,
    'operator',
  ])

  const b = await criarConta('Metalúrgica Sul', 'dono@metal.test')
  outraContaId = b.id
  outroDonoId = b.donoId

  chamadaId = await criarChamada(contaId, 'manual:diag:1')
  outraChamadaId = await criarChamada(outraContaId, 'manual:diag:2')
}, 120_000)

afterAll(async () => {
  await banco?.encerrar()
})

beforeEach(async () => {
  await banco.comoServico()
  await banco.sql.query('delete from public.call_diagnoses')
  // As versões nascem de gatilho: a limpeza apaga e recria a de nascença, para
  // o antes de cada teste ser o roteiro em branco da conta nova.
  await banco.sql.query('delete from public.playbook_versions where account_id = $1', [contaId])
  await banco.sql.query(
    'insert into public.playbook_versions (account_id, playbook_id) select account_id, id from public.playbooks where account_id = $1',
    [contaId],
  )
  await banco.sql.query('delete from public.agents where account_id = $1', [contaId])
  await banco.sql.query(
    `insert into public.agents (account_id, name, company_name, first_message, offer_line, never_claim, voice_settings)
     values ($1, 'Sarah', 'Fretes do Vale', $2, 'Rastreamento de frota.', '{}', '{"stability":0.5,"note":"x"}'::jsonb)`,
    [contaId, PRIMEIRA_FALA],
  )
  await banco.sql.query(
    `update public.account_settings
        set max_duration_seconds = 600, min_interval_minutes = 60, daily_attempts_per_number = 3,
            daily_calls_cap = 200, max_concurrent = 2, recording_notice_text = null
      where account_id = $1`,
    [contaId],
  )
})

describe('classe Servidor', () => {
  test('membro lê; a conta vizinha e o anônimo não veem nada', async () => {
    await criarDiagnostico([])
    await banco.comoUsuario(operadorId)
    expect((await banco.sql.query('select id from public.call_diagnoses')).rows).toHaveLength(1)
    await banco.comoUsuario(outroDonoId)
    expect((await banco.sql.query('select id from public.call_diagnoses')).rows).toHaveLength(0)
    await banco.comoAnonimo()
    expect((await banco.sql.query('select id from public.call_diagnoses')).rows).toHaveLength(0)
    await banco.comoServico()
  })

  test('nem o dono escreve pelo cliente, e o catálogo só tem a política de leitura', async () => {
    const diagnosticoId = await criarDiagnostico([{ alvo: 'republicar', antes: null, depois: null }])
    await banco.comoUsuario(donoId)
    const insercao = await codigoDaRecusa(() =>
      banco.sql.query(
        `insert into public.call_diagnoses (account_id, call_id, purpose, model_status)
         values ($1, $2, 'discovery', 'nao_conectado')`,
        [contaId, chamadaId],
      ),
    )
    expect(insercao).toBe('42501')

    await banco.comoUsuario(donoId)
    const forja = await banco.sql.query(
      `update public.call_diagnoses set proposals = '[]'::jsonb where id = $1 returning id`,
      [diagnosticoId],
    )
    expect(forja.rows).toHaveLength(0)
    await banco.comoServico()

    const { rows } = await banco.sql.query<{ cmd: string }>(
      "select cmd from pg_policies where schemaname = 'public' and tablename = 'call_diagnoses'",
    )
    expect(rows.map((linha) => linha.cmd)).toEqual(['SELECT'])
  })

  test('texto do modelo e estado do modelo andam juntos', async () => {
    const recusa = await codigoDaRecusa(() =>
      banco.sql.query(
        `insert into public.call_diagnoses (account_id, call_id, purpose, model_status)
         values ($1, $2, 'discovery', 'ok')`,
        [contaId, chamadaId],
      ),
    )
    expect(recusa).toBe('23514')
  })

  test('apagar a chamada leva o diagnóstico junto', async () => {
    const chamada = await criarChamada(contaId, 'manual:diag:apagar')
    await criarDiagnostico([], contaId, chamada)
    await banco.sql.query('delete from public.calls where id = $1', [chamada])
    const { rows } = await banco.sql.query('select id from public.call_diagnoses where call_id = $1', [chamada])
    expect(rows).toHaveLength(0)
  })
})

describe('aplicar, nível a nível', () => {
  test('identidade: a primeira fala muda em agents, com o motivo na trilha e o aprovador na proposta', async () => {
    const novo = 'Oi, {nome_do_lead}! Tudo bem? Aqui é a Sarah.'
    const diagnosticoId = await criarDiagnostico([{ alvo: 'identidade.primeira_fala', antes: PRIMEIRA_FALA, depois: novo }])

    expect(await aplicar(adminId, diagnosticoId)).toMatchObject({ alvo: 'identidade.primeira_fala', estado: 'aplicada' })

    const { rows } = await banco.sql.query<{ first_message: string }>(
      'select first_message from public.agents where account_id = $1',
      [contaId],
    )
    expect(rows[0]?.first_message).toBe(novo)
    expect(await motivosDaTrilha('agents')).toContain(MOTIVO())
    expect(await propostaGravada(diagnosticoId)).toMatchObject({ estado: 'aplicada', decidida_por: adminId })
  })

  test('identidade: a lista do que a Sarah nunca afirma vira o array da coluna', async () => {
    const diagnosticoId = await criarDiagnostico([
      { alvo: 'identidade.nunca_afirmar', antes: [], depois: ['preço fechado', 'prazo de entrega'] },
    ])
    await aplicar(adminId, diagnosticoId)
    const { rows } = await banco.sql.query<{ never_claim: string[] }>(
      'select never_claim from public.agents where account_id = $1',
      [contaId],
    )
    expect(rows[0]?.never_claim).toEqual(['preço fechado', 'prazo de entrega'])
  })

  test('roteiro: nasce uma versão em rascunho, com a camada 3 copiada, e nada é publicado', async () => {
    const { rows: antes } = await banco.sql.query<{ body_script: string; body_house: string; publicadas: number }>(
      `select v.body_script, v.body_house,
              (select count(*)::int from public.playbook_versions x
                where x.account_id = $1 and x.status = 'published') as publicadas
         from public.playbook_versions v join public.playbooks p on p.id = v.playbook_id
        where p.account_id = $1 and p.purpose = 'discovery'
        order by v.version desc limit 1`,
      [contaId],
    )
    const vigente = antes[0]!
    const diagnosticoId = await criarDiagnostico([
      { alvo: 'roteiro.discovery', antes: vigente.body_script, depois: '1. Cumprimente.\n2. Siga depois do "pode sim".' },
    ])

    const resultado = await aplicar(adminId, diagnosticoId)
    expect(resultado).toMatchObject({ alvo: 'roteiro.discovery', proposito: 'discovery' })

    const { rows } = await banco.sql.query<{
      status: string
      body_script: string
      body_house: string
      change_note: string
      author_id: string
      publicadas: number
    }>(
      `select status, body_script, body_house, change_note, author_id,
              (select count(*)::int from public.playbook_versions x
                where x.account_id = $2 and x.status = 'published') as publicadas
         from public.playbook_versions where id = $1`,
      [resultado.versao_id, contaId],
    )
    expect(rows[0]).toMatchObject({
      status: 'draft',
      body_script: '1. Cumprimente.\n2. Siga depois do "pode sim".',
      body_house: vigente.body_house,
      author_id: adminId,
      publicadas: vigente.publicadas,
    })
    expect(rows[0]?.change_note).toContain(MOTIVO())
    expect(await propostaGravada(diagnosticoId)).toMatchObject({ estado: 'aplicada', versao_id: resultado.versao_id })
  })

  test('jeito da casa: a camada 3 muda e a camada 2 vem da vigente', async () => {
    const diagnosticoId = await criarDiagnostico([{ alvo: 'jeito_da_casa.discovery', antes: '', depois: 'Espere o lead terminar.' }])
    const resultado = await aplicar(adminId, diagnosticoId)
    const { rows } = await banco.sql.query<{ body_house: string }>(
      'select body_house from public.playbook_versions where id = $1',
      [resultado.versao_id],
    )
    expect(rows[0]?.body_house).toBe('Espere o lead terminar.')
  })

  test('voz: os ajustes entram por cima da coluna, e o que não é número continua lá', async () => {
    const diagnosticoId = await criarDiagnostico([
      { alvo: 'voz.ajustes', antes: { stability: 0.5 }, depois: { stability: 0.7, speed: 0.9 } },
    ])
    await aplicar(adminId, diagnosticoId)
    const { rows } = await banco.sql.query<{ voice_settings: Record<string, unknown> }>(
      'select voice_settings from public.agents where account_id = $1',
      [contaId],
    )
    expect(rows[0]?.voice_settings).toEqual({ stability: 0.7, speed: 0.9, note: 'x' })
  })

  test('política: passa pelo RPC da discagem, com o motivo na trilha', async () => {
    const diagnosticoId = await criarDiagnostico([{ alvo: 'politica.duracao_maxima', antes: 600, depois: 900 }])
    await aplicar(adminId, diagnosticoId)
    const { rows } = await banco.sql.query<{ max_duration_seconds: number }>(
      'select max_duration_seconds from public.account_settings where account_id = $1',
      [contaId],
    )
    expect(rows[0]?.max_duration_seconds).toBe(900)
    expect(await motivosDaTrilha('account_settings')).toContain(MOTIVO())
  })

  test('privacidade: o dono aplica pelo RPC dele; quem só administra recebe a recusa desse RPC', async () => {
    const diagnosticoId = await criarDiagnostico([
      { alvo: 'privacidade.aviso_de_gravacao', antes: null, depois: 'Esta ligação é gravada.' },
    ])
    expect(await codigoDaRecusa(() => aplicar(adminId, diagnosticoId))).toBe('42501')
    expect(await propostaGravada(diagnosticoId)).toMatchObject({ estado: 'pendente' })

    await aplicar(donoId, diagnosticoId)
    const { rows } = await banco.sql.query<{ recording_notice_text: string }>(
      'select recording_notice_text from public.account_settings where account_id = $1',
      [contaId],
    )
    expect(rows[0]?.recording_notice_text).toBe('Esta ligação é gravada.')
  })

  test('republicar só marca: a publicação é da tela', async () => {
    const diagnosticoId = await criarDiagnostico([{ alvo: 'republicar', antes: null, depois: null }])
    expect(await aplicar(adminId, diagnosticoId)).toEqual({ alvo: 'republicar', estado: 'aplicada' })
  })

  test.each(ALVOS.map((alvo) => [alvo]))('%s tem caminho de aplicação', async (alvo) => {
    const valores: Record<string, [unknown, unknown]> = {
      'identidade.nome': ['Sarah', 'Clara'],
      'identidade.primeira_fala': [PRIMEIRA_FALA, 'Oi!'],
      'identidade.oferta': ['Rastreamento de frota.', 'Outra oferta.'],
      'identidade.nunca_afirmar': [[], ['preço']],
      'voz.ajustes': [{ stability: 0.5 }, { stability: 0.6 }],
      'politica.duracao_maxima': [600, 700],
      'politica.intervalo_minimo': [60, 90],
      'politica.tentativas_por_numero': [3, 4],
      'politica.teto_diario': [200, 300],
      'politica.simultaneidade': [2, 3],
      'privacidade.aviso_de_gravacao': [null, 'Gravamos esta ligação.'],
      republicar: [null, null],
    }
    const [antes, depois] = valores[alvo] ?? ['', 'Texto novo.']
    const diagnosticoId = await criarDiagnostico([{ alvo, antes, depois }])
    const resultado = await aplicar(donoId, diagnosticoId)
    expect(resultado).toMatchObject({ alvo, estado: 'aplicada' })
  })
})

describe('as travas', () => {
  test('o antes que mudou desde o diagnóstico recusa com SD001, sem gravar nada', async () => {
    const diagnosticoId = await criarDiagnostico([{ alvo: 'identidade.primeira_fala', antes: 'Outra fala.', depois: 'Oi!' }])
    expect(await codigoDaRecusa(() => aplicar(adminId, diagnosticoId))).toBe('SD001')
    const { rows } = await banco.sql.query<{ first_message: string }>(
      'select first_message from public.agents where account_id = $1',
      [contaId],
    )
    expect(rows[0]?.first_message).toBe(PRIMEIRA_FALA)
    expect(await propostaGravada(diagnosticoId)).toMatchObject({ estado: 'pendente' })
  })

  test('a proposta decidida não se decide de novo', async () => {
    const diagnosticoId = await criarDiagnostico([
      { alvo: 'republicar', antes: null, depois: null },
      { alvo: 'politica.duracao_maxima', antes: 600, depois: 900 },
    ])
    await aplicar(adminId, diagnosticoId, 'p1')
    expect(await codigoDaRecusa(() => aplicar(adminId, diagnosticoId, 'p1'))).toBe('55000')

    await banco.comoUsuario(adminId)
    await banco.sql.query('select public.descartar_proposta_do_diagnostico($1, $2)', [diagnosticoId, 'p2'])
    await banco.comoServico()
    expect(await propostaGravada(diagnosticoId, 'p2')).toMatchObject({ estado: 'descartada', decidida_por: adminId })
    expect(await codigoDaRecusa(() => aplicar(adminId, diagnosticoId, 'p2'))).toBe('55000')

    const { rows } = await banco.sql.query<{ max_duration_seconds: number }>(
      'select max_duration_seconds from public.account_settings where account_id = $1',
      [contaId],
    )
    expect(rows[0]?.max_duration_seconds).toBe(600)
  })

  test('proposta de outro id e diagnóstico inexistente são P0002', async () => {
    const diagnosticoId = await criarDiagnostico([{ alvo: 'republicar', antes: null, depois: null }])
    expect(await codigoDaRecusa(() => aplicar(adminId, diagnosticoId, 'p9'))).toBe('P0002')
    expect(await codigoDaRecusa(() => aplicar(adminId, '00000000-0000-4000-8000-000000000000'))).toBe('P0002')
  })

  test('operador não aplica nem descarta; dono da conta vizinha também não', async () => {
    const diagnosticoId = await criarDiagnostico([{ alvo: 'republicar', antes: null, depois: null }])
    expect(await codigoDaRecusa(() => aplicar(operadorId, diagnosticoId))).toBe('42501')
    expect(await codigoDaRecusa(() => aplicar(outroDonoId, diagnosticoId))).toBe('42501')
    await banco.comoUsuario(operadorId)
    const descarte = await codigoDaRecusa(() =>
      banco.sql.query('select public.descartar_proposta_do_diagnostico($1, $2)', [diagnosticoId, 'p1']),
    )
    expect(descarte).toBe('42501')
  })

  test('só authenticated executa os dois RPCs', async () => {
    const { rows } = await banco.sql.query<{ routine_name: string; grantee: string }>(
      `select routine_name, grantee from information_schema.routine_privileges
        where routine_schema = 'public'
          and routine_name in ('aplicar_proposta_do_diagnostico', 'descartar_proposta_do_diagnostico')
          and privilege_type = 'EXECUTE'
          and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
        order by routine_name, grantee`,
    )
    expect(rows).toEqual([
      { routine_name: 'aplicar_proposta_do_diagnostico', grantee: 'authenticated' },
      { routine_name: 'descartar_proposta_do_diagnostico', grantee: 'authenticated' },
    ])
  })

  test('o diagnóstico da conta vizinha não se aplica por aqui', async () => {
    const vizinho = await criarDiagnostico([{ alvo: 'republicar', antes: null, depois: null }], outraContaId, outraChamadaId)
    expect(await codigoDaRecusa(() => aplicar(adminId, vizinho))).toBe('42501')
  })
})
