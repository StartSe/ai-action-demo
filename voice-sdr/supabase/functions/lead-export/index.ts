// Adaptador Deno da função lead-export. Só amarração: lê o ambiente, monta a
// porta de dados sobre o Supabase **com a sessão de quem chamou** e entrega a
// decisão para `exportacao.ts`.
//
// A sessão é o ponto. Exportar é ler a base de contatos inteira de uma conta, e
// quem decide quais linhas quem pediu pode ver é a RLS de `leads` — não um
// `eq('account_id', ...)` montado aqui. Com a chave de serviço, o `contaId` do
// corpo (que é do cliente) bastaria para qualquer sessão autenticada levar a
// base de qualquer conta. O JWT é conferido pelo gateway, no padrão: por isso a
// função não tem bloco em `config.toml`.
//
// Duas coisas que valem para a consulta:
//
// - `count: 'exact'` é o que faz a resposta trazer quantos leads o recorte
//   alcança, e não quantos couberam. Sem ele não há como dizer o que ficou de
//   fora do teto — e é justamente disso que o relatório vive.
// - O rótulo da etapa vem por junção embutida (`pipeline_stages(label)`), que a
//   RLS da tabela de etapas também filtra. Levar a chave da etapa em vez do
//   rótulo economizaria a junção e entregaria `meeting_booked` na planilha de
//   quem chamou a etapa de "Reunião marcada".
//
// Este arquivo fica fora do typecheck e do lint da raiz, que são de Node:
// `Deno` e o import `npm:` não existem lá. Por isso ele não tem regra nenhuma
// dentro — tudo o que decide algo mora em `exportacao.ts` e em
// `_shared/recorte-de-leads.ts`, que são portáveis e testados em
// `npm run test:unit`. Quem o verifica é o `deno check` de
// `npm run check:funcoes`, que é degrau do CI.

import { createClient } from 'npm:@supabase/supabase-js@2'

import type { RecorteDeLeads } from '../_shared/recorte-de-leads.ts'
import {
  atenderExportacao,
  type LeadExportavel,
  type PortaDeExportacao,
} from './exportacao.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_PUBLICA = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const COLUNAS =
  'name, phone_e164, email, company, city, state, timezone, temperature, source, blocked_at, blocked_reason, last_activity_at, created_at'

/**
 * A junção é `!inner` quando a etapa filtra. Sem o `!inner`, o PostgREST aplica
 * o filtro só ao embutido: a etapa vem nula e a linha continua na resposta, o
 * que exportaria a conta inteira para quem pediu uma etapa só — e a lista de
 * leads, que usa o mesmo recorte, mostraria outra coisa na tela.
 */
function colunas(recorte: RecorteDeLeads): string {
  const juncao =
    recorte.etapa === undefined
      ? 'pipeline_stages(label)'
      : 'pipeline_stages!inner(label)'
  return `${COLUNAS}, ${juncao}`
}

const CABECALHOS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-expose-headers':
    'x-exportacao-motivo, x-exportacao-linhas, x-exportacao-total, x-exportacao-fora, x-exportacao-teto',
}

interface LinhaCrua {
  readonly pipeline_stages?: { readonly label?: string | null } | null
  readonly [coluna: string]: unknown
}

