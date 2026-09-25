// Adaptador Deno da função call-init. Só amarração: lê o ambiente, monta a
// camada de dados sobre o Supabase e entrega a decisão para `contexto.ts`.
//
// Este arquivo fica fora do typecheck e do lint da raiz, que são de Node:
// `Deno` e o import `npm:` não existem lá. Por isso ele não tem regra nenhuma
// dentro — o que decide algo mora em `contexto.ts` e `formato-do-provedor.ts`,
// que são portáveis e testados em `npm run test:unit`. Quem verifica este
// arquivo é o `deno check` de `npm run check:funcoes`, no CI.
//
// **O corpo é lido cru, e uma vez só.** A assinatura cobre o texto exato que
// chegou; reserializar o objeto parseado reordenaria chaves e reescreveria
// escape, e toda assinatura legítima passaria a falhar. Por isso quem faz
// `JSON.parse` é `contexto.ts`, depois de conferir a assinatura.
//
// **Por que a chave de serviço.** Quem chama é o provedor de voz, que não tem
// sessão nenhuma; a credencial dele é a assinatura. Depois disso a função
// precisa achar a conta a partir de um número chamado ou de um `call_id`, e
// nenhuma RLS resolveria isso — `calls` não tem política de escrita pelo
// cliente, e a ligação recebida nasce sem usuário nenhum a quem a política se
// aplique.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  ROTULO_DA_CHAVE_DE_FERRAMENTAS,
  segredoDaInstalacao,
} from '../_shared/segredo-da-instalacao.ts'

import { lerReuniaoEmJogo } from '../_shared/agente/reuniao-em-jogo.ts'
import { lerInstanteDaRotacao } from '../_shared/provedor/assinatura-de-webhook.ts'
import {
  CABECALHO_DO_SEGREDO_DO_INICIO,
  contaDoEndereco,
} from '../_shared/provedor/webhooks-da-conta.ts'

import {
  iniciarChamada,
  type ChamadaEmCurso,
  type LeadDaChamada,
  type LinhaDeChamadaRecebida,
  type PortaDoContexto,
} from './contexto.ts'
import { corpoParaOProvedor } from './formato-do-provedor.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

/**
 * O segredo com que o provedor de voz assina os webhooks desta instalação.
 * Ausente, todo pedido é recusado — e é o desfecho certo: montar contexto sem
 * conferir quem pediu abriria a ficha do lead a quem descobrisse o endereço.
 */
const SEGREDO_DO_WEBHOOK = Deno.env.get('SARAH_VOZ_WEBHOOK_SECRET') ?? null
/** O segredo de antes da rotação, e quando ela aconteceu (R-07). */
const SEGREDO_ANTERIOR = Deno.env.get('SARAH_VOZ_WEBHOOK_SECRET_ANTERIOR') ?? null
const ROTACIONADO_EM = lerInstanteDaRotacao(Deno.env.get('SARAH_VOZ_WEBHOOK_ROTACIONADO_EM'))

/** O cabeçalho em que o provedor de voz manda a assinatura. */
const CABECALHO_DA_ASSINATURA = 'elevenlabs-signature'

/**
 * A chave do servidor de onde sai o segredo do início de cada conta, a mesma
 * das ferramentas, com a anterior aceita por 24 h durante a rotação. O webhook
 * de início da ElevenLabs não é assinado: a credencial dele é o cabeçalho que
 * `agent-publish` escreveu com este segredo (`_shared/provedor/webhooks-da-conta.ts`).
 */
// A variável, quando alguém a definiu; senão derivada da chave de serviço,
// pelo mesmo caminho de tool-dnc e tool-transfer, para os lados concordarem.
const CHAVE_DO_SERVIDOR = await segredoDaInstalacao({
  definido: Deno.env.get('SARAH_TOOL_SERVER_KEY'),
  chaveDeServico: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  rotulo: ROTULO_DA_CHAVE_DE_FERRAMENTAS,
})
const CHAVE_ANTERIOR = Deno.env.get('SARAH_TOOL_SERVER_KEY_ANTERIOR') ?? null
const CHAVE_ROTACIONADA_EM = (() => {
  const instante = lerInstanteDaRotacao(Deno.env.get('SARAH_TOOL_SERVER_KEY_ROTACIONADA_EM'))
  return instante === null ? null : instante * 1000
})()
const CHAVES_DO_SERVIDOR = CHAVE_DO_SERVIDOR
  ? { vigente: CHAVE_DO_SERVIDOR, anterior: CHAVE_ANTERIOR, rotacionadaEm: CHAVE_ROTACIONADA_EM }
  : null

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const COLUNAS_DA_CHAMADA = 'id, account_id, direction, lead_id, purpose, provider_conversation_id'
const COLUNAS_DO_LEAD = 'id, name, company, city, state'

