import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import {
  gerarTokenDeConvite,
  hashDeToken,
} from '@compartilhado/token-de-convite.ts'
import type {
  AcaoDaEquipe,
  ConviteCriado,
  LeituraDoConvite,
  MotivoDeFalhaDaEquipe,
  Membro,
  Papel,
  RespostaDoAceite,
  ServicoDeEquipe,
  SituacaoDoConvite,
} from '@/equipe/tipos'

/** Caminho da tela que recebe quem clica no link do convite. */
export const CAMINHO_DO_CONVITE = '/convite'

/** Nome da função de borda que resolve o token e cria o vínculo. */
const FUNCAO_DE_ACEITE = 'invite-accept'

/** A política de RLS recusou a escrita. */
const PRIVILEGIO_INSUFICIENTE = '42501'
/** Índice único: já existe convite pendente para este e-mail nesta conta. */
const VIOLACAO_DE_UNICIDADE = '23505'
/** `check` de coluna: o e-mail não tem a forma que a tabela aceita. */
const VIOLACAO_DE_CHECK = '23514'

interface LinhaDeMembro {
  user_id: string
  role: string
  last_seen_at: string | null
  profiles: { display_name: string | null; email: string | null } | null
}

interface LinhaDeConvite {
  id: string
  email: string
  role: string
  expires_at: string
}

interface LinhaDePrevia {
  resultado: string
  conta_nome: string | null
  papel: string | null
  email: string | null
  convidado_por: string | null
  expira_em: string | null
}

function classificar(erro: PostgrestError | null): MotivoDeFalhaDaEquipe {
  switch (erro?.code) {
    case PRIVILEGIO_INSUFICIENTE:
      return 'sem-permissao'
    case VIOLACAO_DE_UNICIDADE:
      return 'convite-repetido'
    case VIOLACAO_DE_CHECK:
      return 'email-invalido'
    default:
      return 'falha-de-comunicacao'
  }
}

/** Papel vindo do banco. Valor fora da lista vira o mais restrito. */
function paraPapel(valor: string | null): Papel {
  switch (valor) {
    case 'owner':
    case 'admin':
    case 'operator':
      return valor
    default:
      return 'viewer'
  }
}

function paraSituacao(valor: string): SituacaoDoConvite {
  switch (valor) {
    case 'valido':
    case 'expirado':
    case 'revogado':
    case 'ja_aceito':
      return valor
    default:
      return 'nao_encontrado'
  }
}

function paraMembro(linha: LinhaDeMembro): Membro {
  const email = linha.profiles?.email ?? ''
  const nome = linha.profiles?.display_name?.trim()

  return {
    usuarioId: linha.user_id,
    nome: nome || email,
    email,
    papel: paraPapel(linha.role),
    ultimoAcesso: linha.last_seen_at,
  }
}

/**
 * A frase de uma recusa da função de borda vem no corpo da resposta, e o
 * cliente do Supabase a esconde dentro do erro. Sem isto, todo convite
 * vencido viraria "erro ao chamar a função".
 */
async function mensagemDaBorda(erro: unknown): Promise<string | undefined> {
  const contexto = (erro as { context?: unknown } | null)?.context
  if (!(contexto instanceof Response)) return undefined

  try {
    const corpo: unknown = await contexto.json()
    const mensagem = (corpo as { mensagem?: unknown } | null)?.mensagem
    return typeof mensagem === 'string' ? mensagem : undefined
  } catch {
    return undefined
  }
}

