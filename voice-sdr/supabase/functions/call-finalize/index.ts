// Adaptador Deno da função call-finalize. Só amarração: lê o ambiente, monta a
// porta sobre o Supabase, o Storage e a API do provedor de voz, e entrega a
// decisão para `finalizacao.ts`.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth interna.** Quem chama é `call-events` e a varredura de recuperação,
// com a chave de serviço (o gateway continua em `verify_jwt = true`) e o
// cabeçalho `x-internal-secret`, conferido em `finalizacao.ts` contra
// `SARAH_INTERNAL_SECRET`. Sem a variável, nenhum pedido passa.
//
// **A reivindicação é um comando só.** O `update` do PostgREST com os filtros
// abaixo vira um `update ... where ... returning` no Postgres, e dois pedidos
// no mesmo segundo disputam a linha lá dentro: um recebe a chamada e o outro
// recebe zero linhas. O relógio é o da borda (`agora`), e não o `now()` do
// banco, porque o PostgREST não expõe `now()` num filtro; a diferença entre os
// dois relógios mexe na validade de 5 minutos em segundos, e não na
// atomicidade.
//
// **DEPENDÊNCIAS QUE ESTA FRENTE NÃO CRIA** (a frente de borda da F2 não tem
// migração):
// - o RPC `registrar_primeira_chamada_de_teste(p_call_id uuid)`, que levanta
//   `app.primeira_chamada_de_teste`, confere que a chamada tem transcrição e
//   foi para número de `account_test_numbers`, grava `first_test_call_ok_at`
//   só quando ainda é nulo e é concedido só a `service_role` (US-074). Até ele
//   existir, a chamada abaixo falha, a finalização segue e o portão fica
//   fechado — o lado seguro;
// - o balde `recordings` no Storage.
//
// `call-classify` existe (US-071) e responde 503 quando o modelo falha: o
// acionamento abaixo vira `classificacao: 'falhou'`, e a finalização segue.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { COLUNAS_DO_CRITERIO, lerLinhaDeCriterio } from '../_shared/qualificacao/avaliacao.ts'
import {
  criarCofreDeCredenciais,
  criarLeitorDaPlataforma,
  lerAmbiente,
  type ModoDeCredencial,
  type PortaDeCredenciais,
} from '../_shared/secrets.ts'
import { leitorDoSegredoInterno, lerSegredoDoCofre } from '../_shared/segredo-interno.ts'

import {
  BALDE_DAS_GRAVACOES,
  CABECALHO_INTERNO,
  finalizarChamada,
  type ChamadaReivindicada,
  type PortaDaFinalizacao,
  type RespostaDaConversa,
  type RespostaDoAudio,
} from './finalizacao.ts'
import { caminhoDaConversa, caminhoDoAudio } from './formato-do-provedor.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const AMBIENTE = lerAmbiente(Deno.env.get('SARAH_AMBIENTE'))
const segredoInterno = leitorDoSegredoInterno({
  definido: Deno.env.get('SARAH_INTERNAL_SECRET'),
  lerDoCofre: () => lerSegredoDoCofre(servico),
})

const ENDERECO_DO_PROVEDOR_DE_VOZ = 'https://api.elevenlabs.io/v1'

/** A conversa e o áudio não estão no caminho quente: 20 s antes de desistir. */
const LIMITE_DO_PROVEDOR_MS = 20_000

const COLUNAS_DA_REIVINDICACAO =
  'id, account_id, lead_id, direction, purpose, provider_conversation_id, started_at, classification_source, end_reason'

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const lerPlataforma = criarLeitorDaPlataforma(Deno.env.toObject())

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
    return modo === 'platform' ? 'platform' : ('account' as ModoDeCredencial)
  },
}

const cofre = criarCofreDeCredenciais({ porta: portaDeCredenciais, ambiente: AMBIENTE })