function montarPorta(autorizacao: string): PortaDeExportacao {
  const cliente = createClient(URL_DO_SUPABASE, CHAVE_PUBLICA, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return {
    async leadsDoRecorte(_contaId: string, recorte: RecorteDeLeads, teto: number) {
      // A conta não entra no filtro: a RLS já confina a consulta às linhas da
      // conta de quem chamou, e repetir o `account_id` do corpo daria a
      // impressão de que é ele que protege.
      let consulta = cliente
        .from('leads')
        .select(colunas(recorte), { count: 'exact' })
        // Lead mesclado não é lead; quem responde pelo telefone dele é o outro.
        .is('merged_into_id', null)

      if (recorte.termo !== undefined) {
        const termo = `%${recorte.termo}%`
        consulta = consulta.or(
          `name.ilike.${termo},phone_e164.ilike.${termo},email.ilike.${termo}`,
        )
      }
      if (recorte.etapa !== undefined) {
        consulta = consulta.eq('pipeline_stages.key', recorte.etapa)
      }
      if (recorte.temperatura !== undefined) {
        consulta = consulta.eq('temperature', recorte.temperatura)
      }
      if (recorte.origem !== undefined) consulta = consulta.eq('source', recorte.origem)
      if (recorte.atividadeDesde !== undefined) {
        consulta = consulta.gte('last_activity_at', recorte.atividadeDesde)
      }
      if (recorte.bloqueado === true) consulta = consulta.not('blocked_at', 'is', null)
      if (recorte.bloqueado === false) consulta = consulta.is('blocked_at', null)

      if (recorte.ordenacao === 'nome') consulta = consulta.order('name', { ascending: true })
      else if (recorte.ordenacao === 'criacao') {
        consulta = consulta.order('created_at', { ascending: false })
      } else {
        consulta = consulta.order('last_activity_at', { ascending: false, nullsFirst: false })
      }

      const { data, count, error } = await consulta.range(0, teto - 1)
      if (error) throw new Error(error.message)

      // O select monta a lista de colunas em tempo de execução (`colunas`), e o
      // gerador de tipos do PostgREST não consegue casar uma string dinâmica com
      // uma linha conhecida — daí o `unknown` no meio: é o mesmo formato que
      // `LinhaCrua` já descreve, só que a inferência do cliente não enxerga.
      const linhasCruas = (data ?? []) as unknown as LinhaCrua[]
      const linhas: LeadExportavel[] = linhasCruas.map((linha) => ({
        name: (linha.name as string | null) ?? null,
        phone_e164: (linha.phone_e164 as string) ?? '',
        email: (linha.email as string | null) ?? null,
        company: (linha.company as string | null) ?? null,
        city: (linha.city as string | null) ?? null,
        state: (linha.state as string | null) ?? null,
        timezone: (linha.timezone as string | null) ?? null,
        stage_label: linha.pipeline_stages?.label ?? null,
        temperature: (linha.temperature as string | null) ?? null,
        source: (linha.source as string | null) ?? null,
        blocked_at: (linha.blocked_at as string | null) ?? null,
        blocked_reason: (linha.blocked_reason as string | null) ?? null,
        last_activity_at: (linha.last_activity_at as string | null) ?? null,
        created_at: (linha.created_at as string) ?? '',
      }))

      return { linhas, total: count ?? linhas.length }
    },

    async registrarExportacao(contaId: string, quantidade: number, recorte: RecorteDeLeads) {
      const { error } = await cliente.rpc('registrar_exportacao_de_leads', {
        p_account_id: contaId,
        p_quantidade: quantidade,
        p_recorte: recorte,
      })
      // A mensagem do banco sobe inteira: é `motivoDaFalha`, em `exportacao.ts`,
      // quem a reduz a código, e é lá que existe teste.
      if (error) throw new Error(error.message)
    },
  }
}

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CABECALHOS })
  }

  let corpo: unknown = null
  try {
    corpo = await requisicao.json()
  } catch {
    // Corpo ausente ou ilegível cai em conta_ausente, que já tem frase.
  }

  const resposta = await atenderExportacao(
    { metodo: requisicao.method, corpo },
    montarPorta(requisicao.headers.get('authorization') ?? ''),
  )

  if (resposta.tipo === 'json') {
    return new Response(JSON.stringify(resposta.corpo), {
      status: resposta.status,
      headers: { ...CABECALHOS, 'content-type': 'application/json; charset=utf-8' },
    })
  }

  return new Response(resposta.csv, {
    status: resposta.status,
    headers: {
      ...CABECALHOS,
      ...resposta.cabecalhos,
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${resposta.nomeDoArquivo}"`,
    },
  })
})
