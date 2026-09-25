// O serviço de números sobre o Supabase: lê e grava `phone_lines` e chama
// `phone-register` para pôr o número no provedor (US-065).
//
// Cadastrar são duas escritas, nessa ordem: a linha entra no banco pela RLS de
// admin, e só então a borda registra o número lá fora e grava
// `provider_number_id`. A ordem é a de US-065 — a borda recebe o id da linha e
// lê dali o comportamento de entrada —, e o preço é a linha poder ficar só na
// configuração quando o provedor recusa. A tela mostra esse caso e oferece
// registrar de novo; o registro é idempotente do lado da borda.
//
// `health` é lido e nunca escrito: o gatilho `proteger_saude_da_linha`
// descartaria a escrita de qualquer forma, e mandar a coluna num `update`
// seria prometer à tela uma edição que não existe.

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import type {
  ResultadoDaExclusao,
  CargaDeNumeros,
  ComportamentoDeEntrada,
  LinhaTelefonica,
  MotivoDeFalhaDeNumeros,
  RespostaDoRegistro,
  ResultadoDoRegistro,
  ServicoDeNumeros,
} from '@/numeros/tipos'

/** A política de RLS recusou: `has_role(account_id, 'admin')` disse não. */
const PRIVILEGIO_INSUFICIENTE = '42501'

/** `phone_lines_unico_por_conta`: o mesmo número duas vezes na conta. */
const VIOLACAO_DE_UNICO = '23505'

/** A borda que registra o número no provedor (US-065). */
const FUNCAO_DE_REGISTRO = 'phone-register'

const COLUNAS =
  'id, e164, label, provider, inbound_behavior, forward_to, outbound_enabled, in_rotation, daily_cap, health, provider_number_id, enabled'

const COMPORTAMENTOS = new Set<string>(['agent', 'forward', 'voicemail'])

function paraLinha(linha: Record<string, unknown>): LinhaTelefonica {
  const comportamento = String(linha.inbound_behavior)
  return {
    id: String(linha.id),
    e164: String(linha.e164),
    rotulo: String(linha.label),
    provedor: String(linha.provider),
    // O check da coluna só aceita os três; o recuo para `agent` é o do padrão
    // da coluna, para um valor novo no banco não quebrar a tela inteira.
    comportamento: (COMPORTAMENTOS.has(comportamento)
      ? comportamento
      : 'agent') as ComportamentoDeEntrada,
    encaminharPara: (linha.forward_to as string | null) ?? null,
    saidaLigada: linha.outbound_enabled === true,
    noRodizio: linha.in_rotation === true,
    tetoDiario: Number(linha.daily_cap),
    saude: linha.health ?? {},
    registradaNoProvedor: linha.provider_number_id != null,
    ligada: linha.enabled === true,
  }
}

function classificar(erro: PostgrestError | null): MotivoDeFalhaDeNumeros {
  if (erro?.code === PRIVILEGIO_INSUFICIENTE) return 'sem-permissao'
  if (erro?.code === VIOLACAO_DE_UNICO) return 'numero-repetido'
  return 'falha-de-comunicacao'
}

/**
 * O corpo de uma função de borda que respondeu fora de 2xx. O cliente do
 * Supabase entrega esse caso como erro, com a resposta em `context`.
 */
async function corpoDoErro(erro: unknown): Promise<unknown> {
  const contexto = (erro as { context?: unknown } | null)?.context
  if (!(contexto instanceof Response)) return null
  try {
    return await contexto.json()
  } catch {
    return null
  }
}

