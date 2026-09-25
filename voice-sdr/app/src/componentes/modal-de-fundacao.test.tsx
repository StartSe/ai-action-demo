// O modal de fundação é a única porta de uma instalação virgem. O que se
// prova aqui: ele só aparece quando não há dono, recusa antes de chamar o
// servidor o que dá para recusar sozinho, e entrega ao serviço exatamente o
// que o formulário pediu.
//
// Tudo dentro de `within(dialogo)`: a tela de entrada continua montada atrás,
// com rótulos de mesmo nome, e uma busca solta acharia os dois.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { autenticacao } from '@/copy/autenticacao'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import { criarServicoDublado, type ServicoDublado } from '@/testes/servico-dublado'

const copy = autenticacao.fundacao

afterEach(cleanup)

function dialogo() {
  return within(screen.getByRole('dialog'))
}

function preencher(valores: Partial<Record<string, string>> = {}) {
  const campos: [string, string][] = [
    [copy.nomeDaConta.rotulo, valores.nomeDaConta ?? 'Transportes Aurora'],
    [copy.nomeDoDono.rotulo, valores.nomeDoDono ?? 'Ana Ribeiro'],
    [copy.email.rotulo, valores.email ?? 'ana@transportes.com.br'],
    [copy.senha.rotulo, valores.senha ?? 'segredo123'],
    [copy.confirmacao.rotulo, valores.confirmacao ?? 'segredo123'],
  ]

  for (const [rotulo, valor] of campos) {
    fireEvent.change(dialogo().getByLabelText(rotulo), {
      target: { value: valor },
    })
  }
}

function enviar() {
  fireEvent.click(dialogo().getByRole('button', { name: copy.acao }))
}

async function montarVirgem(respostas = {}): Promise<ServicoDublado> {
  const servico = criarServicoDublado({
    instalacaoSemDono: true,
    ...respostas,
  })
  await montarAplicacao(servico, '/entrar')
  await screen.findByRole('dialog')
  return servico
}

describe('modal de fundação', () => {
  it('depois de fundar, vai para o tutorial, e não para o destino de uma sessão antiga', async () => {
    // O navegador ainda estava numa tela da sessão anterior ao reset: a guarda
    // mandou para /entrar com o destino dela. A instalação nova não é dela.
    const servico = criarServicoDublado({ instalacaoSemDono: true })
    const { roteador } = await montarAplicacao(servico, '/entrar?destino=/sarah/ensaio')
    await screen.findByRole('dialog')

    preencher()
    enviar()

    await waitFor(() =>
      expect(roteador.state.location.pathname).toBe('/configuracao-inicial'),
    )
  })

  it('abre sobre a tela de entrada quando a instalação não tem dono', async () => {
    await montarVirgem()

    const janela = dialogo()
    expect(janela.getByRole('heading', { name: copy.titulo })).toBeDefined()
    expect(janela.getByText(copy.explicacao)).toBeDefined()
    expect(janela.getByText(copy.aviso)).toBeDefined()
  })

  it('não aparece quando a instalação já tem dono', async () => {
    await montarAplicacao(
      criarServicoDublado({ instalacaoSemDono: false }),
      '/entrar',
    )

    await screen.findByRole('heading', { name: autenticacao.entrar.titulo })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reprova campo vazio antes de chamar o serviço', async () => {
    const servico = await montarVirgem()

    enviar()

    const janela = dialogo()
    expect(await janela.findByText(copy.nomeDaContaObrigatorio)).toBeDefined()
    expect(janela.getByText(copy.nomeDoDonoObrigatorio)).toBeDefined()
    expect(janela.getByText(copy.emailObrigatorio)).toBeDefined()
    expect(janela.getByText(copy.senhaObrigatoria)).toBeDefined()
    expect(servico.fundacoes).toHaveLength(0)
  })

  it('reprova senha curta e senhas diferentes sem ir ao servidor', async () => {
    const servico = await montarVirgem()

    preencher({ senha: 'curta', confirmacao: 'curta' })
    enviar()
    expect(await dialogo().findByText(copy.senhaCurta)).toBeDefined()

    preencher({ senha: 'segredo123', confirmacao: 'outra-coisa' })
    enviar()
    expect(await dialogo().findByText(copy.senhasDiferentes)).toBeDefined()

    expect(servico.fundacoes).toHaveLength(0)
  })

  it('entrega ao serviço o que o formulário pediu e sai da tela de entrada', async () => {
    const servico = await montarVirgem()

    preencher()
    enviar()

    await waitFor(() => expect(servico.fundacoes).toHaveLength(1))
    expect(servico.fundacoes[0]).toEqual({
      nomeDaConta: 'Transportes Aurora',
      nomeDoDono: 'Ana Ribeiro',
      email: 'ana@transportes.com.br',
      senha: 'segredo123',
    })

    // O diálogo da fundação some; o que abre no lugar é o do tutorial.
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: autenticacao.fundacao.titulo })).toBeNull(),
    )
  })

  it('a corrida perdida vira mensagem, e não formulário repetido', async () => {
    await montarVirgem({
      fundarInstalacao: { ok: false, motivo: 'ja-fundada' },
    })

    preencher()
    enviar()

    const aviso = await dialogo().findByRole('alert')
    expect(aviso.textContent).toBe(copy.falhas['ja-fundada'])
  })

  it('e-mail já usado explica a saída em vez de culpar o servidor', async () => {
    await montarVirgem({
      fundarInstalacao: { ok: false, motivo: 'email-em-uso' },
    })

    preencher()
    enviar()

    const aviso = await dialogo().findByRole('alert')
    expect(aviso.textContent).toBe(copy.falhas['email-em-uso'])
  })
})
