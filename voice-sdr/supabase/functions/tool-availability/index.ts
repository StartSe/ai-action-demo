// Adaptador Deno da função tool-availability. Só amarração: lê o ambiente,
// monta as portas sobre o Supabase com a chave de serviço e entrega a decisão
// para `disponibilidade.ts`, que roda sobre o esqueleto das ferramentas.
//
// Fora do typecheck e do lint da raiz, como todo `index.ts` de função: quem o
// verifica é o `deno check` de `npm run check:funcoes`, no CI.
//
// **Auth secret** (`verify_jwt = false` em `config.toml`): quem chama é o
// provedor de voz, no meio da ligação, com `x-tool-secret` e
// `x-conversation-id`. O esqueleto confere o segredo antes de qualquer leitura
// por conversa.
//
// **A `PortaDeFerramentas` vem de `_shared/tools/porta-do-supabase.ts`**, que
// esta terceira ferramenta extraiu das duas cópias. O cliente entra convertido
// (`as unknown as ClienteDasFerramentas`) porque os genéricos do PostgREST não
// se comparam com o recorte pelo compilador.
//
// **Só o banco (T-10).** Nenhuma leitura aqui vai ao calendário externo: a
// ocupação de fora já está em `specialist_busy_blocks`, escrita por
// `cron-calendar-sync`.
//
// **A troca das ofertas é apagar e inserir**, nessa ordem, em duas idas: o
// único `(call_id, position)` recusaria a posição 1 nova ao lado da velha. Se a
// inserção falhar depois da exclusão, a chamada fica sem oferta nenhuma e a
// Sarah ouve a frase de contorno — o lado seguro, porque `tool-book-meeting`
// não acha posição para marcar. `expires_at` fica para o gatilho
// `vencimento_da_oferta()`.
//
// **PARA O CI:** o `deno check` deste arquivo e a suíte de contrato
// (`scripts/contrato-das-ferramentas.ts`) contra a função implantada.

import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  ROTULO_DA_CHAVE_DE_FERRAMENTAS,
  segredoDaInstalacao,
} from '../_shared/segredo-da-instalacao.ts'

import { CABECALHO_DA_CONVERSA, type AmbienteDaFerramenta } from '../_shared/tools/esqueleto.ts'
import { criarPortaDeFerramentas, type ClienteDasFerramentas } from '../_shared/tools/porta-do-supabase.ts'

import {
  criarToolAvailability,
  type AgendaDoEspecialista,
  type EscritaDaDisponibilidade,
  type EspecialistaDaConta,
  type PortaDeDisponibilidade,
} from './disponibilidade.ts'

const URL_DO_SUPABASE = Deno.env.get('SUPABASE_URL') ?? ''
const CHAVE_DE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
/**
 * A variável, quando alguém a definiu; senão derivada da chave de serviço
 * (`_shared/segredo-da-instalacao.ts`). `agent-publish` precisa resolver pelo
 * mesmo caminho para os dois lados concordarem.
 */
const CHAVE_DE_FERRAMENTAS = await segredoDaInstalacao({
  definido: Deno.env.get('SARAH_TOOL_SERVER_KEY'),
  chaveDeServico: CHAVE_DE_SERVICO,
  rotulo: ROTULO_DA_CHAVE_DE_FERRAMENTAS,
})
const CHAVE_ANTERIOR = Deno.env.get('SARAH_TOOL_SERVER_KEY_ANTERIOR') ?? null
/** ISO 8601 com fuso. Vira milissegundos, que é o que `segredo.ts` lê. */
const ROTACIONADA_EM = (() => {
  const bruto = Deno.env.get('SARAH_TOOL_SERVER_KEY_ROTACIONADA_EM') ?? ''
  const instante = Date.parse(bruto)
  return Number.isFinite(instante) ? instante : null
})()

const CABECALHOS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }

const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const porta = criarPortaDeFerramentas(servico as unknown as ClienteDasFerramentas)

interface LinhaDeEspecialista {
  id: string
  area: string | null
  active: boolean
  timezone: string
  default_duration_min: number
  daily_cap: number
  min_notice_min: number
  max_notice_days: number
  last_assigned_at: string | null
}

interface LinhaDeFaixa {
  specialist_id: string
  weekday: number
  start_time: string
  end_time: string
}

interface LinhaDeIntervalo {
  specialist_id: string
  starts_at: string
  ends_at: string
}

interface LinhaDeReuniao extends LinhaDeIntervalo {
  status: string
}

