// A porta de `call-finalize` escrita sobre o banco de teste, para os testes de
// `testes/banco/` rodarem `finalizarChamada` de verdade contra as migrações.
//
// É do teste, e não o `index.ts`: aquele é adaptador Deno sobre o PostgREST, e
// o que ele faz de diferente (o `upsert` com `ignoreDuplicates`) é o `on
// conflict do nothing returning` escrito aqui à mão. Membro novo em
// `PortaDaFinalizacao` entra aqui, no `index.ts` e nos dublês de
// `finalizacao.test.ts` e `recuperacao.test.ts`.

import type { ChamadaReivindicada, PortaDaFinalizacao } from '../../supabase/functions/call-finalize/finalizacao.ts'

import type { ClienteSql } from './banco-de-teste.ts'

/** Instante como texto ISO, que é o que a porta devolve à finalização. */
export const ISO = (coluna: string): string => `to_json(${coluna}) #>> '{}'`

export interface AjustesDaPorta {
  /** Quantas conclusões falham antes de a primeira dar certo. */
  readonly conclusaoFalha?: number
  /** O acionamento de `call-classify`; ausente é não fazer nada. */
  readonly acionarClassificacao?: (chamadaId: string) => Promise<void>
}

/**
 * A porta da finalização escrita sobre o banco de teste, com a conversa do
 * provedor fixa. `conversa` é o corpo que o provedor devolveria.
 */
