import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { convite as copy } from '@/copy/convite'
import { PAPEL_EM_PORTUGUES } from '@/copy/equipe'
import type { PreviaDoConvite, SituacaoRecusada } from '@/equipe/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeEquipeDublado,
  type RespostasDeEquipe,
} from '@/testes/servico-de-equipe-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const TOKEN = 'token-de-teste'
const EMAIL_DO_CONVITE = 'bruna@aurora.com.br'

afterEach(cleanup)

function previa(alteracoes: Partial<PreviaDoConvite> = {}): RespostasDeEquipe {
  return {
    lerConvite: {
      ok: true,
      previa: {
        situacao: 'valido',
        contaNome: 'Aurora Educação',
        papel: 'operator',
        email: EMAIL_DO_CONVITE,
        convidadoPor: 'Renata Alves',
        expiraEm: '2026-09-28T13:40:00.000Z',
        ...alteracoes,
      },
    },
  }
}

async function abrirConvite(
  respostas: RespostasDeEquipe = previa(),
  email?: string,
) {
  const equipe = criarServicoDeEquipeDublado(respostas)
  const autenticacao = criarServicoDublado(
    email ? { sessao: { usuarioId: 'u-7', email } } : {},
  )
  const montagem = await montarAplicacao(
    autenticacao,
    `/convite/${TOKEN}`,
    equipe,
  )
  return { equipe, autenticacao, ...montagem }
}

describe('tela de convite', () => {
  it('mostra quem convidou, para qual empresa e com qual papel', async () => {
    const { equipe } = await abrirConvite()

    expect(await screen.findByText('Renata Alves')).toBeDefined()
    expect(screen.getByText('Aurora Educação')).toBeDefined()
    expect(screen.getByText(PAPEL_EM_PORTUGUES.operator)).toBeDefined()
    expect(screen.getByText(EMAIL_DO_CONVITE)).toBeDefined()
    // O token da barra de endereço é o que vai para o serviço, em claro.
    expect(equipe.tokensLidos).toEqual([TOKEN])
  })

  it('abre sem sessão: a rota não passa pela guarda', async () => {
    const { roteador } = await abrirConvite()

    expect(roteador.state.location.pathname).toBe(`/convite/${TOKEN}`)
  })

  it('sem sessão, oferece entrar levando o convite como destino', async () => {
    await abrirConvite()

    expect(await screen.findByText(copy.semSessao)).toBeDefined()
    const entrar = screen.getByRole<HTMLAnchorElement>('link', {
      name: copy.entrar,
    })
    expect(entrar.getAttribute('href')).toBe(
      `/entrar?destino=%2Fconvite%2F${TOKEN}`,
    )
  })

  it('com a sessão do e-mail convidado, aceitar chama a borda', async () => {
    const { equipe } = await abrirConvite(previa(), EMAIL_DO_CONVITE)

    fireEvent.click(await screen.findByRole('button', { name: copy.aceitar }))

    expect(
      await screen.findByText('Convite aceito. Você já faz parte da equipe.'),
    ).toBeDefined()
    expect(equipe.tokensAceitos).toEqual([TOKEN])
    expect(
      screen.getByRole('link', { name: copy.irParaOPainel }),
    ).toBeDefined()
  })

  it('sessão de outro e-mail não oferece o aceite', async () => {
    const { autenticacao } = await abrirConvite(
      previa(),
      'outra.pessoa@aurora.com.br',
    )

    expect(await screen.findByText(copy.emailDiferente)).toBeDefined()
    expect(screen.queryByRole('button', { name: copy.aceitar })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: copy.sair }))
    expect(autenticacao.sessaoAtual()).toBeNull()
  })

  it('recusa da borda aparece com a frase que ela devolveu', async () => {
    await abrirConvite(
      {
        ...previa(),
        aceitarConvite: {
          ok: false,
          mensagem: 'Este convite é para outro e-mail.',
        },
      },
      EMAIL_DO_CONVITE,
    )

    fireEvent.click(await screen.findByRole('button', { name: copy.aceitar }))

    expect(
      await screen.findByText('Este convite é para outro e-mail.'),
    ).toBeDefined()
    expect(screen.queryByRole('link', { name: copy.irParaOPainel })).toBeNull()
  })

  it.each<SituacaoRecusada>(['expirado', 'revogado', 'ja_aceito', 'nao_encontrado'])(
    'convite %s diz o que aconteceu, sem oferecer o aceite',
    async (situacao) => {
      await abrirConvite(previa({ situacao }), EMAIL_DO_CONVITE)

      const aviso = await screen.findByRole('alert')
      expect(aviso.textContent).toBe(copy.situacoes[situacao])
      expect(screen.queryByRole('button', { name: copy.aceitar })).toBeNull()
    },
  )

  it('falha de comunicação não vira tela em branco', async () => {
    await abrirConvite({
      lerConvite: { ok: false, motivo: 'falha-de-comunicacao' },
    })

    const aviso = await screen.findByRole('alert')
    expect(aviso.textContent).toBe(copy.falhaDeComunicacao)
  })
})
