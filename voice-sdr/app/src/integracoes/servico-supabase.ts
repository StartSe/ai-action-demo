import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import { gerarChaveDeEntrada, hashDaChaveDeEntrada } from '@compartilhado/chave-de-entrada'
import type {
  CargaDaEntradaDeLeads,
  CargaDasIntegracoes,
  GiroDaChaveDeEntrada,
  GravacaoDaChave,
  Integracao,
  MotivoDeFalhaDasIntegracoes,
  ProvedorId,
  ServicoDeIntegracoes,
  TesteDaIntegracao,
} from '@/integracoes/tipos'

/** Função de borda que sonda os provedores com as credenciais da conta. */
const FUNCAO_DE_ESTADO = 'integrations-status'

/** RPC que grava o hash da chave do endereço público e devolve só o instante. */
const RPC_GIRAR_CHAVE_DE_ENTRADA = 'girar_chave_de_entrada'

/** A função de borda que recebe o lead de fora (RF-107). */
const FUNCAO_DE_ENTRADA = 'lead-intake'

/** O endereço público da função, a partir do endereço do projeto. */
export function enderecoDaEntrada(urlDoProjeto: string | null | undefined): string | null {
  if (!urlDoProjeto) return null
  return `${urlDoProjeto.replace(/\/+$/, '')}/functions/v1/${FUNCAO_DE_ENTRADA}`
}

/** RPC do cofre. Grava no Vault e devolve o id do metadado, nunca o valor. */
const RPC_GRAVAR_CHAVE = 'set_account_secret'

/** A política de RLS, ou o `has_role` do cofre, recusou. */
const PRIVILEGIO_INSUFICIENTE = '42501'
/** `raise ... using errcode = '42501'` chega ao cliente sem `code` nomeado. */
const RECUSA_DO_COFRE = /dono|permission denied|42501/i

function classificar(erro: PostgrestError | null): MotivoDeFalhaDasIntegracoes {
  if (erro?.code === PRIVILEGIO_INSUFICIENTE) return 'sem-permissao'
  if (erro?.message && RECUSA_DO_COFRE.test(erro.message)) return 'sem-permissao'
  return 'falha-de-comunicacao'
}

/**
 * O corpo da borda já vem no formato da tela: é o mesmo contrato, declarado dos
 * dois lados. A conversão aqui é só a checagem de forma — resposta truncada ou
 * de uma versão mais velha da função não deve virar cartão pela metade.
 */
function paraIntegracao(bruto: unknown): Integracao | null {
  const item = bruto as Partial<Integracao> | null
  if (!item || typeof item.provedor !== 'string') return null
  if (typeof item.estado !== 'string') return null

  return {
    provedor: item.provedor as ProvedorId,
    rotulo: item.rotulo ?? item.provedor,
    fornecedor: item.fornecedor ?? '',
    estado: item.estado,
    configurado: item.configurado === true,
    conectado: item.conectado === true,
    credito: item.credito ?? null,
    cota: item.cota ?? null,
    erro: item.erro ?? null,
    chaves: Array.isArray(item.chaves) ? item.chaves : [],
    bloqueia: item.bloqueia ?? '',
  }
}

export function criarServicoDeIntegracoes(
  cliente: SupabaseClient,
  urlDoProjeto?: string | null,
): ServicoDeIntegracoes {
  /** Conta em que o usuário da sessão trabalha, ou o motivo de não haver uma. */
  async function contaAtual(): Promise<
    { id: string } | MotivoDeFalhaDasIntegracoes
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

  /** Pergunta o estado à borda, de todos os provedores ou de um recorte. */
  async function consultar(
    provedores?: ProvedorId[],
  ): Promise<CargaDasIntegracoes> {
    const conta = await contaAtual()
    if (typeof conta === 'string') return { ok: false, motivo: conta }

    const { data, error } = await cliente.functions.invoke(FUNCAO_DE_ESTADO, {
      body: { contaId: conta.id, ...(provedores ? { provedores } : {}) },
    })

    if (error) return { ok: false, motivo: 'falha-de-comunicacao' }

    const corpo = data as { ok?: boolean; provedores?: unknown[] } | null
    if (corpo?.ok !== true || !Array.isArray(corpo.provedores)) {
      return { ok: false, motivo: 'falha-de-comunicacao' }
    }

    const integracoes = corpo.provedores
      .map(paraIntegracao)
      .filter((item): item is Integracao => item !== null)

    return { ok: true, integracoes }
  }

  return {
    carregar: () => consultar(),

    async testar(provedor): Promise<TesteDaIntegracao> {
      const carga = await consultar([provedor])
      if (!carga.ok) return carga

      const integracao = carga.integracoes.find(
        (item) => item.provedor === provedor,
      )
      if (!integracao) return { ok: false, motivo: 'falha-de-comunicacao' }

      return { ok: true, integracao }
    },

    async salvar(provedor, valores): Promise<GravacaoDaChave> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      // Uma chamada por chave: `set_account_secret` grava uma credencial, e é
      // ela quem decide o papel exigido. A primeira recusa interrompe — seguir
      // gravando o resto depois de um "não" só espalharia meia configuração.
      for (const [chave, valor] of Object.entries(valores)) {
        const { error } = await cliente.rpc(RPC_GRAVAR_CHAVE, {
          p_account_id: conta.id,
          p_provider: provedor,
          p_key_name: chave,
          p_secret: valor,
        })

        if (error) return { ok: false, motivo: classificar(error) }
      }

      return { ok: true }
    },

    async carregarEntradaDeLeads(): Promise<CargaDaEntradaDeLeads> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      // Só o instante: o hash não sai daqui, e a chave em claro não existe no banco.
      const { data, error } = await cliente
        .from('accounts')
        .select('intake_key_rotated_at')
        .eq('id', conta.id)
        .maybeSingle()
      if (error) return { ok: false, motivo: classificar(error) }

      return {
        ok: true,
        entrada: {
          endereco: enderecoDaEntrada(urlDoProjeto),
          geradaEm: (data?.intake_key_rotated_at as string | null | undefined) ?? null,
        },
      }
    },

    async girarChaveDeEntrada(): Promise<GiroDaChaveDeEntrada> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      // A chave nasce aqui e só o hash viaja (cabeçalho de
      // 20260921130000_chave_de_entrada.sql).
      const chave = gerarChaveDeEntrada()
      const { data, error } = await cliente.rpc(RPC_GIRAR_CHAVE_DE_ENTRADA, {
        p_account_id: conta.id,
        p_hash: await hashDaChaveDeEntrada(chave),
      })
      if (error) return { ok: false, motivo: classificar(error) }

      return { ok: true, chave, geradaEm: String(data) }
    },
  }
}
