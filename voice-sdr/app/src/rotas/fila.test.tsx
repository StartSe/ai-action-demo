// O que esta tela precisa provar: a fila com os sete tipos de RF-909 e o que
// cada um traz do `context`, o limiar que criou o item, a ordem por severidade
// e depois por instante, a ação de verdade por tipo, os dois vazios, as
// variantes desenhadas (normal, fila limpa, sem permissão), resolver em um
// clique tirando o item da lista, resolver duas vezes sem sobrescrever ninguém,
// o áudio pedido só no clique e só quando há gravação, o item novo que chega
// pelo tempo real e a recarga por intervalo quando ele cai.
//
// Duas asserções justificam o arquivo. Resolver tem que chegar ao serviço com
// texto mesmo com o campo em branco, senão o RPC devolve `resolucao_vazia` e o
// clique único vira dois passos. E o item que outra pessoa resolveu tem que
// continuar com a resolução dela no dublê depois do clique: a frase certa com a
// linha sobrescrita por baixo seria a pior das duas falhas.

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { lerContexto } from '@/fila/leitura'
import type { ItemDaFila } from '@/fila/tipos'
import { comum } from '@/copy/comum'
import { fila as copy, SEVERIDADE_DO_ITEM, TIPO_DO_ITEM } from '@/copy/fila'
import { INTERVALO_DA_RECARGA_MS } from '@/fila/consulta'
import { ficha as copyDaFicha } from '@/copy/chamadas'
import type { Equipe, Papel } from '@/equipe/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeChamadasDublado,
  type ServicoDeChamadasDublado,
} from '@/testes/servico-de-chamadas-dublado'
import {
  criarServicoDeEquipeDublado,
  equipeDeExemplo,
} from '@/testes/servico-de-equipe-dublado'
import {
  criarServicoDaFilaDublado,
  itemDeExemplo,
  type RespostasDaFila,
  type ServicoDaFilaDublado,
} from '@/testes/servico-da-fila-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'
import { formatarInstante } from '@/utilidades/datas'

afterEach(cleanup)

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

function comPapel(papelDoUsuario: Papel): Equipe {
  return {
    ...equipeDeExemplo(),
    papelDoUsuario,
    membros: [
      {
        usuarioId: 'u-1',
        nome: 'Renata Alves',
        email: 'renata@aurora.com.br',
        papel: papelDoUsuario,
        ultimoAcesso: null,
      },
      {
        usuarioId: 'u-9',
        nome: 'Selma Dias',
        email: 'selma@aurora.com.br',
        papel: 'owner',
        ultimoAcesso: null,
      },
    ],
  }
}

const minutosAtras = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString()

/**
 * Os três gêneros da F3, com o nome que as ferramentas ainda gravam lido como o
 * tipo de RF-909, cada um com o `context` que a ferramenta dele grava.
 */
function tresGeneros(): ItemDaFila[] {
  return [
    itemDeExemplo({
      id: 'humano',
      tipo: 'pedido_humano',
      severidade: 'alta',
      criadoEm: minutosAtras(5),
      lead: { id: 'l-marcos', nome: 'Marcos Ferreira', telefone: '+5548999998888' },
      chamadaId: 'c-humano',
      gravacao: 'disponivel',
      contexto: lerContexto({
        recorte: 'Quero falar com alguém do comercial agora.',
        urgencia: 'alta',
        pendencia: 'destino_ausente',
      }),
    }),
    itemDeExemplo({
      id: 'bloqueio',
      tipo: 'pedido_bloqueio',
      severidade: 'baixa',
      criadoEm: minutosAtras(30),
      lead: { id: 'l-joana', nome: 'Joana Prado', telefone: '+5511988887777' },
      chamadaId: 'c-bloqueio',
      gravacao: 'sem_gravacao',
      contexto: lerContexto({ recorte: 'Esse número não é da Joana.', origem: 'wrong_number' }),
    }),
    itemDeExemplo({
      id: 'falha',
      tipo: 'falha_repetida',
      severidade: 'media',
      criadoEm: minutosAtras(90),
      lead: { id: 'l-otavio', nome: 'Otávio Reis', telefone: '+5521977776666' },
      chamadaId: 'c-falha',
      gravacao: 'expurgada',
      contexto: lerContexto({
        phone_e164: '+5521977776666',
        tentativas: ['c-1', 'c-2', 'c-falha'],
      }),
      limiares: [{ chave: 'consecutive_failures_cap', valor: 3 }],
    }),
  ]
}

