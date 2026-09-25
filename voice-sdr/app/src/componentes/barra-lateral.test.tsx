import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { BarraLateral } from '@/componentes/barra-lateral'
import fonteDaBarra from '@/componentes/barra-lateral.tsx?raw'
import { barraLateral, navegacao } from '@/copy/navegacao'

afterEach(cleanup)

/**
 * A barra dentro de um roteador mínimo.
 *
 * Ela passou a usar `Link` em vez de `<a>` — navegação no cliente, sem
 * recarregar a aplicação a cada item do menu —, e `Link` exige o contexto do
 * roteador. É um roteador só desta prova, e não o da aplicação: montar o de
 * verdade traria junto a árvore inteira de telas, e cada uma exige o provedor
 * do seu serviço. O que se mede aqui é a barra.
 *
 * Que todo `to` do menu seja rota registrada é cobrado por
 * `navegacao-e-rotas.test.ts`, que lê o roteador de verdade.
 */
async function montar(caminhoAtual: string) {
  const raiz = createRootRoute({
    component: () => <BarraLateral caminhoAtual={caminhoAtual} />,
  })
  // O `Link` valida o destino contra a árvore: sem estas rotas, todo item do
  // menu viraria um elo para lugar nenhum e as asserções de `href` cairiam.
  const rotas = navegacao.trilhas
    .flatMap((trilha) => trilha.itens)
    .filter((item) => item.disponivel)
    .map((item) => createRoute({ getParentRoute: () => raiz, path: item.caminho }))

  const roteador = createRouter({
    routeTree: raiz.addChildren(rotas),
    history: createMemoryHistory({ initialEntries: [caminhoAtual] }),
  })
  await roteador.load()
  render(<RouterProvider router={roteador} />)
  await waitFor(() => {
    expect(screen.getByRole('navigation', { name: barraLateral.rotulo })).toBeDefined()
  })
}

describe('BarraLateral', () => {
  it('exibe as três trilhas de navegação', async () => {
    await montar('/')

    expect(screen.getByRole('heading', { name: 'OPERAÇÃO' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'MÁQUINA' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'ADMINISTRAÇÃO' })).toBeDefined()
  })

  it('marca como página atual apenas o item do caminho aberto', async () => {
    await montar('/config/equipe')

    const atuais = screen
      .getAllByRole('link')
      .filter((elo) => elo.getAttribute('aria-current') === 'page')

    expect(atuais.map((elo) => elo.textContent)).toEqual(['Equipe'])
  })

  it('item sem tela aparece apagado e não vira elo', async () => {
    await montar('/')

    const semTela = navegacao.trilhas
      .flatMap((trilha) => trilha.itens)
      .filter((item) => !item.disponivel)
    expect(semTela.length).toBeGreaterThan(0)

    for (const item of semTela) {
      // O rótulo continua na tela: o conjunto de rotas é o mapa do produto, e
      // escondê-lo faria cada tela nova parecer surpresa.
      expect(screen.getByText(item.rotulo)).toBeDefined()
      // Mas não é link: um elo que não leva a lugar nenhum é pior do que texto
      // apagado. Sabotagem conferida: devolver o `<a>` derruba esta asserção.
      expect(screen.queryByRole('link', { name: item.rotulo })).toBeNull()
    }
    expect(screen.getAllByText(barraLateral.emBreve)).toHaveLength(semTela.length)
  })

  it('os textos da barra moram em copy/navegacao.ts, não no componente (D-17)', () => {
    // Literal de interface solto no JSX é contra a convenção do repositório.
    expect(fonteDaBarra).not.toContain(`'${barraLateral.emBreve}'`)
    expect(fonteDaBarra).not.toContain(`"${barraLateral.rotulo}"`)
  })

  it('todo item com tela é um elo de verdade', async () => {
    await montar('/')

    const comTela = navegacao.trilhas
      .flatMap((trilha) => trilha.itens)
      .filter((item) => item.disponivel)

    for (const item of comTela) {
      const elo = screen.getByRole('link', { name: item.rotulo })
      expect(elo.getAttribute('href')).toBe(item.caminho)
    }
  })

  // O e-mail e a saída saíram do rodapé da barra e foram para a barra do topo,
  // que é onde a suíte põe a conta. As duas provas de então estão em
  // barra-do-topo.test.tsx.
})
