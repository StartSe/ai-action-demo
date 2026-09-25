// O que esta tela precisa provar: os quatro estados do servidor mais o da
// espera, a audição da primeira fala da conta, o controle que refaz a amostra,
// a escolha que desatualiza a publicação e a leitura para quem não administra.
//
// jsdom não toca áudio. O que se mede é o que é verificável sem ouvido: o
// pedido de amostra saiu com a voz, a velocidade e a estabilidade que estavam
// na tela, e o elemento de áudio recebeu a fonte que o serviço devolveu. Ouvir
// de verdade é do degrau 3 e da revisão humana.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { comum } from '@/copy/comum'
import { identidadeDaSarah, vozDaSarah as copy } from '@/copy/sarah'
import type { Equipe, Papel } from '@/equipe/tipos'
import { previaDaPrimeiraFala } from '@/sarah/identidade'
import type { CatalogoDeVozes, EstadoDoCatalogoDeVozes } from '@/sarah/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeEquipeDublado,
  equipeDeExemplo,
} from '@/testes/servico-de-equipe-dublado'
import {
  catalogoDeExemplo,
  criarServicoDaSarahDublado,
  identidadeDeExemplo,
  vozDeExemplo,
  type RespostasDaSarah,
  type ServicoDaSarahDublado,
} from '@/testes/servico-da-sarah-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

const CAMINHO = '/sarah/voz'

/** A equipe tem sempre um dono além de quem olha, para haver a quem pedir. */
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

async function abrir(
  respostas: RespostasDaSarah = {},
  papel: Papel = 'admin',
): Promise<ServicoDaSarahDublado> {
  const sarah = criarServicoDaSarahDublado(respostas)

  await montarAplicacao(
    criarServicoDublado({ sessao: SESSAO }),
    CAMINHO,
    criarServicoDeEquipeDublado({
      carregar: { ok: true, equipe: comPapel(papel) },
    }),
    undefined,
    undefined,
    undefined,
    undefined,
    sarah,
  )

  return sarah
}

/** O catálogo num dos estados que não trazem voz nenhuma. */
function catalogoEm(estado: EstadoDoCatalogoDeVozes): CatalogoDeVozes {
  return {
    estado,
    vozes: [],
    vozesIgnoradas: 0,
    erro: { motivo: estado, mensagem: `frase do servidor para ${estado}` },
  }
}

function abrirComCatalogo(estado: EstadoDoCatalogoDeVozes) {
  return abrir({ voz: { ...vozDeExemplo(), catalogo: catalogoEm(estado) } })
}

function audio(): HTMLAudioElement {
  return screen.getByLabelText(copy.amostra.audio) as HTMLAudioElement
}

function controle(nome: string): HTMLInputElement {
  return screen.getByLabelText(nome) as HTMLInputElement
}

function botaoDeEscolher(): HTMLButtonElement {
  return screen.getByRole('button', { name: copy.escolher.acao }) as HTMLButtonElement
}

afterEach(cleanup)

