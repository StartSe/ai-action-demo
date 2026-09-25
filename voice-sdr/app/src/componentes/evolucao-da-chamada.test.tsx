// O que este painel precisa provar: o ciclo inteiro dentro da ficha, do convite
// ao rascunho gravado (US-245).
//
// Três asserções justificam o arquivo:
//
// 1. **O selo separa o que a Sarah aplica do que você faz.** Aceitar uma
//    proposta de voz não troca a voz, e a tela precisa dizer isso antes do
//    clique — senão o botão "Aplicar" promete o que não cumpre.
// 2. **O caminho da tela que ainda não existe aparece como texto.** A base de
//    conhecimento é US-085; oferecer o link seria oferecer uma navegação morta.
// 3. **A recusa que a tela mostra é a frase da borda**, e não uma segunda
//    tradução escrita aqui.
//
// O botão de enviar o questionário só habilita com tudo respondido: a borda
// recusa incompleto, e um botão que falha depois do clique esconde a regra de
// quem está respondendo.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import type { CorpoDaRevisao, MudancaNaTela, ResultadoDoPasso } from '@/chamadas/tipos'
import { EvolucaoDaChamada } from '@/componentes/evolucao-da-chamada'
import { evolucao as copy } from '@/copy/revisao'
import {
  criarServicoDeChamadasDublado,
  type ServicoDeChamadasDublado,
} from '@/testes/servico-de-chamadas-dublado'

const CHAMADA = 'chamada-1'
const REVISAO = 'rev-1'

const PERGUNTAS = [
  {
    id: 'perg-1',
    posicao: 1,
    pergunta: 'Existe faixa de preço de manutenção que a Sarah pode dizer?',
    porque: 'O lead perguntou o preço e a Sarah não tinha o que responder.',
    tipo: 'choice' as const,
    opcoes: ['Sim, há faixa pública', 'Não, só o especialista fala de preço'],
  },
  {
    id: 'perg-2',
    posicao: 2,
    pergunta: 'O que a Sarah deve dizer quando pedem para repetir?',
    porque: 'O interlocutor não entendeu a primeira fala.',
    tipo: 'text' as const,
    opcoes: [],
  },
]

const ROTEIRO_NOVO = '1. Cumprimente e diga de onde fala.\n2. Pergunte pela operação.'

function mudanca(parcial: Partial<MudancaNaTela> = {}): MudancaNaTela {
  return {
    id: 'mud-1',
    posicao: 1,
    tipo: 'script',
    titulo: 'Abrir dizendo de onde fala',
    razao: 'O interlocutor pediu para repetir logo na abertura.',
    corpo: ROTEIRO_NOVO,
    caminho: null,
    acaoNoCaminho: null,
    caminhoDisponivel: false,
    seAplicaSozinha: true,
    revisoes: 0,
    ...parcial,
  }
}

const DA_VOZ = mudanca({
  id: 'mud-voz',
  posicao: 2,
  tipo: 'voice',
  titulo: 'Testar outra voz',
  razao: 'O interlocutor não entendeu a Sarah na abertura.',
  corpo: null,
  caminho: '/sarah/voz',
  acaoNoCaminho: 'Ouça as prévias e troque a voz da Sarah.',
  caminhoDisponivel: true,
  seAplicaSozinha: false,
})

const DO_CONHECIMENTO = mudanca({
  id: 'mud-conhecimento',
  posicao: 3,
  tipo: 'knowledge',
  titulo: 'Ensinar a faixa de preço',
  razao: 'O lead perguntou o preço e ninguém ensinou a resposta.',
  corpo: null,
  caminho: '/sarah/conhecimento',
  acaoNoCaminho: 'Cadastre a faixa de preço da manutenção.',
  caminhoDisponivel: false,
  seAplicaSozinha: false,
})

function passo(corpo: CorpoDaRevisao): ResultadoDoPasso {
  return { ok: true, corpo }
}

const QUESTIONARIO = passo({
  ok: true,
  passo: 'questionario',
  revisaoId: REVISAO,
  leitura: { resumo: 'O lead pediu para repetir.', tropecos: [], semResposta: [] },
  perguntas: PERGUNTAS,
  semRegistro: false,
})

function propostas(mudancas: readonly MudancaNaTela[]): ResultadoDoPasso {
  return passo({ ok: true, passo: 'propostas', revisaoId: REVISAO, mudancas, semRegistro: false })
}

function montar(passos: ResultadoDoPasso[]): ServicoDeChamadasDublado {
  const servico = criarServicoDeChamadasDublado({ passosDaRevisao: passos })
  render(<EvolucaoDaChamada chamadaId={CHAMADA} servico={servico} />)
  return servico
}

