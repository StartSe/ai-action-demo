// A entrevista por voz no assistente de abertura, com o SDK trocado por um
// condutor dublê e a borda da entrevista atendida pelo mesmo código de
// `onboarding-interview` (o dublê da Sarah passa por `atenderEntrevista`).
//
// O que se prova: a conversa só abre com o clique; os turnos aparecem enquanto
// ela acontece; encerrar fecha a conversa e as sugestões chegam; a Sarah
// desligar sozinha segue o mesmo caminho; sem a ElevenLabs a frase diz onde
// conectar; e escrever continua sendo saída a qualquer momento.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { MENSAGENS } from '@entrevista/respostas.ts'

import { AssistenteDeInicio } from '@/configuracao-inicial/assistente-de-inicio'
import { EntrevistaComASarah } from '@/configuracao-inicial/entrevista-com-a-sarah'
import { textosDoInicio } from '@/copy/inicio'
import { ProvedorDeConfiguracaoInicial } from '@/configuracao-inicial/provedor'
import { ProvedorDaConta } from '@/conta/provedor'
import { ProvedorDeIntegracoes } from '@/integracoes/provedor'
import { ProvedorDaSarah } from '@/sarah/provedor'
import type {
  AberturaDaConversa,
  CondutorDeConversa,
  OuvintesDaConversa,
} from '@/sarah/ensaio'
import {
  criarServicoDeIntegracoesDublado,
  integracoesDeExemplo,
} from '@/testes/servico-de-integracoes-dublado'
import {
  criarServicoDeConfiguracaoDublado,
  passosDeExemplo,
} from '@/testes/servico-de-configuracao-dublado'
import {
  criarServicoDaSarahDublado,
  identidadeDeExemplo,
  type RespostasDaSarah,
} from '@/testes/servico-da-sarah-dublado'
import { criarServicoDaContaDublado } from '@/testes/servico-da-conta-dublado'

afterEach(cleanup)

/** A conta dos dublês: a assistente já tem nome, e o texto a chama por ele. */
const copy = textosDoInicio('Sarah')

interface CondutorDublado extends CondutorDeConversa {
  ditos: string[]
  sinais: number
  aberturas: AberturaDaConversa[]
  encerradas: number
  ouvintes: OuvintesDaConversa | null
}

function criarCondutor(opcoes: { recusa?: boolean } = {}): CondutorDublado {
  const condutor: CondutorDublado = {
    ditos: [],
    sinais: 0,
    aberturas: [],
    encerradas: 0,
    ouvintes: null,
    async abrir(abertura, ouvintes) {
      condutor.aberturas.push(abertura)
      if (opcoes.recusa) throw new Error('microfone negado')
      condutor.ouvintes = ouvintes
      ouvintes.aoEstado('falando')
      return {
        identificador: () => 'conversa-1',
        dizer: async (texto) => {
          condutor.ditos.push(texto)
        },
        sinalizarAtividade: () => {
          condutor.sinais += 1
        },
        encerrar: async () => {
          condutor.encerradas += 1
          ouvintes.aoEstado('parada')
        },
      }
    },
  }
  return condutor
}

const CONECTADAS = integracoesDeExemplo().map((item) => ({
  ...item,
  estado: 'conectado' as const,
  configurado: true,
  conectado: true,
  erro: null,
}))

async function montar(condutor: CondutorDeConversa, respostas: RespostasDaSarah = {}) {
  const sarah = criarServicoDaSarahDublado({
    modelo: {
      porta: 'openrouter',
      conectadoEm: '2026-09-24T10:00:00.000Z',
      finalDaChave: 'a1b2',
      escolhas: { draft: null, classify: null, review: null, imagem: null, audio: null },
    },
    ...respostas,
  })
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={cliente}>
      <ProvedorDaSarah servico={sarah}>
        <ProvedorDaConta servico={criarServicoDaContaDublado()}>
          <ProvedorDeIntegracoes servico={criarServicoDeIntegracoesDublado({ integracoes: CONECTADAS })}>
            {/* A Sarah ainda sem identidade: o assistente abre no negócio. */}
            <ProvedorDeConfiguracaoInicial
              servico={criarServicoDeConfiguracaoDublado({ passos: passosDeExemplo() })}
            >
              <AssistenteDeInicio condutor={condutor} aoConcluir={() => {}} aoPular={() => {}} />
            </ProvedorDeConfiguracaoInicial>
          </ProvedorDeIntegracoes>
        </ProvedorDaConta>
      </ProvedorDaSarah>
    </QueryClientProvider>,
  )
  const dialogo = within(await screen.findByRole('dialog', { name: copy.rotulo }))
  await dialogo.findByRole('heading', { name: copy.etapas.negocio.titulo })
  return { sarah, dialogo }
}

