// O serviço da política de discagem sobre o Supabase: lê as colunas de
// `account_settings` e grava por `definir_politica_de_discagem`.
//
// A escrita não é `update` direto, embora a política de RLS de admin o
// permita: o motivo (RF-008) só chega à trilha por parâmetro de sessão, e o
// cliente não tem como levantá-lo. O RPC recebe só as colunas que mudaram, e a
// trilha registra só elas.

import { normalizarTelefone } from '@compartilhado/telefone'

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import { criarServicoDeAutomacao } from '@/automacao/servico-supabase'

import type {
  CargaDaLigacaoAoLeadNovo,
  CargaDoPortao,
  GravacaoDaLigacaoAoLeadNovo,
  LigacaoAoLeadNovo,
  FaltaNoPortao,
  RemocaoDoNumeroDeTeste,
  MotivoDeFalhaDoNumeroDeTeste,
  GravacaoDoNumeroDeTeste,
  CargaDaPolitica,
  GravacaoDaPolitica,
  MotivoDeFalhaDaDiscagem,
  PoliticaDeDiscagem,
  ServicoDeDiscagem,
} from '@/discagem/tipos'

/** `has_role(..., 'admin')` disse não, na RLS ou no corpo do RPC. */
const PRIVILEGIO_INSUFICIENTE = '42501'

/**
 * O banco recusou o valor: argumento fora do domínio (o gatilho da janela e o
 * próprio RPC), violação de check e texto que não vira número.
 */
const VALOR_RECUSADO = new Set(['22023', '23514', '22P02', '23502'])

const COLUNAS =
  'dialing_window, min_interval_minutes, daily_attempts_per_number, daily_calls_cap, daily_spend_cap_cents, max_duration_seconds, max_concurrent'

/** Nome da coluna para cada campo; é também a chave que o RPC aceita. */
const COLUNA_DO_CAMPO: Record<keyof PoliticaDeDiscagem, string> = {
  janela: 'dialing_window',
  intervaloMinimoMinutos: 'min_interval_minutes',
  tentativasPorNumero: 'daily_attempts_per_number',
  tetoDiarioDeLigacoes: 'daily_calls_cap',
  tetoDeGastoCentavos: 'daily_spend_cap_cents',
  duracaoMaximaSegundos: 'max_duration_seconds',
  simultaneidade: 'max_concurrent',
}

/**
 * Os códigos de `estado_do_portao` no vocabulário de `_shared/discagem/portao.ts`.
 * Código fora do mapa é resposta que a tela não sabe desenhar, e vira falha:
 * descartá-lo mostraria "liberado" com uma condição faltando.
 */
const FALTA_DO_CODIGO: ReadonlyMap<string, FaltaNoPortao> = new Map([
  ['real_dialing', 'liberacao_da_fase'],
  ['first_test_call', 'primeira_chamada_de_teste'],
])

function paraPolitica(linha: Record<string, unknown>): PoliticaDeDiscagem {
  const gasto = linha.daily_spend_cap_cents
  return {
    janela: (linha.dialing_window ?? {}) as PoliticaDeDiscagem['janela'],
    intervaloMinimoMinutos: Number(linha.min_interval_minutes),
    tentativasPorNumero: Number(linha.daily_attempts_per_number),
    tetoDiarioDeLigacoes: Number(linha.daily_calls_cap),
    tetoDeGastoCentavos: gasto === null || gasto === undefined ? null : Number(gasto),
    duracaoMaximaSegundos: Number(linha.max_duration_seconds),
    simultaneidade: Number(linha.max_concurrent),
  }
}

function paraColunas(mudancas: Partial<PoliticaDeDiscagem>): Record<string, unknown> {
  const colunas: Record<string, unknown> = {}
  for (const [campo, valor] of Object.entries(mudancas)) {
    colunas[COLUNA_DO_CAMPO[campo as keyof PoliticaDeDiscagem]] = valor
  }
  return colunas
}

function classificar(erro: PostgrestError | null): MotivoDeFalhaDaDiscagem {
  if (erro?.code === PRIVILEGIO_INSUFICIENTE) return 'sem-permissao'
  if (erro?.code && VALOR_RECUSADO.has(erro.code)) return 'valor-recusado'
  return 'falha-de-comunicacao'
}

function paraLigacaoAoLeadNovo(linha: Record<string, unknown>): LigacaoAoLeadNovo {
  const minutos = Number(linha.speed_to_lead_minutes)
  return {
    ligada: linha.speed_to_lead_enabled === true,
    prazoMinutos: Number.isFinite(minutos) ? minutos : 5,
  }
}