/** Leva o painel do convite até a lista de propostas. */
async function ateAsPropostas(mudancas: readonly MudancaNaTela[]) {
  const servico = montar([QUESTIONARIO, propostas(mudancas)])

  fireEvent.click(screen.getByRole('button', { name: copy.comecar }))
  await screen.findByText(PERGUNTAS[0]!.pergunta)

  fireEvent.click(screen.getByRole('button', { name: PERGUNTAS[0]!.opcoes[1]! }))
  const campos = screen.getAllByRole('textbox')
  fireEvent.change(campos[campos.length - 1]!, { target: { value: 'Peça desculpa e repita devagar.' } })

  fireEvent.click(screen.getByRole('button', { name: copy.questionario.enviar }))
  await screen.findByText(copy.propostas.titulo)
  return servico
}

afterEach(cleanup)

test('o convite abre o questionário com o porquê de cada pergunta', async () => {
  const servico = montar([QUESTIONARIO])

  fireEvent.click(screen.getByRole('button', { name: copy.comecar }))
  await screen.findByText(PERGUNTAS[0]!.pergunta)

  expect(servico.passosPedidos[0]).toEqual({ acao: 'analisar', corpo: { call_id: CHAMADA } })
  expect(screen.getByText(PERGUNTAS[0]!.porque, { exact: false })).toBeDefined()
  expect(screen.getByText(PERGUNTAS[1]!.pergunta)).toBeDefined()
  // A pergunta de escolha oferece as opções e ainda deixa escrever outra.
  expect(screen.getByRole('button', { name: PERGUNTAS[0]!.opcoes[0]! })).toBeDefined()
})

test('o envio do questionário só habilita com tudo respondido', async () => {
  montar([QUESTIONARIO])
  fireEvent.click(screen.getByRole('button', { name: copy.comecar }))
  await screen.findByText(PERGUNTAS[0]!.pergunta)

  const enviar = screen.getByRole('button', { name: copy.questionario.enviar })
  expect(enviar).toHaveProperty('disabled', true)

  fireEvent.click(screen.getByRole('button', { name: PERGUNTAS[0]!.opcoes[1]! }))
  // Uma respondida de duas: ainda não.
  expect(screen.getByRole('button', { name: copy.questionario.enviar })).toHaveProperty(
    'disabled',
    true,
  )

  const campos = screen.getAllByRole('textbox')
  fireEvent.change(campos[campos.length - 1]!, { target: { value: 'Repita devagar.' } })
  expect(screen.getByRole('button', { name: copy.questionario.enviar })).toHaveProperty(
    'disabled',
    false,
  )
})

test('as respostas chegam à borda com o id de cada pergunta', async () => {
  const servico = await ateAsPropostas([mudanca()])

  expect(servico.passosPedidos[1]?.acao).toBe('responder')
  expect(servico.passosPedidos[1]?.corpo).toEqual({
    review_id: REVISAO,
    answers: [
      { id: 'perg-1', resposta: PERGUNTAS[0]!.opcoes[1] },
      { id: 'perg-2', resposta: 'Peça desculpa e repita devagar.' },
    ],
  })
})

test('o selo separa o que a Sarah aplica do que você faz', async () => {
  await ateAsPropostas([mudanca(), DA_VOZ])

  const doRoteiro = screen.getByText('Abrir dizendo de onde fala').closest('article')
  const daVoz = screen.getByText('Testar outra voz').closest('article')
  expect(doRoteiro).not.toBeNull()
  expect(daVoz).not.toBeNull()

  expect(within(doRoteiro!).getByText(copy.encaminhamento.aplicavel)).toBeDefined()
  // Aceitar a de voz não troca a voz: manda para a tela de voz.
  expect(within(daVoz!).getByText(copy.encaminhamento.selo)).toBeDefined()
  expect(within(daVoz!).getByRole('link', { name: '/sarah/voz' })).toBeDefined()
})

test('o caminho da tela que ainda não existe aparece como texto, e não como link', async () => {
  await ateAsPropostas([DO_CONHECIMENTO])

  const cartao = screen.getByText('Ensinar a faixa de preço').closest('article')
  expect(cartao).not.toBeNull()
  expect(within(cartao!).getByText('/sarah/conhecimento')).toBeDefined()
  // US-085 ainda não foi construída: oferecer o link seria oferecer navegação
  // morta. Sabotagem conferida: trocar por link derruba esta asserção.
  expect(within(cartao!).queryByRole('link')).toBeNull()
})

