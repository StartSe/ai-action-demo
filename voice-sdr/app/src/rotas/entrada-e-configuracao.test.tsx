// Enquanto a aplicação não está configurada, quem entra vai sempre para o
// tutorial, aberto e no passo em que parou, mesmo que o tenha fechado da
// última vez. Vale no login e para quem abre o app já logado, pelo painel.
// "Configurada" é nada travando a primeira ligação: a agenda que espera o
// Google, a equipe e os leads não prendem ninguém no tutorial.

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { autenticacao } from '@/copy/autenticacao'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeConfiguracaoDublado,
  passosConcluidos,
  passosDeExemplo,
  type RespostasDaConfiguracao,
} from '@/testes/servico-de-configuracao-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const copy = autenticacao.entrar

afterEach(cleanup)

async function entrar(respostas: RespostasDaConfiguracao, caminho = '/entrar') {
  const configuracao = criarServicoDeConfiguracaoDublado(respostas)
  const { roteador } = await montarAplicacao(
    criarServicoDublado(),
    caminho,
    undefined,
    undefined,
    undefined,
    configuracao,
  )
  fireEvent.change(screen.getByLabelText(copy.email.rotulo), {
    target: { value: 'ana@transportes.com.br' },
  })
  fireEvent.change(screen.getByLabelText(copy.senha.rotulo), { target: { value: 'segredo123' } })
  fireEvent.click(screen.getByRole('button', { name: copy.acao }))
  return { roteador, configuracao }
}

/** O agente por fazer trava a primeira ligação; o resto está resolvido. */
function passosSemAgente() {
  return passosConcluidos().map((passo) =>
    passo.passo === 'agente' ? { ...passo, pendente: true, marcado: false, estado: 'pendente' as const } : passo,
  )
}

describe('no login', () => {
  it('sem a aplicação configurada, vai para o tutorial, mesmo com outro destino', async () => {
    const { roteador } = await entrar({ passos: passosSemAgente() }, '/entrar?destino=/leads')
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/configuracao-inicial'))
  })

  it('quem fechou o tutorial o encontra aberto de novo', async () => {
    const { roteador, configuracao } = await entrar({ passos: passosSemAgente(), dispensada: true })
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/configuracao-inicial'))
    expect(configuracao.progressos.at(-1)?.dispensada).toBe(false)
  })

  it('com a aplicação configurada, segue para o destino', async () => {
    const { roteador } = await entrar({ passos: passosConcluidos() }, '/entrar?destino=/leads')
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/leads'))
  })

  it('só o que não trava a ligação pendente (a agenda, a equipe) não prende no tutorial', async () => {
    const passos = passosConcluidos().map((passo) =>
      passo.passo === 'agenda' || passo.passo === 'equipe'
        ? { ...passo, pendente: true, marcado: false, estado: 'pendente' as const }
        : passo,
    )
    const { roteador } = await entrar({ passos })
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/'))
  })
})

describe('abrindo o app já logado', () => {
  it('o painel manda para o tutorial enquanto a aplicação não está configurada', async () => {
    const configuracao = criarServicoDeConfiguracaoDublado({ passos: passosDeExemplo(), dispensada: true })
    const { roteador } = await montarAplicacao(
      criarServicoDublado({ sessao: { usuarioId: 'u-1', email: 'ana@transportes.com.br' } }),
      '/',
      undefined,
      undefined,
      undefined,
      configuracao,
    )
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/configuracao-inicial'))
    expect(configuracao.progressos.at(-1)?.dispensada).toBe(false)
  })

  it('configurada, o painel fica', async () => {
    const { roteador } = await montarAplicacao(
      criarServicoDublado({ sessao: { usuarioId: 'u-1', email: 'ana@transportes.com.br' } }),
      '/',
    )
    await screen.findByRole('heading', { level: 1 })
    expect(roteador.state.location.pathname).toBe('/')
  })
})
