// O que esta tela precisa provar: escrever o que a Sarah sabe, e a distância
// entre salvar e ensinar (US-085, RF-310).
//
// Três asserções justificam o arquivo:
//
// 1. **Salvar não ensina a Sarah.** A gravação vai para o banco; quem leva ao
//    provedor é a sincronização. A frase de sucesso diz isso, senão a pessoa
//    sai daqui achando que a Sarah já aprendeu.
// 2. **`alterada` não é `indexada`.** A entrada está no ar com o texto
//    anterior, e é o caso em que alguém acha que corrigiu e não corrigiu.
// 3. **Remover tem dois desfechos**, e a tela diz qual foi: a que nunca chegou
//    ao provedor some; a indexada fica marcada até ele confirmar.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, test } from 'vitest'

import { conhecimento as copy } from '@/copy/conhecimento'
import { TelaDeConhecimento } from '@/rotas/sarah-conhecimento'
import { ProvedorDaSarah } from '@/sarah/provedor'
import type { EntradaDeConhecimento } from '@/sarah/tipos'
import {
  criarServicoDaSarahDublado,
  type RespostasDaSarah,
  type ServicoDaSarahDublado,
} from '@/testes/servico-da-sarah-dublado'

function entrada(mudanca: Partial<EntradaDeConhecimento> = {}): EntradaDeConhecimento {
  return {
    id: 'entrada-1',
    pergunta: 'Quanto custa a manutenção?',
    resposta: 'Entre R$ 800 e R$ 2.000 por mês.',
    etiquetas: ['preço'],
    origem: 'manual',
    documento: null,
    indexadaEm: null,
    erro: null,
    removidaEm: null,
    alteradaDepoisDeIndexada: false,
    atualizadaEm: '2026-09-24T12:00:00.000Z',
    ...mudanca,
  }
}

const NO_AR = entrada({
  id: 'entrada-no-ar',
  pergunta: 'Vocês atendem em Santa Catarina?',
  resposta: 'Sim, em todo o litoral.',
  etiquetas: ['cobertura'],
  documento: 'doc-1',
  indexadaEm: '2026-09-24T12:05:00.000Z',
})

function montar(respostas: RespostasDaSarah = {}): ServicoDaSarahDublado {
  const servico = criarServicoDaSarahDublado(respostas)
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={cliente}>
      <ProvedorDaSarah servico={servico}>
        <TelaDeConhecimento />
      </ProvedorDaSarah>
    </QueryClientProvider>,
  )
  return servico
}

afterEach(cleanup)

test('a conta sem nada escrito vê o convite, e não uma lista vazia', async () => {
  montar()

  await screen.findByText(copy.vazia.titulo)
  expect(screen.getByText(copy.vazia.explicacao)).toBeDefined()
  expect(screen.getByRole('button', { name: copy.entrada.nova })).toBeDefined()
})

test('salvar diz que a Sarah ainda não aprendeu', async () => {
  const servico = montar()
  await screen.findByText(copy.vazia.titulo)

  fireEvent.click(screen.getByRole('button', { name: copy.entrada.nova }))
  fireEvent.change(screen.getByLabelText(copy.entrada.pergunta), {
    target: { value: 'Quanto custa a manutenção?' },
  })
  fireEvent.change(screen.getByLabelText(copy.entrada.resposta), {
    target: { value: 'Entre R$ 800 e R$ 2.000 por mês.' },
  })
  fireEvent.change(screen.getByLabelText(copy.entrada.etiquetas), {
    target: { value: ' Preço , manutenção ' },
  })
  fireEvent.click(screen.getByRole('button', { name: copy.entrada.salvar }))

  await waitFor(() => expect(servico.entradasGravadas).toHaveLength(1))
  expect(servico.entradasGravadas[0]).toEqual({
    id: null,
    pergunta: 'Quanto custa a manutenção?',
    resposta: 'Entre R$ 800 e R$ 2.000 por mês.',
    // Aparadas, em minúscula e sem repetição: a coluna é text[].
    etiquetas: ['preço', 'manutenção'],
  })
  // A distância entre salvar e ensinar, dita em palavras.
  expect(await screen.findByText(copy.entrada.salva)).toBeDefined()
  // E nada foi ao provedor.
  expect(servico.sincronizacoes()).toBe(0)
})

