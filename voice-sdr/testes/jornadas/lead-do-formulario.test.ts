// Jornada da persona 2 (docs/personas.md): Marcos, gerente comercial de uma
// integradora de energia solar, com quatro consultores e o formulário do site
// despejando lead de anúncio. A pergunta dele é uma só: o lead que preencheu o
// formulário às 14h recebe ligação às 14h05 e sai com reunião marcada com o
// consultor certo?
//
// Este arquivo segue o lead pelo banco de verdade (PGlite com as migrações do
// zero) e pelas bordas portáveis ligadas a ele, na ordem em que a vida dele
// acontece: a conta nasce, a chave do formulário é girada, o lead entra pelo
// endereço público, a guarda decide a ligação antes e depois da ligação de
// teste, a reunião é marcada com o consultor, a exceção entra na fila e sai
// resolvida, o painel lê o período e o ambiente é zerado.
//
// Os passos que antes provavam defeito com `test.fails` (D-01, D-02 e D-03 de
// docs/validacao-por-persona.md) viraram `test` quando as correções
// entraram: o painel conta a reunião, /config/integracoes gira a chave e
// /config/discagem liga a ligação ao lead novo.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { criarBancoDeTeste, UUID, type BancoDeTeste } from '../auxiliares/banco-de-teste.ts'
import { gerarChaveDeEntrada, hashDaChaveDeEntrada } from '../../supabase/functions/_shared/chave-de-entrada.ts'
import {
  ORIGEM,
  receberLead,
  type ContaDeEntrada,
  type LeadDaEntrada,
  type LeadGravado,
  type PortaDeEntrada,
} from '../../supabase/functions/lead-intake/entrada.ts'
import { criarLimiteDeTaxa } from '../../supabase/functions/lead-intake/limite-de-taxa.ts'

const SAO_PAULO = 'America/Sao_Paulo'
/** Quarta-feira, 14h em São Paulo: dentro da janela padrão. */
const QUARTA_14H = '2026-09-23T17:00:00Z'
/** A mesma quarta, 22h: fora da janela. */
const QUARTA_22H = '2026-09-24T01:00:00Z'
const CELULAR_DO_MARCOS = '+5548999990001'

let banco: BancoDeTeste
let marcosId: string
let contaId: string
let chaveDoFormulario: string
let leadId: string

beforeAll(async () => {
  banco = await criarBancoDeTeste()
  marcosId = await banco.criarUsuario('marcos@soldovale.com.br', 'Marcos Tavares')
}, 60_000)

afterAll(async () => {
  await banco?.encerrar()
})

/** A porta de `lead-intake` sobre este banco, como `index.ts` a monta com a chave de serviço. */
function portaDoBanco(): PortaDeEntrada {
  return {
    async contaPorHashDaChave(hash: string): Promise<ContaDeEntrada | null> {
      await banco.comoServico()
      const { rows } = await banco.sql.query<{ id: string; intake_key_hash: string | null }>(
        'select id, intake_key_hash from public.accounts where intake_key_hash = $1',
        [hash],
      )
      const linha = rows[0]
      return linha?.intake_key_hash ? { id: linha.id, intakeKeyHash: linha.intake_key_hash } : null
    },
    async registrarLead(conta: string, lead: LeadDaEntrada): Promise<LeadGravado> {
      await banco.comoServico()
      const { rows } = await banco.sql.query<{ lead_id: string; resultado: LeadGravado['resultado'] }>(
        `select lead_id, resultado from public.registrar_lead($1, $2::jsonb, 'atualizar')`,
        [conta, JSON.stringify(lead)],
      )
      const linha = rows[0]
      if (!linha) throw new Error('registrar_lead não devolveu linha')
      return { leadId: linha.lead_id, resultado: linha.resultado }
    },
  }
}

async function guarda(telefone: string, instante = QUARTA_14H) {
  await banco.comoServico()
  const { rows } = await banco.sql.query<{ allowed: boolean; reason: string }>(
    `select allowed, reason from public.guard_dial(
       p_account_id => $1::uuid, p_phone_e164 => $2::text, p_lead_id => $3::uuid,
       p_actor => 'user', p_actor_id => $4::uuid, p_instante => $5::timestamptz)`,
    [contaId, telefone, leadId ?? null, marcosId, instante],
  )
  return rows[0]!
}

