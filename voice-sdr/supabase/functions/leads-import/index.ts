// Adaptador Deno da função leads-import. Só amarração: lê o ambiente, monta a
// porta de dados sobre o Supabase **com a sessão de quem chamou** e entrega a
// decisão para `confirmacao.ts`.
//
// A sessão importa mais aqui do que em `invite-accept`. Esta função grava lead,
// e o cliente é montado com o `Authorization` da requisição em vez da chave de
// serviço: assim a RLS continua valendo na leitura da prévia e é `auth.uid()`
// que `registrar_lead` confere para saber se quem chamou é operator da conta.
// Com a chave de serviço, qualquer sessão autenticada gravaria em qualquer
// conta — o `contaId` chega no corpo, e corpo é do cliente.
//
// O JWT é conferido pelo gateway, no padrão: quem importa planilha já entrou,
// e o 401 cru é a resposta certa para quem não entrou. Por isso a função não
// tem bloco em `config.toml`.
//
// Este arquivo fica fora do typecheck e do lint da raiz, que são de Node:
// `Deno` e o import `npm:` não existem lá. Por isso ele não tem regra nenhuma
// dentro — tudo o que decide algo mora em `confirmacao.ts` e em `previa.ts`,
// que são portáveis e testados em `npm run test:unit`. Quem o verifica é o
// `deno check` de `npm run check:funcoes`, que é degrau do CI
// (docs/PRD-implementacao.md seção 9.1).

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  atenderImportacao,
  type ArquivoDaImportacao,
  type AoDuplicar,
  type LeadGravado,
  type PortaDeConfirmacao,
} from './confirmacao.ts'
import type { LeadDaLinha } from './previa.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_PUBLICA = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

/**
 * Quantos telefones vão por consulta ao perguntar quais a conta já tem. Mil
 * valores num `in` viram uma URL que o PostgREST recusa por tamanho.
 */
const TELEFONES_POR_CONSULTA = 200

function montarPorta(autorizacao: string): PortaDeConfirmacao {
  const cliente = createClient(URL_DO_SUPABASE, CHAVE_PUBLICA, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return {
    async telefonesExistentes(_contaId: string, telefones: readonly string[]) {
      // A conta não entra no filtro: a RLS já confina a consulta às linhas da
      // conta de quem chamou, e repetir o `account_id` do corpo daria a
      // impressão de que é ele que protege.
      const achados: string[] = []
      for (let inicio = 0; inicio < telefones.length; inicio += TELEFONES_POR_CONSULTA) {
        const fatia = telefones.slice(inicio, inicio + TELEFONES_POR_CONSULTA)
        const { data, error } = await cliente
          .from('leads')
          .select('phone_e164')
          .is('merged_into_id', null)
          .in('phone_e164', fatia)
        if (error) throw new Error(error.message)
        for (const linha of data ?? []) achados.push((linha as { phone_e164: string }).phone_e164)
      }
      return achados
    },

    async registrarLead(
      contaId: string,
      lead: LeadDaLinha,
      aoDuplicar: AoDuplicar,
    ): Promise<LeadGravado> {
      const { data, error } = await cliente.rpc('registrar_lead', {
        p_account_id: contaId,
        p_lead: lead,
        p_ao_duplicar: aoDuplicar,
      })
      // A mensagem do banco sobe inteira: é `motivoDoBanco`, em
      // `confirmacao.ts`, quem a reduz a código, e é lá que existe teste.
      if (error) throw new Error(error.message)

      const linha = (Array.isArray(data) ? data[0] : data) as
        | { lead_id: string; resultado: LeadGravado['resultado'] }
        | undefined
      if (!linha) throw new Error('registrar_lead não devolveu linha')
      return { leadId: linha.lead_id, resultado: linha.resultado }
    },

    async registrarImportacao(leadId: string, arquivo: ArquivoDaImportacao) {
      const { error } = await cliente.rpc('registrar_evento_de_lead', {
        p_lead_id: leadId,
        p_kind: 'lead_imported',
        p_payload: { arquivo: arquivo.nome, hash: arquivo.hash },
      })
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
    // Corpo ausente ou ilegível cai em acao_invalida, que já tem frase.
  }

  const resposta = await atenderImportacao(
    { metodo: requisicao.method, corpo },
    montarPorta(requisicao.headers.get('authorization') ?? ''),
  )

  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: CABECALHOS,
  })
})
