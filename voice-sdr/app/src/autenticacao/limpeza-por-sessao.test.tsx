// A troca de sessão leva o cache e o navegador junto. O defeito que isto
// segura: zerar o ambiente e fundar outra conta na mesma aba deixava o negócio
// da conta anterior no cache das consultas, e os formulários da nova abriam
// preenchidos com ele.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import { useLimpezaAoTrocarDeSessao } from '@/autenticacao/limpeza-por-sessao'
import { ProvedorDeAutenticacao } from '@/autenticacao/provedor'
import { criarServicoDublado } from '@/testes/servico-dublado'
import { CHAVES_ANTIGAS_DO_NAVEGADOR } from '@/utilidades/dados-do-navegador'

afterEach(cleanup)

function Sonda() {
  useLimpezaAoTrocarDeSessao()
  return null
}

function montar() {
  const servico = criarServicoDublado({ sessao: { usuarioId: 'u-1', email: 'dono@exemplo.test' } })
  const cliente = new QueryClient()
  render(
    <ProvedorDeAutenticacao servico={servico}>
      <QueryClientProvider client={cliente}>
        <Sonda />
      </QueryClientProvider>
    </ProvedorDeAutenticacao>,
  )
  return { servico, cliente }
}

test('sair limpa o cache das consultas e as chaves antigas do navegador', async () => {
  const { servico, cliente } = montar()
  cliente.setQueryData(['configuracao-inicial'], { empresa: 'Negócio da conta anterior' })
  window.localStorage.setItem(CHAVES_ANTIGAS_DO_NAVEGADOR[0], '{"valores":{}}')

  await act(async () => {
    await servico.sair()
  })

  expect(cliente.getQueryData(['configuracao-inicial'])).toBeUndefined()
  expect(window.localStorage.getItem(CHAVES_ANTIGAS_DO_NAVEGADOR[0])).toBeNull()
})

test('a mesma sessão não apaga o cache', () => {
  const { cliente } = montar()
  cliente.setQueryData(['configuracao-inicial'], { empresa: 'Negócio desta conta' })

  expect(cliente.getQueryData(['configuracao-inicial'])).toEqual({ empresa: 'Negócio desta conta' })
})
