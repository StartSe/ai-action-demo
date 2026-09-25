// O que esta tela precisa provar: onde cada lead está (US-250, RF-201) e
// como ele muda de etapa (US-145, RF-202, RF-205, RF-206).
//
// As asserções que justificam o arquivo:
//
// 1. **Quem não tem etapa não vira coluna, e não entra no total.** Ele não
//    está no funil, e somá-lo faria o número do funil contar quem está fora
//    dele.
// 2. **A coluna é cartão de leitura rápida.** Mostra os mais recentes, diz
//    quantos há, e leva para a lista filtrada — que é onde se trabalha.
// 3. **Coluna vazia continua na tela**, com a etapa e o zero: esconder a etapa
//    sem lead faria o funil mudar de forma conforme o dia.
// 4. **Mover pelo teclado é o caminho principal** (RNF-15), e arrastar chama
//    o mesmo `moverDeEtapa`, sempre com a chave da etapa e como gente.
// 5. **O sinal da Sarah some quando gente move depois dela** (RF-205).
// 6. **Quem só observa vê o quadro sem controle**, com a negativa e a quem
//    pedir acesso.

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
import type { Equipe } from '@/equipe/tipos'
import { ProvedorDeLeads } from '@/leads/provedor'

import { TelaDoFunil } from '@/rotas/funil'
import {
  criarServicoDeLeadsDublado,
  ETAPAS_DE_EXEMPLO,
  type LeadDeExemplo,
  type RespostasDeLeads,
} from '@/testes/servico-de-leads-dublado'
import {
  criarServicoDeEquipeDublado,
  equipeDeExemplo,
} from '@/testes/servico-de-equipe-dublado'

/** O lead como o dublê o guarda: a lista mais o que a ficha do lead usará. */
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