describe('Marcos: o lead do formulário, do endereço público à reunião', () => {
  test('a conta nasce pela fundação, com o Marcos como dono', async () => {
    await banco.comoUsuario(marcosId)
    const { rows } = await banco.sql.query<{ conta: string }>(
      'select public.fundar_instalacao($1) as conta',
      ['Sol do Vale Energia'],
    )
    contaId = rows[0]!.conta
    expect(contaId).toMatch(UUID)

    await banco.comoServico()
    const { rows: conta } = await banco.sql.query<{ timezone: string }>(
      'select timezone from public.accounts where id = $1',
      [contaId],
    )
    // O fuso da conta é o que decide a janela quando o lead não tem DDD conhecido.
    expect(conta[0]?.timezone).toBe(SAO_PAULO)
  })

  test('o dono gira a chave do formulário, e só o hash fica no banco', async () => {
    chaveDoFormulario = gerarChaveDeEntrada()
    const hash = await hashDaChaveDeEntrada(chaveDoFormulario)

    await banco.comoUsuario(marcosId)
    await banco.sql.query('select public.girar_chave_de_entrada($1, $2)', [contaId, hash])

    await banco.comoServico()
    const { rows } = await banco.sql.query<{ intake_key_hash: string }>(
      'select intake_key_hash from public.accounts where id = $1',
      [contaId],
    )
    expect(rows[0]?.intake_key_hash).toBe(hash)
    expect(rows[0]?.intake_key_hash).not.toContain(chaveDoFormulario)
  })

  test('o formulário do site entra pelo endereço público, com cidade, estado e fuso do DDD', async () => {
    // O corpo como um formulário de landing page manda: nomes em inglês, campos a mais.
    const resposta = await receberLead(
      {
        metodo: 'POST',
        chave: chaveDoFormulario,
        corpo: {
          name: 'Joana Prado',
          phone: '(48) 99912-3456',
          email: 'joana@padariaprado.com.br',
          utm_source: 'meta',
          'g-recaptcha-response': 'x',
        },
      },
      portaDoBanco(),
      criarLimiteDeTaxa({ agora: () => Date.parse(QUARTA_14H) }),
    )

    expect(resposta.status).toBe(201)
    expect(resposta.corpo.lead).toMatchObject({
      telefone: '+5548999123456',
      estado: 'SC',
      fuso: SAO_PAULO,
    })
    leadId = resposta.corpo.lead!.id

    await banco.comoServico()
    const { rows } = await banco.sql.query<{ source: string; name: string }>(
      'select source, name from public.leads where id = $1',
      [leadId],
    )
    expect(rows[0]).toEqual({ source: ORIGEM, name: 'Joana Prado' })
  })

  test('o mesmo formulário enviado de novo não vira segundo lead', async () => {
    const resposta = await receberLead(
      { metodo: 'POST', chave: chaveDoFormulario, corpo: { nome: 'Joana Prado', telefone: '48999123456', empresa: 'Padaria Prado' } },
      portaDoBanco(),
      criarLimiteDeTaxa({ agora: () => Date.parse(QUARTA_14H) }),
    )
    expect(resposta.corpo.lead?.id).toBe(leadId)

    await banco.comoServico()
    const { rows } = await banco.sql.query<{ n: number; company: string | null }>(
      'select count(*)::int as n, max(company) as company from public.leads where account_id = $1',
      [contaId],
    )
    // Só preenche o que estava vazio: a empresa chegou na segunda vez.
    expect(rows[0]).toEqual({ n: 1, company: 'Padaria Prado' })
  })

  test('chave errada não grava nada, e a resposta não diz se a conta existe', async () => {
    const resposta = await receberLead(
      { metodo: 'POST', chave: gerarChaveDeEntrada(), corpo: { nome: 'Spam', telefone: '(11) 99999-0000' } },
      portaDoBanco(),
      criarLimiteDeTaxa({ agora: () => Date.parse(QUARTA_14H) }),
    )
    expect(resposta.status).toBe(401)
    await banco.comoServico()
    const { rows } = await banco.sql.query<{ n: number }>(
      'select count(*)::int as n from public.leads where account_id = $1',
      [contaId],
    )
    expect(rows[0]?.n).toBe(1)
  })

  test('a conta nasce com o fala-rápido desligado', async () => {
    await banco.comoServico()
    const { rows } = await banco.sql.query<{ ligado: boolean }>(
      'select speed_to_lead_enabled as ligado from public.account_settings where account_id = $1',
      [contaId],
    )
    expect(rows).toEqual([{ ligado: false }])
  })

  test('D-03: o Marcos liga pela tela e o lead do formulário vira candidato da ligação imediata', async () => {
    // Corrigido: /config/discagem grava por `definir_ligacao_ao_lead_novo`
    // (migração 20261013110000), com o motivo na trilha. Ninguém mexe no banco.
    await banco.comoUsuario(marcosId)
    await banco.sql.query('select public.definir_ligacao_ao_lead_novo($1, true, 5, $2)', [
      contaId,
      'Formulário do site no ar.',
    ])
    await banco.comoServico()
    const { rows } = await banco.sql.query<{ lead_id: string }>(
      'select lead_id from public.candidatos_do_fala_rapido($1, 25)',
      [new Date(Date.now() + 60_000).toISOString()],
    )
    expect(rows.map((linha) => linha.lead_id)).toContain(leadId)
  })

  test('antes da ligação de teste, a guarda não liga para o lead real, e liga para o celular de teste', async () => {
    await banco.comoServico()
    await banco.sql.query(
      `insert into public.phone_lines (account_id, e164, label) values ($1, '+554830300001', 'Linha comercial')`,
      [contaId],
    )
    await banco.sql.query(
      `insert into public.account_test_numbers (account_id, phone_e164, label) values ($1, $2, 'Celular do Marcos')`,
      [contaId, CELULAR_DO_MARCOS],
    )

    expect(await guarda('+5548999123456')).toMatchObject({ allowed: false, reason: 'real_dialing_gate' })
    expect(await guarda(CELULAR_DO_MARCOS)).toMatchObject({ allowed: true, reason: 'placed' })
  })

  test('depois da ligação de teste, o lead real passa dentro da janela e para fora dela e no freio', async () => {
    await banco.comoServico()
    // A marca que call-finalize escreve quando a ligação de teste termina com fala.
    await banco.sql.exec(`
      begin;
      select set_config('app.primeira_chamada_de_teste', 'on', true);
      update public.accounts set first_test_call_ok_at = '${QUARTA_14H}' where id = '${contaId}';
      commit;
    `)

    expect(await guarda('+5548999123456')).toMatchObject({ allowed: true, reason: 'placed' })
    expect(await guarda('+5548999123456', QUARTA_22H)).toMatchObject({ allowed: false, reason: 'outside_window' })

    await banco.sql.query(
      `update public.accounts set dialing_paused_at = now(), dialing_paused_by = $2, dialing_paused_reason = 'teste do freio' where id = $1`,
      [contaId, marcosId],
    )
    expect(await guarda('+5548999123456')).toMatchObject({ allowed: false, reason: 'dialing_paused' })
    await banco.sql.query(
      'update public.accounts set dialing_paused_at = null, dialing_paused_by = null, dialing_paused_reason = null where id = $1',
      [contaId],
    )
  })

  test('a reunião é marcada com o consultor comercial, no horário livre dele', async () => {
    await banco.comoServico()
    const { rows: consultor } = await banco.sql.query<{ id: string }>(
      `insert into public.specialists
         (account_id, name, email, modalities, timezone, daily_cap, min_notice_min, max_notice_days, active)
       values ($1, 'Helena Costa', 'helena@soldovale.com.br', array['video']::text[], $2, 6, 120, 30, true)
       returning id`,
      [contaId, SAO_PAULO],
    )
    const helena = consultor[0]!.id
    await banco.sql.query(
      `insert into public.specialist_availability (account_id, specialist_id, weekday, start_time, end_time)
       select $1, $2, d, '00:00', '24:00' from generate_series(0, 6) d`,
      [contaId, helena],
    )
    const inicio = new Date(Date.now() + 3 * 86_400_000)
    inicio.setUTCHours(17, 0, 0, 0)
    const fim = new Date(inicio.getTime() + 30 * 60_000)

    const { rows } = await banco.sql.query<{ resultado: string; reuniao_id: string | null }>(
      `select * from public.agendar_reuniao($1, $2, $3, $4, $5, 'video', 'Conta de luz de R$ 900, telhado próprio.', null)`,
      [contaId, leadId, helena, inicio.toISOString(), fim.toISOString()],
    )
    expect(rows[0]).toMatchObject({ resultado: 'agendada', reuniao_id: expect.stringMatching(UUID) })
  })

  async function reunioesMarcadasNoPainel(): Promise<unknown> {
    await banco.comoUsuario(marcosId)
    try {
      const de = new Date(Date.now() - 86_400_000).toISOString()
      const ate = new Date(Date.now() + 86_400_000).toISOString()
      const { rows } = await banco.sql.query<{ resumo: { reunioes: { marcadas: unknown } } }>(
        'select public.dashboard_summary($1, $2, $3) as resumo',
        [contaId, de, ate],
      )
      return rows[0]?.resumo.reunioes.marcadas
    } finally {
      await banco.comoServico()
    }
  }

  test('D-01: o painel do período conta a reunião que acabou de ser marcada', async () => {
    // Corrigido pela migração 20261013100000: `dashboard_summary` conta as
    // reuniões marcadas no período em vez de "indisponivel_nesta_fase".
    expect(await reunioesMarcadasNoPainel()).toBe(1)
  })

  test('o pedido de falar com gente entra na fila e sai com a resolução de quem retornou', async () => {
    await banco.comoServico()
    await banco.sql.query('set role service_role')
    const { rows } = await banco.sql.query<{ r: string }>(
      `select public.registrar_item_de_fila($1, 'pedido_humano', 'alta', $2, $3::jsonb, '{}'::jsonb, $4, null) as r`,
      [contaId, `humano:${leadId}`, JSON.stringify({ trecho: 'Prefiro falar com um consultor de verdade.' }), leadId],
    )
    expect(rows[0]?.r).toBe('criado')

    await banco.comoServico()
    const { rows: itens } = await banco.sql.query<{ id: string }>(
      `select id from public.exception_items where account_id = $1 and status = 'aberto'`,
      [contaId],
    )
    expect(itens).toHaveLength(1)

    await banco.comoUsuario(marcosId)
    const { rows: resolucao } = await banco.sql.query<{ r: string }>(
      'select public.resolver_item_de_fila($1, $2) as r',
      [itens[0]!.id, 'Liguei de volta e confirmei a reunião com a Helena.'],
    )
    expect(resolucao[0]?.r).toBe('resolvido')

    await banco.comoServico()
    const { rows: depois } = await banco.sql.query<{ n: number }>(
      `select count(*)::int as n from public.exception_items where account_id = $1 and status = 'aberto'`,
      [contaId],
    )
    expect(depois[0]?.n).toBe(0)
  })

  test('zerar o ambiente apaga a conta inteira e a instalação volta a pedir fundação', async () => {
    await banco.comoServico()
    await banco.sql.query('set role service_role')
    const { rows } = await banco.sql.query<{ resumo: { contas: number } }>('select public.zerar_ambiente() as resumo')
    expect(rows[0]?.resumo.contas).toBe(1)

    await banco.comoServico()
    for (const tabela of ['accounts', 'leads', 'meetings', 'exception_items', 'specialists']) {
      const { rows: linhas } = await banco.sql.query<{ n: number }>(`select count(*)::int as n from public.${tabela}`)
      expect({ tabela, n: linhas[0]?.n }).toEqual({ tabela, n: 0 })
    }
    await banco.comoAnonimo()
    const { rows: semDono } = await banco.sql.query<{ sem_dono: boolean }>('select public.instalacao_sem_dono() as sem_dono')
    expect(semDono[0]?.sem_dono).toBe(true)
  })
})

