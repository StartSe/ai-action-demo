// O serviço da fila de exceções sobre o Supabase: lê `exception_items` sob a
// RLS de membro, resolve pelo RPC `resolver_item_de_fila` (US-131), confirma o
// bloqueio em `dnc_entries` e assina as mudanças da conta em tempo real.
//
// Quatro cuidados:
//
// 1. **Resolver é RPC, nunca `update`.** O RPC carimba `auth.uid()` e a hora,
//    grava a auditoria na mesma transação e devolve código em vez de levantar.
//    `ja_resolvido` relê a linha para a tela dizer quem resolveu e quando; a
//    primeira resolução é a que fica.
// 2. **Confirmar o bloqueio escreve antes de resolver.** O insert em
//    `dnc_entries` vai com `.select()`: a RLS que recusa devolve lista vazia sem
//    erro, e isso é `sem_permissao`, não sucesso. O único parcial que recusa
//    (23505) é o bloqueio ativo que já existe, e conta como feito.
// 3. **A assinatura só avisa.** O evento de `postgres_changes` não é desenhado:
//    quem ouve refaz a carga de sempre, sob a RLS de quem pediu. A tabela entra
//    na publicação em `20260924230000_fila_em_tempo_real.sql`. Canal que cai
//    (`CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`) é dito à tela, que liga a
//    recarga por intervalo.
// 4. **Lead e chamada vêm embutidos pela chave composta** (o nome dela vai no
//    `select`), e a gravação se decide com o instante da leitura, pela régua de
//    `call-audio`.

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import { paraItemDaFila } from '@/fila/leitura'
import type {
  CargaDaFila,
  CodigoDaResolucao,
  ItemDaFila,
  MotivoDeFalhaDaFila,
  ResultadoDaResolucao,
  ServicoDaFila,
} from '@/fila/tipos'

const PRIVILEGIO_INSUFICIENTE = '42501'
const VIOLACAO_DE_UNICO = '23505'

/** Teto de itens por leitura. Fila com mais do que isso já parou de ser lida. */
const TETO_DA_LEITURA = 200

const COLUNAS = [
  'id, kind, severity, status, lead_id, call_id, context, threshold_snapshot, created_at, resolved_by, resolved_at, resolution',
  'leads!exception_items_lead_da_conta(name, phone_e164)',
  'calls!exception_items_chamada_da_conta(recording_path, recording_expires_at)',
].join(', ')

/** Os códigos de `resolver_item_de_fila`, como a tela os conhece. */
const CODIGOS: Readonly<Record<string, Exclude<CodigoDaResolucao, 'falha-de-comunicacao'>>> = {
  resolvido: 'resolvido',
  ja_resolvido: 'ja_resolvido',
  sem_permissao: 'sem_permissao',
  item_de_outra_conta: 'inexistente',
  resolucao_vazia: 'resolucao_vazia',
}

function classificar(erro: PostgrestError | null): MotivoDeFalhaDaFila {
  return erro?.code === PRIVILEGIO_INSUFICIENTE ? 'sem-permissao' : 'falha-de-comunicacao'
}

function itens(linhas: unknown[] | null): ItemDaFila[] {
  const agora = new Date().toISOString()
  return (linhas ?? [])
    .map((linha) => paraItemDaFila(linha as Record<string, unknown>, agora))
    .filter((item): item is ItemDaFila => item !== null)
}

export function criarServicoDaFila(cliente: SupabaseClient): ServicoDaFila {
  async function contaAtual(): Promise<{ id: string } | MotivoDeFalhaDaFila> {
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

  async function lerItem(id: string): Promise<ItemDaFila | null> {
    const { data, error } = await cliente
      .from('exception_items')
      .select(COLUNAS)
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return null
    return itens([data])[0] ?? null
  }

  async function resolver(id: string, texto: string): Promise<ResultadoDaResolucao> {
    const { data, error } = await cliente.rpc('resolver_item_de_fila', {
      p_item_id: id,
      p_resolucao: texto,
    })
    if (error) {
      return {
        codigo: error.code === PRIVILEGIO_INSUFICIENTE ? 'sem_permissao' : 'falha-de-comunicacao',
      }
    }

    const codigo = typeof data === 'string' ? CODIGOS[data] : undefined
    if (codigo === undefined) return { codigo: 'falha-de-comunicacao' }
    if (codigo === 'ja_resolvido') {
      const item = await lerItem(id)
      return { codigo: 'ja_resolvido', resolucao: item?.resolucao ?? null }
    }
    return { codigo }
  }

  return {
    async carregar(estado): Promise<CargaDaFila> {
      const conta = await contaAtual()
      if (typeof conta === 'string') return { ok: false, motivo: conta }

      const [recorte, existencia] = await Promise.all([
        cliente
          .from('exception_items')
          .select(COLUNAS)
          .eq('account_id', conta.id)
          .eq('status', estado)
          .order(estado === 'aberto' ? 'created_at' : 'resolved_at', { ascending: false })
          .limit(TETO_DA_LEITURA),
        // Um id basta para separar a fila nunca preenchida do recorte vazio.
        cliente.from('exception_items').select('id').eq('account_id', conta.id).limit(1),
      ])

      if (recorte.error) return { ok: false, motivo: classificar(recorte.error) }
      if (existencia.error) return { ok: false, motivo: classificar(existencia.error) }
      const lidos = itens(recorte.data)
      return { ok: true, itens: lidos, haItens: lidos.length > 0 || existencia.data.length > 0 }
    },

    resolver,

    async confirmarBloqueio(id, telefone, texto): Promise<ResultadoDaResolucao> {
      const conta = await contaAtual()
      if (typeof conta === 'string') {
        return { codigo: conta === 'falha-de-comunicacao' ? conta : 'sem_permissao' }
      }

      const { data, error } = await cliente
        .from('dnc_entries')
        .insert({ account_id: conta.id, phone_e164: telefone, reason: texto, source: 'manual' })
        .select('id')

      if (error && error.code !== VIOLACAO_DE_UNICO) {
        return {
          codigo: error.code === PRIVILEGIO_INSUFICIENTE ? 'sem_permissao' : 'falha-de-comunicacao',
        }
      }
      if (!error && !data?.length) return { codigo: 'sem_permissao' }

      return resolver(id, texto)
    },

    assinar(aoMudar, aoTrocarEstado) {
      let ativo = true
      let canal: ReturnType<SupabaseClient['channel']> | null = null

      void contaAtual().then((conta) => {
        if (!ativo) return
        if (typeof conta === 'string') {
          aoTrocarEstado?.('indisponivel')
          return
        }
        canal = cliente
          .channel(`exception_items:${conta.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'exception_items',
              filter: `account_id=eq.${conta.id}`,
            },
            () => {
              if (ativo) aoMudar()
            },
          )
          .subscribe((estado) => {
            if (!ativo) return
            if (estado === 'SUBSCRIBED') aoTrocarEstado?.('ativa')
            else aoTrocarEstado?.('indisponivel')
          })
      })

      return () => {
        ativo = false
        if (canal) void cliente.removeChannel(canal)
      }
    },
  }
}
