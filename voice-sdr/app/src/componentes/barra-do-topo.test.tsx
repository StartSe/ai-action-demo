import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BarraDoTopo } from '@/componentes/barra-do-topo'
import { comum } from '@/copy/comum'

afterEach(cleanup)

describe('BarraDoTopo', () => {
  it('mostra o e-mail de quem entrou e a saída', () => {
    const aoSair = vi.fn()
    render(
      <BarraDoTopo emailDoUsuario="ana@transportes.com.br" aoSair={aoSair} />,
    )

    expect(screen.getByText('ana@transportes.com.br')).toBeDefined()
    screen.getByRole('button', { name: comum.sair }).click()
    expect(aoSair).toHaveBeenCalledOnce()
  })

  it('sem sessão, não mostra a conta', () => {
    render(<BarraDoTopo secao="Painel" />)

    expect(screen.queryByRole('button', { name: comum.sair })).toBeNull()
  })

  it('diz em que tela a pessoa está', () => {
    render(<BarraDoTopo secao="Equipe" />)

    expect(screen.getByText('Equipe')).toBeDefined()
  })
})
