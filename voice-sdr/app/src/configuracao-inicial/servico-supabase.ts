import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import type {
  AcaoDaConfiguracao,
  Bloqueio,
  CargaDaConfiguracao,
  EstadoMedido,
  MotivoDeFalhaDaConfiguracao,
  PassoId,
  PassoMedido,
  ProgressoDeclarado,
  ServicoDeConfiguracaoInicial,
} from '@/configuracao-inicial/tipos'

/**
 * Recalcula a medição, grava o retrato e o devolve. É `security definer`
 * porque atravessa o cofre, que o cliente não lê; o que volta é sim ou não
 * por passo, nunca a linha.
 */
const RPC_MEDIR = 'onboarding_health_refresh'

/** A política de RLS recusou. Escrever na configuração é ato de admin. */
const PRIVILEGIO_INSUFICIENTE = '42501'

const PASSOS_CONHECIDOS: readonly string[] = [
  'credenciais',
  'agente',
  'roteiro',
  'numero',
  'especialista',
  'agenda',
  'leads',
  'equipe',
]

const BLOQUEIOS_CONHECIDOS: readonly string[] = [
  'ligacao',
  'agendamento',
  'campanha',
]

const ESTADOS_CONHECIDOS: readonly string[] = [
  'pendente',
  'aguardando_aprovacao',
  'concluido',
]

interface LinhaDeConfiguracao {
  current_step: string | null
  completed_steps: string[] | null
  dismissed_at: string | null
  test_call_id: string | null
}

function classificar(
  erro: PostgrestError | null,
): MotivoDeFalhaDaConfiguracao {
  return erro?.code === PRIVILEGIO_INSUFICIENTE
    ? 'sem-permissao'
    : 'falha-de-comunicacao'
}

function paraPassoId(valor: unknown): PassoId | null {
  return typeof valor === 'string' && PASSOS_CONHECIDOS.includes(valor)
    ? (valor as PassoId)
    : null
}

function paraBloqueios(valor: unknown): Bloqueio[] {
  if (!Array.isArray(valor)) return []
  return valor.filter((item): item is Bloqueio =>
    typeof item === 'string' ? BLOQUEIOS_CONHECIDOS.includes(item) : false,
  )
}

/**
 * Retrato gravado por uma versão anterior do servidor não tem `estado`. Nesse
 * caso ele se deduz do que há, que é o que o servidor faria: só o terceiro
 * estado se perde, e ele reaparece no primeiro recálculo.
 */
function paraEstado(valor: unknown, pendente: boolean): EstadoMedido {
  if (typeof valor === 'string' && ESTADOS_CONHECIDOS.includes(valor)) {
    return valor as EstadoMedido
  }
  return pendente ? 'pendente' : 'concluido'
}

/**
 * Passo do retrato que este cliente não conhece é passo de uma versão mais
 * nova do catálogo: some da tela em vez de virar linha pela metade.
 */
function paraPasso(bruto: unknown): PassoMedido | null {
  const item = bruto as Record<string, unknown> | null
  const passo = paraPassoId(item?.passo)
  if (!item || !passo) return null

  const pendente = item.pendente !== false

  return {
    passo,
    ordem: typeof item.ordem === 'number' ? item.ordem : 0,
    pendente,
    marcado: item.marcado === true,
    disponivel: item.disponivel === true,
    bloqueia: paraBloqueios(item.bloqueia),
    estado: paraEstado(item.estado, pendente),
  }
}

export function criarServicoDeConfiguracaoInicial(
  cliente: SupabaseClient,
): ServicoDeConfiguracaoInicial {
  /** Conta em que o usuário da sessão trabalha, ou o motivo de não haver uma. */
  async function contaAtual(): Promise<
    { id: string } | MotivoDeFalhaDaConfiguracao
  > {
    const { data: autenticado } = await cliente.auth.getUser()
    const usuarioId = autenticado.user?.id
    if (!usuarioId) return 'sem-permissao'

    const { data, error } = await cliente
      .from('account_members')
      .select('account_id')
      .eq('user_id', usuarioId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) return classificar(error)
    if (!data) return 'sem-conta'
    return { id: data.account_id as string }
  }

  return {
    async carregar(): Promise<CargaDaConfiguracao> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      // A medição e o progresso declarado vêm em duas chamadas porque são duas
      // coisas: o RPC mede o dado e o select lê o que a pessoa declarou.
      const [medicao, declarado] = await Promise.all([
        cliente.rpc(RPC_MEDIR, { p_account_id: conta.id }),
        cliente
          .from('onboarding_state')
          .select('current_step, completed_steps, dismissed_at, test_call_id')
          .eq('account_id', conta.id)
          .maybeSingle(),
      ])

      if (medicao.error) {
        return { ok: false, motivo: classificar(medicao.error) }
      }
      if (declarado.error) {
        return { ok: false, motivo: classificar(declarado.error) }
      }

      const retrato = medicao.data as { passos?: unknown[] } | null
      const passos = (Array.isArray(retrato?.passos) ? retrato.passos : [])
        .map(paraPasso)
        .filter((passo): passo is PassoMedido => passo !== null)

      const linha = declarado.data as LinhaDeConfiguracao | null

      return {
        ok: true,
        configuracao: {
          passos,
          passoAtual: paraPassoId(linha?.current_step),
          dispensada: Boolean(linha?.dismissed_at),
          ligacaoDeTeste: linha?.test_call_id ?? null,
        },
      }
    },

    async salvar(progresso: ProgressoDeclarado): Promise<AcaoDaConfiguracao> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      // `health` fica de fora, e nem adiantaria mandá-la: um gatilho no banco
      // descarta toda escrita dessa coluna que não venha do RPC de medição.
      const { data, error } = await cliente
        .from('onboarding_state')
        .update({
          current_step: progresso.passoAtual,
          completed_steps: progresso.marcados,
          dismissed_at: progresso.dispensada
            ? new Date().toISOString()
            : null,
          test_call_id: progresso.ligacaoDeTeste,
        })
        .eq('account_id', conta.id)
        .select('account_id')

      if (error) return { ok: false, motivo: classificar(error) }
      // Update recusado pela RLS não levanta erro: o `using` simplesmente não
      // casa e nenhuma linha volta. Quem não administra a conta cai aqui.
      if (!data.length) return { ok: false, motivo: 'sem-permissao' }

      return { ok: true }
    },
  }
}