const porta: PortaDaFinalizacao = {
  async reivindicar(chamadaId, agora, vencidaAntesDe) {
    const { data, error } = await servico
      .from('calls')
      .update({ finalize_started_at: agora })
      .eq('id', chamadaId)
      .is('finalized_at', null)
      .or(`finalize_started_at.is.null,finalize_started_at.lt."${vencidaAntesDe}"`)
      .select(COLUNAS_DA_REIVINDICACAO)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as ChamadaReivindicada | null) ?? null
  },

  async politicaDaConta(contaId) {
    const { data, error } = await servico
      .from('account_settings')
      .select('recording_enabled, retention_days, recording_notice_text, max_duration_seconds')
      .eq('account_id', contaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    const linha = (data ?? {}) as Record<string, unknown>
    return {
      // Sem linha, os padrões da migração: gravação ligada, 90 dias, 600 s.
      gravacaoLigada: linha.recording_enabled !== false,
      retencaoEmDias: typeof linha.retention_days === 'number' ? linha.retention_days : 90,
      avisoDeGravacao:
        typeof linha.recording_notice_text === 'string' ? linha.recording_notice_text : null,
      duracaoMaximaEmSegundos:
        typeof linha.max_duration_seconds === 'number' ? linha.max_duration_seconds : 600,
    }
  },

  credencial(contaId, provedor, chave) {
    return cofre.resolveSecret(contaId, provedor, chave)
  },

  async buscarConversa(conversaId, credencial): Promise<RespostaDaConversa> {
    const endpoint = caminhoDaConversa(conversaId)
    const inicio = Date.now()
    try {
      const resposta = await fetch(`${ENDERECO_DO_PROVEDOR_DE_VOZ}/${endpoint}`, {
        headers: { 'xi-api-key': credencial },
        signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS),
      })
      const latenciaMs = Date.now() - inicio
      if (!resposta.ok) {
        await resposta.body?.cancel()
        return { ok: false, status: resposta.status, latenciaMs, endpoint }
      }
      return { ok: true, status: resposta.status, latenciaMs, endpoint, conversa: await resposta.json() }
    } catch (erro) {
      return {
        ok: false,
        codigo: erro instanceof Error ? erro.name : 'fetch_failed',
        status: null,
        latenciaMs: Date.now() - inicio,
        endpoint,
      }
    }
  },

  async baixarAudio(conversaId, credencial): Promise<RespostaDoAudio> {
    const endpoint = caminhoDoAudio(conversaId)
    try {
      const resposta = await fetch(`${ENDERECO_DO_PROVEDOR_DE_VOZ}/${endpoint}`, {
        headers: { 'xi-api-key': credencial },
        signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS),
      })
      if (!resposta.ok) {
        await resposta.body?.cancel()
        return { ok: false, status: resposta.status, endpoint }
      }
      return {
        ok: true,
        status: resposta.status,
        endpoint,
        audio: new Uint8Array(await resposta.arrayBuffer()),
        tipo: resposta.headers.get('content-type'),
      }
    } catch (erro) {
      return { ok: false, codigo: erro instanceof Error ? erro.name : 'fetch_failed', endpoint }
    }
  },

  async guardarGravacao(caminho, audio, tipo) {
    const { error } = await servico.storage
      .from(BALDE_DAS_GRAVACOES)
      .upload(caminho, audio, { contentType: tipo, upsert: true })
    if (error) throw new Error(error.message)
  },

  async gravarDesfecho(contaId, chamadaId, desfecho) {
    const { error } = await servico
      .from('calls')
      .update(desfecho)
      .eq('account_id', contaId)
      .eq('id', chamadaId)
    if (error) throw new Error(error.message)
  },

  async gravarCustos(linhas) {
    const { error } = await servico
      .from('call_costs')
      .upsert([...linhas], { onConflict: 'call_id,component,source', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  },

  async gravarInvocacoes(linhas) {
    // `ignoreDuplicates` com `select` é `on conflict do nothing returning`: só
    // volta o que acabou de entrar, que é o que a reaplicação pode tocar.
    const { data, error } = await servico
      .from('call_tool_invocations')
      .upsert([...linhas], { onConflict: 'call_id,tool,at', ignoreDuplicates: true })
      .select('tool, at')
    if (error) throw new Error(error.message)
    return (data ?? []) as { tool: string; at: string }[]
  },

  async registrarConsentimento(linha) {
    // `consent_records` não tem único por chamada. A leitura antes da escrita
    // aqui não é o verificar-e-agir de T-15: ela só roda sob a reivindicação,
    // que é de uma passagem por vez, e cobre a segunda passagem depois de uma
    // primeira que caiu entre este insert e o `finalized_at`.
    const { data, error: erroDaBusca } = await servico
      .from('consent_records')
      .select('id')
      .eq('call_id', linha.call_id)
      .eq('kind', linha.kind)
      .limit(1)
    if (erroDaBusca) throw new Error(erroDaBusca.message)
    if (Array.isArray(data) && data.length > 0) return
    const { error } = await servico.from('consent_records').insert(linha)
    if (error) throw new Error(error.message)
  },

  async registrarPrimeiraChamadaDeTeste(chamadaId) {
    const { error } = await servico.rpc('registrar_primeira_chamada_de_teste', { p_call_id: chamadaId })
    if (error) {
      console.warn(JSON.stringify({ funcao: 'call-finalize', passo: 'primeira_chamada_de_teste', erro: error.message }))
      throw new Error(error.message)
    }
  },

  async invocacoesDaChamada(chamadaId) {
    const { data, error } = await servico
      .from('call_tool_invocations')
      .select('tool, error')
      .eq('call_id', chamadaId)
    if (error) throw new Error(error.message)
    return (data ?? []) as { tool: string; error: string | null }[]
  },

  async acionarClassificacao(chamadaId) {
    const resposta = await fetch(`${URL_DO_SUPABASE}/functions/v1/call-classify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CABECALHO_INTERNO]: await segredoInterno(),
        authorization: `Bearer ${CHAVE_DE_SERVICO}`,
      },
      body: JSON.stringify({ call_id: chamadaId }),
    })
    await resposta.body?.cancel()
    if (!resposta.ok) throw new Error(`call-classify respondeu ${resposta.status}`)
  },

  async registrarEventoDeIntegracao(evento) {
    const { error } = await servico.from('integration_events').insert(evento)
    if (error) throw new Error(error.message)
  },

  // A reaplicação do bloqueio (R-02) usa as mesmas leituras e RPCs de
  // `tool-dnc/index.ts`: o único parcial de `dnc_entries` é o que a torna
  // idempotente, e só se alcança pelo RPC.
  async numerosDaChamada(contaId, chamadaId) {
    const { data, error } = await servico
      .from('calls')
      .select('from_number, to_number, lead_id')
      .eq('account_id', contaId)
      .eq('id', chamadaId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    let doLead: string | null = null
    if (data?.lead_id) {
      const { data: lead, error: erroDoLead } = await servico
        .from('leads')
        .select('phone_e164')
        .eq('account_id', contaId)
        .eq('id', data.lead_id)
        .maybeSingle()
      if (erroDoLead) throw new Error(erroDoLead.message)
      doLead = lead?.phone_e164 ?? null
    }
    return { de: data?.from_number ?? null, para: data?.to_number ?? null, doLead }
  },

  async bloquearNumero(pedido) {
    const { data, error } = await servico.rpc('bloquear_numero_pela_ferramenta', {
      p_account_id: pedido.contaId,
      p_phone_e164: pedido.telefone,
      p_source: pedido.origem,
      p_reason: pedido.motivo,
      p_notes: pedido.notas,
      p_blocked_at: pedido.instante,
    })
    if (error) throw new Error(error.message)
    const linha = (Array.isArray(data) ? data[0] : data) as { blocked_at: string; criado: boolean } | undefined
    if (!linha?.blocked_at) throw new Error('bloqueio sem instante na resposta')
    return { blockedAt: new Date(linha.blocked_at).toISOString(), criado: linha.criado === true }
  },

  async abrirItemDeBloqueio(item) {
    const { error } = await servico.rpc('criar_excecao', {
      p_account_id: item.contaId,
      p_kind: 'dnc_requested',
      p_severity: 'baixa',
      p_call_id: item.chamadaId,
      p_lead_id: item.leadId,
      p_context: item.contexto,
    })
    if (error) throw new Error(error.message)
  },

  // A mescla mora no RPC: trocar a coluna inteira pelo PostgREST apagaria o
  // juízo do modelo que `call-classify` gravou.
  async registrarMedicaoDaAvaliacao(contaId, chamadaId, criterio, medicao) {
    const { error } = await servico.rpc('registrar_medicao_da_avaliacao', {
      p_account_id: contaId,
      p_call_id: chamadaId,
      p_criterio: criterio,
      p_medicao: medicao,
    })
    if (error) throw new Error(error.message)
  },

  async criteriosDaConta(contaId) {
    const { data, error } = await servico
      .from('evaluation_criteria')
      .select(COLUNAS_DO_CRITERIO)
      .eq('account_id', contaId)
      .order('position')
    if (error) throw new Error(error.message)
    return (data ?? []).map(lerLinhaDeCriterio)
  },

  async registrarAvaliacaoAutomatica(contaId, chamadaId, itens, nota) {
    const { error } = await servico.rpc('registrar_avaliacao_automatica', {
      p_account_id: contaId,
      p_call_id: chamadaId,
      p_itens: itens,
      p_nota: nota,
    })
    if (error) throw new Error(error.message)
  },

  async lerResultadoDaChamada(chamadaId) {
    const { data, error } = await servico
      .from('calls')
      .select('classification_source, classification, sentiment, evaluation')
      .eq('id', chamadaId)
      .single()
    if (error) throw new Error(error.message)
    return data as {
      classification_source: string | null
      classification: unknown
      sentiment: number | null
      evaluation: unknown
    }
  },

  async gravarSentimento(contaId, chamadaId, leadId, valor, fonte) {
    const { error } = await servico
      .from('calls')
      .update({ sentiment: valor, sentiment_source: fonte })
      .eq('account_id', contaId)
      .eq('id', chamadaId)
    if (error) throw new Error(error.message)
    if (leadId === null) return
    const { error: erroDoLead } = await servico
      .from('leads')
      .update({ last_sentiment: valor })
      .eq('account_id', contaId)
      .eq('id', leadId)
    if (erroDoLead) throw new Error(erroDoLead.message)
  },

  async limiaresDaFila(contaId) {
    const [configuracao, conta] = await Promise.all([
      servico
        .from('account_settings')
        .select('sentiment_floor, consecutive_failures_cap, failed_criteria_cap, credit_alert_cents')
        .eq('account_id', contaId)
        .single(),
      servico.from('accounts').select('timezone').eq('id', contaId).single(),
    ])
    if (configuracao.error) throw new Error(configuracao.error.message)
    if (conta.error) throw new Error(conta.error.message)
    const linha = configuracao.data as {
      sentiment_floor: number | string
      consecutive_failures_cap: number
      failed_criteria_cap: number
      credit_alert_cents: number | null
    }
    return {
      limiares: {
        // `numeric` chega como texto pelo PostgREST.
        sentiment_floor: Number(linha.sentiment_floor),
        consecutive_failures_cap: linha.consecutive_failures_cap,
        failed_criteria_cap: linha.failed_criteria_cap,
        credit_alert_cents: linha.credit_alert_cents,
      },
      fuso: (conta.data as { timezone: string }).timezone,
    }
  },

  // Quem conta as tentativas é o banco, em `call_attempts` (T-05).
  async falhasConsecutivas(contaId, chamadaId) {
    const { data, error } = await servico.rpc('falhas_consecutivas', {
      p_account_id: contaId,
      p_call_id: chamadaId,
    })
    if (error) throw new Error(error.message)
    const linha = (Array.isArray(data) ? data[0] : data) as { phone_e164?: string; falhas?: number } | undefined
    if (!linha || typeof linha.phone_e164 !== 'string') return null
    return { telefone: linha.phone_e164, falhas: Number(linha.falhas ?? 0) }
  },

  async registrarItemDeFila(contaId, item) {
    const { data, error } = await servico.rpc('registrar_item_de_fila', {
      p_account_id: contaId,
      p_kind: item.kind,
      p_severity: item.severity,
      p_deduplicacao_key: item.deduplicacaoKey,
      p_context: item.context,
      p_threshold_snapshot: item.thresholdSnapshot,
      p_lead_id: item.leadId,
      p_call_id: item.callId,
    })
    if (error) throw new Error(error.message)
    if (data !== 'criado' && data !== 'ja_aberto') throw new Error('registro do item sem situação conhecida')
    return data
  },

  async reprogramarTentativa(chamadaId, resultado, agora) {
    const { error } = await servico.rpc('reprogramar_tentativa', {
      p_call_id: chamadaId,
      p_resultado: resultado,
      p_agora: agora,
    })
    if (error) throw new Error(error.message)
  },

  async concluirFinalizacao(contaId, chamadaId, agora) {
    const { error } = await servico
      .from('calls')
      .update({ finalized_at: agora })
      .eq('account_id', contaId)
      .eq('id', chamadaId)
    if (error) throw new Error(error.message)
  },
}

Deno.serve(async (requisicao: Request) => {
  let corpo: Record<string, unknown> | null = null
  try {
    corpo = (await requisicao.json()) as Record<string, unknown> | null
  } catch {
    // Corpo ausente ou ilegível cai em chamada_invalida, que já tem frase.
  }

  const resposta = await finalizarChamada(
    {
      metodo: requisicao.method,
      chamadaId: corpo?.call_id ?? null,
      segredoInterno: requisicao.headers.get(CABECALHO_INTERNO),
    },
    porta,
    { segredoInterno: await segredoInterno(), agora: new Date().toISOString() },
  )

  return new Response(JSON.stringify(resposta.corpo), {
    status: resposta.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
})
