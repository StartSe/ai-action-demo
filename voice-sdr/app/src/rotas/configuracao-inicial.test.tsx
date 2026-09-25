import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  BLOQUEIO_EM_PORTUGUES,
  PASSOS_EM_PORTUGUES,
  configuracaoInicial as copy,
} from '@/copy/configuracao-inicial'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeConfiguracaoDublado,
  passosDeExemplo,
  type RespostasDaConfiguracao,
  type ServicoDeConfiguracaoDublado,
} from '@/testes/servico-de-configuracao-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

afterEach(cleanup)

async function montar(
  servico: ServicoDeConfiguracaoDublado,
  caminho = '/configuracao-inicial',
) {
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    caminho,
    undefined,
    undefined,
    undefined,
    servico,
  )
  await screen.findByRole('heading', { level: 1 })
}

async function abrirAssistente(
  respostas: RespostasDaConfiguracao = { passos: passosDeExemplo() },
) {
  const servico = criarServicoDeConfiguracaoDublado(respostas)
  await montar(servico)
  return servico
}

function checklist() {
  return within(screen.getByRole('region', { name: copy.checklist.rotulo }))
}


// O tutorial em si é o assistente de abertura, provado em
// configuracao-inicial-inicio.test.tsx e configuracao-inicial-ligacao.test.tsx.

describe('checklist persistente', () => {
  it('lista o que falta e o que cada pendência impede', async () => {
    await abrirAssistente()

    const painel = checklist()
    const itens = painel.getAllByRole('listitem')
    // Sete pendências: credenciais já está medida como feita.
    expect(itens).toHaveLength(7)

    const numero = itens.find((item) =>
      item.textContent?.includes(PASSOS_EM_PORTUGUES.numero.titulo),
    )
    expect(numero?.textContent).toContain(BLOQUEIO_EM_PORTUGUES.ligacao)

    const especialista = itens.find((item) =>
      item.textContent?.includes(PASSOS_EM_PORTUGUES.especialista.titulo),
    )
    expect(especialista?.textContent).toContain(
      BLOQUEIO_EM_PORTUGUES.agendamento,
    )

    expect(
      painel.getByRole('link', { name: copy.checklist.continuar }).getAttribute('href'),
    ).toBe('/configuracao-inicial')
  })

  it('acompanha o operador nas outras telas enquanto houver pendência', async () => {
    const servico = criarServicoDeConfiguracaoDublado({
      passos: passosDeExemplo(),
    })
    await montar(servico, '/')

    expect(checklist().getByText(copy.checklist.titulo)).toBeDefined()
  })

  it('some da navegação quando a configuração termina', async () => {
    const servico = criarServicoDeConfiguracaoDublado()
    await montar(servico, '/')

    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: copy.checklist.rotulo }),
      ).toBeNull(),
    )
  })
})
