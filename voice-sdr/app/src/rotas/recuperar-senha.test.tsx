import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { autenticacao } from '@/copy/autenticacao'
import { comum } from '@/copy/comum'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import { criarServicoDublado } from '@/testes/servico-dublado'

const copy = autenticacao.recuperarSenha
const SESSAO_DE_RECUPERACAO = {
  usuarioId: 'u-1',
  email: 'ana@transportes.com.br',
}

afterEach(cleanup)

describe('recuperação de senha, pedido do link', () => {
  it('pede o e-mail e confirma o envio', async () => {
    const servico = criarServicoDublado()
    await montarAplicacao(servico, '/recuperar-senha')

    expect(
      screen.getByRole('heading', { name: copy.pedido.titulo }),
    ).toBeDefined()
    expect(screen.getByText(comum.promessa, { exact: false })).toBeDefined()

    fireEvent.change(screen.getByLabelText(copy.pedido.email.rotulo), {
      target: { value: '  ana@transportes.com.br ' },
    })
    fireEvent.click(screen.getByRole('button', { name: copy.pedido.acao }))

    expect((await screen.findByRole('status')).textContent).toBe(
      copy.pedido.enviado,
    )
    expect(servico.emailsDeRecuperacao).toEqual(['ana@transportes.com.br'])
  })

  it('e-mail vazio reprova antes de chamar o serviço', async () => {
    const servico = criarServicoDublado()
    await montarAplicacao(servico, '/recuperar-senha')

    fireEvent.click(screen.getByRole('button', { name: copy.pedido.acao }))

    expect(await screen.findByText(copy.pedido.emailObrigatorio)).toBeDefined()
    expect(servico.emailsDeRecuperacao).toHaveLength(0)
  })

  it('excesso de tentativas vira mensagem em português', async () => {
    const servico = criarServicoDublado({
      pedirRecuperacao: { ok: false, motivo: 'excesso-de-tentativas' },
    })
    await montarAplicacao(servico, '/recuperar-senha')

    fireEvent.change(screen.getByLabelText(copy.pedido.email.rotulo), {
      target: { value: 'ana@transportes.com.br' },
    })
    fireEvent.click(screen.getByRole('button', { name: copy.pedido.acao }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      copy.falhas['excesso-de-tentativas'],
    )
  })
})

describe('recuperação de senha, senha nova', () => {
  // Quem chega pelo link do e-mail já tem sessão: é o que a tela usa para
  // saber que deve pedir a senha nova, e não o e-mail outra vez.
  async function abrirComSessao(respostas = {}) {
    const servico = criarServicoDublado({
      sessao: SESSAO_DE_RECUPERACAO,
      ...respostas,
    })
    await montarAplicacao(servico, '/recuperar-senha')
    return servico
  }

  function preencher(senha: string, confirmacao: string) {
    fireEvent.change(screen.getByLabelText(copy.novaSenha.senha.rotulo), {
      target: { value: senha },
    })
    fireEvent.change(screen.getByLabelText(copy.novaSenha.confirmacao.rotulo), {
      target: { value: confirmacao },
    })
    fireEvent.click(screen.getByRole('button', { name: copy.novaSenha.acao }))
  }

  it('com sessão de recuperação, a tela pede a senha nova', async () => {
    await abrirComSessao()

    expect(
      screen.getByRole('heading', { name: copy.novaSenha.titulo }),
    ).toBeDefined()
    expect(screen.queryByRole('button', { name: copy.pedido.acao })).toBeNull()
  })

  it('senha curta e senhas diferentes reprovam antes do serviço', async () => {
    const servico = await abrirComSessao()

    preencher('curta', 'curta')
    expect(await screen.findByText(copy.novaSenha.senhaCurta)).toBeDefined()

    preencher('senhalonga1', 'senhalonga2')
    expect(
      await screen.findByText(copy.novaSenha.senhasDiferentes),
    ).toBeDefined()

    expect(servico.senhasDefinidas).toHaveLength(0)
  })

  it('senha aceita confirma a troca', async () => {
    const servico = await abrirComSessao()

    preencher('senhalonga1', 'senhalonga1')

    expect((await screen.findByRole('status')).textContent).toBe(
      copy.novaSenha.salva,
    )
    expect(servico.senhasDefinidas).toEqual(['senhalonga1'])
  })

  it('link expirado vira mensagem em português', async () => {
    await abrirComSessao({
      definirNovaSenha: { ok: false, motivo: 'link-expirado' },
    })

    preencher('senhalonga1', 'senhalonga1')

    expect((await screen.findByRole('alert')).textContent).toBe(
      copy.falhas['link-expirado'],
    )
  })
})
