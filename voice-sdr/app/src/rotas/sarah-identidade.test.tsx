// O que esta tela precisa provar: os quatro estados da seção 13, a recusa da
// variável que ninguém sabe preencher, o aviso de que salvar não põe no ar, e a
// leitura para quem não administra a conta.
//
// A recusa da variável é a asserção que justifica o arquivo. Um `{cargo}`
// escrito na abertura some da frase na síntese, e quem escreveu descobriria o
// buraco ouvindo uma ligação. O teste cobra as duas metades: a mensagem diz
// qual variável é, e nada chega ao serviço.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { LEAD_DE_EXEMPLO } from '@compartilhado/agente/primeira-fala.ts'

import { comum } from '@/copy/comum'
import { equipe as copyDaEquipe } from '@/copy/equipe'
import {
  identidadeDaSarah as copy,
  VARIAVEIS_DISPONIVEIS,
} from '@/copy/sarah'
import type { Equipe, Papel } from '@/equipe/tipos'
import type { EstadoDaSarah } from '@/sarah/tipos'
import { montarAplicacao } from '@/testes/montar-aplicacao'
import {
  criarServicoDeEquipeDublado,
  equipeDeExemplo,
} from '@/testes/servico-de-equipe-dublado'
import {
  criarServicoDaSarahDublado,
  identidadeDeExemplo,
  sarahDeExemplo,
  type RespostasDaSarah,
  type ServicoDaSarahDublado,
} from '@/testes/servico-da-sarah-dublado'
import { criarServicoDublado } from '@/testes/servico-dublado'

const SESSAO = { usuarioId: 'u-1', email: 'renata@aurora.com.br' }

const CAMINHO = '/sarah/identidade'

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

function campo(rotulo: string): HTMLElement {
  return screen.getByLabelText(rotulo)
}

function escrever(rotulo: string, texto: string) {
  fireEvent.change(campo(rotulo), { target: { value: texto } })
}

function botaoDeGravar(): HTMLElement {
  return screen.getByRole('button', { name: copy.gravar })
}

afterEach(cleanup)

describe('/sarah/identidade: os quatro estados da tela', () => {
  it('carregando: a tela diz o que está esperando', async () => {
    const sarah = await abrir({ segurar: true })

    const espera = await screen.findByRole('status')
    expect(espera.textContent).toContain(copy.carregando)
    expect(screen.queryByLabelText(copy.campos.nome)).toBeNull()

    sarah.liberar()
    expect(await screen.findByLabelText(copy.campos.nome)).toBeDefined()
  })

  it('vazia: a conta nova recebe o caminho para escrever e para o assistente', async () => {
    await abrir({ sarah: { identidade: null, publicacao: 'rascunho' } })

    expect(await screen.findByText(copy.vazio.titulo)).toBeDefined()
    expect(screen.queryByLabelText(copy.campos.nome)).toBeNull()

    const assistente = screen.getByRole('link', { name: copy.vazio.irParaAssistente })
    expect(assistente.getAttribute('href')).toBe('/configuracao-inicial')

    fireEvent.click(screen.getByRole('button', { name: copy.vazio.montar }))
    expect(await screen.findByLabelText(copy.campos.nome)).toBeDefined()
  })

  it('preenchida: os cinco campos de RF-301 chegam com o que está gravado', async () => {
    const identidade = identidadeDeExemplo()
    await abrir()

    await screen.findByLabelText(copy.campos.nome)
    expect(campo(copy.campos.nome)).toHaveProperty('value', identidade.nome)
    expect(campo(copy.campos.empresa)).toHaveProperty('value', identidade.empresa)
    expect(campo(copy.campos.oferta)).toHaveProperty('value', identidade.oferta)
    expect(campo(copy.campos.destino)).toHaveProperty(
      'value',
      identidade.destinoDeTransferencia,
    )
    expect(campo(copy.campos.primeiraFala)).toHaveProperty(
      'value',
      identidade.primeiraFala,
    )

    const limites = within(screen.getByRole('list', { name: copy.nuncaAfirmar.lista }))
    expect(limites.getByText('garantia de resultado')).toBeDefined()
  })

  it('com erro: a falha do servidor aparece no lugar do formulário', async () => {
    await abrir({ carregar: { ok: false, motivo: 'falha-de-comunicacao' } })

    const aviso = await screen.findByRole('alert')
    expect(aviso.textContent).toBe(copy.falhas['falha-de-comunicacao'])
    expect(screen.queryByLabelText(copy.campos.nome)).toBeNull()
  })
})

