// O que esta tela precisa provar: o ensaio do começo ao fim, sem navegador
// (US-247, T-16, RF-312).
//
// O condutor da conversa é dublado, e é isso que torna o arquivo possível: o
// de verdade pede microfone e abre WebSocket, e a escada local não alcança
// nenhum dos dois (CLAUDE.md). O que fica para o degrau 3 é uma coisa só —
// que `condutor-elevenlabs.ts` cumpra o contrato.
//
// Três asserções justificam o arquivo:
//
// 1. **Cair não é encerrar.** Quando a conversa morre sozinha, o ensaio é
//    fechado no servidor assim mesmo — senão a linha fica aberta para sempre
//    e o ensaio nunca vira ficha revisável.
// 2. **Microfone negado também fecha o ensaio**, pela mesma razão: a abertura
//    no banco já aconteceu quando o condutor falha.
// 3. **O fim leva para a ficha**, porque o ensaio é uma chamada e o ciclo de
//    evolução funciona sobre ele igual.
// 4. **As ferramentas aparecem na ordem do instante** de
//    `call_tool_invocations`, e não na de chegada (US-114). O dublê entrega a
//    mais nova primeiro de propósito.
// 5. **No modo voz, o microfone vem antes da sessão** (US-115). O microfone é
//    dublado como o condutor: jsdom não tem nenhum dos dois. Negado, ele é
//    estado de tela com o caminho para liberar, e nenhuma chamada nasce.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import {
  PERFIL_PADRAO,
  PERFIS_DE_LEAD,
  type IdDoPerfil,
} from '@compartilhado/ensaio/perfis-de-lead.ts'

import { textosDoEnsaio } from '@/copy/ensaio'
import { nomeDaFerramenta } from '@/copy/ferramentas'
import { ProvedorDoEnsaio } from '@/ensaio/provedor'
import type { FerramentaDoEnsaio } from '@/ensaio/tipos'
import type { MicrofoneDoEnsaio, PermissaoDoMicrofone } from '@/ensaio/voz'
import { TelaDeEnsaio } from '@/rotas/sarah-ensaio'
import { ProvedorDaSarah } from '@/sarah/provedor'
import type {
  AberturaDaConversa,
  CondutorDeConversa,
  EstadoDaConversa,
  OuvintesDaConversa,
} from '@/sarah/ensaio'
import {
  criarServicoDaSarahDublado,
  identidadeDeExemplo,
  type RespostasDaSarah,
  type ServicoDaSarahDublado,
} from '@/testes/servico-da-sarah-dublado'
import {
  criarServicoDoEnsaioDublado,
  type ServicoDoEnsaioDublado,
} from '@/testes/servico-do-ensaio-dublado'
import { formatarHora } from '@/utilidades/datas'

/** O condutor dublado, com o controle da conversa na mão do teste. */
interface CondutorDublado {
  condutor: CondutorDeConversa
  aberturas: AberturaDaConversa[]
  ditos: string[]
  encerramentos: number
  /** Empurra uma fala da Sarah, como o provedor faria. */
  falar(texto: string): void
  /** Derruba a conversa, como uma queda de rede. */
  derrubar(motivo: string): void
  /** Troca quem tem a palavra, como o `onModeChange` do provedor. */
  mudar(estado: EstadoDaConversa): void
  /** Uma fala do lead transcrita, como o provedor devolve no modo voz. */
  transcrever(texto: string): void
  identificador: string | null
  /** A abertura levanta com este erro, quando definido. */
  falharAoAbrir: unknown
}

function dublarCondutor(): CondutorDublado {
  const estado: CondutorDublado = {
    aberturas: [],
    ditos: [],
    encerramentos: 0,
    identificador: 'conv_do_ensaio',
    falharAoAbrir: undefined,
    falar: () => {},
    derrubar: () => {},
    mudar: () => {},
    transcrever: () => {},
    condutor: {
      async abrir(abertura, ouvintes: OuvintesDaConversa) {
        estado.aberturas.push(abertura)
        if (estado.falharAoAbrir !== undefined) throw estado.falharAoAbrir

        ouvintes.aoEstado('ouvindo')
        estado.falar = (texto) => ouvintes.aoTurno({ quem: 'agent', texto })
        estado.derrubar = (motivo) => ouvintes.aoCair(motivo)
        estado.mudar = (novo) => ouvintes.aoEstado(novo)
        estado.transcrever = (texto) => ouvintes.aoTurno({ quem: 'lead', texto })

        return {
          identificador: () => estado.identificador,
          async dizer(texto) {
            estado.ditos.push(texto)
          },
          async encerrar() {
            estado.encerramentos += 1
          },
        }
      },
    },
  }
  return estado
}

