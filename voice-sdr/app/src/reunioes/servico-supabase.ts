// O serviço de reuniões sobre o Supabase (US-179, RF-510).
//
// **A lista lê de `reunioes_reais`, nunca de `meetings`.** A visão é
// `meetings` sem a reunião marcada num ensaio (T-16), com `security_invoker`,
// e é ela que o teste de banco prova. `recorte.origens` não vira filtro na
// consulta: a visão já é esse filtro, e a coluna `booked_call_id` só diz se a
// reunião veio de ligação ou foi marcada à mão.
//
// **O teto se mede pedindo uma a mais.** `limit(TETO + 1)`: a linha a mais é o
// que diz que havia mais, sem uma contagem à parte.
//
// **"A conta tem reunião?" é pergunta própria**, feita só quando o recorte
// volta vazio: é ela que separa "nenhuma reunião marcada" de "o recorte não
// achou nada".
//
// **A ficha (US-180) lê pela mesma visão, por id.** Zero linha é
// `nao-encontrada`, e é o mesmo para a reunião que não existe, a de outra
// conta e a de ensaio: a RLS e a visão já as tiram, e distinguir os casos
// seria oráculo de existência. Id que nem é uuid (22P02) também é
// `nao-encontrada`, pela mesma razão. As duas ligações do histórico se leem
// numa segunda consulta, a `calls`: a que a leitura não achar fica sem link.
//
// **O desfecho (US-181) vai por `marcar_desfecho_da_reuniao`, nunca por
// `update`.** O gatilho `meetings_desfecho_pelo_rpc` recusa a sessão que mude
// status ou apuração direto. O RPC devolve código, e a tradução é de
// `desfecho.ts`. As marcações da ficha se leem de `audit_log` da reunião,
// que todo membro lê: é ali que ficam as duas quando a segunda sobrescreve a
// primeira.

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import { colunasDoConvite, type EntregaDoConvite, type LadoDoConvite } from '@compartilhado/agenda/convite-de-reuniao.ts'

import type { Modalidade } from '@/especialistas/tipos'
import { TETO_DA_LISTA } from '@/reunioes/consulta'
import { marcacoesDaTrilha, traduzirCodigoDoDesfecho, type LinhaDaTrilha } from '@/reunioes/desfecho'
import type {
  ApuracaoDaReuniao,
  CargaDaFicha,
  ChamadaDaReuniao,
  ContextoDasReunioes,
  EspecialistaDaAgenda,
  EstadoDaReuniao,
  FichaDaReuniao,
  MotivoDeFalhaDasReunioes,
  ReuniaoDaLista,
  ServicoDeReunioes,
} from '@/reunioes/tipos'

/** O fuso de reserva, o mesmo default de `accounts.timezone`. */
const FUSO_DE_RESERVA = 'America/Sao_Paulo'

function colunasDeEntrega(lado: LadoDoConvite): string {
  return Object.values(colunasDoConvite(lado)).join(', ')
}

const COLUNAS_DA_REUNIAO =
  'id, starts_at, ends_at, modality, status, attestation_status, booked_call_id, external_event_id, event_attempts, ' +
  `${colunasDeEntrega('lead')}, ${colunasDeEntrega('especialista')}`

/** As colunas que a agenda e a lista desenham. O nome das do convite vem da borda. */
export const COLUNAS_DA_LISTA =
  `${COLUNAS_DA_REUNIAO}, ` + 'lead:leads(id, name, email), especialista:specialists(id, name, timezone)'

/** As da lista, mais o que só a ficha desenha. */
export const COLUNAS_DA_FICHA =
  `${COLUNAS_DA_REUNIAO}, event_error, event_retry_at, cancel_reason, notes, handoff_summary, ` +
  'created_at, confirmed_at, confirmed_call_id, ' +
  'lead:leads(id, name, email, phone_e164, company, timezone), ' +
  'especialista:specialists(id, name, timezone, room_url)'

/** O que a leitura pode dar de errado. `filtro-invalido` é da busca, e nunca do banco. */
type FalhaDaLeitura = Exclude<MotivoDeFalhaDasReunioes, 'filtro-invalido'>

function classificar(erro: PostgrestError): FalhaDaLeitura {
  return erro.code === '42501' ? 'sem-permissao' : 'falha-de-comunicacao'
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {}
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor !== '' ? valor : null
}