describe('a primeira fala e as variáveis', () => {
  it('a prévia mostra a abertura com o lead da semente', async () => {
    await abrir()
    await screen.findByLabelText(copy.campos.primeiraFala)

    escrever(
      copy.campos.primeiraFala,
      'Oi, {nome_do_lead}, da {empresa_do_lead}? Aqui é a {nome_do_agente}, da {empresa}.',
    )

    expect(
      await screen.findByText(
        `Oi, ${LEAD_DE_EXEMPLO.nome_do_lead}, da ${LEAD_DE_EXEMPLO.empresa_do_lead}? Aqui é a Sarah, da Vexo Tecnologia.`,
      ),
    ).toBeDefined()
  })

  it('a lista de variáveis fica ao lado do campo, e toda variável é explicada', async () => {
    await abrir()
    await screen.findByLabelText(copy.campos.primeiraFala)

    const lista = within(screen.getByRole('list', { name: copy.variaveis.titulo }))
    for (const variavel of VARIAVEIS_DISPONIVEIS) {
      expect(lista.getByText(variavel.marcador)).toBeDefined()
      // Marcador novo do compilador aparece aqui sozinho; sem explicação
      // escrita ele apareceria mudo, e quem lê não saberia o que ele vale.
      expect(variavel.explicacao).not.toBe('')
    }
  })

  it('variável desconhecida é recusada na gravação, dizendo qual é e quais existem', async () => {
    const sarah = await abrir()
    await screen.findByLabelText(copy.campos.primeiraFala)

    escrever(
      copy.campos.primeiraFala,
      'Oi, {nome_do_lead}, tudo bem no {cargo}? Aqui é a {nome_do_agente}.',
    )
    fireEvent.click(botaoDeGravar())

    const recusa = await screen.findByText(copy.recusa.variavelDesconhecida(['cargo']))
    expect(recusa.textContent).toContain('{cargo}')
    expect(recusa.textContent).toContain('{nome_do_lead}')
    // A recusa é da tela, e nada chegou ao banco: o banco aceitaria o texto, e
    // quem descobriria o marcador órfão seria o lead, na ligação.
    expect(sarah.gravacoes).toEqual([])
  })

  it('corrigida a variável, a gravação segue', async () => {
    const sarah = await abrir()
    await screen.findByLabelText(copy.campos.primeiraFala)

    escrever(copy.campos.primeiraFala, 'Oi, {cargo}!')
    fireEvent.click(botaoDeGravar())
    await screen.findByText(copy.recusa.variavelDesconhecida(['cargo']))

    escrever(copy.campos.primeiraFala, 'Oi, {nome_do_lead}!')
    fireEvent.click(botaoDeGravar())

    await waitFor(() => expect(sarah.gravacoes).toHaveLength(1))
    expect(sarah.gravacoes[0]?.primeiraFala).toBe('Oi, {nome_do_lead}!')
  })
})

describe('por canal: o que muda entre a ligação e o WhatsApp', () => {
  it('a seção explica que a assistente é uma só e que vai ao ar na publicação', async () => {
    await abrir()
    expect(await screen.findByText(copy.secoes.porCanal)).toBeDefined()
    expect(screen.getByText(copy.porCanal.explicacao)).toBeDefined()
    expect(copy.porCanal.explicacao).toMatch(/publica/)
    // Em branco, a prévia mostra a abertura padrão com o lead de exemplo.
    expect(
      screen.getByText(
        `Oi, ${LEAD_DE_EXEMPLO.nome_do_lead}! Aqui é Sarah, da Vexo Tecnologia. Tudo bem? Posso te fazer umas perguntas rápidas por aqui?`,
      ),
    ).toBeDefined()
  })

  it('a abertura e os dois jeitos vão para a gravação', async () => {
    const sarah = await abrir()
    await screen.findByLabelText(copy.porCanal.aberturaDoWhatsapp)

    escrever(copy.porCanal.aberturaDoWhatsapp, 'Oi, {nome_do_lead}! Aqui é {nome_do_agente}.')
    expect(await screen.findByText(`Oi, ${LEAD_DE_EXEMPLO.nome_do_lead}! Aqui é Sarah.`)).toBeDefined()
    escrever(copy.porCanal.jeitoNaVoz, 'Fale devagar.')
    escrever(copy.porCanal.jeitoNoWhatsapp, 'Sem emoji.')
    fireEvent.click(botaoDeGravar())

    await waitFor(() => expect(sarah.gravacoes).toHaveLength(1))
    expect(sarah.gravacoes[0]).toMatchObject({
      aberturaDoWhatsapp: 'Oi, {nome_do_lead}! Aqui é {nome_do_agente}.',
      jeitoNaVoz: 'Fale devagar.',
      jeitoNoWhatsapp: 'Sem emoji.',
    })
    // Salvar não põe no ar, nos dois canais.
    expect(await screen.findByText(copy.publicacao.alteracoes_pendentes)).toBeDefined()
  })

  it('variável desconhecida na abertura do WhatsApp é recusada como na da ligação', async () => {
    const sarah = await abrir()
    await screen.findByLabelText(copy.porCanal.aberturaDoWhatsapp)

    escrever(copy.porCanal.aberturaDoWhatsapp, 'Oi, {apelido}!')
    fireEvent.click(botaoDeGravar())

    expect(await screen.findByText(copy.recusa.variavelDesconhecida(['apelido']))).toBeDefined()
    expect(sarah.gravacoes).toEqual([])
  })
})