/** O microfone dublado: responde `resposta`, ou espera o teste soltar. */
interface MicrofoneDublado {
  microfone: MicrofoneDoEnsaio
  pedidos: number
  resposta: PermissaoDoMicrofone
  /** Com isto ligado, o pedido fica pendente até `soltar`. */
  segurar: boolean
  soltar(resposta: PermissaoDoMicrofone): void
}

function dublarMicrofone(): MicrofoneDublado {
  const estado: MicrofoneDublado = {
    pedidos: 0,
    resposta: 'liberado',
    segurar: false,
    soltar: () => {},
    microfone: {
      pedir() {
        estado.pedidos += 1
        if (!estado.segurar) return Promise.resolve(estado.resposta)
        return new Promise((resolver) => {
          estado.soltar = resolver
        })
      },
    },
  }
  return estado
}

/**
 * A assistente destas contas se chama Ana, e não Sarah: é o que prova que a
 * tela usa o nome gravado, e não um nome escrito na copy.
 */
const NOME = 'Ana'
const copy = textosDoEnsaio(NOME)

function montar(respostas: RespostasDaSarah = {}): {
  servico: ServicoDaSarahDublado
  condutor: CondutorDublado
  registro: ServicoDoEnsaioDublado
  microfone: MicrofoneDublado
} {
  const servico = criarServicoDaSarahDublado({
    sarah: { identidade: { ...identidadeDeExemplo(), nome: NOME }, publicacao: 'publicado' },
    ...respostas,
  })
  const registro = criarServicoDoEnsaioDublado()
  const condutor = dublarCondutor()
  const microfone = dublarMicrofone()
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={cliente}>
      <ProvedorDaSarah servico={servico}>
        <ProvedorDoEnsaio servico={registro}>
          <TelaDeEnsaio condutor={condutor.condutor} microfone={microfone.microfone} />
        </ProvedorDoEnsaio>
      </ProvedorDaSarah>
    </QueryClientProvider>,
  )
  return { servico, condutor, registro, microfone }
}

function escolherVoz() {
  fireEvent.change(screen.getByLabelText(copy.preparo.modo), { target: { value: 'voice' } })
}

/** O selo da conversa, que no modo voz diz se o microfone está aberto. */
function seloDaConversa(): string {
  const painel = screen.getByRole('heading', { name: copy.conversa.titulo }).closest('section')
  return painel?.querySelector('.selo')?.textContent ?? ''
}

/** A chamada do ensaio no dublê da Sarah. */
const CHAMADA = 'chamada-do-ensaio'

/** Grava uma invocação, como a ferramenta faria no servidor. */
function gravar(registro: ServicoDoEnsaioDublado, invocacao: FerramentaDoEnsaio) {
  registro.invocacoes.set(CHAMADA, [...(registro.invocacoes.get(CHAMADA) ?? []), invocacao])
}

/** As linhas do painel das ferramentas, em ordem de tela. */
function linhasDoPainel(): string[] {
  const painel = screen.getByRole('region', { name: copy.ferramentas.titulo })
  return within(painel)
    .queryAllByRole('listitem')
    .map((item) => item.textContent ?? '')
}

/** Escolhe o perfil, quando pedido, e começa o ensaio. */
async function comecar(perfil?: IdDoPerfil) {
  if (perfil) fireEvent.click(screen.getByRole('radio', { name: new RegExp(copy.perfis[perfil].rotulo) }))
  fireEvent.click(screen.getByRole('button', { name: copy.preparo.comecar }))
  await screen.findByText(copy.conversa.titulo)
}

afterEach(cleanup)

test('a tela oferece um perfil por entrada do catálogo, com o rótulo da copy', () => {
  montar()

  const opcoes = screen.getAllByRole('radio')
  expect(opcoes.map((opcao) => (opcao as HTMLInputElement).value)).toEqual(
    PERFIS_DE_LEAD.map((perfil) => perfil.id),
  )
  for (const perfil of PERFIS_DE_LEAD) {
    expect(screen.getByText(copy.perfis[perfil.id].rotulo)).toBeTruthy()
  }
  expect((screen.getByRole('radio', { checked: true }) as HTMLInputElement).value).toBe(
    PERFIL_PADRAO,
  )
})