function entregaDe(linha: Record<string, unknown>, lado: LadoDoConvite): EntregaDoConvite {
  const colunas = colunasDoConvite(lado)
  return {
    enviadoEm: textoOuNulo(linha[colunas.enviadoEm]),
    tentativas: Number(linha[colunas.tentativas] ?? 0),
    erro: textoOuNulo(linha[colunas.erro]),
    proximaTentativa: textoOuNulo(linha[colunas.proximaTentativa]),
  }
}

export function paraReuniao(linha: Record<string, unknown>): ReuniaoDaLista {
  const lead = objeto(linha.lead)
  const especialista = objeto(linha.especialista)
  const chamada = textoOuNulo(linha.booked_call_id)
  return {
    id: String(linha.id),
    inicio: String(linha.starts_at),
    fim: String(linha.ends_at),
    modalidade: String(linha.modality) as Modalidade,
    estado: String(linha.status) as EstadoDaReuniao,
    apuracao: (textoOuNulo(linha.attestation_status) ?? 'pending') as ApuracaoDaReuniao,
    origem: chamada ? 'ligacao' : 'manual',
    chamadaDaMarcacao: chamada,
    lead: {
      id: String(lead.id ?? ''),
      nome: String(lead.name ?? ''),
      temEmail: textoOuNulo(lead.email) !== null,
    },
    especialista: {
      id: String(especialista.id ?? ''),
      nome: String(especialista.name ?? ''),
      fuso: textoOuNulo(especialista.timezone) ?? FUSO_DE_RESERVA,
    },
    evento: {
      externoId: textoOuNulo(linha.external_event_id),
      tentativas: Number(linha.event_attempts ?? 0),
    },
    conviteDoLead: entregaDe(linha, 'lead'),
    conviteDoEspecialista: entregaDe(linha, 'especialista'),
  }
}

/** Quantas linhas da trilha da reunião a ficha lê: muito acima do que uma reunião junta. */
const TETO_DA_TRILHA = 200

export function paraFicha(
  linha: Record<string, unknown>,
  fusoDaConta: string,
  chamadas: readonly ChamadaDaReuniao[],
  trilha: readonly LinhaDaTrilha[] = [],
): FichaDaReuniao {
  const reuniao = paraReuniao(linha)
  const lead = objeto(linha.lead)
  const especialista = objeto(linha.especialista)
  return {
    ...reuniao,
    fusoDaConta,
    fusoDoLead: textoOuNulo(lead.timezone) ?? fusoDaConta,
    lead: {
      ...reuniao.lead,
      email: textoOuNulo(lead.email),
      telefone: textoOuNulo(lead.phone_e164),
      empresa: textoOuNulo(lead.company),
    },
    sala: textoOuNulo(especialista.room_url),
    motivoDoCancelamento: textoOuNulo(linha.cancel_reason),
    notas: textoOuNulo(linha.notes),
    resumoDePassagem: linha.handoff_summary ?? null,
    marcadaEm: String(linha.created_at),
    confirmadaEm: textoOuNulo(linha.confirmed_at),
    chamadaDaConfirmacao: textoOuNulo(linha.confirmed_call_id),
    chamadas,
    evento: {
      ...reuniao.evento,
      erro: textoOuNulo(linha.event_error),
      proximaTentativa: textoOuNulo(linha.event_retry_at),
    },
    marcacoes: marcacoesDaTrilha(trilha, reuniao.estado),
  }
}