/** Os quatro tipos que os gatilhos da F4 abrem, com o retrato do limiar. */
function tiposDaF4(): ItemDaFila[] {
  return [
    itemDeExemplo({
      id: 'sentimento',
      tipo: 'sentimento_negativo',
      severidade: 'alta',
      criadoEm: minutosAtras(10),
      lead: { id: 'l-lucia', nome: 'Lúcia Campos', telefone: '+5541955554444' },
      chamadaId: 'c-sentimento',
      contexto: lerContexto({ trecho: 'Vocês me ligam toda semana, chega.', sentimento: -0.62 }),
      limiares: [{ chave: 'sentiment_floor', valor: -0.5 }],
    }),
    itemDeExemplo({
      id: 'avaliacao',
      tipo: 'avaliacao_reprovada',
      severidade: 'media',
      criadoEm: minutosAtras(20),
      lead: { id: 'l-paulo', nome: 'Paulo Souza', telefone: '+5551944443333' },
      chamadaId: 'c-avaliacao',
      contexto: lerContexto({ criterios: ['aviso_de_gravacao', 'proximo_passo'] }),
      limiares: [{ chave: 'failed_criteria_cap', valor: 2 }],
    }),
    itemDeExemplo({
      id: 'credito',
      tipo: 'credito_baixo',
      severidade: 'alta',
      criadoEm: minutosAtras(40),
      lead: null,
      chamadaId: null,
      gravacao: 'sem_gravacao',
      contexto: lerContexto({ provedor: 'elevenlabs', saldo_cents: 1250 }),
      limiares: [{ chave: 'credit_alert_cents', valor: 5000 }],
    }),
    itemDeExemplo({
      id: 'pendente',
      tipo: 'classificacao_pendente',
      severidade: 'media',
      criadoEm: minutosAtras(50),
      lead: { id: 'l-rita', nome: 'Rita Lima', telefone: '+5561933332222' },
      chamadaId: 'c-pendente',
      contexto: lerContexto({ motivo: 'modelo_indisponivel' }),
    }),
  ]
}

async function abrir(
  respostas: RespostasDaFila = {},
  papel: Papel = 'operator',
  chamadas: ServicoDeChamadasDublado = criarServicoDeChamadasDublado(),
): Promise<{ fila: ServicoDaFilaDublado; chamadas: ServicoDeChamadasDublado }> {
  const fila = criarServicoDaFilaDublado({ usuarioId: 'u-1', ...respostas })
  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    '/fila',
    criarServicoDeEquipeDublado({ carregar: { ok: true, equipe: comPapel(papel) } }),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    chamadas,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    fila,
  )
  return { fila, chamadas }
}

async function lista(): Promise<HTMLElement> {
  return screen.findByRole('list', { name: copy.lista })
}

function cartao(tipo: ItemDaFila['tipo'], lead: string): HTMLElement {
  return screen.getByRole('article', { name: copy.item.rotulo(tipo, lead) })
}

function artigos(): (string | null)[] {
  return within(screen.getByRole('list', { name: copy.lista }))
    .getAllByRole('article')
    .map((artigo) => artigo.getAttribute('aria-label'))
}