test('o ensaio abre com o propósito, o modo e o perfil escolhidos', async () => {
  const { servico } = montar()

  fireEvent.change(screen.getByLabelText(copy.preparo.modo), { target: { value: 'voice' } })
  await comecar('pede_bloqueio')

  expect(servico.ensaiosAbertos[0]).toEqual({
    proposito: 'discovery',
    modo: 'voice',
    perfil: 'pede_bloqueio',
  })
})

test('a sessão leva call_id e as variáveis que a borda montou, sem inventar nenhuma', async () => {
  const { condutor } = montar()
  await comecar('pessoa_errada')

  // O mesmo contexto da ligação de verdade, montado na borda: a tela só
  // repassa. A sessão do navegador não passa pelo webhook de início.
  expect(condutor.aberturas[0]?.variaveis).toEqual({
    nome_do_lead: 'Pessoa de Ensaio',
    contexto_do_lead: '',
    call_id: 'chamada-do-ensaio',
  })
  expect(condutor.aberturas[0]?.primeiraFala).toBe('Oi, Pessoa de Ensaio? Aqui é a Sarah.')
  expect(condutor.aberturas[0]?.urlAssinada).toContain('wss://')
})

test('a fala da Sarah aparece na conversa', async () => {
  const { condutor } = montar()
  await comecar()

  expect(screen.getByText(copy.conversa.aindaSemFalaTexto)).toBeDefined()

  condutor.falar('Oi, Paula. Aqui é a Sarah. Esta ligação é gravada.')
  await screen.findByText('Oi, Paula. Aqui é a Sarah. Esta ligação é gravada.', { exact: false })
})

test('no modo texto, o que você escreve vai para o condutor', async () => {
  const { condutor } = montar()
  await comecar()

  fireEvent.change(screen.getByLabelText(copy.conversa.campo), {
    target: { value: 'Pode falar.' },
  })
  fireEvent.click(screen.getByRole('button', { name: copy.conversa.enviar }))

  await waitFor(() => expect(condutor.ditos).toEqual(['Pode falar.']))
  expect(screen.getByText('Pode falar.', { exact: false })).toBeDefined()
})

test('encerrar fecha no condutor e no servidor, e leva à ficha', async () => {
  const { servico, condutor } = montar()
  await comecar()

  fireEvent.click(screen.getByRole('button', { name: copy.conversa.encerrar }))
  await screen.findByText(copy.fim.titulo)

  expect(condutor.encerramentos).toBe(1)
  // O identificador da conversa vem do condutor: é ele que o provedor informa.
  expect(servico.ensaiosEncerrados[0]).toEqual({
    ensaioId: 'ensaio-1',
    conversaId: 'conv_do_ensaio',
  })
  // O ensaio é uma chamada, e o ciclo de evolução funciona sobre ele igual.
  const paraFicha = screen.getByRole('link', { name: copy.fim.abrirFicha })
  expect(paraFicha.getAttribute('href')).toBe('/chamadas/chamada-do-ensaio')
})

test('a conversa que cai encerra o ensaio assim mesmo', async () => {
  const { servico, condutor } = montar()
  await comecar()

  condutor.derrubar('conexão perdida')

  // Cair não é encerrar: sem isto a linha fica aberta para sempre no banco.
  await waitFor(() => expect(servico.ensaiosEncerrados).toHaveLength(1))
  const alerta = await screen.findByRole('alert')
  expect(alerta.textContent).toContain('conexão perdida')
  await screen.findByText(copy.fim.titulo)
})

test('condutor que não abre também fecha o ensaio, que já existe no banco', async () => {
  const { servico, condutor } = montar()
  condutor.falharAoAbrir = new Error('rede')

  fireEvent.click(screen.getByRole('button', { name: copy.preparo.comecar }))

  const alerta = await screen.findByRole('alert')
  expect(alerta.textContent).toBe(copy.conversa.naoAbriu)
  // A abertura no banco já aconteceu quando o condutor falhou.
  await waitFor(() => expect(servico.ensaiosEncerrados).toHaveLength(1))
})