function comoChamada(linha: Record<string, unknown>): ChamadaEmCurso {
  return {
    id: String(linha.id ?? ''),
    account_id: String(linha.account_id ?? ''),
    direction: linha.direction as ChamadaEmCurso['direction'],
    lead_id: (linha.lead_id as string | null) ?? null,
    purpose: linha.purpose as ChamadaEmCurso['purpose'],
    provider_conversation_id: (linha.provider_conversation_id as string | null) ?? null,
  }
}

const porta: PortaDoContexto = {
  async chamadaDeSaida(chamadaId) {
    const { data, error } = await servico
      .from('calls')
      .select(COLUNAS_DA_CHAMADA)
      .eq('id', chamadaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? comoChamada(data as Record<string, unknown>) : null
  },

  async marcarConversa(chamadaId, conversaId) {
    // O `is null` no filtro é a segunda metade da decisão de `contexto.ts`: dois
    // webhooks do mesmo instante não se sobrescrevem, e quem chegar depois não
    // apaga o identificador que já estava lá.
    const { error } = await servico
      .from('calls')
      .update({ provider_conversation_id: conversaId })
      .eq('id', chamadaId)
      .is('provider_conversation_id', null)
    if (error) throw new Error(error.message)
  },

  async linhaPeloNumero(e164) {
    const { data, error } = await servico
      .from('phone_lines')
      .select('id, account_id, e164')
      .eq('e164', e164)
      .eq('enabled', true)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null

    const linha = data as Record<string, unknown>
    return {
      id: String(linha.id ?? ''),
      account_id: String(linha.account_id ?? ''),
      e164: String(linha.e164 ?? ''),
    }
  },

  async publicacaoPeloAgenteDoProvedor(contaId, agenteDoProvedorId) {
    const { data, error } = await servico
      .from('agent_publications')
      .select('id, purpose')
      .eq('account_id', contaId)
      .eq('provider_agent_id', agenteDoProvedorId)
      .eq('status', 'publicado')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null

    const publicacao = data as Record<string, unknown>
    return {
      id: String(publicacao.id ?? ''),
      purpose: publicacao.purpose as ChamadaEmCurso['purpose'],
    }
  },

  async publicacaoDoProposito(contaId, proposito) {
    const { data, error } = await servico
      .from('agent_publications')
      .select('id, purpose')
      .eq('account_id', contaId)
      .eq('purpose', proposito)
      .eq('status', 'publicado')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null

    const publicacao = data as Record<string, unknown>
    return {
      id: String(publicacao.id ?? ''),
      purpose: publicacao.purpose as ChamadaEmCurso['purpose'],
    }
  },

  async versaoPublicadaDoPlaybook(contaId, proposito) {
    const { data, error } = await servico
      .from('playbook_versions')
      .select('id, playbooks!playbook_versions_do_playbook_da_conta!inner(purpose)')
      .eq('account_id', contaId)
      .eq('status', 'published')
      .eq('playbooks.purpose', proposito)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    return { id: String((data as Record<string, unknown>).id ?? '') }
  },

  async registrarLead(contaId, lead) {
    const { data, error } = await servico.rpc('registrar_lead', {
      p_account_id: contaId,
      p_lead: lead,
      // `ignorar` e não `atualizar`: quem liga para a gente não está mandando
      // cadastro nenhum, e o que este caminho sabe do lead é o telefone e o que
      // o DDD dá. Sobrescrever a cidade que a planilha do cliente trouxe com a
      // cidade de referência do DDD seria perder dado melhor por dado pior.
      p_ao_duplicar: 'ignorar',
    })
    if (error) throw new Error(error.message)

    const linha = (Array.isArray(data) ? data[0] : data) as
      | { lead_id: string; resultado: 'criado' | 'ignorado' | 'atualizado' }
      | undefined
    if (!linha) throw new Error('registrar_lead não devolveu linha')
    return { leadId: linha.lead_id, resultado: linha.resultado }
  },

  async leadDaChamada(contaId, leadId) {
    const { data, error } = await servico
      .from('leads')
      .select(COLUNAS_DO_LEAD)
      .eq('account_id', contaId)
      .eq('id', leadId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null

    const lead = data as Record<string, unknown>
    return {
      id: String(lead.id ?? ''),
      name: (lead.name as string | null) ?? null,
      company: (lead.company as string | null) ?? null,
      city: (lead.city as string | null) ?? null,
      state: (lead.state as string | null) ?? null,
    } satisfies LeadDaChamada
  },

  async gravarChamadaRecebida(linha: LinhaDeChamadaRecebida) {
    const { data, error } = await servico
      .from('calls')
      .insert(linha)
      .select(COLUNAS_DA_CHAMADA)
      .maybeSingle()

    // 23505 é o único de `calls_conversa_do_provedor_unica`: o webhook foi
    // reenviado e a linha já existe. É resposta esperada, e não falha.
    if (error && error.code !== '23505') throw new Error(error.message)
    if (!error && data) return { criada: true, chamada: comoChamada(data as Record<string, unknown>) }

    const { data: existente, error: erroDaLeitura } = await servico
      .from('calls')
      .select(COLUNAS_DA_CHAMADA)
      .eq('provider_conversation_id', linha.provider_conversation_id)
      .maybeSingle()
    if (erroDaLeitura) throw new Error(erroDaLeitura.message)
    if (!existente) throw new Error('conflito de conversa sem linha correspondente')
    return { criada: false, chamada: comoChamada(existente as Record<string, unknown>) }
  },

  async identidadeDaConta(contaId) {
    const { data, error } = await servico
      .from('agents')
      .select('name, company_name, first_message')
      .eq('account_id', contaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null

    const agente = data as Record<string, unknown>
    return {
      nome: String(agente.name ?? ''),
      empresa: String(agente.company_name ?? ''),
      primeiraFala: (agente.first_message as string | null) ?? null,
    }
  },

  async politicaDaConta(contaId) {
    const { data, error } = await servico
      .from('account_settings')
      .select('recording_enabled, recording_notice_text')
      .eq('account_id', contaId)
      .maybeSingle()
    if (error) throw new Error(error.message)

    const politica = (data ?? {}) as Record<string, unknown>
    return {
      // Conta sem linha de configuração ainda não desligou nada, e o padrão da
      // coluna é ligada: `recording_enabled` nasce `true` em `account_settings`.
      gravacaoLigada: politica.recording_enabled !== false,
      avisoDeGravacao: (politica.recording_notice_text as string | null) ?? null,
    }
  },

  async perfilDoEnsaio(chamadaId) {
    const { data, error } = await servico
      .from('rehearsals')
      .select('persona_profile')
      .eq('call_id', chamadaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    const perfil = (data as { persona_profile?: Record<string, unknown> } | null)?.persona_profile
    return typeof perfil?.perfil === 'string' ? perfil.perfil : null
  },

  async reuniaoDaChamada(chamadaId) {
    const { data, error } = await servico.rpc('reuniao_em_jogo', { p_call_id: chamadaId })
    if (error) throw new Error(error.message)
    const [linha] = (data ?? []) as Record<string, unknown>[]
    return lerReuniaoEmJogo(linha)
  },
}

Deno.serve(async (requisicao: Request) => {
  let corpo = ''
  if (requisicao.method.toUpperCase() === 'POST') {
    try {
      corpo = await requisicao.text()
    } catch {
      // Corpo ilegível não tem assinatura que confira, e a recusa é a mesma.
    }
  }

  const resposta = await iniciarChamada(
    {
      metodo: requisicao.method,
      corpo,
      assinatura: requisicao.headers.get(CABECALHO_DA_ASSINATURA),
      contaDoEndereco: contaDoEndereco(requisicao.url),
      segredoDoInicio: requisicao.headers.get(CABECALHO_DO_SEGREDO_DO_INICIO),
    },
    porta,
    {
      segredoDoWebhook: SEGREDO_DO_WEBHOOK,
      segredoAnterior: SEGREDO_ANTERIOR,
      rotacionadoEmSegundos: ROTACIONADO_EM,
      agoraEmSegundos: Math.floor(Date.now() / 1000),
      chavesDoServidor: CHAVES_DO_SERVIDOR,
    },
  )

  const saida = resposta.corpo.ok ? corpoParaOProvedor(resposta.corpo) : resposta.corpo

  return new Response(JSON.stringify(saida), {
    status: resposta.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
})
