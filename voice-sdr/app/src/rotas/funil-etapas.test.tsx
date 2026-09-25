// O que a configuração das etapas precisa provar (US-146, RF-207):
//
// 1. **Renomear não quebra automação** (terceiro critério de aceite da F4, pelo
//    lado da interface): a etapa `qualified` vira "Tem fit", o quadro relê, um
//    lead se move pela tela e a chamada leva `qualified`. O rótulo nunca chega
//    ao serviço de mudança de etapa.
// 2. **A chave aparece ao lado do rótulo**, em `.val`, com a frase que diz que
//    a automação usa a chave.
// 3. **Reordenar é a lista inteira numa chamada, e a tela desenha a ordem do
//    servidor**: recusa por posição duplicada não deixa a ordem pedida na tela.
// 4. **Apagar pede confirmação com a contagem**; canônica não oferece apagar.
// 5. **Cor é escolha na paleta**, sem campo de hexadecimal.
// 6. **Quem não administra vê as etapas e não os controles**, com a negativa.
// 7. Os quatro estados: carregando, falha, vazio e com dado.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import { funil as copy } from '@/copy/funil'
import { ProvedorDeEquipe } from '@/equipe/provedor'
import type { Equipe, Papel } from '@/equipe/tipos'
import { CORES_DA_ETAPA } from '@/funil/etapas'
import { ProvedorDeLeads } from '@/leads/provedor'
import { TelaDoFunil } from '@/rotas/funil'
import {
  criarServicoDeLeadsDublado,
  ETAPAS_DE_EXEMPLO,
  FUNIL_DO_DUBLE,
  type LeadDeExemplo,
  type RespostasDeLeads,
} from '@/testes/servico-de-leads-dublado'
import { criarServicoDeEquipeDublado } from '@/testes/servico-de-equipe-dublado'

function lead(mudanca: Partial<LeadDeExemplo> = {}): LeadDeExemplo {
  return {
    id: 'lead-1',
    nome: 'Paula Siqueira',
    telefone: '+5511988887777',
    email: 'paula@itajai.test',
    empresa: 'Transportes Itajaí',
    cidade: 'Itajaí',
    estado: 'SC',
    etapa: ETAPAS_DE_EXEMPLO[0]!,
    temperatura: null,
    ultimaAtividade: '2026-09-24T12:00:00.000Z',
    criadoEm: '2026-09-20T09:00:00.000Z',
    bloqueado: false,
    ...mudanca,
  }
}

/** A equipe com quem olha no papel pedido e uma administradora a quem pedir acesso. */
function equipe(papelDoUsuario: Papel): Equipe {
  return {
    conta: { id: 'c-1', nome: 'Aurora Educação' },
    papelDoUsuario,
    membros: [
      {
        usuarioId: 'u-1',
        nome: 'Caio Moreira',
        email: 'caio@aurora.com.br',
        papel: papelDoUsuario,
        ultimoAcesso: null,
      },
      {
        usuarioId: 'u-2',
        nome: 'Renata Alves',
        email: 'renata@aurora.com.br',
        papel: 'admin',
        ultimoAcesso: null,
      },
    ],
    convites: [],
  }
}

async function montar(respostas: RespostasDeLeads = {}, papel: Papel = 'admin') {
  const servico = criarServicoDeLeadsDublado({ leads: [lead()], ...respostas })
  const daEquipe = criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: equipe(papel) } })
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  const raiz = createRootRoute({
    component: () => (
      <QueryClientProvider client={cliente}>
        <ProvedorDeEquipe servico={daEquipe}>
          <ProvedorDeLeads servico={servico}>
            <TelaDoFunil />
          </ProvedorDeLeads>
        </ProvedorDeEquipe>
      </QueryClientProvider>
    ),
  })
  const daLista = createRoute({
    getParentRoute: () => raiz,
    path: '/leads',
    validateSearch: (busca: Record<string, unknown>) => ({ etapa: busca.etapa as string | undefined }),
  })
  const roteador = createRouter({
    routeTree: raiz.addChildren([daLista]),
    history: createMemoryHistory({ initialEntries: ['/funil'] }),
  })
  await roteador.load()
  render(<RouterProvider router={roteador} />)
  return servico
}