test('sem publicação, a recusa leva a onde se publica', async () => {
  const { servico, condutor } = montar({
    aberturaDoEnsaio: {
      ok: false,
      mensagem: 'A Sarah ainda não foi publicada neste propósito.',
      caminho: '/sarah/playbooks',
    },
  })

  fireEvent.click(screen.getByRole('button', { name: copy.preparo.comecar }))

  const alerta = await screen.findByRole('alert')
  const botao = within(alerta).getByRole('link', { name: copy.resolver })
  expect(botao.getAttribute('href')).toBe('/sarah/playbooks')
  // Nada foi aberto no condutor: não há contra o que ensaiar.
  expect(condutor.aberturas).toHaveLength(0)
  expect(servico.ensaiosEncerrados).toHaveLength(0)
})

test('ensaio sem conversa devolvida diz isso, em vez de mentir', async () => {
  const { condutor } = montar({
    encerramentoDoEnsaio: { ok: true, chamadaId: 'chamada-do-ensaio', turnos: 0 },
  })
  await comecar()
  condutor.identificador = null

  fireEvent.click(screen.getByRole('button', { name: copy.conversa.encerrar }))

  await screen.findByText(copy.fim.semTurnos)
})

test('o estado da conversa aparece: numa conversa por voz não há outro jeito de saber', async () => {
  const { condutor } = montar()
  await comecar()

  expect(screen.getByText(copy.conversa.estados.ouvindo)).toBeDefined()
  condutor.falar('Oi.')
  await screen.findByText('Oi.', { exact: false })
})

test('depois de encerrar, dá para ensaiar de novo', async () => {
  montar()
  await comecar()

  fireEvent.click(screen.getByRole('button', { name: copy.conversa.encerrar }))
  await screen.findByText(copy.fim.titulo)

  fireEvent.click(screen.getByRole('button', { name: copy.fim.outro }))
  expect(screen.getByRole('button', { name: copy.preparo.comecar })).toBeDefined()
})

test('a tela avisa que a sessão consome crédito do provedor, nos dois modos', () => {
  montar()

  expect(screen.getByRole('note').textContent).toBe(copy.credito.text)
  fireEvent.change(screen.getByLabelText(copy.preparo.modo), { target: { value: 'voice' } })
  expect(screen.getByRole('note').textContent).toBe(copy.credito.voice)
})

test('duas falas e duas ferramentas: a ordem sai do instante, e a que falhou aparece assim', async () => {
  const { condutor, registro } = montar()
  await comecar('pede_bloqueio')

  expect(linhasDoPainel()).toEqual([])
  expect(screen.getByText(copy.ferramentas.nenhuma)).toBeDefined()

  // Primeira fala: a transferência já estava gravada.
  const transferencia = { ferramenta: 'tool-transfer', em: '2026-09-24T13:00:05.000Z', erro: null }
  gravar(registro, transferencia)
  condutor.falar('Posso passar você para alguém da equipe.')
  await waitFor(() => expect(linhasDoPainel()).toHaveLength(1))

  // Segunda fala: chega um bloqueio com instante anterior ao da transferência.
  // Chegou depois, mas aconteceu antes, e é assim que ele tem de aparecer.
  const bloqueio = {
    ferramenta: 'tool-dnc',
    em: '2026-09-24T13:00:02.000Z',
    erro: 'dnc_indisponivel',
  }
  gravar(registro, bloqueio)
  condutor.falar('Tudo bem, não vamos mais ligar.')
  await screen.findByText('Tudo bem, não vamos mais ligar.', { exact: false })

  await waitFor(() =>
    expect(linhasDoPainel()).toEqual([
      `${formatarHora(bloqueio.em)}${nomeDaFerramenta('tool-dnc')}${copy.ferramentas.falhou}`,
      `${formatarHora(transferencia.em)}${nomeDaFerramenta('tool-transfer')}`,
    ]),
  )
  // Nome em linguagem humana, nunca o identificador cru.
  expect(screen.getByRole('region', { name: copy.ferramentas.titulo }).textContent).not.toContain(
    'tool-',
  )
  expect(registro.leituras).toEqual([CHAMADA, CHAMADA])
})