export function portaDaFinalizacaoSobreOBanco(
  q: ClienteSql,
  conversa: unknown,
  ajustes: AjustesDaPorta = {},
): PortaDaFinalizacao {
  let conclusoesQueFalham = ajustes.conclusaoFalha ?? 0

  return {
    async reivindicar(chamadaId, agora, vencidaAntesDe) {
      const { rows } = await q.query<ChamadaReivindicada>(
        `update public.calls set finalize_started_at = $2
          where id = $1
            and finalized_at is null
            and (finalize_started_at is null or finalize_started_at < $3)
         returning id, account_id, lead_id, direction, purpose, provider_conversation_id,
                   ${ISO('started_at')} as started_at, classification_source, end_reason`,
        [chamadaId, agora, vencidaAntesDe],
      )
      return rows[0] ?? null
    },
    async politicaDaConta(conta) {
      const { rows } = await q.query<{
        recording_enabled: boolean
        retention_days: number
        recording_notice_text: string | null
        max_duration_seconds: number
      }>(
        `select recording_enabled, retention_days, recording_notice_text, max_duration_seconds
           from public.account_settings where account_id = $1`,
        [conta],
      )
      const linha = rows[0]!
      return {
        gravacaoLigada: linha.recording_enabled,
        retencaoEmDias: linha.retention_days,
        avisoDeGravacao: linha.recording_notice_text,
        duracaoMaximaEmSegundos: linha.max_duration_seconds,
      }
    },
    async credencial() {
      return { ok: true, valor: 'xi-credencial-do-teste-0001', origem: 'conta' }
    },
    async buscarConversa() {
      return { ok: true, status: 200, conversa }
    },
    async baixarAudio() {
      return { ok: false, status: 404 }
    },
    async guardarGravacao() {
      throw new Error('as fixtures não têm áudio')
    },
    async gravarDesfecho(conta, chamadaId, d) {
      await q.query(
        `update public.calls
            set status = $3, transcript = $4::jsonb, duration_sec = $5, answered_at = $6,
                ended_at = $7, answered_by = $8, end_reason = $9, recording_path = $10,
                recording_expires_at = $11, consent_notice_at = $12
          where account_id = $1 and id = $2`,
        [
          conta, chamadaId, d.status, JSON.stringify(d.transcript), d.duration_sec, d.answered_at,
          d.ended_at, d.answered_by, d.end_reason, d.recording_path, d.recording_expires_at,
          d.consent_notice_at,
        ],
      )
    },
    async gravarCustos(linhas) {
      for (const l of linhas) {
        await q.query(
          `insert into public.call_costs (account_id, call_id, component, amount_cents, currency, source)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (call_id, component, source) do nothing`,
          [l.account_id, l.call_id, l.component, l.amount_cents, l.currency, l.source],
        )
      }
    },
    // De trás para frente, de propósito: a ordem que a tela mostra tem que vir
    // de `at`, e não da ordem em que as linhas entraram.
    async gravarInvocacoes(linhas) {
      const inseridas: { tool: string; at: string }[] = []
      for (const l of [...linhas].reverse()) {
        const { rows } = await q.query<{ tool: string; at: string }>(
          `insert into public.call_tool_invocations
             (account_id, call_id, tool, request, response, latency_ms, error, at)
           values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8)
           on conflict (call_id, tool, at) do nothing
           returning tool, ${ISO('at')} as at`,
          [
            l.account_id, l.call_id, l.tool, JSON.stringify(l.request), JSON.stringify(l.response),
            l.latency_ms, l.error, l.at,
          ],
        )
        inseridas.push(...rows)
      }
      return inseridas
    },
    async registrarConsentimento(l) {
      await q.query(
        `insert into public.consent_records (account_id, lead_id, call_id, kind, granted, evidence, at)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [l.account_id, l.lead_id, l.call_id, l.kind, l.granted, JSON.stringify(l.evidence), l.at],
      )
    },
    async registrarPrimeiraChamadaDeTeste(chamadaId) {
      await q.query('select public.registrar_primeira_chamada_de_teste($1)', [chamadaId])
    },
    async invocacoesDaChamada(chamadaId) {
      const { rows } = await q.query<{ tool: string; error: string | null }>(
        'select tool, error from public.call_tool_invocations where call_id = $1',
        [chamadaId],
      )
      return rows
    },
    async acionarClassificacao(chamadaId) {
      await ajustes.acionarClassificacao?.(chamadaId)
    },
    async registrarEventoDeIntegracao(e) {
      await q.query(
        `insert into public.integration_events
           (account_id, direction, provider, endpoint, request, response, status_code, latency_ms, correlation_id)
         values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)`,
        [
          e.account_id, e.direction, e.provider, e.endpoint, JSON.stringify(e.request),
          JSON.stringify(e.response), e.status_code, e.latency_ms, e.correlation_id,
        ],
      )
    },
    async numerosDaChamada(conta, chamadaId) {
      const { rows } = await q.query<{ from_number: string | null; to_number: string | null; do_lead: string | null }>(
        `select c.from_number, c.to_number, l.phone_e164 as do_lead
           from public.calls c left join public.leads l on l.id = c.lead_id
          where c.account_id = $1 and c.id = $2`,
        [conta, chamadaId],
      )
      const linha = rows[0]
      return { de: linha?.from_number ?? null, para: linha?.to_number ?? null, doLead: linha?.do_lead ?? null }
    },
    async bloquearNumero(p) {
      const { rows } = await q.query<{ blocked_at: string; criado: boolean }>(
        `select ${ISO('blocked_at')} as blocked_at, criado
           from public.bloquear_numero_pela_ferramenta($1, $2, $3, $4, $5, $6)`,
        [p.contaId, p.telefone, p.origem, p.motivo, p.notas, p.instante],
      )
      return { blockedAt: new Date(rows[0]!.blocked_at).toISOString(), criado: rows[0]!.criado }
    },
    async abrirItemDeBloqueio(item) {
      await q.query(`select public.criar_excecao($1, 'dnc_requested', 'baixa', $2, $3, $4::jsonb)`, [
        item.contaId, item.chamadaId, item.leadId, JSON.stringify(item.contexto),
      ])
    },
    async registrarMedicaoDaAvaliacao(conta, chamadaId, criterio, medicao) {
      await q.query('select public.registrar_medicao_da_avaliacao($1, $2, $3, $4::jsonb)', [
        conta, chamadaId, criterio, JSON.stringify(medicao),
      ])
    },
    async lerResultadoDaChamada(chamadaId) {
      const { rows } = await q.query<{
        classification_source: string | null
        classification: unknown
        sentiment: string | null
        evaluation: unknown
      }>('select classification_source, classification, sentiment, evaluation from public.calls where id = $1', [
        chamadaId,
      ])
      const linha = rows[0]!
      return { ...linha, sentiment: linha.sentiment === null ? null : Number(linha.sentiment) }
    },
    async gravarSentimento(conta, chamadaId, leadId, valor, fonte) {
      await q.query(
        'update public.calls set sentiment = $3, sentiment_source = $4 where account_id = $1 and id = $2',
        [conta, chamadaId, valor, fonte],
      )
      if (leadId !== null) {
        await q.query('update public.leads set last_sentiment = $3 where account_id = $1 and id = $2', [
          conta, leadId, valor,
        ])
      }
    },
    async limiaresDaFila(conta) {
      const { rows } = await q.query<{
        sentiment_floor: string
        consecutive_failures_cap: number
        failed_criteria_cap: number
        credit_alert_cents: number | null
        timezone: string
      }>(
        `select s.sentiment_floor, s.consecutive_failures_cap, s.failed_criteria_cap, s.credit_alert_cents, a.timezone
           from public.account_settings s join public.accounts a on a.id = s.account_id
          where s.account_id = $1`,
        [conta],
      )
      const linha = rows[0]!
      return {
        limiares: {
          sentiment_floor: Number(linha.sentiment_floor),
          consecutive_failures_cap: linha.consecutive_failures_cap,
          failed_criteria_cap: linha.failed_criteria_cap,
          credit_alert_cents: linha.credit_alert_cents,
        },
        fuso: linha.timezone,
      }
    },
    async falhasConsecutivas(conta, chamadaId) {
      const { rows } = await q.query<{ phone_e164: string; falhas: number }>(
        'select phone_e164, falhas from public.falhas_consecutivas($1, $2)',
        [conta, chamadaId],
      )
      const linha = rows[0]
      return linha ? { telefone: linha.phone_e164, falhas: linha.falhas } : null
    },
    async registrarItemDeFila(conta, item) {
      const { rows } = await q.query<{ situacao: 'criado' | 'ja_aberto' }>(
        'select public.registrar_item_de_fila($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8) as situacao',
        [
          conta, item.kind, item.severity, item.deduplicacaoKey, JSON.stringify(item.context),
          JSON.stringify(item.thresholdSnapshot), item.leadId, item.callId,
        ],
      )
      return rows[0]!.situacao
    },
    async criteriosDaConta(conta) {
      const { rows } = await q.query<{
        key: string
        label: string
        obrigatorio: boolean
        como: 'trecho' | 'modelo'
        trechos: string[]
        position: number
      }>(
        `select key, label, obrigatorio, como, trechos, position
           from public.evaluation_criteria where account_id = $1 order by position`,
        [conta],
      )
      return rows
    },
    async registrarAvaliacaoAutomatica(conta, chamadaId, itens, nota) {
      await q.query('select public.registrar_avaliacao_automatica($1, $2, $3::jsonb, $4)', [
        conta, chamadaId, JSON.stringify(itens), nota,
      ])
    },
    async reprogramarTentativa(chamadaId, resultado, agora) {
      await q.query('select public.reprogramar_tentativa($1, $2, $3)', [chamadaId, resultado, agora])
    },
    async concluirFinalizacao(conta, chamadaId, agora) {
      if (conclusoesQueFalham > 0) {
        conclusoesQueFalham -= 1
        throw new Error('banco caiu antes de finalized_at')
      }
      await q.query('update public.calls set finalized_at = $3 where account_id = $1 and id = $2', [
        conta, chamadaId, agora,
      ])
    },
  }
}