/** Abre a configuração e espera a lista de etapas. */
async function abrirConfiguracao() {
  fireEvent.click(await screen.findByRole('button', { name: copy.etapas.abrir }))
  return screen.findByRole('list', { name: copy.etapas.lista })
}

/** O rótulo de cada etapa na lista, na ordem à vista. */
function ordemNaTela(): string[] {
  const lista = screen.getByRole('list', { name: copy.etapas.lista })
  return within(lista)
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.font-bold')?.textContent ?? '')
}

afterEach(cleanup)

test('renomear qualified para "Tem fit" não muda o que a automação recebe: o lead vai com stage_key qualified', async () => {
  const servico = await montar()
  await abrirConfiguracao()

  const campo = screen.getByRole('textbox', { name: copy.etapas.rotulo('Qualificado') })
  fireEvent.change(campo, { target: { value: 'Tem fit' } })
  fireEvent.click(within(campo.closest('form')!).getByRole('button', { name: copy.etapas.renomear }))

  // Renomear não pede confirmação.
  expect(screen.queryByRole('dialog')).toBeNull()
  await screen.findByText(copy.etapas.feito.renomeada('Tem fit'))

  // A etapa foi pelo id, com o rótulo novo; a chave não viajou.
  expect(servico.configuracoes).toEqual([
    {
      funilId: FUNIL_DO_DUBLE,
      etapas: [{ id: 'e-qualified', rotulo: 'Tem fit', posicao: 2, cor: null }],
    },
  ])

  // O quadro relê: a coluna passou a se chamar "Tem fit".
  const temFit = await screen.findByRole('region', { name: 'Tem fit' })
  expect(screen.queryByRole('region', { name: 'Qualificado' })).toBeNull()

  // Move o lead pela tela, escolhendo o destino pelo rótulo novo.
  const novo = screen.getByRole('region', { name: 'Novo' })
  const seletor = within(novo).getByRole('combobox', { name: copy.cartao.mover('Paula Siqueira') })
  const opcao = within(seletor).getByRole('option', { name: 'Tem fit' }) as HTMLOptionElement
  fireEvent.change(seletor, { target: { value: opcao.value } })

  await screen.findByText(copy.movimento.movido('Paula Siqueira', 'Tem fit'))
  expect(servico.movimentos).toEqual([{ leadId: 'lead-1', chave: 'qualified', ator: 'user' }])

  // O cartão da coluna exibe "Tem fit", com o lead dentro.
  await waitFor(() => expect(within(temFit).getByText('Paula Siqueira')).toBeDefined())
  expect(within(temFit).getByRole('heading', { name: 'Tem fit' })).toBeDefined()
})

test('cada etapa mostra a chave em .val ao lado do rótulo, e a tela diz que a automação usa a chave', async () => {
  await montar()
  const lista = await abrirConfiguracao()

  expect(screen.getByText(copy.etapas.chaveExplicada)).toBeDefined()
  const chaves = [...lista.querySelectorAll('.val')]
    .map((elemento) => elemento.textContent)
    .filter((texto) => ETAPAS_DE_EXEMPLO.some((etapa) => etapa.chave === texto))
  expect(chaves).toEqual(ETAPAS_DE_EXEMPLO.map((etapa) => etapa.chave))
})