/** A tela dentro de um roteador mínimo: ela usa `Link` para a lista filtrada. */
async function montar(
  respostas: RespostasDeLeads = {},
  daEquipe: Equipe = equipeDeExemplo('operator'),
) {
  const servico = criarServicoDeLeadsDublado(respostas)
  const equipe = criarServicoDeEquipeDublado({
    carregar: { ok: true, equipe: daEquipe },
  })
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  const raiz = createRootRoute({
    component: () => (
      <QueryClientProvider client={cliente}>
        <ProvedorDeEquipe servico={equipe}>
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

afterEach(cleanup)

test('a conta sem lead nenhum vê o convite para importar, e não seis colunas vazias', async () => {
  await montar({ leads: [] })

  await screen.findByText(copy.vazio.titulo)
  const importar = screen.getByRole('link', { name: copy.vazio.acao })
  expect(importar.getAttribute('href')).toBe('/leads/importar')
  expect(screen.queryByRole('region', { name: 'Novo' })).toBeNull()
})

test('cada etapa vira uma coluna, com a contagem da conta', async () => {
  await montar({
    leads: [
      lead({ id: 'a' }),
      lead({ id: 'b', nome: 'João Prado' }),
      lead({ id: 'c', nome: 'Rita Alves', etapa: ETAPAS_DE_EXEMPLO[2]! }),
    ],
  })

  await screen.findByRole('region', { name: 'Novo' })

  const novo = screen.getByRole('region', { name: 'Novo' })
  expect(within(novo).getByText('2')).toBeDefined()
  expect(within(novo).getByText('Paula Siqueira')).toBeDefined()
  expect(within(novo).getByText('João Prado')).toBeDefined()

  const qualificado = screen.getByRole('region', { name: 'Qualificado' })
  expect(within(qualificado).getByText('Rita Alves')).toBeDefined()

  expect(screen.getByText(copy.total(3))).toBeDefined()
})

test('coluna sem lead continua na tela, com a etapa e o zero', async () => {
  await montar({ leads: [lead()] })

  await screen.findByRole('region', { name: 'Novo' })

  // Esconder a etapa vazia faria o funil mudar de forma conforme o dia.
  const perdido = screen.getByRole('region', { name: 'Perdido' })
  expect(within(perdido).getByText(copy.coluna.vazia)).toBeDefined()
  expect(within(perdido).getByText('0')).toBeDefined()
})

test('quem não tem etapa fica fora do funil, e fora do total', async () => {
  await montar({
    leads: [lead({ id: 'a' }), lead({ id: 'b', nome: 'Sem etapa', etapa: null })],
  })

  await screen.findByRole('region', { name: 'Novo' })

  // Um no funil, um fora: o total do funil é 1, e não 2.
  expect(screen.getByText(copy.total(1))).toBeDefined()
  expect(screen.getByText(copy.semEtapa(1))).toBeDefined()
  expect(screen.getByRole('link', { name: copy.verSemEtapa })).toBeDefined()
  // E ele não aparece em coluna nenhuma.
  expect(screen.queryByText('Sem etapa')).toBeNull()
})

test('a coluna leva para a lista filtrada por aquela etapa', async () => {
  await montar({ leads: [lead()] })

  await screen.findByRole('region', { name: 'Novo' })
  const novo = screen.getByRole('region', { name: 'Novo' })

  // Trabalhar a etapa é na lista, que já pagina e já filtra: duplicar a tabela
  // aqui manteria duas versões do mesmo recorte.
  const paraLista = within(novo).getByRole('link', { name: copy.coluna.verTodos })
  expect(paraLista.getAttribute('href')).toBe('/leads?etapa=new')
})

test('coluna com mais leads que o teto diz que está mostrando os recentes', async () => {
  const muitos = Array.from({ length: 12 }, (_, indice) =>
    lead({ id: `lead-${indice}`, nome: `Lead ${indice}` }),
  )
  await montar({ leads: muitos })

  await screen.findByRole('region', { name: 'Novo' })
  const novo = screen.getByRole('region', { name: 'Novo' })

  expect(within(novo).getByText(copy.coluna.truncada(12))).toBeDefined()
  // Oito cartões, que é o teto da coluna.
  expect(within(novo).getAllByRole('listitem')).toHaveLength(8)
})

test('lead bloqueado se anuncia no cartão', async () => {
  await montar({ leads: [lead({ bloqueado: true })] })

  await screen.findByRole('region', { name: 'Novo' })
  expect(screen.getByText(copy.bloqueado)).toBeDefined()
})

test('a falha de leitura mostra a frase, e não uma tela em branco', async () => {
  await montar({ funilFalha: true })

  const alerta = await screen.findByRole('alert')
  expect(alerta.textContent).toBe(copy.falha)
})

test('enquanto carrega, a tela diz que está carregando', async () => {
  await montar({ funilPendente: true })

  await waitFor(() => {
    expect(screen.getByText(copy.carregando)).toBeDefined()
  })
})

/** A coluna de uma etapa, depois de o quadro desenhar. */
async function coluna(rotulo: string) {
  return screen.findByRole('region', { name: rotulo })
}

test('o cartão traz telefone como valor, temperatura, pontuação e última atividade', async () => {
  await montar({ leads: [lead({ temperatura: 'quente', pontuacao: 72 })] })

  const novo = await coluna('Novo')
  expect(within(novo).getByText('+5511988887777').classList.contains('val')).toBe(true)
  expect(within(novo).getByText('Quente')).toBeDefined()
  expect(within(novo).getByText('72')).toBeDefined()
  expect(within(novo).getByText(copy.cartao.atividade)).toBeDefined()
  expect(within(novo).queryByText(copy.cartao.semAtividade)).toBeNull()
})

test('cartão sem pontuação e sem contato diz isso, em vez de mostrar zero', async () => {
  await montar({ leads: [lead({ ultimaAtividade: null })] })

  const novo = await coluna('Novo')
  expect(within(novo).getByText(copy.cartao.semPontuacao)).toBeDefined()
  expect(within(novo).getByText(copy.cartao.semAtividade)).toBeDefined()
  expect(within(novo).getByText(copy.cartao.semTemperatura)).toBeDefined()
})

test('pelo teclado, o seletor do cartão move o lead como decisão de gente', async () => {
  const servico = await montar({ leads: [lead()] })

  const novo = await coluna('Novo')
  const seletor = within(novo).getByRole('combobox', {
    name: copy.cartao.mover('Paula Siqueira'),
  })
  // A etapa atual não é destino: oferecê-la daria `mesma_etapa` à toa.
  const opcoes = within(seletor).getAllByRole('option').map((opcao) => opcao.textContent)
  expect(opcoes).not.toContain('Novo')

  fireEvent.change(seletor, { target: { value: 'qualified' } })

  // A chave, e não o rótulo, e sempre como gente (RF-202, RF-203).
  await waitFor(() => {
    expect(servico.movimentos).toEqual([{ leadId: 'lead-1', chave: 'qualified', ator: 'user' }])
  })
  expect((await screen.findByRole('status')).textContent).toBe(
    copy.movimento.movido('Paula Siqueira', 'Qualificado'),
  )
  await waitFor(() => {
    expect(within(screen.getByRole('region', { name: 'Qualificado' })).getByText('Paula Siqueira')).toBeDefined()
  })
  expect(within(screen.getByRole('region', { name: 'Novo' })).queryByText('Paula Siqueira')).toBeNull()
})

test('arrastar o cartão e soltar na coluna chama o mesmo caminho', async () => {
  const servico = await montar({ leads: [lead()] })

  const novo = await coluna('Novo')
  const cartao = within(novo).getByText('Paula Siqueira').closest('li')!
  expect(cartao.getAttribute('draggable')).toBe('true')

  const contatado = screen.getByRole('region', { name: 'Contatado' })
  fireEvent.dragStart(cartao)
  fireEvent.dragOver(contatado)
  fireEvent.drop(contatado)

  await waitFor(() => {
    expect(servico.movimentos).toEqual([{ leadId: 'lead-1', chave: 'contacted', ator: 'user' }])
  })
  await waitFor(() => {
    expect(within(screen.getByRole('region', { name: 'Contatado' })).getByText('Paula Siqueira')).toBeDefined()
  })
})

test('soltar na própria coluna não chama o servidor', async () => {
  const servico = await montar({ leads: [lead()] })

  const novo = await coluna('Novo')
  const cartao = within(novo).getByText('Paula Siqueira').closest('li')!
  fireEvent.dragStart(cartao)
  fireEvent.drop(novo)

  expect(servico.movimentos).toEqual([])
})

test('cartão que a Sarah moveu traz o sinal, e ele some quando gente move depois', async () => {
  await montar({
    leads: [
      lead({ ultimaMudancaDeEtapa: { ator: 'agent', em: '2026-09-24T10:00:00.000Z' } }),
      lead({
        id: 'lead-2',
        nome: 'João Prado',
        telefone: '+5511977776666',
        ultimaMudancaDeEtapa: { ator: 'user', em: '2026-09-24T10:00:00.000Z' },
      }),
    ],
  })

  const novo = await coluna('Novo')
  const daPaula = within(novo).getByText('Paula Siqueira').closest('li')!
  const doJoao = within(novo).getByText('João Prado').closest('li')!
  expect(within(daPaula).getByText(copy.cartao.movidoPelaSarah)).toBeDefined()
  expect(within(doJoao).queryByText(copy.cartao.movidoPelaSarah)).toBeNull()

  fireEvent.change(
    within(daPaula).getByRole('combobox', { name: copy.cartao.mover('Paula Siqueira') }),
    { target: { value: 'contacted' } },
  )

  const contatado = screen.getByRole('region', { name: 'Contatado' })
  await waitFor(() => {
    expect(within(contatado).getByText('Paula Siqueira')).toBeDefined()
  })
  expect(within(contatado).queryByText(copy.cartao.movidoPelaSarah)).toBeNull()
})

test('a recusa do servidor aparece com a frase da copy, e o lead fica onde estava', async () => {
  await montar({ leads: [lead()], moverDeEtapa: { ok: false, motivo: 'sem-permissao' } })

  const novo = await coluna('Novo')
  fireEvent.change(
    within(novo).getByRole('combobox', { name: copy.cartao.mover('Paula Siqueira') }),
    { target: { value: 'won' } },
  )

  const alerta = await screen.findByRole('alert')
  expect(alerta.textContent).toBe(copy.movimento.falhas['sem-permissao'])
  expect(within(screen.getByRole('region', { name: 'Novo' })).getByText('Paula Siqueira')).toBeDefined()
})

test('lead que já estava na etapa é resultado, não erro', async () => {
  await montar({ leads: [lead()], moverDeEtapa: { ok: true, resultado: 'mesma_etapa' } })

  const novo = await coluna('Novo')
  fireEvent.change(
    within(novo).getByRole('combobox', { name: copy.cartao.mover('Paula Siqueira') }),
    { target: { value: 'lost' } },
  )

  expect((await screen.findByRole('status')).textContent).toBe(
    copy.movimento.mesmaEtapa('Paula Siqueira', 'Perdido'),
  )
  expect(screen.queryByRole('alert')).toBeNull()
})

test('o filtro de origem recorta o quadro, e não há filtro de campanha', async () => {
  const servico = await montar({
    leads: [
      lead({ origem: 'import' }),
      lead({ id: 'lead-2', nome: 'João Prado', telefone: '+5511977776666', origem: 'manual' }),
    ],
  })

  await coluna('Novo')
  // `campaigns` é da F7: nenhum controle morto na tela.
  expect(screen.queryByRole('combobox', { name: /campanha/i })).toBeNull()

  fireEvent.change(screen.getByRole('combobox', { name: copy.filtros.origem }), {
    target: { value: 'manual' },
  })

  await waitFor(() => {
    expect(within(screen.getByRole('region', { name: 'Novo' })).queryByText('Paula Siqueira')).toBeNull()
  })
  expect(within(screen.getByRole('region', { name: 'Novo' })).getByText('João Prado')).toBeDefined()
  expect(servico.recortesDoFunil.at(-1)).toEqual({ origem: 'manual', atividadeDesde: undefined })
})

test('o filtro de período manda o instante, e o recorte vazio não vira convite de importar', async () => {
  const servico = await montar({
    leads: [lead({ ultimaAtividade: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() })],
  })

  await coluna('Novo')
  fireEvent.change(screen.getByRole('combobox', { name: copy.filtros.atividade }), {
    target: { value: '7d' },
  })

  await screen.findByText(copy.recorteVazio)
  const desde = servico.recortesDoFunil.at(-1)?.atividadeDesde
  expect(desde).toBeDefined()
  expect(Date.now() - Date.parse(desde!)).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000)
  // A conta tem lead; o recorte é que não alcança nenhum.
  expect(screen.queryByText(copy.vazio.titulo)).toBeNull()
  expect(screen.getByRole('region', { name: 'Novo' })).toBeDefined()

  fireEvent.click(screen.getByRole('button', { name: copy.filtros.limpar }))
  await waitFor(() => {
    expect(within(screen.getByRole('region', { name: 'Novo' })).getByText('Paula Siqueira')).toBeDefined()
  })
})

test('quem só observa vê o quadro em leitura, com a negativa e a quem pedir', async () => {
  const equipe = equipeDeExemplo('viewer')
  const servico = await montar(
    { leads: [lead()] },
    {
      ...equipe,
      membros: [
        ...equipe.membros,
        {
          usuarioId: 'u-3',
          nome: 'Lúcia Ramos',
          email: 'lucia@aurora.com.br',
          papel: 'admin',
          ultimoAcesso: null,
        },
      ],
    },
  )

  const novo = await coluna('Novo')
  const negativa = await screen.findByRole('alert')
  expect(within(negativa).getByText(copy.negativa.aviso)).toBeDefined()
  // Quem concede é quem administra; o operador da equipe não entra na lista.
  const aQuemPedir = within(negativa).getByRole('list', { name: copy.negativa.pedirAcesso })
  expect(within(aQuemPedir).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Lúcia Ramos lucia@aurora.com.br',
  ])

  expect(within(novo).getByText('Paula Siqueira')).toBeDefined()
  expect(within(novo).queryByRole('combobox')).toBeNull()
  const cartao = within(novo).getByText('Paula Siqueira').closest('li')!
  expect(cartao.getAttribute('draggable')).toBe('false')

  fireEvent.dragStart(cartao)
  fireEvent.drop(screen.getByRole('region', { name: 'Ganho' }))
  expect(servico.movimentos).toEqual([])
})

test('observador numa conta sem administrador ouve isso, e não uma lista vazia', async () => {
  await montar({ leads: [lead()] }, equipeDeExemplo('viewer'))

  const negativa = await screen.findByRole('alert')
  expect(within(negativa).getByText(copy.negativa.semAdministrador)).toBeDefined()
})