export function criarServicoDeNumeros(cliente: SupabaseClient): ServicoDeNumeros {
  async function contaAtual(): Promise<{ id: string } | MotivoDeFalhaDeNumeros> {
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

  async function registrar(linhaId: string): Promise<ResultadoDoRegistro> {
    // A conta vai junto porque a borda a exige: ela confere o papel de quem
    // pediu contra a conta, e não deduz a conta pela linha — deduzir deixaria
    // quem tem o id de uma linha alheia registrar número de outra empresa.
    const conta = await contaAtual()
    if (typeof conta === 'string') {
      // Sem conta resolvida não há o que registrar, e o estado honesto é o
      // mesmo do provedor que recusou: a linha existe e o cartão continua
      // oferecendo "registrar de novo".
      return { estado: 'nao_registrada', mensagem: null }
    }

    const { data, error } = await cliente.functions.invoke(FUNCAO_DE_REGISTRO, {
      body: { linhaId, contaId: conta.id },
    })
    const corpo = (error ? await corpoDoErro(error) : data) as
      | RespostaDoRegistro
      | null

    if (corpo?.ok === true) {
      // `registrado` e `inalterado` terminaram no provedor; só
      // `aguardando_aprovacao` é a espera normal do pacote regulatório (P-04).
      // A tela não distingue "registrado agora" de "já estava registrado
      // assim": as duas são a mesma linha ativa, sem nada pendente.
      return corpo.estado === 'aguardando_aprovacao'
        ? { estado: 'aguardando_operadora' }
        : { estado: 'registrada' }
    }

    return {
      estado: 'nao_registrada',
      mensagem:
        corpo?.ok === false && typeof corpo.mensagem === 'string'
          ? corpo.mensagem
          : null,
    }
  }

  return {
    async carregar(): Promise<CargaDeNumeros> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('phone_lines')
        .select(COLUNAS)
        .eq('account_id', conta.id)
        .order('created_at', { ascending: true })

      if (error) return { ok: false, motivo: classificar(error) }
      return { ok: true, linhas: (data ?? []).map(paraLinha) }
    },

    async cadastrar(dados) {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('phone_lines')
        .insert({
          account_id: conta.id,
          e164: dados.e164,
          label: dados.rotulo,
          inbound_behavior: dados.comportamento,
          forward_to: dados.encaminharPara,
        })
        .select(COLUNAS)
        .maybeSingle()

      if (error) return { ok: false, motivo: classificar(error) }
      if (!data) return { ok: false, motivo: 'sem-permissao' }

      const linha = paraLinha(data)
      const registro = await registrar(linha.id)
      return {
        ok: true,
        linha: {
          ...linha,
          registradaNoProvedor: registro.estado === 'registrada',
        },
        registro,
      }
    },

    async alterar(linhaId, mudanca) {
      const colunas: Record<string, boolean> = {}
      if (mudanca.saidaLigada !== undefined) {
        colunas.outbound_enabled = mudanca.saidaLigada
      }
      if (mudanca.noRodizio !== undefined) {
        colunas.in_rotation = mudanca.noRodizio
      }

      // Recusa da RLS é silenciosa no update: sem linha de volta, é recusa.
      const { data, error } = await cliente
        .from('phone_lines')
        .update(colunas)
        .eq('id', linhaId)
        .select(COLUNAS)

      if (error) return { ok: false, motivo: classificar(error) }
      const linha = data?.[0]
      if (!linha) return { ok: false, motivo: 'sem-permissao' }
      return { ok: true, linha: paraLinha(linha) }
    },

    registrarDeNovo: registrar,

    async excluir(linhaId): Promise<ResultadoDaExclusao> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      // Lê antes de apagar para saber se a linha chegou a ser registrada: o
      // dado some no delete, e é ele que diz se o número continua apontando
      // para cá do lado da telefonia.
      const { data: antes, error: erroDaLeitura } = await cliente
        .from('phone_lines')
        .select('provider_voice_id, provider_number_id')
        .eq('id', linhaId)
        .eq('account_id', conta.id)
        .maybeSingle()

      if (erroDaLeitura) return { ok: false, motivo: classificar(erroDaLeitura) }
      if (!antes) return { ok: false, motivo: 'sem-permissao' }

      const anterior = antes as Record<string, unknown>
      const registrada = Boolean(
        anterior.provider_voice_id ?? anterior.provider_number_id,
      )

      const { data, error } = await cliente
        .from('phone_lines')
        .delete()
        .eq('id', linhaId)
        .eq('account_id', conta.id)
        .select('id')

      if (error) return { ok: false, motivo: classificar(error) }
      // `returning` vazio com a linha existindo é política que negou.
      if (!data || data.length === 0) return { ok: false, motivo: 'sem-permissao' }

      return { ok: true, aindaNoProvedor: registrada }
    },
  }
}
