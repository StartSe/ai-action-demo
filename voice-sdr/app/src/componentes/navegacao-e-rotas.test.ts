// O menu e o roteador dizem a mesma coisa (US-249).
//
// Esta é a rede que faltava. Antes dela, onze dos vinte e três itens da barra
// lateral apontavam para rotas que não existiam, e as suítes passavam verdes:
// nada cruzava as duas listas. Clicar em qualquer um levava a um estado morto,
// sem tela e sem volta.
//
// O que este arquivo cobra, nos dois sentidos:
//
// 1. Item marcado como disponível **tem** rota registrada. Marcar um item
//    antes de construir a tela volta a criar o link que morre.
// 2. Rota registrada **está** marcada como disponível. Construir a tela e
//    esquecer de ligar o item deixa a tela inalcançável pelo menu — que é como
//    ninguém descobre que ela existe.
//
// Fica em jsdom e não em `testes/estatica/` porque lê o roteador de verdade,
// que é código do app e depende dos alias de `vite.config.ts`.

import { createMemoryHistory } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { navegacao } from '@/copy/navegacao'
import { criarRoteador } from '@/roteador'

/** Os caminhos que o roteador conhece, como ele os enxerga. */
function caminhosRegistrados(): Set<string> {
  const roteador = criarRoteador(
    { autenticacao: { temSessao: () => true } },
    createMemoryHistory({ initialEntries: ['/'] }),
  )
  const caminhos = new Set<string>()
  for (const rota of Object.values(roteador.routesById)) {
    const caminho = rota.fullPath
    // Rota com parâmetro (`/chamadas/$id`) nunca está no menu: o menu leva a
    // listas, e a ficha se alcança pela lista.
    if (typeof caminho === 'string' && !caminho.includes('$')) {
      caminhos.add(caminho.length > 1 ? caminho.replace(/\/$/, '') : caminho)
    }
  }
  return caminhos
}

/** Todo item do menu, achatado das três trilhas. */
function itensDoMenu() {
  return navegacao.trilhas.flatMap((trilha) =>
    trilha.itens.map((item) => ({ ...item, trilha: trilha.sigla })),
  )
}

describe('o menu e o roteador', () => {
  it('todo item disponível tem rota registrada', () => {
    const registrados = caminhosRegistrados()
    const prometidos = itensDoMenu()
      .filter((item) => item.disponivel)
      .filter((item) => !registrados.has(item.caminho))
      .map((item) => `${item.trilha} · ${item.rotulo} (${item.caminho})`)

    expect(
      prometidos,
      'item do menu marcado como disponível e sem rota: ou falta registrar a ' +
        'rota em roteador.tsx, ou o item precisa voltar a disponivel: false',
    ).toEqual([])
  })

  it('toda rota do app está no menu, e marcada como disponível', () => {
    const noMenu = new Map(itensDoMenu().map((item) => [item.caminho, item]))

    // As que não são destino de menu, e por quê. Lista fechada: rota nova
    // aparece aqui ou no menu, e nunca em silêncio.
    const FORA_DO_MENU: Record<string, string> = {
      '/entrar': 'autenticação: quem não entrou não vê menu nenhum',
      '/recuperar-senha': 'autenticação, pela mesma razão',
      '/convite': 'chega por link de e-mail, com o token no caminho',
      '/configuracao-inicial': 'o assistente é chamado pelo checklist da barra, não por item',
      '/leads/novo': 'ação da tela de leads, alcançada pelo botão dela',
      '/leads/importar': 'idem: é um passo dentro de leads',
      '/aplicacao': 'a casca das rotas protegidas, que não é tela',
      '/': 'o painel está no menu como Painel; este é o mesmo caminho pela raiz',
    }

    const orfas = [...caminhosRegistrados()]
      .filter((caminho) => !(caminho in FORA_DO_MENU))
      .filter((caminho) => {
        const item = noMenu.get(caminho)
        return item === undefined || !item.disponivel
      })

    expect(
      orfas,
      'rota registrada que o menu não alcança: ou falta ligar o item em ' +
        'copy/navegacao.ts, ou falta a razão em FORA_DO_MENU',
    ).toEqual([])
  })

  it('item indisponível não vira caminho registrado por acidente', () => {
    // O espelho do primeiro teste: construir a tela e esquecer de ligar o item
    // deixa a tela inalcançável pelo menu.
    const registrados = caminhosRegistrados()
    const esquecidos = itensDoMenu()
      .filter((item) => !item.disponivel && registrados.has(item.caminho))
      .map((item) => `${item.rotulo} (${item.caminho})`)

    expect(
      esquecidos,
      'a rota existe mas o item continua marcado como em breve: ligue ' +
        'disponivel: true em copy/navegacao.ts',
    ).toEqual([])
  })
})
