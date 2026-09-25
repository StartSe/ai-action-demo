// O que este cartão precisa provar: conectar o provedor de modelo pelo OAuth,
// escolher o modelo de cada tarefa e desconectar (US-246).
//
// Três asserções justificam o arquivo:
//
// 1. **O cartão diz o que este modelo não é.** Quem chega aqui acabou de
//    cadastrar a chave do provedor de voz, e confundir os dois é o erro fácil.
// 2. **A escolha do modelo só existe depois de conectar.** Os identificadores
//    são do OpenRouter, e oferecê-los na porta da plataforma seria oferecer
//    uma escolha que não vale.
// 3. **"O escolhido pela plataforma" é uma opção de verdade, e é o padrão**,
//    para quem não escolhe acompanhar a troca de padrão em vez de congelar a
//    do dia em que escolheu.
//
// Ir de verdade ao provedor é do degrau 3: jsdom não navega. O teste mede o
// endereço que o cartão pediu e o retorno que ele concluiu.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { MODELO_PADRAO_DE_MIDIA } from '@compartilhado/modelo/resolucao.ts'

import { ProvedorDeModelo } from '@/componentes/provedor-de-modelo'
import { modelo as copy } from '@/copy/modelo'
import { ProvedorDaSarah } from '@/sarah/provedor'
import type { EstadoDoModelo } from '@/sarah/tipos'
import {
  criarServicoDaSarahDublado,
  type RespostasDaSarah,
  type ServicoDaSarahDublado,
} from '@/testes/servico-da-sarah-dublado'

const CONECTADO: EstadoDoModelo = {
  porta: 'openrouter',
  conectadoEm: '2026-09-24T12:00:00.000Z',
  finalDaChave: '7742',
  escolhas: { draft: null, classify: null, review: 'google/gemini-3-pro', imagem: null, audio: null },
}

function montar(
  respostas: RespostasDaSarah = {},
  props: Parameters<typeof ProvedorDeModelo>[0] = {},
): ServicoDaSarahDublado {
  const servico = criarServicoDaSarahDublado(respostas)
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={cliente}>
      <ProvedorDaSarah servico={servico}>
        <ProvedorDeModelo {...props} />
      </ProvedorDaSarah>
    </QueryClientProvider>,
  )
  return servico
}