export function criarServicoDeReunioes(cliente: SupabaseClient): ServicoDeReunioes {
  async function contaAtual(): Promise<{ id: string; fuso: string } | FalhaDaLeitura> {
    const { data: autenticado } = await cliente.auth.getUser()
    const usuarioId = autenticado.user?.id
    if (!usuarioId) return 'sem-permissao'

    const { data, error } = await cliente
      .from('account_members')
      .select('account_id, accounts(timezone)')
      .eq('user_id', usuarioId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) return classificar(error)
    if (!data) return 'sem-conta'
    const conta = data.accounts as { timezone?: unknown } | null
    return {
      id: data.account_id as string,
      fuso: typeof conta?.timezone === 'string' ? conta.timezone : FUSO_DE_RESERVA,
    }
  }

  return {
    async carregarContexto(): Promise<ContextoDasReunioes> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('specialists')
        .select('id, name, timezone, active')
        .eq('account_id', conta.id)
        .order('name', { ascending: true })
      if (error) return { ok: false, motivo: classificar(error) }

      const especialistas: EspecialistaDaAgenda[] = ((data ?? []) as Record<string, unknown>[]).map(
        (linha) => ({
          id: String(linha.id),
          nome: String(linha.name),
          fuso: textoOuNulo(linha.timezone) ?? FUSO_DE_RESERVA,
          ativo: linha.active === true,
        }),
      )
      return { ok: true, fusoDaConta: conta.fuso, especialistas }
    },

    async listarReunioes(recorte) {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      let consulta = cliente
        .from('reunioes_reais')
        .select(COLUNAS_DA_LISTA)
        .eq('account_id', conta.id)
      if (recorte.desde) consulta = consulta.gte('starts_at', recorte.desde)
      if (recorte.ate) consulta = consulta.lt('starts_at', recorte.ate)
      if (recorte.especialistaId) consulta = consulta.eq('specialist_id', recorte.especialistaId)
      if (recorte.estado) consulta = consulta.eq('status', recorte.estado)
      if (recorte.modalidade) consulta = consulta.eq('modality', recorte.modalidade)

      const { data, error } = await consulta
        .order('starts_at', { ascending: recorte.crescente })
        .order('id', { ascending: true })
        .limit(TETO_DA_LISTA + 1)
      if (error) return { ok: false, motivo: classificar(error) }

      const linhas = (data ?? []) as unknown as Record<string, unknown>[]
      const reunioes = linhas.slice(0, TETO_DA_LISTA).map(paraReuniao)

      let contaTemReuniao = reunioes.length > 0
      if (!contaTemReuniao) {
        const { data: alguma, error: erro } = await cliente
          .from('reunioes_reais')
          .select('id')
          .eq('account_id', conta.id)
          .limit(1)
        if (erro) return { ok: false, motivo: classificar(erro) }
        contaTemReuniao = (alguma ?? []).length > 0
      }

      return {
        ok: true,
        pagina: { reunioes, truncada: linhas.length > TETO_DA_LISTA, contaTemReuniao },
      }
    },

    async carregarFicha(id): Promise<CargaDaFicha> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('reunioes_reais')
        .select(COLUNAS_DA_FICHA)
        .eq('account_id', conta.id)
        .eq('id', id)
        .maybeSingle()
      if (error) return { ok: false, motivo: error.code === '22P02' ? 'nao-encontrada' : classificar(error) }
      if (!data) return { ok: false, motivo: 'nao-encontrada' }

      const linha = data as unknown as Record<string, unknown>
      const ids = [textoOuNulo(linha.booked_call_id), textoOuNulo(linha.confirmed_call_id)].filter(
        (valor): valor is string => valor !== null,
      )
      let chamadas: ChamadaDaReuniao[] = []
      if (ids.length > 0) {
        const { data: lidas, error: erro } = await cliente
          .from('calls')
          .select('id, started_at')
          .in('id', [...new Set(ids)])
        if (erro) return { ok: false, motivo: classificar(erro) }
        chamadas = ((lidas ?? []) as Record<string, unknown>[]).map((chamada) => ({
          id: String(chamada.id),
          iniciadaEm: String(chamada.started_at),
        }))
      }

      const { data: trilha, error: erroDaTrilha } = await cliente
        .from('audit_log')
        .select('actor_id, reason, payload, created_at')
        .eq('account_id', conta.id)
        .eq('target_type', 'meetings')
        .eq('target_id', id)
        .eq('action', 'update')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(TETO_DA_TRILHA)
      if (erroDaTrilha) return { ok: false, motivo: classificar(erroDaTrilha) }

      return {
        ok: true,
        ficha: paraFicha(linha, conta.fuso, chamadas, (trilha ?? []) as unknown as LinhaDaTrilha[]),
      }
    },

    async marcarDesfecho(pedido) {
      const { data, error } = await cliente.rpc('marcar_desfecho_da_reuniao', {
        p_meeting_id: pedido.reuniaoId,
        p_desfecho: pedido.desfecho,
        p_motivo: pedido.motivo,
        p_sobrescrever: pedido.sobrescrever,
      })
      if (error) {
        if (error.code === '22P02') return { ok: false, motivo: 'nao-encontrada' }
        return { ok: false, motivo: error.code === '42501' ? 'sem-papel' : 'falha-de-comunicacao' }
      }
      return traduzirCodigoDoDesfecho(data)
    },
  }
}