test('salvar sem resposta não habilita o botão', async () => {
  montar()
  await screen.findByText(copy.vazia.titulo)

  fireEvent.click(screen.getByRole('button', { name: copy.entrada.nova }))
  fireEvent.change(screen.getByLabelText(copy.entrada.pergunta), {
    target: { value: 'Quanto custa?' },
  })

  expect(screen.getByRole('button', { name: copy.entrada.salvar })).toHaveProperty('disabled', true)
  expect(screen.getByText(copy.entrada.incompleta)).toBeDefined()
})

test('cada entrada mostra em que pé está, e o que fazer', async () => {
  montar({
    conhecimento: [
      entrada({ id: 'pendente' }),
      NO_AR,
      entrada({
        id: 'alterada',
        pergunta: 'Qual o prazo de entrega?',
        documento: 'doc-2',
        indexadaEm: '2026-09-24T12:05:00.000Z',
        alteradaDepoisDeIndexada: true,
      }),
    ],
  })

  await screen.findByText(copy.lista.titulo)

  const daPendente = screen.getByText('Quanto custa a manutenção?').closest('li')!
  expect(within(daPendente).getByText(copy.estados.pendente)).toBeDefined()

  const doAr = screen.getByText('Vocês atendem em Santa Catarina?').closest('li')!
  expect(within(doAr).getByText(copy.estados.indexada)).toBeDefined()

  // O caso que confunde: está no ar, mas respondendo o texto anterior.
  const daAlterada = screen.getByText('Qual o prazo de entrega?').closest('li')!
  expect(within(daAlterada).getByText(copy.estados.alterada)).toBeDefined()
  expect(within(daAlterada).getByText(copy.explicacaoDoEstado.alterada)).toBeDefined()
})

test('o botão de sincronizar conta quantas esperam', async () => {
  montar({ conhecimento: [entrada({ id: 'a' }), NO_AR, entrada({ id: 'c' })] })

  // Duas pendentes de três: a do ar está em dia.
  await screen.findByRole('button', { name: copy.sincronizacao.comPendentes(2) })
})

test('com tudo em dia, o botão não promete pendência nenhuma', async () => {
  montar({ conhecimento: [NO_AR] })

  // O botão vive fora do painel e aparece antes da lista: esperar por ele não
  // garante que a carga chegou.
  await screen.findByText(copy.lista.titulo)
  expect(screen.getByRole('button', { name: copy.sincronizacao.botao })).toBeDefined()
  expect(screen.getByText(copy.sincronizacao.semPendencia)).toBeDefined()
})

test('sincronizar leva ao provedor e conta o que foi', async () => {
  const servico = montar({
    conhecimento: [entrada()],
    sincronizacao: {
      ok: true,
      relatorio: {
        entradas: [
          { entradaId: 'entrada-1', estado: 'enviada', motivo: null, mensagem: null, pergunta: null },
        ],
        publicacoes: [],
        recusa: null,
      },
    },
  })
  await screen.findByText(copy.lista.titulo)

  fireEvent.click(screen.getByRole('button', { name: copy.sincronizacao.comPendentes(1) }))

  await waitFor(() => expect(servico.sincronizacoes()).toBe(1))
  expect(await screen.findByText(copy.sincronizacao.concluida(1))).toBeDefined()
})

test('entrada que o provedor recusou é contada como falha, e não como envio', async () => {
  montar({
    conhecimento: [entrada()],
    sincronizacao: {
      ok: true,
      relatorio: {
        entradas: [
          {
            entradaId: 'entrada-1',
            estado: 'erro',
            motivo: 'envio_recusado',
            mensagem: null,
            pergunta: null,
          },
        ],
        publicacoes: [],
        recusa: null,
      },
    },
  })
  await screen.findByText(copy.lista.titulo)

  fireEvent.click(screen.getByRole('button', { name: copy.sincronizacao.comPendentes(1) }))

  expect(await screen.findByText(copy.sincronizacao.comFalhas(1))).toBeDefined()
})

