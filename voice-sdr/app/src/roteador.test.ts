import { createMemoryHistory } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { criarRoteador } from '@/roteador'

function abrir(caminho: string, temSessao: boolean) {
  return criarRoteador(
    { autenticacao: { temSessao: () => temSessao } },
    createMemoryHistory({ initialEntries: [caminho] }),
  )
}

describe('roteador', () => {
  it('registra o painel e as duas rotas de autenticação', () => {
    const roteador = abrir('/entrar', false)
    const caminhos = Object.values(roteador.routesById).map(
      (rota) => rota.fullPath,
    )

    expect(caminhos).toContain('/')
    expect(caminhos).toContain('/entrar')
    expect(caminhos).toContain('/recuperar-senha')
  })

  it('sem sessão, a rota protegida desvia para /entrar levando o destino', async () => {
    const roteador = abrir('/', false)
    await roteador.load()

    expect(roteador.state.location.pathname).toBe('/entrar')
    expect(roteador.state.location.search).toEqual({ destino: '/' })
  })

  it('com sessão, a rota protegida carrega sem desvio', async () => {
    const roteador = abrir('/', true)
    await roteador.load()

    expect(roteador.state.location.pathname).toBe('/')
  })

  it('as rotas de autenticação abrem sem sessão', async () => {
    const roteador = abrir('/recuperar-senha', false)
    await roteador.load()

    expect(roteador.state.location.pathname).toBe('/recuperar-senha')
  })

  // `location.search` é a busca crua da barra de endereço; a busca que o
  // componente recebe é a do match, já passada por validateSearch.
  it('destino externo na barra de endereço não sobrevive à validação da busca', async () => {
    const roteador = abrir('/entrar?destino=https://outro.site/roubo', false)
    await roteador.load()

    const match = roteador.state.matches.at(-1)
    expect(match?.routeId).toBe('/entrar')
    expect(match?.search).toEqual({ destino: undefined })
  })

  it('a lista de leads devolve toda chave do recorte, ainda que vazia', async () => {
    const roteador = abrir('/leads?etapa=won&termo=%20%20&utm_source=email', true)
    await roteador.load()

    const match = roteador.state.matches.at(-1)
    expect(match?.routeId).toBe('/aplicacao/leads')
    expect(match?.search).toEqual({
      // Cada chave do recorte sai sempre: é a atribuição que apaga o que veio
      // escrito à mão, como o termo de espaços em branco desta busca.
      termo: undefined,
      etapa: 'won',
      temperatura: undefined,
      origem: undefined,
      atividade: undefined,
      bloqueado: undefined,
      ordenacao: undefined,
      // Bagagem de link passa, e passa de propósito: `utm_source` não é filtro,
      // e recusar o que o recorte não conhece seria recusar link legítimo. É a
      // mesma regra de `_shared/recorte-de-leads.ts`.
      utm_source: 'email',
    })
  })

  // Sabotagem conferida: `validateSearch` devolvendo `{}` deixa o número de
  // espaços em branco passar cru, e este teste cai.
  it('a lista de chamadas devolve toda chave do recorte, ainda que vazia', async () => {
    const roteador = abrir('/chamadas?proposito=rescue&numero=%20%20&utm_source=email', true)
    await roteador.load()

    const match = roteador.state.matches.at(-1)
    expect(match?.routeId).toBe('/aplicacao/chamadas')
    expect(match?.search).toEqual({
      periodo: undefined,
      proposito: 'rescue',
      resultado: undefined,
      numero: undefined,
      ordenacao: undefined,
      utm_source: 'email',
    })
  })
})
