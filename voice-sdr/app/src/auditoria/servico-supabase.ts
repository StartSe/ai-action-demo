import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import { inicioDoPeriodo } from '@/auditoria/consulta'
import {
  AUTOR_SISTEMA,
  type AcaoRegistrada,
  type AutorDoRegistro,
  type CargaDaAuditoria,
  type MotivoDeFalhaDaAuditoria,
  type OpcaoDeAutor,
  type RegistroDeAuditoria,
  type ServicoDeAuditoria,
  type TipoDeAutor,
} from '@/auditoria/tipos'

/**
 * Teto de linhas por consulta. A trilha cresce sem limite e a tela é de
 * leitura: quem precisa de mais fundo estreita o período.
 */
const TETO = 200

/** A política de RLS recusou a leitura. */
const PRIVILEGIO_INSUFICIENTE = '42501'

interface LinhaDeAuditoria {
  id: string
  created_at: string
  actor: string
  actor_id: string | null
  source: string
  action: string
  target_type: string
  target_id: string | null
  reason: string | null
  payload: { campos?: unknown } | null
}

interface LinhaDeAutor {
  user_id: string
  profiles: { display_name: string | null; email: string | null } | null
}

function classificar(erro: PostgrestError | null): MotivoDeFalhaDaAuditoria {
  return erro?.code === PRIVILEGIO_INSUFICIENTE
    ? 'sem-permissao'
    : 'falha-de-comunicacao'
}

function paraAcaoRegistrada(valor: string): AcaoRegistrada {
  switch (valor) {
    case 'insert':
    case 'delete':
      return valor
    default:
      return 'update'
  }
}

function paraTipoDeAutor(valor: string): TipoDeAutor {
  switch (valor) {
    case 'agent':
    case 'system':
      return valor
    default:
      return 'user'
  }
}

/** `payload.campos` é o array de colunas que o gatilho de update monta. */
function paraCampos(payload: LinhaDeAuditoria['payload']): string[] {
  const campos = payload?.campos
  if (!Array.isArray(campos)) return []
  return campos.filter((campo): campo is string => typeof campo === 'string')
}

export function criarServicoDeAuditoria(
  cliente: SupabaseClient,
): ServicoDeAuditoria {
  /**
   * Conta em que o usuário da sessão trabalha. Devolve o objeto no caso bom e
   * o motivo no caso ruim: a distinção é por tipo, não por valor de string.
   */
  async function contaAtual(): Promise<
    { id: string } | MotivoDeFalhaDaAuditoria
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
    async consultar(consulta): Promise<CargaDaAuditoria> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      let busca = cliente
        .from('audit_log')
        .select(
          'id, created_at, actor, actor_id, source, action, target_type, target_id, reason, payload',
        )
        .eq('account_id', conta.id)
        .order('created_at', { ascending: false })
        .limit(TETO)

      if (consulta.autor === AUTOR_SISTEMA) {
        busca = busca.eq('actor', 'system')
      } else if (consulta.autor) {
        busca = busca.eq('actor_id', consulta.autor)
      }

      if (consulta.acao) busca = busca.eq('action', consulta.acao)

      const desde = inicioDoPeriodo(consulta.periodo)
      if (desde) busca = busca.gte('created_at', desde)

      const [trilha, pessoas] = await Promise.all([
        busca,
        cliente
          .from('account_members')
          .select('user_id, profiles(display_name, email)')
          .eq('account_id', conta.id),
      ])

      if (trilha.error) return { ok: false, motivo: classificar(trilha.error) }
      if (pessoas.error) {
        return { ok: false, motivo: classificar(pessoas.error) }
      }

      // `audit_log` não tem chave estrangeira para `profiles` — de propósito,
      // para o registro sobreviver à saída de quem o gerou. Sem a chave não há
      // embutido do PostgREST, então o nome vem deste mapa.
      const nomes = new Map<string, string>()
      const autores: OpcaoDeAutor[] = []

      for (const linha of pessoas.data as unknown as LinhaDeAutor[]) {
        const email = linha.profiles?.email ?? ''
        const nome = linha.profiles?.display_name?.trim() || email
        if (!nome) continue
        nomes.set(linha.user_id, nome)
        autores.push({ id: linha.user_id, nome })
      }

      autores.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

      const linhas = trilha.data as unknown as LinhaDeAuditoria[]

      const registros: RegistroDeAuditoria[] = linhas.map((linha) => {
        const tipo = paraTipoDeAutor(linha.actor)
        const autor: AutorDoRegistro = {
          tipo,
          id: linha.actor_id,
          nome: (linha.actor_id && nomes.get(linha.actor_id)) || '',
        }

        return {
          id: linha.id,
          instante: linha.created_at,
          autor,
          acao: paraAcaoRegistrada(linha.action),
          alvoTipo: linha.target_type,
          alvoId: linha.target_id,
          origem: linha.source,
          motivo: linha.reason,
          campos: paraCampos(linha.payload),
        }
      })

      return {
        ok: true,
        pagina: { registros, autores, truncada: registros.length === TETO },
      }
    },
  }
}
