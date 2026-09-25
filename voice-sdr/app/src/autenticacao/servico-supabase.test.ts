// A fundação num projeto que exige confirmação de e-mail, que é o padrão de um
// projeto novo do Supabase. O cadastro volta sem sessão; o banco já marcou o
// e-mail do fundador como confirmado (migração 20261005110000), então entrar
// com a mesma senha abre a sessão e a fundação segue.

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, test, vi } from 'vitest'

import { criarServicoDeAutenticacao } from '@/autenticacao/servico-supabase'

const SESSAO = { user: { id: '00000000-0000-4000-8000-000000000001', email: 'ana@transportes.com.br' } }

function cliente(entrada: { session: typeof SESSAO | null; erro?: boolean }) {
  const rpc = vi.fn(async () => ({ data: 'conta', error: null }))
  const signInWithPassword = vi.fn(async () =>
    entrada.erro
      ? { data: { session: null }, error: { code: 'email_not_confirmed' } }
      : { data: { session: entrada.session }, error: null },
  )
  const falso = {
    auth: {
      signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
      signInWithPassword,
      signOut: vi.fn(async () => ({ error: null })),
    },
    rpc,
  }
  return { falso: falso as unknown as SupabaseClient, rpc, signInWithPassword }
}

const PEDIDO = { nomeDaConta: 'Transportes Aurora', nomeDoDono: 'Ana', email: 'ana@transportes.com.br', senha: 'segredo-longo' }

describe('fundarInstalacao', () => {
  test('cadastro sem sessão entra com a mesma senha e funda', async () => {
    const { falso, rpc, signInWithPassword } = cliente({ session: SESSAO })
    const servico = criarServicoDeAutenticacao(falso)
    expect(await servico.fundarInstalacao(PEDIDO)).toEqual({ ok: true })
    expect(signInWithPassword).toHaveBeenCalledWith({ email: PEDIDO.email, password: PEDIDO.senha })
    expect(rpc).toHaveBeenCalledWith('fundar_instalacao', { p_nome_da_conta: PEDIDO.nomeDaConta })
    expect(servico.sessaoAtual()?.usuarioId).toBe(SESSAO.user.id)
  })

  test('se nem a entrada abre sessão, a fundação não é tentada', async () => {
    const { falso, rpc } = cliente({ session: null, erro: true })
    const servico = criarServicoDeAutenticacao(falso)
    expect(await servico.fundarInstalacao(PEDIDO)).toEqual({ ok: false, motivo: 'falha-de-comunicacao' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