test('reordenar manda a lista inteira numa chamada, e a tela mostra a ordem que o servidor devolveu', async () => {
  const servico = await montar()
  await abrirConfiguracao()

  fireEvent.click(screen.getByRole('button', { name: copy.etapas.descer('Novo') }))
  await screen.findByText(copy.etapas.feito.reordenada)

  expect(servico.configuracoes).toHaveLength(1)
  expect(servico.configuracoes[0]!.etapas.map((etapa) => [etapa.id, etapa.posicao])).toEqual([
    ['e-contacted', 0],
    ['e-new', 1],
    ['e-qualified', 2],
    ['e-meeting_booked', 3],
    ['e-won', 4],
    ['e-lost', 5],
  ])
  expect(ordemNaTela().slice(0, 2)).toEqual(['Contatado', 'Novo'])

  // O quadro também relê na ordem nova.
  await waitFor(() =>
    expect(screen.getAllByRole('region').map((regiao) => regiao.getAttribute('aria-label'))).toContain(
      'Contatado',
    ),
  )
  const colunas = screen
    .getAllByRole('region')
    .map((regiao) => regiao.getAttribute('aria-label'))
    .filter((nome) => ETAPAS_DE_EXEMPLO.some((etapa) => etapa.rotulo === nome))
  expect(colunas.slice(0, 2)).toEqual(['Contatado', 'Novo'])
})

test('posição duplicada recusada pelo banco não deixa a ordem pedida na tela', async () => {
  const servico = await montar({
    configurarEtapas: { ok: false, motivo: 'posicao-duplicada' },
  })
  await abrirConfiguracao()

  fireEvent.click(screen.getByRole('button', { name: copy.etapas.descer('Novo') }))

  expect(await screen.findByText(copy.etapas.falhas['posicao-duplicada'])).toBeDefined()
  expect(servico.configuracoes).toHaveLength(1)
  expect(ordemNaTela()).toEqual(ETAPAS_DE_EXEMPLO.map((etapa) => etapa.rotulo))
})

test('etapa canônica não oferece apagar, e a razão aparece na tela', async () => {
  await montar()
  const lista = await abrirConfiguracao()

  for (const etapa of ETAPAS_DE_EXEMPLO) {
    expect(screen.queryByRole('button', { name: copy.etapas.apagar(etapa.rotulo) })).toBeNull()
  }
  expect(within(lista).getAllByText(copy.etapas.canonica)).toHaveLength(ETAPAS_DE_EXEMPLO.length)
})

test('etapa nova mostra a chave antes de criar, e apagá-la pede confirmação irreversível', async () => {
  const servico = await montar()
  await abrirConfiguracao()

  fireEvent.change(screen.getByRole('textbox', { name: copy.etapas.nova.rotulo }), {
    target: { value: 'Proposta enviada' },
  })
  expect(screen.getByText('proposta_enviada').classList.contains('val')).toBe(true)
  fireEvent.change(screen.getByRole('combobox', { name: copy.etapas.nova.cor }), {
    target: { value: 'carmim' },
  })
  fireEvent.click(screen.getByRole('button', { name: copy.etapas.nova.criar }))

  await screen.findByText(copy.etapas.feito.criada('Proposta enviada'))
  expect(servico.configuracoes.at(-1)!.etapas).toEqual([
    { chave: 'proposta_enviada', rotulo: 'Proposta enviada', cor: 'carmim', posicao: 6 },
  ])
  expect(ordemNaTela().at(-1)).toBe('Proposta enviada')

  fireEvent.click(screen.getByRole('button', { name: copy.etapas.apagar('Proposta enviada') }))
  const dialogo = screen.getByRole('dialog')
  expect(within(dialogo).getByText(copy.etapas.confirmacao.vazia)).toBeDefined()
  expect(servico.etapasApagadas).toEqual([])

  fireEvent.click(within(dialogo).getByRole('button', { name: copy.etapas.confirmacao.confirmar }))
  await screen.findByText(copy.etapas.feito.apagada('Proposta enviada'))
  expect(servico.etapasApagadas).toEqual(['e-proposta_enviada'])
  expect(ordemNaTela()).not.toContain('Proposta enviada')
})