describe('/sarah/voz: os quatro estados do servidor e a espera da tela', () => {
  it('esperando: a tela diz o que está esperando enquanto o pedido viaja', async () => {
    const sarah = await abrir({ segurar: true })

    const espera = await screen.findByRole('status')
    expect(espera.textContent).toContain(copy.carregando)
    expect(screen.queryByRole('list', { name: copy.lista.rotulo })).toBeNull()

    sarah.liberar()
    expect(await screen.findByRole('list', { name: copy.lista.rotulo })).toBeDefined()
  })

  it('conectado: um cartão por voz em português, com nome e o botão de ouvir', async () => {
    await abrir()

    const lista = await screen.findByRole('list', { name: copy.lista.rotulo })
    const cartoes = within(lista).getAllByRole('listitem')
    expect(cartoes).toHaveLength(catalogoDeExemplo().vozes.length)

    for (const voz of catalogoDeExemplo().vozes) {
      const cartao = within(lista).getByRole('listitem', { name: voz.nome })
      expect(
        within(cartao).getByRole('button', { name: copy.voz.ouvir(voz.nome) }),
      ).toBeDefined()
    }

    expect(screen.getByText(copy.lista.ignoradas(3))).toBeDefined()
    expect(screen.getByText(copy.amostra.promessa)).toBeDefined()
  })

  it('não configurado: o caminho é cadastrar a chave em Integrações', async () => {
    await abrirComCatalogo('nao_configurado')

    expect(await screen.findByText(copy.naoConfigurado.titulo)).toBeDefined()
    const caminho = screen.getByRole('link', { name: copy.naoConfigurado.acao })
    expect(caminho.getAttribute('href')).toBe('/config/integracoes')
    expect(screen.queryByRole('list', { name: copy.lista.rotulo })).toBeNull()
  })

  it('erro: a chave foi recusada, e a saída é conferir a chave, não tentar de novo', async () => {
    await abrirComCatalogo('erro')

    const caixa = await screen.findByRole('alert')
    expect(caixa.textContent).toContain(copy.erro.titulo)
    const caminho = within(caixa).getByRole('link', { name: copy.erro.acao })
    expect(caminho.getAttribute('href')).toBe('/config/integracoes')
    expect(screen.queryByRole('button', { name: copy.indisponivel.acao })).toBeNull()
    expect(caixa.textContent).not.toContain(copy.indisponivel.titulo)
  })

  it('indisponível: o provedor não respondeu, e tentar de novo pergunta outra vez', async () => {
    const sarah = await abrirComCatalogo('indisponivel')
    const carregarVoz = vi.spyOn(sarah, 'carregarVoz')

    const caixa = await screen.findByRole('alert')
    expect(caixa.textContent).toContain(copy.indisponivel.titulo)
    expect(caixa.textContent).not.toContain(copy.erro.titulo)
    expect(within(caixa).queryByRole('link')).toBeNull()

    fireEvent.click(within(caixa).getByRole('button', { name: copy.indisponivel.acao }))
    await waitFor(() => expect(carregarVoz).toHaveBeenCalledTimes(1))
  })

  it('os quatro estados do servidor têm frases distintas: erro não é indisponível', () => {
    const titulos = [
      copy.lista.titulo,
      copy.naoConfigurado.titulo,
      copy.erro.titulo,
      copy.indisponivel.titulo,
    ]
    expect(new Set(titulos).size).toBe(4)
    expect(copy.erro.acao).not.toBe(copy.indisponivel.acao)
  })

  it('sem identidade: não há abertura a ouvir, e o caminho é escrevê-la', async () => {
    await abrir({ voz: { ...vozDeExemplo(), temIdentidade: false } })

    expect(await screen.findByText(copy.semIdentidade.titulo)).toBeDefined()
    const caminho = screen.getByRole('link', { name: copy.semIdentidade.acao })
    expect(caminho.getAttribute('href')).toBe('/sarah/identidade')
  })

  it('falha da carga: a frase diz o motivo', async () => {
    await abrir({ carregarVoz: { ok: false, motivo: 'sem-conta' } })

    const caixa = await screen.findByRole('alert')
    expect(caixa.textContent).toBe(copy.falhas['sem-conta'])
  })
})

describe('/sarah/voz: a audição é a primeira fala da conta', () => {
  it('ouvir pede a amostra com a voz e os ajustes padrão dela, e o áudio recebe a fonte', async () => {
    const sarah = await abrir()

    fireEvent.click(await screen.findByRole('button', { name: copy.voz.ouvir('Clara') }))

    await waitFor(() => expect(sarah.audicoes).toHaveLength(1))
    expect(sarah.audicoes[0]).toEqual({
      vozId: 'voz-clara',
      ajustes: { estabilidade: 0.5, similaridade: 0.75, velocidade: 1 },
    })

    const esperado = await sarah.ouvirAmostra(sarah.audicoes[0]!)
    if (!esperado.ok || !esperado.amostra) throw new Error('amostra esperada')
    await waitFor(() =>
      expect(audio().getAttribute('src')).toBe(
        `data:${esperado.amostra!.formato};base64,${esperado.amostra!.audioBase64}`,
      ),
    )

    // O texto à vista é a abertura escrita na identidade, interpolada.
    expect(screen.getByText(previaDaPrimeiraFala(identidadeDeExemplo()))).toBeDefined()
  })

  it('cada voz abre os controles no padrão dela, não num padrão da tela', async () => {
    await abrir()

    fireEvent.click(await screen.findByRole('button', { name: copy.voz.ouvir('Bento') }))
    expect(controle('estabilidade').value).toBe('0.8')
    expect(controle('velocidade').min).toBe('0.7')
    expect(controle('velocidade').max).toBe('1.2')
  })

  it('mexer na velocidade e na estabilidade refaz a amostra com o valor novo', async () => {
    const sarah = await abrir()

    fireEvent.click(await screen.findByRole('button', { name: copy.voz.ouvir('Clara') }))
    await waitFor(() => expect(sarah.audicoes).toHaveLength(1))
    await waitFor(() => expect(audio()).toBeDefined())
    const fonteAntes = audio().getAttribute('src')

    fireEvent.change(controle('velocidade'), { target: { value: '1.1' } })
    fireEvent.change(controle('estabilidade'), { target: { value: '0.3' } })

    // As duas mexidas seguidas viram um pedido só: cada pedido é uma síntese.
    await waitFor(() => expect(sarah.audicoes).toHaveLength(2))
    expect(sarah.audicoes[1]).toEqual({
      vozId: 'voz-clara',
      ajustes: { estabilidade: 0.3, similaridade: 0.75, velocidade: 1.1 },
    })
    await waitFor(() => expect(audio().getAttribute('src')).not.toBe(fonteAntes))
  })

  it('pendência da amostra: o catálogo veio e a síntese não, e a tela diz por quê', async () => {
    await abrir({
      amostra: {
        ok: true,
        amostra: null,
        pendencia: { motivo: 'sem_primeira_fala', mensagem: 'Escreva a abertura antes.' },
      },
    })

    fireEvent.click(await screen.findByRole('button', { name: copy.voz.ouvir('Clara') }))
    expect(await screen.findByText('Escreva a abertura antes.')).toBeDefined()
    expect(screen.queryByLabelText(copy.amostra.audio)).toBeNull()
  })
})