function escolherConversa(dialogo: ReturnType<typeof within>) {
  fireEvent.click(dialogo.getByRole('button', { name: new RegExp(copy.entrevista.conversar) }))
}

it('a conversa é a primeira escolha do negócio, e só abre com o clique de começar', async () => {
  const condutor = criarCondutor()
  const { dialogo, sarah } = await montar(condutor)

  escolherConversa(dialogo)
  expect(dialogo.getByText(copy.entrevista.antes)).toBeDefined()
  expect(condutor.aberturas).toEqual([])
  expect(sarah.entrevistas).toEqual([])

  fireEvent.click(dialogo.getByRole('button', { name: copy.entrevista.comecar }))

  await waitFor(() => expect(condutor.aberturas).toHaveLength(1))
  expect(condutor.aberturas[0]).toMatchObject({ urlAssinada: 'wss://assinada.exemplo', modo: 'voice' })
  expect(await dialogo.findByText(copy.entrevista.falando)).toBeDefined()
})

it('a entrevista abre com o nome que a conta deu à assistente', async () => {
  const condutor = criarCondutor()
  const { dialogo, sarah } = await montar(condutor, {
    sarah: { identidade: { ...identidadeDeExemplo(), nome: 'Ana', empresa: '' }, publicacao: 'rascunho' },
  })
  const comNome = textosDoInicio('Ana')
  fireEvent.click(dialogo.getByRole('button', { name: new RegExp(comNome.entrevista.conversar) }))
  fireEvent.click(dialogo.getByRole('button', { name: comNome.entrevista.comecar }))

  await waitFor(() => expect(sarah.agentesDaEntrevista).toHaveLength(1))
  expect(sarah.agentesDaEntrevista[0]?.primeiraFala).toMatch(/^Oi! Aqui é a Ana\./)
  expect(sarah.agentesDaEntrevista[0]?.instrucao).toMatch(/^Você é a Ana,/)
  expect(await dialogo.findByText(comNome.entrevista.falando)).toBeDefined()
  expect(comNome.entrevista.falando).toBe('Ana falando')
})

it('a entrevista abre com a voz escolhida na etapa da voz', async () => {
  const condutor = criarCondutor()
  const sarah = criarServicoDaSarahDublado({
    modelo: {
      porta: 'openrouter',
      conectadoEm: '2026-09-24T10:00:00.000Z',
      finalDaChave: 'a1b2',
      escolhas: { draft: null, classify: null, review: null, imagem: null, audio: null },
    },
  })
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={cliente}>
      <ProvedorDaSarah servico={sarah}>
        <EntrevistaComASarah
          condutor={condutor}
          voz={{ id: 'czvzJwIVS2asEKnthV40', nome: 'Daniel' }}
          aoGerar={() => {}}
          aoEscrever={() => {}}
          espera={null}
        />
      </ProvedorDaSarah>
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: copy.entrevista.comecar }))
  await waitFor(() =>
    expect(sarah.entrevistas).toEqual([{ passo: 'abrir', vozId: 'czvzJwIVS2asEKnthV40' }]),
  )
})

it('os turnos aparecem durante a conversa, e encerrar traz as sugestões', async () => {
  const condutor = criarCondutor()
  const { dialogo, sarah } = await montar(condutor)
  escolherConversa(dialogo)
  fireEvent.click(dialogo.getByRole('button', { name: copy.entrevista.comecar }))
  await dialogo.findByText(copy.entrevista.falando)

  act(() => {
    condutor.ouvintes?.aoTurno({ quem: 'agent', texto: 'O que vocês vendem?' })
    condutor.ouvintes?.aoTurno({ quem: 'lead', texto: 'Usinas solares por assinatura.' })
    condutor.ouvintes?.aoEstado('ouvindo')
  })
  expect(dialogo.getByText('Usinas solares por assinatura.')).toBeDefined()
  expect(dialogo.getByText(copy.entrevista.ouvindo)).toBeDefined()

  fireEvent.click(dialogo.getByRole('button', { name: copy.entrevista.encerrar }))

  expect(
    await dialogo.findByRole('region', { name: copy.sugestoes.etapas.identidade }),
  ).toBeDefined()
  expect(condutor.encerradas).toBe(1)
  expect(sarah.entrevistas).toEqual([
    { passo: 'abrir' },
    { passo: 'encerrar', agenteId: 'agente-da-entrevista', conversaId: 'conversa-1' },
  ])
})