test('apagar etapa com lead diz quantos estão nela e não oferece confirmar', async () => {
  const proposta = { chave: 'proposta', rotulo: 'Proposta' }
  const servico = await montar({
    etapas: [...ETAPAS_DE_EXEMPLO, proposta],
    leads: [lead(), lead({ id: 'lead-2', telefone: '+5511900000001', etapa: proposta })],
  })
  await abrirConfiguracao()

  fireEvent.click(screen.getByRole('button', { name: copy.etapas.apagar('Proposta') }))
  const dialogo = screen.getByRole('dialog')
  expect(within(dialogo).getByText(copy.etapas.confirmacao.comLeads(1))).toBeDefined()
  const confirmar = within(dialogo).getByRole('button', {
    name: copy.etapas.confirmacao.confirmar,
  }) as HTMLButtonElement
  expect(confirmar.disabled).toBe(true)
  expect(servico.etapasApagadas).toEqual([])
})

test('a cor é escolha entre os tokens da paleta, sem campo de hexadecimal', async () => {
  const servico = await montar()
  await abrirConfiguracao()

  const seletor = screen.getByRole('combobox', { name: copy.etapas.cor('Novo') })
  const opcoes = within(seletor)
    .getAllByRole('option')
    .map((opcao) => (opcao as HTMLOptionElement).value)
  expect(opcoes).toEqual([...CORES_DA_ETAPA])
  expect(screen.queryByRole('textbox', { name: /cor/i })).toBeNull()

  fireEvent.change(seletor, { target: { value: 'carmim' } })
  await screen.findByText(copy.etapas.feito.colorida('Novo'))
  expect(servico.configuracoes).toEqual([
    { funilId: FUNIL_DO_DUBLE, etapas: [{ id: 'e-new', rotulo: 'Novo', posicao: 0, cor: 'carmim' }] },
  ])
  expect((screen.getByRole('combobox', { name: copy.etapas.cor('Novo') }) as HTMLSelectElement).value).toBe(
    'carmim',
  )
})

test('operador vê as etapas e as chaves, sem controle nenhum, com a negativa e a quem pedir', async () => {
  const servico = await montar({}, 'operator')
  const lista = await abrirConfiguracao()

  expect(within(lista).getAllByRole('listitem')).toHaveLength(ETAPAS_DE_EXEMPLO.length)
  expect(within(lista).getByText('qualified')).toBeDefined()

  const configuracao = screen.getByRole('region', { name: copy.etapas.titulo })
  expect(within(configuracao).queryAllByRole('textbox')).toEqual([])
  expect(within(configuracao).queryAllByRole('combobox')).toEqual([])
  expect(within(configuracao).queryAllByRole('button')).toEqual([])

  const negativa = within(configuracao).getByRole('alert')
  expect(within(negativa).getByText(copy.etapas.negativa)).toBeDefined()
  expect(within(negativa).getByText('Renata Alves')).toBeDefined()
  expect(servico.configuracoes).toEqual([])
})

test('os quatro estados: carregando, falha, vazio e com dado', async () => {
  await montar({ configuracaoPendente: true })
  fireEvent.click(await screen.findByRole('button', { name: copy.etapas.abrir }))
  expect(await screen.findByText(copy.etapas.carregando)).toBeDefined()
  cleanup()

  await montar({ configuracaoFalha: true })
  fireEvent.click(await screen.findByRole('button', { name: copy.etapas.abrir }))
  expect(await screen.findByText(copy.etapas.falha)).toBeDefined()
  cleanup()

  await montar({ etapas: [], leads: [] })
  fireEvent.click(await screen.findByRole('button', { name: copy.etapas.abrir }))
  expect(await screen.findByText(copy.etapas.vazio)).toBeDefined()
  expect(screen.getByRole('button', { name: copy.etapas.nova.criar })).toBeDefined()
  cleanup()

  await montar()
  await abrirConfiguracao()
  expect(ordemNaTela()).toEqual(ETAPAS_DE_EXEMPLO.map((etapa) => etapa.rotulo))
})