describe('/fila', () => {
  it('é a tela Precisam de você, com os itens abertos da conta', async () => {
    const { fila } = await abrir({ itens: tresGeneros() })

    expect(await screen.findByRole('heading', { level: 1, name: copy.titulo })).toBeTruthy()
    await lista()
    expect(fila.cargas).toEqual(['aberto'])
  })

  it('mostra os gêneros da F3 como tipos de RF-909, com severidade, lead, instante, recorte e o que o contexto traz', async () => {
    const itens = tresGeneros()
    await abrir({ itens })
    await lista()

    const humano = cartao('pedido_humano', 'Marcos Ferreira')
    expect(within(humano).getByText(TIPO_DO_ITEM.pedido_humano)).toBeTruthy()
    expect(within(humano).getByText(SEVERIDADE_DO_ITEM.alta)).toBeTruthy()
    expect(within(humano).getByText('+5548999998888')).toBeTruthy()
    expect(within(humano).getByText(formatarInstante(itens[0]?.criadoEm))).toBeTruthy()
    expect(within(humano).getByText('Quero falar com alguém do comercial agora.')).toBeTruthy()
    expect(within(humano).getByText(copy.item.urgente)).toBeTruthy()
    expect(within(humano).getByText(copy.item.pendencia('destino_ausente'))).toBeTruthy()

    const bloqueio = cartao('pedido_bloqueio', 'Joana Prado')
    expect(within(bloqueio).getByText(TIPO_DO_ITEM.pedido_bloqueio)).toBeTruthy()
    expect(within(bloqueio).getByText(SEVERIDADE_DO_ITEM.baixa)).toBeTruthy()
    expect(within(bloqueio).getByText('Esse número não é da Joana.')).toBeTruthy()
    expect(within(bloqueio).getByText(copy.item.origem('wrong_number'))).toBeTruthy()

    const falha = cartao('falha_repetida', 'Otávio Reis')
    expect(within(falha).getByText(TIPO_DO_ITEM.falha_repetida)).toBeTruthy()
    expect(within(falha).getByText(SEVERIDADE_DO_ITEM.media)).toBeTruthy()
    expect(within(falha).getByText(copy.item.semRecorte)).toBeTruthy()
    expect(within(falha).getByText(copy.item.tentativas(3, '+5521977776666'))).toBeTruthy()
  })

  it('ordena por severidade e, dentro dela, pelo mais recente', async () => {
    await abrir({ itens: [...tresGeneros(), ...tiposDaF4()] })
    await lista()

    expect(artigos()).toEqual([
      copy.item.rotulo('pedido_humano', 'Marcos Ferreira'),
      copy.item.rotulo('sentimento_negativo', 'Lúcia Campos'),
      copy.item.rotulo('credito_baixo', copy.item.semLead),
      copy.item.rotulo('avaliacao_reprovada', 'Paulo Souza'),
      copy.item.rotulo('classificacao_pendente', 'Rita Lima'),
      copy.item.rotulo('falha_repetida', 'Otávio Reis'),
      copy.item.rotulo('pedido_bloqueio', 'Joana Prado'),
    ])
  })

  it('cada item diz o limiar que o criou, lido do retrato', async () => {
    await abrir({ itens: [...tresGeneros(), ...tiposDaF4()] })
    await lista()

    const porque = (artigo: HTMLElement) => within(artigo).getByRole('region', { name: copy.limiar.titulo })

    expect(
      within(porque(cartao('sentimento_negativo', 'Lúcia Campos'))).getByText(
        copy.limiar.sentiment_floor('-0,50', '-0,62'),
      ),
    ).toBeTruthy()
    expect(
      within(porque(cartao('avaliacao_reprovada', 'Paulo Souza'))).getByText(
        copy.limiar.failed_criteria_cap(2, 2),
      ),
    ).toBeTruthy()
    expect(
      within(porque(cartao('credito_baixo', copy.item.semLead))).getByText(
        copy.limiar.credit_alert_cents('50,00', '12,50', 'elevenlabs'),
      ),
    ).toBeTruthy()
    expect(
      within(porque(cartao('falha_repetida', 'Otávio Reis'))).getByText(
        copy.limiar.consecutive_failures_cap(3),
      ),
    ).toBeTruthy()
    expect(
      within(porque(cartao('pedido_humano', 'Marcos Ferreira'))).getByText(
        copy.item.semLimiar('pedido_humano'),
      ),
    ).toBeTruthy()
    expect(
      within(cartao('avaliacao_reprovada', 'Paulo Souza')).getByText(
        copy.item.criterios(['aviso_de_gravacao', 'proximo_passo']),
      ),
    ).toBeTruthy()
    expect(
      within(cartao('classificacao_pendente', 'Rita Lima')).getByText(
        copy.item.pendenciaDaClassificacao('modelo_indisponivel'),
      ),
    ).toBeTruthy()
    expect(
      within(cartao('sentimento_negativo', 'Lúcia Campos')).getByText(
        'Vocês me ligam toda semana, chega.',
      ),
    ).toBeTruthy()
  })

  it('cada tipo tem a sua ação, e as que abrem tela levam ao lugar do trabalho', async () => {
    await abrir({ itens: [...tresGeneros(), ...tiposDaF4()] })
    await lista()

    const elo = (artigo: HTMLElement, nome: string) =>
      within(artigo).getByRole('link', { name: nome }).getAttribute('href')

    expect(elo(cartao('pedido_humano', 'Marcos Ferreira'), copy.acao.ligar('Marcos Ferreira'))).toBe(
      'tel:+5548999998888',
    )
    expect(
      within(cartao('pedido_bloqueio', 'Joana Prado')).getByRole('button', {
        name: copy.acao.confirmarBloqueio,
      }),
    ).toBeTruthy()
    expect(elo(cartao('sentimento_negativo', 'Lúcia Campos'), copy.acao.abrirChamada)).toBe(
      '/chamadas/c-sentimento',
    )
    expect(elo(cartao('falha_repetida', 'Otávio Reis'), copy.acao.abrirLead)).toBe('/leads/l-otavio')
    expect(elo(cartao('avaliacao_reprovada', 'Paulo Souza'), copy.acao.abrirAvaliacao)).toBe(
      '/chamadas/c-avaliacao#avaliacao',
    )
    expect(elo(cartao('credito_baixo', copy.item.semLead), copy.acao.abrirIntegracoes)).toBe(
      '/config/integracoes',
    )
    expect(elo(cartao('classificacao_pendente', 'Rita Lima'), copy.acao.abrirChamada)).toBe(
      '/chamadas/c-pendente',
    )
  })

  it('confirmar o bloqueio inclui o número e resolve o item, que sai da lista', async () => {
    const { fila } = await abrir({ itens: tresGeneros() })
    await lista()
    expect(artigos()).toHaveLength(3)

    fireEvent.click(
      within(cartao('pedido_bloqueio', 'Joana Prado')).getByRole('button', {
        name: copy.acao.confirmarBloqueio,
      }),
    )

    expect(await screen.findByText(copy.acao.bloqueioConfirmado)).toBeTruthy()
    expect(fila.bloqueios).toEqual(['+5511988887777'])
    expect(fila.resolucoes).toEqual([{ id: 'bloqueio', texto: copy.acao.textoDoBloqueio }])
    await waitFor(() => expect(artigos()).toHaveLength(2))
  })

  it('bloqueio que a RLS recusa diz a frase da negativa, e o item continua', async () => {
    const { fila } = await abrir({ itens: tresGeneros(), bloqueioRecusado: true })
    await lista()

    const artigo = cartao('pedido_bloqueio', 'Joana Prado')
    fireEvent.click(within(artigo).getByRole('button', { name: copy.acao.confirmarBloqueio }))

    expect(await within(artigo).findByText(copy.acao.semPermissaoDeBloqueio)).toBeTruthy()
    expect(fila.resolucoes).toEqual([])
    expect(cartao('pedido_bloqueio', 'Joana Prado')).toBeTruthy()
  })

  it('tipo que ainda não tem quem o produza fica fora do filtro, sem falar de fase (D-15)', async () => {
    await abrir({ itens: tresGeneros() })
    await lista()

    const filtro = within(screen.getByLabelText(copy.filtroDeTipo))
    expect(filtro.queryByRole('option', { name: TIPO_DO_ITEM.reuniao_sem_especialista })).toBeNull()
    expect(filtro.getByRole('option', { name: TIPO_DO_ITEM.pedido_humano })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/nesta fase|\bfatia\b|\bF5\b/i)
  })

  it('o filtro de tipo recorta a lista, e o recorte vazio oferece voltar a todos', async () => {
    const { fila } = await abrir({ itens: tresGeneros() })
    await lista()

    fireEvent.change(screen.getByLabelText(copy.filtroDeTipo), {
      target: { value: 'falha_repetida' },
    })
    expect(artigos()).toEqual([copy.item.rotulo('falha_repetida', 'Otávio Reis')])

    fireEvent.change(screen.getByLabelText(copy.filtroDeTipo), {
      target: { value: 'credito_baixo' },
    })
    expect(screen.getByText(copy.semDoTipo.titulo('credito_baixo'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: copy.semDoTipo.mostrarTodos }))
    expect(artigos()).toHaveLength(3)
    expect(fila.cargas).toEqual(['aberto'])
  })

  it('fila nunca preenchida diz o que vai aparecer aqui', async () => {
    await abrir({ itens: [] })

    expect(await screen.findByText(copy.nuncaPreenchida.titulo)).toBeTruthy()
    expect(screen.getByText(copy.nuncaPreenchida.explicacao)).toBeTruthy()
    expect(screen.queryByText(copy.vazio.titulo)).toBeNull()
    expect(screen.queryByRole('list', { name: copy.lista })).toBeNull()
  })

  it('fila limpa, com itens já resolvidos, diz que nada espera por você', async () => {
    await abrir({ itens: [], haItens: true })

    expect(await screen.findByText(copy.vazio.titulo)).toBeTruthy()
    expect(screen.getByText(copy.vazio.explicacao)).toBeTruthy()
    expect(screen.queryByText(copy.nuncaPreenchida.titulo)).toBeNull()
  })

  it('sem permissão, o viewer lê a fila e vê a negativa com quem concede acesso', async () => {
    await abrir({ itens: tresGeneros() }, 'viewer')
    await lista()

    const negativa = screen.getByText(copy.leitura.aviso).closest('[role="alert"]')
    expect(negativa).toBeTruthy()
    const administradores = within(negativa as HTMLElement).getByRole('list', {
      name: comum.negativaPorPapel.pedirAcesso,
    })
    expect(within(administradores).getByText('Selma Dias')).toBeTruthy()

    expect(screen.queryByRole('button', { name: /^Resolver / })).toBeNull()
    expect(screen.queryByLabelText(copy.resolver.campo)).toBeNull()
    expect(screen.queryByRole('button', { name: copy.acao.confirmarBloqueio })).toBeNull()
    expect(cartao('pedido_humano', 'Marcos Ferreira')).toBeTruthy()
    // Abrir a tela onde o trabalho é feito é leitura, e fica.
    expect(
      within(cartao('falha_repetida', 'Otávio Reis')).getByRole('link', { name: copy.acao.abrirLead }),
    ).toBeTruthy()
  })

  it('carga que falha diz o motivo', async () => {
    await abrir({ carregar: { ok: false, motivo: 'falha-de-comunicacao' } })

    expect(await screen.findByText(copy.falhas['falha-de-comunicacao'])).toBeTruthy()
  })

  it('resolver é um clique: vai com o texto padrão, sai da lista e a fila é relida', async () => {
    const { fila } = await abrir({ itens: tresGeneros() })
    await lista()

    // A releitura fica presa: o item tem que sair antes de ela voltar.
    const soltar = fila.segurarCargas()
    const rotulo = copy.item.rotulo('pedido_humano', 'Marcos Ferreira')
    fireEvent.click(screen.getByRole('button', { name: copy.resolver.rotulo(rotulo) }))

    expect(await screen.findByText(copy.resolver.feito)).toBeTruthy()
    expect(fila.resolucoes).toEqual([{ id: 'humano', texto: copy.resolver.padrao }])
    expect(screen.queryByRole('article', { name: rotulo })).toBeNull()
    await waitFor(() => expect(fila.cargas).toEqual(['aberto', 'aberto']))

    soltar()
    await waitFor(() => expect(within(screen.getByRole('list', { name: copy.lista })).getAllByRole('article')).toHaveLength(2))
  })

  it('o que se escreve no campo vai como resolução', async () => {
    const { fila } = await abrir({ itens: tresGeneros() })
    await lista()

    const artigo = cartao('pedido_bloqueio', 'Joana Prado')
    fireEvent.change(within(artigo).getByLabelText(copy.resolver.campo), {
      target: { value: '  Conferi com o cliente e mantive o bloqueio. ' },
    })
    fireEvent.click(within(artigo).getByRole('button', { name: /^Resolver / }))

    await screen.findByText(copy.resolver.feito)
    expect(fila.resolucoes).toEqual([
      { id: 'bloqueio', texto: 'Conferi com o cliente e mantive o bloqueio.' },
    ])
  })

  it('resolver duas vezes seguidas manda um pedido só', async () => {
    const { fila } = await abrir({ itens: tresGeneros() })
    await lista()

    const botao = within(cartao('falha_repetida', 'Otávio Reis')).getByRole('button', {
      name: /^Resolver /,
    })
    fireEvent.click(botao)
    fireEvent.click(botao)

    await screen.findByText(copy.resolver.feito)
    expect(fila.resolucoes).toHaveLength(1)
  })

  it('item que outra pessoa resolveu com a tela aberta aparece como já resolvido, sem sobrescrever', async () => {
    const { fila } = await abrir({ itens: tresGeneros() })
    await lista()

    fila.resolverPorOutro('humano', 'u-9', 'Retornei pelo WhatsApp.')
    const artigo = cartao('pedido_humano', 'Marcos Ferreira')
    fireEvent.click(within(artigo).getByRole('button', { name: /^Resolver / }))

    const linha = fila.linhas.find((item) => item.id === 'humano')!
    const aviso = await screen.findByText(
      copy.codigos.jaResolvido('Selma Dias', formatarInstante(linha.resolucao!.em)),
    )
    expect(aviso.getAttribute('role')).toBe('status')
    expect(linha.resolucao).toEqual(
      expect.objectContaining({ autor: 'u-9', texto: 'Retornei pelo WhatsApp.' }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('article', { name: copy.item.rotulo('pedido_humano', 'Marcos Ferreira') }),
      ).toBeNull(),
    )
  })

  it('resolver encolhe a lista e o autor aparece nos resolvidos', async () => {
    const { fila } = await abrir({ itens: tresGeneros() })
    await lista()
    expect(artigos()).toHaveLength(3)

    const rotulo = copy.item.rotulo('pedido_humano', 'Marcos Ferreira')
    fireEvent.click(screen.getByRole('button', { name: copy.resolver.rotulo(rotulo) }))
    await screen.findByText(copy.resolver.feito)
    await waitFor(() => expect(artigos()).toHaveLength(2))

    fireEvent.change(screen.getByLabelText(copy.filtro), { target: { value: 'resolvido' } })
    const artigo = await screen.findByRole('article', { name: rotulo })
    const resolucao = fila.linhas.find((item) => item.id === 'humano')?.resolucao
    expect(resolucao?.autor).toBe('u-1')
    expect(
      within(artigo).getByText(copy.item.resolvidoPor('Renata Alves', formatarInstante(resolucao?.em))),
    ).toBeTruthy()
  })

  it('item resolvido mostra autor e hora quando consultado', async () => {
    const { fila } = await abrir({ itens: tresGeneros() })
    await lista()

    fireEvent.click(
      within(cartao('pedido_bloqueio', 'Joana Prado')).getByRole('button', { name: /^Resolver / }),
    )
    await screen.findByText(copy.resolver.feito)

    fireEvent.change(screen.getByLabelText(copy.filtro), { target: { value: 'resolvido' } })

    const artigo = await screen.findByRole('article', {
      name: copy.item.rotulo('pedido_bloqueio', 'Joana Prado'),
    })
    const resolucao = fila.linhas.find((item) => item.id === 'bloqueio')!.resolucao!
    expect(
      within(artigo).getByText(copy.item.resolvidoPor('Renata Alves', formatarInstante(resolucao.em))),
    ).toBeTruthy()
    expect(within(artigo).getByText(copy.resolver.padrao)).toBeTruthy()
    expect(within(artigo).queryByRole('button', { name: /^Resolver / })).toBeNull()
  })

  it('o áudio é pedido só no clique, e o reprodutor só aparece quando há gravação', async () => {
    const { chamadas } = await abrir({ itens: tresGeneros() })
    await lista()

    const ouvir = copyDaFicha.gravacao.ouvir
    expect(screen.getAllByRole('button', { name: ouvir })).toHaveLength(1)
    expect(within(cartao('pedido_bloqueio', 'Joana Prado')).getByText(copy.item.semGravacao)).toBeTruthy()
    expect(within(cartao('falha_repetida', 'Otávio Reis')).getByText(copy.item.expurgada)).toBeTruthy()
    expect(chamadas.pedidosDeAudio).toEqual([])

    fireEvent.click(within(cartao('pedido_humano', 'Marcos Ferreira')).getByRole('button', { name: ouvir }))

    expect(await screen.findByLabelText(copyDaFicha.gravacao.reprodutor)).toBeTruthy()
    expect(chamadas.pedidosDeAudio).toEqual(['c-humano'])
  })

  it('item novo chega pelo tempo real e aparece sem recarregar', async () => {
    const { fila } = await abrir({ itens: [] })
    expect(await screen.findByText(copy.nuncaPreenchida.titulo)).toBeTruthy()
    // Dois ouvintes: a tela e a contagem da barra lateral (D-06).
    expect(fila.ouvintes()).toBe(2)

    fila.chegar(
      itemDeExemplo({
        id: 'novo',
        tipo: 'pedido_humano',
        lead: { id: 'l-beatriz', nome: 'Beatriz Nunes', telefone: '+5531966665555' },
        contexto: lerContexto({ recorte: 'Me liga alguém de vocês, por favor.' }),
      }),
    )

    const artigo = await screen.findByRole('article', {
      name: copy.item.rotulo('pedido_humano', 'Beatriz Nunes'),
    })
    expect(within(artigo).getByText('Me liga alguém de vocês, por favor.')).toBeTruthy()
    expect(fila.cargas).toEqual(['aberto', 'aberto'])
  })

  it('sem tempo real, a tela diz que a fila é relida por intervalo', async () => {
    const { fila } = await abrir({ itens: tresGeneros() })
    await lista()
    const aviso = copy.recarga(INTERVALO_DA_RECARGA_MS / 1000)
    expect(screen.queryByText(aviso)).toBeNull()

    act(() => fila.sinalizar('indisponivel'))
    expect(await screen.findByText(aviso)).toBeTruthy()

    act(() => fila.sinalizar('ativa'))
    await waitFor(() => expect(screen.queryByText(aviso)).toBeNull())
  })

  it('a assinatura fecha quando a tela sai', async () => {
    const { fila } = await abrir({ itens: [] })
    await screen.findByText(copy.nuncaPreenchida.titulo)
    // Dois ouvintes: a tela e a contagem da barra lateral (D-06).
    expect(fila.ouvintes()).toBe(2)

    cleanup()
    expect(fila.ouvintes()).toBe(0)
  })
})