test('o encerramento relê o registro e resume as ferramentas junto da ficha', async () => {
  const { condutor, registro } = montar()
  await comecar()

  gravar(registro, { ferramenta: 'tool-dnc', em: '2026-09-24T13:00:02.000Z', erro: null })
  condutor.falar('Certo.')
  await waitFor(() => expect(linhasDoPainel()).toHaveLength(1))

  // `call-finalize` grava as de sistema no fim: só a releitura as encontra.
  gravar(registro, { ferramenta: 'system:end_call', em: '2026-09-24T13:00:09.000Z', erro: null })
  fireEvent.click(screen.getByRole('button', { name: copy.conversa.encerrar }))
  await screen.findByText(copy.fim.titulo)

  await waitFor(() => expect(linhasDoPainel()).toHaveLength(2))
  expect(linhasDoPainel()[1]).toContain(nomeDaFerramenta('system:end_call'))
  expect(screen.getByText(copy.fim.comFerramentas(2), { exact: false })).toBeDefined()
  expect(screen.getByRole('link', { name: copy.fim.abrirFicha }).getAttribute('href')).toBe(
    `/chamadas/${CHAMADA}`,
  )
})

test('ensaio sem ferramenta diz isso no fim', async () => {
  montar()
  await comecar()

  fireEvent.click(screen.getByRole('button', { name: copy.conversa.encerrar }))
  await screen.findByText(copy.fim.titulo)

  await screen.findByText(copy.ferramentas.nenhumaNoFim)
})

test('leitura que falha avisa e mantém a última lista lida', async () => {
  const { condutor, registro } = montar()
  await comecar()

  gravar(registro, { ferramenta: 'tool-transfer', em: '2026-09-24T13:00:05.000Z', erro: null })
  condutor.falar('Um momento.')
  await waitFor(() => expect(linhasDoPainel()).toHaveLength(1))

  registro.falhar = true
  condutor.falar('Ainda está aí?')
  await screen.findByText(copy.ferramentas.semLeitura)
  expect(linhasDoPainel()).toHaveLength(1)
})

test('ensaiar de novo começa com o painel vazio', async () => {
  const { condutor, registro } = montar()
  await comecar()
  gravar(registro, { ferramenta: 'tool-dnc', em: '2026-09-24T13:00:02.000Z', erro: null })
  condutor.falar('Certo.')
  await waitFor(() => expect(linhasDoPainel()).toHaveLength(1))

  fireEvent.click(screen.getByRole('button', { name: copy.conversa.encerrar }))
  await screen.findByText(copy.fim.titulo)
  fireEvent.click(screen.getByRole('button', { name: copy.fim.outro }))

  registro.invocacoes.clear()
  await comecar()
  expect(linhasDoPainel()).toEqual([])
})

// O modo voz (US-115) ---------------------------------------------------------

test('o modo texto nunca pede o microfone', async () => {
  const { microfone } = montar()
  await comecar()
  expect(microfone.pedidos).toBe(0)
})

test('modo voz: pedindo permissão, ouvindo, falando e encerrado, pelo adaptador', async () => {
  const { servico, condutor, microfone } = montar()
  microfone.segurar = true
  escolherVoz()

  fireEvent.click(screen.getByRole('button', { name: copy.preparo.comecar }))

  // Enquanto o navegador pergunta, nenhuma sessão foi pedida.
  expect((await screen.findByRole('status')).textContent).toBe(copy.voz.pedindo)
  expect(microfone.pedidos).toBe(1)
  expect(servico.ensaiosAbertos).toHaveLength(0)

  microfone.soltar('liberado')
  await screen.findByText(copy.conversa.titulo)

  // A mesma sessão do texto, com mode='voice' (T-16).
  expect(servico.ensaiosAbertos[0]?.modo).toBe('voice')
  expect(condutor.aberturas[0]?.modo).toBe('voice')
  expect(seloDaConversa()).toBe(copy.voz.estados.ouvindo)

  condutor.mudar('falando')
  await waitFor(() => expect(seloDaConversa()).toBe(copy.voz.estados.falando))
  condutor.mudar('ouvindo')
  await waitFor(() => expect(seloDaConversa()).toBe(copy.voz.estados.ouvindo))

  fireEvent.click(screen.getByRole('button', { name: copy.conversa.encerrar }))
  await screen.findByText(copy.fim.titulo)
  expect(screen.getByText(copy.voz.estados.encerrado)).toBeDefined()
  expect(servico.ensaiosEncerrados).toHaveLength(1)
})

