import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { autenticacao } from '@/copy/autenticacao'
import { comum } from '@/copy/comum'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import { criarServicoDublado } from '@/testes/servico-dublado'

const copy = autenticacao.entrar

afterEach(cleanup)

function preencher(email: string, senha: string) {
  fireEvent.change(screen.getByLabelText(copy.email.rotulo), {
    target: { value: email },
  })
  fireEvent.change(screen.getByLabelText(copy.senha.rotulo), {
    target: { value: senha },
  })
  fireEvent.click(screen.getByRole('button', { name: copy.acao }))
}

describe('tela de entrada', () => {
  it('mostra a promessa do produto ao lado do formulário', async () => {
    await montarAplicacao(criarServicoDublado(), '/entrar')

    expect(screen.getByText(comum.promessa, { exact: false })).toBeDefined()
    expect(screen.getByRole('heading', { name: copy.titulo })).toBeDefined()
  })

  it('e-mail sem conta e senha errada dão mensagens diferentes', async () => {
    const semConta = criarServicoDublado({
      entrar: { ok: false, motivo: 'conta-inexistente' },
    })
    await montarAplicacao(semConta, '/entrar')
    preencher('ninguem@transportes.com.br', 'segredo123')

    const primeira = await screen.findByRole('alert')
    expect(primeira.textContent).toBe(copy.falhas['conta-inexistente'])
    cleanup()

    const senhaErrada = criarServicoDublado({
      entrar: { ok: false, motivo: 'senha-incorreta' },
    })
    await montarAplicacao(senhaErrada, '/entrar')
    preencher('ana@transportes.com.br', 'errada123')

    const segunda = await screen.findByRole('alert')
    expect(segunda.textContent).toBe(copy.falhas['senha-incorreta'])
    expect(segunda.textContent).not.toBe(primeira.textContent)
  })

  it('campo vazio reprova antes de chamar o serviço', async () => {
    const servico = criarServicoDublado()
    await montarAplicacao(servico, '/entrar')

    fireEvent.click(screen.getByRole('button', { name: copy.acao }))

    expect(await screen.findByText(copy.emailObrigatorio)).toBeDefined()
    expect(screen.getByText(copy.senhaObrigatoria)).toBeDefined()
    expect(servico.entradas).toHaveLength(0)
  })

  it('entrada aceita leva ao painel', async () => {
    const servico = criarServicoDublado()
    const { roteador } = await montarAplicacao(servico, '/entrar')

    preencher('ana@transportes.com.br', 'segredo123')

    await waitFor(() => {
      expect(roteador.state.location.pathname).toBe('/')
    })
    expect(servico.entradas).toEqual([
      { email: 'ana@transportes.com.br', senha: 'segredo123' },
    ])
  })

  it('sessão expirada avisa e devolve à rota que a pessoa tentou abrir', async () => {
    const servico = criarServicoDublado()
    const { roteador } = await montarAplicacao(servico, '/entrar?destino=/leads')

    expect(screen.getByRole('status').textContent).toBe(copy.sessaoExpirada)

    preencher('ana@transportes.com.br', 'segredo123')

    await waitFor(() => {
      expect(roteador.state.location.pathname).toBe('/leads')
    })
  })

  it('destino externo é descartado: a entrada leva ao painel', async () => {
    const servico = criarServicoDublado()
    const { roteador } = await montarAplicacao(
      servico,
      '/entrar?destino=https://outro.site/roubo',
    )

    expect(screen.queryByRole('status')).toBeNull()

    preencher('ana@transportes.com.br', 'segredo123')

    await waitFor(() => {
      expect(roteador.state.location.pathname).toBe('/')
    })
  })
})
