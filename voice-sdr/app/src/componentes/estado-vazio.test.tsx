import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EstadoVazio } from '@/componentes/estado-vazio'

afterEach(cleanup)

describe('EstadoVazio', () => {
  it('mostra título, explicação e botão de ação', () => {
    const aoAcionar = vi.fn()
    render(
      <EstadoVazio
        titulo="Nenhuma campanha"
        explicacao="Campanha é um conjunto de leads com um propósito."
        acao={{ rotulo: 'Criar campanha', aoAcionar }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Nenhuma campanha' })).toBeDefined()
    expect(
      screen.getByText('Campanha é um conjunto de leads com um propósito.'),
    ).toBeDefined()

    screen.getByRole('button', { name: 'Criar campanha' }).click()
    expect(aoAcionar).toHaveBeenCalledOnce()
  })

  it('omite o botão quando não há ação', () => {
    render(<EstadoVazio titulo="Fila limpa" explicacao="Nada pendente agora." />)

    expect(screen.queryByRole('button')).toBeNull()
  })
})