test('o texto completo abre no lugar, e começa recolhido', async () => {
  await ateAsPropostas([mudanca()])

  // Sem normalizar: o roteiro tem quebra de linha, e é justamente ela que o
  // `pre` preserva. O matcher padrão colapsaria as duas linhas numa só e
  // encontraria o texto ainda que a tela o tivesse achatado.
  const semNormalizar = { normalizer: (texto: string) => texto }

  expect(screen.queryByText(ROTEIRO_NOVO, semNormalizar)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: copy.propostas.verTexto }))
  expect(screen.getByText(ROTEIRO_NOVO, semNormalizar)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: copy.propostas.esconderTexto }))
  expect(screen.queryByText(ROTEIRO_NOVO, semNormalizar)).toBeNull()
})

test('aplicar manda a decisão de cada proposta e mostra o rascunho gravado', async () => {
  const servico = criarServicoDeChamadasDublado({
    passosDaRevisao: [
      QUESTIONARIO,
      propostas([mudanca(), DA_VOZ]),
      passo({
        ok: true,
        passo: 'aplicada',
        revisaoId: REVISAO,
        versaoId: 'versao-7',
        versao: 7,
        aplicadas: 1,
        encaminhamentos: [DA_VOZ],
      }),
    ],
  })
  render(<EvolucaoDaChamada chamadaId={CHAMADA} servico={servico} />)

  fireEvent.click(screen.getByRole('button', { name: copy.comecar }))
  await screen.findByText(PERGUNTAS[0]!.pergunta)
  fireEvent.click(screen.getByRole('button', { name: PERGUNTAS[0]!.opcoes[1]! }))
  const campos = screen.getAllByRole('textbox')
  fireEvent.change(campos[campos.length - 1]!, { target: { value: 'Repita devagar.' } })
  fireEvent.click(screen.getByRole('button', { name: copy.questionario.enviar }))
  await screen.findByText(copy.propostas.titulo)

  // Aceita a do roteiro, recusa a da voz.
  const doRoteiro = screen.getByText('Abrir dizendo de onde fala').closest('article')!
  fireEvent.click(within(doRoteiro).getByRole('button', { name: copy.propostas.aceitar }))
  const daVoz = screen.getByText('Testar outra voz').closest('article')!
  fireEvent.click(within(daVoz).getByRole('button', { name: copy.propostas.recusar }))

  fireEvent.click(screen.getByRole('button', { name: copy.propostas.aplicar }))
  await screen.findByText(copy.aplicada.titulo)

  expect(servico.passosPedidos[2]?.acao).toBe('aplicar')
  expect(servico.passosPedidos[2]?.corpo).toEqual({
    review_id: REVISAO,
    decisions: [
      { id: 'mud-1', aceita: true },
      { id: 'mud-voz', aceita: false },
    ],
  })
  expect(screen.getByText(copy.aplicada.comVersao(7))).toBeDefined()
  expect(screen.getByRole('link', { name: copy.aplicada.irParaPlaybooks })).toBeDefined()
})

test('aplicar só habilita com alguma aceita', async () => {
  await ateAsPropostas([mudanca()])

  expect(screen.getByRole('button', { name: copy.propostas.aplicar })).toHaveProperty(
    'disabled',
    true,
  )
  expect(screen.getByText(copy.propostas.nadaAceito)).toBeDefined()

  fireEvent.click(screen.getByRole('button', { name: copy.propostas.aceitar }))
  expect(screen.getByRole('button', { name: copy.propostas.aplicar })).toHaveProperty(
    'disabled',
    false,
  )
})

test('questionar reescreve a proposta no lugar', async () => {
  const servico = criarServicoDeChamadasDublado({
    passosDaRevisao: [
      QUESTIONARIO,
      propostas([mudanca()]),
      passo({
        ok: true,
        passo: 'reescrita',
        revisaoId: REVISAO,
        mudanca: mudanca({ titulo: 'Abrir mais curto', corpo: '1. Seja breve.', revisoes: 1 }),
        semRegistro: false,
      }),
    ],
  })
  render(<EvolucaoDaChamada chamadaId={CHAMADA} servico={servico} />)

  fireEvent.click(screen.getByRole('button', { name: copy.comecar }))
  await screen.findByText(PERGUNTAS[0]!.pergunta)
  fireEvent.click(screen.getByRole('button', { name: PERGUNTAS[0]!.opcoes[1]! }))
  const campos = screen.getAllByRole('textbox')
  fireEvent.change(campos[campos.length - 1]!, { target: { value: 'Repita devagar.' } })
  fireEvent.click(screen.getByRole('button', { name: copy.questionario.enviar }))
  await screen.findByText(copy.propostas.titulo)

  fireEvent.click(screen.getByRole('button', { name: copy.propostas.questionar }))
  const campo = screen.getByRole('textbox')
  // Questionamento curto não chega à borda: a borda o recusaria.
  expect(screen.getByRole('button', { name: copy.propostas.enviarQuestionamento })).toHaveProperty(
    'disabled',
    true,
  )

  fireEvent.change(campo, { target: { value: 'Ficou longo demais para uma abertura.' } })
  fireEvent.click(screen.getByRole('button', { name: copy.propostas.enviarQuestionamento }))

  await screen.findByText('Abrir mais curto')
  expect(servico.passosPedidos[2]?.acao).toBe('questionar')
  expect(screen.getByText(copy.propostas.reescrita(1))).toBeDefined()
  // A proposta antiga saiu da lista: a reescrita é no lugar.
  expect(screen.queryByText('Abrir dizendo de onde fala')).toBeNull()
})

