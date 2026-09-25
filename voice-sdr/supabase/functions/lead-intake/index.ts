// Adaptador Deno da função lead-intake. Só amarração: lê o ambiente, monta a
// porta de dados sobre o Supabase e entrega a decisão para `entrada.ts`.
//
// O cliente é montado com a **chave de serviço**, e não com o `Authorization`
// da requisição, porque aqui não há requisição autenticada: quem chega é o
// formulário do site de um cliente, sem sessão nenhuma. Quem autentica é a
// chave da conta, e é `entrada.ts` que a confere. É o mesmo caso de
// `invite-accept` e o oposto de `leads-import`, que grava em nome de quem
// chamou e por isso passa o JWT adiante.
//
// Duas consequências disso, e as duas são de propósito. A leitura de `accounts`
// por `intake_key_hash` passa por cima da RLS — tem que passar, porque não há
// membro nenhum a quem a política se aplique. E `registrar_lead` chamado sem
// `auth.uid()` não confere papel: a conta vem do hash da chave, que é o que
// prova a autorização, e nunca do corpo do pedido.
//
// O limite de taxa vive aqui, no escopo do módulo, porque precisa sobreviver
// entre requisições do mesmo isolado. Está escrito em `limite-de-taxa.ts` que
// isso significa 60 por minuto **por isolado**, e por que essa aproximação é
// aceitável nesta fase.
//
// Este arquivo fica fora do typecheck e do lint da raiz, que são de Node:
// `Deno` e o import `npm:` não existem lá. Por isso ele não tem regra nenhuma
// dentro — tudo o que decide algo mora em `entrada.ts` e em `limite-de-taxa.ts`,
// que são portáveis e testados em `npm run test:unit`. Quem o verifica é o
// `deno check` de `npm run check:funcoes`, que é degrau do CI
// (docs/PRD-implementacao.md seção 9.1).

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  CABECALHO_DA_CHAVE,
  receberLead,
  type ContaDeEntrada,
  type LeadDaEntrada,
  type LeadGravado,
  type PortaDeEntrada,
} from './entrada.ts'
import { criarLimiteDeTaxa } from './limite-de-taxa.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CABECALHOS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-headers': `content-type, ${CABECALHO_DA_CHAVE}`,
  'access-control-allow-methods': 'POST, OPTIONS',
}

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const limite = criarLimiteDeTaxa()

const porta: PortaDeEntrada = {
  async contaPorHashDaChave(hash: string): Promise<ContaDeEntrada | null> {
    // Igualdade exata, e nada de `like`: é o índice único parcial de
    // `intake_key_hash` que resolve a conta em uma busca. `maybeSingle` para
    // "não achei" ser null em vez de erro — chave desconhecida é caso esperado.
    const { data, error } = await servico
      .from('accounts')
      .select('id, intake_key_hash')
      .eq('intake_key_hash', hash)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null

    const linha = data as { id: string; intake_key_hash: string | null }
    if (!linha.intake_key_hash) return null
    return { id: linha.id, intakeKeyHash: linha.intake_key_hash }
  },

  async registrarLead(contaId: string, lead: LeadDaEntrada): Promise<LeadGravado> {
    const { data, error } = await servico.rpc('registrar_lead', {
      p_account_id: contaId,
      p_lead: lead,
      // `atualizar` e não `ignorar`: quem preenche o formulário duas vezes
      // costuma preencher mais campos na segunda, e o RPC só preenche coluna
      // vazia e nunca apaga.
      p_ao_duplicar: 'atualizar',
    })
    // A mensagem do banco sobe inteira e morre no `catch` de `entrada.ts`, que
    // responde 500 com frase em português.
    if (error) throw new Error(error.message)

    const linha = (Array.isArray(data) ? data[0] : data) as
      | { lead_id: string; resultado: LeadGravado['resultado'] }
      | undefined
    if (!linha) throw new Error('registrar_lead não devolveu linha')
    return { leadId: linha.lead_id, resultado: linha.resultado }
  },
}

Deno.serve(async (requisicao: Request) => {
  if (requisicao.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CABECALHOS })
  }

  let corpo: unknown = null
  try {
    corpo = await requisicao.json()
  } catch {
    // Corpo ausente ou ilegível cai em corpo_invalido, que já tem frase.
  }

  const resposta = await receberLead(
    {
      metodo: requisicao.method,
      chave: requisicao.headers.get(CABECALHO_DA_CHAVE),
      corpo,
    },
    porta,
    limite,
  )

  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: { ...CABECALHOS, ...resposta.cabecalhos },
  })
})