/** O código de produção da interface, sem os testes: o que o cliente consegue usar. */
function fontesDaInterface(): string[] {
  const raiz = fileURLToPath(new URL('../../app/src', import.meta.url))
  const fontes: string[] = []
  const andar = (pasta: string) => {
    for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
      const caminho = join(pasta, entrada.name)
      if (entrada.isDirectory()) {
        if (entrada.name !== 'testes' && entrada.name !== 'jornadas') andar(caminho)
      } else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
        fontes.push(readFileSync(caminho, 'utf8'))
      }
    }
  }
  andar(raiz)
  return fontes
}

describe('Marcos: o que ele precisa fazer sozinho, pela tela', () => {
  test('a varredura lê a interface de verdade', () => {
    // Sem isto, os dois de baixo "passariam" com uma varredura vazia.
    const fontes = fontesDaInterface()
    expect(fontes.length).toBeGreaterThan(100)
    expect(fontes.some((fonte) => fonte.includes('registrar_lead') || fonte.includes('cadastrar('))).toBe(true)
  })

  test('D-02: alguma tela gira a chave do formulário e mostra o endereço público', () => {
    // Corrigido: o cartão "Formulário do site" de /config/integracoes gira a
    // chave e mostra o endereço de lead-intake (app/src/integracoes/).
    const fontes = fontesDaInterface()
    expect(fontes.some((fonte) => fonte.includes('girar_chave_de_entrada'))).toBe(true)
    expect(fontes.some((fonte) => fonte.includes('lead-intake'))).toBe(true)
  })

  test('D-03: alguma tela liga o fala-rápido da conta', () => {
    const fontes = fontesDaInterface()
    expect(fontes.some((fonte) => fonte.includes('speed_to_lead_enabled'))).toBe(true)
    expect(fontes.some((fonte) => fonte.includes('definir_ligacao_ao_lead_novo'))).toBe(true)
  })
})