export function criarServicoDeEquipe(
  cliente: SupabaseClient,
  origem: () => string = () => window.location.origin,
): ServicoDeEquipe {
  /** Conta em que o usuário da sessão trabalha, e o papel dele nela. */
  async function contaAtual(): Promise<
    { id: string; nome: string; papel: Papel } | MotivoDeFalhaDaEquipe
  > {
    const { data: autenticado } = await cliente.auth.getUser()
    const usuarioId = autenticado.user?.id
    if (!usuarioId) return 'sem-permissao'

    const { data, error } = await cliente
      .from('account_members')
      .select('account_id, role, accounts!inner(id, name)')
      .eq('user_id', usuarioId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) return classificar(error)
    if (!data) return 'sem-conta'

    const conta = data.accounts as unknown as { id: string; name: string }
    return { id: conta.id, nome: conta.name, papel: paraPapel(data.role) }
  }

  return {
    async carregar() {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const [membros, convites] = await Promise.all([
        cliente
          .from('account_members')
          .select('user_id, role, last_seen_at, profiles(display_name, email)')
          .eq('account_id', conta.id)
          .order('created_at', { ascending: true }),
        cliente
          .from('invitations')
          .select('id, email, role, expires_at')
          .eq('account_id', conta.id)
          .is('accepted_at', null)
          .is('revoked_at', null)
          .order('created_at', { ascending: false }),
      ])

      if (membros.error) return { ok: false, motivo: classificar(membros.error) }
      if (convites.error) {
        return { ok: false, motivo: classificar(convites.error) }
      }

      return {
        ok: true,
        equipe: {
          conta: { id: conta.id, nome: conta.nome },
          papelDoUsuario: conta.papel,
          membros: (membros.data as unknown as LinhaDeMembro[]).map(paraMembro),
          convites: (convites.data as unknown as LinhaDeConvite[]).map(
            (linha) => ({
              id: linha.id,
              email: linha.email,
              papel: paraPapel(linha.role),
              expiraEm: linha.expires_at,
            }),
          ),
        },
      }
    },

    async convidar({ email, papel }): Promise<ConviteCriado> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data: autenticado } = await cliente.auth.getUser()
      const usuarioId = autenticado.user?.id
      if (!usuarioId) return { ok: false, motivo: 'sem-permissao' }

      // O token existe em claro só aqui e no link. O banco recebe o hash.
      const token = gerarTokenDeConvite()

      const { error } = await cliente.from('invitations').insert({
        account_id: conta.id,
        email: email.trim(),
        role: papel,
        token_hash: await hashDeToken(token),
        invited_by: usuarioId,
      })

      if (error) return { ok: false, motivo: classificar(error) }

      return { ok: true, link: `${origem()}${CAMINHO_DO_CONVITE}/${token}` }
    },

    async trocarPapel(usuarioId, papel): Promise<AcaoDaEquipe> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      // `returning` é a medida honesta: um `using` que não casa não levanta
      // erro, apenas não afeta linha nenhuma.
      const { data, error } = await cliente
        .from('account_members')
        .update({ role: papel })
        .eq('account_id', conta.id)
        .eq('user_id', usuarioId)
        .select('user_id')

      if (error) return { ok: false, motivo: classificar(error) }
      if (!data.length) return { ok: false, motivo: 'sem-permissao' }
      return { ok: true }
    },

    async remover(usuarioId): Promise<AcaoDaEquipe> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const { data, error } = await cliente
        .from('account_members')
        .delete()
        .eq('account_id', conta.id)
        .eq('user_id', usuarioId)
        .select('user_id')

      if (error) return { ok: false, motivo: classificar(error) }
      if (!data.length) return { ok: false, motivo: 'sem-permissao' }
      return { ok: true }
    },

    async revogarConvite(conviteId): Promise<AcaoDaEquipe> {
      // Revogar deixa rastro: a linha fica, com revoked_at preenchido.
      const { data, error } = await cliente
        .from('invitations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', conviteId)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .select('id')

      if (error) return { ok: false, motivo: classificar(error) }
      if (!data.length) return { ok: false, motivo: 'sem-permissao' }
      return { ok: true }
    },

    async lerConvite(token): Promise<LeituraDoConvite> {
      const { data, error } = await cliente.rpc('previa_do_convite', {
        p_token_hash: await hashDeToken(token),
      })

      if (error) return { ok: false, motivo: 'falha-de-comunicacao' }

      const linha = (data as LinhaDePrevia[] | null)?.[0]

      // Nenhuma linha é o caso normal de link inválido, não uma falha.
      if (!linha) {
        return {
          ok: true,
          previa: {
            situacao: 'nao_encontrado',
            contaNome: '',
            papel: 'viewer',
            email: '',
            convidadoPor: '',
            expiraEm: '',
          },
        }
      }

      return {
        ok: true,
        previa: {
          situacao: paraSituacao(linha.resultado),
          contaNome: linha.conta_nome ?? '',
          papel: paraPapel(linha.papel),
          email: linha.email ?? '',
          convidadoPor: linha.convidado_por ?? '',
          expiraEm: linha.expira_em ?? '',
        },
      }
    },

    async aceitarConvite(token): Promise<RespostaDoAceite> {
      const { data, error } = await cliente.functions.invoke(FUNCAO_DE_ACEITE, {
        body: { token },
      })

      if (error) {
        const mensagem = await mensagemDaBorda(error)
        return {
          ok: false,
          mensagem:
            mensagem ??
            'Não foi possível aceitar o convite agora. Tente de novo em alguns minutos.',
        }
      }

      const corpo = data as {
        ok?: boolean
        mensagem?: string
        conta?: { nome?: string }
      } | null

      return {
        ok: corpo?.ok === true,
        mensagem: corpo?.mensagem ?? '',
        ...(corpo?.conta?.nome ? { contaNome: corpo.conta.nome } : {}),
      }
    },
  }
}