describe('/sarah/voz: escolher grava e desatualiza a publicação', () => {
  it('usar esta voz grava voice_id e os ajustes, e convida a publicar', async () => {
    const sarah = await abrir()

    const ouvirBento = await screen.findByRole('button', { name: copy.voz.ouvir('Bento') })
    expect(botaoDeEscolher().disabled).toBe(true)
    fireEvent.click(ouvirBento)
    fireEvent.change(controle('velocidade'), { target: { value: '0.9' } })

    fireEvent.click(botaoDeEscolher())

    await waitFor(() => expect(sarah.escolhas).toHaveLength(1))
    expect(sarah.escolhas[0]).toEqual({
      vozId: 'voz-bento',
      ajustes: { estabilidade: 0.8, similaridade: 0.75, velocidade: 0.9 },
    })

    expect(await screen.findByText(copy.escolher.salvo)).toBeDefined()
    expect(
      screen.getByText(identidadeDaSarah.publicacao.alteracoes_pendentes),
    ).toBeDefined()
    const publicar = screen.getByRole('link', { name: identidadeDaSarah.publicacao.publicar })
    expect(publicar.getAttribute('href')).toBe('/sarah/playbooks')

    const cartao = screen.getByRole('listitem', { name: 'Bento' })
    expect(within(cartao).getByText(copy.lista.escolhida)).toBeDefined()
    expect(botaoDeEscolher().disabled).toBe(true)
  })

  it('a voz gravada abre selecionada, com os ajustes gravados', async () => {
    await abrir({
      voz: { ...vozDeExemplo(), vozEscolhida: 'voz-clara', ajustes: { velocidade: 1.15 } },
    })

    const cartao = await screen.findByRole('listitem', { name: 'Clara' })
    expect(within(cartao).getByText(copy.lista.escolhida)).toBeDefined()
    expect(controle('velocidade').value).toBe('1.15')
    expect(botaoDeEscolher().disabled).toBe(true)
  })

  it('recusa da gravação: a frase diz o motivo e nada muda de estado', async () => {
    await abrir({ salvarVoz: { ok: false, motivo: 'sem-permissao' } })

    fireEvent.click(await screen.findByRole('button', { name: copy.voz.ouvir('Clara') }))
    fireEvent.click(botaoDeEscolher())

    expect(await screen.findByText(copy.falhas['sem-permissao'])).toBeDefined()
    expect(screen.queryByText(copy.escolher.salvo)).toBeNull()
  })
})

describe('/sarah/voz: papel', () => {
  it('operator ouve, mas não escolhe, e a negativa diz a quem pedir', async () => {
    const sarah = await abrir({}, 'operator')

    const lista = await screen.findByRole('list', {
      name: comum.negativaPorPapel.pedirAcesso,
    })
    expect(within(lista).getByText('selma@aurora.com.br')).toBeDefined()
    expect(screen.getByText(copy.leitura.aviso)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: copy.voz.ouvir('Clara') }))
    await waitFor(() => expect(sarah.audicoes).toHaveLength(1))
    expect(botaoDeEscolher().disabled).toBe(true)
  })

  it('admin escolhe, sem negativa', async () => {
    await abrir({}, 'admin')

    await screen.findByRole('list', { name: copy.lista.rotulo })
    expect(screen.queryByText(copy.leitura.aviso)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: copy.voz.ouvir('Clara') }))
    expect(botaoDeEscolher().disabled).toBe(false)
  })
})