test('modo voz: a transcrição chega à conversa, e a fala da Sarah relê as ferramentas', async () => {
  const { condutor, registro } = montar()
  escolherVoz()
  await comecar()

  const transcricao = screen.getByRole('log', { name: copy.voz.transcricao })
  expect(transcricao.textContent).toBe(copy.conversa.aindaSemFala)
  // Sem campo de texto: no modo voz quem fala é o microfone.
  expect(screen.queryByLabelText(copy.conversa.campo)).toBeNull()

  condutor.falar('Oi, aqui é a Sarah.')
  condutor.transcrever('Não quero mais receber ligações.')
  gravar(registro, { ferramenta: 'tool-dnc', em: '2026-09-24T13:00:02.000Z', erro: null })
  condutor.falar('Tudo bem, não vamos mais ligar.')

  await waitFor(() =>
    expect([...transcricao.querySelectorAll('p')].map((linha) => linha.textContent)).toEqual([
      `${copy.conversa.quem.agent}: Oi, aqui é a Sarah.`,
      `${copy.conversa.quem.lead}: Não quero mais receber ligações.`,
      `${copy.conversa.quem.agent}: Tudo bem, não vamos mais ligar.`,
    ]),
  )
  await waitFor(() => expect(linhasDoPainel()).toHaveLength(1))
  expect(linhasDoPainel()[0]).toContain(nomeDaFerramenta('tool-dnc'))
})

test('microfone negado é estado de tela com o caminho para liberar, e nenhuma chamada nasce', async () => {
  const { servico, condutor, microfone } = montar()
  microfone.resposta = 'negado'
  escolherVoz()

  fireEvent.click(screen.getByRole('button', { name: copy.preparo.comecar }))

  const aviso = await screen.findByRole('alert')
  expect(aviso.textContent).toContain(copy.voz.semPermissao.titulo)
  expect(aviso.textContent).toContain(copy.voz.semPermissao.caminho)
  expect(servico.ensaiosAbertos).toHaveLength(0)
  expect(condutor.aberturas).toHaveLength(0)
  expect(servico.ensaiosEncerrados).toHaveLength(0)

  // Liberado no navegador, tentar de novo segue para a conversa.
  microfone.resposta = 'liberado'
  fireEvent.click(within(aviso).getByRole('button', { name: copy.voz.tentarDeNovo }))
  await screen.findByText(copy.conversa.titulo)
  expect(microfone.pedidos).toBe(2)
  expect(screen.queryByText(copy.voz.semPermissao.titulo)).toBeNull()
})

test('sem microfone, a saída é ensaiar por texto', async () => {
  const { microfone } = montar()
  microfone.resposta = 'sem_microfone'
  escolherVoz()

  fireEvent.click(screen.getByRole('button', { name: copy.preparo.comecar }))

  const aviso = await screen.findByRole('alert')
  expect(aviso.textContent).toContain(copy.voz.semMicrofone.titulo)
  fireEvent.click(within(aviso).getByRole('button', { name: copy.voz.porTexto }))

  expect(screen.queryByRole('alert')).toBeNull()
  expect((screen.getByLabelText(copy.preparo.modo) as HTMLSelectElement).value).toBe('text')
})

test('microfone revogado entre o pedido e a sessão vira o mesmo estado, e fecha o ensaio', async () => {
  const { servico, condutor } = montar()
  condutor.falharAoAbrir = new DOMException('negado', 'NotAllowedError')
  escolherVoz()

  fireEvent.click(screen.getByRole('button', { name: copy.preparo.comecar }))

  await screen.findByText(copy.voz.semPermissao.titulo)
  // A chamada já existia quando o condutor falhou: ela é fechada.
  await waitFor(() => expect(servico.ensaiosEncerrados).toHaveLength(1))
  expect(screen.queryByText(copy.conversa.naoAbriu)).toBeNull()
})

test('a tela chama a assistente pelo nome que a conta gravou', async () => {
  montar()
  // O apoio da tela e o rótulo das falas dela usam o nome, e não "a assistente".
  expect(await screen.findByText(copy.apoio)).toBeDefined()
  expect(copy.apoio).toContain(`a ${NOME}`)
  expect(copy.conversa.quem.agent).toBe(NOME)
})
