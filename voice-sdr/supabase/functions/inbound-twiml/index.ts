// Adaptador Deno da função inbound-twiml. Só amarração: lê o ambiente, monta a
// porta de leitura sobre o Supabase e entrega a decisão para `atendimento.ts`.
//
// Este arquivo fica fora do typecheck e do lint da raiz, que são de Node:
// `Deno` e o import `npm:` não existem lá. Por isso ele não tem regra nenhuma
// dentro — o que decide algo mora em `atendimento.ts` e `documento.ts`, que são
// portáveis e testados em `npm run test:unit`. Quem verifica este arquivo é o
// `deno check` de `npm run check:funcoes`, no CI.
//
// **Por que a chave de serviço.** Quem chama é a operadora, que não tem sessão
// nenhuma; a credencial dela é a assinatura, conferida em `atendimento.ts` com
// o Auth Token que a conta do endereço (`?conta=`) gravou no cofre. Ler o
// cofre é `get_account_secret`, que só a chave de serviço executa. Depois da
// assinatura a função acha a linha por número, e nenhuma RLS resolveria isso.
//
// **A URL que entra no cálculo da assinatura é a que a operadora chamou.** O
// gateway do Supabase entrega `requisicao.url` com o esquema e o domínio
// públicos, que é o que a assinatura cobre. Reconstruí-la a partir de partes
// seria a forma barata de fazer toda assinatura legítima falhar.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'
import { CHAVE_DO_TOKEN, PROVEDOR_DE_TELEFONIA } from '../phone-register/registro.ts'

import {
  atenderChamadaRecebida,
  type LinhaChamada,
  type PortaDoAtendimento,
} from './atendimento.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))

/**
 * Opcional, e só para o webhook cadastrado antes de o endereço levar a conta.
 * O produto não depende desta variável: o token que confere é o da conta, no
 * cofre. Ausente, o endereço antigo é recusado, e registrar a linha de novo o
 * troca pelo novo.
 */
const TOKEN_DA_INSTALACAO = Deno.env.get('SARAH_TELEFONIA_AUTH_TOKEN') ?? null

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const lerPlataforma = criarLeitorDaPlataforma(Deno.env.toObject())

// A mesma porta de `phone-register`: o token que confere a assinatura é o que
// registrou o número, e os dois passam pela mesma cascata.
const portaDeCredenciais: PortaDeCredenciais = {
  async segredoDaConta(contaId, provedor, chave) {
    const { data, error } = await servico.rpc('get_account_secret', {
      p_account_id: contaId,
      p_provider: provedor,
      p_key_name: chave,
    })
    if (error) throw new Error(error.message)
    return typeof data === 'string' ? data : null
  },
  async segredoDoRecurso() {
    return null
  },
  segredoDaPlataforma(provedor, chave) {
    return lerPlataforma(provedor, chave)
  },
  async modoDeCredencial(contaId) {
    const { data, error } = await servico
      .from('accounts')
      .select('credentials_mode')
      .eq('id', contaId)
      .maybeSingle()
    if (error) return 'account'
    const modo = (data as { credentials_mode?: string } | null)?.credentials_mode
    return modo === 'platform' ? 'platform' : 'account'
  },
}

const cofre = criarCofreDeCredenciais({ porta: portaDeCredenciais, ambiente: AMBIENTE })

const porta: PortaDoAtendimento = {
  async tokenDaConta(contaId) {
    const resolucao = await cofre.resolveSecret(contaId, PROVEDOR_DE_TELEFONIA, CHAVE_DO_TOKEN)
    return resolucao.ok ? resolucao.valor : null
  },

  async linhaChamada(e164) {
    const { data, error } = await servico
      .from('phone_lines')
      .select('account_id, e164, inbound_behavior, forward_to')
      .eq('e164', e164)
      .eq('enabled', true)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null

    const linha = data as Record<string, unknown>
    const contaId = String(linha.account_id ?? '')

    // A identidade vem numa segunda consulta porque `agents` e `phone_lines`
    // não têm chave estrangeira entre si — a linha existe antes de a conta
    // montar a Sarah. Agente ausente não impede o atendimento: a apresentação é
    // que sai de cena.
    const { data: agente } = await servico
      .from('agents')
      .select('name, company_name')
      .eq('account_id', contaId)
      .maybeSingle()
    const identidade = (agente ?? {}) as Record<string, unknown>

    return {
      account_id: contaId,
      e164: String(linha.e164 ?? ''),
      inbound_behavior: String(linha.inbound_behavior ?? ''),
      forward_to: (linha.forward_to as string | null) ?? null,
      agent_name: (identidade.name as string | null) ?? null,
      company_name: (identidade.company_name as string | null) ?? null,
    } satisfies LinhaChamada
  },
}

Deno.serve(async (requisicao: Request) => {
  // O corpo é `application/x-www-form-urlencoded`, e os pares vão para o
  // cálculo da assinatura na ordem em que chegaram — quem os ordena é o módulo
  // da assinatura, porque a ordem certa é a do nome e não a da chegada.
  const pares: [string, string][] = []
  if (requisicao.method.toUpperCase() === 'POST') {
    try {
      const texto = await requisicao.text()
      for (const [nome, valor] of new URLSearchParams(texto)) pares.push([nome, valor])
    } catch {
      // Corpo ilegível não tem assinatura que confira, e a recusa é a mesma.
    }
  }

  const resposta = await atenderChamadaRecebida(
    {
      metodo: requisicao.method,
      url: requisicao.url,
      pares,
      assinatura: requisicao.headers.get('x-twilio-signature'),
    },
    porta,
    { tokenDaInstalacao: TOKEN_DA_INSTALACAO },
  )

  return new Response(resposta.corpo, {
    status: resposta.status,
    headers: { 'content-type': resposta.tipo, 'cache-control': 'no-store' },
  })
})