function falhou(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

const leitura: PortaDeDisponibilidade = {
  async configuracaoDaConta(contaId) {
    const [configuracao, conta] = await Promise.all([
      servico.from('account_settings').select('routing_mode, fixed_specialist_id').eq('account_id', contaId).single(),
      servico.from('accounts').select('timezone').eq('id', contaId).single(),
    ])
    falhou(configuracao.error)
    falhou(conta.error)
    if (!configuracao.data || !conta.data) throw new Error('conta sem configuração')
    return {
      modo: configuracao.data.routing_mode,
      especialistaFixo: configuracao.data.fixed_specialist_id,
      fusoDaConta: conta.data.timezone,
    }
  },

  async fusoDoLead(contaId, leadId) {
    const { data, error } = await servico
      .from('leads')
      .select('timezone')
      .eq('account_id', contaId)
      .eq('id', leadId)
      .maybeSingle()
    falhou(error)
    return data?.timezone ?? null
  },

  async especialistasDaConta(contaId) {
    const [especialistas, faixas] = await Promise.all([
      servico
        .from('specialists')
        .select(
          'id, area, active, timezone, default_duration_min, daily_cap, min_notice_min, max_notice_days, last_assigned_at',
        )
        .eq('account_id', contaId),
      servico
        .from('specialist_availability')
        .select('specialist_id, weekday, start_time, end_time')
        .eq('account_id', contaId),
    ])
    falhou(especialistas.error)
    falhou(faixas.error)
    const faixasDe = new Map<string, LinhaDeFaixa[]>()
    for (const faixa of (faixas.data ?? []) as LinhaDeFaixa[]) {
      faixasDe.set(faixa.specialist_id, [...(faixasDe.get(faixa.specialist_id) ?? []), faixa])
    }
    return ((especialistas.data ?? []) as LinhaDeEspecialista[]).map(
      (linha): EspecialistaDaConta => ({
        id: linha.id,
        area: linha.area,
        ativo: linha.active,
        fuso: linha.timezone,
        duracaoPadraoMin: linha.default_duration_min,
        tetoDiario: linha.daily_cap,
        antecedenciaMinimaMin: linha.min_notice_min,
        antecedenciaMaximaDias: linha.max_notice_days,
        ultimaAtribuicaoEm: linha.last_assigned_at,
        disponibilidade: (faixasDe.get(linha.id) ?? []).map((faixa) => ({
          diaDaSemana: faixa.weekday,
          inicio: faixa.start_time,
          fim: faixa.end_time,
        })),
      }),
    )
  },

  async agendaNoPeriodo(contaId, especialistaIds, periodo) {
    // Intersecta `[de, ate)`: começa antes do fim do período e termina depois do começo.
    const noPeriodo = (tabela: string, colunas: string) =>
      servico
        .from(tabela)
        .select(colunas)
        .eq('account_id', contaId)
        .in('specialist_id', [...especialistaIds])
        .lt('starts_at', periodo.ate)
        .gt('ends_at', periodo.de)
    const [bloqueios, ocupacao, reunioes] = await Promise.all([
      noPeriodo('specialist_blocks', 'specialist_id, starts_at, ends_at'),
      noPeriodo('specialist_busy_blocks', 'specialist_id, starts_at, ends_at'),
      noPeriodo('meetings', 'specialist_id, starts_at, ends_at, status'),
    ])
    falhou(bloqueios.error)
    falhou(ocupacao.error)
    falhou(reunioes.error)
    const intervalo = (linha: LinhaDeIntervalo) => ({ inicio: linha.starts_at, fim: linha.ends_at })
    return especialistaIds.map(
      (id): AgendaDoEspecialista => ({
        especialistaId: id,
        bloqueios: ((bloqueios.data ?? []) as unknown as LinhaDeIntervalo[])
          .filter((linha) => linha.specialist_id === id)
          .map(intervalo),
        ocupacaoExterna: ((ocupacao.data ?? []) as unknown as LinhaDeIntervalo[])
          .filter((linha) => linha.specialist_id === id)
          .map(intervalo),
        reunioes: ((reunioes.data ?? []) as unknown as LinhaDeReuniao[])
          .filter((linha) => linha.specialist_id === id)
          .map((linha) => ({ ...intervalo(linha), status: linha.status })),
      }),
    )
  },
}

const escrita: EscritaDaDisponibilidade = {
  async substituirOfertas(contaId, chamadaId, ofertas) {
    const apagadas = await servico
      .from('call_slot_offers')
      .delete()
      .eq('account_id', contaId)
      .eq('call_id', chamadaId)
    falhou(apagadas.error)
    if (ofertas.length === 0) return
    const inseridas = await servico
      .from('call_slot_offers')
      .insert(ofertas.map((oferta) => ({ ...oferta, account_id: contaId, call_id: chamadaId })))
    falhou(inseridas.error)
  },
}

const tratar = criarToolAvailability(leitura)

const ambiente: AmbienteDaFerramenta<EscritaDaDisponibilidade> = {
  porta,
  escrita,
  chaves: { vigente: CHAVE_DE_FERRAMENTAS, anterior: CHAVE_ANTERIOR, rotacionadaEm: ROTACIONADA_EM },
}

Deno.serve(async (requisicao) => {
  let corpo: unknown = null
  try {
    corpo = await requisicao.json()
  } catch {
    corpo = null
  }
  const resposta = await tratar(
    {
      metodo: requisicao.method,
      segredo: requisicao.headers.get('x-tool-secret'),
      conversa: requisicao.headers.get(CABECALHO_DA_CONVERSA),
      corpo,
    },
    ambiente,
  )
  return new Response(JSON.stringify(resposta.corpo), { status: resposta.status, headers: CABECALHOS })
})