/** Monta e devolve o desmontador, para a ida e a volta ficarem em árvores separadas. */
function montarComRetorno() {
  const servico = criarServicoDaSarahDublado({})
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={cliente}>
      <ProvedorDaSarah servico={servico}>
        <ProvedorDeModelo />
      </ProvedorDaSarah>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

test('a conta que não conectou nada fica sem modelo, e o cartão explica o que ele não é', async () => {
  montar()

  await screen.findByText(copy.estados.naoConectado)
  // O erro fácil de quem acabou de cadastrar a chave da voz.
  expect(screen.getByText(copy.apoio, { exact: false })).toBeDefined()
  expect(screen.getByRole('button', { name: copy.conectar })).toBeDefined()
  // A escolha não aparece: os identificadores são do provedor da conta.
  expect(screen.queryByLabelText(copy.tarefas.review)).toBeNull()
})

test('a falha de leitura não tira a saída: o botão de conectar continua lá', async () => {
  // A tela que só informa a falha deixa quem chegou aqui parado, e conectar é
  // o que resolve.
  montar({ modeloFalha: true })

  const alerta = await screen.findByRole('alert')
  expect(alerta.textContent).toBe(copy.falha)
  expect(screen.getByRole('button', { name: copy.conectar })).toBeDefined()
})

test('conectar pede o endereço desta tela como retorno', async () => {
  const ir = vi.fn()
  vi.stubGlobal('location', {
    origin: 'https://sarah.exemplo.app',
    pathname: '/config/integracoes',
    assign: ir,
  })

  const servico = montar()
  await screen.findByRole('button', { name: copy.conectar })
  fireEvent.click(screen.getByRole('button', { name: copy.conectar }))

  await waitFor(() => expect(servico.conexoesDoModelo).toHaveLength(1))
  expect(servico.conexoesDoModelo[0]).toEqual({
    passo: 'iniciar',
    // A borda confere este endereço contra as origens da instalação antes de
    // gravar estado nenhum.
    retorno: 'https://sarah.exemplo.app/config/integracoes',
  })
  await waitFor(() => expect(ir).toHaveBeenCalled())
  vi.unstubAllGlobals()
})

test('a volta do OAuth conclui e avisa quem voltou', async () => {
  const limpar = vi.fn()
  const servico = montar(
    {},
    { codigoDaVolta: 'cod-1', estadoDaVolta: 'est-1', aoConcluirVolta: limpar },
  )

  await waitFor(() => expect(servico.conexoesDoModelo).toHaveLength(1))
  expect(servico.conexoesDoModelo[0]).toEqual({
    passo: 'concluir',
    codigo: 'cod-1',
    estado: 'est-1',
  })
  // A barra de endereço é limpa: o código vale uma vez, e uma recarga tentaria
  // trocá-lo de novo.
  await waitFor(() => expect(limpar).toHaveBeenCalled())
  expect(await screen.findByText(copy.conectado_agora)).toBeDefined()
})

test('a volta sem marca nenhuma diz o que houve, em vez de ficar parada', async () => {
  // Foi exatamente assim que a tela não deu feedback nenhum: o provedor
  // devolveu o código sem `state`, e o componente exigia os dois em silêncio.
  window.sessionStorage.clear()
  montar({}, { codigoDaVolta: 'cod-1' })

  const alerta = await screen.findByRole('alert')
  expect(alerta.textContent).toBe(copy.voltaSemMarca)
})

test('a marca guardada na ida serve quando o provedor não a devolve', async () => {
  const ir = vi.fn()
  vi.stubGlobal('location', {
    origin: 'https://sarah.exemplo.app',
    pathname: '/config/integracoes',
    assign: ir,
  })

  // A ida guarda a marca que a borda pôs na URL de autorização.
  const { unmount } = montarComRetorno()
  await screen.findByRole('button', { name: copy.conectar })
  fireEvent.click(screen.getByRole('button', { name: copy.conectar }))
  await waitFor(() => expect(ir).toHaveBeenCalled())
  unmount()
  vi.unstubAllGlobals()

  // A volta traz só o código, sem `state`. A marca do navegador resolve.
  const servico = montar({}, { codigoDaVolta: 'cod-1' })
  await waitFor(() => expect(servico.conexoesDoModelo).toHaveLength(1))
  expect(servico.conexoesDoModelo[0]?.passo).toBe('concluir')
  expect(servico.conexoesDoModelo[0]?.estado).toBeTruthy()
})

test('a volta que o provedor recusou mostra a frase da borda', async () => {
  montar(
    { conexao: { ok: false, mensagem: 'O provedor recusou esta autorização.' } },
    { codigoDaVolta: 'cod-1', estadoDaVolta: 'est-1' },
  )

  const alerta = await screen.findByRole('alert')
  expect(alerta.textContent).toBe('O provedor recusou esta autorização.')
})

test('conectado, o cartão mostra o final da chave e a escolha por tarefa', async () => {
  montar({ modelo: CONECTADO })

  await screen.findByText(copy.estados.conectado)
  expect(screen.getByText(copy.conectado.chave('7742'), { exact: false })).toBeDefined()

  const daRevisao = screen.getByLabelText(copy.tarefas.review) as HTMLSelectElement
  expect(daRevisao.value).toBe('google/gemini-3-pro')

  // A que a conta não escolheu fica no padrão, e o padrão aparece pelo nome do
  // modelo que vale hoje — não como uma frase genérica que esconde com quem a
  // conta está falando.
  const daRedacao = screen.getByLabelText(copy.tarefas.draft) as HTMLSelectElement
  expect(daRedacao.value).toBe('')
  await waitFor(() => {
    // Duas vezes, e de propósito: uma como a opção de não escolher, outra como
    // escolha explícita. Deixar no padrão acompanha a troca de padrão; escolher
    // o mesmo modelo à mão fica nele quando o padrão mudar.
    expect(within(daRedacao).getAllByText(/Claude Opus 5/)).toHaveLength(2)
  })
  const opcaoDoPadrao = within(daRedacao).getByRole('option', { name: /padrão/ })
  expect(opcaoDoPadrao.getAttribute('value')).toBe('')
})

test('áudio e imagem só oferecem modelos que aceitam a entrada, com o padrão de mídia', async () => {
  montar({ modelo: CONECTADO })
  await screen.findByText(copy.estados.conectado)

  const doAudio = screen.getByLabelText(copy.tarefas.audio) as HTMLSelectElement
  const daImagem = screen.getByLabelText(copy.tarefas.imagem) as HTMLSelectElement
  expect(screen.getByText(copy.explicacaoDaTarefa.audio)).toBeDefined()
  await waitFor(() => expect(within(doAudio).getByText('Gemini 3 Pro', { exact: false })).toBeDefined())
  // O Claude do dublê não ouve: fica fora da lista do áudio, e entra na da imagem.
  expect(within(doAudio).queryByText(/Claude Opus 5/)).toBeNull()
  expect(within(daImagem).getByText(/Claude Opus 5/)).toBeDefined()
  expect(within(doAudio).getByRole('option', { name: /padrão/ }).textContent).toContain(MODELO_PADRAO_DE_MIDIA)
})

test('a lista traz o preço de cada modelo, e a legenda diz a ordem', async () => {
  montar({ modelo: CONECTADO })
  await screen.findByText(copy.estados.conectado)

  const daRevisao = screen.getByLabelText(copy.tarefas.review)
  await waitFor(() => {
    // O provedor cota por token ("0.000015"); a lista mostra por milhão, que é
    // a unidade que se compara entre modelos.
    expect(within(daRevisao).getAllByText(/US\$ 15 \/ US\$ 75/).length).toBeGreaterThan(0)
  })
  expect(screen.getAllByText(copy.legendaDoPreco).length).toBeGreaterThan(0)
})

test('modelo sem preço informado aparece sem preço, e não com zero', async () => {
  montar({ modelo: CONECTADO })
  await screen.findByText(copy.estados.conectado)

  const daRevisao = screen.getByLabelText(copy.tarefas.review)
  await waitFor(() => {
    const opcao = within(daRevisao).getByText('Gemini 3 Pro', { exact: false })
    // O dublê não informa preço deste: afirmar "US$ 0" diria o que ninguém
    // disse.
    expect(opcao.textContent).not.toContain('US$')
  })
})

test('escolher um modelo manda a tarefa e o identificador', async () => {
  const servico = montar({ modelo: CONECTADO })
  await screen.findByText(copy.estados.conectado)

  // O catálogo é do provedor e chega depois da carga: sem ele a opção não
  // existe, e um select não aceita valor que não está na lista.
  const daClassificacao = screen.getByLabelText(copy.tarefas.classify)
  await waitFor(() => {
    expect(within(daClassificacao).getByText('Claude Opus 5', { exact: false })).toBeDefined()
  })

  fireEvent.change(daClassificacao, { target: { value: 'anthropic/claude-opus-5' } })

  await waitFor(() => expect(servico.escolhasDeModelo).toHaveLength(1))
  expect(servico.escolhasDeModelo[0]).toEqual({
    tarefa: 'classify',
    modelo: 'anthropic/claude-opus-5',
  })
})

test('voltar ao padrão manda nulo, e não texto vazio', async () => {
  const servico = montar({ modelo: CONECTADO })
  await screen.findByText(copy.estados.conectado)

  fireEvent.change(screen.getByLabelText(copy.tarefas.review), { target: { value: '' } })

  await waitFor(() => expect(servico.escolhasDeModelo).toHaveLength(1))
  // Nulo é o que a RPC entende como "apague a escolha"; texto vazio quebraria
  // o check da coluna.
  expect(servico.escolhasDeModelo[0]).toEqual({ tarefa: 'review', modelo: null })
})

test('desconectar avisa que a conta voltou para a plataforma', async () => {
  const servico = montar({ modelo: CONECTADO })
  await screen.findByText(copy.estados.conectado)

  fireEvent.click(screen.getByRole('button', { name: copy.desconectar }))

  await waitFor(() => expect(servico.conexoesDoModelo).toHaveLength(1))
  expect(servico.conexoesDoModelo[0]).toEqual({ passo: 'desconectar' })
  expect(await screen.findByText(copy.desconectado)).toBeDefined()
})