it('a Sarah desligar sozinha segue para as sugestões', async () => {
  const condutor = criarCondutor()
  const { dialogo, sarah } = await montar(condutor)
  escolherConversa(dialogo)
  fireEvent.click(dialogo.getByRole('button', { name: copy.entrevista.comecar }))
  await dialogo.findByText(copy.entrevista.falando)

  act(() => condutor.ouvintes?.aoEstado('parada'))

  expect(
    await dialogo.findByRole('region', { name: copy.sugestoes.etapas.identidade }),
  ).toBeDefined()
  expect(sarah.entrevistas.filter((passo) => passo.passo === 'encerrar')).toHaveLength(1)
})

it('sem a ElevenLabs, a frase diz onde conectar e escrever continua à mão', async () => {
  const condutor = criarCondutor()
  const { dialogo } = await montar(condutor, { entrevistaSemVoz: true })
  escolherConversa(dialogo)
  fireEvent.click(dialogo.getByRole('button', { name: copy.entrevista.comecar }))

  expect((await dialogo.findByRole('alert')).textContent).toBe(MENSAGENS.voz_nao_conectada)
  expect(condutor.aberturas).toEqual([])

  fireEvent.click(dialogo.getByRole('button', { name: copy.entrevista.escrever }))
  expect(dialogo.getByLabelText(copy.negocio.empresa.rotulo)).toBeDefined()
})

it('microfone negado vira a frase do microfone', async () => {
  const { dialogo } = await montar(criarCondutor({ recusa: true }))
  escolherConversa(dialogo)
  fireEvent.click(dialogo.getByRole('button', { name: copy.entrevista.comecar }))

  expect((await dialogo.findByRole('alert')).textContent).toBe(copy.entrevista.semMicrofone)
})

it('conversa curta demais volta com a frase da borda, sem sugestão', async () => {
  const condutor = criarCondutor()
  const { dialogo } = await montar(condutor, {
    conversaDaEntrevista: [{ quem: 'agent', texto: 'Oi! Aqui é a Sarah.' }],
  })
  escolherConversa(dialogo)
  fireEvent.click(dialogo.getByRole('button', { name: copy.entrevista.comecar }))
  await dialogo.findByText(copy.entrevista.falando)
  fireEvent.click(dialogo.getByRole('button', { name: copy.entrevista.encerrar }))

  expect((await dialogo.findByRole('alert')).textContent).toBe(MENSAGENS.conversa_curta)
})

it('dá para digitar durante a conversa: vai para a Sarah e entra na lista', async () => {
  const condutor = criarCondutor()
  const { dialogo } = await montar(condutor)
  escolherConversa(dialogo)
  fireEvent.click(dialogo.getByRole('button', { name: copy.entrevista.comecar }))
  await dialogo.findByText(copy.entrevista.falando)

  const campo = dialogo.getByLabelText(copy.entrevista.digitar)
  const enviar = dialogo.getByRole('button', { name: copy.entrevista.enviar }) as HTMLButtonElement
  expect(enviar.disabled).toBe(true)

  fireEvent.change(campo, { target: { value: 'O site é aurora.com.br' } })
  fireEvent.click(enviar)

  await waitFor(() => expect(condutor.ditos).toEqual(['O site é aurora.com.br']))
  expect(dialogo.getByText('O site é aurora.com.br')).toBeDefined()
  expect((campo as HTMLInputElement).value).toBe('')
  // Digitar não encerra a conversa.
  expect(condutor.encerradas).toBe(0)
})

it('digitar avisa a Sarah para esperar, sem mandar um sinal por tecla', async () => {
  const condutor = criarCondutor()
  const { dialogo } = await montar(condutor)
  escolherConversa(dialogo)
  fireEvent.click(dialogo.getByRole('button', { name: copy.entrevista.comecar }))
  await dialogo.findByText(copy.entrevista.falando)

  const campo = dialogo.getByLabelText(copy.entrevista.digitar)
  for (const parcial of ['O', 'O s', 'O si', 'O sit', 'O site']) {
    fireEvent.change(campo, { target: { value: parcial } })
  }

  // Cinco teclas no mesmo segundo são um aviso só.
  expect(condutor.sinais).toBe(1)
  expect(condutor.ditos).toEqual([])
})

it('voz escolhida que não pode entrar na conta avisa, e a conversa não abre com outra', async () => {
  const condutor = criarCondutor()
  const sarah = criarServicoDaSarahDublado({ vozForaDaConta: true })
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={cliente}>
      <ProvedorDaSarah servico={sarah}>
        <EntrevistaComASarah
          condutor={condutor}
          voz={{ id: 'czvzJwIVS2asEKnthV40', nome: 'Daniel' }}
          aoGerar={() => {}}
          aoEscrever={() => {}}
          espera={null}
        />
      </ProvedorDaSarah>
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: copy.entrevista.comecar }))
  expect((await screen.findByRole('alert')).textContent).toBe(MENSAGENS.voz_fora_da_conta)
  expect(condutor.aberturas).toEqual([])
})