test('a recusa que aparece é a frase da borda', async () => {
  const servico = criarServicoDeChamadasDublado({
    passosDaRevisao: [{ ok: false, mensagem: 'Esta ligação não teve conversa para analisar.' }],
  })
  render(<EvolucaoDaChamada chamadaId={CHAMADA} servico={servico} />)

  fireEvent.click(screen.getByRole('button', { name: copy.comecar }))

  const alerta = await screen.findByRole('alert')
  // A frase vem pronta de call-review/respostas.ts. Uma segunda tradução aqui
  // divergiria da primeira na primeira mudança.
  expect(alerta.textContent).toBe('Esta ligação não teve conversa para analisar.')
  // A recusa não avança o passo: o convite continua lá.
  expect(screen.getByRole('button', { name: copy.comecar })).toBeDefined()
})

test('recusa com caminho oferece o botão de resolver, em vez de só lamentar', async () => {
  const servico = criarServicoDeChamadasDublado({
    passosDaRevisao: [
      {
        ok: false,
        mensagem:
          'Para a Sarah ler a conversa e sugerir melhorias, a conta precisa de um provedor de modelo conectado. Conecte em Integrações e volte aqui.',
        caminho: '/config/integracoes',
      },
    ],
  })
  render(<EvolucaoDaChamada chamadaId={CHAMADA} servico={servico} />)

  fireEvent.click(screen.getByRole('button', { name: copy.comecar }))

  const alerta = await screen.findByRole('alert')
  expect(alerta.textContent).toContain('provedor de modelo conectado')
  // Credencial que falta tem conserto numa tela: a caixa leva até ela.
  const botao = within(alerta).getByRole('link', { name: copy.resolver })
  expect(botao.getAttribute('href')).toBe('/config/integracoes')
})

test('recusa sem caminho não inventa botão nenhum', async () => {
  const servico = criarServicoDeChamadasDublado({
    passosDaRevisao: [{ ok: false, mensagem: 'Não foi possível ler a conversa agora.' }],
  })
  render(<EvolucaoDaChamada chamadaId={CHAMADA} servico={servico} />)

  fireEvent.click(screen.getByRole('button', { name: copy.comecar }))

  const alerta = await screen.findByRole('alert')
  // Nem toda recusa tem conserto numa tela, e um botão que não resolve nada
  // manda a pessoa a um lugar que não ajuda.
  expect(within(alerta).queryByRole('link')).toBeNull()
})

test('o passo em andamento se anuncia e trava o botão', async () => {
  const servico = criarServicoDeChamadasDublado({ revisaoPendente: true })
  render(<EvolucaoDaChamada chamadaId={CHAMADA} servico={servico} />)

  fireEvent.click(screen.getByRole('button', { name: copy.comecar }))

  await waitFor(() => {
    expect(screen.getByRole('status').textContent).toBe(copy.analisando)
  })
  expect(screen.getByRole('button', { name: copy.comecar })).toHaveProperty('disabled', true)
})

test('sem nada a perguntar, o convite leva direto às propostas', async () => {
  montar([propostas([mudanca()])])

  fireEvent.click(screen.getByRole('button', { name: copy.comecar }))
  await screen.findByText(copy.propostas.titulo)

  expect(screen.queryByText(copy.questionario.titulo)).toBeNull()
  expect(screen.getByText(mudanca().titulo)).toBeDefined()
})

test('sem pergunta e sem mudança, a tela diz que não há o que mudar', async () => {
  montar([
    passo({
      ok: true,
      passo: 'sem_mudancas',
      revisaoId: REVISAO,
      leitura: { resumo: 'Conversa sem tropeço.', tropecos: [], semResposta: [] },
      semRegistro: false,
    }),
  ])

  fireEvent.click(screen.getByRole('button', { name: copy.comecar }))
  await screen.findByText(copy.semMudancas.titulo)

  expect(screen.queryByText(copy.questionario.titulo)).toBeNull()
})