describe('o que ela nunca afirma', () => {
  it('acrescentar e remover mudam a lista que vai para a gravação', async () => {
    const sarah = await abrir()
    await screen.findByLabelText(copy.campos.nome)

    escrever(copy.nuncaAfirmar.campo, 'prazo de entrega')
    fireEvent.click(screen.getByRole('button', { name: copy.nuncaAfirmar.acrescentar }))

    const lista = () =>
      within(screen.getByRole('list', { name: copy.nuncaAfirmar.lista }))
    expect(await screen.findByText('prazo de entrega')).toBeDefined()

    fireEvent.click(
      lista().getByRole('button', {
        name: copy.nuncaAfirmar.remover('garantia de resultado'),
      }),
    )
    fireEvent.click(botaoDeGravar())

    await waitFor(() => expect(sarah.gravacoes).toHaveLength(1))
    expect(sarah.gravacoes[0]?.nuncaAfirmar).toEqual([
      'preço fechado',
      'prazo de entrega',
    ])
  })
})

describe('salvar não põe no ar', () => {
  it('a Sarah publicada passa a alterações pendentes depois da gravação', async () => {
    await abrir()
    await screen.findByLabelText(copy.campos.nome)
    expect(screen.getByText(copy.publicacao.publicado)).toBeDefined()

    escrever(copy.campos.nome, 'Sofia')
    fireEvent.click(botaoDeGravar())

    expect(await screen.findByText(copy.publicacao.alteracoes_pendentes)).toBeDefined()
    expect(screen.queryByText(copy.publicacao.publicado)).toBeNull()
    expect(
      screen.getByRole('link', { name: copy.publicacao.publicar }),
    ).toBeDefined()
  })

  it('a recusa do servidor aparece e o estado da publicação não muda', async () => {
    await abrir({ salvar: { ok: false, motivo: 'sem-permissao' } })
    await screen.findByLabelText(copy.campos.nome)

    escrever(copy.campos.nome, 'Sofia')
    fireEvent.click(botaoDeGravar())

    const aviso = await screen.findByRole('alert')
    expect(aviso.textContent).toBe(copy.falhas['sem-permissao'])
    expect(screen.getByText(copy.publicacao.publicado)).toBeDefined()
  })
})

describe('papel de quem olha', () => {
  it.each<Papel>(['owner', 'admin'])(
    'quem administra a conta (%s) edita sem negativa',
    async (papel) => {
      await abrir({}, papel)

      await screen.findByLabelText(copy.campos.nome)
      expect(campo(copy.campos.nome)).toHaveProperty('disabled', false)
      expect(screen.queryByText(copy.leitura.aviso)).toBeNull()
    },
  )

  it.each<Papel>(['operator', 'viewer'])(
    'quem não administra (%s) vê em leitura, com os campos desabilitados',
    async (papel) => {
      await abrir({}, papel)

      await screen.findByLabelText(copy.campos.nome)
      expect(campo(copy.campos.nome)).toHaveProperty('disabled', true)
      expect(campo(copy.campos.primeiraFala)).toHaveProperty('disabled', true)
      expect(botaoDeGravar()).toHaveProperty('disabled', true)

      const negativa = await screen.findByRole('alert')
      expect(within(negativa).getByText(copy.leitura.aviso)).toBeDefined()
    },
  )

  it('a negativa diz a quem pedir, e só a quem de fato concede', async () => {
    await abrir({}, 'operator')
    await screen.findByRole('alert')

    const lista = within(
      screen.getByRole('list', { name: comum.negativaPorPapel.pedirAcesso }),
    )
    expect(lista.getByText('selma@aurora.com.br')).toBeDefined()
    expect(lista.queryByText('renata@aurora.com.br')).toBeNull()
  })

  it('falha ao carregar o papel não libera a escrita', async () => {
    const sarah = criarServicoDaSarahDublado()
    await montarAplicacao(
      criarServicoDublado({ sessao: SESSAO }),
      CAMINHO,
      criarServicoDeEquipeDublado({
        carregar: { ok: false, motivo: 'falha-de-comunicacao' },
      }),
      undefined,
      undefined,
      undefined,
      undefined,
      sarah,
    )

    await screen.findByLabelText(copy.campos.nome)
    expect(campo(copy.campos.nome)).toHaveProperty('disabled', true)
    const avisos = screen.getAllByRole('alert').map((item) => item.textContent)
    expect(avisos).toContain(copyDaEquipe.falhas['falha-de-comunicacao'])
  })

  it('sem sessão, a rota desvia para a entrada', async () => {
    const { roteador } = await montarAplicacao(
      criarServicoDublado({ sessao: null }),
      CAMINHO,
    )

    expect(roteador.state.location.pathname).toBe('/entrar')
  })
})

describe('a semente do dublê', () => {
  it('a Sarah de exemplo nasce publicada, para o aviso ter o que mudar', () => {
    const exemplo: EstadoDaSarah = sarahDeExemplo()

    expect(exemplo.publicacao).toBe('publicado')
    expect(exemplo.identidade?.nome).toBe('Sarah')
  })
})