test('a recusa do pedido inteiro mostra a frase da borda', async () => {
  montar({
    conhecimento: [entrada()],
    sincronizacao: {
      ok: true,
      relatorio: {
        entradas: [],
        publicacoes: [],
        recusa: 'A conta não tem chave do provedor de voz.',
      },
    },
  })
  await screen.findByText(copy.lista.titulo)

  fireEvent.click(screen.getByRole('button', { name: copy.sincronizacao.comPendentes(1) }))

  const alerta = await screen.findByRole('alert')
  // A frase vem pronta de knowledge-sync/respostas.ts.
  expect(alerta.textContent).toBe('A conta não tem chave do provedor de voz.')
})

test('remover a que nunca chegou ao provedor apaga; a indexada fica marcada', async () => {
  const servico = montar({ conhecimento: [entrada(), NO_AR] })
  await screen.findByText(copy.lista.titulo)

  const daPendente = screen.getByText('Quanto custa a manutenção?').closest('li')!
  fireEvent.click(within(daPendente).getByRole('button', { name: copy.lista.remover }))
  expect(await screen.findByText(copy.remocao.apagada)).toBeDefined()

  const doAr = screen.getByText('Vocês atendem em Santa Catarina?').closest('li')!
  fireEvent.click(within(doAr).getByRole('button', { name: copy.lista.remover }))
  // Esquecer no banco não faz o provedor esquecer.
  expect(await screen.findByText(copy.remocao.marcada)).toBeDefined()

  expect(servico.entradasRemovidas).toEqual(['entrada-1', 'entrada-no-ar'])
})

test('editar carrega o que já estava escrito', async () => {
  const servico = montar({ conhecimento: [entrada()] })
  await screen.findByText(copy.lista.titulo)

  fireEvent.click(screen.getByRole('button', { name: copy.lista.editar }))

  expect((screen.getByLabelText(copy.entrada.pergunta) as HTMLInputElement).value).toBe(
    'Quanto custa a manutenção?',
  )
  expect((screen.getByLabelText(copy.entrada.etiquetas) as HTMLInputElement).value).toBe('preço')

  fireEvent.change(screen.getByLabelText(copy.entrada.resposta), {
    target: { value: 'Entre R$ 900 e R$ 2.100 por mês.' },
  })
  fireEvent.click(screen.getByRole('button', { name: copy.entrada.salvar }))

  await waitFor(() => expect(servico.entradasGravadas).toHaveLength(1))
  // O id vai junto: corrigir não cria uma segunda entrada.
  expect(servico.entradasGravadas[0]?.id).toBe('entrada-1')
})

test('a busca filtra pela pergunta e pela resposta', async () => {
  montar({
    conhecimento: [
      entrada(),
      entrada({ id: 'outra', pergunta: 'Qual o prazo?', resposta: 'Cinco dias úteis.' }),
    ],
  })
  await screen.findByText(copy.lista.titulo)

  fireEvent.change(screen.getByLabelText(copy.lista.buscar), { target: { value: 'prazo' } })

  // A busca é outra chave de consulta, então a tela volta a carregar: esperar
  // o sumiço do que foi filtrado pegaria o estado de carregando, não o
  // resultado.
  await screen.findByText('Qual o prazo?')
  expect(screen.queryByText('Quanto custa a manutenção?')).toBeNull()
  // O total continua sendo o da conta, e não o do recorte.
  expect(screen.getByText(copy.lista.total(2))).toBeDefined()
})

test('a falha de leitura diz o que continua funcionando', async () => {
  montar({ conhecimentoFalha: true })

  const alerta = await screen.findByRole('alert')
  // As ligações não dependem desta tela, e quem lê precisa saber disso antes
  // de se preocupar.
  expect(alerta.textContent).toBe(copy.falha)
})