export function criarServicoDeDiscagem(cliente: SupabaseClient): ServicoDeDiscagem {
  async function contaAtual(): Promise<{ id: string; fuso: string } | MotivoDeFalhaDaDiscagem> {
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
      fuso: typeof conta?.timezone === 'string' ? conta.timezone : 'America/Sao_Paulo',
    }
  }

  return {
    automacao: criarServicoDeAutomacao(cliente),
    async carregar(): Promise<CargaDaPolitica> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('account_settings')
        .select(COLUNAS)
        .eq('account_id', conta.id)
        .maybeSingle()

      if (error) return { ok: false, motivo: classificar(error) }
      return {
        ok: true,
        politica: data ? paraPolitica(data as Record<string, unknown>) : null,
        fusoDaConta: conta.fuso,
      }
    },

    async salvar(mudancas, motivo): Promise<GravacaoDaPolitica> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente.rpc('definir_politica_de_discagem', {
        p_account_id: conta.id,
        p_politica: paraColunas(mudancas),
        p_motivo: motivo,
      })

      if (error) return { ok: false, motivo: classificar(error) }
      return { ok: true, politica: paraPolitica(data as Record<string, unknown>) }
    },

    async ligacaoAoLeadNovo(): Promise<CargaDaLigacaoAoLeadNovo> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('account_settings')
        .select('speed_to_lead_enabled, speed_to_lead_minutes')
        .eq('account_id', conta.id)
        .maybeSingle()

      if (error) return { ok: false, motivo: classificar(error) }
      return { ok: true, configuracao: data ? paraLigacaoAoLeadNovo(data) : null }
    },

    async salvarLigacaoAoLeadNovo(configuracao, motivo): Promise<GravacaoDaLigacaoAoLeadNovo> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente.rpc('definir_ligacao_ao_lead_novo', {
        p_account_id: conta.id,
        p_ligada: configuracao.ligada,
        p_minutos: configuracao.prazoMinutos,
        p_motivo: motivo,
      })

      if (error) return { ok: false, motivo: classificar(error) }
      return { ok: true, configuracao: paraLigacaoAoLeadNovo(data as Record<string, unknown>) }
    },

    async portao(): Promise<CargaDoPortao> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .rpc('estado_do_portao', { p_account_id: conta.id })
        .maybeSingle()

      if (error) return { ok: false, motivo: classificar(error) }
      if (!data) return { ok: false, motivo: 'sem-conta' }

      const linha = data as { falta?: unknown; first_test_call_ok_at?: unknown }
      const codigos = Array.isArray(linha.falta) ? linha.falta : null
      const falta = codigos?.map((codigo) => FALTA_DO_CODIGO.get(String(codigo)))
      if (!falta || falta.some((item) => item === undefined)) {
        return { ok: false, motivo: 'falha-de-comunicacao' }
      }

      return {
        ok: true,
        portao: {
          falta: falta as FaltaNoPortao[],
          primeiraChamadaDeTesteEm:
            typeof linha.first_test_call_ok_at === 'string' ? linha.first_test_call_ok_at : null,
        },
      }
    },

    async numerosDeTeste() {
      const conta = await contaAtual()
      if (typeof conta === 'string') return 'falha-de-comunicacao' as const

      const { data, error } = await cliente
        .from('account_test_numbers')
        .select('id, phone_e164, label')
        .eq('account_id', conta.id)
        .order('created_at', { ascending: true })

      if (error) return 'falha-de-comunicacao' as const
      return (data ?? []).map((linha: Record<string, unknown>) => ({
        id: String(linha.id),
        e164: String(linha.phone_e164),
        rotulo: String(linha.label),
      }))
    },

    async cadastrarNumeroDeTeste(numero, rotulo): Promise<GravacaoDoNumeroDeTeste> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: 'falha-de-comunicacao' }

      const nome = rotulo.trim()
      if (!nome) return { ok: false, motivo: 'rotulo-obrigatorio' }

      // O mesmo normalizador de `leads.phone_e164`, e de propósito: é este
      // número que a guarda vai comparar com o do lead, e duas réguas
      // diferentes fariam o portão recusar o próprio número de teste.
      const normalizado = normalizarTelefone(numero)
      if (!normalizado.ok) return { ok: false, motivo: 'numero-invalido' }

      const { data, error } = await cliente
        .from('account_test_numbers')
        .insert({
          account_id: conta.id,
          phone_e164: normalizado.e164,
          label: nome,
        })
        .select('id, phone_e164, label')
        .maybeSingle()

      if (error) return { ok: false, motivo: classificarNumero(error) }
      if (!data) return { ok: false, motivo: 'sem-permissao' }

      const linha = data as Record<string, unknown>
      return {
        ok: true,
        numero: {
          id: String(linha.id),
          e164: String(linha.phone_e164),
          rotulo: String(linha.label),
        },
      }
    },

    async removerNumeroDeTeste(id): Promise<RemocaoDoNumeroDeTeste> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: 'falha-de-comunicacao' }

      // `returning` vazio é política que negou, não linha inexistente: é a
      // diferença que a tela precisa para dizer a quem pedir.
      const { data, error } = await cliente
        .from('account_test_numbers')
        .delete()
        .eq('id', id)
        .eq('account_id', conta.id)
        .select('id')

      if (error) return { ok: false, motivo: classificarNumero(error) }
      if (!data || data.length === 0) return { ok: false, motivo: 'sem-permissao' }
      return { ok: true }
    },
  }
}

/**
 * O que o banco recusou, no vocabulário da tela. O único da conta e o teto por
 * gatilho têm frases próprias porque cada um tem uma saída diferente: um pede
 * outro número, o outro pede apagar um da lista.
 */
function classificarNumero(erro: PostgrestError): MotivoDeFalhaDoNumeroDeTeste {
  if (erro.code === '23505') return 'ja-cadastrado'
  if (erro.code === '23514') return 'teto-atingido'
  if (erro.code === '42501' || /row-level security/i.test(erro.message)) {
    return 'sem-permissao'
  }
  return 'falha-de-comunicacao'
}
